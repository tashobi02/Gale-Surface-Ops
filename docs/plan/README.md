# Full-run plan: how the product is finished (12–13 Nov 2026)

This folder is the working plan for finishing Marswalk Surface Ops before the **submission deadline, 13 Nov 2026, 18:00 (Asia/Dhaka)**. Read this file first, then your lane's `00-overview.md`. It is written for people **and** for their coding agents. An agent that reads this file has everything it needs to continue without asking questions.

## 1. What changed and why

### 1.1 The takeover (11–12 Nov)

- **11 Nov.** Sadman Shaharier Mahim (product and systems lead) took over Ridita Alam's agent-ready UI subtasks in #192. The reason was that an audit found defects in the merged UI. The fixes merged as #202–#207.
- **11–12 Nov.** A review of all open teammate PRs found that most were stale or defective. Sadman's orchestration rebuilt them on main, credited the original authors, and closed the originals as superseded:
  - #215, #225 and #226 for Saba Atharique's work;
  - #194 and #188–#191 for Anjim Hossain's;
  - #208, #216, #217 and #218 for Mishkat Ahmed Khan's.
- **12 Nov.** Progress was 33 % and the deadline is one day away. Sadman asked the team to halt and took over the whole product. From then until the deadline:
  - the product is finished by agents in two lanes;
  - there are **no manual checks**: every manual acceptance check is replaced by an automated one;
  - there are **no human decisions**: open questions are decided from the specs and logged;
  - **no TODOs are left behind.**

### 1.2 Collapsing the subtasks into two lanes

The ~345 subtasks in `docs/tasks/` **stay**. Their ids, acceptance criteria and status rows are still the record of what is done. But work is no longer organised by subtask or by owner. It is organised into **two lanes**:

| Lane | Branch | Plan | Covers |
| --- | --- | --- | --- |
| **Backend** | `core-backend` | [backend/](backend/00-overview.md) (31 packages) | Hab Core, compute, protocol, pipeline (incl. the real Gale site build), scenario file, links, rover, report server side, replay, network kit, `make demo` |
| **Frontend** | `core-frontend` | [frontend/](frontend/00-overview.md) (36 packages) | Every screen SCR-00…SCR-20 to the demo mockup, planner, ops, EVA/HUD, presenter, setup, report UI, replay UI, the e2e verification harness, usability, submission package, videos |

- **Packages.** Each lane's planner (an Opus agent) wrote numbered **work packages** (`NN-<slug>.md`). Each package lists the subtasks it finishes, the files, the spec and mockup references, tests first, the automated check that replaces any manual acceptance, and the exact status-row change.
- **Order.** Packages are done **in number order**, two per fresh implementer agent.
- **Status.** A package's status rows flip to `done` only when its acceptance (or the automated replacement) is met. Otherwise the row stays `wip` with what is left.
- **Ownership.** The "owner" column in `docs/tasks/_coordination.md` no longer decides who may edit a file during this run. The **lane** does (see §4).

### 1.3 Decisions

Each lane's `decisions.md` resolves every open `TODO(decision)` / `TODO(verify)` / U- item in its scope:

- frontend decisions are `FD-…`;
- backend decisions are `BD-…`, indexed in `backend/decisions-index.md`.

Every row is labelled **"decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026"**. Decisions Sadman made himself say so explicitly.

Behaviour changes went into the specs first, as `spec-change:` commits marked Proposed with the same attribution. **Do not add new TODO markers.** If a new choice comes up, decide it from the specs, append a row to your lane's `decisions.md`, and implement it.

## 2. Who does what (from 12 Nov evening)

| Lane | Person | Their agent works on |
| --- | --- | --- |
| Backend | **Sadman Shaharier Mahim** | `core-backend` |
| Frontend | **Obidit Islam** | `core-frontend` |

- **Integration.** Each lane merges its own branch into `merging-core` after every batch (§5), so no hand-offs or messages are needed. At the end, Sadman's side opens one PR `merging-core` → `main`, so CI runs once.
- **No PRs during the run.** Work is committed and pushed to your lane branch only.

### 2.1 Where each lane stands at handover (merging-core @ 5234c63, 53 %, 183/345 subtasks)

- **Backend done:** 02, 01a, 01b, 04–15. **Next:** 03, then 16 onward. 22–23 are the real-site build.
- **Frontend done:** 01–10. **Next:** 11 onward. `core-frontend` already contains merging-core @ 5234c63.

## 3. How an implementer agent runs one batch

