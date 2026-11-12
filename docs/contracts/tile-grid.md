# Tile Grid and Tile-Encoding Contract (C9)

| | |
| --- | --- |
| **Owner** | Saba Atharique (R3 Map & Planner UI, [T02.01](../tasks/TASK-02_projection-spike.md#t0201--write-the-tile-grid-and-tile-encoding-contract-v1)) |
| **Version** | v1.2 (13 Nov 2026; v1.1 was 11 Nov, v1 was M0/M1) |
| **Status** | Proposed; frozen end of M1 (10 Nov). v1.1 records two observations and changes no value, field or path. v1.2 settles the open encodings and the index file for the real bundle (BD-17, BD-18, BD-22, BD-135, BD-136) and changes no manifest field or path |
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

* **Writer.** The tile loop of `render_tiles` in `pipeline/src/marswalk_pipeline/tiles.py` computes `left, top = ox + x * span, oy - y * span` and reads the window `(left, top - span, left + span, top)`; its row range is `floor((oy - raster_top) / span)` to `ceil((oy - raster_bottom) / span)`. The open question its comment carried ("top-left origin, eastward x, southward y") is answered by this section.
* **Reader.** An OpenLayers `TileGrid` built with `origin: origin_m` (top-left), `resolutions: resolutions_m` and `tileSize: tile_size_px` (`createTileGrid` in `apps/web/src/ui/map/projection.ts`) uses the same rows: `ol/source/XYZ` substitutes `{y}` with the row counted southward from the origin. `apps/web/tests/ui/projection.test.ts` checks that, for every level of the mock-site grid, the extent OpenLayers gives each tile equals the formula above, so a change in either side fails the test.
* **Not covered.** The check compares the two addressing formulas; it does not render the tiles. The spike page check (no gap or offset between levels, offline, T02.03 acceptance) is a manual step recorded in the T02.03 status row.
* Besides the tiles, `tiles.py` writes `tiles/<layer_id>/index.json`; its format is §3.3.
* The writer's own checks are `test_c9_addressing_x_east_y_south_and_index` (a four-quadrant raster lands in the tiles the formula names) and `test_c9_tile_grids_of_the_gale_layer_records` (every real layer's `tile_grid` origin, size, ladder and format) in `pipeline/tests/`.

### 3.3 Tiles-root index file (v1.2)

`tiles/<layer_id>/index.json` is `{"tiles": [{"path", "bytes", "sha256"}, …]}`: one entry per tile file, `path` relative to the layer folder (`<z>/<x>/<y>.<ext>`), `bytes` the file size, `sha256` its hex digest, entries sorted by `path`, keys sorted, two-space indent, one trailing newline. The manifest Asset `tiles-<layer_id>` (`format: "tiles"`) stores the SHA-256 of this file (05 §C Asset), so the index covers every tile (05 §E.3). Only tiles that exist are listed; a tile fully outside the source raster is not written.

---

## 4. Per-layer pixel encoding

Per [03 SCR-03](../specs/03_App_Flow_and_Diagrams.md#scr-03--layers-panel) and [04 §C.1](../specs/04_Design_Brief.md#map-overlays), each raster layer has distinct visual and data requirements:

| Layer ID | Category | Format | Pixel encoding | Notes & specifications |
| --- | --- | --- | --- | --- |
| `ortho` | optical | `jpg` / `png` | Display RGB (8-bit) | 0.5 m/px downsampled HiRISE basemap ([02 §C.2 L1](../specs/02_Technical_Requirements_Document.md#l1--optical-basemap-fr-01)). JPEG for small bundle size (30–80 MB for 6×6 km AOI, [02 §C.3](../specs/02_Technical_Requirements_Document.md#c3-data-volume-budget-proposed)). The real bundle is JPEG: pixels outside the source mask or outside `aoi.extent_m` are the OPS `void` colour `#0B0D10` (§5, BD-18). |
| `hillshade` | topographic | `png` / `webp` | Display Grayscale (8-bit) | Derived from 1 m DEM at 2 m display resolution ([02 §C.2 L2](../specs/02_Technical_Requirements_Document.md#l2--topography-elevation-hillshade-fr-02-fr-03-fr-08)). Pre-rendered hillshade with illumination azimuth 315°, altitude 45°. |
| `slope` | topographic | `png` | Data-encoded `u8` (degrees × 4) plus an alpha band | Slope classes in [04 §C.1](../specs/04_Design_Brief.md#map-overlays) follow user-configured scenario limits (`breaks_follow_scenario: true` in [05 §F.1](../specs/05_Backend_and_Database_Schema.md#f1-site-manifest-abridged-aoi-values-illustrative-until-task-01)), so the pixels carry degrees, not colours. As written by `render_tiles(..., data_encoded=True)` in `pipeline/src/marswalk_pipeline/tiles.py` (nearest-neighbour resampling, PNG only) through `encode_slope_u8` in `pipeline/src/marswalk_pipeline/grid.py`: `u8 = round(slope_deg × 4)` (0.25° steps), clamped to 254 (63.5°); `255` = no data, and the alpha band is 0 there (and 255 elsewhere). The same encoding is the routing grid's (`slope_p90`, `slope_max`, [05 §C RoutingGrid](../specs/05_Backend_and_Database_Schema.md#routinggrid)). OpenLayers applies a custom style or WebGL tile shader to colour the pixels into nominal, caution and warning bands from the current limits (consumer: [T07.07](../tasks/TASK-07_app-shell-and-map-workspace.md#t0707--implement-tiled-raster-layers-with-slope-classes-that-follow-the-current-limits)). Whether v1 bundles ship slope display tiles is the data lead's call (see the bundle decision in [T02.01](../tasks/TASK-02_projection-spike.md#t0201--write-the-tile-grid-and-tile-encoding-contract-v1)). |
| `elevation` | topographic | `png` | Pre-coloured RGBA (v1.2, BD-17, BD-135) | Colour ramp over the 04 OPS neutrals `edge` `#5C6670`, `text-2` `#A9B3BE`, `text-1` `#ECEFF2`, evenly spaced from the 2nd to the 98th percentile of the valid AOI cells, clamped outside; NaN is transparent. The two stops are the layer's `legend.stops` (`[value, label]`, derived by the pipeline). Metric elevation is not in the pixels: the routing grid carries it (`grid/elevation.f32`). |
| `thermal_inertia` | thermal | `png` | Pre-coloured RGBA (v1.2, BD-17, BD-135) | Same ramp and rule as `elevation`, from the 100 m USGS THEMIS mosaic ([02 §C.2 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10)); gaps are transparent and never zero tiu. Resampled bilinearly, so a 100 m pixel is smoothed at 2 m. |
| `hazard_flags` | hazard | `png` | Pre-coloured RGBA at the 5 m cell size (v1.2, BD-17, BD-136) | One colour per flag, the highest-priority flag of a cell wins: `HARD_HAZARD` `#FF4D4D`, `LOW_TI` `#FFB020`, `LOW_RES_DEM` `#4CC9F0`, `TI_UNKNOWN` and `NO_DATA` `#B8A9FF` (the 04 OPS `warning`, `caution`, `advisory` and `unknown` tokens); no flag is transparent. Nearest-neighbour resampling. The layer `legend` lists the flag bit values. |
| `comm_hab` | hazard | `png` | Viewshed line-of-sight binary mask, RGBA at 5 m (v1.2) | White `#FFFFFF` where the cell is in line of sight of the hab mast; transparent in comm shadow and where there is no data ([04 §C.1](../specs/04_Design_Brief.md#map-overlays), [FR-42](../specs/01_Product_Requirements_Document.md#fr-42--comm-coverage-and-comm-shadows-t1-m)). Nearest-neighbour resampling. The comm-shadow styling (hatch or dotted, never a status colour alone) belongs to [04 §C.1](../specs/04_Design_Brief.md#map-overlays); C9 defines only the pixel encoding. The tiles are the rank-1 candidate's grid; the other candidates' grids are `grid/comm_<candidate_id>.u8` only. |

---

## 5. No-data and missing data handling

1. **Optical Basemap (`ortho`)**: Missing data pixels are fully transparent (alpha = 0) in PNG format. In JPEG format (which lacks an alpha channel), tiles are clipped to `aoi.extent_m` and every pixel outside the source mask, or outside the AOI, is written in the 04 map background colour (OPS `void` `#0B0D10`); the manifest has no coverage polygon field. Black pixels the source marks valid are written as they are ([02 §C.2 L1](../specs/02_Technical_Requirements_Document.md#l1--optical-basemap-fr-01), BD-18).
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
| v1 | 7 Nov 2026 | Fields, path template, per-layer encodings, no-data rules, ImageStatic form (T02.01, Saba Atharique) |
| v1.1 | 11 Nov 2026 | `{y}` counts southward from `origin_m[1]` (§3.1, §3.2), matching `tiles.py`; slope encoding cites `tiles.py` and `grid.py` instead of a `TODO(decision)` (§4). No field, value or path changed, so no `contract-change:` subtask is appended (T02.03 acceptance: only "if it differs from v1"). Decided by Sadman Shaharier Mahim (product lead) after the review of PR #169 |
| v1.2 | 13 Nov 2026 | §3.3 records the index file; §4 settles the elevation, thermal-inertia, hazard-flag and comm-coverage encodings (they were open or unspecified); §5 item 1 replaces the black fill and the coverage polygon of JPEG ortho tiles with the map background colour. Decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026 (BD-17, BD-18, BD-22, BD-135, BD-136). No manifest field, value or path changed, so no `contract-change:` subtask is appended |
