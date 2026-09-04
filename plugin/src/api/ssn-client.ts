import WebSocket from "ws";
import { SsnP2pTransport } from "./p2p-transport.js";
import { DEFAULT_API_HOST, normalizeGlobalSettings } from "./settings.js";
import type { ConnectionStateName, GlobalSettings, SsnCommandPayload, StreamDeckCapabilities, TransportMode } from "./types.js";

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
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10000;
const CAPABILITY_RETRY_DELAY_MS = 5000;
const CAPABILITY_REFRESH_DELAY_MS = 30000;

type Listener<T> = (payload: T) => void;
type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
	accept?: (value: unknown) => boolean;
};

export class SsnClient {
	private settings: GlobalSettings = normalizeGlobalSettings(undefined);
	private socket: WebSocket | null = null;
	private p2p: SsnP2pTransport;
	private state: ConnectionStateName = "missing-session";
	private capabilities: StreamDeckCapabilities | null = null;
	private pendingRequests = new Map<string, PendingRequest>();
	private reconnectTimer: NodeJS.Timeout | null = null;
	private capabilityTimer: NodeJS.Timeout | null = null;
	private capabilityRequest: Promise<StreamDeckCapabilities | null> | null = null;
	private transportVerified = false;
	private reconnectAttempts = 0;
	private shouldReconnect = false;
	private listeners = {
		state: new Set<Listener<ConnectionStateName>>(),
		message: new Set<Listener<unknown>>(),
		capabilities: new Set<Listener<StreamDeckCapabilities | null>>()
	};

	constructor(p2p = new SsnP2pTransport()) {
		this.p2p = p2p;
		this.p2p.onOpen(() => {
			if (this.settings.transport !== "p2p") return;
			this.reconnectAttempts = 0;
			this.setState("connecting");
			this.probeCapabilities();
		});
		this.p2p.onMessage(message => {
			if (this.settings.transport === "p2p") this.handleMessage(message);
		});
		this.p2p.onClose(() => {
			if (this.settings.transport !== "p2p") return;
			this.handleTransportClosed(new Error("Social Stream Ninja P2P connection closed"));
		});
		this.p2p.onError(error => {
			if (this.settings.transport !== "p2p") return;
			this.rejectPendingRequests(error);
			this.setCapabilities(null);
			this.setState("error");
			this.scheduleReconnect();
		});
	}

	get connectionState(): ConnectionStateName {
		return this.state;
	}

	get transportMode(): TransportMode {
		return this.settings.transport === "websocket" ? "websocket" : "p2p";
	}

	configure(settings: Partial<GlobalSettings> | undefined): void {
		const next = normalizeGlobalSettings(settings);
		const changed =
			next.sessionId !== this.settings.sessionId ||
			next.password !== this.settings.password ||
			next.transport !== this.settings.transport ||
			next.apiHost !== this.settings.apiHost ||
			next.useTls !== this.settings.useTls ||
			next.inChannel !== this.settings.inChannel ||
			next.outChannel !== this.settings.outChannel;
		this.settings = next;
		if (!next.sessionId) {
			this.disconnect("missing-session");
			return;
		}
		this.shouldReconnect = true;
		if (changed || !this.isTransportActive()) {
			if (changed) {
				this.setCapabilities(null);
			}
			this.connect();
		}
	}

	onState(listener: Listener<ConnectionStateName>): () => void {
		return this.addListener("state", listener);
	}

	onMessage(listener: Listener<unknown>): () => void {
		return this.addListener("message", listener);
	}

	onCapabilities(listener: Listener<StreamDeckCapabilities | null>): () => void {
		return this.addListener("capabilities", listener);
	}

	getCapabilities(): StreamDeckCapabilities | null {
		return this.capabilities;
	}

