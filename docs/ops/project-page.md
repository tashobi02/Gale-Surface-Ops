# NASA Space Apps Challenge 2026 — Project Page Text (T16.06 / T30.01)

| | |
| --- | --- |
| **Owner** | Story lead / Team lead · Obidit Islam ([docs/ops/team.md](team.md)) |
| **Date** | 2026-11-13 |
| **Status** | Drafted for submission portal ([docs/plan/frontend/31-submission.md](../plan/frontend/31-submission.md), FD-160, FD-192) |
| **Related** | [README.md](../../README.md) · [Submission Checklist](submission-checklist.md) · [Submit Now Guide](submit-now.md) · [Credits](credits.md) · [AI Use Log](../AI_USE.md) · [Hosting](hosting.md) · [ADR-006](../decisions/ADR-006-no-ai-in-mvp.md) |

---

## Project Title

Gale Surface Ops ([docs/ops/team.md](team.md), [docs/plan/frontend/decisions.md](../plan/frontend/decisions.md))

## Challenge

**Interplanetary Survival Guide: Martian Map** ([docs/ops/team.md](team.md), [README.md](../../README.md), [docs/reference/challenge-overview.md](../reference/challenge-overview.md))

## Location / Event

Dhaka, Bangladesh — Virtual Participation ([docs/ops/team.md](team.md), [docs/ops/rules.md](rules.md))

---

## Project Summary (Short Description)

> Gale Surface Ops is an offline, habitat-local surface operations and traverse planning system designed for a human exploration zone at Gale crater (Mount Sharp), created for the NASA Space Apps Challenge 2026 challenge 'Interplanetary Survival Guide: Martian Map'. Before an extravehicular activity (EVA), crew members plan a slope-bounded, suit-safe traverse on USGS Gale DEM elevation and HiRISE imagery when the real site bundle is available, incorporating slope limits, terrain caution flags, line-of-sight habitat communications, and pacing models. During the EVA, a local Hab Core server coordinates the mission clock, telemetry, consumables, and automated safety logic across in-EVA astronaut suit tablets and an operations console. When an unforecast solar energetic particle event strikes—replaying Curiosity's real RAD observations from the sol 4190 (20 May 2024) storm—the habitat autonomously detects the radiation spike, alerts the crew without waiting for Earth, and offers a pressurized-rover rendezvous or a haven abort. Every calculation is deterministic with zero AI computation at runtime; every displayed figure provides explicit provenance and data source traceability. The system operates fully self-contained on the habitat local area network.

*(Word count: 173 words; limit: ≤ 200 words; sources: [README.md](../../README.md), [docs/specs/01_Product_Requirements_Document.md](../specs/01_Product_Requirements_Document.md))*

---

## What It Does

