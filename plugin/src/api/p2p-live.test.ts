import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import VDONinjaNodeModule from "@vdoninja/sdk/node";
import type { VDONinjaOptions, VDONinjaSDKNode } from "@vdoninja/sdk/node";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { SsnP2pTransport } from "./p2p-transport.js";
import { SsnClient } from "./ssn-client.js";

const SIGNALING_HOST = "wss://wss.socialstream.ninja";
const LIVE_ENABLED = process.env.SSN_LIVE_P2P === "1";
const VDONinjaConstructor = VDONinjaNodeModule as unknown as new (options?: VDONinjaOptions) => VDONinjaSDKNode;
const activeClients = new Set<{ disconnect(): void | Promise<void> }>();

describe.skipIf(!LIVE_ENABLED)("live Social Stream Ninja P2P transport", () => {
	afterEach(async () => {
		const clients = Array.from(activeClients);
		activeClients.clear();
		await Promise.allSettled(clients.map(client => client.disconnect()));
	});

	it("connects through the production transport and survives ordered command bursts and a large payload", async () => {
		const sessionId = liveSessionId("flow");
		const publisher = await createPublisher(sessionId);
		const { client } = createClient();

		client.configure({ sessionId, transport: "p2p", requestTimeoutMs: 30000 });
		await expect(client.verifyConnection()).resolves.toMatchObject({ type: "capabilities", version: 2 });

		const results = await Promise.all(
			Array.from({ length: 50 }, (_, sequence) =>
				client.sendCommand({ action: "getSources", target: "ssapp", value: { sequence } }, { awaitResponse: true })
			)
		);
		expect(results.map(result => (result as { sequence: number }).sequence)).toEqual(Array.from({ length: 50 }, (_, index) => index));

		const largeValue = "x".repeat(64 * 1024);
		await expect(
			client.sendCommand({ action: "getSources", target: "ssapp", value: { sequence: 51, largeValue } }, { awaitResponse: true })
		).resolves.toMatchObject({ ok: true, sequence: 51, receivedLength: largeValue.length });
		expect(publisher.receivedSequences).toEqual([...Array.from({ length: 50 }, (_, index) => index), 51]);
	}, 60000);

	it("reconnects after the plugin-side signaling socket is abruptly terminated", async () => {
		const sessionId = liveSessionId("viewer-drop");
		await createPublisher(sessionId);
		const { client, sdks } = createClient();

		client.configure({ sessionId, transport: "p2p", requestTimeoutMs: 45000 });
		await client.verifyConnection();
		await expect(sendSequence(client, 1)).resolves.toMatchObject({ sequence: 1 });

		terminateSignaling(sdks.at(-1));
		await waitFor(() => sdks.length >= 2, 15000, "plugin to replace the interrupted P2P transport");
		await waitFor(() => client.connectionState === "connected", 45000, "plugin to reconnect after signaling loss");
		await expect(sendSequence(client, 2)).resolves.toMatchObject({ sequence: 2 });
	}, 75000);

	it("recovers after the publisher signaling socket is abruptly terminated", async () => {
		const sessionId = liveSessionId("publisher-drop");
		const publisher = await createPublisher(sessionId);
		const { client } = createClient();

		client.configure({ sessionId, transport: "p2p", requestTimeoutMs: 45000 });
		await client.verifyConnection();
		await expect(sendSequence(client, 1)).resolves.toMatchObject({ sequence: 1 });

		terminateSignaling(publisher.sdk);
		await waitFor(() => publisher.reconnected, 30000, "publisher signaling to reconnect");
		await waitFor(() => client.connectionState === "connected", 45000, "data channel to recover after publisher signaling loss");
		await expect(sendSequence(client, 2)).resolves.toMatchObject({ sequence: 2 });
	}, 90000);

	it("connects and exchanges commands when direct ICE is disabled and TURN relay is forced", async () => {
		const sessionId = liveSessionId("turn");
		const publisher = await createPublisher(sessionId, "", { forceTURN: true });
		const { client, sdks } = createClient({ forceTURN: true });

		client.configure({ sessionId, transport: "p2p", requestTimeoutMs: 60000 });
		await client.verifyConnection();
		await expect(sendSequence(client, 1)).resolves.toMatchObject({ sequence: 1 });

		const viewerPolicy = getIceTransportPolicy(sdks.at(-1));
		const publisherPolicy = getIceTransportPolicy(publisher.sdk);
		expect(viewerPolicy).toBe("relay");
		expect(publisherPolicy).toBe("relay");
		expect(await hasRelayCandidate(sdks.at(-1))).toBe(true);
		expect(await hasRelayCandidate(publisher.sdk)).toBe(true);
	}, 90000);

	it("rejects a wrong password without opening a data channel, then connects with the correct password", async () => {
		const sessionId = liveSessionId("password");
		await createPublisher(sessionId, "correct-password");
		const { client } = createClient();

		client.configure({ sessionId, password: "wrong-password", transport: "p2p", requestTimeoutMs: 7000 });
		await expect(client.verifyConnection()).rejects.toThrow(/timed out/i);
		expect(client.connectionState).toBe("error");

		client.configure({ sessionId, password: "correct-password", transport: "p2p", requestTimeoutMs: 30000 });
		await expect(client.verifyConnection()).resolves.toMatchObject({ version: 2 });
		await expect(sendSequence(client, 1)).resolves.toMatchObject({ sequence: 1 });
	}, 60000);

	it("switches from P2P to WebSocket and back without retaining the old transport", async () => {
		const sessionId = liveSessionId("switch");
		await createPublisher(sessionId);
		const wsServer = await createWebSocketApiServer();
		const { client, sdks } = createClient();

		client.configure({ sessionId, transport: "p2p", requestTimeoutMs: 30000 });
		await client.verifyConnection();
		expect(sdks).toHaveLength(1);

		const address = wsServer.address() as AddressInfo;
		client.configure({
			sessionId,
			transport: "websocket",
			apiHost: `127.0.0.1:${address.port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 5000
		});
		await client.verifyConnection();
		expect(client.transportMode).toBe("websocket");
		await waitFor(() => !(sdks[0] as unknown as { state: { connected: boolean } }).state.connected, 5000, "old P2P SDK to disconnect");

		client.configure({ sessionId, transport: "p2p", requestTimeoutMs: 30000 });
		await client.verifyConnection();
		expect(client.transportMode).toBe("p2p");
		expect(sdks).toHaveLength(2);
		await expect(sendSequence(client, 1)).resolves.toMatchObject({ sequence: 1 });
	}, 60000);

	it("times out cleanly when the publisher is absent", async () => {
		const { client } = createClient();
		client.configure({ sessionId: liveSessionId("missing"), transport: "p2p", requestTimeoutMs: 7000 });

		await expect(client.verifyConnection()).rejects.toThrow(/timed out/i);
		expect(client.connectionState).toBe("error");
	}, 15000);

	it("can repeatedly connect, send, and fully disconnect without stale callbacks", async () => {
		const sessionId = liveSessionId("cycles");
		const publisher = await createPublisher(sessionId);
		for (let cycle = 0; cycle < 5; cycle += 1) {
			const { client, sdks } = createClient();
			client.configure({ sessionId, transport: "p2p", requestTimeoutMs: 30000 });
			try {
				await client.verifyConnection();
			} catch (error) {
				throw new Error(`P2P cycle ${cycle + 1} failed to connect`, { cause: error });
			}
			await expect(sendSequence(client, cycle)).resolves.toMatchObject({ sequence: cycle });
			client.disconnect();
			expect(client.connectionState).toBe("disconnected");
			await waitFor(
				() => !(sdks[0] as unknown as { state: { connected: boolean } }).state.connected,
				5000,
				`P2P cycle ${cycle + 1} signaling teardown`
			);
			activeClients.delete(client);
		}
		expect(publisher.receivedSequences).toEqual([0, 1, 2, 3, 4]);
	}, 150000);
});

function createClient(extraOptions: Partial<VDONinjaOptions> = {}): { client: SsnClient; sdks: VDONinjaSDKNode[] } {
	const sdks: VDONinjaSDKNode[] = [];
	const transport = new SsnP2pTransport(options => {
		const sdk = new VDONinjaConstructor({ ...options, ...extraOptions });
		sdks.push(sdk);
		return sdk;
	});
	const client = new SsnClient(transport);
	activeClients.add(client);
	return { client, sdks };
}

async function createWebSocketApiServer(): Promise<WebSocketServer> {
	const server = new WebSocketServer({ port: 0 });
	await new Promise<void>((resolve, reject) => {
		server.once("listening", resolve);
		server.once("error", reject);
	});
	server.on("connection", socket => {
		socket.on("message", raw => {
			const request = JSON.parse(raw.toString()) as Record<string, unknown>;
			if (request.action !== "getCapabilities" || typeof request.get !== "string") return;
			socket.send(
				JSON.stringify({
					callback: {
						get: request.get,
						result: { type: "capabilities", version: 2, ssapp: { available: true } }
					}
				})
			);
		});
	});
	activeClients.add({
		disconnect: async () => {
			for (const socket of server.clients) socket.terminate();
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});
	return server;
}

async function createPublisher(
	sessionId: string,
	password = "",
	extraOptions: Partial<VDONinjaOptions> = {}
): Promise<{ sdk: VDONinjaSDKNode; receivedSequences: number[]; reconnected: boolean }> {
	const sdk = new VDONinjaConstructor({
		host: SIGNALING_HOST,
		room: sessionId,
		password: password || false,
		salt: "vdo.ninja",
		label: "socialstream",
		autoRecover: true,
		...extraOptions
	});
	activeClients.add(sdk);
	const state = { sdk, receivedSequences: [] as number[], reconnected: false };
	sdk.addEventListener("reconnected", () => {
		state.reconnected = true;
	});
	sdk.addEventListener("dataReceived", event => {
		const detail = (event as CustomEvent<{ data?: unknown; uuid?: string }>).detail || {};
		const request = unwrapOverlay(detail.data);
		if (!request || typeof request.get !== "string" || typeof detail.uuid !== "string") return;
		if (request.action === "getCapabilities") {
			sdk.sendData(
				{
					overlayNinja: {
						callback: {
							get: request.get,
							result: { type: "capabilities", version: 2, ssapp: { available: true } }
						}
					}
				},
				detail.uuid
			);
			return;
		}
		const value = isRecord(request.value) ? request.value : {};
		const sequence = typeof value.sequence === "number" ? value.sequence : -1;
		state.receivedSequences.push(sequence);
		sdk.sendData(
			{
				overlayNinja: {
					callback: {
						get: request.get,
						result: {
							ok: true,
							sequence,
							receivedLength: typeof value.largeValue === "string" ? value.largeValue.length : 0
						}
					}
				}
			},
			detail.uuid
		);
	});
	await sdk.connect();
	await sdk.joinRoom({ room: sessionId, password: password || false });
	await sdk.announce({ streamID: sessionId, label: "socialstream" });
	return state;
}

function sendSequence(client: SsnClient, sequence: number): Promise<unknown> {
	return client.sendCommand({ action: "getSources", target: "ssapp", value: { sequence } }, { awaitResponse: true });
}

function terminateSignaling(sdk: VDONinjaSDKNode | undefined): void {
	if (!sdk) throw new Error("Missing VDO.Ninja SDK instance");
	const signaling = (sdk as unknown as { signaling?: { terminate?: () => void; close?: () => void } }).signaling;
	if (typeof signaling?.terminate === "function") {
		signaling.terminate();
		return;
	}
	if (typeof signaling?.close === "function") {
		signaling.close();
		return;
	}
	throw new Error("The live SDK signaling socket cannot be terminated");
}

function getPeerConnections(sdk: VDONinjaSDKNode | undefined): Array<{
	getConfiguration?: () => RTCConfiguration;
	selectedCandidatePair?: () => { local?: { type?: string }; remote?: { type?: string } } | null;
	getStats?: () => Promise<RTCStatsReport>;
}> {
	if (!sdk) return [];
	const connections = (sdk as unknown as { connections?: Map<string, Record<string, { pc?: unknown }>> }).connections;
	if (!connections) return [];
	const pcs: ReturnType<typeof getPeerConnections> = [];
	for (const connection of connections.values()) {
		for (const direction of [connection.publisher, connection.viewer]) {
			if (direction?.pc) pcs.push(direction.pc as (typeof pcs)[number]);
		}
	}
	return pcs;
}

function getIceTransportPolicy(sdk: VDONinjaSDKNode | undefined): RTCIceTransportPolicy | undefined {
	return getPeerConnections(sdk)[0]?.getConfiguration?.().iceTransportPolicy;
}

async function hasRelayCandidate(sdk: VDONinjaSDKNode | undefined): Promise<boolean> {
	for (const pc of getPeerConnections(sdk)) {
		const selected = pc.selectedCandidatePair?.();
		if (selected?.local?.type === "relay" || selected?.remote?.type === "relay") return true;
		if (!pc.getStats) continue;
		const report = await pc.getStats();
		for (const stat of Array.from(report.values())) {
			if ((stat.type === "local-candidate" || stat.type === "remote-candidate") && stat.candidateType === "relay") return true;
		}
	}
	return false;
}

function unwrapOverlay(value: unknown): Record<string, unknown> | null {
	if (!isRecord(value)) return null;
	return isRecord(value.overlayNinja) ? value.overlayNinja : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function liveSessionId(prefix: string): string {
	return `sdtest-${prefix}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

async function waitFor(predicate: () => boolean, timeoutMs: number, description: string): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${description}`);
		await new Promise(resolve => setTimeout(resolve, 100));
	}
}
