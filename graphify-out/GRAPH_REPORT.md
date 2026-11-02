# Graph Report - CheesySpace-NasaSpaceAppChallenge  (2026-11-02)

## Corpus Check
- 87 files · ~57,406 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 6, .jsonc 1)

## Summary
- 526 nodes · 786 edges · 35 communities (17 shown, 18 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.84)
- Token cost: 305,926 input · 0 output

## Community Hubs (Navigation)
- Repo tooling and agent rules
- Mars science reference
- Routing, provenance and site decisions
- Mission inputs and estimates (FRs)
- Pipeline raster derivation
- Pipeline acquisition and manifest
- Web dependencies
- Manifest validation
- Walking time model
- Radiation and data entities
- Root npm tooling
- Clip and reproject
- Worker message protocol
- TypeScript config
- Least-time routing
- Grid loading and sampling
- Mars24 solar time
- Product identity
- Warnings and plan status
- Web entry point
- Typography
- Pipeline package metadata

## God Nodes (most connected - your core abstractions)
1. `Mars Scientific Context Reference` - 70 edges
2. `Docs Index` - 25 edges
3. `Technical Requirements Document (02)` - 19 edges
4. `CLAUDE.md Claude Code instructions` - 17 edges
5. `01 Product Requirements Document` - 11 edges
6. `06 High-Level Implementation Plan` - 11 edges
7. `vitest` - 10 edges
8. `compilerOptions` - 10 edges
9. `Site manifest (site-manifest.json)` - 10 edges
10. `AGENTS.md agent instructions` - 10 edges

## Surprising Connections (you probably didn't know these)
- `JPL Mars Trek` --semantically_similar_to--> `Marswalk Planner`  [INFERRED] [semantically similar]
  docs/reference/challenge-overview.md → CLAUDE.md
- `Pipeline geo stack (GDAL >= 3.6, rasterio, numpy, pyproj >= 3.4)` --shares_data_with--> `gale_boxwork site bundle layout`  [INFERRED]
  pipeline/environment.yml → web/public/sites/gale_boxwork/README.md
- `Least-time A* on 5 m grid with hard slope limit and caution multipliers` --shares_data_with--> `Routing grid arrays (elevation.f32, slope_p90, slope_max, flags, ti_100m)`  [INFERRED]
  docs/decisions/ADR-004-least-time-routing.md → web/public/sites/gale_boxwork/README.md
- `Project .claude/CLAUDE.md (graphify trigger)` --conceptually_related_to--> `graphify knowledge-graph workflow`  [INFERRED]
  .claude/CLAUDE.md → CLAUDE.md
- `/trace command` --references--> `graphify knowledge-graph workflow`  [INFERRED]
  .claude/commands/trace.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Mars Surface Radiation Exposure Chain** — docs_reference_mars_scientific_context_galactic_cosmic_rays, docs_reference_mars_scientific_context_solar_energetic_particles, docs_reference_mars_scientific_context_atmospheric_shielding, docs_reference_mars_scientific_context_surface_radiation_dose, docs_reference_mars_scientific_context_rad_instrument [EXTRACTED 1.00]
