# Backend full-run plan — marker index

| | |
| --- | --- |
| **Owner** | Orchestrator (Claude), under the authority of Sadman Shaharier Mahim |
| **Date** | 2026-11-12 |
| **Status** | Generated on 2026-11-12 from `core-backend` (= `main` at `ad75b32`) by a scan for `TODO(decision)` and `TODO(verify)` |
| **Related** | [decisions.md](decisions.md) · [30-todo-sweep-and-close.md](30-todo-sweep-and-close.md) |

Scope scanned: the backend task files (TASK-01, 03, 04, 05, 05b, 06, 14, 20–23, 26–29, 31, 32) and every file under `apps/hab-core/{src,tests,scripts}`, `packages/{compute,protocol}/{src,tests}`, `pipeline/{src,tests,sites,spice,cache}`, `scenarios/`, `schemas/` and `data/sites/`. Each marker is mapped to the decision that resolves it. Package 30 resolves every row (line numbers drift as packages edit files; find a row by file and excerpt). The mapping was made by keyword rules over file and excerpt; package 30 re-reads each row in context and corrects any row whose decision id does not fit (no row may end without a decision). BD-04 rows are historical or instructional markers, rewritten without the marker.

Total markers: **515**. Per decision: BD-00 5, BD-01 3, BD-03 2, BD-04 73, BD-05 20, BD-11 7, BD-12 1, BD-13 45, BD-14 3, BD-15 2, BD-17 22, BD-18 5, BD-19 12, BD-20 1, BD-21 3, BD-22 17, BD-23 1, BD-24 11, BD-25 5, BD-26 2, BD-29 1, BD-30 7, BD-31 6, BD-32 2, BD-33 2, BD-40 2, BD-41 1, BD-42 1, BD-43 2, BD-44 1, BD-45 2, BD-46 5, BD-47 1, BD-48 2, BD-49 15, BD-50 16, BD-51 2, BD-52 2, BD-53 2, BD-54 4, BD-55 16, BD-56 17, BD-57 17, BD-58 22, BD-59 29, BD-60 3, BD-61 3, BD-63 1, BD-64 2, BD-70 2, BD-71 16, BD-72 4, BD-73 1, BD-74 1, BD-75 1, BD-76 4, BD-78 2, BD-79 12, BD-80 1, BD-83 7, BD-90 1, BD-92 2, BD-93 5, BD-95 4, BD-97 1, BD-98 2, BD-99 1, BD-100 2, BD-101 1, BD-102 7, BD-107 2, BD-108 1, BD-109 2, BD-110 6, BD-111 1.

