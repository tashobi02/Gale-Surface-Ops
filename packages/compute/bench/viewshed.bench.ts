/**
 * T05b.09 viewshed benchmark (FR-42, NFR-02; docs/specs/02 §D.11: "relay rover viewsheds on a 20 m grid within
 * 4 km of the rover; ≤ 1 s in Node (TASK-05b benchmark)").
 *
 * Run (the same flags as `haven.bench.ts`; `--run` and `--reporter=verbose` are required to see the report):
 *
 *   npm --workspace @marswalk/compute run bench -- viewshed
 *
 * What is timed: ONE `viewshed(grid, rover, target_height, RELAY_VIEWSHED_RADIUS_M, RELAY_VIEWSHED_CELL_M)` on a
 * 5 m grid that exactly covers the 4 km radius (8 km square, 1600 x 1600 cells, built by `buildBenchGrid` with the
 * site's hab position as the rover position), on the flat and the rough bench terrain. One untimed warm-up
 * (JIT) and five timed runs; min, median and max are printed with a GO / NO-GO line against the 1 s budget.
 * Antenna heights are the Assumed fixture values from `v2grids.ts` (mast 10 m, suit 2 m).
 *
 * No timing assertion: this file is outside `test.include`, so `make test-web` and CI never run it and it never
 * fails on a slow machine. The measured numbers go into docs/ops/verification-log.md by hand (T05b.20 timings
 * on the weakest team laptop).
 */
import { cpus, platform, release, totalmem } from "node:os";
import { describe, test } from "vitest";
import { runViewshedReal, realMode } from "./real";
import { RELAY_VIEWSHED_CELL_M, RELAY_VIEWSHED_RADIUS_M, viewshed } from "../src/viewshed";
import { MAST_HEIGHT_M, SUIT_ANTENNA_M } from "../tests/fixtures/v2grids";
import { buildBenchGrid, readBenchSite } from "./grid";
import type { Terrain } from "./grid";

/** 02 §D.11: "≤ 1 s in Node". */
const GO_LIMIT_MS = 1000;
const WARMUP_RUNS = 1;
const TIMED_RUNS = 5;
/** Bench grid cell (the 5 m grid of 02 §C.5); the extent below is 2 x radius in cells of this size. */
const GRID_CELL_M = 5;

const site = readBenchSite();
const R = RELAY_VIEWSHED_RADIUS_M;
const rover = { x_m: site.hab.x_m, y_m: site.hab.y_m, height_m: MAST_HEIGHT_M };
const extent_m: [number, number, number, number] = [rover.x_m - R, rover.y_m - R, rover.x_m + R, rover.y_m + R];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

if (realMode()) {
  runViewshedReal();
} else {
describe("T05b.09 viewshed benchmark", () => {
  test(
    "one 4 km / 20 m relay viewshed",
    () => {
      const lines = [
        "",
        "T05b.09 viewshed benchmark",
        `  machine : ${cpus()[0]?.model ?? "unknown CPU"} x${cpus().length}, ${(totalmem() / 2 ** 30).toFixed(0)} GiB RAM, ${platform()} ${release()}, node ${process.version} via Vitest, not the browser worker`,
        `  grid    : ${(2 * R) / GRID_CELL_M} x ${(2 * R) / GRID_CELL_M} cells at ${GRID_CELL_M} m; output ${(2 * R) / RELAY_VIEWSHED_CELL_M} x ${(2 * R) / RELAY_VIEWSHED_CELL_M} cells at ${RELAY_VIEWSHED_CELL_M} m`,
        `  runs    : ${WARMUP_RUNS} warm-up + ${TIMED_RUNS} timed per terrain`,
      ];
      let worst = 0;
      for (const terrain of ["flat", "rough"] as Terrain[]) {
        const grid = buildBenchGrid({ extent_m, hab: site.hab }, terrain, GRID_CELL_M);
        const runs: number[] = [];
        let visible = 0;
        for (let i = 0; i < WARMUP_RUNS + TIMED_RUNS; i++) {
          const t0 = performance.now();
          const cov = viewshed(grid, rover, SUIT_ANTENNA_M, R, RELAY_VIEWSHED_CELL_M);
          const dt = performance.now() - t0;
          visible = cov.visible.reduce((a, b) => a + b, 0);
          if (i >= WARMUP_RUNS) runs.push(dt);
        }
        const max = Math.max(...runs);
        worst = Math.max(worst, max);
        lines.push(
          `  ${terrain.padEnd(5)}: min ${Math.min(...runs).toFixed(0)} median ${median(runs).toFixed(0)} max ${max.toFixed(0)} ms (runs ${runs.map((v) => v.toFixed(0)).join(" ")}); ${visible} visible cells`,
        );
      }
      lines.push(
        `  worst run: ${worst.toFixed(0)} ms (limit ${GO_LIMIT_MS} ms, 02 §D.11)`,
        `  VERDICT (this machine): ${worst <= GO_LIMIT_MS ? "GO" : "NO-GO"}; only the weakest team laptop counts`,
        "",
      );
      console.log(lines.join("\n"));
    },
    900_000,
  );
});
}
