import { describe, expect, it } from "vitest";
import { normalizeCustomCommandSettings, normalizeGlobalSettings, normalizeSsnCommandSettings } from "./settings.js";

describe("settings normalization", () => {
	it("uses safe global defaults", () => {
		expect(normalizeGlobalSettings(undefined)).toEqual({
			sessionId: "",
			apiHost: "io.socialstream.ninja",
			useTls: true,
			httpFallback: true,
			inChannel: 1,
			outChannel: 1,
			requestTimeoutMs: 5000
		});
	});

	it("normalizes command settings", () => {
		expect(normalizeSsnCommandSettings({ command: "clearOverlay", value: " toggle " })).toEqual({
			command: "clearOverlay",
			target: "",
			value: "toggle",
			title: "",
			awaitResponse: false
		});
	});

	it("parses custom command booleans and JSON-looking values", () => {
		expect(normalizeCustomCommandSettings({ action: "drawmode", value: "true" }).value).toBe(true);
		expect(normalizeCustomCommandSettings({ action: "setpollsettings", value: "{\"pollQuestion\":\"Test\"}" }).value).toEqual({
			pollQuestion: "Test"
		});
	});
});
