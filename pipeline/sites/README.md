# Site-config input layout (contract C5, v2)

| | |
| --- | --- |
| **Owner** | T03.01 — R1 Data & GIS ([map §d](../../docs/tasks/_coordination.md#d-contracts-registry)); v2 by T03.31 |
| **Date** | 2026-11-06 (v1) · 2026-11-10 (v2) |
| **Status** | Frozen at v1; every choice below was decided by the data lead on 2026-11-06. v2 adds the optional `hab_candidates.json` and the candidate asset-id rule (T03.31) |
| **Related** | [05 §C](../../docs/specs/05_Backend_and_Database_Schema.md#c-entity-definitions) · [05 §E.3](../../docs/specs/05_Backend_and_Database_Schema.md#e3-referential-integrity-validated-by-the-validate-manifest-command-and-at-app-boot-in-dev-builds) · [02 §E.1](../../docs/specs/02_Technical_Requirements_Document.md#e1-static-asset-contract) · [path ownership](../../docs/tasks/_coordination.md#c3-pipeline) · `schemas/site-manifest.schema.json` |

Everything the pipeline needs that is not a downloaded dataset lives here, one folder per site. `python -m marswalk_pipeline <site_id>` reads `pipeline/sites/<site_id>/` and writes the bundle to `data/sites/<site_id>/`. 05 owns the field names; this file only says where each record lives.

## Layout

```text
pipeline/sites/<site_id>/
  site.json                    one object (below)
  hazards.geojson              HARD_HAZARD polygons
  low_res_dem.geojson          LOW_RES_DEM polygons
  ti_threshold.json            optional; absent means no LOW_TI bits
  hab_candidates.json          optional; the candidate hab sites (v2, below)
  sources/<source_id>.json     one 05 DataSource per file
  layers/<layer_id>.json       one 05 Layer per file
  env_constants/<const_id>.json  one 05 EnvConstant per file
  known_offsets/<key>.json     one measured offset per file
  pois/<poi_id>.json           one 05 POI per file
```

The file name equals the record's primary key. `sources/`, `layers/`, `env_constants/`, `known_offsets/` and `pois/` are append-only by file: each subtask adds and owns its own files ([map §c.3](../../docs/tasks/_coordination.md#c3-pipeline)).

An unknown field holds the string `"TODO(verify)"` while the record is being written. None may remain when T03.19 builds the bundle.

## `site.json`

| Field | Rule |
| --- | --- |
| `site_id`, `name`, `body`, `data_version`, `aoi`, `default_start` | As in [05 Site](../../docs/specs/05_Backend_and_Database_Schema.md#site) |
| `hab_mast` | `{x_m, y_m}` from the hab-site note (T01.07). 05 puts `hab_mast` in the RoutingGrid but names no input for it, so it lives here. `height_m` is not stored here: the pipeline reads it from `hab_mast_m` in `scenarios/storm-sol4190/param_sets/link-assumed.json` |

`crs.proj4` is **not** stored here: T03.13 copies it byte for byte from `config.py` (05 §E.3). `schema_version` also comes from the writer.

## `hab_candidates.json` *(v2, T03.31; optional)*

The candidate hab sites the crew picks from at mission setup ([01 FR-53](../../docs/specs/01_Product_Requirements_Document.md#fr-53--mission-site-selection-at-setup-t1-m), [05 HabCandidate](../../docs/specs/05_Backend_and_Database_Schema.md#habcandidate-2026-11-10-proposed)). **One array in one file**, not one file per candidate: the list is short (two today) and its order is the site's ranking, so a single file keeps it atomic.

**The file is optional.** A site without it produces a manifest with no `hab_candidates` at all: the single `default_start` / `hab_mast` site is then the mission site, and every current manifest and consumer stays valid (05 Site `hab_candidates`).

One array of objects:

| Field | Type | Rule |
| --- | --- | --- |
| `candidate_id` | string | `^[a-z0-9-]+$`, unique in the site |
| `label` | string | ≤ 80 chars |
| `rank` | integer | ≥ 1, unique in the site; exactly one entry has `rank` 1, and that entry is the default |
| `hab_mast` | `{x_m, y_m}` | Mast position in working-projection metres, on a passable cell inside `aoi.extent_m` |
| `default_start` | `{x_m, y_m, label}` | The planner's start waypoint for this candidate, in working-projection metres, on a passable cell inside `aoi.extent_m` |
| `note` | string | Why the candidate is on the list (the trade-off, e.g. from [hab-site.md](../../docs/ops/feasibility/hab-site.md)); optional |
| `provenance` | string | `assumed` for a curated choice |
| `source_ids` | string[] | The `source_id`s of the checks behind the choice (FK → DataSource) |

**Nothing here is derived by hand.** The pipeline adds, from other inputs:

| Added field | How |
| --- | --- |
| `hab_mast.height_m` | from the link ParamSet `hab_mast_m`, exactly as for the single mast today (`site.json`) |
| `lat`, `lon_e` | inverse of the working `+proj=eqc` projection with pyproj (planetocentric degrees, east-positive) |
| `comm_hab_asset` | by the candidate asset-id rule below |

So a hand-written record carries no height, no latitude, no longitude and no asset id.

### Candidate asset ids *(Proposed, T03.31)*

| Candidate | Asset id | File |
| --- | --- | --- |
| rank 1 | `grid-comm-hab` | `grid/comm_hab.u8` |
| any other rank | `grid-comm-<candidate_id>` | `grid/comm_<candidate_id>.u8` |

The rank-1 candidate keeps the existing `grid-comm-hab` asset, so `grid.comm_hab_asset` and every current consumer of it are unchanged. Any other candidate gets its own grid under its own id.

*Spec question (T03.31):* [05 §F.1](../../docs/specs/05_Backend_and_Database_Schema.md#f1-site-manifest-abridged-aoi-values-illustrative-until-task-01) illustrates the candidates with `grid-comm-hab-first` and `grid-comm-hab-alternative`, that is, the "every candidate gets its own id" rule. The rule above is **Proposed** and differs from that example on purpose, so that `grid.comm_hab_asset` keeps its current value. If the reviewer prefers the 05 §F.1 example ids for every candidate, `grid.comm_hab_asset` changes for every consumer and this section is rewritten; that choice is `TODO(decision)`.

### Cross-field rules

Uniqueness of `candidate_id` and `rank`, exactly one `rank` 1, and the rank-1 mirror rules (rank 1's `default_start` equals the Site `default_start`; its `comm_hab_asset` equals `grid.comm_hab_asset`; its `hab_mast` equals `grid.hab_mast`) are checked by `validate-manifest`, not by the JSON Schema ([05 §E.3](../../docs/specs/05_Backend_and_Database_Schema.md#e3-referential-integrity-validated-by-the-validate-manifest-command-and-at-app-boot-in-dev-builds)).

## Records

**`layers/<layer_id>.json`.** Every field 05 marks required. T03.13 replaces `kind`, `asset_id` and `tile_grid` from the asset the pipeline actually produced, so a fallback such as T03.25 needs no record change.

`native_resolution_m` and `display_resolution_m` are required numbers even on vector layers: `0` means "not applicable" on `kind: vector`.

**`pois/<poi_id>.json`.** The properties of the [05 POI](../../docs/specs/05_Backend_and_Database_Schema.md#poi), not a GeoJSON Feature. T04.03 projects `lat` and `lon_e` to working-projection metres when it writes `vectors/pois.geojson`.

**`known_offsets/<key>.json`.** The manifest's `known_offsets_m[<key>]` takes `offset_m`; the other fields stay here as the record of how it was measured.

| Field | Type | Rule |
| --- | --- | --- |
| `offset_m` | number or null | Human measurement in metres; null until measured |
| `method` | string | How it was measured |
| `evidence` | string | Link to the section of `docs/ops/verification-log.md` |

**`ti_threshold.json`** (T04.07; 05 has no manifest field for it). T03.10 reads `value`; an absent file means no `LOW_TI` bits. **The file is not written**: U-03 decided on 2026-11-10 that no defensible TI "loose fines" threshold exists for the AOI, so T03.10 always runs with no threshold ([`docs/ops/ti-threshold.md`](../../docs/ops/ti-threshold.md#decision)). The layout below applies only if a later recorded decision writes the file.

| Field | Type | Rule |
| --- | --- | --- |
| `value` | number | Chosen by the data lead in a recorded decision |
| `unit` | string | `tiu` |
| `label` | string | `interpretive` (02 §C.2 L4) |
| `note` | string | Path of the method note, `docs/ops/ti-threshold.md` |

**`hazards.geojson`, `low_res_dem.geojson`** (T03.18). GeoJSON FeatureCollections of polygons with coordinates in **working-projection metres**; never EPSG:4326 or EPSG:3857. Each feature's properties state `method` and `provenance` (`assumed` or `interpreted`). An empty FeatureCollection is valid. T03.10's code rasterises them, nearest resampling.

## Ids

Layer ids: 05 §F.1 fixes `slope` and `elevation`; the task files fix `comm_hab`, `traverse` and `pois`. The other four were added by T03.01, using the name `apps/web/src/ui/map/FullScreenMap.tsx` already has for TI.

| `layer_id` | Tiles or vector path | Record owner |
| --- | --- | --- |
| `ortho` | `tiles/ortho/` | T03.17 |
| `hillshade` | `tiles/hillshade/` | T03.17 |
| `elevation` | `tiles/elevation/` | T03.17 |
| `slope` | `tiles/slope/` | T03.17 |
| `thermal_inertia` | `tiles/thermal_inertia/` | T03.17 |
| `hazard_flags` | `tiles/hazard_flags/` | T03.17 |
| `comm_hab` | `tiles/comm_hab/` | T03.29 |
| `traverse` | `vectors/traverse.geojson` | T04.01 |
| `pois` | `vectors/pois.geojson` | T04.04 |

Asset ids follow the 05 examples: `tiles-<layer_id>`; `grid-elevation`, `grid-slope-p90`, `grid-slope-max`, `grid-flags`, `grid-ti`, `grid-comm-hab`; `vec-pois`, `vec-traverse`; `img-<name>` for `poi-<name>`. The candidate comm grids follow the [candidate asset-id rule](#candidate-asset-ids-proposed-t0331): `grid-comm-hab` for the rank-1 candidate, `grid-comm-<candidate_id>` for the others.
