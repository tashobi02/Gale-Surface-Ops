/**
 * Real-grid mode of the haven and viewshed benchmarks (T05b.05, T05b.20; BD-03, BD-61; 02 §F NFR-02).
 *
 *   npx tsx packages/compute/bench/haven.bench.ts --real
 *   npx tsx packages/compute/bench/viewshed.bench.ts --real
 *
 * Loads `data/sites/gale_boxwork/` from disk (grid symlinks must resolve) and times the real arrays: one warm-up and
 * five timed runs per case, a fresh grid per haven iteration (cold: the per-grid lattice cache cannot serve it), the
 * BD-03 machine line beside the numbers, and a GO / NO-GO line against the limit. The hab is the rank-1 candidate.
 * Nothing is typed in: positions come from the manifest, parameters from the test fixtures' ParamSets.
 */
import { crewTimeField, habTimeField, vehicleTimeField } from "../src/haven";
import { RELAY_VIEWSHED_CELL_M, RELAY_VIEWSHED_RADIUS_M, viewshed } from "../src/viewshed";
import { defaultScenario, pr1Params, MAST_HEIGHT_M, SUIT_ANTENNA_M } from "../tests/fixtures/v2grids";
import { REAL_SITE_DIR, hasRealBundle, loadSiteGrid, machineLine, readManifest } from "../tests/fixtures/realSite";

const WARMUPS = 1;
const RUNS = 5;
/** 02 §F NFR-02 / T05b.05: full-grid haven field. */
const HAVEN_GO_MS = 2000;
/** 02 §D.11: relay viewshed. */
const VIEWSHED_GO_MS = 1000;

export const realMode = (): boolean => process.argv.includes("--real") || process.env.MARSWALK_BENCH_REAL === "1";

function stats(xs: number[]): string {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return `min ${s[0]!.toFixed(0)} median ${median.toFixed(0)} max ${s[s.length - 1]!.toFixed(0)} ms (runs ${xs.map((v) => v.toFixed(0)).join(" ")})`;
}

function requireBundle(): void {
  if (!hasRealBundle) throw new Error("real bundle absent: data/sites/gale_boxwork/grid/ does not resolve (SSD symlinks)");
}

function timeRuns(prepare: () => unknown, run: (input: never) => unknown): number[] {
  const out: number[] = [];
  for (let i = 0; i < WARMUPS + RUNS; i++) {
    const input = prepare();
    const t0 = performance.now();
    run(input as never);
    const dt = performance.now() - t0;
    if (i >= WARMUPS) out.push(dt);
  }
  return out;
}

export function runHavenReal(): void {
  requireBundle();
  const manifest = readManifest();
  const hab = manifest.hab_candidates.find((c) => c.rank === 1)!.hab_mast;
  const scenario = defaultScenario();
  const { width, height, cell_m } = manifest.grid;
  const cold = timeRuns(() => loadSiteGrid(REAL_SITE_DIR), (g: ReturnType<typeof loadSiteGrid>) => habTimeField(g, hab, scenario));
  const crew = timeRuns(() => loadSiteGrid(REAL_SITE_DIR), (g: ReturnType<typeof loadSiteGrid>) => crewTimeField(g, hab, scenario, scenario.max_haven_min * 60));
  const veh = timeRuns(() => loadSiteGrid(REAL_SITE_DIR), (g: ReturnType<typeof loadSiteGrid>) => vehicleTimeField(g, hab, pr1Params));
  const worst = Math.max(...cold);
  const reached = habTimeField(loadSiteGrid(REAL_SITE_DIR), hab, scenario).seconds.reduce((n, t) => n + (Number.isFinite(t) ? 1 : 0), 0);
  console.log(
    [
      "",
      `T05b.05 haven benchmark, REAL grid (${manifest.data_version})`,
      `  machine : ${machineLine()}, via tsx (not the browser worker)`,
      `  grid    : ${width} x ${height} cells at ${cell_m} m, hab (${hab.x_m}, ${hab.y_m}) = rank-1 candidate`,
      `  runs    : ${WARMUPS} warm-up + ${RUNS} timed per case; cold = fresh grid object per iteration`,
      `  reached : ${reached} of ${width * height} cells (the rest are over the ${scenario.hard_slope_limit_deg} deg limit, hazards or no data)`,
      `  habTimeField, cold  : ${stats(cold)}`,
      `  crewTimeField, cold, ${scenario.max_haven_min} min bound: ${stats(crew)}`,
      `  vehicleTimeField, cold: ${stats(veh)}`,
      `  worst cold habTimeField run: ${worst.toFixed(0)} ms (limit ${HAVEN_GO_MS} ms)`,
      `  VERDICT (this machine, BD-03): ${worst <= HAVEN_GO_MS ? "GO" : "NO-GO (T05b.21 fallback)"}`,
      "",
    ].join("\n"),
  );
}

export function runViewshedReal(): void {
  requireBundle();
  const manifest = readManifest();
  const grid = loadSiteGrid(REAL_SITE_DIR);
  const mast = manifest.hab_candidates.find((c) => c.rank === 1)!.hab_mast;
  const { width, height, cell_m, origin_m } = manifest.grid;
  const spots: [string, number, number][] = [
    ["hab-first mast", mast.x_m, mast.y_m],
    ...(
      [
        ["AOI centre", height / 2, width / 2],
        ["NE quadrant", height / 4, (3 * width) / 4],
        ["NW quadrant", height / 4, width / 4],
        ["SE quadrant", (3 * height) / 4, (3 * width) / 4],
        ["SW quadrant", (3 * height) / 4, width / 4],
      ] as [string, number, number][]
    ).map(([label, row, col]): [string, number, number] => [label, origin_m[0] + (col + 0.5) * cell_m, origin_m[1] - (row + 0.5) * cell_m]),
  ];
  const lines: string[] = [];
  let worst = 0;
  for (const [label, x, y] of spots) {
    let visible = 0;
    const runs = timeRuns(
      () => null,
      () => {
        const cov = viewshed(grid, { x_m: x, y_m: y, height_m: MAST_HEIGHT_M }, SUIT_ANTENNA_M, RELAY_VIEWSHED_RADIUS_M, RELAY_VIEWSHED_CELL_M);
        visible = cov.visible.reduce((a, b) => a + b, 0);
      },
    );
    worst = Math.max(worst, ...runs);
    lines.push(`  ${label.padEnd(15)}: ${stats(runs)}; ${visible} visible cells`);
  }
  console.log(
    [
      "",
      `T05b.20 viewshed benchmark, REAL grid (${manifest.data_version})`,
      `  machine : ${machineLine()}, via tsx (not the browser worker)`,
      `  viewshed: ${RELAY_VIEWSHED_RADIUS_M} m radius, output ${(2 * RELAY_VIEWSHED_RADIUS_M) / RELAY_VIEWSHED_CELL_M} x ${(2 * RELAY_VIEWSHED_RADIUS_M) / RELAY_VIEWSHED_CELL_M} cells at ${RELAY_VIEWSHED_CELL_M} m; antenna ${MAST_HEIGHT_M} m, target ${SUIT_ANTENNA_M} m`,
      `  runs    : ${WARMUPS} warm-up + ${RUNS} timed per viewpoint`,
      ...lines,
      `  worst run: ${worst.toFixed(0)} ms (limit ${VIEWSHED_GO_MS} ms, 02 §D.11)`,
      `  VERDICT (this machine, BD-03): ${worst <= VIEWSHED_GO_MS ? "GO" : "NO-GO"}`,
      "",
    ].join("\n"),
  );
}
