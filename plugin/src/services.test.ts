import { describe, expect, it, vi } from "vitest";
import type { GlobalSettings } from "./api/types.js";

const mocks = vi.hoisted(() => ({
	settingsChanged: null as null | ((ev: { settings: GlobalSettings }) => void),
	configure: vi.fn(),
	logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
}));

vi.mock("@elgato/streamdeck", () => ({ default: {
	logger: { createScope: () => mocks.logger },
	settings: {
		getGlobalSettings: async () => ({ sessionId: "session-a" }),
		onDidReceiveGlobalSettings: (listener: typeof mocks.settingsChanged) => { mocks.settingsChanged = listener; }
	},
	ui: { onSendToPlugin: vi.fn(), sendToPropertyInspector: vi.fn() },
	system: { onSystemDidWakeUp: vi.fn() }
} }));
vi.mock("./api/ssn-client.js", () => ({ SsnClient: class {
	onState() {} onMessage() {} onCapabilities() {}
	configure = mocks.configure;
} }));
vi.mock("./api/chat-feed-client.js", () => ({ ChatFeedClient: class {
	onMessage() {} onError() {} configure() {}
} }));

import { initializeServices, sessionStore } from "./services.js";

describe("session changes", () => {
	it("keeps chat through reconnects and settings edits, but clears it before connecting another session", async () => {
		await initializeServices();
		const chat = { mid: "old-chat", chatname: "Viewer", chatmessage: "Old session" };
		sessionStore.addChatMessage(chat);
		sessionStore.setLastMessage(chat);
		sessionStore.setConnectionState("disconnected");
		sessionStore.setConnectionState("connected");
		mocks.settingsChanged?.({ settings: { sessionId: "session-a", transport: "websocket" } });
		expect(sessionStore.getChatMessages()).toEqual([chat]);

		mocks.configure.mockImplementationOnce(() => {
			expect(sessionStore.getChatMessages()).toEqual([]);
			expect(sessionStore.getLastMessage()).toBeNull();
		});
		mocks.settingsChanged?.({ settings: { sessionId: "session-b" } });
		expect(sessionStore.getChatMessages()).toEqual([]);
		expect(sessionStore.getChatRevision()).toBe(0);

		sessionStore.addChatMessage({ chatmessage: "New session" });
		mocks.settingsChanged?.({ settings: { sessionId: "" } });
		expect(sessionStore.getChatMessages()).toEqual([]);
	});
});
