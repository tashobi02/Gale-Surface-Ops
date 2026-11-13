# Package 29 live verification — 13 Nov 2026

Branch: `fe-live2`. Scope: T24.11, T25.08, T27.06, T31.08; B-01..B-05; FD-190, FD-197, FD-520, FD-521, FD-522.

This lane-local record obeys the explicit writable-file boundary. All seven Playwright checks ran live against the rebuilt
`apps/web/dist` bundle on port `8119` with Playwright Chromium + Hab Core (mock site `?site=mock_site`; real `gale_boxwork` bundle
absent on this machine).

## Tests first and review

Prior Codex draft run: 7 red tests (5 evidence-helper assertions, 2 current-stop regressions) and 3 mutations killed.

This browser-fix round ran targeted Vitest tests **red first** (**6 failures** across two pre-fix runs: 5 in `postEvaReport.test.ts`,
`debug.test.ts`, `replayRoute.test.ts`, `mapWorkspace.test.ts`, `eva.test.ts` — `5 failed | 165 passed (171)` — plus 1 additional
CSS height-cap test in `mapWorkspace.test.ts` — `1 failed | 34 passed (35)`):

- `scr17PostEvaReport.tsx` gained `data-screen="SCR-17"` on the report root.
- `ReplayRoute.tsx` / `scr11OpsConsole.tsx` / `OpsMap.tsx` added `staticReplay` / `disableRelayFetch` so `#/replay` never fetches `/api/relay-coverage/...`.
- `debug.ts` moved print CSS into external `debug.css` (`B-05`, avoiding CSP `<style>` injection).
- `scr12EvaTablet.css` / `.tsx` constrained `< 900 px` portrait grids (`minmax(0, 1fr)`, `max-width: 100%`, two-column `.action-row`, wrapping alert copy) so `360 px` viewports keep SCR-14 sheet controls inside the viewport.
- `scr02MapWorkspace.css` (`B-04`) wrapped `.scr02-top-bar`, clipped site/chip labels with ellipsis, and capped `.scr02-results` at `36dvh` below `500 px` height so the left drawer fits `844×390`.
- `e2e/lib/planner.ts` updated `openPlanTab` to dismiss visible `.coach-marks-popover` overlays before clicking the Plan tab.

## What the checks prove (live on port `8119` against final `apps/web/dist`)

| Check | Automated evidence | Live outcome on `E2E_PORT=8119` |
| --- | --- | --- |
| `ops-no-terminal` | Active LOAD, START EVA, 60×, event stepping, natural ENDED → populated SCR-17 on the real F4 Hab Core; active approval/rover UI fixtures; live utility-rover dispatch skips on F4 with `bundle absent (...)` | **3 passed, 2 skipped (0 failed, 6.9 s)**. Complete storm/acknowledge/approve mission stays `test.fixme('needs N-200')`: `START_EVENT` is presenter-only; utility-rover dispatch skips with `bundle absent (gale_boxwork)` |
| `task-latency` | Real task at current stop; 20 tablet DONE/UNDO changes with paused sim time, browser click-to-ops-DOM timestamps (`≤ 500 ms`); presenter-started storm; real ABORT option drops; independent full-log totals/per-stop counts match live API and SCR-17 | **8 passed across all 8 viewports (0 failed, 1.3 m)**: `desktop-1440` `p95=12.9 ms` (`max=12.9 ms`), `galaxy-tablet-landscape-1138x712` `p95=19.2 ms` (`max=23.9 ms`), `galaxy-tablet-portrait-712x1138` `p95=21.9 ms` (`max=22.5 ms`); all 8 viewports `<= 500 ms` |
| `replay` | `scenarios/storm-sol4190/recording.json` exists (`N-81` satisfied); browser playback to ENDED with API/socket access refused, zero `/api/relay-coverage` calls, identical computed/recorded SHA-256 hash, whole event log, final message position | **5 passed (0 failed, 16.4 s)** |
| `print` | Populated SCR-17 cases (3/5/6 stops and 1/2/3 alerts), A4 and Letter, CSS 12 mm margin, at most two pages, plus SCR-08 print cases | **7 passed (0 failed, 8.7 s)** |
| `targets` | Live EVA/HUD/ops/planner target dimensions and gaps across desktop, iPhone 14, Pixel 7, iPad Mini and Galaxy Tab S4 viewports; SUMMON/ABORT hold; TASK ROVER two-tap confirm | **125 passed, 35 skipped (0 failed, 2.9 m)** (real-bundle and pre-existing N-29/N-130/N-31/N-160 skips only) |
| `hud-glance` | Nominal/caution/warning/no-link HUD states, labelled values, 56 px, top 60%, 7:1, no controls | **4 passed (0 failed, 2.7 s)** |
| `link-lost` | Simultaneous EVA/ops SCR-18 deadline, cached telemetry, retries, resumed server values across all 8 live viewports | **8 passed (0 failed, 44.7 s)** |

