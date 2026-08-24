import { describe, expect, it, vi } from "vitest";

vi.mock("../services.js", () => ({
	sessionStore: {
		getConnectionState: () => "connected",
		subscribe: () => () => undefined
	}
}));

import { ConnectionStatusAction } from "./connection-status.js";

describe("ConnectionStatusAction", () => {
	it("updates its key title as soon as settings are received", async () => {
		const connection = new ConnectionStatusAction();
		const action = {
			id: "connection-key",
			isKey: () => true,
			setState: vi.fn(async () => undefined),
			setTitle: vi.fn(async () => undefined)
		};

		await connection.onDidReceiveSettings({ action, payload: { settings: { title: "Studio Link" } } } as never);

		expect(action.setTitle).toHaveBeenLastCalledWith("Studio Link");
	});
});
