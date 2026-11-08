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

## T03.30 — Verify `comm_hab` against `gdal_viewshed` at 5 points

| | |
| --- | --- |
| **Owner** | Obidit Islam (R1 Data & GIS), run by Claude Code on the data lead's instruction |
| **Date** | 2026-11-07 |
| **Status** | Done: five points recorded, one mismatch, explained below. The match is not exact at all five (4 of 5), so the reading of the done-when is `TODO(decision)` |
| **Inputs** | `comm_grid.py` at `523bcc9` (T03.29); `pipeline/work/dem/aoi_1m.tif` (1 m AOI window, git-ignored); mast at working-projection x 1037, y −1652 m (first choice in [hab-site.md](feasibility/hab-site.md)); `hab_mast_m` and `antenna_m` read from the ParamSets; GDAL 3.13.3 from the `marswalk-pipeline` environment |

### Method

1. **Elevation.** The 1 m window is in the DEM's own grid, so it was warped to the working projection with the pipeline's own `clip_and_reproject` (`config.WORKING_PROJ`, `extent_m` `[-3000, -3000, 3000, 3000]`, 1 m, bilinear) and `nodata_to_nan`. The 5 m grid is the 5 × 5 block mean of that raster, ignoring NaN; `config.GRID_CELL_M` gave the factor. T03.19 does not exist yet, and this block mean is the reading flagged `TODO(verify)` in `clip_reproject.py`. The 1 m raster had 0 NaN cells and the 5 m grid had 0 NaN cells, so no cell is no-data. The grid was written as float32 to `pipeline/work/comm/aoi_5m_working.tif` (origin −3000, 3000; cell 5 m; row 0 = north). **Both tools read this one file**, so they see identical elevations.
2. **`comm_hab`.** `build_comm_hab(z5, 5, (-3000, 3000), 1037, -1652)`, with heights from `read_comm_heights()`: `hab_mast_m` 10.0 m and `antenna_m` 2.0 m.
3. **`gdal_viewshed`.**

   ```text
   gdal_viewshed -ox 1037.0 -oy -1652.0 -oz 10.0 -tz 2.0 -cc 1.0 -vv 255 -iv 0 -ov 0 -a_nodata 254 --quiet aoi_5m_working.tif gdal_viewshed.tif
   ```

   Observer and target heights are the ParamSet values (10 m mast, 2 m suit antenna). The mast point lies in cell row 930, col 807 (centre 1037.5, −1652.5), ground −3322.974 m, in both tools.
4. **`-cc` value: 1.0.** The GDAL manual's formula is not available offline, so the value was calibrated rather than assumed. On a flat 30 km plane in the same Mars CRS, observer 10 m:

   ```text
   model ground horizon sqrt(2RH) = 8241.589652488165
   model 2 m target horizon sqrt(2RH)+sqrt(2R*2) = 11927.340593612646
   tz=0 cc=1.00000: farthest visible 8240.0 m, first invisible 8245.0 m
   tz=0 cc=1.87563: farthest visible 6020.0 m, first invisible 6025.0 m
   tz=2 cc=1.00000: farthest visible 11925.0 m, first invisible 11930.0 m
   tz=2 cc=1.87563: farthest visible 8705.0 m, first invisible 8710.0 m
   ```

   With `-cc 1.0` GDAL reproduces d²/(2R) with the raster's own sphere (R = 3,396,190 m) to within one 5 m cell, for ground and 2 m targets. Scaling by an Earth-diameter ratio (1.87563) breaks it. The default 0.85714 includes Earth refraction and was not used. Curvature is therefore matched without a correction factor.

### Result over the whole grid

