/**
 * T05b.05: haven benchmark and M1 go/no-go (FR-39, NFR-02; docs/specs/02 §F NFR-02, 06 §B M1;
 * docs/tasks/TASK-05b_compute-v2.md T05b.05, where the rule below is Proposed).
 *
 * Run on the weakest team laptop, plugged in, nothing else running (`--run` is required: without it Vitest bench
 * waits for file changes; `--reporter=verbose` is required to see the report, the default reporter hides console
 * output in bench mode):
 *
 *   npm --workspace @marswalk/compute run bench
 *   (same as: npx --no-install vitest bench --run --reporter=verbose --root packages/compute)
 *
 * What is timed: ONE full-grid `habTimeField` on a grid the size of the AOI in `pipeline/sites/gale_boxwork/site.json`
 * at the 5 m haven cell (see `grid.ts`; the size is derived, never typed), on two deterministic terrains, flat and
 * rough. Every iteration gets a FRESH grid built outside the timed window, so the per-grid lattice cache in
 * `haven.ts` cannot serve runs 2 to 5: each timed call includes building the lattice, which is what the first call
 * after a plan load costs. One untimed warm-up iteration (JIT) precedes the five timed ones.
 *
 * Decision rule (Proposed, TASK-05b T05b.05): GO if the worst of the five cold runs, on both terrains, is
 * GO_LIMIT_MS or less. Median and minimum are printed too but do not decide. Context cases (not the decision):
 * a warm `habTimeField` on one grid, `crewTimeField` (30 min bound), `vehicleTimeField`, `liveHaven`.
 *
 * No timing assertion: this file is outside `test.include`, so `make test-web` and CI never run it, and it never
 * fails on a slow machine; it prints the verdict. The numbers go into docs/ops/verification-log.md by hand
 * (T05b.05 section: machine, times, verdict).
 */
import { cpus, platform, release, totalmem } from "node:os";
import { describe, test } from "vitest";
import type { Bench } from "vitest";
import type { LoadedGrid } from "../src/grid";
import { crewTimeField, habTimeField, liveHaven, vehicleTimeField, vehiclePassable } from "../src/haven";
import type { TimeField } from "../src/haven";
import { HAVEN_CELL_M, defaultScenario, pr1Params } from "../tests/fixtures/v2grids";
import { benchGridSize, buildBenchGrid, readBenchSite } from "./grid";
import type { Terrain } from "./grid";

/** Proposed: "go (≤ 2 s)" in TASK-05b T05b.05 (NFR-02). */
const GO_LIMIT_MS = 2000;
/** One warm-up and five timed iterations: the T05b.05 step ("five runs, median and worst"). */
const RUN_OPTIONS = { iterations: 5, warmupIterations: 1, time: 0, warmupTime: 0 } as const;
/** The crew field is bounded by max_haven_min (05 MissionScenario default 30 min = 1800 s), 02 §D.8. */
const CREW_LIMIT_S = defaultScenario().max_haven_min * 60;

const site = readBenchSite();
const scenario = defaultScenario();

interface Row {
  name: string;
  kind: "cold" | "warm" | "context";
  runs_ms: number[];
  min_ms: number;
  median_ms: number;
  max_ms: number;
  /** First call of the case (the warm-up iteration, JIT included). Informational only. */
  first_ms: number;
}
const rows: Row[] = [];

function stats(samples: number[]): { min: number; median: number; max: number } {
  const s = [...samples].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { min: s[0]!, median: s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2, max: s[s.length - 1]! };
}

/**
 * Register one benchmark with a per-iteration `prepare` (outside the timed window) and run it now.
 * Samples come from tinybench's retained latency samples (milliseconds).
 */
async function runCase<I>(bench: Bench, name: string, kind: Row["kind"], prepare: () => I, timed: (input: I) => unknown): Promise<Row> {
  let input!: I;
  let first_ms = NaN;
  const reg = bench(name, { beforeEach: () => void (input = prepare()), retainSamples: true }, () => {
    if (Number.isNaN(first_ms)) {
      // The first call is the warm-up iteration (JIT included); it is not one of the five timed samples.
      const t0 = performance.now();
      timed(input);
      first_ms = performance.now() - t0;
    } else {
      timed(input);
    }
  });
  const res = await reg.run(RUN_OPTIONS);
  const samples = res.latency.samples;
  if (!Array.isArray(samples) || samples.length !== RUN_OPTIONS.iterations) {
    throw new Error(`${name}: expected ${RUN_OPTIONS.iterations} retained samples, got ${samples?.length}`);
  }
  const st = stats(samples);
  const row: Row = { name, kind, runs_ms: [...samples], min_ms: st.min, median_ms: st.median, max_ms: st.max, first_ms };
  rows.push(row);
  return row;
}

