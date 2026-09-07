import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendCommand: vi.fn<() => Promise<unknown>>(async () => undefined),
	sessionRevision: 0,
	listener: null as null | (() => void),
	showAlert: vi.fn(async () => undefined)
}));

vi.mock("../i18n.js", () => ({
	translate: (key: string, fallback: string) => key === "deviceTimerTitle" ? "Minuteur" : fallback
}));

vi.mock("../services.js", () => ({
	sessionStore: {
		getConnectionState: () => "connected",
		getSessionRevision: () => mocks.sessionRevision,
		subscribe: (listener: () => void) => { mocks.listener = listener; }
	},
	ssnClient: {
		getCapabilities: () => ({
			type: "capabilities",
			version: 1,
			ssn: {
				actions: {
					timeradd: true,
					timersubtract: true,
					toggletimer: true,
					resettimer: true,
					gettimerstate: true
				}
			}
		}),
		sendCommand: mocks.sendCommand
	}
}));

import { TimerDialAction } from "./timer-dial.js";

describe("TimerDialAction", () => {
	beforeEach(() => {
		mocks.sendCommand.mockReset();
		mocks.sessionRevision = 0;
		mocks.showAlert.mockClear();
	});

	it("reads the current versioned timer response", async () => {
		mocks.sendCommand.mockResolvedValue({ ok: true, payload: { action: "gettimerstate", timer: { mode: "countdown", displayMs: 600000, durationMs: 600000, running: false } } });
		const timer = new TimerDialAction();
		const action = fakeDial();
		Object.defineProperty(timer, "actions", { value: [action] });
		await timer.onWillAppear({ action, payload: { settings: {} } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ value: "10:00", status: "PAUSED" }));
	});

	it("refreshes after a dial adjustment even when an older timer query is still pending", async () => {
		let finishOld: (value: unknown) => void = () => undefined;
		mocks.sendCommand.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
		const timer = new TimerDialAction();
		const action = fakeDial();
		Object.defineProperty(timer, "actions", { value: [action] });
		const appearing = timer.onWillAppear({ action, payload: { settings: {} } } as never);
		await vi.waitFor(() => expect(mocks.sendCommand).toHaveBeenCalledWith({ action: "gettimerstate" }, { awaitResponse: true }));
		mocks.sendCommand.mockResolvedValueOnce(undefined);
		mocks.sendCommand.mockResolvedValueOnce({ displayMs: 70000, running: false });
		await timer.onDialRotate({ action, payload: { ticks: 1, pressed: false, settings: { stepSeconds: 10 } } } as never);
		finishOld({ displayMs: 60000, running: false });
		await appearing;
		expect(mocks.sendCommand).toHaveBeenCalledTimes(3);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ value: "1:10" }));
	});

	it("clears the old session timer even when the new timer cannot be loaded", async () => {
		mocks.sendCommand.mockResolvedValue({ displayMs: 600000, running: false });
		const timer = new TimerDialAction();
		const action = fakeDial();
		Object.defineProperty(timer, "actions", { value: [action] });
		await timer.onWillAppear({ action, payload: { settings: {} } } as never);
		mocks.sendCommand.mockRejectedValue(new Error("No response"));
		await timer.onTouchTap({ action, payload: { hold: false } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ value: "10:00" }));
		mocks.sessionRevision++;
		mocks.listener?.();
		await timer.onTouchTap({ action, payload: { hold: false } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ value: "--:--" }));
	});

	it("ignores a timer response that arrives after switching sessions", async () => {
		let resolveOld: (value: unknown) => void = () => undefined;
		mocks.sendCommand.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
		const timer = new TimerDialAction();
		const action = fakeDial();
		Object.defineProperty(timer, "actions", { value: [action] });
		const appearing = timer.onWillAppear({ action, payload: { settings: {} } } as never);
		await Promise.resolve();
		await Promise.resolve();
		mocks.sessionRevision++;
		mocks.listener?.();
		resolveOld({ displayMs: 600000, running: true });
		await appearing;
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ value: "--:--" }));
	});

	it("toggles only after a press is released", async () => {
		const timer = new TimerDialAction();
		const action = fakeDial();

		timer.onDialDown({ action, payload: { settings: {} } } as never);
		expect(mocks.sendCommand).not.toHaveBeenCalled();

		await timer.onDialUp({ action, payload: { settings: {} } } as never);
		expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
		expect(mocks.sendCommand).toHaveBeenCalledWith({ action: "toggletimer" });
	});

	it("uses the accelerated step without toggling or applying a trailing normal step", async () => {
		const timer = new TimerDialAction();
		const action = fakeDial();
		const settings = { stepSeconds: 10 };

		timer.onDialDown({ action, payload: { settings } } as never);
		await timer.onDialRotate({ action, payload: { ticks: -1, pressed: true, settings } } as never);
		await timer.onDialUp({ action, payload: { settings } } as never);
		await timer.onDialRotate({ action, payload: { ticks: -1, pressed: false, settings } } as never);

		expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
		expect(mocks.sendCommand).toHaveBeenCalledWith({ action: "timersubtract", value: 60 });
	});

	it("suppresses all trailing rotation events for the existing 200 ms window", async () => {
		vi.useFakeTimers();
		try {
			const timer = new TimerDialAction();
			const action = fakeDial();
			const settings = { stepSeconds: 10 };
			timer.onDialDown({ action, payload: { settings } } as never);
			await timer.onDialRotate({ action, payload: { ticks: 1, pressed: true, settings } } as never);
			await timer.onDialUp({ action, payload: { settings } } as never);
			for (let i = 0; i < 3; i++) await timer.onDialRotate({ action, payload: { ticks: 1, pressed: false, settings } } as never);
			expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(201);
			await timer.onDialRotate({ action, payload: { ticks: 1, pressed: false, settings } } as never);
			expect(mocks.sendCommand).toHaveBeenLastCalledWith({ action: "timeradd", value: 10 });
			expect(mocks.sendCommand).toHaveBeenCalledTimes(2);
		} finally { vi.useRealTimers(); }
	});

	it("uses the localized default title without replacing custom titles", async () => {
		const timer = new TimerDialAction();
		const action = fakeDial();
		await timer.onDidReceiveSettings({ action, payload: { settings: {} } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Minuteur" }));
		await timer.onDidReceiveSettings({ action, payload: { settings: { title: "My Clock" } } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ title: "My Clock" }));
	});

	it("updates the done status when the locally displayed countdown reaches zero", async () => {
		vi.useFakeTimers();
		try {
			mocks.sendCommand.mockResolvedValue({ mode: "countdown", displayMs: 1000, durationMs: 60000, running: true, done: false });
			const timer = new TimerDialAction();
			const action = fakeDial();
			Object.defineProperty(timer, "actions", { value: [action] });
			await timer.onWillAppear({ action, payload: { settings: {} } } as never);
			vi.setSystemTime(Date.now() + 1000);
			await timer.onDidReceiveSettings({ action, payload: { settings: {} } } as never);
			expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ value: "0:00", status: "DONE" }));
		} finally { vi.useRealTimers(); }
	});

	it("keeps ordinary unpressed rotation at the normal step", async () => {
		const timer = new TimerDialAction();
		const action = fakeDial();

		await timer.onDialRotate({ action, payload: { ticks: 1, pressed: false, settings: { stepSeconds: 10 } } } as never);

		expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
		expect(mocks.sendCommand).toHaveBeenCalledWith({ action: "timeradd", value: 10 });
	});

	it("confirms a timer reset after a held touch", async () => {
		const timer = new TimerDialAction();
		const action = fakeDial();

		await timer.onTouchTap({ action, payload: { hold: true, settings: {} } } as never);

		expect(mocks.sendCommand).toHaveBeenCalledWith({ action: "resettimer", value: { confirm: true } });
	});

	it("updates its dial title as soon as settings are received", async () => {
		const timer = new TimerDialAction();
		const action = fakeDial();

		await timer.onDidReceiveSettings({ action, payload: { settings: { title: "Show Clock", stepSeconds: 5 } } } as never);

		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Show Clock" }));
	});
});

function fakeDial() {
	return {
		id: "timer-context",
		isDial: () => true,
		getSettings: vi.fn(async () => ({ stepSeconds: 10 })),
		setFeedback: vi.fn(async () => undefined),
		showAlert: mocks.showAlert
	};
}
