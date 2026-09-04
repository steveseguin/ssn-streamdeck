import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import VDONinja from "@vdoninja/sdk/node";
import { WebSocketServer } from "ws";

const pluginRoot = resolve(import.meta.dirname, "..");
const builtPluginRoot = join(pluginRoot, "ninja.socialstream.streamdeck.sdPlugin");
const sessionId = `sd-runtime-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const pluginUuid = "p2p-runtime-plugin";
const deviceId = "p2p-runtime-device";
const commandContext = "p2p-runtime-command";
const chatContext = "p2p-runtime-chat";
const cleanup = [];

if (!existsSync(join(builtPluginRoot, "bin", "plugin.js"))) {
	throw new Error("Compiled plugin missing. Run `npm run build` before this live test.");
}

try {
	const publisher = await createPublisher();
	cleanup.push(() => publisher.disconnect());
	const streamDeck = await createStreamDeckServer();
	cleanup.push(() => streamDeck.close());
	const isolatedRoot = await mkdtemp(join(tmpdir(), "ssn-streamdeck-p2p-live-"));
	cleanup.push(() => rm(isolatedRoot, { recursive: true, force: true }));
	const isolatedPlugin = join(isolatedRoot, "ninja.socialstream.streamdeck.sdPlugin");
	await cp(builtPluginRoot, isolatedPlugin, { recursive: true });

	const child = spawn(
		process.execPath,
		[
			join(isolatedPlugin, "bin", "plugin.js"),
			"-port",
			String(streamDeck.port),
			"-pluginUUID",
			pluginUuid,
			"-registerEvent",
			"registerPlugin",
			"-info",
			JSON.stringify({
				application: { font: "Segoe UI", language: "en", platform: "windows", platformVersion: "10.0.0", version: "7.5.0" },
				colors: {},
				devicePixelRatio: 2,
				devices: [{ id: deviceId, name: "P2P Runtime Deck", size: { columns: 5, rows: 3 }, type: 0 }],
				plugin: { uuid: "ninja.socialstream.streamdeck", version: "0.2.2.0" }
			})
		],
		{ cwd: isolatedPlugin, env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
	);
	cleanup.push(() => {
		if (!child.killed) child.kill();
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", chunk => (stdout += chunk));
	child.stderr.on("data", chunk => (stderr += chunk));

	await streamDeck.waitFor(message => message.event === "registerPlugin", "built plugin registration");
	await streamDeck.waitFor(message => message.event === "getGlobalSettings", "global settings request");
	await publisher.waitFor(request => request.action === "getCapabilities", "P2P capability request", 30000);

	streamDeck.send(willAppear("ninja.socialstream.streamdeck.command", commandContext, "Keypad", { command: "nextInQueue" }));
	const firstCommandStart = publisher.requests.length;
	streamDeck.send(keyDown(commandContext));
	await publisher.waitFor(request => request.action === "nextInQueue", "first P2P command", 10000, firstCommandStart);
	await streamDeck.waitFor(message => message.event === "showOk" && message.context === commandContext, "first command success");

	streamDeck.send(willAppear("ninja.socialstream.streamdeck.chat-feed", chatContext, "Encoder", {}));
	await publisher.sendChat({ id: "p2p-chat-1", chatname: "P2P Tester", chatmessage: "Packaged plugin received this", type: "youtube" });
	await streamDeck.waitFor(
		message => message.event === "setFeedback" && message.context === chatContext && message.payload?.name === "P2P Tester",
		"P2P chat feedback"
	);

	const recoveryStart = publisher.requests.length;
	publisher.terminateSignaling();
	await publisher.waitForReconnect(30000);
	await publisher.waitFor(
		request => request.action === "getCapabilities",
		"capability request after publisher signaling loss",
		45000,
		recoveryStart
	);
	const secondCommandStart = publisher.requests.length;
	const okStart = streamDeck.messages.length;
	streamDeck.send(keyDown(commandContext));
	await publisher.waitFor(request => request.action === "nextInQueue", "command after signaling recovery", 15000, secondCommandStart);
	await streamDeck.waitFor(
		message => message.event === "showOk" && message.context === commandContext,
		"command success after signaling recovery",
		15000,
		okStart
	);

	if (child.exitCode !== null) {
		throw new Error(`Built plugin exited early with code ${child.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
	}
	console.log("packaged Stream Deck P2P runtime passed (commands, chat, signaling recovery)");
} finally {
	for (const close of cleanup.reverse()) {
		try {
			await close();
		} catch (_) {}
	}
}

