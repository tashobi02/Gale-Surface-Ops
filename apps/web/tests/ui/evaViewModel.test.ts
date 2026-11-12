/**
 * T24.02 — Tests: EVA view model on the mock fixtures (docs/specs/01 FR-32; NFR-05; 03 SCR-12, SCR-13).
 * Exercises C17 selectors against the T20.02 killer-demo WebSocket fixtures.
 * Driven through the real Hab Core client store (apps/web/src/net/habClient.ts): each state below is what the
 * store holds after the fixture messages (SNAPSHOT, STATE_DELTA), or after a SNAPSHOT that carries the alerts, tasks
 * or crew a test needs. No test re-implements the Hab Core reducer.
 * Gated with the PENDING pattern so red tests against stubs do not fail CI before T24.03.
 */
import { describe, expect, it } from "vitest";
import type { Alert, ContingencyOption, PlanExport, ServerMessage, Snapshot, StopTask, Vehicle } from "@marswalk/protocol";
import { connectHab, type SocketLike } from "../../src/net/habClient";
import { wsFixtures, type Beat } from "../fixtures/ws";
import {
  isProvenance,
  selectAlertSlot,
  selectEvaViewModel,
  selectHaven,
  selectHudViewModel,
  selectMetadataStrip,
  selectNextStop,
  selectO2,
  type EvaViewModel,
  type HudViewModel,
} from "../../src/ui/eva/viewModel";

class MockSocket implements SocketLike {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(_data: string): void {}
  close(): void {}
}

/** The real client store after the connect beat, then `beat` (STATE_DELTAs applied by the client), then `extra`. */
function storeState(beat: Beat, extra: ServerMessage[] = []): Snapshot {
  const mockSocket = new MockSocket();
  const client = connectHab({
    role: "eva:EV1",
    clientId: "c-7f3a",
    displayName: "EV1",
    url: "ws://localhost/ws",
    socketFactory: () => mockSocket,
  });
  const messages: ServerMessage[] = [...wsFixtures.connect, ...(beat === "connect" ? [] : wsFixtures[beat]), ...extra];
  for (const msg of messages) mockSocket.onmessage?.({ data: JSON.stringify(msg) });
  const state = client.state();
  if (!state) throw new Error(`Failed to initialize state from beat: ${beat}`);
  return state;
}

function getSnapshot(beat: Beat): Snapshot {
  return JSON.parse(JSON.stringify(storeState(beat))) as Snapshot;
}

/** The connect SNAPSHOT with `patch` applied, delivered through the client store like any other SNAPSHOT. */
function snapshotWith(patch: Partial<Snapshot>): Snapshot {
  const connect = wsFixtures.connect[0] as Snapshot;
  return storeState("connect", [{ ...connect, ...patch, seq: connect.seq + 1 }]);
}

/** Alert literals with the field values of the fixtures `radiation-alert` and `comm-shadow` (05 Alert). */
const alert = (over: Partial<Alert>): Alert => ({
  alert_id: "a-420",
  code: "RADIATION_ALERT",
  level: "warning",
  subjects: ["EV1", "EV2"],
  raised_seq: 420,
  acked_seq: null,
  cleared_seq: null,
  acked_by: null,
  message: "Shelter now — radiation surge",
  data: {},
  ...over,
});

const commShadow = alert({ alert_id: "a-430", code: "COMM_SHADOW", level: "caution", subjects: ["EV1"], raised_seq: 430, message: "Comm shadow in 120 m — stay with EV2" });

const task = (over: Partial<StopTask>): StopTask => ({
  task_id: "t-s2-02", stop_id: "wp-2", crew_id: "EV1", kind: "image", text: "Image the ridge crest", state: "TODO",
  reason: null, origin: "plan", updated_sim_time: "", updated_by: "system", provenance: {}, ...over,
});

const option = (over: Partial<ContingencyOption>): ContingencyOption => ({
  option_id: "o1", alert_id: "a-420", kind: "VEHICLE_RENDEZVOUS", crew_ids: ["EV1", "EV2"], eta_shelter_min: 14, expected_dose_ugy: 0,
  stops_dropped: [], violations: [], rank: 1, path_preview: [], rendezvous: null, ...over,
});

