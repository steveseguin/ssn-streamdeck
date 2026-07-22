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
	get?: string;
	target?: JsonValue;
	value?: JsonValue;
	tabId?: number;
}

export interface SsappSourceSummary extends JsonObject {
	id: string;
	target: string;
	tabId: number | null;
	username?: string;
	videoId?: string;
	status?: string;
}

export interface SsappCapabilities extends JsonObject {
	available?: boolean;
	runtime?: string | null;
	version?: string | null;
	apiVersion?: string | null;
	bridgeVersion?: number | null;
	appControls?: JsonObject | boolean;
	sourceControls?: JsonObject | boolean;
	bulkControls?: JsonObject | boolean;
	visibility?: JsonObject | boolean;
	mute?: JsonObject | boolean;
	connectionMode?: JsonObject | boolean;
	sourceStatus?: JsonObject | boolean;
	settings?: JsonObject | boolean;
	platforms?: JsonObject;
}

export interface StreamDeckCapabilities extends JsonObject {
	type: "capabilities";
	version: number;
	runtime?: string;
	ssapp?: SsappCapabilities;
	ssn?: JsonObject;
}

export interface SsnCommandSettings extends JsonObject {
	command?: string;
	target?: string;
	sourceId?: string;
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

export interface TimerDialSettings extends JsonObject {
	title?: string;
	stepSeconds?: number;
}

export interface ChatFeedSettings extends JsonObject {
	title?: string;
}
