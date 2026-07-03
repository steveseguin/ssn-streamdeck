import WebSocket from "ws";
import { DEFAULT_API_HOST, normalizeGlobalSettings } from "./settings.js";
import type { ConnectionStateName, GlobalSettings, SsnCommandPayload, StreamDeckCapabilities } from "./types.js";

const SSAPP_ACTIONS = new Set([
	"getSources",
	"getSource",
	"startSource",
	"stopSource",
	"restartSource",
	"startAllSources",
	"stopAllSources",
	"restartAllSources",
	"setSourceVisibility",
	"toggleSourceVisibility",
	"setSourceMute",
	"toggleSourceMute",
	"setSourceConnectionMode"
]);

type Listener<T> = (payload: T) => void;
type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
};

export class SsnClient {
	private settings: GlobalSettings = normalizeGlobalSettings(undefined);
	private socket: WebSocket | null = null;
	private state: ConnectionStateName = "missing-session";
	private capabilities: StreamDeckCapabilities | null = null;
	private pendingRequests = new Map<string, PendingRequest>();
	private listeners = {
		state: new Set<Listener<ConnectionStateName>>(),
		message: new Set<Listener<unknown>>(),
		capabilities: new Set<Listener<StreamDeckCapabilities>>()
	};

	get connectionState(): ConnectionStateName {
		return this.state;
	}

	configure(settings: Partial<GlobalSettings> | undefined): void {
		const next = normalizeGlobalSettings(settings);
		const changed =
			next.sessionId !== this.settings.sessionId ||
			next.apiHost !== this.settings.apiHost ||
			next.useTls !== this.settings.useTls ||
			next.inChannel !== this.settings.inChannel ||
			next.outChannel !== this.settings.outChannel;
		this.settings = next;
		if (!next.sessionId) {
			this.disconnect("missing-session");
			return;
		}
		if (changed || !this.isSocketOpen()) {
			this.connect();
		}
	}

	onState(listener: Listener<ConnectionStateName>): () => void {
		return this.addListener("state", listener);
	}

	onMessage(listener: Listener<unknown>): () => void {
		return this.addListener("message", listener);
	}

	onCapabilities(listener: Listener<StreamDeckCapabilities>): () => void {
		return this.addListener("capabilities", listener);
	}

	getCapabilities(): StreamDeckCapabilities | null {
		return this.capabilities;
	}

	connect(): void {
		this.closeSocket();
		if (!this.settings.sessionId) {
			this.setState("missing-session");
			return;
		}
		this.setState("connecting");
		this.socket = new WebSocket(this.buildEndpoint(this.settings.useTls === false ? "ws" : "wss"));
		this.socket.on("open", () => {
			this.sendRaw({
				join: this.settings.sessionId || "",
				in: this.settings.inChannel || 1,
				out: this.settings.outChannel || 1
			});
			this.setState("connected");
			this.requestCapabilities().catch(() => undefined);
		});
		this.socket.on("message", data => this.handleMessage(data.toString()));
		this.socket.on("close", () => {
			this.rejectPendingRequests(new Error("Social Stream API WebSocket closed"));
			if (this.settings.sessionId) {
				this.setState("disconnected");
			}
		});
		this.socket.on("error", () => {
			this.rejectPendingRequests(new Error("Social Stream API WebSocket error"));
			this.setState("error");
		});
	}

	disconnect(state: ConnectionStateName = "disconnected"): void {
		this.closeSocket();
		this.setState(state);
	}

	async sendCommand(payload: SsnCommandPayload, options: { awaitResponse?: boolean } = {}): Promise<unknown> {
		const command = {
			...payload,
			apiid: this.settings.sessionId || payload.apiid
		};
		if (this.isSocketOpen()) {
			if (options.awaitResponse === true || command.get) {
				return this.sendSocketRequest(command);
			}
			this.sendRaw(command);
			return command;
		}
		if (isSsappCommand(command)) {
			throw new Error("SSApp source controls require the Social Stream API WebSocket connection");
		}
		if (this.settings.httpFallback !== false) {
			return this.sendHttp(command, options.awaitResponse === true);
		}
		throw new Error("Social Stream API WebSocket is not connected");
	}

	async requestCapabilities(): Promise<StreamDeckCapabilities | null> {
		const response = await this.sendCommand({ action: "getCapabilities" }, { awaitResponse: true });
		const capabilities = extractCapabilities(response);
		if (capabilities) {
			this.setCapabilities(capabilities);
			return capabilities;
		}
		return null;
	}

