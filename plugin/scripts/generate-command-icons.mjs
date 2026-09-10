// Renders one key image per preset command icon (imgs/commands/<family>-<modifier>.png).
// Icon names come from the `icon` field in src/api/command-registry.ts; each name is a
// family glyph (what the command touches) plus a modifier badge (what the command does).
// Pass --sheet=<path.png> to also write a contact sheet in registry order for review.
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	almondPoints,
	composeSheet,
	drawArc,
	drawArcArrow,
	drawCircle,
	drawLine,
	drawPolygon,
	drawRing,
	drawRoundedRect,
	mix,
	renderKey,
	rotatePoints,
	starPoints,
	writePng
} from "./lib/raster.mjs";

const KEY_SIZE = 144;
const BADGE_X = 110;
const BADGE_Y = 70;
const BADGE_RADIUS = 19;
const BADGE_RIM = 23;
const DARK = [11, 18, 28];
const SHADOW = [0, 0, 0, 82];
const WHITE = [255, 255, 255];
const INK = [14, 19, 28];
const ALERT = [251, 113, 133];

const GREEN = [34, 197, 94];
const RED = [239, 68, 68];
const AMBER = [251, 191, 36];
const ORANGE = [249, 115, 22];
const BLUE = [59, 130, 246];
const TEAL = [20, 184, 166];
const PURPLE = [168, 85, 247];
const SLATE = [100, 116, 139];
const INDIGO = [99, 102, 241];
const VIOLET = [139, 92, 246];
const SKY = [14, 165, 233];
const DEEP_AMBER = [245, 158, 11];

const FAMILIES = {
	workflow: { tint: [71, 214, 185], draw: drawWorkflow },
	product: { tint: [167, 139, 250], draw: drawProduct },
	queue: { tint: [88, 166, 255], draw: drawQueue },
	overlay: { tint: [34, 211, 238], draw: drawOverlay },
	dock: { tint: [56, 189, 248], draw: drawDock },
	message: { tint: [96, 165, 250], draw: drawMessage },
	messages: { tint: [96, 165, 250], draw: drawMessages },
	encoded: { tint: [96, 165, 250], draw: drawEncoded },
	history: { tint: [148, 163, 184], draw: drawHistory },
	credits: { tint: [250, 204, 21], draw: drawCredits },
	leaderboard: { tint: [251, 146, 60], draw: drawLeaderboard },
	pin: { tint: [251, 113, 133], draw: drawPin },
	draw: { tint: [232, 121, 249], draw: drawPencil },
	waitlist: { tint: [45, 212, 191], draw: drawWaitlist },
	trophy: { tint: [250, 204, 21], draw: drawTrophy },
	timer: { tint: [56, 189, 248], draw: drawTimer },
	poll: { tint: [167, 139, 250], draw: drawPoll },
	map: { tint: [74, 222, 128], draw: drawMap },
	source: { tint: [129, 140, 248], draw: drawSource },
	sources: { tint: [129, 140, 248], draw: drawSources },
	mute: { tint: [251, 191, 36], draw: drawMute },
	speaker: { tint: [251, 191, 36], draw: drawSpeaker },
	eye: { tint: [52, 211, 153], draw: drawEye },
	plug: { tint: [71, 214, 185], draw: drawPlug },
	settings: { tint: [172, 184, 204], draw: drawGear }
};

const MODIFIERS = {
	hide: { badge: SLATE, symbol: WHITE, draw: badgeStop },
	play: { badge: GREEN, symbol: WHITE, draw: badgePlay },
	resume: { badge: GREEN, symbol: WHITE, draw: badgeResume },
	open: { badge: GREEN, symbol: WHITE, draw: badgeOpen },
	add: { badge: GREEN, symbol: WHITE, draw: badgeAdd },
	pause: { badge: AMBER, symbol: INK, draw: badgePause },
	playpause: { badge: AMBER, symbol: INK, draw: badgePlayPause },
	stop: { badge: RED, symbol: WHITE, draw: badgeStop },
	remove: { badge: RED, symbol: WHITE, draw: badgeRemove },
	clear: { badge: RED, symbol: WHITE, draw: badgeClear },
	next: { badge: BLUE, symbol: WHITE, draw: badgeNext },
	send: { badge: BLUE, symbol: WHITE, draw: badgeSend },
	download: { badge: BLUE, symbol: WHITE, draw: badgeDownload },
	message: { badge: BLUE, symbol: WHITE, draw: badgeMessage },
	reset: { badge: ORANGE, symbol: WHITE, draw: badgeReset },
	restart: { badge: ORANGE, symbol: WHITE, draw: badgeRestart },
	preview: { badge: TEAL, symbol: WHITE, draw: badgePreview },
	test: { badge: PURPLE, symbol: WHITE, draw: badgeTest },
	list: { badge: SLATE, symbol: WHITE, draw: badgeList },
	settings: { badge: SLATE, symbol: WHITE, draw: badgeGear },
	info: { badge: INDIGO, symbol: WHITE, draw: badgeInfo },
	count: { badge: INDIGO, symbol: WHITE, draw: badgeCount },
	highlight: { badge: DEEP_AMBER, symbol: INK, draw: badgeStar },
	toggle: { badge: VIOLET, symbol: WHITE, draw: badgeToggle },
	edit: { badge: SKY, symbol: WHITE, draw: badgeEdit },
	load: { badge: AMBER, symbol: INK, draw: badgeFolder }
};

