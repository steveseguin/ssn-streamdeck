import VDONinjaNodeModule from "@vdoninja/sdk/node";
import type { VDONinjaOptions, VDONinjaSDKNode } from "@vdoninja/sdk/node";

const SIGNALING_HOST = "wss://wss.socialstream.ninja";
const PEER_LABEL = "streamdeck";

type Listener<T> = (value: T) => void;
type SdkFactory = (options: VDONinjaOptions) => VDONinjaSDKNode;
const VDONinjaConstructor = VDONinjaNodeModule as unknown as new (options?: VDONinjaOptions) => VDONinjaSDKNode;

export class SsnP2pTransport {
	private sdk: VDONinjaSDKNode | null = null;
	private generation = 0;
	private ready = false;
	private peerUuid = "";
	private listeners = {
		open: new Set<Listener<void>>(),
		close: new Set<Listener<void>>(),
		error: new Set<Listener<Error>>(),
		message: new Set<Listener<unknown>>()
	};

	constructor(private readonly createSdk: SdkFactory = options => new VDONinjaConstructor(options)) {}

	get isOpen(): boolean {
		return this.ready;
	}

	get isActive(): boolean {
		return this.sdk !== null;
	}

	onOpen(listener: Listener<void>): () => void {
		return this.addListener("open", listener);
	}

	onClose(listener: Listener<void>): () => void {
		return this.addListener("close", listener);
	}

	onError(listener: Listener<Error>): () => void {
		return this.addListener("error", listener);
	}

	onMessage(listener: Listener<unknown>): () => void {
		return this.addListener("message", listener);
	}

	connect(sessionId: string, password = ""): void {
		this.disconnect();
		const generation = this.generation;
		const p2pPassword = password && password !== "false" ? password : false;
		const sdk = this.createSdk({
			host: SIGNALING_HOST,
			room: sessionId,
			password: p2pPassword,
			salt: "vdo.ninja",
			label: PEER_LABEL,
			autoPingViewer: true,
			autoRecover: true
		});
		this.sdk = sdk;
		this.bindSdkEvents(sdk, generation);
		void this.openSdk(sdk, generation, sessionId, p2pPassword);
	}

	disconnect(): void {
		this.generation += 1;
		this.ready = false;
		this.peerUuid = "";
		const sdk = this.sdk;
		this.sdk = null;
		if (sdk) {
			void sdk.disconnect().catch(() => undefined);
		}
	}

	send(payload: object): void {
		if (!this.sdk || !this.ready) {
			throw new Error("Social Stream Ninja P2P connection is not ready");
		}
		const sent = this.sdk.sendData({ overlayNinja: payload }, this.peerUuid || undefined);
		if (!sent) {
			throw new Error("Social Stream Ninja P2P message could not be sent");
		}
	}

	waitForOpen(timeoutMs: number): Promise<void> {
		if (this.ready) {
			return Promise.resolve();
		}
		if (!this.sdk) {
			return Promise.reject(new Error("Social Stream Ninja P2P connection is not available"));
		}
		return new Promise((resolve, reject) => {
			const removeOpen = this.onOpen(() => {
				cleanup();
				resolve();
			});
			const removeClose = this.onClose(() => {
				cleanup();
				reject(new Error("Social Stream Ninja P2P connection closed during connection test"));
			});
			const removeError = this.onError(error => {
				cleanup();
				reject(error);
			});
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error("Social Stream Ninja P2P connection test timed out"));
			}, timeoutMs);
			const cleanup = () => {
				clearTimeout(timeout);
				removeOpen();
				removeClose();
				removeError();
			};
		});
	}

	private async openSdk(sdk: VDONinjaSDKNode, generation: number, sessionId: string, password: string | false): Promise<void> {
		try {
			await sdk.connect();
			if (!this.isCurrent(sdk, generation)) return;
			await sdk.joinRoom({ room: sessionId, password });
			if (!this.isCurrent(sdk, generation)) return;
			await sdk.view(sessionId, {
				dataOnly: true,
				label: PEER_LABEL,
				downloads: false,
				allowresources: false
			});
		} catch (error) {
			if (!this.isCurrent(sdk, generation)) return;
			this.emit("error", error instanceof Error ? error : new Error(String(error)));
		}
	}

	private bindSdkEvents(sdk: VDONinjaSDKNode, generation: number): void {
		sdk.addEventListener("dataChannelOpen", event => {
			if (!this.isCurrent(sdk, generation)) return;
			const detail = eventDetail(event);
			this.peerUuid = typeof detail.uuid === "string" ? detail.uuid : "";
			// The SDK currently advertises publisher labels but not viewer labels.
			// Identify this viewer explicitly so the Social Stream publisher can
			// route feed and Dock-bound commands without guessing from UUIDs.
			try {
				sdk.sendData({ overlayNinja: { type: "ssnPeerHello", label: PEER_LABEL } }, this.peerUuid || undefined);
			} catch (_) {}
			this.ready = true;
			this.emit("open", undefined);
		});
		sdk.addEventListener("dataChannelClose", event => {
			if (!this.isCurrent(sdk, generation)) return;
			const detail = eventDetail(event);
			if (this.peerUuid && detail.uuid !== this.peerUuid) return;
			this.ready = false;
			this.peerUuid = "";
			this.emit("close", undefined);
		});
		sdk.addEventListener("dataReceived", event => {
			if (!this.isCurrent(sdk, generation)) return;
			const detail = eventDetail(event);
			if (typeof detail.uuid === "string") this.peerUuid = detail.uuid;
			this.emit("message", unwrapPayload(detail.data));
		});
		sdk.addEventListener("disconnected", event => {
			if (!this.isCurrent(sdk, generation)) return;
			const detail = eventDetail(event);
			if (detail.intentional === true || detail.phase !== "socket") return;
			this.ready = false;
			this.emit("close", undefined);
		});
		sdk.addEventListener("reconnectFailed", () => {
			if (!this.isCurrent(sdk, generation)) return;
			this.ready = false;
			this.emit("error", new Error("Social Stream Ninja P2P reconnection failed"));
		});
	}

	private isCurrent(sdk: VDONinjaSDKNode, generation: number): boolean {
		return this.sdk === sdk && this.generation === generation;
	}

	private addListener<K extends keyof SsnP2pTransport["listeners"]>(
		type: K,
		listener: SsnP2pTransport["listeners"][K] extends Set<Listener<infer T>> ? Listener<T> : never
	): () => void {
		const set = this.listeners[type] as Set<typeof listener>;
		set.add(listener);
		return () => set.delete(listener);
	}

	private emit<K extends keyof SsnP2pTransport["listeners"]>(
		type: K,
		payload: SsnP2pTransport["listeners"][K] extends Set<Listener<infer T>> ? T : never
	): void {
		const set = this.listeners[type] as Set<Listener<typeof payload>>;
		for (const listener of set) listener(payload);
	}
}

function eventDetail(event: Event): Record<string, unknown> {
	return (event as CustomEvent<Record<string, unknown>>).detail || {};
}

function unwrapPayload(value: unknown): unknown {
	if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "overlayNinja")) {
		return value.overlayNinja;
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
