/**
 * T32.11: `START_EVENT` and the time-shifted storm (docs/specs/02 §D.17, §D.13; 01 FR-52, FR-38; 05 EventLibraryEntry;
 * backend decisions BD-97, BD-99, BD-114). Runs on the fake scenario's synthetic series (F8): background 1 µGy/h, then a
 * stepped storm, `series_start_utc` at the last sample at or below the background before the alert.
 *
 * Rules fixed here (decided by the orchestrator, 12 Nov 2026, BD-97, BD-114):
 * - Before the press the dose rate is `DoseSeries.background_rate` and no radiation alert fires; at sim time `t ≥ t0` the
 *   rate is the series at `series_start_utc + (t − t0)`; the alert comes from the series at the mapped time.
 * - `START_EVENT {event_id}`: `INVALID` for a missing or unknown id; `BUSY` when that event already started, when another
 *   SPACE_WEATHER event is in progress (the scenario has one dose series), or when the EVA has ended; only `presenter` and `ops` (N-200).
 * - `inputTime(state, entry, input)` is `t0 + t_offset_s` (null before the press); `dueInputs` lists the inputs due in a
 *   half-open sim-time window `[from, to)`. Firing them belongs to T26.04 (package 18).
 * - `RESET_SESSION` making the event available again is checked in T32.13.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { integrateDose } from "@marswalk/compute";
import { PERMISSIONS, type Command, type EventLibraryEntry, type LogEvent, type Role, type Snapshot } from "@marswalk/protocol";
import { dueInputs, inputTime, seriesUtc } from "../src/engine/liveEvents";
import { initialState, reduce } from "../src/engine/reducer";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const entry = fake.scenario.event_library[0];
const alertParams = Object.values(fake.params).find((p) => p.kind === "alert")!.values as Record<string, number>;
const shielding = Object.values(fake.params).find((p) => p.kind === "shielding")!;
const suit = (shielding.values as Record<string, number>).suit;
const BG = fake.dose.background_rate;
const START = Date.parse(fake.scenario.start_utc);
const SERIES_START = Date.parse(entry.series_start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

// The alert instant of the series: the second of two consecutive samples above the trigger (02 §D.13).
const high = fake.dose.samples.map(([t, r]) => [Date.parse(t), r as number] as const).filter(([, r]) => r > alertParams.rad_k_background * BG);
const ALERT_AT = high[1][0];
const ALERT_AFTER_PRESS_S = (ALERT_AT - SERIES_START) / 1000;

const dirs: string[] = [];
const varDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-live-events-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `k-${++n}`, role, kind, args });
const snap = (s: SessionHandle): Snapshot => s.snapshot([]);
const started = (scenario: LoadedScenario = fake): SessionHandle => {
  const s = loadSession(scenario, varDir());
  expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
  return s;
};
/** Run to sim second `at` after the EVA start, then press the event as the presenter. */
function pressAt(s: SessionHandle, at: number, event_id = "storm") {
  const now = (Date.parse(snap(s).sim_time) - START) / 1000;
  s.advance(at - now);
  return s.apply(cmd("presenter", "START_EVENT", { event_id }), "c-presenter");
}
const alertsOf = (events: LogEvent[]): LogEvent[] => events.filter((e) => e.kind === "ALERT_RAISED" && (e.data as { code: string }).code === "RADIATION_ALERT");
const rejectedCode = (r: { result: { ok: boolean } }): string => {
  expect(r.result.ok).toBe(false);
  return (r.result as unknown as { code: string }).code;
};
const withLibrary = (library: EventLibraryEntry[]): LoadedScenario => ({ ...fake, scenario: { ...fake.scenario, event_library: library } });

