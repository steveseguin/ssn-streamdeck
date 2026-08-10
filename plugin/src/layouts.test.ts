import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Stream Deck + layouts", () => {
	for (const name of ["timer", "chat-feed"]) {
		it(`${name} covers the default Stream Deck placeholder`, () => {
			const layout = JSON.parse(readFileSync(new URL(`../layouts/${name}.json`, import.meta.url), "utf8")) as {
				items: Array<{ key?: string; rect?: number[]; background?: string; zOrder?: number }>;
			};
			const background = layout.items.find(item => item.key === "background");

			expect(background).toMatchObject({
				rect: [0, 0, 200, 100],
				background: "#0f172a",
				zOrder: 0
			});
			expect(layout.items.filter(item => item.key !== "background").every(item => (item.zOrder || 0) > 0)).toBe(true);
		});
	}
});
