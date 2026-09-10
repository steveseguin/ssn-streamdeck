import { describe, expect, it } from "vitest";
import { buildSsnCommandPayload, getCommandDefinition, isCommandSupported } from "./command-registry.js";
import { summarizeQueryResult } from "./query-result.js";

describe("named Event Flow workflows", () => {
    it("keeps the name, flow target and data in the command", () => {
        const value = { trigger: "intermission", flowId: "flow-one", data: { minutes: 5 } };
        const result = buildSsnCommandPayload({ command: "triggerWorkflow", value: JSON.stringify(value) });
        expect(result.action).toBe("triggerWorkflow");
        expect(result.value).toEqual(value);
        expect(getCommandDefinition("triggerWorkflow").defaultAwaitResponse).toBe(true);
    });
    it("hides workflows when an older host does not advertise support", () => {
        const oldHost = { version: 1, runtime: "web", ssn: { actions: { getQueueSize: true } } } as any;
        expect(isCommandSupported("triggerWorkflow", oldHost)).toBe(false);
        oldHost.ssn.actions.triggerWorkflow = true;
        expect(isCommandSupported("triggerWorkflow", oldHost)).toBe(true);
    });
    it("reports the number of callable entries and handles unavailable lists", () => {
        expect(summarizeQueryResult("workflows", { ok: true, payload: { triggers: [{ flowId: "one", trigger: "break" }] } })).toBe("1");
        expect(summarizeQueryResult("workflows", { ok: true, payload: { triggers: [] } })).toBe("0");
        expect(summarizeQueryResult("workflows", { ok: false, code: "TARGET_UNAVAILABLE" })).toBeNull();
    });
});
