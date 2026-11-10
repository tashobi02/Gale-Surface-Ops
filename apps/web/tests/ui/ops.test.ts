/**
 * T25.07 — Tests: ops and join DOM tests (docs/specs/01 FR-31, FR-34, FR-44; 04 §D.2, §E.4).
 * The real OpsConsole, AlertStack, ClockControl, ConditionsPanel and OptionsPanel are mounted with explicit
 * fixtures and driven by clicks and holds. Absent, empty and partial inputs are checked separately: nothing may
 * be filled in from defaults.
 *
 * Not claimed here: the 3-column layout at >= 1280 px (pixel geometry) and session/store wiring (T25.01 follow-up).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Alert, Command, ContingencyOption, Crew, LogEvent, LogEventData, LogEventKind, Role, Snapshot, Vehicle } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand } from "../../../hab-core/src/commands";
import { initialState, reduce, type EngineState } from "../../../hab-core/src/engine/reducer";
import { readScenario } from "../../../hab-core/src/scenario";
import { OpsConsole } from "../../src/ui/screens/scr11OpsConsole";
import { Join } from "../../src/ui/screens/scr10Join";
import { ClockControl } from "../../src/ui/ops/ClockControl";
import { OptionsPanel } from "../../src/ui/ops/OptionsPanel";
import { AlertStack } from "../../src/ui/ops/AlertStack";
import { ConditionsPanel } from "../../src/ui/ops/ConditionsPanel";
import { HOLD_DURATION_MS } from "../../src/ui/eva/HoldToConfirm";
import { recordingClient, rejected, storeFromBeat } from "./fixtureStore";
import { click, flush, installDom, mount, must, pointerDown, pointerUp, removeDom } from "./domHarness";

/** The Hab Core's own fake scenario, so emitted commands can be run through the real handler (02 §E.4). */
const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "../../../hab-core/tests/fixtures/fake-scenario"), {
  site_id: "mock_site",
  data_version: "mock_site-fixture",
  dir: null,
});

function applyEvent(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: fake.scenario.start_utc, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}

let commandCounter = 0;
/** What the real Hab Core command handler answers to one command a control sent, as `role`. */
function serverAnswer(state: EngineState, role: Role, sent: { kind: string; args: Record<string, unknown> }) {
  const command = { command_id: `k-${++commandCounter}`, role, kind: sent.kind, args: sent.args } as Command;
  return handleCommand(state, command, { scenario: fake, client_id: "c-1", next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() });
}

