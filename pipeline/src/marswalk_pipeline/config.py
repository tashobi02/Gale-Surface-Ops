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

# TODO(verify): provisional 05 §F.1 ladder until C9 is frozen.
TILE_RESOLUTIONS_M = [32, 16, 8, 4, 2]
# Obidit Islam (data lead), 2026-11-10: 02 §C.3 ortho finest level is 0.5 m.
# TODO(verify): C9 tile-grid contract remains to be frozen.
ORTHO_TILE_RESOLUTIONS_M = [*TILE_RESOLUTIONS_M, 0.5]
