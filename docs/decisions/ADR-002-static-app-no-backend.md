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

## Outcome (draft — pending real-grid measurement)

D-02 benchmark measurement drafted from the mock disk fixture baseline (T05.28):

- **Status note (relation to ADR-008):** In v2 ([ADR-008](ADR-008-hab-core-local-server.md)), a habitat-local server is introduced for multi-client synchronization, but the browser Web Worker remains the execution environment for single-destination and excursion route planning. The single-destination Dijkstra kernel measured here establishes the baseline performance and bounds the compute cost for the multi-destination Dijkstra fields (haven and rendezvous) adopted in ADR-008.
- **Mock baseline evidence:** `packages/compute/tests/realGrid.test.ts` measured 20 seeded pairs inside the AOI (p50 = 0.70 ms, p95 = 4.86 ms) and a 4-leg 3-stop loop route through the compute worker (6.56 ms) on the mock disk fixture (`mock_site-2026.11.05`, Node.js v22.18.0, Windows x64). Full log in [verification-log.md](../ops/verification-log.md#t0528--verify-on-the-real-grid-10-sampled-cells-20-pairs-p50p95-3-stop-loop--2-s).
- **Current status:** Adoption remains **pending real-grid measurement** on the full Gale crater bundle (`data/sites/gale_boxwork/`, T03.19/T03.21). The mock disk fixture indicates routing times well below the 2.0 s threshold (6.56 ms ≪ 2.0 s), but final confirmation and sign-off belong to the systems lead (Sadman Shaharier Mahim) once real-grid measurements land. Fallback T05.31 (FastAPI `/route` backend) is currently not triggered.