const fixed = (x: number): string => x.toFixed(0).padStart(6);

function printReport(): void {
  const cold = rows.filter((r) => r.kind === "cold");
  const worst = Math.max(...cold.map((r) => r.max_ms));
  const size = benchGridSize(site.extent_m, HAVEN_CELL_M);
  const firstRough = rows.find((r) => r.name === "habTimeField, cold, rough");
  const lines = [
    "",
    "T05b.05 haven benchmark",
    `  machine : ${cpus()[0]?.model ?? "unknown CPU"} x${cpus().length}, ${(totalmem() / 2 ** 30).toFixed(0)} GiB RAM, ${platform()} ${release()}, node ${process.version} via Vitest, not the browser worker`,
    `  grid    : ${size.width} x ${size.height} cells at ${HAVEN_CELL_M} m (derived from site.json aoi.extent_m), hab (${site.hab.x_m}, ${site.hab.y_m})`,
    `  runs    : 1 warm-up + ${RUN_OPTIONS.iterations} timed per case; cold = fresh grid per iteration`,
    "",
    `  ${"case".padEnd(46)} ${"kind".padEnd(8)} ${"min".padStart(6)} ${"median".padStart(6)} ${"max".padStart(6)}   runs (ms)`,
    ...rows.map(
      (r) =>
        `  ${r.name.padEnd(46)} ${r.kind.padEnd(8)} ${fixed(r.min_ms)} ${fixed(r.median_ms)} ${fixed(r.max_ms)}   ${r.runs_ms.map((v) => v.toFixed(0)).join(" ")}`,
    ),
    "",
    `  info    : first call of "habTimeField, cold, rough" (the warm-up, JIT included): ${firstRough ? firstRough.first_ms.toFixed(0) : "n/a"} ms; not part of the verdict`,
    `  worst cold run: ${worst.toFixed(0)} ms (limit ${GO_LIMIT_MS} ms, Proposed)`,
    `  VERDICT (this machine): ${worst <= GO_LIMIT_MS ? "GO" : "NO-GO (T05b.21 fallback)"}; only the weakest team laptop counts`,
    "",
  ];
  console.log(lines.join("\n"));
}

describe("T05b.05 haven benchmark", () => {
  test(
    "one full-grid T_hab field on an AOI-size grid",
    async ({ bench }) => {
      rows.length = 0; // a retry must not duplicate rows
      for (const terrain of ["flat", "rough"] as Terrain[]) {
        await runCase(bench, `habTimeField, cold, ${terrain}`, "cold", () => buildBenchGrid(site, terrain), (g) =>
          habTimeField(g, site.hab, scenario),
        );
      }

      // Warm: the same grid object every iteration, so the lattice cache serves runs 2 to 5 (reported only).
      const warmGrid: LoadedGrid = buildBenchGrid(site, "rough");
      habTimeField(warmGrid, site.hab, scenario);
      await runCase(bench, "habTimeField, warm (lattice cached), rough", "warm", () => warmGrid, (g) => habTimeField(g, site.hab, scenario));

      // Context cases on the rough terrain (cold for the fields that build a lattice; liveHaven reads fields only).
      await runCase(
        bench,
        `crewTimeField, cold, rough, ${scenario.max_haven_min} min bound`,
        "context",
        () => buildBenchGrid(site, "rough"),
        (g) => crewTimeField(g, site.hab, scenario, CREW_LIMIT_S),
      );
      await runCase(bench, "vehicleTimeField, cold, rough", "context", () => buildBenchGrid(site, "rough"), (g) =>
        vehicleTimeField(g, site.hab, pr1Params),
      );

      const g = buildBenchGrid(site, "rough");
      const hab: TimeField = habTimeField(g, site.hab, scenario);
      const crew: TimeField = crewTimeField(g, site.hab, scenario, CREW_LIMIT_S);
      const veh: TimeField = vehicleTimeField(g, site.hab, pr1Params);
      const passable = vehiclePassable(g, pr1Params);
      const ingress = { hab_s: 0, vehicle_s: 0 };
      await runCase(bench, "liveHaven (fields given), rough", "context", () => null, () =>
        liveHaven(hab, crew, veh, passable, ingress, site.hab),
      );

      printReport();
    },
    900_000,
  );
});
