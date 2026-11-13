# DONKI cache for `storm-sol4190` (T21.05)

| | |
| --- | --- |
| **Owner** | Obidit Islam, R1 Data & GIS ([T21.05](../../../docs/tasks/TASK-21_scenario-builder.md#t2105--decide-the-donki-window-u-44-implement-donki-extraction)); window agreed with Sadman Shaharier Mahim (R6) |
| **Date** | 2026-11-07 |
| **Status** | Fetched and cached once from the CCMC DONKI web service (`FLR`, `CME`, `CMEAnalysis`, `SEP`, `IPS`, `WSAEnlilSimulations`) |
| **Related** | [TASK-21](../../../docs/tasks/TASK-21_scenario-builder.md) · [02 §C.5 L8](../../../docs/specs/02_Technical_Requirements_Document.md#l8--space-weather-records-fr-37) · [02 §D.13](../../../docs/specs/02_Technical_Requirements_Document.md#d13-space-weather-event-model-fr-37-fr-38) · [05 ScenarioEvent](../../../docs/specs/05_Backend_and_Database_Schema.md#scenario) · [Data downloads D11](../../../docs/ops/data-downloads.md#b3-storm-replay-radiation-space-weather-and-orbit-geometry-tier-1-killer-demo) · [storm-sol4190 README](../../../scenarios/storm-sol4190/README.md) · `pipeline/tests/test_donki.py` |

## U-44 decision: DONKI date window

- **Window:** `2024-05-13` to `2024-05-24` (first and last UTC calendar day, both days included in full).
- **Decided by:** Data lead Obidit Islam (R1 Data & GIS) on **2026-11-07**, agreed with Sadman Shaharier Mahim (R6).
- **Rationale:** Covers the 13–15 May 2024 solar activity and CME/WSA-ENLIL runs (including `WSA-ENLIL/30907/1` with `modelCompletionTime: "2024-05-15T16:04Z"` predicting Mars arrival `2024-05-18T01:36Z`, cited in 02 L8) through the 20 May 2024 (sol 4190) SEP/flare event and immediate aftermath.

## Source, provenance and credit (02 L8)

- **Source:** NASA Community Coordinated Modeling Center (**CCMC**) Space Weather Database Of Notifications, Knowledge, Information (**DONKI**), populated by the Moon-to-Mars (M2M) Space Weather Analysis Office at NASA GSFC (`M2M_CATALOG`).
- **Caveat and provenance (02 L8):** DONKI products are labelled *Experimental Research Information* by CCMC ("preliminary NASA research products… considered only as prototyping quality and in research context"). In Gale Surface Ops, every record extracted from this cache is surfaced strictly with provenance `replayed` as a historical forecast/notification record, **never as truth**.
- **Credit line:** *NASA Community Coordinated Modeling Center (CCMC) / Moon-to-Mars (M2M) Space Weather Analysis Office, DONKI (Database Of Notifications, Knowledge, Information), NASA Goddard Space Flight Center.*
- **Host migration note (quote verified on the DONKI page, 2026-11-12: its Latest News of 30 September 2026 carries the notice, and the endpoint paths are unchanged):** Direct requests to the legacy host `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/<TYPE>?startDate=2024-05-13&endDate=2024-05-24` timed out on TCP port 443 (`169.154.198.44:443`, no HTTP status returned) on 2026-11-07. Per CCMC's DONKI page notice (*"The DONKI web application and API have migrated to new official URLs… Endpoint paths following /DONKI/ remain unchanged. Replacing kauai.ccmc.gsfc.nasa.gov with ccmc.gsfc.nasa.gov in existing links will route directly without modification"*), all six files were fetched once from `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/<TYPE>?startDate=2024-05-13&endDate=2024-05-24`. The host in [docs/ops/data-downloads.md](../../../docs/ops/data-downloads.md) row D11 is `ccmc.gsfc.nasa.gov`.

## Cached files

Each file in `pipeline/cache/donki/` is the exact byte-for-byte payload returned by the server (no pretty-printing or reformatting). Total cache size is **291,180 bytes** (~284.4 KB, well within the D11 budget of a few hundred KB).

| File | URL | Access time (UTC) | HTTP status | Size (bytes) | SHA-256 | Record count | Top-level field names of first record |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `FLR.json` | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=2024-05-13&endDate=2024-05-24` | `2026-11-07T17:41:37Z` | 200 | 24,724 | `71184aa0760092bf453ba881afee696f72bcc3d1c6c39cb793a69cc3691d6eb5` | 42 | `flrID`, `catalog`, `instruments`, `beginTime`, `peakTime`, `endTime`, `classType`, `sourceLocation`, `activeRegionNum`, `note`, `link`, `linkedEvents`, `sentNotifications`, `submissionTime`, `versionId` |
| `CME.json` | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/CME?startDate=2024-05-13&endDate=2024-05-24` | `2026-11-07T17:41:38Z` | 200 | 157,876 | `8de8ac2c33ec3078344a0b91950fd7475f3b04d64cd662795fe1d232e76e955b` | 72 | `activityID`, `catalog`, `startTime`, `instruments`, `sourceLocation`, `activeRegionNum`, `note`, `cmeAnalyses`, `linkedEvents`, `sentNotifications`, `link`, `submissionTime`, `versionId` |
| `CMEAnalysis.json` | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/CMEAnalysis?startDate=2024-05-13&endDate=2024-05-24` | `2026-11-07T17:41:40Z` | 200 | 49,069 | `66505d3ef6060e953c6b4d7353b10ed6c79e55f997b3668b5881d6c4b4c60eb2` | 64 | `catalog`, `isMostAccurate`, `time21_5`, `latitude`, `longitude`, `halfAngle`, `speed`, `type`, `associatedCMEID`, `associatedCMEstartTime`, `associatedCMELink`, `featureCode`, `dataLevel`, `measurementTechnique`, `imageType`, `tilt`, `minorHalfWidth`, `speedMeasuredAtHeight`, `note`, `link`, `submissionTime`, `versionId` |
| `SEP.json` | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/SEP?startDate=2024-05-13&endDate=2024-05-24` | `2026-11-07T17:41:42Z` | 200 | 4,038 | `4ed886d2e88a517e925e60e0b749bf903977c9b85396f0d3c8e949fb6069959c` | 6 | `sepID`, `eventTime`, `instruments`, `link`, `linkedEvents`, `sentNotifications`, `submissionTime`, `versionId` |
| `IPS.json` | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/IPS?startDate=2024-05-13&endDate=2024-05-24` | `2026-11-07T17:41:43Z` | 200 | 2,329 | `7e944223581a7b6ac0171c31a4531897edf1915dcc5e2c4761e268d8d1ba32b4` | 5 | `catalog`, `activityID`, `location`, `eventTime`, `instruments`, `linkedEvents`, `sentNotifications`, `link`, `submissionTime`, `versionId` |
| `WSAEnlilSimulations.json` | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/WSAEnlilSimulations?startDate=2024-05-13&endDate=2024-05-24` | `2026-11-07T17:41:45Z` | 200 | 53,144 | `32617c78113370a0ce4c351938b27dfac8a5b66a44d72919faa7599c3514d865` | 61 | `simulationID`, `modelCompletionTime`, `au`, `cmeInputs`, `estimatedShockArrivalTime`, `isEarthGB`, `isEarthMinorImpact`, `rmin_re`, `kp_18`, `kp_90`, `kp_135`, `kp_180`, `estimatedDuration`, `impactList`, `link` |

Note: Plain `CMEAnalysis` (`?startDate=2024-05-13&endDate=2024-05-24`) succeeded with HTTP 200 and 64 records, so the `&mostAccurateOnly=true` fallback was not needed. Both `SEP` and `WSAEnlilSimulations` (open in D11 until now) resolved with HTTP 200 on the CCMC web service.

## Verification of assumed field names in `pipeline/tests/test_donki.py`

All field names assumed in the docstring and `TYPE_FIELDS` of `pipeline/tests/test_donki.py` **match** the real CCMC DONKI records verbatim:

| DONKI type | Assumed in `test_donki.py` | Real record fields | Verdict | Example from cached file |
| --- | --- | --- | --- | --- |
| `FLR` | `flrID`, `beginTime`, `classType` | `flrID`, `beginTime`, `classType` | **Match** | `{"flrID": "2024-05-13T01:23:00-FLR-001", "beginTime": "2024-05-13T01:23Z", "classType": "M1.2"}` |
| `CME` | `activityID`, `startTime` | `activityID`, `startTime` | **Match** | `{"activityID": "2024-05-13T09:12:00-CME-001", "startTime": "2024-05-13T09:12Z"}` |
| `SEP` | `sepID`, `eventTime` | `sepID`, `eventTime` | **Match** | `{"sepID": "2024-05-13T12:44:00-SEP-001", "eventTime": "2024-05-13T12:44Z"}` |
| `IPS` | `activityID`, `eventTime` | `activityID`, `eventTime` (plus `location`) | **Match** | `{"activityID": "2024-05-15T18:13:00-IPS-001", "eventTime": "2024-05-15T18:13Z", "location": "Earth"}` |
| `WSAEnlilSimulations` | `simulationID`, `modelCompletionTime`, `impactList[{location, arrivalTime}]` | `simulationID`, `modelCompletionTime`, `impactList` entries with `location`, `arrivalTime`, `isGlancingBlow`, `isMinorImpact` | **Match** | `{"simulationID": "WSA-ENLIL/30907/1", "modelCompletionTime": "2024-05-15T16:04Z", "impactList": [{"location": "Mars", "arrivalTime": "2024-05-18T01:36Z", "isGlancingBlow": false, "isMinorImpact": false}, ...]}` |
| `CMEAnalysis` | `associatedCMEID`, `time21_5`, `speed` | `associatedCMEID`, `time21_5`, `speed` (plus `isMostAccurate`, `type`, `latitude`, `longitude`, `halfAngle`, ...) | **Match** | `{"associatedCMEID": "2024-05-13T09:12:00-CME-001", "time21_5": "2024-05-13T11:53Z", "speed": 1456.0}` |

### Exact Mars location string in `WSAEnlilSimulations`

- Exact `location` value: `"Mars"` (verbatim string `"Mars"`).
- Distinct `impactList[].location` values across the 61 simulations in the window: `"Juno"`, `"Lucy"`, `"Mars"`, `"OSIRIS-APEX"`, `"Parker Solar Probe"`, `"Psyche"`, `"STEREO A"`, `"Solar Orbiter"`.
- 26 of the 61 simulations include a `"Mars"` entry in `impactList` (including `WSA-ENLIL/30907/1` with `modelCompletionTime: "2024-05-15T16:04Z"` and Mars `arrivalTime: "2024-05-18T01:36Z"`, matching 02 L8).
