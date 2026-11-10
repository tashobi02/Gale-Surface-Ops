/**
 * Surface radio link graph (docs/specs/02 §A.5 L-surf, §D.11; FR-42). Nodes: hab, suits, rovers.
 * Edge when mutual LOS and distance ≤ range (05 ParamSet kind `link`). Linked = BFS path to HAB.
 * TASK-05b.
 */
import type { LinkState, ParamSet } from "@marswalk/protocol";

export const HAB_NODE_ID = "HAB";

export interface LinkNode {
  node_id: string;
  kind: "hab" | "suit" | "rover";
  x_m: number;
  y_m: number;
  antenna_m: number;
}

export interface LinkNodeState extends LinkState {
  path_to_hab: string[];
}

function maxRangeM(a: LinkNode, b: LinkNode, params: ParamSet): number {
  const v = params.values ?? {};
  if (a.kind === "rover" || b.kind === "rover") {
    return Number(v.range_rover_m ?? 5000);
  }
  if ((a.kind === "hab" && b.kind === "suit") || (a.kind === "suit" && b.kind === "hab")) {
    return Number(v.range_hab_suit_m ?? 10000);
  }
  if (a.kind === "suit" && b.kind === "suit") {
    return Number(v.range_suit_suit_m ?? 2000);
  }
  return 0;
}

function hasEdge(
  a: LinkNode,
  b: LinkNode,
  los: (u: LinkNode, v: LinkNode) => boolean,
  params: ParamSet,
): boolean {
  if (a.node_id === b.node_id) return false;
  const dist = Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m);
  const range = maxRangeM(a, b, params);
  if (dist > range) return false;
  return los(a, b) && los(b, a);
}

function findShortestPathToHab(
  startId: string,
  habId: string,
  adj: Map<string, string[]>,
): string[] {
  if (startId === habId) return [habId];

  const queue: string[] = [startId];
  const visited = new Set<string>([startId]);
  const parent = new Map<string, string>();

  let found = false;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === habId) {
      found = true;
      break;
    }
    const neighbors = adj.get(curr) ?? [];
    for (const nbr of neighbors) {
      if (!visited.has(nbr)) {
        visited.add(nbr);
        parent.set(nbr, curr);
        queue.push(nbr);
      }
    }
  }

  if (!found) return [];

  const path: string[] = [];
  let curr: string | undefined = habId;
  while (curr !== undefined) {
    path.push(curr);
    if (curr === startId) break;
    curr = parent.get(curr);
  }
  return path.reverse();
}

/** `los(a, b)` is injected so the graph stays testable without a DEM. TASK-05b. */
export function linkStates(
  nodes: LinkNode[],
  los: (a: LinkNode, b: LinkNode) => boolean,
  params: ParamSet,
  sim_time: string,
  previous?: readonly LinkState[],
): LinkNodeState[] {
  const habNode = nodes.find((n) => n.node_id === HAB_NODE_ID) ?? nodes.find((n) => n.kind === "hab");
  const habId = habNode?.node_id;

  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node.node_id, []);
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (hasEdge(a, b, los, params)) {
        adj.get(a.node_id)!.push(b.node_id);
        adj.get(b.node_id)!.push(a.node_id);
      }
    }
  }

  for (const neighbors of adj.values()) {
    neighbors.sort((a, b) => a.localeCompare(b));
  }

  const prevMap = new Map<string, LinkState>();
  if (previous) {
    for (const p of previous) {
      prevMap.set(p.node_id, p);
    }
  }

  return nodes.map((node) => {
    const neighbors = adj.get(node.node_id) ?? [];
    let pathToHab: string[] = [];
    let linkedToHab = false;

    if (habId !== undefined) {
      pathToHab = findShortestPathToHab(node.node_id, habId, adj);
      linkedToHab = pathToHab.length > 0;
    }

    const prev = prevMap.get(node.node_id);
    let sinceSimTime = sim_time;
    if (prev && prev.linked_to_hab === linkedToHab && prev.since_sim_time) {
      sinceSimTime = prev.since_sim_time;
    }

    return {
      node_id: node.node_id,
      neighbors,
      linked_to_hab: linkedToHab,
      since_sim_time: sinceSimTime,
      path_to_hab: pathToHab,
    };
  });
}