Paste this to your coding agent, filling in the lane and the package numbers. One agent does **two packages** and then stops. Then start a fresh agent for the next two. This keeps each agent's context small.

```text
You are the <FRONTEND|BACKEND> IMPLEMENTER for the Marswalk repo. Work only in your clone/worktree on branch
core-<frontend|backend>. First: `git fetch && git merge origin/merging-core` (resolve conflicts per docs/plan/README.md §5).

Implement docs/plan/<lane>/<NN>-*.md then <MM>-*.md exactly as written. Skim 00-overview.md and decisions.md once;
read only the files each package names (and, frontend, the mockup sections it cites).

HARD RULES:
- Tests first, and RUN THEM RED before implementing (report the red count). If new tests pass at once,
  mutation-check them.
- Never add TODO(decision)/TODO(verify). Decide from the specs, append a row to docs/plan/<lane>/decisions.md
  labelled "decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026",
  and implement it.
- CLAUDE.md non-negotiables:
  - no internet at runtime;
  - deterministic science only in packages/compute;
  - no Date.now in apps/hab-core/src/engine;
  - every displayed value has data-provenance + data-source;
  - Mars CRS (IAU_2015:49900, projected metres, never EPSG:3857/ol/sphere);
  - no brand orange in OPS/HUD;
  - no invented numbers or ids.
- Stay inside your lane's files (docs/plan/README.md §4).
- Frontend: activate the harness checks a package names with `make e2e-one CHECK=<name>` (with a timeout,
  foreground, never leave servers running). Planner pages use ?site=mock_site.
- Backend: no module-level mutable state in the engine. If the reference replay log_hash changes, explain why
  in the commit body.

BOOKKEEPING:
- Update the status rows each package names, and run `python3 scripts/update_progress.py` in the same commit.
- Add one docs/AI_USE.md row per package (bottom of the table).
- Use conventional commits with T/FR ids, ending with the Co-Authored-By line of your agent.
- Stage explicit paths only, never `git add -A`.
- Run targeted tests while working, then `make lint typecheck test-web docs-check` once after each package.
- Commit per package and push your lane branch. No force-push, no PR.
- Stop after <MM>. Report in ≤ 120 words: commits, red counts, checks, deviations.
```

## 4. Lane boundaries (the main way to avoid conflicts)

| Path | Owned by | The other lane may… |
| --- | --- | --- |
| `apps/hab-core/**`, `packages/compute/**`, `pipeline/**`, `scenarios/**`, `schemas/**`, `data/sites/**` (except tiles fixtures) | **Backend** | read only |
| `packages/protocol/**` (types, wire format, permissions) | **Backend** | read only. The frontend asks for a change in `docs/plan/frontend/01-needs-from-backend.md` and Sadman's lane adds it |
| `apps/web/src/worker/**` (the compute worker adapter) | **Backend** | read only. Frontend tests that touch it use its public API (`createPlanWorker`) |
| `apps/web/**` (everything else), `apps/web/e2e/**`, `docs/design/**` | **Frontend** | read only |
| `docs/specs/*` | Both, **only through `spec-change:` commits** that touch the sections the lane's package names | — |
| `docs/tasks/status.md`, `docs/AI_USE.md`, `README.md` (progress block), `docs/tasks/_coordination.md` | Both (append/update own rows) | — (conflicts are mechanical, see §5) |
| `docs/plan/<lane>/**` | That lane | read only |

If a package needs a file the other lane owns, don't edit it. Add a numbered line to your lane's needs file (§5) and publish; the owning lane picks it up at its next batch. Until it lands, show "—" for the missing value.

## 5. Branches, merging and conflicts

```text
main  ←── (one PR at the end, Sadman) ── merging-core ⇄ core-backend   (Sadman's agent)
                                              ⇄ core-frontend  (Obidit's agent)
⇄ = before a batch: merge merging-core into your lane; after a batch: merge your lane into merging-core
```

No messages between the lanes are needed. Each lane's agent does both directions itself:

- **Before every batch:** `git fetch && git merge origin/merging-core` into your lane branch. On conflicts run
  `bash scripts/finish_merge.sh .` (§5.1, §5.2), then run the checks.
- **After every batch:** push your lane, then publish it to `merging-core`:

  ```bash
  bash scripts/publish_lane.sh    # merges your pushed lane into merging-core and pushes; retries if the other lane pushed first
  ```

  `publish_lane.sh` runs `make lint typecheck test-web docs-check` on the merged result. It **refuses to push a red
  `merging-core`**: if the checks fail, nothing is pushed. Fix it on your lane branch, then publish again.
