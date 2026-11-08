# Verification log

| | |
| --- | --- |
| **Owner** | Shared, append-only. Each section names the subtask and the person who ran it |
| **Date** | 2026-11-06 (first section) |
| **Status** | Open: sections are added as verify subtasks finish. Add new sections at the end and keep existing ones on rebase |
| **Related** | [Docs index](../README.md) · [Feasibility check](feasibility.md) · [Coverage](feasibility/coverage.md) · [Task coordination](../tasks/_coordination.md) |

Each section records what was run, the result, and what it hands on. Detailed notes live in the file a section links to.

## T01.04 — THEMIS TI, colour HiRISE COG and CRISM coverage of the AOI

| | |
| --- | --- |
| **Owner** | Obidit Islam (R1 Data & GIS), run by Claude Code on the data lead's instruction |
| **Date** | 2026-11-06 |
| **Status** | Done: each of the three products has a result. Full note: [coverage.md](feasibility/coverage.md) |
| **Inputs** | [aoi.md](feasibility/aoi.md): working projection and `extent_m` `[-3000, -3000, 3000, 3000]`, byte for byte; GDAL 3.13.3 from the `marswalk-pipeline` environment |

| Product | Result | Evidence |
| --- | --- | --- |
| Colour HiRISE LRGB COG, `MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif`, 0.25 m/px | **Covered**, 100 % valid | `gdalinfo -stats` on the AOI window: `STATISTICS_VALID_PERCENT=100` on all bands including the alpha mask |
| THEMIS quantitative TI, tile id `THEMIS_TI_Mosaic_Quant_30S120E_100mpp`, 100 m/px | **Covered**, 100 % valid, no gaps in the AOI window | `gdalinfo -stats`: `STATISTICS_VALID_PERCENT=100`, 61 × 61 px, values 255.661 to 646.241 |
| CRISM MTRDR, volume MROCR_4001, 7 observations | **Covered, patchwork**: best single observation `FRT0000B6F1` 97.12 % valid; worst 8.996 % | Footprint index (62,418 records, 35 box matches, 7 observations), then `gdalinfo -stats` on each summary-parameter window |

- URLs, versions (`Last-Modified`, `ETag`), CRS, resolution, observation ids and every command with its output are in [coverage.md](feasibility/coverage.md).
- Window reads only; no product was downloaded in full. Extracts are local, git-ignored scratch (path in coverage.md), not in `pipeline/work/`, and nothing was committed.
- Every coordinate passed to GDAL was in the Mars working projection; no EPSG:4326 or EPSG:3857 argument was used.
- `TODO(verify)`: TI cube unit string; meaning of 136,454 all-zero RGB pixels in the HiRISE window; meaning of the CRISM corner columns against the min/max columns. `TODO(decision)`: whether CRISM (FR-18) stays, and which observation (T01.05, T18.01).
- Disagreements with the specs: the grayscale orthophoto file is 50,404,480,837 bytes, not 23 GB; the CRISM data and index are on the PDS Geosciences Node, not under the `pds.nasa.gov` release folder named in 02 Sources.
- Hands on to: T01.05; T03.07 and T03.19 (product URLs, tile id); T03.26 and T03.27 (fallback triggers, none triggered for L1 or L4); T18.01 (CRISM trigger).
- Not run: `make lint` and `make docs-check`, because `node_modules` is absent in this worktree. `python3 scripts/check_links.py` was run on its own (result in the subtask report).

## T03.20 — DEM hillshade vs ortho tool measurement awaiting GIS confirmation

