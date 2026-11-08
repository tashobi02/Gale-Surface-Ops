# DEM label facts (T01.01)

| | |
| --- | --- |
| **Owner** | Obidit Islam, R1 Data & GIS ([T01.01](../../tasks/TASK-01_feasibility.md#t0101--download-the-1-m-gale-dem-record-its-pds3-label-datum-and-no-data-value)); file download by Mishkat Ahmed Khan |
| **Date** | 2026-11-06; checksum 2026-11-07 |
| **Status** | Complete: label facts recorded, full-file SHA-256 taken 2026-11-07 |
| **Related** | [02 §C.1](../../specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer) · [02 §C.2 L2](../../specs/02_Technical_Requirements_Document.md#l2--topography-elevation-hillshade-fr-02-fr-03-fr-08) · [02 §C.4](../../specs/02_Technical_Requirements_Document.md#c4-mars-specific-pitfalls-to-test-explicitly) · [Feasibility check](../feasibility.md#elevation-datum-u-02) |

## Result

| Question | Answer | Source |
| --- | --- | --- |
| Does the label confirm heights relative to the MOLA areoid (U-02)? | **Unclear** (confirmed by the data lead, 2026-11-06). Neither label states a vertical datum | Both labels, read in full, below |
| No-data value | **−32767** | GeoTIFF tag from `gdalinfo`; **neither label states one** |
| Dimensions | 32,980 columns × 57,440 rows; match 02 §C.2 | `gdalinfo`, label lines 9–10 |
| Extent | Lat −5.098652…−4.129605, lon 137.124167…137.680559 °E; match 02 §C.2 | Label lines 35–38 |
| Sphere radius | 3,396,190 m; matches 02 §C.1 | `gdalinfo`, label lines 18–20 |
| Latitude type | Planetocentric, east-positive longitude; match 02 §C.1 | Label lines 23, 42–43 |

**For T01.05 and T16.02.** T01.01 expects the datum statement and the no-data value as label quotes. The labels contain neither, so there is nothing to quote. The closest statement is on the USGS product page, quoted below, and it says the DEMs are tied to a MOLA DEM. It does not name an areoid or a vertical datum.

**For T03.08.** The file declares its no-data value, so `nodata_to_nan` uses the tag. This answers TASK-03 spec question 15.

## Source file

| Field | Value |
| --- | --- |
| File URL, as linked on the product page | `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` |
| Product page | <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m> |
| Accessed | 2026-11-06 |
| Size | 3,868,256,546 bytes (`Content-Length`) |
| Last modified | Wed, 09 Nov 2022 15:50:28 GMT |
| ETag | `746836824e520f8f0a7fb3987bdef0ff-462` |
| SHA-256 | `c481ae885b4827af68fbdb428e9fac8a824d6828aebfba492577ba39bf55e42e` (`sha256sum`, full file downloaded 2026-11-07; 3,868,256,546 bytes, equal to `Content-Length`) |
| Local copy | `pipeline/work/dem/MSL_Gale_DEM_Mosaic_1m_v3.tif` (git-ignored) |
| Team copy | `TODO(verify)`: Drive path, once Mishkat has uploaded it (Mishkat Ahmed Khan; not needed for the acceptance criteria) |

## `gdalinfo` summary

Read from the remote header, without downloading the file:

```bash
gdalinfo --config GDAL_DISABLE_READDIR_ON_OPEN EMPTY_DIR \
  /vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif
```

```text
Driver: GTiff/GeoTIFF
Size is 32980, 57440
PROJCRS["Mars_Equirectangular_clon0",
ELLIPSOID["Mars_2000_Sphere_IAU_IAG",3396190,0,
Origin = (8127993.492786023765802,-244781.075189438008238)
Pixel Size = (1.000000000000000,-1.000000000000000)
Band 1 Block=32980x1 Type=Float32, ColorInterp=Gray
  Min=-4625.875 Max=-322.560
  NoData Value=-32767
  AREA_OR_POINT=Point
  COMPRESSION=LZW
```

## Labels

Both are linked from the product page. Line numbers are from the downloaded files.

| Label | URL | Bytes | SHA-256 |
| --- | --- | --- | --- |
| PDS3 | `https://astrogeology.usgs.gov/ckan/dataset/b3d63877-8544-49bb-b0f3-532cf2c648d1/resource/cd140a94-1e66-46e0-8d5a-d8f0e4128b7e/download/msl_gale_dem_mosaic_1m_v3_pds3.lbl` | 2,188 | `52eaf7a3f5c03812e0e6f3d5305495a329cb64eea65e161b0a6204a8092a9a16` |
| ISIS | `https://astrogeology.usgs.gov/ckan/dataset/b3d63877-8544-49bb-b0f3-532cf2c648d1/resource/d1a8afb0-3a48-4dcb-92a8-6c5794bb662f/download/msl_gale_dem_mosaic_1m_v3.lbl` | 1,391 | `dd55ca3c5256ea7384c06b87279ce2ee8d08ce38cf69eda5dc57af3f11aae2cc` |

PDS3 label, verbatim:

```text
 9    LINES                        = 57440
10    LINE_SAMPLES                 = 32980
11    SAMPLE_BITS                  = 32
12    SAMPLE_TYPE                  = IEEE_REAL
18    A_AXIS_RADIUS                = 3396.19 <KILOMETERS>
19    B_AXIS_RADIUS                = 3396.19 <KILOMETERS>
20    C_AXIS_RADIUS                = 3396.19 <KILOMETERS>
23    POSITIVE_LONGITUDE_DIRECTION = EAST
35    MAXIMUM_LATITUDE             = -4.129604796265599 <DEGREES>
36    MINIMUM_LATITUDE             = -5.098652339315736 <DEGREES>
37    EASTERNMOST_LONGITUDE        = 137.68055905434537 <DEGREES>
38    WESTERNMOST_LONGITUDE        = 137.12416650612474 <DEGREES>
42    COORDINATE_SYSTEM_NAME       = PLANETOCENTRIC
43    PROJECTION_LATITUDE_TYPE     = PLANETOCENTRIC
```

The ISIS label agrees: `LatitudeType = Planetocentric` (line 25), `LongitudeDirection = PositiveEast` (line 26).

USGS product page, verbatim, accessed 2026-11-06:

> The DEM is built up from High Resolution Stereo Camera (HRSC), Mars Reconnaissance Orbiter (MRO) Context Camera (CTX), and High Resolution Imaging Science Experiment (HiRISE) DEMs all tied to a Mars Orbiter Laser Altimeter (MOLA) DEM.

## Still open

- Drive path of the team copy (Mishkat Ahmed Khan).

The full-file check of 2026-11-07, run on the downloaded file:

```text
$ stat -c %s pipeline/work/dem/MSL_Gale_DEM_Mosaic_1m_v3.tif
3868256546
$ sha256sum pipeline/work/dem/MSL_Gale_DEM_Mosaic_1m_v3.tif
c481ae885b4827af68fbdb428e9fac8a824d6828aebfba492577ba39bf55e42e  pipeline/work/dem/MSL_Gale_DEM_Mosaic_1m_v3.tif
$ gdalinfo pipeline/work/dem/MSL_Gale_DEM_Mosaic_1m_v3.tif
Size is 32980, 57440
            ELLIPSOID["Mars_2000_Sphere_IAU_IAG",3396190,0,
  NoData Value=-32767
```

`git status --short` shows no dataset file.
