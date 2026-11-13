/**
 * The EVA mini-map's follow view (QoL Q4; docs/plan/qol/decisions.md Q4-01 to Q4-04).
 *
 * All values are projected metres in the site's local `+proj=eqc` frame; nothing here measures on a sphere. The view is
 * a square centred on the crew member, large enough to hold their next stop; `fitExtent` adds the map's own pixel
 * padding around it. No physical quantity is computed: the extent only frames two positions the Hab Core supplied.
 */
import type { CrewId, Snapshot } from "@marswalk/protocol";
import { selectNextStop } from "./viewModel";

export type Extent = [number, number, number, number];

/** Q4-01: the follow view is never narrower than this share of the site's AOI width. */
export const MIN_FOLLOW_WIDTH_SHARE_OF_AOI = 0.1;

/** The minimum follow-view width for an AOI extent (projected metres). */
export function minFollowWidth(aoi: Extent): number {
  return (aoi[2] - aoi[0]) * MIN_FOLLOW_WIDTH_SHARE_OF_AOI;
}

/** A square extent centred on `crew` that holds `next` (when known) and is at least `minWidth` wide. */
export function followExtent(crew: [number, number], next: [number, number] | null, minWidth: number): Extent {
  const reach = next ? Math.max(Math.abs(next[0] - crew[0]), Math.abs(next[1] - crew[1])) : 0;
  const half = Math.max(reach, minWidth / 2);
  return [crew[0] - half, crew[1] - half, crew[0] + half, crew[1] + half];
}

/** This crew member's position, or null when the snapshot has no finite position for them. */
export function crewPosition(snapshot: Snapshot | null, crewId: string | undefined): [number, number] | null {
  const member = crewId ? snapshot?.crew?.find((c) => c.crew_id === crewId) : undefined;
  return member && Number.isFinite(member.x_m) && Number.isFinite(member.y_m) ? [member.x_m, member.y_m] : null;
}

/** The position of the stop the NEXT card names for this crew member (the same stop, FD-047), or null. */
export function nextStopPosition(snapshot: Snapshot | null, crewId: string | undefined): [number, number] | null {
  if (!crewId) return null;
  const stopId = selectNextStop(snapshot, crewId as CrewId)?.stopId;
  const wp = stopId ? snapshot?.plan?.waypoints?.find((w) => w.id === stopId) : undefined;
  return wp && Number.isFinite(wp.x_m) && Number.isFinite(wp.y_m) ? [wp.x_m, wp.y_m] : null;
}
