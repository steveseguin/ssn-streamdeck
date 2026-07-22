import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import {
	buildSsnCommandPayload,
	extractSourceFromCommandResult,
	getCommandDefinition,
	isCommandSupported,
	isSourceTargetedChat,
	targetChatPayloadToSource
} from "../api/command-registry.js";
import { normalizeSsnCommandSettings } from "../api/settings.js";
import type { SsnCommandSettings } from "../api/types.js";
import { ssnClient } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.command" })
export class SsnCommandAction extends SingletonAction<SsnCommandSettings> {
	override async onWillAppear(ev: WillAppearEvent<SsnCommandSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<SsnCommandSettings>): Promise<void> {
		const settings = normalizeSsnCommandSettings(ev.payload.settings);
		const definition = getCommandDefinition(settings.command);
		try {
			if (!isCommandSupported(definition, ssnClient.getCapabilities())) {
				throw new Error(`${definition.label} is unavailable in the connected Social Stream runtime`);
			}
			let payload = buildSsnCommandPayload(settings);
			if (isSourceTargetedChat(settings)) {
				const result = await ssnClient.sendCommand({
					action: "getSource",
					target: "ssapp",
					value: settings.sourceId
				}, { awaitResponse: true });
				const source = extractSourceFromCommandResult(result);
				if (!source) {
					throw new Error("The selected SSApp source is unavailable.");
				}
				payload = targetChatPayloadToSource(payload, source);
			}
			await ssnClient.sendCommand(payload, {
				awaitResponse: settings.awaitResponse === true || definition.defaultAwaitResponse === true
			});
			await ev.action.showOk();
		} catch {
			await ev.action.showAlert();
		}
		await this.render(ev.action, settings);
	}

	private async render(actionContext: KeyAction<SsnCommandSettings>, rawSettings?: SsnCommandSettings): Promise<void> {
		const settings = normalizeSsnCommandSettings(rawSettings);
		const definition = getCommandDefinition(settings.command);
		await actionContext.setTitle(settings.title || shortTitle(definition.label));
	}
}

function shortTitle(label: string): string {
	const parts = label.split(" ");
	if (parts.length === 1) {
		return `SSN\n${label}`;
	}
	return `${parts[0]}\n${parts.slice(1).join(" ")}`;
}