/** A plan with a start and three stops (only the fields the selectors read). */
const PLAN = {
  waypoints: [
    { id: "wp-0", role: "start", x_m: 0, y_m: 0, label: "Hab" },
    { id: "wp-1", role: "stop", x_m: 100, y_m: 0, label: "First ridge" },
    { id: "wp-2", role: "stop", x_m: 200, y_m: 0, label: "Second ridge" },
    { id: "wp-3", role: "stop", x_m: 300, y_m: 0, label: "Third ridge" },
  ],
  result: { legs: [] },
} as unknown as PlanExport;

const withCrew = (snapshot: Snapshot, over: Partial<Snapshot["crew"][number]>): Snapshot => ({
  ...snapshot,
  crew: snapshot.crew.map((c) => (c.crew_id === "EV1" ? { ...c, ...over } : c)),
});

const VALID_PROVENANCE = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"] as const;

describe("crew telemetry supplied by Hab Core", () => {
  it("age from last-linked sim time", () => {
    const snapshot = withCrew({ ...getSnapshot("connect"), sim_time: "2026-11-12T12:01:30Z" }, {
      last_linked_sim_time: "2026-11-12T12:01:00Z",
    });
    expect(selectMetadataStrip(snapshot, "EV1").link.ageSeconds).toBe(30);
    expect(selectMetadataStrip(withCrew(snapshot, { last_linked_sim_time: null }), "EV1").link.ageSeconds).toBeNull();
    expect(selectMetadataStrip(withCrew(snapshot, { last_linked_sim_time: "invalid" }), "EV1").link.ageSeconds).toBeNull();
    expect(selectMetadataStrip(withCrew(snapshot, { last_linked_sim_time: "2026-11-12T12:02:00Z" }), "EV1").link.ageSeconds).toBeNull();
  });

  it("navigation from crew record", () => {
    const snapshot = withCrew(getSnapshot("walking"), {
      next_stop_bearing_deg: 90, next_stop_distance_m: 120, next_stop_eta_s: 180, o2_remaining_min: 42,
    });
    expect(selectNextStop(snapshot, "EV1")).toMatchObject({
      bearingDeg: { v: 90, prov: "derived", src: "snapshot:crew.next_stop_bearing_deg" },
      distanceM: { v: 120, prov: "derived", src: "snapshot:crew.next_stop_distance_m" },
      etaMinutes: { v: 3, prov: "modelled", src: "snapshot:crew.next_stop_eta_s" },
    });
    expect(selectO2(snapshot, "EV1").timeLeftMinutes).toMatchObject({ v: 42, prov: "simulated", src: "snapshot:crew.o2_remaining_min" });
  });

  it("does not substitute a planned leg duration for live arrival time", () => {
    const plan = { ...PLAN, result: { ...PLAN.result, legs: [{ to: "wp-2", walk_time_min: 7 }] } } as unknown as PlanExport;
    const snapshot = withCrew({ ...getSnapshot("walking"), plan }, { activity: "WALKING", stop_index: 1, next_stop_eta_s: null });
    expect(selectNextStop(snapshot, "EV1")?.etaMinutes).toMatchObject({ v: "—", unavailable: true });
  });
});

/**
 * Gating probe: red against the T24.01 stubs (they throw "TODO(TASK-24): not implemented").
 * When run on main before T24.03, these are skipped so CI remains green.
 * Run with PENDING_RED=1 to see them fail against the stubs.
 */
const PENDING = !process.env.PENDING_RED && ([
  () => selectEvaViewModel(undefined as never, "EV1"),
] as (() => unknown)[]).some((probe) => {
  try {
    probe();
    return false;
  } catch (err) {
    return /TODO\(TASK-24\): not implemented/.test(String(err));
  }
});

