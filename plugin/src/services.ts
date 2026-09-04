import streamDeck from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { ChatFeedClient } from "./api/chat-feed-client.js";
import { extractSourcesFromCommandResult } from "./api/command-registry.js";
import { SsnClient } from "./api/ssn-client.js";
import { normalizeGlobalSettings } from "./api/settings.js";
import type { ConnectionStateName, GlobalSettings } from "./api/types.js";
import { SessionStore } from "./state/session-store.js";

export const ssnClient = new SsnClient();
export const chatFeedClient = new ChatFeedClient();
export const sessionStore = new SessionStore();
const serviceLogger = streamDeck.logger.createScope("services");

export async function initializeServices(): Promise<void> {
	const settings = normalizeGlobalSettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
	ssnClient.onState(state => {
		serviceLogger.info(`Connection state: ${state}`);
		sessionStore.setConnectionState(state);
	});
	ssnClient.onMessage(message => {
		sessionStore.setLastMessage(message);
		chatFeedClient.handleTransportMessage(message);
	});
	chatFeedClient.onMessage(message => sessionStore.addChatMessage(message));
	chatFeedClient.onError(error => recordPluginError("chat-feed.transport", error));
	ssnClient.onCapabilities(capabilities => {
		if (capabilities) {
			serviceLogger.info(`Capabilities received: protocol ${capabilities.version}, runtime ${capabilities.runtime || "unknown"}`);
		} else {
			serviceLogger.debug("Capabilities cleared");
		}
		streamDeck.ui.sendToPropertyInspector({
			type: "capabilities",
			capabilities
		});
	});
	ssnClient.configure(settings);
	chatFeedClient.configure(settings);
	streamDeck.system.onSystemDidWakeUp(() => {
		serviceLogger.info("System resumed; reconnecting Social Stream transports");
		ssnClient.reconnect();
		chatFeedClient.reconnect();
	});
	registerPropertyInspectorMessages();

	streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>(ev => {
		const next = normalizeGlobalSettings(ev.settings);
		ssnClient.configure(next);
		chatFeedClient.configure(next);
	});
}

export function recordPluginError(scope: string, error: unknown): void {
	const message = sanitizeDiagnosticMessage(error instanceof Error ? error.message : String(error || "Unknown error"));
	streamDeck.logger.createScope(scope).error(message);
	sessionStore.setLastError({
		scope,
		message,
		timestamp: new Date().toISOString()
	});
}

function registerPropertyInspectorMessages(): void {
	streamDeck.ui.onSendToPlugin(async ev => {
		const payload = ev.payload;
		if (!isJsonObject(payload)) {
			return;
		}
		if (payload.type === "requestStatus") {
			await sendInspectorStatus();
		} else if (payload.type === "requestSources") {
			await sendInspectorSources();
		} else if (payload.type === "testConnection") {
			await testConnection();
		}
	});
}

async function sendInspectorSources(): Promise<void> {
	try {
		const result = await ssnClient.sendCommand({ action: "getSources", target: "ssapp" }, { awaitResponse: true });
		await streamDeck.ui.sendToPropertyInspector({
			type: "sources",
			sources: extractSourcesFromCommandResult(result)
		});
	} catch (error) {
		recordPluginError("property-inspector.sources", error);
		await streamDeck.ui.sendToPropertyInspector({
			type: "sources",
			sources: [],
			error: error instanceof Error ? error.message : "Unable to load desktop app sources."
		});
	}
}

async function testConnection(): Promise<void> {
	const settings = normalizeGlobalSettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
	ssnClient.configure(settings);
	if (!settings.sessionId) {
		await sendInspectorStatus("Enter a session ID first.");
		return;
	}
	try {
		await ssnClient.verifyConnection();
		sessionStore.setLastError(null);
		await sendInspectorStatus("Connection verified.");
	} catch (error) {
		recordPluginError("property-inspector.connection-test", error);
		const message = error instanceof Error ? error.message : "Unable to verify the connection.";
		await sendInspectorStatus(`Connection test failed: ${message}`);
	}
}

async function sendInspectorStatus(message?: string): Promise<void> {
	const state = sessionStore.getConnectionState();
	await streamDeck.ui.sendToPropertyInspector({
		type: "status",
		ok: state === "connected",
		state,
		message: message || statusMessage(state),
		capabilities: ssnClient.getCapabilities(),
		diagnostics: diagnosticSummary(state)
	});
}

function diagnosticSummary(state: ConnectionStateName): JsonObject {
	const capabilities = ssnClient.getCapabilities();
	const lastError = sessionStore.getLastError();
	return {
		pluginVersion: streamDeck.info.plugin.version,
		streamDeckVersion: streamDeck.info.application.version,
		platform: streamDeck.info.application.platform,
		transport: ssnClient.transportMode,
		state,
		runtime: capabilities?.runtime || "unknown",
		protocolVersion: capabilities?.version || 0,
		lastError: lastError
			? `${lastError.timestamp} [${lastError.scope}] ${lastError.message}`
			: ""
	};
}

function statusMessage(state: ConnectionStateName): string {
	if (state === "connected") {
		return "Connected to Social Stream Ninja.";
	}
	if (state === "connecting") {
		return "Connecting to Social Stream Ninja.";
	}
	if (state === "missing-session") {
		return "Enter a Social Stream Ninja session ID.";
	}
	if (state === "error") {
		return "The Social Stream Ninja connection reported an error.";
	}
	return "Disconnected from Social Stream Ninja.";
}

function isJsonObject(value: JsonValue): value is JsonObject {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeDiagnosticMessage(value: string): string {
	return value
		.replace(/([?&](?:session|apiid|password)=)[^&#\s]+/gi, "$1[redacted]")
		.replace(/\b(session|apiid|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
		.slice(0, 500);
}
