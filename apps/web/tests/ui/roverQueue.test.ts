/**
 * Rover task display on the vehicle card (T29.05; docs/specs/01 FR-41, NFR-05; 03 SCR-11; 04 §E.10, §D.1 vehicle card;
 * 05 Vehicle). Originally by Saba Atharique (#168). The current `Vehicle.task` with the snapshot's ETA and battery
 * (`simulated`), then the queue of `Vehicle.queue` (BD-102, N-12; FD-084) with each task's ETA and battery after
 * (`modelled`, the Hab Core's values). A snapshot without the field reads "—".
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import type { Provenance, Vehicle } from "@marswalk/protocol";
import { RoverQueue, UtilityRoverQueues } from "../../src/ui/ops/RoverQueue";
import { PROVENANCE_GLYPHS } from "../../src/ui/components/provenance";
import { installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

const ur = (over: Partial<Vehicle> = {}): Vehicle => ({
  vehicle_id: "UR1",
  kind: "utility_rover",
  param_set: "ur1-assumed",
  x_m: 1500,
  y_m: 2200,
  state: "EN_ROUTE",
  task: { kind: "RELAY", target: { x_m: 1600, y_m: 2300 } },
  path: [],
  eta_s: 180,
  battery_wh: 850,
  ...over,
});

const pr = (over: Partial<Vehicle> = {}): Vehicle => ({
  vehicle_id: "PR1",
  kind: "pressurized_rover",
  param_set: "pr1-assumed",
  x_m: 0,
  y_m: 0,
  state: "PARKED",
  task: null,
  path: [],
  eta_s: null,
  battery_wh: null,
  ...over,
});

const field = (root: ParentNode, name: string): HTMLElement => must(root, `[data-field="${name}"]`);

describe("RoverQueue: the current task from the snapshot (FR-41)", () => {
  it("shows the task kind, target in projected metres, ETA as m:ss and battery in Wh", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur() }));
    const card = view.container;
    expect(card.textContent).toContain("UR1");
    expect(card.textContent).toContain("EN_ROUTE");
    expect(field(card, "task-kind").textContent).toBe("RELAY");
    expect(field(card, "task-target").textContent).toContain("1600");
    expect(field(card, "task-target").textContent).toContain("2300");
    expect(field(card, "eta").textContent).toContain("3:00");
    expect(field(card, "eta").textContent).not.toContain("180");
    expect(field(card, "battery").textContent).toContain("850");
    // the unit sits beside the value, in the same row
    expect(field(card, "battery").parentElement!.textContent).toContain("850Wh");
    await view.unmount();
  });

  it("shows a CARRY item label and omits it when there is none", async () => {
    const carry = await mount(
      createElement(RoverQueue, { vehicle: ur({ task: { kind: "CARRY", target: { x_m: 10, y_m: 20 }, item: "Core sample container" } }) }),
    );
    expect(carry.container.textContent).toContain("Core sample container");
    await carry.unmount();
    const relay = await mount(createElement(RoverQueue, { vehicle: ur() }));
    expect(relay.container.querySelector('[data-field="task-item"]')).toBeNull();
    await relay.unmount();
  });

  it("labels the task, ETA and battery simulated, from the snapshot, each with its own source id (FR-15, NFR-05)", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur() }));
    const expected: Record<string, string> = {
      state: "snapshot:vehicles.state",
      "task-kind": "snapshot:vehicles.task",
      "task-target": "snapshot:vehicles.task",
      eta: "snapshot:vehicles.eta_s",
      battery: "snapshot:vehicles.battery_wh",
    };
    for (const [name, src] of Object.entries(expected)) {
      const el = field(view.container, name);
      expect(el.getAttribute("data-provenance")).toBe("simulated");
      expect(el.getAttribute("data-source")).toBe(src);
      expect(el.getAttribute("data-unavailable")).toBeNull();
    }
    await view.unmount();
  });

  it("gives every element that has a source id a provenance class from the protocol's six", async () => {
    const six: Provenance[] = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"];
    const view = await mount(createElement(RoverQueue, { vehicle: ur() }));
    for (const el of view.container.querySelectorAll("[data-source]")) {
      expect(six).toContain(el.getAttribute("data-provenance") as Provenance);
    }
    await view.unmount();
  });

  it("draws the provenance chip as the class glyph and word, not an abbreviation", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur() }));
    const chips = [...view.container.querySelectorAll(".rover-chip")].map((c) => c.textContent);
    expect(chips.length).toBeGreaterThan(0);
    for (const text of chips) expect(text).toBe(`${PROVENANCE_GLYPHS.simulated} SIMULATED`);
    await view.unmount();
  });
});

describe("RoverQueue: no task, and missing values (04 §D.1: a missing value is the dash)", () => {
  it("says 'No active task', shows the dash for the ETA and still shows the battery", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur({ state: "PARKED", task: null, eta_s: null }) }));
    expect(view.container.textContent).toContain("No active task");
    const eta = field(view.container, "eta");
    expect(eta.textContent).toBe("—");
    expect(eta.getAttribute("data-unavailable")).toBe("true");
    expect(eta.getAttribute("data-source")).toBe("unavailable:vehicles.eta_s");
    expect(field(view.container, "battery").textContent).toContain("850");
    expect(view.container.querySelector('[data-field="task-kind"]')).toBeNull();
    await view.unmount();
  });

  it("shows the dash, not a number, for a battery or ETA the snapshot does not report", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur({ battery_wh: null, eta_s: null }) }));
    for (const name of ["battery", "eta"]) {
      const el = field(view.container, name);
      expect(el.textContent).toBe("—");
      expect(el.getAttribute("data-unavailable")).toBe("true");
      expect(el.getAttribute("data-provenance")).toBe("simulated");
    }
    await view.unmount();
  });

  it("shows the dash for the battery of a pressurized rover (05 Vehicle: battery is the utility rover's) and its SUMMON task", async () => {
    const view = await mount(
      createElement(RoverQueue, { vehicle: pr({ state: "DISPATCHED", task: { kind: "SUMMON", target: { x_m: 5, y_m: 6 }, crew_ids: ["EV1"] }, eta_s: 600 }) }),
    );
    expect(field(view.container, "battery").textContent).toBe("—");
    expect(field(view.container, "task-kind").textContent).toBe("SUMMON");
    expect(field(view.container, "eta").textContent).toContain("10:00");
    await view.unmount();
  });

  it("formats an ETA over an hour as h:mm:ss and rejects a negative or non-finite one as unavailable", async () => {
    const long = await mount(createElement(RoverQueue, { vehicle: ur({ eta_s: 3725 }) }));
    expect(field(long.container, "eta").textContent).toContain("1:02:05");
    await long.unmount();
    for (const eta of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const view = await mount(createElement(RoverQueue, { vehicle: ur({ eta_s: eta }) }));
      expect(field(view.container, "eta").textContent).toBe("—");
      await view.unmount();
    }
  });

  it("shows the queue as unavailable when the snapshot carries no queue field", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur() }));
    const queued = field(view.container, "queued");
    expect(queued.textContent).toBe("—");
    expect(queued.getAttribute("data-unavailable")).toBe("true");
    expect(queued.getAttribute("data-source")).toBe("unavailable:vehicles.queue");
    await view.unmount();
  });
});

describe("RoverQueue: the queued tasks of Vehicle.queue (BD-102, N-12; FD-084)", () => {
  it("says 'No queued tasks' for an empty queue", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur({ queue: [] }) }));
    const queued = field(view.container, "queued");
    expect(queued.textContent).toBe("No queued tasks");
    expect(queued.getAttribute("data-provenance")).toBe("simulated");
    expect(queued.getAttribute("data-source")).toBe("snapshot:vehicles.queue");
    await view.unmount();
  });

  it("lists each queued task in order with its target, item, ETA and battery after, modelled by the Hab Core", async () => {
    const vehicle = ur({
      task_id: "rt-40",
      queue: [
        { task_id: "rt-41", kind: "CARRY", target: { x_m: 1700, y_m: 2400 }, item: "core sample bag", eta_s: 540, battery_wh_after: 700 },
        { task_id: "rt-42", kind: "RETURN", target: null, eta_s: null, battery_wh_after: null },
      ],
    });
    const view = await mount(createElement(RoverQueue, { vehicle }));
    const rows = [...view.container.querySelectorAll("[data-queued-task]")];
    expect(rows.map((r) => r.getAttribute("data-queued-task"))).toEqual(["rt-41", "rt-42"]);
    expect(field(rows[0]!, "queue-kind").textContent).toBe("2. CARRY");
    expect(field(rows[0]!, "queue-item").textContent).toBe("core sample bag");
    expect(field(rows[0]!, "queue-target").textContent).toContain("1700");
    const eta = field(rows[0]!, "queue-eta");
    expect(eta.textContent).toBe("9:00");
    expect(eta.getAttribute("data-provenance")).toBe("modelled");
    expect(eta.getAttribute("data-source")).toBe("snapshot:vehicles.queue.eta_s");
    const after = field(rows[0]!, "queue-battery-after");
    expect(after.textContent).toBe("700");
    expect(after.getAttribute("data-provenance")).toBe("modelled");
    expect(after.getAttribute("data-source")).toBe("snapshot:vehicles.queue.battery_wh_after");
    // RETURN has no target; values the tick has not filled are the dash, never a guess.
    expect(field(rows[1]!, "queue-target").textContent).toBe("Hab");
    for (const name of ["queue-eta", "queue-battery-after"]) {
      expect(field(rows[1]!, name).textContent).toBe("—");
      expect(field(rows[1]!, name).getAttribute("data-unavailable")).toBe("true");
    }
    await view.unmount();
  });

  it("can leave out the header and battery when the vehicle card already shows them (compact)", async () => {
    const view = await mount(createElement(RoverQueue, { vehicle: ur({ queue: [] }), compact: true }));
    expect(view.container.querySelector("header")).toBeNull();
    expect(view.container.querySelector('[data-field="battery"]')).toBeNull();
    expect(field(view.container, "task-kind").textContent).toBe("RELAY");
    expect(field(view.container, "queued").textContent).toBe("No queued tasks");
    await view.unmount();
  });
});

describe("UtilityRoverQueues: the utility rovers only (SCR-15 tasks the utility rover; SUMMON is the pressurized rover's)", () => {
  it("lists a card per utility rover and none for the pressurized rover", async () => {
    const view = await mount(createElement(UtilityRoverQueues, { vehicles: [pr(), ur(), ur({ vehicle_id: "UR2" })] }));
    const ids = [...view.container.querySelectorAll("[data-vehicle-id]")].map((c) => c.getAttribute("data-vehicle-id"));
    expect(ids).toEqual(["UR1", "UR2"]);
    await view.unmount();
  });

  it("says there is no utility rover when the list has none, with the dash convention", async () => {
    const view = await mount(createElement(UtilityRoverQueues, { vehicles: [pr()] }));
    expect(view.container.textContent).toContain("No utility rover");
    await view.unmount();
  });
});
