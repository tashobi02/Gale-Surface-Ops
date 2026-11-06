import { describe, it } from "vitest";

// docs/specs/01 FR-41, FR-42; 02 §E.4. TASK-29 (06 §C: "RELAY closes the demo shadow; queue shows ETA and battery").
describe("handleTaskRover", () => {
  it.todo("RELAY closes the demo comm shadow: COMM_SHADOW on the remaining route clears and warnings update");
  it.todo("queue shows ETA and battery for each queued task");
  it.todo("SCOUT, CARRY and RELAY without a target are INVALID; RETURN needs none");
  it.todo("tasking the pressurized rover (or an unknown vehicle_id) is INVALID");
  it.todo("a target with no passable route for the utility rover is INVALID and leaves state unchanged");
  it.todo("both EVA roles and ops may task the rover; planner and earth get FORBIDDEN_ROLE");
  // TODO(verify): 02 and 05 name no LogEvent kind for an accepted rover task; VEHICLE_DISPATCHED is the closest.
  it.todo("an accepted task is logged as one event with the task, target, ETA and battery");
});
