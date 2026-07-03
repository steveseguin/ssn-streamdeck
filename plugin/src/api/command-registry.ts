import type { JsonValue } from "@elgato/utils";
import type { CustomCommandSettings, SsnCommandPayload, SsnCommandSettings } from "./types.js";

export type CommandDefinition = {
	id: string;
	label: string;
	defaultValue?: JsonValue;
	valueLabel?: string;
};

export const COMMANDS: CommandDefinition[] = [
	{ id: "nextInQueue", label: "Next In Queue" },
	{ id: "clearOverlay", label: "Clear Overlay" },
	{ id: "getQueueSize", label: "Queue Size" },
	{ id: "sendChat", label: "Send Chat", defaultValue: "Hello from Stream Deck", valueLabel: "Message" },
	{ id: "sendEncodedChat", label: "Send Encoded Chat", defaultValue: "Hello%20from%20Stream%20Deck", valueLabel: "Encoded message" },
	{ id: "drawmode", label: "Draw Mode", defaultValue: "toggle", valueLabel: "true, false, or toggle" },
	{ id: "resetwaitlist", label: "Reset Waitlist" },
	{ id: "selectwinner", label: "Select Winner" },
	{ id: "resetpoll", label: "Reset Poll" },
	{ id: "closepoll", label: "Close Poll" }
];

export function getCommandDefinition(command: string | undefined): CommandDefinition {
	return COMMANDS.find(definition => definition.id === command) || COMMANDS[0];
}

export function buildSsnCommandPayload(settings: SsnCommandSettings): SsnCommandPayload {
	const definition = getCommandDefinition(settings.command);
	const payload: SsnCommandPayload = { action: definition.id };
	const target = parseValue(settings.target);
	const value = parseValue(settings.value || stringFromJsonValue(definition.defaultValue));
	if (typeof target !== "undefined") {
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
