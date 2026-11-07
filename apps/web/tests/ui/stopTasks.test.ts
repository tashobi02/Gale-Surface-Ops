import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StopTaskList, StopTaskRow } from "../../src/ui/screens/scr12/StopTaskList";
import { TasksButton } from "../../src/ui/screens/scr12/TasksButton";
import type { StopTask } from "@marswalk/protocol";

// docs/specs/01 FR-50; 04 §E.5; mockup handoff G-30–G-34, G-40. TASK-24, TASK-31.

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

  it("rows and controls are at least 56 px high", () => {
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

    // Row style or class specifies >= 56px (EVA touch target rule)
    expect(html).toMatch(/56px|--target-eva/);
  });

  it("one tap ticks DONE; SKIP asks for a reason (time, terrain, alert, other); no hold-to-confirm", () => {
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

  it("a tick or skip offers undo for 5 s, then the undo control goes away", () => {
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
  it.todo("shows STOP n done/total and TOTAL done/total with a simulated provenance chip");
  it.todo("counts equal the counts computed from the task list (U-53)");
  it.todo("+ TASK calls onAdd with the crew id");
});
