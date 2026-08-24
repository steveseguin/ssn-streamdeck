import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "./api/command-registry.js";
import { deviceTitleFits, formatDeviceTitle } from "./device-title.js";

const localeDirectory = new URL("../locales/", import.meta.url);
const expectedLocales = ["de", "en", "es", "fr", "ja", "ko", "zh_CN", "zh_TW"];
const actionIds = [
	"ninja.socialstream.streamdeck.connection",
	"ninja.socialstream.streamdeck.command",
	"ninja.socialstream.streamdeck.custom-command",
	"ninja.socialstream.streamdeck.timer-dial",
	"ninja.socialstream.streamdeck.chat-feed"
];

type Locale = {
	Name: string;
	Description: string;
	Localization: Record<string, string>;
	[key: string]: unknown;
};

type LocalizedAction = {
	Name?: string;
	Tooltip?: string;
	Encoder?: { TriggerDescription?: Record<string, string> };
};

function readLocale(name: string): Locale {
	return JSON.parse(readFileSync(new URL(`${name}.json`, localeDirectory), "utf8")) as Locale;
}

function placeholders(value: string): string[] {
	return (value.match(/\{[^{}]+\}/g) || []).sort();
}

function estimatedPixels(value: string, fontSize: number): number {
	const rendered = value
		.replace(/\{seconds\}/g, "10")
		.replace(/\{position\}/g, "8")
		.replace(/\{count\}/g, "99");
	let em = 0;
	for (const character of [...rendered]) {
		if (/\s/u.test(character)) em += 0.32;
		else if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) em += 1;
		else if (/[MW@%&⇄↻]/u.test(character)) em += 0.9;
		else if (/[A-ZÀ-Þ]/u.test(character)) em += 0.67;
		else if (/[ilI1.,:;!'|]/u.test(character)) em += 0.3;
		else em += 0.56;
	}
	return Math.ceil(em * fontSize + 4);
}

function layoutWidths(name: "timer" | "chat-feed"): Record<string, number> {
	const layout = JSON.parse(readFileSync(new URL(`../layouts/${name}.json`, import.meta.url), "utf8")) as {
		items: Array<{ key?: string; rect?: number[] }>;
	};
	return Object.fromEntries(layout.items.filter(item => item.key && item.rect).map(item => [item.key, item.rect![2]]));
}

describe("Stream Deck locales", () => {
	it("ships every locale supported by Stream Deck", () => {
		const files = readdirSync(localeDirectory).filter(file => file.endsWith(".json")).map(file => file.slice(0, -5)).sort();
		expect(files).toEqual(expectedLocales);
	});

	it("localizes every action and property-inspector string", () => {
		const english = readLocale("en");
		const keys = Object.keys(english.Localization).sort();
		for (const name of expectedLocales) {
			const locale = readLocale(name);
			expect(locale.Name).toBeTruthy();
			expect(locale.Description).toBeTruthy();
			for (const actionId of actionIds) {
				const action = locale[actionId] as { Name?: string; Tooltip?: string };
				expect(action?.Name).toBeTruthy();
				expect(action?.Tooltip).toBeTruthy();
			}
			expect(Object.keys(locale.Localization).sort()).toEqual(keys);
			for (const key of keys) {
				expect(placeholders(locale.Localization[key])).toEqual(placeholders(english.Localization[key]));
			}
		}
	});

	it("uses SDK-safe flat keys for device translations", () => {
		const actionFiles = ["connection-status.ts", "custom-command.ts", "timer-dial.ts", "chat-feed.ts"];
		const keys = actionFiles.flatMap(file => {
			const source = readFileSync(new URL(`actions/${file}`, import.meta.url), "utf8");
			return [...source.matchAll(/translate\("([^"]+)"/g)].map(match => match[1]);
		});
		expect(keys.length).toBeGreaterThan(0);
		expect(keys.every(key => !key.includes("."))).toBe(true);
		for (const name of expectedLocales) {
			const locale = readLocale(name);
			for (const key of keys) expect(locale.Localization[key]).toBeTruthy();
		}
	});

	it("localizes every preset label and human-readable value label", () => {
		const commandIds = COMMANDS.map(command => command.id);
		const valueLabels = [...new Set(COMMANDS.map(command => command.valueLabel).filter((value): value is string => !!value && !value.startsWith("{")))];
		for (const name of expectedLocales) {
			const locale = readLocale(name);
			for (const id of commandIds) expect(locale.Localization[`command.${id}`], `${name} command.${id}`).toBeTruthy();
			for (const label of valueLabels) expect(locale.Localization[`valueLabel.${label}`], `${name} valueLabel.${label}`).toBeTruthy();
		}
	});

	it("generates complete two-line device titles for every translated preset", () => {
		for (const name of expectedLocales) {
			const locale = readLocale(name);
			for (const command of COMMANDS) {
				const label = locale.Localization[`command.${command.id}`];
				const explicitTitle = locale.Localization[`deviceCommand_${command.id}`];
				const title = explicitTitle || formatDeviceTitle(label);
				if (!explicitTitle) expect(deviceTitleFits(label), `${name} ${command.id}: ${title}`).toBe(true);
				expect(title.split("\n").length, `${name} ${command.id} lines`).toBeLessThanOrEqual(2);
				for (const line of title.split("\n")) {
					expect(estimatedPixels(line, 10), `${name} ${command.id} device title`).toBeLessThanOrEqual(68);
				}
			}
		}
	});

	it("keeps icon-adjacent and on-device text within its visual budget", () => {
		const timerWidths = layoutWidths("timer");
		const chatWidths = layoutWidths("chat-feed");
		const timerStatuses = [
			"deviceTimerSetupRequired",
			"deviceTimerConnecting",
			"deviceTimerOffline",
			"deviceTimerUnavailable",
			"deviceTimerLoading",
			"deviceTimerDone",
			"deviceTimerRunning",
			"deviceTimerPaused"
		];
		for (const name of expectedLocales) {
			const locale = readLocale(name);
			for (const actionId of actionIds) {
				const localizedAction = locale[actionId] as LocalizedAction;
				expect(estimatedPixels(localizedAction.Name || "", 13), `${name} ${actionId} action name`).toBeLessThanOrEqual(190);
				for (const [trigger, description] of Object.entries(localizedAction.Encoder?.TriggerDescription || {})) {
					expect(estimatedPixels(description, 13), `${name} ${actionId} ${trigger} description`).toBeLessThanOrEqual(190);
				}
			}
			for (const key of ["deviceSetupOnline", "deviceSetupConnecting", "deviceSetupSetup", "deviceSetupOffline"]) {
				expect(estimatedPixels(locale.Localization[key], 10), `${name} ${key}`).toBeLessThanOrEqual(68);
			}
			for (const line of locale.Localization.deviceCustomTitle.split("\n")) {
				expect(estimatedPixels(line, 10), `${name} custom-command key title`).toBeLessThanOrEqual(68);
			}
			expect(estimatedPixels(locale.Localization.deviceTimerTitle, 11), `${name} timer title`).toBeLessThanOrEqual(timerWidths.title);
			for (const key of timerStatuses) {
				expect(estimatedPixels(locale.Localization[key], 10), `${name} ${key}`).toBeLessThanOrEqual(timerWidths.status);
			}
			expect(estimatedPixels(locale.Localization.deviceTimerSetupHint, 10), `${name} timer setup hint`).toBeLessThanOrEqual(timerWidths.hint);
			expect(estimatedPixels(locale.Localization.deviceTimerHint, 10), `${name} timer hint`).toBeLessThanOrEqual(timerWidths.hint);
			expect(estimatedPixels(locale.Localization.deviceChatChannel, 10), `${name} chat channel`).toBeLessThanOrEqual(chatWidths.platform);
			expect(estimatedPixels(locale.Localization.deviceChatWaiting, 10), `${name} chat waiting label`).toBeLessThanOrEqual(chatWidths.name);
			expect(estimatedPixels(locale.Localization.deviceChatHint, 10), `${name} chat hint`).toBeLessThanOrEqual(chatWidths.hint);
			expect(estimatedPixels(locale.Localization.deviceChatTouchHint, 10), `${name} chat touch hint`).toBeLessThanOrEqual(chatWidths.touchHint);
		}
	});
});
