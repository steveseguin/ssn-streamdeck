import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services.js", async () => {
	const { SessionStore } = await import("../state/session-store.js");
	return {
		sessionStore: new SessionStore(),
		chatFeedClient: { setActive: vi.fn() },
		ssnClient: { sendCommand: vi.fn(async () => undefined) },
		recordPluginError: vi.fn()
	};
});

import { sessionStore, ssnClient } from "../services.js";
import { ChatFeedAction } from "./chat-feed.js";

describe("Chat Review session history", () => {
	afterEach(() => vi.useRealTimers());

	it("uses numeric message ID zero for pinning and unpinning", async () => {
		sessionStore.setSessionId("zero-id");
		sessionStore.addChatMessage({ mid: 0, id: "platform-id", chatmessage: "First message" });
		const chat = new ChatFeedAction();
		const action = { id: "zero", isDial: () => true, setFeedback: vi.fn(async () => undefined), showAlert: vi.fn(async () => undefined) };
		await chat.onWillAppear({ action, payload: { settings: {} } } as never);
		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(ssnClient.sendCommand).toHaveBeenLastCalledWith({ action: "pin", value: "0" });
		await chat.onTouchTap({ action, payload: { settings: {}, hold: true } } as never);
		expect(ssnClient.sendCommand).toHaveBeenLastCalledWith({ action: "unpin", value: "0" });
		chat.onWillDisappear({ action } as never);
	});

	it("pins and unpins the displayed message until the next screen update", async () => {
		vi.useFakeTimers();
		sessionStore.setSessionId("screen-selection");
		sessionStore.setConnectionState("connected");
		sessionStore.addChatMessage({ mid: "first", chatmessage: "First" });
		const chat = new ChatFeedAction();
		const action = { id: "screen", isDial: () => true, setFeedback: vi.fn(async () => undefined), showAlert: vi.fn(async () => undefined) };
		Object.defineProperty(chat, "actions", { value: [action] });
		await chat.onWillAppear({ action, payload: { settings: {} } } as never);
		sessionStore.addChatMessage({ mid: "second", chatmessage: "Second" });
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ message: "First" }));
		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(ssnClient.sendCommand).toHaveBeenLastCalledWith({ action: "pin", value: "first" });
		await chat.onTouchTap({ action, payload: { hold: true, settings: {} } } as never);
		expect(ssnClient.sendCommand).toHaveBeenLastCalledWith({ action: "unpin", value: "first" });
		await vi.advanceTimersByTimeAsync(100);
		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(ssnClient.sendCommand).toHaveBeenLastCalledWith({ action: "pin", value: "second" });
		sessionStore.setSessionId("another-session");
		vi.mocked(ssnClient.sendCommand).mockClear();
		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(ssnClient.sendCommand).not.toHaveBeenCalled();
		chat.onWillDisappear({ action, payload: { settings: {} } } as never);
	});

	it("preserves literal chat and names while still converting HTML messages", async () => {
		sessionStore.setSessionId("text-display");
		const action = { id: "text", isDial: () => true, setFeedback: vi.fn(async () => undefined), showAlert: vi.fn(async () => undefined) };
		const chat = new ChatFeedAction();
		sessionStore.addChatMessage({ chatname: "<Viewer>", chatmessage: "Use <name> &amp; here", textonly: true });
		await chat.onWillAppear({ action, payload: { settings: {} } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ name: "<Viewer>", message: "Use <name> &amp; here" }));
		sessionStore.addChatMessage({ chatmessage: '<b>Hello</b> &amp; <img alt="Wave" src="x">', textonly: false });
		await chat.onDidReceiveSettings({ action, payload: { settings: {} } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Hello & Wave" }));
		chat.onWillDisappear({ action, payload: { settings: {} } } as never);
	});

	it("pins the same browsed chat after callbacks and clears the visible selection on a session change", async () => {
		vi.useFakeTimers();
		sessionStore.setSessionId("session-a");
		sessionStore.setConnectionState("connected");
		for (let index = 0; index < 3; index += 1) {
			sessionStore.addChatMessage({ mid: `chat-${index}`, chatname: `Viewer ${index}`, chatmessage: "Hello" });
		}
		const chat = new ChatFeedAction();
		const action = { id: "review", isDial: () => true, setFeedback: vi.fn(async () => undefined), showAlert: vi.fn(async () => undefined) };
		Object.defineProperty(chat, "actions", { value: [action] });
		await chat.onWillAppear({ action, payload: { settings: {} } } as never);
		await chat.onDialRotate({ action, payload: { ticks: -1, settings: {} } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Viewer 1" }));

		sessionStore.addChatMessage({ callback: { get: "timer", result: { ok: true } } });
		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(ssnClient.sendCommand).toHaveBeenLastCalledWith({ action: "pin", value: "chat-1" });

		sessionStore.setSessionId("session-b");
		await vi.advanceTimersByTimeAsync(100);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Waiting for chat" }));
		vi.mocked(ssnClient.sendCommand).mockClear();
		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(ssnClient.sendCommand).not.toHaveBeenCalled();
		expect(action.showAlert).toHaveBeenCalledOnce();
		chat.onWillDisappear({ action, payload: { settings: {} } } as never);
	});
});
