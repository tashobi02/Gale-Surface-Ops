# 21 — Network kit for a virtual event: join QR, single-laptop mode, demo kit

| | |
| --- | --- |
| **Subtasks** | T28.02, T20.07, T20.09, T28.01, T28.04 |
| **Depends on** | 03 (`qrcode`), 20 (last of the server chain) |
| **Branch** | `be/21-network-kit` |
| **Spec refs** | 02 §A.5, §E.5; 06 §D.5; NFR-01, NFR-12; decisions BD-02, BD-82 |

## Files

`apps/hab-core/src/server.ts` (`GET /api/join-qr?role=`) · `apps/hab-core/src/cli.ts` (`--public-host`) · `apps/hab-core/tests/server.test.ts` · `apps/hab-core/src/localMode.ts` (new: `npm run hab:local` prints and, with `--open`, opens the ops, presenter, EVA EV1, HUD EV1 URLs; no network beyond localhost) · `apps/hab-core/package.json` (script `local`) · `apps/hab-core/spike/README.md` (T20.07 close: loopback instructions) · `apps/hab-core/tests/localMode.test.ts` (new) · `docs/ops/demo-kit.md` (new: virtual-event kit, setup order, fallback order: single laptop → recording replay → video)

## Steps (tests first)

1. Server test: `/api/join-qr?role=ops` returns `image/svg+xml`; the decoded payload (decode with the `qrcode` package's matrix: compare against `QRCode.create(url)` modules) equals the BD-82 URL; unknown role → 400; no outbound request (the test runs with a fetch spy).
2. `localMode.test.ts`: URLs for each role; `--open` builds the platform command without running it in the test.
3. `demo-kit.md` written as runnable steps; its preflight block is executed by `scripts/demo-preflight.sh` (new, in this package): `make check-env`, `make validate SITE=gale_boxwork`, `make replay` twice equal, `curl /api/health`.

## Automated verification

`npm --workspace @marswalk/hab-core test -- server localMode`; `bash scripts/demo-preflight.sh` (skips the validate step with a printed reason if the real bundle is absent; package 28 runs it fully).

## Status rows

```text
| T28.02 | done | <commit date> | GET /api/join-qr (local SVG, BD-82); server.test.ts |
| T20.07 | done | <commit date> | Spike page and script on loopback; README updated for the virtual event |
| T20.09 | done | <commit date> | [localMode.ts](../../apps/hab-core/src/localMode.ts): single-laptop multi-window mode, the primary topology (BD-02) |
| T28.01 | done | <commit date> | No router (virtual event, U-14/U-21, BD-02); [demo-kit.md](../ops/demo-kit.md) records the localhost topology |
| T28.04 | done | <commit date> | demo-kit.md checklist, executed by scripts/demo-preflight.sh |
```

## Done when

One command brings up every role view on one laptop and the QR endpoint works offline.
