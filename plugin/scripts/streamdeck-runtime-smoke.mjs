import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..");
const builtPluginRoot = join(pluginRoot, "ninja.socialstream.streamdeck.sdPlugin");
const builtPluginEntry = join(builtPluginRoot, "bin", "plugin.js");
const pluginUuid = "runtime-plugin";
const deviceId = "runtime-device";
const commandContext = "runtime-command-context";
const connectionContext = "runtime-connection-context";
const customContext = "runtime-custom-context";
const timerContext = "runtime-timer-context";
const chatContext = "runtime-chat-context";
const sessionId = "runtime-session";
const language = process.argv.find(argument => argument.startsWith("--language="))?.slice("--language=".length) || "en";
const commandInventory = await readCommandInventory(join(pluginRoot, "src", "api", "command-registry.ts"));
const ssnCommandIds = commandInventory.filter(command => command.scope === "ssn").map(command => command.id);

if (!existsSync(builtPluginEntry)) {
	throw new Error("Compiled plugin missing. Run `npm run build` before `npm run test:runtime`.");
}
const localeCatalog = JSON.parse(await readFile(join(builtPluginRoot, `${language}.json`), "utf8")).Localization || {};

const bundledTestFiles = await findBundledTestFiles(join(builtPluginRoot, "bin"));
if (bundledTestFiles.length) {
	throw new Error(`Compiled test files should not be included in the Stream Deck bundle: ${bundledTestFiles.join(", ")}`);
}

