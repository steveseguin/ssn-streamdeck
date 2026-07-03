import WebSocket from "ws";
import { DEFAULT_API_HOST, normalizeGlobalSettings } from "./settings.js";
import type { ConnectionStateName, GlobalSettings, SsnCommandPayload } from "./types.js";

type Listener<T> = (payload: T) => void;

export class SsnClient {
	private settings: GlobalSettings = normalizeGlobalSettings(undefined);
	private socket: WebSocket | null = null;
	private state: ConnectionStateName = "missing-session";
	private listeners = {
		state: new Set<Listener<ConnectionStateName>>(),
		message: new Set<Listener<unknown>>()
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
		});
		this.socket.on("message", data => this.handleMessage(data.toString()));
		this.socket.on("close", () => {
			if (this.settings.sessionId) {
				this.setState("disconnected");
			}
		});
		this.socket.on("error", () => this.setState("error"));
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
			this.sendRaw(command);
			return command;
		}
		if (this.settings.httpFallback !== false) {
			return this.sendHttp(command, options.awaitResponse === true);
		}
		throw new Error("Social Stream API WebSocket is not connected");
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
		try {
			this.emit("message", JSON.parse(raw) as unknown);
		} catch {
			this.emit("message", raw);
		}
	}

	private isSocketOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	private closeSocket(): void {
		if (!this.socket) {
			return;
		}
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
