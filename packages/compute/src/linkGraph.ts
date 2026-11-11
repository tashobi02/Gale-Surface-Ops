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

/** The three link ranges of a ParamSet of kind `link` (05 ParamSet; 02 §D.11, Assumed), in metres. */
interface LinkRanges {
  habSuit_m: number;
  suitSuit_m: number;
  rover_m: number;
}

/**
 * Read one range from the ParamSet. There is no fallback: a missing, non-numeric, non-finite or negative value
 * throws, because `dist > NaN` is false and would otherwise silently mean unlimited range.
 */
function readRange(params: ParamSet, key: string): number {
  const v = params.values?.[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new RangeError(
      `ParamSet ${params.param_set_id}: ${key} must be a finite non-negative number of metres, got ${String(v)}`,
    );
  }
  return v;
}

function readRanges(params: ParamSet): LinkRanges {
  return {
    habSuit_m: readRange(params, "range_hab_suit_m"),
    suitSuit_m: readRange(params, "range_suit_suit_m"),
    rover_m: readRange(params, "range_rover_m"),
  };
}

function maxRangeM(a: LinkNode, b: LinkNode, ranges: LinkRanges): number {
  if (a.kind === "rover" || b.kind === "rover") return ranges.rover_m;
  if ((a.kind === "hab" && b.kind === "suit") || (a.kind === "suit" && b.kind === "hab")) return ranges.habSuit_m;
  if (a.kind === "suit" && b.kind === "suit") return ranges.suitSuit_m;
  return 0;
}

/** Locale-independent order (UTF-16 code units), so the BFS tie-break is the same on every machine. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hasEdge(
  a: LinkNode,
  b: LinkNode,
  los: (u: LinkNode, v: LinkNode) => boolean,
  ranges: LinkRanges,
): boolean {
  if (a.node_id === b.node_id) return false;
  const dist = Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m);
  if (dist > maxRangeM(a, b, ranges)) return false;
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

/**
 * `los(a, b)` is injected so the graph stays testable without a DEM. TASK-05b. Throws RangeError when the
 * ParamSet lacks a finite non-negative `range_hab_suit_m`, `range_suit_suit_m` or `range_rover_m`. An edge needs
 * distance ≤ range (inclusive) and LOS both ways; neighbours and BFS ties are ordered by code unit.
 */
export function linkStates(
  nodes: LinkNode[],
  los: (a: LinkNode, b: LinkNode) => boolean,
  params: ParamSet,
  sim_time: string,
  previous?: readonly LinkState[],
): LinkNodeState[] {
  const ranges = readRanges(params);
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
      if (hasEdge(a, b, los, ranges)) {
        adj.get(a.node_id)!.push(b.node_id);
        adj.get(b.node_id)!.push(a.node_id);
      }
    }
  }

  for (const neighbors of adj.values()) {
    neighbors.sort(compareCodeUnits);
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
