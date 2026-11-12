/**
 * SCR-15 rover tasking (T29.04; docs/specs/01 FR-41; 03 SCR-15, §C.7; 04 §C.3 EVA targets >= 56 px, §A.3 four cues;
 * 02 §E.6 COMMAND_RESULT). Originally by Saba Atharique (#189, static-markup tests, `onDispatch` callback).
 * The real component is mounted and clicked; commands go through a Hab Core client double and the dialog shows what the
 * Hab Core answers.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { CommandResult, Snapshot, Vehicle } from "@marswalk/protocol";
import type { HabClient } from "../../src/net/habClient";
import { RoverTask, type RoverTaskProps } from "../../src/ui/screens/scr15RoverTask";
import { OpsConsole } from "../../src/ui/screens/scr11OpsConsole";
import { click, installDom, mount, must, removeDom } from "./domHarness";
import { accepted, rejected, storeFromBeat, type SentCommand } from "./fixtureStore";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

const ur = (over: Partial<Vehicle> = {}): Vehicle => ({
  vehicle_id: "UR1",
  kind: "utility_rover",
  param_set: "ur1-assumed",
  x_m: 0,
  y_m: 0,
  state: "PARKED",
  task: null,
  path: [],
  eta_s: null,
  battery_wh: 900,
  ...over,
});

/** A client whose snapshot the test can change, answering every command with `answer`. */
function client(answer: (c: SentCommand) => CommandResult | Promise<CommandResult> = () => accepted(), vehicles: Vehicle[] = [ur()]) {
  const real = storeFromBeat("connect", "ops");
  let snap: Snapshot = { ...real.state()!, vehicles };
  const listeners = new Set<() => void>();
  const sent: SentCommand[] = [];
  const hab: HabClient = {
    ...real,
    state: () => snap,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    send: async (command) => {
      const entry: SentCommand = { kind: command.kind, args: (command.args ?? {}) as Record<string, unknown> };
      sent.push(entry);
      return answer(entry);
    },
  };
  return {
    hab,
    sent,
    async setVehicles(next: Vehicle[]) {
      snap = { ...snap, vehicles: next };
      await act(async () => {
        for (const l of listeners) l();
      });
    },
  };
}

const ui = (props: RoverTaskProps) => createElement(RoverTask, props);
const button = (root: ParentNode, text: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find((x) => x.textContent?.trim().startsWith(text));
  if (!b) throw new Error(`no button "${text}"`);
  return b;
};
const tile = (root: ParentNode, kind: string): HTMLButtonElement => must<HTMLButtonElement>(root, `[data-task="${kind}"]`);
const confirm = (root: ParentNode): HTMLButtonElement => must<HTMLButtonElement>(root, "[data-action='confirm']");
const field = (root: ParentNode, name: string): HTMLElement => must(root, `[data-field="${name}"]`);