describe.skipIf(PENDING)("EVA view model on mock fixtures (T24.02)", () => {
  it("beat connect: gives expected HAVEN kind (vehicle), nominal O₂, and active link", () => {
    const snapshot = getSnapshot("connect");
    const vm: EvaViewModel = selectEvaViewModel(snapshot, "EV1");

    expect(vm.crewId).toBe("EV1");
    expect(vm.haven.kind).toBe("vehicle");
    expect(vm.haven.minutes.v).toBeCloseTo(18.4, 1);
    expect(vm.haven.status).toBe("nominal");
    expect(vm.o2.percent.v).toBe(71);
    expect(vm.o2.status).toBe("nominal");
    expect(vm.metadata.link.linked).toBe(true);
    expect(vm.metadata.link.stale).toBe(false);
    expect(vm.alertSlot).toBeNull();
  });

  it("beat walking: updates haven and O₂; next-stop bearing and distance stay unavailable (no UI geometry)", () => {
    const snapshot = getSnapshot("walking");
    const vm: EvaViewModel = selectEvaViewModel(snapshot, "EV1");

    expect(vm.haven.kind).toBe("vehicle");
    expect(vm.o2.percent.v).toBeGreaterThan(0);
    expect(vm.metadata.link.linked).toBe(true);

    // The UI does not compute geometry (TASK-24): navigation is "—" until the Hab Core supplies it.
    expect(vm.nextStop).not.toBeNull();
    expect(vm.nextStop!.distanceM.v).toBe("—");
    expect(vm.nextStop!.bearingDeg.v).toBe("—");
    expect(vm.nextStop!.distanceM.src).not.toMatch(/compute:geometry/);
    expect(vm.nextStop!.distanceM.unavailable).toBe(true);
    expect(vm.nextStop!.distanceM.prov).toBeNull();
    expect(vm.nextStop!.distanceM.src).toBe("unavailable:next_stop.distance_m");
  });

  it("beat radiation-alert: alert slot contains WARNING level with shelter surge message", () => {
    const snapshot = snapshotWith({ alerts: [alert({})] });
    const alertSlot = selectAlertSlot(snapshot, "EV1");

    expect(alertSlot).not.toBeNull();
    expect(alertSlot?.level).toBe("warning");
    expect(alertSlot?.code).toBe("RADIATION_ALERT");
    expect(alertSlot?.message).toMatch(/Shelter now|radiation/i);

    // Haven status escalates on warning
    const haven = selectHaven(snapshot, "EV1");
    expect(haven.status).toBe("warning");
  });

  it("beat options-proposed: reflects proposed contingency options for evacuation", () => {
    const snapshot = snapshotWith({ alerts: [alert({})], options: [option({}), option({ option_id: "o2", kind: "ABORT_TO_HAB", rank: 2, eta_shelter_min: 41 })] });
    const vm: EvaViewModel = selectEvaViewModel(snapshot, "EV1");

    // The slot shows the server's alert, not text the client made up for the options.
    expect(vm.alertSlot).toMatchObject({ alertId: "a-420", code: "RADIATION_ALERT", message: "Shelter now — radiation surge" });
  });

  it("options with no alert in the snapshot do not invent an alert (no 'opt-alert', no made-up message)", () => {
    const snapshot = snapshotWith({ alerts: [], options: [option({ alert_id: "" })] });

    expect(selectAlertSlot(snapshot, "EV1")).toBeNull();
    expect(selectEvaViewModel(snapshot, "EV1").alertSlot).toBeNull();
    expect(JSON.stringify(selectHudViewModel(snapshot, "EV1"))).not.toMatch(/opt-alert|CONTINGENCY_OPTIONS|Contingency options available/);
  });

  it("beat summon-accepted: vehicle dispatch updates nearest haven ETA", () => {
    const snapshot = getSnapshot("summon-accepted");
    const haven = selectHaven(snapshot, "EV1");

    expect(haven.kind).toBe("vehicle");
    expect(haven.minutes.v).toBeGreaterThan(0);
  });

  it("beat comm-shadow: alert slot reflects CAUTION level and advisory text", () => {
    const snapshot = snapshotWith({ alerts: [commShadow] });
    const alertSlot = selectAlertSlot(snapshot, "EV1");

    expect(alertSlot).not.toBeNull();
    expect(alertSlot?.level).toBe("caution");
    expect(alertSlot?.code).toBe("COMM_SHADOW");
    expect(alertSlot?.message).toMatch(/comm shadow/i);
  });

  it("beat link-lost-restored: unlinked state is stale; no telemetry age is invented", () => {
    const snapshot = withCrew(getSnapshot("link-lost-restored"), { linked: false, stale: true });
    const metadata = selectMetadataStrip(snapshot, "EV1");

    // Link lost: unlinked and stale
    expect(metadata.link.linked).toBe(false);
    expect(metadata.link.stale).toBe(true);
    // TODO(decision): a real telemetry age comes from the Hab Core; the selector must not fabricate one.
    expect(metadata.link.ageSeconds).toBeNull();
    // No server field gives link quality: the bars are unknown, not 0 and not a formula of the hop count.
    expect(metadata.link.bars).toBeNull();
  });

  it("beat stop-task-ticked: updates stop task counts in nextStop view", () => {
    const snapshot = snapshotWith({ tasks: [task({ state: "DONE" })] });
    const nextStop = selectNextStop(snapshot, "EV1");

    expect(nextStop).not.toBeNull();
    expect(nextStop!.taskCount).toEqual({ done: 1, total: 1 });
  });

  it("every displayed value carries a valid provenance class (FR-15, NFR-05)", () => {
    const snapshot = getSnapshot("connect");
    const haven = selectHaven(snapshot, "EV1");
    const o2 = selectO2(snapshot, "EV1");
    const meta = selectMetadataStrip(snapshot, "EV1");

    expect(VALID_PROVENANCE).toContain(haven.minutes.prov);
    expect(haven.minutes.prov).not.toBe("measured"); // simulated values must never be labelled measured
    expect(VALID_PROVENANCE).toContain(o2.percent.prov);
    expect(o2.percent.prov).not.toBe("measured");
    // No O₂ alert in this beat, so time left is unavailable: flagged, with no class (none is known) and never "assumed".
    expect(o2.timeLeftMinutes.unavailable).toBe(true);
    expect(o2.timeLeftMinutes.prov).toBeNull();
    expect(VALID_PROVENANCE).toContain(meta.evaTimeSeconds.prov);
    expect(VALID_PROVENANCE).toContain(meta.doseUgy.prov);
  });

  it("selectHudViewModel produces visor glance view with at most 5 core values (04 §E.6)", () => {
    const snapshot = getSnapshot("connect");
    const hud: HudViewModel = selectHudViewModel(snapshot, "EV1");

    // Must have at most 5 glanceable properties on HUD (excluding crewId)
    const glanceFields = (Object.keys(hud) as (keyof HudViewModel)[]).filter(
      (key) => key !== "crewId",
    );
    expect(glanceFields.length).toBeLessThanOrEqual(5);
    expect(glanceFields).toEqual(
      expect.arrayContaining(["haven", "targetBearingDistance", "o2", "alertSlot", "link"]),
    );

    expect(hud.crewId).toBe("EV1");
    expect(hud.haven).toBeDefined();
    expect(hud.o2).toBeDefined();
    expect(hud.link).toBeDefined();
  });
});

