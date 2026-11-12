# Demo kit for the virtual event

| | |
| --- | --- |
| **Owner** | Backend lane, for Sadman Shaharier Mahim |
| **Date** | 2026-11-12 |
| **Status** | Decided (BD-02, BD-82, BD-133). The preflight steps run by `scripts/demo-preflight.sh`; the steps that need the real bundle and the scenario are skipped, with the reason printed, until backend packages 23 and 25 land |
| **Related** | [Hosting](hosting.md) · [SSD](ssd.md) · [Demo script](demo-script.md) · [Spike](../../apps/hab-core/spike/README.md) · [Plan 21](../plan/backend/21-network-kit.md) · [Decisions](../plan/backend/decisions.md) |

The event is virtual (U-14). The demo runs on **one laptop**: the Hab Core on this machine and every role view as a browser window on `localhost`. There is no router, no travel network and no phone to join (BD-02), so no step below needs anything beyond this laptop. This replaces the router kit planned in T28.01.

## What the laptop needs

- The repo with `npm ci` done, and `npm run build` done once (the Hab Core serves `apps/web/dist`).
- The conda environment `marswalk-pipeline` ([SSD](ssd.md) says where it lives), for the preflight's environment, bundle and replay steps.
- The data SSD mounted and linked (`make ssd-link SSD=...`) when the real `gale_boxwork` bundle is used.
- A browser with several windows (the demo uses four).
- Nothing from the internet at demo time (NFR-01). The preflight makes no outbound request.

## Setup order

1. Mount the SSD and link it: `make ssd-link SSD="$SSD"`.
2. Run the preflight: `bash scripts/demo-preflight.sh`. It must end `0 failed`. A `SKIP` line names the input that is absent; it is a failure only for the rehearsal, when the real bundle and the scenario are in place.
3. Start the Hab Core and the four windows with one command: `npm run hab:local -- --open`. It starts the Hab Core on port 8080 with the `storm-sol4190` scenario (as `make hab` does), prints the four URLs and opens them in the default browser. Without `--open` it only prints them.
4. Check each window shows its connection as connected: ops, presenter, EVA tablet EV1, HUD EV1.
5. For the join QR codes (one per role) open `http://localhost:8080/api/join-qr?role=ops`; `--public-host <host>` sets the host the code names (default: the first non-internal IPv4 address, else `localhost`). Roles: `planner`, `ops`, `eva:EV1`, `eva:EV2`, `hud:EV1`, `hud:EV2`, `earth`. A code is for a second device on the same network, which the virtual event does not use; the endpoint stays so the same build works at a venue.

The four windows, in this order (`npm run hab:local` prints the same list):

| Window | Role | URL |
| --- | --- | --- |
| Ops console | `ops` | `http://localhost:8080/#/ops` |
| Presenter | `presenter` | `http://localhost:8080/#/presenter` |
| EVA tablet EV1 | `eva:EV1` | `http://localhost:8080/#/eva/EV1` |
| HUD EV1 | `hud:EV1` | `http://localhost:8080/#/hud/EV1` |

## Preflight

`bash scripts/demo-preflight.sh` runs, in order:

| Step | What it runs | Skipped when |
| --- | --- | --- |
| `check-env` | `make check-env` | never; a failure stops the preflight |
| `validate` | `make validate SITE=gale_boxwork` | `data/sites/gale_boxwork/site-manifest.json` is absent |
| `replay` | `make -s replay` twice; both must print one 64-hex log hash, the same | `scenarios/storm-sol4190/scenario.json` is absent |
| `health` | `GET /api/health` must answer `"status":"ok"`; starts a Hab Core on the port of `HAB_URL` (default `http://127.0.0.1:8080`) if none runs | no Hab Core answers and none can be started (no scenario) |

The last line is `preflight: <n> passed, <n> skipped, <n> failed`; the exit code is 1 when anything failed.

## Fallback order

If a step of the live demo fails, move down one level and say so on screen:

1. **Single laptop, live.** The topology above.
2. **Recording replay.** The recorded log of the reference run (`make record` writes `scenarios/storm-sol4190/recording.json`), played by the replay view, labelled `replayed recording`. Its `log_hash` is checked against `make replay`.
3. **Video.** The recorded screen capture of the killer demo ([01 §E.1](../specs/01_Product_Requirements_Document.md#e1-killer-demo--storm-at-sol-4190-target-90-s-of-the-240-s-video)).

Nothing is dropped silently: the window or caption names which level is showing.
