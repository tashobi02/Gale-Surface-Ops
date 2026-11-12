# 26 — Demo numbers, 01 §E.1, the reference command list and the recording

| | |
| --- | --- |
| **Subtasks** | T21.15, T21.09, T21.10, T32.18; recording output for T27.05 |
| **Depends on** | 25, 11, every engine package (06–10, 15–19) |
| **Branch** | `be/26-demo-numbers` |
| **Spec refs** | 01 §E.1; 02 §D.13, §D.17; decisions BD-97, BD-105, BD-107 |

## Files

`apps/hab-core/scripts/demo-numbers.ts` (part (b); hab lat/lon from the manifest, BD-107; `nextPassStart`) · `apps/hab-core/tests/demoNumbers.test.ts` and `__snapshots__/demoNumbers.{alert,eva}.snap` · `docs/specs/01_Product_Requirements_Document.md` §E.1 (numbers only) · `docs/ops/demo-script.md` · `scenarios/storm-sol4190/reference_commands.json` (new) · `scenarios/storm-sol4190/scenario.json` (`start_utc` from the rule) · `scenarios/storm-sol4190/recording.json` (new) · `docs/ops/verification-log.md`

## Steps

1. T21.15 (b): enable the skipped tests; `eva_start_utc` by the stop-2 dwell rule; snapshot files regenerated; the guard test passes.
2. Write `start_utc` into the scenario via `scenario_build.py --start-utc <value from demo-numbers JSON>` (package 25's flag).
3. T32.18: first replay without the crew beats to read the sim times of the alert and options from the log; write `reference_commands.json` (START_EVA, SET_CLOCK, JUMP_NEXT_STOP as needed, START_EVENT at `series_start_utc`, SUMMON_VEHICLE, APPROVE_OPTION as in 01 §E.1); each `sim_time` copied from that replay's log, with the log line cited in `$comment`.
4. T21.09: replace every `…`/placeholder in 01 §E.1 and the demo script with values from `demo-numbers` output or the replay log, each with its source; the docs-consistency test runs.
5. T21.10: a test lists each 02 §D.13 timeline row with source time and scenario time; append the table to the verification log.
6. `make record` → `recording.json`; commit it (size printed in the commit body; budget ≤ 5 MB, else coalesce deltas to 5 s and state it in `label`'s README note).

## Automated verification

- `npm --workspace @marswalk/hab-core test -- demoNumbers` (no skip) · `make docs-check`.
- `make replay COMMANDS=scenarios/storm-sol4190/reference_commands.json` twice → same hash; `make record` twice → identical file.

## Status rows

```text
| T21.15 | done | <commit date> | demo-numbers part (b) on the real plan.json; snapshots committed |
| T21.09 | done | <commit date> | 01 §E.1 and demo-script numbers from demo-numbers/replay, each cited |
| T21.10 | done | <commit date> | Timeline table (source vs scenario times) in the verification log |
| T32.18 | done | <commit date> | [reference_commands.json](../../scenarios/storm-sol4190/reference_commands.json): same hash twice; sim_times from the log (U-62 BD-97) |
```

## Done when

01 §E.1 holds only sourced numbers and the reference list and recording are reproducible.
