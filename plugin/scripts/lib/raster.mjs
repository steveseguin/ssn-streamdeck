import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

export const DESIGN_SIZE = 144;
export const SUPERSAMPLE = 4;

export function renderKey(config, outputSize, drawMark) {
	const canvas = createCanvas(outputSize * SUPERSAMPLE, outputSize * SUPERSAMPLE);
	fillBackground(canvas, config);
	drawGlass(canvas);
	drawMark(canvas, config);
	return downsample(canvas, outputSize, outputSize);
}

export function createCanvas(width, height) {
	return {
		width,
		height,
		unit: width / DESIGN_SIZE,
		pixels: new Uint8Array(width * height * 4)
	};
}

export function fillBackground(canvas, config) {
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

export function drawGlass(canvas) {
	drawCircle(canvas, 34, 26, 46, [255, 255, 255, 18]);
	drawLine(canvas, 28, 126, 116, 18, [255, 255, 255, 15], 2);
	drawRoundedRect(canvas, 15, 15, 114, 114, 24, [255, 255, 255, 10]);
}

export function drawRoundedRect(canvas, x, y, width, height, radius, color, offsetX = 0, offsetY = 0) {
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

export function drawCircle(canvas, cx, cy, radius, color, offsetX = 0, offsetY = 0) {
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

export function drawRing(canvas, cx, cy, radius, thickness, color, offsetX = 0, offsetY = 0) {
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

// Ring segment with round caps. Angles are degrees in screen space (0 = right, 90 = down);
// a positive sweep travels clockwise on screen, a negative sweep counter-clockwise.
export function drawArc(canvas, cx, cy, radius, thickness, startDeg, sweepDeg, color, offsetX = 0, offsetY = 0) {
	const start = sweepDeg >= 0 ? startDeg : startDeg + sweepDeg;
	const sweep = Math.min(360, Math.abs(sweepDeg));
	const scx = toPx(canvas, cx + offsetX);
	const scy = toPx(canvas, cy + offsetY);
	const sr = toPx(canvas, radius);
	const inner = Math.max(0, sr - toPx(canvas, thickness));
	for (let y = scy - sr; y <= scy + sr; y += 1) {
		for (let x = scx - sr; x <= scx + sr; x += 1) {
			const d = (x - scx) * (x - scx) + (y - scy) * (y - scy);
			if (d > sr * sr || d < inner * inner) continue;
			const angle = (Math.atan2(y - scy, x - scx) * 180) / Math.PI;
			const relative = (((angle - start) % 360) + 360) % 360;
			if (relative <= sweep) {
				blendPixel(canvas, x, y, color);
			}
		}
	}
	const middle = radius - thickness / 2;
	for (const end of [start, start + sweep]) {
		const radians = (end * Math.PI) / 180;
		drawCircle(canvas, cx + middle * Math.cos(radians), cy + middle * Math.sin(radians), thickness / 2, color, offsetX, offsetY);
	}
}

// Circular arrow: an arc with a triangular head at the end of travel.
export function drawArcArrow(canvas, cx, cy, radius, thickness, startDeg, sweepDeg, headLength, headWidth, color, offsetX = 0, offsetY = 0) {
	drawArc(canvas, cx, cy, radius, thickness, startDeg, sweepDeg, color, offsetX, offsetY);
	const end = ((startDeg + sweepDeg) * Math.PI) / 180;
	const middle = radius - thickness / 2;
	const direction = sweepDeg >= 0 ? 1 : -1;
	const px = cx + middle * Math.cos(end);
	const py = cy + middle * Math.sin(end);
	const tx = -Math.sin(end) * direction;
	const ty = Math.cos(end) * direction;
	const nx = Math.cos(end);
	const ny = Math.sin(end);
	drawPolygon(canvas, [
		[px + tx * headLength, py + ty * headLength],
		[px + nx * headWidth / 2, py + ny * headWidth / 2],
		[px - nx * headWidth / 2, py - ny * headWidth / 2]
	], color, offsetX, offsetY);
}

export function drawLine(canvas, x1, y1, x2, y2, color, width, offsetX = 0, offsetY = 0) {
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

export function drawPolygon(canvas, points, color, offsetX = 0, offsetY = 0) {
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

export function starPoints(cx, cy, outerRadius, innerRadius, points = 5) {
	const result = [];
	for (let i = 0; i < points * 2; i += 1) {
		const radius = i % 2 === 0 ? outerRadius : innerRadius;
		const angle = -Math.PI / 2 + (i * Math.PI) / points;
		result.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
	}
	return result;
}

export function almondPoints(cx, cy, width, height, segments = 24) {
	const result = [];
	for (let i = 0; i <= segments; i += 1) {
		const t = -1 + (2 * i) / segments;
		result.push([cx + (t * width) / 2, cy - (height / 2) * (1 - t * t)]);
	}
	for (let i = segments; i >= 0; i -= 1) {
		const t = -1 + (2 * i) / segments;
		result.push([cx + (t * width) / 2, cy + (height / 2) * (1 - t * t)]);
	}
	return result;
}

export function rotatePoints(points, cx, cy, degrees) {
	const radians = (degrees * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return points.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
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

export function toPx(canvas, value) {
	return Math.round(value * canvas.unit);
}

export function mix(a, b, t) {
	return [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t)
	];
}

export function setPixel(canvas, x, y, color, alpha = 255) {
	if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
		return;
	}
	const index = (y * canvas.width + x) * 4;
	canvas.pixels[index] = color[0];
	canvas.pixels[index + 1] = color[1];
	canvas.pixels[index + 2] = color[2];
	canvas.pixels[index + 3] = alpha;
}

export function blendPixel(canvas, x, y, color) {
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

export function downsample(canvas, width, height) {
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

// Lays out equally sized RGBA tiles on a grid; used for review contact sheets.
export function composeSheet(tiles, tileSize, columns, gap = 8, background = [10, 12, 18]) {
	const rows = Math.ceil(tiles.length / columns);
	const width = columns * tileSize + (columns + 1) * gap;
	const height = rows * tileSize + (rows + 1) * gap;
	const pixels = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i += 1) {
		pixels[i * 4] = background[0];
		pixels[i * 4 + 1] = background[1];
		pixels[i * 4 + 2] = background[2];
		pixels[i * 4 + 3] = 255;
	}
	tiles.forEach((tile, index) => {
		const originX = gap + (index % columns) * (tileSize + gap);
		const originY = gap + Math.floor(index / columns) * (tileSize + gap);
		for (let y = 0; y < tileSize; y += 1) {
			const source = y * tileSize * 4;
			const target = ((originY + y) * width + originX) * 4;
			pixels.set(tile.subarray(source, source + tileSize * 4), target);
		}
	});
	return { pixels, width, height };
}

export async function writePng(path, pixels, width, height) {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y += 1) {
		const row = y * (width * 4 + 1);
		raw[row] = 0;
		Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
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
