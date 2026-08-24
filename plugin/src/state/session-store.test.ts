import { describe, expect, it } from "vitest";
import { SessionStore } from "./session-store.js";

describe("SessionStore", () => {
	it("tracks new chat after the 50-message buffer reaches capacity", () => {
		const store = new SessionStore();
		for (let index = 0; index < 51; index += 1) store.addChatMessage({ id: index });

		expect(store.getChatMessages()).toHaveLength(50);
		expect(store.getChatRevision()).toBe(51);
		expect(store.getChatMessages()[0]).toEqual({ id: 50 });
	});
});
