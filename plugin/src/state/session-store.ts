import type { ConnectionStateName } from "../api/types.js";

type Listener = () => void;

export class SessionStore {
	private connectionState: ConnectionStateName = "missing-session";
	private lastMessage: unknown = null;
	private chatMessages: unknown[] = [];
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

	setLastMessage(message: unknown): void {
		this.lastMessage = message;
		this.emit();
	}

	getLastMessage(): unknown {
		return this.lastMessage;
	}

	addChatMessage(message: unknown): void {
		this.chatMessages.unshift(message);
		if (this.chatMessages.length > 50) {
			this.chatMessages.length = 50;
		}
		this.emit();
	}

	getChatMessages(): readonly unknown[] {
		return this.chatMessages;
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
