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

## F9 — T05b.02 synthetic v2 grids

The fixture is `packages/compute/tests/fixtures/v2grids.ts`, with a self-check in `packages/compute/tests/v2grids.test.ts`.
The source of every non-placeholder value, and every choice marked Proposed, is in the table in the header comment of
`v2grids.ts`; this section only points to it so that the fixture value rule of
[_coordination.md §e](../../../../docs/tasks/_coordination.md#e-fixtures-and-mocks) finds it from here.