	connect(): void {
		this.clearReconnectTimer();
		this.clearCapabilityTimer();
		this.closeTransport();
		if (!this.settings.sessionId) {
			this.shouldReconnect = false;
			this.setState("missing-session");
			return;
		}
		this.shouldReconnect = true;
		this.setState("connecting");
		this.transportVerified = false;
		if (this.settings.transport === "p2p") {
			this.p2p.connect(this.settings.sessionId, this.settings.password || "");
			return;
		}
		const socket = new WebSocket(this.buildEndpoint(this.settings.useTls === false ? "ws" : "wss"));
		this.socket = socket;
		socket.on("open", () => {
			if (this.socket !== socket) {
				return;
			}
			this.reconnectAttempts = 0;
			this.sendRaw({
				join: this.settings.sessionId || "",
				in: this.settings.inChannel || 1,
				out: this.settings.outChannel || 1
			});
			this.setState("connecting");
			this.probeCapabilities();
		});
		socket.on("message", data => this.handleMessage(data.toString()));
		socket.on("close", () => {
			if (this.socket !== socket) {
				return;
			}
			this.socket = null;
			this.handleTransportClosed(new Error("Social Stream Ninja API WebSocket closed"));
		});
		socket.on("error", () => {
			if (this.socket !== socket) {
				return;
			}
			this.rejectPendingRequests(new Error("Social Stream Ninja API WebSocket error"));
			this.setCapabilities(null);
			this.setState("error");
			if (socket.readyState !== WebSocket.CLOSED) {
				socket.terminate();
			}
		});
	}

	reconnect(): void {
		if (!this.settings.sessionId) {
			this.disconnect("missing-session");
			return;
		}
		this.connect();
	}

	disconnect(state: ConnectionStateName = "disconnected"): void {
		this.shouldReconnect = false;
		this.clearReconnectTimer();
		this.clearCapabilityTimer();
		this.closeTransport();
		this.setCapabilities(null);
		this.setState(state);
	}

	async sendCommand(payload: SsnCommandPayload, options: { awaitResponse?: boolean } = {}): Promise<unknown> {
		let command: SsnCommandPayload = {
			...payload,
			apiid: this.settings.sessionId || payload.apiid
		};
		if (this.isTransportOpen() && this.transportVerified) {
			const verifiedProtocol = this.getVerifiedCommandProtocol(command);
			if (verifiedProtocol !== null) {
				command = { ...command, protocol: verifiedProtocol };
			}
			if (options.awaitResponse === true || command.get || verifiedProtocol !== null) {
				return this.sendTransportRequest(
					command,
					isSsappCommand(command) || verifiedProtocol !== null ? isStructuredCommandResult : undefined
				);
			}
			this.sendRaw(command);
			return command;
		}
		if (this.settings.transport === "websocket" && this.settings.httpFallback !== false) {
			return this.sendHttp(command, options.awaitResponse === true);
		}
		throw new Error(`Social Stream Ninja ${this.transportMode.toUpperCase()} transport is not connected`);
	}

	async verifyConnection(): Promise<StreamDeckCapabilities> {
		if (!this.settings.sessionId) {
			throw new Error("Missing Social Stream Ninja session ID");
		}
		try {
			if (!this.isTransportActive()) {
				this.connect();
			}
			if (!this.isTransportOpen()) {
				await this.waitForTransportOpen();
			}
			const capabilities = await (
				this.transportVerified
					? this.requestCapabilitiesWithFallback()
					: this.capabilityRequest || this.requestCapabilitiesWithFallback()
			);
			if (!capabilities) {
				throw new Error("Social Stream Ninja capability response was invalid");
			}
			return capabilities;
		} catch (error) {
			this.setCapabilities(null);
			this.setState("error");
			throw error;
		}
	}

	async requestCapabilities(): Promise<StreamDeckCapabilities | null> {
		const response = await this.sendTransportRequest({ action: "getCapabilities", apiid: this.settings.sessionId }, value => extractCapabilities(value) !== null);
		const capabilities = extractCapabilities(response);
		if (capabilities) {
			this.transportVerified = true;
			this.setCapabilities(capabilities);
			this.setState("connected");
			return capabilities;
		}
		return null;
	}