const isolatedRoot = await mkdtemp(join(tmpdir(), "ssn-streamdeck-runtime-"));
const sdPluginRoot = join(isolatedRoot, "ninja.socialstream.streamdeck.sdPlugin");
await cp(builtPluginRoot, sdPluginRoot, { recursive: true });
const pluginEntry = join(sdPluginRoot, "bin", "plugin.js");
const cleanup = [() => rm(isolatedRoot, { recursive: true, force: true })];

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
					language,
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
			env: process.env,
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
		action: "ninja.socialstream.streamdeck.connection",
		context: connectionContext,
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
	await streamDeck.waitForMessage(
		message => message.event === "setState" && message.context === connectionContext && message.payload?.state === 1,
		"Setup action connected state"
	);
	const connectionSettingsStart = streamDeck.messages.length;
	streamDeck.send(settingsEvent("ninja.socialstream.streamdeck.connection", connectionContext, "Keypad", { title: "Runtime Link" }));
	await streamDeck.waitForMessage(
		message => message.event === "setTitle" && message.context === connectionContext && message.payload?.title === "Runtime Link",
		"Setup action settings refresh",
		connectionSettingsStart
	);

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

	const commandTitle = await streamDeck.waitForMessage(
		message => message.event === "setTitle" && message.context === commandContext,
		"command title render"
	);
	if (commandTitle.payload?.title !== localeCatalog.deviceCommand_removefromwaitlist) {
		throw new Error(`Unexpected command title: ${JSON.stringify(commandTitle.payload?.title)}`);
	}
	const commandSettingsStart = streamDeck.messages.length;
	streamDeck.send(settingsEvent("ninja.socialstream.streamdeck.command", commandContext, "Keypad", { command: "removefromwaitlist", title: "Remove Guest" }));
	await streamDeck.waitForMessage(
		message => message.event === "setTitle" && message.context === commandContext && message.payload?.title === "Remove Guest",
		"preset command settings refresh",
		commandSettingsStart
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

	const statusResponse = await streamDeck.waitForMessage(
		message => message.event === "sendToPropertyInspector" && message.context === commandContext && message.payload?.type === "status",
		"property inspector status response"
	);
	if (!statusResponse.payload?.diagnostics?.pluginVersion || JSON.stringify(statusResponse.payload.diagnostics).includes(sessionId)) {
		throw new Error(`Unsafe or incomplete diagnostics: ${JSON.stringify(statusResponse.payload?.diagnostics)}`);
	}
	streamDeck.send({
		event: "sendToPlugin",
		action: "ninja.socialstream.streamdeck.command",
		context: commandContext,
		payload: { type: "requestSources" }
	});
	await social.waitForMessage(message => message.action === "getSources", "SSApp source list request");
	const sourceList = await streamDeck.waitForMessage(
		message => message.event === "sendToPropertyInspector" && message.context === commandContext && message.payload?.type === "sources",
		"property inspector source response"
	);
	if (sourceList.payload.sources[0]?.tabId !== 42 || "url" in sourceList.payload.sources[0]) {
		throw new Error(`Unexpected property inspector source summary: ${JSON.stringify(sourceList)}`);
	}

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

	for (const [index, commandDefinition] of commandInventory.entries()) {
		const context = `runtime-matrix-${index}`;
		const settings = { command: commandDefinition.id };
		const appearStart = streamDeck.messages.length;
		streamDeck.send({
			event: "willAppear",
			action: "ninja.socialstream.streamdeck.command",
			context,
			device: deviceId,
			payload: {
				controller: "Keypad",
				coordinates: { column: index % 5, row: Math.floor(index / 5) % 3 },
				isInMultiAction: false,
				resources: {},
				settings,
				state: 0
			}
		});
		const titleMessage = await streamDeck.waitForMessage(
			message => message.event === "setTitle" && message.context === context,
			`matrix render ${commandDefinition.id}`,
			appearStart
		);
		const expectedTitle = localeCatalog[`deviceCommand_${commandDefinition.id}`];
		if (!expectedTitle || titleMessage.payload?.title !== expectedTitle) {
			throw new Error(`Unexpected ${language} title for ${commandDefinition.id}: ${JSON.stringify(titleMessage.payload?.title)}`);
		}
		const imageMessage = await streamDeck.waitForMessage(
			message => message.event === "setImage" && message.context === context,
			`matrix icon ${commandDefinition.id}`,
			appearStart
		);
		if (typeof imageMessage.payload?.image !== "string" || !imageMessage.payload.image.startsWith("data:image/png;base64,")) {
			throw new Error(`${commandDefinition.id} did not render a preset key icon: ${JSON.stringify(imageMessage.payload)}`);
		}
		const socialStart = social.messages.length;
		const deckStart = streamDeck.messages.length;
		const keyDownMessage = {
			event: "keyDown",
			action: "ninja.socialstream.streamdeck.command",
			context,
			device: deviceId,
			payload: {
				controller: "Keypad",
				coordinates: { column: index % 5, row: Math.floor(index / 5) % 3 },
				isInMultiAction: false,
				resources: {},
				settings,
				state: 0
			}
		};
		streamDeck.send(keyDownMessage);
		if (commandDefinition.id === "creditsReset") {
			await streamDeck.waitForMessage(
				message => message.event === "setTitle" && message.context === context,
				"credits reset confirmation",
				deckStart
			);
			streamDeck.send(keyDownMessage);
		}
		const request = await social.waitForMessage(
			message => message.action === commandDefinition.id,
			`matrix command ${commandDefinition.id}`,
			socialStart
		);
		if (commandDefinition.scope === "ssapp" && request.target !== "ssapp") {
			throw new Error(`${commandDefinition.id} did not target ssapp: ${JSON.stringify(request)}`);
		}
		if (commandDefinition.id.startsWith("credits") && request.protocol !== 2) {
			throw new Error(`${commandDefinition.id} did not use the credits v2 API: ${JSON.stringify(request)}`);
		}
		await streamDeck.waitForMessage(
			message => message.event === "showOk" && message.context === context,
			`matrix success ${commandDefinition.id}`,
			deckStart
		);
	}

	streamDeck.send({
		event: "willAppear",
		action: "ninja.socialstream.streamdeck.custom-command",
		context: customContext,
		device: deviceId,
		payload: {
			controller: "Keypad",
			coordinates: { column: 0, row: 0 },
			isInMultiAction: false,
			resources: {},
			settings: { action: "gettimerstate", awaitResponse: true },
			state: 0
		}
	});
	await streamDeck.waitForMessage(message => message.event === "setTitle" && message.context === customContext, "custom command render");
	const customSettingsStart = streamDeck.messages.length;
	streamDeck.send(settingsEvent("ninja.socialstream.streamdeck.custom-command", customContext, "Keypad", { action: "gettimerstate", title: "Read Timer" }));
	await streamDeck.waitForMessage(
		message => message.event === "setTitle" && message.context === customContext && message.payload?.title === "Read Timer",
		"custom command settings refresh",
		customSettingsStart
	);
	const customSocialStart = social.messages.length;
	streamDeck.send({
		event: "keyDown",
		action: "ninja.socialstream.streamdeck.custom-command",
		context: customContext,
		device: deviceId,
		payload: {
			controller: "Keypad",
			coordinates: { column: 0, row: 0 },
			isInMultiAction: false,
			resources: {},
			settings: { action: "gettimerstate", awaitResponse: true },
			state: 0
		}
	});
	await social.waitForMessage(message => message.action === "gettimerstate", "custom command", customSocialStart);
	await streamDeck.waitForMessage(message => message.event === "showOk" && message.context === customContext, "custom command success");

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
			settings: { command: "sendChat", sourceId: "youtube-source", value: "Targeted hello" },
			state: 0
		}
	});
	await social.waitForMessage(message => message.action === "getSource" && message.value === "youtube-source", "selected source refresh");
	const targetedChat = await social.waitForMessage(message => message.action === "sendChat" && message.value === "Targeted hello", "targeted chat command");
	if (targetedChat.target !== "youtube" || targetedChat.tabId !== 42 || "sourceId" in targetedChat || "url" in targetedChat) {
		throw new Error(`Unexpected targeted chat payload: ${JSON.stringify(targetedChat)}`);
	}

	const timerAppearStart = social.messages.length;
	streamDeck.send({
		event: "willAppear",
		action: "ninja.socialstream.streamdeck.timer-dial",
		context: timerContext,
		device: deviceId,
		payload: {
			controller: "Encoder",
			coordinates: { column: 0, row: 0 },
			resources: {},
			settings: { stepSeconds: 15, title: "Live Timer" }
		}
	});
	await social.waitForMessage(message => message.action === "gettimerstate", "timer state request", timerAppearStart);
	const timerFeedback = await streamDeck.waitForMessage(
		message => message.event === "setFeedback" && message.context === timerContext && message.payload?.value === "5:00",
		"timer dial feedback"
	);
	const expectedTimerHint = String(localeCatalog.deviceTimerHint || "TURN ±{seconds}s  PUSH ⇄  HOLD ↻").replace(/\{seconds\}/g, "15");
	if (timerFeedback.payload?.hint !== expectedTimerHint) {
		throw new Error(`Unexpected ${language} timer hint: ${JSON.stringify(timerFeedback.payload?.hint)}`);
	}
	const timerSettingsStart = streamDeck.messages.length;
	streamDeck.send(settingsEvent("ninja.socialstream.streamdeck.timer-dial", timerContext, "Encoder", { stepSeconds: 5, title: "Show Timer" }));
	await streamDeck.waitForMessage(
		message => message.event === "setFeedback" && message.context === timerContext && message.payload?.title === "Show Timer",
		"timer settings refresh",
		timerSettingsStart
	);
	const timerAdjustStart = social.messages.length;
	streamDeck.send({
		event: "dialRotate",
		action: "ninja.socialstream.streamdeck.timer-dial",
		context: timerContext,
		device: deviceId,
		payload: { controller: "Encoder", coordinates: { column: 0, row: 0 }, resources: {}, settings: { stepSeconds: 15 }, pressed: false, ticks: 2 }
	});
	const timerAdjust = await social.waitForMessage(message => message.action === "timeradd", "timer dial adjustment", timerAdjustStart);
	if (timerAdjust.value !== 30) throw new Error(`Unexpected timer adjustment: ${JSON.stringify(timerAdjust)}`);

	const pinStart = social.messages.length;
	streamDeck.send({
		event: "willAppear",
		action: "ninja.socialstream.streamdeck.chat-feed",
		context: chatContext,
		device: deviceId,
		payload: { controller: "Encoder", coordinates: { column: 1, row: 0 }, resources: {}, settings: {} }
	});
	await social.waitForMessage(message => message.join === sessionId && message.in === 4, "channel-4 chat listener");
	await streamDeck.waitForMessage(
		message => message.event === "setFeedback" && message.context === chatContext && message.payload?.name === "Chat Tester",
		"chat dial feedback"
	);
	const chatSettingsStart = streamDeck.messages.length;
	streamDeck.send(settingsEvent("ninja.socialstream.streamdeck.chat-feed", chatContext, "Encoder", { title: "Live Chat" }));
	await streamDeck.waitForMessage(
		message => message.event === "setFeedback" && message.context === chatContext && message.payload?.title === "Live Chat",
		"chat settings refresh",
		chatSettingsStart
	);
	streamDeck.send({
		event: "dialDown",
		action: "ninja.socialstream.streamdeck.chat-feed",
		context: chatContext,
		device: deviceId,
		payload: { controller: "Encoder", coordinates: { column: 1, row: 0 }, resources: {}, settings: {} }
	});
	const pin = await social.waitForMessage(message => message.action === "pin", "chat dial pin", pinStart);
	if (pin.value !== "chat-1") throw new Error(`Unexpected chat pin payload: ${JSON.stringify(pin)}`);

	const burstFeedbackStart = streamDeck.messages.length;
	for (let index = 0; index < 55; index += 1) {
		social.broadcastChat({ id: `burst-${index}`, chatname: `Burst ${index}`, chatmessage: `Message ${index}`, type: "twitch" });
	}
	await streamDeck.waitForMessage(
		message => message.event === "setFeedback" && message.context === chatContext && message.payload?.name === "Burst 54",
		"chat rollover refresh",
		burstFeedbackStart
	);
	await new Promise(resolve => setTimeout(resolve, 150));
	const burstFeedbackCount = streamDeck.messages
		.slice(burstFeedbackStart)
		.filter(message => message.event === "setFeedback" && message.context === chatContext)
		.length;
	if (burstFeedbackCount > 2) {
		throw new Error(`Chat burst caused ${burstFeedbackCount} device updates; expected at most 2`);
	}

	const wakeStart = social.messages.length;
	streamDeck.send({ event: "systemDidWakeUp" });
	await social.waitForMessage(message => message.join === sessionId && message.in === 2, "wake main reconnect", wakeStart);
	await social.waitForMessage(message => message.join === sessionId && message.in === 4, "wake chat reconnect", wakeStart);

	if (child.exitCode !== null) {
		throw new Error(`Plugin exited early with code ${child.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
	}

	console.log(`streamdeck plugin runtime smoke passed (${commandInventory.length} presets, 5 actions, ${language})`);
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
				const meta = actionMeta(message.context);
				send({
					event: "didReceiveSettings",
					action: meta.action,
					context: message.context,
					id: message.id,
					device: deviceId,
					payload: {
						controller: meta.controller,
						coordinates: { column: 0, row: 0 },
						isInMultiAction: false,
						resources: {},
						settings: meta.settings,
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

	function actionMeta(context) {
		if (context === timerContext) return { action: "ninja.socialstream.streamdeck.timer-dial", controller: "Encoder", settings: { stepSeconds: 15, title: "Live Timer" } };
		if (context === chatContext) return { action: "ninja.socialstream.streamdeck.chat-feed", controller: "Encoder", settings: {} };
		return { action: "ninja.socialstream.streamdeck.command", controller: "Keypad", settings: {} };
	}

	return {
		port,
		messages,
		send,
		waitForMessage: (predicate, label, startAt = 0) => waitFor(() => messages.slice(startAt).find(predicate), label),
		close: () =>
			new Promise(resolve => {
				if (socket) socket.terminate();
				server.close(resolve);
			})
	};
}

async function createSocialStreamServer() {
	const messages = [];
	const chatSockets = new Set();
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(server, "listening");
	server.on("connection", socket => {
		socket.on("close", () => chatSockets.delete(socket));
		socket.on("message", raw => {
			const message = JSON.parse(raw.toString());
			messages.push(message);
			if (message.join && message.in === 4) {
				chatSockets.add(socket);
				socket.send(JSON.stringify({ id: "chat-1", chatname: "Chat Tester", chatmessage: "Dial feedback works", type: "youtube" }));
				return;
			}
			if (message.action === "getCapabilities" && typeof message.get === "string") {
				const actions = Object.fromEntries(ssnCommandIds.map(action => [action, true]));
				const actionDescriptors = Object.fromEntries(ssnCommandIds.map(action => [action, { callback: "guaranteed" }]));
				socket.send(
					JSON.stringify({
						callback: {
							get: message.get,
							result: {
								type: "capabilities",
								version: 2,
								runtime: "web",
								ssapp: {
									available: true,
									sourceControls: { list: true, get: true, add: true, update: true, remove: true, start: true, stop: true, restart: true },
									bulkControls: { startAll: true, stopAll: true, restartAll: true },
									mute: { set: true, toggle: true },
									visibility: { set: true, toggle: true },
									connectionMode: { set: true },
									settings: { get: true, update: true }
								},
								ssn: { actions, actionDescriptors }
							}
						}
					})
				);
				return;
			}
			if (message.action === "getSources" && typeof message.get === "string") {
				socket.send(JSON.stringify({
					callback: {
						get: message.get,
						result: {
							ok: true,
							payload: { sources: [{ id: "youtube-source", target: "youtube", tabId: 42, status: "active", username: "Channel" }] }
						}
					}
				}));
				return;
			}
			if (message.action === "getSource" && typeof message.get === "string") {
				socket.send(JSON.stringify({
					callback: {
						get: message.get,
						result: {
							ok: true,
							payload: { source: { id: "youtube-source", target: "youtube", tabId: 42, status: "active", username: "Channel" } }
						}
					}
				}));
				return;
			}
			if (message.action === "gettimerstate" && typeof message.get === "string") {
				socket.send(JSON.stringify({ callback: { get: message.get, result: { ok: true, payload: { mode: "countdown", durationMs: 300000, displayMs: 300000, running: false, done: false, overtime: false } } } }));
				return;
			}
			if (typeof message.get === "string") {
				socket.send(JSON.stringify({ callback: { get: message.get, result: { ok: true, payload: { action: message.action } } } }));
			}
		});
	});

	const port = server.address().port;
	return {
		port,
		messages,
		broadcastChat: message => {
			for (const socket of chatSockets) socket.send(JSON.stringify(message));
		},
		waitForMessage: (predicate, label, startAt = 0) => waitFor(() => messages.slice(startAt).find(predicate), label),
		close: () =>
			new Promise(resolve => {
				for (const client of server.clients) client.terminate();
				server.close(resolve);
			})
	};
}

function settingsEvent(action, context, controller, settings) {
	return {
		event: "didReceiveSettings",
		action,
		context,
		device: deviceId,
		payload: {
			controller,
			coordinates: { column: 0, row: 0 },
			isInMultiAction: false,
			resources: {},
			settings,
			state: 0
		}
	};
}

async function readCommandInventory(path) {
	const source = await readFile(path, "utf8");
	const declaredCommandCount = Array.from(source.matchAll(/\{ id: "/g)).length;
	const commands = Array.from(source.matchAll(/\{ id: "([^"]+)", label: "[^"]+", scope: "(ssn|ssapp)"/g), match => ({
		id: match[1],
		scope: match[2]
	}));
	if (
		!commands.length ||
		commands.length !== declaredCommandCount ||
		new Set(commands.map(command => command.id)).size !== commands.length
	) {
		throw new Error("Unable to build a unique command inventory from command-registry.ts");
	}
	return commands;
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
