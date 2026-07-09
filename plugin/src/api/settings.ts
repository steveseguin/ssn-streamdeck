import type { CustomCommandSettings, GlobalSettings, SsnCommandSettings } from "./types.js";

export const DEFAULT_API_HOST = "io.socialstream.ninja";

export function normalizeGlobalSettings(settings: Partial<GlobalSettings> | undefined): GlobalSettings {
	return {
		sessionId: normalizeSessionId(settings?.sessionId),
		apiHost: stringOrEmpty(settings?.apiHost) || DEFAULT_API_HOST,
		useTls: settings?.useTls !== false,
		httpFallback: settings?.httpFallback !== false,
		inChannel: positiveInteger(settings?.inChannel, 2),
		outChannel: positiveInteger(settings?.outChannel, 1),
		requestTimeoutMs: positiveInteger(settings?.requestTimeoutMs, 5000)
	};
}

export function normalizeSessionId(value: unknown): string {
	const raw = stringOrEmpty(value);
	if (!raw) {
		return "";
	}
	const session = extractQueryValue(raw, "session");
	return session || raw;
}

export function normalizeSsnCommandSettings(settings: Partial<SsnCommandSettings> | undefined): SsnCommandSettings {
	return {
		command: stringOrEmpty(settings?.command) || "nextInQueue",
		target: stringOrEmpty(settings?.target),
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
