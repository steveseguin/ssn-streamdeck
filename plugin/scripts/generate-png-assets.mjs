import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const BASE_SIZE = 144;
const SUPERSAMPLE = 4;
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
		mark: "chat"
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
	await writePng(join(process.cwd(), "imgs", name + ".png"), renderAsset(config, BASE_SIZE), BASE_SIZE, BASE_SIZE);
	await writePng(join(process.cwd(), "imgs", name + "@2x.png"), renderAsset(config, BASE_SIZE * 2), BASE_SIZE * 2, BASE_SIZE * 2);
}

await writePng(join(process.cwd(), "imgs", "plugin.png"), renderAsset(pluginAsset, 256), 256, 256);
await writePng(join(process.cwd(), "imgs", "plugin@2x.png"), renderAsset(pluginAsset, 512), 512, 512);

for (const [name, config] of Object.entries(encoderAssets)) {
	await writePng(join(process.cwd(), "imgs", name + ".png"), renderAsset(config, 72), 72, 72);
	await writePng(join(process.cwd(), "imgs", name + "@2x.png"), renderAsset(config, 144), 144, 144);
}

function renderAsset(config, outputSize) {
	const canvas = createCanvas(outputSize * SUPERSAMPLE, outputSize * SUPERSAMPLE);
	fillBackground(canvas, config);
	drawGlass(canvas);
	drawMark(canvas, config);
	return downsample(canvas, outputSize, outputSize);
}

function createCanvas(width, height) {
	return {
		width,
		height,
		unit: width / BASE_SIZE,
		pixels: new Uint8Array(width * height * 4)
	};
}

function fillBackground(canvas, config) {
	const cx = canvas.width / 2;
	const cy = canvas.height / 2;
	const maxDistance = Math.sqrt(cx * cx + cy * cy);
	for (let y = 0; y < canvas.height; y += 1) {
		for (let x = 0; x < canvas.width; x += 1) {
			const diagonal = (x + y) / (canvas.width + canvas.height);
			const distance = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxDistance;
			const base = mix(config.bgA, config.bgB, diagonal);
			const lifted = mix(base, [58, 70, 91], Math.max(0, .28 - distance) * .45);
			const shaded = mix(lifted, [5, 8, 14], Math.max(0, distance - .54) * .55);
			setPixel(canvas, x, y, shaded, 255);
		}
	}
}

function drawGlass(canvas) {
	drawCircle(canvas, 34, 26, 46, [255, 255, 255, 18]);
	drawLine(canvas, 28, 126, 116, 18, [255, 255, 255, 15], 2);
	drawRoundedRect(canvas, 15, 15, 114, 114, 24, [255, 255, 255, 10]);
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

	if (config.mark === "chat") {
		drawRoundedRect(canvas, 25, 32, 94, 64, 15, shadow, 0, 4);
		drawRoundedRect(canvas, 25, 32, 94, 64, 15, fg);
		drawPolygon(canvas, [[50, 94], [40, 119], [76, 94]], shadow, 0, 4);
		drawPolygon(canvas, [[50, 94], [40, 119], [76, 94]], fg);
		drawRoundedRect(canvas, 42, 51, 61, 8, 4, [11, 18, 28, 255]);
		drawRoundedRect(canvas, 42, 72, 42, 8, 4, [11, 18, 28, 255]);
		drawCircle(canvas, 103, 76, 5, fg2);
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
		const points = [[82, 18], [39, 80], [68, 80], [58, 126], [105, 58], [76, 58]];
		drawPolygon(canvas, points, shadow, 0, 4);
		drawPolygon(canvas, points, fg);
		drawLine(canvas, 40, 40, 25, 72, fg2, 6);
		drawLine(canvas, 110, 72, 94, 104, fg2, 6);
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
		drawRoundedRect(canvas, 22, 28, 100, 72, 14, shadow, 0, 4);
		drawRoundedRect(canvas, 22, 28, 100, 72, 14, fg);
		drawPolygon(canvas, [[45, 98], [36, 120], [68, 98]], fg);
		drawRoundedRect(canvas, 39, 48, 66, 8, 4, [12, 24, 36, 255]);
		drawRoundedRect(canvas, 39, 70, 44, 8, 4, [12, 24, 36, 255]);
		drawCircle(canvas, 104, 74, 5, fg2);
		return;
	}

	drawRoundedRect(canvas, 35, 67, 74, 11, 5, shadow, 0, 3);
	drawRoundedRect(canvas, 35, 67, 74, 11, 5, fg);
}

function drawRoundedRect(canvas, x, y, width, height, radius, color, offsetX = 0, offsetY = 0) {
	const sx = toPx(canvas, x + offsetX);
	const sy = toPx(canvas, y + offsetY);
	const sw = toPx(canvas, width);
	const sh = toPx(canvas, height);
	const sr = toPx(canvas, radius);
	for (let py = sy; py < sy + sh; py += 1) {
		for (let px = sx; px < sx + sw; px += 1) {
			const dx = px < sx + sr ? sx + sr - px : px >= sx + sw - sr ? px - (sx + sw - sr - 1) : 0;
			const dy = py < sy + sr ? sy + sr - py : py >= sy + sh - sr ? py - (sy + sh - sr - 1) : 0;
			if (dx * dx + dy * dy <= sr * sr || dx === 0 || dy === 0) {
				blendPixel(canvas, px, py, color);
			}
		}
	}
}