describe("SCR-15 choosing (03 SCR-15; FR-41)", () => {
  it("offers SCOUT, CARRY, RELAY and RETURN as buttons, every control at least 56 px (opened from the EVA tablet)", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1" }));
    expect([...view.container.querySelectorAll("[data-task]")].map((t) => t.getAttribute("data-task"))).toEqual(["SCOUT", "CARRY", "RELAY", "RETURN"]);
    for (const b of view.container.querySelectorAll<HTMLButtonElement>("button")) {
      expect(b.style.minHeight, b.textContent ?? "").toBe("56px");
    }
    await view.unmount();
  });

  it("has no default vehicle: without one it says so and cannot send", async () => {
    const { hab, sent } = client();
    const view = await mount(ui({ client: hab, initialTask: "RETURN" }));
    expect(view.container.textContent).not.toContain("UR1");
    expect(view.container.textContent).toContain("No utility rover selected");
    expect(confirm(view.container).disabled).toBe(true);
    expect(confirm(view.container).getAttribute("aria-describedby")).toBeTruthy();
    await click(confirm(view.container));
    expect(sent).toEqual([]);
    await view.unmount();
  });

  it("names the vehicle it was given and no other", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR2" }));
    expect(view.container.textContent).toContain("UR2");
    expect(view.container.textContent).not.toContain("UR1");
    await view.unmount();
  });

  it("needs a target for SCOUT: Confirm is disabled with the reason, and picking on the map asks the map module", async () => {
    const { hab } = client();
    const onStartMapPlacement = vi.fn();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", onStartMapPlacement }));
    expect(confirm(view.container).disabled).toBe(true);
    expect(view.container.textContent).toContain("Pick a target on the map");
    await click(button(view.container, "Pick on map"));
    expect(onStartMapPlacement).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("Tap the map to place the target");
    await view.unmount();
  });

  it("moves from placing to confirm when the map module passes the picked target", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", onStartMapPlacement: () => {} }));
    await click(button(view.container, "Pick on map"));
    await view.rerender(ui({ client: hab, vehicleId: "UR1", onStartMapPlacement: () => {}, selectedTarget: { x_m: 2100.4, y_m: -1400 } }));
    expect(view.container.textContent).not.toContain("Tap the map to place the target");
    expect(confirm(view.container).disabled).toBe(false);
    const target = field(view.container, "target");
    expect(target.textContent).toContain("2100");
    expect(target.textContent).toContain("-1400");
    await view.unmount();
  });

  it("labels a target the operator picked assumed, with the pick as its source, not modelled", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", selectedTarget: { x_m: 5, y_m: 6 } }));
    const target = field(view.container, "target");
    expect(target.getAttribute("data-provenance")).toBe("assumed");
    expect(target.getAttribute("data-source")).toBe("ui:map-pick");
    expect(view.container.innerHTML).not.toContain("mars-eqc");
    await view.unmount();
  });

  it("states the unit, and that the position is on the Mars working projection in metres", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", selectedTarget: { x_m: 5, y_m: 6 } }));
    expect(field(view.container, "target").textContent).toContain("m");
    await view.unmount();
  });
});

describe("SCR-15 RELAY: the suggested ridge (03 §C.7: Task rover, Relay, accept, confirm)", () => {
  const suggestion = { x_m: 1650, y_m: 2350, name: "Ridge crest alpha", prov: "derived" as const, src: "viewshed:relay-ridge" };

  it("shows the suggestion with the provenance and source of whoever computed it", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", initialTask: "RELAY", suggestedRelayTarget: suggestion }));
    const box = field(view.container, "suggestion");
    expect(box.textContent).toContain("Ridge crest alpha");
    expect(box.textContent).toContain("1650");
    expect(box.textContent).toContain("2350");
    expect(box.getAttribute("data-provenance")).toBe("derived");
    expect(box.getAttribute("data-source")).toBe("viewshed:relay-ridge");
    await view.unmount();
  });

  it("sends a RELAY with the accepted suggestion in two taps and Confirm, with no item", async () => {
    const { hab, sent } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", suggestedRelayTarget: suggestion }));
    await click(tile(view.container, "RELAY")); // tap 1
    await click(button(view.container, "Use this suggestion")); // tap 2
    expect(field(view.container, "target").getAttribute("data-provenance")).toBe("derived");
    await click(confirm(view.container)); // confirm
    expect(sent).toEqual([{ kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "RELAY", target: { x_m: 1650, y_m: 2350 } } }]);
    expect("item" in sent[0]!.args).toBe(false);
    await view.unmount();
  });

  it("does not offer a suggestion for the other tasks", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", suggestedRelayTarget: suggestion }));
    expect(view.container.querySelector('[data-field="suggestion"]')).toBeNull();
    await click(tile(view.container, "RELAY"));
    expect(view.container.querySelector('[data-field="suggestion"]')).not.toBeNull();
    await click(tile(view.container, "SCOUT"));
    expect(view.container.querySelector('[data-field="suggestion"]')).toBeNull();
    await view.unmount();
  });
});

