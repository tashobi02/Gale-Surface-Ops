---
name: data-release
description: Manual workflow to cut a new site data bundle (data_version) from the pipeline — archive the current bundle with a SHA-256, run pipeline, bump data_version, update checksums and sources.lock.json, validate the manifest, check the NFR-09 size budget, build the release tarball and print manual upload steps. Stops before commit and never uploads. Use only when the user explicitly asks for a data release.
disable-model-invocation: true
---
Owners: [05 Site / §E.3–E.6](../../../docs/specs/05_Backend_and_Database_Schema.md#e4-versioning-and-migration), [02 §F NFR-09](../../../docs/specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation), [TASK-03 T03.19](../../../docs/tasks/TASK-03_preprocessing-pipeline.md), [feasibility: large tiles](../../../docs/ops/feasibility.md#large-tiles-in-the-repo). Site dir: `web/public/sites/<site_id>/` (layout: its README).

## Hard rules
- Released assets are immutable. Never overwrite one in place; any asset change needs a new `data_version`. Never reuse a `data_version`.
- Asset paths are not versioned and tiles, grid and images are git-ignored, so a new run overwrites the previous bundle. Step 3 (archive) is required before anything is replaced.
- Stop and ask before anything destructive (deleting or replacing a bundle, rewriting the lock file's existing entries). Never overwrite a file in `.releases/`.
- Never upload anything (no `gh release`, no push). Print the manual steps in step 9 for the user.
- Do not commit or push. Tiles, grid and images stay git-ignored; only `site-manifest.json`, `vectors/` and `pipeline/sources.lock.json` are committed by a human (T03.19, 05 §E.5).
- Never read the contents of `pipeline/work/` or `tiles/**` (denied in settings). Archiving them with `tar` is allowed.

## Steps
1. `git status --porcelain`. If the tree is dirty with unrelated changes, stop and ask.
2. Read the current `data_version` from `web/public/sites/<site_id>/site-manifest.json`. New value: `<site_id>-YYYY.MM.DD[.n]` (05 Site); same-day re-release appends `.n`. Reject any value already used: not in `.releases/`, not in `git log -S"<new>" -- web/public/sites/<site_id>/site-manifest.json`. Show old → new and wait for confirmation.
3. **Archive before replacing.** Target `.releases/` (git-ignored). Run `git check-ignore -v .releases/x.tar` first; stop if it is not ignored.
   - A tarball holds only `tiles/`, `grid/` and `images/` of the site (the committed manifest, vectors and README are not in it). First check with git that these are the site's only ignored folders: `git ls-files --others --ignored --exclude-standard --directory web/public/sites/<site_id>`. If anything else is listed, stop and list it.
   - `tar -cf .releases/<old data_version>.tar -C web/public/sites <site_id>/tiles <site_id>/grid <site_id>/images` (name only those that exist). Every path in the tar must start with `<site_id>/`.
   - Run `tar -tf .releases/<old data_version>.tar` before recording the hash; stop if the listing fails or any path does not start with `<site_id>/`.
   - `sha256sum .releases/<old data_version>.tar` → save as `.releases/<old data_version>.tar.sha256`; confirm with `sha256sum -c`.
   - If either file already exists, the tar or the checksum fails: stop. Do not run the pipeline.
   - If none of the three folders exists yet (first release), say "nothing to archive" and continue.
4. Run `make check-env`, then the pipeline with the conda environment's interpreter: `$(make -s pipeline-python) -m marswalk_pipeline <site_id>` (planned in T03.15/T03.19). TODO: confirm. `__main__.py` does not exist yet and `make data` only prints "not implemented — TASK-03".
5. Checksums and `pipeline/sources.lock.json` (source URLs, versions, sha256, GDAL/rasterio versions; 05 §E.5) are written by the pipeline (`manifest.py`, `acquire.py`). TODO: confirm. Do not hand-edit hashes. Show the lock-file diff.
6. `make validate SITE=<site_id>` must exit 0 (stub until T03.14; report "not implemented" if so).
7. NFR-09: `du -sh web/public/sites/<site_id>` ≤ 250 MB; JS bundle ≤ 500 KB gzipped via `npm run -s build` build report. TODO: confirm how the gzip size is read.
8. **Release tarball** (also the clean-clone source). Only after steps 6–7 pass: build `.releases/<new data_version>.tar` and its `.tar.sha256` from `tiles/`, `grid/` and `images/` only, with the same ignored-folder check, path-prefix check and `tar -tf` check as step 3. `git status --porcelain`: confirm no binary is staged.
9. **Print, do not run**, the manual upload steps (decision in feasibility.md: GitHub release asset): on GitHub create a release whose tag equals `<new data_version>` and attach `.releases/<new data_version>.tar` and `.tar.sha256`. CLI equivalent for the user to run: `gh release create <new data_version> .releases/<new data_version>.tar .releases/<new data_version>.tar.sha256`.
10. **Clean-clone access** (06 §D.6: "Repo builds from a clean clone with documented commands"). Route: the release tag must equal the `data_version` in the checked-out `site-manifest.json`; stop if it doesn't. Download that release's `.tar` and `.sha256`, run `sha256sum -c`, then `tar -tf` (all paths start with `<site_id>/`). Stop if `tiles/`, `grid/` or `images/` already exists in `web/public/sites/<site_id>/` (the folder itself exists in a clean clone; do not extract over those three). Otherwise `tar -xf <file> -C web/public/sites`, then run `make validate SITE=<site_id>` so the assets are checked against the committed manifest. Check whether a documented fetch command or script exists (`scripts/` holds only `check_links.py`, `check_tasks.py`; `make data` is a stub). If not, report: "TODO: confirm, no fetch script or documented command yet". Do not create one.
11. Report: old/new `data_version`, **archive path and SHA-256** (old and new), validator result, sizes, lock diff summary, clean-clone status, files for the human to commit. Remind the user to copy `.releases/` outside the repo; the upload in step 9 covers only the new release.
