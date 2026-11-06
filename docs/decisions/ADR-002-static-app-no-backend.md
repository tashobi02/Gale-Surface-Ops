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
