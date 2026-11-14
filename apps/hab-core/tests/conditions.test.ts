/**
 * T22.16 (backend package 16): the conditions feed in the engine (docs/specs/01 FR-36, FR-11; 02 §D.5, §D.13; backend
 * decisions BD-75, BD-127; contract 01-contract §5). `conditionsTick` fills `EngineState.conditions` from compute only:
 * LTST, sun elevation and the MSL sol at the hab (east-positive longitude in, the west conversion is inside compute),
 * and the replayed dose rates read through `doseAt`. Pure; sim time only.
 *
 * Rules checked here (decided by the orchestrator, 12 Nov 2026, BD-127):
 * - Values are computed for `session.clock.sim_time` (the instant the step ends at).
 * - The hab is the chosen hab candidate (`session.hab_candidate_id`) of the Site; with none, the plan's start waypoint
 *   through the inverse working projection of the loaded grid (the rule of BD-50); with neither, the solar fields stay
 *   null and the dose rates are still filled. A latitude or longitude compute rejects (RangeError) also leaves the solar
 *   fields null; nothing is substituted.
 * - Provenance classes and source ids are fixed by the field, set from the start, so a client never sees a value
 *   without them: ltst, sun_elevation_deg, sol are `derived` from `mars24-allison-mcewen-2000`; both dose rates are
 *   `replayed` from the scenario's DoseSeries `source_id`. Nothing is labelled `live`.
 * - STATE_DELTA changes are `conditions/<key>` for the keys whose value changed in this step, none otherwise.
 *
 * The oracle for every number is compute itself (`localTrueSolarTime`, `solarPosition`, `mslSol`, `rateAt`) and the F6
 * Mars24 reference file (generated with `marstime`); nothing is typed in as a science number.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SUN_ELEVATION_DECIMALS, inverseEqc, localTrueSolarTime, mslSol, parseEqcProjection, rateAt, roundTo, solarPosition } from "@marswalk/compute";
import type { Command, HabCandidate, LogEventData, Role } from "@marswalk/protocol";
import { conditionsFrame, conditionsTick, evaPhase } from "../src/engine/conditions";
import { doseAt } from "../src/engine/liveEvents";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { tick, type TickContext } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { loadSession } from "../src/session";
import { havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });

interface F6Record {
  utc: string;
  msl_sol: number;
  ltst: string;
  ltst_hours: number;
  solar_elevation_deg: number;
}
const f6 = JSON.parse(readFileSync(join(here, "../../web/tests/fixtures/mars24-reference.json"), "utf8")) as { site: { lat: number; lon_e: number }; records: F6Record[] };
const SITE = f6.site;

const candidate = (id: string, rank: number, lat: number, lon_e: number): HabCandidate => ({
  candidate_id: id,
  label: id,
  rank,
  hab_mast: { x_m: 0, y_m: 0, height_m: 3 },
  lat,
  lon_e,
  comm_hab_asset: "comm-hab",
  default_start: { x_m: 0, y_m: 0, label: id },
  provenance: "assumed",
  source_ids: [],
});
const withSite = (cands: HabCandidate[], base: LoadedScenario = fake): LoadedScenario => ({ ...base, site: { default_start: { x_m: 0, y_m: 0 }, hab_candidates: cands } });
const sc = withSite([candidate("hab-a", 1, SITE.lat, SITE.lon_e)]);

const MARS24 = "mars24-allison-mcewen-2000";
const ctxOf = (scenario: LoadedScenario = sc): TickContext => ({ scenario, dt_s: 1, next_seq: 1 });
const atTime = (s: EngineState, sim_time: string): EngineState => ({ ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time } } });
const chosen = (s: EngineState, id: string | null): EngineState => ({ ...s, session: { ...s.session, hab_candidate_id: id } });
const stateAt = (sim_time: string, scenario: LoadedScenario = sc, id: string | null = "hab-a"): EngineState => chosen(atTime(initialState(scenario, "s-0001"), sim_time), id);
const T0 = fake.scenario.start_utc;
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

function pressed(state: EngineState, at: string): EngineState {
  const entry = fake.scenario.event_library[0];
  const data: LogEventData["EVENT_STARTED"] = { event_id: entry.event_id, t0_sim_time: at, series_start_utc: entry.series_start_utc, source_id: entry.source_id };
  const pending: PendingEvent = { sim_time: at, kind: "EVENT_STARTED", actor: "presenter", data, provenance: {} };
  return reduce(state, logged(pending, 1));
}

describe("conditionsTick fills every FR-36 field from compute at the hab (BD-75, BD-127)", () => {
  it("after the first tick every contract field is set; sol, LTST and sun elevation equal compute at the candidate's lat and east longitude", () => {
    const now = new Date(T0);
    const out = conditionsTick(stateAt(T0), ctxOf()).state.conditions;
    expect(out.ltst).toBe(localTrueSolarTime(now, SITE.lon_e));
    expect(out.sun_elevation_deg).toBe(roundTo(solarPosition(now, SITE.lat, SITE.lon_e).elevation_deg, SUN_ELEVATION_DECIMALS));
    expect(out.sol).toBe(mslSol(now, SITE.lon_e));
    expect(out.dose_rate_background_ugy_h).toBe(fake.dose.background_rate);
    expect(out.dose_rate_event_ugy_h).toBe(fake.dose.background_rate);
    expect(out.event_series_utc).toBeNull();
    expect(Object.keys(out).sort()).toEqual(["dose_rate_background_ugy_h", "dose_rate_event_ugy_h", "eva_phase", "event_series_utc", "ltst", "provenance", "sol", "source_ids", "sun_elevation_deg"]);
    expect(out.ltst).toMatch(/^\d\d:\d\d$/);
    expect(Number.isInteger(out.sol)).toBe(true);
  });

  it("matches the F6 Mars24 reference file (marstime): sol and LTST exactly, elevation within the FR-11 0.1 deg", () => {
    expect(f6.records.length).toBeGreaterThanOrEqual(3);
    for (const r of f6.records) {
      const c = conditionsTick(stateAt(r.utc), ctxOf()).state.conditions;
      expect(c.sol, r.utc).toBe(r.msl_sol);
      expect(c.ltst, r.utc).toBe(r.ltst);
      expect(Math.abs(c.sun_elevation_deg! - r.solar_elevation_deg), r.utc).toBeLessThanOrEqual(0.1);
    }
  });

  it("passes the east longitude to compute: a western hab (lon_e 360 - x) is not the same place as an eastern one", () => {
    const east = conditionsTick(stateAt(T0), ctxOf()).state.conditions;
    const other = withSite([candidate("hab-a", 1, SITE.lat, 360 - SITE.lon_e)]);
    const west = conditionsTick(stateAt(T0, other), ctxOf(other)).state.conditions;
    expect(west.ltst).toBe(localTrueSolarTime(new Date(T0), 360 - SITE.lon_e));
    expect(west.ltst).not.toBe(east.ltst);
  });

  it("the sol is the one at the hab's east longitude: at an instant where the east and the west reading differ, the east one is reported", () => {
    const step = 15 * 60_000;
    let at: string | null = null;
    for (let ms = Date.parse(T0); ms < Date.parse(T0) + 25 * 3600_000 && at === null; ms += step) {
      if (mslSol(new Date(ms), SITE.lon_e) !== mslSol(new Date(ms), 360 - SITE.lon_e)) at = iso(ms);
    }
    expect(at, "an instant exists within a day where the two longitudes give different sols").not.toBeNull();
    expect(conditionsTick(stateAt(at!), ctxOf()).state.conditions.sol).toBe(mslSol(new Date(at!), SITE.lon_e));
  });

  it("uses the sim clock, so the same state gives the same numbers and a later instant gives later ones", () => {
    const a = conditionsTick(stateAt(T0), ctxOf()).state.conditions;
    expect(conditionsTick(stateAt(T0), ctxOf()).state.conditions).toEqual(a);
    const later = iso(Date.parse(T0) + 3 * 3600_000);
    const b = conditionsTick(stateAt(later), ctxOf()).state.conditions;
    expect(b.sun_elevation_deg).toBe(roundTo(solarPosition(new Date(later), SITE.lat, SITE.lon_e).elevation_deg, SUN_ELEVATION_DECIMALS));
    expect(b.sun_elevation_deg).not.toBe(a.sun_elevation_deg);
  });

  it("does not change the input state and returns no events", () => {
    const state = stateAt(T0);
    const before = JSON.stringify(state);
    const r = conditionsTick(state, ctxOf());
    expect(JSON.stringify(state)).toBe(before);
    expect(r.events).toEqual([]);
    expect(r.state).not.toBe(state);
  });
});

describe("replayed dose rates and the event series (FR-36, 02 §D.13, §D.17)", () => {
  const entry = fake.scenario.event_library[0];
  const T_PRESS = iso(Date.parse(T0) + 600_000);

  it("before START_EVENT the event rate equals the background and event_series_utc is null", () => {
    const c = conditionsTick(stateAt(T0), ctxOf()).state.conditions;
    expect(c.dose_rate_event_ugy_h).toBe(c.dose_rate_background_ugy_h);
    expect(c.event_series_utc).toBeNull();
  });

  it("after START_EVENT the event rate is the series at series_start_utc + (t - t0) and event_series_utc names that time", () => {
    // Find an offset whose recorded rate differs from the background so the test can tell the series from the constant.
    const seriesStart = Date.parse(entry.series_start_utc);
    const offsets = [0, 60, 300, 900, 1800, 3600, 7200].map((s) => s * 1000);
    const k = offsets.find((ms) => rateAt(fake.dose, iso(seriesStart + ms)) !== fake.dose.background_rate);
    expect(k, "the fixture series has a sample that differs from the background").toBeDefined();
    const now = iso(Date.parse(T_PRESS) + k!);
    const state = pressed(stateAt(T_PRESS), T_PRESS);
    const c = conditionsTick(atTime(state, now), ctxOf()).state.conditions;
    expect(c.event_series_utc).toBe(iso(seriesStart + k!));
    expect(c.dose_rate_event_ugy_h).toBe(rateAt(fake.dose, iso(seriesStart + k!)));
    expect(c.dose_rate_event_ugy_h).not.toBe(c.dose_rate_background_ugy_h);
    expect(c.dose_rate_background_ugy_h).toBe(fake.dose.background_rate);
  });

  it("is the same dose model the radiation alert reads: the rate equals rateAt on doseAt's series and time", () => {
    const state = atTime(pressed(stateAt(T_PRESS), T_PRESS), iso(Date.parse(T_PRESS) + 1_800_000));
    const src = doseAt(state, fake, state.session.clock.sim_time);
    const c = conditionsTick(state, ctxOf()).state.conditions;
    expect(c.dose_rate_event_ugy_h).toBe(rateAt(src.series, src.t_utc));
    expect(c.event_series_utc).toBe(src.t_utc);
  });

  it("a gap in the recorded series (rate null) is a null event rate, never the background", () => {
    // Inject a gap sample 30 s into the played part of the fixture series (in time order, replacing a sample at that instant).
    const seriesStart = Date.parse(entry.series_start_utc);
    const gapAt = iso(seriesStart + 30_000);
    const kept = fake.dose.samples.filter(([t]) => t !== gapAt);
    const samples = [...kept, [gapAt, null] as [string, number | null]].sort((x, y) => Date.parse(x[0]) - Date.parse(y[0]));
    const holey: LoadedScenario = { ...sc, dose: { ...sc.dose, samples } };
    const state = pressed(stateAt(T_PRESS, holey), T_PRESS);
    const now = iso(Date.parse(T_PRESS) + (Date.parse(gapAt) - seriesStart));
    expect(Date.parse(now)).toBeGreaterThanOrEqual(Date.parse(T_PRESS));
    expect(rateAt(holey.dose, gapAt)).toBeNull();
    const c = conditionsTick(atTime(state, now), ctxOf(holey)).state.conditions;
    expect(c.event_series_utc).toBe(gapAt);
    expect(c.dose_rate_event_ugy_h).toBeNull();
    expect(c.dose_rate_background_ugy_h).toBe(holey.dose.background_rate);
  });
});

describe("provenance, source ids and deltas (BD-75, 02 §E.6)", () => {
  it("each field carries its class and source id; nothing is called live", () => {
    const c = conditionsTick(stateAt(T0), ctxOf()).state.conditions;
    expect(c.provenance).toEqual({
      ltst: "derived",
      sun_elevation_deg: "derived",
      sol: "derived",
      eva_phase: "simulated",
      dose_rate_background_ugy_h: "replayed",
      dose_rate_event_ugy_h: "replayed",
    });
    expect(c.source_ids).toEqual({
      ltst: MARS24,
      sun_elevation_deg: MARS24,
      sol: MARS24,
      eva_phase: "engine:session",
      dose_rate_background_ugy_h: fake.dose.source_id,
      dose_rate_event_ugy_h: fake.dose.source_id,
    });
    expect(JSON.stringify(c)).not.toMatch(/"live"/);
    expect(Object.values(c.source_ids).every((id) => id.length > 0)).toBe(true);
  });

  it("the initial state already has the provenance and source ids, with every value null (a client never sees a value without them)", () => {
    const c = initialState(sc, "s-0001").conditions;
    expect(c.ltst).toBeNull();
    expect(c.sun_elevation_deg).toBeNull();
    expect(c.sol).toBeNull();
    expect(c.eva_phase).toBeNull();
    expect(c.dose_rate_background_ugy_h).toBeNull();
    expect(c.dose_rate_event_ugy_h).toBeNull();
    expect(c.event_series_utc).toBeNull();
    expect(c.provenance).toEqual(conditionsTick(stateAt(T0), ctxOf()).state.conditions.provenance);
    expect(c.source_ids).toEqual(conditionsTick(stateAt(T0), ctxOf()).state.conditions.source_ids);
  });

  it("the first tick reports a delta for every value that changed from null, at conditions/<key>", () => {
    const r = conditionsTick(stateAt(T0), ctxOf());
    expect(r.deltas.map((d) => d.path).sort()).toEqual([
      "conditions/dose_rate_background_ugy_h",
      "conditions/dose_rate_event_ugy_h",
      "conditions/eva_phase",
      "conditions/ltst",
      "conditions/sol",
      "conditions/sun_elevation_deg",
    ]);
    for (const d of r.deltas) expect(d.value).toEqual((r.state.conditions as unknown as Record<string, unknown>)[d.path.slice("conditions/".length)]);
  });

  it("a second tick at the same instant reports nothing and returns the state unchanged", () => {
    const first = conditionsTick(stateAt(T0), ctxOf()).state;
    const again = conditionsTick(first, ctxOf());
    expect(again.deltas).toEqual([]);
    expect(again.state).toBe(first);
  });

  it("a step inside the same minute reports only the sun elevation", () => {
    const first = conditionsTick(stateAt(T0), ctxOf()).state;
    const next = conditionsTick(atTime(first, iso(Date.parse(T0) + 1000)), ctxOf());
    expect(next.state.conditions.ltst).toBe(first.conditions.ltst);
    expect(next.deltas.map((d) => d.path)).toEqual(["conditions/sun_elevation_deg"]);
  });

  it("pressing START_EVENT adds event_series_utc and the event rate to the next tick's deltas", () => {
    const seriesStart = fake.scenario.event_library[0].series_start_utc;
    const before = conditionsTick(stateAt(T0), ctxOf()).state;
    const after = conditionsTick(pressed(before, T0), ctxOf());
    expect(after.state.conditions.event_series_utc).toBe(seriesStart);
    expect(after.deltas.map((d) => d.path)).toContain("conditions/event_series_utc");
  });
});

describe("where the hab is (BD-127)", () => {
  it("the chosen candidate decides, not the first or the highest-ranked one", () => {
    const two = withSite([candidate("hab-a", 1, SITE.lat, SITE.lon_e), candidate("hab-b", 2, SITE.lat + 0.5, SITE.lon_e + 0.5)]);
    const a = conditionsTick(stateAt(T0, two, "hab-a"), ctxOf(two)).state.conditions;
    const b = conditionsTick(stateAt(T0, two, "hab-b"), ctxOf(two)).state.conditions;
    expect(a.sun_elevation_deg).toBe(roundTo(solarPosition(new Date(T0), SITE.lat, SITE.lon_e).elevation_deg, SUN_ELEVATION_DECIMALS));
    expect(b.sun_elevation_deg).toBe(roundTo(solarPosition(new Date(T0), SITE.lat + 0.5, SITE.lon_e + 0.5).elevation_deg, SUN_ELEVATION_DECIMALS));
    expect(b.sol).toBe(mslSol(new Date(T0), SITE.lon_e + 0.5));
  });

  it("with no candidate the plan's start waypoint goes through the inverse working projection of the loaded grid", () => {
    const fx = havenFlat(10);
    const gridded: LoadedScenario = { ...fake, grid: fx.grid };
    const plan = gridded.scenario.plan!;
    const start = plan.waypoints.find((w) => w.role === "start")!;
    const moved = { ...start, x_m: 12_000, y_m: -6_000 };
    const state: EngineState = { ...stateAt(T0, gridded, null), plan: { ...plan, waypoints: plan.waypoints.map((w) => (w.id === start.id ? moved : w)) } };
    const where = inverseEqc(moved.x_m, moved.y_m, parseEqcProjection(fx.grid.meta.proj4));
    const c = conditionsTick(state, ctxOf(gridded)).state.conditions;
    expect(c.ltst).toBe(localTrueSolarTime(new Date(T0), where.lon_e));
    expect(c.sun_elevation_deg).toBe(roundTo(solarPosition(new Date(T0), where.lat, where.lon_e).elevation_deg, SUN_ELEVATION_DECIMALS));
    expect(c.sol).toBe(mslSol(new Date(T0), where.lon_e));
  });

  it("with no site data at all the solar fields stay null and the dose rates are still filled", () => {
    const c = conditionsTick(stateAt(T0, fake, null), ctxOf(fake)).state.conditions;
    expect([c.ltst, c.sun_elevation_deg, c.sol]).toEqual([null, null, null]);
    expect(c.dose_rate_background_ugy_h).toBe(fake.dose.background_rate);
    expect(c.dose_rate_event_ugy_h).toBe(fake.dose.background_rate);
    expect(c.provenance.ltst).toBe("derived");
  });

  it("a latitude compute rejects leaves the solar fields null instead of throwing or inventing a value", () => {
    const bad = withSite([candidate("hab-a", 1, 95, SITE.lon_e)]);
    const c = conditionsTick(stateAt(T0, bad), ctxOf(bad)).state.conditions;
    expect([c.ltst, c.sun_elevation_deg, c.sol]).toEqual([null, null, null]);
    expect(c.dose_rate_background_ugy_h).toBe(fake.dose.background_rate);
  });

  it("a solar field that was set becomes null again when the hab can no longer be placed (the delta says so)", () => {
    const first = conditionsTick(stateAt(T0), ctxOf()).state;
    const r = conditionsTick(chosen(first, null), ctxOf(fake));
    expect(r.state.conditions.ltst).toBeNull();
    expect(r.deltas.find((d) => d.path === "conditions/ltst")).toEqual({ path: "conditions/ltst", value: null });
  });
});

describe("in the engine and the session (T22.16, NFR-06)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  const varDir = (): string => {
    const d = mkdtempSync(join(tmpdir(), "marswalk-conditions-"));
    dirs.push(d);
    return d;
  };

  it("tick() runs the conditions module: its state and its deltas come out of a full step", () => {
    const state: EngineState = { ...stateAt(T0), session: { ...stateAt(T0).session, status: "RUNNING" } };
    const r = tick(state, sc, 1, 1);
    expect(r.state.conditions.sol).toBe(mslSol(new Date(T0), SITE.lon_e));
    expect(r.deltas.map((d) => d.path)).toContain("conditions/sun_elevation_deg");
  });

  it("a running session's snapshot carries conditions, and a later snapshot has a later sun elevation", () => {
    const picked: LoadedScenario = { ...sc, scenario: { ...sc.scenario, mission_setup: { ...sc.scenario.mission_setup, hab_candidate_id: "hab-a" } } };
    const s = loadSession(picked, varDir());
    let n = 0;
    const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `c-${++n}`, role, kind, args });
    expect(s.snapshot([]).conditions.sun_elevation_deg).toBeNull();
    expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
    const a = s.advance(2);
    expect(a.deltas.some((d) => d.path === "conditions/sun_elevation_deg")).toBe(true);
    const one = s.snapshot([]).conditions;
    expect(one.sol).toBe(mslSol(new Date(s.snapshot([]).sim_time), SITE.lon_e));
    expect(one.provenance.sol).toBe("derived");
    s.advance(60);
    const two = s.snapshot([]).conditions;
    expect(two.sun_elevation_deg).not.toBe(one.sun_elevation_deg);
  });

  it("the module reads no wall clock (NFR-06): no Date.now, no argument-less new Date, no performance.now", () => {
    const src = readFileSync(join(here, "../src/engine/conditions.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/new Date\(\s*\)/);
    expect(src).not.toMatch(/performance\.now/);
    expect(src).not.toMatch(/Math\.random/);
  });

  it("the module holds no module-level mutable state", () => {
    const src = readFileSync(join(here, "../src/engine/conditions.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/^(let|var)\s/m);
    expect(src).not.toMatch(/^const\s+\w+\s*=\s*new\s+(Map|Set|WeakMap|WeakSet)\b/m);
  });
});

/**
 * NFR-06 (deterministic science, reproducible runs) and the byte-reproducibility of the storm recording (T27.05, BD-105,
 * BD-148; N-81).
 *
 * The sun elevation the engine carries is a `Math.acos` of a product of sines and cosines, so a platform whose libm gives
 * the last bit differently (V8's `Math.sin`/`Math.cos`/`Math.acos` are not bit-identical across builds) produces an
 * elevation one unit in the last place away from another platform's. The value is therefore carried at a fixed precision
 * (SUN_ELEVATION_DECIMALS decimal places), which is far above the 1-ULP noise and far below the 0.1 deg the UI shows, so
 * the recorded bytes are the same on every machine.
 *
 * The rounding is applied where the value enters the state (this module), never inside compute's `solarPosition`: that
 * function also feeds `sunriseSunset`, `warnings.ts` and `compute/conditions.ts`, where a rounded elevation would move a
 * sunrise instant.
 */
