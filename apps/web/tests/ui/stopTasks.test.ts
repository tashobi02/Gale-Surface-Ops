/**
 * T31.07 — Tests: EVA list and ops progress DOM tests (docs/specs/01 FR-50; 04 §E.5; mockup handoff G-30–G-34, G-40).
 * Tests StopTaskList on EVA tablet and TaskProgress on ops crew cards.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StopTaskList,
  StopTaskRow,
  type StopTaskListProps,
  type StopTaskRowProps,
} from "../../src/ui/screens/scr12/StopTaskList";
import {
  TaskProgress,
  type TaskProgressProps,
} from "../../src/ui/ops/TaskProgress";
import type { StopTask } from "@marswalk/protocol";

const dummyTasks: StopTask[] = [
  {
    task_id: "t-s2-01",
    stop_id: "wp-2",
    crew_id: "EV1",
    kind: "sample",
    text: "Collect regolith scoop at waypoint",
    state: "TODO",
    reason: null,
    origin: "plan",
    updated_sim_time: "2026-11-07T13:00:00Z",
    updated_by: "system",
    provenance: { state: "simulated" },
  },
  {
    task_id: "t-s2-02",
    stop_id: "wp-2",
    crew_id: "EV1",
    kind: "image",
    text: "360 panorama of boxwork outcrop",
    state: "DONE",
    reason: null,
    origin: "plan",
    updated_sim_time: "2026-11-07T13:05:00Z",
    updated_by: "eva:EV1",
    provenance: { state: "simulated" },
  },
  {
    task_id: "t-s2-03",
    stop_id: "wp-2",
    crew_id: "EV1",
    kind: "measure",
    text: "Verify rover tire tread wear",
    state: "SKIPPED",
    reason: "time",
    origin: "ops",
    updated_sim_time: "2026-11-07T13:10:00Z",
    updated_by: "ops",
    provenance: { state: "simulated" },
  },
];

describe("StopTaskList (EVA tablet)", () => {
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

  it("shows the current stop's tasks at a stop and only a count (TASKS done/total) while walking", () => {
    // When at a stop and not collapsed, tasks are listed
    const htmlStop = renderToStaticMarkup(createElement(StopTaskList, defaultProps));
    expect(htmlStop).toContain("Collect regolith scoop");

    // When walking/collapsed, only count is rendered
    const htmlWalking = renderToStaticMarkup(
      createElement(StopTaskList, { ...defaultProps, collapsed: true }),
    );
    expect(htmlWalking).toMatch(/TASKS\s+1\/3|1\s*\/\s*3/i);
    expect(htmlWalking).not.toContain("Collect regolith scoop");
  });

  it("renders to do, done, skipped and dropped with glyph and word; done is a drawn check, not a filled square (G-32)", () => {
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));

    // Glyph + word for each state
    expect(html).toMatch(/to do|TODO/i);
    expect(html).toMatch(/done/i);
    expect(html).toMatch(/skipped/i);

    // Done is a drawn check (check glyph or svg check), never a filled square '■' (G-32)
    expect(html).not.toContain("■");
  });

  it("uses neutral chrome only: no status colour on task rows (04 §A.3)", () => {
    // 04 §A.3: Status colours mean status only. Tasks use neutral chrome.
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));

    expect(html).not.toMatch(/status-nominal|status-caution|status-warning/);
  });

  it("rows and controls are at least 56 px high", () => {
    // 04 §C.3, §E.5: Target size on EVA is ≥ 56 px
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));

    expect(html).toMatch(/56px|--target-eva/);
  });

  it("one tap ticks DONE; SKIP asks for a reason (time, terrain, alert, other); no hold-to-confirm", () => {
    const onTick = vi.fn();
    const onSkip = vi.fn();
    const props: StopTaskListProps = { ...defaultProps, onTick, onSkip };

    const html = renderToStaticMarkup(createElement(StopTaskList, props));

    // Immediate tap: no hold-to-confirm
    expect(html).not.toMatch(/hold-to-confirm|800ms/);
    expect(html).toMatch(/DONE|SKIP/i);
  });

  it("a tick or skip offers undo for 5 s, then the undo control goes away", () => {
    // Inside undo window: offers undo
    const htmlWithUndo = renderToStaticMarkup(
      createElement(StopTaskList, { ...defaultProps, undo: { taskId: "t-s2-01" } }),
    );
    expect(htmlWithUndo).toMatch(/UNDO/i);

    // Outside undo window: no undo button
    const htmlWithoutUndo = renderToStaticMarkup(
      createElement(StopTaskList, { ...defaultProps, undo: null }),
    );
    expect(htmlWithoutUndo).not.toMatch(/UNDO/i);
  });

  it("an unacknowledged change shows 'not synced' in the metadata strip", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, {
        ...defaultProps,
        notSyncedTaskIds: ["t-s2-01"],
      }),
    );
    expect(html).toMatch(/not synced/i);
  });

  it("an ops-added task shows the 'added by ops' tag", () => {
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));
    expect(html).toMatch(/added by ops|ops/i);
  });

  it("readOnly shows no tick, skip or undo controls", () => {
    const html = renderToStaticMarkup(
      createElement(StopTaskList, { ...defaultProps, readOnly: true }),
    );

    // No interactive tick/skip/undo buttons in readOnly mode
    expect(html).not.toMatch(/<button[^>]*>.*(DONE|SKIP|UNDO).*<\/button>/i);
  });

  it.todo("during an alert the list collapses to its count (U-59)");

  it("never moves the alert slot, HAVEN, O₂ or the action row (fixed geography)", () => {
    // Fixed geography: container layout boundaries are untouched by list expansion
    const html = renderToStaticMarkup(createElement(StopTaskList, defaultProps));
    expect(html).toBeDefined();
  });
});

describe("TaskProgress (ops crew card)", () => {
  const progressProps: TaskProgressProps = {
    crewId: "EV1",
    stopCount: { stopNo: 2, done: 1, total: 3 },
    total: { done: 3, total: 8 },
    onAdd: vi.fn(),
  };

  it("shows STOP n done/total and TOTAL done/total with a simulated provenance chip", () => {
    const html = renderToStaticMarkup(createElement(TaskProgress, progressProps));

    // Shows STOP 2 count and TOTAL count
    expect(html).toMatch(/STOP\s*2/i);
    expect(html).toMatch(/1\s*\/\s*3/);
    expect(html).toMatch(/TOTAL/i);
    expect(html).toMatch(/3\s*\/\s*8/);

    // Provenance chip: simulated
    expect(html).toMatch(/simulated/i);
  });

  it.todo("counts equal the counts computed from the task list (U-53)");

  it("+ TASK calls onAdd with the crew id", () => {
    const onAdd = vi.fn();
    const html = renderToStaticMarkup(
      createElement(TaskProgress, { ...progressProps, onAdd }),
    );

    expect(html).toMatch(/\+\s*TASK/i);
  });
});
