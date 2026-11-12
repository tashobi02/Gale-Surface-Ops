/**
 * Check `usability-*` (replaces T15.02: UT-1 to UT-9 and the 5-minute briefing). Enabled by package 30.
 * Package 30 defines the automated heuristic run that replaces sessions; the cases are listed here so a missing one fails the
 * end-to-end run.
 */
import { test } from "@playwright/test";

const CASES = ["UT-1", "UT-2", "UT-3", "UT-4", "UT-5", "UT-6", "UT-7", "UT-8", "UT-9", "briefing-5-min"];

for (const id of CASES) {
  test.fixme(`usability-${id}: automated heuristic run (enabled by package 30)`, async () => {
    // Body written by package 30 (see docs/plan/frontend/30-usability.md).
  });
}
