import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("property inspector", () => {
	it("uses the PI context for inspector commands", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			window.connectElgatoStreamDeckSocket(
				1234,
				"property-inspector-context",
				"registerPropertyInspector",
				"{}",
				JSON.stringify({
					context: "action-context",
					action: "ninja.socialstream.streamdeck.command",
					payload: { settings: { command: "nextInQueue" } }
				})
			);
			websocket = { readyState: WebSocket.OPEN, send: message => sentMessages.push(JSON.parse(message)) };
			requestStatus();
			requestSources();
			byId("command").value = "nextInQueue";
			saveActionSettings();
		`);

		expect(inspector.sentMessages).toContainEqual({
			event: "sendToPlugin",
			action: "ninja.socialstream.streamdeck.command",
			context: "property-inspector-context",
			payload: { type: "requestStatus" }
		});
		expect(inspector.sentMessages).toContainEqual({
			event: "sendToPlugin",
			action: "ninja.socialstream.streamdeck.command",
			context: "property-inspector-context",
			payload: { type: "requestSources" }
		});
		expect(inspector.sentMessages).toContainEqual({
			event: "setSettings",
			action: "ninja.socialstream.streamdeck.command",
			context: "property-inspector-context",
			payload: {
				command: "nextInQueue",
				target: "",
				sourceId: "",
				value: "",
				title: "",
				awaitResponse: false
			}
		});
	});

	it("filters SSApp presets by advertised capabilities", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionSettings = { command: "nextInQueue" };
			capabilities = {
				type: "capabilities",
				version: 1,
				ssapp: {
					available: true,
					sourceControls: { list: true, get: true, start: false, stop: false, restart: false },
					bulkControls: false,
					mute: false,
					visibility: { get: true, set: false, toggle: false },
					connectionMode: false
				}
			};
			renderCommandOptions();
		`);

		const options = inspector.commandOptions();
		expect(options).toContain("getSources");
		expect(options).toContain("getSource");
		expect(options).not.toContain("startSource");
		expect(options).not.toContain("stopSource");
		expect(options).not.toContain("restartSource");
		expect(options).not.toContain("startAllSources");
		expect(options).not.toContain("toggleSourceMute");
		expect(options).not.toContain("setSourceVisibility");
		expect(options).not.toContain("setSourceConnectionMode");
	});

	it("requests sources after a healthy status only when SSApp is available", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			propertyInspectorContext = "property-inspector-context";
			websocket = { readyState: WebSocket.OPEN, send: message => sentMessages.push(JSON.parse(message)) };
			handlePluginMessage({
				type: "status",
				ok: true,
				state: "connected",
				capabilities: { ssn: { actions: {} }, ssapp: { available: false } }
			});
		`);

		expect(inspector.sentMessages).not.toContainEqual(expect.objectContaining({ payload: { type: "requestSources" } }));

		inspector.run(`
			handlePluginMessage({
				type: "status",
				ok: true,
				state: "connected",
				capabilities: { ssn: { actions: {} }, ssapp: { available: true } }
			});
		`);

		expect(inspector.sentMessages).toContainEqual(expect.objectContaining({ payload: { type: "requestSources" } }));
	});

	it("shows and saves preset default values when a command is selected", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionContext = "command-context";
			propertyInspectorContext = "property-inspector-context";
			websocket = { readyState: WebSocket.OPEN, send: message => sentMessages.push(JSON.parse(message)) };
			byId("command").value = "drawmode";
			handleCommandChange();
		`);

		expect(inspector.element("value").value).toBe("toggle");
		expect(inspector.sentMessages).toContainEqual({
			event: "setSettings",
			action: "ninja.socialstream.streamdeck.command",
			context: "property-inspector-context",
			payload: {
				command: "drawmode",
				target: "",
				sourceId: "",
				value: "toggle",
				title: "",
				awaitResponse: false
			}
		});
	});

	it("lists only open SSApp sources and saves the stable source ID", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionContext = "command-context";
			propertyInspectorContext = "property-inspector-context";
			actionSettings = { command: "sendChat", sourceId: "youtube-source", value: "Hello" };
			capabilities = {
				type: "capabilities",
				version: 1,
				ssapp: { available: true },
				ssn: { actions: { sendChat: true } }
			};
			availableSources = [
				{ id: "youtube-source", target: "youtube", tabId: 42, status: "active", username: "Channel" },
				{ id: "closed-source", target: "twitch", tabId: null, username: "Offline" }
			];
			websocket = { readyState: WebSocket.OPEN, send: message => sentMessages.push(JSON.parse(message)) };
			renderActionSettings();
			byId("sourceId").value = "youtube-source";
			saveActionSettings();
		`);

		const sourceOptions = inspector.element("sourceId").children.map(option => option.value);
		expect(sourceOptions).toContain("youtube-source");
		expect(sourceOptions).not.toContain("closed-source");
		expect(inspector.sentMessages).toContainEqual({
			event: "setSettings",
			action: "ninja.socialstream.streamdeck.command",
			context: "property-inspector-context",
			payload: {
				command: "sendChat",
				target: "",
				sourceId: "youtube-source",
				value: "Hello",
				title: "",
				awaitResponse: false
			}
		});
	});

	it("uses the session value when a full overlay URL is pasted", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			byId("sessionId").value = "https://beta.socialstream.ninja/dock.html?session=T86DpkdGAw&v=3.50.4&branded";
			normalizeSessionInput();
		`);

		expect(inspector.element("sessionId").value).toBe("T86DpkdGAw");
	});

	it("keeps the verified result visible after testing the connection", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.setup";
			propertyInspectorContext = "property-inspector-context";
			byId("sessionId").value = "session-1";
			byId("apiHost").value = "io.socialstream.ninja";
			byId("inChannel").value = "2";
			byId("outChannel").value = "1";
			websocket = { readyState: WebSocket.OPEN, send: message => sentMessages.push(JSON.parse(message)) };
			byId("testConnection").onclick();
		`);

		expect(inspector.sentMessages).toContainEqual({
			event: "sendToPlugin",
			action: "ninja.socialstream.streamdeck.setup",
			context: "property-inspector-context",
			payload: { type: "testConnection" }
		});
		expect(inspector.scheduledTimeouts).toHaveLength(0);
	});

	it("runs the refresh-sources and show-session buttons", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			propertyInspectorContext = "property-inspector-context";
			websocket = { readyState: WebSocket.OPEN, send: message => sentMessages.push(JSON.parse(message)) };
			byId("sessionId").type = "password";
			byId("refreshSources").onclick();
			byId("showSession").onclick();
		`);

		expect(inspector.sentMessages).toContainEqual({
			event: "sendToPlugin",
			action: "ninja.socialstream.streamdeck.command",
			context: "property-inspector-context",
			payload: { type: "requestSources" }
		});
		expect(inspector.element("sessionId").type).toBe("text");
		expect(inspector.element("showSession").textContent).toBe("Hide ID");

		inspector.run(`byId("showSession").onclick();`);
		expect(inspector.element("sessionId").type).toBe("password");
		expect(inspector.element("showSession").textContent).toBe("Show ID");
	});

	it("uses the Stream Deck application locale with English fallback", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			window.SSN_STREAMDECK_LOCALES = {
				de: { "pi.setup.showId": "ID anzeigen", "pi.setup.hideId": "ID ausblenden" },
				en: { "pi.setup.showId": "Show ID", "pi.setup.hideId": "Hide ID" }
			};
			window.connectElgatoStreamDeckSocket(
				1234,
				"property-inspector-context",
				"registerPropertyInspector",
				JSON.stringify({ application: { language: "de" } }),
				JSON.stringify({ context: "action-context", action: "ninja.socialstream.streamdeck.connection", payload: { settings: {} } })
			);
			byId("sessionId").type = "password";
			byId("showSession").onclick();
		`);

		expect(inspector.element("showSession").textContent).toBe("ID ausblenden");
		expect(inspector.run(`setLocale("it"); t("pi.setup.showId", "Show ID")`)).toBe("Show ID");
	});
});

function createPropertyInspector() {
	const elements = new Map<string, InspectorElement>();
	const sentMessages: unknown[] = [];
	const scheduledTimeouts: Array<{ callback: () => void; delay: number }> = [];
	const WebSocket = function WebSocket() {};
	WebSocket.OPEN = 1;

	function element(id: string): InspectorElement {
		if (!elements.has(id)) {
			elements.set(id, createElement("div"));
		}
		return elements.get(id) as InspectorElement;
	}

	const context = createContext({
		console,
		clearTimeout,
		setTimeout: (callback: () => void, delay: number) => {
			scheduledTimeouts.push({ callback, delay });
			return scheduledTimeouts.length;
		},
		sentMessages,
		WebSocket,
		window: {},
		document: {
			getElementById: element,
			createElement,
			querySelectorAll: () => []
		}
	});
	const html = readFileSync(new URL("../../ui/action-settings.html", import.meta.url), "utf8");
	const script = html.match(/<script>([\s\S]*)<\/script>/);
	if (!script) {
		throw new Error("Property inspector script not found");
	}
	runInContext(script[1], context);

	return {
		sentMessages,
		scheduledTimeouts,
		element,
		run: (code: string) => runInContext(code, context),
		commandOptions: () => {
			const options: string[] = [];
			for (const child of element("command").children) {
				if (child.value) {
					options.push(child.value);
				}
				for (const nested of child.children) {
					options.push(nested.value);
				}
			}
			return options;
		}
	};
}

function createElement(tag: string): InspectorElement {
	return {
		tag,
		children: [],
		value: "",
		textContent: "",
		label: "",
		disabled: false,
		checked: false,
		type: "",
		classList: {
			add: () => undefined,
			remove: () => undefined,
			toggle: () => undefined
		},
		appendChild(child: InspectorElement) {
			this.children.push(child);
			return child;
		},
		addEventListener: () => undefined,
		set innerHTML(value: string) {
			this.children = [];
			this._innerHTML = value;
		},
		get innerHTML() {
			return this._innerHTML || "";
		}
	};
}

type InspectorElement = {
	tag: string;
	children: InspectorElement[];
	value: string;
	textContent: string;
	label: string;
	disabled: boolean;
	checked: boolean;
	type: string;
	_innerHTML?: string;
	classList: {
		add: () => void;
		remove: () => void;
		toggle: () => void;
	};
	appendChild: (child: InspectorElement) => InspectorElement;
	addEventListener: () => void;
	innerHTML: string;
};