	private sendSocketRequest(payload: SsnCommandPayload): Promise<unknown> {
		const get = typeof payload.get === "string" && payload.get ? payload.get : this.createRequestId(payload.action);
		const request = {
			...payload,
			get
		};
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(get);
				reject(new Error(`Social Stream API request timed out: ${payload.action}`));
			}, this.settings.requestTimeoutMs || 5000);
			this.pendingRequests.set(get, { resolve, reject, timeout });
			try {
				this.sendRaw(request);
			} catch (error) {
				clearTimeout(timeout);
				this.pendingRequests.delete(get);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private async sendHttp(payload: SsnCommandPayload, awaitResponse: boolean): Promise<unknown> {
		if (!this.settings.sessionId) {
			throw new Error("Missing Social Stream session ID");
		}
		const response = await fetch(this.buildHttpUrl(payload));
		const text = await response.text();
		if (!response.ok) {
			this.setState("error");
			throw new Error(`Social Stream API HTTP request failed with ${response.status}`);
		}
		if (!awaitResponse) {
			return text;
		}
		try {
			return JSON.parse(text) as unknown;
		} catch {
			return text;
		}
	}

	private sendRaw(payload: object): void {
		if (!this.isSocketOpen() || !this.socket) {
			throw new Error("Social Stream API WebSocket is not connected");
		}
		this.socket.send(JSON.stringify(payload));
	}

	private handleMessage(raw: string): void {
		let message: unknown = raw;
		try {
			message = JSON.parse(raw) as unknown;
		} catch {
			this.emit("message", raw);
			return;
		}
		const capabilities = extractCapabilities(message);
		if (capabilities) {
			this.setCapabilities(capabilities);
		}
		this.resolveCallback(message);
		this.emit("message", message);
	}

	private isSocketOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	private closeSocket(): void {
		if (!this.socket) {
			return;
		}
		this.rejectPendingRequests(new Error("Social Stream API WebSocket disconnected"));
		const socket = this.socket;
		this.socket = null;
		socket.removeAllListeners();
		socket.on("error", () => undefined);
		if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
			socket.close();
		} else if (socket.readyState === WebSocket.CONNECTING) {
			socket.terminate();
		}
	}

	private buildEndpoint(protocol: "ws" | "wss"): string {
		const host = normalizeHost(this.settings.apiHost || DEFAULT_API_HOST);
		return `${protocol}://${host}`;
	}

	private buildHttpUrl(payload: SsnCommandPayload): string {
		const protocol = this.settings.useTls === false ? "http" : "https";
		const host = normalizeHost(this.settings.apiHost || DEFAULT_API_HOST);
		const parts = [this.settings.sessionId || "", payload.action];
		if ("target" in payload) {
			parts.push(String(payload.target ?? "null"));
		}
		if ("value" in payload) {
			parts.push(String(payload.value ?? "null"));
		}
		return `${protocol}://${host}/${parts.map(encodeURIComponent).join("/")}`;
	}

	private setState(state: ConnectionStateName): void {
		if (this.state === state) {
			return;
		}
		this.state = state;
		this.emit("state", state);
	}

	private setCapabilities(capabilities: StreamDeckCapabilities): void {
		this.capabilities = capabilities;
		this.emit("capabilities", capabilities);
	}

	private resolveCallback(message: unknown): void {
		if (!isRecord(message)) {
			return;
		}
		const callback = message.callback;
		if (!isRecord(callback) || typeof callback.get !== "string") {
			return;
		}
		const pending = this.pendingRequests.get(callback.get);
		if (!pending) {
			return;
		}
		this.pendingRequests.delete(callback.get);
		clearTimeout(pending.timeout);
		const result = callback.result;
		const capabilities = extractCapabilities(result);
		if (capabilities) {
			this.setCapabilities(capabilities);
		}
		if (isRecord(result) && result.ok === false) {
			const error = isRecord(result.error) ? result.error : {};
			pending.reject(new Error(typeof error.message === "string" ? error.message : "Social Stream API request failed"));
			return;
		}
		pending.resolve(result);
	}

	private rejectPendingRequests(error: Error): void {
		for (const pending of this.pendingRequests.values()) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pendingRequests.clear();
	}

	private createRequestId(action: string): string {
		return `sd-${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	private addListener<K extends keyof SsnClient["listeners"]>(
		type: K,
		listener: SsnClient["listeners"][K] extends Set<Listener<infer T>> ? Listener<T> : never
	): () => void {
		const set = this.listeners[type] as Set<typeof listener>;
		set.add(listener);
		return () => set.delete(listener);
	}

	private emit<K extends keyof SsnClient["listeners"]>(
		type: K,
		payload: SsnClient["listeners"][K] extends Set<Listener<infer T>> ? T : never
	): void {
		const set = this.listeners[type] as Set<Listener<typeof payload>>;
		for (const listener of set) {
			listener(payload);
		}
	}
}

function normalizeHost(host: string): string {
	return host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractCapabilities(value: unknown): StreamDeckCapabilities | null {
	if (!isRecord(value)) {
		return null;
	}
	if (value.type === "capabilities" && typeof value.version === "number") {
		return value as unknown as StreamDeckCapabilities;
	}
	const payload = value.payload;
	if (isRecord(payload) && payload.type === "capabilities" && typeof payload.version === "number") {
		return payload as unknown as StreamDeckCapabilities;
	}
	return null;
}

function isSsappCommand(payload: SsnCommandPayload): boolean {
	if (payload.target === "ssapp") {
		return true;
	}
	if (typeof payload.action === "string" && payload.action.startsWith("ssapp.")) {
		return true;
	}
	if (payload.target && payload.target !== "null") {
		return false;
	}
	return SSAPP_ACTIONS.has(payload.action);
}