Gale Surface Ops provides end-to-end mission planning and real-time execution for surface operations in a Mars Exploration Zone ([docs/specs/01_Product_Requirements_Document.md](../specs/01_Product_Requirements_Document.md) §A, [docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §A):

1. **Pre-EVA Traverse Planning:**
   - Evaluates scientific Points of Interest (POIs) and resource exploration targets across real Gale crater terrain ([docs/specs/01_Product_Requirements_Document.md](../specs/01_Product_Requirements_Document.md) FR-01, FR-02).
   - Computes least-cost, slope-bounded traversal paths over a routing grid ([docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §D.2).
   - Derives terrain slope via Horn's method on the 1 m USGS DEM (`usgs-gale-dem-1m-v3`), checking it against the scenario's caution and hard slope limits and flagging hazard and impassable cells ([docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §C.2, §D.3).
   - Verifies direct line-of-sight communication with the habitat antenna (`comm_hab` layer) and walkback haven safety margins continuously along the path ([docs/specs/01_Product_Requirements_Document.md](../specs/01_Product_Requirements_Document.md) FR-08, FR-20).
   - Generates deterministic mission briefing cards, route elevation profiles, and plan exports identified by a SHA-256 hash of their RFC 8785 canonical JSON ([docs/specs/01_Product_Requirements_Document.md](../specs/01_Product_Requirements_Document.md) FR-16, FR-17).

2. **Hab Core Live Simulation & Coordination Server:**
   - Serves as the central mission clock authority (operating at 1×, 10×, or 60× sim speed) without referencing wall-clock time ([docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §D.14).
   - Synchronizes crew positions, consumable expenditure (suit O₂, battery), and environmental readings across connected clients at up to 10 Hz over WebSocket ([docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §E.6).
   - Emits an append-only, tamper-evident JSON event log tracked by a cumulative SHA-256 hash (`log_hash`) ([docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §D.14, NFR-06).

3. **Multi-Role User Interfaces:**
   - **EVA Suit Tablet (SCR-12):** Touch-friendly, high-contrast display designed for gloved astronaut interaction, featuring turn-by-turn navigation bearings, remaining time/distance, stop task tracking (FR-50), and hold-to-confirm contingency buttons ([docs/specs/03_App_Flow_and_Diagrams.md](../specs/03_App_Flow_and_Diagrams.md) SCR-12, [docs/specs/04_Design_Brief.md](../specs/04_Design_Brief.md) §D.3, §E.5).
   - **Astronaut Heads-Up Display (HUD, SCR-13):** Glanceable, read-only view of up to five values: haven time, bearing and distance to the next target, O₂ time remaining, the alert line and the link state ([docs/specs/03_App_Flow_and_Diagrams.md](../specs/03_App_Flow_and_Diagrams.md) SCR-13).
   - **Habitat Operations Console (SCR-11):** Desktop workstation showing real-time crew tracks on the shared map, comm link status, caution/warning alerts, contingency command authorization, and robotic rover dispatch ([docs/specs/03_App_Flow_and_Diagrams.md](../specs/03_App_Flow_and_Diagrams.md) SCR-11).
   - **Post-EVA Mission Report (SCR-17):** Printable summary detailing completed vs. dropped stops, planned vs. actual timeline, cumulative radiation exposure, and the verified event log hash ([docs/specs/03_App_Flow_and_Diagrams.md](../specs/03_App_Flow_and_Diagrams.md) SCR-17).

4. **Realistic Solar Particle Event Contingency Replay:**
   - Replays Curiosity's actual Radiation Assessment Detector (RAD) observations from the intense solar particle event of 20 May 2024 (sol 4190) ([docs/ops/credits.md](credits.md), [docs/ops/rad-series.md](rad-series.md)).
   - Demonstrates autonomous habitat detection: the habitat's own system detects the dose spike without waiting for a call from Earth (Earth messages are delayed by the light time), issues the shelter warning, and offers options such as a pressurized-rover rendezvous or a haven abort ([docs/specs/01_Product_Requirements_Document.md](../specs/01_Product_Requirements_Document.md) FR-35–FR-40).

---

## How It Works Offline on the Habitat LAN

The architectural premise of Gale Surface Ops directly mirrors operational reality on Mars: there is no live internet connectivity ([README.md](../../README.md), [docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §B, §F):

- **No Runtime Internet (NFR-01, NFR-08):** All client-to-server communications occur over a local area network (LAN) hosted inside the habitat (e.g., standard Wi-Fi router or Ethernet switch). The web application requires zero external network calls.
- **Local Hab Core Server:** Implemented in Node.js with Fastify and `ws`, running locally at `0.0.0.0:8080`. It hosts the single-page web client (`apps/web/dist`), pre-packaged map tile pyramids (`data/sites/gale_boxwork/tiles/`), vector GeoJSON features (`vectors/`), and binary elevation/comm grids (`grid/`).
- **Self-Contained Browser Clients:** All fonts, icons, CSS tokens, and vendor dependencies (OpenLayers, Proj4js) are bundled into static local assets.
- **Deterministic Pure Science Engine:** Traverse pathfinding, solar geometry (Mars24 celestial algorithms), radiation dose integrals, and suited walking pacing reside in pure TypeScript within `packages/compute`. No cloud compute, external API, or AI models are involved.
- **Mars Coordinate Reference System:** All spatial math uses the `IAU_2015:49900` spherical datum (radius R = 3,396,190 m) with planetocentric latitude and east-positive longitude, projected into a local equirectangular coordinate system (`+proj=eqc`) centred at the landing site. Earth-based geometries (WGS84, EPSG:3857) are strictly forbidden ([docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §C.1).

---

## Data and Credits

All spatial, elevation, spectral, and space weather data originate from official planetary and scientific archives ([docs/ops/credits.md](credits.md), [README.md](../../README.md)):

### Primary Data Sources (DataSources)

| Source ID | Title | Publisher & Authors | Credit & Citation |
| --- | --- | --- | --- |
| `usgs-gale-dem-1m-v3` | Mars MSL Gale Merged DEM 1m | USGS Astrogeology Science Center (Parker, T.; Calef III, F. J.) | Please credit authors. Use constraints: none. URL: <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m> |
| `usgs-gale-ortho-25cm-v3` | Mars MSL Gale Merged Orthophoto Mosaic 25cm, colour version HiRISE 78 quad color basemap | USGS Astrogeology Science Center (Parker and Calef) | NASA/JPL-Caltech/University of Arizona; USGS Astrogeology (Calef & Parker 2016). URL: <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm> |
| `usgs-themis-ti-30s120e` | THEMIS Thermal Inertia Mosaic Quantitative 30S120E 100mpp | USGS Astrogeology Science Center (Fergason) | Please cite authors. Access: public domain. URL: <https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s120e_100mpp> |
| `pds-msl-places-localizations` | Collection of localization data products for Rover PLACES | NASA Planetary Data System, Imaging Node (Robert G. Deen) | Deen, Robert G. (2024), Mars Science Laboratory Rover PLACES Bundle, version 42.0, NASA PDS, doi:10.17189/8nyv-8p60. URL: <https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/localized_interp.csv> |
| `pds-msl-places-sis-1-3` | Mars Science Laboratory Software Interface Specification: PLACES Data Products for PDS | JPL / Caltech (Robert Deen, MIPL/OPGS) | Robert Deen (2016), PLACES Data Products for PDS SIS, JPL; Copyright 2016 Caltech. URL: <https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/document/PLACES_PDS_SIS.pdf> |
| `hassler-2014-rad` | Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover | AAAS / Science (Hassler, D. M. et al.) | Hassler et al., 2014. DOI: 10.1126/science.1244797. URL: <https://pubmed.ncbi.nlm.nih.gov/24324275/> |
| `simonsen-2024-rad` | The Martian Radiation Environment and Human Health Risks | NASA Technical Reports Server (Simonsen, L. C.) | Simonsen et al., 2024. NASA Technical Reports Server record 20240009831. URL: <https://ntrs.nasa.gov/api/citations/20240009831> |
| `mars24-allison-mcewen-2000` | Mars24 Sunclock — Time on Mars | NASA GISS (Robert B. Schmunk; Michael D. Allison; Megan McEwen) | Mars24: Robert B. Schmunk; algorithms: Michael D. Allison (Allison & McEwen 2000, Planetary and Space Science). URL: <https://www.giss.nasa.gov/tools/mars24/help/credits.html> |
| `tobler-1993` | Improved prediction of hiking speeds using a data driven approach | arXiv (Andrew Wood; William Mackaness; T. Ian Simpson; J. Douglas Armstrong) | Andrew Wood et al.; arXiv:2303.16065v6 (CC BY 4.0). URL: <https://arxiv.org/pdf/2303.16065v6> |
| `apollo17-planning` | Apollo 15 EVA Capability And Constraints Envelopes | Bellcomm, Inc. (P. Benjamin) | P. Benjamin, Bellcomm, Inc.; Memorandum for File B70 10028, 13 October 1970. NASA Technical Reports Server. |
| `nasa-sev-factsheet-2011` | The Space Exploration Vehicle Characteristics (Surface Concept) | NASA | NASA, NASA Facts FS-2011-08-045-JSC. URL: <https://www.nasa.gov/wp-content/uploads/2015/08/464826main_sev_factsheet_508.pdf> |
| `nasa-msl-boxwork-article-2025-06` | NASA's Curiosity Mars Rover Starts Unpacking Boxwork Formations | NASA / JPL-Caltech | NASA/JPL-Caltech/MSSS (images); text: NASA, JPL (release 2025-080). |
| `nasa-msl-blog-sols-4620-4621` | Curiosity Blog, Sols 4620-4621: Among the Hollows and the Ridges | NASA (Purdy et al.) | NASA/JPL-Caltech (Curiosity blog). |
| `nasa-msl-blog-sols-4649-4654` | Curiosity Blog, Sols 4649-4654: Ridges, Hollows and Nodules, Oh My | NASA (Thompson et al.) | NASA/JPL-Caltech (Curiosity blog). |
| `nasa-msl-blog-sols-4675-4681` | Curiosity Blog, Sols 4675-4681: Deciding Where to Dig Into the Boxworks | NASA (Minitti et al.) | NASA/JPL-Caltech (Curiosity blog). |
| `nasa-msl-blog-sols-4695-4701` | Curiosity Blog, Sols 4695-4701: Searching for Answers at Monte Grande | NASA (Farrand et al.) | NASA/JPL-Caltech (Curiosity blog). |
| `nasa-msl-blog-sols-4709-4715` | Curiosity Blog, Sols 4709-4715: Drilling High and Low in the Boxwork Unit | NASA (O'Connell-Cooper et al.) | NASA/JPL-Caltech (Curiosity blog). |
| `nasa-msl-blog-sols-4716-4722` | Curiosity Blog, Sols 4716-4722: Drilling Success at Nevado Sajama | NASA (Minitti et al.) | NASA/JPL-Caltech (Curiosity blog). |
| `nasa-msl-blog-sols-4845-4851` | Curiosity Blog, Sols 4845-4851: Bye-Bye Boxwork, Bye-Bye | NASA (Thompson et al.) | NASA/JPL-Caltech (Curiosity blog). |

### Scientific POI Images

- **Credits:** NASA/JPL-Caltech and NASA/JPL-Caltech/MSSS ([docs/ops/credits.md](credits.md) §POI images).
- POIs: `poi-boxwork-ridge` (Navcam, Sol 4650), `poi-boxwork-veins` (Navcam, Sol 4619), `poi-monte-grande-hollow` (Mastcam, Sol 4693), `poi-nevado-sajama-ridge` (Navcam, Sol 4718), `poi-sulfate-contact` (Navcam, Sol 4848).

### Space Weather Replay Data (Sol 4190 Storm Replay)

- **NASA CCMC / M2M:** Database Of Notifications, Knowledge, Information (DONKI) space weather notifications (CME, flare, SEP records for 13–24 May 2024; NASA Goddard Space Flight Center).
- **Curiosity RAD Time Series:** Heber, Bernd; Löwe, Jan Leo (2026). *MSL/RAD Dose rates*. Zenodo. doi:10.5281/zenodo.20536564. CC BY 4.0.
- **RAD Principal Investigator:** Acknowledging RAD PI Dr. Donald M. Hassler, Southwest Research Institute (SwRI) Boulder, and NASA SPDF / PDS Planetary Plasma Interactions Node.
- **NASA Ephemeris / SPICE:** NASA Navigation and Ancillary Information Facility (NAIF), JPL: planetary, MRO, and MAVEN SPICE ephemeris kernels.

### Partner-Agency Credits (02 §C.5)

- "ESA Mars Express HRSC data are part of the USGS Gale merged DEM (L2)."
- "ESA ExoMars Trace Gas Orbiter trajectory kernels (ESA SPICE Service) are used for the relay geometry (L10)."
- "The X12 flare-class estimate for 20 May 2024 comes from ESA/NASA Solar Orbiter data, as reported in NASA's release of 10 June 2024 (L9)."

---

## AI-Use Statement

- **Runtime Application:** "No AI computes or generates values in this app" ([docs/specs/03_App_Flow_and_Diagrams.md](../specs/03_App_Flow_and_Diagrams.md) SCR-09, [docs/decisions/ADR-006-no-ai-in-mvp.md](../decisions/ADR-006-no-ai-in-mvp.md), [docs/specs/02_Technical_Requirements_Document.md](../specs/02_Technical_Requirements_Document.md) §D.7). All routing, physics, dosimetry, and timeline algorithms are deterministic.
- **Development Tooling:** Generative AI tools were used as software-engineering and documentation-drafting assistants while building the project: Claude (Claude Code with Claude Sonnet 5.5 and Opus 5.5, Opus 4.8 through the puku CLI, and claude.ai for early spec drafting), OpenAI GPT-6.1 Sol, GPT-6.1 Terra and GPT-6 Astra through the Codex CLI, and Google Gemini 3.8 Flash through the agy CLI. Humans reviewed and approved the results; the exact tool and model for each change are in the log below.
- **Audit & Traceability:** Every AI interaction is logged chronologically in [docs/AI_USE.md](../AI_USE.md), recording the tool, model version, exact actions performed, boundaries observed, and human oversight.

---

## Team Roster (Team CheesySpace)

Registered for NASA Space Apps Challenge 2026, Dhaka, Bangladesh ([docs/ops/team.md](team.md)). Names and roles only; TO BE FILLED BY THE TEAM: confirm that each member agrees to be listed and add any profile links they want public.

1. Obidit Islam (Team Lead; data/GIS lead; story lead)
2. Sadman Shaharier Mahim (product and systems lead; Hab Core lead; demo story)
3. Saba Atharique (frontend engineer; design and story lead)
4. Mishkat Ahmed Khan (compute engineer; data/GIS co-lead)
5. Anjim Hossain (compute engineer; integration)
6. Ridita Alam (design and story lead; frontend)

---

## Project Links & Submission Placeholders

- **Project Repository:** TO BE FILLED BY THE TEAM: repository URL
- **Public Interactive Replay Demo:** TO BE FILLED BY THE TEAM: public replay demo URL
- **240-Second Video (Local Judging):** TO BE FILLED BY THE TEAM: 240-second video URL
- **30-Second Video (Global Cut):** TO BE FILLED BY THE TEAM: 30-second video URL
- **Additional Portal Fields:** TO BE FILLED BY THE TEAM: any custom portal questionnaire fields
