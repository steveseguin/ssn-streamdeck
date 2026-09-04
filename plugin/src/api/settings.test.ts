import { describe, expect, it } from "vitest";
import { normalizeCustomCommandSettings, normalizeGlobalSettings, normalizeSessionId, normalizeSsnCommandSettings, parseConnectionInput } from "./settings.js";

describe("settings normalization", () => {
	it("uses safe global defaults", () => {
		expect(normalizeGlobalSettings(undefined)).toEqual({
			sessionId: "",
			password: "",
			transport: "p2p",
			apiHost: "io.socialstream.ninja",
			useTls: true,
			httpFallback: true,
			inChannel: 2,
			outChannel: 1,
			requestTimeoutMs: 5000
		});
	});

	it("normalizes command settings", () => {
		expect(normalizeSsnCommandSettings({ command: "clearOverlay", value: " toggle " })).toEqual({
			command: "clearOverlay",
			target: "",
			sourceId: "",
			value: "toggle",
			title: "",
			awaitResponse: false
		});
	});

	it("extracts session IDs from Social Stream Ninja URLs", () => {
		expect(normalizeSessionId("https://beta.socialstream.ninja/dock.html?session=exampleSession123&v=3.50.4&branded")).toBe("exampleSession123");
		expect(normalizeSessionId("?session=abc123&showviewercount")).toBe("abc123");
		expect(normalizeGlobalSettings({ sessionId: "session=rawSession&v=1" }).sessionId).toBe("rawSession");
		expect(normalizeSessionId("plainSession")).toBe("plainSession");
	});

	it("infers transport and password from pasted Social Stream links", () => {
		expect(parseConnectionInput("https://socialstream.ninja/dock.html?session=abc&password=secret")).toEqual({
			sessionId: "abc",
			password: "secret",
			transport: "p2p"
		});
		expect(parseConnectionInput("https://socialstream.ninja/dock.html?session=abc&server2")).toEqual({
			sessionId: "abc",
			password: "",
			transport: "websocket"
		});
		expect(parseConnectionInput("plainSession").transport).toBeNull();
	});

	it("parses custom command booleans and JSON-looking values", () => {
		expect(normalizeCustomCommandSettings({ action: "drawmode", value: "true" }).value).toBe(true);
		expect(normalizeCustomCommandSettings({ action: "setpollsettings", value: "{\"pollQuestion\":\"Test\"}" }).value).toEqual({
			pollQuestion: "Test"
		});
	});
});
