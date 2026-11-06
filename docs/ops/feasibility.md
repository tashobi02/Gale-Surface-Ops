# Feasibility check (TASK-01)

| | |
| --- | --- |
| **Owner** | Data lead ([06 §C TASK-01](../specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | 2026-11-07 |
| **Status** | Draft for the team: D-01 is proposed, not decided ([ADR-001](../decisions/ADR-001-site-selection.md)) |
| **Related** | [02 §C Mars data and geospatial handling](../specs/02_Technical_Requirements_Document.md#c-mars-data-and-geospatial-handling) · [01 §F.2 A-01](../specs/01_Product_Requirements_Document.md#f2-key-assumptions) · [06 §E First concrete actions](../specs/06_High_Level_Implementation_Plan.md#e-first-concrete-actions-today--6-nov) |

Done when (06 §C): AOI inside DEM extent; hillshade shows HiRISE-scale texture across ≥ 80 % of AOI.

## AOI bounds (U-01 context, 02 §C.2)

| Field | Value |
| --- | --- |
| DEM extent (02 §C.2) | lat −5.098652…−4.129605, lon 137.124167…137.680559 °E |
| AOI centre (lat, lon °E) | −4.81, 137.38 ([aoi.md](feasibility/aoi.md)) |
| AOI `bbox_geo` `[min_lon_e, min_lat, max_lon_e, max_lat]` | `[137.329209, -4.860612, 137.430791, -4.759388]` |
| AOI `extent_m` in working projection | `[-3000, -3000, 3000, 3000]` |
| Basis (Curiosity 2025 traverse, sols ≈ 4,450–4,750) | Midpoint of the rover's range over sols 4,534–5,045, the data lead's rule; the 02 §C.2 range is also inside the box |

## DEM quality check (U-01, A-01)

| Field | Value |
| --- | --- |
| Product and version | USGS Mars MSL Gale Merged DEM 1 m v3 (02 §C.2 L2) |
| Source filling the AOI (HiRISE / CTX / HRSC / MOLA) | Not known per pixel (U-10). Four HiRISE stereo pairs cover 100 % of the AOI ([dem-quality.md](feasibility/dem-quality.md#u-10-evidence)) |
| % of AOI with HiRISE-scale hillshade texture | **85.67 %**: pass, on the data lead's method. **Depends on the method:** about 48–68 % if all smooth DEM counts as failing ([sensitivity](feasibility/dem-quality.md#sensitivity)) |
| Artifacts seen (boxes, CCD seams, facets) | Seam with stripes, facets, cross-hatch ([list](feasibility/dem-quality.md#artifacts)) |
| Method (hillshade vs. HiRISE stereo footprints) | An area fails only where the photo shows detail the DEM lacks ([method](feasibility/dem-quality.md#method)) |

## Elevation datum (U-02)

| Field | Value |
| --- | --- |
| PDS3 label statement (verbatim) | None: neither label states a vertical datum ([dem-label.md](feasibility/dem-label.md)) |
| No-data value | −32767, from the GeoTIFF tag; neither label states one |
| Confirms MOLA-areoid heights? | Unclear (data lead, 2026-11-06) |

## THEMIS thermal-inertia tile (U-03 context)

| Field | Value |
| --- | --- |
| Tile file name (pattern `30S120E`, 02 §C.2 L4) | `THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub` ([coverage.md](feasibility/coverage.md)) |
| Covers the AOI without gaps? | Yes, 100 % valid |

## CRISM coverage (U-05)

| Field | Value |
| --- | --- |
| MTRDR observations covering the AOI | 7, a patchwork; best single `FRT0000B6F1` at 97.12 % ([coverage.md](feasibility/coverage.md)) |
| Decision for FR-18 | `TODO(decision)`: data lead |

## Colour HiRISE COG coverage (U-09)

| Field | Value |
| --- | --- |
| Colour COG covers the AOI? | Yes, 100 % valid, with about 7.74 % greyscale strips (sampled) |

## D-01 outcome

| Field | Value |
| --- | --- |
| Site chosen (Gale boxwork / Jezero) | `TODO(decision)`: the data lead proposes Gale boxwork; team to decide |
| Date decided (target 5 Nov, 06 §D.3) | `TODO(decision)` |
| Evidence | [DEM label](feasibility/dem-label.md) · [AOI](feasibility/aoi.md) · [DEM quality](feasibility/dem-quality.md) · [Coverage](feasibility/coverage.md) · [Hab site](feasibility/hab-site.md) |

## Large tiles in the repo

Decision (team confirmed 2026-11-03): GitHub release asset (not Git LFS) for site tiles, grid and images. Reasoning: the same tarball serves as release archive and clean-clone source. Context: 02 §B Hosting says "keep tiles < 500 MB or use Git LFS / release asset"; NFR-09 caps the total site bundle at 250 MB.
