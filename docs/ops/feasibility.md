# Feasibility check (TASK-01)

| | |
| --- | --- |
| **Owner** | Data lead ([06 §C TASK-01](../specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | TODO |
| **Status** | Open — decides D-01 ([ADR-001](../decisions/ADR-001-site-selection.md)) |
| **Related** | [02 §C Mars data and geospatial handling](../specs/02_Technical_Requirements_Document.md#c-mars-data-and-geospatial-handling) · [01 §F.2 A-01](../specs/01_Product_Requirements_Document.md#f2-key-assumptions) · [06 §E First concrete actions](../specs/06_High_Level_Implementation_Plan.md#e-first-concrete-actions-today--5-nov) |

Done when (06 §C): AOI inside DEM extent; hillshade shows HiRISE-scale texture across ≥ 80 % of AOI.

## AOI bounds (U-01 context, 02 §C.2)

| Field | Value |
| --- | --- |
| DEM extent (02 §C.2) | lat −5.098652…−4.129605, lon 137.124167…137.680559 °E |
| AOI centre (lat, lon °E) | TODO |
| AOI `bbox_geo` `[min_lon_e, min_lat, max_lon_e, max_lat]` | TODO |
| AOI `extent_m` in working projection | TODO |
| Basis (Curiosity 2025 traverse, sols ≈ 4,450–4,750) | TODO |

## DEM quality check (U-01, A-01)

| Field | Value |
| --- | --- |
| Product and version | USGS Mars MSL Gale Merged DEM 1 m v3 (02 §C.2 L2) |
| Source filling the AOI (HiRISE / CTX / HRSC / MOLA) | TODO |
| % of AOI with HiRISE-scale hillshade texture | TODO |
| Artifacts seen (boxes, CCD seams, facets) | TODO |
| Method (hillshade vs. HiRISE stereo footprints) | TODO |

## Elevation datum (U-02)

| Field | Value |
| --- | --- |
| PDS3 label statement (verbatim) | TODO |
| No-data value | TODO |
| Confirms MOLA-areoid heights? | TODO |

## THEMIS thermal-inertia tile (U-03 context)

| Field | Value |
| --- | --- |
| Tile file name (pattern `30S120E`, 02 §C.2 L4) | TODO(verify) |
| Covers the AOI without gaps? | TODO |

## CRISM coverage (U-05)

| Field | Value |
| --- | --- |
| MTRDR observations covering the AOI | TODO |
| Decision for FR-18 | TODO |

## Colour HiRISE COG coverage (U-09)

| Field | Value |
| --- | --- |
| Colour COG covers the AOI? | TODO |

## D-01 outcome

| Field | Value |
| --- | --- |
| Site chosen (Gale boxwork / Jezero) | TODO |
| Date decided (target 5 Nov, 06 §D.3) | TODO |
| Evidence | TODO |

## Large tiles in the repo

TODO(decision): Git LFS vs. GitHub release assets for site tiles. 02 §B Hosting says "keep tiles < 500 MB or use Git LFS / release asset"; NFR-09 caps the total site bundle at 250 MB. Not decided here.
