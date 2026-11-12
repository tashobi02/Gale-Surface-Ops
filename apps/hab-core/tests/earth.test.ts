/**
 * T26.03 (backend package 18): Earth messages, forecasts and blackout in the engine (docs/specs/02 §D.12, §D.17; 01 FR-43,
 * FR-37; 05 EarthMessage, EventLibraryEntry `inputs`, ScenarioEvent; backend decisions BD-60, BD-99, BD-129).
 *
 * The Earth-link table is a declared synthetic shape (three relay passes, a constant light time, an optional conjunction
 * window), built below. Every delivery time the engine must produce is taken from `@marswalk/compute`'s own `deliveryTime`
 * (the oracle), and the rules are also checked against the relations 02 §D.12 states (a message sent mid-pass is delivered
 * at once plus light time; one sent between passes waits for the next pass). Nothing is typed in as a science number.
 *
 * Rules checked (Proposed 2026-11-12, backend package 18, BD-129):
 * - SEND_MESSAGE: `eva:*`, `ops` write to Earth (`to_earth`), `earth` writes to Mars (`to_mars`). Args are checked before
 *   state: `body` a string of 1 to 280 characters after trimming (`INVALID`), then not after the EVA has ended (`BUSY`). The
 *   handler logs EARTH_MSG_QUEUED with `message_id` `m-<seq>`, the send time (sim time now), compute's delivery time and relay.
 * - Delivery: a tick logs EARTH_MSG_DELIVERED once for each QUEUED message whose `deliver_utc` is at or before sim time.
 * - Blackout (BD-60): a message that compute cannot deliver (conjunction at the send, or a later pass that starts in
 *   conjunction) is held; its delivery is computed as if sent at the first table row at which compute can deliver it. A
 *   message that never can be delivered inside the table is refused (`BUSY`, SEND_MESSAGE) or never queued (scheduled input).
 * - Scheduled inputs: a scenario `events` entry of kind EARTH_MESSAGE fires in the tick whose step contains its `t_utc`; a
 *   library input of a started event fires in the tick whose step contains `t0 + t_offset_s` (BD-99). Both are Earth to Mars
 *   messages sent at `payload.sent_earth_utc`, else at the firing time. Other kinds have no engine effect.
 * - `earth` in the state: light time, next relay pass and blackout from the table at sim time; unchanged before its first row.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deliveryTime, inConjunction, linkAt, nextPassStart } from "@marswalk/compute";
import type { Command, EarthLinkTable, EventLibraryEntry, EventLibraryInput, LogEventData, ParamSet, Role, ScenarioEvent } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand } from "../src/commands";
import { earthTick, handleSendMessage } from "../src/engine/earth";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { tick, type TickContext } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const link = Object.values(fake.params).find((p) => p.kind === "link") as ParamSet;
const T0 = Date.parse(fake.scenario.start_utc);
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

// ---- the declared synthetic table -------------------------------------------------------------------------------------

/** Declared shape: constant 10 min light time; passes of 20 min at +30 min, +3 h, +6 h; rows each minute for 12 h. */
const LIGHT_S = 600;
const PASS_STARTS = [30 * MIN, 3 * HOUR, 6 * HOUR];
const PASS_LEN = 20 * MIN;
const ORBITERS = ["mro", "maven", "mro"] as const;
const ROWS_HOURS = 12;

function table(conjunction: [number, number] | null = null): EarthLinkTable {
  const rows: EarthLinkTable["rows"] = [];
  for (let t = 0; t <= ROWS_HOURS * HOUR; t += MIN) {
    const inConj = conjunction !== null && t >= conjunction[0] && t < conjunction[1];
    rows.push({ t_utc: iso(T0 + t), light_time_s: LIGHT_S, sep_angle_deg: inConj ? 1 : 90, earth_elev_deg: 0, orbiters: { mro: 0, maven: 0, tgo: 0 } });
  }
  const passes = PASS_STARTS.map((s, i) => ({ orbiter: ORBITERS[i], start_utc: iso(T0 + s), end_utc: iso(T0 + s + PASS_LEN), max_elev_deg: 40 }));
  return { ...fake.earthLink, step_s: 60, rows, passes };
}

