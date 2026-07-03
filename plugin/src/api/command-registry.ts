import type { JsonValue } from "@elgato/utils";
import type { CustomCommandSettings, SsnCommandPayload, SsnCommandSettings } from "./types.js";

export type CommandDefinition = {
	id: string;
	label: string;
	scope: "ssn" | "ssapp";
	defaultValue?: JsonValue;
	valueLabel?: string;
	defaultAwaitResponse?: boolean;
};

export const SSN_COMMANDS: CommandDefinition[] = [
	{ id: "nextInQueue", label: "Next In Queue", scope: "ssn" },
	{ id: "clearOverlay", label: "Clear Overlay", scope: "ssn" },
	{ id: "getQueueSize", label: "Queue Size", scope: "ssn", defaultAwaitResponse: true },
	{ id: "sendChat", label: "Send Chat", scope: "ssn", defaultValue: "Hello from Stream Deck", valueLabel: "Message" },
	{ id: "sendEncodedChat", label: "Send Encoded Chat", scope: "ssn", defaultValue: "Hello%20from%20Stream%20Deck", valueLabel: "Encoded message" },
	{ id: "drawmode", label: "Draw Mode", scope: "ssn", defaultValue: "toggle", valueLabel: "true, false, or toggle" },
	{ id: "resetwaitlist", label: "Reset Waitlist", scope: "ssn" },
	{ id: "selectwinner", label: "Select Winner", scope: "ssn" },
	{ id: "resetpoll", label: "Reset Poll", scope: "ssn" },
	{ id: "closepoll", label: "Close Poll", scope: "ssn" }
];

export const SSAPP_COMMANDS: CommandDefinition[] = [
	{ id: "getSources", label: "SSApp Sources", scope: "ssapp", defaultAwaitResponse: true },
	{ id: "getSource", label: "SSApp Source", scope: "ssapp", valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "startSource", label: "Start Source", scope: "ssapp", valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "stopSource", label: "Stop Source", scope: "ssapp", valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "restartSource", label: "Restart Source", scope: "ssapp", valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "startAllSources", label: "Start All Sources", scope: "ssapp", defaultValue: {}, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "stopAllSources", label: "Stop All Sources", scope: "ssapp", defaultValue: { confirm: true }, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "restartAllSources", label: "Restart All Sources", scope: "ssapp", defaultValue: { confirm: true }, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "setSourceMute", label: "Set Source Mute", scope: "ssapp", valueLabel: "{\"sourceId\":\"...\",\"isMuted\":true}", defaultAwaitResponse: true },
	{ id: "toggleSourceMute", label: "Toggle Source Mute", scope: "ssapp", valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "setSourceVisibility", label: "Set Source Visibility", scope: "ssapp", valueLabel: "{\"sourceId\":\"...\",\"isVisible\":false}", defaultAwaitResponse: true },
	{ id: "toggleSourceVisibility", label: "Toggle Source Visibility", scope: "ssapp", valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "setSourceConnectionMode", label: "Set Connection Mode", scope: "ssapp", valueLabel: "{\"sourceId\":\"...\",\"mode\":\"websocket\"}", defaultAwaitResponse: true }
];

export const COMMANDS: CommandDefinition[] = [...SSN_COMMANDS, ...SSAPP_COMMANDS];

export function getCommandDefinition(command: string | undefined): CommandDefinition {
	return COMMANDS.find(definition => definition.id === command) || COMMANDS[0];
}

export function buildSsnCommandPayload(settings: SsnCommandSettings): SsnCommandPayload {
	const definition = getCommandDefinition(settings.command);
	const payload: SsnCommandPayload = { action: definition.id };
	const target = parseValue(settings.target);
	const value = parseValue(settings.value || stringFromJsonValue(definition.defaultValue));
	if (definition.scope === "ssapp") {
		payload.target = "ssapp";
	} else if (typeof target !== "undefined") {
		payload.target = target;
	}
	if (typeof value !== "undefined") {
		payload.value = value;
	}
	return payload;
}

export function buildCustomCommandPayload(settings: CustomCommandSettings): SsnCommandPayload {
	const payload: SsnCommandPayload = {
		action: settings.action || "nextInQueue"
	};
	if (typeof settings.target !== "undefined") {
		payload.target = settings.target;
	}
	if (typeof settings.value !== "undefined") {
		payload.value = settings.value;
	}
	return payload;
}

export function parseValue(value: JsonValue | undefined): JsonValue | undefined {
	if (typeof value !== "string") {
		return value;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	if (trimmed === "true") {
		return true;
	}
	if (trimmed === "false") {
		return false;
	}
	if (trimmed === "null") {
		return null;
	}
	if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
		try {
			return JSON.parse(trimmed) as JsonValue;
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}

function stringFromJsonValue(value: JsonValue | undefined): string {
	if (typeof value === "undefined") {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}
