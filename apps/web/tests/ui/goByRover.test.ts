/**
 * QoL Q3 (docs/plan/qol/README.md): the "GO BY ROVER" control on the SCR-12 next-stop card. One focused test for the
 * button state: enabled only with an available pressurized rover, sends RIDE_VEHICLE, shows the ride ETA from the snapshot
 * (simulated) or "—". Proposed 2026-11-13, decided by Sadman Shaharier Mahim.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import type { CrewActivity, PlanExport, Snapshot, Vehicle } from "@marswalk/protocol";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { selectRide } from "../../src/ui/screens/scr12/GoByRover";
import { recordingClient, storeFromBeat } from "./fixtureStore";
import { click, installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

const plan = {
  waypoints: [
    { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
    { id: "wp-1", role: "stop", x_m: 1000, y_m: 0 },
  ],
} as unknown as PlanExport;

function snapshotWith(vehicles: Partial<Vehicle>[], activity: CrewActivity = "WALKING"): Snapshot {
  const base = storeFromBeat("connect").state();
  if (!base) throw new Error("no snapshot");
  const rover = base.vehicles[0]!;
  return {
    ...base,
    plan,
    crew: base.crew.map((c) => (c.crew_id === "EV1" ? { ...c, activity, stop_index: null } : c)),
    vehicles: vehicles.map((v) => ({ ...rover, ...v })),
  };
}

const PR1: Partial<Vehicle> = { vehicle_id: "PR1", kind: "pressurized_rover", state: "PARKED" };
const UR1: Partial<Vehicle> = { vehicle_id: "UR1", kind: "utility_rover", param_set: "ur1-assumed", state: "PARKED" };

describe("GO BY ROVER on the next-stop card (QoL Q3)", () => {
  it("is enabled with a parked pressurized rover, sends RIDE_VEHICLE for the next stop, and shows no ETA yet", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: snapshotWith([PR1]) }));
    const button = must(view.container, '[data-slot="next"] [data-action="go-by-rover"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("GO BY ROVER");
    expect(button.getAttribute("style")).toMatch(/56px/);
    expect(must(view.container, '[data-slot="ride-eta"]').textContent).toContain("—");
    await click(button);
    expect(sent).toEqual([{ kind: "RIDE_VEHICLE", args: { crew_id: "EV1", vehicle_id: "PR1", to_stop_id: "wp-1" } }]);
  });

  it("is disabled with only a utility rover, with a rover that is not parked, and with no stop to go to", async () => {
    const states: [string, Snapshot][] = [
      ["utility rover only", snapshotWith([UR1])],
      ["rover en route", snapshotWith([{ ...PR1, state: "EN_ROUTE" }])],
      ["no vehicle", snapshotWith([])],
      ["no plan", { ...snapshotWith([PR1]), plan: null }],
    ];
    for (const [name, snapshot] of states) {
      const view = await mount(createElement(EvaTablet, { client: recordingClient(storeFromBeat("connect")).client, crewId: "EV1", snapshot }));
      expect((must(view.container, '[data-action="go-by-rover"]') as HTMLButtonElement).disabled, name).toBe(true);
      await view.unmount();
    }
  });

  it("while riding it shows the ride ETA from the snapshot, labelled simulated, and the button stays disabled", async () => {
    const snapshot = snapshotWith([{ ...PR1, state: "EN_ROUTE", eta_s: 300, task: { kind: "RIDE", target: { x_m: 1000, y_m: 0 }, crew_ids: ["EV1"], stop_id: "wp-1" } }], "RIDING");
    const view = await mount(createElement(EvaTablet, { client: recordingClient(storeFromBeat("connect")).client, crewId: "EV1", snapshot }));
    expect((must(view.container, '[data-action="go-by-rover"]') as HTMLButtonElement).disabled).toBe(true);
    const eta = must(view.container, '[data-slot="ride-eta"]');
    expect(eta.textContent).toContain("5 min");
    expect(eta.querySelector("[data-provenance]")?.getAttribute("data-provenance") ?? eta.getAttribute("data-provenance")).toBe("simulated");
  });

  it("selectRide reads only the snapshot", () => {
    expect(selectRide(snapshotWith([PR1]), "EV1")).toMatchObject({ available: true, vehicleId: "PR1", stopId: "wp-1", riding: false });
    expect(selectRide(snapshotWith([UR1]), "EV1")).toMatchObject({ available: false });
    expect(selectRide(null, "EV1")).toMatchObject({ available: false, riding: false });
  });

  it("selectRide offers the ride to a held or sheltered crew member whose summoned rover has arrived (QD-014)", () => {
    const summon = (crew_ids?: string[]): Partial<Vehicle> => ({ ...PR1, state: "ARRIVED", task: { kind: "SUMMON", target: { x_m: 5, y_m: 0 }, ...(crew_ids ? { crew_ids: crew_ids as never } : {}) } });
    expect(selectRide(snapshotWith([summon()], "HOLDING"), "EV1")).toMatchObject({ available: true, stopId: "wp-1" });
    expect(selectRide(snapshotWith([summon(["EV1"])], "SHELTERED"), "EV1")).toMatchObject({ available: true, stopId: "wp-1" });
    expect(selectRide(snapshotWith([summon()], "WALKING"), "EV1")).toMatchObject({ available: false });
    expect(selectRide(snapshotWith([summon()], "SHELTERED"), "EV1")).toMatchObject({ available: false });
    expect(selectRide(snapshotWith([{ ...summon(), state: "EN_ROUTE" }], "HOLDING"), "EV1")).toMatchObject({ available: false });
  });
});
