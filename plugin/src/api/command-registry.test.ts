import { describe, expect, it } from "vitest";
import { buildCustomCommandPayload, buildSsnCommandPayload, parseValue } from "./command-registry.js";

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

	it("builds custom commands", () => {
		expect(buildCustomCommandPayload({ action: "sendChat", value: "Hello" })).toEqual({
			action: "sendChat",
			value: "Hello"
		});
	});

	it("parses primitive and JSON values", () => {
		expect(parseValue("true")).toBe(true);
		expect(parseValue("false")).toBe(false);
		expect(parseValue("null")).toBeNull();
		expect(parseValue("{\"a\":1}")).toEqual({ a: 1 });
		expect(parseValue("hello")).toBe("hello");
	});
});
