/**
 * Data structures from docs/specs/05_Backend_and_Database_Schema.md §C.
 * Field names are copied exactly from 05; 05 owns them. Change 05 first, then this file
 * and schemas/*.schema.json together.
 *
 * Units and conventions (05 §C): x_m / y_m in the site's working projection (metres,
 * x east, y north); lat planetocentric degrees; lon_e east-positive degrees −180…180;
 * *_m elevations in the DEM's MOLA-tied datum; times ISO-8601 UTC; LTST as "HH:MM".
 */

/** Provenance label carried by every displayed value (FR-15, NFR-05). */
/** v2 adds `replayed` (real history on the mission clock) and `simulated` (engine output); 01 legend, 05 change log. */
export type Provenance = "measured" | "derived" | "modelled" | "assumed" | "replayed" | "simulated";

// ---------------------------------------------------------------------------
// Static entities (site manifest and its assets)
// ---------------------------------------------------------------------------

/** Root of site-manifest.json (05 §C Site; FR-01). */
export interface Site {
  /** SemVer; app checks major. */
  schema_version: string;
  /** ^[a-z0-9_]+$ */
  site_id: string;
  /** ≤ 80 chars. */
  name: string;
  body: "mars";
  /** <site_id>-YYYY.MM.DD[.n] */
  data_version: string;
  crs: {
    /** Must equal the pipeline string exactly. */
    proj4: string;
    /** IAU code of geographic base, e.g. "IAU_2015:49900". */
    base: string;
  };
  aoi: {
    /** [minx, miny, maxx, maxy] in metres. */
    extent_m: [number, number, number, number];
    /** [min_lon_e, min_lat, max_lon_e, max_lat], inside DEM extent. */
    bbox_geo: [number, number, number, number];
  };
  /** Passable cell. */
  default_start: { x_m: number; y_m: number; label: string };
  /** Measured layer-to-ortho offsets (m). Default {}. */
  known_offsets_m?: Record<string, number | null>;
  layers: Layer[];
  sources: DataSource[];
  grid: RoutingGrid;
  env_constants: EnvConstant[];
  /** Every file the site uses; target of all *_asset / asset_id FKs. */
  assets: Asset[];
  /** FK → Asset. */
  pois_asset: string;
  /** FK → Asset. */
  traverse_asset: string;
}

/** A cited external product (05 §C DataSource; FR-15). */
export interface DataSource {
  /** Unique, kebab-case. */
  source_id: string;
  title: string;
  publisher: string;
  authors?: string;
  missions: string[];
  instruments: string[];
  version: string;
  /** https */
  url: string;
  doi?: string;
  /** Shown in UI. */
  credit: string;
  licence: string;
  /** Date accessed (YYYY-MM-DD). */
  accessed: string;
  native_resolution_m?: number;
  accuracy_note?: string;
}

/** Tile grid of a raster_tiles layer (05 §C Layer.tile_grid). */
export interface TileGrid {
  origin_m: [number, number];
  resolutions_m: number[];
  tile_size_px: number;
  format: string;
}

/** A displayable data layer (05 §C Layer; FR-02, FR-17, FR-18). */
export interface Layer {
  layer_id: string;
  title: string;
  category: "optical" | "topographic" | "thermal" | "spectral" | "hazard" | "mission";
  kind: "raster_tiles" | "vector" | "image_static";
  provenance: Provenance;
  /** FK → DataSource, ≥ 1. */
  source_ids: string[];
  /** FK → Layer. Default []. */
  derived_from?: string[];
  units?: string;
  /** Ramp/classes with values; 05 does not fix the structure. */
  legend: Record<string, unknown>;
  native_resolution_m: number;
  display_resolution_m: number;
  /** FK → Asset (tiles root). */
  asset_id: string;
  /** Required when kind = "raster_tiles". */
  tile_grid?: TileGrid;
  default_visible: boolean;
  /** false only for basemap. */
  optional: boolean;
  /** Shown in legend/methods. */
  limitations: string;
}

/** A file on disk with checksum (05 §C Asset; NFR-06, NFR-10). */
export interface Asset {
  asset_id: string;
  /** Relative to site folder. */
  path: string;
  format: "f32" | "u8" | "geojson" | "jpg" | "png" | "webp" | "tiles";
  /** 64 hex; required for files; tiles roots store hash of index file. */
  sha256?: string;
  /** Required for files. */
  bytes?: number;
  /** Arrays/images. */
  width?: number;
  height?: number;
  /** Arrays: NaN for f32, 255 for u8. */
  nodata?: number | null;
  byte_order?: "little";
}