| # | File | Line | Kind | Excerpt | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | `docs/tasks/TASK-01_feasibility.md` | 55 | verify | `gnored, 05 §B). Record the exact file URL as read from the page (TODO(verify) until then) and the access date.` | BD-04 |
| 2 | `docs/tasks/TASK-01_feasibility.md` | 70 | verify | `feasibility/dem-label.md from pasted label text, quoting verbatim and leaving anything unread as TODO(verify).` | BD-04 |
| 3 | `docs/tasks/TASK-01_feasibility.md` | 87 | decision | `ojection template with that centre and record the exact string once; the number of decimals is TODO(decision).` | BD-11 |
| 4 | `docs/tasks/TASK-01_feasibility.md` | 98 | verify | `/ invproj -f "%.6f" ‹working proj string› for each corner (proj in the pipeline environment is TODO(verify)).` | BD-04 |
| 5 | `docs/tasks/TASK-01_feasibility.md` | 130 | verify | `ygons›.geojson on polygons drawn in the working projection (exact syntax TODO(verify)), or the QGIS area tool.` | BD-04 |
| 6 | `docs/tasks/TASK-01_feasibility.md` | 148 | verify | `the CRISM MTRDR bundle (02 §C.2 L5). Never guess a URL; if one is not found, write TODO(verify) and continue.` | BD-71 |
| 7 | `docs/tasks/TASK-01_feasibility.md` | 150 | verify | `vations whose footprints intersect the AOI, using the index the bundle readme describes (method TODO(verify)).` | BD-04 |
| 8 | `docs/tasks/TASK-01_feasibility.md` | 154 | verify | `ts has a result — covered, partial, not covered, or TODO(verify) with the reason — so T01.05 is never blocked.` | BD-04 |
| 9 | `docs/tasks/TASK-01_feasibility.md` | 160 | verify | `ct›_aoi.tif; gdalinfo -stats pipeline/work/‹product›_aoi.tif (valid-pixel share in recent GDAL, TODO(verify)).` | BD-04 |
| 10 | `docs/tasks/TASK-01_feasibility.md` | 162 | verify | `ps/feasibility/coverage.md plus one section in docs/ops/verification-log.md. Unknown URLs become TODO(verify).` | BD-04 |
| 11 | `docs/tasks/TASK-01_feasibility.md` | 177 | verify | `Confirm T01.01–T01.04 are merged and every row of their notes is filled or marked TODO(verify) with a reason.` | BD-04 |
| 12 | `docs/tasks/TASK-01_feasibility.md` | 180 | decision | `e and evidence links in ADR-001; the status word is TODO(decision), since the ADRs use only "Proposed" so far.` | BD-11 |
| 13 | `docs/tasks/TASK-01_feasibility.md` | 209 | verify | `(extent, AOI, ortho, TI tile, traverse, rover images) TODO(verify) until re-checked. Change no requirement id.` | BD-102 |
| 14 | `docs/tasks/TASK-01_feasibility.md` | 210 | decision | `estion: FR-12 and A-06 rely on the Gale RAD rate, so this is a TODO(decision) for the team, not resolved here.` | BD-11 |
| 15 | `docs/tasks/TASK-01_feasibility.md` | 215 | verify | `specific text; requirement ids and priorities are unchanged; every new fact cites a source or is TODO(verify).` | BD-04 |
| 16 | `docs/tasks/TASK-01_feasibility.md` | 216 | decision | `- The FR-12 / A-06 consequence is recorded as TODO(decision) and not resolved.` | BD-04 |
| 17 | `docs/tasks/TASK-01_feasibility.md` | 222 | verify | `- Manual: each changed spec line has a source or a TODO(verify).` | BD-04 |
| 18 | `docs/tasks/TASK-01_feasibility.md` | 223 | verify | `Curiosity, boxwork, RAD), draft the spec-change with TODO(verify) markers and draft the coord: PR for review.` | BD-04 |
| 19 | `docs/tasks/TASK-01_feasibility.md` | 273 | decision | `key risk). T01.03 proposes a tool-computed area of hand-drawn polygons — TODO(decision) whether that suffices.` | BD-04 |
| 20 | `docs/tasks/TASK-01_feasibility.md` | 274 | verify | `ple tile 30S060E; the AOI tile (pattern 30S120E, 02 §C.2 L4) has no URL in the specs — TODO(verify) in T01.04.` | BD-71 |
| 21 | `docs/tasks/TASK-01_feasibility.md` | 275 | verify | `3. CRISM coverage method. U-05 has no stated query method for MTRDR footprints — TODO(verify) in T01.04.` | BD-04 |
| 22 | `docs/tasks/TASK-01_feasibility.md` | 276 | decision | `ve "same crater"), and FR-04 and FR-17 name Curiosity data — TODO(decision), recorded by T01.06, not resolved.` | BD-11 |
| 23 | `docs/tasks/TASK-01_feasibility.md` | 278 | decision | `. ADR status word. Every ADR says "Proposed"; no term is defined for a decided ADR — TODO(decision) in T01.05.` | BD-11 |
| 24 | `docs/tasks/TASK-01_feasibility.md` | 279 | decision | `ec fixes how many decimals the AOI centre gets (05 §F.1 shows two, illustratively) — TODO(decision) in T01.02.` | BD-11 |
| 25 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 70 | decision | `ult, Leg and Warning fields (the existing TODO(decision)), including whether conditions, radiation and stops_t` | BD-50 |
| 26 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 70 | decision | `(map open point 3). Keep it a visible TODO(decision) until the data lead signs off, and list the 05 wording it` | BD-50 |
| 27 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 71 | decision | `scenario, classes); record U-11 (store profile arrays in the export; 05 recommends storing) as TODO(decision).` | BD-64 |
| 28 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 73 | decision | `that no defensible threshold exists); record the layer ids (TODO(decision); 05 §F.1 uses slope and elevation).` | BD-04 |
| 29 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 81 | decision | `- Every decision the map lists for C1–C5 is either recorded or left as a visible TODO(decision).` | BD-04 |
| 30 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 84 | decision | `s/README.md; move the hazard_flags stub into flags.py. Invent no fields; leave open choices as TODO(decision).` | BD-04 |
| 31 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 132 | decision | `est skips cleanly where GDAL, rasterio or pyproj are missing (TODO(decision) with T14.01, see Spec questions).` | BD-32 |
| 32 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 155 | decision | `ion (uniform blocks; one block with a single steep pixel); the percentile method is TODO(decision) for T03.09.` | BD-19 |
| 33 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 230 | decision | `onstants so T03.23 can drop the finest level in one place (TODO(decision) if C9 keeps them per layer instead).` | BD-22 |
| 34 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 257 | verify | `§C.4.4); if the file declares none, use the PDS3-label value recorded by T01.01 (TODO(verify) which applies).` | BD-19 |
| 35 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 282 | decision | `d cell constant, never a literal 5 (C4); record the percentile method chosen for the TODO(decision) in T03.04.` | BD-19 |
| 36 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 328 | decision | `ngGrid); slopes beyond the encodable range follow the decision recorded here (TODO(decision), Spec questions).` | BD-19 |
| 37 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 353 | verify | `olutions, tile size, addressing and y direction of C9 (TODO(verify) until T02.04 confirms them on real tiles).` | BD-22 |
| 38 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 357 | decision | `te the tiles-root index file whose SHA-256 the manifest stores (05 Asset); its format is TODO(decision) in C9.` | BD-22 |
| 39 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 364 | verify | `ndex file). Formats from 02 §C.3; missing data transparent. Leave anything C9 has not settled as TODO(verify).` | BD-22 |
| 40 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 366 | decision | `les is an inference from that scope, TODO(decision) for the data lead to confirm; routing-grid slope data is u` | BD-17 |
| 41 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 366 | verify | `on alone does not exclude slope tiles. TODO(verify): T02.04 must still check tile addressing, alignment and hi` | BD-22 |
| 42 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 410 | decision | `cells — impassable as in 02 §D.2, with the slope limit used for this check a TODO(decision) (Spec questions).` | BD-21 |
| 43 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 444 | decision | `- Open v1 scope implementation: TODO(decision): Obidit Islam (T03.12/T03.15) must confirm the inferred ex` | BD-17 |
| 44 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 483 | verify | `ate. The THEMIS tile page and any field 02 lacks stay TODO(verify) until T01.04's coverage note supplies them.` | BD-13 |
| 45 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 485 | decision | `§C TASK-03 (ortho 0.5 m; hillshade, slope, elevation, TI 2 m); the hazard-flags resolution is TODO(decision).` | BD-17 |
| 46 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 490 | verify | `- No value comes from memory: each cites 02, 05 or the coverage note, or is TODO(verify).` | BD-13 |
| 47 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 492 | verify | `work/, copying values from 05 §F.1 and 02 §C.2. Unknown fields stay TODO(verify); never fill them from memory.` | BD-17 |
| 48 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 553 | decision | `essages); solar-minimum source_id is TODO(decision) and matches no DataSource (one message). JSON Schema valid` | BD-30 |
| 49 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 591 | verify | `f establish a tile-alignment failure. TODO(verify), T02.04 / T03.12: Saba Atharique and Obidit Islam should ch` | BD-04 |
| 50 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 597 | verify | `the AOI window (nearest-neighbour sample); TODO(verify): valid-mask black RGB pixels. Open viewer clip: Saba A` | BD-18 |
| 51 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 597 | verify | `ot displayed; her files are unchanged. TODO(verify): coarse pixels can straddle the AOI edge and JPEG compress` | BD-18 |
| 52 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 598 | decision | `- TODO(decision) spec-change: 02 §C.2 L1 requires transparent missing data` | BD-18 |
| 53 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 599 | verify | `- Upstream mask follow-up: TODO(verify): Obidit Islam (T03.08) must check mask and no-data preserv` | BD-18 |
| 54 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 600 | decision | `iles is an inference from that scope, TODO(decision) for the data lead to confirm; routing-grid data remains.` | BD-17 |
| 55 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 600 | verify | `lone does not implement this v1 scope. TODO(verify): check the hillshade encoding and real-tile alignment unde` | BD-17 |
| 56 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 604 | verify | `D metadata and access-date checks stay TODO(verify); the complete bundle still needs validator and SCR-09 chec` | BD-13 |
| 57 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 606 | verify | `and-layer-records) for the cache check, field layout and remaining TODO(verify) metadata. T12.05 remains done.` | BD-30 |
| 58 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 813 | verify | `e every asset SHA-256 with the committed manifest; explain any difference (TODO(verify): encoder determinism).` | BD-33 |
| 59 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 908 | verify | `download, 02 §C.2 L1) or cached Mars Trek HiRISE tiles (product endpoint from GetCapabilities, TODO(verify)).` | BD-04 |
| 60 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 915 | verify | `es to it and write the DataSource record, copying fields from 02 §C.2 L1; unknown endpoints stay TODO(verify).` | BD-04 |
| 61 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1020 | decision | `fers the 05 §F.1 example ids for every candidate, leave it as TODO(decision) and list it under Spec questions.` | BD-04 |
| 62 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1050 | verify | `nflict notes: New file. The second-person check of hab-site.md (TODO(verify)) still applies to both positions.` | BD-00 |
| 63 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1137 | verify | `3. Remove the provisional-layout TODO(verify) notes in the generator that C9 v1.1 §3.2 now answers (top-` | BD-22 |
| 64 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1138 | decision | `hat key so a regenerated manifest still validates (map open point 11 keeps candidates in F4 a TODO(decision)).` | BD-31 |
| 65 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1162 | decision | `data lead, 2026-11-11, by this subtask) and drop its TODO(decision); update every link to the renamed heading.` | BD-04 |
| 66 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1163 | decision | `4. manifest.py: replace the TODO(decision) comment with the decision reference; no code change.` | BD-04 |
| 67 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1232 | decision | `ith their decisions recorded or left as visible TODO(decision); fixtures F4 and F5 have their README sections.` | BD-04 |
| 68 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1237 | decision | `pytest.importorskip; whether CI should install the geo stack instead is TODO(decision) for T14.01 and T14.02.` | BD-32 |
| 69 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1243 | decision | `codes 0–63.5° in u8 with 255 = no data; behaviour for steeper cells is unspecified — TODO(decision) at T03.11.` | BD-19 |
| 70 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1244 | decision | `he hard slope limit is a user input (02 §E.3); which limit validate-manifest uses is TODO(decision) at T03.14.` | BD-21 |
| 71 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1245 | decision | `s tiles roots store the hash of an index file, but no index format is defined — TODO(decision) in C9 / T03.12.` | BD-22 |
| 72 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1247 | verify | `(06 §D.3) assumes deterministic encoders and pinned GDAL/rasterio versions (05 §E.5) — TODO(verify) in T03.22.` | BD-33 |
| 73 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1248 | decision | `SK-03 names display resolutions only for ortho, hillshade, slope, elevation and TI — TODO(decision) at T03.17.` | BD-17 |
| 74 | `docs/tasks/TASK-03_preprocessing-pipeline.md` | 1250 | verify | `ves examples only; T03.08 uses the file's declared value or T01.01's label value — TODO(verify) which applies.` | BD-19 |
| 75 | `docs/tasks/TASK-04_vectors-pois-images.md` | 59 | verify | `ments, version, url, credit, licence, accessed) copied from the source page; unknown values stay TODO(verify).` | BD-13 |
| 76 | `docs/tasks/TASK-04_vectors-pois-images.md` | 60 | decision | `-traverse used in 05 §F.1. Legend and resolution fields follow C2 and C5 (TODO(decision), see Spec questions).` | BD-17 |
| 77 | `docs/tasks/TASK-04_vectors-pois-images.md` | 70 | verify | `. Publisher, credit and licence remain TODO(verify) until the PDS label is read; the 02 DOI was not found in t` | BD-13 |
| 78 | `docs/tasks/TASK-04_vectors-pois-images.md` | 71 | decision | `on values mean not applicable under C5; the 05 vector-field question remains TODO(decision) (Spec question 5).` | BD-30 |
| 79 | `docs/tasks/TASK-04_vectors-pois-images.md` | 78 | decision | `- TODO(decision) spec-change: 02's U-04 row still calls the source Propose` | BD-30 |
| 80 | `docs/tasks/TASK-04_vectors-pois-images.md` | 150 | decision | `n (02 §C.2 L6), including "Boxwork ridge" (01 §E step 3). Ids other than poi-boxwork-ridge are TODO(decision).` | BD-14 |
| 81 | `docs/tasks/TASK-04_vectors-pois-images.md` | 152 | decision | `d as pipeline/work/images/‹poi_id›.jpg (git-ignored; TODO(decision) on this staging path, see Spec questions).` | BD-14 |
| 82 | `docs/tasks/TASK-04_vectors-pois-images.md` | 179 | decision | `1. Choose one to four further POIs so the site has 5–8 (01 FR-04); ids are TODO(decision).` | BD-14 |
| 83 | `docs/tasks/TASK-04_vectors-pois-images.md` | 207 | verify | `4. Mark anything not yet known (for example the THEMIS file name) TODO(verify).` | BD-13 |
| 84 | `docs/tasks/TASK-04_vectors-pois-images.md` | 214 | verify | `rated POI and source records. Copy credit strings exactly; mark unknowns TODO(verify). The story lead reviews.` | BD-13 |
| 85 | `docs/tasks/TASK-04_vectors-pois-images.md` | 230 | verify | `ook up the published interpretation of low thermal inertia as loose fines and cite it (TODO(verify): sources).` | BD-04 |
| 86 | `docs/tasks/TASK-04_vectors-pois-images.md` | 235 | decision | `- TODO(decision) spec-change (owner: T16.02): the U-03 row in [02 Unresolv` | BD-04 |
| 87 | `docs/tasks/TASK-04_vectors-pois-images.md` | 283 | verify | `MSL MMGIS JSON path, which 02 §C.2 L6 marks unverified (TODO(verify)), and fetch it once into pipeline/work/.` | BD-30 |
| 88 | `docs/tasks/TASK-04_vectors-pois-images.md` | 284 | decision | `erse.json at it, labelling the source unofficial in the layer limitations text (exact wording TODO(decision)).` | BD-30 |
| 89 | `docs/tasks/TASK-04_vectors-pois-images.md` | 308 | verify | `Exploration Zone framing for Gale (one paragraph) with its citation (U-16), or TODO(verify) if none is found.` | BD-29 |
| 90 | `docs/tasks/TASK-04_vectors-pois-images.md` | 371 | decision | `oximate look direction if known", but 05 §C POI has no field for it — TODO(decision): add it to 05 or drop it.` | BD-15 |
| 91 | `docs/tasks/TASK-04_vectors-pois-images.md` | 372 | decision | `asset_id for every layer, but the traverse and POI layers are vectors — TODO(decision) at C2 and C5 (T03.01).` | BD-22 |
| 92 | `docs/tasks/TASK-04_vectors-pois-images.md` | 375 | verify | `8. MMGIS path: 02 §C.2 L6 says the MSL path is unverified — TODO(verify) in T04.09.` | BD-30 |
| 93 | `docs/tasks/TASK-04_vectors-pois-images.md` | 378 | decision | `ists pipeline/work/ for downloads) — TODO(decision) with T03.19. How team laptops share them depends on bundle` | BD-04 |
| 94 | `docs/tasks/TASK-04_vectors-pois-images.md` | 379 | decision | `position_uncertainty_m but gives no method — TODO(decision); each curator states the basis in position_source.` | BD-15 |
| 95 | `docs/tasks/TASK-05_compute-core.md` | 63 | decision | `2. Record the C6 decisions as TODO(decision) in protocol.ts, each with its options: how the worker re` | BD-04 |
| 96 | `docs/tasks/TASK-05_compute-core.md` | 65 | decision | `4. Record the C7 decisions as TODO(decision): projection maths in the worker (proj4 or hand-written eqc` | BD-45 |
| 97 | `docs/tasks/TASK-05_compute-core.md` | 72 | decision | `- Every open choice is a TODO(decision) that names its options; none is resolved without the lane` | BD-04 |
| 98 | `docs/tasks/TASK-05_compute-core.md` | 73 | decision | `Verify: make typecheck test; git grep -n "TODO(decision)" packages/compute/src/ lists the C6 and C7 decisions.` | BD-04 |
| 99 | `docs/tasks/TASK-05_compute-core.md` | 74 | decision | `no logic), and record the open C6/C7 choices as TODO(decision) with their options. Signatures must typecheck.` | BD-00 |
| 100 | `docs/tasks/TASK-05_compute-core.md` | 242 | decision | `BY_HAZARD, DISCONNECTED_BY_NODATA; nearest_reachable"; mixed-barrier cases wait for the T05.19 TODO(decision).` | BD-46 |
| 101 | `docs/tasks/TASK-05_compute-core.md` | 263 | decision | `rio's current hard limit; equal-distance candidates resolve deterministically (TODO(decision): by cell index).` | BD-04 |
| 102 | `docs/tasks/TASK-05_compute-core.md` | 365 | decision | `§E.6, 02 §E.2 and 03 §E.4. Severities follow 04 §C.1; leave TODO(decision) where the spec does not map a code.` | BD-49 |
| 103 | `docs/tasks/TASK-05_compute-core.md` | 383 | decision | `range, so the UI can show it inline (FR-05); limits are inclusive per the TODO(decision) in spec question 12.` | BD-52 |
| 104 | `docs/tasks/TASK-05_compute-core.md` | 407 | decision | `er-run computed_utc and timing_ms (05 §D separates the run from the result; TODO(decision), spec question 13).` | BD-51 |
| 105 | `docs/tasks/TASK-05_compute-core.md` | 428 | verify | `taView, or confirm little-endian hosts — TODO(verify)); check each array against width × height and the TI sid` | BD-53 |
| 106 | `docs/tasks/TASK-05_compute-core.md` | 452 | decision | `D_HAZARD, SLOPE_OVER_LIMIT with null values where 02 §D.1 says so (precedence between reasons TODO(decision)).` | BD-46 |
| 107 | `docs/tasks/TASK-05_compute-core.md` | 463 | decision | `- Follow-up (2026-11-11): TODO(decision): sampleProfile appends a sample at the exact leg end when` | BD-05 |
| 108 | `docs/tasks/TASK-05_compute-core.md` | 478 | decision | `) as named constants — the case where both apply, and which cell decides, is TODO(decision) (spec question 7).` | BD-47 |
| 109 | `docs/tasks/TASK-05_compute-core.md` | 489 | decision | `llow-up (2026-11-09 reconciliation): TODO(decision): Choose event-loop yielding or shared abort signalling for` | BD-59 |
| 110 | `docs/tasks/TASK-05_compute-core.md` | 504 | decision | `ONNECTED_BY_HAZARD or DISCONNECTED_BY_NODATA; the rule for mixed barriers is TODO(decision) (spec question 8).` | BD-46 |
| 111 | `docs/tasks/TASK-05_compute-core.md` | 512 | decision | `noRoute.test.ts passes. Leave the mixed-barrier rule as a TODO(decision) unless the lane owner has decided it.` | BD-46 |
| 112 | `docs/tasks/TASK-05_compute-core.md` | 550 | decision | `m, max_slope_deg, cell_path_length (definitions where 02 and 05 are silent: TODO(decision), spec question 10).` | BD-04 |
| 113 | `docs/tasks/TASK-05_compute-core.md` | 619 | decision | `W_RES_DEM and DARKNESS severities and how darkness is judged along a leg are TODO(decision) (spec question 9).` | BD-49 |
| 114 | `docs/tasks/TASK-05_compute-core.md` | 627 | decision | `and 03 §E.4 until packages/compute/tests/warnings.test.ts passes. Keep undecided severities as TODO(decision).` | BD-49 |
| 115 | `docs/tasks/TASK-05_compute-core.md` | 630 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): Confirm LOW_RES_DEM warning severity before emitting bit-4` | BD-49 |
| 116 | `docs/tasks/TASK-05_compute-core.md` | 631 | decision | `llow-up (2026-11-09 reconciliation): TODO(decision): Define NO_DATA_ADJACENT neighbourhood, distance, severity` | BD-49 |
| 117 | `docs/tasks/TASK-05_compute-core.md` | 704 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): C6 owners must choose worker grid delivery and initializat` | BD-40 |
| 118 | `docs/tasks/TASK-05_compute-core.md` | 705 | decision | `llow-up (2026-11-09 reconciliation): TODO(decision): Choose event-loop yielding or shared abort signalling for` | BD-59 |
| 119 | `docs/tasks/TASK-05_compute-core.md` | 720 | decision | `xact at the routing-grid cell, slope within ±0.1° (which raster F5 reads is TODO(decision), spec question 11).` | BD-54 |
| 120 | `docs/tasks/TASK-05_compute-core.md` | 731 | verify | `ollow-up (2026-11-09 reconciliation): TODO(verify): Obtain the gale_boxwork bundle and ten independent F5 cell` | BD-54 |
| 121 | `docs/tasks/TASK-05_compute-core.md` | 755 | verify | `ollow-up (2026-11-09 reconciliation): TODO(verify): Locate the run cited by ADR-002. TODO(decision): The compu` | BD-04 |
| 122 | `docs/tasks/TASK-05_compute-core.md` | 755 | decision | `): Locate the run cited by ADR-002. TODO(decision): The compute lead must review the reconciled real-grid evid` | BD-00 |
| 123 | `docs/tasks/TASK-05_compute-core.md` | 795 | decision | `and impassable rule (02 §A.3); whether /estimate is needed or estimates stay in the worker is TODO(decision).` | BD-05 |
| 124 | `docs/tasks/TASK-05_compute-core.md` | 797 | verify | `to localhost only; put the start command and Python requirements in server/ (TODO(verify) the exact command).` | BD-01 |
| 125 | `docs/tasks/TASK-05_compute-core.md` | 805 | verify | `oml (T14.01). A CSP of default-src 'self' may block a server on another port (TODO(verify), spec question 16).` | BD-01 |
| 126 | `docs/tasks/TASK-05_compute-core.md` | 831 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): Complete C8 assembly into PlanResult after deciding the si` | BD-50 |
| 127 | `docs/tasks/TASK-05_compute-core.md` | 832 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): Define routing and estimates timing boundaries before repo` | BD-05 |
| 128 | `docs/tasks/TASK-05_compute-core.md` | 912 | decision | `yields to the worker's event loop; the stub searchLeg is synchronous (open point 5). TODO(decision) in T05.01.` | BD-04 |
| 129 | `docs/tasks/TASK-05_compute-core.md` | 917 | decision | `value when both apply, nor whether the source or destination cell of a step decides. TODO(decision) in T05.18.` | BD-05 |
| 130 | `docs/tasks/TASK-05_compute-core.md` | 918 | decision | `_BY_ reason wins when slope, hazard and no-data cells all bound the explored region. TODO(decision) in T05.19.` | BD-05 |
| 131 | `docs/tasks/TASK-05_compute-core.md` | 919 | decision | `at arrivals, so "segment in darkness" (FR-10) has no defined evaluation along a leg. TODO(decision) in T05.24.` | BD-49 |
| 132 | `docs/tasks/TASK-05_compute-core.md` | 920 | decision | `or the step gradient, or which numeric fields a NO_ROUTE leg carries (open point 3). TODO(decision) in T05.21.` | BD-43 |
| 133 | `docs/tasks/TASK-05_compute-core.md` | 921 | decision | `at slope raster, rounding alone can exceed the tolerance. TODO(decision) with T03.21 on which raster F5 reads.` | BD-54 |
| 134 | `docs/tasks/TASK-05_compute-core.md` | 922 | decision | `nge limits — 02 §E.3 does not say whether its range limits are inclusive. TODO(decision) in T05.14 and T05.25.` | BD-52 |
| 135 | `docs/tasks/TASK-05_compute-core.md` | 923 | decision | `g_ms change per run (05 §D separates the run from the result). TODO(decision) in T05.15: compare without them.` | BD-51 |
| 136 | `docs/tasks/TASK-05_compute-core.md` | 924 | decision | `10⁶ expansions needs either an injectable limit (C7) or a very large synthetic grid. TODO(decision) in T05.01.` | BD-53 |
| 137 | `docs/tasks/TASK-05_compute-core.md` | 926 | verify | `-08) may block a server on another port (TODO(verify)). Map change proposed: a follow-up: in TASK-07 if T05.31` | BD-01 |
| 138 | `docs/tasks/TASK-05b_compute-v2.md` | 63 | decision | `st-visited point in ContingencyOption.rendezvous; TODO(decision): 05 has a single rendezvous point per option.` | BD-58 |
| 139 | `docs/tasks/TASK-05b_compute-v2.md` | 64 | decision | `02 §D.8): HAB_INGRESS_S (300 s, Assumed; TODO(decision)), VEHICLE_GRID_CELL_M (10), HAVEN_SAMPLE_SPACING_M (50` | BD-57 |
| 140 | `docs/tasks/TASK-05b_compute-v2.md` | 68 | decision | `1. TODO(decision): hab ingress is labelled Assumed in 02 §D.8, but no ParamS` | BD-57 |
| 141 | `docs/tasks/TASK-05b_compute-v2.md` | 69 | decision | `2. TODO(decision): the planner's havenAlongRoute needs a vehicle start, bu` | BD-57 |
| 142 | `docs/tasks/TASK-05b_compute-v2.md` | 70 | decision | `osed: the published plan's MissionScenario wins, plus a loader check that they agree (T22.11). TODO(decision).` | BD-57 |
| 143 | `docs/tasks/TASK-05b_compute-v2.md` | 71 | decision | `4. TODO(decision): the rule that aggregates the 5 m grid to the 10 m vehicle` | BD-57 |
| 144 | `docs/tasks/TASK-05b_compute-v2.md` | 85 | decision | `(T26.01, T29.03 read the new shape). TODO(decision): Anjim Hossain to confirm the return change in the PR thre` | BD-63 |
| 145 | `docs/tasks/TASK-05b_compute-v2.md` | 85 | decision | `(the ray step rule, not a spec number; TODO(decision) for 02 §D.11) as additive exports. TODO(verify) the 02 §` | BD-61 |
| 146 | `docs/tasks/TASK-05b_compute-v2.md` | 85 | verify | `on) for 02 §D.11) as additive exports. TODO(verify) the 02 §D.11 "≤ 1 s" budget: [viewshed.bench.ts](../../pac` | BD-61 |
| 147 | `docs/tasks/TASK-05b_compute-v2.md` | 144 | decision | `- Spec gap, TODO(decision) for the 02 §D.10 owner: at the default limits (suit 15 d` | BD-04 |
| 148 | `docs/tasks/TASK-05b_compute-v2.md` | 192 | decision | `hmed Khan by agreement; every item is a TODO(decision) for the spec owner unless it is a fact). haven.ts calls` | BD-71 |
| 149 | `docs/tasks/TASK-05b_compute-v2.md` | 203 | decision | `ompute it every tick; recompute on a cell change or every N sim-seconds (TODO(decision) for the engine owner).` | BD-57 |
| 150 | `docs/tasks/TASK-05b_compute-v2.md` | 207 | decision | `pe, CLAUDE.md section 2). Proposed / TODO(decision): 02 §D.2 lists only the flags and the slope. Resolved 2026` | BD-57 |
| 151 | `docs/tasks/TASK-05b_compute-v2.md` | 208 | decision | `- ParamSet validation ranges (Proposed / TODO(decision)). hard_slope_deg in (0, 90], min_speed_frac in (0, 1` | BD-57 |
| 152 | `docs/tasks/TASK-05b_compute-v2.md` | 209 | decision | `- Cell size must divide 10 m (Proposed / TODO(decision)): vehicleTimeField throws RangeError when cell_m is` | BD-05 |
| 153 | `docs/tasks/TASK-05b_compute-v2.md` | 210 | decision | `y touching blocked cells (Proposed / TODO(decision)): there is no corner-cutting check, only the destination c` | BD-48 |
| 154 | `docs/tasks/TASK-05b_compute-v2.md` | 211 | decision | `rid starts differ by field (Proposed / TODO(decision)): crewTimeField returns an all-Infinity field for a star` | BD-57 |
| 155 | `docs/tasks/TASK-05b_compute-v2.md` | 212 | decision | `ollows the literal formula (Proposed / TODO(decision)): 255 / 4 = 63.75 deg exceeds the caution slope, so a no` | BD-57 |
| 156 | `docs/tasks/TASK-05b_compute-v2.md` | 212 | decision | `i.e. less conservative than before. TODO(decision) for the 02 §D.2 owner (which reading the spec means); rais` | BD-57 |
| 157 | `docs/tasks/TASK-05b_compute-v2.md` | 216 | decision | `euse the v1 step cost; requests for T05, TODO(decision) for Mishkat Ahmed Khan). Passability is isCellPassable` | BD-04 |
| 158 | `docs/tasks/TASK-05b_compute-v2.md` | 238 | decision | `- Proposed 2026-11-08 (TODO(decision) for the owner and the team lead; the Steps and Acceptance` | BD-71 |
| 159 | `docs/tasks/TASK-05b_compute-v2.md` | 242 | decision | `e hab is hab_mast from the same file. TODO(decision): the 5 m cell lives in a test fixture today; a shared ROU` | BD-57 |
| 160 | `docs/tasks/TASK-05b_compute-v2.md` | 291 | decision | `Proposed 2026-11-08 — TODO(decision) (T05b.07 implementation notes; the items from the vehicl` | BD-71 |
| 161 | `docs/tasks/TASK-05b_compute-v2.md` | 302 | verify | `n.ts (T05b.04); haven.ts is not edited here. TODO(verify): export one of them after both branches are on main.` | BD-57 |
| 162 | `docs/tasks/TASK-05b_compute-v2.md` | 303 | decision | `- TODO(decision) for the 02 §D.10 owner: the tie-break "min T_c, then cell i` | BD-58 |
| 163 | `docs/tasks/TASK-05b_compute-v2.md` | 431 | decision | `- Review notes (11 Nov): TODO(decision) for the 02 §D.12 owner: a message queued for a later pass` | BD-60 |
| 164 | `docs/tasks/TASK-05b_compute-v2.md` | 431 | verify | `vert it if the spec means send time only. TODO(verify): the 02 §D.12 light-time validation against spiceypy or` | BD-60 |
| 165 | `docs/tasks/TASK-05b_compute-v2.md` | 560 | decision | `Proposed 2026-11-08 — TODO(decision) (T05b.19 implementation notes; none is in 02 §D.15):` | BD-71 |
| 166 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 59 | decision | `4. Record the open C8 choices as TODO(decision) in the JSDoc for the compute-lane owner: which point gives` | BD-50 |
| 167 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 68 | decision | `ames. Bodies throw TODO(‹owner id›); open choices stay TODO(decision) in JSDoc. make typecheck test must pass.` | BD-04 |
| 168 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 70 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): Define darkness evaluation during travel and dwell, includ` | BD-49 |
| 169 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 84 | decision | `puts: at least 3 reference timestamps (TODO(decision); the spec names none, and 02 §E.2's eva_start_utc exampl` | BD-55 |
| 170 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 86 | verify | `the generator from its solar elevation; TODO(verify) its API and whether it takes west longitude (02 §C.4.1).` | BD-55 |
| 171 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 96 | verify | `ts/fixtures/mars24-reference.json. Never type an output number by hand; mark unknown API details TODO(verify).` | BD-04 |
| 172 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 98 | verify | `Follow-up (2026-11-09 reconciliation): TODO(verify): Pin marstime in the approved pipeline environment, verify` | BD-55 |
| 173 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 99 | verify | `ollow-up (2026-11-09 reconciliation): TODO(verify): Reconcile the F6 record labelled Sol 4190 at 2024-05-18T06` | BD-04 |
| 174 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 115 | decision | `L_s and Mars Year against F6 (tolerance TODO(decision); 02 §D.5 sets tolerances only for elevation and LTST).` | BD-04 |
| 175 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 116 | decision | `the elevation is 0° within the same 0.1° (flat horizon); the times match F6 within a TODO(decision) tolerance.` | BD-56 |
| 176 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 128 | verify | `ollow-up (2026-11-09 reconciliation): TODO(verify): Independently verify the Clancy Mars Year offset table and` | BD-04 |
| 177 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 128 | decision | `e and reference UTC-to-TT handling. TODO(decision): Ratify L_s, equation-of-time and sunrise/sunset tolerances` | BD-56 |
| 178 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 129 | verify | `e T06.07). T06.03 stays wip for the open TODO(verify)/TODO(decision) items above (Clancy table, UTC-to-TT hand` | BD-04 |
| 179 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 129 | decision | `stays wip for the open TODO(verify)/TODO(decision) items above (Clancy table, UTC-to-TT handling, tolerances,` | BD-04 |
| 180 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 195 | verify | `, including the UTC-to-TT step it needs (TODO(verify) the handling against the notes; no network at run time).` | BD-04 |
| 181 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 196 | verify | `2. Implement solarLongitude, returning L_s and the Mars Year (year convention TODO(verify) against marstime).` | BD-55 |
| 182 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 207 | verify | `ollow-up (2026-11-09 reconciliation): TODO(verify): Independently verify the Clancy Mars Year offset table and` | BD-04 |
| 183 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 207 | decision | `e and reference UTC-to-TT handling. TODO(decision): Ratify L_s, equation-of-time and sunrise/sunset tolerances` | BD-56 |
| 184 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 208 | verify | `year and one day early was not merged. TODO(verify): confirm with IERS Bulletin C that no leap second follows` | BD-00 |
| 185 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 223 | verify | `east longitude (identical to planetographic on the sphere); azimuth convention TODO(verify) against marstime.` | BD-55 |
| 186 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 225 | decision | `containing utc where elevation crosses 0°, as UTC ISO strings and LTST "HH:MM"; search method TODO(decision).` | BD-56 |
| 187 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 232 | verify | `inst F6: elevation within 0.1°, flat horizon, no terrain or refraction. Unknown conventions stay TODO(verify).` | BD-04 |
| 188 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 234 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): Schedule T06.07 solar position and flat-horizon sunrise/su` | BD-56 |
| 189 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 235 | decision | `vent form, so T06.09 must catch it. TODO(decision): team to confirm this contract (not reachable at Gale). TOD` | BD-56 |
| 190 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 235 | verify | `his contract (not reachable at Gale). TODO(verify): add the NASA Mars24 worked azimuth example with its printe` | BD-56 |
| 191 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 285 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): Complete C8 assembly into PlanResult after deciding the si` | BD-50 |
| 192 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 286 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): Define darkness evaluation during travel and dwell, includ` | BD-49 |
| 193 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 287 | decision | `am records five decisions, listed as TODO(decision) in the [conditions.ts](../../packages/compute/src/conditio` | BD-17 |
| 194 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 302 | verify | `row of Mars Scientific Context §9 or stay TODO(verify); source_id is simonsen-2024-rad (Obidit Islam (data le` | BD-04 |
| 195 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 303 | verify | `specs (MSL, RAD); accessed is the date of access; any required field the sources do not give is TODO(verify).` | BD-13 |
| 196 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 309 | verify | `- No URL, DOI, licence or credit text is invented: missing values are TODO(verify).` | BD-13 |
| 197 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 312 | verify | `ontext.md. Leave anything the sources do not state as TODO(verify); use the decided solar-min source_id above.` | BD-04 |
| 198 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 314 | verify | `ollow-up (2026-11-09 reconciliation): TODO(verify): Mishkat Ahmed Khan must verify RAD DataSource metadata and` | BD-13 |
| 199 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 329 | decision | `1. Fix the demo dates (TODO(decision), taken from the demo plan or demo script; 02 §E.2's exampl` | BD-04 |
| 200 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 329 | decision | `the demo plan or demo script; 02 §E.2's example date is a candidate) and the table time step (TODO(decision)).` | BD-04 |
| 201 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 389 | decision | `endency, but 06 §A Track P covers only TASK-02 and TASK-05, so T06.03–T06.09 stay event-only — TODO(decision).` | BD-04 |
| 202 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 391 | verify | `Obidit Islam (data lead), 2026-11-10 chose simonsen-2024-rad; T06.10 leaves unverified metadata TODO(verify).` | BD-13 |
| 203 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 392 | decision | `ks for at least 3 but names none; 02 §E.2's eva_start_utc example is one candidate — TODO(decision) in T06.02.` | BD-55 |
| 204 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 393 | decision | `f sun.test.ts; observed at most 2 s) are provisional — TODO(decision) to ratify (tested in T06.03 and T06.07).` | BD-56 |
| 205 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 394 | decision | `null for PARTIAL plans (02 §E.2), so the duration for a partial plan is undefined — TODO(decision) at T06.01.` | BD-04 |
| 206 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 395 | decision | `ded values; the display rule is a UI TODO(decision) for SCR-07 and SCR-08. Map change proposed: give the 01 FR` | BD-11 |
| 207 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 396 | decision | `but 05 Site has no single site point (aoi.bbox_geo, the crs centre, default_start) — TODO(decision) at T06.01.` | BD-04 |
| 208 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 397 | decision | `C8 must say whether T05.24 gets sunrise/sunset UTC or sun elevation along the legs — TODO(decision) at T06.01.` | BD-49 |
| 209 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 398 | verify | `§C.4.1), Mars Year and azimuth conventions, and UTC-to-TT handling are TODO(verify) before T06.02 and T06.06.` | BD-55 |
| 210 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 401 | decision | `low-up (2026-11-09 reconciliation): TODO(decision): The team lead must reconcile stale event-only prose with t` | BD-04 |
| 211 | `docs/tasks/TASK-06_mars24-and-radiation.md` | 402 | decision | `itions, reports a polar-day/night state or blocks such sites is TODO(decision) at T06.09 (Gale never hits it).` | BD-50 |
| 212 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 62 | decision | `— uPlot, Chart.js or plain SVG (02 §B) TODO(decision); DOM test environment for Vitest, package TODO(decision)` | BD-79 |
| 213 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 62 | decision | `test environment for Vitest, package TODO(decision); axe tooling for the NFR-04 "axe-core scan" TODO(decision` | BD-79 |
| 214 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 62 | decision | `tooling for the NFR-04 "axe-core scan" TODO(decision); JSON-Schema validator for validate-manifest, package T` | BD-79 |
| 215 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 62 | decision | `alidator for validate-manifest, package TODO(decision); marstime for T06.02 and T06.11 (02 §B, §D.5); icon set` | BD-79 |
| 216 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 62 | decision | `D.5); icon set (04 §C.4 "e.g., Lucide") TODO(decision). Versions are whatever the install pins (TODO(verify));` | BD-79 |
| 217 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 62 | verify | `ucide") TODO(decision). Versions are whatever the install pins (TODO(verify)); never choose them in this plan.` | BD-79 |
| 218 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 66 | verify | `nce in the PR for the credits (NFR-07); flag any licence that is not permissive before merging (TODO(verify)).` | BD-79 |
| 219 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 77 | decision | `ief: Once the lane owners settle the TODO(decision) choices listed in T14.01, add them in one PR to the root a` | BD-04 |
| 220 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 120 | verify | `sset; index file name from the tile-grid contract, TODO(verify)). Skip hashing in production builds (02 §E.1).` | BD-22 |
| 221 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 148 | decision | `missing asset name, Retry, and a link to the README run instructions (target TODO(decision), Spec question 5).` | BD-83 |
| 222 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 266 | verify | `≥ 768 px wide (or devtools emulation, TODO(verify)), check viewing and adding and deleting stops; drag only i` | BD-03 |
| 223 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 323 | verify | `w (NFR-10 "throw in worker"; mechanism TODO(verify)): the results panel shows "Computation failed — Retry", th` | BD-83 |
| 224 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 392 | decision | `"Unavailable in this build". T14.05 asserts the state, not the string, until this is settled — TODO(decision).` | BD-83 |
| 225 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 394 | decision | `on build detects a corrupted grid is TODO(decision); T14.05 tests the development path and T14.10 records prod` | BD-83 |
| 226 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 395 | decision | `n. Whether T14.03 probes optional assets in production or leaves it to tile errors (T07.07) is TODO(decision).` | BD-83 |
| 227 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 396 | decision | `tions, but the app runs offline and the public repository URL is fixed only by T16.07 — target TODO(decision).` | BD-83 |
| 228 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 397 | verify | `08, and whether it blocks the worker or OpenLayers styling in the production build, is TODO(verify) in T14.09.` | BD-04 |
| 229 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 399 | decision | `the icon set (04 §C.4 "e.g., Lucide") are TODO(decision) in T14.01; versions are TODO(verify) at install time.` | BD-79 |
| 230 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 399 | verify | `the icon set (04 §C.4 "e.g., Lucide") are TODO(decision) in T14.01; versions are TODO(verify) at install time.` | BD-79 |
| 231 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 400 | decision | `e C10 worker-client interface (T07.01) must accept an injected Worker-like object — TODO(decision) for T07.01.` | BD-79 |
| 232 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 401 | verify | `eeds a tablet ≥ 768 px; neither device is recorded anywhere (T00.06 records roster and skills) — TODO(verify).` | BD-03 |
| 233 | `docs/tasks/TASK-14_integration-offline-hardening.md` | 402 | decision | `e criteria, but no task owns the go/no-go call; this task's verification log is the evidence — TODO(decision).` | BD-00 |
| 234 | `docs/tasks/TASK-20_hab-core-skeleton.md` | 49 | decision | `xample against args in the type), write a TODO(decision) and raise it in Spec questions; do not pick silently.` | BD-04 |
| 235 | `docs/tasks/TASK-20_hab-core-skeleton.md` | 57 | decision | `- Open mismatches are listed as TODO(decision), not resolved silently.` | BD-04 |
| 236 | `docs/tasks/TASK-20_hab-core-skeleton.md` | 59 | decision | `R-50 additions. Do not add fields the specs do not define; mark gaps TODO(decision). Types only, no behaviour.` | BD-04 |
| 237 | `docs/tasks/TASK-20_hab-core-skeleton.md` | 285 | verify | `ehicle.task and TaskRoverArgs match 05 (item free text) and remove the T20.01 TODO(verify) on the rover shape.` | BD-102 |
| 238 | `docs/tasks/TASK-20_hab-core-skeleton.md` | 329 | decision | `2. Change habClient.ts to pass them and remove the two T20.06 TODO(decision)s this settles.` | BD-04 |
| 239 | `docs/tasks/TASK-20_hab-core-skeleton.md` | 367 | decision | `LE","crew":[…]}), while CommandMessage nests them in args. Which is the wire format? TODO(decision) in T20.01.` | BD-04 |
| 240 | `docs/tasks/TASK-21_scenario-builder.md` | 84 | verify | `2. Record each file's name, URL, size and SHA-256 in the lock file; mark anything not confirmed TODO(verify).` | BD-13 |
| 241 | `docs/tasks/TASK-21_scenario-builder.md` | 90 | verify | `te the lock file from the downloaded folder's checksums. Never invent a file name: unknowns stay TODO(verify).` | BD-13 |
| 242 | `docs/tasks/TASK-21_scenario-builder.md` | 156 | verify | `records into scenario events. Paths the CCMC docs do not list (SEP, WSA-ENLIL) are TODO(verify) until fetched.` | BD-04 |
| 243 | `docs/tasks/TASK-21_scenario-builder.md` | 200 | decision | `- U-45 follow-up: TODO(decision) — reconcile this subtask's published-total wording and the` | BD-25 |
| 244 | `docs/tasks/TASK-21_scenario-builder.md` | 363 | decision | `bility/hab-site.md first-choice row; TODO(decision): read them from the site manifest once it carries geograph` | BD-107 |
| 245 | `docs/tasks/TASK-21_scenario-builder.md` | 414 | verify | `step. 05 DoseSeries gives no fixed sample step; the product's own cadence is kept (TODO(verify) on download).` | BD-25 |
| 246 | `docs/tasks/TASK-22_simulation-engine.md` | 238 | decision | `- Rules (proposed 2026-11-07, TODO(decision); tests: tick.test.ts, T22.08):` | BD-71 |
| 247 | `docs/tasks/TASK-22_simulation-engine.md` | 244 | decision | `tart but ends at the meeting point. TODO(decision): a dedicated 05 Waypoint role ("rendezvous") would be clean` | BD-59 |
| 248 | `docs/tasks/TASK-22_simulation-engine.md` | 246 | verify | `he end of its leg, else it stays held. TODO(verify) with T23.07: assumes the new first leg starts near the cre` | BD-05 |
| 249 | `docs/tasks/TASK-22_simulation-engine.md` | 296 | decision | `- Proposed follow-up (9 Nov 2026, TODO(decision); no new id; the row stays done): readScenario loads` | BD-04 |
| 250 | `docs/tasks/TASK-22_simulation-engine.md` | 296 | decision | `height x 4 must equal its file length (TODO(decision): 05 gives no rule tying it to ti_cell_m and the extent).` | BD-78 |
| 251 | `docs/tasks/TASK-22_simulation-engine.md` | 419 | verify | `2. Remove the TODO(verify) on number canonicalisation from the fixture README; fixtu` | BD-04 |
| 252 | `docs/tasks/TASK-23_safety-ops.md` | 154 | decision | `Proposed 2026-11-08 — TODO(decision) (T23.05 implementation notes; Gemini's first version rewo` | BD-71 |
| 253 | `docs/tasks/TASK-23_safety-ops.md` | 169 | decision | `TODO(decision): the unreachable crew member is not served, and the event c` | BD-58 |
| 254 | `docs/tasks/TASK-23_safety-ops.md` | 170 | decision | `TODO(decision): the second meeting is not driven yet.` | BD-58 |
| 255 | `docs/tasks/TASK-23_safety-ops.md` | 174 | decision | `path, does not move and logs nothing; the tick retries. TODO(decision): no event kind exists for "cannot go".` | BD-58 |
| 256 | `docs/tasks/TASK-23_safety-ops.md` | 180 | decision | `g: SHELTER_REACH_M = 1 m is the T23.04 TODO(decision) value. CREW_SHELTERED labels both dose fields simulated,` | BD-72 |
| 257 | `docs/tasks/TASK-23_safety-ops.md` | 182 | decision | `rom an option and nothing walks the crew to the meeting point. TODO(decision), inherited from T23.04 / T22.06.` | BD-58 |
| 258 | `docs/tasks/TASK-23_safety-ops.md` | 183 | decision | `- Recorded, not fixed: re-targeting when the crew move after the summon. TODO(decision).` | BD-05 |
| 259 | `docs/tasks/TASK-23_safety-ops.md` | 227 | decision | `- Decisions (Proposed 2026-11-08 — TODO(decision)):` | BD-71 |
| 260 | `docs/tasks/TASK-23_safety-ops.md` | 234 | decision | `Proposed 2026-11-08 — TODO(decision) (T23.07 review rework of Gemini's branch; these replace d` | BD-71 |
| 261 | `docs/tasks/TASK-23_safety-ops.md` | 249 | decision | `BORT_TO_HAB and VEHICLE_RENDEZVOUS, but not for CONTINUE_SKIP, whose path is display geometry. TODO(decision).` | BD-59 |
| 262 | `docs/tasks/TASK-23_safety-ops.md` | 250 | decision | `pe and profile (Proposed 2026-11-09 — TODO(decision); replaces the 8 Nov "blocked" note). buildPlanRevision (r` | BD-59 |
| 263 | `docs/tasks/TASK-23_safety-ops.md` | 253 | decision | `metrics step (Proposed 2026-11-09 — TODO(decision), review decision): a display-metric problem never blocks a` | BD-59 |
| 264 | `docs/tasks/TASK-23_safety-ops.md` | 261 | decision | `TODO(decision), request to TASK-05 (Mishkat Ahmed Khan, packages/compute` | BD-04 |
| 265 | `docs/tasks/TASK-23_safety-ops.md` | 273 | decision | `TODO(decision): that extra segment is at most half a cell's diagonal, and` | BD-59 |
| 266 | `docs/tasks/TASK-23_safety-ops.md` | 279 | decision | `TODO(decision): a dedicated 05 Waypoint role ("rendezvous") would be clean` | BD-59 |
| 267 | `docs/tasks/TASK-23_safety-ops.md` | 282 | decision | `- Shared path for two crew. TODO(decision): path_preview is crew[0]'s, so under rule S7 EV2 snaps on` | BD-59 |
| 268 | `docs/tasks/TASK-23_safety-ops.md` | 283 | decision | `places, but with no waypoint there it has no dwell and no ARRIVED_STOP. TODO(decision) for the compute owner.` | BD-17 |
| 269 | `docs/tasks/TASK-23_safety-ops.md` | 284 | decision | `- Warning alerts only. TODO(decision): an O₂ or buddy warning also gets radiation-style options;` | BD-59 |
| 270 | `docs/tasks/TASK-23_safety-ops.md` | 308 | decision | `(Proposed 2026-11-08, updated 2026-11-09 — TODO(decision)): the revised leg's climb_m, descent_m, max_slope_de` | BD-71 |
| 271 | `docs/tasks/TASK-23_safety-ops.md` | 355 | decision | `ole abort for itself; whether an abort by EV1 also revises EV2's plan is not stated. TODO(decision) in T23.07.` | BD-59 |
| 272 | `docs/tasks/TASK-29_rover-tasking.md` | 61 | verify | `rule above is one named test; the event kind for an accepted task stays TODO(verify) until T20.01 settles it.` | BD-102 |
| 273 | `docs/tasks/TASK-29_rover-tasking.md` | 214 | verify | `nt kind. 05 LogEvent has no rover-specific kind; VEHICLE_DISPATCHED is the closest. TODO(verify) until T20.01.` | BD-102 |
| 274 | `docs/tasks/TASK-29_rover-tasking.md` | 215 | decision | `2. CARRY items. FR-41 names no item list. TODO(decision).` | BD-102 |
| 275 | `docs/tasks/TASK-31_stop-task-list.md` | 100 | decision | `the cases tied to open decisions (U-46, U-52, U-56, undo) as it.todo with their TODO(decision) until decided.` | BD-04 |
| 276 | `docs/tasks/TASK-32_live-session.md` | 8 | decision | `gives no "When" for these packages (TODO(decision)), so the milestones are board placements, not commitments;` | BD-05 |
| 277 | `docs/tasks/TASK-32_live-session.md` | 10 | decision | `/ Effort (doc 06) / TODO(decision): 06 §C.2 gives none for this package. The subtask estimate` | BD-05 |
| 278 | `docs/tasks/TASK-32_live-session.md` | 57 | decision | `read from schema.ts, merged first in practice), T32.02 (soft: spec gaps this subtask marks as TODO(decision))` | BD-04 |
| 279 | `docs/tasks/TASK-32_live-session.md` | 61 | decision | `or now so older snapshots and the F7 fixtures still typecheck; tightening them is TODO(decision) after T32.07.` | BD-100 |
| 280 | `docs/tasks/TASK-32_live-session.md` | 65 | decision | `let and HUD, Proposed names, final names TODO(decision): o2_remaining_min (minutes of O₂ left at the current a` | BD-95 |
| 281 | `docs/tasks/TASK-32_live-session.md` | 69 | decision | `ree crew fields are Proposed and marked TODO(decision)); PERMISSIONS matches 02 §E.4 for the presenter and the` | BD-13 |
| 282 | `docs/tasks/TASK-32_live-session.md` | 70 | decision | `- Gaps in the specs are TODO(decision) in the file, not resolved silently.` | BD-04 |
| 283 | `docs/tasks/TASK-32_live-session.md` | 87 | decision | `ld for the planner role, or a GET endpoint) in 02 §E.5 or §E.6 and 05. TODO(decision): product & systems lead.` | BD-04 |
| 284 | `docs/tasks/TASK-32_live-session.md` | 91 | verify | `5. Fix the file name and flag of the recorded command list (02 §D.17 TODO(verify)).` | BD-93 |
| 285 | `docs/tasks/TASK-32_live-session.md` | 93 | decision | `, bearing convention and provenance (TODO(decision): product & systems lead). T32.30 picks the next stop per c` | BD-95 |
| 286 | `docs/tasks/TASK-32_live-session.md` | 99 | decision | `h gap in steps 1 to 9 is decided in the spec or left as a visible TODO(decision); make lint docs-check passes.` | BD-04 |
| 287 | `docs/tasks/TASK-32_live-session.md` | 163 | decision | `mock site itself gets candidates is TODO(decision) (map v2 open point 11); this folder avoids waiting for it.` | BD-31 |
| 288 | `docs/tasks/TASK-32_live-session.md` | 209 | decision | `4. Tighten the optional Session fields of T32.01 if the tests allow; otherwise leave the TODO(decision).` | BD-100 |
| 289 | `docs/tasks/TASK-32_live-session.md` | 231 | decision | `ce_id required when the text states a number (a digit test; TODO(decision) if the team wants a stricter rule).` | BD-101 |
| 290 | `docs/tasks/TASK-32_live-session.md` | 278 | verify | `ents of the jump is not in 02 or 05: place it after them, since to_sim_time is known only then (TODO(verify)).` | BD-92 |
| 291 | `docs/tasks/TASK-32_live-session.md` | 285 | decision | `U-63 (stop at the first warning) is TODO(decision) in 01; if the lead changes it, only the end condition chan` | BD-97 |
| 292 | `docs/tasks/TASK-32_live-session.md` | 420 | verify | `t rebuilt from a live session's log replays to the same hash, within the limits T32.02 records (TODO(verify)).` | BD-93 |
| 293 | `docs/tasks/TASK-32_live-session.md` | 441 | verify | `-commands ‹file› option on replay (name TODO(verify) until T32.02 fixes it), documented in the file header; ma` | BD-93 |
| 294 | `docs/tasks/TASK-32_live-session.md` | 464 | verify | `3. Name the file as T32.02 decides; reference_commands.json is Proposed (TODO(verify)).` | BD-93 |
| 295 | `docs/tasks/TASK-32_live-session.md` | 714 | verify | `ink.json covers the whole sim day of the session (01 FR-52 TODO(verify)); record the first and last rows used.` | BD-108 |
| 296 | `docs/tasks/TASK-32_live-session.md` | 737 | decision | `next stop at the engine's leg speed (TODO(decision): whether dwell at the current stop is included; the test n` | BD-95 |
| 297 | `docs/tasks/TASK-32_live-session.md` | 784 | verify | `scenario_build.py by a stated rule and printed (05 TODO(verify)); the rule needs the product lead's approval.` | BD-98 |
| 298 | `docs/tasks/TASK-32_live-session.md` | 838 | decision | `y to receive task_library; the decision is the product lead's (TODO(decision)). T32.25 and T32.27 wait for it.` | BD-90 |
| 299 | `docs/tasks/TASK-32_live-session.md` | 840 | verify | `logged. The export (T32.17) is a reconstruction from events; its limits are TODO(verify) until T32.02 decides.` | BD-93 |
| 300 | `docs/tasks/TASK-32_live-session.md` | 841 | verify | `ion of CLOCK_JUMPED among the events of the jump is not specified (T32.10 places it after them, TODO(verify)).` | BD-92 |
| 301 | `docs/tasks/TASK-32_live-session.md` | 842 | verify | `e time chosen from the dose series (05 TODO(verify)); the rule is part of T32.32 and needs the lead's approval` | BD-98 |
| 302 | `docs/tasks/TASK-32_live-session.md` | 844 | decision | `brary inputs have no recorded time; how their t_offset_s is set is TODO(decision) in 05 and belongs to T26.04.` | BD-99 |
| 303 | `docs/tasks/TASK-32_live-session.md` | 845 | decision | `ck site (T03.02) gains candidates is TODO(decision) (map v2 open point 11); T32.05 builds a two-candidate site` | BD-31 |
| 304 | `docs/tasks/TASK-32_live-session.md` | 846 | decision | `and next_stop_eta_s (Proposed names, TODO(decision)), though 01 FR-32 and FR-33 name the values. Straight-line` | BD-95 |
| 305 | `docs/tasks/TASK-32_live-session.md` | 846 | decision | `classes (Proposed: ETA modelled) are TODO(decision) for the product lead; T32.02 writes them back into 05 and` | BD-04 |
| 306 | `apps/hab-core/src/report.ts` | 30 | decision | `TODO(decision): contract change in packages/protocol if PostEvaReport move` | BD-76 |
| 307 | `apps/hab-core/src/report.ts` | 149 | decision | `TODO(decision): supply a sourced planned-background dose result through th` | BD-76 |
| 308 | `apps/hab-core/src/scenario.ts` | 10 | decision | `TODO(decision): declare ajv and ajv-formats directly in the next depen` | BD-79 |
| 309 | `apps/hab-core/src/scenario.ts` | 99 | decision | `length. TODO(decision): 05 gives no rule tying the TI width/height to ti_cell_m` | BD-78 |
| 310 | `apps/hab-core/src/engine/README.md` | 49 | decision | `→ comm link → buddy distance. The order of rows 1–5 and 11 is proposed by T22.01 (TODO(decision) in tick.ts).` | BD-70 |
| 311 | `apps/hab-core/src/engine/alerts.ts` | 119 | verify | `TODO(verify): a terrain refuge (T2) gives shelter but no O₂; until T2 th` | BD-74 |
| 312 | `apps/hab-core/src/engine/conditions.ts` | 4 | decision | `TODO(decision): protocol v0 has no SNAPSHOT field for these values; T22.16` | BD-75 |
| 313 | `apps/hab-core/src/engine/contingencyOps.ts` | 10 | decision | `Rules (Proposed 2026-11-08 — TODO(decision); listed in TASK-23 under T23.07):` | BD-59 |
| 314 | `apps/hab-core/src/engine/contingencyOps.ts` | 26 | decision | `Proposed 2026-11-09, TODO(decision):` | BD-59 |
| 315 | `apps/hab-core/src/engine/contingencyOps.ts` | 36 | decision | `has a helper that maps a polyline to cells (TODO(decision) in TASK-23).` | BD-59 |
| 316 | `apps/hab-core/src/engine/contingencyOps.ts` | 262 | decision | `// TODO(decision): ask TASK-05 (Mishkat) for a compute helper that maps a pol` | BD-59 |
| 317 | `apps/hab-core/src/engine/contingencyOps.ts` | 327 | decision | `// vehicle. TODO(decision): a dedicated 05 Waypoint role ("rendezvous") would be clean` | BD-59 |
| 318 | `apps/hab-core/src/engine/reducer.ts` | 59 | decision | `Walk progress per crew member, written only by tick.ts (T22.09; TODO(decision) S1). Engine-only:` | BD-71 |
| 319 | `apps/hab-core/src/engine/reducer.ts` | 66 | decision | `written before 2026-11-08. Added by the T23.07 rework, Proposed 2026-11-08 — TODO(decision).` | BD-71 |
| 320 | `apps/hab-core/src/engine/reducer.ts` | 74 | decision | `state with the authorisation of its owner (Sadman Shaharier Mahim) — TODO(decision) until #194 merges.` | BD-71 |
| 321 | `apps/hab-core/src/engine/tasks.ts` | 320 | decision | `// TODO(decision): EV2 is hard-coded as the simulated crew member (01 FR-50 "` | BD-73 |
| 322 | `apps/hab-core/src/engine/tick.ts` | 59 | decision | `TODO(decision): 02 §D.14 fixes only the alert order; the order of the non-` | BD-70 |
| 323 | `apps/hab-core/src/engine/tick.ts` | 349 | decision | `// TODO(decision): a dedicated 05 Waypoint role ("rendezvous") would be clean` | BD-59 |
| 324 | `apps/hab-core/src/engine/tick.ts` | 383 | verify | `the earliest leg or segment. TODO(verify) with T23.07: assumes the new first leg starts near the crew` | BD-80 |
| 325 | `apps/hab-core/src/engine/vehicles.ts` | 12 | decision | `Rules (Proposed 2026-11-08 — TODO(decision); listed in TASK-23 under T23.05):` | BD-58 |
| 326 | `apps/hab-core/src/engine/vehicles.ts` | 44 | decision | `A crew member counts as "at the vehicle" within this distance (metres). TODO(decision): the value` | BD-58 |
| 327 | `apps/hab-core/src/engine/vehicles.ts` | 102 | decision | `driven yet: TODO(decision).` | BD-58 |
| 328 | `apps/hab-core/src/engine/vehicles.ts` | 104 | decision | `in a storm is still useful (Proposed 2026-11-08). TODO(decision): the unreachable crew member is not` | BD-58 |
| 329 | `apps/hab-core/src/engine/vehicles.ts` | 384 | decision | `// TODO(decision): with no path the vehicle stays DISPATCHED and the tick ret` | BD-58 |
| 330 | `apps/hab-core/tests/contingencyOps.test.ts` | 23 | decision | `TODO(decision): options per alert, not per crew. One OPTIONS_PROPOSED per` | BD-59 |
| 331 | `apps/hab-core/tests/contingencyOps.test.ts` | 29 | decision | `TODO(decision): "a new warning" = an alert of level warning that has no` | BD-59 |
| 332 | `apps/hab-core/tests/contingencyOps.test.ts` | 34 | decision | `TODO(decision): stale option = the option_id is not in state.options (` | BD-59 |
| 333 | `apps/hab-core/tests/contingencyOps.test.ts` | 38 | decision | `TODO(decision): APPROVE_OPTION needs args.option_id. ABORT needs args.c` | BD-59 |
| 334 | `apps/hab-core/tests/contingencyOps.test.ts` | 43 | decision | `TODO(decision): ABORT executes the ABORT_TO_HAB option that covers the lis` | BD-59 |
| 335 | `apps/hab-core/tests/contingencyOps.test.ts` | 47 | decision | `TODO(decision): the new leg's from is the last remaining waypoint before` | BD-59 |
| 336 | `apps/hab-core/tests/contingencyOps.test.ts` | 420 | decision | `// TODO(decision): no alert means no option to execute, and the reducer sends` | BD-59 |
| 337 | `apps/hab-core/tests/contingencyOpsReal.test.ts` | 6 | decision | `Proposed 2026-11-08 — TODO(decision): this file is new. contingencyOps.test.ts (T23.06) replac` | BD-59 |
| 338 | `apps/hab-core/tests/contingencyOpsReal.test.ts` | 611 | decision | `Proposed 2026-11-09 — TODO(decision), listed in TASK-23 under T23.07. The new leg keeps today's` | BD-59 |
| 339 | `apps/hab-core/tests/report.test.ts` | 385 | decision | `// TODO(decision): a sourced planned-background result comes through the repo` | BD-76 |
| 340 | `apps/hab-core/tests/rover.test.ts` | 11 | verify | `// TODO(verify): 02 and 05 name no LogEvent kind for an accepted rover task` | BD-102 |
| 341 | `apps/hab-core/tests/stopTasks.test.ts` | 321 | decision | `// TODO(decision): U-52 — the 1–4 limit per stop or per crew member at a stop` | BD-109 |
| 342 | `apps/hab-core/tests/stopTasks.test.ts` | 354 | decision | `// TODO(decision): U-46 proposes "ops adds tasks only when no warning is latc` | BD-05 |
| 343 | `apps/hab-core/tests/stopTasks.test.ts` | 509 | decision | `// TODO(decision): U-56 — open tasks at the current stop on abort or rendezvo` | BD-59 |
| 344 | `apps/hab-core/tests/summon.test.ts` | 20 | decision | `silent). Each is marked TODO(decision) until the team confirms it:` | BD-58 |
| 345 | `apps/hab-core/tests/summon.test.ts` | 21 | decision | `- TODO(decision) Compute calls: handleSummon builds the crew and vehicle t` | BD-58 |
| 346 | `apps/hab-core/tests/summon.test.ts` | 24 | decision | `- TODO(decision) Vehicle choice: the summoned vehicle is the scenario's pre` | BD-58 |
| 347 | `apps/hab-core/tests/summon.test.ts` | 27 | decision | `- TODO(decision) Event data: bare summon logs {vehicle_id, rendezvous} wit` | BD-58 |
| 348 | `apps/hab-core/tests/summon.test.ts` | 33 | decision | `- TODO(decision) Single crew only: args.crew of two uses the 02 §D.10 visi` | BD-58 |
| 349 | `apps/hab-core/tests/summon.test.ts` | 35 | decision | `- TODO(decision) The event has no path, so vehiclesTick computes it on the` | BD-58 |
| 350 | `apps/hab-core/tests/summon.test.ts` | 40 | decision | `- TODO(decision) Motion: each tick moves the vehicle speed × dt_s along it` | BD-58 |
| 351 | `apps/hab-core/tests/summon.test.ts` | 46 | decision | `- TODO(decision) Sheltering: vehiclesTick returns one CREW_SHELTERED per cre` | BD-58 |
| 352 | `apps/hab-core/tests/summonReal.test.ts` | 5 | decision | `Proposed 2026-11-08 — TODO(decision): this file is new. summon.test.ts (T23.04) mocks compute` | BD-71 |
| 353 | `apps/hab-core/tests/summonReal.test.ts` | 28 | decision | `- Sheltering reach: SHELTER_REACH_M = 1 m is the T23.04 TODO(decision) value (summon.test.ts header).` | BD-72 |
| 354 | `apps/hab-core/tests/summonReal.test.ts` | 79 | decision | `/ The T23.04 TODO(decision) reach (summon.test.ts header, "Sheltering"); declared, not` | BD-72 |
| 355 | `apps/hab-core/tests/summonReal.test.ts` | 446 | decision | `// Sheltering reach (T23.04 TODO(decision): SHELTER_REACH_M = 1 m)` | BD-72 |
| 356 | `apps/hab-core/tests/tick.test.ts` | 22 | decision | `Rules these tests fix for T22.09 (proposed 2026-11-07, TODO(decision); docs/tasks/TASK-22 T22.09):` | BD-71 |
| 357 | `apps/hab-core/tests/tick.test.ts` | 701 | verify | `throw new Error("TODO(verify): T26.04 not implemented");` | BD-04 |
| 358 | `apps/hab-core/tests/fixtures/fake-scenario/fixture.test.ts` | 6 | decision | `TODO(decision): declare ajv and ajv-formats directly in the next depen` | BD-79 |
| 359 | `apps/hab-core/scripts/demo-numbers.ts` | 11 | decision | `TODO(decision): read them from the site manifest once it carries geographi` | BD-107 |
| 360 | `packages/compute/src/conditions.ts` | 9 | decision | `- TODO(decision): Site coordinate. Which point gives the solar latitude and` | BD-50 |
| 361 | `packages/compute/src/conditions.ts` | 11 | decision | `- TODO(decision): EnvConstant selection. The provisional rule below accepts` | BD-50 |
| 362 | `packages/compute/src/conditions.ts` | 14 | decision | `- TODO(decision): Dose duration for PARTIAL plans. totals is null then (02` | BD-50 |
| 363 | `packages/compute/src/conditions.ts` | 17 | decision | `- TODO(decision): DARKNESS inputs. Sunrise/sunset UTC or sun elevation along` | BD-49 |
| 364 | `packages/compute/src/conditions.ts` | 19 | decision | `- TODO(decision): Timing boundaries. What timing_ms.routing and timing_ms` | BD-50 |
| 365 | `packages/compute/src/conditions.ts` | 25 | decision | `TODO(decision): team to confirm; not reachable at Gale (lat about -4.7 deg` | BD-56 |
| 366 | `packages/compute/src/conditions.ts` | 54 | decision | `/ Provisional EnvConstant selection (TODO(decision) in the header): one rad- rate in mSv/day for the phase.` | BD-50 |
| 367 | `packages/compute/src/contingency.ts` | 41 | decision | `TODO(decision): 05 has a single rendezvous point per option.` | BD-58 |
| 368 | `packages/compute/src/earthLink.ts` | 150 | decision | `ater pass is also blocked when that pass starts in conjunction (Proposed; 02 §D.12 is silent, TODO(decision)).` | BD-05 |
| 369 | `packages/compute/src/handler.ts` | 122 | decision | `// TODO(decision): Choose event-loop yielding or shared abort signalling for` | BD-59 |
| 370 | `packages/compute/src/handler.ts` | 218 | decision | `// TODO(decision): Complete C8 assembly into PlanResult after deciding the si` | BD-50 |
| 371 | `packages/compute/src/handler.ts` | 233 | decision | `// TODO(decision): Define routing and estimates timing boundaries before repo` | BD-05 |
| 372 | `packages/compute/src/haven.ts` | 15 | decision | `TODO(decision): 05 says every non-data number lives in a ParamSet, so a h` | BD-57 |
| 373 | `packages/compute/src/leg.ts` | 63 | decision | `TODO(decision): Leg metric definitions (spec question 10):` | BD-43 |
| 374 | `packages/compute/src/mars24.ts` | 74 | verify | `TODO(verify): confirm against IERS Bulletin C before the event that no l` | BD-55 |
| 375 | `packages/compute/src/noRoute.ts` | 17 | decision | `TODO(decision): mixed barrier precedence rule (spec question 8).` | BD-46 |
| 376 | `packages/compute/src/rendezvous.ts` | 42 | verify | `// TODO(verify): duplicates the private centreOfCell in haven.ts (owned b` | BD-57 |
| 377 | `packages/compute/src/route.ts` | 237 | decision | `// TODO(decision): event-loop yielding or shared abort signalling (TASK-05 T0` | BD-59 |
| 378 | `packages/compute/src/route.ts` | 265 | decision | `ute agree on reachability. The rule is still Proposed / TODO(decision) in TASK-05b; 02 §D.2 does not state it.` | BD-48 |
| 379 | `packages/compute/src/sampling.ts` | 31 | decision | `TODO(decision): read the origin from the site manifest's working-projectio` | BD-45 |
| 380 | `packages/compute/src/sampling.ts` | 319 | decision | `// TODO(decision): record the leg-end sample in 05 §C Leg.profile or drop it` | BD-44 |
| 381 | `packages/compute/src/sun.ts` | 11 | verify | `TODO(verify) the numbering against the page): declination delta = asin(0` | BD-56 |
| 382 | `packages/compute/src/sun.ts` | 40 | decision | `semantics. TODO(decision): the team confirms this contract with the spec owners (not` | BD-56 |
| 383 | `packages/compute/src/viewshed.ts` | 29 | decision | `Not a spec number; TODO(decision) for the 02 §D.11 owner.` | BD-61 |
| 384 | `packages/compute/src/warnings.ts` | 159 | decision | `// TODO(decision): Define darkness evaluation during travel and dwell, includ` | BD-49 |
| 385 | `packages/compute/src/warnings.ts` | 225 | decision | `// TODO(decision): Confirm LOW_RES_DEM warning severity before emitting bit-4` | BD-49 |
| 386 | `packages/compute/src/warnings.ts` | 226 | decision | `// TODO(decision): Define NO_DATA_ADJACENT neighbourhood, distance, severity` | BD-49 |
| 387 | `packages/compute/tests/conditions.test.ts` | 261 | decision | `Cases that wait on the five C8 decisions recorded in the conditions.ts header (TODO(decision), TASK-06 T06.09)` | BD-50 |
| 388 | `packages/compute/tests/conditions.test.ts` | 262 | decision | `it.todo("site coordinate: which point feeds the solar functions, mast vs AOI centre (TODO(decision))");` | BD-50 |
| 389 | `packages/compute/tests/conditions.test.ts` | 263 | decision | `it.todo("EnvConstant selection: the final rule when more than one record matches (TODO(decision))");` | BD-05 |
| 390 | `packages/compute/tests/conditions.test.ts` | 264 | decision | `it.todo("PARTIAL plan dose: which duration feeds the dose when totals is null (TODO(decision))");` | BD-05 |
| 391 | `packages/compute/tests/conditions.test.ts` | 265 | decision | `it.todo("DARKNESS inputs: sunrise/sunset UTC or sun elevation along legs and dwell (TODO(decision))");` | BD-49 |
| 392 | `packages/compute/tests/conditions.test.ts` | 266 | decision | `it.todo("timing boundaries: what timing_ms.routing and timing_ms.estimates measure (TODO(decision))");` | BD-05 |
| 393 | `packages/compute/tests/earthLink.test.ts` | 304 | decision | `describe("conjunction at the queued pass start (Proposed; 02 §D.12 is silent, TODO(decision))", () =› {` | BD-60 |
| 394 | `packages/compute/tests/mars24.test.ts` | 55 | verify | `// TODO(verify): Pin marstime in the approved pipeline environment, verify` | BD-55 |
| 395 | `packages/compute/tests/mars24.test.ts` | 56 | verify | `// TODO(verify): Reconcile the F6 record labelled Sol 4190 at 2024-05-18T06` | BD-55 |
| 396 | `packages/compute/tests/mars24.test.ts` | 57 | verify | `// TODO(verify): Independently verify the Clancy Mars Year offset table and` | BD-55 |
| 397 | `packages/compute/tests/mars24.test.ts` | 57 | decision | `e and reference UTC-to-TT handling. TODO(decision): Ratify L_s, equation-of-time and sunrise/sunset tolerances` | BD-55 |
| 398 | `packages/compute/tests/mars24.test.ts` | 71 | decision | `// Provisional bound 0.05° (strictly less than); TODO(decision): ratify, see` | BD-55 |
| 399 | `packages/compute/tests/mars24.test.ts` | 106 | verify | `// TODO(verify): the MSL touchdown cross-check below is a sanity case, not` | BD-55 |
| 400 | `packages/compute/tests/realGrid.test.ts` | 259 | verify | `// TODO(verify): Obtain the gale_boxwork bundle and ten independent F5 cell` | BD-54 |
| 401 | `packages/compute/tests/rendezvous.test.ts` | 183 | decision | `// necessarily the one chosen: TODO(decision) in TASK-05b, T05b.07 notes.` | BD-58 |
| 402 | `packages/compute/tests/rendezvous.test.ts` | 341 | decision | `// than inventing a path. TODO(decision) in TASK-05b, T05b.07 notes.` | BD-58 |
| 403 | `packages/compute/tests/sun.test.ts` | 37 | decision | `// TODO(decision): 2-minute tolerance for sunrise/sunset times vs marstime re` | BD-56 |
| 404 | `packages/compute/tests/sun.test.ts` | 105 | decision | `// the implementation's own output. Time tolerances below are provisional: TODO(decision).` | BD-56 |
| 405 | `packages/compute/tests/sun.test.ts` | 112 | decision | `/ Provisional bound for sunrise/sunset instants (observed ‹= 2 s against F6). TODO(decision). /` | BD-56 |
| 406 | `packages/compute/tests/sun.test.ts` | 160 | decision | `// declination and equation-of-time change are allowed; 120 s is provisional, TODO(decision)).` | BD-56 |
| 407 | `packages/compute/tests/sun.test.ts` | 221 | decision | `// has no absent-event form, so the C8 assembler (T06.09) must catch it. TODO(decision) for the team.` | BD-56 |
| 408 | `packages/compute/tests/sun.test.ts` | 270 | verify | `relation; textbook spherical astronomy). TODO(verify): add the NASA Mars24 worked example from` | BD-56 |
| 409 | `packages/compute/tests/worker.test.ts` | 383 | decision | `, conditions and radiation from assembleConditions (TODO(decision): site coordinate, EnvConstant selection)");` | BD-50 |
| 410 | `packages/compute/tests/worker.test.ts` | 384 | decision | `an: dose duration and per-leg walk time are unavailable, not 0 (TODO(decision): PARTIAL-plan dose duration)");` | BD-50 |
| 411 | `packages/compute/tests/worker.test.ts` | 385 | decision | `it.todo("DARKNESS warning from solar inputs along legs and dwell (TODO(decision): darkness inputs)");` | BD-49 |
| 412 | `packages/compute/tests/worker.test.ts` | 386 | decision | `it.todo("timing_ms.routing and timing_ms.estimates (TODO(decision): timing boundaries)");` | BD-05 |
| 413 | `packages/compute/tests/workerCancel.test.ts` | 6 | decision | `earchLeg is stubbed: nothing in the handler passes shouldCancel yet (TODO(decision) in TASK-05 T05.18/T05.27),` | BD-41 |
| 414 | `packages/compute/tests/fixtures/v2grids.ts` | 54 | decision | `SPEC GAP (reported, not fixed here; TODO(decision) for the 02 §D.10 owner): at the default limits` | BD-57 |
| 415 | `packages/compute/tests/fixtures/v2grids.ts` | 58 | decision | `(crew hard limit 35 deg, the 02 §E.3 maximum). TODO(decision) option for the D.10 owner: keep the default crew` | BD-57 |
| 416 | `packages/protocol/src/runtime.ts` | 433 | decision | `names, so a type here would invent them. TODO(decision): add a field table to 05 PostEvaReport,` | BD-76 |
| 417 | `packages/protocol/src/worker.ts` | 11 | decision | `- TODO(decision): Grid delivery to the worker. 02 §E.2 defines GRID_NOT_LOAD` | BD-40 |
| 418 | `packages/protocol/src/worker.ts` | 14 | decision | `- TODO(decision): Cancellation mechanism. Check every 50,000 expansions (02` | BD-83 |
| 419 | `packages/protocol/src/worker.ts` | 16 | decision | `- TODO(decision): SAMPLE_POINT passability depends on hard_slope_limit_deg (` | BD-42 |
| 420 | `pipeline/src/marswalk_pipeline/__main__.py` | 29 | verify | `elif record.get("legend", {}).get("stops") == "TODO(verify)":` | BD-17 |
| 421 | `pipeline/src/marswalk_pipeline/__main__.py` | 165 | decision | `arning: {layer}: {unstyled[layer]}; TODO(decision) (owner: data lead + design brief 04); skipping", file=sys.s` | BD-17 |
| 422 | `pipeline/src/marswalk_pipeline/__main__.py` | 172 | decision | `raise ValueError(f"{layer}: TODO(decision) {unstyled[layer]}")` | BD-17 |
| 423 | `pipeline/src/marswalk_pipeline/clip_reproject.py` | 49 | verify | `# TODO(verify): T03.19 interprets grid elevation as a block mean of the` | BD-19 |
| 424 | `pipeline/src/marswalk_pipeline/clip_reproject.py` | 78 | verify | `# TODO(verify): whether T01.01's PDS3 label value applies when the` | BD-05 |
| 425 | `pipeline/src/marswalk_pipeline/comm_grid.py` | 78 | decision | `A NaN cell on the ray does not block it (TODO(decision): NaN could instead count as blocking).` | BD-20 |
| 426 | `pipeline/src/marswalk_pipeline/config.py` | 50 | verify | `# TODO(verify): provisional 05 §F.1 ladder until C9 is frozen.` | BD-22 |
| 427 | `pipeline/src/marswalk_pipeline/config.py` | 53 | verify | `# TODO(verify): C9 tile-grid contract remains to be frozen.` | BD-22 |
| 428 | `pipeline/src/marswalk_pipeline/derive.py` | 20 | decision | `ring is left NaN (TODO(decision): replicate-edge is the alternative). NaN in any stencil cel` | BD-19 |
| 429 | `pipeline/src/marswalk_pipeline/derive.py` | 65 | decision | `the tile step decides the display encoding (TODO(decision)). A NaN DEM cell gives NaN, as does` | BD-17 |
| 430 | `pipeline/src/marswalk_pipeline/derive.py` | 97 | verify | `(TODO(verify): the pipeline's edge crop policy for the 6000 x 6000 window` | BD-19 |
| 431 | `pipeline/src/marswalk_pipeline/manifest.py` | 172 | verify | `# Single static images (T03.25 fallback). TODO(verify): images/‹name›.png is not fixed by C5 or 05.` | BD-23 |
| 432 | `pipeline/src/marswalk_pipeline/rad.py` | 52 | verify | `TODO(verify): reconcile that endpoint convention with TASK-05b's rateAt.` | BD-25 |
| 433 | `pipeline/src/marswalk_pipeline/rad.py` | 148 | verify | `(TODO(verify), docs/ops/rad-series.md). Fractional seconds are truncated.` | BD-25 |
| 434 | `pipeline/src/marswalk_pipeline/spice_tables.py` | 7 | verify | `TODO(verify): carry this sampled-pass convention into 05 EarthLinkTable.` | BD-24 |
| 435 | `pipeline/src/marswalk_pipeline/spice_tables.py` | 13 | verify | `TODO(verify): quantify the barycenter/body-centre difference for Earth g` | BD-24 |
| 436 | `pipeline/src/marswalk_pipeline/spice_tables.py` | 24 | verify | `predicted: TODO(verify), see T21.02. From that epoch fsp_352 takes priority;` | BD-24 |
| 437 | `pipeline/src/marswalk_pipeline/spice_tables.py` | 316 | verify | `"predicted: TODO(verify), see T21.02. From that epoch fsp_352 takes "` | BD-24 |
| 438 | `pipeline/src/marswalk_pipeline/tiles.py` | 25 | verify | `TODO(verify): C9 must confirm addressing, sampling, pixel encoding and i` | BD-22 |
| 439 | `pipeline/src/marswalk_pipeline/tiles.py` | 29 | verify | `ramp is TODO(verify). PNG retains missing pixels as alpha. JPEG has no alpha:` | BD-17 |
| 440 | `pipeline/src/marswalk_pipeline/tiles.py` | 120 | verify | `# TODO(verify): mock-site grid uses top-left origin, eastward x, southward` | BD-22 |
| 441 | `pipeline/src/marswalk_pipeline/tiles.py` | 140 | verify | `# TODO(verify): gdaldem-style display range; encoded 0 is no-data.` | BD-22 |
| 442 | `pipeline/src/marswalk_pipeline/tiles.py` | 159 | verify | `# TODO(verify): provisional mock-site index, not yet the C9 contract.` | BD-22 |
| 443 | `pipeline/src/marswalk_pipeline/validate_manifest.py` | 15 | decision | `# TODO(decision) T03.14: confirm the passability limit with the data lead.` | BD-21 |
| 444 | `pipeline/src/marswalk_pipeline/validate_manifest.py` | 35 | verify | `# TODO(verify) T14.01: make jsonschema a required pipeline dependency when` | BD-05 |
| 445 | `pipeline/tests/test_clip_reproject.py` | 75 | decision | `# TODO(decision): whether CI installs the geo stack or relies on pytest.impo` | BD-19 |
| 446 | `pipeline/tests/test_clip_reproject.py` | 223 | verify | `# TODO(verify): confirm whether the Gale DEM carries a declared GeoTIFF no` | BD-19 |
| 447 | `pipeline/tests/test_derive.py` | 145 | decision | `# The percentile method is TODO(decision) for T03.09, so these blocks are built such that every` | BD-19 |
| 448 | `pipeline/tests/test_donki.py` | 41 | verify | `Field names per DONKI type (own time / id), all TODO(verify) against the CCMC DONKI documentation` | BD-110 |
| 449 | `pipeline/tests/test_donki.py` | 72 | verify | `# (DONKI type, id field, own-time field) -- TODO(verify) all of these names.` | BD-110 |
| 450 | `pipeline/tests/test_donki.py` | 298 | verify | `TODO(verify): CMEAnalysis field names (time21_5, associatedCMEID, ...) w` | BD-110 |
| 451 | `pipeline/tests/test_main.py` | 281 | verify | `0, 100], 'resolutions_m': [32, 2], 'tile_size_px': 256, 'format': 'png'}, 'legend': {'stops': 'TODO(verify)'}}` | BD-17 |
| 452 | `pipeline/tests/test_main.py` | 371 | verify | `record['legend'] = {'stops': 'TODO(verify)'}` | BD-17 |
| 453 | `pipeline/tests/test_main.py` | 382 | decision | `assert 'TODO(decision)' in warnings` | BD-17 |
| 454 | `pipeline/tests/test_main.py` | 392 | verify | `legend = {'stops': 'TODO(verify)'} if name == 'thermal_inertia' else {}` | BD-17 |
| 455 | `pipeline/tests/test_main.py` | 453 | verify | `ptional': False, 'legend': {'stops': 'TODO(verify)'} if name == 'elevation' else {}, 'tile_grid': {'origin_m':` | BD-17 |
| 456 | `pipeline/tests/test_make_mars24_reference.py` | 3 | verify | `marstime is not pinned in the pipeline environment (TODO(verify) in docs/tasks/TASK-06), so this test` | BD-55 |
| 457 | `pipeline/tests/test_manifest.py` | 33 | verify | `# NFR-09 (02 §F): site bundle ‹= 250 MB. TODO(verify): decimal MB (used here, the stricter` | BD-111 |
| 458 | `pipeline/tests/test_manifest.py` | 41 | verify | `# TODO(verify): file names of the 5 m source rasters under pipeline/work/.` | BD-12 |
| 459 | `pipeline/tests/test_rad.py` | 12 | verify | `TODO(verify): "the last sample adds nothing" must agree with the Hab Cor` | BD-25 |
| 460 | `pipeline/tests/test_spice_tables.py` | 39 | verify | `is unverified, see the TODO(verify) below). Orbiter geometry uses the Mars body centre (NAIF 49` | BD-24 |
| 461 | `pipeline/tests/test_spice_tables.py` | 77 | verify | `TODO(verify): orbiter SPKs (MRO, MAVEN, TGO) are usually centred on Mars` | BD-24 |
| 462 | `pipeline/tests/test_spice_tables.py` | 549 | verify | `"TODO(verify): check the orbiter SPK coverage and the LSK/PCK for 02 L10.` | BD-24 |
| 463 | `pipeline/tests/fixtures/make_mars24_reference.py` | 14 | verify | `The committed F6 JSON was NOT regenerated (marstime is not pinned; TODO(verify)): its four records` | BD-55 |
| 464 | `pipeline/tests/fixtures/make_mock_site.py` | 6 | verify | `TODO(verify): the tiles-root index format is not part of C9 (tiles.py).` | BD-22 |
| 465 | `pipeline/tests/fixtures/make_mock_site.py` | 82 | decision | `# the single-site case (map open point 11: candidates in F4 are TODO(decision)).` | BD-31 |
| 466 | `pipeline/tests/fixtures/make_mock_site.py` | 182 | verify | `"licence": "TODO(verify)", "accessed": manifest["sources"][0]["accessed"],` | BD-13 |
| 467 | `pipeline/tests/fixtures/make_mock_site.py` | 184 | verify | `"from F.1, not a retrieval. TODO(verify): complete metadata."})` | BD-13 |
| 468 | `pipeline/sites/README.md` | 30 | verify | `An unknown field holds the string "TODO(verify)" while the record is being written. None may remain when T` | BD-05 |
| 469 | `pipeline/sites/gale_boxwork/layers/elevation.json` | 9 | verify | `"legend": {"type": "ramp", "stops": "TODO(verify)"},` | BD-17 |
| 470 | `pipeline/sites/gale_boxwork/layers/thermal_inertia.json` | 9 | verify | `"legend": {"type": "ramp", "stops": "TODO(verify)"},` | BD-17 |
| 471 | `pipeline/sites/gale_boxwork/layers/thermal_inertia.json` | 16 | verify | `ver zero. One TI pixel covers 400 routing cells at 5 m. The cube unit is TODO(verify) against the ISIS label."` | BD-26 |
| 472 | `pipeline/sites/gale_boxwork/sources/apollo17-planning.json` | 7 | verify | `"instruments": ["TODO(verify)"],` | BD-13 |
| 473 | `pipeline/sites/gale_boxwork/sources/apollo17-planning.json` | 8 | verify | `"version": "TODO(verify)",` | BD-13 |
| 474 | `pipeline/sites/gale_boxwork/sources/apollo17-planning.json` | 11 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 475 | `pipeline/sites/gale_boxwork/sources/apollo17-planning.json` | 13 | verify | `"accuracy_note": "TODO(verify): The required source_id and technical specification name Ap` | BD-13 |
| 476 | `pipeline/sites/gale_boxwork/sources/hassler-2014-rad.json` | 16 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 477 | `pipeline/sites/gale_boxwork/sources/mars24-allison-mcewen-2000.json` | 6 | verify | `"missions": ["TODO(verify)"],` | BD-13 |
| 478 | `pipeline/sites/gale_boxwork/sources/mars24-allison-mcewen-2000.json` | 7 | verify | `"instruments": ["TODO(verify)"],` | BD-13 |
| 479 | `pipeline/sites/gale_boxwork/sources/mars24-allison-mcewen-2000.json` | 12 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 480 | `pipeline/sites/gale_boxwork/sources/nasa-msl-blog-sols-4620-4621.json` | 19 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 481 | `pipeline/sites/gale_boxwork/sources/nasa-msl-blog-sols-4649-4654.json` | 22 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 482 | `pipeline/sites/gale_boxwork/sources/nasa-msl-blog-sols-4675-4681.json` | 22 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 483 | `pipeline/sites/gale_boxwork/sources/nasa-msl-blog-sols-4695-4701.json` | 17 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 484 | `pipeline/sites/gale_boxwork/sources/nasa-msl-blog-sols-4709-4715.json` | 18 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 485 | `pipeline/sites/gale_boxwork/sources/nasa-msl-blog-sols-4716-4722.json` | 20 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 486 | `pipeline/sites/gale_boxwork/sources/nasa-msl-blog-sols-4845-4851.json` | 19 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 487 | `pipeline/sites/gale_boxwork/sources/nasa-msl-boxwork-article-2025-06.json` | 5 | verify | `"authors": "TODO(verify)",` | BD-13 |
| 488 | `pipeline/sites/gale_boxwork/sources/nasa-msl-boxwork-article-2025-06.json` | 10 | verify | `"TODO(verify)"` | BD-13 |
| 489 | `pipeline/sites/gale_boxwork/sources/nasa-msl-boxwork-article-2025-06.json` | 14 | verify | `"credit": "NASA/JPL-Caltech/MSSS (images on the page); text credit TODO(verify)",` | BD-13 |
| 490 | `pipeline/sites/gale_boxwork/sources/nasa-msl-boxwork-article-2025-06.json` | 15 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 491 | `pipeline/sites/gale_boxwork/sources/pds-msl-places-localizations.json` | 4 | verify | `"publisher": "TODO(verify)",` | BD-13 |
| 492 | `pipeline/sites/gale_boxwork/sources/pds-msl-places-localizations.json` | 14 | verify | `ert G. Deen (2024), Collection of localization data products for Rover PLACES; credit statement TODO(verify)",` | BD-102 |
| 493 | `pipeline/sites/gale_boxwork/sources/pds-msl-places-localizations.json` | 15 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 494 | `pipeline/sites/gale_boxwork/sources/pds-msl-places-sis-1-3.json` | 10 | verify | `"TODO(verify)"` | BD-13 |
| 495 | `pipeline/sites/gale_boxwork/sources/pds-msl-places-sis-1-3.json` | 15 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 496 | `pipeline/sites/gale_boxwork/sources/simonsen-2024-rad.json` | 15 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 497 | `pipeline/sites/gale_boxwork/sources/tobler-1993.json` | 6 | verify | `"missions": ["TODO(verify)"],` | BD-13 |
| 498 | `pipeline/sites/gale_boxwork/sources/tobler-1993.json` | 7 | verify | `"instruments": ["TODO(verify)"],` | BD-13 |
| 499 | `pipeline/sites/gale_boxwork/sources/tobler-1993.json` | 13 | verify | `"accuracy_note": "TODO(verify): The required source_id names Tobler's original 1993 work,` | BD-13 |
| 500 | `pipeline/sites/gale_boxwork/sources/usgs-gale-ortho-25cm-v3.json` | 14 | verify | `ghbour sample); 136,454 sampled window pixels have valid-mask black RGB values whose meaning is TODO(verify)."` | BD-18 |
| 501 | `pipeline/sites/gale_boxwork/sources/usgs-themis-ti-30s120e.json` | 14 | verify | `approximately 20%. The cube's unit is TODO(verify) against its ISIS label; 02 §C.2 L4 specifies tiu (J m⁻² K⁻¹` | BD-26 |
| 502 | `pipeline/spice/kernels.lock.json` | 2 | verify | `utc ISOC, UTC); covers_window means one coverage interval spans the whole window. Unknowns are TODO(verify).",` | BD-24 |
| 503 | `pipeline/spice/kernels.lock.json` | 183 | verify | `) probably comes from predicted data: TODO(verify). The listing also has fsp_336 to fsp_351, which em16_ops.tm` | BD-24 |
| 504 | `pipeline/spice/kernels.lock.json` | 183 | verify | `f them holds reconstructed data for 18-20 May is TODO(verify) (not downloaded). Load before em16_tgo_fsp_352."` | BD-24 |
| 505 | `pipeline/spice/kernels.lock.json` | 244 | verify | `red 2024-09-23, reconstructed); before that: fsp_335 (delivered 2024-05-17), probably predicted: TODO(verify)"` | BD-24 |
| 506 | `pipeline/cache/donki/README.md` | 21 | verify | `- Host migration note (TODO(verify)): Direct requests to the legacy host https://kauai.ccmc` | BD-110 |
| 507 | `pipeline/cache/donki/README.md` | 21 | verify | `startDate=2024-05-13&endDate=2024-05-24. Update the host in docs/ops/data-downloads.md row D11 (TODO(verify)).` | BD-110 |
| 508 | `pipeline/cache/donki/README.md` | 36 | verify | `Both SEP and WSAEnlilSimulations (marked TODO(verify) in D11) resolved with HTTP 200 on the CCMC web service.` | BD-110 |
| 509 | `scenarios/storm-sol4190/stop_tasks.md` | 15 | decision | `ither-task is the engine's call (T31.04, TODO(decision)) / Proposed: follows 01 FR-50 and 05; the prototype co` | BD-109 |
| 510 | `schemas/plan-export.schema.json` | 368 | decision | `"$comment": "sampled every 5 m. TODO(decision): U-11, store profile arrays in the export or recompute on i` | BD-64 |
| 511 | `data/sites/mock_site/site-manifest.json` | 313 | verify | `om local reference \u00a79; accessed date copied from F.1, not a retrieval. TODO(verify): complete metadata.",` | BD-31 |
| 512 | `data/sites/mock_site/site-manifest.json` | 316 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 513 | `data/sites/mock_site/site-manifest.json` | 326 | verify | `om local reference \u00a79; accessed date copied from F.1, not a retrieval. TODO(verify): complete metadata.",` | BD-31 |
| 514 | `data/sites/mock_site/site-manifest.json` | 329 | verify | `"licence": "TODO(verify)",` | BD-13 |
| 515 | `data/sites/gale_boxwork/README.md` | 10 | decision | `tiles root also has the index file its Asset hash covers (format: contract C9, TODO(decision)) / OpenLayers /` | BD-22 |
