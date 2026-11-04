/**
 * Surface radio link graph (docs/specs/02 §A.5 L-surf, §D.11; FR-42). Nodes: hab, suits, rovers.
 * Edge when mutual LOS and distance ≤ range (05 ParamSet kind `link`). Linked = BFS path to HAB.
 * TASK-05b.
 */
import type { LinkState, ParamSet } from "@marswalk/protocol";

export interface LinkNode {
  node_id: string;
  kind: "hab" | "suit" | "rover";
  x_m: number;
  y_m: number;
  antenna_m: number;
}

/** `los(a, b)` is injected so the graph stays testable without a DEM. TASK-05b. */
export function linkStates(
  nodes: LinkNode[],
  los: (a: LinkNode, b: LinkNode) => boolean,
  params: ParamSet,
  sim_time: string,
): LinkState[] {
  throw new Error("TODO(TASK-05b): not implemented");
}
