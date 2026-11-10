/**
 * Tests for T23.03: haven per tick and HAVEN_TIME_EXCEEDED (docs/specs/02 §D.8; FR-39, NFR-02, NFR-06).
 * Single owner: Anjim Hossain.
 * Pure simulation time only; uses real @marswalk/compute functions.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HAB_INGRESS_S,
  liveHaven,
  crewTimeField,
  habTimeField,
  vehicleTimeField,
  vehiclePassable,
  type LoadedGrid,
} from "@marswalk/compute";
import type {
  CrewId,
  LogEvent,
  LogEventData,
  LogEventKind,
  MissionScenario,
  ParamSet,
  Role,
} from "@marswalk/protocol";
import { havenTick } from "../src/engine/haven";
import {
  initialState,
  reduce,
  type EngineState,
  type PendingEvent,
} from "../src/engine/reducer";
import { tick, type TickContext } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";
import {
  havenFlat,
  havenWallDetour,
  pr1Params,
  defaultScenario,
} from "../../../packages/compute/tests/fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), {
  site_id: "mock_site",
  data_version: "mock_site-fixture",
  dir: null,
});

function scenarioWith(
  grid: LoadedGrid | null,
  plan?: Partial<MissionScenario>,
  params?: ParamSet[],
): LoadedScenario {
  const mergedPlan: MissionScenario = {
    ...fake.scenario.plan.scenario,
    ...(plan ?? {}),
  };
  const extraParams = params ? Object.fromEntries(params.map((p) => [p.param_set_id, p])) : {};
  return {
    ...fake,
    grid,
    scenario: {
      ...fake.scenario,
      plan: {
        ...fake.scenario.plan,
        scenario: mergedPlan,
      },
    },
    params: {
      ...fake.params,
      ...extraParams,
    },
  };
}

function makeContext(
  scenario: LoadedScenario,
  next_seq = 100,
  dt_s = 1,
): TickContext {
  return { scenario, next_seq, dt_s };
}

function withCrew(
  state: EngineState,
  crew_id: CrewId,
  patch: Partial<EngineState["crew"][number]>,
): EngineState {
  return {
    ...state,
    crew: state.crew.map((c) => (c.crew_id === crew_id ? { ...c, ...patch } : c)),
  };
}

function applyEvent(
  state: EngineState,
  kind: LogEventKind,
  data: LogEventData[LogEventKind],
  actor: Role | "system" = "system",
): EngineState {
  const event: LogEvent = {
    seq: state.session.last_seq + 1,
    sim_time: state.session.clock.sim_time,
    kind,
    actor,
    data: data as Record<string, unknown>,
    provenance: {},
    command_ref: null,
  };
  return reduce(state, event);
}

describe("T23.03: havenTick and HAVEN_TIME_EXCEEDED", () => {
  describe("no grid / fake scenario (NFR-02 engine budget)", () => {
    it("returns state unchanged without error and emits no events when grid is null", () => {
      const state = initialState(fake, "session-1");
      const ctx = makeContext(fake);
      const res = havenTick(state, ctx);
      expect(res.events).toEqual([]);
      expect(res.deltas).toEqual([]);
      expect(res.state.crew).toEqual(state.crew);
    });

    it("stays well within NFR-02 engine budget on the fake scenario (< 1 ms per tick)", () => {
      const state = initialState(fake, "session-1");
      const ctx = makeContext(fake);
      const start = performance.now();
      const iterations = 100;
      let curr = state;
      for (let i = 0; i < iterations; i++) {
        const res = havenTick(curr, ctx);
        curr = res.state;
      }
      const durationMs = performance.now() - start;
      expect(durationMs / iterations).toBeLessThan(1);
    });
  });

  describe("hab haven calculation on flat grid", () => {
    it("computes hab haven for walking crew member matching the compute oracle", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 60, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      // Set EV1 out walking at (1000, 0)
      state = withCrew(state, "EV1", {
        activity: "WALKING",
        x_m: 1000,
        y_m: 0,
      });

      const ctx = makeContext(loaded);
      const res = havenTick(state, ctx);

      const ev1 = res.state.crew.find((c) => c.crew_id === "EV1")!;
      expect(ev1.haven.kind).toBe("hab");
      expect(ev1.haven.target_x_m).toBe(0);
      expect(ev1.haven.target_y_m).toBe(0);

      // Oracle calculation: 1000 m / (3.3 km/h = 3300/3600 m/s) + 300 s ingress
      const v0 = 3300 / 3600;
      const expectedS = 1000 / v0 + HAB_INGRESS_S;
      expect(ev1.haven.minutes).toBeCloseTo(expectedS / 60, 1);

      // Emits delta for haven
      expect(res.deltas).toContainEqual({
        path: "crew/EV1/haven",
        value: ev1.haven,
      });
    });

    it("leaves crew in hab or sheltered with 0 haven minutes and no alert", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 10 });
      let state = initialState(loaded, "session-1");
      state = withCrew(state, "EV1", { activity: "IN_HAB", x_m: 0, y_m: 0 });
      state = withCrew(state, "EV2", { activity: "SHELTERED", haven: { minutes: 0, kind: "vehicle", target_x_m: 100, target_y_m: 0 } });

      const ctx = makeContext(loaded);
      const res = havenTick(state, ctx);

      const ev1 = res.state.crew.find((c) => c.crew_id === "EV1")!;
      const ev2 = res.state.crew.find((c) => c.crew_id === "EV2")!;
      expect(ev1.haven.minutes).toBe(0);
      expect(ev1.haven.kind).toBe("hab");
      expect(ev2.haven.minutes).toBe(0);
      expect(ev2.haven.kind).toBe("vehicle");
      expect(res.events).toEqual([]);
    });
  });

  describe("pressurized rover vehicle haven calculation", () => {
    it("chooses vehicle haven when rover is parked closer than hab", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(
        fx.grid,
        { max_haven_min: 60, vehicle_available: true, vehicle_param_set: "pr1-assumed" },
        [pr1Params],
      );
      let state = initialState(loaded, "session-1");
      // Rover parked at (900, 0)
      state = {
        ...state,
        vehicles: state.vehicles.map((v) =>
          v.kind === "pressurized_rover"
            ? { ...v, state: "PARKED", x_m: 900, y_m: 0, param_set: "pr1-assumed" }
            : v,
        ),
      };
      // EV1 walking at (1000, 0): only 100 m from rover!
      state = withCrew(state, "EV1", { activity: "WALKING", x_m: 1000, y_m: 0 });

      const ctx = makeContext(loaded);
      const res = havenTick(state, ctx);

      const ev1 = res.state.crew.find((c) => c.crew_id === "EV1")!;
      expect(ev1.haven.kind).toBe("vehicle");
      // Minutes to rover should be much less than hab (~23 min)
      expect(ev1.haven.minutes).toBeLessThan(10);
    });
  });

  describe("HAVEN_TIME_EXCEEDED alert lifecycle", () => {
    it("raises HAVEN_TIME_EXCEEDED warning when haven minutes strictly exceeds max_haven_min", () => {
      const fx = havenFlat(10);
      // max_haven_min = 15 min, but at (1000, 0) haven time is ~23.18 min
      const loaded = scenarioWith(fx.grid, { max_haven_min: 15, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      state = withCrew(state, "EV1", { activity: "WALKING", x_m: 1000, y_m: 0 });

      const ctx = makeContext(loaded, 401);
      const res = havenTick(state, ctx);

      expect(res.events).toHaveLength(1);
      const [ev] = res.events;
      expect(ev.kind).toBe("ALERT_RAISED");
      expect(ev.actor).toBe("system");
      expect(ev.data).toMatchObject({
        alert_id: "a-401",
        code: "HAVEN_TIME_EXCEEDED",
        level: "warning",
        subjects: ["EV1"],
        message: "Head to hab now — haven time exceeded",
        haven_kind: "hab",
      });
      const data = ev.data as LogEventData["ALERT_RAISED"];
      expect(data.haven_min).toBeCloseTo(23.18, 1);
      expect(ev.provenance).toEqual({
        "data.haven_min": "modelled",
      });
    });

    it("does not re-raise duplicate alert on consecutive ticks while active", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 15, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      state = withCrew(state, "EV1", { activity: "WALKING", x_m: 1000, y_m: 0 });

      const ctx = makeContext(loaded, 401);
      const res1 = havenTick(state, ctx);
      expect(res1.events).toHaveLength(1);

      // Apply the raised alert to state
      const [raised] = res1.events;
      const alertedState = applyEvent(res1.state, "ALERT_RAISED", raised.data as LogEventData["ALERT_RAISED"]);

      // Second tick
      const res2 = havenTick(alertedState, makeContext(loaded, 402));
      expect(res2.events).toHaveLength(0);
    });

    it("clears HAVEN_TIME_EXCEEDED when haven time drops below or equals max_haven_min", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 15, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      state = withCrew(state, "EV1", { activity: "WALKING", x_m: 1000, y_m: 0 });

      // Raise initial alert
      state = applyEvent(state, "ALERT_RAISED", {
        alert_id: "a-500",
        code: "HAVEN_TIME_EXCEEDED",
        level: "warning",
        subjects: ["EV1"],
        message: "Head to hab now — haven time exceeded",
        haven_min: 23.2,
        haven_kind: "hab",
      });

      // EV1 moves back close to hab (100 m away: ~1.8 min + 5 min ingress = ~6.8 min < 15 min)
      state = withCrew(state, "EV1", { x_m: 100, y_m: 0 });

      const res = havenTick(state, makeContext(loaded, 501));
      expect(res.events).toHaveLength(1);
      expect(res.events[0]).toMatchObject({
        kind: "ALERT_CLEARED",
        actor: "system",
        data: { alert_id: "a-500" },
      });
    });

    it("clears HAVEN_TIME_EXCEEDED when crew returns to hab or becomes sheltered", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 15, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      state = applyEvent(state, "ALERT_RAISED", {
        alert_id: "a-500",
        code: "HAVEN_TIME_EXCEEDED",
        level: "warning",
        subjects: ["EV1"],
        message: "Head to hab now — haven time exceeded",
        haven_min: 25,
        haven_kind: "hab",
      });

      // EV1 is in hab
      state = withCrew(state, "EV1", { activity: "IN_HAB", x_m: 0, y_m: 0 });

      const res = havenTick(state, makeContext(loaded, 502));
      expect(res.events).toContainEqual(
        expect.objectContaining({
          kind: "ALERT_CLEARED",
          data: { alert_id: "a-500" },
        }),
      );
    });

    it("isolates alerts by crew member (EV1 exceeded, EV2 within limits)", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 15, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      // EV1 at 1000 m (exceeded ~23 min), EV2 at 200 m (~7.4 min <= 15 min)
      state = withCrew(state, "EV1", { activity: "WALKING", x_m: 1000, y_m: 0 });
      state = withCrew(state, "EV2", { activity: "WALKING", x_m: 200, y_m: 0 });

      const res = havenTick(state, makeContext(loaded, 601));
      expect(res.events).toHaveLength(1);
      expect(res.events[0].data).toMatchObject({
        code: "HAVEN_TIME_EXCEEDED",
        subjects: ["EV1"],
      });
    });
  });

  describe("unreachable haven (Infinity)", () => {
    it("sets haven minutes to Infinity and raises warning with null haven_min when cut off by wall", () => {
      // havenWallDetour has an impassable wall blocking crew from hab
      const fx = havenWallDetour(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 10, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      // Place EV1 behind the blocked wall
      state = withCrew(state, "EV1", {
        activity: "WALKING",
        x_m: fx.shape.crew.x_m,
        y_m: fx.shape.crew.y_m,
      });

      const res = havenTick(state, makeContext(loaded, 701));
      const ev1 = res.state.crew.find((c) => c.crew_id === "EV1")!;
      // Even with detour, if max_haven_min is 10 and detour takes > 10 min, alert is raised
      expect(ev1.haven.minutes).toBeGreaterThan(10);
      expect(res.events).toHaveLength(1);
      expect(res.events[0].data).toMatchObject({
        code: "HAVEN_TIME_EXCEEDED",
        subjects: ["EV1"],
      });
    });
  });

  describe("tick() pipeline integration", () => {
    it("runs havenTick inside tick() and integrates into state and deltas", () => {
      const fx = havenFlat(10);
      const loaded = scenarioWith(fx.grid, { max_haven_min: 15, vehicle_available: false });
      let state = initialState(loaded, "session-1");
      state = withCrew(state, "EV1", { activity: "WALKING", x_m: 1000, y_m: 0 });

      const res = tick(state, loaded, 1, 800);
      const ev1 = res.state.crew.find((c) => c.crew_id === "EV1")!;
      expect(ev1.haven.kind).toBe("hab");
      expect(ev1.haven.minutes).toBeCloseTo(23.18, 1);
      // Alerts array in returned state contains the raised HAVEN_TIME_EXCEEDED alert
      expect(res.state.alerts.some((a) => a.code === "HAVEN_TIME_EXCEEDED")).toBe(true);
    });
  });
});

