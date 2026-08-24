import type { JsonValue } from "@elgato/utils";
import type { CustomCommandSettings, SsappSourceSummary, SsnCommandPayload, SsnCommandSettings, StreamDeckCapabilities } from "./types.js";

export type CommandDefinition = {
	id: string;
	label: string;
	scope: "ssn" | "ssapp";
	icon: string;
	defaultValue?: JsonValue;
	valueLabel?: string;
	defaultAwaitResponse?: boolean;
	capabilityPath?: string[];
};

export const SSN_COMMANDS: CommandDefinition[] = [
	{ id: "nextInQueue", label: "Next In Queue", scope: "ssn", icon: "queue-next" },
	{ id: "clearOverlay", label: "Clear Overlay", scope: "ssn", icon: "overlay-clear" },
	{ id: "clearDock", label: "Clear Dock Messages", scope: "ssn", icon: "dock-clear" },
	{ id: "clear", label: "Clear Messages", scope: "ssn", icon: "message-clear" },
	{ id: "clearAll", label: "Clear All Messages", scope: "ssn", icon: "messages-clear" },
	{ id: "clearHistory", label: "Clear Saved History", scope: "ssn", icon: "history-clear", defaultValue: "confirm", valueLabel: "Type confirm", defaultAwaitResponse: true },
	{ id: "creditsStart", label: "Start Credits", scope: "ssn", icon: "credits-play", defaultAwaitResponse: true },
	{ id: "creditsPreview", label: "Preview Credits", scope: "ssn", icon: "credits-preview", defaultAwaitResponse: true },
	{ id: "creditsTest", label: "Test Credits", scope: "ssn", icon: "credits-test", defaultAwaitResponse: true },
	{ id: "creditsReset", label: "Reset Collected Credits", scope: "ssn", icon: "credits-reset", defaultAwaitResponse: true },
	{ id: "resetleaderboard", label: "Reset Leaderboard", scope: "ssn", icon: "leaderboard-reset" },
	{ id: "getQueueSize", label: "Queue Size", scope: "ssn", icon: "queue-count", defaultAwaitResponse: true },
	{ id: "sendChat", label: "Send Chat", scope: "ssn", icon: "message-send", defaultValue: "Hello from Stream Deck", valueLabel: "Message" },
	{ id: "sendEncodedChat", label: "Send Encoded Chat", scope: "ssn", icon: "encoded-send", defaultValue: "Hello%20from%20Stream%20Deck", valueLabel: "Encoded message" },
	{ id: "pin", label: "Pin Dock Message", scope: "ssn", icon: "pin-add", valueLabel: "Message ID or JSON message" },
	{ id: "unpin", label: "Unpin Dock Message", scope: "ssn", icon: "pin-remove", valueLabel: "Message ID" },
	{ id: "nextPinned", label: "Next Pinned Message", scope: "ssn", icon: "pin-next" },
	{ id: "drawmode", label: "Draw Mode", scope: "ssn", icon: "draw-toggle", defaultValue: "toggle", valueLabel: "true, false, or toggle" },
	{ id: "removefromwaitlist", label: "Remove Waitlist Entry", scope: "ssn", icon: "waitlist-remove", defaultValue: "1", valueLabel: "Entry number" },
	{ id: "highlightwaitlist", label: "Highlight Waitlist Entry", scope: "ssn", icon: "waitlist-highlight", defaultValue: "1", valueLabel: "Entry number" },
	{ id: "resetwaitlist", label: "Reset Waitlist", scope: "ssn", icon: "waitlist-reset" },
	{ id: "stopentries", label: "Stop Waitlist Entries", scope: "ssn", icon: "waitlist-stop" },
	{ id: "startentries", label: "Start Waitlist Entries", scope: "ssn", icon: "waitlist-play" },
	{ id: "openentries", label: "Open Waitlist Entries", scope: "ssn", icon: "waitlist-open" },
	{ id: "resumeentries", label: "Resume Waitlist Entries", scope: "ssn", icon: "waitlist-resume" },
	{ id: "waitlistmessage", label: "Set Waitlist Message", scope: "ssn", icon: "waitlist-message", defaultValue: "Type !join to enter!", valueLabel: "Message" },
	{ id: "setwaitlistmessage", label: "Set Waitlist Message", scope: "ssn", icon: "waitlist-message", defaultValue: "Type !join to enter!", valueLabel: "Message" },
	{ id: "downloadwaitlist", label: "Download Waitlist", scope: "ssn", icon: "waitlist-download" },
	{ id: "selectwinner", label: "Select Winner", scope: "ssn", icon: "trophy-highlight", defaultValue: "1", valueLabel: "Winner count" },
	{ id: "starttimer", label: "Start Timer", scope: "ssn", icon: "timer-play" },
	{ id: "pausetimer", label: "Pause Timer", scope: "ssn", icon: "timer-pause" },
	{ id: "toggletimer", label: "Toggle Timer", scope: "ssn", icon: "timer-playpause" },
	{ id: "resettimer", label: "Reset Timer", scope: "ssn", icon: "timer-reset", defaultValue: { confirm: true } },
	{ id: "timeradd", label: "Add Timer Time", scope: "ssn", icon: "timer-add", defaultValue: "30", valueLabel: "Seconds" },
	{ id: "timersubtract", label: "Subtract Timer Time", scope: "ssn", icon: "timer-remove", defaultValue: "30", valueLabel: "Seconds" },
	{ id: "settimer", label: "Set Timer", scope: "ssn", icon: "timer-edit", defaultValue: { seconds: 300 }, valueLabel: "Timer JSON" },
	{ id: "gettimerstate", label: "Timer State", scope: "ssn", icon: "timer-info", defaultAwaitResponse: true },
	{ id: "loadpoll", label: "Load Poll Preset", scope: "ssn", icon: "poll-load", valueLabel: "{\"pollId\":\"...\"}" },
	{ id: "setpollsettings", label: "Set Poll Settings", scope: "ssn", icon: "poll-settings", valueLabel: "Poll settings JSON" },
	{ id: "getpollpresets", label: "Poll Presets", scope: "ssn", icon: "poll-list", defaultAwaitResponse: true },
	{ id: "createpoll", label: "Create Poll", scope: "ssn", icon: "poll-add", valueLabel: "Poll definition JSON" },
	{ id: "resetpoll", label: "Reset Poll", scope: "ssn", icon: "poll-reset" },
	{ id: "closepoll", label: "Close Poll", scope: "ssn", icon: "poll-clear" },
	{ id: "startmap", label: "Start Map", scope: "ssn", icon: "map-play" },
	{ id: "pausemap", label: "Pause Map", scope: "ssn", icon: "map-pause" },
	{ id: "resetmap", label: "Reset Map", scope: "ssn", icon: "map-reset" }
];

