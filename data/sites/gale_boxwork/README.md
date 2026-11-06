# Site assets: gale_boxwork

Expected layout of this folder once the pipeline runs (docs/specs/02 §E.1, §C.5). **No assets are committed yet**; the pipeline writes them here (TASK-03, TASK-04). Large binaries ship as a GitHub release asset (`docs/ops/feasibility.md`).

Served by the Hab Core at `/sites/gale_boxwork/…`; the Vite dev server proxies `/sites` to it (`apps/web/vite.config.ts`).

| Path | Purpose | Consumer |
| --- | --- | --- |
| `site-manifest.json` | Site, projection, layers, assets, sources, checksums, data version (schema: `schemas/site-manifest.schema.json`) | UI and Hab Core on boot |
| `tiles/<layer_id>/{z}/{x}/{y}.{ext}` | Map tiles in the working projection; each tiles root also has the index file its Asset hash covers (format: contract C9, `TODO(decision)`) | OpenLayers |
| `grid/elevation.f32`, `grid/slope_p90.u8`, `grid/slope_max.u8`, `grid/flags.u8`, `grid/ti_100m.f32` | Routing/sampling arrays (row-major, north-up, little-endian); `ti_100m.f32` sits on its own grid with `ti_cell_m` | Planner worker, Hab Core |
| `grid/comm_hab.u8` *(v2)* | Line of sight to the hab mast (1/0, 255 = no data) | Hab Core, map layer |
| `vectors/traverse.geojson`, `vectors/pois.geojson` | Vectors in working-projection metres, lat/lon kept as properties; POIs carry `stop_type` and `evidence` (v2) | UI |
| `images/<poi_id>.jpg` | POV images | UI |
