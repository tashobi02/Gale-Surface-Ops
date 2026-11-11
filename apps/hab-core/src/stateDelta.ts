/**
 * The STATE_DELTA between two SNAPSHOTs (docs/specs/02 §D.14, §E.6; T20.04). Pure: no clock, no engine.
 *
 * The server diffs `session.snapshot()` from before and after a command (or a batch of ticks), so everything the
 * engine changed reaches every client's `state()`, not only the crew fields the tick reports itself.
 *
 * Path syntax is the client's (habClient `withPath`): "crew/EV1/o2_frac", array items matched by their `*_id` field.
 * A client cannot add or remove an array item by path, so a list that gained, lost or reordered items is sent whole
 * ("alerts"); one with the same items changes field by field. The connected-client list and the constant provenance
 * map are not state and are never diffed.
 */
import type { Snapshot } from "@marswalk/protocol";
import type { StateChange } from "./engine/reducer";

type Keyed = "crew" | "vehicles" | "alerts" | "options" | "tasks";

/** Id field of each keyed list (05 Crew, Vehicle, Alert, ContingencyOption, StopTask). */
const ID_FIELD: Record<Keyed, string> = {
  crew: "crew_id",
  vehicles: "vehicle_id",
  alerts: "alert_id",
  options: "option_id",
  tasks: "task_id",
};

const same = (a: unknown, b: unknown): boolean => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

/** An id usable as a path segment: non-empty and without the separator. */
const usable = (id: unknown): id is string => typeof id === "string" && id !== "" && !id.includes("/");

export function diffSnapshots(before: Snapshot, after: Snapshot): StateChange[] {
  const changes: StateChange[] = [];

  const sessionKeys = new Set([...Object.keys(before.session), ...Object.keys(after.session)]);
  for (const key of sessionKeys) {
    const b = (before.session as unknown as Record<string, unknown>)[key];
    const a = (after.session as unknown as Record<string, unknown>)[key];
    if (!same(a, b)) changes.push({ path: `session/${key}`, value: a });
  }

  if (!same(before.plan, after.plan)) changes.push({ path: "plan", value: after.plan });
  if (!same(before.earth, after.earth)) changes.push({ path: "earth", value: after.earth });

  for (const list of Object.keys(ID_FIELD) as Keyed[]) {
    const b = before[list] as unknown as Record<string, unknown>[];
    const a = after[list] as unknown as Record<string, unknown>[];
    if (b === a) continue;
    const idField = ID_FIELD[list];
    const sameItems = a.length === b.length && a.every((item, i) => usable(item[idField]) && item[idField] === b[i][idField]);
    if (!sameItems) {
      changes.push({ path: list, value: a });
      continue;
    }
    a.forEach((item, i) => {
      if (item === b[i]) return;
      for (const field of new Set([...Object.keys(item), ...Object.keys(b[i])])) {
        if (field === idField) continue;
        if (!same(item[field], b[i][field])) changes.push({ path: `${list}/${String(item[idField])}/${field}`, value: item[field] });
      }
    });
  }
  return changes;
}
