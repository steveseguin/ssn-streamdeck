import { AddressInfo } from "node:net";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { SsnClient } from "./ssn-client.js";
import type { StreamDeckCapabilities } from "./types.js";

const capabilities: StreamDeckCapabilities = {
	type: "capabilities",
	version: 1,
	runtime: "electron",
	ssapp: {
		available: true,
		runtime: "electron",
		sourceControls: {
			list: true,
			get: true,
			start: true,
			stop: true,
			restart: true
		}
	},
	ssn: {
		actions: {
			nextInQueue: true
		}
	}
};

describe("SsnClient", () => {
	let cleanup: (() => void)[] = [];

	afterEach(() => {
		for (const fn of cleanup.splice(0)) {
			fn();
		}
	});

	it("requests and stores capabilities after connecting", async () => {
		const { port, server, messages } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-1",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});

		await waitFor(() => client.getCapabilities() !== null);

		expect(client.getCapabilities()?.ssapp?.available).toBe(true);
		expect(messages[0]).toMatchObject({
			join: "session-1",
			in: 2,
			out: 1
		});
	});

	it("resolves awaited socket callbacks", async () => {
		const { port, server } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-2",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});
		await waitFor(() => client.connectionState === "connected");

		await expect(client.sendCommand({ action: "startSource", value: "source-1" }, { awaitResponse: true })).resolves.toMatchObject({
			ok: true,
			payload: {
				source: {
					id: "source-1"
				}
			}
		});
	});

	it("rejects structured callback errors", async () => {
		const { port, server } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-3",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});
		await waitFor(() => client.connectionState === "connected");

		await expect(client.sendCommand({ action: "stopSource", value: "source-1" }, { awaitResponse: true })).rejects.toThrow("SSApp unavailable");
	});

	it("does not fall back to HTTP for SSApp source controls", async () => {
		const { server, port, requests } = await createHttpServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-4",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		await expect(client.sendCommand({ action: "startSource", target: "ssapp", value: "source-1" }, { awaitResponse: true })).rejects.toThrow(
			"SSApp source controls require"
		);
		expect(requests).toEqual([]);
	});

	it("keeps HTTP fallback for ordinary SSN commands", async () => {
		const { server, port, requests } = await createHttpServer("ok");
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-5",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		await expect(client.sendCommand({ action: "clearOverlay" })).resolves.toBe("ok");
		expect(requests.some(request => request.url === "/session-5/clearOverlay")).toBe(true);
	});

	it("keeps targeted custom commands compatible even when action names overlap SSApp", async () => {
		const { server, port, requests } = await createHttpServer("ok");
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-6",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		await expect(client.sendCommand({ action: "startSource", target: "overlay", value: "source-1" })).resolves.toBe("ok");
		expect(requests.some(request => request.url === "/session-6/startSource/overlay/source-1")).toBe(true);
	});
});

async function createServer(): Promise<{ server: WebSocketServer; port: number; messages: Record<string, unknown>[] }> {
	const messages: Record<string, unknown>[] = [];
	const server = new WebSocketServer({ port: 0 });
	await new Promise<void>(resolve => server.once("listening", resolve));
	server.on("connection", socket => {
		socket.on("message", raw => {
			const message = JSON.parse(raw.toString()) as Record<string, unknown>;
			messages.push(message);
			if (message.join) {
				return;
			}
			if (message.action === "getCapabilities" && typeof message.get === "string") {
				socket.send(JSON.stringify({ callback: { get: message.get, result: capabilities } }));
				return;
			}
			if (message.action === "startSource" && typeof message.get === "string") {
				socket.send(
					JSON.stringify({
						callback: {
							get: message.get,
							result: {
								ok: true,
								payload: {
									source: {
										id: message.value
									}
								}
							}
						}
					})
				);
				return;
			}
			if (message.action === "stopSource" && typeof message.get === "string") {
				socket.send(
					JSON.stringify({
						callback: {
							get: message.get,
							result: {
								ok: false,
								error: {
									code: "SSAPP_UNAVAILABLE",
									message: "SSApp unavailable"
								}
							}
						}
					})
				);
			}
		});
	});
	const address = server.address() as AddressInfo;
	return { server, port: address.port, messages };
}

async function createHttpServer(body = "ok"): Promise<{ server: http.Server; port: number; requests: { method?: string; url?: string }[] }> {
	const requests: { method?: string; url?: string }[] = [];
	const server = http.createServer((req, res) => {
		requests.push({ method: req.method, url: req.url });
		res.writeHead(200, { "Content-Type": "text/plain" });
		res.end(body);
	});
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as AddressInfo;
	return { server, port: address.port, requests };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}
