import WebSocket from "ws";
import { DEFAULT_API_HOST, normalizeGlobalSettings } from "./settings.js";
import type { GlobalSettings } from "./types.js";

const CHAT_FEED_CHANNEL = 4;
const CHAT_FEED_OUT_CHANNEL = 3;
const RECONNECT_BASE_DELAY_MS = 750;
const RECONNECT_MAX_DELAY_MS = 10000;

type Listener = (payload: unknown) => void;

export class ChatFeedClient {
	private settings: GlobalSettings = normalizeGlobalSettings(undefined);
	private socket: WebSocket | null = null;
	private activeContexts = new Set<string>();
	private listeners = new Set<Listener>();
	private reconnectTimer: NodeJS.Timeout | null = null;
	private reconnectAttempts = 0;

	configure(settings: Partial<GlobalSettings> | undefined): void {
		const next = normalizeGlobalSettings(settings);
		const changed =
			next.sessionId !== this.settings.sessionId ||
			next.apiHost !== this.settings.apiHost ||
			next.useTls !== this.settings.useTls;
		this.settings = next;
		if (!next.sessionId || !this.activeContexts.size) {
			this.close();
			return;
		}
		if (changed || !this.isSocketActive()) {
			this.connect();
		}
	}

	setActive(contextId: string, active: boolean): void {
		if (active) {
			this.activeContexts.add(contextId);
			if (this.settings.sessionId && !this.isSocketActive()) {
				this.connect();
			}
			return;
		}
		this.activeContexts.delete(contextId);
		if (!this.activeContexts.size) {
			this.close();
		}
	}

	onMessage(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private connect(): void {
		this.clearReconnectTimer();
		this.closeSocket();
		if (!this.settings.sessionId || !this.activeContexts.size) {
			return;
		}
		const protocol = this.settings.useTls === false ? "ws" : "wss";
		const socket = new WebSocket(`${protocol}://${normalizeHost(this.settings.apiHost || DEFAULT_API_HOST)}`);
		this.socket = socket;
		socket.on("open", () => {
			if (this.socket !== socket) return;
			this.reconnectAttempts = 0;
			socket.send(JSON.stringify({
				join: this.settings.sessionId || "",
				in: CHAT_FEED_CHANNEL,
				out: CHAT_FEED_OUT_CHANNEL
			}));
		});
		socket.on("message", data => this.emit(parseMessage(data.toString())));
		socket.on("close", () => {
			if (this.socket !== socket) return;
			this.socket = null;
			this.scheduleReconnect();
		});
		socket.on("error", () => {
			if (this.socket === socket && socket.readyState !== WebSocket.CLOSED) {
				socket.terminate();
			}
		});
	}

	private close(): void {
		this.clearReconnectTimer();
		this.closeSocket();
	}

	private closeSocket(): void {
		if (!this.socket) return;
		const socket = this.socket;
		this.socket = null;
		socket.removeAllListeners();
		socket.on("error", () => undefined);
		if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
		else if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) socket.close();
	}

	private isSocketActive(): boolean {
		return this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING;
	}

	private scheduleReconnect(): void {
		if (!this.settings.sessionId || !this.activeContexts.size || this.reconnectTimer) return;
		const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY_MS);
		this.reconnectAttempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (!this.reconnectTimer) return;
		clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}

	private emit(payload: unknown): void {
		for (const listener of this.listeners) listener(payload);
	}
}

function normalizeHost(host: string): string {
	return host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, "");
}

function parseMessage(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return raw;
	}
}
