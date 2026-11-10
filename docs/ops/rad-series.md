# RAD dose series for sol 4190 (T21.06)

| | |
| --- | --- |
| **Owner** | Obidit Islam, R1 Data & GIS ([T21.06](../tasks/TASK-21_scenario-builder.md#t2106--download-the-rad-series-verify-sol-4190-coverage-u-15-and-the-product-u-45)); Mishkat Ahmed Khan (R2) checks U-45. Downloads and tables by an agent, 2026-11-07; T21.07 extraction and review fixes by Codex (gpt-6.1-terra, max) |
| **Date** | 2026-11-07; 2026-11-10 (U-45 decision and T21.07 extraction) |
| **Status** | U-15 answered from the files; U-45 decided by Obidit Islam on 2026-11-10. Mishkat Ahmed Khan's second-person read is pending `TODO(verify)` |
| **Related** | [Data downloads](data-downloads.md) D8, D9, D10, U-15, U-45 · [02 L9](../specs/02_Technical_Requirements_Document.md#l9--rad-event-time-series-fr-37) · [02 §D.13](../specs/02_Technical_Requirements_Document.md#d13-space-weather-event-model-fr-37-fr-38) · [05 DoseSeries](../specs/05_Backend_and_Database_Schema.md#doseseries-dose_seriesjson) · [01 §E.1](../specs/01_Product_Requirements_Document.md#e1-killer-demo--storm-at-sol-4190-target-90-s-of-the-240-s-video) · [T21.07](../tasks/TASK-21_scenario-builder.md#t2107--implement-the-rad-dose-series-extraction) · [T21.13](../tasks/TASK-21_scenario-builder.md#t2113--fallback--start-only-if-t2106-finds-no-sol-4190-series-digitised-dose-curve) |

## Result

| Question | Answer | Evidence |
| --- | --- | --- |
| U-15: does a RAD series cover sol 4190? | **Yes**, in all three products checked. T21.13 (digitised fallback) is **not** triggered | D8: 88 samples with sol 4190.000…4190.989; SPDF L2: 142 records on 20 May 2024; PDS RDR: file for sol 4190, 129 observations with dosimetry |
| Gaps around the event | **None** in D8 (it is interpolated onto a fixed grid, so it would not show one) or SPDF L2 (largest step 1,164 s, sols 4187–4193) | Script output below |
| Units | D8: µGy/day (file header). SPDF L2: `uGray/day` (CDF attribute). PDS RDR: `microGray / Hour` (label). Absorbed dose, never Sv (02 L9) | Quotes below |
| Event total, E detector | **1,978.6–2,190.7 µGy** gross and **1,741.0–1,793.9 µGy** above background, in D8 and SPDF L2 alike, depending on the window (defined under Method) | Integrals below |
| NASA's published figure | **8,100 µGy** (D10), with no integration window stated | Quote below |
| Do the archives reproduce 8,100 µGy? | **No.** Every product and window gives about a quarter of it. The peak *rate* of the E detector is 8,274.30–8,434.2 µGy/**day** (D8, L2, PDS), close to 8,100 in number; whether NASA's figure is a peak rate or a total from another method is `TODO(verify)` | Comparison table |
| U-45: product to replay | **Decided:** D8 original (not filtered) E-detector column, with SPDF L2 Total Dose E as the cross-check. Obidit Islam, 2026-11-10; Mishkat's second-person read remains `TODO(verify)` | Decision section |

## Sources

All downloads are in the main checkout's git-ignored `pipeline/work/rad/`; none is in Git. Access date for every file: 2026-11-07.

| Id | File | URL | Bytes | SHA-256 | Provider checksum |
| --- | --- | --- | --- | --- | --- |
| D8 | `doseE_sol_filter_update.txt` | <https://zenodo.org/api/records/20536564/files/doseE_sol_filter_update.txt/content> | 26,590,477 | `220a113721248749980bc917b6e91dc7d297828cc373b4c9826bdff243a0f7b9` | Zenodo `md5:271f63e7e6eaa0aa899201d6234df398`; local md5 matches |
| D8 | `Documentation_Notch.pdf` (the record's description file) | <https://zenodo.org/api/records/20536564/files/Documentation_Notch.pdf/content> | 537,909 | `294f0dbb5cefed7ec953c7c6711fd2bfb2e39e439880744d225fa3785dae5aab` | Zenodo `md5:e502fbe7fa887fd9e23ef15e085b9642`; local md5 matches |
| D9 | `spdf-l2/msl_rad_obs-l2_2024138_v03.cdf` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024138_v03.cdf> | 118,784 | `0968d309c1e61a34c784911b42bf0f8b27818939ede54ca6476275170cc0b557` | none listed |
| D9 | `spdf-l2/msl_rad_obs-l2_2024139_v03.cdf` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024139_v03.cdf> | 118,293 | `bfdb6c3d1c574e2f5bd85d68e5cec2e25d87085f3e25a2e164a892c69f8213a9` | none listed |
| D9 | `spdf-l2/msl_rad_obs-l2_2024140_v03.cdf` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024140_v03.cdf> | 118,276 | `498d7478d5023fa1ee8878273561d6e4e8e2ee7b7e86eb3e909f0546acbf3e30` | none listed |
| D9 | `spdf-l2/msl_rad_obs-l2_2024141_v04.cdf` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024141_v04.cdf> | 189,967 | `b080d9e154e3ff33a963fc79e7467997db4715258e9d87e52abdc85fc2015c7e` | none listed |
| D9 | `spdf-l2/msl_rad_obs-l2_2024142_v03.cdf` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024142_v03.cdf> | 145,758 | `6d8e4eac3ab8ecae485ca5bc9efdd7ec2b2b3d78916450669cddebfed2039697` | none listed |
| D9 | `spdf-l2/msl_rad_obs-l2_2024143_v04.cdf` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024143_v04.cdf> | 122,444 | `d7a34008f5aece056b78d9f29fede41dc3e7dbde664e0cafd005e60de119f328` | none listed |
| D9 | `spdf-l2/msl_rad_obs-l2_2024144_v03.cdf` | <https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/2024/msl_rad_obs-l2_2024144_v03.cdf> | 119,595 | `18920fef335986a12407510b145505ad61acead65b5f330c10a3104952c551cd` | none listed |
| D9 | `pds-rdr/RAD_RDR_2024_140_18_30_4190_V00.LBL` | <https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/SOL_04134_04257/RAD_RDR_2024_140_18_30_4190_V00.LBL> | 1,799,360 | `6734878f8678aee70376310aa15299880b89078c6c0edb536197f51c5a234db6` | `TODO(verify)` against the volume's `CHECKSUMS.TXT` |
| D9 | `RAD_RDR_2024_140_18_30_4190_V00.TXT` (same folder), listed at 91M | not downloaded whole; byte ranges only, saved as `pds-rdr/RAD_RDR_2024_140_18_30_4190_V00.TXT.part0-19999` (first 20,000 bytes) and `pds-rdr/RAD_RDR_4190_ranges.bin` (each observation's header, `TOT_DOSE_B`, `TOT_DOSE_E`) | 20,000 and 53,004+ | `c7245dd68114eec4dbfdbba02c65e86fece875251ce6ac4eed9d333139b996e6` (part) · `e5f2a44909eb078efc439d0ebd15ba518a10316e9f03fcb94a04ffe88158f932` (ranges) | not comparable (partial) |
| D10 | NASA release, 10 Jun 2024 | <https://www.nasa.gov/solar-system/planets/mars/nasa-watches-mars-light-up-during-epic-solar-storm> | — | cite only | — |

### Versions and licences

| Product | Version | Licence / rules of use | Credit line |
| --- | --- | --- | --- |
| D8 *MSL/RAD Dose rates*, doi:10.5281/zenodo.20536564 | Zenodo API: `publication_date` 2026-06-04, record created 2026-06-09; no `version` field. Notebook PDF dated "January 10, 2025" | Zenodo API `license.id`: `cc-by-4.0` | Heber, Bernd; Löwe, Jan Leo (2026). *MSL/RAD Dose rates*. Zenodo. doi:10.5281/zenodo.20536564. CC BY 4.0 |
| D9 SPDF `msl_rad_obs-l2` CDF | `Data_version` / `RDR_version` `03`–`05` per file (filename suffix); `Generation_date` `20260506_23:54:54` (DOY 141 file) | CDF `Rules_of_use`: "The RAD data are archived as fully citable data. Please consult the RAD team for further details on processing and usage of these data." No licence name; `TODO(verify)` | CDF `Acknowledgement`: "Please acknowledge the RAD Principal Investigator Dr. Hassler of Southwest Research Institute Boulder." Instrument reference in the file: Hassler et al. (2014), <https://link.springer.com/article/10.1007/s11214-012-9913-1> |
| D9 PDS `MSL-M-RAD-3-RDR-V1.0` | Label `PRODUCT_ID = "RAD_RDR_2024_140_18_30_4190_V00"`, `PRODUCT_CREATION_TIME = 2024-11-05T01:22:49` | PDS archive; licence not stated in the label, `TODO(verify)` | NASA PDS Planetary Plasma Interactions Node; RAD PI D. Hassler (SwRI) |

## D8 — Zenodo E-detector series

### Record text

Zenodo API `metadata.description`, verbatim:

> The output file contains datetime, day of year, sol, original dose rate in microgray per day, and the corresponding filtered dose rate.

and

> The filtering procedure interpolates the data to the operational sampling cadence of 88 measurements per sol and applies a digital notch filter to suppress the diurnal 1-sol variation and its harmonics up to order 12.

### Header and columns

Line 1 of `doseE_sol_filter_update.txt`, verbatim; each tab is shown as ` ⇥ ` (markdownlint forbids hard tabs):

```text
1  Datetime ⇥ Doy ⇥ Sol ⇥ DoseE [micro Gray per day] ⇥ DoseE_filtered [micro Gray per day]
```

Lines 2–3, verbatim, tabs shown the same way:

```text
2  2016-10-24 19:31:05.135001 ⇥ 2016.0 ⇥ 298.81325231481486 ⇥ 1500.0000000000134 ⇥ 263.2609115736337 ⇥ 263.9168750417833
3  2016-10-24 19:47:53.944593 ⇥ 2016.0 ⇥ 298.82491898148146 ⇥ 1500.011363636377 ⇥ 260.81363567908335 ⇥ 261.4720505775569
```

**The header names 5 columns but every data row has 6** (script: `field counts: {6: 246840}`). Read from the values, the columns are: datetime · year (`2016.0`) · day of year · sol · DoseE · DoseE_filtered. The documentation's store cell (PDF p. 11, lines "doy_int = tt.sol_to_doy(Sol_int)" and "data = np.column_stack((Time_int, doy_int, Sol_int, E_int, E_filtered))") suggests `sol_to_doy` returns year and day of year together; that reading is `TODO(verify)` with the authors. T21.07 must parse 6 fields and must not take column 2 as the day of year.

**Units: confirmed µGy/day** (header, record text, and the PDF's axis labels `Dose Rate E [$\mu$Gy/day]`). Convert to the DoseSeries unit with µGy/h = µGy/day ÷ 24.

Time scale of `Datetime` (UTC or otherwise): not stated in the file or record, `TODO(verify)`. Against the SPDF L2 file (UTC, from TT2000), the D8 peak sample (06:24:10) sits 8 min 51 s after the L2 peak record (06:15:19), less than one 1,008.81-s grid step.

### Processing that matters for the replay

From `Documentation_Notch.pdf` (text extracted with `pdftotext -layout`):

- PDF p. 3: "we interpolate the data in the following to achieve 88 data points for the required Sols", with `interp1d(Sol, E, kind='linear', fill_value="extrapolate")`. So the **original** column is also resampled; true data gaps are bridged by straight lines and cannot be seen in the file.
- PDF p. 10–11: "My (or our) dose rates are consistently 7 µGy/day lower than those reported by Jingnan over the entire mission period." and "Jingnan masked SEP events in her study. … I do not mask them out."
- The notch filter is applied with `filtfilt` over the whole series. Around the onset it rings: the filtered column reaches **−584.38 µGy/day** at 2024-05-20 01:04:43, four hours *before* the onset, and peaks lower (6,270.20 against 8,274.30). The filtered column is not fit to replay a sharp SEP.

### Coverage, sols 4189–4192

Script `inspect_d8.py` (agent scratch, run with `python3 -I`); key output:

```text
data rows: 246840 field counts: {6: 246840}
min/max integer sol in file: 1500 4304
integer sols missing in file: 0 []
sol 4189: n=88 t0=2024-05-18 17:41:36.493013 t1=2024-05-19 18:04:22.927511 dt_s min=1008.810 max=1008.810 orig min=125.45 med=129.81 max=134.30 filt min=-205.69 med=172.82 max=439.28
sol 4190: n=88 t0=2024-05-19 18:21:11.737103 t1=2024-05-20 18:43:58.171601 dt_s min=1008.810 max=1008.810 orig min=127.93 med=940.62 max=8274.30 filt min=-584.38 med=1147.48 max=6270.20
sol 4191: n=88 t0=2024-05-20 19:00:46.981193 t1=2024-05-21 19:23:33.415691 dt_s min=1008.810 max=1008.810 orig min=227.06 med=378.87 max=833.64 filt min=24.07 med=366.40 max=1259.56
sol 4192: n=88 t0=2024-05-21 19:40:22.225283 t1=2024-05-22 20:03:08.659781 dt_s min=1008.810 max=1008.810 orig min=159.19 med=177.96 max=225.98 filt min=25.57 med=173.18 max=417.05
```

| Sol | Samples | Cadence (s) | Time range (file `Datetime`) | Original min / median / max (µGy/day) | Filtered min / median / max (µGy/day) |
| --- | --- | --- | --- | --- | --- |
| 4189 | 88 | 1,008.810 | 2024-05-18 17:41:36 – 2024-05-19 18:04:23 | 125.45 / 129.81 / 134.30 | −205.69 / 172.82 / 439.28 |
| 4190 | 88 | 1,008.810 | 2024-05-19 18:21:12 – 2024-05-20 18:43:58 | 127.93 / 940.62 / 8,274.30 | −584.38 / 1,147.48 / 6,270.20 |
| 4191 | 88 | 1,008.810 | 2024-05-20 19:00:47 – 2024-05-21 19:23:33 | 227.06 / 378.87 / 833.64 | 24.07 / 366.40 / 1,259.56 |
| 4192 | 88 | 1,008.810 | 2024-05-21 19:40:22 – 2024-05-22 20:03:09 | 159.19 / 177.96 / 225.98 | 25.57 / 173.18 / 417.05 |

The whole file runs from sol 1500 (2016-10-24) to sol 4304 (2024-09-14) with no missing integer sol. Background before the event was depressed: sols 4180–4183 median 165.02 µGy/day, sols 4188–4189 median 129.72, sols 4195–4199 median 154.62 (script `event_d8.py`).

Event samples (original column), verbatim from the `--dump` output:

```text
2024-05-20 05:00:06.501597  sol=4190.4318  orig=   135.80  filt=   689.69
2024-05-20 05:16:55.311189  sol=4190.4432  orig=   208.94  filt=  1126.84
2024-05-20 05:33:44.120781  sol=4190.4545  orig=  1490.02  filt=  2152.66
2024-05-20 05:50:32.930372  sol=4190.4659  orig=  5773.36  filt=  4329.11
2024-05-20 06:07:21.739964  sol=4190.4773  orig=  8184.59  filt=  5752.71
2024-05-20 06:24:10.549556  sol=4190.4886  orig=  8274.30  filt=  6270.20
2024-05-20 06:40:59.359148  sol=4190.5000  orig=  7424.47  filt=  5884.13
```

Peak: 8,274.30 µGy/day = 344.76 µGy/h at 2024-05-20 06:24:10.

## D9 — NASA archives (cross-check)

### Where the files are

Found by browsing the directory listings (no URL guessed):

- PDS PPI: `https://pds-ppi.igpp.ucla.edu/data/` → `MSL-M-RAD-3-RDR-V1.0/` → `DATA/` → `SOL_04134_04257/` lists `RAD_RDR_2024_140_18_30_4190_V00.LBL` and `RAD_RDR_2024_140_18_30_4190_V00.TXT` ("2024-12-09 18:30   91M"). The `DATA/` listing runs to `SOL_04710_04843/`.
- SPDF: `https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/` → `cdf/` → `obs-l2/` → `2024/` lists one CDF per UTC day, e.g. `msl_rad_obs-l2_2024141_v04.cdf` (20 May 2024). There is also `obs-l1/`, not used.

The SPDF CDF carries the same `Standard_data_product_id = ['RAD_RDR']` and states `Start_sol = ['4190']` for DOY 141. It is small, so it is the main D9 cross-check here; the 91 MB PDS TXT was read only by byte ranges.

### SPDF L2 variables

From `cdf_meta.py` on the DOY 141 file, verbatim:

```text
VAR DOSIMETRY_TOTAL CDF_FLOAT [3] recs 142 {'FILLVAL': np.float32(-1e+31), 'UNITS': 'uGray/day', 'VALIDMIN': np.float32(0.0), 'VALIDMAX': np.float32(100000.0), 'FIELDNAM': 'Total Dose for B both total, and corrected for RTG background', 'DEPEND_0': 'EPOCH', 'CATDESC': 'Radiation dose rate on Mars (recorded in Si, corrected for MMRTG contribution, and tissue-equivalent plastic)'}
GATT Time_resolution = ['RAD accumulates nominally acquires data in a 16 min observational cadence. During times of high count rates this cadence switches to 8 min.']
GATT Quality_flag_note = ['Dataset contains all data, however data is flagged (FLAGGED_DATA) if there are quality issues(cmds > 2, DAN firing, data corruption, &c.']
```

`DOSIMETRY_DOSE_LABEL`: `['Total Dose B', 'RTG Corrected Dose B', 'Total Dose E']`. `EPOCH` is TT2000; whether it marks the start or the middle of an observation is `TODO(verify)`.

Script `cdf_dose.py` (run in a scratch venv with `cdflib` 1.3.16), key output:

```text
msl_rad_obs-l2_2024141_v04.cdf: recs=142 first=2024-05-20T00:11:02.000000000 last=2024-05-20T23:56:36.000000000 start_sol=['4190'] flagged_values=['', 'Cmds']
total recs=676 dt_s min=170 median=1026 max=1164
gaps > 1500 s: []
fill values in DOSIMETRY_TOTAL: 0
col 0 (Total Dose B): bg_pre median(18-19 May)=149.57 bg_post median(23 May)=168.33 peak=7354.29 uGy/day at 2024-05-20 06:15:19
col 1 (RTG Corrected Dose B): bg_pre median(18-19 May)=91.00 bg_post median(23 May)=109.76 peak=7295.71 uGy/day at 2024-05-20 06:15:19
col 2 (Total Dose E): bg_pre median(18-19 May)=129.87 bg_post median(23 May)=156.08 peak=8377.91 uGy/day at 2024-05-20 06:15:19
```

Onset in the L2 file, verbatim (`[Total B, RTG-corrected B, Total E]` in µGy/day, then `ALIVE_TIME` in s):

```text
2024-05-20 05:04:45 [166.31, 107.73, 137.0] 935.9
2024-05-20 05:21:50 [237.22, 178.65, 238.86] 918.7
2024-05-20 05:38:56 [1499.44, 1440.87, 2044.08] 373.1
2024-05-20 05:48:02 [3937.44, 3878.87, 5117.38] 285.0
2024-05-20 05:57:07 [5720.22, 5661.65, 7554.18] 229.6
2024-05-20 06:06:13 [6972.02, 6913.44, 8182.06] 214.4
2024-05-20 06:15:19 [7354.29, 7295.71, 8377.91] 208.1
```

The cadence drops from about 17 min to about 9 min at the onset, as the `Time_resolution` note says. Some records carry `FLAGGED_DATA = 'Cmds'`; they were **not** removed in these historical comparison integrals. The T21.07 reference below follows the later decision to exclude flagged records.

### PDS RDR, sol 4190

Label lines 22–23 and 126–150, verbatim (excerpt):

```text
 22  START_TIME                    = 2024-140T18:30:00
 23  STOP_TIME                     = "UNK"
127    NAME           = OBS_000_TOT_DOSE_B
131    UNIT           = "microGray / Hour"
142    NAME           = OBS_000_TOT_DOSE_E
146    UNIT           = "microGray / Hour"
```

Note the unit: the PDS RDR gives **µGy/h**, the L2 CDF and D8 give **µGy/day**. Converted, the values agree: at the onset observation (2024-05-20 05:21:50) PDS E is 9.97416 µGy/h × 24 = 239.38 µGy/day, L2 Total Dose E is 238.86 µGy/day.

The label points to `TOT_DOSE_B` and `TOT_DOSE_E` for 129 observations. Script `pds_ranges.py` read each observation's `START_OBS_UTC`, `OBS_DURATION` and the two values by HTTP byte ranges; `pds_integrate.py` and `span_compare.py` key output:

```text
n obs: 129 first 2024-05-19 18:30:00 last 2024-05-20 18:59:17
start-to-start s: min=195 median=548 max=1026
B_uGy_h: pre-onset median=6.307 uGy/h (= 151.36 uGy/day) peak=308.486 uGy/h (= 7403.7 uGy/day) at 2024-05-20 06:15:19
E_uGy_h: pre-onset median=5.549 uGy/h (= 133.17 uGy/day) peak=351.424 uGy/h (= 8434.2 uGy/day) at 2024-05-20 06:15:19
PDS TOT_DOSE_B: 2024-05-20 05:21:50 .. 2024-05-20 18:59:17 n=90 gross=1366.2 uGy
PDS TOT_DOSE_E: 2024-05-20 05:21:50 .. 2024-05-20 18:59:17 n=90 gross=1504.9 uGy
CDF Total Dose B: 2024-05-20 05:21:50 .. 2024-05-20 18:59:17 n=90 gross=1360.2 uGy
CDF RTG Corrected Dose B: 2024-05-20 05:21:50 .. 2024-05-20 18:59:17 n=90 gross=1327.0 uGy
CDF Total Dose E: 2024-05-20 05:21:50 .. 2024-05-20 18:59:17 n=90 gross=1498.2 uGy
```

PDS RDR and SPDF L2 have the same observation times and agree within 0.5 % over the sol-4190 part of the event. The PDS sol file ends at 2024-05-20 18:59:17, so it holds only the first ~14 h of the event; the tail is in the sol-4191 file (not fetched). The `OBS_DURATION` values sum to 80,333 s over the sol, less than the start-to-start spacing, so a rate × duration sum under-counts; the trapezoid over start times is used here.

## Event total and NASA's figure

NASA (D10), verbatim:

> If astronauts had been standing next to NASA’s Curiosity Mars rover at the time, they would have received a radiation dose of 8,100 micrograys — equivalent to 30 chest X-rays.

The release does not say over what time, which detector, or whether background is included.

### Method

- Rate in µGy/h = file value in µGy/day ÷ 24.
- D8: each sample × 1,008.81 s (1 sol / 88) = 0.280225 h, summed (rectangle rule). SPDF L2: trapezoid between record times.
- **Window A (event):** onset = first D8 sample above 1.5 × the sols 4188–4189 median (129.72 µGy/day), i.e. 2024-05-20 05:16:55; end = first D8 sample after the peak below 1.5 × that median, 2024-05-22 01:33:27 (159 samples, 44.28 h). The same clock window is applied to SPDF L2.
- **Window B (long tail):** same onset; end at the first D8 sample below 1.2 × 129.72, 2024-05-22 23:41:43 (238 samples, 66.41 h).
- **Window C (calendar):** SPDF L2 from 2024-05-20 00:00 to 2024-05-23 00:00 UTC; D8 whole sols 4190–4192 (264 samples).
- **Net** subtracts a constant background: the pre-event median of the same column (D8 129.72 µGy/day; L2 B 149.57, RTG-corrected B 91.00, E 129.87, all medians of 18–19 May).

### Comparison

| Product, column | Window | Gross (µGy) | Net of background (µGy) | Gross ÷ 8,100 |
| --- | --- | --- | --- | --- |
| D8 original E | A | 1,995.5 | 1,754.7 | 0.25 |
| D8 filtered E | A | 1,916.1 | 1,675.3 | 0.24 |
| D8 original E | B | 2,154.4 | 1,793.9 | 0.27 |
| D8 original E | C (sols 4190–4192) | 2,190.7 | 1,790.8 | 0.27 |
| SPDF L2 Total Dose E | A | 1,978.6 | 1,741.0 | 0.24 |
| SPDF L2 Total Dose E | C | 2,169.9 | 1,781.3 | 0.27 |
| SPDF L2 Total Dose B | A | 1,841.1 | 1,567.4 | 0.23 |
| SPDF L2 RTG-corrected Dose B | A | 1,734.0 | 1,567.5 | 0.21 |
| SPDF L2 Total Dose B | C | 2,049.5 | 1,602.0 | 0.25 |
| PDS RDR TOT_DOSE_E | D (onset to end of sol-4190 file, 05:21:50–18:59:17) | 1,504.9 | — | 0.19 |
| SPDF L2 Total Dose E | D | 1,498.2 | — | 0.18 |
| PDS RDR TOT_DOSE_B | D | 1,366.2 | — | 0.17 |
| SPDF L2 Total Dose B | D | 1,360.2 | — | 0.17 |
| NASA release (D10) | not stated | 8,100 | — | 1.00 |

The ratio column is gross ÷ 8,100, rounded to two decimals with `python3 -c` (script output). D8 vs SPDF L2 E in window A: +0.85 %; PDS vs SPDF L2 in window D: +0.45 % (E), +0.44 % (B).

### What the numbers say

1. **D8 and the NASA L2 archive agree** for the E detector: 1,995.5 against 1,978.6 µGy in window A (0.85 % apart), and the pre-event medians agree (129.72 against 129.87 µGy/day). D8 is therefore a faithful resampling of the archive for this event; the documented 7 µGy/day offset is against an older series, not against the archive.
2. **No product and no window reaches 8,100 µGy.** The archives give about a quarter. The B detector (silicon) is lower than E, not higher, so switching detector does not close the gap.
3. **Background subtraction matters at the 10–20 % level** (240.8 µGy in window A, 399.9 µGy in window C for D8), not at the factor-4 level. The pre-event background was itself depressed (129.72 against 165.02 µGy/day ten sols earlier), so the choice of background window changes the net by a few per cent.
4. The E peak rate is 8,274.30 µGy/day (D8), 8,377.91 µGy/day (L2) and 8,434.2 µGy/day (PDS, 351.424 µGy/h × 24). That is numerically close to NASA's 8,100, but NASA calls its number a dose, not a rate. Whether NASA's figure is the peak daily rate, a total in another quantity, or a total from a different processing is **unverified**: `TODO(verify)` with a RAD publication or the RAD team. A search on 2026-11-07 found only news coverage repeating the release.

## U-45 decision

**Decided by Obidit Islam, data lead, 2026-11-10:** accept the recommendation to replay the **D8 original E-detector column** (`DoseE [micro Gray per day]`, the 5th field of 6), converted to µGy/h, with `method: archive`, provenance `replayed`, and the SPDF L2 `Total Dose E` cited as the cross-check. Do not use the filtered column. For the SPDF reference, exclude every record with a nonempty `FLAGGED_DATA` and step-hold the previous unflagged rate until the next unflagged observation, as SPDF metadata directs removal of flagged data for science. This exclusion does not change the replayed D8 samples. Mishkat Ahmed Khan's second-person read against the files has not happened and remains `TODO(verify)` (T21.06 Verify).

Reasons:

- It covers sol 4190 with no missing sol, at a fixed 1,008.81-s step that suits a 60× clock.
- The E detector is the plastic one (L2 `CATDESC`: "tissue-equivalent plastic"); 02 L9 already names it.
- It matches the NASA archive within 1 % for the event (table above).
- It is licensed CC BY 4.0, which is clear for NFR-07; the L2 CDF gives rules of use but no licence name.
- The filtered column rings below zero before the onset (−584.38 µGy/day) and has a lower peak (6,270.20 against 8,274.30 µGy/day).

Consequences of the decision:

- `integral_check` uses `computed_ugy` from the samples and `expected_ugy` from the flag-excluded SPDF L2 integral over the same window, not NASA's 8,100 µGy. Sources & methods must say the E-detector archive total is about 2,200 µGy for this window and that NASA's published 8,100 µGy is not reproduced; what that figure measures remains `TODO(verify)` above. Any narration or UI text that says "8,100 µGy" must not sit next to the replayed curve without that note.
- D8's original column is interpolated; a real data gap would be drawn as a straight line. For sols 4187–4193 the L2 file shows none, so this does not affect the demo window.
- Alternative: replay the SPDF L2 Total Dose E directly (native cadence, 8-min steps at the onset, sharper peak). It uses several CDF files and its licence wording is `TODO(verify)`. The selected D8 series also needs those files for its independent cross-check; `cdflib` is not yet in `pipeline/environment.yml` (T14.01).

### T21.07 extraction and matched reference

The command below selects the D8 original E column for sols 4190–4192 and the median of the original E values from pre-event sols 4188–4189 for `background_rate`; the median is converted from µGy/day to µGy/h. It retains actual missing values as `null`. D8 is already interpolated, so it cannot reveal original observation gaps. Its unstated time scale is provisionally mapped to UTC, and fractional seconds are truncated, not rounded; the mapping remains `TODO(verify)`.

Both totals are **derived** from **replayed** D8 and SPDF records. They use `rad.py`'s step-hold rule, include background, and cover the same interval from the first stored D8 sample to the last stored D8 sample. The final sample has no added tail; SPDF intervals are clipped to those endpoints. The SPDF reader requires coverage of the window by unflagged records and rejects an overlapping unflagged fill-value gap. SPDF records whose flag is nonempty are excluded before integration; the preceding unflagged rate is held across them. The flag does not turn an otherwise valid rate into a null gap.

The existing `marswalk-pipeline` environment does not yet include `cdflib`; T14.01 owns dependency changes. These outputs were produced on Obidit Islam's machine with `cdflib` 1.3.16 exposed from a local scratch environment. From the repo root, set `CDFLIB_SITE` to a Python search directory containing that version of `cdflib`; set `RAD_DIR` if the downloads are elsewhere. Run the extraction with:

```bash
RAD_DIR="${RAD_DIR:-$PWD/pipeline/work/rad}"
: "${CDFLIB_SITE:?Set CDFLIB_SITE to a directory containing cdflib 1.3.16}"
PYTHONPATH="$PWD/pipeline/src:$CDFLIB_SITE${PYTHONPATH:+:$PYTHONPATH}" "$(make -s pipeline-python)" -m marswalk_pipeline.rad --d8 "$RAD_DIR/doseE_sol_filter_update.txt" --spdf-l2 "$RAD_DIR"/spdf-l2/*.cdf --output scenarios/storm-sol4190/dose_series.json
```

`RAD_DIR` must contain the downloaded D8 file and the `spdf-l2` directory. No runtime network access is needed.

Command output, including the independently calculated SPDF integral and the small JSON's size:

```json
{
  "window_start": "2024-05-19T18:21:11Z",
  "window_end": "2024-05-22T20:03:08Z",
  "samples": 264,
  "background_samples": 176,
  "background_rate_ugy_h": 5.405159379175338,
  "spdf_records_in_window": 343,
  "spdf_flagged_records_in_window": 8,
  "computed_ugy": 2188.835147648945,
  "expected_ugy": 2188.6230479137985,
  "difference_ugy": 0.212099735146694,
  "difference_percent_of_expected": 0.009691012591184212,
  "sha256": "993a7826b97dd7d71e8d344fb98208969ae1c08ff9ebef1be0e4a650b85486b1",
  "output_bytes": 11699
}
```

This interval and step-hold convention differ from the earlier comparison windows and rectangle/trapezoid methods; the totals should not be compared as if the bounds and integration rules were the same.

The excluded SPDF records in the replay window are listed below (TT2000 converted to UTC and truncated to seconds, as in `rad.py`). The `FLAGGED_DATA` field's `FIELDNAM` says flagged data should be removed for science; its `CATDESC` lists quality issues including commanding.

| UTC | `FLAGGED_DATA` |
| --- | --- |
| 2024-05-19T21:37:55Z | `Cmds` |
| 2024-05-20T00:45:13Z | `Cmds` |
| 2024-05-20T13:40:41Z | `Cmds` |
| 2024-05-20T22:09:12Z | `Cmds` |
| 2024-05-21T13:21:39Z | `Cmds` |
| 2024-05-21T15:15:21Z | `Cmds` |
| 2024-05-22T01:50:20Z | `Cmds` |
| 2024-05-22T14:34:39Z | `Cmds` |

The following independent calculation reads the two source products directly, without importing `rad.py`. With the same `RAD_DIR` and `CDFLIB_SITE` as above, it recomputes the two integrals, lists the flagged records and decomposes the remaining difference. The intermediate series samples the last unflagged SPDF rate at each D8 time and holds it until the next D8 time. Thus `D8 − intermediate` is the accumulated rate difference at D8 timestamps; `intermediate − SPDF` is the effect of holding SPDF at D8 cadence instead of updating at SPDF timestamps.

```bash
RAD_DIR="$RAD_DIR" PYTHONPATH="$CDFLIB_SITE${PYTHONPATH:+:$PYTHONPATH}" "$(make -s pipeline-python)" - <<'PY'
import bisect
import math
import os
from datetime import datetime
from pathlib import Path
import cdflib

rad = Path(os.environ['RAD_DIR'])
d8 = []
with (rad / 'doseE_sol_filter_update.txt').open() as source:
    next(source)
    for line in source:
        fields = line.rstrip().split('\t')
        if 4190 <= float(fields[3]) < 4193:
            d8.append((datetime.fromisoformat(fields[0]).replace(microsecond=0), float(fields[4]) / 24))
start, end = d8[0][0], d8[-1][0]
l2 = []
for path in sorted((rad / 'spdf-l2').glob('*.cdf')):
    cdf = cdflib.CDF(path)
    col = [str(x).strip() for x in cdf.varget('DOSIMETRY_DOSE_LABEL')].index('Total Dose E')
    for t, dose, flag in zip(cdflib.cdfepoch.to_datetime(cdf.varget('EPOCH')), cdf.varget('DOSIMETRY_TOTAL'), cdf.varget('FLAGGED_DATA')):
        l2.append((datetime.fromisoformat(str(t)).replace(microsecond=0), float(dose[col]) / 24, str(flag).strip()))
l2.sort()
clean = [(t, rate) for t, rate, flag in l2 if not flag]
all_rows = [(t, rate) for t, rate, _ in l2]
def integrate(rows):
    return math.fsum(rate * (min(end, b[0]) - max(start, t)).total_seconds() / 3600 for (t, rate), b in zip(rows, rows[1:]) if max(start, t) < min(end, b[0]))
held_times = [t for t, _ in clean]
sampled = [(t, clean[bisect.bisect_right(held_times, t) - 1][1]) for t, _ in d8]
d8_total, all_total, clean_total, sampled_total = map(integrate, (d8, all_rows, clean, sampled))
print('window', start.isoformat() + 'Z', end.isoformat() + 'Z')
print('flagged records (UTC, flag, uGy/day):')
for t, rate, flag in l2:
    if start <= t < end and flag:
        print(t.isoformat() + 'Z', flag, format(rate * 24, '.9g'))
print('D8, SPDF all, SPDF clean:', d8_total, all_total, clean_total)
print('flagged-record effect (clean minus all):', clean_total - all_total)
print('remaining difference:', d8_total - clean_total)
print('decomposition: rate differences at D8 timestamps:', d8_total - sampled_total)
print('decomposition: SPDF changes between D8 timestamps:', sampled_total - clean_total)
PY
```

The independent run gives **derived** D8 = 2,188.8351476489447 µGy, SPDF with flags = 2,173.2055960766916 µGy, and flag-excluded SPDF = 2,188.6230479137985 µGy. Excluding the flags increases the SPDF integral by 15.41745183710691 µGy. The remaining computed − expected difference is 0.21209973514623925 µGy: −10.789828097527788 µGy from rate differences at D8 timestamps, plus 11.001927832674028 µGy from SPDF changes between those timestamps. The two terms explain the residual as the net effect of differences in rates and sample timing between the resampled D8 and native SPDF series; they do not identify an instrument-level cause. The last floating-point digits differ from the `rad.py` output above because the independent script orders multiplication and division differently.

### Sources & methods wording for SCR-09

T12.03 owns SCR-09 and is not implemented yet. It must carry this disclosure with the source credits above: **Replayed:** Curiosity RAD E, D8 original resampled series (source D8; Heber and Löwe, CC BY 4.0). **Derived:** the archive integral is about 2,200 µGy (2,189 µGy gross over the replay window; 1,979–2,191 µGy for original D8 E and SPDF L2 Total Dose E in the earlier windows A–C); flag-excluded SPDF L2 Total Dose E (D9) is the cross-check. NASA's D10 figure of 8,100 µGy is not reproduced by this archive series; what NASA's number measures is `TODO(verify)`. D8's original column is already interpolated and its timestamp scale remains `TODO(verify)`.

## Commands and scripts

The scripts are agent scratch files outside the repo (`/tmp/claude-1000/rad/scripts/`), run with `python3 -I` from `/tmp`; they only read the downloads. They are not part of the pipeline; T21.07 implements the extraction properly.

```bash
curl -sS -o zenodo_record.json https://zenodo.org/api/records/20536564
curl -sS -L -o doseE_sol_filter_update.txt "https://zenodo.org/api/records/20536564/files/doseE_sol_filter_update.txt/content"
md5sum doseE_sol_filter_update.txt   # 271f63e7e6eaa0aa899201d6234df398, equals Zenodo
python3 -I inspect_d8.py pipeline/work/rad/doseE_sol_filter_update.txt 4180 4200
python3 -I event_d8.py pipeline/work/rad/doseE_sol_filter_update.txt --dump
python -I cdf_dose.py pipeline/work/rad/spdf-l2/*.cdf     # scratch venv with cdflib 1.3.16
python3 -I pds_ranges.py <LBL> <TXT URL> <outdir> <json>  # HTTP byte ranges of the PDS TXT
python3 -I pds_integrate.py <json>
```

D8 integral output, verbatim:

```text
window onset..first orig < 1.5 x 129.72: 2024-05-20 05:16:55.311189 -> 2024-05-22 01:33:27.226714 (159 samples, 44.28 h)
  orig: gross=  1995.5 uGy  net(bg 129.72)=  1754.7 uGy  net(bg 154.62)=  1708.5 uGy
  filt: gross=  1916.1 uGy  net(bg 129.72)=  1675.3 uGy  net(bg 154.62)=  1629.1 uGy
window onset..first orig < 1.2 x 129.72: 2024-05-20 05:16:55.311189 -> 2024-05-22 23:41:43.184476 (238 samples, 66.41 h)
  orig: gross=  2154.4 uGy  net(bg 129.72)=  1793.9 uGy  net(bg 154.62)=  1724.7 uGy
sols 4190..4192 whole (264 samples): orig gross=2190.7 net(bg 129.72)=1790.8; filt gross=2207.5 uGy
```

SPDF L2 integral output, verbatim:

```text
D8-matched window: 2024-05-20 05:16:55 -> 2024-05-22 01:33:28
  col 0 (Total Dose B): n=238 [2024-05-20 05:21:50 .. 2024-05-22 01:16:41] gross=1841.1 uGy net(bg 149.57)=1567.4 uGy
  col 1 (RTG Corrected Dose B): n=238 [2024-05-20 05:21:50 .. 2024-05-22 01:16:41] gross=1734.0 uGy net(bg 91.00)=1567.5 uGy
  col 2 (Total Dose E): n=238 [2024-05-20 05:21:50 .. 2024-05-22 01:16:41] gross=1978.6 uGy net(bg 129.87)=1741.0 uGy
20 May 00:00 - 23 May 00:00: 2024-05-20 00:00:00 -> 2024-05-23 00:00:00
  col 0 (Total Dose B): n=337 [2024-05-20 00:11:02 .. 2024-05-22 23:59:27] gross=2049.5 uGy net(bg 149.57)=1602.0 uGy
  col 2 (Total Dose E): n=337 [2024-05-20 00:11:02 .. 2024-05-22 23:59:27] gross=2169.9 uGy net(bg 129.87)=1781.3 uGy
```

## Open items

- `TODO(verify)`: what NASA's 8,100 µGy measures (window, detector, quantity). State the mismatch in Sources & methods now; its explanation remains unverified.
- `TODO(verify)`: Mishkat Ahmed Khan's second-person read of this note against the files (T21.06 Verify).
- `TODO(verify)`: the time scale of D8 `Datetime`; whether L2 `EPOCH` is start or mid-observation.
- `TODO(verify)`: D8 column 2 is the year (header names 5 columns, rows have 6); ask the authors or read `sol_to_doy`.
- `TODO(verify)`: licence wording for the SPDF L2 and PDS RDR products; PDS checksum from `CHECKSUMS.TXT`.
- Not done here (other owners): rows in `pipeline/sources.lock.json` (data-downloads §A rule 3), the U-15/U-45 links in `data-downloads.md` (T21.02 step 3), the dependency batch in T14.01, and SCR-09 in T12.03.
