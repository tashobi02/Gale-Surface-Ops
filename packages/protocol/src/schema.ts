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

/** 05 §C Layer: `replayed` and `simulated` are never used by static layers. */
export type StaticProvenance = Exclude<Provenance, "replayed" | "simulated">;

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
    /** Byte-identical to the pipeline's working-projection constant in config.py (05 §E.3). */
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
  /**
   * v2 (05 §C Site `hab_candidates`, 2026-11-10): optional list of pre-checked candidate hab sites
   * (01 FR-53). Absent = the single `default_start` / `hab_mast` site, so current manifests and the
   * validator stay valid. When present: ≥ 1 entries, exactly one with `rank` 1, whose `default_start`
   * equals this Site's `default_start`. Cross-field rules are checked by `validate-manifest`.
   */
  hab_candidates?: HabCandidate[];
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

/**
 * v2 (05 §C HabCandidate, 2026-11-10): one pre-checked candidate hab site, prepared on Earth by the
 * pipeline and chosen at mission setup (01 FR-53). Free placement is out of scope for now. Haven
 * fields are **not** stored: the Hab Core recomputes them for the chosen candidate at runtime
 * (NFR-02).
 */
export interface HabCandidate {
  /** ^[a-z0-9-]+$; unique in the Site. */
  candidate_id: string;
  /** ≤ 80 chars. */
  label: string;
  /** ≥ 1, unique; 1 is the default. */
  rank: number;
  /** Passable cell inside the AOI. */
  hab_mast: { x_m: number; y_m: number; height_m: number };
  /** Planetocentric degrees; consistent with `hab_mast`. */
  lat: number;
  /** East-positive degrees; consistent with `hab_mast`. */
  lon_e: number;
  /** FK → Asset: the candidate's own comm grid, same encoding as `grid.comm_hab_asset`. */
  comm_hab_asset: string;
  /** The planner's start waypoint when this candidate is chosen. */
  default_start: { x_m: number; y_m: number; label: string };
  /** Why it is on the list (for example the trade-off in hab-site.md). */
  note?: string;
  /** `assumed` for a curated choice. */
  provenance: Provenance;
  /** Sources of the checks (FK → DataSource). */
  source_ids: string[];
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

// C2 legend structure, decided 2026-11-06 by the data lead (T03.01). 05 says only "ramp/classes with
// values". `classes` copies the 05 §F.1 example. `ramp` and `none` were added because elevation and TI
// have no classes, and ortho, hillshade and vector layers have no scale.

/** Discrete classes, [min, max, label] (05 §F.1). */
export interface ClassesLegend {
  type: "classes";
  /** True when class edges follow the scenario's current limits (04 §C.1). */
  breaks_follow_scenario?: boolean;
  classes: [number, number, string][];
}

/** Continuous scale, [value, label] stops, ≥ 2. Values come from the pipeline, never typed by hand. */
export interface RampLegend {
  type: "ramp";
  stops: [number, string][];
}

/** No value scale to show. */
export interface NoLegend {
  type: "none";
}

export type LayerLegend = ClassesLegend | RampLegend | NoLegend;

/** A displayable data layer (05 §C Layer; FR-02, FR-17, FR-18). */
export interface Layer {
  layer_id: string;
  title: string;
  category: "optical" | "topographic" | "thermal" | "spectral" | "hazard" | "mission";
  kind: "raster_tiles" | "vector" | "image_static";
  provenance: StaticProvenance;
  /** FK → DataSource, ≥ 1. */
  source_ids: string[];
  /** FK → Layer. Default []. */
  derived_from?: string[];
  units?: string;
  /** Ramp/classes with values. */
  legend: LayerLegend;
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
  /** 64 hex; tiles roots store the hash of their index file, so every Asset has one (05 §C, §E.3). */
  sha256: string;
  /** Required for files. */
  bytes?: number;
  /** Arrays/images. */
  width?: number;
  height?: number;
  /** Arrays: NaN for f32 (JSON has no NaN, so null in the manifest, as in the 05 example), 255 for u8. */
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
  /** u8, degrees × 4 (0.25° steps, 0–63.5°), 255 = no data. */
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
  /** FK → Asset (jpg). Image fields are absent or null when the image is unavailable (05 §E.6). */
  image_asset?: string | null;
  /** Required if image. */
  image_credit?: string | null;
  /** Required if image. */
  image_source_url?: string | null;
  image_sol?: number | null;
  image_date?: string | null;
  image_camera?: string | null;
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
  /** v2: FK → ParamSet; required when vehicle_available; default "pr1-assumed". */
  vehicle_param_set?: string;
  /**
   * v2 (T09.09): minutes to enter the hab and be sheltered — the suit ParamSet's `hab_ingress_min`
   * (02 §D.8 `t_ingress`, `assumed`, source "02 §D.8"), quoted in the plan so the planning haven
   * form can be computed without the ParamSet (the plan's MissionScenario wins over the suit
   * ParamSet for the crew's parameters, BD-57). Absent: the plan carries no planning haven time and
   * the profile's `haven_min` is null.
   */
  hab_ingress_min?: number;
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

// Required fields of PlanResult, Leg and Warning, decided 2026-11-06 by the data lead (T03.01; map open
// point 3). 05 has no Req column for them, so its wording still needs a `spec-change:` subtask:
// - Leg: `from`, `to`, `status` always. An OK leg has every metric, `geometry` and `profile`. A NO_ROUTE
//   leg has `reason` and no metrics (02 §E.2 example). `nearest_reachable` stays optional because
//   START_BLOCKED explores no cell, so 02 §D.2 cannot supply one there.
// - Warning: everything except `at_utc` ("for time warnings").
// - PlanResult: `conditions` and `radiation` may be absent, and `stops_timeline` may be empty, in the
//   legs-only M3 slice (T05.26) until T05.32 and T06.09 fill them; the UI shows "—" (TASK-09).
// - Exports (schemas/plan-export.schema.json) are looser: `computed_utc`, `timing_ms`, `cell_path_length`
//   and, pending U-11, `profile` may be absent, because a plan can be embedded without a worker run (T22.02).

/** NO_ROUTE reasons from 02 §D.2 (05 says only "reason (if NO_ROUTE)"). */
export type NoRouteReason =
  | "START_BLOCKED"
  | "END_BLOCKED"
  | "DISCONNECTED_BY_SLOPE"
  | "DISCONNECTED_BY_HAZARD"
  | "DISCONNECTED_BY_NODATA";

/** Sampled every 5 m; slope_class against the scenario's current limits (01 FR-08). */
export interface LegProfile {
  dist_m: number[];
  elev_m: number[];
  slope_class: ("ok" | "caution" | "over_limit")[];
  /** v2: 0/1 line of sight to the hab per sample. */
  comm?: (0 | 1)[];
  /**
   * v2: planning approximation of minutes to haven per sample (02 §D.8), one per `dist_m` entry and read
   * at that sample's own position. A sample the model cannot reach is null, not a number (the same rule
   * as `Crew.haven.minutes`). Absent: the plan carries no planning haven time.
   */
  haven_min?: (number | null)[];
}

/** A leg with a route (05 §C Leg; FR-07, FR-08). */
export interface OkLeg {
  from: string;
  to: string;
  status: "OK";
  distance_m: number;
  walk_time_min: number;
  climb_m: number;
  descent_m: number;
  max_slope_deg: number;
  /** [x_m, y_m] pairs, simplified for display. */
  geometry: [number, number][];
  cell_path_length: number;
  profile: LegProfile;
}

/** A leg without a route (05 §C Leg; 02 §D.2, §E.2). */
export interface NoRouteLeg {
  from: string;
  to: string;
  status: "NO_ROUTE";
  reason: NoRouteReason;
  /** Shape from 02 §E.2; absent when no cell was explored (START_BLOCKED). */
  nearest_reachable?: { x_m: number; y_m: number };
}

/** One leg between consecutive waypoints (05 §C Leg). */
export type Leg = OkLeg | NoRouteLeg;

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
  /** Per waypoint; empty in the M3 slice. */
  stops_timeline: {
    arrive_utc: string;
    depart_utc: string;
    arrive_ltst: string;
    sun_elevation_deg: number;
  }[];
  /** Flat horizon. May be absent in the M3 slice. */
  conditions?: {
    mars_year: number;
    ls_deg: number;
    sunrise_ltst: string;
    sunset_ltst: string;
    sunrise_utc: string;
    sunset_utc: string;
    /** MSL mission sol of the EVA start, `derived` by compute `mslSol` (N-15, BD-122). Absent in exports made before it existed. */
    sol?: number;
  };
  /** May be absent in the M3 slice. */
  radiation?: {
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
