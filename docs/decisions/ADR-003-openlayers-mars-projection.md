# ADR-003 — OpenLayers with a local Mars projection (D-03)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §B Technology choices](../specs/02_Technical_Requirements_Document.md#b-technology-choices) |
| **Date** | 2026-11-02 |
| **Status** | Accepted (2026-11-12, Proposed by the orchestrator under Sadman Shaharier Mahim's authority; FD-097, FD-100–FD-105) |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [02 §C.1 Coordinate reference conventions](../specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer) · [02 Unresolved decisions](../specs/02_Technical_Requirements_Document.md#unresolved-decisions-owned-by-this-document) · [06 §C TASK-02](../specs/06_High_Level_Implementation_Plan.md#c-work-packages) |

This record mirrors D-03 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

OpenLayers with local Mars equirectangular projection (IAU_2015:49900 sphere) and custom tile grid.

## Alternative / trigger

ImageStatic images if the spike fails.

## Outcome

Go: tiled XYZ in the local Mars projection. Measured on the F4 mock site (`E2E_SITE` unset) with the Playwright harness on `2026-11-12`:

- `tiles-all-levels`: the spike page loads every `tile_grid` level (five, 32 to 2 m/px) of both raster layers with HTTP 200 and paints a non-empty canvas (FD-104). OpenLayers is given the AOI extent so it requests no tile outside the grid.
- `scale-bar` (resolution part): at every level the scale line's metres per pixel equals the view resolution within 1 %, in projected metres, so OpenLayers does not estimate point resolution on an Earth sphere (FD-102).
- Slope tiles are data tiles (degrees x 4) coloured in the browser (FD-100); tile addressing is C9 v1.1 (y counted south from `origin_m[1]`, FD-103).

Not yet measured: the 2 % match of the T01.03 reference crater (38.87 m rim to rim) needs the real `gale_boxwork` bundle (T03.19), so T02.04 stays open; the `scale-bar` crater test is `test.fixme` naming it. The ImageStatic fallback is built later as a degradation path (FD-101, package 33).

## Resolution path

- 02 Unresolved table: "TASK-02 spike result".
- 02 §B: if the spike fails within 2 hours, use one pre-rendered PNG per layer with `ol/source/ImageStatic`.
