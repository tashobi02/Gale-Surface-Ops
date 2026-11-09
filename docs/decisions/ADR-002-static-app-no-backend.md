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

> **2026-11-09 reconciliation note:** The outcome above cites p50/p95 1.22/8.79 ms and a 10.19 ms loop; that run is not present in the linked verification log. The linked T05.28 section records a `mock_site-2026.11.05` baseline with p50/p95 0.70/4.86 ms and one 6.56 ms loop. TODO(verify): locate the cited run and record its data_version, machine and raw output. TODO(decision): the compute lead must review the D-02 evidence after T05.28 real-grid verification. This annotation preserves the recorded decision.