async function createPublisher() {
	const sdk = new VDONinja({
		host: "wss://wss.socialstream.ninja",
		room: sessionId,
		password: false,
		salt: "vdo.ninja",
		label: "socialstream",
		autoRecover: true
	});
	const requests = [];
	let pluginPeer = "";
	let reconnectResolve = null;
	sdk.addEventListener("reconnected", () => {
		if (reconnectResolve) reconnectResolve();
	});
	sdk.addEventListener("dataReceived", event => {
		const detail = event.detail || {};
		const request = detail.data?.overlayNinja || detail.data;
		if (!request || typeof request !== "object") return;
		pluginPeer = typeof detail.uuid === "string" ? detail.uuid : pluginPeer;
		requests.push(request);
		if (typeof request.get !== "string" || !pluginPeer) return;
		const result =
			request.action === "getCapabilities"
				? {
						type: "capabilities",
						version: 2,
						runtime: "web",
						ssapp: { available: false },
						ssn: {
							actions: { nextInQueue: true, pin: true },
							actionDescriptors: {
								nextInQueue: { owner: "dock", callback: "guaranteed" },
								pin: { owner: "dock", callback: "guaranteed" }
							}
						}
					}
				: { ok: true, status: "completed", action: request.action };
		sdk.sendData({ overlayNinja: { callback: { get: request.get, result } } }, pluginPeer);
	});
	await sdk.connect();
	await sdk.joinRoom({ room: sessionId, password: false });
	await sdk.announce({ streamID: sessionId, label: "socialstream" });
	return {
		requests,
		disconnect: () => sdk.disconnect(),
		terminateSignaling: () => {
			const signaling = sdk.signaling;
			if (typeof signaling?.terminate === "function") signaling.terminate();
			else signaling?.close();
		},
		waitForReconnect: timeoutMs =>
			new Promise((resolve, reject) => {
				reconnectResolve = resolve;
				setTimeout(() => reject(new Error("Timed out waiting for publisher signaling recovery")), timeoutMs).unref();
			}),
		sendChat: async chat => {
			await waitFor(() => pluginPeer || null, "plugin P2P peer for chat", 10000);
			if (!sdk.sendData({ overlayNinja: chat }, pluginPeer)) throw new Error("Unable to send P2P chat to built plugin");
		},
		waitFor: (predicate, label, timeoutMs = 10000, startAt = 0) => waitFor(() => requests.slice(startAt).find(predicate), label, timeoutMs)
	};
}

async function createStreamDeckServer() {
	const messages = [];
	let socket = null;
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise((resolve, reject) => {
		server.once("listening", resolve);
		server.once("error", reject);
	});
	server.on("connection", client => {
		socket = client;
		client.on("message", raw => {
			const message = JSON.parse(raw.toString());
			messages.push(message);
			if (message.event === "getGlobalSettings") {
				client.send(
					JSON.stringify({
						event: "didReceiveGlobalSettings",
						context: message.context,
						payload: { settings: { sessionId, password: "", transport: "p2p", requestTimeoutMs: 30000 } }
					})
				);
			}
		});
	});
	return {
		port: server.address().port,
		messages,
		send: message => {
			if (!socket || socket.readyState !== 1) throw new Error("Stream Deck plugin socket is not open");
			socket.send(JSON.stringify(message));
		},
		waitFor: (predicate, label, timeoutMs = 10000, startAt = 0) => waitFor(() => messages.slice(startAt).find(predicate), label, timeoutMs),
		close: () =>
			new Promise(resolve => {
				if (socket) socket.terminate();
				server.close(resolve);
			})
	};
}

function willAppear(action, context, controller, settings) {
	return {
		event: "willAppear",
		action,
		context,
		device: deviceId,
		payload: { controller, coordinates: { column: 0, row: 0 }, isInMultiAction: false, resources: {}, settings, state: 0 }
	};
}

function keyDown(context) {
	return {
		event: "keyDown",
		action: "ninja.socialstream.streamdeck.command",
		context,
		device: deviceId,
		payload: {
			controller: "Keypad",
			coordinates: { column: 0, row: 0 },
			isInMultiAction: false,
			resources: {},
			settings: { command: "nextInQueue" },
			state: 0
		}
	};
}

async function waitFor(find, label, timeoutMs) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const result = find();
		if (result) return result;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`Timed out waiting for ${label}`);
}