/** Types into a React-controlled input the way a user would (native value setter, then an input event). */
async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input) as object, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function submitForm(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

const PROVENANCE = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"];

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const connectSnapshot = (): Snapshot => storeFromBeat("connect", "ops").state()!;
const ev1 = (): Crew => connectSnapshot().crew.find((c) => c.crew_id === "EV1")!;

/** A second crew member for the tests, built from EV1's fixture entry with explicit overrides. */
const crewMember = (over: Partial<Crew>): Crew => ({ ...ev1(), ...over });

const utilityRover = (over: Partial<Vehicle>): Vehicle => ({
  vehicle_id: "UR1",
  kind: "utility_rover",
  param_set: "default",
  x_m: 10,
  y_m: 20,
  state: "PARKED",
  task: null,
  path: [],
  eta_s: null,
  battery_wh: 640,
  ...over,
});

const warning = (over: Partial<Alert> = {}): Alert => ({
  alert_id: "a-w",
  code: "RADIATION_ALERT",
  level: "warning",
  subjects: ["EV1"],
  raised_seq: 7,
  acked_seq: null,
  cleared_seq: null,
  acked_by: null,
  message: "Shelter now",
  data: {},
  ...over,
});

describe("SCR-11 Ops console with nothing supplied (04 §D.1: no sample data)", () => {
  it("renders every module label, and no crew, vehicle, alert, option, count or coordinate is made up", async () => {
    const { container } = await mount(createElement(OpsConsole));
    const text = container.textContent ?? "";

    for (const label of [/CREW/, /VEHICLES/, /CONDITIONS/, /EARTH LINK/, /EVENT LOG/, /OPTIONS/]) {
      expect(text).toMatch(label);
    }
    expect(container.querySelectorAll(".crew-card")).toHaveLength(0);
    expect(container.querySelectorAll(".vehicle-card")).toHaveLength(0);
    expect(container.querySelector(".alert-stack")).toBeNull();
    expect(text).not.toMatch(/C\. Jones|M\. Taylor|450 mGy|92%|2m ago|2410|1875|13:0\d|SCALE 1:|STOP 2|storm-sol4190/);
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
    // Header, conditions and event log read — and say why, in their labels.
    expect(text).toContain("SOL —");
    expect(text).toContain("LTST —");
    const log = must(container, ".ops-event-log [data-unavailable]");
    expect(log.getAttribute("data-source")).toBe("unavailable:event_log");
    expect(log.getAttribute("data-provenance")).toBeNull();
    expect(must(container, '[data-slot="options-empty"]').textContent).toContain("—");
    expect(must<HTMLButtonElement>(container, "#action-confirm-option").disabled).toBe(true);
  });

  it("every labelled value on the empty console has a source, and no missing value is labelled 'assumed'", async () => {
    const { container } = await mount(createElement(OpsConsole));
    const labelled = container.querySelectorAll("[data-source]");

    expect(labelled.length).toBeGreaterThan(0);
    for (const el of labelled) {
      expect(el.getAttribute("data-source")).toBeTruthy();
      const prov = el.getAttribute("data-provenance");
      if (prov !== null) expect(PROVENANCE).toContain(prov);
      expect(prov).not.toBe("assumed");
      // A missing value is flagged, shows no glyph, and its source says what is missing.
      if (el.getAttribute("data-unavailable") === "true") {
        expect(el.getAttribute("data-source")).toMatch(/^unavailable:|^docs\/specs\/01:FR-36$/);
        expect(el.textContent).not.toMatch(/[■◆○△▶◇]/);
      }
    }
  });
});

describe("SCR-11 crew and vehicle cards from explicit fixtures (04 §A.3 #8, FR-15)", () => {
  async function consoleWith(crew: Crew[], vehicles: Vehicle[] = [], alerts: Alert[] = []) {
    return mount(createElement(OpsConsole, { crew, vehicles, alerts }));
  }

  it("each telemetry value is labelled on its own element, with simulated crew fields (never measured)", async () => {
    const { container } = await consoleWith([ev1()]);
    const card = must(container, ".crew-card");

    const bySource = (src: string) => must(card, `[data-source="${src}"]`);
    expect(bySource("snapshot:crew.o2_frac").getAttribute("data-provenance")).toBe("simulated");
    expect(bySource("snapshot:crew.dose_event_ugy").getAttribute("data-provenance")).toBe("simulated");
    expect(bySource("snapshot:crew.linked").getAttribute("data-provenance")).toBe("simulated");
    expect(bySource("snapshot:crew.haven.minutes").getAttribute("data-provenance")).toBe("modelled");
    expect(card.innerHTML).not.toContain('data-provenance="measured"');
    expect(bySource("snapshot:crew.o2_frac").textContent).toContain(`${Math.round(ev1().o2_frac * 100)} %`);
    expect(card.textContent).not.toMatch(/C\. Jones/);
  });

  it("a real zero dose and a real zero O₂ show as 0, not as —", async () => {
    const { container } = await consoleWith([crewMember({ o2_frac: 0, dose_event_ugy: 0 })]);

    expect(must(container, '[data-source="snapshot:crew.o2_frac"]').textContent).toContain("0 %");
    expect(must(container, '[data-source="snapshot:crew.dose_event_ugy"]').textContent).toContain("0.0 mGy");
  });

  it("a partial crew entry shows — for the missing fields and keeps the rest", async () => {
    const partial = { ...ev1(), haven: undefined, o2_frac: Number.NaN } as unknown as Crew;
    const { container } = await consoleWith([partial]);
    const card = must(container, ".crew-card");

    const haven = must(card, '[data-source="unavailable:crew.haven.minutes"]');
    expect(haven.textContent).toContain("— MIN");
    expect(haven.getAttribute("data-unavailable")).toBe("true");
    expect(haven.getAttribute("data-provenance")).toBe("modelled");
    const o2 = must(card, '[data-source="unavailable:crew.o2_frac"]');
    expect(o2.textContent).toContain("— %");
    expect(o2.getAttribute("data-provenance")).toBe("simulated");
    expect(o2.textContent).not.toMatch(/[■◆○△▶◇]/);
    expect(must(card, '[data-source="snapshot:crew.dose_event_ugy"]').textContent).toContain("0.0 mGy");
    expect(card.textContent).not.toMatch(/NaN|\b14 MIN|71/);
  });

  it("an unlinked crew card is dashed, says LOST and shows the last-heard age as — (no age is invented)", async () => {
    const { container } = await consoleWith([crewMember({ linked: false, stale: true })]);
    const card = must(container, ".crew-card");

    expect(card.className).toMatch(/unlinked/);
    expect(card.className).toMatch(/dashed/);
    expect(card.textContent).toContain("LOST");
    const age = must(card, '[data-source="unavailable:link.age_seconds"]');
    expect(age.textContent).toBe("—");
    expect(age.getAttribute("data-unavailable")).toBe("true");
    expect(age.getAttribute("data-provenance")).toBe("simulated");
    expect(card.textContent).not.toMatch(/2m ago/);
  });

  it("task progress shows — until counts are supplied, then the supplied counts; + TASK needs a known stop", async () => {
    const bare = await consoleWith([ev1()]);
    const progress = must(bare.container, '[data-testid="task-progress-EV1"]');
    expect(progress.textContent).toContain("STOP —");
    expect(progress.textContent).not.toMatch(/\d\/\d/);
    expect(must<HTMLButtonElement>(progress, "button").disabled).toBe(true);
    await bare.unmount();

    const supplied = await mount(
      createElement(OpsConsole, {
        crew: [ev1()],
        taskProgress: { EV1: { stop: { stopId: "wp-4", stopNo: 4, done: 0, total: 2 }, total: { done: 1, total: 6 } } },
      }),
    );
    const p = must(supplied.container, '[data-testid="task-progress-EV1"]');
    expect(p.textContent).toContain("STOP 4 0/2");
    expect(p.textContent).toContain("TOTAL 1/6");
    expect(must<HTMLButtonElement>(p, "button").disabled).toBe(false);
  });

  it("battery is the supplied Wh for the utility rover, and — for the pressurised rover; never a percentage", async () => {
    const { container } = await consoleWith([], [
      { ...connectSnapshot().vehicles[0], battery_wh: null },
      utilityRover({ battery_wh: 640 }),
    ]);
    const cards = [...container.querySelectorAll(".vehicle-card")];

    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toMatch(/BATTERY\s*—/);
    expect(cards[1].textContent).toContain("640 Wh");
    expect(container.textContent).not.toMatch(/\d\s?%.*BATTERY|BATTERY.*\d\s?%|\/130/);
    expect(must(cards[1], '[data-source="snapshot:vehicles.battery_wh"]').getAttribute("data-provenance")).toBe("simulated");
  });

  it("vehicle state text is neutral: no status colour without a safety status", async () => {
    const { container } = await consoleWith([], [utilityRover({ state: "EN_ROUTE" })]);
    const card = must(container, ".vehicle-card");

    expect(card.innerHTML).not.toMatch(/--status-(nominal|caution|warning)/);
    expect(card.textContent).toContain("EN_ROUTE");
  });
});

describe("Alert system (04 §D.2, §E.4)", () => {
  const caution = (): Alert => warning({ alert_id: "a-c", code: "COMM_SHADOW", level: "caution", message: "Comm shadow", raised_seq: 9 });

  it("the highest level takes the single bar; the others are counted; every alert shows shape and word", async () => {
    const { container } = await mount(createElement(AlertStack, { alerts: [caution(), warning()] }));
    const bar = must(container, ".alert-bar");

    expect(must(container, ".alert-stack").getAttribute("data-level")).toBe("warning");
    expect(bar.textContent).toContain("WARNING");
    expect(bar.textContent).toContain("⬣");
    expect(bar.textContent).toContain("Shelter now");
    expect(bar.textContent).toContain("+1");
    const items = container.querySelectorAll(".alert-item");
    expect(items).toHaveLength(2);
    expect(items[1].textContent).toMatch(/▲/);
    expect(items[1].textContent).toContain("CAUTION");
  });

  it("ACK calls onAcknowledge with the alert id only (no sequence number), once; an acknowledged alert has no ACK button", async () => {
    const onAcknowledge = vi.fn();
    const { container } = await mount(createElement(AlertStack, { alerts: [warning()], onAcknowledge }));

    await click(must(container, '[aria-label^="Acknowledge alert: Shelter now"]'));
    expect(onAcknowledge.mock.calls).toEqual([["a-w"]]);

    const acked = await mount(createElement(AlertStack, { alerts: [warning({ acked_seq: 8, acked_by: "ops" })] }));
    expect(acked.container.querySelector('[aria-label^="Acknowledge alert:"]')).toBeNull();
    expect(acked.container.textContent).toContain("ACK by ops");
  });

  it("ops: ACK button sends ACK_ALERT with alert_id", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const onAcknowledgeAlert = vi.fn();
    const { container } = await mount(createElement(OpsConsole, { alerts: [warning()], client, onAcknowledgeAlert }));

    await click(must(container, '.alert-bar [aria-label^="Acknowledge alert"]'));
    await flush();
    expect(sent).toEqual([{ kind: "ACK_ALERT", args: { alert_id: "a-w" } }]);
    // The caller is told once the Hab Core accepted it, with the id (not the raised sequence 7).
    expect(onAcknowledgeAlert.mock.calls).toEqual([["a-w"]]);
  });

  it("ops: the ACK in the expanded queue acknowledges that alert, not the bar's", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const caution = warning({ alert_id: "a-c", level: "caution", code: "COMM_SHADOW", message: "Comm shadow", raised_seq: 9 });
    const { container } = await mount(createElement(OpsConsole, { alerts: [warning(), caution], client }));

    const items = [...container.querySelectorAll(".alert-item")];
    await click(must(items[1], '[aria-label^="Acknowledge alert"]'));
    await flush();
    expect(sent).toEqual([{ kind: "ACK_ALERT", args: { alert_id: "a-c" } }]);
  });

  it("ops: a rejected ACK is shown and not reported as acknowledged", async () => {
    const { client } = recordingClient(storeFromBeat("connect", "ops"), () => rejected("INVALID", "no active alert a-w"));
    const onAcknowledgeAlert = vi.fn();
    const { container } = await mount(createElement(OpsConsole, { alerts: [warning()], client, onAcknowledgeAlert }));

    await click(must(container, '.alert-bar [aria-label^="Acknowledge alert"]'));
    await flush();
    expect(onAcknowledgeAlert).not.toHaveBeenCalled();
    expect(must(container, '[data-slot="command-error"]').textContent).toContain("no active alert a-w");
  });

  it("contract: the ACK payload is accepted by the real Hab Core handler for ops, and the old sequence-only shape is not", async () => {
    const running = applyEvent(initialState(fake, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
    const raised = applyEvent(running, "ALERT_RAISED", { alert_id: "a-2", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const { container } = await mount(createElement(OpsConsole, { alerts: raised.alerts, client }));

    await click(must(container, '.alert-bar [aria-label^="Acknowledge alert"]'));
    await flush();
    expect(sent).toHaveLength(1);
    const answer = serverAnswer(raised, "ops", sent[0]);
    expect(answer.result.ok).toBe(true);
    expect(answer.events.map((e) => e.kind)).toEqual(["ALERT_ACKED"]);
    expect(answer.events[0].data).toMatchObject({ alert_id: "a-2", acked_by: "ops" });

    const legacy = serverAnswer(raised, "ops", { kind: "ACK_ALERT", args: { seq: raised.alerts[0].raised_seq } });
    expect(legacy.result.ok).toBe(false);
  });
});

describe("Mission clock controls (04 §E.4, FR-30, FR-31)", () => {
  it("ClockControl: pause, each speed, step, scenario and start EVA each trigger their command", async () => {
    const onCommand = vi.fn();
    const onSetSpeed = vi.fn();
    const onPauseResume = vi.fn();
    const onJumpNextEvent = vi.fn();
    const onStartEva = vi.fn();
    const { container } = await mount(
      createElement(ClockControl, {
        speed: 1,
        isPaused: false,
        sessionState: "LOADED",
        activeScenarioId: "storm-sol4190",
        onCommand,
        onSetSpeed,
        onPauseResume,
        onJumpNextEvent,
        onStartEva,
      }),
    );

    await click(must(container, '[aria-label="Set speed to 10x"]'));
    await click(must(container, '[aria-label="Set speed to 60x"]'));
    await click(must(container, '[aria-label="Pause mission clock"]'));
    await click(must(container, '[aria-label="Jump to next scheduled event"]'));
    await click(must(container, '[aria-label="Start EVA mission"]'));

    expect(onSetSpeed.mock.calls).toEqual([[10], [60]]);
    expect(onPauseResume.mock.calls).toEqual([[true]]);
    expect(onJumpNextEvent).toHaveBeenCalledTimes(1);
    expect(onStartEva).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.calls.map(([c]) => c)).toEqual([
      { kind: "SET_CLOCK", args: { speed: 10 } },
      { kind: "SET_CLOCK", args: { speed: 60 } },
      { kind: "SET_CLOCK", args: { paused: true } },
      { kind: "JUMP_NEXT_EVENT", args: {} },
      { kind: "START_EVA", args: {} },
    ]);
  });

  it("ClockControl lists only the scenario it is told about; no invented scenario catalogue or Sol numbers", async () => {
    const none = await mount(createElement(ClockControl, {}));
    expect(none.container.textContent).not.toMatch(/Sol 419\d|Nominal Boxwork|Comm Shadow/);
    expect(none.container.querySelectorAll("option")).toHaveLength(1);
    await none.unmount();

    const one = await mount(createElement(ClockControl, { activeScenarioId: "storm-sol4190" }));
    expect([...one.container.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["storm-sol4190"]);
  });

  it("ClockControl is controlled: a click reports the command but the highlighted speed follows the props", async () => {
    const m = await mount(createElement(ClockControl, { speed: 1, isPaused: false }));

    await click(must(m.container, '[aria-label="Set speed to 10x"]'));
    expect(must(m.container, '[aria-label="Set speed to 1x"]').getAttribute("aria-pressed")).toBe("true");
    expect(must(m.container, '[aria-label="Set speed to 10x"]').getAttribute("aria-pressed")).toBe("false");

    await m.rerender(createElement(ClockControl, { speed: 10, isPaused: true }));
    expect(must(m.container, '[aria-label="Set speed to 10x"]').getAttribute("aria-pressed")).toBe("true");
    expect(m.container.querySelector('[aria-label="Resume mission clock"]')).not.toBeNull();
  });

  it("START EVA is neutral chrome, not a status colour", async () => {
    const { container } = await mount(createElement(ClockControl, { sessionState: "LOADED" }));
    expect(must(container, '[aria-label="Start EVA mission"]').getAttribute("style")).not.toMatch(/--status-/);
  });

  /** The connect snapshot with the session clock replaced, as the Hab Core would broadcast after a clock change. */
  const withClock = (clock: { speed: 1 | 10 | 60; paused: boolean }): Snapshot => {
    const snap = connectSnapshot();
    return { ...snap, session: { ...snap.session, clock: { ...snap.session.clock, ...clock } } };
  };

  it("ops: pause sends SET_CLOCK {paused:true}; the 10x button sends SET_CLOCK {speed:10}; next event sends JUMP_NEXT_EVENT", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const { container } = await mount(createElement(OpsConsole, { client, snapshot: withClock({ speed: 60, paused: false }) }));

    await click(must(container, '[aria-label="Pause mission clock"]'));
    await click(must(container, '[aria-label="Set speed to 10x"]'));
    await click(must(container, '[aria-label="Jump to next scheduled event"]'));
    await flush();

    expect(sent).toEqual([
      { kind: "SET_CLOCK", args: { paused: true } },
      { kind: "SET_CLOCK", args: { speed: 10 } },
      { kind: "JUMP_NEXT_EVENT", args: {} },
    ]);
  });

  it("ops: every command the clock controls send is accepted by the real Hab Core handler for ops (no PAUSE/SET_SPEED/STEP)", async () => {
    const running = applyEvent(initialState(fake, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const { container } = await mount(createElement(OpsConsole, { client, snapshot: withClock({ speed: 60, paused: false }) }));

    await click(must(container, '[aria-label="Pause mission clock"]'));
    await click(must(container, '[aria-label="Set speed to 10x"]'));
    await click(must(container, '[aria-label="Jump to next scheduled event"]'));
    await flush();

    expect(sent).toHaveLength(3);
    for (const command of sent) expect(serverAnswer(running, "ops", command).result.ok).toBe(true);
  });

  it("the clock buttons show the session clock from the snapshot, and follow it when the server changes it", async () => {
    const view = (snapshot: Snapshot | null) => createElement(OpsConsole, { snapshot });
    const m = await mount(view(withClock({ speed: 60, paused: false })));
    const pressed = () =>
      [...m.container.querySelectorAll('[aria-label^="Set speed to"]')]
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.getAttribute("aria-label"));

    expect(pressed()).toEqual(["Set speed to 60x"]);
    expect(m.container.querySelector('[aria-label="Pause mission clock"]')).not.toBeNull();

    // The server pauses at 10x: the console follows, with no click on this client.
    await m.rerender(view(withClock({ speed: 10, paused: true })));
    expect(pressed()).toEqual(["Set speed to 10x"]);
    expect(m.container.querySelector('[aria-label="Pause mission clock"]')).toBeNull();
    expect(m.container.querySelector('[aria-label="Resume mission clock"]')).not.toBeNull();
  });

  it("after the server paused the clock, the same button sends the resume (paused:false)", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const m = await mount(createElement(OpsConsole, { client, snapshot: withClock({ speed: 60, paused: false }) }));
    await m.rerender(createElement(OpsConsole, { client, snapshot: withClock({ speed: 60, paused: true }) }));

    await click(must(m.container, '[aria-label="Resume mission clock"]'));
    await flush();
    expect(sent).toEqual([{ kind: "SET_CLOCK", args: { paused: false } }]);
  });

  it("with no snapshot the clock state is unknown: no speed is shown as pressed and pause/resume is not offered", async () => {
    const { container } = await mount(createElement(OpsConsole));

    expect(container.querySelectorAll('[aria-label^="Set speed to"][aria-pressed="true"]')).toHaveLength(0);
    expect(must<HTMLButtonElement>(container, '[aria-label="Pause or resume mission clock (state unknown)"]').disabled).toBe(true);
  });

  it("without a client the commands go to onCommand, in protocol form", async () => {
    const onCommand = vi.fn();
    const { container } = await mount(createElement(OpsConsole, { onCommand, snapshot: withClock({ speed: 1, paused: false }) }));

    await click(must(container, '[aria-label="Set speed to 10x"]'));
    await click(must(container, '[aria-label="Jump to next scheduled event"]'));
    expect(onCommand.mock.calls.map(([c]) => c)).toEqual([
      { kind: "SET_CLOCK", args: { speed: 10 } },
      { kind: "JUMP_NEXT_EVENT", args: {} },
    ]);
  });

  it("a rejected clock command is shown on the console", async () => {
    const { client } = recordingClient(storeFromBeat("connect", "ops"), () => rejected("INVALID", "Changing the clock is not allowed when ENDED"));
    const { container } = await mount(createElement(OpsConsole, { client, snapshot: withClock({ speed: 60, paused: false }) }));

    await click(must(container, '[aria-label="Set speed to 10x"]'));
    await flush();
    expect(must(container, '[data-slot="command-error"]').textContent).toContain("Changing the clock is not allowed");
  });

  it("START EVA appears only when the session is LOADED, from the snapshot (no assumed state)", async () => {
    const snap = connectSnapshot();
    const loaded = { ...snap, session: { ...snap.session, status: "LOADED" as const } };
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const m = await mount(createElement(OpsConsole, { client, snapshot: loaded }));

    await click(must(m.container, '[aria-label="Start EVA mission"]'));
    await flush();
    expect(sent).toEqual([{ kind: "START_EVA", args: {} }]);
    await m.rerender(createElement(OpsConsole, { client, snapshot: snap }));
    expect(m.container.querySelector('[aria-label="Start EVA mission"]')).toBeNull();
  });
});

describe("Options panel: ops approves with a full hold (04 §D.3, FR-44)", () => {
  const option: ContingencyOption = {
    option_id: "o-ops",
    alert_id: "a-1",
    kind: "VEHICLE_RENDEZVOUS",
    crew_ids: ["EV1"],
    eta_shelter_min: 12,
    expected_dose_ugy: 3,
    stops_dropped: [],
    violations: [],
    rank: 1,
    path_preview: [],
    rendezvous: null,
  };

  async function hold(button: Element): Promise<void> {
    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    await flush();
  }

  it("a full hold sends one APPROVE_OPTION; onApproveOption fires only after it was accepted", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const onApproveOption = vi.fn();
    const snapshot = { ...connectSnapshot(), options: [option] };
    const { container } = await mount(createElement(OpsConsole, { client, snapshot, onApproveOption }));

    await hold(must(container, "#action-confirm-option"));
    expect(sent).toEqual([{ kind: "APPROVE_OPTION", args: { option_id: "o-ops" } }]);
    expect(onApproveOption.mock.calls).toEqual([["o-ops"]]);
  });

  it("approving the selected option sends that option's id, not a fixed one", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const second: ContingencyOption = { ...option, option_id: "o-second", rank: 2, kind: "ABORT_TO_HAB", crew_ids: ["EV2"] };
    const snapshot = { ...connectSnapshot(), options: [option, second] };
    const { container } = await mount(createElement(OpsConsole, { client, snapshot }));

    await click(must(container, '[role="radio"]:nth-of-type(2)'));
    await hold(must(container, "#action-confirm-option"));
    expect(sent).toEqual([{ kind: "APPROVE_OPTION", args: { option_id: "o-second" } }]);
  });

  it("OptionsPanel takes its crew from the caller (required prop, no EV1 default)", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const forEv2: ContingencyOption = { ...option, option_id: "o-ev2", crew_ids: ["EV2"] };
    const snapshot = { ...connectSnapshot(), options: [forEv2] };
    const { container } = await mount(createElement(OptionsPanel, { client, snapshot, crewId: "EV2" }));

    await hold(must(container, "#action-confirm-option"));
    expect(sent).toEqual([{ kind: "APPROVE_OPTION", args: { option_id: "o-ev2" } }]);
    // @ts-expect-error crewId is required: there is no default crew (take it from props or the session).
    createElement(OptionsPanel, { client, snapshot });
  });

  it("a short press sends nothing; a rejected approval is shown and not reported as approved", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"), () => rejected("BUSY", "rover not parked"));
    const onApproveOption = vi.fn();
    const snapshot = { ...connectSnapshot(), options: [option] };
    const { container } = await mount(createElement(OpsConsole, { client, snapshot, onApproveOption }));
    const button = must<HTMLButtonElement>(container, "#action-confirm-option");

    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(300); });
    await pointerUp(button);
    expect(sent).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(sent).toHaveLength(0);

    await hold(button);
    expect(sent).toHaveLength(1);
    expect(button.textContent).toContain("rover not parked");
    expect(onApproveOption).not.toHaveBeenCalled();
  });
});

