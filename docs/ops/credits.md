# Dataset and image credits (T04.06)

| | |
| --- | --- |
| **Owner** | Sadman Shaharier Mahim, product & systems lead · R4 Hab Core · demo story ([T04.06](../tasks/TASK-04_vectors-pois-images.md#t0406--write-the-dataset-and-image-credits-list)) |
| **Date** | 2026-11-09 |
| **Status** | Agent compilation for the story lead's review. Every credit string is copied from 02, a DataSource record, or a cited ops note; licences that the records leave as `TODO(verify)` stay so. Not yet checked against the live source pages |
| **Related** | [02 §C.2 data layers](../specs/02_Technical_Requirements_Document.md#c2-data-layers) · [02 Sources](../specs/02_Technical_Requirements_Document.md#sources-accessed-2026-11-02) · [05 DataSource](../specs/05_Backend_and_Database_Schema.md#datasource) · [THEMIS, HiRISE and CRISM coverage](feasibility/coverage.md) · [Data downloads](data-downloads.md) · [RAD series](rad-series.md) · [DONKI cache](../../pipeline/cache/donki/README.md) · [SPICE kernel lock](../../pipeline/spice/kernels.lock.json) · [Records](../../pipeline/sites/README.md#records) |

This list serves NFR-07 (credit every dataset and image) and FR-04. The app shows credits from the DataSource records (SCR-09); the README (T16.03) and SCR-09 (T12.03) keep their own copies, and T16.05 checks that they agree with this file.

How to read it:

- A credit in quotation marks is copied character for character from its named origin. Nothing is written from memory or paraphrased. Where two origins give different strings, both are shown and the difference is listed under [Disagreements between 02 and the records](#disagreements-between-02-and-the-records).
- "Record" means a file in `pipeline/sites/gale_boxwork/sources/`. "No record" means no DataSource record exists yet for that dataset.
- "02 title" is the heading of the layer in 02 §C.2 without its `Lx —` prefix and its FR list.
- Licence and use-constraint cells say where the words come from. `TODO(verify)` means the origin does not state it.
- Layer source lists: `layers/hazard_flags.json` lists the DEM and THEMIS records and has no 02 §C.2 layer of its own, so its credit comes from L2 and L4. `layers/comm_hab.json` lists only the DEM record; 02 L11 uses the DEM only. Not a disagreement.

## Datasets

### Built layers (site `gale_boxwork`)

| Layer (02 §C.2) and layer record | 02 title | Publisher | Credit string | Use constraints / licence | Source URL | source_id |
| --- | --- | --- | --- | --- | --- | --- |
| L1 · record `ortho` | Optical basemap | USGS Astrogeology Science Center | "NASA/JPL-Caltech/University of Arizona; USGS Astrogeology (Calef & Parker 2016)" (02 L1 and record, identical) | "use constraints: none, credit authors" (02 L1, Confirmed); record: "Use constraints: none, credit authors" | <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm> | `usgs-gale-ortho-25cm-v3` |
| L2 · records `elevation`, `hillshade` | Topography: elevation, hillshade | USGS Astrogeology Science Center | Record: "Please credit authors". 02 L2 states no attribution line. [Data downloads](data-downloads.md#b1-terrain-and-imagery-tier-0-critical-path) gives for D1–D3: "NASA/JPL-Caltech/University of Arizona; USGS Astrogeology (Calef & Parker 2016; Parker & Calef 2016)" | Record: "Use constraints: none". 02 L2 states none | <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m> | `usgs-gale-dem-1m-v3` |
| L3 · record `slope` | Slope | Derived by the team from the L2 DEM (Horn method) | Proposed: credit L2 (02 states no attribution for L3/L11) — TODO(decision) | Inherits L2 (Proposed) | none (derived) | `usgs-gale-dem-1m-v3` |
| L4 · records `thermal_inertia`, `hazard_flags` | Thermal inertia | USGS Astrogeology Science Center | Record: "Please cite authors". 02 L4 states no attribution line | Record: "Access constraints: public domain; use constraints: please cite authors" | <https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s120e_100mpp> | `usgs-themis-ti-30s120e` |
| L6 · record `traverse` | Mission vectors | Record: `TODO(verify)` | Record: "Robert G. Deen (2024), Collection of localization data products for Rover PLACES; credit statement TODO(verify)" | Record: `TODO(verify)` | <https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/localized_interp.csv> | `pds-msl-places-localizations` |
| L6 · record `pois` | Mission vectors | The curated POI records; sources and images listed under [POI images](#poi-images) and [Text and position sources](#text-and-position-sources) | Per source, below | Per source, below | per source, below | ten ids in `layers/pois.json` (all listed below) |
| L7 · env constants `rad-gale-dose-eq-solar-max` | Environmental values | American Association for the Advancement of Science (record) | Record: "Hassler et al., 2014" | Record: `TODO(verify)` | <https://pubmed.ncbi.nlm.nih.gov/24324275/> (doi:10.1126/science.1244797) | `hassler-2014-rad` |
| L7 · env constants `rad-gale-dose-eq-solar-min` | Environmental values | NASA Technical Reports Server (record) | Record: "Simonsen et al., 2024" | Record: `TODO(verify)` | <https://ntrs.nasa.gov/api/citations/20240009831/downloads/NAS%20BPS%20Simonsen%20v4%20strives.pdf> | `simonsen-2024-rad` |
| L7 · solar time (computed, no layer record) | Environmental values | NASA Goddard Institute for Space Studies (record) | Record: "Mars24: Robert B. Schmunk; algorithms: Michael D. Allison; algorithm reference: Allison, M., and M. McEwen (2000), A post-Pathfinder evaluation of aerocentric solar coordinates with improved timing recipes for Mars seasonal/diurnal climate studies (Planetary and Space Science; © 2000 Elsevier Science Ltd)." | Record: `TODO(verify)` | <https://www.giss.nasa.gov/tools/mars24/help/credits.html> (doi:10.1016/S0032-0633(99)00092-6) | `mars24-allison-mcewen-2000` |
| L11 · record `comm_hab` | Hab antenna coverage grid | Derived by the team from the L2 DEM (line-of-sight viewshed) | Proposed: credit L2 (02 states no attribution for L3/L11) — TODO(decision) | Inherits L2 (Proposed) | none (derived) | `usgs-gale-dem-1m-v3` |

### Storm replay data (v2, scenario `storm-sol4190`)

No DataSource record exists yet for L8, L9 or L10. The credit strings below come from the ops notes named in each row, not from a record. Adding the records is `TODO(decision)` for the data lead, with the credits below as the starting text.

| Layer (02 §C.5) | 02 title | Publisher | Credit string | Use constraints / licence | Source URL | source_id |
| --- | --- | --- | --- | --- | --- | --- |
| L8 | Space weather records | NASA Community Coordinated Modeling Center (CCMC), Goddard Space Flight Center | "NASA Community Coordinated Modeling Center (CCMC) / Moon-to-Mars (M2M) Space Weather Analysis Office, DONKI (Database Of Notifications, Knowledge, Information), NASA Goddard Space Flight Center." ([DONKI cache README](../../pipeline/cache/donki/README.md)). Shown as `replayed`, never as truth (02 L8) | `TODO(verify)`. 02 L8: DONKI products are labelled experimental research information by CCMC | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/<TYPE>?startDate=2024-05-13&endDate=2024-05-24` (types FLR, CME, CMEAnalysis, SEP, IPS, WSAEnlilSimulations); 02 example page <https://webtools.ccmc.gsfc.nasa.gov/DONKI/view/WSA-ENLIL/30907/1> | none yet |
| L9 (preferred) | RAD event time series | RAD team, Kiel University (Heber, Löwe), EU SPEARHEAD project; hosted on Zenodo | "Heber, Bernd; Löwe, Jan Leo (2026). *MSL/RAD Dose rates*. Zenodo. doi:10.5281/zenodo.20536564. CC BY 4.0" ([rad-series.md](rad-series.md#versions-and-licences)) | CC BY 4.0 (Zenodo API `license.id`: `cc-by-4.0`, per rad-series.md; 02 L9 agrees) | <https://zenodo.org/records/20536564> | none yet |
| L9 (cross-check) | RAD event time series | NASA SPDF, `msl_rad_obs-l2` CDF | CDF `Acknowledgement`: "Please acknowledge the RAD Principal Investigator Dr. Hassler of Southwest Research Institute Boulder." | CDF `Rules_of_use`: "The RAD data are archived as fully citable data. Please consult the RAD team for further details on processing and usage of these data." No licence name; `TODO(verify)` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024144_v03.cdf> | none yet |
| L9 (cross-check) | RAD event time series | NASA PDS Planetary Plasma Interactions Node, `MSL-M-RAD-3-RDR-V1.0` | "NASA PDS Planetary Plasma Interactions Node; RAD PI D. Hassler (SwRI)" ([rad-series.md](rad-series.md#versions-and-licences)) | "PDS archive; licence not stated in the label, `TODO(verify)`" (rad-series.md) | <https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/SOL_04134_04257/RAD_RDR_2024_140_18_30_4190_V00.LBL> | none yet |
| L9 (event facts) | RAD event time series | NASA release, 10 Jun 2024: *NASA Watches Mars Light Up During Epic Solar Storm* (8,100 µGy at the surface; X12 flare estimate from Solar Orbiter) | `TODO(verify)`: the release's own credit line is not recorded | `TODO(verify)` | <https://www.nasa.gov/solar-system/planets/mars/nasa-watches-mars-light-up-during-epic-solar-storm> | none yet |
| L10 | SPICE geometry | NASA NAIF (generic kernels `naif0012.tls`, `de440s.bsp`, `pck00011.tpc`, `mar099s.bsp`; MRO `mro_psp71.bsp`, `mro_psp71_ssd_mro95a.bsp`; MAVEN `maven_orb_rec_240401_240701_v1.bsp`) | `TODO(verify)`: no NAIF credit line is recorded | `TODO(verify)` | <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/> · <https://naif.jpl.nasa.gov/pub/naif/pds/data/mro-m-spice-6-v1.0/mrosp_1000/> · <https://naif.jpl.nasa.gov/pub/naif/MAVEN/kernels/spk/> (exact files and hashes: [kernels.lock.json](../../pipeline/spice/kernels.lock.json)) | none yet |
| L10 (ESA, partner agency) | SPICE geometry | ESA SPICE Service (ExoMars 2016 TGO: `em16_tgo_fsp_335_01_20240113_20240706_v01.bsp`, `em16_tgo_fsp_352_01_20240520_20241102_v01.bsp`) | `TODO(verify)`: no ESA credit line is recorded. 02 §C.5 requires stating ESA TGO as partner-agency data on the project page and in the video | `TODO(verify)` | <https://spiftp.esac.esa.int/data/SPICE/ExoMars2016/kernels/spk/> · <https://www.cosmos.esa.int/web/spice> | none yet |

### Planned, not in the build

CRISM: [feasibility.md](feasibility.md#crism-coverage-u-05) records the data lead's decision of 2026-11-07 that FR-18 is in scope as a desirable (TASK-18), using the single observation `FRT0000B6F1`. No layer or DataSource record exists yet (T18.01 is not started), so L5 is listed here, not above. If L5 is not built, delete its row (T04.06 step 1: L5 only if built).

| Layer (02 §C.2) | 02 title | Publisher | Credit string | Use constraints / licence | Source URL | source_id |
| --- | --- | --- | --- | --- | --- | --- |
| L5 (planned, desirable) | Spectral | PDS Geosciences Node; bundle *Mars Reconnaissance Orbiter CRISM MTRDR Bundle*, Murchie and Hash, DOI 10.17189/2bd6-cs64 ([coverage.md](feasibility/coverage.md#crism-mtrdr-l5-d17)) | `TODO(verify)`: no credit line is recorded. UI label from 02 L5: "Spectral summary parameter — indicative, not a mineral identification" | `TODO(verify)` | <https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/> (02 Sources names <https://pds.nasa.gov/data/pds4/releases/geo/mro_crism_mtrdr-20250413/readme.txt>) | none yet |
| L7 / L12 (desirable, not planned for the build) | Environmental values; Optional context | PDS Atmospheres Node, MSL REMS RDR | `TODO(verify)`: no credit line is recorded | `TODO(verify)` | <https://atmos.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/rems.html> | none yet |
| L12 (Tier 2, not planned for the build) | Optional context | MRO MARCI daily global maps | `TODO(verify)`: source URL is `TODO(verify)` in [data-downloads.md](data-downloads.md#b4-tier-2-context-only-after-m4) D18 | `TODO(verify)` | `TODO(verify)` | none yet |

## POI images

All five images are credited exactly as the POI record's `image_credit`. The image files are saved by hand into `pipeline/work/images/` and are not committed, and per [status](../tasks/status.md) none is saved yet, so each row also needs its saved file name checked by the story lead. 02 L6 sets the credit pattern: "NASA/JPL-Caltech" (MSSS for Mastcam).

| POI id | Camera | Sol | Date | Credit (`image_credit`) | Image source URL (`image_source_url`) | Image asset |
| --- | --- | --- | --- | --- | --- | --- |
| `poi-boxwork-ridge` | Left Navigation Camera (Navcam) | 4650 | 2025-09-05 | "NASA/JPL-Caltech" | <https://science.nasa.gov/blog/curiosity-blog-sols-4649-4654-ridges-hollows-and-nodules-oh-my/> | `img-boxwork-ridge` |
| `poi-boxwork-veins` | Right Navigation Camera (Navcam) | 4619 | 2025-08-04 | "NASA/JPL-Caltech" | <https://science.nasa.gov/blog/curiosity-blog-sols-4620-4621-among-the-hollows-and-the-ridges/> | `img-boxwork-veins` |
| `poi-monte-grande-hollow` | Mastcam | 4693 | 2025-10-19 | "NASA/JPL-Caltech/MSSS" | <https://science.nasa.gov/blog/curiosity-blog-sols-4695-4701-searching-for-answers-at-monte-grande/> | `img-monte-grande-hollow` |
| `poi-nevado-sajama-ridge` | Left Navigation Camera (Navcam) | 4718 | 2025-11-13 | "NASA/JPL-Caltech" | <https://science.nasa.gov/blog/curiosity-blog-sols-4716-4722-drilling-success-at-nevado-sajama/> | `img-nevado-sajama-ridge` |
| `poi-sulfate-contact` | Left Navigation Camera (Navcam) | 4848 | 2026-03-27 | "NASA/JPL-Caltech" | <https://science.nasa.gov/blog/curiosity-blog-sols-4845-4851-bye-bye-boxwork-bye-bye/> | `img-sulfate-contact` |

Each POI's position comes from PDS PLACES `localized_interp.csv` v42.0 (see [Traverse](#traverse)); its `position_source` field gives the frame, sol, site and drive.

## Traverse

| Field | Value |
| --- | --- |
| Layer | `traverse` (02 §C.2 L6, preferred source) |
| Source | PDS PLACES, "Collection of localization data products for Rover PLACES", v42.0; `localized_interp.csv` created 2026-05-01 (record `version`) |
| Record | `pds-msl-places-localizations` |
| Authors | Robert G. Deen (record) |
| Publisher | `TODO(verify)` (record) |
| Credit string | "Robert G. Deen (2024), Collection of localization data products for Rover PLACES; credit statement TODO(verify)" (record) |
| Use constraints / licence | `TODO(verify)` (record) |
| URL | <https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/localized_interp.csv> |
| 02 identifier | 02 §C.2 L6 names the archive as doi:10.17189/1520397; [status T04.01](../tasks/status.md) records that this DOI is not in the labels of the cached files (`TODO(verify)`) |
| Fallback | MMGIS JSON (02 L6): not used for the traverse layer in the records; if it is ever used, label it unofficial and credit it separately |
| Companion document | `pds-msl-places-sis-1-3`, *Mars Science Laboratory Software Interface Specification: PLACES Data Products for PDS*, Release 1.3 Rev-A. Credit string: "Robert Deen (2016), PLACES Data Products for PDS SIS, JPL; Copyright 2016 California Institute of Technology, government sponsorship acknowledged". Licence `TODO(verify)`. URL <https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/document/PLACES_PDS_SIS.pdf> |

## Text and position sources

These records are cited as `evidence` in the POI records and listed in `layers/pois.json`. The blog and article credits below are the records' `credit`; they describe the page, not the image on it (image credits are in [POI images](#poi-images)). Every licence is `TODO(verify)` in its record.

| source_id | Title | Publisher | Credit string | Licence | URL |
| --- | --- | --- | --- | --- | --- |
| `nasa-msl-blog-sols-4620-4621` | Curiosity Blog, Sols 4620-4621: Among the Hollows and the Ridges | NASA | "NASA/JPL-Caltech (Curiosity blog)" | `TODO(verify)` | <https://science.nasa.gov/blog/curiosity-blog-sols-4620-4621-among-the-hollows-and-the-ridges/> |
| `nasa-msl-blog-sols-4649-4654` | Curiosity Blog, Sols 4649-4654: Ridges, Hollows and Nodules, Oh My | NASA | "NASA/JPL-Caltech (Curiosity blog)" | `TODO(verify)` | <https://science.nasa.gov/blog/curiosity-blog-sols-4649-4654-ridges-hollows-and-nodules-oh-my/> |
| `nasa-msl-blog-sols-4675-4681` | Curiosity Blog, Sols 4675-4681: Deciding Where to Dig Into the Boxworks | NASA | "NASA/JPL-Caltech (Curiosity blog)" | `TODO(verify)` | <https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/> |
| `nasa-msl-blog-sols-4695-4701` | Curiosity Blog, Sols 4695-4701: Searching for Answers at Monte Grande | NASA | "NASA/JPL-Caltech (Curiosity blog)" | `TODO(verify)` | <https://science.nasa.gov/blog/curiosity-blog-sols-4695-4701-searching-for-answers-at-monte-grande/> |
| `nasa-msl-blog-sols-4709-4715` | Curiosity Blog, Sols 4709-4715: Drilling High and Low in the Boxwork Unit | NASA | "NASA/JPL-Caltech (Curiosity blog)" | `TODO(verify)` | <https://science.nasa.gov/blog/curiosity-blog-sols-4709-4715-drilling-high-and-low-in-the-boxwork-unit/> |
| `nasa-msl-blog-sols-4716-4722` | Curiosity Blog, Sols 4716-4722: Drilling Success at Nevado Sajama | NASA | "NASA/JPL-Caltech (Curiosity blog)" | `TODO(verify)` | <https://science.nasa.gov/blog/curiosity-blog-sols-4716-4722-drilling-success-at-nevado-sajama/> |
| `nasa-msl-blog-sols-4845-4851` | Curiosity Blog, Sols 4845-4851: Bye-Bye Boxwork, Bye-Bye | NASA | "NASA/JPL-Caltech (Curiosity blog)" | `TODO(verify)` | <https://science.nasa.gov/blog/curiosity-blog-sols-4845-4851-bye-bye-boxwork-bye-bye/> |
| `nasa-msl-boxwork-article-2025-06` | NASA's Curiosity Mars Rover Starts Unpacking Boxwork Formations | NASA | "NASA/JPL-Caltech/MSSS (images on the page); text credit TODO(verify)" | `TODO(verify)` | <https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/> |
| `pds-msl-places-sis-1-3` | Mars Science Laboratory Software Interface Specification: PLACES Data Products for PDS | Jet Propulsion Laboratory, California Institute of Technology | "Robert Deen (2016), PLACES Data Products for PDS SIS, JPL; Copyright 2016 California Institute of Technology, government sponsorship acknowledged" | `TODO(verify)` | <https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/document/PLACES_PDS_SIS.pdf> |

Authors recorded for the blog posts, for the team's attribution if the UI shows them (from the records): Sharon Wilson Purdy (4620-4621); Lucy Thompson (4649-4654 and 4845-4851); Michelle Minitti (4675-4681 and 4716-4722); William Farrand (4695-4701); Catherine O'Connell-Cooper (4709-4715); each "Mars Science Laboratory Mission Team Members". The June 2025 article's author is `TODO(verify)`.

## Method and reference sources

These records have no map layer. They are cited for the behaviour in 02 §D (walking speed and consumables). They are listed because NFR-07 covers every dataset the UI cites.

| source_id | Title | Publisher | Credit string | Licence | URL |
| --- | --- | --- | --- | --- | --- |
| `tobler-1993` | Improved prediction of hiking speeds using a data driven approach | arXiv | "Andrew Wood; William Mackaness; T. Ian Simpson; J. Douglas Armstrong; arXiv:2303.16065v6" | "Creative Commons Attribution 4.0 International (CC BY 4.0)" | <https://arxiv.org/pdf/2303.16065v6> |
| `apollo17-planning` | Apollo 15 EVA Capability And Constraints Envelopes | Bellcomm, Inc. | "P. Benjamin, Bellcomm, Inc.; Memorandum for File B70 10028, 13 October 1970. PDF document courtesy NASA Technical Reports Server." | `TODO(verify)` | <https://www.nasa.gov/wp-content/uploads/static/history/alsj/19790073512_1979073512.pdf> |

Also cited in 02 Sources with no DataSource record yet: the NASA lunar 10 km walkback test summary (<https://corpora.tika.apache.org/base/docs/govdocs1/515/515870.pdf>; listed only under 02 Sources, no section of docs/specs cites it in text, so it may be unused; credit and licence `TODO(verify)`), and the NASA Space Exploration Vehicle fact sheet FS-2011-08-045-JSC (<https://www.nasa.gov/wp-content/uploads/2015/08/464826main_sev_factsheet_508.pdf>) behind the pressurized rover values (02 U-20). Credit and licence `TODO(verify)`. The same row's second source, the Wikipedia "Space Exploration Vehicle" page, is licensed by Wikipedia; its exact licence wording and credit are `TODO(verify)`.

## Partner-agency credits (02 §C.5)

02 §C.5 requires these to be stated on the project page and in the video. Wording is `TODO(decision)` for the story lead; none is written here.

- ESA Mars Express HRSC: inside the USGS Gale merged DEM (L2).
- ESA TGO: trajectory kernels for the relay geometry (L10, above).
- Solar Orbiter (ESA/NASA): source of the 20 May 2024 flare-class estimate (L9 event facts, above).

## Disagreements between 02 and the records

Neither side is changed here. These are for the story lead and the data lead.

1. **L1 title.** 02 L1: "USGS *Mars MSL Gale Merged Orthophoto Mosaic 25 cm* v3 (Calef & Parker 2016), grayscale 23 GB lossless GeoTIFF; colour HiRISE LRGB COG (~1 GB) also published". Record `usgs-gale-ortho-25cm-v3`: title "Mars MSL Gale Merged Orthophoto Mosaic 25cm, colour version HiRISE 78 quad color basemap", authors "Parker and Calef", and a `version` that says the file name carries no version number (the id and 02 say v3). The credit and use-constraint strings match 02.
2. **L2 credit.** 02 L2 has no attribution line. The record's credit is "Please credit authors", while [data-downloads.md](data-downloads.md#b1-terrain-and-imagery-tier-0-critical-path) gives a longer line for D1–D3 that includes "Parker & Calef 2016". Which of the two the UI shows is open.
3. **L4 tile and credit.** 02 Sources gives the 30S060E example page; 02 L4 gives the 30S120E pattern with the file name "to confirm". The record and [coverage.md](feasibility/coverage.md#themis-quantitative-thermal-inertia-l4-d4) use the published `THEMIS_TI_Mosaic_Quant_30S120E_100mpp`, whose page URL was formed by pattern and opened. 02 L4 states no attribution line; the record says "Please cite authors". 02 L4 says the unit is tiu; the record says that is `TODO(verify)` against the ISIS label.
4. **L6 traverse identifier.** 02 L6 names doi:10.17189/1520397; the cached PLACES labels do not contain it (status T04.01). The record's credit names "Robert G. Deen (2024)".
5. **L7 credit wording.** 02 L7 writes "Hassler et al. 2014" and "Simonsen et al. 2024" (no comma); the records write "Hassler et al., 2014" and "Simonsen et al., 2024". Both copy their own origin here.
6. **L5 source page.** 02 Sources cites the `pds.nasa.gov` release readme; [coverage.md](feasibility/coverage.md#findings-that-disagree-with-the-specs) found the data and the footprint index on the PDS Geosciences Node (volume MROCR_4001). 02 L5 says "~18–20 m/px for FRT"; the FRT products are 18 m and the HRL products 36 m.
7. **`apollo17-planning` and `tobler-1993`.** The record `apollo17-planning` describes an Apollo 15 document although the source id and the technical specification name Apollo 17 (the record's own `accuracy_note`); `tobler-1993` describes the 2023 paper by Wood et al. at the 02 Sources URL, not Tobler's 1993 work (record `accuracy_note`). Both were reported as 02 factual problems in those records.

## Open items

- Every `TODO(verify)` above stays until someone reads the source page. The ones that block a complete NFR-07 line are: the PLACES publisher and credit statement; the NAIF and ESA SPICE credits; the CRISM credit (if built); the NASA release credit for the 20 May 2024 figures; and the licence for every NASA blog and PDS record.
- Image files: none is saved yet. Check each saved file against its row in [POI images](#poi-images) before the first release.
- If a dataset is added or dropped, change its row here in the same commit and tell T16.05, which compares this file with the README and SCR-09.
