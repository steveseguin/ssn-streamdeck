import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	connectionState: "connected",
	messages: [] as unknown[],
	chatRevision: 0,
	listener: null as null | (() => void),
	sendCommand: vi.fn(async () => undefined),
	setActive: vi.fn()
}));

vi.mock("../services.js", () => ({
	chatFeedClient: {
		setActive: mocks.setActive
	},
	sessionStore: {
		getConnectionState: () => mocks.connectionState,
		getChatMessages: () => mocks.messages,
		getChatRevision: () => mocks.chatRevision,
		subscribe: (listener: () => void) => {
			mocks.listener = listener;
			return () => undefined;
		}
	},
	ssnClient: {
		sendCommand: mocks.sendCommand
	}
}));

import { ChatFeedAction } from "./chat-feed.js";

describe("ChatFeedAction", () => {
	beforeEach(() => {
		mocks.connectionState = "connected";
		mocks.messages = [
			{ mid: "chat-two", chatname: "Chat Two", chatmessage: "Second", type: "twitch" },
			{ mid: "chat-one", chatname: "Chat One", chatmessage: "First", type: "youtube" }
		];
		mocks.chatRevision = 2;
		mocks.listener = null;
		mocks.sendCommand.mockClear();
		mocks.setActive.mockClear();
	});

	it("keeps the displayed message selected across API callbacks and new chat", async () => {
		const chat = new ChatFeedAction();
		const action = fakeDial();
		await chat.onWillAppear({ action, payload: { settings: {} } } as never);
		await chat.onDialRotate({ action, payload: { ticks: -1, settings: {} } } as never);
		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Chat One" }));

		mocks.listener?.();
		await chat.onTouchTap({ action, payload: { hold: true, settings: {} } } as never);
		expect(mocks.sendCommand).toHaveBeenLastCalledWith({ action: "unpin", value: "chat-one" });

		mocks.messages.unshift({ mid: "chat-three", chatname: "Chat Three", chatmessage: "Third", type: "kick" });
		mocks.chatRevision += 1;
		mocks.listener?.();
		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(mocks.sendCommand).toHaveBeenLastCalledWith({ action: "pin", value: "chat-one" });
	});

	it("maps every Chat Review gesture and releases the channel listener", async () => {
		const chat = new ChatFeedAction();
		const action = fakeDial();
		await chat.onWillAppear({ action, payload: { settings: {} } } as never);
		expect(mocks.setActive).toHaveBeenCalledWith("chat-dial", true);

		await chat.onDialDown({ action, payload: { settings: {} } } as never);
		expect(mocks.sendCommand).toHaveBeenLastCalledWith({ action: "pin", value: "chat-two" });
		await chat.onTouchTap({ action, payload: { hold: false, settings: {} } } as never);
		expect(mocks.sendCommand).toHaveBeenLastCalledWith({ action: "nextPinned" });

		chat.onWillDisappear({ action, payload: { settings: {} } } as never);
		expect(mocks.setActive).toHaveBeenCalledWith("chat-dial", false);
	});

	it("keeps a browsed message selected when the 50-message buffer rolls over", async () => {
		mocks.messages = Array.from({ length: 50 }, (_, index) => ({
			mid: `chat-${index}`,
			chatname: `Chat ${index}`,
			chatmessage: `Message ${index}`,
			type: "youtube"
		}));
		mocks.chatRevision = 50;
		const chat = new ChatFeedAction();
		const action = fakeDial();
		await chat.onWillAppear({ action, payload: { settings: {} } } as never);
		await chat.onDialRotate({ action, payload: { ticks: -1, settings: {} } } as never);

		mocks.messages.unshift({ mid: "chat-new", chatname: "New Chat", chatmessage: "Newest", type: "kick" });
		mocks.messages.length = 50;
		mocks.chatRevision += 1;
		mocks.listener?.();
		await chat.onDialDown({ action, payload: { settings: {} } } as never);

		expect(mocks.sendCommand).toHaveBeenLastCalledWith({ action: "pin", value: "chat-1" });
	});

	it("updates its dial title as soon as settings are received", async () => {
		const chat = new ChatFeedAction();
		const action = fakeDial();

		await chat.onDidReceiveSettings({ action, payload: { settings: { title: "Live Chat" } } } as never);

		expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Live Chat" }));
	});
});

function fakeDial() {
	return {
		id: "chat-dial",
		isDial: () => true,
		setFeedback: vi.fn(async () => undefined),
		showAlert: vi.fn(async () => undefined),
		getSettings: vi.fn(async () => ({}))
	};
}
