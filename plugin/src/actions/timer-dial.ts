import {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent
} from "@elgato/streamdeck";
import { isCommandSupported } from "../api/command-registry.js";
import { normalizeTimerDialSettings } from "../api/settings.js";
import type { TimerDialSettings } from "../api/types.js";
import { sessionStore, ssnClient } from "../services.js";

type TimerState = {
	mode: "countup" | "countdown";
	label: string;
	durationMs: number;
	displayMs: number;
	running: boolean;
	done: boolean;
	overtime: boolean;
	receivedAt: number;
};

@action({ UUID: "ninja.socialstream.streamdeck.timer-dial" })
export class TimerDialAction extends SingletonAction<TimerDialSettings> {
	private state: TimerState | null = null;
	private refreshing = false;
	private ticks = 0;

	constructor() {
		super();
		const timer = setInterval(() => {
			this.ticks += 1;
			if (this.ticks % 5 === 0) void this.refreshState();
			else void this.renderVisible();
		}, 1000);
		timer.unref();
	}

	override async onWillAppear(ev: WillAppearEvent<TimerDialSettings>): Promise<void> {
		if (!ev.action.isDial()) return;
		await this.render(ev.action, ev.payload.settings);
		await this.refreshState();
	}

	override async onDialRotate(ev: DialRotateEvent<TimerDialSettings>): Promise<void> {
		if (!ev.payload.ticks) return;
		const settings = normalizeTimerDialSettings(ev.payload.settings);
		const seconds = Math.abs(ev.payload.ticks) * (settings.stepSeconds || 10) * (ev.payload.pressed ? 6 : 1);
		await this.run(ev.action, ev.payload.ticks > 0 ? "timeradd" : "timersubtract", seconds);
	}

	override async onDialDown(ev: DialDownEvent<TimerDialSettings>): Promise<void> {
		await this.run(ev.action, "toggletimer");
	}

	override async onTouchTap(ev: TouchTapEvent<TimerDialSettings>): Promise<void> {
		if (ev.payload.hold) await this.run(ev.action, "resettimer");
		else await this.refreshState();
	}

	private async run(actionContext: DialAction<TimerDialSettings>, actionName: string, value?: number): Promise<void> {
		try {
			if (sessionStore.getConnectionState() !== "connected") throw new Error("Social Stream is not connected");
			if (!isCommandSupported(actionName, ssnClient.getCapabilities())) throw new Error("Timer control unavailable");
			await ssnClient.sendCommand(typeof value === "number" ? { action: actionName, value } : { action: actionName });
			await this.refreshState();
		} catch {
			await actionContext.showAlert();
		}
	}

	private async refreshState(): Promise<void> {
		if (this.refreshing || !this.hasVisibleDial()) return;
		if (!isCommandSupported("gettimerstate", ssnClient.getCapabilities())) {
			this.state = null;
			await this.renderVisible();
			return;
		}
		this.refreshing = true;
		try {
			const result = await ssnClient.sendCommand({ action: "gettimerstate" }, { awaitResponse: true });
			this.state = parseTimerState(result);
		} catch {
			// Keep the last good timer state during temporary transport failures.
		} finally {
			this.refreshing = false;
		}
		await this.renderVisible();
	}

	private hasVisibleDial(): boolean {
		for (const visible of this.actions) if (visible.isDial()) return true;
		return false;
	}

	private async renderVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (!visible.isDial()) continue;
			await this.render(visible, await visible.getSettings<TimerDialSettings>());
		}
	}

	private async render(actionContext: DialAction<TimerDialSettings>, rawSettings?: TimerDialSettings): Promise<void> {
		const settings = normalizeTimerDialSettings(rawSettings);
		const connection = sessionStore.getConnectionState();
		const supported = isCommandSupported("gettimerstate", ssnClient.getCapabilities());
		const state = this.state;
		const displayMs = state ? liveDisplayMs(state) : 0;
		const progress = state && state.durationMs > 0 ? clamp((displayMs / state.durationMs) * 100, 0, 100) : 0;
		await actionContext.setFeedback({
			title: settings.title || "Stream Timer",
			status: timerStatus(connection, supported, state),
			value: connection === "missing-session" ? "SETUP" : state ? formatDuration(displayMs) : "--:--",
			progress,
			hint: connection === "missing-session"
				? "Add Setup to a key and enter your session ID"
				: `TURN ±${settings.stepSeconds || 10}s  PRESS start/pause  HOLD reset`
		});
	}
}

function timerStatus(connection: string, supported: boolean, state: TimerState | null): string {
	if (connection === "missing-session") return "SETUP REQUIRED";
	if (connection === "connecting") return "CONNECTING";
	if (connection !== "connected") return "OFFLINE";
	if (!supported) return "UNAVAILABLE";
	if (!state) return "LOADING";
	return state.done ? "DONE" : state.running ? "RUNNING" : "PAUSED";
}

function parseTimerState(value: unknown): TimerState | null {
	const unwrapped = unwrapPayload(value);
	if (!isRecord(unwrapped)) return null;
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

function liveDisplayMs(state: TimerState): number {
	if (!state.running) return state.displayMs;
	const elapsed = Date.now() - state.receivedAt;
	return state.mode === "countup" ? state.displayMs + elapsed : state.displayMs - elapsed;
}

function formatDuration(milliseconds: number): string {
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

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
