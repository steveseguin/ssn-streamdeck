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

	it("does not report connected when no Social Stream host answers", async () => {
		const server = new WebSocketServer({ port: 0 });
		await new Promise<void>(resolve => server.once("listening", resolve));
		cleanup.push(() => server.close());
		const address = server.address() as AddressInfo;
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "missing-host",
			apiHost: `127.0.0.1:${address.port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 50
		});

		await waitFor(() => client.connectionState === "disconnected");
		expect(client.getCapabilities()).toBeNull();
	});

	it("reconnects after the API WebSocket closes", async () => {
		const { port, server, messages } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-reconnect",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});

		await waitFor(() => client.connectionState === "connected");
		for (const socket of server.clients) {
			socket.close();
		}
		await waitFor(() => messages.filter(message => message.join === "session-reconnect").length >= 2, 3000);
		await waitFor(() => client.connectionState === "connected");
	});

	it("clears advertised capabilities when the session is removed", async () => {
		const { port, server } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		const seenCapabilities: Array<StreamDeckCapabilities | null> = [];
		client.onCapabilities(next => seenCapabilities.push(next));

		client.configure({
			sessionId: "session-clear",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});

		await waitFor(() => client.getCapabilities() !== null);
		client.configure({
			sessionId: "",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});

		expect(client.getCapabilities()).toBeNull();
		expect(seenCapabilities.some(next => next?.ssapp?.available === true)).toBe(true);
		expect(seenCapabilities[seenCapabilities.length - 1]).toBeNull();
		expect(seenCapabilities.filter(next => next === null)).toHaveLength(1);
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
			"Desktop app source controls require"
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

	it("uses the null target segment for HTTP fallback commands with values", async () => {
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

		await expect(client.sendCommand({ action: "removefromwaitlist", value: "1" })).resolves.toBe("ok");
		expect(requests.some(request => request.url === "/session-6/removefromwaitlist/null/1")).toBe(true);
	});

	it("does not fall back to HTTP for JSON payload values", async () => {
		const { server, port, requests } = await createHttpServer("ok");
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-7",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		const value = { id: "external-1", chatname: "User", chatmessage: "Pinned note", type: "api" };
		await expect(client.sendCommand({ action: "pin", value })).rejects.toThrow("HTTP fallback supports only primitive");
		expect(requests).toEqual([]);
	});

	it("keeps targeted custom commands compatible even when action names overlap SSApp", async () => {
		const { server, port, requests } = await createHttpServer("ok");
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-8",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		await expect(client.sendCommand({ action: "startSource", target: "overlay", value: "source-1" })).resolves.toBe("ok");
		expect(requests.some(request => request.url === "/session-8/startSource/overlay/source-1")).toBe(true);
	});

	it("times out stalled HTTP fallback requests", async () => {
		const server = http.createServer(() => undefined);
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		cleanup.push(() => server.close());
		const address = server.address() as AddressInfo;
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-timeout",
			apiHost: `127.0.0.1:${address.port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 50
		});

		await expect(client.sendCommand({ action: "clearOverlay" })).rejects.toThrow("HTTP request timed out");
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
				socket.send(JSON.stringify({ callback: { get: message.get, result: false } }));
				socket.send(JSON.stringify({ callback: { get: message.get, result: capabilities } }));
				return;
			}
			if (message.action === "startSource" && typeof message.get === "string") {
				socket.send(JSON.stringify({ callback: { get: message.get } }));
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
				socket.send(JSON.stringify({ callback: { get: message.get, result: false } }));
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
