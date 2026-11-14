/**
 * Backend package 01a (T32.01): the 02 §E.4 permission matrix, row by row, read from `PERMISSIONS`
 * (packages/protocol/src/ws.ts). The expected sets below are typed from the 02 §E.4 table (columns
 * planner, eva:EVn, ops, earth, presenter; the `hud:EVn` column is empty), not from the code.
 */
import { describe, expect, it } from "vitest";
import { PERMISSIONS, type Command, type Role } from "@marswalk/protocol";

type Kind = Command["kind"];

/** Every command kind of 02 §E.4 / 05 Command (14 on main + the five live-session kinds, 02 §D.17). */
const ALL_KINDS: readonly Kind[] = [
  "LOAD_SCENARIO", "SET_CLOCK", "JUMP_NEXT_EVENT", "START_EVA", "PUBLISH_PLAN", "SUMMON_VEHICLE", "ABORT", "ACK_ALERT",
  "APPROVE_OPTION", "TASK_ROVER", "SEND_MESSAGE", "INJECT_EVENT", "UPDATE_STOP_TASK", "ADD_STOP_TASK",
  "JUMP_NEXT_STOP", "START_EVENT", "RESET_SESSION", "SELECT_HAB_SITE", "SET_MISSION_SETUP", "SET_CREW_MOTION", "RIDE_VEHICLE",
];

type Column = "planner" | "eva" | "ops" | "earth" | "presenter";

/** The 02 §E.4 table: command row → the columns with a tick (self / own-task limits are checked elsewhere). */
const ROWS: { kinds: Kind[]; columns: Column[] }[] = [
  { kinds: ["LOAD_SCENARIO", "SET_CLOCK", "JUMP_NEXT_EVENT"], columns: ["ops", "presenter"] },
  { kinds: ["JUMP_NEXT_STOP", "RESET_SESSION"], columns: ["presenter"] },
  { kinds: ["START_EVENT"], columns: ["presenter", "ops"] }, // N-200, BD-165
  { kinds: ["SELECT_HAB_SITE", "SET_MISSION_SETUP"], columns: ["ops"] },
  { kinds: ["PUBLISH_PLAN"], columns: ["planner", "ops"] },
  { kinds: ["START_EVA", "APPROVE_OPTION"], columns: ["ops"] },
  { kinds: ["SUMMON_VEHICLE", "ABORT", "ACK_ALERT"], columns: ["eva", "ops"] },
  { kinds: ["TASK_ROVER", "RIDE_VEHICLE"], columns: ["eva", "ops"] },
  { kinds: ["SEND_MESSAGE"], columns: ["eva", "ops", "earth"] },
  { kinds: ["UPDATE_STOP_TASK"], columns: ["eva", "ops"] },
  { kinds: ["ADD_STOP_TASK"], columns: ["ops"] },
  { kinds: ["INJECT_EVENT"], columns: ["ops"] },
  // QoL Q2 (2026-11-13, Proposed): a simulation control; an EVA role only for its own crew member (checked in commands.ts).
  { kinds: ["SET_CREW_MOTION"], columns: ["eva", "ops"] },
];

const ROLES: { role: Role; column: Column | "hud" }[] = [
  { role: "planner", column: "planner" },
  { role: "eva:EV1", column: "eva" },
  { role: "eva:EV2", column: "eva" },
  { role: "ops", column: "ops" },
  { role: "earth", column: "earth" },
  { role: "presenter", column: "presenter" },
  { role: "hud:EV1", column: "hud" },
  { role: "hud:EV2", column: "hud" },
];

const allowed = (column: Column | "hud", kind: Kind): boolean =>
  column !== "hud" && ROWS.some((r) => r.kinds.includes(kind) && r.columns.includes(column));

describe("02 §E.4 permission matrix", () => {
  it("covers every command kind exactly once in the table rows", () => {
    const listed = ROWS.flatMap((r) => r.kinds);
    expect([...listed].sort()).toEqual([...ALL_KINDS].sort());
  });

  it("has an entry for every role, presenter and the two HUD roles included", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(ROLES.map((r) => r.role).sort());
  });

  for (const { role, column } of ROLES) {
    describe(role, () => {
      for (const kind of ALL_KINDS) {
        const expected = allowed(column, kind);
        it(`${expected ? "may send" : "may not send"} ${kind}`, () => {
          expect(PERMISSIONS[role]?.includes(kind) ?? false).toBe(expected);
        });
      }
    });
  }

  it("gives the presenter no crew or planner action (02 §E.4: APPROVE_OPTION, ABORT, SUMMON_VEHICLE, START_EVA, PUBLISH_PLAN)", () => {
    for (const kind of ["APPROVE_OPTION", "ABORT", "SUMMON_VEHICLE", "START_EVA", "PUBLISH_PLAN"] as const) {
      expect(PERMISSIONS.presenter).not.toContain(kind);
    }
  });
});
