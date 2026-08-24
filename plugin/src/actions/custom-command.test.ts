import { describe, expect, it, vi } from "vitest";

vi.mock("../services.js", () => ({
	recordPluginError: vi.fn(),
	ssnClient: { sendCommand: vi.fn(async () => undefined) }
}));

import { CustomCommandAction } from "./custom-command.js";

describe("CustomCommandAction", () => {
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