describe("the sun elevation is carried at a fixed precision (NFR-06, T27.05)", () => {
  it("compute exports the documented precision and a rounding helper that keeps the sign of zero away", () => {
    expect(SUN_ELEVATION_DECIMALS).toBe(6);
    expect(roundTo(61.16477678548756, 6)).toBe(61.164777);
    expect(roundTo(-0.0000001, 6)).toBe(0); // no -0: a JSON round trip would turn it into 0
    expect(Object.is(roundTo(-0.0000001, 6), -0)).toBe(false);
    expect(roundTo(-1.23456789, 3)).toBe(-1.235);
    expect(roundTo(1.006, 2)).toBe(1.01);
    expect(roundTo(Infinity, 6)).toBe(Infinity); // a non-finite value is the caller's to reject
    expect(Number.isNaN(roundTo(NaN, 6))).toBe(true);
  });

  it("the state value is the rounded elevation, never the raw one", () => {
    const now = new Date(T0);
    const raw = solarPosition(now, SITE.lat, SITE.lon_e).elevation_deg;
    const c = conditionsTick(stateAt(T0), ctxOf()).state.conditions;
    expect(c.sun_elevation_deg).toBe(roundTo(raw, SUN_ELEVATION_DECIMALS));
    // The raw value is not the carried one whenever the raw value is not already at the precision.
    if (raw !== roundTo(raw, SUN_ELEVATION_DECIMALS)) expect(c.sun_elevation_deg).not.toBe(raw);
  });

  it("the carried value has at most SUN_ELEVATION_DECIMALS decimals, whatever the platform's libm gives", () => {
    const decimals = (n: number): number => {
      const s = String(n);
      const dot = s.indexOf(".");
      return dot < 0 ? 0 : s.length - dot - 1;
    };
    for (const offset_s of [0, 1, 37, 3600, 3600 * 5 + 61]) {
      const at = iso(Date.parse(T0) + offset_s * 1000);
      const c = conditionsTick(stateAt(at), ctxOf()).state.conditions;
      expect(decimals(c.sun_elevation_deg!), at).toBeLessThanOrEqual(SUN_ELEVATION_DECIMALS);
    }
  });

  it("a one-unit-in-the-last-place difference in the raw elevation does not change the carried value", () => {
    // The 8 pairs of the storm recording (T27.05): the committed bytes came from a machine whose libm differed by one ULP.
    const pairs: [number, number][] = [
      [61.16477678548756, 61.16477678548755],
      [61.37339777387905, 61.373397773879056],
      [61.45644098709232, 61.45644098709231],
      [61.8135568828628, 61.81355688286281],
      [67.60652305968843, 67.60652305968841],
      [67.65802064556179, 67.65802064556178],
      [68.80810354096272, 68.80810354096275],
      [69.49447635584262, 69.49447635584261],
    ];
    for (const [a, b] of pairs) {
      expect(roundTo(a, SUN_ELEVATION_DECIMALS), `${a} vs ${b}`).toBe(roundTo(b, SUN_ELEVATION_DECIMALS));
    }
  });

  it("the delta path carries the rounded value, so the recorded bytes of two platforms agree", () => {
    const r = conditionsTick(stateAt(T0), ctxOf());
    const delta = r.deltas.find((d) => d.path === "conditions/sun_elevation_deg");
    expect(delta).toBeDefined();
    expect(delta!.value).toBe(r.state.conditions.sun_elevation_deg);
    expect(delta!.value).toBe(roundTo(delta!.value as number, SUN_ELEVATION_DECIMALS));
  });
});