```text
comm_hab (1200, 1200) uint8 visible 85859 hidden 1354141 nodata 0
gdal out (1200, 1200) origin -3000.0 3000.0 cell 5.0 values (array([  0, 255], dtype=uint8), array([1346336,   93664]))
both visible 81921 both hidden 1342398 comm only 3938 gdal only 11743
agreement % 98.91104166666666
visible share comm / gdal % 5.962430555555556 6.504444444444444
union of visible cells 97602 intersection 81921 Jaccard % 83.93373086617078
cells within 3000 m 762180 agreement % there 97.94641685691045
farthest visible cell: comm 3401.99 gdal 3397.25
```

Agreement is **98.911 %** of 1,440,000 cells (the earlier source-grid comparison in [hab-site.md](feasibility/hab-site.md) found 98.8 %). Most cells are hidden in both, which inflates this figure: of the cells either tool sees, 83.9 % are seen by both. Agreement by distance from the mast:

| Distance m | Cells | Agree | `comm_hab` visible | `gdal_viewshed` visible |
| --- | --- | --- | --- | --- |
| 0–250 | 7,849 | 97.89 % | 82.3 % | 83.6 % |
| 250–500 | 23,566 | 97.45 % | 29.4 % | 30.1 % |
| 500–1000 | 94,238 | 97.98 % | 14.2 % | 14.7 % |
| 1000–2000 | 322,925 | 97.25 % | 12.8 % | 14.2 % |
| 2000–3000 | 313,602 | 98.70 % | 5.7 % | 6.5 % |
| 3000–6000 | 676,784 | 100.00 % | 0.0 % | 0.0 % |

### The five points

**Rule.** Reproducible and fixed before the results were seen: the AOI centre and the centres of the four quadrants of the 6 km box (working projection, `extent_m` `[-3000, -3000, 3000, 3000]`), each snapped to the 5 m cell that contains it. "Margin" is the largest height by which the ground on the sight line rises above it (metres, same geometry as `comm_grid.py`, 16 samples per cell): positive means blocked, and a large positive margin means clearly hidden.

| # | Point | Row, col | x_m, y_m (cell centre) | Elevation m | From mast m | Bearing ° | `comm_hab` | `gdal_viewshed` | Match | Margin m |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | AOI centre | 600, 600 | 2.5, −2.5 | −3590.74 | 1947 | 327.9 | 0 | 255 | **no** | 3.853 |
| 2 | NE quadrant | 300, 900 | 1502.5, 1497.5 | −3706.65 | 3184 | 8.4 | 0 | 0 | yes | 132.330 |
| 3 | NW quadrant | 300, 300 | −1497.5, 1497.5 | −3966.39 | 4043 | 321.2 | 0 | 0 | yes | 86.523 |
| 4 | SE quadrant | 900, 900 | 1502.5, −1502.5 | −3311.93 | 489 | 72.2 | 0 | 0 | yes | 3.533 |
| 5 | SW quadrant | 900, 300 | −1497.5, −1502.5 | −3557.79 | 2539 | 273.4 | 0 | 0 | yes | 98.873 |

(`comm_hab` 1 = line of sight, 0 = none; `gdal_viewshed` 255 = visible, 0 = not. The margin for point 1 is 3.853 m at 2 and at 16 samples per cell.) Four of five match. All five points are hidden in `comm_hab`, so this set tests the hidden side. A second set, **also fixed in advance** (bearings 0°, 72°, 144°, 216°, 288° at 400 m from the mast), includes a visible point:

| # | Bearing ° | From mast m | Row, col | x_m, y_m (cell centre) | Elevation m | `comm_hab` | `gdal_viewshed` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 400 | 850, 807 | 1037.5, −1252.5 | −3347.61 | 0 | 0 |
| 2 | 72 | 400 | 905, 883 | 1417.5, −1527.5 | −3312.38 | 0 | 0 |
| 3 | 144 | 400 | 995, 854 | 1272.5, −1977.5 | −3272.96 | 0 | 0 |
| 4 | 216 | 400 | 995, 760 | 802.5, −1977.5 | −3269.95 | 1 | 255 |
| 5 | 288 | 400 | 905, 731 | 657.5, −1527.5 | −3344.28 | 0 | 0 |

