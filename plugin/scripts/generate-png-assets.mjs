import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const SIZE = 144;
const assets = {
	category: { bg: [18, 24, 34], fg: [74, 144, 226], mark: "grid" },
	command: { bg: [18, 24, 34], fg: [74, 144, 226], mark: "chat" },
	connection: { bg: [18, 24, 34], fg: [46, 204, 113], mark: "link" },
	custom: { bg: [26, 30, 40], fg: [245, 158, 11], mark: "bolt" },
	plugin: { bg: [18, 24, 34], fg: [74, 144, 226], mark: "broadcast" },
	"state-neutral": { bg: [31, 36, 48], fg: [148, 163, 184], mark: "dash" },
	"state-on": { bg: [16, 107, 63], fg: [255, 255, 255], mark: "check" }
};

for (const [name, config] of Object.entries(assets)) {
	const pixels = createCanvas(SIZE, SIZE, config.bg);
	drawMark(pixels, config.mark, config.fg);
	await writePng(join(process.cwd(), "imgs", name + ".png"), pixels, SIZE, SIZE);
	await writePng(join(process.cwd(), "imgs", name + "@2x.png"), scalePixels(pixels, SIZE, SIZE, 2), SIZE * 2, SIZE * 2);
}

function createCanvas(width, height, color) {
	const pixels = new Uint8Array(width * height * 4);
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i] = color[0];
		pixels[i + 1] = color[1];
		pixels[i + 2] = color[2];
		pixels[i + 3] = 255;
	}
	return pixels;
}

function drawMark(pixels, mark, color) {
	if (mark === "broadcast") {
		drawCircle(pixels, 72, 72, 13, color);
		drawRing(pixels, 72, 72, 38, 7, color);
		drawRing(pixels, 72, 72, 58, 7, [147, 197, 253]);
		return;
	}
	if (mark === "chat") {
		drawRoundedRect(pixels, 28, 34, 88, 62, 12, color);
		drawPolygon(pixels, [[52, 96], [44, 120], [76, 96]], color);
		drawRect(pixels, 44, 52, 56, 8, [18, 24, 34]);
		drawRect(pixels, 44, 72, 38, 8, [18, 24, 34]);
		return;
	}
	if (mark === "grid") {
		for (let y = 34; y <= 86; y += 30) {
			for (let x = 34; x <= 86; x += 30) {
				drawRoundedRect(pixels, x, y, 24, 24, 5, color);
			}
		}
		return;
	}
	if (mark === "link") {
		drawRing(pixels, 54, 72, 26, 9, color);
		drawRing(pixels, 90, 72, 26, 9, color);
		drawRect(pixels, 52, 66, 40, 12, color);
		return;
	}
	if (mark === "bolt") {
		drawPolygon(pixels, [[81, 18], [40, 80], [68, 80], [58, 126], [104, 58], [75, 58]], color);
		return;
	}
	if (mark === "check") {
		drawLine(pixels, 34, 75, 62, 101, color, 13);
		drawLine(pixels, 62, 101, 112, 42, color, 13);
		return;
	}
	drawRect(pixels, 36, 66, 72, 12, color);
}

function drawRoundedRect(pixels, x, y, width, height, radius, color) {
	for (let py = y; py < y + height; py += 1) {
		for (let px = x; px < x + width; px += 1) {
			const dx = px < x + radius ? x + radius - px : px >= x + width - radius ? px - (x + width - radius - 1) : 0;
			const dy = py < y + radius ? y + radius - py : py >= y + height - radius ? py - (y + height - radius - 1) : 0;
			if (dx * dx + dy * dy <= radius * radius || dx === 0 || dy === 0) {
				setPixel(pixels, px, py, color);
			}
		}
	}
}

function drawRect(pixels, x, y, width, height, color) {
	for (let py = y; py < y + height; py += 1) {
		for (let px = x; px < x + width; px += 1) {
			setPixel(pixels, px, py, color);
		}
	}
}

function drawCircle(pixels, cx, cy, radius, color) {
	for (let y = cy - radius; y <= cy + radius; y += 1) {
		for (let x = cx - radius; x <= cx + radius; x += 1) {
			if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius) {
				setPixel(pixels, x, y, color);
			}
		}
	}
}

function drawRing(pixels, cx, cy, radius, thickness, color) {
	const inner = radius - thickness;
	for (let y = cy - radius; y <= cy + radius; y += 1) {
		for (let x = cx - radius; x <= cx + radius; x += 1) {
			const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
			if (d <= radius * radius && d >= inner * inner) {
				setPixel(pixels, x, y, color);
			}
		}
	}
}

function drawLine(pixels, x1, y1, x2, y2, color, width) {
	const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
	for (let i = 0; i <= steps; i += 1) {
		const t = steps === 0 ? 0 : i / steps;
		drawCircle(pixels, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), Math.floor(width / 2), color);
	}
}

function drawPolygon(pixels, points, color) {
	const minX = Math.floor(Math.min(...points.map(point => point[0])));
	const maxX = Math.ceil(Math.max(...points.map(point => point[0])));
	const minY = Math.floor(Math.min(...points.map(point => point[1])));
	const maxY = Math.ceil(Math.max(...points.map(point => point[1])));
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			if (pointInPolygon(x, y, points)) {
				setPixel(pixels, x, y, color);
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

function setPixel(pixels, x, y, color) {
	if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
		return;
	}
	const index = (y * SIZE + x) * 4;
	pixels[index] = color[0];
	pixels[index + 1] = color[1];
	pixels[index + 2] = color[2];
	pixels[index + 3] = 255;
}

function scalePixels(pixels, width, height, scale) {
	const scaled = new Uint8Array(width * scale * height * scale * 4);
	const scaledWidth = width * scale;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const source = (y * width + x) * 4;
			for (let sy = 0; sy < scale; sy += 1) {
				for (let sx = 0; sx < scale; sx += 1) {
					const target = ((y * scale + sy) * scaledWidth + x * scale + sx) * 4;
					scaled[target] = pixels[source];
					scaled[target + 1] = pixels[source + 1];
					scaled[target + 2] = pixels[source + 2];
					scaled[target + 3] = pixels[source + 3];
				}
			}
		}
	}
	return scaled;
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
