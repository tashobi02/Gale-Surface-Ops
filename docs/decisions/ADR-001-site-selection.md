# ADR-001 — Site selection (D-01)

| | |
| --- | --- |
| **Owner** | Product — owning spec: [01 §F.4 Unresolved decisions](../specs/01_Product_Requirements_Document.md#f4-unresolved-decisions-owned-by-this-document) |
| **Date** | 2026-11-02 |
| **Status** | Proposed |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [01 §F.3 Risks](../specs/01_Product_Requirements_Document.md#f3-risks) · [01 §F.2 A-01](../specs/01_Product_Requirements_Document.md#f2-key-assumptions) · [02 §C.2 L2 Topography](../specs/02_Technical_Requirements_Document.md#l2--topography-elevation-hillshade-fr-02-fr-03-fr-08) · [06 §C TASK-01](../specs/06_High_Level_Implementation_Plan.md#c-work-packages) |

This record mirrors D-01 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

Site = Mount Sharp boxwork, Gale crater (challenge's own example; only site with surface radiation measurements).

## Alternative / trigger

Jezero (M2020 TRN HiRISE DTM) if the Gale DEM is not HiRISE-quality in the AOI.

## Resolution path

- 01 §F.4 recommendation: "Gale crater, Mount Sharp boxwork region; fallback Jezero".
- 06 §E: "Decide D-01 by 5 Nov: Gale boxwork if DEM passes, else Jezero." The DEM check is TASK-01, recorded in [ops/feasibility.md](../ops/feasibility.md).
