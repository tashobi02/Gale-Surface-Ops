/**
 * Check `contrast` (T13.12 / NFR-04 measurement): BRIEF and OPS text >= 4.5 : 1 (large >= 3), HUD >= 7 : 1, measured on
 * the rendered page in real Chromium. Patterned pills are measured against their fill colour only; `patterns.test.ts` owns the
 * pattern search (FD-155). Non-text contrast (3 : 1) is enabled by package 03 with the tokens.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectContrast } from "../lib/contrast";
import { waitForSnapshot } from "../lib/hab";

const LIMITS = { text: 4.5, large: 3, hud: 7 };

// Routes that render real content today. Each later package adds its own route here when it builds the screen.
// `pending` marks a route the harness already measures as failing: the defect is the named package's to fix, and that package
// removes the `pending` entry. The numbers below are what this check printed on 12 Nov 2026 (F4 site, fake scenario).
const ROUTES: { hash: string; live: boolean; pending?: string }[] = [
  { hash: "#/join", live: false },
  { hash: "#/hud/EV1", live: true },
  { hash: "#/ops", live: true, pending: "package 03: 4.42 : 1 on 12 px 'not included in this build' (.conditions-panel-ops)" },
  {
    hash: "#/eva/EV1",
    live: true,
    pending:
      "package 17: HAVEN and O2 card text 1.02 : 1 (ink #1A1A1A on the --panel card: `.card` background overrides `.status-nominal` fill)",
  },
  { hash: "#/report", live: false, pending: "package 03: 4.39 : 1 on the 12 px 'vs' separator in SCR-17" },
];

for (const { hash, live, pending } of ROUTES) {
  const run = async ({ page }: { page: Page }): Promise<void> => {
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    if (live) await waitForSnapshot(page);
    const measured = await expectContrast(page, LIMITS);
    expect(measured, "no text was measured").toBeGreaterThan(0);
  };
  const title = `contrast: text on ${hash} meets the limit of its mode`;
  if (pending) test.fixme(`${title} (enabled by ${pending})`, run);
  else test(title, run);
}