describe("EVA view model without telemetry (no invented values)", () => {
  it("a null snapshot yields unavailable values and unknown status, never numbers", () => {
    const vm = selectEvaViewModel(null, "EV1");

    expect(vm.haven.minutes.v).toBe("—");
    expect(vm.haven.status).toBe("unknown");
    expect(vm.haven.kind).toBeNull();
    expect(vm.haven.targetId).toBeUndefined();
    expect(vm.o2.percent.v).toBe("—");
    expect(vm.o2.status).toBe("unknown");
    expect(vm.metadata.evaTimeSeconds.v).toBe("—");
    expect(vm.metadata.doseUgy.v).toBe("—");
    expect(vm.metadata.link.linked).toBeNull();
    expect(vm.metadata.link.stale).toBeNull();
    expect(vm.metadata.link.ageSeconds).toBeNull();
    expect(vm.nextStop).toBeNull();
    // Availability is separate from provenance: flagged unavailable, the field's 05 class kept, never "assumed".
    const expected: [typeof vm.haven.minutes, string][] = [
      [vm.haven.minutes, "modelled"],
      [vm.o2.percent, "simulated"],
      [vm.metadata.evaTimeSeconds, "simulated"],
      [vm.metadata.doseUgy, "simulated"],
    ];
    for (const [v, prov] of expected) {
      expect(v.unavailable).toBe(true);
      expect(v.prov).toBe(prov);
      expect(v.src).toMatch(/^unavailable:crew\./);
    }
  });

  it("real zero values stay zero (a measured 0 is not 'unavailable')", () => {
    const snapshot = getSnapshot("connect");
    const crew = snapshot.crew.find((c) => c.crew_id === "EV1")!;
    crew.o2_frac = 0;
    crew.dose_event_ugy = 0;
    crew.eva_elapsed_s = 0;
    const vm = selectEvaViewModel(snapshot, "EV1");

    expect(vm.o2.percent.v).toBe(0);
    expect(vm.metadata.doseUgy.v).toBe(0);
    expect(vm.metadata.evaTimeSeconds.v).toBe(0);
  });

  it("a non-finite value is unavailable, not NaN", () => {
    const snapshot = getSnapshot("connect");
    const crew = snapshot.crew.find((c) => c.crew_id === "EV1")!;
    crew.o2_frac = Number.NaN;
    crew.haven.minutes = Number.POSITIVE_INFINITY;
    const vm = selectEvaViewModel(snapshot, "EV1");

    expect(vm.o2.percent.v).toBe("—");
    expect(vm.haven.minutes.v).toBe("—");
  });

  it("missing stop coordinates stay unavailable even when haven coordinates exist", () => {
    const snapshot = getSnapshot("connect");
    snapshot.plan = null as never;
    const crew = snapshot.crew.find((c) => c.crew_id === "EV1")!;
    expect(crew.haven.target_x_m).toBeDefined();
    snapshot.tasks = [
      { task_id: "t-1", stop_id: "wp-2", crew_id: "EV1", kind: "image", text: "x", state: "TODO", reason: null, origin: "plan", updated_sim_time: "", updated_by: "system", provenance: {} },
    ];
    const next = selectNextStop(snapshot, "EV1");

    expect(next).not.toBeNull();
    expect(next!.bearingDeg.v).toBe("—");
    expect(next!.distanceM.v).toBe("—");
  });

  it("task counts include only this crew's tasks at the stop, and an empty list has total 0", () => {
    const snapshot = getSnapshot("connect");
    const mk = (id: string, crew: "EV1" | "EV2" | null, state: "TODO" | "DONE"): Snapshot["tasks"][number] => ({
      task_id: id, stop_id: "wp-2", crew_id: crew, kind: "image", text: id, state, reason: null,
      origin: "plan", updated_sim_time: "", updated_by: "system", provenance: {},
    });
    snapshot.plan = null as never;
    snapshot.tasks = [mk("a", "EV1", "DONE"), mk("b", "EV1", "TODO"), mk("c", "EV2", "DONE"), mk("d", null, "DONE")];
    const next = selectNextStop(snapshot, "EV1");

    expect(next!.taskCount).toEqual({ done: 2, total: 3 });

    // Another crew's tasks alone give this crew nothing at all (no stop, no fabricated total of 1).
    snapshot.tasks = [mk("c", "EV2", "DONE")];
    expect(selectNextStop(snapshot, "EV1")).toBeNull();
  });
});

