# AOI bounds (T01.02)

| | |
| --- | --- |
| **Owner** | Obidit Islam, R1 Data & GIS ([T01.02](../../tasks/TASK-01_feasibility.md#t0102--propose-aoi-bounds-from-curiositys-2025-traverse-inside-the-dem-extent)) |
| **Date** | 2026-11-06 |
| **Status** | Proposed: frozen by T01.05 |
| **Related** | [02 §C.1](../../specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer) · [02 §C.2](../../specs/02_Technical_Requirements_Document.md#c2-data-layers) · [05 Site](../../specs/05_Backend_and_Database_Schema.md#site) · [05 RoutingGrid](../../specs/05_Backend_and_Database_Schema.md#routinggrid) · [Feasibility check](../feasibility.md#aoi-bounds-u-01-context-02-c2) |

## Result

| Field | Value | Label |
| --- | --- | --- |
| AOI centre (lat, lon °E) | −4.81, 137.38 | Tool output from the data lead's rule, below |
| Working projection | `+proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs` | Fills the 02 §C.1 template; copy byte for byte |
| `extent_m` `[minx, miny, maxx, maxy]` | `[-3000, -3000, 3000, 3000]` | 6 × 6 km proposed by 02 §C.2, around the origin at the centre |
| `bbox_geo` `[min_lon_e, min_lat, max_lon_e, max_lat]` | `[137.329209, -4.860612, 137.430791, -4.759388]` | `invproj` output |
| DEM extent (02 §C.2) | lat −5.098652…−4.129605, lon 137.124167…137.680559 °E | Spec value; `bbox_geo` lies inside it |
| Routing grid at 5 m | 1200 × 1200 = 1,440,000 cells, within the `width*height ≤ 4e6` limit | Computed |

## How the centre was chosen

The data lead chose this rule on 2026-11-06: centre on the midpoint of the rover's lat/lon range over **sols 4,534–5,045**, rounded to **two decimals**. The agent ran the tools and did not choose the position. Two decimals resolves the `TODO(decision)` in T01.02 and matches the 05 §F.1 example.

| Input | Value |
| --- | --- |
| Points in range | 127, first sol 4534, last sol 5045 |
| Latitude range | −4.82513971 … −4.79761763 |
| Longitude range | 137.3791167 … 137.3888471 °E |
| Midpoint before rounding | −4.81137867, 137.3839819 |

### Traverse source

| Field | Value |
| --- | --- |
| File | NASA MMGIS waypoints, `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` ([data-downloads D6](../data-downloads.md#b2-mission-vectors-and-ground-images-tier-0)); not an official API |
| Accessed | 2026-11-06 |
| Size, SHA-256 | 663,670 bytes, `4ac951bed4b6bf0b0de01f44a2675c6c083ca81c19361738096b4fcba0240a52` |
| Coverage | Sols 3–5045, 1,386 points |
| Use here | View only. T04.01 chooses and caches the traverse source; this file was not added to the repo |
| Cross-check | The PDS MSL Analyst's Notebook table reads `8144790.67, -283479.07` at sol 4148; the file reads `8144790.667, -283479.069`. `invproj` with `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs` gives `137.407545, -4.782463`, equal to the file's own lat/lon |

The file does not state its latitude convention. Its lat/lon lie on the same 3,396,190 m sphere as the DEM, which is what 02 §C.1 requires.

### Sols covered

| Stretch | x range (m) | y range (m) | Inside `extent_m` |
| --- | --- | --- | --- |
| 4,534–5,045, whole campaign to the latest position | −52…523 | −897…734 | yes |
| 4,450–4,750, the range in 02 §C.2 | −52…775 | 76…1,368 | yes |
| 4,534–4,805, NASA blog phases 1–3 | −52…380 | 76…734 | yes |

**For T16.02:** 02 §C.2 gives the campaign as sols ≈ 4,450–4,750. NASA's mission blog puts it at about sol 4,534 onward, with phase 3 ending at sol 4,805 and a final phase starting at about sols 4,804–4,811. Reading depth: search-result summaries of [the sols 4804–4811 post](https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration/) and [the sols 4541–4542 post](https://science.nasa.gov/blog/sols-4541-4542-boxwork-structure-or-just-box-like-structure/); pages not opened, so **unverified**. The final phase's end is `TODO(verify)`. A [JPL caption](https://www.jpl.nasa.gov/images/pia26559-curiositys-first-360-degree-view-of-boxwork-patterns/) gives sols 4,451 and 4,454 for images dated May 2025, which disagrees with the blog's numbering.

## Commands

`proj` and `invproj` are in the pipeline environment, which answers the `TODO(verify)` in T01.02's Verify line. Run them from the environment's `bin/` folder, for example `"$(dirname "$(make -s pipeline-python)")/invproj"`.

Corners and centre, metres to degrees:

```bash
printf '%s\n' '-3000 -3000' '3000 -3000' '3000 3000' '-3000 3000' '0 0' \
  | invproj -f '%.6f' +proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs
```

```text
137.329209 -4.860612
137.430791 -4.860612
137.430791 -4.759388
137.329209 -4.759388
137.380000 -4.810000
```

Round trip, degrees to metres:

```bash
printf '%s\n' '137.329209 -4.860612' '137.430791 -4.860612' '137.430791 -4.759388' '137.329209 -4.759388' '137.380000 -4.810000' \
  | proj -f '%.3f' +proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs
```

```text
-3000.018 -3000.011
3000.018 -3000.011
3000.018 3000.011
-3000.018 3000.011
0.000 0.000
```

The 0.02 m differences come from rounding `bbox_geo` to six decimals. `bbox_geo` keeps six decimals so it stays reproducible with these commands.

## Still open

- DEM quality in this box is not judged yet (T01.03). The AOI may still move before T01.05 freezes it.
- The hab site (T01.07) must lie inside this box.
