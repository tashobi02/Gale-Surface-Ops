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

## T03.20 — DEM hillshade vs ortho offset confirmed by three tool methods

| | |
| --- | --- |
| **Owner** | Obidit Islam (R1 Data & GIS); confirmation analysis and decision by the orchestrating session under his delegation |
| **Date** | 2026-11-08 |
| **Status** | Done under the data lead's delegated confirmation decision: **tool-confirmed by three independent methods (decided by the orchestrating session under the data lead's delegation, 2026-11-08); not GIS-checked** |
| **Serves** | T03.18, T03.20, T01.07; FR-01, FR-02, FR-07, FR-10, FR-17, U-10 |
| **Contract** | [C5 inputs](../../pipeline/sites/README.md) · [alignment acceptance](../specs/02_Technical_Requirements_Document.md#f1-test-plan) · [DEM quality](feasibility/dem-quality.md) |
| **Provenance** | Offsets, areas and slope statistics: `derived`; sources `usgs-gale-dem-1m-v3`, `usgs-gale-ortho-25cm-v3`. Analysis thresholds: `assumed`, source `t03/confirmation_config.json`. Kept LOW_RES_DEM interpretation: `interpreted`, source `dem-quality.md` |

The data lead delegated the confirmation decision: **"choose the best option on your own"** (2026-11-08 instruction to the orchestrating session). The approved plan replaces this subtask's pending GIS confirmation with the three-method tool decision below; it does not assert that a GIS overlay was checked, alter the specs, or close T01.07's separate second-person check. No science number was supplied by an LLM: measurements and summary statistics below come from the local scripts and JSON outputs named here.

### Consumers and shift semantics

Search: `rg -n 'known_offsets|offset_m|elevation\.json' pipeline/ apps/ packages/ docs/specs/ pipeline/sites/README.md`, with the manifest schema inspected separately.

| Consumer / reference | What it does | Applies a shift? |
| --- | --- | --- |
| [manifest.py](../../pipeline/src/marswalk_pipeline/manifest.py), `write_manifest` | Reads `known_offsets/*.json`, copies each `offset_m` by filename stem into `known_offsets_m`; `elevation.json` becomes `known_offsets_m.elevation` | No |
| [test_manifest.py](../../pipeline/tests/test_manifest.py) | Builds C5 fixture records from a fixture manifest and checks the writer; method and evidence are record-keeping text | No |
| [validate_manifest.py](../../pipeline/src/marswalk_pipeline/validate_manifest.py) | Checks that `known_offsets_m` is an object | No |
| [schema.ts](../../packages/protocol/src/schema.ts), [manifest JSON Schema](../../schemas/site-manifest.schema.json) | Type/schema declarations for the scalar map | No |
| [05 Site](../specs/05_Backend_and_Database_Schema.md#site), [02 test plan](../specs/02_Technical_Requirements_Document.md#f1-test-plan), [C5](../../pipeline/sites/README.md) | Specify measured layer-to-ortho offsets and the input record | No executable use |
| `apps/`, remaining `packages/` and `pipeline/` search results | No further use of the offset map or this record found | No |

The scalar is descriptive metadata. No consumer applies it as a translation, warp, routing correction or vector shift. The measurements below retain dx east-positive and dy north-positive, translating hillshade texture toward matching ortho texture.

### Original ZNCC inputs and method

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
5. Record the correlation peak, the gap to the strongest peak more than 10 m away, and peak-to-sidelobe z score. The latter is `(peak − sidelobe mean) / sidelobe SD`, excluding the 10 m radius; it was originally diagnostic; the confirmation run now uses the predeclared z threshold below. It is not a statistical confidence interval.

### Original ZNCC per-tile measurements

Source: `t03/alignment_measurements.json`. All nine original peaks pass the confirmation rule (interior, finite, peak-to-sidelobe z ≥ 5). Values are rounded for display; pooling uses the stored full-precision values. These are `derived` measurements from the source ids above.

| Tile | Centre x, y (m) | dx (m) | dy (m) | Magnitude (m) | Peak NCC | PSR z | Pooled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | -1400, 1400 | -1.07 | -0.55 | 1.20 | 0.214 | 15.38 | yes |
| 12 | -600, 1800 | -0.88 | -0.39 | 0.96 | 0.282 | 12.68 | yes |
| 13 | 2200, 1800 | -0.71 | 0.18 | 0.73 | 0.435 | 14.09 | yes |
| 21 | -1800, 600 | -2.19 | 1.03 | 2.42 | 0.340 | 9.91 | yes |
| 22 | -200, 200 | -1.19 | 0.14 | 1.19 | 0.194 | 18.64 | yes |
| 23 | 1800, -200 | -0.32 | 0.05 | 0.32 | 0.168 | 9.78 | yes |
| 31 | -2200, -1400 | -0.84 | -1.02 | 1.32 | 0.375 | 12.28 | yes |
| 32 | 600, -1400 | -0.75 | -1.63 | 1.79 | 0.338 | 13.37 | yes |
| 33 | 1800, -2600 | -1.58 | 0.93 | 1.83 | 0.391 | 11.09 | yes |

### Confirmation configuration fixed before reading new results

`t03/confirmation_config.json` was written before the new measurements; SHA-256: `ee7f9c175c8189884c5cbf14137ee7165f5ea4534e65e70b84a407b88542264b`. Thresholds, smoothing, search limits and sampling choices are **assumed analysis settings**, not observed science values or mission tolerances. They were not changed after seeing the results.

- Same local rasters and working-projection grid as the ZNCC run. `verify_confirmation_inputs.py` freshly bilinear-warps the original `dem/aoi_hillshade.tif` and `ortho/hirise_lrgb_aoi.tif` with GDAL, compares every sample to the cached grid, and checks Mars radius and geotransform. `confirmation_input_check.json` reports zero mismatches over the full cached rasters; no source raster was modified. The DEM input remains `dem/aoi_1m.tif`, from which the recorded hillshade was made.
- Reuse the nine 512 m tile centres. Add nine centres offset by 256 m in both row and column, southeast where a complete tile plus halo fits; reverse the affected axis near the AOI edge. Suffix `o` denotes an offset tile. Centres below are in projected metres, not longitude/latitude.
- Reject a tile if zero/nonfinite hillshade or mean-RGB samples exceed 0.1% or LOW_RES_DEM overlap exceeds 10%. This repeats the original input-quality rule; offset centres are fixed, not selected by the match result. Tile 23o has 10.3336% LOW_RES_DEM and is rejected by both new methods.
- Reject nonfinite results and search-boundary optima. For phase correlation require **PSR z ≥ 5 at both resolutions** and inter-scale displacement-vector difference ≤ 5 m, read from `config.GRID_CELL_M` ([05 RoutingGrid](../specs/05_Backend_and_Database_Schema.md#routinggrid)). This consistency filter is not an alignment tolerance.
- For chamfer require **cost separation ≥ 5%**, defined as `(median search cost − minimum search cost) / median search cost`. This is a contrast diagnostic, not a confidence probability.
- The original ZNCC method contributes only its primary high-pass estimates passing the finite/interior and z ≥ 5 rule. Its absolute-high-pass and gradient-NCC variants remain sensitivity diagnostics, not additional independent methods or pooled observations.

### Independent method: multi-scale phase correlation

`confirm_alignment.py` uses NumPy FFTs, without skimage. At 1 m it uses the same analysis grid; the 2 m grid is an aligned area mean of its 2 × 2 cells. For each scale and each image it applies two separable binomial `[1,2,1]/4` smoothing passes, then Sobel gradient magnitude. It removes the mean, applies a Hann window, computes normalized `FFT(ortho) * conj(FFT(hillshade))`, and searches ±64 m. PSR z excludes a 10 m radius around the integer peak. A local inverse DFT with 20× sampling refines the peak (sampling step `resolution / 20`); this interpolation does not establish sub-metre accuracy.

The next table records **every scale result**, including rejected tiles. `Scale quality` checks its own z, finite and boundary criteria; `Pooled tile` additionally requires both scales, their agreement and input quality. Rejected estimates remain visible and never enter the pool.

| Tile | Grid (m) | dx (m) | dy (m) | Magnitude (m) | PSR z | Scale quality | Pooled tile |
| 11 | 1 | -0.90 | -0.90 | 1.27 | 5.15 | pass | yes |
| 11 | 2 | 1.80 | -4.30 | 4.66 | 5.18 | pass | yes |
| 11o | 1 | -2.55 | -2.00 | 3.24 | 5.43 | pass | yes |
| 11o | 2 | -1.00 | -0.00 | 1.00 | 7.07 | pass | yes |
| 12 | 1 | -1.20 | -1.10 | 1.63 | 4.97 | reject | no |
| 12 | 2 | -1.40 | -1.60 | 2.13 | 6.94 | pass | no |
| 12o | 1 | -3.55 | -0.30 | 3.56 | 4.67 | reject | no |
| 12o | 2 | 1.90 | 2.20 | 2.91 | 5.72 | pass | no |
| 13 | 1 | -1.05 | 1.75 | 2.04 | 9.00 | pass | yes |
| 13 | 2 | -0.30 | 0.50 | 0.58 | 14.46 | pass | yes |
| 13o | 1 | -0.35 | 1.20 | 1.25 | 8.28 | pass | yes |
| 13o | 2 | -0.60 | 0.40 | 0.72 | 15.24 | pass | yes |
| 21 | 1 | -2.00 | 0.85 | 2.17 | 7.51 | pass | yes |
| 21 | 2 | -2.90 | 1.00 | 3.07 | 10.46 | pass | yes |
| 21o | 1 | -0.75 | -0.35 | 0.83 | 4.59 | reject | no |
| 21o | 2 | 1.90 | 4.40 | 4.79 | 5.91 | pass | no |
| 22 | 1 | -0.65 | 0.55 | 0.85 | 4.48 | reject | no |
| 22 | 2 | -0.60 | -0.40 | 0.72 | 5.88 | pass | no |
| 22o | 1 | -2.90 | -0.70 | 2.98 | 6.68 | pass | yes |
| 22o | 2 | -2.30 | 4.00 | 4.61 | 7.06 | pass | yes |
| 23 | 1 | -55.05 | -10.95 | 56.13 | 5.14 | pass | no |
| 23 | 2 | -0.20 | 2.40 | 2.41 | 6.38 | pass | no |
| 23o | 1 | -3.25 | -0.10 | 3.25 | 8.92 | pass | no |
| 23o | 2 | -2.50 | -0.60 | 2.57 | 12.35 | pass | no |
| 31 | 1 | -1.90 | 0.05 | 1.90 | 8.30 | pass | yes |
| 31 | 2 | -1.30 | -0.30 | 1.33 | 9.71 | pass | yes |
| 31o | 1 | -0.70 | -0.35 | 0.78 | 6.08 | pass | yes |
| 31o | 2 | -1.30 | -0.60 | 1.43 | 11.02 | pass | yes |
| 32 | 1 | -1.65 | -1.65 | 2.33 | 5.43 | pass | yes |
| 32 | 2 | -1.00 | -1.10 | 1.49 | 7.52 | pass | yes |
| 32o | 1 | -0.40 | -2.20 | 2.24 | 7.03 | pass | yes |
| 32o | 2 | -0.90 | -1.90 | 2.10 | 8.99 | pass | yes |
| 33 | 1 | -1.55 | 1.60 | 2.23 | 6.88 | pass | yes |
| 33 | 2 | -1.50 | 1.40 | 2.05 | 14.11 | pass | yes |
| 33o | 1 | -2.45 | 1.55 | 2.90 | 9.52 | pass | yes |
| 33o | 2 | -2.60 | 1.30 | 2.91 | 20.51 | pass | yes |

Each physical tile contributes one phase estimate: the component-wise mean of its two scale vectors, followed by `hypot(dx, dy)`. There is no double vote for the two scales. The following combined table supplies the centres for both new methods and the exact acceptance reasons.

| Tile | Centre x, y (m) | dx (m) | dy (m) | Magnitude (m) | Min PSR z | Scale difference (m) | Decision |
| 11 | -1400, 1400 | 0.45 | -2.60 | 2.64 | 5.15 | 4.34 | accept |
| 11o | -1144, 1144 | -1.77 | -1.00 | 2.04 | 5.43 | 2.53 | accept |
| 12 | -600, 1800 | -1.30 | -1.35 | 1.87 | 4.97 | 0.54 | reject: scale quality |
| 12o | -344, 1544 | -0.82 | 0.95 | 1.26 | 4.67 | 6.00 | reject: scale quality, scale disagreement |
| 13 | 2200, 1800 | -0.68 | 1.12 | 1.31 | 9.00 | 1.46 | accept |
| 13o | 2456, 1544 | -0.47 | 0.80 | 0.93 | 8.28 | 0.84 | accept |
| 21 | -1800, 600 | -2.45 | 0.93 | 2.62 | 7.51 | 0.91 | accept |
| 21o | -1544, 344 | 0.57 | 2.03 | 2.11 | 4.59 | 5.44 | reject: scale quality, scale disagreement |
| 22 | -200, 200 | -0.62 | 0.08 | 0.63 | 4.48 | 0.95 | reject: scale quality |
| 22o | 56, -56 | -2.60 | 1.65 | 3.08 | 6.68 | 4.74 | accept |
| 23 | 1800, -200 | -27.62 | -4.27 | 27.95 | 5.14 | 56.45 | reject: scale disagreement |
| 23o | 2056, -456 | -2.88 | -0.35 | 2.90 | 8.92 | 0.90 | reject: LOW_RES_DEM |
| 31 | -2200, -1400 | -1.60 | -0.12 | 1.60 | 8.30 | 0.69 | accept |
| 31o | -1944, -1656 | -1.00 | -0.47 | 1.11 | 6.08 | 0.65 | accept |
| 32 | 600, -1400 | -1.32 | -1.38 | 1.91 | 5.43 | 0.85 | accept |
| 32o | 856, -1656 | -0.65 | -2.05 | 2.15 | 7.03 | 0.58 | accept |
| 33 | 1800, -2600 | -1.52 | 1.50 | 2.14 | 6.88 | 0.21 | accept |
| 33o | 2056, -2344 | -2.53 | 1.43 | 2.90 | 9.52 | 0.29 | accept |

### Independent method: Sobel-edge chamfer distance search

This method uses neither intensity NCC nor cross-power phase. It applies the same declared binomial smoothing, takes Sobel gradients, thins ridges by nonmaximum suppression in four gradient-direction bins, and retains magnitudes above the **90th percentile** separately in each image. GDAL `ComputeProximity` supplies Euclidean pixel-distance transforms; the 1 m pixel grid makes their distances metres.

For each integer shift in ±10 m, the symmetric cost is the mean of (hillshade core-edge distances to ortho edges after the shift) and (ortho core-edge distances to hillshade edges after the inverse shift). A fixed core and surrounding halo avoid changing the edge population with displacement. A three-sample separable quadratic refines an interior cost minimum. This is a chamfer search, with the same east/north sign convention as the other methods. `Separation` is the declared quality score; cost is the integer minimum before refinement.

| Tile | dx (m) | dy (m) | Magnitude (m) | Cost (m) | Separation | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | -1.81 | 0.07 | 1.81 | 4.61 | 6.91% | accept |
| 11o | -1.30 | -0.06 | 1.31 | 4.21 | 8.54% | accept |
| 12 | -2.60 | -0.79 | 2.72 | 3.94 | 12.85% | accept |
| 12o | -3.23 | -0.16 | 3.23 | 4.28 | 10.59% | accept |
| 13 | -2.28 | 0.01 | 2.28 | 8.58 | 4.49% | reject: separation |
| 13o | -0.20 | 0.78 | 0.81 | 4.90 | 11.42% | accept |
| 21 | -3.26 | 0.24 | 3.27 | 4.47 | 9.70% | accept |
| 21o | -1.86 | 0.97 | 2.09 | 4.89 | 7.78% | accept |
| 22 | -1.13 | 1.34 | 1.75 | 4.81 | 7.09% | accept |
| 22o | -0.78 | 1.64 | 1.82 | 3.99 | 6.36% | accept |
| 23 | -10.00 | -10.00 | 14.14 | 15.71 | 6.98% | reject: boundary |
| 23o | -7.00 | -10.00 | 12.21 | 13.42 | 4.23% | reject: LOW_RES_DEM, boundary, separation |
| 31 | -2.56 | -1.49 | 2.96 | 7.71 | 5.27% | accept |
| 31o | -1.94 | -0.07 | 1.94 | 5.34 | 6.98% | accept |
| 32 | -5.88 | -1.20 | 6.00 | 5.23 | 6.55% | accept |
| 32o | -1.63 | -2.30 | 2.82 | 6.98 | 5.33% | accept |
| 33 | -2.48 | 0.75 | 2.59 | 4.66 | 11.50% | accept |
| 33o | -3.33 | 1.65 | 3.72 | 3.53 | 19.25% | accept |

### Delegated decision, final scalar and uncertainty

**Decision rule, fixed by the approved plan:** `offset_m = median` of the accepted per-tile magnitudes pooled across the three methods; uncertainty is the **interquartile range of that pool**. Use unrounded measurements and NumPy `percentile(..., method="linear")`; report if the method medians differ by more than the routing grid cell. Each accepted physical tile/method contributes one magnitude. Pooling is not a median of method medians or the magnitude of component-wise median dx/dy.

| Method | Accepted / evaluated tiles | Median magnitude (m) | Accepted range (m) |
| --- | --- | --- | --- |
| ZNCC | 9 / 9 | 1.20 | 0.32–2.42 |
| phase | 12 / 18 | 2.09 | 0.93–3.08 |
| chamfer | 15 / 18 | 2.59 | 0.81–6.00 |

The accepted pool has **36 magnitudes**. Its median is **1.92 m** (unrounded `1.924648006664221`); Q25 is **1.31 m**, Q75 **2.66 m**, and **IQR = 1.35 m** (unrounded `1.348162202646859`). The largest difference between method medians is **1.39 m**, **below the 5 m routing cell**. No method-median disagreement beyond a routing cell is present.

The final C5 `offset_m` is **1.92** after rounding to two decimal places. C5 defines only `offset_m`, `method` and `evidence`; the IQR stays here rather than adding an uncontracted JSON key. The record's method ends with **"tool-confirmed by three independent methods (decided by the orchestrating session under the data lead's delegation, 2026-11-08); not GIS-checked"**. The previous **1.20 m** scalar is superseded by the approved pooling rule; its original ZNCC readouts remain above as evidence.

This IQR is descriptive spread, **not ± uncertainty, a confidence interval or validated positional accuracy**. The methods share source data; adjacent offset tiles overlap, and acceptance counts give the methods different weights in the approved unweighted pool. Tiles 11 and 22o pass phase agreement but show substantial scale sensitivity; tile 23 has incompatible phase shifts and boundary chamfer optima. The accepted edge estimate in tile 32 is 6.00 m. These retained limitations, albedo/shadow differences, DEM smoothing and mosaic joins prevent claiming a single global geometric correction or an alignment pass. **No spec tolerance is claimed.**

The earlier feature-sensitivity results remain diagnostics: absolute high-pass NCC median 2.85 m over eight interior peaks; gradient NCC 1.98 m over eight. Their tile 23 boundary peaks are excluded from those diagnostic medians. Original quadrant checks range dx −2.82…3.13 m and dy −3.96…1.50 m. None of these diagnostics enters the three-method pool.

### DTM and ortho artifacts

The existing `t03/alignment_tiles_contact_sheet.png` was visually inspected again. Rectangular tonal joins and greyscale patches are visible in the ortho, including tile 31, and tile 32 has a sharp tonal boundary; local texture and illumination differ between hillshade and ortho. The image's old "human confirmation pending" caption predates this delegated decision and is not the current status. No GIS edge check or terrain displacement measurement was inferred from that image inspection.

Carry forward the [T01.03 artifact list](feasibility/dem-quality.md#artifacts): the straight seam and horizontal stripes, facets beside patch 8, cross-hatch on steep slopes, and the line/banding in patch 9. Their full extents were not retraced here. Artifact peaks may enter slope candidates; source attribution and scarp interpretation remain human checks.

### T03.18 draft inputs

- **LOW_RES_DEM:** the quality note explicitly names `dem/low_res_dem_candidates.geojson` as the eight kept patches (regions 1, 2, 3, 4, 8, 9, 11, 12). This file is already in local working-projection metres; `candidate_fill.geojson` is the larger, unreviewed source-grid set and was not used. OGR `MakeValid` repairs six features with point-touching rings; clipping to `site.json` leaves the area unchanged to less than 0.001 m². The eight output Polygon/MultiPolygon features retain region ids and carry `method`, `provenance: interpreted`, `source: dem-quality.md`, and `status: draft — data lead to confirm`.
- Tool-computed vector area: **5,159,266.085 m² / 36,000,000 m² = 14.331295% LOW_RES_DEM**, complement **85.668705%**. This agrees with `dem-quality.md`: **14.33%** low-detail / **85.67%** passing (quoted area 5,159,266.08518661 m²). Raster centre sampling for tile selection is not the vector-area calculation.
- **HARD_HAZARD:** [05 flag bit 1](../specs/05_Backend_and_Database_Schema.md#flag-bits) is a team-identified impassable feature. No keep/drop rule was supplied, so `hazards.geojson` is an **empty valid FeatureCollection**. This is not a declaration that no impassable features exist; it awaits Obidit's judgement.
- **Candidate screen only:** `horn_slope_deg` on the bilinear-warped 1 m DEM, then `aggregate_slope` with linear NaN-aware p90 in each 5 m block, following the pipeline code. Strictly greater than the **15° MissionScenario default** from 05, then **4-connected areas ≥ 400 m²** (16 cells; a compact 20 m square). This minimum removes small noisy clusters while retaining short coherent steep features; it is an agent-chosen review filter, not a new mission rule. It does not remove artifacts or establish that a component is a scarp.
- **706 candidates**, 16,617,775 m² total, from 694,728 above-limit cells and 12,205 components before size filtering; 30,017 small-component cells omitted. All 5 m slope cells are finite. Candidate polygons and per-component min/median/p90/max slope-p90 statistics are in `t03/hazard_candidates.geojson`, with `method: slope threshold candidate`, `provenance: derived`, and `status: candidate — data lead to keep or drop`. The ranked CSV is `t03/hazard_candidates.csv`. These broad steep areas are not all scarps and do not set HARD_HAZARD. The normal slope hard-limit rule remains separate from bit 1.

### Local evidence and reproduction

Work directory: `/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/pipeline/work/t03/`. All scripts, full-precision results and raster/PNG intermediates remain local; no dataset or binary is committed.

- `confirmation_config.json`: frozen analysis settings and their provenance; hash recorded above.
- `confirm_alignment.py`, `confirmation_results.json`, `confirmation_run.txt`: both new methods, all tile/scale results, accepted pools, summary statistics and synthetic-test results.
- `verify_confirmation_inputs.py`, `confirmation_input_check.json`: fresh original-input warp and full-grid equality/CRS checks.
- `alignment_measurements.json`, `alignment_measurements.csv`, `alignment_summary.json`, `alignment_exploration.json`: original ZNCC, quadrant and feature-sensitivity evidence.
- `hillshade_working_1m.tif`, `ortho_working_1m.tif`, `low_res_selection_1m.tif`: cached common-grid analysis rasters and mask; original DEM/hillshade/ortho are read-only.
- `alignment_tiles_contact_sheet.png` and `alignment_tile_<id>_*.png`: original visual review artifacts.
- `low_res_summary.json`, `hazard_summary.json`, `hazard_candidates.geojson`, `hazard_candidates.csv`, `validation_summary.json`: earlier T03.18 mask and candidate evidence, unchanged by this confirmation run.
- `dem_working_1m_halo.tif`, `slope_p90_5m.tif` and the labelled hab-site crops: earlier related evidence; T01.07's second-person check sheet is not present on this branch.

From this worktree, with `CONDA_BIN=/home/obidit/miniconda3/bin/conda` if conda is not on PATH:

```sh
py=$(make -s pipeline-python)
work=/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/pipeline/work/t03
"$py" "$work/verify_confirmation_inputs.py"
OPENBLAS_NUM_THREADS=1 "$py" "$work/confirm_alignment.py" --self-test
OPENBLAS_NUM_THREADS=1 "$py" "$work/confirm_alignment.py"
```

The original note referred to `/tmp/claude-1000/t0318_prepare.py`, `t0320_alignment.py`, `t03_review_artifacts.py`, `t03_render_figures.py` and `t03_validate.py`; those temporary scripts are no longer available. The preserved original JSON/CSV outputs remain the primary ZNCC evidence. The confirmation scripts above exist under `t03/` and do not rely on those temporary scripts.

### Delegated closure and remaining checks

- [x] T03.20: apply the data lead's approved three-method decision rule, record the final scalar and IQR, and mark this delegated tool confirmation done, not GIS-checked.
- [x] Record this confirmation assistance in `docs/AI_USE.md`; all science values are tool outputs with local evidence.
- [ ] Obidit confirms the repaired LOW_RES_DEM overlay and retained eight-patch interpretation (T03.18, unchanged).
- [ ] Obidit keeps/drops slope candidates or supplies team-drawn impassable polygons; decide whether the empty hazards input is acceptable for T03.19 (unchanged).
- [ ] A second person completes and signs T01.07's check sheet (not present on this branch, unchanged).

No T03.19 bundle or lock file is changed. This section closes only the delegated T03.20 decision; the other human checks remain open.

### Validation completed by tools

- Synthetic fixtures in `confirm_alignment.py` passed before reading new raster results: phase recovered the declared +7 m east / +4 m north shift; fractional inverse-DFT refinement recovered +7.35 m east / +4.25 m north; chamfer recovered +7 m east / +4 m north; flat phase input was rejected. These are explicitly planted test values, not observations of Mars.
- Fresh original-input warps matched every cached sample; Mars radius, projection, same-grid and north-up checks passed (`confirmation_input_check.json`).
- Original verification-log content before T03.20 is preserved byte for byte; only this branch's T03.20 section is edited. The changed-file set is exactly the five owned deliverables; C5 JSON keeps its contracted keys, matches the rounded pool median, and carries the required confirmation wording. The frozen configuration hash matches the results.
- `make -s progress`, `make lint docs-check` and `make typecheck`: passed. Markdown lint reports 0 issues; link checking reports 2779 relative links checked, 0 broken; README progress freshness passes.
- `python3 scripts/check_tasks.py`: 32 task files, 347 subtasks, 0 problems.
- `make CONDA_BIN=/home/obidit/miniconda3/bin/conda test`: passed with loopback access. The first sandboxed run stopped at seven server tests because socket binding returned `EPERM`; the rerun outside the sandbox passed all seven. Hab Core: 118 passed, 41 todo; web: 20 passed, 27 todo; compute: 75 todo. Environment checks include the Mars sphere and pipeline interpreter.
- `$(make -s pipeline-python) -m pytest -q pipeline`, also run directly with the pipeline interpreter: **73 passed, 5 skipped, 48 warnings**. The existing warnings report unavailable `jsonschema`, so manifest schema validation remains skipped; this confirmation does not close that environment limitation.
- `git diff --check`: passed. Full local check output is in `t03/confirmation_docs_checks.txt`, `confirmation_typecheck.txt`, `confirmation_tasks_check.txt`, `confirmation_tests_unsandboxed.txt` and `confirmation_pytest.txt`. The temporary `node_modules` symlink is removed before the local commit; `.serena/` and downloaded data are not staged.

## T03.30 — Verify `comm_hab` against `gdal_viewshed` at 5 points

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

   model ground horizon sqrt(2RH) = 8241.589652488165
   model 2 m target horizon sqrt(2RH)+sqrt(2R*2) = 11927.340593612646
   tz=0 cc=1.00000: farthest visible 8240.0 m, first invisible 8245.0 m
   tz=0 cc=1.87563: farthest visible 6020.0 m, first invisible 6025.0 m
   tz=2 cc=1.00000: farthest visible 11925.0 m, first invisible 11930.0 m
   tz=2 cc=1.87563: farthest visible 8705.0 m, first invisible 8710.0 m

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
| **Status** | WIP (pending real grid bundle): mock-grid harness only; real-grid run pending generation of `data/sites/gale_boxwork/` by the data pipeline (T03.19/T03.21) |
| **Inputs** | Node.js v22.18.0 (Windows x64); `packages/compute/tests/realGrid.test.ts`; `data/sites/mock_site/` (F4 fixture) |

### Environment & Machine

- OS: Windows x64
- Node.js: v22.18.0
- Test runner: Vitest 5.0.5

### Benchmark Results (Mock Disk Fixture Baseline — `mock_site-2026.11.05`)

- Note: The figures below reflect the mock-grid harness baseline (`data/sites/mock_site/`), NOT the real Gale crater bundle. Verification against the real Gale bundle remains pending.
- **20 seeded pairs inside AOI (Mulberry32 seed 20261108):**
  - Routes found: 20
  - No-route failures: 0
  - Crashes / uncaught exceptions: 0 (01 §B pass)
  - Timings: min 0.03 ms, p50 0.70 ms, p95 4.86 ms, max 4.86 ms
- **3-stop loop route through worker handler (`COMPUTE_PLAN`, `loop: true`):**
  - Total duration: 6.56 ms
  - Legs generated: 4 (3 excursion legs + 1 return leg)
  - Status: OK
  - Mock baseline compliance (target ≤ 2,000 ms): 6.56 ms (mock baseline only)

### Real Grid Status (`data/sites/gale_boxwork`)

- In accordance with T05.28 Step 1, the test suite inspects `data/sites/gale_boxwork/site-manifest.json` and `grid/elevation.f32`.
- In a clean checkout, the large binary bundle for `gale_boxwork` is git-ignored and awaiting generation by the data pipeline (T03.19/T03.21).
- The three `gale_boxwork` verification tests (FR-03 10 sampled F5 cells against rasterio readout, FR-07 20 seeded pairs, and NFR-02 3-stop loop ≤ 2 s) are set to skip cleanly (`ctx.skip()`) until the M2 bundle is placed at `data/sites/gale_boxwork/`.

### Verdict (T05.28)

- **T05.28 status: WIP.** Mock-grid test harness implemented; real-grid verification run is pending delivery of the real Gale bundle from T03.19/T03.21.
- Hands on to: T03.19 / T03.21 (real grid bundle and F5 sample cells generation), then rerun T05.28 on real data.

## T13.04 — Base styles: typography defaults, focus ring, reduced motion

| | |
| --- | --- |
| **Owner** | Ridita Alam (R5 EVA & Ops UI · design system) |
| **Date** | 2026-11-08 |
| **Status** | Done: base styles verified offline; zero external network requests |
| **Inputs** | [04 §C.1, §C.2, §C.3, §E](../specs/04_Design_Brief.md); [base.css](../../apps/web/src/ui/styles/base.css); self-hosted fonts in `apps/web/public/fonts/` (T13.02) |

| Feature | Result | Evidence |
| --- | --- | --- |
| Fonts offline (NFR-01, NFR-07) | **Verified offline**, zero external requests | `@font-face` rules in `base.css` reference `/fonts/...`; Vite production build (`base: "./"`) rebases to `../fonts/...`; bundle passes offline verification |
| Typography defaults (04 §C.2) | **Verified** against 04 §C.2 specs | Body 14 px / 400 Inter (line-height 1.45), panel headings 16 px / 600, screen titles 20 px / 600, microcopy 12 px mono, no text renders below 12 px |
| Focus ring (04 §E, 04 P10) | **Verified** | 2 px white outline with 2 px offset and box-shadow gap on `:focus-visible`, never removed |
| Reduced motion (04 §E Motion) | **Verified** | `@media (prefers-reduced-motion: reduce)` zeroes animation and transition durations and forces `scroll-behavior: auto` |
| Target sizes (04 §C.3) | **Verified** | Minimum mouse ≥ 32 px, touch ≥ 44 px via `@media (pointer: coarse)`, EVA ≥ 56 px with `[data-surface="eva"]` / `.eva-target` |

- Hands on to: T13.09 (axe scan), T13.10 (keyboard-only run).

## T13.06 — Keyboard map controls and global shortcuts

| | |
| --- | --- |
| **Owner** | Ridita Alam (R5 EVA & Ops UI · design system) |
| **Date** | 2026-11-08 |
| **Status** | Done: keyboard shortcuts implemented and verified |
| **Inputs** | [04 §E Keyboard, Motion](../specs/04_Design_Brief.md); [04 §D Briefing](../specs/04_Design_Brief.md#d-interaction-and-component-behavior); [03 §A, SCR-02, SCR-08](../specs/03_App_Flow_and_Diagrams.md); [keyboard.ts](../../apps/web/src/ui/map/keyboard.ts) |

| Key / Shortcut | Action | Condition / Result |
| --- | --- | --- |
| Arrow keys (`↑`, `↓`, `←`, `→`) | Pan map view by step | Active when map has focus; instant when `prefers-reduced-motion` |
| `+` / `−` | Zoom in / zoom out | Active when map has focus |
| `Delete` | Remove selected stop and recompute plan (03 §C.3) | Requires active stop selection |
| `B` | Navigate to Briefing (`#/briefing`) | Enabled only when plan is computed; does nothing if no stops or on error (03 SCR-08, 04 §D) |
| `?` | Navigate to Sources & Methods (`#/sources`) | Active globally outside text inputs (03 SCR-02) |
| Inputs / contentEditable | Text typing preserved | All shortcuts ignored when focus is within an editable element |
| `A`, `Enter` | Omitted | Reserved for T08.07 crosshair mode; not bound here |

- Hands on to: T13.10 (keyboard-only run of core scenario), T08.07 (add-stop mode).
