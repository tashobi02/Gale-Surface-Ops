/**
 * The relay cell of the reference run (T21.15, T26.07, T29.06; FR-41, FR-42; 02 §D.9, §D.11; BD-147). A thin layer over
 * `@marswalk/compute`: no science of its own, no wall clock (NFR-06).
 *
 * The rule: among the cells the utility rover can reach within `budget_s` (compute `vehicleTimeField`, the rover's own
 * ParamSet), on a lattice of every k-th row and column (k = round(stride / cell)), that the hab mast sees (`lineOfSight`,
 * both ways) within the rover range, take the one that links the most samples of `route` to the hab: for each sample a
 * suit node on the route is added to the hab, the rover and the suit and `linkStates` is read for it, with the same
 * line-of-sight test and ranges the engine's links module uses. Ties go to the earliest arrival, then to the lowest
 * (y, x). It returns null when no cell qualifies.
 *
 * Run: `npm --workspace @marswalk/hab-core run relay-target -- --log <session.jsonl>` reads the VEHICLE_RENDEZVOUS option's
 * route and the first COMM_SHADOW time from a replay log and prints the target as JSON; the rover leaves the hab at that
 * first COMM_SHADOW alert and the budget is the time to the RADIATION_ALERT. The reference list holds the result.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { lineOfSight, linkStates, timeAt, vehicleTimeField, type LinkNode, type LoadedGrid } from "@marswalk/compute";
import type { LogEvent, ParamSet } from "@marswalk/protocol";
import { REPO_ROOT, loadForReplay } from "../src/replay";

export interface RelayTargetInput {
  grid: LoadedGrid;
  /** The hab mast (the HAB node of the link graph). */
  mast: { x_m: number; y_m: number; height_m: number };
  /** Working-projection points of the route to cover. */
  route: readonly (readonly [number, number])[];
  /** The utility rover's ParamSet (kind `utility_rover`; its `antenna_m` is the relay's antenna). */
  rover: ParamSet;
  /** The link ParamSet (kind `link`). */
  link: ParamSet;
  /** The suit antenna height of the crew on the route. */
  suit_antenna_m: number;
  /** Where the rover starts. */
  from: { x_m: number; y_m: number };
  budget_s: number;
  stride_m: number;
}

export interface RelayTarget {
  x_m: number;
  y_m: number;
  arrival_s: number;
  /** Samples of the route linked to the hab with the relay there. */
  covered: number;
  total: number;
}

const num = (p: ParamSet, key: string): number => {
  const v = p.values[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`relay-target: ParamSet ${p.param_set_id} has no number ${key}`);
  return v;
};

export function findRelayTarget(input: RelayTargetInput): RelayTarget | null {
  const { grid, mast, route, rover, link, from, budget_s } = input;
  if (route.length === 0) throw new RangeError("relay-target: the route has no samples");
  if (!(input.stride_m > 0) || !Number.isFinite(input.stride_m)) throw new RangeError("relay-target: stride_m must be a positive number");
  const antenna = num(rover, "antenna_m");
  const range = num(link, "range_rover_m");
  const field = vehicleTimeField(grid, from, rover);
  const k = Math.max(1, Math.round(input.stride_m / field.cell_m));
  const los = (a: LinkNode, b: LinkNode): boolean => lineOfSight(grid, { x_m: a.x_m, y_m: a.y_m, height_m: a.antenna_m }, { x_m: b.x_m, y_m: b.y_m, height_m: b.antenna_m });
  const hab: LinkNode = { node_id: "HAB", kind: "hab", x_m: mast.x_m, y_m: mast.y_m, antenna_m: mast.height_m };

  let best: (RelayTarget & { key: [number, number] }) | null = null;
  for (let i = 0; i < field.height; i += k) {
    for (let j = 0; j < field.width; j += k) {
      const arrival_s = field.seconds[i * field.width + j]!;
      if (!(arrival_s <= budget_s)) continue;
      const x = field.origin_m[0] + (j + 0.5) * field.cell_m;
      const y = field.origin_m[1] - (i + 0.5) * field.cell_m;
      if (Math.hypot(x - mast.x_m, y - mast.y_m) > range) continue;
      const relay: LinkNode = { node_id: "UR1", kind: "rover", x_m: x, y_m: y, antenna_m: antenna };
      if (!los(hab, relay) || !los(relay, hab)) continue;
      let covered = 0;
      for (const [sx, sy] of route) {
        const suit: LinkNode = { node_id: "EV1", kind: "suit", x_m: sx, y_m: sy, antenna_m: input.suit_antenna_m };
        if (linkStates([hab, relay, suit], los, link, "2000-01-01T00:00:00Z").find((s) => s.node_id === "EV1")!.linked_to_hab) covered++;
      }
      const better =
        best === null ||
        covered > best.covered ||
        (covered === best.covered && (arrival_s < best.arrival_s || (arrival_s === best.arrival_s && (y < best.key[1] || (y === best.key[1] && x < best.key[0])))));
      if (better) best = { x_m: x, y_m: y, arrival_s, covered, total: route.length, key: [x, y] };
    }
  }
  if (best === null) return null;
  const { key: _key, ...target } = best;
  return target;
}

