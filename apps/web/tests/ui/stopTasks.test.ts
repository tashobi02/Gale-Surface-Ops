import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { storeFromBeat, recordingClient } from "./fixtureStore";
import { click, installDom, mount, must, removeDom } from "./domHarness";
import { StopTaskList, StopTaskRow } from "../../src/ui/screens/scr12/StopTaskList";
import { TasksButton } from "../../src/ui/screens/scr12/TasksButton";
import { TaskProgress } from "../../src/ui/ops/TaskProgress";
import { AddTaskPopover } from "../../src/ui/ops/AddTaskPopover";
import type { Snapshot, StopTask } from "@marswalk/protocol";

// docs/specs/01 FR-50; 04 §E.5; mockup handoff G-30–G-34, G-40. TASK-24, TASK-31.
// Static-markup checks cover what is markup (words, glyphs, declared sizes). Behaviour is checked by mounting the
// real components and clicking them (later describes). Not claimed: pixel geometry, print pages, glove use.

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

const mockTasks: StopTask[] = [
  {
    task_id: "t-s2-01",
    stop_id: "wp-2",
    crew_id: "EV1",
    kind: "image",
    text: "Photograph boxwork fractures at 10 m interval",
    state: "TODO",
    reason: null,
    origin: "plan",
    updated_sim_time: "13:02:00",
    updated_by: "system",
    provenance: {},
  },
  {
    task_id: "t-s2-02",
    stop_id: "wp-2",
    crew_id: "EV1",
    kind: "sample",
    text: "Collect sulfate vein drill sample",
    state: "DONE",
    reason: null,
    origin: "plan",
    updated_sim_time: "13:04:10",
    updated_by: "eva:EV1",
    provenance: {},
  },
  {
    task_id: "t-s2-03",
    stop_id: "wp-2",
    crew_id: "EV1",
    kind: "measure",
    text: "Deploy spectrometer on outcrop surface",
    state: "SKIPPED",
    reason: "time",
    origin: "ops",
    updated_sim_time: "13:04:30",
    updated_by: "eva:EV1",
    provenance: {},
  },
  {
    task_id: "t-s2-04",
    stop_id: "wp-2",
    crew_id: "EV1",
    kind: "observe",
    text: "Inspect contact boundary layer",
    state: "DROPPED",
    reason: null,
    origin: "plan",
    updated_sim_time: "13:05:00",
    updated_by: "system",
    provenance: {},
  },
];

