// Keep the history buffer and dial display using the same definition of chat.
export function isDisplayableMessage(value: unknown): boolean {
	const raw = unwrapMessage(value);
	return !!raw && !!(literalText(raw.chatname) || messageText(raw) || raw.contentimg);
}

export function literalText(value: unknown): string {
	return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function messageText(raw: Record<string, unknown>): string {
	return raw.textonly === true ? literalText(raw.chatmessage) : plainText(raw.chatmessage);
}

export function unwrapMessage(value: unknown): Record<string, unknown> | null {
	if (!isRecord(value)) return null;
	if (isRecord(value.dataReceived) && isRecord(value.dataReceived.overlayNinja)) return value.dataReceived.overlayNinja;
	if (isRecord(value.data) && ("chatmessage" in value.data || "chatname" in value.data)) return value.data;
	return value;
}

export function plainText(value: unknown): string {
	if (typeof value !== "string") return "";
	return value
		.replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
