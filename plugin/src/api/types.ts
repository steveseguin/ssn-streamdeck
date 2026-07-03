import type { JsonObject, JsonValue } from "@elgato/utils";

export type ConnectionStateName = "missing-session" | "connecting" | "connected" | "disconnected" | "error";

export interface GlobalSettings extends JsonObject {
	sessionId?: string;
	apiHost?: string;
	useTls?: boolean;
	httpFallback?: boolean;
	inChannel?: number;
	outChannel?: number;
	requestTimeoutMs?: number;
}

export interface SsnCommandPayload extends JsonObject {
	action: string;
	apiid?: string;
	target?: JsonValue;
	value?: JsonValue;
}

export interface SsnCommandSettings extends JsonObject {
	command?: string;
	target?: string;
	value?: string;
	title?: string;
	awaitResponse?: boolean;
}

export interface CustomCommandSettings extends JsonObject {
	action?: string;
	target?: JsonValue;
	value?: JsonValue;
	title?: string;
	awaitResponse?: boolean;
}

export interface ConnectionStatusSettings extends JsonObject {
	title?: string;
}
