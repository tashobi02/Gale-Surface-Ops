# Data SSD: where the real-site data lives

| | |
| --- | --- |
| **Owner** | Backend lane, for Sadman Shaharier Mahim |
| **Date** | 2026-11-12 |
| **Status** | Decided (BD-12, amended by BD-126). The links on the backend machine were verified on 12 Nov 2026 |
| **Related** | [Data downloads](data-downloads.md) · [Plan 03](../plan/backend/03-deps-build-ssd.md) · [Decisions](../plan/backend/decisions.md) |

The real Gale (`gale_boxwork`) inputs and outputs are tens of gigabytes. The development disk cannot hold them, and CLAUDE.md §2 forbids committing them. They live on an external SSD and the repo reaches them through symbolic links. Every path below is written with the shell variable `$SSD`, the folder on the drive that holds the data.

## Layout

| On the SSD | Linked from | Holds |
| --- | --- | --- |
| `$SSD/work/<name>/` | `pipeline/work/<name>` | Downloads and intermediates (`dem`, `ortho`, `ti`, `images`, `spice`, `rad`, `donki`, `traverse`, `runs`, plus any other folder under `$SSD/work`, for example `comm`, `crism`, `rems`) |
| `$SSD/sites/gale_boxwork/{tiles,grid,images}/` | `data/sites/gale_boxwork/{tiles,grid,images}` | The bundle binaries (git-ignored; released as an asset, [hosting](hosting.md)) |
| `$SSD/INVENTORY.md` | none | Every input file with its source, size and SHA-256 (local value compared with the recorded one) |

`pipeline/work` and `data/sites/gale_boxwork` stay real directories because they hold tracked files (`pipeline/work/.gitkeep`, `data/sites/gale_boxwork/README.md`, the committed manifest and vectors). A symlinked directory would hide them from git. In a linked worktree, `pipeline/work` may itself be a link to another clone; the script replaces only that link and never touches its target.

## Mount and link

```bash
export SSD="/Volumes/<drive>/<folder>"       # the folder that contains work/ and sites/
make ssd-link SSD="$SSD"                     # same as: bash scripts/ssd-link.sh "$SSD"
```

`make ssd-link` is idempotent: a link that already points to the right place prints `ok`, a new link prints `link <path> -> <target>`. It creates a missing folder on the SSD, replaces a wrong link or an empty folder, and refuses (exit 1, message on stderr) to touch a real folder that has files in it: move those files to the SSD first. It never deletes a link target. With an empty `SSD` or a path that is not a directory it exits 2 and changes nothing.

The links are git-ignored: `pipeline/work/*` and `data/sites/*/{tiles,grid,images}` are in `.gitignore`, and markdownlint skips them (`package.json` `lint:md`).

## The conda environment

The pipeline environment may sit on the SSD too (it is several gigabytes):

```bash
CONDA_ENVS_PATH="$SSD/conda/envs" conda env create -n marswalk-pipeline -f pipeline/environment.yml
conda config --append envs_dirs "$SSD/conda/envs"
make check-env
```

`make -s pipeline-python` finds the environment by name through `conda env list`, so registering the folder with `envs_dirs` is enough. On the backend machine the environment is on a second volume (`/Volumes/MarswalkEnv/conda-envs/marswalk-pipeline`); the registration step is the same. `pipeline/environment.yml` pins `marstime==0.4.6` (F6 generator, BD-122) and `cdflib==1.3.16` (SPDF L2 CDF files, [rad-series.md](rad-series.md)).

## Checking the links

```bash
make ssd-link SSD="$SSD" | grep -vc '^ok'    # 0 when everything is linked
$(make -s pipeline-python) -m pytest -q pipeline/tests/test_ssd_link.py
```

Do not write large outputs to the development disk: point `--work` and `--out` of the pipeline at the linked folders.

SPICE refuses a kernel path longer than 255 characters. In a deeply nested worktree the four independent-spiceypy tests in `test_spice_tables.py` then fail on the length, not on the data; point them at the SSD folder instead: `MARSWALK_SPICE_DIR="$SSD/work/spice" MARSWALK_REQUIRE_SPICE=1 $(make -s pipeline-python) -m pytest -q pipeline/tests/test_spice_tables.py`.
