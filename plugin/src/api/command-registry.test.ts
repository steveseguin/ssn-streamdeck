import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
	COMMANDS,
	buildCustomCommandPayload,
	buildSsnCommandPayload,
	extractSourceFromCommandResult,
	extractSourcesFromCommandResult,
	getCommandDefinition,
	isSourceTargetedChat,
	parseValue,
	targetChatPayloadToSource
} from "./command-registry.js";

describe("command registry", () => {
	it("builds simple preset commands", () => {
		expect(buildSsnCommandPayload({ command: "nextInQueue" })).toEqual({
			action: "nextInQueue"
		});
		expect(buildSsnCommandPayload({ command: "resetleaderboard" })).toEqual({
			action: "resetleaderboard"
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
		const uiCommands = Array.from(readUiCommandOptions().keys());
		const registryCommands = new Set(COMMANDS.map(command => command.id));
		expect(uiCommands.filter(command => !registryCommands.has(command))).toEqual([]);
		expect(uiCommands).toContain("resetleaderboard");
		expect(uiCommands).toContain("pin");
		expect(uiCommands).toContain("downloadwaitlist");
		expect(uiCommands).toContain("openentries");
		expect(uiCommands).toContain("resumeentries");
		expect(uiCommands).toContain("setwaitlistmessage");
		expect(uiCommands).toContain("toggletimer");
	});

	it("keeps property inspector response defaults aligned with required-response presets", () => {
		const uiOptions = readUiCommandOptions();
		const uiCommands = new Set(uiOptions.keys());
		const uiResponseCommands = new Set(Array.from(uiOptions).filter(([, option]) => option.defaultAwaitResponse === true).map(([command]) => command));
		const requiredResponseCommands = COMMANDS.filter(command => command.defaultAwaitResponse === true && uiCommands.has(command.id)).map(command => command.id);
		const registryResponseCommands = new Set(COMMANDS.filter(command => command.defaultAwaitResponse === true).map(command => command.id));
		expect(Array.from(uiResponseCommands).filter(command => !registryResponseCommands.has(command))).toEqual([]);
		for (const command of requiredResponseCommands) {
			expect(uiResponseCommands.has(command)).toBe(true);
		}
	});

	it("keeps property inspector value defaults aligned with visible preset defaults", () => {
		const uiOptions = readUiCommandOptions();
		const visibleDefaultCommands = COMMANDS.filter(command => typeof command.defaultValue !== "undefined" && uiOptions.has(command.id));
		for (const command of visibleDefaultCommands) {
			expect(uiOptions.get(command.id)).toHaveProperty("defaultValue");
			expect(uiOptions.get(command.id)?.defaultValue).toEqual(command.defaultValue);
		}
	});

	it("keeps property inspector SSApp presets gated by advertised capabilities", () => {
		const uiOptions = readUiCommandOptions();
		const expectedPaths = new Map<string, string[]>([
			["getSources", ["sourceControls", "list"]],
			["getSource", ["sourceControls", "get"]],
			["addSource", ["sourceControls", "add"]],
			["updateSource", ["sourceControls", "update"]],
			["removeSource", ["sourceControls", "remove"]],
			["startSource", ["sourceControls", "start"]],
			["stopSource", ["sourceControls", "stop"]],
			["restartSource", ["sourceControls", "restart"]],
			["startAllSources", ["bulkControls", "startAll"]],
			["stopAllSources", ["bulkControls", "stopAll"]],
			["restartAllSources", ["bulkControls", "restartAll"]],
			["setSourceMute", ["mute", "set"]],
			["toggleSourceMute", ["mute", "toggle"]],
			["setSourceVisibility", ["visibility", "set"]],
			["toggleSourceVisibility", ["visibility", "toggle"]],
			["setSourceConnectionMode", ["connectionMode", "set"]],
			["getSettings", ["settings", "get"]],
			["updateSettings", ["settings", "update"]]
		]);
		const ssappCommands = Array.from(uiOptions).filter(([, option]) => option.scope === "ssapp").map(([command]) => command);
		expect(ssappCommands).toEqual(Array.from(expectedPaths.keys()));
		for (const [command, option] of uiOptions) {
			if (option.scope !== "ssapp") {
				continue;
			}
			expect(option.capabilityPath).toEqual(expectedPaths.get(command));
		}
	});

	it("builds custom commands", () => {
		expect(buildCustomCommandPayload({ action: "sendChat", value: "Hello" })).toEqual({
			action: "sendChat",
			value: "Hello"
		});
	});

	it("targets chat using only the selected source type and current tab ID", () => {
		const source = extractSourceFromCommandResult({
			ok: true,
			payload: {
				source: {
					id: "youtube-source",
					target: "youtube",
					tabId: 42,
					status: "active",
					username: "tester",
					url: "https://example.test/chat?token=SECRET"
				}
			}
		});
			expect(source).toEqual({
			id: "youtube-source",
			target: "youtube",
			tabId: 42,
			status: "active",
			username: "tester"
		});
		expect(JSON.stringify(source)).not.toContain("SECRET");
		expect(targetChatPayloadToSource({ action: "sendChat", value: "Hello" }, source!)).toEqual({
			action: "sendChat",
			value: "Hello",
			target: "youtube",
			tabId: 42
		});
		expect(isSourceTargetedChat({ command: "sendChat", sourceId: "youtube-source" })).toBe(true);
		expect(isSourceTargetedChat({ command: "sendChat" })).toBe(false);
	});

	it("rejects inactive sources and ignores malformed source summaries", () => {
		expect(() => targetChatPayloadToSource(
			{ action: "sendChat", value: "Hello" },
			{ id: "youtube-source", target: "youtube", tabId: null }
		)).toThrow("not open");
		expect(() => targetChatPayloadToSource(
			{ action: "sendChat", value: "Hello" },
			{ id: "youtube-source", target: "youtube", tabId: 42, status: "activating" }
		)).toThrow("not open");
		expect(extractSourcesFromCommandResult({
			payload: {
				sources: [
					{ id: "open", target: "twitch", tabId: 7 },
					{ id: "closed", target: "youtube", tabId: null },
					{ id: "bad", tabId: 9 }
				]
			}
		})).toEqual([
			{ id: "open", target: "twitch", tabId: 7 },
			{ id: "closed", target: "youtube", tabId: null }
		]);
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

type UiCommandOption = {
	value: string;
	scope?: "ssn" | "ssapp";
	capabilityPath?: string[];
	defaultAwaitResponse?: boolean;
	defaultValue?: unknown;
};

function readUiCommandOptions(): Map<string, UiCommandOption> {
	const html = readFileSync(new URL("../../ui/action-settings.html", import.meta.url), "utf8");
	const options = new Map<string, UiCommandOption>();
	for (const line of html.split(/\r?\n/)) {
		if (!line.includes("{ value:")) {
			continue;
		}
		const objectLiteral = line.trim().replace(/,$/, "");
		const option = runInNewContext(`(${objectLiteral})`) as Partial<UiCommandOption>;
		if (typeof option.value === "string") {
			options.set(option.value, option as UiCommandOption);
		}
	}
	return options;
}
