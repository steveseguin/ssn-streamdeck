import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { buildCustomCommandPayload } from "../api/command-registry.js";
import { normalizeCustomCommandSettings } from "../api/settings.js";
import type { CustomCommandSettings } from "../api/types.js";
import { translate } from "../i18n.js";
import { recordPluginError, ssnClient } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.custom-command" })
export class CustomCommandAction extends SingletonAction<CustomCommandSettings> {
	private readonly feedbackTokens = new Map<string, object>();

	override async onWillAppear(ev: WillAppearEvent<CustomCommandSettings>): Promise<void> {
		this.feedbackTokens.delete(ev.action.id);
		if (ev.action.isKey()) await this.render(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CustomCommandSettings>): Promise<void> {
		this.feedbackTokens.delete(ev.action.id);
		if (ev.action.isKey()) await this.render(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<CustomCommandSettings>): Promise<void> {
		const settings = normalizeCustomCommandSettings(ev.payload.settings);
		const token = {};
		this.feedbackTokens.set(ev.action.id, token);
		try {
			await ssnClient.sendCommand(buildCustomCommandPayload(settings), { awaitResponse: settings.awaitResponse === true });
			if (this.feedbackTokens.get(ev.action.id) !== token) return;
			await ev.action.showOk();
		} catch (error) {
			recordPluginError("custom-command", error);
			if (this.feedbackTokens.get(ev.action.id) !== token) return;
			await ev.action.showAlert();
		} finally {
			if (this.feedbackTokens.get(ev.action.id) === token) this.feedbackTokens.delete(ev.action.id);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<CustomCommandSettings>): void {
		this.feedbackTokens.delete(ev.action.id);
	}

	private async render(actionContext: KeyAction<CustomCommandSettings>, rawSettings?: CustomCommandSettings): Promise<void> {
		const settings = normalizeCustomCommandSettings(rawSettings);
		await actionContext.setTitle(settings.title || translate("deviceCustomTitle", "Custom\nCommand"));
	}
}
