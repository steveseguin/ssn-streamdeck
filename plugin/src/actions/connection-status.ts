import { action, type KeyAction, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import type { ConnectionStatusSettings } from "../api/types.js";
import { sessionStore } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.connection" })
export class ConnectionStatusAction extends SingletonAction<ConnectionStatusSettings> {
	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<ConnectionStatusSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				const settings = await visible.getSettings<ConnectionStatusSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<ConnectionStatusSettings>, settings?: ConnectionStatusSettings): Promise<void> {
		const state = sessionStore.getConnectionState();
		await actionContext.setState(state === "connected" ? 1 : 0);
		await actionContext.setTitle(settings?.title || titleForState(state));
	}
}

function titleForState(state: string): string {
	if (state === "connected") {
		return "SSN\nOnline";
	}
	if (state === "connecting") {
		return "SSN\nConnecting";
	}
	if (state === "missing-session") {
		return "SSN\nSetup";
	}
	return "SSN\nOffline";
}