/** Aligned arrays used for sampling and routing (05 §C RoutingGrid; FR-03, FR-07). */
export interface RoutingGrid {
  /** > 0, metres. */
  cell_m: number;
  /** width*height ≤ 4e6. */
  width: number;
  height: number;
  /** Top-left corner (x, y), metres. */
  origin_m: [number, number];
  row_order: "north_up";
  /** f32, metres, bilinear-resampled mean of 1 m DEM. */
  elevation_asset: string;
  /** u8, degrees × 4 (0.25° steps), 255 = no data. */
  slope_p90_asset: string;
  /** Same encoding as slope_p90_asset. */
  slope_max_asset: string;
  /** u8 bitfield, see FLAG_BITS. */
  flags_asset: string;
  /** f32 tiu at 100 m on its own small grid. */
  ti_asset?: string;
  /** Required with ti_asset; TI grid cell size, metres. */
  ti_cell_m?: number;
  /** v2: u8, 1 = line of sight to the hab mast, 0 = none, 255 = no data (02 §C.5 L11). */
  comm_hab_asset: string;
  /** v2: mast used for comm_hab. */
  hab_mast: { x_m: number; y_m: number; height_m: number };
}

/** Bit positions of RoutingGrid flags (05 §C "Flag bits"); bits 5–7 reserved. */
export const FLAG_BITS = {
  NO_DATA: 0,
  HARD_HAZARD: 1,
  LOW_TI: 2,
  TI_UNKNOWN: 3,
  LOW_RES_DEM: 4,
} as const;
export type FlagName = keyof typeof FLAG_BITS;

/** Curated science point of interest; properties of a GeoJSON Feature (05 §C POI; FR-04). */
export interface POI {
  poi_id: string;
  name: string;
  /** Inside AOI. */
  lat: number;
  lon_e: number;
  /** ≤ 300 chars. */
  science_objective: string;
  /** ≤ 300 chars. */
  why_it_matters: string;
  /** FK → Asset (jpg). */
  image_asset?: string;
  /** Required if image. */
  image_credit?: string;
  /** Required if image. */
  image_source_url?: string;
  image_sol?: number;
  image_date?: string;
  image_camera?: string;
  /** How coordinates were obtained. */
  position_source: string;
  /** ≥ 0, metres. */
  position_uncertainty_m: number;
  /** Usually "assumed" for curated positions. */
  provenance: Provenance;
  /** v2: Exploration Zone stop type (01 §A.4). */
  stop_type: "science" | "resource" | "engineering";
  /** v2: short kicker, e.g. "Hydrated sulfates — ISRU water". */
  ez_theme: string;
  /** v2: ≥ 1 item; each cites a DataSource. */
  evidence: { text: string; source_id: string }[];
}

/** POI as stored in vectors/pois.geojson (working-projection metres). */
export interface POIFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: POI;
}

/** Historical Curiosity position; GeoJSON Point properties (05 §C TraversePoint; FR-17). */
export interface TraversePoint {
  sol: number;
  site_drive?: string;
  lat?: number;
  lon_e?: number;
  /** If provided. */
  elevation_m?: number;
  /** FK → DataSource. */
  source_id: string;
}

/** Measured or reported constant used in estimates (05 §C EnvConstant; FR-12). */
export interface EnvConstant {
  const_id: string;
  quantity: string;
  value: number;
  low: number;
  high: number;
  unit: string;
  conditions: Record<string, unknown>;
  note?: string;
  provenance: Provenance;
  /** FK → DataSource. */
  source_id: string;
}

// ---------------------------------------------------------------------------
// Runtime entities (user input and computed output)
// ---------------------------------------------------------------------------

/** User-set constraints (05 §C MissionScenario; FR-05). Ranges in 02 §E.3. */
export interface MissionScenario {
  /** ISO-8601 UTC, year 2000–2100. */
  eva_start_utc: string;
  /** 0.5–10 h, default 6.0. */
  max_eva_duration_h: number;
  /** 0–180 min, default 20. */
  dwell_min_per_stop: number;
  /** 5–35°, > caution_slope_deg, default 15. */
  hard_slope_limit_deg: number;
  /** 2–30°, default 10. */
  caution_slope_deg: number;
  /** 0.5–20 km, default 5.0. */
  walkback_limit_km: number;
  /** 0.5–6 km/h, default 3.3. */
  suited_flat_speed_kmh: number;
  solar_phase: "max" | "min";
  loop: boolean;
  /** v2: 5–120 min, default 30 (A-08). */
  max_haven_min: number;
  /** v2: 1–2, default 2. */
  crew_count: 1 | 2;
  /** v2: default true. */
  vehicle_available: boolean;
  /** v2: FK → ParamSet; required when vehicle_available. */
  vehicle_param_set?: string;
}

/** Start or stop placed by the user (05 §C Waypoint; FR-06). */
export interface Waypoint {
  /** wp-<n> */
  id: string;
  /** Exactly one start; ≤ 10 stops. */
  role: "start" | "stop";
  x_m: number;
  y_m: number;
  /** FK → POI. */
  poi_id?: string;
  /** Present if snapped. */
  snapped_from?: { x_m: number; y_m: number };
  /** ≤ 40 chars. */
  label?: string;
}

