import { join } from "node:path";
import { drawCircle, drawLine, drawPolygon, drawRing, drawRoundedRect, renderKey, writePng } from "./lib/raster.mjs";

const KEY_SIZE = 72;
const assets = {
	category: {
		bgA: [21, 28, 39],
		bgB: [35, 45, 60],
		fg: [87, 166, 255],
		fg2: [75, 214, 185],
		mark: "grid"
	},
	command: {
		bgA: [18, 24, 34],
		bgB: [36, 42, 57],
		fg: [88, 166, 255],
		fg2: [176, 214, 255],
		mark: "preset"
	},
	connection: {
		bgA: [18, 26, 34],
		bgB: [24, 48, 48],
		fg: [71, 214, 185],
		fg2: [205, 255, 239],
		mark: "link"
	},
	custom: {
		bgA: [28, 27, 35],
		bgB: [49, 39, 28],
		fg: [255, 190, 86],
		fg2: [255, 241, 202],
		mark: "bolt"
	},
	"state-neutral": {
		bgA: [31, 36, 48],
		bgB: [42, 48, 63],
		fg: [172, 184, 204],
		fg2: [226, 232, 240],
		mark: "dash"
	},
	"state-on": {
		bgA: [16, 112, 69],
		bgB: [23, 145, 97],
		fg: [255, 255, 255],
		fg2: [188, 255, 218],
		mark: "check"
	}
};
const pluginAsset = {
	bgA: [18, 24, 34],
	bgB: [34, 44, 60],
	fg: [88, 166, 255],
	fg2: [75, 214, 185],
	mark: "broadcast"
};
const encoderAssets = {
	timer: {
		bgA: [13, 25, 40],
		bgB: [22, 55, 67],
		fg: [56, 189, 248],
		fg2: [45, 212, 191],
		mark: "clock"
	},
	"chat-feed": {
		bgA: [15, 27, 39],
		bgB: [25, 57, 58],
		fg: [45, 212, 191],
		fg2: [186, 230, 253],
		mark: "review"
	}
};

for (const [name, config] of Object.entries(assets)) {
	await writePng(join(process.cwd(), "imgs", name + ".png"), renderAsset(config, KEY_SIZE), KEY_SIZE, KEY_SIZE);
	await writePng(join(process.cwd(), "imgs", name + "@2x.png"), renderAsset(config, KEY_SIZE * 2), KEY_SIZE * 2, KEY_SIZE * 2);
}

await writePng(join(process.cwd(), "imgs", "plugin.png"), renderAsset(pluginAsset, 256), 256, 256);
await writePng(join(process.cwd(), "imgs", "plugin@2x.png"), renderAsset(pluginAsset, 512), 512, 512);

for (const [name, config] of Object.entries(encoderAssets)) {
	await writePng(join(process.cwd(), "imgs", name + ".png"), renderAsset(config, 72), 72, 72);
	await writePng(join(process.cwd(), "imgs", name + "@2x.png"), renderAsset(config, 144), 144, 144);
}

function renderAsset(config, outputSize) {
	return renderKey(config, outputSize, drawMark);
}

function drawMark(canvas, config) {
	const shadow = [0, 0, 0, 82];
	const fg = [...config.fg, 255];
	const fg2 = [...config.fg2, 255];

	if (config.mark === "broadcast") {
		drawRing(canvas, 72, 74, 47, 8, shadow, 0, 3);
		drawRing(canvas, 72, 74, 47, 8, fg);
		drawRing(canvas, 72, 74, 30, 7, fg2);
		drawCircle(canvas, 72, 74, 12, shadow, 0, 3);
		drawCircle(canvas, 72, 74, 12, fg);
		drawRoundedRect(canvas, 45, 96, 54, 22, 8, shadow, 0, 3);
		drawRoundedRect(canvas, 45, 96, 54, 22, 8, fg2);
		return;
	}

	if (config.mark === "preset") {
		// Fallback key for the Preset Command action: a key face with a play mark.
		// Individual presets replace this at runtime with imgs/commands/*.png.
		drawRoundedRect(canvas, 30, 14, 84, 76, 14, shadow, 0, 4);
		drawRoundedRect(canvas, 30, 14, 84, 76, 14, fg);
		drawRoundedRect(canvas, 38, 22, 68, 60, 9, [11, 18, 28, 255]);
		drawPolygon(canvas, [[60, 36], [60, 68], [90, 52]], fg2);
		return;
	}

	if (config.mark === "grid") {
		for (let y = 33; y <= 87; y += 27) {
			for (let x = 33; x <= 87; x += 27) {
				drawRoundedRect(canvas, x, y, 22, 22, 6, shadow, 0, 3);
				drawRoundedRect(canvas, x, y, 22, 22, 6, fg);
			}
		}
		drawRoundedRect(canvas, 73, 101, 36, 12, 6, fg2);
		return;
	}

	if (config.mark === "link") {
		drawRing(canvas, 54, 72, 26, 9, shadow, 0, 4);
		drawRing(canvas, 91, 72, 26, 9, shadow, 0, 4);
		drawRing(canvas, 54, 72, 26, 9, fg);
		drawRing(canvas, 91, 72, 26, 9, fg);
		drawRoundedRect(canvas, 51, 65, 43, 14, 7, fg2);
		drawCircle(canvas, 72, 72, 7, [20, 37, 39, 255]);
		return;
	}

	if (config.mark === "bolt") {
		const points = [[82, 10], [39, 64], [68, 64], [58, 103], [105, 45], [76, 45]];
		drawPolygon(canvas, points, shadow, 0, 4);
		drawPolygon(canvas, points, fg);
		drawLine(canvas, 40, 29, 25, 59, fg2, 6);
		drawLine(canvas, 110, 56, 94, 86, fg2, 6);
		return;
	}

	if (config.mark === "check") {
		drawLine(canvas, 34, 75, 62, 101, shadow, 14, 0, 4);
		drawLine(canvas, 62, 101, 112, 42, shadow, 14, 0, 4);
		drawLine(canvas, 34, 75, 62, 101, fg, 14);
		drawLine(canvas, 62, 101, 112, 42, fg, 14);
		drawCircle(canvas, 112, 42, 3, fg2);
		return;
	}

	if (config.mark === "clock") {
		drawRing(canvas, 72, 74, 44, 8, shadow, 0, 3);
		drawRing(canvas, 72, 74, 44, 8, fg);
		drawLine(canvas, 72, 74, 72, 45, fg2, 8);
		drawLine(canvas, 72, 74, 94, 87, fg2, 8);
		drawRoundedRect(canvas, 54, 18, 36, 10, 5, fg2);
		return;
	}

	if (config.mark === "review") {
		drawRoundedRect(canvas, 20, 38, 96, 66, 14, shadow, 0, 4);
		drawRoundedRect(canvas, 20, 38, 96, 66, 14, fg);
		drawPolygon(canvas, [[45, 102], [36, 123], [68, 102]], fg);
		drawRoundedRect(canvas, 37, 60, 55, 8, 4, [12, 24, 36, 255]);
		drawRoundedRect(canvas, 37, 81, 37, 8, 4, [12, 24, 36, 255]);
		drawCircle(canvas, 106, 38, 24, [12, 24, 36, 255]);
		drawRing(canvas, 106, 38, 19, 5, fg2);
		drawLine(canvas, 106, 38, 106, 27, fg2, 4);
		drawLine(canvas, 106, 38, 115, 43, fg2, 4);
		return;
	}

	drawRoundedRect(canvas, 35, 67, 74, 11, 5, shadow, 0, 3);
	drawRoundedRect(canvas, 35, 67, 74, 11, 5, fg);
}
