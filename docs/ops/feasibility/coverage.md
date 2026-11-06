# Raster coverage of the AOI (T01.04)

| | |
| --- | --- |
| **Owner** | Obidit Islam, R1 Data & GIS ([T01.04](../../tasks/TASK-01_feasibility.md#t0104--check-themis-ti-tile-colour-hirise-cog-and-crism-coverage-of-the-aoi-by-window-reads)) |
| **Date** | 2026-11-06 |
| **Status** | Result for T01.05. Window reads and footprint index done; the AOI is still `Proposed` until T01.05 freezes it |
| **Related** | [AOI bounds](aoi.md) · [02 §C.1](../../specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer) · [02 §C.2 L1](../../specs/02_Technical_Requirements_Document.md#l1--optical-basemap-fr-01) · [02 §C.2 L4](../../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10) · [02 §C.2 L5](../../specs/02_Technical_Requirements_Document.md#l5--spectral-fr-18-desirable) · [01 FR-18](../../specs/01_Product_Requirements_Document.md#fr-18--spectral-crism-layer--s) · [Data downloads](../data-downloads.md) · [Verification log](../verification-log.md) |

## Result

| Product | Result | Coverage of the AOI window | Figure comes from |
| --- | --- | --- | --- |
| Colour HiRISE LRGB COG (L1, D2) | **Covered** | 100 % valid, no gaps in the mask | `gdalinfo -stats`, `STATISTICS_VALID_PERCENT=100` on all four bands (alpha band min = max = 255) |
| THEMIS quantitative TI, tile `THEMIS_TI_Mosaic_Quant_30S120E_100mpp` (L4, D4) | **Covered** | 100 % valid, no gaps in the AOI window | `gdalinfo -stats`, `STATISTICS_VALID_PERCENT=100` |
| CRISM MTRDR (L5, D17) | **Covered, patchwork**: 7 observations touch the AOI. Best single observation `FRT0000B6F1`, 97.12 % valid. None is both complete and recent | Per observation 8.996 % to 97.12 % (table below) | Footprint index (35 index records, 7 observations), then `gdalinfo -stats` on a window of each summary-parameter product |

Nothing here is an estimate. Every figure is either printed by a command listed under [Commands and outputs](#commands-and-outputs) or counted from the PDS index by the script named there.

The grayscale orthophoto (D3) was not read: the colour COG already covers the AOI, which is D3's only trigger in [data-downloads](../data-downloads.md#b1-terrain-and-imagery-tier-0-critical-path). Its size is a finding, though; see [Findings that disagree with the specs](#findings-that-disagree-with-the-specs).

## How the windows were cut

- AOI and projection come from [aoi.md](aoi.md), byte for byte. Working projection: `+proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs`. `extent_m` `[-3000, -3000, 3000, 3000]`.
- Every window used `gdal_translate -projwin -3000 3000 3000 -3000 -projwin_srs "<working projection>"`. No EPSG:4326 or EPSG:3857 argument was passed to GDAL.
- `-projwin_srs` converts the window to the source's own CRS and takes its bounding box. All three products are equirectangular on the same 3,396,190 m sphere but with `lat_ts=0` and origin at 0°E, not the working projection. So the extract is not reprojected, and it is a little larger than the AOI in x (the HiRISE window is 24,086 × 24,001 px at 0.25 m, about 6,021.5 × 6,000.25 m). Valid-pixel shares are over that window.
- Tools: GDAL 3.13.3 "Iowa City" from the `marswalk-pipeline` environment. `STATISTICS_VALID_PERCENT` is written by `gdalinfo -stats` in this version, which answers the `TODO(verify)` in T01.04's Verify line.
- The extracts live in local, git-ignored scratch: `/tmp/claude-1000/-home-obidit-secondBrain-coding-CheesySpace-NasaSpaceAppChallenge/209b6e39-4553-4fac-8c1b-26de817dc550/scratchpad/t0104/` (folders `hirise/`, `themis/`, `crism/win/`, `crism/index/`). They were not written to `pipeline/work/` and are not committed. The HiRISE extract is 1,400,243,479 bytes (DEFLATE), held in RAM-backed `/tmp`; delete it when no longer needed.

## Colour HiRISE LRGB COG (L1, D2)

| Field | Value |
| --- | --- |
| Product | USGS *Mars MSL Gale Merged Orthophoto Mosaic 25cm*, colour version "HiRISE 78 quad color basemap", Jpeg-compressed COG (page: "NEW (July 2025) Color Mosaic"). Authors Parker and Calef |
| Page | `https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm` |
| URL (as listed on the page, matches D2) | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` |
| Version | The file name carries no version number. Recorded instead: `Last-Modified: Fri, 25 Jul 2025 16:58:53 GMT`, `ETag: "adae62ea1be4cf769f7232a2a7dee80c-60"`, `x-amz-version-id: 0ZDib2C._2LbtlqGD1_o4uHnz0whyvNj`, `Content-Length: 1030625379` |
| Tile or observation ids | One file |
| CRS | `GCS_INTERPLANETARY,_MARS_2000_SPHERE`, Equidistant Cylindrical, ellipsoid radius 3,396,190 m, `lat_ts` 0, `lon_0` 0 |
| Native resolution | 0.25 m/px (`Pixel Size = (0.25, -0.25)`); 36,000 × 76,000 px; 3 bands Byte, YCbCr JPEG quality 85, 512 × 512 blocks, 8 overview levels, per-dataset mask |
| File extent (source CRS) | x 8,140,000 to 8,149,000, y -270,000 to -289,000 |
| AOI window (source CRS) | Origin (8,140,147.25, -282,111.25), 24,086 × 24,001 px; lower right (8,146,168.75, -288,111.50). Inside the file extent (west margin 147.25 m, south margin 888.5 m) |
| Valid-pixel share | 100 % on bands 1 to 3 and on the alpha band (extracted with `-b mask`, min = max = 255) |
| Gaps | None in the mask. Extra check with `rasterio`: 136,454 of 578,088,086 pixels (0.0236 %) have R = G = B = 0 although the mask calls them valid. Whether those are shadow or padding is `TODO(verify)` by eye in T03.19 |
| Greyscale strips | About 7.74 % of the window has R = G = B: real greyscale strips inside the colour mosaic, valid in the mask but with no colour. Visible when viewed in QGIS. Measured with `rasterio` on a nearest-neighbour sample of 1505 × 1505 pixels (sampled, not every pixel). The basemap still covers the AOI, so T03.26 is not triggered; whether the strips matter for display is for U-09 at T01.05 |
| Data pulled | One window read, 3 min 21 s wall time; the file was not downloaded in full |

## THEMIS quantitative thermal inertia (L4, D4)

| Field | Value |
| --- | --- |
| Product | USGS *THEMIS Thermal Inertia Mosaic Quantitative 30S120E 100mpp*, Fergason (2014-05-30), Edition 1, ISIS3 cube |
| Tile id, exactly as published | **`THEMIS_TI_Mosaic_Quant_30S120E_100mpp`** (file `THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub`; page title "THEMIS Thermal Inertia Mosaic Quantitative 30S120E 100mpp") |
| Page | `https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s120e_100mpp` |
| How the page URL was found | Formed by replacing `30S060E` with `30S120E` in the 02 Sources page for the 30S060E tile, then opened: HTTP 200, the title and the "Online Package Link" on the page both name 30S120E. The URL was not read from a search result, so it is verified but not independently listed |
| File URL (the page's Download link) | `https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub`. The page's "Online File Link" field still reads `http://astropedia.astrogeology.usgs.gov/download/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub`, not tested |
| Version | Edition 1; `Last-Modified: Sat, 17 Jun 2023 23:49:19 GMT`; `ETag: "410b93708135dc0a1f184674eaf55419-302"`; `Content-Length: 2532510196` (the page says "External File Size 2532510196", "Download (2.36 GB)") |
| Tile extent | Corners at 119°59'56.13" E to 179°59'57.23" E and 0°0'0.01" N to 29°59'57.51" S, so it covers 0 to 30° S, 120 to 180° E as 02 §C.2 L4 requires. 35,565 × 17,782 px |
| CRS | `SimpleCylindrical Mars`, Equidistant Cylindrical, radius 3,396,190 m, `lat_ts` 0, `lon_0` 0 |
| Native resolution | 100 m/px (`Pixel Size = (100, -100)`); Float32; NoData `-3.4028227e+38`; block 128 × 128 |
| AOI window (source CRS) | Origin (8,140,100, -282,100), 61 × 61 px, lower right (8,146,200, -288,200). The AOI is 60 × 60 TI pixels, so one TI pixel is 400 routing cells at 5 m, as 02 §C.2 L4 says |
| Valid-pixel share | **100 %** (`STATISTICS_VALID_PERCENT=100`). Window statistics: min 255.661, max 646.241, mean 374.826, standard deviation 53.457 |
| Gaps | None in the AOI window. The page says gaps in the mosaic mean "no THEMIS infrared coverage at the time the mosaic was created or poor quality images were removed"; treat any such cell as **unknown, never zero** (02 §C.2 L4). Nodata must stay NaN through the pipeline |
| Units | The cube carries no unit in what `gdalinfo` printed. 02 §C.2 L4 says tiu (J m⁻² K⁻¹ s⁻½); `TODO(verify)` against the ISIS label (BandBin or `Pixels` group) in T03.19 |
| Accuracy | The page states "absolute accuracy of the THEMIS thermal inertia is ~20%" |
| Data pulled | One window read of a few blocks of a 2.5 GB cube; the file was not downloaded in full |

## CRISM MTRDR (L5, D17)

| Field | Value |
| --- | --- |
| Bundle | *Mars Reconnaissance Orbiter CRISM MTRDR Bundle*, `urn:nasa:pds:mro_crism_mtrdr`, version 1.0, DOI 10.17189/2bd6-cs64, Murchie and Hash, bundle date range 2006-09-30 to 2012-05-21 |
| Page named in 02 Sources | `https://pds.nasa.gov/data/pds4/releases/geo/mro_crism_mtrdr-20250413/readme.txt`. The release folder on `pds.nasa.gov` holds only labels and inventory CSVs: `index/`, `data_mtrdr/` and the other collection folders return HTTP 404 there |
| Where the data is | PDS Geosciences Node, volume MROCR_4001, linked from `https://pds-geosciences.wustl.edu/missions/mro/crism.htm` ("MTRDR (PDS4)"): `https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/` |
| Footprint index (step 4 method) | PDS3 index tables in that volume: `.../mrocr_4001/index/mtrdrYYMM_index.tab` with labels `mtrdrYYMM_index.lbl` (`indxinfo.txt`: "list every MTRDR and MTRDR BROWSE data product", one table per month). 59 `.tab` files, 62,418 records, 49 MB, read in full. The `pds.nasa.gov` inventory `collection_data_mtrdr_inventory.csv` also lists 62,418 products (`wc -l`) |
| Product files | `.../mrocr_4001/mtrdr/<year>/<year>_<doy>/<obs id>/<product id lower case>.img` with `.hdr` (ENVI) and `.lbl`, found from `FILE_SPECIFICATION_NAME` in the index; each URL below answered HTTP 200 or was opened by `gdalinfo` |
| CRS and resolution | Per product ENVI header: `MRO Mars Equirectangular [IAU 2000] [0.00N; 0.00E]`, radius 3,396,190 m. Pixel 18 m for FRT observations and 36 m for HRL observations; 02 §C.2 L5 says "~18–20 m/px for FRT". Data ignore value 65535 (read by GDAL as NoData) |
| Product used for coverage | `SU` (summary parameters, 60 bands, band names such as R770 to R3920), Float32, bands 1 and 60 read. Other products of each observation: `DE` (map-projected DDR), `IF`, `IN`, `SR`, `WV` |
| Not done | No browse product, no spectral content check, no stitching of observations |

### Observations whose footprint reaches the AOI

The AOI box used for the index search is `bbox_geo` from [aoi.md](aoi.md): `[137.329209, -4.860612, 137.430791, -4.759388]`, in degrees (planetocentric, east-positive as the index label states).

| Observation id | Start time (UTC) | Date folder | `SU` product id | Pixel | Valid share of AOI window (`gdalinfo -stats`) | Window px |
| --- | --- | --- | --- | --- | --- | --- |
| `FRT0000B6F1` | 2008-07-09 | `2008_191` | `FRT0000B6F1_07_SU165J_MTR3` | 18 m | **97.12 %** | 336 × 334 |
| `HRL0000BABA` | 2008-07-20 | `2008_202` | `HRL0000BABA_07_SU182J_MTR3` | 36 m | 91.3 % | 168 × 168 |
| `FRT000058A3` | 2007-04-22 | `2007_112` | `FRT000058A3_07_SU165J_MTR3` | 18 m | 80.1 % | 336 × 334 |
| `FRT0001CA91` | 2010-12-31 | `2010_365` | `FRT0001CA91_07_SU165J_MTR3` | 18 m | 35.69 % | 336 × 334 |
| `FRT0001BBA1` | 2010-11-06 | `2010_310` | `FRT0001BBA1_07_SU165J_MTR3` | 18 m | 35.44 % | 335 × 334 |
| `FRT00021C92` | 2011-12-08 | `2011_342` | `FRT00021C92_07_SU164J_MTR3` | 18 m | 15.47 % | 335 × 335 |
| `HRL0001233B` | 2009-04-23 | `2009_113` | `HRL0001233B_07_SU183J_MTR3` | 36 m | 8.996 % | 169 × 167 |

- Each product's URL is `https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/mtrdr/<year>/<date folder>/<observation id lower case>/<product id lower case>.img`.
- For `FRT00021C92` the product itself ends at y = -283,374.74 m (311 lines), so the part of the window beyond that counts as invalid; this observation reaches only the north edge of the AOI. `HRL0001233B` ends at x = 8,145,695.5 m, so it reaches only the west edge.
- Index counts: of 62,418 records, 35 have a min/max latitude and longitude box that overlaps the AOI. Those 35 are 5 products for each of the 7 observations above. Of those, only the 7 `DE` (map-projected DDR) records have corner coordinates and all 7 intersect the AOI. The corner columns of the other products hold the fill value -999.999.
- Union of the seven windows, resampled by nearest neighbour onto one 18 m grid of 335 × 333 px: 100.00 % (111,555 of 111,555 px). Treat this as approximate: the windows are not aligned to each other, and the per-observation shares from the resampling (80.34, 97.36, 35.42, 35.48, 15.26, 91.57, 8.49 %) differ by up to 0.6 percentage points from the `gdalinfo` figures above.
- Spectral summary values are "indicative, not a mineral identification" (02 §C.2 L5). Valid here means not NoData; the quality of the values was not assessed.

### What this means for the CRISM fallback trigger

The spec marks AOI coverage as Unresolved and the layer as desirable (FR-18, S). The result is that coverage exists, but no single observation is a clean full-AOI product, and the observations were taken between 2007 and 2011 under different conditions. Whether that is good enough to keep FR-18 is `TODO(decision)` for T01.05 and T18.01. This note does not make it.

## Commands and outputs

Shell setup used for every GDAL call:

```bash
B=/home/obidit/miniconda3/envs/marswalk-pipeline/bin
export PROJ_DATA=/home/obidit/miniconda3/envs/marswalk-pipeline/share/proj
export GDAL_DATA=/home/obidit/miniconda3/envs/marswalk-pipeline/share/gdal
P='+proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs'
S=<scratch folder named above>
$B/gdalinfo --version
```

```text
GDAL 3.13.3 "Iowa City", released 2026/08/13
```

### Colour HiRISE COG

```bash
U=https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif
$B/gdalinfo /vsicurl/$U
```

```text
Driver: GTiff/GeoTIFF
Size is 36000, 76000
Origin = (8140000.000000000000000,-270000.000000000000000)
Pixel Size = (0.250000000000000,-0.250000000000000)
Image Structure Metadata:
  LAYOUT=COG
  COMPRESSION=YCbCr JPEG
Upper Left  ( 8140000.000, -270000.000) (137d19'36.20"E,  4d33'18.23"S)
Lower Right ( 8149000.000, -289000.000) (137d28'42.81"E,  4d52'32.18"S)
Band 1 Block=512x512 Type=Byte, ColorInterp=Red
  Overviews: 18000x38000, 9000x19000, 4500x9500, 2250x4750, 1125x2375, 562x1187, 281x593, 140x296
  Mask Flags: PER_DATASET
```

```bash
$B/gdal_translate -projwin -3000 3000 3000 -3000 -projwin_srs "$P" -b 1 -b 2 -b 3 -b mask \
  -co COMPRESS=DEFLATE -co TILED=YES -co BIGTIFF=IF_SAFER -co NUM_THREADS=4 \
  /vsicurl/$U $S/hirise/hirise_lrgb_aoi.tif
$B/gdalinfo -stats $S/hirise/hirise_lrgb_aoi.tif
```

```text
Input file size is 36000, 76000
0...10...20...30...40...50...60...70...80...90...100 - done in 00:03:06.
Size is 24086, 24001
Origin = (8140147.250000000000000,-282111.250000000000000)
Pixel Size = (0.250000000000000,-0.250000000000000)
Lower Right ( 8146168.750, -288111.500) (137d25'50.86"E,  4d51'38.21"S)
Band 1 Block=256x256 Type=Byte, ColorInterp=Red
  Minimum=0.000, Maximum=255.000, Mean=144.007, StdDev=51.579
    STATISTICS_VALID_PERCENT=100
Band 2 ... STATISTICS_VALID_PERCENT=100
Band 3 ... STATISTICS_VALID_PERCENT=100
Band 4 Block=256x256 Type=Byte, ColorInterp=Alpha
  Minimum=255.000, Maximum=255.000, Mean=255.000, StdDev=0.000
    STATISTICS_VALID_PERCENT=100
```

The all-zero RGB check, run with `$B/python -I` and `rasterio` over the extract's blocks, printed `pixels 578088086 allzero RGB 136454`.

### THEMIS tile

```bash
U=https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub
$B/gdalinfo /vsicurl/$U
$B/gdal_translate -projwin -3000 3000 3000 -3000 -projwin_srs "$P" /vsicurl/$U $S/themis/themis_ti_aoi.tif
$B/gdalinfo -stats $S/themis/themis_ti_aoi.tif
```

```text
Driver: ISIS3/USGS Astrogeology ISIS cube (Version 3)
Size is 35565, 17782
Origin = (7112900.000000000000000,0.000000000000000)
Pixel Size = (100.000000000000000,-100.000000000000000)
Upper Left  ( 7112900.000,       0.000) (119d59'56.13"E,  0d 0' 0.01"N)
Lower Right (10669400.000,-1778200.000) (179d59'57.23"E, 29d59'57.51"S)
Band 1 Block=128x128 Type=Float32, ColorInterp=Undefined
  NoData Value=-3.4028227e+38
--- window ---
Input file size is 35565, 17782
0...10...20...30...40...50...60...70...80...90...100 - done.
Size is 61, 61
Origin = (8140100.000000000000000,-282100.000000000000000)
Band 1 Block=61x33 Type=Float32, ColorInterp=Gray
  Minimum=255.661, Maximum=646.241, Mean=374.826, StdDev=53.457
    STATISTICS_MEAN=374.82551949513
    STATISTICS_VALID_PERCENT=100
```

### CRISM footprints and windows

The index files were fetched with `curl` into `$S/crism/index/` (59 `.tab` files and `mtrdr0801_index.lbl`, 49 MB). Column positions come from that label (57 columns: 46 `MAXIMUM_LATITUDE`, 47 `MINIMUM_LATITUDE`, 48 `WESTERNMOST_LONGITUDE`, 49 `EASTERNMOST_LONGITUDE`, 50 to 57 the four corners). The script `crism_footprints.py` (scratch, not in the repo) tests the min/max box first and then the corner polygon:

```bash
$B/python -I $S/scripts/crism_footprints.py $S/crism/index 137.329209 -4.860612 137.430791 -4.759388
```

```text
index files: 59
records by PRODUCT_TYPE: {'MAP_PROJECTED_DDR': 10403, 'MPTARGETED_RDR': 52015} sum 62418 unparsed/odd rows 0
records whose min/max lat/lon box overlaps AOI: 35
records whose corner footprint polygon intersects AOI: 7
```

One window per observation, for example the best one:

```bash
V=https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001
q=mtrdr/2008/2008_191/frt0000b6f1/frt0000b6f1_07_su165j_mtr3.img
$B/gdalinfo /vsicurl/$V/$q
$B/gdal_translate -q -projwin -3000 3000 3000 -3000 -projwin_srs "$P" -b 1 -b 60 /vsicurl/$V/$q $S/crism/win/frt0000b6f1_07_su165j_mtr3_aoi.tif
$B/gdalinfo -stats $S/crism/win/frt0000b6f1_07_su165j_mtr3_aoi.tif
```

```text
Size is 775, 714
Origin = (8138478.599999999627471,-278195.960000000020955)
Pixel Size = (18.000000000000000,-18.000000000000000)
Upper Left  ( 8138478.600, -278195.960) (137d18' 3.80"E,  4d41'36.00"S)
Lower Right ( 8152428.600, -291047.960) (137d32'11.05"E,  4d54'36.56"S)
NoData Value=65535
--- window ---
Size is 336, 334
Origin = (8140134.599999999627471,-282101.959999999962747)
    STATISTICS_VALID_PERCENT=97.12     (band 1)
    STATISTICS_VALID_PERCENT=97.12     (band 60)
```

The same three commands ran for the other six observations with the paths in the table above; their `STATISTICS_VALID_PERCENT` lines read 91.3, 80.1, 35.69, 35.44, 15.47 and 8.996 (identical for bands 1 and 60 in each). The union figure came from `crism_union.py` (scratch) run with `$B/python -I`:

```text
union of all 7 observations: 100.00 % (111555 of 111555 px)
```

## Findings that disagree with the specs

- **D3 file size.** The grayscale orthophoto page, [02 §C.2 L1](../../specs/02_Technical_Requirements_Document.md#l1--optical-basemap-fr-01) and D3 all say 23 GB. `curl -sI` on `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` returned `HTTP/1.1 200 OK`, `Content-Length: 50404480837`, `Last-Modified: Thu, 01 Dec 2022 23:24:04 GMT`. Not an issue while the colour COG covers the AOI; do not plan a full D3 download.
- **CRISM source page.** 02 Sources cites the `pds.nasa.gov` release readme, which does not hold the data or the footprint index. The data is on the PDS Geosciences Node (MROCR_4001), as set out above. 02 L5 says "~18–20 m/px for FRT"; the FRT products here are 18 m, and the HRL products are 36 m.
- **CRISM corner footprints.** For observation `FRT0001BBA1` the `DE` record's corner latitudes reach -5.27 while its min/max latitude columns stop at -4.923. The index label calls the corner columns "edge of the FOV at the observation start/end", so the two sets need not agree; their meaning for map-projected data is `TODO(verify)`. Coverage above therefore comes from the window reads, not from the corners.
- **THEMIS page URL.** 02 Sources and D4 only give the 30S060E page. The 30S120E page exists at the pattern URL and is now recorded; T03.19 can fill D4's `TODO(verify)`.

## Still open

- Unit of the TI cube (`TODO(verify)` above) and what the 136,454 all-zero RGB pixels in the HiRISE window are.
- Whether CRISM stays in scope and which observation or observations to use: `TODO(decision)` at T01.05, T18.01.
- The AOI may still move before T01.05 freezes it; if it does, rerun the three window reads and the index search with the new `extent_m` and `bbox_geo`.
