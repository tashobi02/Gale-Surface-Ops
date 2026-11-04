---
name: mars-geospatial
description: Mars coordinate conventions and pitfalls (sphere radius R = 3,396,190 m, east-positive longitude, shared proj4 string, no EPSG:3857/WGS84, projected-metre distances, Mars24 west-longitude conversion, raster row 0 = north, DEM no-data to NaN). Use for any work on projection, tiles, slope, routing grids, distances or Mars24.
user-invocable: false
paths: ["pipeline/**", "apps/web/src/**"]
---
Owner: [02 §C.1 and §C.4](../../../docs/specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer). If this file disagrees with 02, 02 wins.

- Body: Mars sphere, R = 3396190 m, `IAU_2015:49900` ("Mars (2015) – Sphere"). Latitude is planetocentric.
- Longitude is east-positive (−180…180 in USGS products; Gale ≈ 137.4°E).
- Working projection is a local `+proj=eqc` string centred on the AOI (template and rationale: 02 §C.1; pipeline constant: `pipeline/src/marswalk_pipeline/config.py`, `WORKING_PROJ_TEMPLATE`). The UI uses the manifest `crs.proj4`. Keep it byte-identical in both (05 §E.3). TODO: confirm the filled-in string once TASK-03 sets the AOI centre.
- Never pass Mars coordinates through EPSG:3857 or WGS84 code paths. Never use `ol/sphere` (Earth radius).
  Compute distances in projected metres.
- Mars24 implementations often take west longitude: `west = (360 − east) mod 360`. Unit-test at Gale (02 §C.4 item 1).
- Raster row 0 = north. Check with a known feature after reprojection.
- DEM no-data (check the PDS label; e.g. −3.4e38 or −32767) becomes `NaN` before slope, or edge slopes explode.
- Related: the hookify rule `block-earth-crs` blocks `EPSG:3857|ol/sphere|fromLonLat|maplibre` in `apps/web/src/**/*.ts(x)`. It does not cover `pipeline/`.
- Every displayed value also needs a provenance label (see the `provenance-check` skill).