## Commands run after final source edit

```sh
E2E_PORT=8119 timeout 600s make e2e-one CHECK=targets
E2E_PORT=8119 E2E_SKIP_BUILD=1 timeout 600s bash -c 'make e2e-one CHECK=print && make e2e-one CHECK=hud-glance && make e2e-one CHECK=link-lost'
E2E_PORT=8119 E2E_SKIP_BUILD=1 timeout 600s bash -c 'make e2e-one CHECK=ops-no-terminal && make e2e-one CHECK=replay && make e2e-one CHECK=task-latency'
```

`T24.11`, `T27.06`, and `T31.08` are marked `done`. `T25.08` remains `wip` because the complete storm-in-SCR-11 flow is gated on `N-200` (`START_EVENT` has no ops control) and the live utility-rover dispatch case skips when `gale_boxwork` is absent (`bundle absent`).

## Package 32 video inventory — 13 Nov 2026

On `fe-vidcheck`, searched `var/`, `docs/ops/` and `apps/web/e2e/` for MP4, WebM, MOV, MKV, SRT and capture manifests. No such files were found. In particular, `var/videos/capture-manifest.json`, raw clips and both assembled cuts are absent. There are therefore no sizes, durations, resolutions, frames, subtitles or spoken narration to verify. A prior capture-pass entry in `docs/AI_USE.md` does not establish that its local outputs are present here.

`E2E_PORT=4179 timeout 1800s make e2e-one CHECK=capture` failed before any test assertion: Hab Core exited with `Error: listen EPERM: operation not permitted /tmp/tsx-1000/327.pipe` from `tsx`. No capture or manifest was produced. `bash scripts/make_video.sh` exited 1 with `error: capture manifest missing: .../var/videos/capture-manifest.json`; it produced no plan, subtitles or MP4. `ffmpeg` and `ffprobe` are installed. The existing Python video-plan suite passes 4 tests, but that does not verify actual footage.

The assembler read only `clip_path`, the first matching clip, for each beat: `scripts/video_plan.py` stores all roles in `clips`, but `scripts/make_video.sh` consumed only the first. **Fixed 13 Nov (FD-541):** the assembler now cuts each role's own segment and lays them side by side (`scripts/stack_roles.py`), so a beat that drove the HUD, the EVA tablet and the ops console keeps all three in the picture rather than the first role only. The regression test fails when the stack is narrowed to one role. A successful capture still does not establish the multi-role 30-02 sequence: the content, including sheltered crew, must be verified. Beat order, narration, exact subtitles and non-flat frames remain unverified for both cuts.

Outside the sandbox, rerun `E2E_PORT=4179 timeout 1800s make e2e-one CHECK=capture`, then `bash scripts/make_video.sh`; verify both outputs against the demo script and with `ffprobe` and sampled frames before marking any T17 acceptance done. Uploads remain outstanding.

## Package 32 capture and assembly — 13 Nov 2026 (the orchestrator, later the same day)

