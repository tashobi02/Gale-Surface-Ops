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
| Rover track in line of sight | **35–69 %**, by method | 89–94 %, by method |
| Distance to the rover track | 914 m | 82 m |
| Slope on the 50 m pad, largest 5 m p90 | 12.5° | 13.8° |
| Share of ground within about 100 m with p90 under 15° | 77 % | 79 % |

## Why this site

The data lead chose the first choice and alternative from the candidates below on 2026-11-07.

**First choice.** 06 §C.1 asks for a flat, passable site near the stops with ridges that cast interesting comm shadows. Ridges and knobs surround it, and only part of the track is in line of sight, so a crew walking the track moves in and out of comm shadow. That is what FR-42's warnings need.

**Alternative.** A smooth open plain next to the track, and the safer site. With most of the track in line of sight, comm shadows would rarely appear. Dark sand and small dunes lie just to its south-west.

**Trade-off.** No site is both properly flat and in good line of sight. Both sites pass the 15° hard-limit default in 05 MissionScenario, but neither meets the 10° caution default on the whole pad. Of 3,540 sites tested, none with a pad under 10° sees more than 17 % of the track.

## Method

The agent ran these tools on the data lead's request. The numbers are tool output; no position was typed by hand.

- **Slope:** `horn_slope_deg` and `aggregate_slope` from `pipeline/src/marswalk_pipeline/derive.py`, on the 1 m AOI window aggregated to 5 m. The window is in the DEM's own grid, whose scale differs from the working projection by about 0.4 %. T03.19's grid replaces these values.
- **Candidates:** sites every 100 m across the box.
- **Line of sight:** from a mast of `hab_mast_m` in `scenarios/storm-sol4190/param_sets/link-assumed.json` to a receiver of `antenna_m` in `suit-assumed.json`, over the 5 m elevation, with curvature drop d²/2R, to the 127 track points of sols 4,534–5,045. The check passed synthetic flat-plane and wall cases. It chose the candidates, and its 42 % and 92 % remain in the table below.
- **Line of sight, re-checked after T03.29** on the same 127 points:

  | Site | `comm_hab` (T03.29) | `gdal_viewshed`, curvature 1.0 | Agreement over the box |
  | --- | --- | --- | --- |
  | First choice | 34.6 % | 68.5 % | 98.8 % |
  | Alternative | 89.0 % | 93.7 % | 99.7 % |

  The methods agree across the box but differ along the track, where sight lines graze the slope. T03.30 checks this. Both still put the first choice in comm shadow for part of the track and the alternative for little of it.
- **Low-detail areas:** neither site lies within 50 m of an area kept in [dem-quality.md](dem-quality.md#patches).

## Candidates compared

| Site | `E, N` | Track in line of sight | Pad p90 | To track | Note |
| --- | --- | --- | --- | --- | --- |
| First choice | 8144199, −286764 | 42 % | 12.5° | 914 m | |
| Alternative | 8143599, −285764 | 92 % | 13.8° | 82 m | |
| Not chosen | 8143899, −286264 | 92 % | 13.8° | 334 m | Same line of sight as the alternative, farther from the track |
| Not chosen | 8144199, −283464 | 17 % | 8.2° | 1,128 m | Flattest, but sees little of the track and is within 50 m of a kept low-detail area |

## Second-person check

Assigned to Sadman Shaharier Mahim (product & systems lead) by the data lead on 2026-11-08. The check remains `TODO(verify)` until signed.

### Inputs to check

The positions and values are those in [Result](#result), without a new site assessment. The first choice is the start and mast in `pipeline/sites/gale_boxwork/site.json`; the alternative is for comparison. Review the source note's reasons and trade-off ([Why this site](#why-this-site)), particularly its difference between the 15° hard-limit default and the 10° caution default. A 50 m guide in a PNG is not a flatness measurement.

### Tool-made crops

All four PNGs are local, git-ignored artifacts in this shared directory:

```text
/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/pipeline/work/t03/
```

Each spans **600 m on every side of the documented site** (1200 × 1200 m at 1 m/px); raster row 0 is north. The cross marks the documented working-projection coordinate; the thin square is a 50 m pad-size guide, and the scale bar is 200 m. Sources were bilinearly resampled to the byte-identical `config.WORKING_PROJ` Mars grid. No source offset correction was applied. Hillshade azimuth/altitude: 315°/45°, from T01.03. These are review aids, not signed checks.

| Site | Hillshade PNG | Ortho PNG | Crop extent `[minx, miny, maxx, maxy]` (m) |
| --- | --- | --- | --- |
| First choice | `hab_first_hillshade_600m.png` | `hab_first_ortho_600m.png` | `[437, -2252, 1637, -1052]` |
| Alternative | `hab_alternative_hillshade_600m.png` | `hab_alternative_ortho_600m.png` | `[-161, -1252, 1039, -52]` |

Side-by-side preview: `hab_site_review_contact_sheet.png` in the same directory.

Image credits: DEM — USGS Astrogeology, Parker & Calef (2016), source `usgs-gale-dem-1m-v3`; colour ortho — NASA/JPL-Caltech/University of Arizona; USGS Astrogeology, Calef & Parker (2016), source `usgs-gale-ortho-25cm-v3`. The analytical crops and annotations are tool-made. The original rasters remain read-only.

### Second-person checklist

- [ ] **First-choice position:** locate `(1037, −1652)` in the Mars working projection on both hillshade and ortho; confirm the cross and the `site.json` start/mast refer to the intended place.
- [ ] **Alternative position:** locate `(439, −652)` on both layers; confirm the cross is at the documented alternative.
- [ ] **North and alignment:** check north is up and identify common terrain edges in both images. Record concerns about seams, smoothing or relative alignment below; use the provisional T03.20 offset note as context.
- [ ] **First-choice pad:** review the 50 m pad and its surroundings against the source note's 12.5° largest 5 m p90; confirm the stated passability/caution trade-off rather than inferring flatness from image brightness.
- [ ] **Alternative pad:** review the 50 m pad against the source note's 13.8° largest 5 m p90, and the note's dark sand/small dunes to the south-west. Record any disagreement for the data lead.
- [ ] **Track distance:** overlay the same rover-track source and sol range used in `hab-site.md`; check the source note's 914 m first-choice and 82 m alternative distances. The track is not drawn on these crops; the source note, not the crops, supplies those distances.
- [ ] **Comm-shadow reason:** review the ridges/knobs around the first choice and the open alternative against `hab-site.md`. Confirm the documented reason for the choice and acknowledge its 35–69 % versus 89–94 % line-of-sight method ranges. A hillshade image alone does not verify radio coverage.
- [ ] **Outcome:** record agreement or corrections below and return to Obidit. Keep `TODO(verify)` open until a second person signs; refer changes in site choice or assumptions to the data lead.

Observations / disagreements: ____

GIS layers, track version / sol range and tools used: ____

Outcome / corrections for Obidit: ____

Checked by: ____ date ____

## Still open

- **Second person's check on the hillshade** (T01.07 Verify): assigned to Sadman Shaharier Mahim; `TODO(verify)` until signed.
- The default start and `hab_mast` values go into `site.json` at T03.16.
