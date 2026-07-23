import type { JsonValue } from "@elgato/utils";
import type { CustomCommandSettings, SsappSourceSummary, SsnCommandPayload, SsnCommandSettings, StreamDeckCapabilities } from "./types.js";

export type CommandDefinition = {
	id: string;
	label: string;
	scope: "ssn" | "ssapp";
	defaultValue?: JsonValue;
	valueLabel?: string;
	defaultAwaitResponse?: boolean;
	capabilityPath?: string[];
};

export const SSN_COMMANDS: CommandDefinition[] = [
	{ id: "nextInQueue", label: "Next In Queue", scope: "ssn" },
	{ id: "clearOverlay", label: "Clear Overlay", scope: "ssn" },
	{ id: "clearDock", label: "Clear Dock Messages", scope: "ssn" },
	{ id: "clear", label: "Clear Messages", scope: "ssn" },
	{ id: "clearAll", label: "Clear All Messages", scope: "ssn" },
	{ id: "clearHistory", label: "Clear Saved History", scope: "ssn", defaultValue: "confirm", valueLabel: "Type confirm", defaultAwaitResponse: true },
	{ id: "resetleaderboard", label: "Reset Leaderboard", scope: "ssn" },
	{ id: "getQueueSize", label: "Queue Size", scope: "ssn", defaultAwaitResponse: true },
	{ id: "sendChat", label: "Send Chat", scope: "ssn", defaultValue: "Hello from Stream Deck", valueLabel: "Message" },
	{ id: "sendEncodedChat", label: "Send Encoded Chat", scope: "ssn", defaultValue: "Hello%20from%20Stream%20Deck", valueLabel: "Encoded message" },
	{ id: "pin", label: "Pin Dock Message", scope: "ssn", valueLabel: "Message ID or JSON message" },
	{ id: "unpin", label: "Unpin Dock Message", scope: "ssn", valueLabel: "Message ID" },
	{ id: "nextPinned", label: "Next Pinned Message", scope: "ssn" },
	{ id: "drawmode", label: "Draw Mode", scope: "ssn", defaultValue: "toggle", valueLabel: "true, false, or toggle" },
	{ id: "removefromwaitlist", label: "Remove Waitlist Entry", scope: "ssn", defaultValue: "1", valueLabel: "Entry number" },
	{ id: "highlightwaitlist", label: "Highlight Waitlist Entry", scope: "ssn", defaultValue: "1", valueLabel: "Entry number" },
	{ id: "resetwaitlist", label: "Reset Waitlist", scope: "ssn" },
	{ id: "stopentries", label: "Stop Waitlist Entries", scope: "ssn" },
	{ id: "startentries", label: "Start Waitlist Entries", scope: "ssn" },
	{ id: "openentries", label: "Open Waitlist Entries", scope: "ssn" },
	{ id: "resumeentries", label: "Resume Waitlist Entries", scope: "ssn" },
	{ id: "waitlistmessage", label: "Set Waitlist Message", scope: "ssn", defaultValue: "Type !join to enter!", valueLabel: "Message" },
	{ id: "setwaitlistmessage", label: "Set Waitlist Message", scope: "ssn", defaultValue: "Type !join to enter!", valueLabel: "Message" },
	{ id: "downloadwaitlist", label: "Download Waitlist", scope: "ssn" },
	{ id: "selectwinner", label: "Select Winner", scope: "ssn", defaultValue: "1", valueLabel: "Winner count" },
	{ id: "starttimer", label: "Start Timer", scope: "ssn" },
	{ id: "pausetimer", label: "Pause Timer", scope: "ssn" },
	{ id: "toggletimer", label: "Toggle Timer", scope: "ssn" },
	{ id: "resettimer", label: "Reset Timer", scope: "ssn" },
	{ id: "timeradd", label: "Add Timer Time", scope: "ssn", defaultValue: "30", valueLabel: "Seconds" },
	{ id: "timersubtract", label: "Subtract Timer Time", scope: "ssn", defaultValue: "30", valueLabel: "Seconds" },
	{ id: "settimer", label: "Set Timer", scope: "ssn", defaultValue: { seconds: 300 }, valueLabel: "Timer JSON" },
	{ id: "gettimerstate", label: "Timer State", scope: "ssn", defaultAwaitResponse: true },
	{ id: "loadpoll", label: "Load Poll Preset", scope: "ssn", valueLabel: "{\"pollId\":\"...\"}" },
	{ id: "setpollsettings", label: "Set Poll Settings", scope: "ssn", valueLabel: "Poll settings JSON" },
	{ id: "getpollpresets", label: "Poll Presets", scope: "ssn", defaultAwaitResponse: true },
	{ id: "createpoll", label: "Create Poll", scope: "ssn", valueLabel: "Poll definition JSON" },
	{ id: "resetpoll", label: "Reset Poll", scope: "ssn" },
	{ id: "closepoll", label: "Close Poll", scope: "ssn" },
	{ id: "startmap", label: "Start Map", scope: "ssn" },
	{ id: "pausemap", label: "Pause Map", scope: "ssn" },
	{ id: "resetmap", label: "Reset Map", scope: "ssn" }
];

