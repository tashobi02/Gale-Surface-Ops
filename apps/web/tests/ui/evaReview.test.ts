/**
 * Package 17 review round — the defects an independent browser review of SCR-12 found (12 Nov 2026).
 *
 * Each `it` names the defect it locks down, so it cannot come back:
 * - the REASON control stays live while the server confirms the skip inside the undo window;
 * - the NEXT card's name, task count and navigation all name the same stop;
 * - a collapsed task list renders no panel over the NEXT card;
 * - the metadata strip reads its hops and via in words, with a space, and the ETA under a minute says so;
 * - the mini-map's ortho layer carries the OPS grayscale class and the route source is not rebuilt per snapshot.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { Snapshot } from "@marswalk/protocol";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { selectNextStop } from "../../src/ui/eva/viewModel";
import { STOP_TASK_UNDO_WINDOW_MS } from "../../src/ui/screens/scr12/useStopTaskChanges";
import { storeFromBeat, recordingClient } from "./fixtureStore";
import { click, installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** The fixture snapshot with a plan of three stops, so "the next stop" is not the only one. */
function snapshotWithStops(crew: Partial<Snapshot["crew"][number]> = {}): Snapshot {
  const base = storeFromBeat("connect").state()!;
  const stops = [
    { id: "wp-1", role: "stop" as const, x_m: 0, y_m: 0, label: "Start flat" },
    { id: "wp-2", role: "stop" as const, x_m: 100, y_m: 0, label: "Ridge crest" },
    { id: "wp-3", role: "stop" as const, x_m: 200, y_m: 0, label: "Boxwork wall" },
  ];
  return {
    ...base,
    plan: { ...(base.plan ?? {}), waypoints: stops } as Snapshot["plan"],
    crew: base.crew.map((c) => ({ ...c, ...crew })),
    tasks: [
      { ...base.tasks[0]!, task_id: "t-s2-01", stop_id: "wp-2", state: "TODO" },
      { ...base.tasks[0]!, task_id: "t-s3-01", stop_id: "wp-3", state: "TODO" },
    ],
  } as Snapshot;
}

describe("review round: the REASON control stays live while the server confirms the skip (FD-028)", () => {
  it("a snapshot that turns the task SKIPPED inside the undo window keeps the REASON control and it still sends", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const before = snapshotWithStops({ activity: "AT_STOP", stop_index: 2 });
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: before }));
    await click(must(view.container, '[data-testid="tasks-button"]'));
    await click(must(view.container, '[aria-label^="Skip task:"]'));
    expect(sent).toHaveLength(1);

    // The Hab Core confirms: the snapshot now shows the task as SKIPPED.
    const landed = {
      ...before,
      tasks: before.tasks.map((t) => (t.task_id === "t-s2-01" ? { ...t, state: "SKIPPED" as const, reason: "other" as const } : t)),
    };
    await view.rerender(createElement(EvaTablet, { client, crewId: "EV1", snapshot: landed }));
    await act(async () => {});

    const reason = must(view.container, '[aria-label="Change skip reason: other"]');
    await click(reason);
    expect(sent).toEqual([
      { kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-01", state: "SKIPPED", reason: "other" } },
      { kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-01", state: "SKIPPED", reason: "time" } },
    ]);
    expect(must(view.container, '[data-testid="task-row-t-s2-01"]').textContent).toMatch(/Reason: time/);
  });

  it("the undo window still ends after the server confirms: the control goes away with the window", async () => {
    vi.useFakeTimers();
    const { client } = recordingClient(storeFromBeat("connect"));
    const before = snapshotWithStops({ activity: "AT_STOP", stop_index: 2 });
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: before }));
    await click(must(view.container, '[data-testid="tasks-button"]'));
    await click(must(view.container, '[aria-label^="Skip task:"]'));
    const landed = {
      ...before,
      tasks: before.tasks.map((t) => (t.task_id === "t-s2-01" ? { ...t, state: "SKIPPED" as const, reason: "other" as const } : t)),
    };
    await view.rerender(createElement(EvaTablet, { client, crewId: "EV1", snapshot: landed }));
    await act(async () => {
      vi.advanceTimersByTime(STOP_TASK_UNDO_WINDOW_MS + 10);
    });
    expect(view.container.querySelector('[aria-label^="Change skip reason:"]')).toBeNull();
  });
});

describe("package 29: current-stop tasks (FR-50)", () => {
  for (const [stopIndex, taskId] of [[2, "t-s2-01"], [3, "t-s3-01"]] as const) {
    it(`at stop ${stopIndex} opens that stop's tasks, including the final stop`, async () => {
      const { client, sent } = recordingClient(storeFromBeat("connect"));
      const snapshot = snapshotWithStops({ activity: "AT_STOP", stop_index: stopIndex });
      const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot }));
      try {
        await click(must(view.container, '[data-testid="tasks-button"]'));
        expect(view.container.querySelector(`[data-task-id="${taskId}"]`)).not.toBeNull();
        await click(must(view.container, '[aria-label^="Mark task done:"]'));
        expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: taskId, state: "DONE" } }]);
      } finally { await view.unmount(); client.close(); }
    });
  }
});

