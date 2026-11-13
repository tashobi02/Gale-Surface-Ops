# 22 — Real-site inputs on the SSD: acquisition, source records, POI images, credits

| | |
| --- | --- |
| **Subtasks** | T03.19 (step 1: the source lock), T04.04, T04.05, T04.06, T04.10; source-record markers (BD-13); THEMIS unit (BD-26); SPICE notes (BD-24) |
| **Depends on** | 03 (SSD script, env) — independent of the engine chain; start it first among the data packages |
| **Branch** | `be/22-pipeline-sources` |
| **Environment** | `export SSD=<mount>`; `make ssd-link SSD=$SSD`; `PY="$(make -s pipeline-python)"` (the env lives under `$SSD/marswalk/conda/envs`). Internet is used here only (pipeline stage, before the event) |
| **Spec refs** | 02 §C.2, Sources; 05 DataSource, POI; `docs/ops/data-downloads.md`; decisions BD-12 … BD-15, BD-24, BD-26, BD-29 |

## Files

`pipeline/sources.lock.json` (URLs, versions, sizes, SHA-256) · `pipeline/src/marswalk_pipeline/acquire.py` (POI image entries; resumable downloads into `pipeline/work/<kind>/`) · `pipeline/tests/test_acquire.py` · `pipeline/sites/gale_boxwork/sources/*.json` (every `TODO(verify)` field) · `pipeline/sites/gale_boxwork/pois/*.json` (image asset fields) · `pipeline/sites/gale_boxwork/layers/thermal_inertia.json` (unit) · `pipeline/spice/kernels.lock.json` (notes) · `docs/ops/credits.md` · `docs/ops/exploration-zone.md` · `docs/ops/data-downloads.md` (D-rows: URL, date, SHA-256) · `scripts/check_urls.py` (new: HEAD/GET each URL in the records and docs given, writes status + date; pipeline-stage only)

## Steps (tests first)

1. `test_acquire.py`: a lock entry with URL + SHA-256 downloads to the expected path (local HTTP fixture server), resumes, rejects a hash mismatch, never runs when `--offline`.
2. Inputs: if `$SSD/marswalk/pipeline-work/{dem,ortho,ti}` already hold files whose SHA-256 equal the T03.19 dry-run table (`docs/tasks/TASK-03_preprocessing-pipeline.md`, "Input checksums"), reuse them; else reproduce them with the documented `gdal_translate -projwin … /vsicurl/<url>` commands of `data-downloads.md` and record the new hashes (a different hash → new `data_version`).
3. Lock file: every source with URL, version, size, SHA-256, access date.
4. Source records: fill each `TODO(verify)` per BD-13 from the fetched page (record the URL fetched); THEMIS unit from `gdalinfo` on the cube label (BD-26).
5. POI images (BD-14): acquisition entries; images land in `pipeline/work/images/<poi_id>.jpg`; POI records get the credit string from the page.
6. `credits.md`: rebuild from the records (no hand-typed credit); `exploration-zone.md` citations checked by `check_urls.py` (BD-29).
7. SPICE notes (BD-24): compute the barycentre vs body-centre light-time difference over the scenario window with spiceypy and record the maximum in `kernels.lock.json`; note the predicted TGO segment.

## Automated verification

- `"$PY" -m pytest -q pipeline/tests/test_acquire.py pipeline/tests/test_spice_tables.py`.
- `python3 scripts/check_todos.py --paths pipeline/sites pipeline/spice docs/ops/credits.md docs/ops/exploration-zone.md` → 0 markers.
- `python3 scripts/check_urls.py pipeline/sites/gale_boxwork/sources docs/ops/exploration-zone.md` → every URL 2xx/3xx (a 4xx is recorded in the record's `accuracy_note` as unreachable on that date, never silently dropped).
- `ls -l pipeline/work` shows the SSD symlinks; `git status --porcelain` shows no binary.

## Status rows

```text
| T04.04 | done | <commit date> | POIs 1–4 approved (BD-14); images acquired by the pipeline with SHA-256 in sources.lock.json; credits from the pages |
| T04.05 | done | <commit date> | POI 5 approved; 5-POI minimum met (BD-14) |
| T04.06 | done | <commit date> | [credits.md](../ops/credits.md) rebuilt from the records; no open licence field (BD-13) |
| T04.10 | done | <commit date> | [exploration-zone.md](../ops/exploration-zone.md) citations resolved by check_urls.py (BD-29) |
```

T03.19 stays `wip` until package 23.

## Done when

All inputs are on the SSD with recorded hashes and no source record carries a marker.