const CONJ: [number, number] = [2 * HOUR, 5 * HOUR];

function scenarioOf(opts: { table?: EarthLinkTable; events?: ScenarioEvent[]; library?: EventLibraryEntry[] } = {}): LoadedScenario {
  const library = opts.library ?? fake.scenario.event_library;
  return { ...fake, earthLink: opts.table ?? table(), eventLibrary: library, scenario: { ...fake.scenario, events: opts.events ?? [], event_library: library } };
}
const sc = scenarioOf();
const scConj = scenarioOf({ table: table(CONJ) });

const oracle = (s: LoadedScenario, direction: "to_earth" | "to_mars", sent_ms: number) => deliveryTime(s.earthLink, direction, iso(sent_ms), link)!;

// ---- states and helpers -----------------------------------------------------------------------------------------------

function running(scenario: LoadedScenario = sc, at_ms = T0): EngineState {
  const s = initialState(scenario, "s-0001");
  return { ...s, session: { ...s.session, status: "RUNNING", clock: { ...s.session.clock, sim_time: iso(at_ms) } } };
}
const at = (s: EngineState, ms: number): EngineState => ({ ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time: iso(ms) } } });
const ctxOf = (s: EngineState, scenario: LoadedScenario = sc): TickContext => ({ scenario, dt_s: 1, next_seq: s.session.last_seq + 1 });

/** The module's events reduced the way tick.ts does (consecutive seqs from ctx.next_seq). */
function applied(s: EngineState, events: PendingEvent[]): EngineState {
  return events.reduce((acc, e, i) => reduce(acc, logged(e, s.session.last_seq + 1 + i)), s);
}

let n = 0;
const send = (role: Role, body: string, extra: Partial<Command> = {}): Command => ({ command_id: `k-${++n}`, role, kind: "SEND_MESSAGE", args: { body }, ...extra });

/** Send a message at `sent_ms` through handleSendMessage and reduce the QUEUED event; returns the state and the event. */
function sendAt(role: Role, sent_ms: number, scenario: LoadedScenario = sc, state: EngineState = running(scenario, sent_ms)) {
  const base = at(state, sent_ms);
  const out = handleSendMessage(base, scenario, send(role, "Request a status check"), base.session.last_seq + 1);
  expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
  return { state: applied(base, out.events), event: out.events[0], out };
}
const dataOf = (e: PendingEvent) => e.data as LogEventData["EARTH_MSG_QUEUED"];

/** One tick of earthTick at sim time `ms` (the step covers [ms - 1 s, ms)). */
const tickAt = (s: EngineState, ms: number, scenario: LoadedScenario = sc) => earthTick(at(s, ms), ctxOf(s, scenario));
const kinds = (events: PendingEvent[]) => events.map((e) => e.kind);

// ---- SEND_MESSAGE -----------------------------------------------------------------------------------------------------

