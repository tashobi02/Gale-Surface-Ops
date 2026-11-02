# ADR-003 — OpenLayers with a local Mars projection (D-03)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §B Technology choices](../specs/02_Technical_Requirements_Document.md#b-technology-choices) |
| **Date** | 2026-11-02 |
| **Status** | Proposed |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [02 §C.1 Coordinate reference conventions](../specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer) · [02 Unresolved decisions](../specs/02_Technical_Requirements_Document.md#unresolved-decisions-owned-by-this-document) · [06 §C TASK-02](../specs/06_High_Level_Implementation_Plan.md#c-work-packages) |

This record mirrors D-03 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

OpenLayers with local Mars equirectangular projection (IAU_2015:49900 sphere) and custom tile grid.

## Alternative / trigger

ImageStatic images if the spike fails.

## Resolution path

- 02 Unresolved table: "TASK-02 spike result".
- 02 §B: if the spike fails within 2 hours, use one pre-rendered PNG per layer with `ol/source/ImageStatic`.
