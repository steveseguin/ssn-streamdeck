import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMANDS, buildCustomCommandPayload, buildSsnCommandPayload, getCommandDefinition, parseValue } from "./command-registry.js";

describe("command registry", () => {
	it("builds simple preset commands", () => {
		expect(buildSsnCommandPayload({ command: "nextInQueue" })).toEqual({
			action: "nextInQueue"
		});
	});

	it("builds preset commands with values", () => {
		expect(buildSsnCommandPayload({ command: "drawmode", value: "toggle" })).toEqual({
			action: "drawmode",
			value: "toggle"
		});
	});

	it("builds waitlist control presets with default values", () => {
		expect(buildSsnCommandPayload({ command: "removefromwaitlist" })).toEqual({
			action: "removefromwaitlist",
			value: "1"
		});
		expect(buildSsnCommandPayload({ command: "waitlistmessage" })).toEqual({
			action: "waitlistmessage",
			value: "Type !join to enter!"
		});
	});

	it("builds dock pinning and waitlist management presets", () => {
		expect(buildSsnCommandPayload({ command: "pin", value: "message-1" })).toEqual({
			action: "pin",
			value: "message-1"
		});
		expect(buildSsnCommandPayload({ command: "unpin", value: "message-1" })).toEqual({
			action: "unpin",
			value: "message-1"
		});
		expect(buildSsnCommandPayload({ command: "nextPinned" })).toEqual({
			action: "nextPinned"
		});
		expect(buildSsnCommandPayload({ command: "openentries" })).toEqual({
			action: "openentries"
		});
		expect(buildSsnCommandPayload({ command: "resumeentries" })).toEqual({
			action: "resumeentries"
		});
		expect(buildSsnCommandPayload({ command: "downloadwaitlist" })).toEqual({
			action: "downloadwaitlist"
		});
	});

	it("keeps property inspector preset commands backed by the registry", () => {
		const html = readFileSync(new URL("../../ui/action-settings.html", import.meta.url), "utf8");
		const uiCommands = Array.from(html.matchAll(/\{\s*value:\s*"([^"]+)"/g), match => match[1]);
		const registryCommands = new Set(COMMANDS.map(command => command.id));
		expect(uiCommands.filter(command => !registryCommands.has(command))).toEqual([]);
		expect(uiCommands).toContain("pin");
		expect(uiCommands).toContain("downloadwaitlist");
		expect(uiCommands).not.toContain("openentries");
		expect(uiCommands).not.toContain("resumeentries");
		expect(uiCommands).not.toContain("setwaitlistmessage");
	});

	it("builds custom commands", () => {
		expect(buildCustomCommandPayload({ action: "sendChat", value: "Hello" })).toEqual({
			action: "sendChat",
			value: "Hello"
		});
	});

	it("builds SSApp source commands through the same payload shape", () => {
		expect(buildSsnCommandPayload({ command: "setSourceConnectionMode", value: "{\"sourceId\":\"s1\",\"mode\":\"websocket\"}" })).toEqual({
			action: "setSourceConnectionMode",
			target: "ssapp",
			value: {
				sourceId: "s1",
				mode: "websocket"
			}
		});
	});

	it("awaits SSApp command responses by default", () => {
		expect(getCommandDefinition("startSource").defaultAwaitResponse).toBe(true);
		expect(getCommandDefinition("setSourceConnectionMode").defaultAwaitResponse).toBe(true);
	});

	it("parses primitive and JSON values", () => {
		expect(parseValue("true")).toBe(true);
		expect(parseValue("false")).toBe(false);
		expect(parseValue("null")).toBeNull();
		expect(parseValue("{\"a\":1}")).toEqual({ a: 1 });
		expect(parseValue("hello")).toBe("hello");
	});
});