describe("next stop follows the engine's one-based stop_index (T24.03; apps/hab-core tick.ts)", () => {
  const at = (activity: Snapshot["crew"][number]["activity"], stop_index: number | null): Snapshot =>
    withCrew(snapshotWith({ plan: PLAN, tasks: [] }), { activity, stop_index });

  it("walking before any stop: the first stop of the plan", () => {
    expect(selectNextStop(at("WALKING", null), "EV1")).toMatchObject({ stopId: "wp-1", stopName: "First ridge" });
  });

  it("walking after leaving stop 1: stop 2, not stop 1 again", () => {
    expect(selectNextStop(at("WALKING", 1), "EV1")).toMatchObject({ stopId: "wp-2", stopName: "Second ridge" });
    expect(selectNextStop(at("WALKING", 2), "EV1")).toMatchObject({ stopId: "wp-3" });
  });

  it("at stop 2: that stop (the index is one-based, so wp-2 and not wp-3)", () => {
    expect(selectNextStop(at("AT_STOP", 2), "EV1")).toMatchObject({ stopId: "wp-2" });
    expect(selectNextStop(at("AT_STOP", 1), "EV1")).toMatchObject({ stopId: "wp-1" });
  });

  it("an index outside the plan's stops is unknown: no fallback to stop 1 or to the hab", () => {
    for (const [activity, index] of [["WALKING", 3], ["WALKING", 99], ["AT_STOP", 0], ["AT_STOP", 4], ["AT_STOP", -1], ["AT_STOP", 1.5]] as const) {
      expect(selectNextStop(at(activity, index), "EV1")).toBeNull();
    }
  });

  it("heading to a haven or sheltered: there is no next stop", () => {
    expect(selectNextStop(at("TO_HAVEN", 1), "EV1")).toBeNull();
    expect(selectNextStop(at("SHELTERED", 1), "EV1")).toBeNull();
  });

  it("the view model carries the crew member's activity, or null when the crew member is not in the snapshot", () => {
    expect(selectEvaViewModel(at("AT_STOP", 2), "EV1").activity).toBe("AT_STOP");
    expect(selectEvaViewModel(at("AT_STOP", 2), "EV2").activity).toBeNull();
    expect(selectEvaViewModel(null, "EV1").activity).toBeNull();
  });
});

