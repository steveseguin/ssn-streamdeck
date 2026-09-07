import { AddressInfo } from "node:net";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { SsnClient } from "./ssn-client.js";
import type { StreamDeckCapabilities } from "./types.js";

const capabilities: StreamDeckCapabilities = {
	type: "capabilities",
	version: 2,
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
		},
		actionDescriptors: {
			nextInQueue: {
				owner: "dock",
				callback: "guaranteed"
			}
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

	it("retries a WebSocket handshake that never receives a response", async () => {
		const server = http.createServer();
		let attempts = 0;
		server.on("upgrade", () => { attempts++; });
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		client.configure({ sessionId: "stalled-handshake", transport: "websocket", apiHost: `127.0.0.1:${(server.address() as AddressInfo).port}`, useTls: false, httpFallback: false, requestTimeoutMs: 50 });
		await waitFor(() => attempts >= 2, 1500);
	});

	it("verifies HTTP fallback when WebSocket handshakes are rejected", async () => {
		const { server, port, requests } = await createHttpServer(JSON.stringify(capabilities));
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		client.configure({ sessionId: "http-only", transport: "websocket", apiHost: `127.0.0.1:${port}`, useTls: false, requestTimeoutMs: 100 });
		await expect(client.verifyConnection()).resolves.toMatchObject({ type: "capabilities" });
		await new Promise(resolve => setTimeout(resolve, 30));
		expect(client.connectionState).toBe("connected");
		await waitFor(() => requests.filter(request => request.url === "/").length >= 2, 1500);
		await waitFor(() => client.connectionState === "connected");
	});

	it("does not use HTTP when fallback is disabled", async () => {
		const { server, port, requests } = await createHttpServer(JSON.stringify(capabilities));
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		client.configure({ sessionId: "no-http", transport: "websocket", apiHost: `127.0.0.1:${port}`, useTls: false, httpFallback: false, requestTimeoutMs: 100 });
		await expect(client.verifyConnection()).rejects.toThrow();
		expect(requests.some(request => request.url?.includes("getCapabilities"))).toBe(false);
	});

	it.each([false, true])("clears HTTP-only connection status when fallback is disabled (response pending: %s)", async pending => {
		let heldResponse: http.ServerResponse | undefined;
		const server = http.createServer((_req, res) => {
			heldResponse = res;
			if (!pending) res.end(JSON.stringify(capabilities));
		});
		const wsServer = new WebSocketServer({ server });
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		cleanup.push(() => { for (const socket of wsServer.clients) socket.terminate(); wsServer.close(); server.closeAllConnections(); server.close(); });
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		const settings = { sessionId: "fallback-toggle", transport: "websocket" as const, apiHost: `127.0.0.1:${(server.address() as AddressInfo).port}`, useTls: false, requestTimeoutMs: 150 };
		client.configure(settings);
		await waitFor(() => pending ? !!heldResponse : client.connectionState === "connected");
		client.configure({ ...settings, httpFallback: false });
		if (pending) heldResponse!.end(JSON.stringify(capabilities));
		await new Promise(resolve => setTimeout(resolve, 50));
		expect(client.getCapabilities()).toBeNull();
		expect(client.connectionState).not.toBe("connected");
	});

	it.each([["clear", 200], ["switch", 200], ["clear", 503], ["switch", 503]] as const)("ignores a delayed capability response after session %s (HTTP %s)", async (change, status) => {
		let heldResponse: http.ServerResponse | undefined;
		const server = http.createServer((req, res) => {
			if (req.url?.startsWith("/old-session/")) { heldResponse = res; return; }
			res.end(JSON.stringify({ ...capabilities, runtime: "current-runtime" }));
		});
		const wsServer = new WebSocketServer({ server });
		wsServer.on("connection", socket => socket.on("message", raw => {
			const request = JSON.parse(raw.toString());
			if (request.apiid === "new-session" && request.action === "getCapabilities") {
				socket.send(JSON.stringify({ callback: { get: request.get, result: { ...capabilities, runtime: "current-runtime" } } }));
			}
		}));
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		cleanup.push(() => { for (const socket of wsServer.clients) socket.terminate(); wsServer.close(); server.closeAllConnections(); server.close(); });
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		const settings = { sessionId: "old-session", transport: "websocket" as const, apiHost: `127.0.0.1:${(server.address() as AddressInfo).port}`, useTls: false, requestTimeoutMs: 150 };
		client.configure(settings);
		await waitFor(() => !!heldResponse);
		client.configure({ ...settings, sessionId: change === "clear" ? "" : "new-session" });
		if (change === "switch") await waitFor(() => client.getCapabilities()?.runtime === "current-runtime");
		heldResponse!.writeHead(status);
		heldResponse!.end(JSON.stringify({ ...capabilities, runtime: "old-runtime" }));
		await new Promise(resolve => setTimeout(resolve, 50));
		expect(client.connectionState).toBe(change === "clear" ? "missing-session" : "connected");
		expect(client.getCapabilities()?.runtime || null).toBe(change === "clear" ? null : "current-runtime");
	});

	it("requests and stores capabilities after connecting", async () => {
		const { port, server, messages } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-1",
			transport: "websocket",
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

	it("re-probes the host when the connection is tested", async () => {
		const { port, server, messages } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-verify",
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});

		await waitFor(() => client.connectionState === "connected");
		await expect(client.verifyConnection()).resolves.toMatchObject({ type: "capabilities", version: 2 });
		expect(messages.filter(message => message.action === "getCapabilities")).toHaveLength(2);
	});

	it("uses versioned callbacks for commands with guaranteed host responses", async () => {
		const { port, server, messages } = await createServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-versioned",
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});
		await waitFor(() => client.connectionState === "connected");

		await expect(client.sendCommand({ action: "nextInQueue" })).resolves.toMatchObject({ ok: true });
		expect(messages.find(message => message.action === "nextInQueue")).toMatchObject({
			action: "nextInQueue",
			protocol: 2
		});
		expect(messages.find(message => message.action === "nextInQueue")?.get).toEqual(expect.any(String));
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
			transport: "websocket",
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
			transport: "websocket",
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
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});

		await waitFor(() => client.getCapabilities() !== null);
		client.configure({
			sessionId: "",
			transport: "websocket",
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
			transport: "websocket",
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
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: false,
			requestTimeoutMs: 500
		});
		await waitFor(() => client.connectionState === "connected");

		await expect(client.sendCommand({ action: "stopSource", value: "source-1" }, { awaitResponse: true })).rejects.toThrow("SSApp unavailable");
	});

	it("falls back to HTTP for SSApp source controls when the socket is not verified", async () => {
		const { server, port, requests } = await createHttpServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-4",
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		await expect(client.sendCommand({ action: "startSource", target: "ssapp", value: "source-1" }, { awaitResponse: true })).resolves.toBe("ok");
		expect(requests.some(request => request.url === "/session-4/startSource/ssapp/source-1")).toBe(true);
	});

	it("keeps HTTP fallback for ordinary SSN commands", async () => {
		const { server, port, requests } = await createHttpServer("ok");
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-5",
			transport: "websocket",
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
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		await expect(client.sendCommand({ action: "removefromwaitlist", value: "1" })).resolves.toBe("ok");
		expect(requests.some(request => request.url === "/session-6/removefromwaitlist/null/1")).toBe(true);
	});

	it("JSON-encodes structured HTTP fallback values", async () => {
		const { server, port, requests } = await createHttpServer("ok");
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-7",
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 500
		});

		const value = { id: "external-1", chatname: "User", chatmessage: "Pinned note", type: "api" };
		await expect(client.sendCommand({ action: "pin", value })).resolves.toBe("ok");
		expect(requests.some(request => decodeURIComponent(request.url || "") === `/session-7/pin/null/${JSON.stringify(value)}`)).toBe(true);
	});

	it("uses HTTP capabilities and commands when an open WebSocket never answers", async () => {
		const { server, wsServer, port, requests } = await createSilentWebSocketHttpServer();
		cleanup.push(() => {
			for (const socket of wsServer.clients) socket.terminate();
			wsServer.close();
			server.close();
		});
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-http-capabilities",
			transport: "websocket",
			apiHost: `127.0.0.1:${port}`,
			useTls: false,
			httpFallback: true,
			requestTimeoutMs: 50
		});

		await waitFor(() => client.connectionState === "connected", 1000);
		expect(client.getCapabilities()?.ssapp?.available).toBe(true);
		await expect(client.sendCommand({ action: "getSources", target: "ssapp" }, { awaitResponse: true })).resolves.toMatchObject({
			ok: true,
			payload: { sources: [] }
		});
		expect(requests).toContain("/session-http-capabilities/getCapabilities");
		expect(requests).toContain("/session-http-capabilities/getSources/ssapp");
	});

	it("rejects structured HTTP command errors", async () => {
		const body = JSON.stringify({ ok: false, error: { code: "SOURCE_NOT_FOUND", message: "Source was not found." } });
		const { server, port } = await createHttpServer(body);
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		client.configure({ sessionId: "session-http-error", transport: "websocket", apiHost: `127.0.0.1:${port}`, useTls: false, httpFallback: true });

		await expect(client.sendCommand({ action: "getSource", target: "ssapp", value: "missing" }, { awaitResponse: true })).rejects.toThrow(
			"Source was not found."
		);
	});

	it("preserves the selected source and channel in HTTP fallback", async () => {
		const { server, port, requests } = await createHttpServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		client.configure({ sessionId: "session-targeted", transport: "websocket", apiHost: `127.0.0.1:${port}`, useTls: false, outChannel: 7 });

		await client.sendCommand({ action: "sendChat", target: "youtube", tabId: 123, value: "Hello" });
		const request = requests.find(request => request.method === "POST");
		expect(request).toBeDefined();
		expect(request?.url).toBe("/session-targeted?channel=7");
		expect(request?.contentType).toBe("application/json");
		expect(JSON.parse(request?.body || "{}")).toMatchObject({ action: "sendChat", target: "youtube", tabId: 123, value: "Hello" });
	});

	it("honors the configured channel for ordinary HTTP fallback commands", async () => {
		const { server, port, requests } = await createHttpServer();
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		client.configure({ sessionId: "session-channel", transport: "websocket", apiHost: `127.0.0.1:${port}`, useTls: false, outChannel: 7 });

		await client.sendCommand({ action: "clearOverlay" });
		expect(requests.some(request => request.url === "/session-channel/clearOverlay?channel=7")).toBe(true);
	});

	it("rejects HTTP command errors even without awaiting callbacks", async () => {
		const { server, port } = await createHttpServer(JSON.stringify({ ok: false, error: { message: "No writable source" } }));
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());
		client.configure({ sessionId: "session-rejected", transport: "websocket", apiHost: `127.0.0.1:${port}`, useTls: false });

		await expect(client.sendCommand({ action: "sendChat", value: "Hello" })).rejects.toThrow("No writable source");
	});

	it("keeps targeted custom commands compatible even when action names overlap SSApp", async () => {
		const { server, port, requests } = await createHttpServer("ok");
		cleanup.push(() => server.close());
		const client = new SsnClient();
		cleanup.push(() => client.disconnect());

		client.configure({
			sessionId: "session-8",
			transport: "websocket",
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
			transport: "websocket",
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
			if (message.action === "nextInQueue" && message.protocol === 2 && typeof message.get === "string") {
				socket.send(JSON.stringify({ callback: { get: message.get, result: { ok: true, status: "completed" } } }));
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

type HttpRequest = { method?: string; url?: string; contentType?: string; body: string };

async function createHttpServer(body = "ok"): Promise<{ server: http.Server; port: number; requests: HttpRequest[] }> {
	const requests: HttpRequest[] = [];
	const server = http.createServer((req, res) => {
		let received = "";
		req.setEncoding("utf8");
		req.on("data", chunk => { received += chunk; });
		req.on("end", () => {
			requests.push({ method: req.method, url: req.url, contentType: req.headers["content-type"], body: received });
			res.writeHead(200, { "Content-Type": "text/plain" });
			res.end(body);
		});
	});
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as AddressInfo;
	return { server, port: address.port, requests };
}

async function createSilentWebSocketHttpServer(): Promise<{
	server: http.Server;
	wsServer: WebSocketServer;
	port: number;
	requests: string[];
}> {
	const requests: string[] = [];
	const server = http.createServer((req, res) => {
		requests.push(req.url || "");
		res.writeHead(200, { "Content-Type": "application/json" });
		if (req.url?.endsWith("/getCapabilities")) {
			res.end(JSON.stringify(capabilities));
			return;
		}
		res.end(JSON.stringify({ ok: true, payload: { sources: [] } }));
	});
	const wsServer = new WebSocketServer({ server });
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as AddressInfo;
	return { server, wsServer, port: address.port, requests };
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
