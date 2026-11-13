/**
 * Check `eva-portrait` (FD-024, FD-032; 04 §E.5, §F). Enabled by package 17.
 *
 * The EVA tablet in portrait — 390 x 844, 360 x 740 and 768 x 1024 — with the task list open:
 * - the body is ONE column: NEXT and the task list are not side by side, so NEXT is not squeezed to half the width
 *   (FD-024). At 768 x 1024 the unused half is the map's, not an empty column beside NEXT;
 * - the metadata strip is one 24 px row: no child overflows it (FD-032's geometry);
 * - while the list is collapsed, the NEXT card's bearing, distance and ETA stay hit-testable (FD-032's first clause).
 */
import { expect, test, type Page } from "@playwright/test";
import { openEvaFixture } from "../lib/evaFixture";

const PORTRAITS = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
];

/** Open the EVA tablet in the given viewport with the task list open. */
async function openWithList(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  // The list is only openable at a stop (a walking crew member has no task list to open), so the fixture stands at one.
  await openEvaFixture(page, "at-stop");
  await page.getByTestId("tasks-button").click();
  await page.locator('[data-slot="stop-task-list"]').waitFor();
}

/** The width of the NEXT card and of the task list, in CSS pixels. */
async function widths(page: Page): Promise<{ next: number; list: number }> {
  return page.evaluate(() => {
    const next = document.querySelector('[data-slot="next"]');
    const list = document.querySelector('[data-slot="stop-task-list"]');
    return {
      next: next ? next.getBoundingClientRect().width : 0,
      list: list ? list.getBoundingClientRect().width : 0,
    };
  });
}

/** Whether the element at the centre of `selector` is that element or one of its descendants. */
async function isOnTop(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(top) && (el === top || el.contains(top));
  }, selector);
}

test("eva-portrait: NEXT is not squeezed beside the task list (FD-024)", async ({ page }) => {
  for (const viewport of PORTRAITS) {
    const where = `${viewport.width}x${viewport.height}`;
    await openWithList(page, viewport.width, viewport.height);
    const { next, list } = await widths(page);
    // The body is one column: the list is drawn over the NEXT card, not beside it. A squeezed NEXT was 204 px of a
    // 390 px screen while the list took the other 178 px.
    expect(next, `${where}: the NEXT card's width`).toBeGreaterThan(viewport.width * 0.9);
    expect(list, `${where}: the task list's width`).toBeGreaterThan(viewport.width * 0.9);
    // Nothing sticks out of the screen sideways.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${where}: horizontal scroll`).toBeLessThanOrEqual(viewport.width);
  }
});

test("eva-portrait: the metadata strip is one row and no part overflows it (FD-032)", async ({ page }) => {
  for (const viewport of PORTRAITS) {
    const where = `${viewport.width}x${viewport.height}`;
    await openWithList(page, viewport.width, viewport.height);
    const overflow = await page.evaluate(() => {
      const strip = document.querySelector('[data-slot="meta-strip"]');
      if (!strip) return null;
      const row = strip.getBoundingClientRect();
      const children = Array.from(strip.children).map((child) => {
        const box = child.getBoundingClientRect();
        return {
          slot: child.getAttribute("data-slot") ?? child.className,
          below: box.bottom - row.bottom,
          right: box.right - row.right,
          top: box.top - row.top,
        };
      });
      return { rowHeight: row.height, children };
    });
    expect(overflow, `${where}: the metadata strip`).not.toBeNull();
    expect(overflow!.rowHeight, `${where}: the strip's height`).toBeLessThanOrEqual(30);
    for (const child of overflow!.children) {
      // A part that wraps to a second line sticks out of the bottom of its row; a part that does not fit sticks out of
      // the right of it.
      expect(child.below, `${where}: the strip's ${child.slot} overflows the row`).toBeLessThanOrEqual(1);
      expect(child.right, `${where}: the strip's ${child.slot} overflows the row`).toBeLessThanOrEqual(1);
      expect(child.top, `${where}: the strip's ${child.slot} sits above the row`).toBeGreaterThanOrEqual(-1);
    }
  }
});

test("eva-portrait: the NEXT numbers stay hit-testable while the list is collapsed (FD-032)", async ({ page }) => {
  for (const viewport of PORTRAITS) {
    const where = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    // Walking: the list is collapsed, so the count is a figure in the NEXT header, not a control, and no panel is drawn
    // over the NEXT card (FD-032's first clause).
    await openEvaFixture(page, "walking");
    await expect(page.locator('[data-slot="stop-task-list"]'), `${where}: a panel was drawn while collapsed`).toHaveCount(0);
    await expect(page.getByTestId("tasks-count"), `${where}: the collapsed count`).toBeVisible();
    // The three numbers of the NEXT card — the bearing, the distance and the ETA — each carry their own provenance, and
    // each is the topmost element at its own centre: nothing is laid over them.
    const numbers = await page.evaluate(() => {
      const next = document.querySelector('[data-slot="next"]');
      if (!next) return [];
      return Array.from(next.querySelectorAll<HTMLElement>("[data-provenance]")).map((el) => ({
        source: el.getAttribute("data-source") ?? "",
        onTop: (() => {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return false;
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return Boolean(top) && (el === top || el.contains(top));
        })(),
      }));
    });
    expect(numbers.length, `${where}: the NEXT card's numbers`).toBeGreaterThanOrEqual(3);
    for (const number of numbers) {
      expect(number.onTop, `${where}: ${number.source} is not hit-testable`).toBe(true);
    }
  }
});

test("eva-portrait: the tablet fits 360 px in portrait (04 §F)", async ({ page }) => {
  // The horizontal fit at 360 px is the harness check `viewport360`'s job; here the portrait geometry is measured with the
  // task list open, which is the case `viewport360` does not drive.
  await page.setViewportSize({ width: 360, height: 740 });
  await openWithList(page, 360, 740);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, "horizontal scroll at 360 x 740").toBeLessThanOrEqual(360);
});