describe("provenance comes from the data, never from a cast (FR-15, NFR-05)", () => {
  it("isProvenance accepts exactly the six classes", () => {
    for (const p of ["measured", "derived", "modelled", "assumed", "replayed", "simulated"]) expect(isProvenance(p)).toBe(true);
    for (const bad of ["live", "Measured", "", " simulated", undefined, null, 1, {}, ["simulated"]]) expect(isProvenance(bad)).toBe(false);
  });

  it("a snapshot provenance entry that is not a class is not shown; the field's 05 class is", () => {
    const snapshot = snapshotWith({
      provenance: { "crew.o2_frac": "live", "crew.haven.minutes": 7, "crew.eva_elapsed_s": "", "crew.dose_event_ugy": "measured " } as never,
    });
    const labels = [
      selectO2(snapshot, "EV1").percent.prov,
      selectHaven(snapshot, "EV1").minutes.prov,
      selectMetadataStrip(snapshot, "EV1").evaTimeSeconds.prov,
      selectMetadataStrip(snapshot, "EV1").doseUgy.prov,
    ];
    expect(labels).toEqual(["simulated", "modelled", "simulated", "simulated"]);
  });

  it("a valid entry in the snapshot's provenance map wins over the default", () => {
    const snapshot = snapshotWith({ provenance: { "crew.o2_frac": "replayed", "crew.haven.minutes": "derived" } });
    expect(selectO2(snapshot, "EV1").percent.prov).toBe("replayed");
    expect(selectHaven(snapshot, "EV1").minutes.prov).toBe("derived");
  });
});

describe("O₂ time left is the server's alert value with the server's provenance (T24.03)", () => {
  const o2Alert = (data: Alert["data"], over: Partial<Alert> = {}): Alert =>
    alert({ alert_id: "a-500", code: "CONSUMABLES_LOW", level: "caution", subjects: ["EV1"], raised_seq: 500, message: "O₂ low", data, ...over });

  it("reads the class from the alert's own provenance (simulated), not 'derived'", () => {
    const snapshot = snapshotWith({ alerts: [o2Alert({ o2_remaining_min: 95, provenance: { "data.o2_remaining_min": "simulated" } })] });
    const o2 = selectO2(snapshot, "EV1");

    expect(o2.timeLeftMinutes).toMatchObject({ v: 95, unit: "min", prov: "simulated" });
    expect(o2.timeLeftMinutes.unavailable).toBeUndefined();
    expect(o2.status).toBe("caution");
  });

  it("a number the server did not label is not shown: it reads — rather than carry a guessed class", () => {
    for (const data of [{ o2_remaining_min: 95 }, { o2_remaining_min: 95, provenance: { "data.o2_remaining_min": "live" } }] as Alert["data"][]) {
      const o2 = selectO2(snapshotWith({ alerts: [o2Alert(data)] }), "EV1");
      expect(o2.timeLeftMinutes.v).toBe("—");
      expect(o2.timeLeftMinutes.unavailable).toBe(true);
    }
  });

  it("with no O₂ alert the time left stays —", () => {
    const o2 = selectO2(snapshotWith({ alerts: [] }), "EV1");
    expect(o2.timeLeftMinutes.v).toBe("—");
    expect(o2.timeLeftMinutes.src).toBe("unavailable:crew.o2_time_left_min");
  });
});