describe("SCR-15 the TASK_ROVER command (02 §E.4, §E.6; protocol TaskRoverArgs)", () => {
  it("RETURN needs no target and sends none", async () => {
    const { hab, sent } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", initialTask: "RETURN" }));
    expect(view.container.textContent).toContain("Return to the hab");
    await click(confirm(view.container));
    expect(sent).toEqual([{ kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "RETURN" } }]);
    await view.unmount();
  });

  it("SCOUT sends the picked target in working-projection metres", async () => {
    const { hab, sent } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", selectedTarget: { x_m: 2100.5, y_m: -1400 } }));
    await click(confirm(view.container));
    expect(sent).toEqual([{ kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "SCOUT", target: { x_m: 2100.5, y_m: -1400 } } }]);
    await view.unmount();
  });

  it("CARRY sends a trimmed item label, and leaves `item` out when the label is blank", async () => {
    const withItem = client();
    const a = await mount(ui({ client: withItem.hab, vehicleId: "UR1", initialTask: "CARRY", selectedTarget: { x_m: 1, y_m: 2 } }));
    const input = must<HTMLInputElement>(a.container, "input[type=text]");
    expect(input.getAttribute("aria-label") ?? a.container.querySelector(`label[for="${input.id}"]`)?.textContent).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "  Core sample container ");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await click(confirm(a.container));
    expect(withItem.sent[0]!.args).toEqual({ vehicle_id: "UR1", task: "CARRY", target: { x_m: 1, y_m: 2 }, item: "Core sample container" });
    await a.unmount();

    const blank = client();
    const b = await mount(ui({ client: blank.hab, vehicleId: "UR1", initialTask: "CARRY", selectedTarget: { x_m: 1, y_m: 2 } }));
    await click(confirm(b.container));
    expect("item" in blank.sent[0]!.args).toBe(false);
    await b.unmount();
  });

  it("shows no item field for the other tasks", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1" }));
    expect(view.container.querySelector("input[type=text]")).toBeNull();
    await click(tile(view.container, "CARRY"));
    expect(view.container.querySelector("input[type=text]")).not.toBeNull();
    await view.unmount();
  });
});

describe("SCR-15 outcome: what the Hab Core answers (COMMAND_RESULT)", () => {
  it("shows Sending… and disables Confirm until the Hab Core answers, then QUEUED with shape and word", async () => {
    let release!: (r: CommandResult) => void;
    const pending = new Promise<CommandResult>((resolve) => (release = resolve));
    const { hab, sent } = client(() => pending);
    const view = await mount(ui({ client: hab, vehicleId: "UR1", initialTask: "RETURN" }));
    await click(confirm(view.container));
    expect(view.container.textContent).toContain("Sending");
    expect(view.container.textContent).not.toContain("QUEUED");
    expect(sent).toHaveLength(1);
    await act(async () => release(accepted()));
    const status = must(view.container, "[data-state='queued']");
    expect(status.textContent).toContain("QUEUED");
    expect(status.querySelector(".status-glyph")).not.toBeNull();
    await view.unmount();
  });

  it("does not claim success for a rejection: FAILED with the code and the Hab Core's reason, and Retry keeps the selection", async () => {
    const { hab } = client(() => rejected("NO_RENDEZVOUS", "No route to the target"));
    const view = await mount(ui({ client: hab, vehicleId: "UR1", selectedTarget: { x_m: 7, y_m: 8 } }));
    await click(confirm(view.container));
    const failed = must(view.container, "[data-state='failed']");
    expect(failed.textContent).toContain("FAILED");
    expect(failed.textContent).toContain("NO_RENDEZVOUS");
    expect(failed.textContent).toContain("No route to the target");
    expect(failed.getAttribute("data-reject-code")).toBe("NO_RENDEZVOUS");
    expect(view.container.textContent).not.toContain("QUEUED");
    await click(button(view.container, "Retry"));
    expect(view.container.querySelector("[data-state='failed']")).toBeNull();
    expect(field(view.container, "target").textContent).toContain("7");
    await view.unmount();
  });

  it("words every reject code as what to do next", async () => {
    for (const code of ["FORBIDDEN_ROLE", "NO_LINK", "INVALID", "NO_RENDEZVOUS", "BUSY"] as const) {
      const { hab } = client(() => rejected(code, "server says no"));
      const view = await mount(ui({ client: hab, vehicleId: "UR1", initialTask: "RETURN" }));
      await click(confirm(view.container));
      const hint = must(view.container, "[data-state='failed'] [data-field='hint']");
      expect(hint.textContent!.length, code).toBeGreaterThan(10);
      expect(view.container.textContent).toContain("server says no");
      await view.unmount();
    }
  });

  it("is a failure, with the reason, when there is no Hab Core connection", async () => {
    const view = await mount(ui({ client: null, vehicleId: "UR1", initialTask: "RETURN" }));
    await click(confirm(view.container));
    const failed = must(view.container, "[data-state='failed']");
    expect(failed.textContent).toContain("No Hab Core connection");
    await view.unmount();
  });

  it("follows the vehicle in the snapshot: QUEUED, then EN ROUTE with the ETA the snapshot reports, then DONE", async () => {
    const c = client();
    const view = await mount(ui({ client: c.hab, vehicleId: "UR1", initialTask: "RETURN" }));
    await click(confirm(view.container));
    expect(view.container.textContent).toContain("QUEUED");
    // The task is not in the snapshot yet: never DONE before it was seen running.
    await c.setVehicles([ur({ task: null, state: "PARKED" })]);
    expect(view.container.textContent).toContain("QUEUED");
    expect(view.container.textContent).not.toContain("DONE");

    await c.setVehicles([ur({ state: "RETURNING", task: { kind: "RETURN", target: { x_m: 0, y_m: 0 } }, eta_s: 180 })]);
    const enRoute = must(view.container, "[data-state='enroute']");
    expect(enRoute.textContent).toContain("EN ROUTE");
    const eta = field(view.container, "eta");
    expect(eta.textContent).toBe("3:00");
    expect(eta.getAttribute("data-provenance")).toBe("simulated");
    expect(eta.getAttribute("data-source")).toBe("snapshot:vehicles.eta_s");

    await c.setVehicles([ur({ state: "PARKED", task: null })]);
    expect(must(view.container, "[data-state='done']").textContent).toContain("DONE");
    await view.unmount();
  });

  it("offers another task after a result", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", initialTask: "RETURN" }));
    await click(confirm(view.container));
    await click(button(view.container, "Task another"));
    expect(view.container.querySelector("[data-state='queued']")).toBeNull();
    expect(view.container.querySelectorAll("[data-task]")).toHaveLength(4);
    await view.unmount();
  });
});

