# Tile Grid and Tile-Encoding Contract (C9)

| | |
| --- | --- |
| **Owner** | Saba Atharique (R3 Map & Planner UI, [T02.01](../tasks/TASK-02_projection-spike.md#t0201--write-the-tile-grid-and-tile-encoding-contract-v1)) |
| **Version** | v1.1 (11 Nov 2026; v1 was M0/M1) |
| **Status** | Proposed; frozen end of M1 (10 Nov). v1.1 records two observations and changes no value, field or path |
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
* `{y}`: Integer row index counting **southward** from `origin_m[1]`: `y = 0` is the northernmost row, as in the Slippy tile index and not the TMS convention (v1.1, observed 11 Nov 2026; see §3.2).
* `{ext}`: Matches `tile_grid.format` (`png`, `jpg`, `webp`).

### 3.2 Observed tile addressing (v1.1)

For zoom level `z`, `span = tile_size_px × resolutions_m[z]` metres, and tile `(z, x, y)` covers, in working-projection metres:

```text
x ∈ [origin_m[0] + x·span,  origin_m[0] + (x+1)·span]
y ∈ [origin_m[1] − (y+1)·span,  origin_m[1] − y·span]
```

* **Writer.** The tile loop of `render_tiles` in `pipeline/src/marswalk_pipeline/tiles.py` computes `left, top = ox + x * span, oy - y * span` and reads the window `(left, top - span, left + span, top)`; its row range is `floor((oy - raster_top) / span)` to `ceil((oy - raster_bottom) / span)`. Its own `TODO(verify)` comment ("top-left origin, eastward x, southward y") is answered by this section.
* **Reader.** An OpenLayers `TileGrid` built with `origin: origin_m` (top-left), `resolutions: resolutions_m` and `tileSize: tile_size_px` (`createTileGrid` in `apps/web/src/ui/map/projection.ts`) uses the same rows: `ol/source/XYZ` substitutes `{y}` with the row counted southward from the origin. `apps/web/tests/ui/projection.test.ts` checks that, for every level of the mock-site grid, the extent OpenLayers gives each tile equals the formula above, so a change in either side fails the test.
* **Not covered.** The check compares the two addressing formulas; it does not render the tiles. The spike page check (no gap or offset between levels, offline, T02.03 acceptance) is a manual step recorded in the T02.03 status row.
* Besides the tiles, `tiles.py` writes `tiles/<layer_id>/index.json` (`{"tiles": [{path, bytes, sha256}]}`). That file is the pipeline's provisional mock-site index and is not part of this contract (`TODO(verify)` in `tiles.py`).

---

## 4. Per-layer pixel encoding

Per [03 SCR-03](../specs/03_App_Flow_and_Diagrams.md#scr-03--layers-panel) and [04 §C.1](../specs/04_Design_Brief.md#map-overlays), each raster layer has distinct visual and data requirements:

| Layer ID | Category | Format | Pixel encoding | Notes & specifications |
| --- | --- | --- | --- | --- |
| `ortho` | optical | `jpg` / `png` | Display RGB (8-bit) | 0.5 m/px downsampled HiRISE basemap ([02 §C.2 L1](../specs/02_Technical_Requirements_Document.md#l1--optical-basemap-fr-01)). JPEG for small bundle size (30–80 MB for 6×6 km AOI, [02 §C.3](../specs/02_Technical_Requirements_Document.md#c3-data-volume-budget-proposed)), with optional PNG alpha where transparency is needed. |
| `hillshade` | topographic | `png` / `webp` | Display Grayscale (8-bit) | Derived from 1 m DEM at 2 m display resolution ([02 §C.2 L2](../specs/02_Technical_Requirements_Document.md#l2--topography-elevation-hillshade-fr-02-fr-03-fr-08)). Pre-rendered hillshade with illumination azimuth 315°, altitude 45°. |
| `slope` | topographic | `png` | Data-encoded `u8` (degrees × 4) plus an alpha band | Slope classes in [04 §C.1](../specs/04_Design_Brief.md#map-overlays) follow user-configured scenario limits (`breaks_follow_scenario: true` in [05 §F.1](../specs/05_Backend_and_Database_Schema.md#f1-site-manifest-abridged-aoi-values-illustrative-until-task-01)), so the pixels carry degrees, not colours. As written by `render_tiles(..., data_encoded=True)` in `pipeline/src/marswalk_pipeline/tiles.py` (nearest-neighbour resampling, PNG only) through `encode_slope_u8` in `pipeline/src/marswalk_pipeline/grid.py`: `u8 = round(slope_deg × 4)` (0.25° steps), clamped to 254 (63.5°); `255` = no data, and the alpha band is 0 there (and 255 elsewhere). The same encoding is the routing grid's (`slope_p90`, `slope_max`, [05 §C RoutingGrid](../specs/05_Backend_and_Database_Schema.md#routinggrid)). OpenLayers applies a custom style or WebGL tile shader to colour the pixels into nominal, caution and warning bands from the current limits (consumer: [T07.07](../tasks/TASK-07_app-shell-and-map-workspace.md#t0707--implement-tiled-raster-layers-with-slope-classes-that-follow-the-current-limits)). Whether v1 bundles ship slope display tiles is the data lead's call (see the bundle decision in [T02.01](../tasks/TASK-02_projection-spike.md#t0201--write-the-tile-grid-and-tile-encoding-contract-v1)). |
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

### Changes

| Version | Date | Change |
| --- | --- | --- |
| v1 | 7 Nov 2026 | Fields, path template, per-layer encodings, no-data rules, ImageStatic form (T02.01, Saba Tharique) |
| v1.1 | 11 Nov 2026 | `{y}` counts southward from `origin_m[1]` (§3.1, §3.2), matching `tiles.py`; slope encoding cites `tiles.py` and `grid.py` instead of a `TODO(decision)` (§4). No field, value or path changed, so no `contract-change:` subtask is appended (T02.03 acceptance: only "if it differs from v1"). Decided by Sadman Shaharier Mahim (product lead) after the review of PR #169 |