describe("Conditions feed (01 FR-36, NFR-05, 04 §E.4, §E.5)", () => {
  const conditions = {
    ltst: { v: "09:15", unit: "LTST", prov: "modelled" as const, src: "test:ltst" },
    sunElevationDeg: { v: 31.2, unit: "°", prov: "modelled" as const, src: "test:sun" },
    doseRateBackgroundUgyH: { v: 0, unit: "µGy/h", prov: "replayed" as const, src: "test:bg" },
    doseRateEventUgyH: { v: 5.5, unit: "µGy/h", prov: "replayed" as const, src: "test:event" },
    earthLink: {
      lightTimeSeconds: { v: 600, unit: "s", prov: "derived" as const, src: "test:light" },
      nextPass: { v: "pass at 4", prov: "derived" as const, src: "test:pass" },
      queueUp: { v: 2, unit: "pkts", prov: "derived" as const, src: "test:q-up" },
      queueDown: { v: 0, unit: "pkts", prov: "replayed" as const, src: "test:q-down" },
    },
  };

  it("with no conditions every field reads —, flagged unavailable, with no class and no glyph; no sample number appears", async () => {
    const { container } = await mount(createElement(ConditionsPanel, { variant: "ops" }));
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/13:05|42\.5|0\.21|84\.2|9m|MRO|NaN/);
    const values = container.querySelectorAll(".value");
    expect(values.length).toBe(7);
    for (const v of values) {
      expect(v.textContent).toContain("—");
      expect(v.getAttribute("data-unavailable")).toBe("true");
      expect(v.getAttribute("data-provenance")).toBeNull();
      expect(v.getAttribute("data-source")).toMatch(/^unavailable:conditions\./);
      expect(v.textContent).not.toMatch(/[■◆○△▶◇]/);
    }
    // Uplink and downlink are separate elements with separate unavailable sources.
    expect(must(container, '[data-queue="up"]').getAttribute("data-source")).toBe("unavailable:conditions.earthLink.queueUp");
    expect(must(container, '[data-queue="down"]').getAttribute("data-source")).toBe("unavailable:conditions.earthLink.queueDown");
    expect(container.querySelector(".value")?.closest("div")?.textContent).toMatch(/LTST/);
    expect(text).toMatch(/not included in this build/i);
    expect(text).not.toMatch(/\blive\b/i);
  });

  it("supplied values keep their own provenance and source; a real zero stays 0; partial input leaves the rest —", async () => {
    const { container } = await mount(createElement(ConditionsPanel, { variant: "ops", conditions }));
    const bySource = (src: string) => must(container, `[data-source="${src}"]`);

    expect(bySource("test:ltst").textContent).toContain("09:15");
    expect(bySource("test:ltst").getAttribute("data-provenance")).toBe("modelled");
    expect(bySource("test:bg").textContent).toContain("0.00 µGy/h");
    expect(bySource("test:bg").getAttribute("data-provenance")).toBe("replayed");
    expect(bySource("test:event").textContent).toContain("5.5");
    expect(bySource("test:light").textContent).toContain("10:00");
    // Each queue direction is its own element with its own source and class (the downlink does not inherit the uplink's).
    expect(bySource("test:q-up").textContent).toContain("↑2");
    expect(bySource("test:q-up").textContent).not.toContain("↓");
    expect(bySource("test:q-up").getAttribute("data-provenance")).toBe("derived");
    expect(bySource("test:q-down").textContent).toContain("↓0");
    expect(bySource("test:q-down").getAttribute("data-provenance")).toBe("replayed");
    expect(container.textContent).toMatch(/Event Dose Rate/);
    expect(container.textContent).not.toMatch(/\blive\b/i);

    const partial = await mount(
      createElement(ConditionsPanel, { variant: "ops", conditions: { ltst: conditions.ltst } }),
    );
    expect(must(partial.container, '[data-source="test:ltst"]').textContent).toContain("09:15");
    const sun = must(partial.container, '[data-source="unavailable:conditions.sunElevationDeg"]');
    expect(sun.textContent).toContain("—");
    expect(sun.getAttribute("data-unavailable")).toBe("true");
    expect(partial.container.textContent).not.toMatch(/Event Dose Rate/);
  });

  it("supplied-but-unusable values ('', blank, NaN, null) are unavailable: —, flagged, unavailable source, no glyph", async () => {
    const unusable = {
      ltst: { v: "", unit: "LTST", prov: "modelled" as const, src: "test:ltst" },
      sunElevationDeg: { v: Number.NaN, unit: "°", prov: "modelled" as const, src: "test:sun" },
      doseRateBackgroundUgyH: { v: "   " as unknown as number, unit: "µGy/h", prov: "replayed" as const, src: "test:bg" },
      earthLink: {
        lightTimeSeconds: { v: Number.POSITIVE_INFINITY, unit: "s", prov: "derived" as const, src: "test:light" },
        nextPass: { v: null as unknown as string, prov: "derived" as const, src: "test:pass" },
        queueUp: { v: Number.NaN, unit: "pkts", prov: "derived" as const, src: "test:q-up" },
        queueDown: { v: undefined as unknown as number, unit: "pkts", prov: "replayed" as const, src: "test:q-down" },
      },
    };
    for (const variant of ["ops", "eva"] as const) {
      const { container, unmount } = await mount(createElement(ConditionsPanel, { variant, conditions: unusable }));
      const flagged = container.querySelectorAll('[data-unavailable="true"]');
      expect(flagged.length).toBeGreaterThanOrEqual(variant === "ops" ? 8 : 4);
      for (const el of flagged) {
        expect(el.getAttribute("data-source")).toMatch(/^unavailable:|^docs\/specs\/01:FR-36$/);
        expect(el.textContent).not.toMatch(/[■◆○△▶◇]/);
      }
      // Their ordinary sources must not survive on a value that is not there.
      expect(container.innerHTML).not.toMatch(/data-source="test:/);
      expect(container.textContent).not.toMatch(/NaN|Infinity|null|undefined/);
      await unmount();
    }
    const ops = await mount(createElement(ConditionsPanel, { variant: "ops", conditions: unusable }));
    expect(must(ops.container, '[data-source="unavailable:conditions.ltst"]').textContent).toBe("—");
    expect(must(ops.container, '[data-queue="down"]').getAttribute("data-source")).toBe("unavailable:conditions.earthLink.queueDown");
  });

  it("a real zero and the number 0 in a string-free field are still usable", async () => {
    const { container } = await mount(
      createElement(ConditionsPanel, {
        variant: "ops",
        conditions: { sunElevationDeg: { v: 0, unit: "°", prov: "modelled" as const, src: "test:sun0" } },
      }),
    );
    const sun = must(container, '[data-source="test:sun0"]');
    expect(sun.textContent).toContain("0°");
    expect(sun.getAttribute("data-unavailable")).toBeNull();
  });

  it("the EVA strip labels each value, shows — for missing ones and never says live", async () => {
    const full = await mount(createElement(ConditionsPanel, { variant: "eva", conditions }));
    const strip = must(full.container, '[data-testid="conditions-strip-eva"]');

    for (const word of ["LTST", "SUN", "BG", "EVENT", "EARTH"]) expect(strip.textContent).toContain(word);
    for (const el of strip.querySelectorAll("span[data-provenance]")) {
      expect(el.getAttribute("data-source")).toBeTruthy();
    }
    expect(strip.textContent).not.toMatch(/\blive\b/i);
    await full.unmount();

    const empty = await mount(createElement(ConditionsPanel, { variant: "eva" }));
    expect(empty.container.textContent).not.toMatch(/\d/);
  });
});

