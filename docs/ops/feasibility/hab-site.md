# Hab site (T01.07)

| | |
| --- | --- |
| **Owner** | Obidit Islam, R1 Data & GIS ([T01.07](../../tasks/TASK-01_feasibility.md#t0107--choose-the-hab-site-inside-the-aoi-v2)) |
| **Date** | 2026-11-07 |
| **Status** | Chosen by the data lead; a second person's check on the hillshade is still to do |
| **Related** | [AOI bounds](aoi.md) · [DEM quality](dem-quality.md) · [01 FR-39](../../specs/01_Product_Requirements_Document.md#fr-39--time-to-safe-haven-t0t1-m) · [01 FR-42](../../specs/01_Product_Requirements_Document.md#fr-42--comm-coverage-and-comm-shadows-t1-m) · [01 FR-45](../../specs/01_Product_Requirements_Document.md#fr-45--exploration-zone-layer-t0-m) |

## Result

| | First choice | Alternative |
| --- | --- | --- |
| Working-projection `x_m, y_m` (nearest metre) | 1037, −1652 | 439, −652 |
| Lat, lon °E | −4.83787, 137.39756 | −4.82100, 137.38744 |
| Source `E, N` | 8144199, −286764 | 8143599, −285764 |
| Elevation | −3323 m | −3515 m |
| Rover track in line of sight | **42 %** | 92 % |
| Distance to the rover track | 914 m | 82 m |
| Slope on the 50 m pad, largest 5 m p90 | 12.5° | 13.8° |
| Share of ground within about 100 m with p90 under 15° | 77 % | 79 % |

## Why this site

The data lead chose the first choice and alternative from the candidates below on 2026-11-07.

**First choice.** 06 §C.1 asks for a flat, passable site near the stops with ridges that cast interesting comm shadows. Ridges and knobs surround it, and 42 % of the track is in line of sight, so a crew walking the track moves in and out of comm shadow. That is what FR-42's warnings need.

**Alternative.** A smooth open plain next to the track, and the safer site. At 92 % line of sight, comm shadows would rarely appear. Dark sand and small dunes lie just to its south-west.

**Trade-off.** No site is both properly flat and in good line of sight. Both sites pass the 15° hard-limit default in 05 MissionScenario, but neither meets the 10° caution default on the whole pad. Of 3,540 sites tested, none with a pad under 10° sees more than 17 % of the track.

## Method

The agent ran these tools on the data lead's request. The numbers are tool output; no position was typed by hand.

- **Slope:** `horn_slope_deg` and `aggregate_slope` from `pipeline/src/marswalk_pipeline/derive.py`, on the 1 m AOI window aggregated to 5 m. The window is in the DEM's own grid, whose scale differs from the working projection by about 0.4 %. T03.19's grid replaces these values.
- **Candidates:** sites every 100 m across the box.
- **Line of sight:** from a mast of `hab_mast_m` in `scenarios/storm-sol4190/param_sets/link-assumed.json` to a receiver of `antenna_m` in `suit-assumed.json`, over the 5 m elevation, with curvature drop d²/2R, to the 127 track points of sols 4,534–5,045. The check passed synthetic flat-plane and wall cases. It is a quick check, not the `comm_hab` grid: T03.29 and T03.30 produce and verify that.
- **Low-detail areas:** neither site lies within 50 m of an area kept in [dem-quality.md](dem-quality.md#patches).

## Candidates compared

| Site | `E, N` | Track in line of sight | Pad p90 | To track | Note |
| --- | --- | --- | --- | --- | --- |
| First choice | 8144199, −286764 | 42 % | 12.5° | 914 m | |
| Alternative | 8143599, −285764 | 92 % | 13.8° | 82 m | |
| Not chosen | 8143899, −286264 | 92 % | 13.8° | 334 m | Same line of sight as the alternative, farther from the track |
| Not chosen | 8144199, −283464 | 17 % | 8.2° | 1,128 m | Flattest, but sees little of the track and is within 50 m of a kept low-detail area |

## Still open

- **Second person's check on the hillshade** (T01.07 Verify): `TODO(verify)`.
- The default start and `hab_mast` values go into `site.json` at T03.16.
