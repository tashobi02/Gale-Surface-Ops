# 12 — Mars24 time and sun: close the verification gaps

| | |
| --- | --- |
| **Subtasks** | T06.02, T06.03, T06.06, T06.07; trigger check of T06.11 (package 29) |
| **Depends on** | 03 (pinned `marstime` needs the SSD env); independent of the engine chain |
| **Branch** | `be/12-compute-time-sun` |
| **Spec refs** | 01 FR-11; 02 §D.5, §C.4.1; decisions BD-55, BD-56 |

## Files

`packages/compute/src/mars24.ts` (header: IERS Bulletin C reference) · `packages/compute/src/sun.ts` (equation numbering checked) · `packages/compute/tests/mars24.test.ts`, `sun.test.ts` (remove the `PENDING_RED` gating; ratify tolerances) · `pipeline/tests/fixtures/make_mars24_reference.py` (sol labels computed, not typed) · `apps/web/tests/fixtures/mars24-reference.json` (regenerated) · `apps/web/tests/fixtures/README.md` · `pipeline/environment.yml` (pin `marstime`, if not pinned in 03)

## Steps (tests first)

1. Fetch the latest IERS Bulletin C (pipeline stage, internet allowed) and the GISS Mars24 algorithm page; record URL, access date and the leap-second statement in the `mars24.ts` header and the equation references in `sun.ts`. If a later leap second exists, add it to the table with a boundary test.
2. Regenerate F6 in the SSD env; the generator computes each record's MSL sol from its UTC with `marstime` (fixes the "Sol 4190 dated 2024-05-18" label); regenerate twice → identical bytes.
3. Remove PENDING gating: every sun case runs; tolerances: LTST 1 min (FR-11), elevation 0.1° (FR-11), sunrise/sunset time tolerance = the provisional 120 s ratified (test comment cites BD-56). The Clancy Mars Year offset table is checked against `marstime` for each F6 record.
4. Make the T06.03 cases green with the existing T06.06/T06.07 code; any fix is a code fix with its own test.

## Automated verification

- `npm --workspace @marswalk/compute test -- mars24 sun` with no skipped case (`--reporter=verbose` shows 0 skipped).
- `$(make -s pipeline-python) -m pytest -q pipeline/tests/test_make_mars24_reference.py`.

## Status rows

```text
| T06.02 | done | <commit date> | F6 regenerated with pinned marstime; sol labels computed (BD-55) |
| T06.03 | done | <commit date> | mars24/sun tests run ungated, 0 skipped |
| T06.06 | done | <commit date> | Leap seconds checked against IERS Bulletin C (<bulletin no., date>) |
| T06.07 | done | <commit date> | Sun functions within FR-11 tolerances vs F6; equation refs checked (BD-56) |
```

## Done when

No Mars24 or sun test is skipped and the fixture is reproducible.