The earlier `tsx` EPERM did not reproduce: the same host that could not start a Hab Core for the capture now starts one. `E2E_PORT=8165 timeout 1800s npx playwright test -c apps/web/e2e/playwright.config.ts "checks/capture\.spec"` passed (1 passed, 22.3 s) and produced the artefacts that were absent before:

- `var/videos/capture-manifest.json` (5,213 bytes, `generated_utc` 2026-11-13T07:54:29Z, site `mock_site`), every beat recording `reachedInMs` inside its `windowMs`;
- five raw clips in `var/videos/raw/`: `planner.webm` (1.46 MB), `ops.webm` (1.25 MB), `hud.webm` (364 KB), `eva.webm` (508 KB), `report.webm` (253 KB).

`bash scripts/make_video.sh` then assembled both cuts and verified their own durations:

| Cut | File | Size | Duration (ffprobe) | Frames | Video |
| --- | --- | --- | --- | --- | --- |
| 240 s | `var/videos/marswalk-240s.mp4` | 5,196,320 B | 240.000000 s (window [235, 245]) | 7,200 | h264 1440×900 |
| 30 s | `var/videos/marswalk-30s.mp4` | 568,484 B | 30.000000 s (window [28, 32]) | 900 | h264 1440×900 |

`var/videos/marswalk-240s.srt` (3,253 B) and `var/videos/marswalk-30s.srt` (435 B) were written with it.

**The multi-role stacking of FD-541 is confirmed by a sampled frame, not only by the plan.** Beat `30-02` of the manifest carries three clips (`hud.webm`, `eva.webm`, `ops.webm`) for one window, and the frame taken at t=12 s of `marswalk-30s.mp4` shows all three side by side: the HUD with its `Shelter now — radiation surge` warning and `LINK UP ✓ NOMINAL`, the EVA tablet with `HAVEN 50 MIN`, `O₂ 80%`, the shelter options sheet and the SUMMON ROVER / ABORT TO HAB controls, and the ops console with its event log and the contingency options. The burned-in subtitle is present in the frame. Before FD-541 only the first of the three clips would have been cut.

Two things are still not established, so no T17 acceptance is claimed on this evidence alone: there is no narration track (`make_video.sh` reports no TTS binary on this host, so the cuts carry burned-in English subtitles and `.srt` only), and the sampled frame is one frame of one beat — the beat order, the exact subtitle text and the non-flatness of every beat have not each been read through. The real `gale_boxwork` bundle is still absent here, so this capture ran against `mock_site`. Uploads remain outstanding.

## Browser checks the orchestrator ran on 13 Nov 2026 (after the livefb2 fixes)

All against the rebuilt `apps/web/dist`, one check at a time, each on its own port, with the mock site (`?site=mock_site`); the real `gale_boxwork` bundle is absent on this machine, so the cases that need it are expected skips.

| Check | Port | Result |
| --- | --- | --- |
| `fallbacks-live` | 8152 | **10 passed**, 0 failed — the taken-over inert case and the new transport-lost case are both green |
| `queued-resend` | 8153 | **2 passed**, 0 failed — including "a queued SUMMON survives a page reload and resends once" |
| `link-lost` | 8154 | **16 passed**, 0 failed — 8 viewports × 2 cases |
| `fullmap` | 8161 | **4 passed**, 1 skipped (N-120, the haven bands) |
| `offline` | 8162 | **55 passed**, 11 skipped (N-90, the join QR images), 0 failed |
| `ops-no-terminal` | 8163 | **3 passed**, 2 skipped (N-200 the storm flow, N-140 the utility-rover dispatch), 0 failed |
| `release-offline`, `release-recovery`, `release-roles`, `release-timings`, `release-csp` | 8164 | **98 passed**, 2 skipped, 0 failed |
| `capture` | 8165 | **1 passed** — the artefacts are recorded in the section above |

The `axe` run was also started on port 8166; it needs a budget longer than 600 s (it takes about 15 minutes) and its result is recorded with the others when it finishes.
