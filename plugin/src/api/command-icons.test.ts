import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commandIconPath, isValidCommandIconName, loadCommandKeyImage } from "./command-icons.js";
import { COMMANDS } from "./command-registry.js";

const pluginRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("preset command icons", () => {
	it("gives every preset a generated key icon", () => {
		const missing = COMMANDS.filter(definition => !isValidCommandIconName(definition.icon) || !existsSync(commandIconPath(definition.icon, pluginRoot)));
		expect(missing.map(definition => `${definition.id} -> ${definition.icon}`)).toEqual([]);
	});

	it("shares the same icon for aliased waitlist message presets", () => {
		const icons = COMMANDS.filter(definition => definition.id.endsWith("waitlistmessage")).map(definition => definition.icon);
		expect(icons).toHaveLength(2);
		expect(new Set(icons).size).toBe(1);
	});

	it("loads icons as PNG data URLs and caches them", async () => {
		const first = loadCommandKeyImage("timer-play", pluginRoot);
		const second = loadCommandKeyImage("timer-play", pluginRoot);
		expect(second).toBe(first);
		const image = await first;
		expect(image).toMatch(/^data:image\/png;base64,iVBOR/);
		await expect(second).resolves.toBe(image);
	});

	it("falls back to the manifest image for unknown or unsafe icon names", async () => {
		await expect(loadCommandKeyImage("not-a-real-icon", pluginRoot)).resolves.toBeUndefined();
		await expect(loadCommandKeyImage("../manifest", pluginRoot)).resolves.toBeUndefined();
		await expect(loadCommandKeyImage(undefined, pluginRoot)).resolves.toBeUndefined();
	});
});