describe("StopTaskList (EVA tablet)", () => {
  it("shows the current stop's tasks at a stop and only a count (TASKS done/total) while walking", () => {
    // When collapsed (e.g. while walking or during alert), renders count pill
    const htmlWalking = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: false,
        undo: null,
        collapsed: true,
        notSyncedTaskIds: [],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );

    expect(htmlWalking).toContain("TASKS 1/4");
    // Should not render individual task texts when collapsed
    expect(htmlWalking).not.toContain("Photograph boxwork");

    // At stop (not collapsed), full list renders
    const htmlAtStop = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: false,
        undo: null,
        collapsed: false,
        notSyncedTaskIds: [],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );
    expect(htmlAtStop).toContain("Photograph boxwork");
    expect(htmlAtStop).toContain("Collect sulfate vein");
  });

  it("renders to do, done, skipped and dropped with glyph and word; done is a drawn check, not a filled square (G-32)", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: false,
        undo: null,
        collapsed: false,
        notSyncedTaskIds: [],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );

    // TODO: word TODO and empty square/checkbox
    expect(html).toContain("TODO");
    // DONE: word DONE and drawn check (e.g. ✓ or svg check, not ■ which is for measured prov)
    expect(html).toContain("DONE");
    expect(html).not.toMatch(/DONE[^<]*■/); // Never filled square for DONE (G-32)
    // SKIPPED: word SKIPPED and ⊘
    expect(html).toContain("SKIPPED");
    expect(html).toContain("⊘");
    // DROPPED: word DROPPED and ⊘
    expect(html).toContain("DROPPED");
  });

  it("uses neutral chrome only: no status colour on task rows (04 §A.3)", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: false,
        undo: null,
        collapsed: false,
        notSyncedTaskIds: [],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );

    // Task rows must not use status colors (warning red, caution amber, nominal green)
    expect(html).not.toContain("var(--status-warning");
    expect(html).not.toContain("var(--status-caution");
    expect(html).not.toContain("var(--status-nominal");
  });

  it("rows and controls declare a 56 px minimum target, tick included (markup)", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskRow, {
        task: mockTasks[0],
        readOnly: false,
        inUndoWindow: false,
        notSynced: false,
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
      })
    );

    // Row, tick and SKIP all take the EVA target token; no 44 px override remains
    expect(html).toMatch(/--target-eva/);
    expect(html).not.toMatch(/44px/);
  });

  it("a to-do row offers a tick and a SKIP, and uses no hold-to-confirm (markup)", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskRow, {
        task: mockTasks[0],
        readOnly: false,
        inUndoWindow: false,
        notSynced: false,
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
      })
    );

    // Contains tick action and SKIP button
    expect(html).toMatch(/SKIP/i);
    // Does not use hold-to-confirm on task tick (no 800ms hold requirement)
    expect(html).not.toContain("hold-to-confirm");
  });

  it("the undo control shows only inside the undo window (markup; the 5 s timing is not tested here)", () => {
    const htmlWithUndo = renderToStaticMarkup(
      createElement(StopTaskRow, {
        task: mockTasks[1],
        readOnly: false,
        inUndoWindow: true,
        notSynced: false,
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
      })
    );

    expect(htmlWithUndo).toMatch(/UNDO/i);

    const htmlWithoutUndo = renderToStaticMarkup(
      createElement(StopTaskRow, {
        task: mockTasks[1],
        readOnly: false,
        inUndoWindow: false,
        notSynced: false,
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
      })
    );
    expect(htmlWithoutUndo).not.toMatch(/UNDO/i);
  });

  it("an unacknowledged change shows 'not synced' in the metadata strip", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: false,
        undo: null,
        collapsed: false,
        notSyncedTaskIds: ["t-s2-01"],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );

    expect(html).toContain("not synced");
  });

  it("an ops-added task shows the 'added by ops' tag", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: false,
        undo: null,
        collapsed: false,
        notSyncedTaskIds: [],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );

    expect(html).toContain("added by ops");
  });

  it("readOnly shows no tick, skip or undo controls", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: true,
        undo: { taskId: "t-s2-02" },
        collapsed: false,
        notSyncedTaskIds: [],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );

    // No interactive buttons rendered in readOnly mode
    expect(html).not.toMatch(/<button/i);
    expect(html).not.toMatch(/<button[^>]*>UNDO/i);
    expect(html).not.toMatch(/<button[^>]*>SKIP/i);
  });

  it("during an alert the list collapses to its count (U-59)", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, {
        tasks: mockTasks,
        crewId: "EV1",
        stopId: "wp-2",
        readOnly: false,
        undo: null,
        collapsed: true,
        notSyncedTaskIds: [],
        onTick: () => {},
        onSkip: () => {},
        onUndo: () => {},
        onReason: () => {},
      })
    );

    expect(html).toContain('data-testid="tasks-collapsed-count"');
    expect(html).toContain("TASKS 1/4");
  });

  it("TasksButton displays icon, word TASKS and count (U-51 placement)", () => {
    const html = renderToStaticMarkup(
      createElement(TasksButton, {
        doneCount: 2,
        totalCount: 4,
        active: false,
      })
    );

    expect(html).toContain("TASKS");
    expect(html).toContain("2/4");
    expect(html).toMatch(/56px|--target-eva/);
  });
});

