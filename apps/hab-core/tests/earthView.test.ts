/**
 * What the Earth console sees (N-130, BD-157; 01 FR-43, FR-48; 02 §D.12): the crew and alert state one light time old. Earth
 * receives what left Mars `light_time_s` ago, so at sim time t the view is the state at t - light_time_s: each crew member's last
 * 30 s trace point at or before then, and the alerts raised by then that were not cleared by then. Pure over the log and the
 * trace; sim time only (NFR-06). A store-and-forward wait for a relay pass is not added here: `link_state` is given beside it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { LogEvent } from "@marswalk/protocol";
import { earthView } from "../src/earthView";
import { startServer } from "../src/server";
import { loadSession } from "../src/session";
import { readScenario } from "../src/scenario";

const T = (s: number): string => new Date(Date.parse("2024-05-20T12:00:00Z") + s * 1000).toISOString().replace(".000Z", "Z");
const trace = [
  { crew_id: "EV1" as const, points: [0, 30, 60, 90, 120].map((s, i) => ({ sim_time: T(s), x_m: 100 * i, y_m: 10 * i })) },
  { crew_id: "EV2" as const, points: [30, 60].map((s, i) => ({ sim_time: T(s), x_m: -50 * (i + 1), y_m: 5 })) },
];
const ev = (seq: number, s: number, kind: LogEvent["kind"], data: Record<string, unknown>): LogEvent => ({ seq, sim_time: T(s), kind, actor: "system", data, provenance: {}, command_ref: null });
const raised = (seq: number, s: number, id: string, level = "warning"): LogEvent =>
  ev(seq, s, "ALERT_RAISED", { alert_id: id, code: "RADIATION_ALERT", level, subjects: ["EV1", "EV2"], message: "Shelter now — radiation surge" });
const cleared = (seq: number, s: number, id: string): LogEvent => ev(seq, s, "ALERT_CLEARED", { alert_id: id });

describe("earthView (N-130)", () => {
  it("is the state one light time old: as_of is now minus light_time_s, and each crew member's latest trace point at or before it", () => {
    const v = earthView({ now_utc: T(100), light_time_s: 40, trace, events: [] });
    expect(v.as_of_utc).toBe(T(60));
    expect(v.crew).toEqual([
      { crew_id: "EV1", x_m: 200, y_m: 20, sample_utc: T(60) },
      { crew_id: "EV2", x_m: -100, y_m: 5, sample_utc: T(60) },
    ]);
  });

  it("a trace point at exactly as_of counts; one after it does not", () => {
    expect(earthView({ now_utc: T(100), light_time_s: 40, trace, events: [] }).crew[0]).toMatchObject({ sample_utc: T(60) });
    expect(earthView({ now_utc: T(100), light_time_s: 41, trace, events: [] }).crew[0]).toMatchObject({ sample_utc: T(30) });
  });

  it("a crew member with no point yet is left out, never placed", () => {
    const v = earthView({ now_utc: T(50), light_time_s: 40, trace, events: [] }); // as_of = T(10): EV1 has T(0), EV2 has none
    expect(v.crew.map((c) => c.crew_id)).toEqual(["EV1"]);
  });

  it("an alert raised after as_of is not yet seen on Earth; one raised before it is", () => {
    const events = [raised(2, 70, "a-1"), raised(3, 95, "a-2")];
    const v = earthView({ now_utc: T(100), light_time_s: 20, trace, events }); // as_of = T(80)
    expect(v.alerts.map((a) => a.alert_id)).toEqual(["a-1"]);
    expect(v.alerts[0]).toEqual({ alert_id: "a-1", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Shelter now — radiation surge", raised_utc: T(70) });
  });

  it("an alert cleared by as_of is gone; one cleared only after as_of is still shown (Earth has not heard)", () => {
    const events = [raised(2, 10, "a-1"), cleared(3, 50, "a-1"), raised(4, 20, "a-2"), cleared(5, 90, "a-2")];
    const v = earthView({ now_utc: T(100), light_time_s: 20, trace, events }); // as_of = T(80)
    expect(v.alerts.map((a) => a.alert_id)).toEqual(["a-2"]);
  });

  it("with no light time known the view is empty and says so: as_of null, no crew, no alerts", () => {
    expect(earthView({ now_utc: T(100), light_time_s: null, trace, events: [raised(2, 10, "a-1")] })).toMatchObject({ as_of_utc: null, crew: [], alerts: [] });
  });

  it("labels what it is: simulated state, a derived delay, and the light-time-only model", () => {
    const v = earthView({ now_utc: T(100), light_time_s: 40, trace, events: [] });
    expect(v.provenance).toEqual({ crew: "simulated", alerts: "simulated", as_of_utc: "derived" });
    expect(v.source_ids).toEqual({ crew: "engine:trace", alerts: "engine:log", as_of_utc: "earth_link" });
    expect(v.light_time_s).toBe(40);
    expect(v.delay_model).toBe("light_time");
  });

  it("the same inputs give the same view (no clock read), and the inputs are not changed", () => {
    const events = [raised(2, 10, "a-1")];
    const copy = JSON.stringify({ trace, events });
    const a = earthView({ now_utc: T(100), light_time_s: 40, trace, events });
    expect(earthView({ now_utc: T(100), light_time_s: 40, trace, events })).toEqual(a);
    expect(JSON.stringify({ trace, events })).toBe(copy);
  });
});

describe("GET /api/earth-view (N-130)", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()!();
  });
  const fake = readScenario(join(dirname(fileURLToPath(import.meta.url)), "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });

  it("is 404 with no session", async () => {
    const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1" });
    cleanup.push(() => server.close());
    expect((await fetch(`${server.url}/api/earth-view`)).status).toBe(404);
  });

  it("serves the view of the running session, with the Earth block's link state beside it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "marswalk-earthview-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const session = loadSession(fake, dir);
    const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1", session });
    cleanup.push(() => server.close());
    expect(session.apply({ command_id: "e-1", role: "ops", kind: "START_EVA", args: {} }).result.ok).toBe(true);
    session.advance(60);
    const res = await fetch(`${server.url}/api/earth-view`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReturnType<typeof earthView> & { link_state: string | null };
    const snap = session.snapshot([]);
    expect(body.light_time_s).toBe(snap.earth.light_time_s);
    expect(Date.parse(body.as_of_utc!)).toBe(Date.parse(snap.sim_time) - snap.earth.light_time_s * 1000);
    expect(body.link_state).toBe(snap.earth.link_state ?? null);
    expect(Array.isArray(body.crew)).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
  });
});