- **Competing Martian Core Structure Models** — docs_reference_mars_scientific_context_core_models, docs_reference_mars_scientific_context_stahler_2021, docs_reference_mars_scientific_context_samuel_2023, docs_reference_mars_scientific_context_bi_2025, docs_reference_mars_scientific_context_insight_lander [EXTRACTED 1.00]
- **Human Surface Survival Constraints on Mars** — docs_reference_mars_scientific_context_surface_pressure, docs_reference_mars_scientific_context_armstrong_limit, docs_reference_mars_scientific_context_ebullism_hypoxia, docs_reference_mars_scientific_context_surface_radiation_dose, docs_reference_mars_scientific_context_martian_dust_hazard, docs_reference_mars_scientific_context_perchlorates [INFERRED 0.85]
- **Compute worker science functions (routing, time, solar, radiation)** — docs_specs_02_technical_requirements_document_compute_web_worker, docs_specs_02_technical_requirements_document_a_star_least_time_routing, docs_specs_02_technical_requirements_document_tobler_hiking_function, docs_specs_02_technical_requirements_document_mars24_algorithm, docs_specs_02_technical_requirements_document_radiation_dose_model [EXTRACTED 1.00]
- **Provenance and scientific transparency system** — docs_specs_01_product_requirements_document_provenance_labels, docs_specs_01_product_requirements_document_fr_15_provenance_and_methods, docs_specs_02_technical_requirements_document_nfr_05_scientific_transparency, docs_specs_04_design_brief_provenance_chips, docs_specs_03_app_flow_and_diagrams_scr_09_sources_and_methods, docs_specs_05_backend_and_database_schema_layer [INFERRED 0.85]
- **Reproducible plan result (data_version + scenario + waypoints -> plan_hash)** — docs_specs_05_backend_and_database_schema_planexport, docs_specs_05_backend_and_database_schema_plan_hash, docs_specs_05_backend_and_database_schema_data_version, docs_specs_05_backend_and_database_schema_missionscenario, docs_specs_05_backend_and_database_schema_waypoint, docs_specs_02_technical_requirements_document_nfr_06_determinism [EXTRACTED 1.00]
- **Labelled estimate models feeding the briefing card** — docs_decisions_adr_005_estimate_models_tobler_speed, docs_decisions_adr_005_estimate_models_rad_dose, docs_decisions_adr_005_estimate_models_mars24_sun, docs_readme_briefing_card, claude_provenance_label [INFERRED 0.85]
- **Project non-negotiables enforced by agents, PR template and CI** — claude_offline_first, claude_deterministic_science, claude_provenance_label, claude_mars_crs, claude_phase_gate, _github_pull_request_template_checklist [EXTRACTED 1.00]
- **Proposed decisions with fallback triggers** — docs_decisions_adr_001_site_selection_jezero_fallback, docs_decisions_adr_002_static_app_no_backend_fastapi_fallback, docs_decisions_adr_003_openlayers_mars_projection_imagestatic_fallback, docs_decisions_adr_004_least_time_routing_manual_polyline_fallback [EXTRACTED 1.00]

## Communities (35 total, 18 thin omitted)

### Community 0 - "Repo tooling and agent rules"
Cohesion: 0.05
Nodes (68): Project .claude/CLAUDE.md (graphify trigger), /rehearse-offline command, Demo freeze criteria (06 §D.6), /trace command, Pull request template, PR checklist (traceability, provenance, offline, Mars CRS), CI workflow, CI check job (setup, lint, typecheck, test, docs-check, build) (+60 more)

### Community 1 - "Mars science reference"
Cohesion: 0.06
Nodes (60): Mars Scientific Context Reference, Acuna et al. 1999 - Global distribution of crustal magnetization, Armstrong Limit (62.8 mbar), Bi et al. 2025 - Seismic detection of a 600-km solid inner core in Mars, Cheyava Falls Potential Biosignature, CO2-Dominated Thin Atmosphere (95.1% CO2), Earth-Mars Communication Delay, Competing Martian Core Models (+52 more)

### Community 2 - "Routing, provenance and site decisions"
Cohesion: 0.06
Nodes (44): A-03 Hard slope limit 15 deg, caution 10 deg, Core demonstration scenario (9 steps, Wi-Fi off), FR-07 Constraint-aware route computation, FR-15 Provenance and methods, FR-16 Offline and degraded operation, FR-17 Curiosity traverse overlay, A* least-time route search on 8-connected 5 m grid, CRISM MTRDR spectral summary parameters (+36 more)

### Community 3 - "Mission inputs and estimates (FRs)"
Cohesion: 0.06
Nodes (43): A-02 Suited flat-ground speed 3.3 km/h (Apollo 17), FR-04 Points of interest with ground imagery, FR-05 Mission inputs with validated defaults, FR-06 Waypoint placement and editing, FR-09 Traverse time, distance and return estimates, FR-10 Hazard and constraint warnings, FR-11 Daylight and sun conditions, FR-12 Radiation dose estimate (+35 more)

### Community 4 - "Pipeline raster derivation"
Cohesion: 0.07
Nodes (14): aggregate_slope(), hazard_flags(), hillshade(), horn_slope_deg(), encode_slope_u8(), write_grid(), test_aggregate_slope_p90_and_max_to_5m_grid(), test_hazard_flags_ti_gap_is_ti_unknown_not_zero() (+6 more)

