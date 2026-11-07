# ADR-001 — Site selection (D-01)

| | |
| --- | --- |
| **Owner** | Product — owning spec: [01 §F.4 Unresolved decisions](../specs/01_Product_Requirements_Document.md#f4-unresolved-decisions-owned-by-this-document) |
| **Date** | 2026-11-02; decided 2026-11-07 |
| **Status** | Accepted (2026-11-07) |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [01 §F.3 Risks](../specs/01_Product_Requirements_Document.md#f3-risks) · [01 §F.2 A-01](../specs/01_Product_Requirements_Document.md#f2-key-assumptions) · [02 §C.2 L2 Topography](../specs/02_Technical_Requirements_Document.md#l2--topography-elevation-hillshade-fr-02-fr-03-fr-08) · [06 §C TASK-01](../specs/06_High_Level_Implementation_Plan.md#c-work-packages) |

This record mirrors D-01 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

Site = Mount Sharp boxwork, Gale crater (challenge's own example; only site with surface radiation measurements).

## Alternative / trigger

Jezero (M2020 TRN HiRISE DTM) if the Gale DEM is not HiRISE-quality in the AOI.

## Resolution path

- 01 §F.4 recommendation: "Gale crater, Mount Sharp boxwork region; fallback Jezero".
- 06 §E: "Decide D-01 by 5 Nov: Gale boxwork if DEM passes, else Jezero." The DEM check is TASK-01, recorded in [ops/feasibility.md](../ops/feasibility.md).

## Outcome (2026-11-07)

**Accepted: Gale crater, Mount Sharp boxwork.** Recorded by the data lead (Obidit Islam) for the team on 2026-11-07, two days after the 06 §D.3 target of 5 Nov. The Jezero fallback (T01.06) is not triggered.

| 06 §E rule | Result | Evidence |
| --- | --- | --- |
| AOI inside the DEM extent | Yes | [aoi.md](../ops/feasibility/aoi.md), [feasibility.md — AOI bounds](../ops/feasibility.md#aoi-bounds-u-01-context-02-c2) |
| HiRISE-scale hillshade texture across ≥ 80 % of the AOI | 85.67 %, pass on the data lead's method; about 48–68 % on the strict reading. The team accepted the data lead's method | [dem-quality.md](../ops/feasibility/dem-quality.md) |

Consequences:

- The AOI is frozen: T03.16 (site record) and T16.02 (spec sync) may start. The projection string in `pipeline/src/marswalk_pipeline/config.py` (T03.07) already uses this AOI.
- FR-18 (CRISM) is in scope as a desirable, using observation `FRT0000B6F1` only ([feasibility.md — CRISM](../ops/feasibility.md#crism-coverage-u-05)).
- Status word: "Accepted" is used for decided ADRs from now on (TASK-01 spec question 6, data lead, 2026-11-07).
- Elevation datum (U-02) stays unclear: neither label states it ([dem-label.md](../ops/feasibility/dem-label.md)).
