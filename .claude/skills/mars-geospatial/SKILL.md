---
name: mars-geospatial
description: Mars CRS, units and raster rules. Use for any work on projection, tiles, slope, routing grids, distances or Mars24.
paths: ["pipeline/**", "web/src/**"]
---
- Body: Mars sphere, R = 3396190 m (IAU_2015:49900). Longitude is east-positive.
- Keep the proj4 string byte-identical in the pipeline and the UI.
- Never use EPSG:3857 or WGS84 code paths. Don't use ol/sphere (Earth radius).
  Compute distances in projected metres.
- Mars24 implementations may expect west longitude: west = (360 - east) mod 360.
- Convert DEM no-data to NaN before slope. Row 0 is north.
- Label every displayed value: measured, derived, modelled or assumed.
