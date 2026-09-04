import type { CustomCommandSettings, GlobalSettings, SsnCommandSettings, TimerDialSettings, TransportMode } from "./types.js";

export const DEFAULT_API_HOST = "io.socialstream.ninja";

export function normalizeGlobalSettings(settings: Partial<GlobalSettings> | undefined): GlobalSettings {
	return {
		sessionId: normalizeSessionId(settings?.sessionId),
		password: stringOrEmpty(settings?.password),
		transport: settings?.transport === "websocket" ? "websocket" : "p2p",
		apiHost: stringOrEmpty(settings?.apiHost) || DEFAULT_API_HOST,
		useTls: settings?.useTls !== false,
		httpFallback: settings?.httpFallback !== false,
		inChannel: positiveInteger(settings?.inChannel, 2),
		outChannel: positiveInteger(settings?.outChannel, 1),
		requestTimeoutMs: positiveInteger(settings?.requestTimeoutMs, 5000)
	};
}

export interface ParsedConnectionInput {
	sessionId: string;
	password: string;
	transport: TransportMode | null;
}

export function parseConnectionInput(value: unknown): ParsedConnectionInput {
	const raw = stringOrEmpty(value);
	if (!raw) {
		return { sessionId: "", password: "", transport: null };
	}
	const sessionId = extractQueryValue(raw, "session");
	const password = extractQueryValue(raw, "password");
	const looksLikeLink = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /(?:^|[?&#])session=/i.test(raw);
	const usesServer = ["server", "server2", "server3"].some(key => hasEnabledQueryFlag(raw, key));
	return {
		sessionId: sessionId || raw,
		password,
		transport: looksLikeLink ? (usesServer ? "websocket" : "p2p") : null
	};
}

export function normalizeSessionId(value: unknown): string {
	return parseConnectionInput(value).sessionId;
}

export function normalizeSsnCommandSettings(settings: Partial<SsnCommandSettings> | undefined): SsnCommandSettings {
	return {
		command: stringOrEmpty(settings?.command) || "nextInQueue",
		target: stringOrEmpty(settings?.target),
		sourceId: stringOrEmpty(settings?.sourceId),
		value: stringOrEmpty(settings?.value),
		title: stringOrEmpty(settings?.title),
		awaitResponse: settings?.awaitResponse === true
	};
}

export function normalizeCustomCommandSettings(settings: Partial<CustomCommandSettings> | undefined): CustomCommandSettings {
	return {
		action: stringOrEmpty(settings?.action) || "nextInQueue",
		target: emptyToUndefined(settings?.target),
		value: emptyToUndefined(settings?.value),
		title: stringOrEmpty(settings?.title),
		awaitResponse: settings?.awaitResponse === true
	};
}

export function normalizeTimerDialSettings(settings: Partial<TimerDialSettings> | undefined): TimerDialSettings {
	return {
		title: stringOrEmpty(settings?.title) || "Stream Timer",
		stepSeconds: positiveInteger(settings?.stepSeconds, 10)
	};
}

function stringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function extractQueryValue(value: string, key: string): string {
	try {
		const url = new URL(value);
		const fromUrl = url.searchParams.get(key);
		if (fromUrl) {
			return fromUrl.trim();
		}
	} catch {
		// Not a full URL; fall through to query-fragment parsing.
	}
	const match = value.match(new RegExp("(?:^|[?&#])" + key + "=([^&#\\s]+)", "i"));
	if (!match) {
		return "";
	}
	try {
		return decodeURIComponent(match[1]).trim();
	} catch {
		return match[1].trim();
	}
}

function hasEnabledQueryFlag(value: string, key: string): boolean {
	const raw = extractQueryValue(value, key);
	if (raw) {
		return !/^(?:0|false|off|no)$/i.test(raw);
	}
	return new RegExp("(?:^|[?&#])" + key + "(?:[&#]|$)", "i").test(value);
}

function positiveInteger(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function emptyToUndefined(value: unknown): CustomCommandSettings["value"] | undefined {
	if (typeof value !== "string") {
		return value as CustomCommandSettings["value"];
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
			return JSON.parse(trimmed) as CustomCommandSettings["value"];
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}