describe("Join screen and keyboard access (NFR-04, 04 §E.4)", () => {
  it("join screen (SCR-10) offers role buttons (static markup)", () => {
    const html = renderToStaticMarkup(createElement(Join));

    expect(html).toMatch(/role/i);
    expect(html).toMatch(/<button/);
  });

  it("the ops console has only natively focusable controls and no tabindex=-1 on primary actions (static markup)", () => {
    const html = renderToStaticMarkup(createElement(OpsConsole, { crew: [ev1()], alerts: [warning()] }));

    expect(html).toMatch(/<button/);
    expect(html).not.toMatch(/tabindex="-1"/);
  });
});


describe("Crew link word: LOST only when unlinked, STALE when linked but not heard (04 §E.4)", () => {
  async function linkText(over: Partial<Crew>): Promise<{ text: string; card: HTMLElement }> {
    const { container } = await mount(createElement(OpsConsole, { crew: [crewMember(over)] }));
    const card = must(container, ".crew-card");
    return { text: must(card, '[data-source="snapshot:crew.linked"]').textContent ?? "", card };
  }

  it("linked and fresh shows neither LOST nor STALE", async () => {
    const { text, card } = await linkText({ linked: true, stale: false });
    expect(text).not.toMatch(/LOST|STALE/);
    expect(card.className).not.toMatch(/unlinked/);
  });

  it("linked but stale says STALE, not LOST", async () => {
    const { text, card } = await linkText({ linked: true, stale: true });
    expect(text).toContain("STALE");
    expect(text).not.toContain("LOST");
    // Cached values: still the dashed card.
    expect(card.className).toMatch(/dashed/);
  });

  it("unlinked says LOST", async () => {
    const { text } = await linkText({ linked: false, stale: false });
    expect(text).toContain("LOST");
    expect(text).not.toContain("STALE");
  });
});

