# Hab Core LAN spike (M1)

| | |
| --- | --- |
| **Owner** | T20.07 (Sadman Shaharier Mahim, R4 Hab Core); used by T20.08 |
| **Date** | 2026-11-12 |
| **Status** | Spike code for the M1 go/no-go (Sat 7 Nov). Not imported by the app. The virtual event (BD-02) runs on one laptop, so the loopback section below is the supported check; the router steps are kept for a venue with a network |
| **Related** | [TASK-20](../../../docs/tasks/TASK-20_hab-core-skeleton.md) · [02 §F NFR-12](../../../docs/specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation) · [06 §B](../../../docs/specs/06_High_Level_Implementation_Plan.md#b-milestones) |

`spike.ts` runs the real Hab Core server (T20.04) with a spike-only session that emits one numbered `EVENT` per second. The page in `public/` shows each event's number very large, plus the time it arrived on that device to the millisecond, so one video of all screens shows when each number arrived (NFR-12: ≤ 500 ms on all clients).

## Run it

On the laptop, from the repo root (no internet needed once `npm ci` has run):

```sh
npx tsx apps/hab-core/spike/spike.ts --port 8080
```

## Check on loopback (the virtual event, BD-02)

Run the spike as above, then open `http://localhost:8080/` in two browser windows on the same laptop. Each shows "Connected" and a number that goes up by one each second; the two numbers match within a frame. Nothing leaves the laptop. For the real server and its four role windows use `npm run hab:local -- --open` ([demo kit](../../../docs/ops/demo-kit.md)).

## Join from a phone (T20.08), only at a venue with a network

1. Unplug the router's WAN cable. Join the laptop and both phones to the router's Wi-Fi.
2. Find the laptop's LAN address: macOS `ipconfig getifaddr en0`; Windows `ipconfig` (IPv4 Address); Linux `hostname -I`.
3. On each phone open `http://<laptop-ip>:8080/` in Chrome (Android) or Safari (iOS). Type `http://`; the page is plain HTTP on the LAN.
4. Open the same address in a browser on the laptop.
5. Each screen shows "Connected" and a number that goes up by one each second.
6. If a phone shows "Disconnected — retrying", check that it is on the router's Wi-Fi and not on mobile data, and that the laptop firewall allows incoming connections on port 8080.

## Measure (T20.08)

Put the three screens side by side and record one video. For each number, read the frame where it first appears on each screen; the spread between the first and last device is the latency to report. The on-screen arrival times come from each device's own clock and are only a cross-check: device clocks are not synchronised.

Record devices, worst spread and go/no-go in `docs/ops/verification-log.md` (T20.08 section).