describe("evaPhase in ConditionsState (N-06 follow-up, BD-163)", () => {
  const mkState = (status: EngineState["session"]["status"], activities: EngineState["crew"][number]["activity"][]): EngineState => {
    const base = initialState(sc, "test-session");
    const nextCrew = base.crew.map((c, i) => ({ ...c, activity: activities[i] ?? c.activity }));
    return { ...base, session: { ...base.session, status }, crew: nextCrew };
  };

  it("derives IN_HAB, WALKING, SHELTERED, PAUSED, ENDED solely from session status and crew activity", () => {
    expect(evaPhase(mkState("LOADED", ["IN_HAB", "IN_HAB"]))).toBe("IN_HAB");
    expect(evaPhase(mkState("RUNNING", ["IN_HAB", "IN_HAB"]))).toBe("IN_HAB");
    expect(evaPhase(mkState("RUNNING", ["WALKING", "IN_HAB"]))).toBe("WALKING");
    expect(evaPhase(mkState("RUNNING", ["AT_STOP", "SHELTERED"]))).toBe("WALKING");
    expect(evaPhase(mkState("RUNNING", ["TO_HAVEN", "IN_HAB"]))).toBe("WALKING");
    expect(evaPhase(mkState("RUNNING", ["SHELTERED", "IN_HAB"]))).toBe("SHELTERED");
    expect(evaPhase(mkState("PAUSED", ["WALKING", "WALKING"]))).toBe("PAUSED");
    expect(evaPhase(mkState("ENDED", ["IN_HAB", "IN_HAB"]))).toBe("ENDED");
  });

  it("sets provenance and source_ids on conditionsFrame and emits conditions/eva_phase delta in conditionsTick", () => {
    const frame = conditionsFrame(sc);
    expect(frame.eva_phase).toBeNull();
    expect(frame.provenance.eva_phase).toBe("simulated");
    expect(frame.source_ids.eva_phase).toBe("engine:session");

    const running = mkState("RUNNING", ["WALKING", "IN_HAB"]);
    const tickRes = conditionsTick(running, ctxOf());
    expect(tickRes.state.conditions.eva_phase).toBe("WALKING");
    expect(tickRes.state.conditions.provenance.eva_phase).toBe("simulated");
    expect(tickRes.state.conditions.source_ids.eva_phase).toBe("engine:session");
    expect(tickRes.deltas).toContainEqual({ path: "conditions/eva_phase", value: "WALKING" });
  });
});
