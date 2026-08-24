const MAX_LINE_PIXELS = 64;

export function formatDeviceTitle(value) {
	const text = String(value || "").replace(/\s+/g, " ").trim();
	if (!text) return "SSN\nCommand";
	const words = text.includes(" ") ? text.split(" ") : splitLongToken(text);
	const lines = [];
	let current = "";

	for (const word of words.flatMap(splitLongToken)) {
		const candidate = current ? `${current} ${word}` : word;
		if (!current || estimatedPixels(candidate) <= MAX_LINE_PIXELS) {
			current = candidate;
			continue;
		}
		lines.push(current);
		current = word;
	}
	if (current) lines.push(current);
	return lines.slice(0, 2).join("\n");
}

export function deviceTitleFits(value) {
	const text = String(value || "").replace(/\s+/g, " ").trim();
	if (!text) return false;
	const formatted = formatDeviceTitle(text);
	return formatted.replace(/\s/g, "") === text.replace(/\s/g, "") && formatted.split("\n").every(line => estimatedPixels(line) <= MAX_LINE_PIXELS);
}

function splitLongToken(token) {
	if (estimatedPixels(token) <= MAX_LINE_PIXELS) return [token];
	const chunks = [];
	let current = "";
	for (const character of [...token]) {
		if (current && estimatedPixels(current + character) > MAX_LINE_PIXELS) {
			chunks.push(current);
			current = character;
		} else {
			current += character;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

function estimatedPixels(value) {
	let em = 0;
	for (const character of [...value]) {
		if (/\s/u.test(character)) em += 0.32;
		else if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) em += 1;
		else if (/[MW@%&]/u.test(character)) em += 0.9;
		else if (/[A-ZÀ-Þ]/u.test(character)) em += 0.67;
		else if (/[ilI1.,:;!'|]/u.test(character)) em += 0.3;
		else em += 0.56;
	}
	return Math.ceil(em * 10);
}
