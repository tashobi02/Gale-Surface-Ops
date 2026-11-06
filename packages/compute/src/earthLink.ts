/**
 * Earth link delivery rule from precomputed SPICE tables (docs/specs/02 §D.12; FR-43). TASK-05b.
 * Mars → Earth: next_pass_start(t_send) + light_time. Earth → Mars: next_pass_start(t_send_earth + light_time).
 */
import type { EarthLinkTable, ParamSet } from "@marswalk/protocol";

/** Row at or before t (binary search on 60 s rows). TASK-05b. */
export function linkAt(table: EarthLinkTable, t_utc: string): EarthLinkTable["rows"][number] {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** Start of the first relay pass at or after t, or null if none in the table. TASK-05b. */
export function nextPassStart(table: EarthLinkTable, t_utc: string): string | null {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** True when the Sun–Earth–Mars angle is below `link.conjunction_deg`. TASK-05b. */
export function inConjunction(table: EarthLinkTable, t_utc: string, params: ParamSet): boolean {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** Delivery time for a message, or null during blackout. TASK-05b. */
export function deliveryTime(table: EarthLinkTable, direction: "to_earth" | "to_mars", t_send_utc: string, params: ParamSet): string | null {
  throw new Error("TODO(TASK-05b): not implemented");
}
