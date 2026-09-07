import { describe, expect, it } from "vitest";
import { SessionStore } from "./session-store.js";

describe("SessionStore", () => {
	it("changes the session revision only when the session identity changes", () => {
		const store = new SessionStore();
		store.setSessionId("session-a");
		const revision = store.getSessionRevision();
		store.setConnectionState("disconnected");
		store.setConnectionState("connected");
		store.setSessionId("session-a");
		expect(store.getSessionRevision()).toBe(revision);
		store.setSessionId("session-b");
		expect(store.getSessionRevision()).toBe(revision + 1);
	});
	it("tracks new chat after the 50-message buffer reaches capacity", () => {
		const store = new SessionStore();
		for (let index = 0; index < 51; index += 1) store.addChatMessage({ id: index, chatmessage: "Hello" });

		expect(store.getChatMessages()).toHaveLength(50);
		expect(store.getChatRevision()).toBe(51);
		expect(store.getChatMessages()[0]).toEqual({ id: 50, chatmessage: "Hello" });
	});

	it("does not let control traffic advance chat selection or evict chat", () => {
		const store = new SessionStore();
		const chat = { mid: "chat", chatname: "Viewer", chatmessage: "Hello" };
		store.addChatMessage(chat);
		for (let i = 0; i < 60; i += 1) {
			store.addChatMessage({ callback: { get: "timer", result: { ok: true } } });
			store.addChatMessage({ event: "viewer_updates", meta: { youtube: 1 } });
		}
		expect(store.getChatMessages()).toEqual([chat]);
		expect(store.getChatRevision()).toBe(1);
	});

	it("keeps wrapped chat, images, and named support messages", () => {
		const store = new SessionStore();
		const messages = [
			{ dataReceived: { overlayNinja: { chatmessage: "Hello" } } },
			{ data: { chatname: "Viewer", contentimg: "https://example.test/image.png" } },
			{ contentimg: "https://example.test/image.png" },
			{ chatname: "Supporter", membership: "Member" }
		];
		for (const message of messages) store.addChatMessage(message);
		expect(store.getChatMessages()).toEqual([...messages].reverse());
	});
});
