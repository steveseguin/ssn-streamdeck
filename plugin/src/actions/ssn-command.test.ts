import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendCommand: vi.fn(async () => undefined),
	recordPluginError: vi.fn()
}));

vi.mock("../services.js", () => ({
	recordPluginError: mocks.recordPluginError,
	ssnClient: {
		getCapabilities: () => ({
			type: "capabilities",
			version: 2,
			ssn: { actions: { creditsReset: true } }
		}),
		sendCommand: mocks.sendCommand
	}
}));

import { SsnCommandAction } from "./ssn-command.js";

describe("SsnCommandAction reset confirmation", () => {
	beforeEach(() => {
		mocks.sendCommand.mockClear();
		mocks.recordPluginError.mockClear();
	});

	it("requires a second press before resetting collected credits", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();
		const event = keyDownEvent(action, false);

		await command.onKeyDown(event);
		expect(mocks.sendCommand).not.toHaveBeenCalled();
		expect(action.setTitle).toHaveBeenLastCalledWith("Press\nAgain");

		await command.onKeyDown(event);
		expect(mocks.sendCommand).toHaveBeenCalledWith(
			{ action: "creditsReset" },
			{ awaitResponse: true }
		);
		expect(action.showOk).toHaveBeenCalled();
	});

	it("does not block an intentional multi-action workflow", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();

		await command.onKeyDown(keyDownEvent(action, true));

		expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
	});

	it("updates its key title as soon as settings are received", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();

		await command.onDidReceiveSettings({ action, payload: { settings: { command: "creditsReset", title: "Safe Reset" } } } as never);

		expect(action.setTitle).toHaveBeenLastCalledWith("Safe Reset");
	});

	it("shows the preset-specific key icon when the key appears", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();

		await command.onWillAppear({ action, payload: { settings: { command: "starttimer" } } } as never);

		expect(action.setImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
	});
});

function fakeKey() {
	return {
		id: "credits-reset-key",
		isKey: () => true,
		setImage: vi.fn(async () => undefined),
		setTitle: vi.fn(async () => undefined),
		showOk: vi.fn(async () => undefined),
		showAlert: vi.fn(async () => undefined)
	};
}

function keyDownEvent(action: ReturnType<typeof fakeKey>, isInMultiAction: boolean) {
	return {
		action,
		payload: {
			isInMultiAction,
			settings: { command: "creditsReset" }
		}
	} as never;
}