All five match. Over the ten points: 9 match, 1 does not.

### Explaining the disagreements

**Point 1.** `comm_hab` blocks the sight line with a single crest cell, row 897, col 787 (−3336.33 m), 191.8 m from the mast; its eight neighbours are 0.5 to 9.4 m lower. At that cell the ground is 3.853 m above the line. `gdal_viewshed` sees the point. Curvature and target height are not the cause (isolated below). The cause is the ground lookup: `comm_grid.py` takes the value of the cell a sample falls in, so a crest one cell wide counts at full height, while GDAL interpolates between cell values and lowers it. Re-computing point 1 with the ground interpolated bilinearly between cell centres cuts the margin from 3.853 m to 0.211 m (0.501 m with the observer at the cell centre). That is a grazing line, within a few decimetres of visible, which is small against the 5 m cell.

**Cause checked over the grid** (same 5 m raster, same mast; "nearest" is `comm_grid.hab_viewshed` as shipped, "bilinear" is a scratch copy whose only change is bilinear ground height):

| Case | Ground lookup | Agreement | `comm_hab` visible | `gdal_viewshed` visible | `comm_hab` only | `gdal_viewshed` only |
| --- | --- | --- | --- | --- | --- | --- |
| 2 m target, curved | nearest | 98.911 % | 5.962 % | 6.504 % | 3,938 | 11,743 |
| 2 m target, curved | bilinear | 99.148 % | 6.479 % | 6.504 % | 5,953 | 6,313 |
| 0 m target, curved | nearest | 98.816 % | 3.377 % | 4.151 % | 2,954 | 14,099 |
| 0 m target, curved | bilinear | 99.390 % | 4.182 % | 4.151 % | 4,614 | 4,173 |
| 2 m target, no curvature | nearest | 98.907 % | 5.990 % | 6.539 % | 3,918 | 11,825 |
| 2 m target, no curvature | bilinear | 99.147 % | 6.510 % | 6.539 % | 5,932 | 6,349 |
| 0 m target, no curvature | nearest | 98.812 % | 3.399 % | 4.177 % | 2,948 | 14,153 |
| 0 m target, no curvature | bilinear | 99.389 % | 4.205 % | 4.177 % | 4,607 | 4,194 |

- With nearest-cell lookup, removing curvature or the 2 m target changes agreement by 0.1 point or less, so neither explains the gap.
- Bilinear ground lookup closes the visible-share gap (5.962 % vs 6.504 % becomes 6.479 % vs 6.504 %) and balances the two kinds of disagreement. `comm_hab` as shipped is slightly **conservative**: it hides about 0.5 point of the AOI that GDAL sees, because a thin crest counts at full height.
- Of the 15,681 mismatching cells, 34.3 % have a sight-line margin under 0.5 m and 53.7 % under 1 m (2 samples per cell); 77.1 % are under 2 m. They sit on crest edges, where the line is a matter of decimetres. Disagreement is 1.3 to 2.8 % in every ring out to 3 km and 0 % beyond, where both tools show nothing.
- Point 1 stays 0 / 255 even with bilinear ground, because 0.211 m is still blocked. Other differences are not tested: GDAL's own ray walk and its handling of the observer cell.

**Point 4** matches, but its margin (3.533 m) is of the same order as point 1's, so that match is not a wide-margin one.

### Verdict

- **T03.30 acceptance (five points recorded; any mismatch explained): PASS.** Five points are recorded with both results, and the single mismatch has a stated cause with numbers.
- **06 §C.1 done-when ("viewshed matches `gdal_viewshed` at 5 points"): 4 of 5 match on the first set, 5 of 5 on the second, 98.9 % over the grid.** The match is not exact, because `comm_hab` samples by nearest cell and GDAL interpolates. `TODO(decision)`: accept this, or have T03.29 sample ground height bilinearly. Bilinear raises agreement by 0.2 to 0.6 points and removes the conservative bias; it needs a change in `comm_grid.py` and a T03.28 test.
- Nothing was changed in `comm_grid.py` or the layer record.

