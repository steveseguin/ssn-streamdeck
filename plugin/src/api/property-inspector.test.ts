import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { COMMANDS, buildSsnCommandPayload } from "./command-registry.js";

describe("property inspector", () => {
	it("uses the runtime definitions for required values and source controls", () => {
		const inspector = createPropertyInspector();
		for (const command of COMMANDS) {
			const option = inspector.run(`commandOptions.find(option => option.value === ${JSON.stringify(command.id)})`);
			expect(option.valueLabel, command.id).toBe(command.valueLabel);
			expect(option.defaultValue, command.id).toEqual(command.defaultValue);
			expect(option.sourceValue, command.id).toBe(command.sourceValue);
		}
	});

	it.each(["sendChat", "sendEncodedChat"])("preserves the saved source for %s while SSApp capabilities are pending or unavailable", command => {
		for (const capabilities of [null, { ssapp: { available: false }, ssn: { actions: { [command]: true } } }]) {
			for (const field of ["commandTitle", "value", "commandAwaitResponse"]) {
				const inspector = createPropertyInspector();
				inspector.run(`
					actionUuid = "ninja.socialstream.streamdeck.command";
					actionSettings = { command: ${JSON.stringify(command)}, value: "Hello", sourceId: "saved-source", target: "" };
					capabilities = ${JSON.stringify(capabilities)};
					renderActionSettings();
				`);
				if (field === "commandAwaitResponse") inspector.element(field).checked = true;
				else inspector.element(field).value = "Updated";
				inspector.run("saveActionSettings()");
				expect(inspector.run("actionSettings.sourceId"), field).toBe("saved-source");
				inspector.run(`handlePluginMessage({ type: "capabilities", capabilities: { ssapp: { available: true }, ssn: { actions: { ${JSON.stringify(command)}: true } } } });`);
				expect(inspector.element("sourceId").value, field).toBe("saved-source");
			}
		}
	});

	it("keeps a saved chat source through command changes and source removal, but permits an explicit clear", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionSettings = { command: "sendChat", value: "Hello", sourceId: "saved-source" };
			renderActionSettings();
			byId("command").value = "clearOverlay"; handleCommandChange();
			byId("command").value = "sendEncodedChat"; handleCommandChange();
		`);
		expect(inspector.run("actionSettings.sourceId")).toBe("saved-source");
		inspector.run(`
			handlePluginMessage({ type: "capabilities", capabilities: { ssapp: { available: true }, ssn: { actions: { sendEncodedChat: true } } } });
			handlePluginMessage({ type: "sources", sources: [] });
			byId("commandTitle").value = "Renamed"; saveActionSettings();
		`);
		expect(inspector.run("actionSettings.sourceId")).toBe("saved-source");
		inspector.run(`byId("sourceId").value = ""; updateSourceValue();`);
		expect(inspector.run("actionSettings.sourceId")).toBe("");
		inspector.run(`
			handlePluginMessage({ type: "capabilities", capabilities: { ssapp: { available: false }, ssn: { actions: { sendEncodedChat: true } } } });
			byId("commandTitle").value = "Renamed again"; saveActionSettings();
		`);
		expect(inspector.run("actionSettings.sourceId")).toBe("");
	});

	it("selects stopped sources for desktop commands without changing chat targeting", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionSettings = { command: "startSource", value: "stopped-source", sourceId: "chat-source" };
			availableSources = [
				{ id: "stopped-source", target: "twitch", username: "My channel", status: "inactive", tabId: null },
				{ id: "new-source", target: "twitch", username: "New channel", status: "active", tabId: 42 }
			];
			renderActionSettings();
		`);
		expect(inspector.element("sourceId").value).toBe("stopped-source");
		expect(inspector.element("sourceId").children.map(option => option.value)).toContain("stopped-source");
		inspector.run(`byId("sourceId").value = "new-source"; updateSourceValue();`);
		const settings = inspector.run("actionSettings");
		expect(settings.sourceId).toBe("chat-source");
		expect(buildSsnCommandPayload(settings)).toEqual({ action: "startSource", target: "ssapp", value: "new-source" });
		inspector.run(`byId("command").value = "clearOverlay"; handleCommandChange();`);
		expect(inspector.run("actionSettings.sourceId")).toBe("chat-source");
		inspector.run(`capabilities = { ssapp: { available: true } }; byId("command").value = "sendChat"; handleCommandChange();`);
		expect(inspector.element("sourceId").value).toBe("chat-source");
	});

	it.each([["setSourceMute", "isMuted"], ["setSourceVisibility", "isVisible"]])("keeps false and advanced values when choosing a source for %s", (command, field) => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionSettings = { command: ${JSON.stringify(command)}, value: JSON.stringify({sourceId: "old", ${field}: false, extra: "keep"}) };
			availableSources = [{ id: "new", target: "twitch", username: "New channel", status: "active", tabId: 42 }];
			renderActionSettings();
		`);
		expect(inspector.element("sourceState").value).toBe("false");
		inspector.run(`byId("sourceId").value = "new"; updateSourceValue();`);
		expect(buildSsnCommandPayload(inspector.run("actionSettings"))).toEqual({ action: command, target: "ssapp", value: { sourceId: "new", [field]: false, extra: "keep" } });
		inspector.run(`byId("sourceState").value = "true"; updateSourceValue();`);
		expect(JSON.parse(inspector.element("value").value)[field]).toBe(true);
	});

	it("preserves missing source selections, raw JSON and custom multiline titles", () => {
		const inspector = createPropertyInspector();
		const saved = '{"sourceId":"missing","isMuted":false,"extra":1}';
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionSettings = { command: "setSourceMute", value: ${JSON.stringify(saved)}, title: "My channel\\nMute" };
			renderActionSettings();
			handlePluginMessage({ type: "sources", sources: [], error: "Connection unavailable" });
		`);
		expect(inspector.element("value").value).toBe(saved);
		expect(inspector.element("sourceId").value).toBe("missing");
		expect(inspector.element("sourceStatus").textContent).toBe("Connection unavailable");
		expect(inspector.element("keyPreviewTitle").textContent).toBe("My channel\nMute");
	});

	it.each(["server", "server2", "server3"])("imports WebSocket transport for an empty %s flag", flag => {
		const inspector = createPropertyInspector();
		inspector.run(`
			byId("sessionId").value = "https://socialstream.ninja/dock.html?session=exampleSession&${flag}=&label=Chat";
			normalizeSessionInput();
		`);
		expect(inspector.element("sessionId").value).toBe("exampleSession");
		expect(inspector.element("transport").value).toBe("websocket");
	});

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

	it("imports the session, password, and transport from a full overlay URL", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			byId("sessionId").value = "https://beta.socialstream.ninja/dock.html?session=exampleSession123&password=secret&server2&v=3.50.4";
			normalizeSessionInput();
		`);

		expect(inspector.element("sessionId").value).toBe("exampleSession123");
		expect(inspector.element("password").value).toBe("secret");
		expect(inspector.element("transport").value).toBe("websocket");
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
			elements.set(id, createElement(id === "sourceId" ? "select" : "div"));
		}
		return elements.get(id) as InspectorElement;
	}

	const context = createContext({
		console,
		URL,
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
	runInContext(readFileSync(new URL("../../ui/commands.js", import.meta.url), "utf8"), context);
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
		get value() {
			return this._value || "";
		},
		set value(value: string) {
			this._value = tag !== "select" || this.children.some(option => option.value === value) ? value : "";
		},
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
			if (tag === "select" && this.children.length === 1) this.value = child.value;
			return child;
		},
		addEventListener: () => undefined,
		setAttribute: () => undefined,
		set innerHTML(value: string) {
			this.children = [];
			if (tag === "select") this._value = "";
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
	_value?: string;
	classList: {
		add: () => void;
		remove: () => void;
		toggle: () => void;
	};
	appendChild: (child: InspectorElement) => InspectorElement;
	addEventListener: () => void;
	setAttribute: (name: string, value: string) => void;
	innerHTML: string;
};


describe('commerce product picker', () => {
 it('loads saved products without replacing an unavailable configured selection', () => {
  const inspector=createPropertyInspector();
  inspector.run(`byId("value").value="https://example.com/missing"; handlePluginMessage({type:"commerce",result:{ok:true,payload:{commerce:{mode:"pinned",selected:{name:"Print"},remainingSeconds:30,items:[{name:"Print",url:"https://example.com/print"}]}}}});`);
  expect(inspector.element('commerceProduct').value).toBe('https://example.com/missing');
  expect(inspector.element('commerceProduct').children.map(x=>x.value)).toEqual(['','https://example.com/print','https://example.com/missing']);
  expect(inspector.element('commerceState').textContent).toContain('Print');
  expect(inspector.element('commerceState').textContent).toContain('30s');
  inspector.run(`handlePluginMessage({type:"commerce",error:"SSN disconnected"});`);
  expect(inspector.element('commerceState').textContent).toBe('SSN disconnected');
 });
});