### Community 5 - "Pipeline acquisition and manifest"
Cohesion: 0.07
Nodes (11): fetch_sources(), sha256_file(), write_manifest(), render_tiles(), package_pois(), package_traverse(), anchors(), lines_outside_fences() (+3 more)

### Community 6 - "Web dependencies"
Cohesion: 0.06
Nodes (22): ol, proj4, typescript, vite, vitest, dependencies, ol, proj4 (+14 more)

### Community 7 - "Manifest validation"
Cohesion: 0.16
Nodes (10): main(), validate(), test_all_grids_share_width_height_cell_origin(), test_crs_proj4_byte_identical_to_pipeline_constant(), test_every_asset_ref_resolves_and_sha256_matches(), test_every_source_id_resolves_to_a_data_source(), test_manifest_validates_against_json_schema(), test_pois_and_default_start_inside_aoi_and_passable() (+2 more)

### Community 8 - "Walking time model"
Cohesion: 0.16
Nodes (7): ComputePlanRequest, ADR-0005, PlanState, PlanStore, MissionScenario, PlanResult, Waypoint

### Community 9 - "Radiation and data entities"
Cohesion: 0.12
Nodes (14): ADR-0005, Asset, DataSource, EnvConstant, FLAG_BITS, Layer, PlanExport, PlanTotals (+6 more)

### Community 10 - "Root npm tooling"
Cohesion: 0.13
Nodes (14): description, devDependencies, markdownlint-cli2, license, name, private, scripts, build (+6 more)

### Community 11 - "Clip and reproject"
Cohesion: 0.18
Nodes (7): clip_and_reproject(), nodata_to_nan(), test_dem_nodata_becomes_nan_before_slope(), test_no_epsg_3857_or_wgs84_in_code_paths(), test_projection_round_trip_lat_lon_xy_within_1_mm(), test_row_0_is_north_after_reprojection(), test_scale_bar_vs_dem_measured_feature_within_2_percent()

### Community 12 - "Worker message protocol"
Cohesion: 0.19
Nodes (10): CANCEL_CHECK_EVERY_EXPANSIONS, PlanResultMessage, SamplePointRequest, SampleReason, SampleResult, WorkerError, WorkerErrorCode, WorkerRequest (+2 more)

### Community 13 - "TypeScript config"
Cohesion: 0.17
Nodes (11): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 14 - "Least-time routing"
Cohesion: 0.20
Nodes (6): ADR-0004, LegSearch, MAX_NODE_EXPANSIONS, MAX_STOPS, SNAP_RADIUS_M, NoRouteReason

### Community 15 - "Grid loading and sampling"
Cohesion: 0.24
Nodes (3): LoadedGrid, Leg, RoutingGrid

### Community 17 - "Product identity"
Cohesion: 0.50
Nodes (3): Marswalk Planner, NASA Space Apps 2026: Interplanetary Survival Guide - Martian Map, P1 EVA planner persona

## Ambiguous Edges - Review These
- `Mean Surface Pressure (6.36 mbar)` → `Global Crustal Dichotomy`  [AMBIGUOUS]
  docs/reference/mars-scientific-context.md · relation: conceptually_related_to
- `Error and recovery flows` → `Auto-routing -> manual polyline + validation fallback`  [AMBIGUOUS]
  docs/specs/03_App_Flow_and_Diagrams.md · relation: conceptually_related_to

## Knowledge Gaps
- **92 isolated node(s):** `name`, `private`, `description`, `license`, `lint:md` (+87 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 193 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Mean Surface Pressure (6.36 mbar)` and `Global Crustal Dichotomy`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Mars Scientific Context Reference` connect `Mars science reference` to `Repo tooling and agent rules`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Technical Requirements Document (02)` (e.g. with `Mean Surface Pressure (6.36 mbar)` and `Surface Radiation Dose (~0.64-0.9 mSv/day)`) actually correct?**
  _`Technical Requirements Document (02)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `description` to the rest of the system?**
  _92 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Repo tooling and agent rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05485232067510549 - nodes in this community are weakly interconnected._
- **What is the exact relationship between `Error and recovery flows` and `Auto-routing -> manual polyline + validation fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Docs Index` connect `Repo tooling and agent rules` to `Mars science reference`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._