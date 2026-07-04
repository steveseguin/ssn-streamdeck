import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..");
const sdPluginRoot = join(pluginRoot, "ninja.socialstream.streamdeck.sdPlugin");
const pluginEntry = join(sdPluginRoot, "bin", "plugin.js");
const pluginUuid = "runtime-plugin";
const deviceId = "runtime-device";
const commandContext = "runtime-command-context";
const sessionId = "runtime-session";

if (!existsSync(pluginEntry)) {
	throw new Error("Compiled plugin missing. Run `npm run build` before `npm run test:runtime`.");
}

const bundledTestFiles = await findBundledTestFiles(join(sdPluginRoot, "bin"));
if (bundledTestFiles.length) {
	throw new Error(`Compiled test files should not be included in the Stream Deck bundle: ${bundledTestFiles.join(", ")}`);
}

const cleanup = [];

try {
	const social = await createSocialStreamServer();
	cleanup.push(() => social.close());

	const streamDeck = await createStreamDeckServer({
		globalSettings: {
			sessionId,
			apiHost: `127.0.0.1:${social.port}`,
			useTls: false,
			httpFallback: false,
			inChannel: 2,
			outChannel: 1,
			requestTimeoutMs: 1000
		}
	});
	cleanup.push(() => streamDeck.close());

	const child = spawn(
		process.execPath,
		[
			pluginEntry,
			"-port",
			String(streamDeck.port),
			"-pluginUUID",
			pluginUuid,
			"-registerEvent",
			"registerPlugin",
			"-info",
			JSON.stringify({
				application: {
					font: "Segoe UI",
					language: "en",
					platform: "windows",
					platformVersion: "10.0.0",
					version: "7.5.0"
				},
				colors: {},
				devicePixelRatio: 2,
				devices: [
					{
						id: deviceId,
						name: "Runtime Test Deck",
						size: { columns: 5, rows: 3 },
						type: 0
					}
				],
				plugin: {
					uuid: "ninja.socialstream.streamdeck",
					version: "0.1.0.0"
				}
			})
		],
		{
			cwd: sdPluginRoot,
			env: {
				...process.env,
				NODE_PATH: join(pluginRoot, "node_modules")
			},
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true
		}
	);
	cleanup.push(() => {
		if (!child.killed) child.kill();
	});

	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", chunk => {
		stdout += chunk;
	});
	child.stderr.on("data", chunk => {
		stderr += chunk;
	});

	await streamDeck.waitForMessage(message => message.event === "registerPlugin" && message.uuid === pluginUuid, "plugin registration");
	await streamDeck.waitForMessage(message => message.event === "getGlobalSettings", "global settings request");
	await social.waitForMessage(message => message.join === sessionId, "Social Stream join");
	await social.waitForMessage(message => message.action === "getCapabilities", "capability request");

	streamDeck.send({
		event: "willAppear",
		action: "ninja.socialstream.streamdeck.command",
		context: commandContext,
		device: deviceId,
		payload: {
			controller: "Keypad",
			coordinates: { column: 0, row: 0 },
			isInMultiAction: false,
			resources: {},
			settings: { command: "removefromwaitlist" },
			state: 0
		}
	});

	await streamDeck.waitForMessage(
		message => message.event === "setTitle" && message.context === commandContext && message.payload?.title === "Remove\nWaitlist Entry",
		"command title render"
	);

	streamDeck.send({
		event: "propertyInspectorDidAppear",
		action: "ninja.socialstream.streamdeck.command",
		context: commandContext,
		device: deviceId
	});
	streamDeck.send({
		event: "sendToPlugin",
		action: "ninja.socialstream.streamdeck.command",
		context: commandContext,
		payload: { type: "requestStatus" }
	});

	await streamDeck.waitForMessage(
		message => message.event === "sendToPropertyInspector" && message.context === commandContext && message.payload?.type === "status",
		"property inspector status response"
	);

	streamDeck.send({
		event: "keyDown",
		action: "ninja.socialstream.streamdeck.command",
		context: commandContext,
		device: deviceId,
		payload: {
			controller: "Keypad",
			coordinates: { column: 0, row: 0 },
			isInMultiAction: false,
			resources: {},
			settings: { command: "removefromwaitlist" },
			state: 0
		}
	});

	const command = await social.waitForMessage(message => message.action === "removefromwaitlist", "preset command");
	if (command.apiid !== sessionId || command.value !== "1") {
		throw new Error(`Unexpected preset command payload: ${JSON.stringify(command)}`);
	}
	await streamDeck.waitForMessage(message => message.event === "showOk" && message.context === commandContext, "success feedback");

	if (child.exitCode !== null) {
		throw new Error(`Plugin exited early with code ${child.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
	}

	console.log("streamdeck plugin runtime smoke passed");
} finally {
	for (const close of cleanup.reverse()) {
		try {
			await close();
		} catch (_) {
			// best-effort cleanup
		}
	}
}

async function createStreamDeckServer({ globalSettings }) {
	const messages = [];
	let socket = null;
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(server, "listening");

	server.on("connection", client => {
		socket = client;
		client.on("message", raw => {
			const message = JSON.parse(raw.toString());
			messages.push(message);
			if (message.event === "getGlobalSettings") {
				send({
					event: "didReceiveGlobalSettings",
					context: message.context,
					id: message.id,
					payload: { settings: globalSettings }
				});
			}
			if (message.event === "getSettings") {
				send({
					event: "didReceiveSettings",
					action: "ninja.socialstream.streamdeck.command",
					context: message.context,
					id: message.id,
					device: deviceId,
					payload: {
						controller: "Keypad",
						coordinates: { column: 0, row: 0 },
						isInMultiAction: false,
						resources: {},
						settings: {},
						state: 0
					}
				});
			}
		});
	});

	const port = server.address().port;

	function send(message) {
		if (!socket || socket.readyState !== 1) {
			throw new Error("Stream Deck plugin socket is not open");
		}
		socket.send(JSON.stringify(message));
	}

	return {
		port,
		messages,
		send,
		waitForMessage: (predicate, label) => waitFor(() => messages.find(predicate), label),
		close: () =>
			new Promise(resolve => {
				if (socket) socket.terminate();
				server.close(resolve);
			})
	};
}

async function createSocialStreamServer() {
	const messages = [];
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(server, "listening");
	server.on("connection", socket => {
		socket.on("message", raw => {
			const message = JSON.parse(raw.toString());
			messages.push(message);
			if (message.action === "getCapabilities" && typeof message.get === "string") {
				socket.send(
					JSON.stringify({
						callback: {
							get: message.get,
							result: {
								type: "capabilities",
								version: 1,
								runtime: "web",
								ssapp: { available: false },
								ssn: { actions: { removefromwaitlist: true } }
							}
						}
					})
				);
			}
		});
	});

	const port = server.address().port;
	return {
		port,
		messages,
		waitForMessage: (predicate, label) => waitFor(() => messages.find(predicate), label),
		close: () =>
			new Promise(resolve => {
				for (const client of server.clients) client.terminate();
				server.close(resolve);
			})
	};
}

function once(emitter, event) {
	return new Promise((resolve, reject) => {
		emitter.once(event, resolve);
		emitter.once("error", reject);
	});
}

async function waitFor(find, label, timeoutMs = 5000) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const result = find();
		if (result) return result;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`Timed out waiting for ${label}`);
}

async function findBundledTestFiles(dir) {
	if (!existsSync(dir)) return [];
	const matches = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			matches.push(...(await findBundledTestFiles(fullPath)));
		} else if (/\.test\.js(?:\.map)?$/.test(entry.name)) {
			matches.push(fullPath);
		}
	}
	return matches;
}