describe("Alert latching: what leaves the bar (04 §D.2, 03 §E.7)", () => {
  const caution = (over: Partial<Alert> = {}): Alert =>
    warning({ alert_id: "a-c", code: "COMM_SHADOW", level: "caution", message: "Comm shadow", raised_seq: 9, ...over });
  const advisory = (over: Partial<Alert> = {}): Alert =>
    warning({ alert_id: "a-a", code: "EARTH_FORECAST", level: "advisory", message: "Forecast received", raised_seq: 4, ...over });

  it("an acknowledged caution leaves the bar, even though its condition has not cleared", async () => {
    const alone = await mount(createElement(AlertStack, { alerts: [caution({ acked_seq: 10, acked_by: "ops" })] }));
    expect(alone.container.querySelector(".alert-stack")).toBeNull();
    await alone.unmount();

    const withWarning = await mount(createElement(AlertStack, { alerts: [warning(), caution({ acked_seq: 10, acked_by: "ops" })] }));
    expect(withWarning.container.querySelectorAll(".alert-item")).toHaveLength(1);
    expect(withWarning.container.textContent).not.toContain("Comm shadow");
    expect(withWarning.container.textContent).not.toMatch(/\+1/);
  });

  it("a caution whose condition cleared stays until it is acknowledged", async () => {
    const { container } = await mount(createElement(AlertStack, { alerts: [caution({ cleared_seq: 11 })] }));
    expect(must(container, ".alert-bar").textContent).toContain("Comm shadow");
  });

  it("a warning stays while it is acknowledged but not cleared, or cleared but not acknowledged; it leaves when both", async () => {
    const ackedOnly = await mount(createElement(AlertStack, { alerts: [warning({ acked_seq: 8, acked_by: "ops" })] }));
    expect(ackedOnly.container.querySelector(".alert-stack")).not.toBeNull();
    const clearedOnly = await mount(createElement(AlertStack, { alerts: [warning({ cleared_seq: 8 })] }));
    expect(clearedOnly.container.querySelector(".alert-stack")).not.toBeNull();
    const both = await mount(createElement(AlertStack, { alerts: [warning({ acked_seq: 8, acked_by: "ops", cleared_seq: 9 })] }));
    expect(both.container.querySelector(".alert-stack")).toBeNull();
  });

  it("a cleared advisory moves to the log (leaves the bar); an uncleared one stays", async () => {
    const gone = await mount(createElement(AlertStack, { alerts: [advisory({ cleared_seq: 6 })] }));
    expect(gone.container.querySelector(".alert-stack")).toBeNull();
    const shown = await mount(createElement(AlertStack, { alerts: [advisory()] }));
    expect(must(shown.container, ".alert-bar").textContent).toContain("ADVISORY");
  });
});