// TODO(decision): 05 has no Req column for PlanResult, Leg and Warning. Fields below are
// required unless 05 marks them conditional ("if NO_ROUTE", "null when PARTIAL",
// "for time warnings"); the JSON Schema marks none required.

/** NO_ROUTE reasons from 02 §D.2 (05 says only "reason (if NO_ROUTE)"). */
export type NoRouteReason =
  | "START_BLOCKED"
  | "END_BLOCKED"
  | "DISCONNECTED_BY_SLOPE"
  | "DISCONNECTED_BY_HAZARD"
  | "DISCONNECTED_BY_NODATA";

/** One leg between consecutive waypoints (05 §C Leg; FR-07, FR-08). */
export interface Leg {
  from: string;
  to: string;
  status: "OK" | "NO_ROUTE";
  /** If NO_ROUTE. */
  reason?: NoRouteReason;
  distance_m: number;
  walk_time_min: number;
  climb_m: number;
  descent_m: number;
  max_slope_deg: number;
  /** [x_m, y_m] pairs, simplified for display. */
  geometry: [number, number][];
  cell_path_length: number;
  /** If NO_ROUTE; shape from 02 §E.2. */
  nearest_reachable?: { x_m: number; y_m: number };
  /** Sampled every 5 m; slope_class against the scenario's current limits (01 FR-08). */
  profile: {
    dist_m: number[];
    elev_m: number[];
    slope_class: ("ok" | "caution" | "over_limit")[];
    /** v2: 0/1 line of sight to the hab per sample. */
    comm?: (0 | 1)[];
    /** v2: planning approximation of minutes to haven per sample (02 §D.8). */
    haven_min?: number[];
  };
}

/** Hazard or constraint warning (05 §C Warning; FR-10). */
export interface Warning {
  code:
    | "OVER_HARD_SLOPE"
    | "CAUTION_SLOPE"
    | "LOW_TI"
    | "TI_UNKNOWN"
    | "LOW_RES_DEM"
    | "NO_DATA_ADJACENT"
    | "NO_ROUTE"
    | "EVA_DURATION_EXCEEDED"
    | "WALKBACK_EXCEEDED"
    | "DARKNESS"
    // v2
    | "COMM_SHADOW"
    | "HAVEN_TIME_EXCEEDED"
    | "RADIATION_ALERT"
    | "CONSUMABLES_LOW";
  severity: "caution" | "blocked" | "unknown";
  /** Leg index or null. */
  leg: number | null;
  /** Along-leg distance, metres; null when the warning has no location (e.g. EVA_DURATION_EXCEEDED). */
  from_m: number | null;
  to_m: number | null;
  /** For time warnings. */
  at_utc?: string;
  message: string;
}

/** Plan totals; null when PARTIAL (05 §C PlanResult.totals). */
export interface PlanTotals {
  distance_m: number;
  walk_time_min: number;
  dwell_time_min: number;
  eva_total_min: number;
  eva_margin_min: number;
  climb_m: number;
  descent_m: number;
  max_slope_deg: number;
  max_walkback_km: number;
}

/** Computed result (05 §C PlanResult; FR-07–FR-12). */
export interface PlanResult {
  status: "OK" | "OVER_LIMITS" | "PARTIAL" | "ERROR";
  /** One per consecutive waypoint pair (+ return leg if loop). */
  legs: Leg[];
  totals: PlanTotals | null;
  stops_timeline: {
    arrive_utc: string;
    depart_utc: string;
    arrive_ltst: string;
    sun_elevation_deg: number;
  }[];
  /** Flat horizon. */
  conditions: {
    mars_year: number;
    ls_deg: number;
    sunrise_ltst: string;
    sunset_ltst: string;
    sunrise_utc: string;
    sunset_utc: string;
  };
  radiation: {
    dose_mSv: number;
    dose_low_mSv: number;
    dose_high_mSv: number;
    solar_phase: "max" | "min";
    const_id: string;
  };
  warnings: Warning[];
  computed_utc: string;
  /** Diagnostics. */
  timing_ms: Record<string, number>;
}

/** Serialised scenario + waypoints + result + provenance (05 §C PlanExport; FR-14). */
export interface PlanExport {
  export_schema_version: string;
  app_version: string;
  site_id: string;
  data_version: string;
  /** First 12 hex of SHA-256 over canonical JSON of {data_version, scenario, waypoints}. */
  plan_hash: string;
  scenario: MissionScenario;
  waypoints: Waypoint[];
  result: PlanResult;
  provenance_summary: { value_path: string; provenance: Provenance; source_ids: string[] }[];
  disclaimer: string;
}
