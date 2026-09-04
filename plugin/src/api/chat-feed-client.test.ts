import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ChatFeedClient } from "./chat-feed-client.js";

describe("ChatFeedClient", () => {
	const cleanup: Array<() => void> = [];

	afterEach(() => {
		for (const fn of cleanup.splice(0)) fn();
	});

	it("reports websocket transport errors", async () => {
		const server = http.createServer((_request, response) => {
			response.writeHead(400);
			response.end();
		});
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		cleanup.push(() => server.close());
		const port = (server.address() as AddressInfo).port;
		const client = new ChatFeedClient();
		cleanup.push(() => client.setActive("test", false));
		const errors: Error[] = [];
		client.onError(error => errors.push(error));
		client.configure({ sessionId: "session", transport: "websocket", apiHost: `127.0.0.1:${port}`, useTls: false });
		client.setActive("test", true);

		await waitFor(() => errors.length > 0);

		expect(errors[0]?.message).toBe("Social Stream Ninja chat-feed WebSocket error");
	});

	it("uses the main P2P feed while Chat Review is visible", () => {
		const client = new ChatFeedClient();
		const messages: unknown[] = [];
		client.onMessage(message => messages.push(message));
		client.configure({ sessionId: "session", transport: "p2p" });
		client.handleTransportMessage({ chatname: "Viewer", chatmessage: "Hello" });
		expect(messages).toHaveLength(0);

		client.setActive("chat-dial", true);
		client.handleTransportMessage({ chatname: "Viewer", chatmessage: "Hello" });
		expect(messages).toEqual([{ chatname: "Viewer", chatmessage: "Hello" }]);
		client.setActive("chat-dial", false);
	});
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for chat-feed error");
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}