export const SSAPP_COMMANDS: CommandDefinition[] = [
	{ id: "getSources", label: "SSApp Sources", scope: "ssapp", capabilityPath: ["sourceControls", "list"], defaultAwaitResponse: true },
	{ id: "getSource", label: "SSApp Source", scope: "ssapp", capabilityPath: ["sourceControls", "get"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "addSource", label: "Add Source", scope: "ssapp", capabilityPath: ["sourceControls", "add"], valueLabel: "Source JSON", defaultAwaitResponse: true },
	{ id: "updateSource", label: "Update Source", scope: "ssapp", capabilityPath: ["sourceControls", "update"], valueLabel: "{\"sourceId\":\"...\",\"updates\":{...}}", defaultAwaitResponse: true },
	{ id: "removeSource", label: "Remove Source", scope: "ssapp", capabilityPath: ["sourceControls", "remove"], valueLabel: "{\"sourceId\":\"...\",\"confirm\":true}", defaultAwaitResponse: true },
	{ id: "startSource", label: "Start Source", scope: "ssapp", capabilityPath: ["sourceControls", "start"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "stopSource", label: "Stop Source", scope: "ssapp", capabilityPath: ["sourceControls", "stop"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "restartSource", label: "Restart Source", scope: "ssapp", capabilityPath: ["sourceControls", "restart"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "startAllSources", label: "Start All Sources", scope: "ssapp", capabilityPath: ["bulkControls", "startAll"], defaultValue: {}, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "stopAllSources", label: "Stop All Sources", scope: "ssapp", capabilityPath: ["bulkControls", "stopAll"], defaultValue: { confirm: true }, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "restartAllSources", label: "Restart All Sources", scope: "ssapp", capabilityPath: ["bulkControls", "restartAll"], defaultValue: { confirm: true }, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "setSourceMute", label: "Set Source Mute", scope: "ssapp", capabilityPath: ["mute", "set"], valueLabel: "{\"sourceId\":\"...\",\"isMuted\":true}", defaultAwaitResponse: true },
	{ id: "toggleSourceMute", label: "Toggle Source Mute", scope: "ssapp", capabilityPath: ["mute", "toggle"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "setSourceVisibility", label: "Set Source Visibility", scope: "ssapp", capabilityPath: ["visibility", "set"], valueLabel: "{\"sourceId\":\"...\",\"isVisible\":false}", defaultAwaitResponse: true },
	{ id: "toggleSourceVisibility", label: "Toggle Source Visibility", scope: "ssapp", capabilityPath: ["visibility", "toggle"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "setSourceConnectionMode", label: "Set Connection Mode", scope: "ssapp", capabilityPath: ["connectionMode", "set"], valueLabel: "{\"sourceId\":\"...\",\"mode\":\"websocket\"}", defaultAwaitResponse: true },
	{ id: "getSettings", label: "SSApp Settings", scope: "ssapp", capabilityPath: ["settings", "get"], defaultAwaitResponse: true },
	{ id: "updateSettings", label: "Update SSApp Settings", scope: "ssapp", capabilityPath: ["settings", "update"], valueLabel: "Settings JSON", defaultAwaitResponse: true }
];

export const COMMANDS: CommandDefinition[] = [...SSN_COMMANDS, ...SSAPP_COMMANDS];

export function getCommandDefinition(command: string | undefined): CommandDefinition {
	return COMMANDS.find(definition => definition.id === command) || COMMANDS[0];
}

export function isCommandSupported(command: string | CommandDefinition, capabilities: StreamDeckCapabilities | null): boolean {
	if (!capabilities) {
		return true;
	}
	const definition = typeof command === "string" ? getCommandDefinition(command) : command;
	if (definition.scope === "ssn") {
		const actions = capabilities.ssn && typeof capabilities.ssn.actions === "object" && !Array.isArray(capabilities.ssn.actions)
			? capabilities.ssn.actions
			: null;
		return !!actions && actions[definition.id] === true;
	}
	if (!capabilities.ssapp || capabilities.ssapp.available !== true || !definition.capabilityPath) {
		return false;
	}
	let current: unknown = capabilities.ssapp;
	for (const key of definition.capabilityPath) {
		if (!current || typeof current !== "object" || !(key in current)) {
			return false;
		}
		current = (current as Record<string, unknown>)[key];
	}
	return current === true || Array.isArray(current) || (!!current && typeof current === "object");
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

export function isSourceTargetedChat(settings: SsnCommandSettings): boolean {
	return !!settings.sourceId && (settings.command === "sendChat" || settings.command === "sendEncodedChat");
}

export function extractSourceFromCommandResult(result: unknown): SsappSourceSummary | null {
	if (!result || typeof result !== "object" || Array.isArray(result)) return null;
	const payload = (result as Record<string, unknown>).payload;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
	const source = (payload as Record<string, unknown>).source;
	if (!source || typeof source !== "object" || Array.isArray(source)) return null;
	const candidate = source as Record<string, unknown>;
	if (typeof candidate.id !== "string" || typeof candidate.target !== "string") return null;
	const tabId = typeof candidate.tabId === "number" && Number.isInteger(candidate.tabId) && candidate.tabId > 0
		? candidate.tabId
		: null;
	const normalized: SsappSourceSummary = { id: candidate.id, target: candidate.target, tabId };
	for (const field of ["username", "videoId", "status"] as const) {
		if (typeof candidate[field] === "string") normalized[field] = candidate[field];
	}
	return normalized;
}

export function extractSourcesFromCommandResult(result: unknown): SsappSourceSummary[] {
	if (!result || typeof result !== "object" || Array.isArray(result)) return [];
	const payload = (result as Record<string, unknown>).payload;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
	const sources = (payload as Record<string, unknown>).sources;
	if (!Array.isArray(sources)) return [];
	return sources.flatMap(source => {
		const normalized = extractSourceFromCommandResult({ payload: { source } });
		return normalized ? [normalized] : [];
	});
}

export function targetChatPayloadToSource(payload: SsnCommandPayload, source: SsappSourceSummary): SsnCommandPayload {
	if (!source.target || !source.tabId || (source.status && source.status !== "active")) {
		throw new Error("The selected SSApp source is not open.");
	}
	return {
		...payload,
		target: source.target,
		tabId: source.tabId
	};
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
