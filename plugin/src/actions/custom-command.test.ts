import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services.js", () => ({
	recordPluginError: vi.fn(),
	ssnClient: { sendCommand: vi.fn(async () => undefined) }
}));

import { CustomCommandAction } from "./custom-command.js";
import { recordPluginError, ssnClient } from "../services.js";

describe("CustomCommandAction", () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it.each(["settings", "hidden", "newer press"])("ignores a late failure after %s", async change => {
		let fail: (error: Error) => void = () => undefined;
		vi.mocked(ssnClient.sendCommand).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
		const command = new CustomCommandAction();
		const action = {
			id: "custom-key", isKey: () => true,
			setTitle: vi.fn(async () => undefined),
			showOk: vi.fn(async () => undefined),
			showAlert: vi.fn(async () => undefined)
		};
		const event = { action, payload: { settings: { action: "next", awaitResponse: true } } } as never;
		const pending = command.onKeyDown(event);
		if (change === "settings") await command.onDidReceiveSettings({ action, payload: { settings: { action: "clear", title: "Clear" } } } as never);
		if (change === "hidden") command.onWillDisappear({ action } as never);
		if (change === "newer press") await command.onKeyDown(event);
		const error = new Error("Request timed out");
		fail(error);
		await pending;
		expect(action.showAlert).not.toHaveBeenCalled();
		expect(action.showOk).toHaveBeenCalledTimes(change === "newer press" ? 1 : 0);
		expect(recordPluginError).toHaveBeenCalledWith("custom-command", error);
		expect(ssnClient.sendCommand).toHaveBeenCalledTimes(change === "newer press" ? 2 : 1);
	});

	it("still shows feedback for a current successful or failed command", async () => {
		const command = new CustomCommandAction();
		const action = { id: "custom-key", showOk: vi.fn(), showAlert: vi.fn() };
		const event = { action, payload: { settings: { action: "next" } } } as never;
		await command.onKeyDown(event);
		expect(action.showOk).toHaveBeenCalledTimes(1);
		vi.mocked(ssnClient.sendCommand).mockRejectedValueOnce(new Error("Failed"));
		await command.onKeyDown(event);
		expect(action.showAlert).toHaveBeenCalledTimes(1);
	});

	it("updates its key title as soon as settings are received", async () => {
		const command = new CustomCommandAction();
		const action = {
			id: "custom-key",
			isKey: () => true,
			setTitle: vi.fn(async () => undefined)
		};

		await command.onDidReceiveSettings({ action, payload: { settings: { title: "Run Show" } } } as never);

		expect(action.setTitle).toHaveBeenLastCalledWith("Run Show");
	});
});