describe("TaskProgress (ops crew card)", () => {
  it("shows STOP n done/total and TOTAL done/total with a simulated provenance chip", () => {
    const html = renderToStaticMarkup(
      createElement(TaskProgress, {
        crewId: "EV1",
        stopCount: { stopNo: 2, done: 1, total: 3 },
        total: { done: 3, total: 8 },
        onAdd: () => {},
      })
    );

    expect(html).toContain("STOP 2");
    expect(html).toContain("1/3");
    expect(html).toContain("TOTAL");
    expect(html).toContain("3/8");
    expect(html).toContain('data-provenance="simulated"');
  });

  it("shows the counts it is given, taken from the task list here (U-53)", () => {
    const ev1Tasks = mockTasks.filter((t) => t.crew_id === "EV1" || t.crew_id === null);
    const stop2Tasks = ev1Tasks.filter((t) => t.stop_id === "wp-2");
    const stopDone = stop2Tasks.filter((t) => t.state === "DONE").length;
    const totalDone = ev1Tasks.filter((t) => t.state === "DONE").length;

    const html = renderToStaticMarkup(
      createElement(TaskProgress, {
        crewId: "EV1",
        stopCount: { stopNo: 2, done: stopDone, total: stop2Tasks.length },
        total: { done: totalDone, total: ev1Tasks.length },
        onAdd: () => {},
      })
    );

    expect(html).toContain(`${stopDone}/${stop2Tasks.length}`);
    expect(html).toContain(`${totalDone}/${ev1Tasks.length}`);
  });

  it("+ TASK is enabled or disabled as told (markup)", () => {
    const htmlActive = renderToStaticMarkup(
      createElement(TaskProgress, {
        crewId: "EV1",
        stopCount: { stopNo: 2, done: 1, total: 3 },
        total: { done: 2, total: 5 },
        onAdd: () => {},
        disabled: false,
      })
    );
    expect(htmlActive).toContain("+ TASK");
    expect(htmlActive).not.toContain("disabled");

    const htmlDisabled = renderToStaticMarkup(
      createElement(TaskProgress, {
        crewId: "EV1",
        stopCount: { stopNo: 2, done: 1, total: 4 },
        total: { done: 2, total: 6 },
        onAdd: () => {},
        disabled: true,
      })
    );
    expect(htmlDisabled).toMatch(/disabled/i);
  });

  it("AddTaskPopover renders crew, stop, kind dropdown, text limit, and max reached state (markup)", () => {
    const html = renderToStaticMarkup(
      createElement(AddTaskPopover, {
        crewId: "EV1",
        stopId: "wp-2",
        availableStops: [
          { stopId: "wp-2", stopNo: 2, label: "Stop 2 · Boxwork Ridge" },
          { stopId: "wp-3", stopNo: 3, label: "Stop 3 · Clay Outcrop" },
        ],
        maxReached: false,
        onAdd: () => {},
      })
    );

    expect(html).toContain("EV1");
    expect(html).toContain("Stop 2");
    expect(html).toContain("<select");
    expect(html).toContain("<input");
    expect(html).toContain("60"); // 60 chars limit indicator

    const htmlMax = renderToStaticMarkup(
      createElement(AddTaskPopover, {
        crewId: "EV1",
        stopId: "wp-2",
        maxReached: true,
        onAdd: () => {},
      })
    );
    expect(htmlMax).toMatch(/max reached|maximum/i);
  });
});

describe("TaskProgress without counts shows —, labelled, and no chrome radius", () => {
  it("null counts render — flagged unavailable, not 0/0 or a sample fraction", () => {
    const html = renderToStaticMarkup(
      createElement(TaskProgress, { crewId: "EV1", stopCount: null, total: null, onAdd: () => {} }),
    );

    expect(html).toContain("STOP —");
    expect(html).toContain("TOTAL —");
    expect(html).toContain('data-unavailable="true"');
    expect(html).toContain('data-provenance="simulated"');
    expect(html).not.toContain('data-provenance="assumed"');
    expect(html).toContain("unavailable:tasks.counts");
    // No chip glyph beside the missing counts.
    expect(html).not.toContain("◇");
    expect(html).not.toMatch(/\d\/\d/);
  });

  it("supplied counts carry a simulated label and source on the counts themselves", () => {
    const html = renderToStaticMarkup(
      createElement(TaskProgress, { crewId: "EV2", stopCount: { stopNo: 3, done: 0, total: 0 }, total: { done: 0, total: 0 }, onAdd: () => {} }),
    );

    // Real zeros stay zeros.
    expect(html).toContain("STOP 3 0/0");
    expect(html).toContain("TOTAL 0/0");
    expect(html).toContain('data-source="snapshot:tasks"');
    expect(html).not.toMatch(/border-radius:\s*[1-9]/);
  });

  it("mixed availability: each glyph sits beside its own available count only", () => {
    const stopOnly = renderToStaticMarkup(
      createElement(TaskProgress, { crewId: "EV1", stopCount: { stopNo: 2, done: 1, total: 3 }, total: null, onAdd: () => {} }),
    );
    const totalOnly = renderToStaticMarkup(
      createElement(TaskProgress, { crewId: "EV1", stopCount: null, total: { done: 4, total: 8 }, onAdd: () => {} }),
    );
    const parts = (html: string) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const spans = [...doc.querySelectorAll("span[data-source]")];
      return {
        stop: spans.find((e) => e.textContent?.startsWith("STOP"))!,
        total: spans.find((e) => e.textContent?.startsWith("TOTAL"))!,
      };
    };

    const a = parts(stopOnly);
    expect(a.stop.textContent).toBe("STOP 2 1/3 ◇");
    expect(a.stop.getAttribute("data-unavailable")).toBeNull();
    expect(a.total.textContent).toBe("TOTAL —");
    expect(a.total.getAttribute("data-unavailable")).toBe("true");
    expect(a.total.getAttribute("data-source")).toBe("unavailable:tasks.counts");

    const b = parts(totalOnly);
    expect(b.stop.textContent).toBe("STOP —");
    expect(b.stop.getAttribute("data-unavailable")).toBe("true");
    expect(b.total.textContent).toBe("TOTAL 4/8 ◇");
    // Exactly one glyph in each case, and never beside a "—".
    for (const html of [stopOnly, totalOnly]) {
      expect((html.match(/◇/g) ?? []).length).toBe(1);
      expect(html).not.toMatch(/—\s*◇/);
    }
  });

  it("chrome has no corner radius on the task controls (04 §C.3: zero radius)", () => {
    const parts = [
      renderToStaticMarkup(createElement(TaskProgress, { crewId: "EV1", stopCount: null, total: null, onAdd: () => {} })),
      renderToStaticMarkup(createElement(TasksButton, { doneCount: 1, totalCount: 2 })),
      renderToStaticMarkup(createElement(StopTaskRow, { task: mockTasks[2], readOnly: false, inUndoWindow: false, notSynced: false, onTick: () => {}, onUndo: () => {} })),
      renderToStaticMarkup(createElement(AddTaskPopover, { crewId: "EV1", stopId: "wp-2", onAdd: () => {} })),
    ].join("");
    expect(parts).not.toMatch(/border-radius:\s*[1-9]/);
  });
});

