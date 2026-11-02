# ADR-004 — Least-time A* routing (D-04)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §D.2 Route planning](../specs/02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10) |
| **Date** | 2026-11-02 |
| **Status** | Proposed |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [06 §D.4 Cut list](../specs/06_High_Level_Implementation_Plan.md#d4-cut-list-cut-in-this-order-when-behind) · [06 §D.3 Integration checkpoints](../specs/06_High_Level_Implementation_Plan.md#d3-integration-checkpoints) |

This record mirrors D-04 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

Least-time A* on a 5 m grid between user-ordered stops; hard slope limit; caution multipliers.

## Alternative / trigger

Manual polyline + validation (cut-list item 6).

## Resolution path

- 06 §D.3: walking skeleton at Day 1 12:30 is the "go/no-go on auto-routing".
- 06 §D.4 item 6: "Auto-routing → manual polyline + validation".
