# Data download list

| | |
| --- | --- |
| **Owner** | R1 Data & GIS — Obidit Islam (support Mishkat Ahmed Khan) ([06 §A.1](../specs/06_High_Level_Implementation_Plan.md#a1-roles)) |
| **Date** | 2026-11-05 |
| **Status** | Draft for the 6 Nov kickoff. Each source is labelled **Confirmed** (URL or product seen on its official page on 5 Nov) or `TODO(verify)` (still to open and check) |
| **Related** | [02 §C Mars data](../specs/02_Technical_Requirements_Document.md#c-mars-data-and-geospatial-handling) (owns layers L1–L12) · [05 §E.5 sources lock](../specs/05_Backend_and_Database_Schema.md) · [TASK-01](../tasks/TASK-01_feasibility.md) · [TASK-03](../tasks/TASK-03_preprocessing-pipeline.md) · [TASK-04](../tasks/TASK-04_vectors-pois-images.md) · [06 §C TASK-21](../specs/06_High_Level_Implementation_Plan.md#c2-new-in-v2-surface-ops-tier-1-unless-marked) · `pipeline/sources.lock.json` |

This is the shopping list for every file the pipeline needs before the event. It does not change what the layers are; [02 §C](../specs/02_Technical_Requirements_Document.md#c-mars-data-and-geospatial-handling) owns that. It answers three questions per file: where exactly to get it, where to put it, and who needs it by when.

## A. Rules for every download

1. **Use campus internet, not venue Wi-Fi.** Several files are gigabytes.
2. **Save into `pipeline/work/<layer>/`.** That folder is git-ignored ([05 §B](../specs/05_Backend_and_Database_Schema.md)). Never commit a downloaded dataset or a large binary.
3. **Record each file** in `pipeline/sources.lock.json`: the exact URL you used, the access date, the product version and the `sha256sum` of the file.
4. **Read before you trust.** Open each product's label or readme and note the no-data value, units and coordinate system before processing ([02 §C.4](../specs/02_Technical_Requirements_Document.md#c4-mars-specific-pitfalls-to-test-explicitly)).
5. **Never invent a value.** If a page or file does not say something, write `TODO(verify)` in the notes. No AI-generated numbers go into any data file.
6. **Credit as you go.** Copy the credit line from the product page into the sources table (TASK-04); the app shows it in Sources & methods (SCR-09).

## B. Download list

Sizes are as stated on the product page. "Needed by" uses the re-dated plan in [06 §F](../specs/06_High_Level_Implementation_Plan.md#f-pre-event-schedule-512-nov).

### B.1 Terrain and imagery (Tier 0, critical path)

| # | Layer | Dataset | Exact source | Size | Save to | Needed by | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | L2 elevation | USGS *Mars MSL Gale Merged DEM 1 m*, v3 (Parker & Calef 2016) | File: `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` · page: <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m> | 3.6 GB | `pipeline/work/dem/` | **Start tonight (5 Nov)**; TASK-01 on 6 Nov | **Confirmed** (URL listed as the online file link on the USGS page) |
| D2 | L1 basemap (colour) | Colour HiRISE LRGB mosaic, cloud-optimised GeoTIFF (COG) | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` | about 1 GB | `pipeline/work/ortho/` | 6 Nov | **Confirmed** (listed on the orthophoto product page) |
| D3 | L1 basemap (grayscale, only if D2 does not cover the AOI) | USGS *Mars MSL Gale Merged Orthophoto Mosaic 25 cm*, v3 (Calef & Parker 2016) | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` · page: <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm> | 23 GB | Do not download in full: read only the AOI window with GDAL's `/vsicurl/` | 7 Nov | **Confirmed** |
| D4 | L4 thermal inertia | USGS *THEMIS Thermal Inertia Mosaic, Quantitative (32-bit), 100 m/px*, tile **30S120E** (covers 0–30° S, 120–180° E, which includes Gale) | Product page pattern from the 30S060E tile: <https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s060e_100mpp>; the 30S120E page and its file link are `TODO(verify)` | `TODO(verify)` | `pipeline/work/ti/` | 8 Nov | Product family **Confirmed**; tile URL `TODO(verify)`. Fallback: THEMIS Day IR 100 m from ASU (02 L4) |

Licences and credits: USGS Astrogeology lists "None" as the use constraint for D1–D3, with "credit authors". Credit line for D1–D3: *NASA/JPL-Caltech/University of Arizona; USGS Astrogeology (Calef & Parker 2016; Parker & Calef 2016)*. The DEM blends HiRISE, CTX, **ESA Mars Express HRSC** and MOLA, so it also counts toward the partner-agency criterion (02 §C.5).

### B.2 Mission vectors and ground images (Tier 0)

| # | Layer | Dataset | Exact source | Save to | Needed by | Status |
| --- | --- | --- | --- | --- | --- | --- |
| D5 | L6 traverse (preferred) | Curiosity localisations from the PDS PLACES archive (doi:10.17189/1520397), the source the PDS MSL Analyst's Notebook map uses | PDS Geosciences Node; the MSL file path is `TODO(verify)` (the Mars 2020 equivalent is a `best_interp.csv` in the `mars2020_rover_places` bundle) | `pipeline/work/traverse/` | 7 Nov | Archive **Confirmed**; MSL file path `TODO(verify)` |
| D6 | L6 traverse (fallback) | NASA "Where is Curiosity?" waypoints GeoJSON (MMGIS) | `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` — not an official API; cache once and label it unofficial | `pipeline/work/traverse/` | 7 Nov | `TODO(verify)` that it still resolves (the Mars 2020 equivalents are widely used; the MSL path appears commented out in one library) |
| D7 | POI ground images | 6–8 Curiosity Navcam/Mastcam images for the POIs, saved by hand from NASA raw-image or Photojournal pages | One page URL per image, recorded with its credit (*NASA/JPL-Caltech*; *NASA/JPL-Caltech/MSSS* for Mastcam) | `data/sites/gale_boxwork/images/` (git-ignored, release asset) | 9 Nov | Do **not** use the Mars Rover Photos API (archived, 02 L6) |

### B.3 Storm replay: radiation, space weather and orbit geometry (Tier 1, killer demo)

| # | Layer | Dataset | Exact source | Size | Save to | Needed by | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D8 | L9 RAD dose rate (preferred) | *MSL/RAD Dose rates* — E-detector dose rate, original and notch-filtered, with columns for date-time, day of year, sol, and dose rate in µGy per day; 88 samples per sol. Curated by the RAD team at Kiel University (Heber, Löwe), EU SPEARHEAD project | <https://zenodo.org/records/20536564> (doi:10.5281/zenodo.20536564), file `doseE_sol_filter_update.txt`; licence CC BY 4.0 | 26.6 MB | `pipeline/work/rad/` | 8 Nov | Dataset **Confirmed** (published 4 Jun 2026). That it covers sol 4190: `TODO(verify)` on download (U-15) |
| D9 | L9 RAD (NASA archive, cross-check) | PDS PPI Node MSL RAD reduced data records (`MSL-M-RAD-3-RDR-V1.0`, one ASCII file per sol) and the NASA SPDF level-2 dose-rate CDF files (`.../aaa_planetary/msl/rad/cdf/obs-l2/` on `spdf.gsfc.nasa.gov`) | Product docs: <https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DOCUMENT/RAD_RDR_SIS.PDF>; the sol-4190 file paths are `TODO(verify)` | small (one sol) | `pipeline/work/rad/` | 8 Nov | Archives **Confirmed**. PDS MSL Release 41 (announced Feb 2026) already covers sols 4613–4709 with RAD, so sol 4190 should be archived: **Proposed**, verify |
| D10 | L9 event facts | NASA release *NASA Watches Mars Light Up During Epic Solar Storm* (10 Jun 2024): 8,100 µGy at the surface, X12 flare estimate from Solar Orbiter | <https://www.nasa.gov/solar-system/planets/mars/nasa-watches-mars-light-up-during-epic-solar-storm> | — | cite only | 8 Nov | **Confirmed**; replaces the phys.org mirror in 02 Sources |
| D11 | L8 space weather | NASA CCMC **DONKI** records: flares (FLR), CMEs and their analyses (CME, CMEAnalysis), solar energetic particles (SEP), interplanetary shocks (IPS), WSA-ENLIL simulations (WSAEnlilSimulations) | Keyless CCMC web service: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/<TYPE>?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` · same records via `https://api.nasa.gov/DONKI/<TYPE>?startDate=…&endDate=…&api_key=…` (needs a free key; `DEMO_KEY` is rate-limited) | a few hundred KB | `pipeline/cache/donki/<TYPE>.json`, then committed fixtures (02 L8) | 8 Nov | Both services **Confirmed**; date window is U-44. On the CCMC service, the SEP and WSAEnlilSimulations paths are `TODO(verify)` (the docs page lists FLR, CME, CMEAnalysis, GST and IPS) |
| D12 | L10 SPICE, generic | Leap seconds `naif0012.tls`, planetary ephemeris `de440s.bsp`, planetary constants `pck00011.tpc` | NAIF generic kernels area, <https://naif.jpl.nasa.gov/naif/> | `TODO(verify)` | `pipeline/work/spice/generic/` | 8 Nov | File names from 02 L10; confirm each is still the current version in the listing (`TODO(verify)`) |
| D13 | L10 SPICE, MRO | MRO reconstructed trajectory (SPK) for 18–22 May 2024 | Easiest route: the NAIF MRO archive meta-kernel `mro_2024_v03.tm` lists the right files for 2024; download only the SPK files it names that cover the window. Archive: <https://naif.jpl.nasa.gov/pub/naif/pds/data/mro-m-spice-6-v1.0/mrosp_1000/> | `TODO(verify)` | `pipeline/work/spice/mro/` | 8 Nov | Meta-kernel **Confirmed** (named in the archive errata, which notes only a wrong creation date in its comments); SPK file names `TODO(verify)` (U-18) |
| D14 | L10 SPICE, MAVEN | MAVEN reconstructed orbit SPK, named `maven_orb_rec_YYMMDD_yymmdd_vV.bsp` | NAIF MAVEN kernels; archive docs: <https://naif.jpl.nasa.gov/pub/naif/pds/pds4/maven/maven_spice/document/spiceds_v012.html> | `TODO(verify)` | `pipeline/work/spice/maven/` | 8 Nov | Naming **Confirmed**; the file covering May 2024 `TODO(verify)` (U-18) |
| D15 | L10 SPICE, TGO (**ESA**) | ExoMars 2016 TGO trajectory SPK (`em16_tgo_fsp_*`), from the kernels listed in the ExoMars 2016 meta-kernel for 2024 | ESA SPICE Service: <https://www.cosmos.esa.int/web/spice/spice-for-exomars-2016> (FTP/HTTP, or the PDS4 `em16_spice` bundle) | `TODO(verify)` | `pipeline/work/spice/tgo/` | 8 Nov | Service **Confirmed**; file names `TODO(verify)` (U-18). Counts as partner-agency data |

Only trajectory (SPK) files are needed: we compute light time, the Sun–Earth–Mars angle and orbiter elevation over the site (02 L10). Attitude (CK) and instrument (IK) kernels are not needed. Use meta-kernels from version 003 onward for TGO; the ESA archive notes warn that older ones use a low-precision Earth rotation model.

### B.4 Tier 2 context (only after M4)

| # | Layer | Dataset | Source | Status |
| --- | --- | --- | --- | --- |
| D16 | L12 climatology | REMS RDR, PDS Atmospheres Node | Listed in 02 Sources | As in 02 |
| D17 | L5 / L12 resource layer | CRISM MTRDR summary parameters, PDS Geosciences Node | Listed in 02 Sources | AOI coverage Unresolved (02 L5) |
| D18 | L12 dust advisory | MRO MARCI daily global maps | `TODO(verify)` | Qualitative only (FR-49) |

## C. Offline assets that are not science data

No internet at runtime means every font and library must be inside the build.

| # | Asset | Source | Save to | Status |
| --- | --- | --- | --- | --- |
| F1 | Fonts from [04 §C.2](../specs/04_Design_Brief.md): Chakra Petch, Inter, IBM Plex Mono, Source Serif 4 (all SIL Open Font License) | The `google/fonts` repository on GitHub, or the `@fontsource/*` npm packages | `apps/web/public/fonts/` with each `OFL.txt` | Route is `TODO(decision)` (U-27): GitHub files add no dependency; `@fontsource` adds four small dev dependencies but pins versions. The prototype may load Google Fonts online; **the product must not** |
| F2 | JavaScript libraries (OpenLayers, proj4, Fastify, `ws`) | npm, already in `package-lock.json` | `node_modules/` via `npm ci` | No action |

## D. Tools for the pipeline

`spiceypy` is added to `pipeline/environment.yml` (conda-forge) in the same commit as this file. It is required by 02 L10 and was missing from the environment. Run `make setup`, then `make check-env`. The other pipeline libraries (GDAL, rasterio, pyproj, numpy) were already listed.

## E. Tonight and tomorrow (5–6 Nov)

1. Start D1 (3.6 GB) and D2 (about 1 GB) now; both are needed for the AOI decision on 6 Nov.
2. Fetch D8 (26.6 MB) and check that the `sol` column contains 4190, then record what you find in U-15.
3. On 6 Nov, after the kickoff, open the D4, D5 and D6 pages and fill in the `TODO(verify)` cells above.
4. D9 to D15 are due on 8 Nov for TASK-21; the R1 lead may hand D11 and D12 to whoever supports R1.

## Unresolved items owned by this document

| ID | Item | Owner | Due |
| --- | --- | --- | --- |
| U-15 | RAD sol-4190 time series. **Updated 2026-11-05:** a public source exists (D8, plus NASA archives D9); remaining check is coverage of sol 4190 and detector choice (U-45) | R1 | 8 Nov |
| U-18 | Exact SPICE SPK files for 18–22 May 2024 (MRO via `mro_2024_v03.tm`, MAVEN, TGO) | R1 | 8 Nov |
| U-27 | Font licences and self-hosting route (F1) | R6 (design) | 7 Nov |
| U-44 | DONKI date window for the scenario. Proposed: 13–24 May 2024, which includes the 15 May CME record cited in 02 L8 and the 20 May event (`TODO(decision)`) | R1 + R6 | 8 Nov |
| U-45 | Which RAD dose product matches NASA's published 8,100 µGy event total (D8 is the E detector; D9 carries the B and E detectors). The replayed curve must be consistent with the published total, or the difference must be explained in Sources & methods | R1 + R2 | 9 Nov |