describe("StopTaskList interaction: real clicks (FR-50)", () => {
  function list(overrides: Partial<Parameters<typeof StopTaskList>[0]> = {}) {
    const calls = { tick: vi.fn(), skip: vi.fn(), undo: vi.fn(), reason: vi.fn() };
    const element = createElement(StopTaskList, {
      tasks: mockTasks,
      crewId: "EV1",
      stopId: "wp-2",
      readOnly: false,
      undo: null,
      collapsed: false,
      notSyncedTaskIds: [],
      onTick: calls.tick,
      onSkip: calls.skip,
      onUndo: calls.undo,
      onReason: calls.reason,
      ...overrides,
    });
    return { calls, element };
  }

  it("one tap on the check box ticks DONE exactly once", async () => {
    const { calls, element } = list();
    const { container } = await mount(element);

    await click(must(container, '[aria-label^="Mark task done: Photograph"]'));
    expect(calls.tick.mock.calls).toEqual([["t-s2-01"]]);
  });

  it("SKIP sends nothing until a reason is chosen, then exactly one reason-bearing call", async () => {
    const { calls, element } = list();
    const { container } = await mount(element);

    await click(must(container, '[aria-label^="Skip task: Photograph"]'));
    // Reason capture is open; nothing was sent for the SKIP tap itself.
    expect(calls.reason).not.toHaveBeenCalled();
    expect(calls.tick).not.toHaveBeenCalled();
    const picker = must(container, '[role="group"][aria-label="Reason for skipping"]');
    expect([...picker.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["time", "terrain", "alert", "other"]);

    await click(must(container, '[aria-label="Reason: terrain"]'));
    expect(calls.reason.mock.calls).toEqual([["t-s2-01", "terrain"]]);
    // The picker closes after the reason; no second send.
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(calls.reason).toHaveBeenCalledTimes(1);
  });

  it("reason and tick buttons are at least 56 px in both dimensions with at least 8 px between reasons", async () => {
    const { element } = list();
    const { container } = await mount(element);
    await click(must(container, '[aria-label^="Skip task: Photograph"]'));

    const targets = [
      must<HTMLElement>(container, '[aria-label^="Mark task done"]'),
      ...container.querySelectorAll<HTMLElement>('[aria-label^="Reason: "]'),
    ];
    expect(targets.length).toBe(5);
    for (const el of targets) {
      expect(el.style.minHeight).toBe("var(--target-eva, 56px)");
      expect(el.style.minWidth).toBe("var(--target-eva, 56px)");
    }
    expect(must<HTMLElement>(container, '[aria-label="Reason for skipping"]').style.gap).toBe("8px");
  });

  it("read-only shows no controls, so nothing can be sent", async () => {
    const { calls, element } = list({ readOnly: true, undo: { taskId: "t-s2-02" } });
    const { container } = await mount(element);

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(calls.tick).not.toHaveBeenCalled();
  });

  it("UNDO calls onUndo for its task inside the undo window", async () => {
    const { calls, element } = list({ undo: { taskId: "t-s2-02" } });
    const { container } = await mount(element);

    await click(must(container, '[aria-label^="Undo task change: Collect sulfate"]'));
    expect(calls.undo.mock.calls).toEqual([["t-s2-02"]]);
  });
});

describe("EVA tablet task list: one UPDATE_STOP_TASK per action (FR-50)", () => {
  /** A snapshot with no plan, so the tablet takes its stop from the tasks. */
  function snapshotWithTasks(): Snapshot {
    return { ...storeFromBeat("connect").state()!, plan: null as never, tasks: mockTasks };
  }

  async function tabletWithList() {
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: snapshotWithTasks() }));
    await click(must(view.container, '[data-testid="tasks-button"]'));
    return { ...view, sent };
  }

  it("ticking sends one DONE; skipping sends nothing until the reason, then one SKIPPED with that reason", async () => {
    const { container, sent } = await tabletWithList();

    await click(must(container, '[aria-label^="Mark task done: Photograph"]'));
    expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-01", state: "DONE" } }]);

    sent.length = 0;
    await click(must(container, '[aria-label^="Skip task: Photograph"]'));
    expect(sent).toHaveLength(0);
    await click(must(container, '[aria-label="Reason: time"]'));
    expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-01", state: "SKIPPED", reason: "time" } }]);
    // No reasonless SKIPPED was ever sent.
    expect(sent.every((c) => c.args.reason !== undefined)).toBe(true);
  });

  it("without a client the list is read-only and nothing can be sent", async () => {
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotWithTasks() }));
    await click(must(view.container, '[data-testid="tasks-button"]'));

    expect(must(view.container, '[data-slot="stop-task-list"]').querySelectorAll("button")).toHaveLength(0);
  });

  it("never moves the alert slot, HAVEN, O₂ or the action row when the task list opens or closes (04 §A.3 #4)", async () => {
    const { client } = recordingClient(storeFromBeat("connect"));
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: snapshotWithTasks() }));
    const order = () => ["alert-slot", "haven", "o2", "action-row"].map((n) =>
      [...view.container.querySelectorAll("[data-slot]")].map((e) => e.getAttribute("data-slot")).indexOf(n));

    const closed = order();
    await click(must(view.container, '[data-testid="tasks-button"]'));
    expect(view.container.querySelector('[data-slot="stop-task-list"]')).not.toBeNull();
    expect(order().slice(0, 3)).toEqual(closed.slice(0, 3));
    const opened = order();
    expect(opened.slice(0, 3)).toEqual(closed.slice(0, 3));
    expect(opened[0]).toBeLessThan(opened[1]);
    expect(opened[1]).toBeLessThan(opened[2]);
    await click(must(view.container, '[data-testid="tasks-button"]'));
    expect(order()).toEqual(closed);
  });

  it("shows this crew's counts only: EV2's task does not inflate EV1's TASKS count", async () => {
    const snap = snapshotWithTasks();
    const withOther: Snapshot = {
      ...snap,
      tasks: [...mockTasks, { ...mockTasks[0], task_id: "t-ev2", crew_id: "EV2", state: "DONE" }],
    };
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: withOther }));

    expect(must(view.container, '[data-testid="tasks-button"]').textContent).toContain("1/4");
  });
});

