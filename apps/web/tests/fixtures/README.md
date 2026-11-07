# Web test fixtures

## F4 — T03.02 mock site bundle

`data/sites/mock_site/` exercises FR-01–FR-04 and FR-17 offline. It is synthetic
test input, never flight, science or demo data. Rebuild from the worktree root:

```sh
PYTHONPATH="$PWD/pipeline/src" PYTHONDONTWRITEBYTECODE=1 \
  $(make -s pipeline-python) pipeline/tests/fixtures/make_mock_site.py
```

The standard-library-only generator reads local specs, writes sorted JSON and
skips unchanged bytes. It reconciles stale output inside `mock_site` only.
Binary arrays are little-endian, row-major and north-up. Every Asset has a
SHA-256; tile roots hash their `index.json`, which lists every tile's relative
path, byte count and SHA-256 in path order.

Sources of fixture values:

| Values | Source |
| --- | --- |
| CRS, AOI, default start, null traverse offset, complete slope Layer (including legend, tile grid, resolutions, limitations and provenance), complete USGS DataSource and solar-max EnvConstant | [05 §F.1](../../../../docs/specs/05_Backend_and_Database_Schema.md#f1-site-manifest-abridged-aoi-values-illustrative-until-task-01), copied verbatim |
| `mock_site`, synthetic bundle name | T03.02 / fixture F4; name is placeholder text |
| Fixed release date and schema version | 05 §F.1; `data_version` substitutes `mock_site` using the [05 §C Site](../../../../docs/specs/05_Backend_and_Database_Schema.md#site) pattern |
| Solar-min id, value, bounds, unit and measured provenance | [05 §C EnvConstant](../../../../docs/specs/05_Backend_and_Database_Schema.md#envconstant); quantity and location reuse solar-max, solar phase is `min`, note is copied from the solar-min sentence; no period is invented |
| Radiation source URLs and bibliography labels | [Local scientific context §9](../../../../docs/reference/mars-scientific-context.md#9-radiation-and-space-environment), Hassler et al. 2014 and Simonsen et al. 2024; no network retrieval |
| Radiation DataSource metadata | Typed placeholders: empty publisher/version, empty mission/instrument arrays; credit/title use the local bibliography label. `accessed` copies the F.1 date as fixture metadata, not an actual access date; licence is `TODO(verify)` |
| Hab mast position and height | [05 §C RoutingGrid](../../../../docs/specs/05_Backend_and_Database_Schema.md#routinggrid) example, copied verbatim |
| Coarse routing grid | Declared synthetic resolution: reuse F.1 `ti_cell_m` (100 m); width/height (60 each) and top-left origin are computed from the copied extent. TI has its specified 100 m resolution and coincident dimensions here |
| Flat elevation and available TI values | Typed `0` placeholders; TI zeros are neither measured thermal inertia nor a chosen LOW_TI threshold |
| Wall and gap | Declared synthetic shape: central column, central-row single gap, spanning the grid. Wall angle is the 20° case in [02 §D.2](../../../../docs/specs/02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10); both slope arrays use it; elevation stays a flat placeholder |
| No-data, hazard and TI gap locations | Declared synthetic shapes: top-left 2×2 no-data patch; one HARD_HAZARD cell at `(height−2, width−2)`; one TI gap at `(height//4, width//4)`. Other cells have no hazard bits |
| Array encoding and flag masks | [05 §C RoutingGrid / Flag bits](../../../../docs/specs/05_Backend_and_Database_Schema.md#routinggrid): slope ×4; u8 nodata 255; f32 NaN with JSON nodata null; NO_DATA, HARD_HAZARD and TI_UNKNOWN bit positions. The no-data patch also has unknown TI |
| `comm_hab` | Declared synthetic mask: 1 west of the wall or on the gap row, 0 elsewhere, 255 over the no-data patch; exercises v2 encoding only, not a viewshed calculation |
| Placeholder elevation Layer | Resolves the slope's `derived_from` FK. Assumed provenance, empty dependencies, `none` legend, placeholder title/limitations; metre unit from 05 §C, resolutions and tile grid reuse F.1 |
| Placeholder PNGs | Declared synthetic display: alternating grayscale 0/255 rows, 8-bit grayscale PNG. First two/coarsest F.1 levels only; tile counts and indices cover the AOI and are computed from origin, resolution and tile size. No scientific colour scale is represented |
| POI geometry and original non-image properties | [05 §F.2](../../../../docs/specs/05_Backend_and_Database_Schema.md#f2-poi-feature), copied verbatim; every image field is omitted to exercise SCR-06's missing-image state (05 §E.6) |
| POI v2 fields | Declared synthetic selection `stop_type: science` from the schema enum; `ez_theme` and evidence text are typed empty-string placeholders. Evidence cites the copied USGS DataSource, not a fabricated scientific claim |
| Traverse sols | Range endpoints from [02 §C.2](../../../../docs/specs/02_Technical_Requirements_Document.md#c2-data-layers), and the image sol from 05 §F.2 |
| Traverse coordinates | Deterministic linear interpolation from the default start to the POI, including endpoints; working-projection metres. Assumed provenance and placeholder note identify it as synthetic, not measured rover localization or a passable planned route. Source id resolves to the F.1 USGS record; optional geographic/elevation/site-drive properties are omitted |
| Asset sizes, dimensions, hashes and tile-index entries | Computed from the generated bytes and grid/tile shapes; no downloaded assets |

`TODO(verify)`: C9 does not exist yet. The provisional layout is
`tiles/<layer_id>/{z}/{x}/{y}.png`, with nonnegative y increasing south from the
top-left origin. The provisional index is an object containing a `tiles` array
of `{path, bytes, sha256}` objects, with sorted JSON keys. Confirm layout,
y direction and index format when T02.01 freezes C9; regenerate consumers then.
The manifest retains the full example resolution ladder even though only its
two coarsest levels are populated in this small fixture.

`TODO(verify)`: complete radiation source metadata before treating it as a real
bundle. `TODO(decision)`: `simonsen-2024-rad` is a local fixture source id pending
the canonical solar-min source decision (map open point 12).

The F.1 CRS is copied exactly as directed; `config.py` currently contains only
the projection template, so equality with a finalized pipeline CRS remains
`TODO(verify)` for T03.13. T03.14's `validate-manifest` is currently a stub.
The orchestrator validates the manifest against C2 with ajv; this generator has
no jsonschema dependency. Git status/ignore checks belong to the orchestrator.

## F1 — Synthetic routing grids

`apps/web/tests/fixtures/grids.ts` provides synthetic `LoadedGrid` builders for
compute core unit tests and validation cases (contract C4 v1). Implemented by
T05.02 (FR-07, 02 §D.2).

Per the fixture value rule (`CLAUDE.md` §2, ADR-006), no slope or elevation
number is typed by hand; all arrays are derived programmatically in code from
declared geometric shape parameters and spec constants. All builders accept
`width`, `height`, `cell_m`, and `origin_m` as parameters without assuming 5 m
cells.

| Shape | Builder | Parameters | Spec case served | Contract | Sources of values |
| --- | --- | --- | --- | --- | --- |
| 10° plane | `makePlaneGrid` | `slope_deg` (default 10°), `direction` | [02 §D.3](../../../../docs/specs/02_Technical_Requirements_Document.md#d3-walking-time-model-fr-09) walking time test case (1 km at constant +10° gradient) | C4 v1 | 02 §D.3 reference gradient; 05 §C slope encoding ($10 \times 4 = 40$ u8); elevation derived from $col \times cell\_m \times \tan(10^\circ)$ |
| Wall with gap | `makeWallWithGapGrid` | `wall_col`, `gap_row`, `wall_slope_deg` (default 20°) | [02 §D.2](../../../../docs/specs/02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10) Validation case 1 (wall with one gap $\rightarrow$ route passes through gap) | C4 v1 | 02 §D.2 validation case; wall slope ($20 \times 4 = 80$ u8) exceeds 15° hard limit; single passable opening ($0^\circ$) at `gap_row` |
| 20° ramp | `makeRampGrid` | `ramp_slope_deg` (default 20°), `direction` | [02 §D.2](../../../../docs/specs/02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10) Validation case 2 (uniform 20° ramp with 15° limit $\rightarrow$ `NO_ROUTE / DISCONNECTED_BY_SLOPE`) | C4 v1 | 02 §D.2 validation case; uniform slope ($20 \times 4 = 80$ u8); elevation derived from $col \times cell\_m \times \tan(20^\circ)$ |
| NaN island | `makeNanIslandGrid` | `island_row`, `island_col`, `island_width`, `island_height` | [02 §D.1](../../../../docs/specs/02_Technical_Requirements_Document.md#d1-point-sampling-fr-03-fr-08) & [02 §D.2](../../../../docs/specs/02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10) (NaN barrier around target / `NO_DATA` handling) | C4 v1 | 05 §C Asset/RoutingGrid: `NaN` elevation, `255` u8 no-data slope, `1 << FLAG_BITS.NO_DATA` |
| Hazard wall | `makeHazardWallGrid` | `wall_col`, `gap_row` (optional) | [02 §D.2](../../../../docs/specs/02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10) (`HARD_HAZARD` impassability check) | C4 v1 | 05 §C Flag bits: `1 << FLAG_BITS.HARD_HAZARD` |
| No-TI variant | `withoutTi` / `includeTi: false` | `grid: LoadedGrid` or builder option | [05 §E.6](../../../../docs/specs/05_Backend_and_Database_Schema.md#e6-unavailable-or-replaced-source-data) (unavailable TI sidecar) | C4 v1 | 05 §C RoutingGrid: `ti` and `ti_asset` omitted |
