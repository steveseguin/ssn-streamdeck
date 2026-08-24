import { action, type DidReceiveSettingsEvent, type KeyAction, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { ConnectionStatusSettings } from "../api/types.js";
import { translate } from "../i18n.js";
import { sessionStore } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.connection" })
export class ConnectionStatusAction extends SingletonAction<ConnectionStatusSettings> {
	private connectionState = sessionStore.getConnectionState();
	private readonly settings = new Map<string, ConnectionStatusSettings>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			const nextConnectionState = sessionStore.getConnectionState();
			if (nextConnectionState === this.connectionState) return;
			this.connectionState = nextConnectionState;
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<ConnectionStatusSettings>): Promise<void> {
		if (ev.action.isKey()) {
			this.settings.set(ev.action.id, ev.payload.settings);
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ConnectionStatusSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.settings.set(ev.action.id, ev.payload.settings);
		await this.render(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<ConnectionStatusSettings>): void {
		this.settings.delete(ev.action.id);
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				await this.render(visible, this.settings.get(visible.id));
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
		return `SSN\n${translate("deviceSetupOnline", "Online")}`;
	}
	if (state === "connecting") {
		return `SSN\n${translate("deviceSetupConnecting", "Connecting")}`;
	}
	if (state === "missing-session") {
		return `SSN\n${translate("deviceSetupSetup", "Setup")}`;
	}
	return `SSN\n${translate("deviceSetupOffline", "Offline")}`;
}