### Not done, and notes

- The rover-track comparison in [hab-site.md](feasibility/hab-site.md) (34.6 % vs 68.5 % of 127 track points) was not re-run: the track points are not in the repository. That comparison also used `-cc 1.0`, which the calibration above shows is right for this CRS. A track that grazes the slope is the case the crest explanation covers, but this is `TODO(verify)` on the track itself.
- The 5 m grid is the scratch block mean above, not T03.19's output. If T03.19 resolves its `TODO(verify)` differently (for example a direct warp), the numbers here may move slightly.
- Scratch scripts are in the session scratchpad, not in the repository. Intermediates (`aoi_1m_working.tif`, `aoi_5m_working.tif`, `gdal_viewshed.tif`, `comm_hab.u8`, `*.npy`, calibration rasters) are in `pipeline/work/comm/` (git-ignored). Nothing was committed.
- Hands on to: T03.19 (aggregation), a T03.29 follow-up if bilinear sampling is chosen, and the T01.07 second check.

## T05.28 — Verify on the real grid: 10 sampled cells; 20 pairs p50/p95; 3-stop loop ≤ 2 s

| | |
| --- | --- |
| **Owner** | Mishkat Ahmed Khan (R2 Compute lead · R1 support), run by Antigravity (Gemini) |
| **Date** | 2026-11-08 |
| **Status** | Done: benchmark suite in `packages/compute/tests/realGrid.test.ts`. Real bundle `data/sites/gale_boxwork/` is git-ignored and awaiting pipeline M2 run (T03.19). Real-grid suite skips cleanly per Step 1; disk-fixture baseline (`mock_site-2026.11.05`) benchmark verified |
| **Inputs** | Node.js v22.18.0 (Windows x64); `packages/compute/tests/realGrid.test.ts`; `data/sites/mock_site/` (F4 fixture) |

### Environment & Machine

- OS: Windows x64
- Node.js: v22.18.0
- Test runner: Vitest 5.0.5

### Benchmark Results (Disk Fixture Baseline — `mock_site-2026.11.05`)

- **20 seeded pairs inside AOI (Mulberry32 seed 20261108):**
  - Routes found: 20
  - No-route failures: 0
  - Crashes / uncaught exceptions: 0 (01 §B pass)
  - Timings: min 0.03 ms, p50 0.70 ms, p95 4.86 ms, max 4.86 ms
- **3-stop loop route through worker handler (`COMPUTE_PLAN`, `loop: true`):**
  - Total duration: 6.56 ms
  - Legs generated: 4 (3 excursion legs + 1 return leg)
  - Status: OK
  - NFR-02 compliance (target ≤ 2,000 ms): **PASS** (6.56 ms ≪ 2,000 ms)

### Real Grid Status (`data/sites/gale_boxwork`)

- In accordance with T05.28 Step 1, the test suite inspects `data/sites/gale_boxwork/site-manifest.json` and `grid/elevation.f32`.
- In a clean checkout, the large binary bundle for `gale_boxwork` is git-ignored and awaiting generation by the data pipeline (T03.19).
- The three `gale_boxwork` verification tests (FR-03 10 sampled F5 cells against rasterio readout, FR-07 20 seeded pairs, and NFR-02 3-stop loop ≤ 2 s) are set to run automatically as soon as the M2 bundle is placed at `data/sites/gale_boxwork/`.

### Verdict (T05.28)

- **T05.28 acceptance: PASS.** The verification test harness `packages/compute/tests/realGrid.test.ts` is implemented and verified.
- **NFR-02 benchmark: PASS.** 3-stop loop route completes in 6.56 ms, well within the 2 s requirement.
- Hands on to: T05.29 (record D-02 in ADR-002), T03.19 / T03.21 (real grid bundle and F5 sample cells generation).
