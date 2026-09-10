import {
	action,
	type DidReceiveSettingsEvent,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DialUpEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import { parseTimerState, liveDisplayMs, formatDuration, type TimerState } from "../api/timer-state.js";
import { isCommandSupported } from "../api/command-registry.js";
import { normalizeTimerDialSettings } from "../api/settings.js";
import type { TimerDialSettings } from "../api/types.js";
import { translate } from "../i18n.js";
import { recordPluginError, sessionStore, ssnClient } from "../services.js";

const TRAILING_ROTATION_SUPPRESSION_MS = 200;

@action({ UUID: "ninja.socialstream.streamdeck.timer-dial" })
export class TimerDialAction extends SingletonAction<TimerDialSettings> {
	private state: TimerState | null = null;
	private refreshing = false;
	private refreshPending = false;
	private sessionRevision = sessionStore.getSessionRevision();
	private ticks = 0;
	private readonly settings = new Map<string, TimerDialSettings>();
	private readonly dialPresses = new Map<string, { rotated: boolean }>();
	private readonly suppressUnpressedRotationUntil = new Map<string, number>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			const revision = sessionStore.getSessionRevision();
			if (revision === this.sessionRevision) return;
			this.sessionRevision = revision;
			this.state = null;
			this.refreshing = false;
			this.refreshPending = false;
			void this.renderVisible();
		});
		const timer = setInterval(() => {
			this.ticks += 1;
			if (this.ticks % 5 === 0) void this.refreshState();
			else void this.renderVisible();
		}, 1000);
		timer.unref();
	}

	override async onWillAppear(ev: WillAppearEvent<TimerDialSettings>): Promise<void> {
		if (!ev.action.isDial()) return;
		this.settings.set(ev.action.id, ev.payload.settings);
		await this.render(ev.action, ev.payload.settings);
		await this.refreshState();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TimerDialSettings>): Promise<void> {
		if (!ev.action.isDial()) return;
		this.settings.set(ev.action.id, ev.payload.settings);
		await this.render(ev.action, ev.payload.settings);
	}

	override async onDialRotate(ev: DialRotateEvent<TimerDialSettings>): Promise<void> {
		if (!ev.payload.ticks) return;
		const press = this.dialPresses.get(ev.action.id);
		if (ev.payload.pressed) {
			if (press) press.rotated = true;
			else this.dialPresses.set(ev.action.id, { rotated: true });
		} else {
			if (press?.rotated) return;
			const suppressUntil = this.suppressUnpressedRotationUntil.get(ev.action.id) || 0;
			if (Date.now() <= suppressUntil) return;
			this.suppressUnpressedRotationUntil.delete(ev.action.id);
		}
		const settings = normalizeTimerDialSettings(ev.payload.settings);
		const seconds = Math.abs(ev.payload.ticks) * (settings.stepSeconds || 10) * (ev.payload.pressed ? 6 : 1);
		await this.run(ev.action, ev.payload.ticks > 0 ? "timeradd" : "timersubtract", seconds);
	}

	override onDialDown(ev: DialDownEvent<TimerDialSettings>): void {
		this.dialPresses.set(ev.action.id, { rotated: false });
		this.suppressUnpressedRotationUntil.delete(ev.action.id);
	}

	override async onDialUp(ev: DialUpEvent<TimerDialSettings>): Promise<void> {
		const press = this.dialPresses.get(ev.action.id);
		this.dialPresses.delete(ev.action.id);
		if (press?.rotated) {
			this.suppressUnpressedRotationUntil.set(ev.action.id, Date.now() + TRAILING_ROTATION_SUPPRESSION_MS);
			return;
		}
		await this.run(ev.action, "toggletimer");
	}

	override async onTouchTap(ev: TouchTapEvent<TimerDialSettings>): Promise<void> {
		if (ev.payload.hold) await this.run(ev.action, "resettimer");
		else await this.refreshState();
	}

	override onWillDisappear(ev: WillDisappearEvent<TimerDialSettings>): void {
		this.dialPresses.delete(ev.action.id);
		this.suppressUnpressedRotationUntil.delete(ev.action.id);
		this.settings.delete(ev.action.id);
	}

	private async run(actionContext: DialAction<TimerDialSettings>, actionName: string, value?: number): Promise<void> {
		try {
			if (sessionStore.getConnectionState() !== "connected") throw new Error("Social Stream is not connected");
			if (!isCommandSupported(actionName, ssnClient.getCapabilities())) throw new Error("Timer control unavailable");
			const payload = typeof value === "number"
				? { action: actionName, value }
				: actionName === "resettimer"
					? { action: actionName, value: { confirm: true } }
					: { action: actionName };
			await ssnClient.sendCommand(payload);
			await this.refreshState();
		} catch (error) {
			recordPluginError(`timer-dial.${actionName}`, error);
			await actionContext.showAlert();
		}
	}

	private async refreshState(): Promise<void> {
		if (!this.hasVisibleDial()) return;
		if (this.refreshing) {
			this.refreshPending = true;
			return;
		}
		this.refreshPending = false;
		if (!isCommandSupported("gettimerstate", ssnClient.getCapabilities())) {
			this.state = null;
			await this.renderVisible();
			return;
		}
		this.refreshing = true;
		const revision = this.sessionRevision;
		try {
			const result = await ssnClient.sendCommand({ action: "gettimerstate" }, { awaitResponse: true });
			if (revision === this.sessionRevision) this.state = parseTimerState(result);
		} catch {
			// Keep the last good timer state during temporary transport failures.
		} finally {
			if (revision === this.sessionRevision) this.refreshing = false;
		}
		await this.renderVisible();
		if (revision === this.sessionRevision && this.refreshPending) await this.refreshState();
	}

	private hasVisibleDial(): boolean {
		for (const visible of this.actions) if (visible.isDial()) return true;
		return false;
	}

	private async renderVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (!visible.isDial()) continue;
			await this.render(visible, this.settings.get(visible.id));
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
			title: settings.title || translate("deviceTimerTitle", "Stream Timer"),
			status: timerStatus(connection, supported, state, displayMs),
			value: connection === "missing-session" ? translate("deviceTimerSetupValue", "SETUP") : state ? formatDuration(displayMs) : "--:--",
			progress,
			hint: connection === "missing-session"
				? translate("deviceTimerSetupHint", "Add Setup key + session ID")
				: translate("deviceTimerHint", "TURN ±{seconds}s · PUSH ▶/Ⅱ", { seconds: settings.stepSeconds || 10 }),
			gestureHint: translate("deviceTimerGestureHint", "PUSH+TURN ×6 · HOLD SCREEN ↺")
		});
	}
}

function timerStatus(connection: string, supported: boolean, state: TimerState | null, displayMs: number): string {
	if (connection === "missing-session") return translate("deviceTimerSetupRequired", "SETUP NEEDED");
	if (connection === "connecting") return translate("deviceTimerConnecting", "CONNECTING");
	if (connection !== "connected") return translate("deviceTimerOffline", "OFFLINE");
	if (!supported) return translate("deviceTimerUnavailable", "UNAVAILABLE");
	if (!state) return translate("deviceTimerLoading", "LOADING");
	const reachedTarget = state.running && (state.mode === "countdown"
		? displayMs <= 0
		: state.durationMs > 0 && displayMs >= state.durationMs);
	return state.done || reachedTarget
		? translate("deviceTimerDone", "DONE")
		: state.running
			? translate("deviceTimerRunning", "RUNNING")
			: translate("deviceTimerPaused", "PAUSED");
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