const registry = await readFile(join(process.cwd(), "src", "api", "command-registry.ts"), "utf8");
const declaredCommandCount = Array.from(registry.matchAll(/\{ id: "/g)).length;
const commands = Array.from(
	registry.matchAll(/\{ id: "([^"]+)", label: "[^"]+", scope: "(?:ssn|ssapp)", icon: "([^"]+)"/g),
	match => ({ id: match[1], icon: match[2] })
);
if (!commands.length) {
	throw new Error("No preset icons found in command-registry.ts");
}
if (commands.length !== declaredCommandCount) {
	throw new Error(`Parsed ${commands.length} of ${declaredCommandCount} preset icons from command-registry.ts`);
}

await rm(join(process.cwd(), "imgs", "commands"), { recursive: true, force: true });
const rendered = new Map();
for (const command of commands) {
	if (rendered.has(command.icon)) continue;
	const { family, modifier } = resolveIcon(command);
	const pixels = renderIcon(family, modifier);
	rendered.set(command.icon, pixels);
	await writePng(join(process.cwd(), "imgs", "commands", `${command.icon}.png`), pixels, KEY_SIZE, KEY_SIZE);
}
console.log(`Generated ${rendered.size} preset key icons for ${commands.length} commands`);

const sheetArgument = process.argv.find(argument => argument.startsWith("--sheet="));
if (sheetArgument) {
	const tiles = commands.map(command => rendered.get(command.icon));
	const sheet = composeSheet(tiles, KEY_SIZE, 8);
	await writePng(sheetArgument.slice("--sheet=".length), sheet.pixels, sheet.width, sheet.height);
	console.log(`Wrote contact sheet (${commands.length} tiles, registry order, 8 per row)`);
}

function resolveIcon(command) {
	const separator = command.icon.lastIndexOf("-");
	const familyName = separator === -1 ? command.icon : command.icon.slice(0, separator);
	const modifierName = separator === -1 ? null : command.icon.slice(separator + 1);
	const family = FAMILIES[familyName];
	const modifier = modifierName ? MODIFIERS[modifierName] : null;
	if (!family || (modifierName && !modifier)) {
		throw new Error(`Unknown icon "${command.icon}" for preset ${command.id} (expected <family>-<modifier>)`);
	}
	return { family, modifier };
}

function renderIcon(family, modifier) {
	const fg = family.tint;
	const ink = { fg, fg2: mix(fg, WHITE, .6), dark: DARK, alert: ALERT };
	const config = { bgA: mix([18, 24, 34], fg, .05), bgB: mix([36, 42, 57], fg, .16) };
	return renderKey(config, KEY_SIZE, canvas => {
		family.draw(painter(canvas, 3, SHADOW), ink);
		family.draw(painter(canvas), ink);
		if (modifier) {
			drawBadge(canvas, modifier);
		}
	});
}

function drawBadge(canvas, modifier) {
	painter(canvas, 3, SHADOW).circle(BADGE_X, BADGE_Y, BADGE_RIM, SHADOW);
	const p = painter(canvas);
	p.circle(BADGE_X, BADGE_Y, BADGE_RIM, DARK);
	p.circle(BADGE_X, BADGE_Y, BADGE_RADIUS, modifier.badge);
	modifier.draw(p, BADGE_X, BADGE_Y, modifier.symbol, modifier.badge);
}

// Small wrapper so glyphs can be drawn twice: once as a drop shadow, once for real.
function painter(canvas, offsetY = 0, override = null) {
	const color = value => override || value;
	return {
		rect: (x, y, w, h, r, c) => drawRoundedRect(canvas, x, y, w, h, r, color(c), 0, offsetY),
		circle: (cx, cy, r, c) => drawCircle(canvas, cx, cy, r, color(c), 0, offsetY),
		ring: (cx, cy, r, t, c) => drawRing(canvas, cx, cy, r, t, color(c), 0, offsetY),
		line: (x1, y1, x2, y2, w, c) => drawLine(canvas, x1, y1, x2, y2, color(c), w, 0, offsetY),
		poly: (points, c) => drawPolygon(canvas, points, color(c), 0, offsetY),
		arc: (cx, cy, r, t, start, sweep, c) => drawArc(canvas, cx, cy, r, t, start, sweep, color(c), 0, offsetY),
		arrow: (cx, cy, r, t, start, sweep, headLength, headWidth, c) =>
			drawArcArrow(canvas, cx, cy, r, t, start, sweep, headLength, headWidth, color(c), 0, offsetY)
	};
}

// ---- family glyphs (drawn around x 20..100, y 10..92; titles render below) ----

function drawPerson(p, cx, headY, headRadius, bodyWidth, bodyBottom, color) {
	const shoulderY = headY + headRadius + 4 + bodyWidth / 2;
	p.circle(cx, headY, headRadius, color);
	p.circle(cx, shoulderY, bodyWidth / 2, color);
	p.rect(cx - bodyWidth / 2, shoulderY, bodyWidth, bodyBottom - shoulderY, 0, color);
}

function drawQueue(p, ink) {
	drawPerson(p, 34, 30, 7, 24, 74, ink.fg);
	drawPerson(p, 86, 30, 7, 24, 74, ink.fg);
	drawPerson(p, 60, 36, 12, 38, 91, ink.dark);
	drawPerson(p, 60, 36, 9, 32, 88, ink.fg2);
}

function drawProduct(p, ink) {
    p.rect(42, 16, 38, 35, 12, ink.fg);
    p.rect(48, 22, 26, 25, 7, ink.dark);
    p.rect(27, 37, 69, 48, 6, ink.fg);
    p.rect(36, 46, 51, 30, 3, ink.dark);
}

function drawWorkflow(p, ink) {
    p.rect(49, 20, 6, 52, 2, ink.fg2);
    p.rect(49, 67, 40, 6, 2, ink.fg2);
    p.rect(30, 16, 45, 24, 5, ink.fg);
    p.rect(37, 22, 31, 12, 2, ink.dark);
    p.rect(65, 57, 31, 26, 5, ink.fg);
    p.rect(71, 63, 19, 14, 2, ink.dark);
}

function drawOverlay(p, ink) {
	p.rect(28, 16, 54, 42, 7, ink.fg2);
	p.rect(35, 23, 40, 28, 4, ink.dark);
	p.rect(44, 34, 62, 50, 10, ink.dark);
	p.rect(48, 38, 54, 42, 7, ink.fg);
}

function drawDock(p, ink) {
	p.rect(24, 18, 74, 64, 8, ink.fg);
	p.rect(30, 24, 62, 52, 4, ink.dark);
	p.rect(64, 24, 28, 52, 3, ink.fg2);
	for (const y of [32, 42, 52, 62]) {
		p.rect(69, y, 18, 4, 2, ink.dark);
	}
}

function drawMessage(p, ink) {
	p.rect(24, 18, 74, 48, 14, ink.fg);
	p.poly([[42, 64], [34, 84], [64, 64]], ink.fg);
	p.rect(38, 32, 46, 7, 3.5, ink.dark);
	p.rect(38, 46, 30, 7, 3.5, ink.dark);
	p.circle(82, 50, 5, ink.fg2);
}

function drawMessages(p, ink) {
	p.rect(40, 12, 62, 40, 12, ink.fg2);
	p.rect(47, 19, 48, 26, 7, ink.dark);
	p.rect(18, 30, 72, 48, 15, ink.dark);
	p.rect(22, 34, 64, 40, 12, ink.fg);
	p.poly([[38, 72], [30, 90], [60, 72]], ink.fg);
	p.rect(34, 46, 40, 7, 3.5, ink.dark);
	p.rect(34, 58, 26, 7, 3.5, ink.dark);
}

function drawEncoded(p, ink) {
	p.rect(24, 18, 74, 48, 14, ink.fg);
	p.poly([[42, 64], [34, 84], [64, 64]], ink.fg);
	p.ring(44, 34, 7, 4.5, ink.dark);
	p.ring(76, 50, 7, 4.5, ink.dark);
	p.line(48, 57, 72, 27, 5, ink.dark);
}

function drawHistory(p, ink) {
	p.arrow(60, 50, 32, 8, 170, -300, 12, 16, ink.fg);
	p.line(60, 50, 60, 33, 6, ink.fg2);
	p.line(60, 50, 71, 57, 6, ink.fg2);
}

function drawCredits(p, ink) {
	p.rect(26, 12, 68, 78, 8, ink.fg);
	p.rect(32, 18, 56, 66, 4, ink.dark);
	const rows = [[30, 30], [22, 43], [36, 56], [18, 69]];
	rows.forEach(([width, y], index) => {
		p.rect(60 - width / 2, y, width, 6, 3, index === 0 ? ink.fg2 : ink.fg);
	});
}

function drawLeaderboard(p, ink) {
	p.rect(26, 58, 22, 30, 4, ink.fg);
	p.rect(51, 40, 22, 48, 4, ink.fg2);
	p.rect(76, 66, 22, 22, 4, ink.fg);
	p.poly(starPoints(62, 24, 9, 3.8), ink.fg2);
}

function drawPin(p, ink) {
	p.rect(42, 12, 36, 10, 5, ink.fg2);
	p.rect(53, 20, 14, 22, 2, ink.fg);
	p.rect(34, 42, 52, 10, 5, ink.fg2);
	p.poly([[56, 52], [64, 52], [60, 88]], ink.fg);
}

function drawPencil(p, ink) {
	const d = [Math.SQRT1_2, -Math.SQRT1_2];
	const n = [Math.SQRT1_2, Math.SQRT1_2];
	const along = (t, side) => [36 + d[0] * t + n[0] * side, 74 + d[1] * t + n[1] * side];
	p.poly([along(0, 8), along(50, 8), along(50, -8), along(0, -8)], ink.fg);
	p.poly([along(42, 8), along(50, 8), along(50, -8), along(42, -8)], ink.fg2);
	p.poly([along(-14, 0), along(0, 8), along(0, -8)], ink.fg2);
	p.poly([along(-14, 0), along(-8, 3.4), along(-8, -3.4)], ink.dark);
}

function drawWaitlist(p, ink) {
	p.rect(24, 12, 72, 80, 8, ink.fg);
	p.rect(30, 18, 60, 68, 4, ink.dark);
	[28, 46, 64].forEach((y, index) => {
		const color = index === 0 ? ink.fg2 : ink.fg;
		p.circle(42, y + 4, 4.5, color);
		p.rect(51, y, 30, 8, 4, color);
	});
}

function drawTrophy(p, ink) {
	p.poly([[34, 14], [86, 14], [82, 44], [72, 58], [48, 58], [38, 44]], ink.fg);
	p.arc(32, 28, 12, 5, 90, 180, ink.fg);
	p.arc(88, 28, 12, 5, 270, 180, ink.fg);
	p.rect(54, 58, 12, 12, 2, ink.fg);
	p.rect(40, 70, 40, 10, 5, ink.fg2);
	p.poly(starPoints(60, 32, 10, 4.2), ink.dark);
}

function drawTimer(p, ink) {
	p.ring(60, 52, 32, 8, ink.fg);
	p.line(60, 52, 60, 32, 7, ink.fg2);
	p.line(60, 52, 76, 61, 7, ink.fg2);
	p.rect(48, 10, 24, 8, 4, ink.fg2);
}

function drawPoll(p, ink) {
	p.rect(28, 40, 16, 44, 4, ink.fg);
	p.rect(52, 20, 16, 64, 4, ink.fg2);
	p.rect(76, 54, 16, 30, 4, ink.fg);
	p.rect(22, 86, 76, 5, 2.5, ink.fg2);
}

function drawMap(p, ink) {
	p.circle(60, 40, 26, ink.fg);
	p.poly([[38, 54], [82, 54], [60, 90]], ink.fg);
	p.circle(60, 40, 11, ink.dark);
}

function drawSource(p, ink) {
	p.rect(22, 16, 76, 52, 6, ink.fg);
	p.rect(28, 22, 64, 40, 3, ink.dark);
	p.poly([[52, 32], [52, 52], [70, 42]], ink.fg2);
	p.rect(54, 68, 12, 8, 2, ink.fg);
	p.rect(40, 76, 40, 7, 3.5, ink.fg);
}

function drawSources(p, ink) {
	p.rect(36, 8, 64, 44, 6, ink.fg2);
	p.rect(42, 14, 52, 32, 3, ink.dark);
	p.rect(18, 26, 72, 52, 8, ink.dark);
	p.rect(22, 30, 64, 44, 6, ink.fg);
	p.rect(28, 36, 52, 32, 3, ink.dark);
	p.rect(48, 74, 12, 6, 2, ink.fg);
	p.rect(36, 80, 36, 6, 3, ink.fg);
}

function drawSpeakerBody(p, ink) {
	p.rect(26, 40, 14, 22, 3, ink.fg);
	p.poly([[40, 40], [62, 24], [62, 78], [40, 62]], ink.fg);
}

function drawSpeaker(p, ink) {
	drawSpeakerBody(p, ink);
	p.arc(66, 51, 14, 6, -40, 80, ink.fg2);
	p.arc(66, 51, 26, 6, -40, 80, ink.fg2);
}

function drawMute(p, ink) {
	drawSpeakerBody(p, ink);
	p.line(70, 42, 86, 58, 6, ink.alert);
	p.line(86, 42, 70, 58, 6, ink.alert);
}

function drawEye(p, ink) {
	p.poly(almondPoints(60, 50, 80, 46), ink.fg);
	p.poly(almondPoints(60, 50, 64, 32), ink.dark);
	p.circle(60, 50, 12, ink.fg2);
	p.circle(60, 50, 5, ink.dark);
}

function drawPlug(p, ink) {
	p.rect(40, 38, 40, 28, 7, ink.fg);
	p.rect(48, 18, 8, 22, 3, ink.fg2);
	p.rect(64, 18, 8, 22, 3, ink.fg2);
	p.line(60, 66, 60, 78, 6, ink.fg);
	p.line(60, 78, 76, 88, 6, ink.fg);
}

function drawGear(p, ink) {
	for (let index = 0; index < 8; index += 1) {
		p.poly(rotatePoints([[54, 16], [66, 16], [66, 30], [54, 30]], 60, 50, index * 45), ink.fg);
	}
	p.ring(60, 50, 26, 10, ink.fg);
	p.ring(60, 50, 10, 4, ink.fg2);
}

// ---- modifier badges (drawn inside a circle of radius 19 around bx, by) ----

function badgePlay(p, bx, by, s) {
	p.poly([[bx - 6, by - 9], [bx - 6, by + 9], [bx + 10, by]], s);
}

function badgeResume(p, bx, by, s) {
	p.rect(bx - 10, by - 8, 4, 16, 2, s);
	p.poly([[bx - 4, by - 8], [bx - 4, by + 8], [bx + 10, by]], s);
}

function badgeOpen(p, bx, by, s) {
	p.rect(bx - 8, by - 1, 16, 11, 2.5, s);
	p.arc(bx + 2, by - 8, 5, 3, 180, 180, s);
	p.line(bx + 5.5, by - 8, bx + 5.5, by - 1, 3, s);
	p.line(bx - 1.5, by - 8, bx - 1.5, by - 6.5, 3, s);
}

function badgeAdd(p, bx, by, s) {
	p.rect(bx - 9, by - 2, 18, 4, 2, s);
	p.rect(bx - 2, by - 9, 4, 18, 2, s);
}

function badgePause(p, bx, by, s) {
	p.rect(bx - 8, by - 8, 5.5, 16, 2, s);
	p.rect(bx + 2.5, by - 8, 5.5, 16, 2, s);
}

function badgePlayPause(p, bx, by, s) {
	p.poly([[bx - 10, by - 7], [bx - 10, by + 7], [bx - 1, by]], s);
	p.rect(bx + 2, by - 7, 3.5, 14, 1.5, s);
	p.rect(bx + 7, by - 7, 3.5, 14, 1.5, s);
}

function badgeStop(p, bx, by, s) {
	p.rect(bx - 8, by - 8, 16, 16, 3, s);
}

function badgeRemove(p, bx, by, s) {
	p.rect(bx - 9, by - 2, 18, 4, 2, s);
}

function badgeClear(p, bx, by, s) {
	p.line(bx - 7, by - 7, bx + 7, by + 7, 4, s);
	p.line(bx + 7, by - 7, bx - 7, by + 7, 4, s);
}

function badgeNext(p, bx, by, s) {
	p.poly([[bx - 9, by - 8], [bx - 9, by + 8], [bx + 3, by]], s);
	p.rect(bx + 5, by - 8, 4, 16, 2, s);
}

function badgeSend(p, bx, by, s) {
	p.line(bx - 8, by, bx + 2, by, 4, s);
	p.poly([[bx, by - 7], [bx, by + 7], [bx + 9, by]], s);
}

function badgeDownload(p, bx, by, s) {
	p.line(bx, by - 9, bx, by + 1, 4, s);
	p.poly([[bx - 7, by], [bx + 7, by], [bx, by + 7]], s);
	p.rect(bx - 9, by + 8, 18, 3.5, 1.75, s);
}

function badgeMessage(p, bx, by, s, badge) {
	p.rect(bx - 9, by - 8, 18, 13, 4, s);
	p.poly([[bx - 6, by + 4], [bx - 8, by + 10], [bx - 1, by + 4]], s);
	p.rect(bx - 5, by - 4, 10, 2, 1, badge);
	p.rect(bx - 5, by, 6, 2, 1, badge);
}

function badgeReset(p, bx, by, s) {
	p.arrow(bx, by, 10.5, 3.5, 150, -290, 6, 8, s);
}

function badgeRestart(p, bx, by, s) {
	p.arrow(bx, by, 10.5, 3.5, 30, 290, 6, 8, s);
}

function badgePreview(p, bx, by, s, badge) {
	p.poly(almondPoints(bx, by, 22, 13, 16), s);
	p.circle(bx, by, 4, badge);
}

function badgeTest(p, bx, by, s, badge) {
	p.poly([[bx - 4, by - 10], [bx + 4, by - 10], [bx + 4, by - 2], [bx + 10, by + 9], [bx - 10, by + 9], [bx - 4, by - 2]], s);
	p.rect(bx - 6, by - 12, 12, 3.5, 1.75, s);
	p.circle(bx - 2, by + 5, 2, badge);
	p.circle(bx + 3, by + 3, 1.5, badge);
}

function badgeList(p, bx, by, s) {
	for (let index = 0; index < 3; index += 1) {
		p.circle(bx - 8, by - 7 + index * 7, 2, s);
		p.rect(bx - 4, by - 9 + index * 7, 13, 4, 2, s);
	}
}

function badgeGear(p, bx, by, s) {
	for (let index = 0; index < 8; index += 1) {
		p.poly(rotatePoints([[bx - 1.75, by - 11], [bx + 1.75, by - 11], [bx + 1.75, by - 6], [bx - 1.75, by - 6]], bx, by, index * 45), s);
	}
	p.ring(bx, by, 7.5, 3.5, s);
}

function badgeInfo(p, bx, by, s) {
	p.circle(bx, by - 7, 2.75, s);
	p.rect(bx - 2.5, by - 2.5, 5, 12, 2.5, s);
}

function badgeCount(p, bx, by, s) {
	p.line(bx - 2.5, by - 9, bx - 4.5, by + 9, 3, s);
	p.line(bx + 4.5, by - 9, bx + 2.5, by + 9, 3, s);
	p.line(bx - 9, by - 3.5, bx + 9, by - 3.5, 3, s);
	p.line(bx - 9, by + 3.5, bx + 9, by + 3.5, 3, s);
}

function badgeStar(p, bx, by, s) {
	p.poly(starPoints(bx, by + .5, 11, 4.6), s);
}

function badgeToggle(p, bx, by, s, badge) {
	p.rect(bx - 11, by - 6, 22, 12, 6, s);
	p.circle(bx + 5, by, 4, badge);
}

function badgeEdit(p, bx, by, s, badge) {
	const d = [Math.SQRT1_2, -Math.SQRT1_2];
	const n = [Math.SQRT1_2, Math.SQRT1_2];
	const along = (t, side) => [bx - 6 + d[0] * t + n[0] * side, by + 6 + d[1] * t + n[1] * side];
	p.poly([along(0, 3), along(16, 3), along(16, -3), along(0, -3)], s);
	p.poly([along(-6, 0), along(0, 3), along(0, -3)], s);
	p.poly([along(11.5, 3), along(13, 3), along(13, -3), along(11.5, -3)], badge);
}

function badgeFolder(p, bx, by, s, badge) {
	p.rect(bx - 10, by - 8, 9, 6, 2, s);
	p.rect(bx - 10, by - 5, 20, 14, 2.5, s);
	p.rect(bx - 10, by - 2, 20, 1.5, 0, badge);
}
