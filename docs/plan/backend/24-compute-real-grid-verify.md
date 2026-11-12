# 24 — Compute on the real grid: benchmarks and independent checks

| | |
| --- | --- |
| **Subtasks** | T05.28, T05.29, T05b.01, T05b.05, T05b.20 |
| **Depends on** | 23, 14, 15 |
| **Branch** | `be/24-real-grid-verify` |
| **Spec refs** | 02 §F NFR-02, §D.8, §D.10, §D.11; ADR-002; decisions BD-03, BD-61, BD-63 |

## Files

`packages/compute/tests/realGrid.test.ts` (reads F5 and the real bundle; skips with a printed reason when `data/sites/gale_boxwork/grid/` is absent) · `packages/compute/bench/haven.bench.ts`, `viewshed.bench.ts` (real-grid mode) · `docs/ops/verification-log.md` (append) · `docs/decisions/ADR-002-static-app-no-backend.md` (outcome with the real figures)

## Steps

1. T05.28: 10 F5 cells (elevation exact, slope exact against the decoded grid); 20 seeded stop pairs → p50/p95 of `searchLeg`; one 3-stop loop ≤ 2 s.
2. T05b.05: full-grid `habTimeField` cold, 1 warm-up + 5 runs, GO if worst ≤ 2 s.
3. T05b.20: haven vs an independent Dijkstra oracle on a 200 × 200 crop; rendezvous vs brute force on the crop; viewshed vs `gdal_viewshed` at 5 points; viewshed time ≤ 1 s (BD-61).
4. Record each value with the BD-03 machine line; update ADR-002's outcome with these figures (replacing the reconciliation note's open items).
5. T05b.01: `contracts.test.ts` green → done (BD-63).
6. Trigger checks for package 29: p95 ≤ 2 s (else T05.31 runs), haven GO (else T05b.21 runs).

## Automated verification

`npm --workspace @marswalk/compute test -- realGrid contracts` (0 skipped with the bundle present); `npx tsx packages/compute/bench/haven.bench.ts --real` and `viewshed.bench.ts --real` outputs pasted into the log.

## Status rows

```text
| T05.28 | done | <commit date> | Real-grid cells, p50/p95 and 3-stop loop recorded in the verification log (BD-03 machine line) |
| T05.29 | done | <commit date> | ADR-002 outcome updated with the real-grid figures |
| T05b.01 | done | <commit date> | Contracts accepted as implemented (BD-63); contracts.test.ts green |
| T05b.05 | done | <commit date> | Full-grid haven benchmark GO/NO-GO recorded |
| T05b.20 | done | <commit date> | Haven, rendezvous, viewshed vs independent checks; NFR-02 timings |
```

## Done when

All five rows are evidenced in the verification log.
