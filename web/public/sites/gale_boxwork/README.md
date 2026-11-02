# Site assets: gale_boxwork

Expected layout of this folder once the pipeline runs (docs/specs/02 §E.1). **No assets are committed yet**; the pipeline writes them here (TASK-03, TASK-04). How large tiles are stored is undecided (see `docs/ops/feasibility.md`).

| Path | Purpose | Consumer |
| --- | --- | --- |
| `site-manifest.json` | Site, projection, layers, assets, sources, checksums, data version (schema: `schemas/site-manifest.schema.json`) | UI on boot |
| `tiles/<layer_id>/{z}/{x}/{y}.{ext}` | Map tiles in the working projection | OpenLayers |
| `grid/elevation.f32`, `grid/slope_p90.u8`, `grid/slope_max.u8`, `grid/flags.u8`, `grid/ti_100m.f32` | Routing/sampling arrays (row-major, north-up, little-endian) | Worker |
| `vectors/traverse.geojson`, `vectors/pois.geojson` | Vectors in working-projection metres, lat/lon kept as properties | UI |
| `images/<poi_id>.jpg` | POV images | UI |