describe("Ops console controls added in the audit (NFR-04, FR-50)", () => {
  it("the sound toggle is a focusable button with a name, and reports a click; it states what is not known", async () => {
    const onToggleSound = vi.fn();
    const { container } = await mount(createElement(OpsConsole, { onToggleSound }));

    expect(container.querySelector('span[aria-label="Sound status"]')).toBeNull();
    const button = must<HTMLButtonElement>(container, 'button[aria-label^="Alert sound"]');
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    expect(button.getAttribute("aria-label")).toMatch(/unknown/i);
    expect(button.getAttribute("aria-pressed")).toBeNull();
    await click(button);
    expect(onToggleSound).toHaveBeenCalledTimes(1);
  });

  it("the sound toggle shows on/off from the caller as pressed state and a word", async () => {
    const on = await mount(createElement(OpsConsole, { soundOn: true }));
    const b = must(on.container, 'button[aria-label^="Alert sound"]');
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.textContent).toMatch(/ON/);
    const off = await mount(createElement(OpsConsole, { soundOn: false }));
    expect(must(off.container, 'button[aria-label^="Alert sound"]').textContent).toMatch(/OFF/);
  });

  const withStop = (stopNo?: number) => ({
    crew: [ev1()],
    taskProgress: { EV1: { stop: { stopId: "poi-x7", stopNo: stopNo as number, done: 0, total: 2 }, total: { done: 0, total: 2 } } },
  });

  async function openPopover(props: Parameters<typeof OpsConsole>[0]) {
    const m = await mount(createElement(OpsConsole, props));
    await click(must(m.container, '[aria-label="Add task for EV1"]'));
    return m;
  }

  it("ops: adding a task sends ADD_STOP_TASK with crew, stop, kind and text, then closes", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const { container } = await openPopover({ ...withStop(4), client });

    await typeInto(must<HTMLInputElement>(container, '[aria-label="Enter task description"]'), "  Photograph the vein  ");
    await submitForm(must<HTMLFormElement>(container, "form"));
    await flush();

    expect(sent).toEqual([{ kind: "ADD_STOP_TASK", args: { crew_id: "EV1", stop_id: "poi-x7", kind: "observe", text: "Photograph the vein" } }]);
    expect(container.querySelector('[data-testid="add-task-popover"]')).toBeNull();
  });

  it("ops: a rejected ADD_STOP_TASK keeps the popover open and shows the reason", async () => {
    const { client } = recordingClient(storeFromBeat("connect", "ops"), () => rejected("INVALID", "stop is not the current or next one"));
    const { container } = await openPopover({ ...withStop(4), client });

    await typeInto(must<HTMLInputElement>(container, '[aria-label="Enter task description"]'), "Measure");
    await submitForm(must<HTMLFormElement>(container, "form"));
    await flush();

    expect(container.querySelector('[data-testid="add-task-popover"]')).not.toBeNull();
    expect(must(container, '[data-slot="command-error"]').textContent).toContain("stop is not the current or next one");
  });

  it("the stop is labelled with its plan number from the data, not a slice of its id; with no number it reads —", async () => {
    const numbered = await openPopover(withStop(4));
    const label = must(numbered.container, '[aria-label="Select stop"] option').textContent ?? "";
    expect(label).toBe("Stop 4");
    expect(label).not.toMatch(/poi-x7|x7/);
    await numbered.unmount();

    const bare = await openPopover(withStop(undefined));
    expect(must(bare.container, '[aria-label="Select stop"] option').textContent).toBe("—");
  });
});

