import streamDeck from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { SsnClient } from "./api/ssn-client.js";
import { normalizeGlobalSettings } from "./api/settings.js";
import type { ConnectionStateName, GlobalSettings } from "./api/types.js";
import { SessionStore } from "./state/session-store.js";

export const ssnClient = new SsnClient();
export const sessionStore = new SessionStore();

export async function initializeServices(): Promise<void> {
	const settings = normalizeGlobalSettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
	ssnClient.onState(state => sessionStore.setConnectionState(state));
	ssnClient.onMessage(message => sessionStore.setLastMessage(message));
	ssnClient.onCapabilities(capabilities => {
		streamDeck.ui.sendToPropertyInspector({
			type: "capabilities",
			capabilities
		});
	});
	ssnClient.configure(settings);
	registerPropertyInspectorMessages();

	streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>(ev => {
		ssnClient.configure(normalizeGlobalSettings(ev.settings));
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
		} else if (payload.type === "testConnection") {
			await testConnection();
		} else if (payload.type === "openUrl" && typeof payload.url === "string") {
			await openTrustedUrl(payload.url);
		}
	});
}

async function testConnection(): Promise<void> {
	const settings = normalizeGlobalSettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
	ssnClient.configure(settings);
	await sendInspectorStatus(settings.sessionId ? "Connection requested." : "Enter a session ID first.");
}

async function sendInspectorStatus(message?: string): Promise<void> {
	const state = sessionStore.getConnectionState();
	await streamDeck.ui.sendToPropertyInspector({
		type: "status",
		ok: state === "connected",
		state,
		message: message || statusMessage(state),
		capabilities: ssnClient.getCapabilities()
	});
}

function statusMessage(state: ConnectionStateName): string {
	if (state === "connected") {
		return "Connected to Social Stream Ninja.";
	}
	if (state === "connecting") {
		return "Connecting to the Social Stream Ninja API.";
	}
	if (state === "missing-session") {
		return "Enter a Social Stream Ninja session ID.";
	}
	if (state === "error") {
		return "The Social Stream Ninja API connection reported an error.";
	}
	return "Disconnected from Social Stream Ninja.";
}

async function openTrustedUrl(url: string): Promise<void> {
	if (!url.startsWith("https://socialstream.ninja")) {
		return;
	}
	await streamDeck.system.openUrl(url);
}

function isJsonObject(value: JsonValue): value is JsonObject {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