export const SSAPP_COMMANDS: CommandDefinition[] = [
	{ id: "getSources", label: "Desktop App Sources", scope: "ssapp", icon: "sources-list", capabilityPath: ["sourceControls", "list"], defaultAwaitResponse: true },
	{ id: "getSource", label: "Desktop App Source", scope: "ssapp", icon: "source-info", capabilityPath: ["sourceControls", "get"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "addSource", label: "Add Source", scope: "ssapp", icon: "source-add", capabilityPath: ["sourceControls", "add"], valueLabel: "Source JSON", defaultAwaitResponse: true },
	{ id: "updateSource", label: "Update Source", scope: "ssapp", icon: "source-edit", capabilityPath: ["sourceControls", "update"], valueLabel: "{\"sourceId\":\"...\",\"updates\":{...}}", defaultAwaitResponse: true },
	{ id: "removeSource", label: "Remove Source", scope: "ssapp", icon: "source-remove", capabilityPath: ["sourceControls", "remove"], valueLabel: "{\"sourceId\":\"...\",\"confirm\":true}", defaultAwaitResponse: true },
	{ id: "startSource", label: "Start Source", scope: "ssapp", icon: "source-play", capabilityPath: ["sourceControls", "start"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "stopSource", label: "Stop Source", scope: "ssapp", icon: "source-stop", capabilityPath: ["sourceControls", "stop"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "restartSource", label: "Restart Source", scope: "ssapp", icon: "source-restart", capabilityPath: ["sourceControls", "restart"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "startAllSources", label: "Start All Sources", scope: "ssapp", icon: "sources-play", capabilityPath: ["bulkControls", "startAll"], defaultValue: {}, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "stopAllSources", label: "Stop All Sources", scope: "ssapp", icon: "sources-stop", capabilityPath: ["bulkControls", "stopAll"], defaultValue: { confirm: true }, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "restartAllSources", label: "Restart All Sources", scope: "ssapp", icon: "sources-restart", capabilityPath: ["bulkControls", "restartAll"], defaultValue: { confirm: true }, valueLabel: "Filter JSON", defaultAwaitResponse: true },
	{ id: "setSourceMute", label: "Set Source Mute", scope: "ssapp", icon: "mute-edit", capabilityPath: ["mute", "set"], valueLabel: "{\"sourceId\":\"...\",\"isMuted\":true}", defaultAwaitResponse: true },
	{ id: "toggleSourceMute", label: "Toggle Source Mute", scope: "ssapp", icon: "speaker-toggle", capabilityPath: ["mute", "toggle"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "setSourceVisibility", label: "Set Source Visibility", scope: "ssapp", icon: "eye-edit", capabilityPath: ["visibility", "set"], valueLabel: "{\"sourceId\":\"...\",\"isVisible\":false}", defaultAwaitResponse: true },
	{ id: "toggleSourceVisibility", label: "Toggle Source Visibility", scope: "ssapp", icon: "eye-toggle", capabilityPath: ["visibility", "toggle"], valueLabel: "Source ID", defaultAwaitResponse: true },
	{ id: "setSourceConnectionMode", label: "Set Connection Mode", scope: "ssapp", icon: "plug-edit", capabilityPath: ["connectionMode", "set"], valueLabel: "{\"sourceId\":\"...\",\"mode\":\"websocket\"}", defaultAwaitResponse: true },
	{ id: "getSettings", label: "Desktop App Settings", scope: "ssapp", icon: "settings-info", capabilityPath: ["settings", "get"], defaultAwaitResponse: true },
	{ id: "updateSettings", label: "Update Desktop App Settings", scope: "ssapp", icon: "settings-edit", capabilityPath: ["settings", "update"], valueLabel: "Settings JSON", defaultAwaitResponse: true }
];

export const COMMANDS: CommandDefinition[] = [...SSN_COMMANDS, ...SSAPP_COMMANDS];

const COMMAND_KEY_TITLES: Record<string, string> = {
	nextInQueue: "Next\nQueue",
	clearOverlay: "Clear\nOverlay",
	clearDock: "Clear\nDock",
	clear: "Clear\nMessages",
	clearAll: "Clear All",
	clearHistory: "Clear\nHistory",
	creditsStart: "Credits\nStart",
	creditsPreview: "Credits\nPreview",
	creditsTest: "Credits\nTest",
	creditsReset: "Reset\nCredits",
	resetleaderboard: "Reset\nLeaders",
	getQueueSize: "Queue\nSize",
	sendChat: "Send\nChat",
	sendEncodedChat: "Send\nEncoded",
	pin: "Pin\nMessage",
	unpin: "Unpin\nMessage",
	nextPinned: "Next\nPinned",
	drawmode: "Draw\nMode",
	removefromwaitlist: "Remove\nWaitlist",
	highlightwaitlist: "Highlight\nWaitlist",
	resetwaitlist: "Reset\nWaitlist",
	stopentries: "Waitlist\nStop",
	startentries: "Waitlist\nStart",
	openentries: "Waitlist\nOpen",
	resumeentries: "Waitlist\nResume",
	waitlistmessage: "Set Join\nMessage",
	setwaitlistmessage: "Set Join\nMessage",
	downloadwaitlist: "Download\nWaitlist",
	selectwinner: "Select\nWinner",
	starttimer: "Timer\nStart",
	pausetimer: "Timer\nPause",
	toggletimer: "Timer\nToggle",
	resettimer: "Timer\nReset",
	timeradd: "Timer\n+ Time",
	timersubtract: "Timer\n- Time",
	settimer: "Timer\nSet",
	gettimerstate: "Timer\nStatus",
	loadpoll: "Poll\nLoad",
	setpollsettings: "Poll\nSettings",
	getpollpresets: "Poll\nPresets",
	createpoll: "Poll\nCreate",
	resetpoll: "Poll\nReset",
	closepoll: "Poll\nClose",
	startmap: "Map\nStart",
	pausemap: "Map\nPause",
	resetmap: "Map\nReset",
	getSources: "Sources\nList",
	getSource: "Source\nDetails",
	addSource: "Source\nAdd",
	updateSource: "Source\nUpdate",
	removeSource: "Source\nRemove",
	startSource: "Source\nStart",
	stopSource: "Source\nStop",
	restartSource: "Source\nRestart",
	startAllSources: "All Sources\nStart",
	stopAllSources: "All Sources\nStop",
	restartAllSources: "All Sources\nRestart",
	setSourceMute: "Source\nSet Mute",
	toggleSourceMute: "Source\nMute Toggle",
	setSourceVisibility: "Source\nSet Visible",
	toggleSourceVisibility: "Source\nVisibility",
	setSourceConnectionMode: "Source\nConn Mode",
	getSettings: "App\nSettings",
	updateSettings: "App\nSet Config"
};

export function getCommandDefinition(command: string | undefined): CommandDefinition {
	return COMMANDS.find(definition => definition.id === command) || COMMANDS[0];
}

export function getCommandKeyTitle(command: string | CommandDefinition): string {
	const definition = typeof command === "string" ? getCommandDefinition(command) : command;
	return COMMAND_KEY_TITLES[definition.id] || "SSN\nCommand";
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
		throw new Error("The selected desktop app source is not open.");
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
