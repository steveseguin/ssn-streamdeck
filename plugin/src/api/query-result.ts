import { formatDuration, parseTimerState } from "./timer-state.js";

export type QueryResultKind = "queue" | "timer" | "polls" | "sources" | "source" | "giveaway" | "workflows";

export function summarizeQueryResult(kind: QueryResultKind | undefined, result: unknown): string | null {
	const payload = isRecord(result) && result.ok === true && "payload" in result ? result.payload : result;
    if (kind === "giveaway") {
        const state = isRecord(payload) && isRecord(payload.giveaway) ? payload.giveaway : null;
        if (!state || typeof state.count !== "number") return null;
        return `${state.open ? "OPEN" : "CLOSED"}\n${state.count}`;
    }
	if (kind === "timer") {
		const state = parseTimerState(result);
		return state ? formatDuration(state.displayMs) : null;
	}
	if (kind === "source") {
		const source = isRecord(payload) && isRecord(payload.source) ? payload.source : null;
		return source && typeof source.status === "string" && ["active", "inactive", "activating", "error"].includes(source.status)
			? source.status.toUpperCase() : null;
	}
	let count: unknown;
	if (kind === "workflows") count = isRecord(payload) && Array.isArray(payload.triggers) ? payload.triggers.length : undefined;
	if (kind === "queue") count = isRecord(payload) ? payload.queueLength : payload;
	if (kind === "polls") count = Array.isArray(payload) ? payload.length : undefined;
	if (kind === "sources") count = isRecord(payload) && Array.isArray(payload.sources) ? payload.sources.length : undefined;
	return typeof count === "number" && Number.isInteger(count) && count >= 0 ? String(count) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