describe("HAVEN target is the vehicle the server tied to this crew member by its SUMMON task (T24.03)", () => {
  const rover = (over: Partial<Vehicle>): Vehicle => ({
    vehicle_id: "PR1", kind: "pressurized_rover", param_set: "pr1-assumed", x_m: -1800, y_m: -1500, state: "PARKED",
    task: null, path: [], eta_s: null, battery_wh: null, ...over,
  });
  const summon = (crew: ("EV1" | "EV2")[]): Vehicle["task"] => ({ kind: "SUMMON", target: { x_m: 10, y_m: 20 }, crew_ids: crew });
  const targetOf = (vehicles: Vehicle[], haven: Partial<Snapshot["crew"][number]["haven"]> = {}): string | undefined => {
    const base = snapshotWith({ vehicles });
    const crew = base.crew.find((c) => c.crew_id === "EV1")!;
    return selectHaven(withCrew(base, { haven: { ...crew.haven, ...haven } }), "EV1").targetId;
  };

  it("a parked pressurized rover that nobody summoned is not the target", () => {
    expect(targetOf([rover({})])).toBeUndefined();
    expect(targetOf([rover({ state: "EN_ROUTE" })])).toBeUndefined();
  });

  it("the vehicle whose SUMMON task names this crew member is", () => {
    expect(targetOf([rover({ vehicle_id: "PR1", state: "EN_ROUTE", task: summon(["EV2"]) }), rover({ vehicle_id: "PR2", state: "EN_ROUTE", task: summon(["EV1"]) })])).toBe("PR2");
  });

  it("a utility rover or a non-SUMMON task does not make a vehicle the target", () => {
    const utility = rover({ vehicle_id: "UR1", kind: "utility_rover", state: "TASKED", task: { kind: "SCOUT", target: { x_m: 1, y_m: 2 } } });
    expect(targetOf([utility])).toBeUndefined();
  });

  it("two vehicles both summoned for this crew member are ambiguous: unknown, not the first", () => {
    expect(targetOf([rover({ vehicle_id: "PR1", task: summon(["EV1"]) }), rover({ vehicle_id: "PR2", task: summon(["EV1"]) })])).toBeUndefined();
  });

  it("a vehicle merely standing at the reported haven target is not matched: no float-equality guess", () => {
    expect(targetOf([rover({ x_m: 55, y_m: -66 })], { target_x_m: 55, target_y_m: -66 })).toBeUndefined();
  });

  it("only a vehicle haven has a target id", () => {
    const base = snapshotWith({ vehicles: [rover({ task: summon(["EV1"]) })] });
    const hab = withCrew(base, { haven: { ...base.crew[0].haven, kind: "hab" } });
    expect(selectHaven(hab, "EV1").targetId).toBeUndefined();
  });
});

describe("link bars are unknown until the Hab Core supplies link quality (T24.03)", () => {
  it("a linked crew member with a relay path has no invented bar count", () => {
    for (const link_path of [[], ["PR1"], ["PR1", "RELAY"], ["a", "b", "c", "d"]]) {
      const snapshot = withCrew(snapshotWith({}), { linked: true, link_path });
      expect(selectMetadataStrip(snapshot, "EV1").link.bars).toBeNull();
    }
  });
});

describe("cleared alerts no longer count (cleared_seq; 05 Alert)", () => {
  it("a cleared RADIATION_ALERT leaves the alert slot and HAVEN status", () => {
    const live = snapshotWith({ alerts: [alert({})] });
    const cleared = snapshotWith({ alerts: [alert({ cleared_seq: 431 })] });

    expect(selectAlertSlot(live, "EV1")).not.toBeNull();
    expect(selectHaven(live, "EV1").status).toBe("warning");
    expect(selectAlertSlot(cleared, "EV1")).toBeNull();
    expect(selectHaven(cleared, "EV1").status).toBe("nominal");
  });

  it("a cleared CONSUMABLES_LOW leaves the O₂ status and its time left", () => {
    const data = { o2_remaining_min: 95, provenance: { "data.o2_remaining_min": "simulated" } } as Alert["data"];
    const raised = alert({ alert_id: "a-500", code: "CONSUMABLES_LOW", level: "caution", subjects: ["EV1"], data });
    const cleared = snapshotWith({ alerts: [{ ...raised, cleared_seq: 510 }] });

    expect(selectO2(snapshotWith({ alerts: [raised] }), "EV1").status).toBe("caution");
    expect(selectO2(cleared, "EV1").status).toBe("nominal");
    expect(selectO2(cleared, "EV1").timeLeftMinutes.v).toBe("—");
  });

  it("a cleared warning does not hide a live caution", () => {
    const snapshot = snapshotWith({ alerts: [alert({ cleared_seq: 431 }), commShadow] });
    expect(selectAlertSlot(snapshot, "EV1")).toMatchObject({ code: "COMM_SHADOW", level: "caution" });
  });
});
