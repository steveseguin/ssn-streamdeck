import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendCommand: vi.fn(async () => undefined),
	showAlert: vi.fn(async () => undefined)
}));

vi.mock("../services.js", () => ({
	sessionStore: {
		getConnectionState: () => "connected"
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
		mocks.sendCommand.mockClear();
		mocks.showAlert.mockClear();
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

	it("keeps ordinary unpressed rotation at the normal step", async () => {
		const timer = new TimerDialAction();
		const action = fakeDial();

		await timer.onDialRotate({ action, payload: { ticks: 1, pressed: false, settings: { stepSeconds: 10 } } } as never);

		expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
		expect(mocks.sendCommand).toHaveBeenCalledWith({ action: "timeradd", value: 10 });
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
