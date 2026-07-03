import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { buildCustomCommandPayload } from "../api/command-registry.js";
import { normalizeCustomCommandSettings } from "../api/settings.js";
import type { CustomCommandSettings } from "../api/types.js";
import { ssnClient } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.custom-command" })
export class CustomCommandAction extends SingletonAction<CustomCommandSettings> {
	override async onWillAppear(ev: WillAppearEvent<CustomCommandSettings>): Promise<void> {
		const settings = normalizeCustomCommandSettings(ev.payload.settings);
		await ev.action.setTitle(settings.title || `SSN\n${settings.action || "Command"}`);
	}

	override async onKeyDown(ev: KeyDownEvent<CustomCommandSettings>): Promise<void> {
		const settings = normalizeCustomCommandSettings(ev.payload.settings);
		try {
			await ssnClient.sendCommand(buildCustomCommandPayload(settings), { awaitResponse: settings.awaitResponse === true });
			await ev.action.showOk();
		} catch {
			await ev.action.showAlert();
		}
	}
}
