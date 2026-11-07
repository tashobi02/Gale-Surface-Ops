# Tile Grid and Tile-Encoding Contract (C9)

| | |
| --- | --- |
| **Owner** | Saba Atharique (R3 Map & Planner UI, [T02.01](../tasks/TASK-02_projection-spike.md#t0201--write-the-tile-grid-and-tile-encoding-contract-v1)) |
| **Version** | v1 (M0/M1) |
| **Status** | Proposed v1; frozen for M1; updates follow the contract-change process |
| **Consumers** | [T02.02](../tasks/TASK-02_projection-spike.md#t0202--implement-the-mars-projection-module-with-a-web-crs-guard-test), [T02.03](../tasks/TASK-02_projection-spike.md#t0203--build-the-spike-page-mock-site-tiles-in-the-mars-projection-with-a-metric-scale-bar), [T02.06](../tasks/TASK-02_projection-spike.md#t0206--fallback--start-only-if-the-spike-fails-within-2-h-imagestatic-layer-factory-in-the-mars-projection), [T03.02](../tasks/TASK-03_preprocessing-pipeline.md#t0302--fixture-mock-site-bundle-manifest-placeholder-tiles-tiny-grid-sample-poi-and-traverse-geojson), [T03.12](../tasks/TASK-03_preprocessing-pipeline.md#t0312--implement-tile-rendering-per-the-tile-grid-contract), [T07.07](../tasks/TASK-07_app-shell-and-map-workspace.md#t0707--implement-tiled-raster-layers-with-slope-classes-that-follow-the-current-limits) |
| **Related** | [Docs index](../README.md) · [05 Layer](../specs/05_Backend_and_Database_Schema.md#layer) · [05 §F.1](../specs/05_Backend_and_Database_Schema.md#f1-site-manifest-abridged-aoi-values-illustrative-until-task-01) · [02 §B](../specs/02_Technical_Requirements_Document.md#b-technology-choices) · [02 §E.1](../specs/02_Technical_Requirements_Document.md#e1-static-asset-contract) · [04 §C.1](../specs/04_Design_Brief.md#map-overlays) · [ADR-003](../decisions/ADR-003-openlayers-mars-projection.md) · [TASK-02](../tasks/TASK-02_projection-spike.md) · [_coordination.md](../tasks/_coordination.md#d-contracts-registry) |

---

## 1. Scope and purpose

This contract specifies the local tile grid structure, tile addressing scheme, and per-layer pixel encoding for all raster layers served to OpenLayers in Marswalk Surface Ops.

It decouples the offline preprocessing pipeline (`pipeline/src/marswalk_pipeline/tiles.py`) from the frontend map renderer (`apps/web/src/ui/map/`).

---

## 2. Manifest `tile_grid` field specification

Per [05 §C Layer](../specs/05_Backend_and_Database_Schema.md#layer) and [packages/protocol/src/schema.ts](../../packages/protocol/src/schema.ts), every layer with `kind: "raster_tiles"` must define a `tile_grid` object with the following fields:

| Field | Type | Unit | Meaning | Example from 05 §F.1 |
| --- | --- | --- | --- | --- |
| `origin_m` | `[number, number]` | metres in working projection | Top-left corner `[x_min, y_max]` of the tile grid in the site's local equirectangular working projection (`+proj=eqc`) | `[-3000, 3000]` |
| `resolutions_m` | `number[]` | metres / pixel | Array of pixel resolutions for each zoom level `z` in descending order (coarsest to finest) | `[32, 16, 8, 4, 2]` |
| `tile_size_px` | `number` | pixels | Tile dimension (square tiles: `tile_size_px × tile_size_px`) | `256` |
| `format` | `string` | MIME / extension | File format extension (`png`, `jpg`, `webp`) | `"png"` |

---

## 3. Tile path and addressing

### 3.1 URL path template

Per [02 §E.1](../specs/02_Technical_Requirements_Document.md#e1-static-asset-contract), map tile files are located relative to the site bundle root (`web/public/sites/<site_id>/` or `data/sites/<site_id>/`) using the path template:

```text
tiles/<layer_id>/{z}/{x}/{y}.{ext}
```

* `<layer_id>`: Unique layer identifier from the manifest (e.g. `ortho`, `hillshade`, `slope`, `elevation`, `ti`).
* `{z}`: Integer zoom level index into `resolutions_m` (0 = coarsest resolution, e.g. 32 m/px; `len(resolutions_m) - 1` = finest resolution, e.g. 2 m/px).
* `{x}`: Integer column index counting eastward from `origin_m[0]`.
* `{y}`: Integer row index counting from `origin_m[1]`. `TODO(verify)`: Confirm during the T02.03 spike whether `{y}` counts southward (standard Slippy / Web Mercator tile index where y=0 is at top) or northward (standard TMS convention where y=0 is at bottom). The pipeline implementation in `pipeline/src/marswalk_pipeline/tiles.py` currently assumes southward counting from `origin_m[1]`.
* `{ext}`: Matches `tile_grid.format` (`png`, `jpg`, `webp`).

---

## 4. Per-layer pixel encoding

Per [03 SCR-03](../specs/03_App_Flow_and_Diagrams.md#scr-03--layers-panel) and [04 §C.1](../specs/04_Design_Brief.md#map-overlays), each raster layer has distinct visual and data requirements:

| Layer ID | Category | Format | Pixel encoding | Notes & specifications |
| --- | --- | --- | --- | --- |
| `ortho` | optical | `jpg` / `png` | Display RGB (8-bit) | 0.5 m/px downsampled HiRISE basemap ([02 §C.2 L1](../specs/02_Technical_Requirements_Document.md#l1--optical-basemap-fr-01)). JPEG for small bundle size (30–80 MB for 6×6 km AOI, [02 §C.3](../specs/02_Technical_Requirements_Document.md#c3-data-volume-budget-proposed)), with optional PNG alpha where transparency is needed. |
| `hillshade` | topographic | `png` / `webp` | Display Grayscale (8-bit) | Derived from 1 m DEM at 2 m display resolution ([02 §C.2 L2](../specs/02_Technical_Requirements_Document.md#l2--topography-elevation-hillshade-fr-02-fr-03-fr-08)). Pre-rendered hillshade with illumination azimuth 315°, altitude 45°. |
| `slope` | topographic | `png` | Data-encoded `u8` (degrees × 4) | `TODO(decision)`: Slope classes in [04 §C.1](../specs/04_Design_Brief.md#map-overlays) follow user-configured scenario limits (`breaks_follow_scenario: true` in [05 §F.1](../specs/05_Backend_and_Database_Schema.md#f1-site-manifest-abridged-aoi-values-illustrative-until-task-01)), requiring dynamic client-side colour mapping. The pipeline encodes slope as `u8 = degrees × 4` (0.25° steps, 0–63.5°, 255 = no-data). OpenLayers applies a custom style or WebGL tile shader to dynamically colour the pixels into nominal, caution, and warning bands. |
| `elevation` | topographic | `png` | Continuous elevation | `TODO(decision)`: Pre-coloured PNG using a standardized hypsometric colour ramp or single-band data-encoded PNG for client-side contouring/ramp mapping. |
| `ti` | thermal | `png` | Thermal inertia (tiu) | `TODO(decision)`: Pre-coloured PNG using thermal ramp or data-encoded values from the 100 m USGS THEMIS mosaic ([02 §C.2 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10)). |
| `comm_hab` | hazard | `png` | Viewshed line-of-sight binary mask | Viewshed grid at 20 m or 2 m derived from hab mast height. White = in line-of-sight; transparent or patterned = comm shadow ([04 §C.1](../specs/04_Design_Brief.md#map-overlays), [FR-42](../specs/01_Product_Requirements_Document.md#fr-42--comm-coverage-and-comm-shadows-t1-m)). |

---

## 5. No-data and missing data handling

1. **Optical Basemap (`ortho`)**: Missing data pixels are fully transparent (alpha = 0) in PNG format. In JPEG format (which lacks an alpha channel), missing areas are black (0, 0, 0), and the manifest stores a vector coverage polygon to clip or mask the layer ([02 §C.2 L1](../specs/02_Technical_Requirements_Document.md#l1--optical-basemap-fr-01)).
2. **Thermal Inertia (`ti`)**: Gaps in THEMIS coverage must remain transparent and inspect as `"unknown"`, never rendered or interpreted as zero tiu ([02 §C.2 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10)).
3. **Slope & Elevation**: No-data cells (DEM no-data values) are transparent in PNG tiles (alpha = 0) and mapped to `255` in data-encoded `u8` tiles.

---

## 6. ImageStatic fallback form

Per [02 §B](../specs/02_Technical_Requirements_Document.md#b-technology-choices) and [ADR-003](../decisions/ADR-003-openlayers-mars-projection.md), if custom tile grid rendering in OpenLayers fails during the M1 spike ([TASK-02](../tasks/TASK-02_projection-spike.md)), the system falls back to static pre-rendered images:

* **Layer Manifest Definition**: `kind: "image_static"` ([05 §C Layer](../specs/05_Backend_and_Database_Schema.md#layer)).
* **Asset Form**: One pre-rendered PNG per layer at 2 m/pixel display resolution (approx. $3000 \times 3000\text{ px}$ for a $6 \times 6\text{ km}$ AOI).
* **OpenLayers Class**: `ol/source/ImageStatic` with `imageExtent: aoi.extent_m` and projection set to the local Mars projection.
* **Ortho Basemap in Fallback**: Retains a 0.5 m tiled basemap if XYZ tiles function for standard imagery, or a single downsampled static PNG if tiling fails completely (`TODO(decision)` per spec question 2 in [TASK-02](../tasks/TASK-02_projection-spike.md#spec-questions)).

---

## 7. Change process

This contract is owned by [T02.01](../tasks/TASK-02_projection-spike.md#t0201--write-the-tile-grid-and-tile-encoding-contract-v1) and freezes at the end of milestone M1 (10 Nov 2026).

Any modification after initial merge must:

1. Append a new subtask `T02.nn — contract-change: <summary>` to `docs/tasks/TASK-02_projection-spike.md` and [docs/tasks/_coordination.md](../tasks/_coordination.md#d-contracts-registry).
2. Bump this specification version (e.g. v1.1).
3. Rebase and re-verify downstream consumers (`T02.02`, `T02.03`, `T03.02`, `T03.12`, `T07.07`).
