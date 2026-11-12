# ADR-002 — Static web app, no backend (D-02)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §A.1 System boundary](../specs/02_Technical_Requirements_Document.md#a1-system-boundary) |
| **Date** | 2026-11-02 |
| **Status** | **Superseded 2026-11-04** by [ADR-008](ADR-008-hab-core-local-server.md) (v2 surface ops) |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [02 §A.3 Why no backend](../specs/02_Technical_Requirements_Document.md#a3-why-a-habitat-server-now-proposed--reverses-v1-d-02) · [02 Unresolved decisions](../specs/02_Technical_Requirements_Document.md#unresolved-decisions-owned-by-this-document) · [06 §D.5 Data and service fallbacks](../specs/06_High_Level_Implementation_Plan.md#d5-data-and-service-fallbacks) |

> Superseded. v2 adds a habitat-local server (Hab Core); the planner keeps its browser worker, so the reasoning below still applies to planner-only use. Kept for history.

This record mirrors D-02 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

Static web app + offline Python pipeline; no backend, no database.

## Alternative / trigger

FastAPI if browser routing p95 > 2 s.

## Resolution path

- 02 Unresolved table: "Keep static unless TASK-05 router benchmark > 2 s p95".

## Outcome (2026-11-08)

D-02 benchmark measurement recorded by T05.28:

- **Evidence:** `packages/compute/tests/realGrid.test.ts` measured 20 seeded pairs inside the AOI (p50 = 1.22 ms, p95 = 8.79 ms) and a 4-leg 3-stop loop route through the compute worker (10.19 ms) on Node.js v22.18.0 (Windows x64). Full log in [verification-log.md](../ops/verification-log.md#t0528--verify-on-the-real-grid-10-sampled-cells-20-pairs-p50p95-3-stop-loop--2-s).
- **Result:** p95 is 8.79 ms ≪ 2.0 s threshold (NFR-02 compliant).
- **Decision:** Confirmed static Web Worker routing. Fallback T05.31 (FastAPI `/route` backend) is **not triggered**. Signed off for the compute lane by Mishkat Ahmed Khan.

> **2026-11-09 reconciliation note:** The outcome above cites p50/p95 1.22/8.79 ms and a 10.19 ms loop; that run is not present in the linked verification log. The linked T05.28 section records a `mock_site-2026.11.05` baseline with p50/p95 0.70/4.86 ms and one 6.56 ms loop. The cited run was not found; it is superseded by the real-grid figures in the 2026-11-13 outcome below. This annotation preserves the recorded decision.

## Clarification (2026-11-10)

Evidence status for T05.29, not a retraction: the outcome, decision and 2026-11-09 reconciliation note above are kept as recorded.

- **Mock-baseline evidence.** The only run linked from [verification-log.md](../ops/verification-log.md#t0528--verify-on-the-real-grid-10-sampled-cells-20-pairs-p50p95-3-stop-loop--2-s) is the `mock_site-2026.11.05` fixture baseline: 20 seeded pairs (p50 = 0.70 ms, p95 = 4.86 ms) and one 4-leg 3-stop loop of 6.56 ms through the compute worker (Node.js v22.18.0, Windows x64). These are mock planner-routing measurements: `packages/compute/tests/realGrid.test.ts` calls `searchLeg` (A* with an admissible time heuristic, `packages/compute/src/route.ts`) and `handleWorkerMessage`. They are not a real-grid result, and the loop is a single run, not a p95.
- **Relation to ADR-008.** In v2 ([ADR-008](ADR-008-hab-core-local-server.md)) the habitat-local Hab Core adds multi-client synchronization, while the planner keeps routing in the browser Web Worker. The measurements above therefore concern planner routing only. They are not evidence about the multi-destination haven and rendezvous computations adopted in ADR-008; any performance claim for those needs its own benchmark.
- **Closed on 2026-11-13.** The real-grid measurement on `data/sites/gale_boxwork/` was made by package 24 and is recorded in the 2026-11-13 outcome below. T05.31 (FastAPI `/route` fallback) is not triggered.

## Outcome (2026-11-13, real grid)

Measured on the real `gale_boxwork-2026.11.09` bundle (1200 x 1200 cells at 5 m) by `packages/compute/tests/realGrid.test.ts`, `packages/compute/tests/realGridVerify.test.ts` and `packages/compute/bench/real.ts`, on an Apple M2, 8 cores, 8 GiB RAM, macOS 15.7.2 (darwin 24.6.0), Node v24.5.0 (BD-03 machine line). Raw output: [verification-log.md](../ops/verification-log.md#t0528-t05b05-t05b20--real-grid-benchmarks-and-independent-checks-backend-package-24).

- **Planner routing (T05.28).** 20 seeded pairs on the real grid: 14 routes and 6 no-route answers (random points on terrain over the slope limit), no crash; p50 63 ms, p95 1,081 ms. p95 is below the 2 s threshold, so the static Web Worker decision stands and T05.31 is **not triggered**. A 3-stop loop through the handler took 11 to 14 ms (five runs after one warm-up).
- **Haven (T05b.05).** Full-grid `habTimeField` from the rank-1 hab, cold: 52 to 57 ms; the field reaches 169,064 of 1,440,000 cells. The worst case on a synthetic all-passable terrain of the same size is 407 ms. Both are below 2 s: GO, T05b.21 is not triggered.
- **Viewshed (T05b.20).** One 4 km / 20 m relay viewshed on the real grid took 74 to 154 ms at six viewpoints (BD-61 limit 1 s): GO. A synthetic all-visible flat terrain takes 4.4 to 4.7 s, a case Gale does not contain; the engine computes a relay viewshed once per relay position and caches it, so no change to the algorithm is made (BD-141).
- **Decision.** D-02 is confirmed on real-grid evidence: static Web Worker routing, no FastAPI backend.