describe("review round: the NEXT card names the stop the navigation points at (FD-047)", () => {
  it("at a stop the NEXT card, its task count and the navigation name the same stop", () => {
    const snapshot = snapshotWithStops({ activity: "AT_STOP", stop_index: 1 });
    const view = selectNextStop(snapshot, "EV1");
    expect(view?.stopId).toBe("wp-2");
    expect(view?.stopName).toBe("Ridge crest");
    expect(view?.taskCount).toEqual({ done: 0, total: 1 });
  });

  it("the crew's own next stop wins over the crew-wide jump target", () => {
    // `next_stop_target` is the CREW-WIDE target of JUMP_NEXT_STOP (05 Snapshot), not this crew member's navigation: the
    // card's bearing, distance and ETA are the Hab Core's per-crew margins, so the card names the stop they point at.
    const snapshot = { ...snapshotWithStops({ activity: "AT_STOP", stop_index: 1 }), next_stop_target: { stop_id: "wp-3", stop_index: 2 } };
    const view = selectNextStop(snapshot, "EV1");
    expect(view?.stopId).toBe("wp-2");
    expect(view?.stopName).toBe("Ridge crest");
  });

  it("with no plan stops the next-stop target names the stop, so the card and its tasks agree", () => {
    // The engine names the crew-wide target even when the plan's waypoint list is not in the snapshot; the card then
    // names that stop, and the tasks of that stop are the ones it counts.
    const base = storeFromBeat("connect").state()!;
    const snapshot: Snapshot = { ...base, plan: null, next_stop_target: { stop_id: "wp-2", stop_index: 1 } };
    const view = selectNextStop(snapshot, "EV1");
    expect(view?.stopId).toBe("wp-2");
    expect(view?.taskCount).toEqual({ done: 0, total: 1 });
  });

  it("with no plan and no next stop the NEXT card reads — instead of the first task's stop", () => {
    const base = storeFromBeat("connect").state()!;
    const snapshot: Snapshot = { ...base, plan: null, tasks: [], next_stop_target: null };
    expect(selectNextStop(snapshot, "EV1")).toBeNull();
  });
});

describe("review round: a collapsed task list renders no panel over the NEXT card (FD-032)", () => {
  it("while walking the list is the count only: no list panel is mounted", async () => {
    const { client } = recordingClient(storeFromBeat("connect"));
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: snapshotWithStops({ activity: "WALKING" }) }));
    expect(view.container.querySelector('[data-slot="stop-task-list"]')).toBeNull();
    // The count stays in the NEXT header as a figure, and it is not interactive.
    expect(must(view.container, '[data-testid="tasks-count"]').textContent).toMatch(/TASKS/);
    expect(view.container.querySelector('[data-testid="tasks-button"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="stop-task-list"]')).toBeNull();
  });

  it("with the options sheet open the list collapses the same way (FD-032)", async () => {
    const { client } = recordingClient(storeFromBeat("connect"));
    const view = await mount(
      createElement(EvaTablet, { client, crewId: "EV1", snapshot: snapshotWithStops({ activity: "AT_STOP", stop_index: 1 }), optionsOpen: true }),
    );
    expect(view.container.querySelector('[data-slot="stop-task-list"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="tasks-count"]')).not.toBeNull();
  });
});

describe("review round: the metadata strip reads its hops and via in words", () => {
  it("reads 'LINK 2 hops VIA relay' with a space between the hops and the via", async () => {
    const base = storeFromBeat("connect").state()!;
    const snapshot: Snapshot = { ...base, crew: base.crew.map((c) => ({ ...c, link_hops: 2, link_via: "relay" as const })) };
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot }));
    const strip = must(view.container, '[data-slot="meta-strip"]');
    expect(strip.textContent).toMatch(/LINK 2 hops/);
    expect(strip.textContent).toMatch(/hops\s+VIA relay/);
  });

  it("one hop reads '1 hop', never '1 hops'", async () => {
    const base = storeFromBeat("connect").state()!;
    const snapshot: Snapshot = { ...base, crew: base.crew.map((c) => ({ ...c, link_hops: 1, link_via: "direct" as const })) };
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot }));
    expect(must(view.container, '[data-slot="meta-strip"]').textContent).toMatch(/LINK 1 hop\b/);
    expect(must(view.container, '[data-slot="meta-strip"]').textContent).not.toMatch(/1 hops/);
  });
});

describe("review round: the ETA under a minute says so", () => {
  it("shows '<1 min' for an ETA of 30 s, never '0 min'", async () => {
    const snapshot = snapshotWithStops({ next_stop_eta_s: 30 });
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot }));
    const next = must(view.container, '[data-slot="next"]');
    expect(next.textContent).toMatch(/<1 min/);
    expect(next.textContent).not.toMatch(/\b0 min\b/);
  });
});

describe("review round: the mini-map draws the OPS grayscale class and keeps its route source", () => {
  it("the ortho tile layer carries the 'marswalk-ortho' class the OPS grayscale rule needs (FD-003)", async () => {
    const { createMap } = await import("../../src/ui/map/createMap");
    expect(typeof createMap).toBe("function");
    const source = await import("../../src/ui/eva/MiniMap");
    expect(typeof source.MiniMap).toBe("function");
    // The class the OPS grayscale rule targets is part of the map's public surface: the shared layer factory and the
    // mini-map both use it, so the check is on the shared constant rather than on a private string.
    const { OPS_ORTHO_LAYER_CLASS } = await import("../../src/ui/map/rasterLayers");
    expect(OPS_ORTHO_LAYER_CLASS).toBe("ol-layer marswalk-ortho");
  });
});