describe("START_EVENT: before the press there is background dose only (02 §D.17)", () => {
  it("accrues the background rate and raises no radiation alert, even past the time the table-time storm would have", () => {
    const s = started();
    const seconds = Math.ceil((ALERT_AT - START) / 1000) + 600; // well past the series' own alert instant
    const events = s.advance(seconds).events;
    expect(alertsOf(events)).toEqual([]);
    expect(snap(s).alerts).toEqual([]);
    for (const c of snap(s).crew) {
      expect(c.dose_event_unsheltered_ugy).toBeCloseTo((BG * suit * seconds) / 3600, 9);
      expect(c.activity === "IN_HAB" || c.activity === "SHELTERED").toBe(false);
    }
  });

  it("Snapshot.event_library lists the entry and Session.started_events is empty until the press", () => {
    const s = started();
    expect(snap(s).event_library).toEqual([{ event_id: "storm", title: entry.title, kind: entry.kind, label: entry.label, source_id: entry.source_id, provenance: "replayed" }]);
    expect(snap(s).session.started_events).toEqual([]);
  });

  it("seriesUtc is null before the press and the shifted time after it", () => {
    const state = initialState(fake, "s-0001");
    expect(seriesUtc(state, entry, iso(START + 5000_000))).toBeNull();
    const pressed = reduce(state, { seq: 2, sim_time: iso(START + 100_000), kind: "EVENT_STARTED", actor: "presenter", data: { event_id: "storm", t0_sim_time: iso(START + 100_000), series_start_utc: entry.series_start_utc, source_id: entry.source_id }, provenance: {}, command_ref: null });
    expect(seriesUtc(pressed, entry, iso(START + 99_000))).toBeNull();
    expect(seriesUtc(pressed, entry, iso(START + 100_000))).toBe(entry.series_start_utc);
    expect(seriesUtc(pressed, entry, iso(START + 160_000))).toBe(iso(SERIES_START + 60_000));
  });
});

describe("START_EVENT: the storm from the press (02 §D.17; 01 FR-52, FR-38)", () => {
  it("logs EVENT_STARTED {event_id, t0_sim_time, series_start_utc, source_id} and Session.started_events gains the event", () => {
    const s = started();
    const r = pressAt(s, 120);
    expect(r.result.ok).toBe(true);
    expect(r.events.map((e) => [e.kind, e.actor, e.sim_time, e.data])).toEqual([
      ["EVENT_STARTED", "presenter", iso(START + 120_000), { event_id: "storm", t0_sim_time: iso(START + 120_000), series_start_utc: entry.series_start_utc, source_id: entry.source_id }],
    ]);
    expect(snap(s).session.started_events).toEqual([{ event_id: "storm", t0_sim_time: iso(START + 120_000) }]);
  });

  it("the alert fires at the first alert instant of the series, measured from the press, with the series rate", () => {
    const s = started();
    const press = 120;
    pressAt(s, press);
    const events = s.advance(ALERT_AFTER_PRESS_S + 60).events;
    const [raised, ...more] = alertsOf(events);
    expect(more).toEqual([]);
    expect(raised.sim_time).toBe(iso(START + (press + ALERT_AFTER_PRESS_S) * 1000));
    expect(raised.data).toMatchObject({ level: "warning", message: "Shelter now — radiation surge", rate_ugy_h: high[1][1], source: `replayed:${fake.dose.source_id}` });
    expect(raised.provenance).toMatchObject({ "data.rate_ugy_h": "replayed" });
  });

  it("no alert fires before that instant, however early the press", () => {
    const s = started();
    pressAt(s, 0);
    const events = s.advance(ALERT_AFTER_PRESS_S - 1).events;
    expect(alertsOf(events)).toEqual([]);
  });

  it("pressing at two sim times gives the same curve shape, shifted, and the same integral", () => {
    const window_s = 5000; // the crew are still out in the suit at press + window, for both presses
    const P1 = 0;
    const P2 = 600;
    const run = (press: number) => {
      const s = started();
      pressAt(s, press);
      const events = s.advance(window_s).events;
      return { crew: snap(s).crew.find((c) => c.crew_id === "EV1")!, alert: alertsOf(events)[0] };
    };
    const a = run(P1);
    const b = run(P2);
    // Same shape: the alert comes the same time after each press.
    expect(Date.parse(b.alert.sim_time) - Date.parse(a.alert.sim_time)).toBe((P2 - P1) * 1000);
    // Same integral: the storm part of each dose is compute's integral over the shifted window; the rest is background.
    const steps = Array.from({ length: window_s }, (_, k) => ({ t_utc: iso(SERIES_START + k * 1000), dt_s: 1, shelter: "suit" as const }));
    const storm = integrateDose(fake.dose, steps, shielding).unsheltered_ugy;
    for (const [press, crew] of [[P1, a.crew], [P2, b.crew]] as const) {
      expect(crew.dose_event_unsheltered_ugy).toBeCloseTo((BG * suit * press) / 3600 + storm, 9);
    }
    expect(storm).toBeGreaterThan((BG * suit * window_s) / 3600);
  });

  it("the alert clears when the shifted series falls back (the rule of 02 §D.13 on the mapped time)", () => {
    const s = started();
    pressAt(s, 0);
    // Clear rule: rate below rad_clear_k × background for rad_clear_min minutes after the storm's last high sample.
    const lastHigh = high[high.length - 1][0];
    const clear_s = (lastHigh + 600_000 + alertParams.rad_clear_min * 60_000 - SERIES_START) / 1000;
    const events = s.advance(clear_s + 60).events;
    expect(events.filter((e) => e.kind === "ALERT_CLEARED")).toHaveLength(1);
  });
});

