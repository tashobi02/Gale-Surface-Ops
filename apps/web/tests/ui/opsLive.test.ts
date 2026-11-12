/**
 * T25.01 / T27.04 — the ops console on live data: the snapshot-to-props selector, the console reading the tab's session
 * through the hooks, and the event log strip that opens a drawer (03 SCR-11, decided 11 Nov; 04 §E.4; 01 FR-46).
 * Real components, real client store, fake socket. No sample values: a missing field must read "—".
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import type { LogEvent, Snapshot } from "@marswalk/protocol";
import { OpsConsole } from "../../src/ui/screens/scr11OpsConsole";
import { selectOpsProps } from "../../src/ui/ops/liveProps";
import { closeHabSessions, startHabSession } from "../../src/state/habSession";
import type { SocketLike } from "../../src/net/habClient";
import { wsFixtures } from "../fixtures/ws";
import { storeFromBeat } from "./fixtureStore";
import { click, flush, installDom, keyDown, mount, must, removeDom } from "./domHarness";
import { act } from "react";

const connect = wsFixtures.connect[0] as Snapshot;

function event(seq: number, kind: LogEvent["kind"], data: Record<string, unknown> = {}, provenance: LogEvent["provenance"] = {}): LogEvent {
  return { seq, sim_time: "2024-05-20T13:05:07Z", kind, actor: "system", data, provenance, command_ref: null };
}

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  closeHabSessions();
  document.body.innerHTML = "";
});

describe("selectOpsProps", () => {
  it("passes crew, vehicles and alerts through from the snapshot, untouched", () => {
    const props = selectOpsProps(connect, []);
    expect(props.crew).toBe(connect.crew);
    expect(props.vehicles).toBe(connect.vehicles);
    expect(props.alerts).toBe(connect.alerts);
    expect(props.scenarioName).toBe("storm-sol4190");
  });

  it("labels the plan revision as simulated, with its source", () => {
    expect(selectOpsProps(connect, []).planRevision).toEqual({ v: 3, prov: "simulated", src: "snapshot:session.plan_revision" });
  });

  it("gives no sol, LTST, phase or conditions: the snapshot carries none, and nothing is invented", () => {
    const props = selectOpsProps(connect, []);
    expect(props.sol).toBeUndefined();
    expect(props.ltst).toBeUndefined();
    expect(props.phase).toBeUndefined();
    expect(props.conditions).toBeUndefined();
  });

  it("counts a crew member's tasks at the stop they are heading for, and in total", () => {
    const tasks = [
      { ...connect.tasks[0], task_id: "a", stop_id: "wp-2", crew_id: "EV1" as const, state: "DONE" as const },
      { ...connect.tasks[0], task_id: "b", stop_id: "wp-2", crew_id: null, state: "TODO" as const },
      { ...connect.tasks[0], task_id: "c", stop_id: "wp-3", crew_id: "EV1" as const, state: "TODO" as const },
      { ...connect.tasks[0], task_id: "d", stop_id: "wp-2", crew_id: "EV2" as const, state: "DONE" as const },
    ];
    const progress = selectOpsProps({ ...connect, tasks }, []).taskProgress?.EV1;
    expect(progress?.total).toEqual({ done: 1, total: 3 });
  });

  it("numbers the stop from the plan's stops, and never from the shape of an id: without a plan the stop is unknown (—)", () => {
    const tasks = [{ ...connect.tasks[0], task_id: "a", stop_id: "wp-2", crew_id: "EV1" as const, state: "TODO" as const }];
    expect(selectOpsProps({ ...connect, tasks, plan: null }, []).taskProgress?.EV1?.stop).toBeNull();

    const waypoint = (id: string, role: string) => ({ id, role }) as unknown as NonNullable<Snapshot["plan"]>["waypoints"][number];
    const plan = { ...(connect.plan ?? {}), waypoints: [waypoint("wp-0", "start"), waypoint("wp-9", "stop"), waypoint("wp-2", "stop")] } as unknown as Snapshot["plan"];
    // EV1 is walking with no stop reached yet, so the next stop is the plan's first stop: wp-9 is stop 1, whatever its id says.
    const first = [{ ...tasks[0], stop_id: "wp-9" }];
    expect(selectOpsProps({ ...connect, tasks: first, plan }, []).taskProgress?.EV1?.stop).toMatchObject({ stopId: "wp-9", stopNo: 1, done: 0, total: 1 });
  });

  it("has no progress for a crew member without tasks (the console shows —)", () => {
    expect(selectOpsProps({ ...connect, tasks: [] }, []).taskProgress?.EV1).toBeUndefined();
  });

  it("every planned stop has 0/0 progress for each crew and allows its first task", async () => {
    const waypoints = ["wp-1", "wp-2"].map((id) => ({ id, role: "stop" as const }));
    const plan = { ...(connect.plan ?? {}), waypoints } as NonNullable<Snapshot["plan"]>;
    for (let stop = 0; stop < waypoints.length; stop++) {
      const snapshot = { ...connect, plan, tasks: [], crew: (["EV1", "EV2"] as const).map((crew_id) => ({ ...connect.crew[0], crew_id, activity: "AT_STOP" as const, stop_index: stop + 1 })) };
      const props = selectOpsProps(snapshot, []);
      for (const id of ["EV1", "EV2"] as const) {
        expect(props.taskProgress?.[id]).toEqual({ stop: { stopId: waypoints[stop].id, stopNo: stop + 1, done: 0, total: 0 }, total: { done: 0, total: 0 } });
      }
      const view = await mount(createElement(OpsConsole, { ...props, client: null, snapshot }));
      for (const id of ["EV1", "EV2"] as const) expect(must<HTMLButtonElement>(view.container, `[aria-label="Add task for ${id}"]`).disabled).toBe(false);
      await view.unmount();
    }
  });

  it("is all empty without a snapshot", () => {
    const props = selectOpsProps(null, []);
    expect(props.crew).toBeUndefined();
    expect(props.alerts).toBeUndefined();
    expect(props.planRevision).toBeUndefined();
    expect(props.logLines).toEqual([]);
  });

  it("makes one strip line of the newest event, with its own provenance class, or none when it has no class", () => {
    const alert = event(5, "ALERT_RAISED", { code: "RADIATION", level: "warning" }, { "data.rate_ugy_h": "replayed" });
    const lines = selectOpsProps(connect, [event(4, "CLOCK_CHANGED", { speed: 60 }), alert]).logLines ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: "5", prov: "replayed", src: "log:5" });
    expect(lines[0].text).toContain("#5");
    expect(lines[0].text).toContain("13:05:07");

    // Several classes: the class of the first field path in sorted order, whatever order the map was built in.
    const forward = event(7, "ALERT_RAISED", {}, { "data.b": "assumed", "data.a": "replayed" });
    const reversed = event(7, "ALERT_RAISED", {}, { "data.a": "replayed", "data.b": "assumed" });
    expect(selectOpsProps(connect, [forward]).logLines?.[0].prov).toBe("replayed");
    expect(selectOpsProps(connect, [reversed]).logLines?.[0].prov).toBe("replayed");

    const plain = selectOpsProps(connect, [event(6, "CLOCK_CHANGED", { speed: 10 })]).logLines ?? [];
    expect(plain[0].prov).toBeNull();
  });
});

describe("the ops console reads the tab's session through the hooks", () => {
  function socketOf(): { socket: SocketLike & { push(m: unknown): Promise<void> }; factory: () => SocketLike } {
    const socket = {
      readyState: 1,
      onopen: null as (() => void) | null,
      onmessage: null as ((ev: { data: string }) => void) | null,
      onclose: null as (() => void) | null,
      send() {},
      close() {},
      async push(m: unknown) {
        await act(async () => {
          socket.onmessage?.({ data: JSON.stringify(m) });
        });
      },
    };
    return { socket, factory: () => socket };
  }

  it("no client prop: the clock and options follow the tab's session", async () => {
    const { socket, factory } = socketOf();
    startHabSession({ role: "ops", clientId: "c-ops", displayName: "Ops console", url: "ws://localhost/ws", socketFactory: factory });
    const { container } = await mount(createElement(OpsConsole, {}));
    expect(container.textContent).toContain("—");
    await socket.push(connect);
    await flush();
    expect(must(container, '[data-surface="ops"]')).toBeTruthy();
  });
});

describe("event log strip and drawer (03 SCR-11)", () => {
  async function consoleWithEvents() {
    const client = storeFromBeat("radiation-alert", "ops");
    const lines = selectOpsProps(client.state(), client.events()).logLines;
    const m = await mount(createElement(OpsConsole, { client, logLines: lines }));
    return { ...m, client };
  }

  it("shows the latest event on the strip and no drawer until it is opened", async () => {
    const { container } = await consoleWithEvents();
    const strip = must<HTMLButtonElement>(container, '[data-slot="event-log-strip"]');
    expect(strip.textContent).toContain("EVENT LOG");
    expect(strip.textContent).toContain("#420 13:12:00 Shelter now");
    expect(strip.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[data-slot="event-log-drawer"]')).toBeNull();
  });

  it("a click opens the event log as a drawer with the real log in it", async () => {
    const { container } = await consoleWithEvents();
    await click(must(container, '[data-slot="event-log-strip"]'));
    const drawer = must(container, '[data-slot="event-log-drawer"]');
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(must(drawer, '[data-slot="event-log"]')).toBeTruthy();
    expect(drawer.querySelectorAll(".event-row").length).toBe(1);
    expect(must(container, '[data-slot="event-log-strip"]').getAttribute("aria-expanded")).toBe("true");
  });

  it("Escape closes the drawer and returns focus to the strip", async () => {
    const { container } = await consoleWithEvents();
    const strip = must<HTMLButtonElement>(container, '[data-slot="event-log-strip"]');
    strip.focus();
    await click(strip);
    await keyDown(must(container, '[data-slot="event-log-drawer"]'), "Escape");
    expect(container.querySelector('[data-slot="event-log-drawer"]')).toBeNull();
    expect(document.activeElement).toBe(strip);
  });

  it("Escape closes the drawer from the strip too, but an Escape elsewhere on the page is left alone for its owner", async () => {
    const { container } = await consoleWithEvents();
    const strip = must<HTMLButtonElement>(container, '[data-slot="event-log-strip"]');
    await click(strip);
    // Another widget's Escape (for example the add-task popover) must not close the log behind its back.
    await keyDown(container.querySelector(".phase-timeline") as Element, "Escape");
    expect(container.querySelector('[data-slot="event-log-drawer"]')).not.toBeNull();
    await keyDown(strip, "Escape");
    expect(container.querySelector('[data-slot="event-log-drawer"]')).toBeNull();
  });

  it("the close button closes it too, and focus returns", async () => {
    const { container } = await consoleWithEvents();
    const strip = must<HTMLButtonElement>(container, '[data-slot="event-log-strip"]');
    await click(strip);
    await click(must(container, '[data-slot="event-log-drawer-close"]'));
    expect(container.querySelector('[data-slot="event-log-drawer"]')).toBeNull();
    expect(document.activeElement).toBe(strip);
  });

  it("with no events the strip reads — and still opens an empty log", async () => {
    const client = storeFromBeat("connect", "ops");
    const { container } = await mount(createElement(OpsConsole, { client }));
    const strip = must(container, '[data-slot="event-log-strip"]');
    expect(must(strip, "[data-unavailable]").textContent).toBe("—");
    await click(strip);
    expect(must(container, '[data-slot="event-log-drawer"]').textContent).toContain("No events logged yet");
  });
});


describe("package 19 conditions contract", () => {
  it("uses N-06 values with their supplied provenance and source", () => {
    const conditions = {
      sol: 4190, ltst: "13:05", sun_elevation_deg: 0,
      dose_rate_background_ugy_h: 1, dose_rate_event_ugy_h: 2, event_series_utc: null,
      source_ids: { sol: "mars24", ltst: "mars24", sun_elevation_deg: "mars24", dose_rate_background_ugy_h: "rad", dose_rate_event_ugy_h: "rad" },
      provenance: { sol: "derived", ltst: "derived", sun_elevation_deg: "derived", dose_rate_background_ugy_h: "replayed", dose_rate_event_ugy_h: "replayed" },
    } as Snapshot["conditions"];
    const props = selectOpsProps({ ...connect, conditions }, []);
    expect(props.sol).toEqual({ v: 4190, prov: "derived", src: "mars24" });
    expect(props.ltst).toEqual({ v: "13:05", prov: "derived", src: "mars24" });
    expect(props.conditions?.sunElevationDeg).toMatchObject({ v: 0, prov: "derived", src: "mars24" });
    expect(props.conditions?.doseRateEventUgyH).toMatchObject({ v: 2, prov: "replayed", src: "rad" });
    expect(selectOpsProps({ ...connect, conditions: { ...conditions, sol: null, ltst: null } }, []).sol).toBeUndefined();
    expect(selectOpsProps({ ...connect, conditions: { ...conditions, source_ids: {} } }, []).ltst).toBeUndefined();
    expect(props.phase).toBeUndefined();
  });
});
