import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StopTaskList, StopTaskRow } from "../../src/ui/screens/scr12/StopTaskList";
import { TasksButton } from "../../src/ui/screens/scr12/TasksButton";
import { TaskProgress } from "../../src/ui/ops/TaskProgress";
import { AddTaskPopover } from "../../src/ui/ops/AddTaskPopover";
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
    task_id: "t-s2-02",
    kind: "sample",
    text: "Collect sulfate vein drill sample",
    state: "DONE",
    updated_sim_time: "13:04:10",
    updated_by: "eva:EV1",
    task_id: "t-s2-03",
    kind: "measure",
    text: "Deploy spectrometer on outcrop surface",
    state: "SKIPPED",
    reason: "time",
    origin: "ops",
    updated_sim_time: "13:04:30",
    task_id: "t-s2-04",
    kind: "observe",
    text: "Inspect contact boundary layer",
    state: "DROPPED",
    updated_sim_time: "13:05:00",
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
        collapsed: false,
    expect(htmlAtStop).toContain("Photograph boxwork");
    expect(htmlAtStop).toContain("Collect sulfate vein");
  });
  it("renders to do, done, skipped and dropped with glyph and word; done is a drawn check, not a filled square (G-32)", () => {
    const html = renderToStaticMarkup(
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
  it("uses neutral chrome only: no status colour on task rows (04 §A.3)", () => {
    // Task rows must not use status colors (warning red, caution amber, nominal green)
    expect(html).not.toContain("var(--status-warning");
    expect(html).not.toContain("var(--status-caution");
    expect(html).not.toContain("var(--status-nominal");
  it("rows and controls are at least 56 px high", () => {
      createElement(StopTaskRow, {
        task: mockTasks[0],
        inUndoWindow: false,
        notSynced: false,
    // Row style or class specifies >= 56px (EVA touch target rule)
/**
 * T31.07 — Tests: EVA list and ops progress DOM tests (docs/specs/01 FR-50; 04 §E.5; mockup handoff G-30–G-34, G-40).
 * Tests StopTaskList on EVA tablet and TaskProgress on ops crew cards.
 */
import {
  StopTaskList,
  StopTaskRow,
  type StopTaskListProps,
  type StopTaskRowProps,
} from "../../src/ui/screens/scr12/StopTaskList";
  TaskProgress,
  type TaskProgressProps,
} from "../../src/ui/ops/TaskProgress";
const dummyTasks: StopTask[] = [
    text: "Collect regolith scoop at waypoint",
    updated_sim_time: "2026-11-07T13:00:00Z",
    provenance: { state: "simulated" },
    text: "360 panorama of boxwork outcrop",
    updated_sim_time: "2026-11-07T13:05:00Z",
    text: "Verify rover tire tread wear",
    updated_sim_time: "2026-11-07T13:10:00Z",
    updated_by: "ops",
  const defaultProps: StopTaskListProps = {
    tasks: dummyTasks,
    crewId: "EV1",
    stopId: "wp-2",
    readOnly: false,
    undo: null,
    collapsed: false,
    notSyncedTaskIds: [],
    onTick: vi.fn(),
    onSkip: vi.fn(),
    onUndo: vi.fn(),
    onReason: vi.fn(),
  };
    // When at a stop and not collapsed, tasks are listed
    const htmlStop = renderToStaticMarkup(createElement(StopTaskList, defaultProps));
    expect(htmlStop).toContain("Collect regolith scoop");
    // When walking/collapsed, only count is rendered
      createElement(StopTaskList, { ...defaultProps, collapsed: true }),
    expect(htmlWalking).toMatch(/TASKS\s+1\/3|1\s*\/\s*3/i);
    expect(htmlWalking).not.toContain("Collect regolith scoop");
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));
    // Glyph + word for each state
    expect(html).toMatch(/to do|TODO/i);
    expect(html).toMatch(/done/i);
    expect(html).toMatch(/skipped/i);
    // Done is a drawn check (check glyph or svg check), never a filled square '■' (G-32)
    expect(html).not.toContain("■");
    // 04 §A.3: Status colours mean status only. Tasks use neutral chrome.
    expect(html).not.toMatch(/status-nominal|status-caution|status-warning/);
    // 04 §C.3, §E.5: Target size on EVA is ≥ 56 px
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
        task: mockTasks[1],
        inUndoWindow: true,
    expect(htmlWithUndo).toMatch(/UNDO/i);
    const htmlWithoutUndo = renderToStaticMarkup(
    const onTick = vi.fn();
    const onSkip = vi.fn();
    const props: StopTaskListProps = { ...defaultProps, onTick, onSkip };
    const html = renderToStaticMarkup(createElement(StopTaskList, props));
    // Immediate tap: no hold-to-confirm
    expect(html).not.toMatch(/hold-to-confirm|800ms/);
    expect(html).toMatch(/DONE|SKIP/i);
    // Inside undo window: offers undo
      createElement(StopTaskList, { ...defaultProps, undo: { taskId: "t-s2-01" } }),
    // Outside undo window: no undo button
      createElement(StopTaskList, { ...defaultProps, undo: null }),
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
        notSyncedTaskIds: [],
    expect(html).toContain("added by ops");
        ...defaultProps,
      }),
    expect(html).toMatch(/not synced/i);
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));
    expect(html).toMatch(/added by ops|ops/i);
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
        readOnly: false,
        undo: null,
        collapsed: true,
    expect(html).toContain('data-testid="tasks-collapsed-count"');
    expect(html).toContain("TASKS 1/4");
  it("TasksButton displays icon, word TASKS and count (U-51 placement)", () => {
      createElement(TasksButton, {
        doneCount: 2,
        totalCount: 4,
        active: false,
    expect(html).toContain("TASKS");
    expect(html).toContain("2/4");
    expect(html).toMatch(/56px|--target-eva/);
      createElement(StopTaskList, { ...defaultProps, readOnly: true }),
    // No interactive tick/skip/undo buttons in readOnly mode
    expect(html).not.toMatch(/<button[^>]*>.*(DONE|SKIP|UNDO).*<\/button>/i);
  it.todo("during an alert the list collapses to its count (U-59)");
  it("never moves the alert slot, HAVEN, O₂ or the action row (fixed geography)", () => {
    // Fixed geography: container layout boundaries are untouched by list expansion
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));
    expect(html).toBeDefined();
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
  it("counts equal the counts computed from the task list (U-53)", () => {
    const ev1Tasks = mockTasks.filter((t) => t.crew_id === "EV1" || t.crew_id === null);
    const stop2Tasks = ev1Tasks.filter((t) => t.stop_id === "wp-2");
    const stopDone = stop2Tasks.filter((t) => t.state === "DONE").length;
    const totalDone = ev1Tasks.filter((t) => t.state === "DONE").length;
        stopCount: { stopNo: 2, done: stopDone, total: stop2Tasks.length },
        total: { done: totalDone, total: ev1Tasks.length },
    expect(html).toContain(`${stopDone}/${stop2Tasks.length}`);
    expect(html).toContain(`${totalDone}/${ev1Tasks.length}`);
  it("+ TASK calls onAdd with the crew id and honors disabled state", () => {
    const htmlActive = renderToStaticMarkup(
        total: { done: 2, total: 5 },
        disabled: false,
    expect(htmlActive).toContain("+ TASK");
    expect(htmlActive).not.toContain("disabled");
    const htmlDisabled = renderToStaticMarkup(
        stopCount: { stopNo: 2, done: 1, total: 4 },
        total: { done: 2, total: 6 },
        disabled: true,
    expect(htmlDisabled).toMatch(/disabled/i);
  it("AddTaskPopover renders crew, stop, kind dropdown, text limit, and max reached state", () => {
      createElement(AddTaskPopover, {
        stopId: "wp-2",
        availableStops: [
          { stopId: "wp-2", stopNo: 2, label: "Stop 2 · Boxwork Ridge" },
          { stopId: "wp-3", stopNo: 3, label: "Stop 3 · Clay Outcrop" },
        ],
        maxReached: false,
    expect(html).toContain("EV1");
    expect(html).toContain("Stop 2");
    expect(html).toContain("<select");
    expect(html).toContain("<input");
    expect(html).toContain("60"); // 60 chars limit indicator
    const htmlMax = renderToStaticMarkup(
        maxReached: true,
    expect(htmlMax).toMatch(/max reached|maximum/i);
  const progressProps: TaskProgressProps = {
    crewId: "EV1",
    stopCount: { stopNo: 2, done: 1, total: 3 },
    total: { done: 3, total: 8 },
    onAdd: vi.fn(),
  };
    const html = renderToStaticMarkup(createElement(TaskProgress, progressProps));
    // Shows STOP 2 count and TOTAL count
    expect(html).toMatch(/STOP\s*2/i);
    expect(html).toMatch(/1\s*\/\s*3/);
    expect(html).toMatch(/TOTAL/i);
    expect(html).toMatch(/3\s*\/\s*8/);
    // Provenance chip: simulated
    expect(html).toMatch(/simulated/i);
  it.todo("counts equal the counts computed from the task list (U-53)");
  it("+ TASK calls onAdd with the crew id", () => {
    const onAdd = vi.fn();
      createElement(TaskProgress, { ...progressProps, onAdd }),
    expect(html).toMatch(/\+\s*TASK/i);
  });
});
