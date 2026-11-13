"""Constants shared by every pipeline step (docs/specs/02 §C.1, docs/specs/05 §C).

Constants only. The working projection string is filled in for the chosen AOI by TASK-03,
and must then be copied byte-for-byte into site-manifest.json `crs.proj4` (05 §E.3).
"""

# Mars sphere radius, metres (02 §C.1, Confirmed: USGS DEM metadata Radius A = C = 3396190).
MARS_RADIUS_M = 3396190

# IAU code of the geographic base, "Mars (2015) – Sphere" (02 §C.1).
CRS_BASE = "IAU_2015:49900"

# Working projection template (02 §C.1, Proposed). The <...> placeholders are the AOI centre.
WORKING_PROJ_TEMPLATE = (
    "+proj=eqc +lat_ts=<AOI centre lat> +lat_0=<AOI centre lat> +lon_0=<AOI centre lon> "
    "+x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
)

# Routing grid cell size, metres (02 §D.2, 05 §F.1).
GRID_CELL_M = 5
# Opt-in fallback (T03.24, `--cell-m 10`): the 10 m cell is the vehicle lattice size of 02 §D.9 (compute VEHICLE_GRID_CELL_M).
# Nothing else is accepted: the 1 m DEM and the 100 m TI grid both divide into these cells.
GRID_CELL_CHOICES_M = (GRID_CELL_M, 10)

# Slope encoding: u8 = degrees × 4 (0.25° steps); 255 = no data (05 §C RoutingGrid).
SLOPE_U8_SCALE = 4
U8_NODATA = 255

# Flag bit positions in grid/flags.u8 (05 §C "Flag bits"); bits 5–7 reserved.
FLAG_BITS = {
    "NO_DATA": 0,
    "HARD_HAZARD": 1,
    "LOW_TI": 2,
    "TI_UNKNOWN": 3,
    "LOW_RES_DEM": 4,
}

# D-01 remains open; the data lead directed work to proceed on the proposed AOI.
WORKING_PROJ = (
    "+proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 "
    "+x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
)

# Site projections: data lead decision 2026-11-06; mock uses 05 §F.1.
PROJ4_BY_SITE = {
    "gale_boxwork": WORKING_PROJ,
    "mock_site": (
        "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 "
        "+x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
    ),
}

# Tile resolution ladders, metres per pixel from the coarsest level (z = 0) to the finest.
# docs/contracts/tile-grid.md (C9 v1.2) governs addressing, origin, resolutions and encoding;
# test_tiles.py::test_c9_* and test_main.py::test_*_tile_grid_follows_c9 check conformity.
TILE_RESOLUTIONS_M = [32, 16, 8, 4, 2]
# 02 §C.3 ortho finest level is 0.5 m (data lead, 10 Nov 2026).
ORTHO_TILE_RESOLUTIONS_M = [*TILE_RESOLUTIONS_M, 0.5]


def limit_resolutions(resolutions_m, max_zoom):
    """The kept tile ladder of the opt-in `--max-zoom` fallback (T03.23): level 0 (coarsest) up to and including `max_zoom`.

    The one place that drops finer levels: the tiles step and the manifest writer both call it, so the tiles on disk and the
    manifest's `tile_grid.resolutions_m` cannot disagree. `None` keeps every level; a level above the finest keeps all.
    """
    if max_zoom is None:
        return list(resolutions_m)
    if isinstance(max_zoom, bool) or not isinstance(max_zoom, int) or max_zoom < 0:
        raise ValueError(f"max-zoom must be a non-negative integer level, got {max_zoom!r}")
    return list(resolutions_m)[: max_zoom + 1]

# 04 §C.1 OPS `void` token: the app and map background. Ortho pixels outside the source mask or
# outside aoi.extent_m are written in this colour (BD-18, 02 §C.2 L1).
MAP_BACKGROUND_RGB = (0x0B, 0x0D, 0x10)

# Elevation and thermal-inertia colour ramp (BD-17, BD-135): 04 OPS neutral tokens `edge`,
# `text-2`, `text-1`, evenly spaced from the 2nd to the 98th percentile of the valid AOI cells.
# Neutral on purpose: status colours mean status only and brand orange never appears in OPS.
DATA_RAMP_RGB = ((0x5C, 0x66, 0x70), (0xA9, 0xB3, 0xBE), (0xEC, 0xEF, 0xF2))
RAMP_PERCENTILES = (2, 98)

# Hazard-flag display colours (BD-136), the 04 OPS status tokens: HARD_HAZARD `warning`,
# LOW_TI `caution`, LOW_RES_DEM `advisory`, NO_DATA and TI_UNKNOWN `unknown`. Highest first.
HAZARD_DISPLAY_RGB = (
    ("HARD_HAZARD", (0xFF, 0x4D, 0x4D)),
    ("LOW_TI", (0xFF, 0xB0, 0x20)),
    ("LOW_RES_DEM", (0x4C, 0xC9, 0xF0)),
    ("TI_UNKNOWN", (0xB8, 0xA9, 0xFF)),
    ("NO_DATA", (0xB8, 0xA9, 0xFF)),
)
# Line-of-sight cells of comm_hab tiles are white; shadow and no-data are transparent (C9 §4).
COMM_VISIBLE_RGB = (255, 255, 255)