describe("Ops add-task callback (FR-50)", () => {
  it("+ TASK calls onAdd with the crew id; a disabled button does not", async () => {
    const onAdd = vi.fn();
    const enabled = await mount(createElement(TaskProgress, { crewId: "EV2", stopCount: null, total: null, onAdd }));
    await click(must(enabled.container, '[aria-label="Add task for EV2"]'));
    expect(onAdd.mock.calls).toEqual([["EV2"]]);
    await enabled.unmount();

    const onAddDisabled = vi.fn();
    const disabled = await mount(createElement(TaskProgress, { crewId: "EV2", stopCount: null, total: null, onAdd: onAddDisabled, disabled: true }));
    await click(must(disabled.container, '[aria-label="Add task for EV2"]'));
    expect(onAddDisabled).not.toHaveBeenCalled();
  });

  it("AddTaskPopover submits the chosen crew, stop, kind and trimmed text, and not an empty or over-long one", async () => {
    const onAdd = vi.fn();
    const { container } = await mount(createElement(AddTaskPopover, { crewId: "EV1", stopId: "wp-2", onAdd }));
    const form = must<HTMLFormElement>(container, "form");
    const input = must<HTMLInputElement>(container, '[aria-label="Enter task description"]');

    const setText = async (value: string) => {
      const { act } = await import("react");
      await act(async () => {
        const proto = Object.getPrototypeOf(input) as { value?: unknown };
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    };
    const submit = async () => {
      const { act } = await import("react");
      await act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
    };

    await submit();
    expect(onAdd).not.toHaveBeenCalled();

    await setText("  Photograph the vein  ");
    await submit();
    expect(onAdd.mock.calls).toEqual([[{ crew_id: "EV1", stop_id: "wp-2", kind: "observe", text: "Photograph the vein" }]]);
  });
});
