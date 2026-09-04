import { describe, expect, it, vi } from "vitest";
import type { VDONinjaOptions, VDONinjaSDKNode } from "@vdoninja/sdk/node";
import { SsnP2pTransport } from "./p2p-transport.js";
import { SsnClient } from "./ssn-client.js";

class FakeSdk extends EventTarget {
	joined: unknown = null;
	viewed: unknown = null;
	sent: Array<{ data: unknown; target: unknown }> = [];
	disconnected = false;
	sendResult = true;
	connectError: Error | null = null;

	constructor(readonly options: VDONinjaOptions) {
		super();
	}

	async connect(): Promise<void> {
		if (this.connectError) throw this.connectError;
	}

	async joinRoom(options: unknown): Promise<void> {
		this.joined = options;
	}

	async view(streamId: string, options: unknown): Promise<RTCPeerConnection> {
		this.viewed = { streamId, options };
		return {} as RTCPeerConnection;
	}

	sendData(data: unknown, target?: unknown): boolean {
		this.sent.push({ data, target });
		return this.sendResult;
	}

	async disconnect(): Promise<void> {
		this.disconnected = true;
	}
}

describe("SsnClient P2P transport", () => {
	it("joins and views the Social Stream publisher, then routes commands and callbacks", async () => {
		const holder: { sdk: FakeSdk | null } = { sdk: null };
		const transport = new SsnP2pTransport(options => {
			holder.sdk = new FakeSdk(options);
			return holder.sdk as unknown as VDONinjaSDKNode;
		});
		const client = new SsnClient(transport);
		client.configure({ sessionId: "p2p-session", password: "secret", transport: "p2p", requestTimeoutMs: 500 });
		await waitFor(() => holder.sdk?.viewed !== null);
		const sdk = holder.sdk;
		if (!sdk) throw new Error("P2P SDK was not created");

		expect(sdk?.options).toMatchObject({
			host: "wss://wss.socialstream.ninja",
			room: "p2p-session",
			password: "secret",
			salt: "vdo.ninja",
			label: "streamdeck"
		});
		expect(sdk?.joined).toEqual({ room: "p2p-session", password: "secret" });
		expect(sdk?.viewed).toEqual({
			streamId: "p2p-session",
			options: { dataOnly: true, label: "streamdeck", downloads: false, allowresources: false }
		});

		sdk?.dispatchEvent(new CustomEvent("dataChannelOpen", { detail: { uuid: "background-peer", streamID: "p2p-session" } }));
		await waitFor(() => sdk?.sent.length === 2);
		expect(unwrapRequest(sdk?.sent[0]?.data)).toEqual({ type: "ssnPeerHello", label: "streamdeck" });
		const capabilityRequest = unwrapRequest(sdk?.sent[1]?.data);
		expect(capabilityRequest).toMatchObject({ action: "getCapabilities", apiid: "p2p-session" });
		expect(sdk?.sent[1]?.target).toBe("background-peer");

		sdk?.dispatchEvent(new CustomEvent("dataReceived", {
			detail: {
				uuid: "background-peer",
				data: {
					overlayNinja: {
						callback: {
							get: capabilityRequest.get,
							result: {
								type: "capabilities",
								version: 2,
								ssn: { actionDescriptors: { clearOverlay: { callback: "guaranteed" } } }
							}
						}
					}
				}
			}
		}));
		await waitFor(() => client.connectionState === "connected");

		const commandPromise = client.sendCommand({ action: "clearOverlay" });
		await waitFor(() => (sdk?.sent.length || 0) === 3);
		const command = unwrapRequest(sdk?.sent[2]?.data);
		expect(command).toMatchObject({ action: "clearOverlay", protocol: 2, apiid: "p2p-session" });
		sdk?.dispatchEvent(new CustomEvent("dataReceived", {
			detail: {
				uuid: "background-peer",
				data: { overlayNinja: { callback: { get: command.get, result: { ok: true, status: "completed" } } } }
			}
		}));
		await expect(commandPromise).resolves.toMatchObject({ ok: true });
		client.disconnect();
	});

	it("treats the saved false password sentinel as unencrypted P2P", async () => {
		const holder: { sdk: FakeSdk | null } = { sdk: null };
		const transport = new SsnP2pTransport(options => {
			holder.sdk = new FakeSdk(options);
			return holder.sdk as unknown as VDONinjaSDKNode;
		});

		transport.connect("p2p-session", "false");
		await waitFor(() => holder.sdk?.viewed !== null);
		expect(holder.sdk?.options.password).toBe(false);
		expect(holder.sdk?.joined).toEqual({ room: "p2p-session", password: false });
		transport.disconnect();
	});

	it("reports signaling setup failures and rejects an active connection check", async () => {
		const failure = new Error("signaling blocked");
		const errors: Error[] = [];
		const transport = new SsnP2pTransport(options => {
			const sdk = new FakeSdk(options);
			sdk.connectError = failure;
			return sdk as unknown as VDONinjaSDKNode;
		});
		transport.onError(error => errors.push(error));

		transport.connect("blocked-session");
		await expect(transport.waitForOpen(500)).rejects.toThrow("signaling blocked");
		expect(errors).toEqual([failure]);
		expect(transport.isOpen).toBe(false);
		transport.disconnect();
	});

	it("ignores late events from a transport replaced during reconnect", async () => {
		const sdks: FakeSdk[] = [];
		const transport = new SsnP2pTransport(options => {
			const sdk = new FakeSdk(options);
			sdks.push(sdk);
			return sdk as unknown as VDONinjaSDKNode;
		});
		const opens = vi.fn();
		const messages = vi.fn();
		transport.onOpen(opens);
		transport.onMessage(messages);

		transport.connect("first-session");
		await waitFor(() => sdks[0]?.viewed !== null);
		transport.connect("second-session");
		await waitFor(() => sdks[1]?.viewed !== null);

		sdks[0]?.dispatchEvent(new CustomEvent("dataChannelOpen", { detail: { uuid: "stale-peer" } }));
		sdks[0]?.dispatchEvent(new CustomEvent("dataReceived", { detail: { data: { stale: true } } }));
		expect(opens).not.toHaveBeenCalled();
		expect(messages).not.toHaveBeenCalled();
		expect(transport.isOpen).toBe(false);

		sdks[1]?.dispatchEvent(new CustomEvent("dataChannelOpen", { detail: { uuid: "current-peer" } }));
		sdks[1]?.dispatchEvent(new CustomEvent("dataReceived", { detail: { data: { overlayNinja: { current: true } } } }));
		expect(opens).toHaveBeenCalledOnce();
		expect(messages).toHaveBeenCalledWith({ current: true });
		expect(transport.isOpen).toBe(true);
		transport.disconnect();
	});

	it("fails synchronously when the SDK cannot queue an outbound data message", async () => {
		const holder: { sdk: FakeSdk | null } = { sdk: null };
		const transport = new SsnP2pTransport(options => {
			holder.sdk = new FakeSdk(options);
			return holder.sdk as unknown as VDONinjaSDKNode;
		});
		transport.connect("send-failure");
		await waitFor(() => holder.sdk?.viewed !== null);
		holder.sdk?.dispatchEvent(new CustomEvent("dataChannelOpen", { detail: { uuid: "publisher" } }));
		if (!holder.sdk) throw new Error("P2P SDK was not created");
		holder.sdk.sendResult = false;
		expect(() => transport.send({ action: "test" })).toThrow(/could not be sent/);
		transport.disconnect();
	});

	it("closes only for the active peer and rejects a pending open check", async () => {
		const holder: { sdk: FakeSdk | null } = { sdk: null };
		const transport = new SsnP2pTransport(options => {
			holder.sdk = new FakeSdk(options);
			return holder.sdk as unknown as VDONinjaSDKNode;
		});
		const closes = vi.fn();
		transport.onClose(closes);
		transport.connect("close-session");
		await waitFor(() => holder.sdk?.viewed !== null);
		const pendingOpen = transport.waitForOpen(500);
		holder.sdk?.dispatchEvent(new CustomEvent("dataChannelClose", { detail: { uuid: "publisher" } }));
		await expect(pendingOpen).rejects.toThrow(/closed during connection test/);
		expect(closes).toHaveBeenCalledOnce();

		holder.sdk?.dispatchEvent(new CustomEvent("dataChannelOpen", { detail: { uuid: "publisher" } }));
		holder.sdk?.dispatchEvent(new CustomEvent("dataChannelClose", { detail: { uuid: "other-peer" } }));
		expect(transport.isOpen).toBe(true);
		expect(closes).toHaveBeenCalledOnce();
		transport.disconnect();
	});

	it("never falls back to HTTP while P2P is unavailable", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const transport = new SsnP2pTransport(options => new FakeSdk(options) as unknown as VDONinjaSDKNode);
		const client = new SsnClient(transport);
		client.configure({ sessionId: "offline-p2p", transport: "p2p", httpFallback: true, requestTimeoutMs: 100 });

		await expect(client.sendCommand({ action: "clearOverlay" })).rejects.toThrow(/P2P transport is not connected/);
		expect(fetchSpy).not.toHaveBeenCalled();
		client.disconnect();
		fetchSpy.mockRestore();
	});
});

function unwrapRequest(value: unknown): Record<string, unknown> {
	return (value as { overlayNinja: Record<string, unknown> }).overlayNinja;
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for P2P condition");
		await new Promise(resolve => setTimeout(resolve, 5));
	}
}
