import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("property inspector", () => {
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

	it("shows and saves preset default values when a command is selected", () => {
		const inspector = createPropertyInspector();
		inspector.run(`
			actionUuid = "ninja.socialstream.streamdeck.command";
			actionContext = "command-context";
			websocket = { readyState: WebSocket.OPEN, send: message => sentMessages.push(JSON.parse(message)) };
			byId("command").value = "drawmode";
			handleCommandChange();
		`);

		expect(inspector.element("value").value).toBe("toggle");
		expect(inspector.sentMessages).toContainEqual({
			event: "setSettings",
			context: "command-context",
			payload: {
				command: "drawmode",
				target: "",
				value: "toggle",
				title: "",
				awaitResponse: false
			}
		});
	});
});

function createPropertyInspector() {
	const elements = new Map<string, InspectorElement>();
	const sentMessages: unknown[] = [];
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
		setTimeout,
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