- **Nobody pushes to `main`.** Nobody force-pushes. Nobody edits `merging-core` directly except through `publish_lane.sh`.
- **Collisions are prevented by the lane boundaries (§4), not by talking.** The only shared files are the mechanical
  ones (status, AI_USE, README progress, and `spec-change:` sections), which the scripts merge the same way on both sides.
- **The one exception is a cross-lane need.** The frontend needs a protocol or worker change, or the backend needs a UI
  change. Write it as a numbered line in `docs/plan/frontend/01-needs-from-backend.md`, or
  `docs/plan/backend/01-needs-from-frontend.md`, and publish. The owning lane's agent checks that file at the start of
  every batch and picks it up. No chat is needed.

### 5.1 Resolving conflicts (mechanical files)

Two scripts in `scripts/` make every resolution identical. Run them from the repo root while a merge is stopped on conflicts:

```bash
bash scripts/finish_merge.sh .   # resolves README.md, docs/AI_USE.md, docs/tasks/status.md, then commits and pushes
```

What it does:

- `README.md`: takes the incoming side, then regenerates the progress block with `scripts/update_progress.py`. Never hand-edit the block.
- `docs/AI_USE.md`: union merge, so both sides' rows are kept. The table is append-only.
- `docs/tasks/status.md`: `scripts/merge_status.py` starts from the incoming file and re-applies only the rows your branch changed. If both sides changed the same row, it keeps the incoming row and prints `BOTH changed Txx.yy` for you to check. It fails if a duplicate row would result.
- Any other conflicted file: it stops with `UNRESOLVED <path>`. Resolve that by hand (§5.2).

### 5.2 Resolving conflicts (real files)

- **Spec docs (`docs/specs/*`):** keep both sides' edits. If both sides edited the same row (for example a U-row), combine them: each side's resolution stays, with its own attribution. Never drop a decision.
- **Files the other lane owns:** take the owning lane's version (`git checkout --theirs` or `--ours`, whichever is the owner), then adapt your own tests to it. Example: on 12 Nov `apps/web/src/worker/planWorker.ts` conflicted. The backend's instance API (`createPlanWorker`) won, and the frontend's `LOAD_GRID` test was ported to it.
- **Shared code you both changed:** keep the behaviour of both. Run `make lint typecheck test-web docs-check` before you commit the merge.
- **Never** resolve a conflict by deleting tests, and never `git push --force`.

### 5.3 Commit conventions

- Use conventional subjects with T/FR ids, for example `feat(web): T09.05 … (FR-07)` or `fix(hab-core): …`.
- Each commit ends with your agent's `Co-Authored-By:` line.
- Rewritten teammate code is committed by the person running the agent, with `Co-authored-by:` crediting the original author.

## 6. Environment notes

- **Frontend:**
  - Node only: `npm ci` (no conda).
  - The e2e harness is `make e2e`, or `make e2e-one CHECK=<name>`. It uses the installed Playwright Chromium. If the revision differs, set `E2E_CHROMIUM` to an installed browser (see `apps/web/e2e/README.md`).
  - Planner pages run on `?site=mock_site` until the real `gale_boxwork` bundle exists (backend 22–23).
- **Backend:**
  - The pipeline needs the `marswalk-pipeline` conda env (`make setup`; `make check-env` must pass). It also needs `cdflib`; backend package 03 adds it to `pipeline/environment.yml`.
  - Real-site data is not in git. Point `pipeline/work/<name>` and `data/sites/gale_boxwork/{tiles,grid,images}` at your data folder with symlinks. Those folders are git-ignored and excluded from markdownlint.
  - The data inventory, with source URLs and SHA-256, is kept with the data, as `INVENTORY.md`.
- **Never commit** datasets, large binaries or `node_modules`.

## 7. Finishing

1. **Each lane finishes its packages.** Backend 30 is the TODO sweep; frontend 28–29 are the verification packages.
2. **Reviewers run once per lane,** after all its packages are done. They use each lane's `99-verification.md`, then there is one fix round.
3. **Both lanes are published to `merging-core`** (§5). Sadman's side runs the end-to-end check (backend `99-verification.md`), then opens the PR `merging-core` → `main`.
4. **Submission** (frontend 31–32): Sadman or Obidit pastes the project page and uploads the videos using the team account, per `submit-now.md`, before **13 Nov, 18:00**.
