/** WP-B3 N-200: OPS uses the recorded RAD/DONKI library, never a second storm model. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { integrateDose, rateAt } from "@marswalk/compute";
import { AcceptedCommands, handleCommand } from "../src/commands";
import { doseAt } from "../src/engine/liveEvents";
import { earthTick } from "../src/engine/earth";
import { initialState, logged, reduce } from "../src/engine/reducer";
import { tick } from "../src/engine/tick";
import { readScenario } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const scenario = readScenario(join(here, "../../../scenarios/storm-sol4190"), {
  site_id: "gale_boxwork", data_version: "gale_boxwork-2026.11.09", dir: null,
});
const entry = scenario.eventLibrary.find(e => e.kind === "SPACE_WEATHER")!;
const iso = (ms: number) => new Date(ms).toISOString();

describe("OPS library storm (N-200; FR-52; 05 §E.7)", () => {
  it("starts as ops, shifts recorded dose from background, and fires Earth inputs once at their offsets", () => {
    let state = initialState(scenario, "s-0001");
    const eva = handleCommand(state, { command_id: "start-eva", role: "ops", kind: "START_EVA", args: {} }, { scenario, client_id: "c-ops", next_seq: 1, accepted: new AcceptedCommands() });
    expect(eva.result.ok).toBe(true);
    state = eva.events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
    const t0 = Date.parse(state.session.clock.sim_time);
    const before = doseAt(state, scenario, iso(t0));
    expect(rateAt(before.series, before.t_utc)).toBe(scenario.dose.background_rate);
    const command = { command_id: "ops-storm", role: "ops", kind: "START_EVENT", args: { event_id: entry.event_id } } as const;
    const started = handleCommand(state, command, { scenario, client_id: "c-ops", next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() });
    expect(started.result.ok).toBe(true);
    expect(started.events).toHaveLength(1);
    expect(started.events[0]).toMatchObject({ kind: "EVENT_STARTED", actor: "ops", data: { event_id: entry.event_id, t0_sim_time: state.session.clock.sim_time } });
    state = started.events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);

    const recorded = scenario.dose.samples.find(([time, rate]) => Date.parse(time) >= Date.parse(entry.series_start_utc) && rate !== null && rate > scenario.dose.background_rate)!;
    const offset = Date.parse(recorded[0]) - Date.parse(entry.series_start_utc);
    const sim = iso(t0 + offset);
    const source = doseAt(state, scenario, sim);
    expect(Date.parse(source.t_utc)).toBe(Date.parse(recorded[0]));
    expect(rateAt(source.series, source.t_utc)).toBe(recorded[1]);
    expect(rateAt(source.series, source.t_utc)).toBeGreaterThan(scenario.dose.background_rate);
    const stepped = { ...state, session: { ...state.session, status: "RUNNING" as const, clock: { ...state.session.clock, sim_time: iso(Date.parse(sim) + 1000) } } };
    const result = tick(stepped, scenario, 1, state.session.last_seq + 1);
    const shielding = Object.values(scenario.params).find(p => p.kind === "shielding")!;
    const expected = integrateDose(scenario.dose, [{ t_utc: recorded[0], dt_s: 1, shelter: "suit" }], shielding);
    expect(result.state.crew[0].dose_event_unsheltered_ugy - state.crew[0].dose_event_unsheltered_ugy).toBeCloseTo(expected.unsheltered_ugy, 10);

    for (const input of entry.inputs!.filter(i => i.kind === "EARTH_MESSAGE")) {
      const due = t0 + input.t_offset_s * 1000;
      const runAt = (ms: number) => earthTick({ ...state, session: { ...state.session, clock: { ...state.session.clock, sim_time: iso(ms) } } }, { scenario, dt_s: 1, next_seq: state.session.last_seq + 1 });
      expect(runAt(due).events.filter(e => e.kind === "EARTH_MSG_QUEUED")).toEqual([]);
      const fired = runAt(due + 1000).events.filter(e => e.kind === "EARTH_MSG_QUEUED");
      expect(fired).toHaveLength(1);
      expect(Date.parse((fired[0].data as { sent_utc: string }).sent_utc)).toBe(due);
      expect(fired[0].data).toMatchObject({ body: input.payload.body, direction: "to_mars" });
      expect(runAt(due + 2000).events.filter(e => e.kind === "EARTH_MSG_QUEUED")).toEqual([]);
    }
  });
});