describe("START_EVENT: rejections (02 §D.17; role, args, state order)", () => {
  it("is INVALID for an unknown event_id and for a missing one, and logs COMMAND_REJECTED", () => {
    const s = started();
    const unknown = s.apply(cmd("presenter", "START_EVENT", { event_id: "nope" }), "c-presenter");
    expect(rejectedCode(unknown)).toBe("INVALID");
    expect(unknown.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
    expect(rejectedCode(s.apply(cmd("presenter", "START_EVENT", {}), "c-presenter"))).toBe("INVALID");
    expect(rejectedCode(s.apply(cmd("presenter", "START_EVENT", { event_id: 3 }), "c-presenter"))).toBe("INVALID");
    expect(snap(s).session.started_events).toEqual([]);
  });

  it("a second press of the same event is BUSY and does not move t0", () => {
    const s = started();
    pressAt(s, 10);
    s.advance(10);
    expect(rejectedCode(s.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-presenter"))).toBe("BUSY");
    expect(snap(s).session.started_events).toEqual([{ event_id: "storm", t0_sim_time: iso(START + 10_000) }]);
  });

  it("another space-weather event is BUSY while one is in progress (one dose series, BD-114)", () => {
    const s = started(withLibrary([entry, { ...entry, event_id: "storm-2", title: "Second" }]));
    pressAt(s, 10);
    expect(rejectedCode(s.apply(cmd("presenter", "START_EVENT", { event_id: "storm-2" }), "c-presenter"))).toBe("BUSY");
  });

  it("is BUSY after the EVA has ended, and allowed before it starts and while paused", () => {
    const loaded = loadSession(fake, varDir());
    expect(loaded.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-presenter").result.ok).toBe(true);
    const paused = started();
    paused.apply(cmd("ops", "SET_CLOCK", { paused: true }), "c-ops");
    expect(paused.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-presenter").result.ok).toBe(true);
    const ended = started();
    ended.advance(9000); // the loop ends and EVA_ENDED is logged
    expect(snap(ended).session.status).toBe("ENDED");
    expect(rejectedCode(ended.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-presenter"))).toBe("BUSY");
  });

  it("is FORBIDDEN_ROLE, and logged, for every role but presenter and ops", () => {
    for (const role of Object.keys(PERMISSIONS) as Role[]) {
      const s = started();
      const r = s.apply(cmd(role, "START_EVENT", { event_id: "storm" }), `c-${role}`);
      if (role === "presenter" || role === "ops") {
        expect(r.result.ok).toBe(true);
        continue;
      }
      expect(rejectedCode(r), role).toBe("FORBIDDEN_ROLE");
      expect(r.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
      expect(snap(s).session.started_events).toEqual([]);
    }
  });
});

describe("START_EVENT: scheduled inputs and the other time sources (02 §D.17; BD-99)", () => {
  const withInputs = withLibrary([
    {
      ...entry,
      inputs: [
        { input_id: "in-a", t_offset_s: 600, kind: "EARTH_MESSAGE", payload: { body: "x" }, provenance: "simulated" },
        { input_id: "in-b", t_offset_s: 0, kind: "EARTH_MESSAGE", payload: { body: "y" }, provenance: "simulated" },
      ],
    },
  ]);
  const pressed = (at: number) =>
    reduce(initialState(withInputs, "s-0001"), { seq: 2, sim_time: iso(START + at * 1000), kind: "EVENT_STARTED", actor: "presenter", data: { event_id: "storm", t0_sim_time: iso(START + at * 1000), series_start_utc: entry.series_start_utc, source_id: entry.source_id }, provenance: {}, command_ref: null });

  it("inputTime is t0 + t_offset_s in sim time, and null before the press", () => {
    const lib = withInputs.scenario.event_library[0];
    expect(inputTime(initialState(withInputs, "s-0001"), lib, lib.inputs![0])).toBeNull();
    expect(inputTime(pressed(300), lib, lib.inputs![0])).toBe(iso(START + 900_000));
    expect(inputTime(pressed(300), lib, lib.inputs![1])).toBe(iso(START + 300_000));
  });

  it("dueInputs lists the inputs due in [from, to) in time order, none before the press", () => {
    const state = pressed(300);
    const ids = (from: number, to: number) => dueInputs(state, withInputs, iso(START + from * 1000), iso(START + to * 1000)).map((d) => [d.event_id, d.input.input_id, d.sim_time]);
    expect(ids(0, 300)).toEqual([]);
    expect(ids(300, 301)).toEqual([["storm", "in-b", iso(START + 300_000)]]);
    expect(ids(301, 900)).toEqual([]);
    expect(ids(900, 901)).toEqual([["storm", "in-a", iso(START + 900_000)]]);
    expect(ids(0, 5000)).toEqual([["storm", "in-b", iso(START + 300_000)], ["storm", "in-a", iso(START + 900_000)]]);
    expect(dueInputs(initialState(withInputs, "s-0001"), withInputs, iso(START), iso(START + 5000_000))).toEqual([]);
  });

  it("only the dose series is shifted: the other tick modules and the clock read sim time", () => {
    const s = started();
    pressAt(s, 300);
    s.advance(60);
    expect(snap(s).sim_time).toBe(iso(START + 360_000)); // the clock is sim time; the mapped series time never reaches it
    expect(snap(s).earth.light_time_s).toBe(fake.earthLink.rows[0].light_time_s);
  });
});

describe("START_EVENT: determinism and resume (NFR-06, NFR-10)", () => {
  const script = (dir: string, press: number): SessionHandle => {
    n = 0;
    const s = loadSession(fake, dir);
    s.apply(cmd("ops", "START_EVA"), "c-ops");
    pressAt(s, press);
    s.advance(ALERT_AFTER_PRESS_S); // the last tick logs the alert: a resumed session restarts at the sim time of its last event
    return s;
  };

  it("the same press time gives the same log_hash twice, and another press time another", () => {
    const a = snap(script(varDir(), 200)).session.log_hash;
    const b = snap(script(varDir(), 200)).session.log_hash;
    const c = snap(script(varDir(), 260)).session.log_hash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("a session resumed after the press, the alert and more ticks has the same state", () => {
    const dir = varDir();
    const live = snap(script(dir, 200));
    const resumed = snap(resumeSession(join(dir, "sessions", "s-0001"), fake));
    expect(resumed.session.started_events).toEqual(live.session.started_events);
    expect(resumed.alerts).toEqual(live.alerts);
    expect(resumed.crew).toEqual(live.crew);
    expect(resumed.session.log_hash).toBe(live.session.log_hash);
  });
});