function drawCircle(canvas, cx, cy, radius, color, offsetX = 0, offsetY = 0) {
	const scx = toPx(canvas, cx + offsetX);
	const scy = toPx(canvas, cy + offsetY);
	const sr = toPx(canvas, radius);
	for (let y = scy - sr; y <= scy + sr; y += 1) {
		for (let x = scx - sr; x <= scx + sr; x += 1) {
			if ((x - scx) * (x - scx) + (y - scy) * (y - scy) <= sr * sr) {
				blendPixel(canvas, x, y, color);
			}
		}
	}
}

function drawRing(canvas, cx, cy, radius, thickness, color, offsetX = 0, offsetY = 0) {
	const scx = toPx(canvas, cx + offsetX);
	const scy = toPx(canvas, cy + offsetY);
	const sr = toPx(canvas, radius);
	const inner = Math.max(0, sr - toPx(canvas, thickness));
	for (let y = scy - sr; y <= scy + sr; y += 1) {
		for (let x = scx - sr; x <= scx + sr; x += 1) {
			const d = (x - scx) * (x - scx) + (y - scy) * (y - scy);
			if (d <= sr * sr && d >= inner * inner) {
				blendPixel(canvas, x, y, color);
			}
		}
	}
}

function drawLine(canvas, x1, y1, x2, y2, color, width, offsetX = 0, offsetY = 0) {
	const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
	for (let i = 0; i <= steps; i += 1) {
		const t = steps === 0 ? 0 : i / steps;
		drawCircle(
			canvas,
			x1 + (x2 - x1) * t + offsetX,
			y1 + (y2 - y1) * t + offsetY,
			width / 2,
			color
		);
	}
}

function drawPolygon(canvas, points, color, offsetX = 0, offsetY = 0) {
	const scaled = points.map(point => [toPx(canvas, point[0] + offsetX), toPx(canvas, point[1] + offsetY)]);
	const minX = Math.floor(Math.min(...scaled.map(point => point[0])));
	const maxX = Math.ceil(Math.max(...scaled.map(point => point[0])));
	const minY = Math.floor(Math.min(...scaled.map(point => point[1])));
	const maxY = Math.ceil(Math.max(...scaled.map(point => point[1])));
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			if (pointInPolygon(x, y, scaled)) {
				blendPixel(canvas, x, y, color);
			}
		}
	}
}

function pointInPolygon(x, y, points) {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
		const xi = points[i][0];
		const yi = points[i][1];
		const xj = points[j][0];
		const yj = points[j][1];
		const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersect) {
			inside = !inside;
		}
	}
	return inside;
}

function toPx(canvas, value) {
	return Math.round(value * canvas.unit);
}

function mix(a, b, t) {
	return [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t)
	];
}

function setPixel(canvas, x, y, color, alpha = 255) {
	if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
		return;
	}
	const index = (y * canvas.width + x) * 4;
	canvas.pixels[index] = color[0];
	canvas.pixels[index + 1] = color[1];
	canvas.pixels[index + 2] = color[2];
	canvas.pixels[index + 3] = alpha;
}

function blendPixel(canvas, x, y, color) {
	if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
		return;
	}
	const alpha = (color[3] ?? 255) / 255;
	const index = (y * canvas.width + x) * 4;
	canvas.pixels[index] = Math.round(canvas.pixels[index] * (1 - alpha) + color[0] * alpha);
	canvas.pixels[index + 1] = Math.round(canvas.pixels[index + 1] * (1 - alpha) + color[1] * alpha);
	canvas.pixels[index + 2] = Math.round(canvas.pixels[index + 2] * (1 - alpha) + color[2] * alpha);
	canvas.pixels[index + 3] = 255;
}

function downsample(canvas, width, height) {
	const output = new Uint8Array(width * height * 4);
	const block = SUPERSAMPLE * SUPERSAMPLE;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
				for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
					const source = ((y * SUPERSAMPLE + sy) * canvas.width + x * SUPERSAMPLE + sx) * 4;
					r += canvas.pixels[source];
					g += canvas.pixels[source + 1];
					b += canvas.pixels[source + 2];
					a += canvas.pixels[source + 3];
				}
			}
			const target = (y * width + x) * 4;
			output[target] = Math.round(r / block);
			output[target + 1] = Math.round(g / block);
			output[target + 2] = Math.round(b / block);
			output[target + 3] = Math.round(a / block);
		}
	}
	return output;
}

async function writePng(path, pixels, width, height) {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y += 1) {
		const row = y * (width * 4 + 1);
		raw[row] = 0;
		Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, row + 1);
	}
	const chunks = [
		chunk("IHDR", ihdr(width, height)),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0))
	];
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}

function ihdr(width, height) {
	const buffer = Buffer.alloc(13);
	buffer.writeUInt32BE(width, 0);
	buffer.writeUInt32BE(height, 4);
	buffer[8] = 8;
	buffer[9] = 6;
	return buffer;
}

function chunk(type, data) {
	const typeBuffer = Buffer.from(type);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const crcBuffer = Buffer.alloc(4);
	crcBuffer.writeUInt32BE(crc(Buffer.concat([typeBuffer, data])), 0);
	return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc(buffer) {
	let c = 0xffffffff;
	for (const byte of buffer) {
		c ^= byte;
		for (let k = 0; k < 8; k += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
	}
	return (c ^ 0xffffffff) >>> 0;
}