| | |
| --- | --- |
| **Owner** | Obidit Islam (R1 Data & GIS); tools and draft records prepared by Codex on the approved plan |
| **Date** | 2026-11-08 |
| **Status** | **Provisional, tool-measured, data lead to confirm in a GIS.** T03.20's human measurement and T01.07's second-person check remain `TODO(verify)` |
| **Serves** | T03.18, T03.20, T01.07; FR-01, FR-07, FR-10, FR-17, U-10 |
| **Contract** | [C5 inputs](../../pipeline/sites/README.md) · [alignment acceptance](../specs/02_Technical_Requirements_Document.md#f1-test-plan) · [DEM quality](feasibility/dem-quality.md) · `hab-site-check.md` (not present on this branch) |
| **Provenance** | Offsets, areas and slope statistics: `derived`; sources `usgs-gale-dem-1m-v3`, `usgs-gale-ortho-25cm-v3`. Kept LOW_RES_DEM interpretation: `interpreted`, source `dem-quality.md` |

### Inputs and reproducible method

All reads were local. Input root: `/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/pipeline/work/`; all raster/vector/PNG intermediates are under its `t03/` directory. Downloaded inputs were opened read-only with GDAL PAM disabled.

- Hillshade: `dem/aoi_hillshade.tif`, made from `dem/aoi_1m.tif`, azimuth 315°, altitude 45° as recorded in [T01.03](feasibility/dem-quality.md#commands).
- Ortho: `ortho/hirise_lrgb_aoi.tif`; mean of its three colour bands for correlation; RGB retained in review PNGs. Credit: NASA/JPL-Caltech/University of Arizona; USGS Astrogeology, Calef & Parker (2016).
- Slope source: `dem/MSL_Gale_DEM_Mosaic_1m_v3.tif`; credit: USGS Astrogeology, Parker & Calef (2016). The full local DEM supplied a 1 m halo for the Horn stencil.
- Projection: byte-identical `config.WORKING_PROJ`, `+proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs`; Mars sphere R = 3,396,190 m, east-positive, planetocentric latitude. No Earth CRS or Earth-radius helper was used.
- GDAL 3.13.3 bilinear warp put hillshade and ortho on the **same 1 m north-up 6000 × 6000 grid**, origin `(-3000, 3000)`, extent `[-3000, -3000, 3000, 3000]`. The earlier AOI extracts were in the source eqc grid, so their array indices were not directly compared. DEM no-data became NaN before slopes. A process-local `osr.SetPROJSearchPaths` selected the existing pipeline environment's `share/proj`; it resolved a failed inherited `/tmp/proj` lookup without changing environment files.

1. Divide the AOI into nine 2 km square sectors. In each, consider 16 fixed centres on a 400 m spacing. Reject any 512 m tile with more than 0.1% zero-valued hillshade or mean-RGB samples, or more than 10% overlap with the kept LOW_RES_DEM mask. Choose the largest product of hillshade and ortho high-pass standard deviations, independent of the correlation result. All nine sectors retain a tile; sector 11 has only one eligible centre. Texture scores and eligibility counts are in `t03/alignment_measurements.json`.
2. Subtract a centred 33 × 33 pixel box mean from each image to reduce broad illumination and albedo changes. Filtering uses a surrounding halo. Use a **512 × 512 m hillshade reference** and a **640 × 640 m ortho search** (±64 m on each axis).
3. Compute zero-mean normalized cross-correlation (ZNCC) by FFT convolution and integral-image window sums; normalize every search window separately. Select the maximum, then fit a three-sample quadratic independently along each axis. The interpolation produces fractional coordinates; it does not establish sub-metre accuracy.
4. Sign convention: **dx east-positive, dy north-positive**, displacement of matching ortho texture relative to hillshade. Equivalently, these are translations of the hillshade toward the ortho. A synthetic insertion at +7 m east, +4 m north recovered the shift within 0.03 m with NCC effectively 1. No alignment correction was applied to any source or site input.
5. Record the correlation peak, the gap to the strongest peak more than 10 m away, and peak-to-sidelobe z score. The latter is `(peak − sidelobe mean) / sidelobe SD`, excluding the 10 m radius; it is a diagnostic, not a statistical confidence interval or a pass threshold.

### Per-tile tool measurements

Centres and offsets are in working-projection metres. All rows are provisional `derived` readouts from the sources above; the data lead must confirm them in a GIS. Values shown are rounded; unrounded values are in the local JSON and CSV.

| Tile | Centre x, y (m) | dx (m) | dy (m) | Magnitude (m) | Peak NCC | Peak gap outside 10 m |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | -1400, 1400 | -1.07 | -0.55 | 1.20 | 0.214 | 0.119 |
| 12 | -600, 1800 | -0.88 | -0.39 | 0.96 | 0.282 | 0.122 |
| 13 | 2200, 1800 | -0.71 | +0.18 | 0.73 | 0.435 | 0.235 |
| 21 | -1800, 600 | -2.19 | +1.03 | 2.42 | 0.340 | 0.155 |
| 22 | -200, 200 | -1.19 | +0.14 | 1.19 | 0.194 | 0.139 |
| 23 | 1800, -200 | -0.32 | +0.05 | 0.32 | 0.168 | 0.106 |
| 31 | -2200, -1400 | -0.84 | -1.02 | 1.32 | 0.375 | 0.174 |
| 32 | 600, -1400 | -0.75 | -1.63 | 1.79 | 0.338 | 0.175 |
| 33 | 1800, -2600 | -1.58 | +0.93 | 1.83 | 0.391 | 0.161 |

### Result, spread and confidence limits

| Quantity | Median (m) | Range (m) | Interquartile range endpoints (m) | Median absolute deviation (m) |
| --- | --- | --- | --- | --- |
| dx | -0.88 | -2.19…-0.32 | -1.19…-0.75 | 0.19 |
| dy | 0.05 | -1.63…1.03 | -0.55…0.18 | 0.60 |
| Magnitude | 1.20 | 0.32…2.42 | 0.96…1.79 | 0.47 |

The C5 scalar is **1.20 m**, the median of the nine individual `hypot(dx, dy)` values. It is not the magnitude of the component-wise median vector, which is 0.88 m. `known_offsets/elevation.json` contains the scalar, method and evidence link only, per C5. Its method includes **"tool-measured, data lead to confirm in a GIS"**. The scalar's two decimal places describe rounding, not validated accuracy.

All nine primary peaks are inside the search window, with NCC 0.168–0.435, peak gap 0.106–0.235, and peak-to-sidelobe z 9.78–18.64. These support a local small-displacement match, but do not prove a global geometric translation. Brightness, albedo, shadows, DEM smoothing and mosaic joins can move the estimated peak.

Two diagnostic feature choices illustrate sensitivity: absolute high-pass texture gives median magnitude 2.85 m over its eight interior peaks; smoothed gradient magnitude gives 1.98 m over eight. Both have a weak search-boundary peak in tile 23, so those boundary values are excluded from these diagnostic medians. They are retained in `alignment_exploration.json`, not substituted into the primary measurement. Splitting the primary tiles into 36 separate 256 m quadrants gives dx -2.82…3.13 m and dy -3.96…1.50 m; all peaks are interior. That variability is another reason to require a human edge check. **No spec tolerance or alignment pass is claimed.**

### Artifacts for the GIS check

The contact sheet `t03/alignment_tiles_contact_sheet.png` was visually inspected. Rectangular tonal joins and greyscale areas are visible in the ortho, including tile 31; strong albedo and illumination differences are present across the tile pairs. These are image-content limitations, not measured displacements of terrain.

Carry forward the [T01.03 artifact list](feasibility/dem-quality.md#artifacts): the straight seam and horizontal stripes, facets beside patch 8, cross-hatch on steep slopes, and the line/banding in patch 9. Their full extents were not retraced here. In particular, artifact peaks may enter the slope candidates below; source attribution and scarp interpretation remain human checks.

### T03.18 draft inputs

- **LOW_RES_DEM:** the quality note explicitly names `dem/low_res_dem_candidates.geojson` as the eight kept patches (regions 1, 2, 3, 4, 8, 9, 11, 12). This file is already in local working-projection metres; `candidate_fill.geojson` is the larger, unreviewed source-grid set and was not used. OGR `MakeValid` repairs six features with point-touching rings; clipping to `site.json` leaves the area unchanged to less than 0.001 m². The eight output Polygon/MultiPolygon features retain region ids and carry `method`, `provenance: interpreted`, `source: dem-quality.md`, and `status: draft — data lead to confirm`.
- Tool-computed vector area: **5,159,266.085 m² / 36,000,000 m² = 14.331295% LOW_RES_DEM**, complement **85.668705%**. This agrees with `dem-quality.md`: **14.33%** low-detail / **85.67%** passing (quoted area 5,159,266.08518661 m²). Raster centre sampling for tile selection is not the vector-area calculation.
- **HARD_HAZARD:** [05 flag bit 1](../specs/05_Backend_and_Database_Schema.md#flag-bits) is a team-identified impassable feature. No keep/drop rule was supplied, so `hazards.geojson` is an **empty valid FeatureCollection**. This is not a declaration that no impassable features exist; it awaits Obidit's judgement.
- **Candidate screen only:** `horn_slope_deg` on the bilinear-warped 1 m DEM, then `aggregate_slope` with linear NaN-aware p90 in each 5 m block, following the pipeline code. Strictly greater than the **15° MissionScenario default** from 05, then **4-connected areas ≥ 400 m²** (16 cells; a compact 20 m square). This minimum removes small noisy clusters while retaining short coherent steep features; it is an agent-chosen review filter, not a new mission rule. It does not remove artifacts or establish that a component is a scarp.
- **706 candidates**, 16,617,775 m² total, from 694,728 above-limit cells and 12,205 components before size filtering; 30,017 small-component cells omitted. All 5 m slope cells are finite. Candidate polygons and per-component min/median/p90/max slope-p90 statistics are in `t03/hazard_candidates.geojson`, with `method: slope threshold candidate`, `provenance: derived`, and `status: candidate — data lead to keep or drop`. The ranked CSV is `t03/hazard_candidates.csv`. These broad steep areas are not all scarps and do not set HARD_HAZARD. The normal slope hard-limit rule remains separate from bit 1.

### Local review artifacts and rerun

Work directory: `/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/pipeline/work/t03/` (git-ignored, no binary is added to this worktree).

- `hillshade_working_1m.tif`, `ortho_working_1m.tif`: same-grid GIS overlay inputs.
- `dem_working_1m_halo.tif`, `slope_p90_5m.tif`, `low_res_selection_1m.tif`: slope/selection intermediates.
- `alignment_measurements.csv`, `alignment_measurements.json`, `alignment_summary.json`: full-precision primary measurements, quadrant checks and statistics.
- `alignment_exploration.json`, `alignment_tiles_contact_sheet.png`, `alignment_tile_<id>_hillshade.png`, `alignment_tile_<id>_ortho.png`: feature sensitivity and tile review.
- `low_res_summary.json`, `hazard_summary.json`, `hazard_candidates.geojson`, `hazard_candidates.csv`: mask evidence and provisional candidates.
- Four labelled site crops and `hab_site_review_contact_sheet.png`: paths and unsigned checklist in `hab-site-check.md` (not present on this branch). Each crop spans ±600 m at 1 m/px, north up, with a site cross and 50 m pad guide. The contact sheet was visually checked for legible crosses and matching terrain; this does not substitute for T01.07's second person.

Reproduction scripts are local at `/tmp/claude-1000/t0318_prepare.py`, `t0320_alignment.py`, `t03_review_artifacts.py`, and `t03_render_figures.py`. Run the first three with `/home/obidit/miniconda3/envs/marswalk-pipeline/bin/python`; the last uses the existing `python3` Pillow installation only to annotate raster figures. The script `t03_write_records.py` records these outputs and refuses to duplicate this section.

### Decisions and human checks still required

- [ ] Obidit confirms the repaired LOW_RES_DEM overlay and retained eight-patch interpretation.
- [ ] Obidit keeps/drops slope candidates or supplies team-drawn impassable polygons; decide whether the empty hazards input is acceptable for T03.19.
- [ ] Obidit checks common edges in a GIS, including tile 23 and mosaic/artifact boundaries, and confirms or replaces the provisional 1.20 m scalar. T03.20's human acceptance remains open.
- [ ] A second person completes and signs T01.07's check sheet (not present on this branch).
- [ ] The orchestrating session records this AI assistance in `docs/AI_USE.md` before any eventual commit; that file is outside this worktree task's permitted write set. Codex wrote local analysis scripts, exported the lead's kept polygons, measured correlations/slopes/areas with tools, and drafted this note and check sheet. It made no final hazard or hab-site decision.

T03.19 was read for handoff only; no bundle, lock file, status row, README progress block, commit or push was changed.

### Validation completed by tools

- `/home/obidit/miniconda3/envs/marswalk-pipeline/bin/python -m json.tool` passed for the two C5 GeoJSON files, the C5 offset JSON, and the local hazard-candidate GeoJSON.
- `/tmp/claude-1000/t03_validate.py` passed: every Polygon/MultiPolygon is valid, finite and inside `extent_m` (stronger than the requested ±3000 m allowance); the eight kept patches have zero mutual area overlap and match the quality-note area within 0.001 m². C5 mask rasterization succeeds: empty HARD_HAZARD, 206,320 LOW_RES_DEM cells, 664,711 candidate cells at 5 m. The vector area share remains the comparison with T01.03.
- Raster CRS equality against `config.WORKING_PROJ`, Mars radius, east/north axes, origin, north-up orientation and DEM NaN no-data checks passed. The original verification-log prefix is byte-identical and exactly one T03.20 section was appended. Detailed results: `t03/validation_summary.json`.
- `/home/obidit/miniconda3/envs/marswalk-pipeline/bin/python -m pytest -q pipeline`: **73 passed, 5 skipped, 48 warnings**, matching the pre-change baseline. The warnings report unavailable `jsonschema`; schema validation is skipped by the existing tests. No new test failure occurred.
- `/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/node_modules/.bin/markdownlint-cli2 docs/ops/verification-log.md docs/ops/feasibility/hab-site-check.md`: **0 issues**.
- `python3 scripts/check_links.py docs`: **2705 relative links checked, 0 broken**.
- `git diff --check`: passed. Only the five authorized deliverables are changed/added by this task; pre-existing `.serena/` and `node_modules` entries were left in place. No commit or push was made. The tool checks do not close the human-required items above.