/** Seconds between two UTC instants. */
const secondsBetween = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / 1000;

/** The relay target for a replay log (the CLI form); the log holds the options and the first shadow. */
export function relayTargetFromLog(events: readonly LogEvent[], root: string = REPO_ROOT, scenarioDir: string = join(root, "scenarios/storm-sol4190")): RelayTarget & { shadow_utc: string; alert_utc: string } {
  const shadow = events.find((e) => e.kind === "ALERT_RAISED" && (e.data as { code?: string }).code === "COMM_SHADOW");
  const options = events.find((e) => e.kind === "OPTIONS_PROPOSED");
  if (shadow === undefined || options === undefined) throw new Error("relay-target: the log has no COMM_SHADOW alert or no OPTIONS_PROPOSED");
  const rendezvous = ((options.data as { options: { kind: string; path_preview: [number, number][] }[] }).options).find((o) => o.kind === "VEHICLE_RENDEZVOUS");
  if (rendezvous === undefined) throw new Error("relay-target: no VEHICLE_RENDEZVOUS option in the log");
  const sc = loadForReplay(scenarioDir);
  if (sc.grid === null || sc.comm === null) throw new Error("relay-target: the scenario has no grid or comm grid");
  const rover = Object.values(sc.params).find((p) => p.kind === "utility_rover");
  const link = Object.values(sc.params).find((p) => p.kind === "link");
  const ur = sc.scenario.vehicles.find((v) => v.kind === "utility_rover");
  const suit = sc.params[sc.scenario.crew[0]!.suit_param_set];
  if (!rover || !link || !ur || !suit) throw new Error("relay-target: the scenario lacks the utility rover, the link or the suit ParamSet");
  const target = findRelayTarget({
    grid: sc.grid,
    mast: sc.comm.hab_mast,
    route: rendezvous.path_preview,
    rover: sc.params[ur.param_set] ?? rover,
    link,
    suit_antenna_m: num(suit, "antenna_m"),
    from: { x_m: ur.start_x_m, y_m: ur.start_y_m },
    budget_s: secondsBetween(shadow.sim_time, options.sim_time),
    stride_m: 100,
  });
  if (target === null) throw new Error("relay-target: no cell qualifies");
  return { ...target, shadow_utc: shadow.sim_time, alert_utc: options.sim_time };
}

const isMain = ((): boolean => {
  const arg = process.argv[1];
  if (!arg || !existsSync(arg)) return false;
  return realpathSync(arg) === realpathSync(fileURLToPath(import.meta.url));
})();
if (isMain) {
  const i = process.argv.indexOf("--log");
  const file = i >= 0 ? process.argv[i + 1] : undefined;
  if (!file) throw new Error("usage: relay-target --log <session.jsonl>");
  const events = readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l) as LogEvent);
  console.log(JSON.stringify(relayTargetFromLog(events), null, 2));
}
