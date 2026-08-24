import streamDeck from "@elgato/streamdeck";

export function translate(key: string, fallback: string, values?: Record<string, string | number>): string {
	let text = fallback;
	try {
		const translated = streamDeck.i18n.translate(key);
		if (translated && translated !== key) text = translated;
	} catch {
		// Unit tests and early startup may not have Stream Deck registration info yet.
	}
	for (const [name, value] of Object.entries(values || {})) {
		text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
	}
	return text;
}
