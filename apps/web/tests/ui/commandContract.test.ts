/**
 * T24.05 / T24.06 — the commands the EVA controls emit, run through the REAL Hab Core command handler
 * (apps/hab-core/src/commands.ts, 02 §E.4 and §E.6), using the Hab Core's own fake-scenario fixture.
 *
 * The controls are mounted and held (real components, fake timers), their emitted commands are captured,
 * and each is handed to `handleCommand` as the matching EVA role. This is the contract check the earlier
 * tests only asserted by hand: SUMMON_VEHICLE and ABORT both need `args.crew`, and an EVA role may not send
 * APPROVE_OPTION.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { Command, ContingencyOption, CommandResult, CrewId, LogEvent, LogEventData, LogEventKind, Role } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand } from "../../../hab-core/src/commands";
import { initialState, reduce, type EngineState } from "../../../hab-core/src/engine/reducer";
import { readScenario } from "../../../hab-core/src/scenario";
import { AbortToHabButton, SummonRoverButton, HOLD_DURATION_MS } from "../../src/ui/eva/HoldToConfirm";
import { Options } from "../../src/ui/screens/scr14Options";
import { accepted, recordingClient, storeFromBeat, type SentCommand } from "./fixtureStore";
import { flush, installDom, mount, must, pointerDown, removeDom } from "./domHarness";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "../../../hab-core/tests/fixtures/fake-scenario"), {
  site_id: "mock_site",
  data_version: "mock_site-fixture",
  dir: null,
});
const T0 = fake.scenario.start_utc;

function apply(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: T0, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}

const running = apply(initialState(fake, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");

const ABORT_OPTION: ContingencyOption = {
  option_id: "o-abort",
  alert_id: "a-2",
  kind: "ABORT_TO_HAB",
  crew_ids: ["EV1", "EV2"],
  eta_shelter_min: 20,
  expected_dose_ugy: 1,
  stops_dropped: [],
  violations: [],
  rank: 1,
  path_preview: [],
  rendezvous: null,
};
const withAbortOption = apply(
  apply(running, "ALERT_RAISED", { alert_id: "a-2", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" }),
  "OPTIONS_PROPOSED",
  { alert_id: "a-2", options: [ABORT_OPTION] },
);

let n = 0;
function serverResult(state: EngineState, role: Role, sent: SentCommand): CommandResult {
  const command = { command_id: `k-${++n}`, role, kind: sent.kind, args: sent.args } as Command;
  return handleCommand(state, command, { scenario: fake, client_id: "c-1", next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() }).result;
}

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function hold(button: Element): Promise<void> {
  await pointerDown(button);
  await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
  await flush();
}

describe("EVA control payloads against the real Hab Core command handler", () => {
  it.each(["EV1", "EV2"] as const)("%s: SUMMON passes role, self and argument checks (never 'needs args.crew')", async (crewId: CrewId) => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", `eva:${crewId}`));
    const { container } = await mount(createElement(SummonRoverButton, { client, crewId }));
    await hold(must(container, "#action-summon-rover"));

    expect(sent).toHaveLength(1);
    const result = serverResult(running, `eva:${crewId}`, sent[0]);
    const text = JSON.stringify(result);
    // The handler may still answer for scenario reasons (no grid, no feasible rendezvous), but never for the payload.
    expect(text).not.toMatch(/needs args\.crew|FORBIDDEN_ROLE|may summon only/);
  });

  // The fake scenario has no routing grid, so a fully accepted ABORT cannot be produced here (that needs the real
  // grid, see apps/hab-core/tests/contingencyOpsReal.test.ts). What this checks is that the payload gets through
  // role, self, argument and option selection, and is only turned away by the missing grid.
  it.each(["EV1", "EV2"] as const)("%s: ABORT passes role, self, args and option selection (stops only at the missing routing grid)", async (crewId: CrewId) => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", `eva:${crewId}`));
    const { container } = await mount(createElement(AbortToHabButton, { client, crewId }));
    await hold(must(container, "#action-abort-hab"));

    expect(sent).toEqual([{ kind: "ABORT", args: { crew: [crewId] } }]);
    const result = serverResult(withAbortOption, `eva:${crewId}`, sent[0]);
    expect(result).toMatchObject({ ok: false, code: "INVALID", message: "the scenario has no routing grid" });
  });

  it("ABORT with no active option is rejected by the server, and the control shows that rejection", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"), (cmd) => serverResult(running, "eva:EV1", cmd));
    const { container } = await mount(createElement(AbortToHabButton, { client, crewId: "EV1" }));
    const button = must<HTMLButtonElement>(container, "#action-abort-hab");
    await hold(button);

    expect(sent).toHaveLength(1);
    expect(button.getAttribute("data-phase")).toBe("rejected");
    expect(button.textContent).toMatch(/no active ABORT_TO_HAB option/);
  });

  it("the previous payload shapes are rejected by the same handler (the test can fail)", () => {
    expect(serverResult(running, "eva:EV1", { kind: "SUMMON_VEHICLE", args: { vehicle_id: "PR1" } })).toMatchObject({ ok: false, code: "INVALID" });
    expect(serverResult(withAbortOption, "eva:EV1", { kind: "ABORT", args: { reason: "crew_request" } })).toMatchObject({ ok: false, code: "INVALID" });
    expect(serverResult(withAbortOption, "eva:EV1", { kind: "APPROVE_OPTION", args: { option_id: "o-abort" } })).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
  });

  it("an EVA Options sheet for an abort option sends an ABORT the handler gets as far as route planning with", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { client, sent } = recordingClient(storeFromBeat("connect"), (cmd) => serverResult(withAbortOption, "eva:EV1", cmd));
    const snapshot = { ...storeFromBeat("connect").state()!, options: [ABORT_OPTION] };
    const { container } = await mount(createElement(Options, { client, snapshot, variant: "eva", crewId: "EV1", onClose }));
    const button = must<HTMLButtonElement>(container, "#action-confirm-option");
    await hold(button);

    expect(sent).toEqual([{ kind: "ABORT", args: { crew: ["EV1", "EV2"] } }]);
    // Only the missing grid stops it, so the sheet shows that rejection and stays open.
    expect(button.textContent).toContain("the scenario has no routing grid");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the Options sheet does not close when the handler rejects for want of an active option in the engine state", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { client } = recordingClient(storeFromBeat("connect"), (cmd) => serverResult(running, "eva:EV1", cmd));
    const snapshot = { ...storeFromBeat("connect").state()!, options: [ABORT_OPTION] };
    const { container } = await mount(createElement(Options, { client, snapshot, variant: "eva", crewId: "EV1", onClose }));
    const button = must<HTMLButtonElement>(container, "#action-confirm-option");
    await hold(button);

    expect(onClose).not.toHaveBeenCalled();
    expect(button.getAttribute("data-phase")).toBe("rejected");
  });

  it("a stand-in answer proves the harness: an accepted fake result lets onDispatched fire", async () => {
    vi.useFakeTimers();
    const onDispatched = vi.fn();
    const { client } = recordingClient(storeFromBeat("connect"), () => accepted());
    const { container } = await mount(createElement(SummonRoverButton, { client, crewId: "EV1", onDispatched }));
    await hold(must(container, "#action-summon-rover"));
    expect(onDispatched).toHaveBeenCalledTimes(1);
  });
});
