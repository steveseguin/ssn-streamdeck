import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { buildCustomCommandPayload } from "../api/command-registry.js";
import { normalizeCustomCommandSettings } from "../api/settings.js";
import type { CustomCommandSettings } from "../api/types.js";
import { translate } from "../i18n.js";
import { recordPluginError, ssnClient } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.custom-command" })
export class CustomCommandAction extends SingletonAction<CustomCommandSettings> {
	override async onWillAppear(ev: WillAppearEvent<CustomCommandSettings>): Promise<void> {
		if (ev.action.isKey()) await this.render(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CustomCommandSettings>): Promise<void> {
		if (ev.action.isKey()) await this.render(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<CustomCommandSettings>): Promise<void> {
		const settings = normalizeCustomCommandSettings(ev.payload.settings);
		try {
			await ssnClient.sendCommand(buildCustomCommandPayload(settings), { awaitResponse: settings.awaitResponse === true });
			await ev.action.showOk();
		} catch (error) {
			recordPluginError("custom-command", error);
			await ev.action.showAlert();
		}
	}

	private async render(actionContext: KeyAction<CustomCommandSettings>, rawSettings?: CustomCommandSettings): Promise<void> {
		const settings = normalizeCustomCommandSettings(rawSettings);
		await actionContext.setTitle(settings.title || translate("deviceCustomTitle", "Custom\nCommand"));
	}
}
