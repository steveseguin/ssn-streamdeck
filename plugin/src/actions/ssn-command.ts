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
import { summarizeQueryResult } from "../api/query-result.js";
import type { SsnCommandSettings } from "../api/types.js";
import { translate } from "../i18n.js";
import { recordPluginError, ssnClient } from "../services.js";

@action({ UUID: "ninja.socialstream.streamdeck.command" })
export class SsnCommandAction extends SingletonAction<SsnCommandSettings> {
	private readonly commerceKeys = new Map<string, { action: KeyAction<SsnCommandSettings>; settings: SsnCommandSettings }>();
    private commerceTimer?: NodeJS.Timeout;
    private commerceFlight?: Promise<boolean>;
    private trackCommerce(actionContext: KeyAction<SsnCommandSettings>, settings: SsnCommandSettings): void {
        if (settings.command === "getCommerceState") this.commerceKeys.set(actionContext.id, { action: actionContext, settings });
        else this.commerceKeys.delete(actionContext.id);
        if (this.commerceKeys.size && !this.commerceTimer) {
            this.commerceTimer = setInterval(() => void this.pollCommerce(), 5000); this.commerceTimer.unref();
            void this.pollCommerce();
        } else if (!this.commerceKeys.size && this.commerceTimer) { clearInterval(this.commerceTimer); this.commerceTimer = undefined; }
    }
    private pollCommerce(): Promise<boolean> {
        if (this.commerceFlight) return this.commerceFlight;
        if (!this.commerceKeys.size) return Promise.resolve(false);
        this.commerceFlight = this.fetchCommerce().finally(() => { this.commerceFlight = undefined; });
        return this.commerceFlight;
    }
    private async fetchCommerce(): Promise<boolean> {
        try {
            const result = await ssnClient.sendCommand({ action: "getCommerceState" }, { awaitResponse: true }) as { payload?: { commerce?: { mode: string; selected?: { name: string } | null; remainingSeconds?: number | null } } };
            const state = result?.payload?.commerce;
            if (!state) throw new Error("Product state unavailable");
            const label = translate("commerce.mode." + state.mode, state.mode);
            const detail = state.mode === "hidden" ? state.remainingSeconds ? state.remainingSeconds + "s" : "" : state.selected?.name || "";
            for (const key of this.commerceKeys.values()) await key.action.setTitle(label.slice(0, 11) + (detail ? "\n" + detail.slice(0, 11) : ""));
            return true;
        } catch (_) {
            for (const key of this.commerceKeys.values()) await key.action.setTitle(translate("commerce.unavailable", "State\nunavailable"));
            return false;
        }
    }
    private readonly confirmations = new Map<string, { command: string; timer: NodeJS.Timeout }>();
	private readonly resultTimers = new Map<string, NodeJS.Timeout>();
	private readonly feedbackTokens = new Map<string, object>();

	override async onWillAppear(ev: WillAppearEvent<SsnCommandSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings, this.beginFeedback(ev.action.id));
            this.trackCommerce(ev.action, ev.payload.settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SsnCommandSettings>): Promise<void> {
		this.clearConfirmation(ev.action.id);
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings, this.beginFeedback(ev.action.id));
            this.trackCommerce(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<SsnCommandSettings>): Promise<void> {
		const settings = normalizeSsnCommandSettings(ev.payload.settings);
		const definition = getCommandDefinition(settings.command);
        if (definition.id === "getCommerceState") {
            if (!this.commerceKeys.has(ev.action.id)) this.trackCommerce(ev.action, settings);
            const ok = await this.pollCommerce();
            if (this.commerceKeys.has(ev.action.id)) { if (ok) await ev.action.showOk(); else await ev.action.showAlert(); }
            return;
        }
		const token = this.beginFeedback(ev.action.id);
		let summary: string | null = null;
		if (definition.id === "creditsReset" && ev.payload.isInMultiAction !== true && await this.armOrConfirm(ev.action, settings, token)) {
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
			const result = await ssnClient.sendCommand(payload, {
				awaitResponse: settings.awaitResponse === true || definition.defaultAwaitResponse === true
			});
			summary = summarizeQueryResult(definition.resultKind, result);
			if (this.feedbackTokens.get(ev.action.id) !== token) return;
			await ev.action.showOk();
		} catch (error) {
			recordPluginError(`preset-command.${definition.id}`, error);
			if (this.feedbackTokens.get(ev.action.id) !== token) return;
			await ev.action.showAlert();
		}
		await this.render(ev.action, settings, token);
		if (this.feedbackTokens.get(ev.action.id) !== token) return;
		if (summary !== null && ev.payload.isInMultiAction !== true) {
			const label = (settings.title || translate(`deviceCommand_${definition.id}`, getCommandKeyTitle(definition))).replace(/\s+/g, " ");
			await ev.action.setTitle(`${label}\n${summary}`);
			if (this.feedbackTokens.get(ev.action.id) !== token) return;
			const timer = setTimeout(() => {
				if (this.resultTimers.get(ev.action.id) !== timer) return;
				this.resultTimers.delete(ev.action.id);
				void this.render(ev.action, settings, token);
			}, 3000);
			timer.unref();
			this.resultTimers.set(ev.action.id, timer);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<SsnCommandSettings>): void {
		this.commerceKeys.delete(ev.action.id);
        if (!this.commerceKeys.size && this.commerceTimer) { clearInterval(this.commerceTimer); this.commerceTimer = undefined; }
		this.feedbackTokens.delete(ev.action.id);
		this.clearConfirmation(ev.action.id);
		this.clearResult(ev.action.id);
	}

	private beginFeedback(contextId: string): object {
		this.clearResult(contextId);
		const token = {};
		this.feedbackTokens.set(contextId, token);
		return token;
	}

	private clearResult(contextId: string): void {
		const timer = this.resultTimers.get(contextId);
		if (timer) clearTimeout(timer);
		this.resultTimers.delete(contextId);
	}

	private async armOrConfirm(actionContext: KeyAction<SsnCommandSettings>, settings: SsnCommandSettings, token: object): Promise<boolean> {
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
			void this.render(actionContext, settings, token);
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

	private async render(actionContext: KeyAction<SsnCommandSettings>, rawSettings: SsnCommandSettings | undefined, token: object): Promise<void> {
		const settings = normalizeSsnCommandSettings(rawSettings);
		const definition = getCommandDefinition(settings.command);
		const fallbackTitle = getCommandKeyTitle(definition);
		const image = await loadCommandKeyImage(definition.icon);
		if (this.feedbackTokens.get(actionContext.id) !== token) return;
		await actionContext.setImage(image);
		if (this.feedbackTokens.get(actionContext.id) !== token) return;
		await actionContext.setTitle(settings.title || translate(`deviceCommand_${definition.id}`, fallbackTitle));
	}
}
