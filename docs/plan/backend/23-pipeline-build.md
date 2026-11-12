# 23 — Build, validate and verify the `gale_boxwork` bundle

| | |
| --- | --- |
| **Subtasks** | T03.19, T03.21, T03.22, T03.35, T04.08 |
| **Depends on** | 22 |
| **Branch** | `be/23-pipeline-build` |
| **Spec refs** | 02 §C.1–§C.4, §F.1; 05 §E.3, §E.5, RoutingGrid; 06 §D.6; decisions BD-16 … BD-22, BD-32, BD-33, BD-54, BD-111 |

## Files

`pipeline/src/marswalk_pipeline/{tiles.py,derive.py,clip_reproject.py,grid.py,config.py,validate_manifest.py,__main__.py}` (ramps BD-17, ortho fill BD-18, ratified rules with markers replaced BD-19/BD-22, validator limit BD-21) · `pipeline/tests/test_{tiles,derive,clip_reproject,grid,manifest,main}.py` · `pipeline/sites/gale_boxwork/layers/{elevation,thermal_inertia}.json` (stops written by the pipeline) · `data/sites/gale_boxwork/site-manifest.json`, `vectors/` (committed) · `pipeline/tests/fixtures/real-grid-cells.json` + generator `pipeline/tests/fixtures/make_real_grid_cells.py` (F5, T03.21) · `docs/ops/verification-log.md` (append)

## Steps (tests first)

1. Tests: one named pytest per BD-17/18/19/21/22 rule (ramp stops = data p2/p98; ortho outside-mask = 04 map background; NaN edge ring; block-mean elevation; slope clamp; validator reads the schema default; tile addressing and index per C9).
2. Implement; then `"$PY" -m marswalk_pipeline gale_boxwork --work "$SSD/marswalk/pipeline-work"` (no `--skip-unstyled-optional`).
3. `make validate SITE=gale_boxwork` exit 0; `du -sb data/sites/gale_boxwork/` (follows links with `-L`) ≤ 250 × 10⁶ bytes (BD-111) — else run package 29's T03.23/T03.24 options and record which.
4. T03.21: F5 from the routing-grid arrays with `rasterio`/NumPy, 10 cells chosen by a seeded rule (seed = scenario seed), README states the source and the 0.25° quantisation (BD-54).
5. T03.22: rebuild into `$SSD/marswalk/rebuild/` from a clean clone; compare asset SHA-256s (BD-33).
6. T03.35: validator passes with both candidates; the alternative's `comm_hab` against `gdal_viewshed` at 5 points (same method as T03.30).
7. T04.08: BD-16 checks as a pytest on the packaged traverse.
8. Offline check: with `make hab` running, `curl -sf http://127.0.0.1:8080/sites/gale_boxwork/site-manifest.json`, one tile, `grid/comm_hab.u8`, `grid/comm_hab-alternative.u8` (name per T03.37) — all 200 through the SSD symlinks.
9. Commit only the manifest, `vectors/` and the lock.

## Automated verification

- `make test` (check-env + Vitest + pytest) green in the SSD env.
- `make validate SITE=gale_boxwork` · the `du` budget · the step-8 curls · `git status --porcelain` lists no binary.

## Status rows

```text
| T03.19 | done | <commit date> | Bundle v1 built from the locked inputs; validator green; ≤ 250 MB; served offline from localhost (curls in the verification log) |
| T03.21 | done | <commit date> | F5 real-grid cells from the routing-grid arrays (BD-54) |
| T03.22 | done | <commit date> | Clean rebuild: asset hashes equal (or decoded-pixel hashes, BD-33), listed in the verification log |
| T03.35 | done | <commit date> | Both candidates validated; alternative comm_hab vs gdal_viewshed at 5 points |
| T04.08 | done | <commit date> | Traverse checks per BD-16 (pytest); limitation recorded |
```

## Done when

The real bundle validates, fits the budget, and the Hab Core serves it offline.