describe("SCR-10 Join shows only what it is told (04 §D.1, §A.3.1)", () => {
  it("with no props: no connection status, no scenario and no taken role is made up", async () => {
    const { container } = await mount(createElement(Join));
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/CONNECTED|storm-sol4190|ROLE TAKEN|TAKE OVER ROLE/);
    expect(container.querySelectorAll(".role-taken")).toHaveLength(0);
    expect(must(container, '[data-slot="join-status"]').textContent).toContain("—");
    expect(must(container, '[data-slot="join-scenario"]').textContent).toBe("—");
  });

  it("the connection badge states its status with shape and word, from the status tokens, never brand orange", async () => {
    for (const [status, word] of [["ready", "CONNECTED"], ["connecting", "CONNECTING"], ["unreachable", "UNREACHABLE"]] as const) {
      const { container, unmount } = await mount(createElement(Join, { status }));
      const badge = must(container, '[data-slot="join-status"]');
      expect(badge.textContent).toContain(word);
      expect(badge.getAttribute("data-status")).toBeTruthy();
      const style = badge.getAttribute("style") ?? "";
      expect(style).not.toMatch(/E7553D|--signal/i);
      if (status !== "connecting") expect(style).toMatch(/--status-/);
      await unmount();
    }
  });

  it("supplied scenario and taken roles are shown; the taken-role mark is not brand orange", async () => {
    const { container } = await mount(createElement(Join, { status: "ready", takenRoles: ["ops"], sessionScenario: "my-scenario" }));

    expect(must(container, '[data-slot="join-scenario"]').textContent).toBe("my-scenario");
    expect(container.querySelectorAll(".role-taken")).toHaveLength(1);
    expect(container.innerHTML).not.toMatch(/--signal-ink|E7553D/i);
  });
});
