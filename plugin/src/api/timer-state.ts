export type TimerState = {
	mode: "countup" | "countdown";
	label: string;
	durationMs: number;
	displayMs: number;
	running: boolean;
	done: boolean;
	overtime: boolean;
	receivedAt: number;
};

export function parseTimerState(value: unknown): TimerState | null {
	const payload = unwrapPayload(value);
	const unwrapped = isRecord(payload) && isRecord(payload.timer) ? payload.timer : payload;
	if (!isRecord(unwrapped) || ![unwrapped.displayMs, unwrapped.currentMs].some(value => typeof value === "number" && Number.isFinite(value))) return null;
	return {
		mode: unwrapped.mode === "countup" ? "countup" : "countdown",
		label: typeof unwrapped.label === "string" ? unwrapped.label : "",
		durationMs: finiteNumber(unwrapped.durationMs),
		displayMs: finiteNumber(unwrapped.displayMs, finiteNumber(unwrapped.currentMs)),
		running: unwrapped.running === true,
		done: unwrapped.done === true,
		overtime: unwrapped.overtime === true,
		receivedAt: Date.now()
	};
}

function unwrapPayload(value: unknown): unknown {
	if (isRecord(value) && value.ok === true && "payload" in value) return value.payload;
	return value;
}

export function liveDisplayMs(state: TimerState): number {
	if (!state.running) return state.displayMs;
	const elapsed = Date.now() - state.receivedAt;
	return state.mode === "countup" ? state.displayMs + elapsed : state.displayMs - elapsed;
}

export function formatDuration(milliseconds: number): string {
	const negative = milliseconds < 0;
	const seconds = Math.floor(Math.abs(milliseconds) / 1000);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remaining = seconds % 60;
	const value = hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
		: `${minutes}:${String(remaining).padStart(2, "0")}`;
	return negative ? `-${value}` : value;
}

function finiteNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