	private sendTransportRequest(payload: SsnCommandPayload, accept?: (value: unknown) => boolean): Promise<unknown> {
		const get = typeof payload.get === "string" && payload.get ? payload.get : this.createRequestId(payload.action);
		const request = {
			...payload,
			get
		};
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(get);
				reject(new Error(`Social Stream Ninja API request timed out: ${payload.action}`));
			}, this.settings.requestTimeoutMs || 5000);
			this.pendingRequests.set(get, { resolve, reject, timeout, accept });
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
			throw new Error("Missing Social Stream Ninja session ID");
		}
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.settings.requestTimeoutMs || 5000);
		let response: Response;
		let text: string;
		try {
			response = await fetch(this.buildHttpUrl(payload), { signal: controller.signal });
			text = await response.text();
		} catch (error) {
			if (controller.signal.aborted) {
				throw new Error(`Social Stream Ninja API HTTP request timed out: ${payload.action}`);
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
		if (!response.ok) {
			this.setState("error");
			throw new Error(`Social Stream Ninja API HTTP request failed with ${response.status}`);
		}
		if (!awaitResponse) {
			return text;
		}
		let result: unknown;
		try {
			result = JSON.parse(text) as unknown;
		} catch {
			return text;
		}
		if (isRecord(result) && result.ok === false) {
			const error = isRecord(result.error) ? result.error : {};
			throw new Error(typeof error.message === "string" ? error.message : "Social Stream Ninja API request failed");
		}
		return result;
	}

	private sendRaw(payload: object): void {
		if (this.settings.transport === "p2p") {
			this.p2p.send(payload);
			return;
		}
		if (!this.isSocketOpen() || !this.socket) {
			throw new Error("Social Stream Ninja API WebSocket is not connected");
		}
		this.socket.send(JSON.stringify(payload));
	}

	private handleMessage(raw: unknown): void {
		let message = raw;
		if (typeof raw === "string") {
			try {
				message = JSON.parse(raw) as unknown;
			} catch {
				this.emit("message", raw);
				return;
			}
		}
		const capabilities = extractCapabilities(message);
		if (capabilities) {
			this.transportVerified = true;
			this.setCapabilities(capabilities);
			this.setState("connected");
		}
		this.resolveCallback(message);
		this.emit("message", message);
	}

	private isSocketOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	private isSocketActive(): boolean {
		return this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING;
	}

	private isTransportOpen(): boolean {
		return this.settings.transport === "p2p" ? this.p2p.isOpen : this.isSocketOpen();
	}

	private isTransportActive(): boolean {
		return this.settings.transport === "p2p" ? this.p2p.isActive : this.isSocketActive();
	}

	private waitForTransportOpen(): Promise<void> {
		return this.settings.transport === "p2p"
			? this.p2p.waitForOpen(this.settings.requestTimeoutMs || 5000)
			: this.waitForSocketOpen();
	}

	private waitForSocketOpen(): Promise<void> {
		const socket = this.socket;
		if (!socket) {
			return Promise.reject(new Error("Social Stream Ninja API WebSocket is not available"));
		}
		if (socket.readyState === WebSocket.OPEN) {
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timeout);
				socket.off("open", handleOpen);
				socket.off("close", handleClose);
				socket.off("error", handleError);
			};
			const handleOpen = () => {
				cleanup();
				resolve();
			};
			const handleClose = () => {
				cleanup();
				reject(new Error("Social Stream Ninja API WebSocket closed during connection test"));
			};
			const handleError = () => {
				cleanup();
				reject(new Error("Social Stream Ninja API WebSocket failed during connection test"));
			};
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error("Social Stream Ninja API connection test timed out"));
			}, this.settings.requestTimeoutMs || 5000);
			socket.once("open", handleOpen);
			socket.once("close", handleClose);
			socket.once("error", handleError);
		});
	}

	private getVerifiedCommandProtocol(payload: SsnCommandPayload): number | null {
		if (!this.capabilities || this.capabilities.version < 2 || isSsappCommand(payload)) {
			return null;
		}
		const ssn = this.capabilities.ssn;
		const descriptors = isRecord(ssn) && isRecord(ssn.actionDescriptors) ? ssn.actionDescriptors : null;
		const candidate = descriptors ? descriptors[payload.action] : null;
		const descriptor = isRecord(candidate) ? candidate : null;
		return descriptor && descriptor.callback === "guaranteed" ? this.capabilities.version : null;
	}

	private closeSocket(): void {
		if (!this.socket) {
			return;
		}
		this.rejectPendingRequests(new Error("Social Stream Ninja API WebSocket disconnected"));
		const socket = this.socket;
		this.socket = null;
		this.transportVerified = false;
		socket.removeAllListeners();
		socket.on("error", () => undefined);
		if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
			socket.close();
		} else if (socket.readyState === WebSocket.CONNECTING) {
			socket.terminate();
		}
	}

	private closeTransport(): void {
		this.rejectPendingRequests(new Error("Social Stream Ninja transport disconnected"));
		this.transportVerified = false;
		this.closeSocket();
		this.p2p.disconnect();
	}

	private handleTransportClosed(error: Error): void {
		this.clearCapabilityTimer();
		this.transportVerified = false;
		this.rejectPendingRequests(error);
		this.setCapabilities(null);
		if (this.settings.sessionId) {
			this.setState("disconnected");
			this.scheduleReconnect();
		}
	}

	private probeCapabilities(): void {
		if (this.capabilityRequest || !this.isTransportOpen()) {
			return;
		}
		const request = this.requestCapabilitiesWithFallback();
		this.capabilityRequest = request;
		request
			.then(capabilities => {
				this.scheduleCapabilityProbe(capabilities ? CAPABILITY_REFRESH_DELAY_MS : CAPABILITY_RETRY_DELAY_MS);
			})
			.catch(() => {
				this.setCapabilities(null);
				this.setState("disconnected");
				this.scheduleCapabilityProbe(CAPABILITY_RETRY_DELAY_MS);
			})
			.finally(() => {
				if (this.capabilityRequest === request) {
					this.capabilityRequest = null;
				}
			});
	}

	private async requestCapabilitiesWithFallback(): Promise<StreamDeckCapabilities | null> {
		try {
			return await this.requestCapabilities();
		} catch (transportError) {
			this.transportVerified = false;
			if (this.settings.transport !== "websocket" || this.settings.httpFallback === false) {
				throw transportError;
			}
		}

		const response = await this.sendHttp({ action: "getCapabilities", apiid: this.settings.sessionId }, true);
		const capabilities = extractCapabilities(response);
		if (!capabilities) {
			throw new Error("Social Stream Ninja API HTTP capability response was invalid");
		}
		this.setCapabilities(capabilities);
		this.setState("connected");
		return capabilities;
	}

	private scheduleCapabilityProbe(delay: number): void {
		this.clearCapabilityTimer();
		if (!this.shouldReconnect || !this.isTransportOpen()) {
			return;
		}
		this.capabilityTimer = setTimeout(() => {
			this.capabilityTimer = null;
			this.probeCapabilities();
		}, delay);
	}

	private scheduleReconnect(): void {
		if (!this.shouldReconnect || !this.settings.sessionId || this.reconnectTimer) {
			return;
		}
		const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY_MS);
		this.reconnectAttempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (this.shouldReconnect && this.settings.sessionId) {
				this.connect();
			}
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private clearCapabilityTimer(): void {
		if (this.capabilityTimer) {
			clearTimeout(this.capabilityTimer);
			this.capabilityTimer = null;
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
			parts.push(formatHttpPathSegment(payload.target));
		} else if ("value" in payload) {
			parts.push("null");
		}
		if ("value" in payload) {
			parts.push(formatHttpPathSegment(payload.value));
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

	private setCapabilities(capabilities: StreamDeckCapabilities | null): void {
		if (this.capabilities === capabilities) {
			return;
		}
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
		const result = callback.result;
		if (pending.accept && !pending.accept(result)) {
			return;
		}
		this.pendingRequests.delete(callback.get);
		clearTimeout(pending.timeout);
		const capabilities = extractCapabilities(result);
		if (capabilities) {
			this.setCapabilities(capabilities);
		}
		if (isRecord(result) && result.ok === false) {
			const error = isRecord(result.error) ? result.error : {};
			pending.reject(new Error(typeof error.message === "string" ? error.message : "Social Stream Ninja API request failed"));
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
	if (isRecord(payload)) {
		return extractCapabilities(payload);
	}
	return null;
}

function isStructuredCommandResult(value: unknown): boolean {
	return isRecord(value) && typeof value.ok === "boolean";
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

function formatHttpPathSegment(value: unknown): string {
	if (value === null || typeof value === "undefined") {
		return "null";
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}