describe("SEND_MESSAGE to Earth (FR-43, 02 §D.12)", () => {
  it("sent mid-pass: QUEUED at once, delivery = send time + light time, relay of that pass", () => {
    const sent = T0 + PASS_STARTS[0] + 5 * MIN;
    const { event, state } = sendAt("ops", sent);
    const o = oracle(sc, "to_earth", sent);
    expect(event).toMatchObject({ kind: "EARTH_MSG_QUEUED", actor: "ops", sim_time: iso(sent), provenance: { state: "simulated", deliver_utc: "derived" } });
    expect(dataOf(event)).toEqual({ message_id: `m-${state.session.last_seq}`, direction: "to_earth", body: "Request a status check", sent_utc: iso(sent), deliver_utc: o.deliver_utc, via: o.via });
    expect(Date.parse(o.deliver_utc)).toBe(sent + LIGHT_S * 1000); // the rule of 02 §D.12, from the declared table
    expect(o.via).toBe("mro");
    expect(state.earthQueue).toEqual([expect.objectContaining({ direction: "to_earth", state: "QUEUED", deliver_utc: o.deliver_utc, provenance: { state: "simulated", deliver_utc: "derived" } })]);
  });

  it("sent between passes: waits for the next pass, delivery = pass start + light time", () => {
    const sent = T0 + 10 * MIN;
    const { event } = sendAt("eva:EV1", sent);
    expect(Date.parse(dataOf(event).deliver_utc)).toBe(T0 + PASS_STARTS[0] + LIGHT_S * 1000);
    expect(dataOf(event).deliver_utc).toBe(oracle(sc, "to_earth", sent).deliver_utc);
    expect(event.actor).toBe("eva:EV1");
  });

  it("then a tick logs EARTH_MSG_DELIVERED once, at the delivery time and not before", () => {
    const sent = T0 + 10 * MIN;
    const { state, event } = sendAt("ops", sent);
    const deliver = Date.parse(dataOf(event).deliver_utc);
    expect(tickAt(state, deliver - 1000).events).toEqual([]);
    const r = tickAt(state, deliver);
    expect(r.events).toEqual([expect.objectContaining({ kind: "EARTH_MSG_DELIVERED", actor: "system", sim_time: iso(deliver), data: { message_id: dataOf(event).message_id } })]);
    const done = applied(state, r.events);
    expect(done.earthQueue.map((m) => m.state)).toEqual(["DELIVERED"]);
    expect(tickAt(done, deliver + 1000).events).toEqual([]); // never again
  });

  it("an earth-role message goes to Mars and is delayed the same way (arrival waits for a pass)", () => {
    const sent = T0 + 10 * MIN;
    const { event } = sendAt("earth", sent);
    const o = oracle(sc, "to_mars", sent);
    expect(dataOf(event)).toMatchObject({ direction: "to_mars", sent_utc: iso(sent), deliver_utc: o.deliver_utc, via: o.via });
    expect(Date.parse(o.deliver_utc)).toBe(T0 + PASS_STARTS[0]); // arrives at Mars before the pass, so it waits for it
    expect(event.actor).toBe("earth");
  });

  it("an earth-role message that reaches Mars mid-pass is delivered on arrival", () => {
    const sent = T0 + PASS_STARTS[0] + 2 * MIN;
    const { event } = sendAt("earth", sent);
    expect(Date.parse(dataOf(event).deliver_utc)).toBe(sent + LIGHT_S * 1000);
  });

  it("two messages get two ids (m-<seq>) and each is delivered on its own", () => {
    const first = sendAt("ops", T0 + 10 * MIN);
    const second = sendAt("ops", T0 + 11 * MIN, sc, first.state);
    expect(dataOf(first.event).message_id).not.toBe(dataOf(second.event).message_id);
    expect(second.state.earthQueue).toHaveLength(2);
    const r = tickAt(second.state, Date.parse(dataOf(second.event).deliver_utc));
    expect(r.events.map((e) => (e.data as { message_id: string }).message_id)).toEqual([dataOf(first.event).message_id, dataOf(second.event).message_id]);
  });

  it("through handleCommand: ops, eva and earth may send; the command's events carry its command_ref", () => {
    const s = running(sc, T0 + 10 * MIN);
    for (const role of ["ops", "eva:EV1", "eva:EV2", "earth"] as const) {
      const out = handleCommand(s, send(role, "hello"), { scenario: sc, client_id: "c-1", next_seq: 1, accepted: new AcceptedCommands() });
      expect(out.result.ok, role).toBe(true);
      expect(out.events.map((e) => e.kind)).toEqual(["EARTH_MSG_QUEUED"]);
      expect(out.events[0].command_ref).toMatchObject({ client_id: "c-1" });
    }
    for (const role of ["planner", "presenter", "hud:EV1"] as const) {
      const out = handleCommand(s, send(role, "hello"), { scenario: sc, client_id: "c-1", next_seq: 1, accepted: new AcceptedCommands() });
      expect(out.result).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
    }
  });

  it("args first, then state: a bad body is INVALID (also after the EVA ended); a good one after the end is BUSY", () => {
    const s = running(sc, T0 + 10 * MIN);
    const ended: EngineState = { ...s, session: { ...s.session, status: "ENDED" } };
    const bodies: unknown[] = [undefined, null, 5, {}, "", "   ", "x".repeat(281)];
    for (const body of bodies) {
      for (const state of [s, ended]) {
        const out = handleSendMessage(state, sc, { command_id: "k-x", role: "ops", kind: "SEND_MESSAGE", args: { body } }, 1);
        expect(out.result, String(body)).toMatchObject({ ok: false, code: "INVALID" });
        expect(out.events).toEqual([]);
      }
    }
    expect(handleSendMessage(s, sc, send("ops", "x".repeat(280)), 1).result.ok).toBe(true);
    expect(handleSendMessage(ended, sc, send("ops", "ok"), 1).result).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("the body is stored trimmed", () => {
    const out = handleSendMessage(running(sc, T0 + 10 * MIN), sc, send("ops", "  hello  "), 1);
    expect(dataOf(out.events[0]).body).toBe("hello");
  });
});

// ---- blackout ---------------------------------------------------------------------------------------------------------

describe("conjunction blackout holds delivery (BD-60, 02 §D.12)", () => {
  const sent = T0 + 2 * HOUR + 30 * MIN; // inside the conjunction window
  const CONJ_END = T0 + CONJ[1];

  it("compute cannot deliver a message sent in conjunction; the engine holds it until the blackout is over", () => {
    expect(deliveryTime(scConj.earthLink, "to_earth", iso(sent), link)).toBeNull();
    const { event } = sendAt("ops", sent, scConj);
    const deliver = Date.parse(dataOf(event).deliver_utc);
    expect(deliver).toBeGreaterThan(CONJ_END);
    // As if sent at the first row where compute can deliver it: the pass at +6 h, plus the light time.
    expect(dataOf(event).deliver_utc).toBe(oracle(scConj, "to_earth", CONJ_END).deliver_utc);
    expect(deliver).toBe(T0 + PASS_STARTS[2] + LIGHT_S * 1000);
    expect(dataOf(event).sent_utc).toBe(iso(sent)); // the send time is still when it was sent
  });

  it("nothing is delivered during the blackout, and it is delivered after", () => {
    const { state, event } = sendAt("ops", sent, scConj);
    const deliver = Date.parse(dataOf(event).deliver_utc);
    for (const t of [sent + MIN, T0 + 3 * HOUR + 5 * MIN, CONJ_END, deliver - 1000]) expect(tickAt(state, t, scConj).events, iso(t)).toEqual([]);
    expect(kinds(tickAt(state, deliver, scConj).events)).toEqual(["EARTH_MSG_DELIVERED"]);
  });

  it("an Earth message arriving at Mars during the blackout is held the same way", () => {
    const { event } = sendAt("earth", sent, scConj);
    const deliver = Date.parse(dataOf(event).deliver_utc);
    expect(deliver).toBeGreaterThanOrEqual(CONJ_END);
    expect(dataOf(event).deliver_utc).toBe(deliveryTime(scConj.earthLink, "to_mars", iso(CONJ_END - LIGHT_S * 1000), link)!.deliver_utc);
  });

  it("a message that no row of the table can ever deliver is refused with BUSY and says why", () => {
    const forever = scenarioOf({ table: table([HOUR, ROWS_HOURS * HOUR + HOUR]) });
    const s = running(forever, T0 + 2 * HOUR);
    const out = handleSendMessage(s, forever, send("ops", "hi"), 1);
    expect(out.result).toMatchObject({ ok: false, code: "BUSY" });
    expect((out.result as { message: string }).message).toMatch(/blackout|table|deliver/i);
    expect(out.events).toEqual([]);
  });

  it("a table with no passes (the fake scenario's) refuses SEND_MESSAGE with BUSY instead of throwing", () => {
    const s = running(fake, T0 + 10 * MIN);
    const out = handleSendMessage(s, fake, send("ops", "hi"), 1);
    expect(out.result).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("a send time before the table's first row is refused with BUSY, not an exception", () => {
    const s = running(sc, T0 - HOUR);
    expect(handleSendMessage(s, sc, send("ops", "hi"), 1).result).toMatchObject({ ok: false, code: "BUSY" });
  });
});

// ---- scheduled inputs -------------------------------------------------------------------------------------------------

const FORECAST_BODY = "SEP event in progress. Recommend shelter.";
const storm = (offset_s: number, extra: Partial<EventLibraryInput> = {}): EventLibraryEntry => ({
  ...fake.scenario.event_library[0],
  inputs: [
    { input_id: "i1", t_offset_s: offset_s, kind: "DONKI_RECORD", provenance: "replayed", source_id: "donki-2024-05", payload: { donki_type: "FLR", donki_id: "x", summary: "X-class flare", body: "not an Earth message" } },
    { input_id: "i2", t_offset_s: offset_s, kind: "EARTH_MESSAGE", provenance: "simulated", payload: { body: FORECAST_BODY, answers: "i1" }, ...extra },
  ],
});

/** The window that fires an input due at `due_ms`: the tick that ends one second after it. */
const firingTick = (due_ms: number): number => due_ms + 1000;

describe("a library event's Earth forecast (FR-37, BD-99, 02 §D.17)", () => {
  const T_PRESS = T0 + HOUR;
  const OFFSET_S = 120;
  const lib = scenarioOf({ library: [storm(OFFSET_S)] });
  const pressed = (s: EngineState): EngineState => ({ ...s, session: { ...s.session, started_events: [{ event_id: "storm", t0_sim_time: iso(T_PRESS) }] } });
  const DUE = T_PRESS + OFFSET_S * 1000;

  it("fires at t0 + t_offset_s as a message to Mars sent then, delivered by compute's rule", () => {
    const s = pressed(running(lib, DUE));
    const r = tickAt(s, firingTick(DUE), lib);
    const o = oracle(lib, "to_mars", DUE);
    expect(r.events[0]).toMatchObject({ kind: "EARTH_MSG_QUEUED", actor: "system", sim_time: iso(firingTick(DUE)), provenance: { state: "simulated", deliver_utc: "derived" } });
    expect(dataOf(r.events[0])).toEqual({ message_id: `m-${s.session.last_seq + 1}`, direction: "to_mars", body: FORECAST_BODY, sent_utc: iso(DUE), deliver_utc: o.deliver_utc, via: o.via });
  });

  it("fires exactly once over the whole run, and is delivered at the computed time", () => {
    let s = pressed(running(lib, T_PRESS));
    const seen: { kind: string; at: number }[] = [];
    for (let t = T_PRESS + 1000; t <= T_PRESS + 4 * HOUR; t += 1000) {
      const r = tickAt(s, t, lib);
      s = applied(at(s, t), r.events);
      for (const e of r.events) seen.push({ kind: e.kind, at: t });
    }
    const deliver = Date.parse(oracle(lib, "to_mars", DUE).deliver_utc);
    expect(seen.map((e) => e.kind)).toEqual(["EARTH_MSG_QUEUED", "EARTH_MSG_DELIVERED"]);
    expect(seen[0].at).toBe(firingTick(DUE));
    expect(seen[1].at).toBe(Math.ceil(deliver / 1000) * 1000);
    expect(s.earthQueue.map((m) => m.state)).toEqual(["DELIVERED"]);
  });

  it("does nothing before the press, and the DONKI record input has no Earth effect", () => {
    const unpressed = running(lib, DUE);
    expect(tickAt(unpressed, firingTick(DUE), lib).events).toEqual([]);
    const donkiOnly = scenarioOf({ library: [{ ...storm(OFFSET_S), inputs: [storm(OFFSET_S).inputs![0]] }] });
    expect(tickAt(pressed(running(donkiOnly, DUE)), firingTick(DUE), donkiOnly).events).toEqual([]);
  });

  it("a payload's sent_earth_utc, when given, is the send time", () => {
    const earlier = T0 + 10 * MIN;
    const withSent = scenarioOf({ library: [storm(OFFSET_S, { payload: { body: FORECAST_BODY, sent_earth_utc: iso(earlier) } })] });
    const r = tickAt(pressed(running(withSent, DUE)), firingTick(DUE), withSent);
    expect(dataOf(r.events[0]).sent_utc).toBe(iso(earlier));
    expect(dataOf(r.events[0]).deliver_utc).toBe(oracle(withSent, "to_mars", earlier).deliver_utc);
  });

  it("an input due in the same step as delivery logs QUEUED then DELIVERED, in that order, with consecutive ids", () => {
    // Sent long ago on Earth (before the first pass), so compute's delivery time is already past when it fires.
    const past = T0 + MIN;
    const old = scenarioOf({ library: [storm(OFFSET_S, { payload: { body: FORECAST_BODY, sent_earth_utc: iso(past) } })] });
    const s = pressed(running(old, DUE));
    const r = tickAt(s, firingTick(DUE), old);
    expect(kinds(r.events)).toEqual(["EARTH_MSG_QUEUED", "EARTH_MSG_DELIVERED"]);
    expect((r.events[1].data as { message_id: string }).message_id).toBe(dataOf(r.events[0]).message_id);
    expect(applied(s, r.events).earthQueue.map((m) => m.state)).toEqual(["DELIVERED"]);
  });
});

describe("scenario events that are not tied to a library event (05 ScenarioEvent)", () => {
  const e1 = (t: number, payload: Record<string, unknown>, kind: ScenarioEvent["kind"] = "EARTH_MESSAGE"): ScenarioEvent => ({ event_id: "e1", t_utc: iso(t), kind, payload, provenance: "simulated" });

  it("an EARTH_MESSAGE fires at its t_utc and is delivered by compute's rule, sent at sent_earth_utc", () => {
    const due = T0 + 40 * MIN;
    const scen = scenarioOf({ events: [e1(due, { body: "Forecast", sent_earth_utc: iso(due) })] });
    const s = running(scen, due);
    expect(tickAt(s, due, scen).events).toEqual([]); // the step before: [due - 1 s, due)
    const r = tickAt(s, firingTick(due), scen);
    expect(dataOf(r.events[0])).toMatchObject({ direction: "to_mars", body: "Forecast", sent_utc: iso(due), deliver_utc: oracle(scen, "to_mars", due).deliver_utc });
    expect(tickAt(at(s, firingTick(due) + 1000), firingTick(due) + 2000, scen).events).toEqual([]); // not again
  });

  it("without sent_earth_utc the message was sent when the event exists (t_utc)", () => {
    const due = T0 + 40 * MIN;
    const scen = scenarioOf({ events: [e1(due, { body: "Forecast" })] });
    expect(dataOf(tickAt(running(scen, due), firingTick(due), scen).events[0]).sent_utc).toBe(iso(due));
  });

  it("a sent_earth_utc that is not a time, or a body that is not text, falls back to t_utc or sends nothing", () => {
    const due = T0 + 40 * MIN;
    const badTime = scenarioOf({ events: [e1(due, { body: "Forecast", sent_earth_utc: "soon" })] });
    expect(dataOf(tickAt(running(badTime, due), firingTick(due), badTime).events[0]).sent_utc).toBe(iso(due));
    for (const body of [undefined, 7, "   "]) {
      const noBody = scenarioOf({ events: [e1(due, { body, sent_earth_utc: iso(due) })] });
      expect(tickAt(running(noBody, due), firingTick(due), noBody).events, String(body)).toEqual([]);
    }
  });

  it("DONKI_RECORD, ADVISORY and INJECT entries have no Earth effect and do not throw", () => {
    const due = T0 + 40 * MIN;
    for (const kind of ["DONKI_RECORD", "ADVISORY", "INJECT"] as const) {
      const scen = scenarioOf({ events: [e1(due, { summary: "x", body: "not an Earth message" }, kind)] });
      expect(tickAt(running(scen, due), firingTick(due), scen).events, kind).toEqual([]);
    }
  });

  it("the fake scenario (an Earth table with no passes) keeps ticking: its e1 message cannot be delivered and is not queued", () => {
    const e = fake.scenario.events![0];
    const due = Date.parse(e.t_utc);
    expect(() => tickAt(running(fake, due), firingTick(due), fake)).not.toThrow();
    expect(tickAt(running(fake, due), firingTick(due), fake).events).toEqual([]);
  });
});

// ---- the earth block of the state -------------------------------------------------------------------------------------

describe("Snapshot.earth from compute (FR-43)", () => {
  it("light time, next pass and blackout are the table's at sim time", () => {
    for (const [scenario, t] of [
      [sc, T0 + 35 * MIN],
      [scConj, T0 + 3 * HOUR + 5 * MIN],
      [scConj, T0 + 7 * HOUR],
    ] as const) {
      const r = tickAt(running(scenario, t), t, scenario);
      const row = linkAt(scenario.earthLink, iso(t))!;
      expect(r.state.earth).toEqual({
        light_time_s: row.light_time_s,
        next_pass_utc: nextPassStart(scenario.earthLink, iso(t))?.start_utc ?? null,
        blackout: inConjunction(scenario.earthLink, iso(t), link),
      });
    }
    expect(tickAt(running(sc, T0 + 35 * MIN), T0 + 35 * MIN).state.earth.next_pass_utc).toBe(iso(T0 + PASS_STARTS[1])); // the pass in progress is not "next"
    expect(tickAt(running(scConj, T0 + 3 * HOUR), T0 + 3 * HOUR, scConj).state.earth.blackout).toBe(true);
  });

  it("reports a STATE_DELTA per changed field and none when nothing changed", () => {
    const t = T0 + 3 * HOUR + 5 * MIN;
    const first = tickAt(running(scConj, t), t, scConj);
    expect(first.deltas.map((d) => d.path).sort()).toEqual(["earth/blackout", "earth/next_pass_utc"].sort());
    const again = tickAt(first.state, t + 1000, scConj);
    expect(again.deltas).toEqual([]);
  });

  it("is left alone before the table's first row", () => {
    const s = running(sc, T0 - HOUR);
    const r = tickAt(s, T0 - HOUR, sc);
    expect(r.state.earth).toEqual(s.earth);
    expect(r.deltas).toEqual([]);
  });
});

// ---- the whole step, determinism, hygiene -----------------------------------------------------------------------------

describe("through tick() and across a restart", () => {
  it("a queued message is delivered by the full tick, with seqs the log would give", () => {
    const sent = T0 + 10 * MIN;
    const { state, event } = sendAt("ops", sent);
    const deliver = Date.parse(dataOf(event).deliver_utc);
    const before = at(state, deliver - 1000);
    const r = tick(at(before, deliver), sc, 1, before.session.last_seq + 1);
    const delivered = r.events.filter((e) => e.kind === "EARTH_MSG_DELIVERED");
    expect(delivered).toHaveLength(1);
    expect(r.state.earthQueue.map((m) => m.state)).toEqual(["DELIVERED"]);
    expect(r.state.session.last_seq).toBe(before.session.last_seq + r.events.length);
  });

  it("a JSON round trip of the state mid-flight gives the same delivery", () => {
    const { state, event } = sendAt("ops", T0 + 10 * MIN);
    const deliver = Date.parse(dataOf(event).deliver_utc);
    const restored = JSON.parse(JSON.stringify(state)) as EngineState;
    expect(restored).toStrictEqual(state);
    expect(JSON.stringify(tickAt(restored, deliver))).toBe(JSON.stringify(tickAt(state, deliver)));
  });

  it("is deterministic and leaves its input state alone", () => {
    const { state } = sendAt("ops", T0 + 10 * MIN);
    const before = JSON.stringify(state);
    const a = tickAt(state, T0 + 31 * MIN);
    const b = tickAt(state, T0 + 31 * MIN);
    expect(JSON.stringify(state)).toBe(before);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("earth.ts reads no wall clock and keeps no mutable module state (NFR-06)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(join(here, "../src/engine/earth.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now|new Date\(\)|performance\.now|Math\.random/);
    expect(source).not.toMatch(/^(let|var) /m);
  });
});
