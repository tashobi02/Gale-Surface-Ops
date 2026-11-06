import { describe, it } from "vitest";

// docs/specs/01 FR-50; 04 §E.5; mockup handoff G-30–G-34, G-40. TASK-24, TASK-31.
describe("StopTaskList (EVA tablet)", () => {
  it.todo("shows the current stop's tasks at a stop and only a count (TASKS done/total) while walking");
  it.todo("renders to do, done, skipped and dropped with glyph and word; done is a drawn check, not a filled square (G-32)");
  it.todo("uses neutral chrome only: no status colour on task rows (04 §A.3)");
  it.todo("rows and controls are at least 56 px high");
  it.todo("one tap ticks DONE; SKIP asks for a reason (time, terrain, alert, other); no hold-to-confirm");
  it.todo("a tick or skip offers undo for 5 s, then the undo control goes away");
  it.todo("an unacknowledged change shows 'not synced' in the metadata strip");
  it.todo("an ops-added task shows the 'added by ops' tag");
  it.todo("readOnly shows no tick, skip or undo controls");
  it.todo("during an alert the list collapses to its count (U-59)");
  it.todo("never moves the alert slot, HAVEN, O₂ or the action row (fixed geography)");
});

describe("TaskProgress (ops crew card)", () => {
  it.todo("shows STOP n done/total and TOTAL done/total with a simulated provenance chip");
  it.todo("counts equal the counts computed from the task list (U-53)");
  it.todo("+ TASK calls onAdd with the crew id");
});
