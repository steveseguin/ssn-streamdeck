import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { loadCommandKeyImage } from "../api/command-icons.js";
import {
	buildSsnCommandPayload,
	extractSourceFromCommandResult,
	getCommandDefinition,
	getCommandKeyTitle,
	isCommandSupported,
	isSourceTargetedChat,
	targetChatPayloadToSource
} from "../api/command-registry.js";
import { normalizeSsnCommandSettings } from "../api/settings.js";
import type { SsnCommandSettings } from "../api/types.js";
import { translate } from "../i18n.js";
import { recordPluginError, ssnClient } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.command" })
export class SsnCommandAction extends SingletonAction<SsnCommandSettings> {
	private readonly confirmations = new Map<string, { command: string; timer: NodeJS.Timeout }>();

	override async onWillAppear(ev: WillAppearEvent<SsnCommandSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SsnCommandSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<SsnCommandSettings>): Promise<void> {
		const settings = normalizeSsnCommandSettings(ev.payload.settings);
		const definition = getCommandDefinition(settings.command);
		if (definition.id === "creditsReset" && ev.payload.isInMultiAction !== true && await this.armOrConfirm(ev.action, settings)) {
			return;
		}
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
					throw new Error("The selected desktop app source is unavailable.");
				}
				payload = targetChatPayloadToSource(payload, source);
			}
			await ssnClient.sendCommand(payload, {
				awaitResponse: settings.awaitResponse === true || definition.defaultAwaitResponse === true
			});
			await ev.action.showOk();
		} catch (error) {
			recordPluginError(`preset-command.${definition.id}`, error);
			await ev.action.showAlert();
		}
		await this.render(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<SsnCommandSettings>): void {
		this.clearConfirmation(ev.action.id);
	}

	private async armOrConfirm(actionContext: KeyAction<SsnCommandSettings>, settings: SsnCommandSettings): Promise<boolean> {
		const current = this.confirmations.get(actionContext.id);
		if (current?.command === settings.command) {
			this.clearConfirmation(actionContext.id);
			return false;
		}
		this.clearConfirmation(actionContext.id);
		const timer = setTimeout(() => {
			const pending = this.confirmations.get(actionContext.id);
			if (pending?.timer !== timer) return;
			this.confirmations.delete(actionContext.id);
			void this.render(actionContext, settings);
		}, 2000);
		timer.unref();
		this.confirmations.set(actionContext.id, { command: settings.command || "", timer });
		await actionContext.setTitle(translate("deviceConfirmPressAgain", "Press\nAgain"));
		return true;
	}

	private clearConfirmation(contextId: string): void {
		const pending = this.confirmations.get(contextId);
		if (!pending) return;
		clearTimeout(pending.timer);
		this.confirmations.delete(contextId);
	}

	private async render(actionContext: KeyAction<SsnCommandSettings>, rawSettings?: SsnCommandSettings): Promise<void> {
		const settings = normalizeSsnCommandSettings(rawSettings);
		const definition = getCommandDefinition(settings.command);
		const fallbackTitle = getCommandKeyTitle(definition);
		await actionContext.setImage(await loadCommandKeyImage(definition.icon));
		await actionContext.setTitle(settings.title || translate(`deviceCommand_${definition.id}`, fallbackTitle));
	}
}
