import type { ConnectionStateName } from "../api/types.js";
import { isDisplayableMessage } from "../api/chat-message.js";

type Listener = () => void;

export type PluginDiagnosticError = {
	scope: string;
	message: string;
	timestamp: string;
};

export class SessionStore {
	private sessionId = "";
	private sessionRevision = 0;
	private connectionState: ConnectionStateName = "missing-session";
	private lastMessage: unknown = null;
	private chatMessages: unknown[] = [];
	private chatRevision = 0;
	private lastError: PluginDiagnosticError | null = null;
	private listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setConnectionState(state: ConnectionStateName): void {
		this.connectionState = state;
		this.emit();
	}

	getConnectionState(): ConnectionStateName {
		return this.connectionState;
	}

	setSessionId(sessionId: string): void {
		if (sessionId === this.sessionId) return;
		this.sessionId = sessionId;
		this.sessionRevision += 1;
		this.lastMessage = null;
		this.chatMessages = [];
		this.chatRevision = 0;
		this.emit();
	}

	getSessionRevision(): number {
		return this.sessionRevision;
	}

	setLastMessage(message: unknown): void {
		this.lastMessage = message;
		this.emit();
	}

	getLastMessage(): unknown {
		return this.lastMessage;
	}

	addChatMessage(message: unknown): void {
		if (!isDisplayableMessage(message)) return;
		this.chatMessages.unshift(message);
		this.chatRevision += 1;
		if (this.chatMessages.length > 50) {
			this.chatMessages.length = 50;
		}
		this.emit();
	}

	getChatMessages(): readonly unknown[] {
		return this.chatMessages;
	}

	getChatRevision(): number {
		return this.chatRevision;
	}

	setLastError(error: PluginDiagnosticError | null): void {
		this.lastError = error;
		this.emit();
	}

	getLastError(): PluginDiagnosticError | null {
		return this.lastError;
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
