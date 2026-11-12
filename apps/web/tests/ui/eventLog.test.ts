/**
 * T27.04 follow-up: EventLog DOM tests (docs/specs/01 FR-46, FR-15; 04 §A.3, §D.1, §E.4; 05 LogEvent).
 * The real EventLog is mounted with explicit LogEvent fixtures. A missing field reads "—" (nothing is filled in from
 * defaults), the provenance chip comes from the event's own provenance map, and copying reports failure.
 *
 * Includes the SCR-11 strip and keyboard drawer contract (FD-092).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

describe("EventLog rows", () => {
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
    const chip = must(rows(container)[0], "[data-provenance]");
    expect(chip.getAttribute("data-provenance")).toBe("replayed");
    expect(chip.getAttribute("data-source")).toBeTruthy();
    expect(chip.textContent).toContain(provenanceGlyph("replayed"));
  });

  it("an event with an empty provenance map is unknown: —, flagged, no class and no glyph (no replayed/simulated fallback)", async () => {
    const { container } = await mount(
      createElement(EventLog, { events: [ev(1, "ALERT_RAISED", { message: "x", level: "warning" }), ev(2, "EVA_STARTED", { crew_ids: ["EV1"] })] }),
    );
    for (const row of rows(container)) {
      expect(row.querySelector("[data-provenance]")).toBeNull();
      const chip = must(row, "[data-unavailable]");
      expect(chip.textContent).toBe("—");
      expect(chip.getAttribute("data-source")).toMatch(/^unavailable:/);
    }
  });

  it("an event whose fields have different classes shows each class once", async () => {
    const { container } = await mount(
      createElement(EventLog, { events: [ev(1, "CREW_SHELTERED", { crew_id: "EV1" }, { dose_event_ugy: "simulated", haven: "modelled", dose_event_unsheltered_ugy: "simulated" })] }),
    );
    const classes = [...rows(container)[0].querySelectorAll("[data-provenance]")].map((c) => c.getAttribute("data-provenance"));
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
    expect(rows(container)[0].querySelector("[data-provenance]")).toBeNull();
    expect(must(rows(container)[0], "[data-unavailable]").textContent).toBe("—");
  });
});

describe("EventLog severity is shape + word, not colour alone (04 §A.3)", () => {
  it("an advisory alert row carries ◆ ADVISORY (04 §D.2)", async () => {
    const { container } = await mount(createElement(EventLog, { events: [ev(1, "ALERT_RAISED", { message: "Forecast received", level: "advisory" })] }));
    expect(rows(container)[0].textContent).toMatch(/◆\s*ADVISORY/);
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

describe("EventLog COPY LOG reports what happened", () => {
  const events = [ev(1, "SESSION_LOADED", { scenario_id: "s-a" })];
  const copyButton = (root: ParentNode) => must<HTMLButtonElement>(root, 'button[title^="Copy visible log"]');
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
