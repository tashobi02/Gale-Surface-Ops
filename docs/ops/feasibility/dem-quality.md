# DEM quality in the AOI (T01.03)

| | |
| --- | --- |
| **Owner** | Obidit Islam, R1 Data & GIS ([T01.03](../../tasks/TASK-01_feasibility.md#t0103--judge-dem-quality-in-the-aoi-from-a-hillshade-measure-one-reference-feature)) |
| **Date** | 2026-11-07 |
| **Status** | Verdict by the data lead, 2026-11-07: pass, on the method below |
| **Related** | [AOI bounds](aoi.md) · [DEM label facts](dem-label.md) · [02 §C.2 L2](../../specs/02_Technical_Requirements_Document.md#l2--topography-elevation-hillshade-fr-02-fr-03-fr-08) · [01 §F.2](../../specs/01_Product_Requirements_Document.md#f2-key-assumptions) A-01 · [05 Unresolved](../../specs/05_Backend_and_Database_Schema.md#unresolved-items-owned-by-this-document) U-10 · [Feasibility check](../feasibility.md#dem-quality-check-u-01-a-01) |

## Result

| Question | Answer |
| --- | --- |
| Share of the AOI with HiRISE-scale texture | **85.67 %**, computed from the polygons below |
| Against "≥ 80 % of AOI" (06 TASK-01) | **Pass**, the data lead's verdict on 2026-11-07. **The margin depends on the method**: see [Sensitivity](#sensitivity) |
| Artifacts | Yes, listed below |
| U-10: per-pixel DEM source map? | **Not obtainable.** Stereo-pair footprints are, but they do not separate HiRISE from fill inside the box. Low-resolution areas are interpreted, as in the method below |
| Reference feature | A crater, 38.87 m rim to rim: see [Reference feature](#reference-feature) |

## Method

The data lead decided on 2026-11-06 what counts: an area fails only where **the photo shows detail the DEM lacks**. Terrain that is smooth in both is genuine smooth ground, and it passes. This resolves T01's spec question 1 for this check; it is a judgement, not a measurement of the DEM's source.

1. Cut the AOI window and make the hillshade (commands below).
2. Score each 50 m block for fine detail in the DEM and in the HiRISE photo: the root mean square of second differences at 1 m. Both scores are relative aids, not physical quantities. The photo score measures brightness contrast, so dark sand beside pale rock also scores high.
3. Set cut-offs between the data lead's verdicts on three reference spots:

   | Spot | Centre `E, N` | Data lead's verdict | DEM detail | Photo detail |
   | --- | --- | --- | --- | --- |
   | Top | 8140900, −282900 | Lacks DEM detail | 0.043 | 54.2 |
   | Middle | 8145800, −284000 | Genuinely smooth | 0.030 | 19.9 |
   | Bottom | 8143100, −285100 | HiRISE-scale | 0.181 | 33.1 |

4. Mark blocks with DEM detail below 0.08 and photo detail above 35, and drop patches under 9 blocks. This leaves 18.8 % of blocks in 32 patches.
5. Compare the 12 largest patches with the photo at 1 m per pixel, and keep those where the photo clearly shows detail the DEM lacks. **The data lead delegated this selection to the agent on 2026-11-07.** The 20 smallest patches, 2.21 % together, were not inspected or kept.
6. Convert the kept patches to working-projection metres and compute their area.

### Patches

| Patch | Share of AOI (blocks) | Centre `E, N` | Decision | What the comparison shows |
| --- | --- | --- | --- | --- |
| 1 | 9.60 % | 8141032, −283293 | **Kept** | Rough rock and fractures in the photo; smooth DEM |
| 2 | 2.07 % | 8144687, −283382 | **Kept** | Layering and a scarp in the photo, softened in the DEM; contains the seam |
| 3 | 0.88 % | 8144966, −282516 | **Kept** | Strata in the photo, smooth DEM; contains the seam |
| 4 | 0.69 % | 8140289, −286506 | **Kept** | Fine rough texture in the photo; smooth DEM; at the west edge |
| 5 | 0.67 % | 8144759, −286408 | Not kept | DEM follows the hummocks; photo score looks like colour contrast |
| 6 | 0.57 % | 8144092, −287535 | Not kept | DEM follows the knobs well |
| 7 | 0.57 % | 8143594, −283548 | Not kept | DEM shows sharp relief in much of the patch |
| 8 | 0.46 % | 8145350, −284677 | **Kept** | Faceted triangles and a seam at its west side |
| 9 | 0.33 % | 8145910, −285798 | **Kept** | Rough hill surface in the photo; smooth DEM with a straight line |
| 10 | 0.28 % | 8145897, −286391 | Not kept | DEM follows the ridges and dune forms |
| 11 | 0.25 % | 8141711, −286980 | **Kept** | Pits in the photo are missing from the DEM |
| 12 | 0.22 % | 8145119, −285893 | **Kept** | Rough ground in the photo; smooth DEM crossed by a seam |

### Share

```bash
ogrinfo -q -dialect SQLite \
  -sql "SELECT SUM(ST_Area(geometry)) AS area_m2, COUNT(*) AS n FROM low_res_dem_candidates" \
  pipeline/work/dem/low_res_dem_candidates.geojson
```

```text
area_m2 (Real) = 5159266.08518661
n (Integer) = 8
```

5,159,266 m² of the 36,000,000 m² extent is 14.33 %, so **85.67 %** passes. Counting blocks instead gives 85.50 %.

The polygons stay in `pipeline/work/` and T03.18 may reuse them for `low_res_dem.geojson`.

## Sensitivity

The share depends on the cut-offs. Share of the AOI passing, before review and before dropping small patches:

| DEM detail below | Photo above 25 | Photo above 35 | Photo above 45 | Photo above 55 |
| --- | --- | --- | --- | --- |
| 0.04 | 80.9 | 87.3 | 91.6 | 94.0 |
| 0.05 | 76.5 | 84.7 | 90.2 | 93.1 |
| 0.08 | 67.1 | 79.2 | 87.0 | 91.1 |
| 0.10 | 61.7 | 75.8 | 84.9 | 89.8 |
| 0.12 | 56.3 | 72.5 | 82.9 | 88.7 |

The top spot requires a DEM cut-off above 0.043 and a photo cut-off below 54.2, which rules out the first row and the last column. Keeping every patch at the chosen cut-offs gives 81.2 %.

A stricter reading of the 06 rule, counting all smooth DEM as failing whatever the photo shows, gives about 48–68 % at DEM cut-offs of 0.05–0.10. The team should see this when it decides D-01 at T01.05.

## Artifacts

| Artifact | Location | Evidence |
| --- | --- | --- |
| Thin straight seam with a band of horizontal stripes | About `E 8144796–8144886`, `N −282881 to −283211` for the stripes; the line continues through patches 2, 3, 8 and 12 | Hillshade crops at 1 m |
| Faceted triangles beside the seam | West side of patch 8 | Hillshade crop at 1 m |
| Fine cross-hatch on steep dark slopes | Near `E 8143100, N −285100` | Hillshade crop at 1 m |
| Faint straight line and darker banding | Patch 9 | Hillshade crop at 1 m |

The seam's full length has not been traced.

## U-10 evidence

The USGS product page lists 12 HiRISE stereo pairs behind the DEM. Corners come from HiRISE's `RDRCUMINDEX.TAB`, read on 2026-11-07. The share is each pair's overlap on a 10 m raster of the AOI; the index does not state the corner latitude type.

| Pair | Products | Stereo overlap, share of AOI |
| --- | --- | --- |
| T3 | `ESP_019698_1750`, `ESP_019988_1750` | 81.3 % |
| Traverse | `PSP_009149_1750`, `PSP_009294_1750` | 63.0 % |
| West | `PSP_009650_1755`, `PSP_009716_1755` | 26.3 % |
| T1 | `PSP_001488_1750`, `PSP_001752_1750` | 9.5 % |
| The other eight | | 0.0 % |

Together they cover **100.0 %** of the AOI, including every kept patch. So being smooth here does not show that a spot is CTX or HRSC fill: it may be HiRISE data with lower effective resolution, or fill the mosaic chose instead. No source says which, per pixel. The kept areas are therefore labelled **interpreted**, as U-10 expects.

**For T16.02:** the USGS page lists these eight products with the suffix `_1755`: the Traverse, T1, T2 and T3 pairs. PDS has them as `_1750`; the `_1755` paths return 404. The suffix was found by trying nearby values.

## Commands

The AOI window was cut from the remote file, not the full download:

```bash
gdal_translate -q -projwin -3000 3000 3000 -3000 \
  -projwin_srs "+proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs" \
  -co TILED=YES -co COMPRESS=DEFLATE -co BIGTIFF=IF_SAFER \
  /vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif \
  pipeline/work/dem/aoi_1m.tif
gdaldem hillshade -q -az 315 -alt 45 -compute_edges \
  pipeline/work/dem/aoi_1m.tif pipeline/work/dem/aoi_hillshade.tif -co TILED=YES -co COMPRESS=DEFLATE
```

`gdalinfo -stats pipeline/work/dem/aoi_1m.tif`: size 6023 × 6001, elevation −4195.562 to −2909.552, `STATISTICS_VALID_PERCENT=100`.

## Reference feature

A small crater visible in both the hillshade and the photo, measured west to east along its floor's row. The data lead delegated this measurement to the agent on 2026-11-07.

| Field | Value |
| --- | --- |
| West rim | Lat −4.76337, lon_e 137.41288 (`E 8145107.0, N −282347.6`) |
| East rim | Lat −4.76337, lon_e 137.41354 (`E 8145146.0, N −282347.6`) |
| Length, working projection | 38.86 m |
| Length, great circle on the 3,396,190 m sphere (`pyproj.Geod`) | 38.87 m |

Method: the floor is the lowest DEM point near the crater. Each rim is the crest of a 1 m elevation profile from the floor, using the first local maximum for the west side and the maximum after removing the local slope for the east side. The endpoints agree with the bright rim edges in the photo by eye.

**Uncertainty.** A second reading, taking the slope-removed maximum on both sides, gave 47.83 m, because the west side has a second bump farther out. The rim is rounded, so endpoints are good to a couple of metres. T02.04's 2 % check allows only about 0.8 m on this length, so it should use the same endpoints or a longer baseline.
