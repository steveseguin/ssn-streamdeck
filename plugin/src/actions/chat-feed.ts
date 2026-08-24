import {
	action,
	type DidReceiveSettingsEvent,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import type { ChatFeedSettings } from "../api/types.js";
import { translate } from "../i18n.js";
import { chatFeedClient, recordPluginError, sessionStore, ssnClient } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.chat-feed" })
export class ChatFeedAction extends SingletonAction<ChatFeedSettings> {
	private offsets = new Map<string, number>();
	private readonly settings = new Map<string, ChatFeedSettings>();
	private connectionState = sessionStore.getConnectionState();
	private chatCount = sessionStore.getChatMessages().length;
	private chatRevision = sessionStore.getChatRevision();
	private refreshTimer: NodeJS.Timeout | null = null;
	private refreshRunning = false;
	private refreshPending = false;
	private lastRefreshAt = 0;

	constructor() {
		super();
		sessionStore.subscribe(() => {
			const nextConnectionState = sessionStore.getConnectionState();
			const nextChatCount = sessionStore.getChatMessages().length;
			const nextChatRevision = sessionStore.getChatRevision();
			let shouldRefresh = false;
			if (nextConnectionState !== this.connectionState) {
				for (const context of this.offsets.keys()) this.offsets.set(context, 0);
				shouldRefresh = true;
			} else if (nextChatRevision > this.chatRevision) {
				const added = nextChatRevision - this.chatRevision;
				for (const [context, offset] of this.offsets) {
					if (offset > 0) this.offsets.set(context, Math.min(offset + added, nextChatCount - 1));
				}
				shouldRefresh = true;
			}
			this.connectionState = nextConnectionState;
			this.chatCount = nextChatCount;
			this.chatRevision = nextChatRevision;
			if (shouldRefresh) this.requestRefresh();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<ChatFeedSettings>): Promise<void> {
		if (!ev.action.isDial()) return;
		this.offsets.set(ev.action.id, 0);
		this.settings.set(ev.action.id, ev.payload.settings);
		chatFeedClient.setActive(ev.action.id, true);
		await this.render(ev.action, ev.payload.settings);
		this.lastRefreshAt = Date.now();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ChatFeedSettings>): Promise<void> {
		if (!ev.action.isDial()) return;
		this.settings.set(ev.action.id, ev.payload.settings);
		await this.render(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<ChatFeedSettings>): void {
		this.offsets.delete(ev.action.id);
		this.settings.delete(ev.action.id);
		chatFeedClient.setActive(ev.action.id, false);
		if (this.offsets.size === 0 && this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
			this.refreshPending = false;
		}
	}

	override async onDialRotate(ev: DialRotateEvent<ChatFeedSettings>): Promise<void> {
		const current = this.offsets.get(ev.action.id) || 0;
		const max = Math.max(0, displayableMessages().length - 1);
		this.offsets.set(ev.action.id, clamp(current - ev.payload.ticks, 0, max));
		await this.render(ev.action, ev.payload.settings);
	}

	override async onDialDown(ev: DialDownEvent<ChatFeedSettings>): Promise<void> {
		const entry = this.currentEntry(ev.action.id);
		if (!entry) {
			await ev.action.showAlert();
			return;
		}
		try {
			await ssnClient.sendCommand({ action: "pin", value: pinValue(entry) });
		} catch (error) {
			recordPluginError("chat-review.pin", error);
			await ev.action.showAlert();
		}
	}

	override async onTouchTap(ev: TouchTapEvent<ChatFeedSettings>): Promise<void> {
		try {
			if (ev.payload.hold) {
				const entry = this.currentEntry(ev.action.id);
				const id = entry ? messageId(entry) : "";
				if (!id) throw new Error("Displayed chat has no message ID");
				await ssnClient.sendCommand({ action: "unpin", value: id });
			} else {
				await ssnClient.sendCommand({ action: "nextPinned" });
			}
		} catch (error) {
			recordPluginError(ev.payload.hold ? "chat-review.unpin" : "chat-review.feature", error);
			await ev.action.showAlert();
		}
	}

	private currentEntry(contextId: string): unknown | null {
		return displayableMessages()[this.offsets.get(contextId) || 0] || null;
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (!visible.isDial()) continue;
			await this.render(visible, this.settings.get(visible.id));
		}
	}

	private requestRefresh(): void {
		if (this.offsets.size === 0) return;
		this.refreshPending = true;
		if (this.refreshTimer || this.refreshRunning) return;
		const delay = Math.max(0, 100 - (Date.now() - this.lastRefreshAt));
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			this.refreshPending = false;
			this.refreshRunning = true;
			this.lastRefreshAt = Date.now();
			void this.refreshVisible().finally(() => {
				this.refreshRunning = false;
				if (this.refreshPending) this.requestRefresh();
			});
		}, delay);
		this.refreshTimer.unref();
	}

	private async render(actionContext: DialAction<ChatFeedSettings>, settings?: ChatFeedSettings): Promise<void> {
		const entries = displayableMessages();
		const offset = clamp(this.offsets.get(actionContext.id) || 0, 0, Math.max(0, entries.length - 1));
		this.offsets.set(actionContext.id, offset);
		const entry = entries[offset];
		const chat = normalizeChat(entry);
		await actionContext.setFeedback({
			title: settings?.title || translate("deviceChatTitle", "Chat Review"),
			platform: chat ? chat.platform : translate("deviceChatChannel", "CH 4"),
			name: chat ? chat.name : translate("deviceChatWaiting", "Waiting for chat"),
			message: chat ? chat.message : translate("deviceChatEnableRelay", "Enable “Send chat messages to API server” in Social Stream Ninja."),
			hint: chat
				? translate("deviceChatHint", "{position}/{count}  TURN browse  PRESS pin", { position: offset + 1, count: entries.length })
				: translate("deviceChatBrowseHint", "TURN browse"),
			touchHint: chat
				? translate("deviceChatTouchHint", "TAP feature  HOLD unpin")
				: translate("deviceChatFeatureHint", "TAP feature")
		});
	}
}

function displayableMessages(): unknown[] {
	return sessionStore.getChatMessages().filter(message => normalizeChat(message) !== null);
}

function normalizeChat(value: unknown): { raw: Record<string, unknown>; name: string; message: string; platform: string } | null {
	const raw = unwrapMessage(value);
	if (!raw) return null;
	const name = plainText(raw.chatname);
	const message = plainText(raw.chatmessage) || (raw.contentimg ? translate("deviceChatSharedImage", "Shared an image") : "");
	if (!name && !message) return null;
	return {
		raw,
		name: name || translate("deviceChatAnonymous", "Anonymous"),
		message: message || translate("deviceChatMessage", "Message"),
		platform: plainText(raw.platform || raw.type).toUpperCase() || "CHAT"
	};
}

function unwrapMessage(value: unknown): Record<string, unknown> | null {
	if (!isRecord(value)) return null;
	if (isRecord(value.dataReceived) && isRecord(value.dataReceived.overlayNinja)) return value.dataReceived.overlayNinja;
	if (isRecord(value.data) && ("chatmessage" in value.data || "chatname" in value.data)) return value.data;
	return value;
}

function pinValue(value: unknown): JsonValue {
	const id = messageId(value);
	return (id || unwrapMessage(value) || {}) as JsonValue;
}

function messageId(value: unknown): string {
	const raw = unwrapMessage(value);
	const id = raw && (raw.mid || raw.id);
	return typeof id === "string" || typeof id === "number" ? String(id) : "";
}

function plainText(value: unknown): string {
	if (typeof value !== "string") return "";
	return value
		.replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
