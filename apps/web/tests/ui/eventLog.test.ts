/**
 * T27.04 follow-up: EventLog DOM tests (docs/specs/01 FR-46, FR-15; 04 §A.3, §D.1, §E.4; 05 LogEvent).
 * The real EventLog is mounted with explicit LogEvent fixtures. A missing field reads "—" (nothing is filled in from
 * defaults), the provenance chip comes from the event's own provenance map, and copying reports failure.
 *
 * Includes the SCR-11 strip and keyboard drawer contract (FD-092).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import type { LogEvent, LogEventKind, ProvenanceMap } from "@marswalk/protocol";
import { OpsConsole } from "../../src/ui/screens/scr11OpsConsole";
import { storeFromBeat } from "./fixtureStore";
import { EventLog, provenanceGlyph, summarizeEvent } from "../../src/ui/ops/EventLog";
import { click, keyDown, flush, installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  Reflect.deleteProperty(navigator, "clipboard");
});

const ev = (seq: number, kind: LogEventKind, data: Record<string, unknown> = {}, provenance: ProvenanceMap = {}): LogEvent => ({
  seq,
  sim_time: "2024-05-20T13:05:00Z",
  kind,
  actor: "system",
  data,
  provenance,
  command_ref: null,
});

const rows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>(".event-row")];

// Real event shapes and OPTIONS_PROVENANCE emitted by contingencyOps.ts, without duplicating its map.
const recording = JSON.parse(readFileSync(new URL("../../../../scenarios/storm-sol4190/recording.json", import.meta.url), "utf8")) as { messages: { event?: LogEvent }[] };
const recordedEvent = (kind: LogEventKind): LogEvent => recording.messages.find((m) => m.event?.kind === kind)!.event!;

describe("EventLog rows", () => {
  it("bounds 5000 events to the newest page and reveals earlier rows in keyboard-accessible steps", async () => {
    const events = Array.from({ length: 5000 }, (_, index) => ev(index + 1, "CLOCK_CHANGED", { speed: 1, paused: false }));
    const onSelectEvent = vi.fn();
    const view = await mount(createElement(EventLog, { events, onSelectEvent }));
    expect(rows(view.container)).toHaveLength(100);
    expect(rows(view.container)[0].dataset.seq).toBe("4901");
    expect(rows(view.container).at(-1)?.dataset.seq).toBe("5000");
    const earlier = must<HTMLButtonElement>(view.container, '[aria-label="Show earlier events"]');
    expect(earlier.tabIndex).toBe(0);
    await click(earlier);
    expect(rows(view.container)).toHaveLength(200);
    expect(rows(view.container)[0].dataset.seq).toBe("4801");
    await keyDown(rows(view.container)[0], "Enter");
    expect(onSelectEvent).toHaveBeenLastCalledWith(events[4800]);
    await click([...view.container.querySelectorAll("nav button")].find((button) => button.textContent === "SYSTEM")!);
    expect(rows(view.container)).toHaveLength(100);
    await view.unmount();
  });

  it("labels unavailable event metadata and summary fields instead of displaying missing data", async () => {
    const event = { ...ev(1, "SESSION_LOADED"), seq: NaN, sim_time: "", actor: undefined } as unknown as LogEvent;
    const view = await mount(createElement(EventLog, { events: [event] }));
    for (const cell of [...rows(view.container)[0].children].slice(0, 4)) {
      expect(cell.textContent).toContain("—");
      expect(cell.getAttribute("data-unavailable")).toBe("true");
      expect(cell.getAttribute("data-source")).toMatch(/^unavailable:/);
    }
    expect(view.container.textContent).not.toMatch(/NaN|undefined/);
    await view.unmount();
  });

  it("lists events in seq order whatever order they arrive in, with sim time, seq and actor", async () => {
    const { container } = await mount(
      createElement(EventLog, { events: [ev(3, "EVA_ENDED", { crew_ids: ["EV1"] }), ev(1, "SESSION_LOADED", { scenario_id: "s-a" }), ev(2, "LINK_LOST", { node_id: "EV1" })] }),
    );

    expect(rows(container).map((r) => r.getAttribute("data-seq"))).toEqual(["1", "2", "3"]);
    expect(rows(container)[0].textContent).toContain("13:05:00");
    expect(rows(container)[0].textContent).toContain("#1");
    expect(rows(container)[0].textContent).toContain("system");
  });

  it("with no events it says so and shows no rows", async () => {
    const { container } = await mount(createElement(EventLog, { events: [] }));
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).toMatch(/No events logged yet/);
  });

  it("the filter shows only that category", async () => {
    const { container } = await mount(
      createElement(EventLog, { events: [ev(1, "ALERT_RAISED", { message: "Shelter now", level: "warning" }), ev(2, "LINK_LOST", { node_id: "EV1" })] }),
    );
    await click([...container.querySelectorAll("nav button")].find((b) => b.textContent === "LINK")!);
    expect(rows(container).map((r) => r.getAttribute("data-kind"))).toEqual(["LINK_LOST"]);
  });
});

describe("EventLog with fields missing: — and nothing invented (04 §D.1)", () => {
  const cases: [LogEventKind, RegExp][] = [
    ["EVA_STARTED", /EV1, EV2/],
    ["PLAN_REVISED", /Rev 2/],
    ["VEHICLE_DISPATCHED", /PR1/],
    ["VEHICLE_ARRIVED", /PR1/],
    ["CLOCK_CHANGED", /\b1x/],
    ["TASK_DROPPED", /plan cut/],
    ["OPTIONS_PROPOSED", /\b0 contingency/],
    ["SESSION_LOADED", /scenario$/],
  ];

  it.each(cases)("%s with an empty data object reads — and does not use a made-up value", (kind, invented) => {
    const text = summarizeEvent(ev(1, kind));
    expect(text).toContain("—");
    expect(text).not.toMatch(invented);
  });

  it("supplied values are shown as they are, including zero options and a real revision number", () => {
    expect(summarizeEvent(ev(1, "EVA_STARTED", { crew_ids: ["EV2"] }))).toContain("EV2");
    expect(summarizeEvent(ev(1, "PLAN_REVISED", { plan_revision: 5 }))).toContain("Rev 5");
    expect(summarizeEvent(ev(1, "VEHICLE_DISPATCHED", { vehicle_id: "UR1" }))).toContain("UR1");
    expect(summarizeEvent(ev(1, "ROLE_TAKEN_OVER", { role: "eva:EV1", crew_id: "EV1", old_client_id: "c-a", new_client_id: "c-b" }))).toBe("Role eva:EV1 connection replaced");
    expect(summarizeEvent(ev(1, "CLOCK_CHANGED", { speed: 10, paused: true }))).toBe("Clock speed 10x (paused)");
    expect(summarizeEvent(ev(1, "OPTIONS_PROPOSED", { options: [] }))).toContain("0 contingency");
  });

  it("clock jump, library event, reset, site and mission setup events show their data (LogEventData)", async () => {
    const jump = ev(1, "CLOCK_JUMPED", { reason: "next_stop", from_sim_time: "2024-05-20T13:05:00Z", to_sim_time: "2024-05-20T13:21:30Z", stop_id: "wp-2", ended_by: "alert" });
    expect(summarizeEvent(jump)).toBe("Clock jumped to next stop wp-2: 13:05:00 → 13:21:30, ended by alert");
    expect(summarizeEvent(ev(2, "EVENT_STARTED", { event_id: "spe-2024-05-20", t0_sim_time: "2024-05-20T13:10:00Z", series_start_utc: "2024-05-20T00:00:00Z", source_id: "donki-sep" })))
      .toBe("Event spe-2024-05-20 started at 13:10:00 (series from 2024-05-20T00:00:00Z, source donki-sep)");
    expect(summarizeEvent(ev(3, "SESSION_RESET", { session_id: "s-1", next_session_id: "s-2" }))).toBe("Session s-1 reset; next session s-2");
    expect(summarizeEvent(ev(4, "SITE_SELECTED", { candidate_id: "cand-3" }))).toBe("Site candidate cand-3 selected");
    expect(summarizeEvent(ev(5, "MISSION_SETUP_SET", { crew_count: 2, vehicle_available: false, vehicle_param_set: null, solar_phase: "max", max_haven_min: 30 })))
      .toBe("Mission setup set: crew_count 2, vehicle_available no, vehicle_param_set none, solar_phase max, max_haven_min 30");
    for (const kind of ["CLOCK_JUMPED", "EVENT_STARTED", "SESSION_RESET", "SITE_SELECTED", "MISSION_SETUP_SET"] as const) {
      const text = summarizeEvent(ev(9, kind));
      expect(text).toContain("—");
      expect(text).not.toBe(kind);
    }
    const view = await mount(createElement(EventLog, { events: [jump] }));
    const row = rows(view.container)[0]!;
    expect(row.textContent).toContain("wp-2: 13:05:00 → 13:21:30");
    expect([...row.querySelectorAll("[title]")].map((el) => el.getAttribute("title"))).toContain("Clock jumped to next stop wp-2: 13:05:00 → 13:21:30, ended by alert");
    await view.unmount();
  });

  it("Earth message events read the message_id field (05 EarthMessage), not msg_id", () => {
    expect(summarizeEvent(ev(1, "EARTH_MSG_QUEUED", { message_id: "m-17" }))).toContain("m-17");
    expect(summarizeEvent(ev(2, "EARTH_MSG_DELIVERED", { message_id: "m-18" }))).toContain("m-18");
    expect(summarizeEvent(ev(3, "EARTH_MSG_DELIVERED", { msg_id: "old" }))).not.toContain("old");
    expect(summarizeEvent(ev(4, "EARTH_MSG_DELIVERED"))).toContain("—");
  });
});

describe("EventLog provenance chip comes from the event (FR-15, NFR-05)", () => {
  it("uses the class in the event's provenance map, with a source id", async () => {
    const { container } = await mount(createElement(EventLog, { events: [ev(1, "ALERT_RAISED", { message: "x", level: "caution" }, { rate_ugy_h: "replayed" })] }));
    const chip = must(rows(container)[0], '[data-slot="event-provenance"] [data-provenance]');
    expect(chip.getAttribute("data-provenance")).toBe("replayed");
    expect(chip.getAttribute("data-source")).toBeTruthy();
    expect(chip.textContent).toContain(provenanceGlyph("replayed"));
  });

  it("an event with an empty provenance map is unknown: —, flagged, no class and no glyph (no replayed/simulated fallback)", async () => {
    const { container } = await mount(
      createElement(EventLog, { events: [ev(1, "ALERT_RAISED", { message: "x", level: "warning" }), ev(2, "EVA_STARTED", { crew_ids: ["EV1"] })] }),
    );
    for (const row of rows(container)) {
      expect(row.querySelector('[data-slot="event-provenance"] [data-provenance]')).toBeNull();
      const chip = must(row, '[data-slot="event-provenance"] [data-unavailable]');
      expect(chip.textContent).toBe("—");
      expect(chip.getAttribute("data-source")).toMatch(/^unavailable:/);
    }
  });

  it("an event whose fields have different classes shows each class once", async () => {
    const { container } = await mount(
      createElement(EventLog, { events: [ev(1, "CREW_SHELTERED", { crew_id: "EV1" }, { dose_event_ugy: "simulated", haven: "modelled", dose_event_unsheltered_ugy: "simulated" })] }),
    );
    const classes = [...rows(container)[0].querySelectorAll('[data-slot="event-provenance"] [data-provenance]')].map((c) => c.getAttribute("data-provenance"));
    expect(classes.sort()).toEqual(["modelled", "simulated"]);
  });

  it("provenanceGlyph never invents a glyph for an unknown class", () => {
    expect(provenanceGlyph(undefined)).toBe("—");
    expect(provenanceGlyph("something-else")).toBe("—");
    expect(provenanceGlyph("modelled")).toBe("○");
  });

  it("inherited property names are not provenance classes (toString, constructor, __proto__)", async () => {
    expect(provenanceGlyph("toString")).toBe("—");
    expect(provenanceGlyph("constructor")).toBe("—");
    const map = JSON.parse('{"a":"toString","b":"__proto__","c":"constructor"}') as Record<string, never>;
    const { container } = await mount(createElement(EventLog, { events: [ev(1, "EVA_STARTED", { crew_ids: ["EV1"] }, map)] }));
    expect(rows(container)[0].querySelector('[data-slot="event-provenance"] [data-provenance]')).toBeNull();
    expect(must(rows(container)[0], "[data-unavailable]").textContent).toBe("—");
  });

  it("labels header count and every populated row cell with expected provenance and source id, without a client (BUG-004, BUG-003)", async () => {
    const events: LogEvent[] = [
      { ...ev(1, "PLAN_REVISED", { plan_revision: 7 }, { "data.plan_revision": "simulated" }), actor: "ops", sim_time: "2024-05-20T00:00:00Z" },
      { ...ev(2, "ALERT_RAISED", { message: "Shelter now", level: "warning" }, { "data.rate_ugy_h": "replayed" }), sim_time: "2024-05-20T00:01:00Z" },
      { ...ev(3, "PLAN_REVISED", {}), actor: "ops" },
    ];
    const view = await mount(createElement(EventLog, { events }));

    const count = must(view.container, '[data-source="session:events.count"]');
    expect(count.getAttribute("data-provenance")).toBe("simulated");
    expect(count.textContent?.trim()).toBe("3 / 3");

    const [revised, alert, missingSummary] = rows(view.container);
    for (const [cell, path] of [
      [revised.children[0]!, "seq"],
      [revised.children[1]!, "sim_time"],
      [revised.children[2]!, "actor"],
      [revised.children[3]!, "data.plan_revision"],
    ] as const) {
      expect(cell.getAttribute("data-provenance")).toBe("simulated");
      expect(cell.getAttribute("data-source")).toBe(`event:PLAN_REVISED/1/${path}`);
      expect(cell.getAttribute("data-unavailable")).toBeNull();
    }
    const revisedChip = must(revised, '[data-slot="event-provenance"] [data-provenance]');
    expect(revisedChip.getAttribute("data-provenance")).toBe("simulated");
    expect(revisedChip.getAttribute("data-source")).toBe("event:1:data.plan_revision");

    const severity = must(alert, '[data-source="event:ALERT_RAISED/2/data.level"]');
    expect(severity.getAttribute("data-provenance")).toBe("simulated");
    expect(severity.textContent).toMatch(/⬣\s*WARNING/);
    const alertChip = must(alert, '[data-slot="event-provenance"] [data-provenance]');
    expect(alertChip.getAttribute("data-provenance")).toBe("replayed");
    expect(alertChip.getAttribute("data-source")).toBe("event:2:data.rate_ugy_h");

    const missingSummaryCell = missingSummary.children[3]!;
    expect(missingSummaryCell.textContent).toContain("—");
    expect(missingSummaryCell.getAttribute("data-provenance")).toBe("simulated");
    expect(missingSummaryCell.getAttribute("data-unavailable")).toBe("true");
    expect(missingSummaryCell.getAttribute("data-source")).toBe("unavailable:event:PLAN_REVISED/3/data.plan_revision");
    const unknownChip = must(missingSummary, '[data-slot="event-provenance"] [data-unavailable]');
    expect(unknownChip.getAttribute("data-provenance")).toBeNull();
    expect(unknownChip.getAttribute("data-source")).toBe("unavailable:event_log.provenance");

    await click([...view.container.querySelectorAll("nav button")].find((b) => b.textContent === "ALERTS")!);
    expect(count.textContent?.trim()).toBe("1 / 3");
    expect(count.getAttribute("data-provenance")).toBe("simulated");
    await view.unmount();
  });

  it("annotates a seeded TASK_ADDED summary as assumed and names data.text, agreeing with its provenance chip", async () => {
    const seededTask: LogEvent = {
      seq: 1,
      sim_time: "2024-05-20T13:05:00Z",
      kind: "TASK_ADDED",
      actor: "system",
      data: {
        task_id: "t-s2-01",
        stop_id: "wp-2",
        crew_id: "EV1",
        kind: "image",
        text: "Image the ridge crest",
        origin: "plan",
      },
      provenance: { "data.text": "assumed" },
      command_ref: null,
    };
    const view = await mount(createElement(EventLog, { events: [seededTask] }));
    const row = rows(view.container)[0]!;
    const summary = row.children[3] as HTMLElement;
    const chip = must(row, '[data-slot="event-provenance"] [data-provenance]');

    expect(summary.textContent).toContain("Task added: Image the ridge crest");
    expect(summary.getAttribute("data-provenance")).toBe("assumed");
    expect(summary.getAttribute("data-provenance")).not.toBe("simulated");
    expect(summary.getAttribute("data-source")).toBe("event:TASK_ADDED/1/data.text");
    expect(summary.getAttribute("data-unavailable")).toBeNull();
    expect(chip.getAttribute("data-provenance")).toBe("assumed");
    expect(summary.getAttribute("data-provenance")).toBe(chip.getAttribute("data-provenance"));
    await view.unmount();
  });

  it("keeps TASK_UPDATED and TASK_DROPPED summaries as simulated and names their displayed fields", async () => {
    const updated: LogEvent = {
      seq: 2,
      sim_time: "2024-05-20T13:10:00Z",
      kind: "TASK_UPDATED",
      actor: "eva:EV1",
      data: { task_id: "t-s2-01", stop_id: "wp-2", crew_id: "EV1", state: "DONE", reason: null },
      provenance: { "data.state": "simulated" },
      command_ref: { client_id: "c-1", command_id: "k-1" },
    };
    const dropped: LogEvent = {
      seq: 3,
      sim_time: "2024-05-20T13:12:00Z",
      kind: "TASK_DROPPED",
      actor: "system",
      data: { task_id: "t-s2-02", stop_id: "wp-3", plan_revision: 2 },
      provenance: { "data.plan_revision": "simulated" },
      command_ref: null,
    };
    const view = await mount(createElement(EventLog, { events: [updated, dropped] }));
    const [updatedRow, droppedRow] = rows(view.container);
    const updatedSummary = updatedRow.children[3] as HTMLElement;
    const droppedSummary = droppedRow.children[3] as HTMLElement;

    expect(updatedSummary.getAttribute("data-provenance")).toBe("simulated");
    expect(updatedSummary.getAttribute("data-source")).toBe("event:TASK_UPDATED/2/data.state");
    expect(droppedSummary.getAttribute("data-provenance")).toBe("simulated");
    expect(droppedSummary.getAttribute("data-source")).toBe("event:TASK_DROPPED/3/data.plan_revision");
    await view.unmount();
  });

  it("honours field overrides, separates EVENT_STARTED origins, and avoids assumed on missing task text", async () => {
    const started = ev(1, "EVENT_STARTED", {
      event_id: "storm",
      t0_sim_time: "2024-05-20T13:10:00Z",
      series_start_utc: "2024-05-20T00:00:00Z",
      source_id: "rad-sol4190",
    });
    const reclassified = ev(2, "TASK_ADDED", { task_id: "t-1", stop_id: "wp-2", text: "Check outcrop" }, { "data.text": "derived" });
    const missingTaskText = ev(3, "TASK_ADDED", {});

    const view = await mount(createElement(EventLog, { events: [started, reclassified, missingTaskText] }));
    const [startedRow, reclassifiedRow, missingRow] = rows(view.container);

    const startedSummary = startedRow.children[3] as HTMLElement;
    expect(startedSummary.getAttribute("data-provenance")).toBe("simulated");
    expect(startedSummary.getAttribute("data-source")).toBe("event:EVENT_STARTED/1/data.t0_sim_time");
    expect(must(startedSummary, '[data-source="event:EVENT_STARTED/1/data.series_start_utc"]').getAttribute("data-provenance")).toBe("replayed");

    const reclassifiedSummary = reclassifiedRow.children[3] as HTMLElement;
    expect(reclassifiedSummary.getAttribute("data-provenance")).toBe("derived");
    expect(reclassifiedSummary.getAttribute("data-source")).toBe("event:TASK_ADDED/2/data.text");

    const missingSummary = missingRow.children[3] as HTMLElement;
    expect(missingSummary.textContent).toContain("—");
    expect(missingSummary.getAttribute("data-unavailable")).toBe("true");
    expect(missingSummary.getAttribute("data-source")).toBe("unavailable:event:TASK_ADDED/3/data.text");
    expect(missingSummary.getAttribute("data-provenance")).toBeNull();
    await view.unmount();
  });

  it.each([false, true])("attributes the real EVENT_STARTED press and series separately (explicit field map: %s)", async (explicitMap) => {
    const started = recordedEvent("EVENT_STARTED");
    const event = { ...started, provenance: explicitMap ? {
      "data.t0_sim_time": "simulated", "data.series_start_utc": "replayed", "data.source_id": "replayed",
    } as ProvenanceMap : started.provenance };
    const view = await mount(createElement(EventLog, { events: [event] }));
    const summary = rows(view.container)[0].children[3] as HTMLElement;
    expect(summary.dataset.provenance).toBe("simulated");
    expect(summary.dataset.source).toBe(`event:EVENT_STARTED/${event.seq}/data.t0_sim_time`);
    for (const [path, text, provenance] of [
      ["t0_sim_time", String(event.data.t0_sim_time).slice(11, 19), "simulated"],
      ["series_start_utc", event.data.series_start_utc, "replayed"],
      ["source_id", event.data.source_id, "replayed"],
    ]) {
      const part = must(summary, `[data-source="event:EVENT_STARTED/${event.seq}/data.${path}"]`);
      expect(part.textContent).toBe(text);
      expect(part.getAttribute("data-provenance")).toBe(provenance);
    }
    expect(summary.querySelector('[data-provenance="replayed"]')?.textContent).not.toContain("started at");
    await view.unmount();
  });

  it("labels every MISSION_SETUP_SET chosen setting assumed with its own field source (05 MissionScenario)", async () => {
    // liveSetup.ts emits an empty provenance map; SCR-20 supplies assumed for these same settings.
    const event = ev(1, "MISSION_SETUP_SET", { max_haven_min: 30, crew_count: 2, vehicle_available: false, solar_phase: "max", vehicle_param_set: "pr1-assumed" });
    const view = await mount(createElement(EventLog, { events: [event] }));
    const summary = rows(view.container)[0].children[3] as HTMLElement;
    expect(summary.dataset.provenance).toBe("assumed");
    for (const [key, value] of Object.entries(event.data)) {
      const part = must(summary, `[data-source="event:MISSION_SETUP_SET/1/data.${key}"]`);
      expect(part.getAttribute("data-provenance")).toBe("assumed");
      expect(part.textContent).toBe(`${key} ${value === false ? "no" : value}`);
    }
    await view.unmount();
  });

  it("counts OPTIONS_PROPOSED session objects as simulated regardless of the real modelled content map", async () => {
    const proposed = recordedEvent("OPTIONS_PROPOSED");
    expect(proposed.provenance).toEqual({
      "data.options[].eta_shelter_min": "modelled",
      "data.options[].expected_dose_ugy": "modelled",
      "data.options[].rendezvous": "modelled",
    });
    const events = [{}, { "data.options[].eta_shelter_min": "modelled" }, proposed.provenance].map((provenance, index) => ({
      ...proposed, seq: index + 1, provenance: provenance as ProvenanceMap,
    }));
    const view = await mount(createElement(EventLog, { events }));
    for (const row of rows(view.container)) {
      const summary = row.children[3] as HTMLElement;
      expect(summary.dataset.provenance).toBe("simulated");
      expect(summary.dataset.source).toBe(`event:OPTIONS_PROPOSED/${row.dataset.seq}/data.options`);
      expect(summary.textContent).toBe(`${(proposed.data.options as unknown[]).length} contingency options proposed`);
    }
    await view.unmount();
  });

  it("never ranks constituent classes: a reason cannot reclassify the summary's simulated task state", async () => {
    const classes = ["measured", "replayed", "derived", "modelled", "assumed", "simulated"] as const;
    const events = classes.map((prov, index) => ev(index + 1, "TASK_UPDATED", { task_id: "t-1", state: "SKIPPED", reason: "terrain" }, {
      "data.state": "simulated", "data.reason": prov,
    }));
    const view = await mount(createElement(EventLog, { events }));
    for (const [index, row] of rows(view.container).entries()) {
      const summary = row.children[3] as HTMLElement;
      expect(summary.dataset.source).toBe(`event:TASK_UPDATED/${index + 1}/data.state`);
      expect(summary.dataset.provenance).toBe("simulated");
      const reason = must(summary, `[data-source="event:TASK_UPDATED/${index + 1}/data.reason"]`);
      expect(reason.textContent).toBe("terrain");
      expect(reason.getAttribute("data-provenance")).toBe(classes[index]);
      const state = must(summary, `[data-source="event:TASK_UPDATED/${index + 1}/data.state"]`);
      expect(state.textContent).toBe("SKIPPED");
      expect(state.getAttribute("data-provenance")).toBe("simulated");
    }
    await view.unmount();
  });
});

describe("EventLog severity is shape + word, not colour alone (04 §A.3)", () => {
  it("an advisory alert row carries colour (--status-advisory/--advisory) + shape ◆ + word ADVISORY, alongside warning and caution", async () => {
    const { container } = await mount(
      createElement(EventLog, {
        events: [
          ev(1, "ALERT_RAISED", { message: "Forecast received", level: "advisory" }),
          ev(2, "ALERT_RAISED", { message: "Shelter now", level: "warning" }),
          ev(3, "ALERT_RAISED", { message: "Comm shadow", level: "caution" }),
        ],
      }),
    );
    const [advisoryRow, warningRow, cautionRow] = rows(container);
    const advisorySummary = advisoryRow.children[3] as HTMLElement;
    const warningSummary = warningRow.children[3] as HTMLElement;
    const cautionSummary = cautionRow.children[3] as HTMLElement;

    expect(advisorySummary.textContent).toMatch(/◆\s*ADVISORY/);
    expect(advisorySummary.style.color).toMatch(/--status-advisory/);
    expect(advisorySummary.style.color).toMatch(/--advisory/);
    expect(warningSummary.textContent).toMatch(/⬣\s*WARNING/);
    expect(warningSummary.style.color).toMatch(/--warning/);
    expect(cautionSummary.textContent).toMatch(/▲\s*CAUTION/);
    expect(cautionSummary.style.color).toMatch(/--caution/);
  });

  it("a warning alert row carries ⬣ WARNING, a caution row ▲ CAUTION; other rows carry neither", async () => {
    const { container } = await mount(
      createElement(EventLog, {
        events: [
          ev(1, "ALERT_RAISED", { message: "Shelter now", level: "warning" }),
          ev(2, "ALERT_RAISED", { message: "Comm shadow", level: "caution" }),
          ev(3, "LINK_LOST", { node_id: "EV1" }),
        ],
      }),
    );
    const [w, c, o] = rows(container);
    expect(w.textContent).toMatch(/⬣\s*WARNING/);
    expect(c.textContent).toMatch(/▲\s*CAUTION/);
    expect(o.textContent).not.toMatch(/WARNING|CAUTION|⬣|▲/);
  });
});

describe("EventLog chrome uses neutral instrument colours, not route cyan (BUG-005; 04 §A.3, §B.2, §C)", () => {
  it("keeps --route and #4CC9F0 off the livery stripe, active filter and non-system actor while keeping alert status cues", async () => {
    const view = await mount(
      createElement(EventLog, {
        events: [
          { ...ev(1, "ALERT_RAISED", { message: "Shelter now", level: "warning" }), actor: "ops" },
          { ...ev(2, "ALERT_RAISED", { message: "Comm shadow", level: "caution" }), actor: "eva:EV1" },
          ev(3, "LINK_LOST", { node_id: "EV1" }),
        ],
      }),
    );

    const stripe = must<HTMLElement>(view.container, '[aria-hidden="true"]');
    const stripeStyle = stripe.getAttribute("style") ?? "";
    expect(stripeStyle).not.toMatch(/--route|#4cc9f0/i);
    expect(stripe.style.height).toBe("4px");
    expect(stripeStyle).toMatch(/linear-gradient\(.*--text-1.*--text-3.*--hairline/);

    const activeFilter = must<HTMLButtonElement>(view.container, 'nav button[aria-pressed="true"]');
    expect(activeFilter.style.backgroundColor).not.toMatch(/--route|#4cc9f0/i);
    expect(activeFilter.style.border).not.toMatch(/--route|#4cc9f0/i);
    expect(activeFilter.style.borderColor).not.toMatch(/--route|#4cc9f0/i);
    expect(activeFilter.style.backgroundColor).toMatch(/--text-1/);
    expect(activeFilter.style.color).toMatch(/--void/);
    expect(activeFilter.style.border).toMatch(/--text-1/);

    for (const inactiveFilter of view.container.querySelectorAll<HTMLButtonElement>('nav button[aria-pressed="false"]')) {
      expect(inactiveFilter.style.backgroundColor).toBe("transparent");
      expect(inactiveFilter.style.color).toMatch(/--text-2/);
      expect(inactiveFilter.style.border).toMatch(/--edge/);
    }

    await click([...view.container.querySelectorAll("nav button")].find((b) => b.textContent === "ALERTS")!);
    const alertsFilter = must<HTMLButtonElement>(view.container, 'nav button[aria-pressed="true"]');
    expect(alertsFilter.textContent).toBe("ALERTS");
    expect(alertsFilter.style.backgroundColor).not.toMatch(/--route|#4cc9f0/i);
    expect(alertsFilter.style.border).not.toMatch(/--route|#4cc9f0/i);
    expect(alertsFilter.style.backgroundColor).toMatch(/--text-1/);
    expect(alertsFilter.style.color).toMatch(/--void/);
    expect(alertsFilter.style.border).toMatch(/--text-1/);

    for (const inactiveFilter of view.container.querySelectorAll<HTMLButtonElement>('nav button[aria-pressed="false"]')) {
      expect(inactiveFilter.style.border).toMatch(/--edge/);
    }

    const [warningRow, cautionRow] = rows(view.container);
    const opsActor = warningRow.children[2] as HTMLElement;
    const ev1Actor = cautionRow.children[2] as HTMLElement;
    expect(opsActor.textContent).toBe("ops");
    expect(opsActor.style.color).not.toMatch(/--route|#4cc9f0/i);
    expect(opsActor.style.color).toMatch(/--text-1/);
    expect(ev1Actor.textContent).toBe("eva:EV1");
    expect(ev1Actor.style.color).not.toMatch(/--route|#4cc9f0/i);
    expect(ev1Actor.style.color).toMatch(/--text-1/);

    const warningSummary = warningRow.children[3] as HTMLElement;
    const cautionSummary = cautionRow.children[3] as HTMLElement;
    expect(warningSummary.textContent).toMatch(/⬣\s*WARNING/);
    expect(warningSummary.style.color).toMatch(/--warning/);
    expect(cautionSummary.textContent).toMatch(/▲\s*CAUTION/);
    expect(cautionSummary.style.color).toMatch(/--caution/);

    await view.unmount();
  });
});

describe("EventLog COPY LOG reports what happened", () => {
  const events = [ev(1, "SESSION_LOADED", { scenario_id: "s-a" })];
const copyButton = (root: ParentNode) => must<HTMLButtonElement>(root, 'button[title^="Copy filtered log"]');
  const setClipboard = (writeText: ((t: string) => Promise<void>) | undefined) =>
    Object.defineProperty(navigator, "clipboard", { value: writeText ? { writeText } : undefined, configurable: true });

  it("says COPIED only after the write resolved, with the visible lines", async () => {
    let resolve!: () => void;
    const writeText = vi.fn((_text: string) => new Promise<void>((r) => (resolve = r)));
    setClipboard(writeText);
    const { container } = await mount(createElement(EventLog, { events }));

    await click(copyButton(container));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("SESSION_LOADED");
    expect(copyButton(container).textContent).not.toMatch(/COPIED/);

    resolve();
    await flush();
    expect(copyButton(container).textContent).toMatch(/COPIED/);
  });

  it("says COPY FAILED when the write is rejected, and never COPIED", async () => {
    setClipboard(vi.fn(async (_text: string) => { throw new Error("denied"); }));
    const { container } = await mount(createElement(EventLog, { events }));

    await click(copyButton(container));
    await flush();
    expect(copyButton(container).textContent).toMatch(/COPY FAILED/);
    expect(copyButton(container).textContent).not.toMatch(/COPIED/);
  });

  it("says COPY FAILED when the browser has no clipboard", async () => {
    setClipboard(undefined);
    const { container } = await mount(createElement(EventLog, { events }));

    await click(copyButton(container));
    await flush();
    expect(copyButton(container).textContent).toMatch(/COPY FAILED/);
  });
});


describe("SCR-11 log strip", () => {
  it("log drawer traps Tab and Shift-Tab then Escape restores the opener", async () => {
    const view = await mount(createElement(OpsConsole, { client: null }));
    const strip = must<HTMLButtonElement>(view.container, '[data-slot="event-log-strip"]');
    await click(strip);
    const drawer = must(view.container, '[data-slot="event-log-drawer"]');
    const close = must<HTMLButtonElement>(drawer, '[aria-label="Close event log"]');
    const last = must<HTMLElement>(drawer, '[aria-label="Event rows"]');
    last.focus();
    await keyDown(last, "Tab");
    expect(document.activeElement).toBe(close);
    await act(async () => { close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(last);
    await keyDown(last, "Escape");
    expect(view.container.querySelector('[data-slot="event-log-drawer"]')).toBeNull();
    expect(document.activeElement).toBe(strip);
    await view.unmount();
  });

  it("strip opens drawer", async () => {
    const client = storeFromBeat("radiation-alert", "ops");
    const view = await mount(createElement(OpsConsole, { client }));
    const strip = must(view.container, '[data-slot="event-log-strip"]');
    expect(strip.textContent).toContain("Shelter now");
    await click(strip);
    expect(must(view.container, '[data-slot="event-log-drawer"] .event-row').textContent).toContain("Shelter now");
    await view.unmount();
    client.close();
  });

  it("escape returns focus", async () => {
    const view = await mount(createElement(OpsConsole, { client: null }));
    const strip = must<HTMLButtonElement>(view.container, '[data-slot="event-log-strip"]');
    await click(strip);
    const filter = must<HTMLButtonElement>(view.container, '[data-slot="event-log-drawer"] nav button');
    filter.focus();
    await keyDown(filter, "Escape");
    expect(view.container.querySelector('[data-slot="event-log-drawer"]')).toBeNull();
    expect(document.activeElement).toBe(strip);
    await view.unmount();
  });
});
