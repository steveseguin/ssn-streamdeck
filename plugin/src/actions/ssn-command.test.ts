import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendCommand: vi.fn<() => Promise<unknown>>(async () => undefined),
	recordPluginError: vi.fn()
}));

vi.mock("../services.js", () => ({
	recordPluginError: mocks.recordPluginError,
	ssnClient: {
		getCapabilities: () => ({
			type: "capabilities",
			version: 2,
			ssn: { actions: { creditsReset: true, getQueueSize: true, gettimerstate: true, getpollpresets: true } }
		}),
		sendCommand: mocks.sendCommand
	}
}));

import { SsnCommandAction } from "./ssn-command.js";

describe("SsnCommandAction reset confirmation", () => {
	beforeEach(() => {
		mocks.sendCommand.mockReset();
		mocks.recordPluginError.mockClear();
	});

	it.each([
		["getQueueSize", { ok: true, payload: { queueLength: 27 } }, "27"],
		["gettimerstate", { ok: true, payload: { timer: { displayMs: 90000 } } }, "1:30"],
		["getpollpresets", { ok: true, payload: [{ id: "one" }, { id: "two" }] }, "2"]
	])("shows useful feedback for %s", async (preset, result, expected) => {
		mocks.sendCommand.mockResolvedValue(result);
		const command = new SsnCommandAction();
		const action = fakeKey();
		await command.onKeyDown({ action, payload: { settings: { command: preset } } } as never);
		expect(action.setTitle).toHaveBeenLastCalledWith(expect.stringContaining(`\n${expected}`));
		command.onWillDisappear({ action } as never);
	});

	it("returns to the configured title after showing a query result", async () => {
		vi.useFakeTimers();
		try {
			mocks.sendCommand.mockResolvedValue({ ok: true, payload: { queueLength: 0 } });
			const command = new SsnCommandAction();
			const action = fakeKey();
			await command.onKeyDown({ action, payload: { settings: { command: "getQueueSize", title: "Queue" } } } as never);
			expect(action.setTitle).toHaveBeenLastCalledWith("Queue\n0");
			await vi.advanceTimersByTimeAsync(3000);
			expect(action.setTitle).toHaveBeenLastCalledWith("Queue");
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not overwrite a reassigned key when an old query finishes", async () => {
		let finish: (value: unknown) => void = () => undefined;
		mocks.sendCommand.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const command = new SsnCommandAction();
		const action = fakeKey();
		const pending = command.onKeyDown({ action, payload: { settings: { command: "getQueueSize" } } } as never);
		await command.onDidReceiveSettings({ action, payload: { settings: { command: "creditsReset", title: "New Key" } } } as never);
		finish({ ok: true, payload: { queueLength: 27 } });
		await pending;
		expect(action.setTitle).toHaveBeenLastCalledWith("New Key");
		expect(action.showOk).not.toHaveBeenCalled();
		command.onWillDisappear({ action } as never);
	});

	it("does not let a confirmation timeout undo edited key settings", async () => {
		vi.useFakeTimers();
		try {
			const command = new SsnCommandAction();
			const action = fakeKey();
			await command.onKeyDown(keyDownEvent(action, false));
			await command.onDidReceiveSettings({ action, payload: { settings: { command: "getQueueSize", title: "New Key" } } } as never);
			await vi.advanceTimersByTimeAsync(2000);
			expect(action.setTitle).toHaveBeenLastCalledWith("New Key");
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not repaint a hidden key when its query finishes", async () => {
		let finish: (value: unknown) => void = () => undefined;
		mocks.sendCommand.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const command = new SsnCommandAction();
		const action = fakeKey();
		const pending = command.onKeyDown({ action, payload: { settings: { command: "getQueueSize" } } } as never);
		command.onWillDisappear({ action } as never);
		finish({ ok: true, payload: { queueLength: 27 } });
		await pending;
		expect(action.setTitle).not.toHaveBeenCalled();
		expect(action.showOk).not.toHaveBeenCalled();
	});

	it("sends every rapid press but keeps feedback from the latest request", async () => {
		let finishFirst: (value: unknown) => void = () => undefined;
		mocks.sendCommand.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
		mocks.sendCommand.mockResolvedValueOnce({ ok: true, payload: { queueLength: 2 } });
		const command = new SsnCommandAction();
		const action = fakeKey();
		const event = { action, payload: { settings: { command: "getQueueSize" } } } as never;
		const first = command.onKeyDown(event);
		await command.onKeyDown(event);
		finishFirst({ ok: true, payload: { queueLength: 1 } });
		await first;
		expect(mocks.sendCommand).toHaveBeenCalledTimes(2);
		expect(action.setTitle).toHaveBeenLastCalledWith("Queue Size\n2");
		command.onWillDisappear({ action } as never);
	});

	it("requires a second press before resetting collected credits", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();
		const event = keyDownEvent(action, false);

		await command.onKeyDown(event);
		expect(mocks.sendCommand).not.toHaveBeenCalled();
		expect(action.setTitle).toHaveBeenLastCalledWith("Press\nAgain");

		await command.onKeyDown(event);
		expect(mocks.sendCommand).toHaveBeenCalledWith(
			{ action: "creditsReset" },
			{ awaitResponse: true }
		);
		expect(action.showOk).toHaveBeenCalled();
	});

	it("does not block an intentional multi-action workflow", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();

		await command.onKeyDown(keyDownEvent(action, true));

		expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
	});

	it("updates its key title as soon as settings are received", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();

		await command.onDidReceiveSettings({ action, payload: { settings: { command: "creditsReset", title: "Safe Reset" } } } as never);

		expect(action.setTitle).toHaveBeenLastCalledWith("Safe Reset");
	});

	it("shows the preset-specific key icon when the key appears", async () => {
		const command = new SsnCommandAction();
		const action = fakeKey();

		await command.onWillAppear({ action, payload: { settings: { command: "starttimer" } } } as never);

		expect(action.setImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
	});
});

function fakeKey() {
	return {
		id: "credits-reset-key",
		isKey: () => true,
		setImage: vi.fn(async () => undefined),
		setTitle: vi.fn(async () => undefined),
		showOk: vi.fn(async () => undefined),
		showAlert: vi.fn(async () => undefined)
	};
}

function keyDownEvent(action: ReturnType<typeof fakeKey>, isInMultiAction: boolean) {
	return {
		action,
		payload: {
			isInMultiAction,
			settings: { command: "creditsReset" }
		}
	} as never;
}


describe('commerce state key', () => {
 it('refreshes selected/hidden state and stops polling when the key disappears', async () => {
  vi.useFakeTimers(); const command=new SsnCommandAction(), action=fakeKey();
  try {
   mocks.sendCommand.mockResolvedValue({ok:true,payload:{commerce:{mode:'pinned',selected:{name:'Print'}}}});
   await command.onWillAppear({action,payload:{settings:{command:'getCommerceState'}}} as never);
   await vi.advanceTimersByTimeAsync(1);
   expect(action.setTitle).toHaveBeenLastCalledWith('pinned\nPrint');
   mocks.sendCommand.mockResolvedValue({ok:true,payload:{commerce:{mode:'hidden',remainingSeconds:15}}});
   await vi.advanceTimersByTimeAsync(5000);
   expect(action.setTitle).toHaveBeenLastCalledWith('hidden\n15s');
   command.onWillDisappear({action} as never);
   const count=mocks.sendCommand.mock.calls.length;
   await vi.advanceTimersByTimeAsync(10000);expect(mocks.sendCommand.mock.calls.length).toBe(count);
  } finally {command.onWillDisappear({action} as never);vi.useRealTimers();}
 });
});