describe("SCR-15 ETA and battery after the task (03 SCR-15 content)", () => {
  it("shows the dash with an unavailable source: no preview estimate exists, none is invented", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", initialTask: "RETURN" }));
    for (const name of ["eta", "battery-after"]) {
      const el = field(view.container, name);
      expect(el.textContent).toBe("—");
      expect(el.getAttribute("data-unavailable")).toBe("true");
      expect(el.getAttribute("data-source")).toMatch(/^unavailable:/);
    }
    await view.unmount();
  });
});

describe("SCR-15 close and focus", () => {
  it("calls onClose from a labelled close button", async () => {
    const { hab } = client();
    const onClose = vi.fn();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", onClose }));
    await click(must(view.container, "[aria-label='Close rover tasking']"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("uses no raw hex colour and no brand orange (OPS mode, 04 §A.3 #1)", async () => {
    const { hab } = client();
    const view = await mount(ui({ client: hab, vehicleId: "UR1", selectedTarget: { x_m: 1, y_m: 2 } }));
    expect(view.container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(view.container.innerHTML).not.toMatch(/--signal|--accent-text/);
    await view.unmount();
  });
});

describe("package 21: SCR-15 outcome by task id, and the SCR-11 entry (FR-41; BD-102; FD-051, FD-168)", () => {
  const okAt = (event_seq: number): CommandResult => ({ ...(accepted() as Extract<CommandResult, { ok: true }>), event_seq });

  it("queued only on ok", async () => {
    for (const [answer, queued] of [[() => okAt(57), true], [() => rejected("BUSY", "rover busy"), false], [() => rejected("INVALID", "battery would run out"), false]] as const) {
      const { hab } = client(answer);
      const view = await mount(ui({ client: hab, vehicleId: "UR1", initialTask: "RETURN" }));
      await click(confirm(view.container));
      expect(view.container.querySelector("[data-state='queued']") !== null).toBe(queued);
      expect(view.container.querySelector("[data-state='failed']") !== null).toBe(!queued);
      expect(view.container.textContent!.includes("QUEUED")).toBe(queued);
      await view.unmount();
    }
  });

  it("follows its own task id rt-<event_seq>: QUEUED while in Vehicle.queue, EN ROUTE as the head, DONE once gone", async () => {
    const c = client(() => okAt(57));
    const view = await mount(ui({ client: c.hab, vehicleId: "UR1", initialTask: "RETURN" }));
    await click(confirm(view.container));
    // Another task runs; ours waits in the queue with the Hab Core's modelled ETA.
    await c.setVehicles([ur({ state: "EN_ROUTE", task: { kind: "SCOUT", target: { x_m: 5, y_m: 5 } }, task_id: "rt-50", eta_s: 60, queue: [{ task_id: "rt-57", kind: "RETURN", target: null, eta_s: 400, battery_wh_after: 610 }] })]);
    expect(must(view.container, "[data-state='queued']").textContent).toContain("QUEUED");
    const eta = field(view.container, "eta");
    expect(eta.textContent).toBe("6:40");
    expect(eta.getAttribute("data-provenance")).toBe("modelled");
    expect(eta.getAttribute("data-source")).toBe("snapshot:vehicles.queue.eta_s");
    const after = field(view.container, "battery-after");
    expect(after.textContent).toBe("610 Wh");
    expect(after.getAttribute("data-provenance")).toBe("modelled");
    // A different task of the same kind running is not ours.
    await c.setVehicles([ur({ state: "RETURNING", task: { kind: "RETURN", target: { x_m: 0, y_m: 0 } }, task_id: "rt-50", queue: [{ task_id: "rt-57", kind: "RETURN", target: null, eta_s: 400, battery_wh_after: 610 }] })]);
    expect(view.container.querySelector("[data-state='enroute']")).toBeNull();
    await c.setVehicles([ur({ state: "RETURNING", task: { kind: "RETURN", target: { x_m: 0, y_m: 0 } }, task_id: "rt-57", eta_s: 120, queue: [] })]);
    expect(must(view.container, "[data-state='enroute']").textContent).toContain("EN ROUTE");
    expect(field(view.container, "eta").textContent).toBe("2:00");
    await c.setVehicles([ur({ state: "PARKED", task: null, task_id: null, queue: [] })]);
    expect(must(view.container, "[data-state='done']").textContent).toContain("DONE");
    await view.unmount();
  });

  it("entry from vehicle card", async () => {
    const c = client(() => okAt(60), [ur({ queue: [] }), { ...ur(), vehicle_id: "PR1", kind: "pressurized_rover", battery_wh: null }]);
    const snapshot = c.hab.state()!;
    const view = await mount(createElement(OpsConsole, { client: c.hab, snapshot, vehicles: snapshot.vehicles }));
    // Only the utility rover can be tasked (SUMMON is the pressurized rover's, FR-39).
    expect(view.container.querySelector("[aria-label='Task rover PR1']")).toBeNull();
    const cards = [...view.container.querySelectorAll(".vehicle-card")];
    expect(cards[0]!.querySelector("[data-field='queued']")!.textContent).toBe("No queued tasks");
    await click(must(view.container, "[aria-label='Task rover UR1']"));
    const dialog = must(view.container, "[data-screen='SCR-15']");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.textContent).toContain("UR1 /// ROVER TASKING");
    // Picking a target hands the map column to the pick.
    await click(button(dialog, "Pick on map"));
    expect(must(view.container, ".ops-map-slot").getAttribute("data-picking")).toBe("true");
    await click(button(dialog, "Cancel"));
    await click(tile(dialog, "RETURN"));
    await click(confirm(dialog));
    expect(c.sent).toEqual([{ kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "RETURN" } }]);
    expect(must(dialog, "[data-state='queued']").textContent).toContain("QUEUED");
    await click(must(dialog, "[aria-label='Close rover tasking']"));
    expect(view.container.querySelector("[data-screen='SCR-15']")).toBeNull();
    await view.unmount();
  });
});
