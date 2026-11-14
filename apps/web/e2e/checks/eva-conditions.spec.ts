/**
 * Check `eva-conditions` (T25.10; 01 FR-36, FR-15; 04 §E.5, §D.1).
 *
 * The EVA tablet's conditions row (SCR-12) shows the conditions the EVA needs — LTST, the sun elevation, the background
 * and event dose rates and the EVA phase — each with the Hab Core's own provenance class and source id. A field the Hab
 * Core has not supplied reads "—" with an `unavailable:` source and no class (04 §D.1): the tablet computes nothing.
 *
 * Two states are driven:
 * - the fixture as it stands (every condition null): every drawn value reads "—" with an `unavailable:` source;
 * - the same fixture with a supplied conditions block: every value carries its own class and its own source, and the
 *   values that share a source id (LTST and the sun elevation are both from Mars24) are still separate elements.
 */
import { expect, test } from "@playwright/test";
import { openEvaFixture } from "../lib/evaFixture";
import { expectNoUnlabelledNumbers } from "../lib/provenance";

/** The conditions block the Hab Core supplies, with the provenance class and source id of each value. */
const SUPPLIED_CONDITIONS = {
  ltst: "09:15",
  sun_elevation_deg: 31.24,
  dose_rate_background_ugy_h: 0.21,
  dose_rate_event_ugy_h: 5.5,
  eva_phase: "WALKING",
  sol: 4190,
  source_ids: {
    ltst: "mars24-allison-mcewen-2000",
    sun_elevation_deg: "mars24-allison-mcewen-2000",
    dose_rate_background_ugy_h: "rad-sol4190",
    dose_rate_event_ugy_h: "rad-sol4190",
    eva_phase: "engine:session",
  },
  provenance: {
    ltst: "derived",
    sun_elevation_deg: "derived",
    dose_rate_background_ugy_h: "replayed",
    dose_rate_event_ugy_h: "replayed",
    eva_phase: "simulated",
  },
} as unknown as NonNullable<Parameters<typeof openEvaFixture>[3]>["conditions"];

/** The strip's items: the text of each value and the provenance attributes of its own element. */
interface Item {
  label: string;
  text: string;
  source: string | null;
  provenance: string | null;
  unavailable: string | null;
}

async function stripItems(page: import("@playwright/test").Page): Promise<Item[]> {
  return page.locator('[data-testid="conditions-strip-eva"] span').evaluateAll((els) =>
    els.map((el) => ({
      label: (el.textContent ?? "").trim().split(" ")[0] ?? "",
      text: (el.textContent ?? "").trim(),
      source: el.getAttribute("data-source"),
      provenance: el.getAttribute("data-provenance"),
      unavailable: el.getAttribute("data-unavailable"),
    })),
  );
}

test("eva-conditions: a field the Hab Core has not supplied reads — with an unavailable source (04 §D.1)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEvaFixture(page, "walking");
  const strip = page.locator('[data-testid="conditions-strip-eva"]');
  await expect(strip, "the EVA conditions row").toBeVisible();

  const items = await stripItems(page);
  // The base set is always drawn, so a feed that carries none reads "—" rather than an empty row.
  for (const label of ["LTST", "SUN", "BG", "PHASE"]) {
    const item = items.find((i) => i.label === label);
    expect(item, `the ${label} item of the strip`).toBeTruthy();
    expect(item!.text, `the ${label} item`).toContain("—");
    expect(item!.unavailable, `the ${label} item is flagged unavailable`).toBe("true");
    // A missing value has no provenance class: there is no measurement to class.
    expect(item!.provenance, `the ${label} item carries no class`).toBeNull();
    expect(item!.source, `the ${label} item's source`).toMatch(/^unavailable:conditions\./);
  }
  // The event dose rate is not drawn at all when the feed carries none: it is not a permanent "—".
  expect(items.some((i) => i.label === "EVENT"), "the event dose rate is drawn without a value").toBe(false);
  // No source id of a value that is not there survives on the strip.
  const sources = items.map((i) => i.source ?? "").join(" ");
  expect(sources).not.toMatch(/mars24-allison-mcewen-2000|rad-sol4190|engine:session/);
  // Nothing is labelled live.
  expect(await strip.textContent()).not.toMatch(/\blive\b/i);
  // The strip holds no number of its own.
  expect(await strip.textContent()).not.toMatch(/\d/);
});

test("eva-conditions: every supplied value carries its own class and its own source (FR-15, NFR-05)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEvaFixture(page, "walking", undefined, { conditions: SUPPLIED_CONDITIONS });
  const strip = page.locator('[data-testid="conditions-strip-eva"]');
  await expect(strip, "the EVA conditions row").toBeVisible();

  const items = await stripItems(page);
  const item = (label: string) => {
    const found = items.find((i) => i.label === label);
    expect(found, `the ${label} item of the strip`).toBeTruthy();
    return found!;
  };

  expect(item("LTST").text).toContain("09:15");
  expect(item("LTST").source).toBe("mars24-allison-mcewen-2000");
  expect(item("LTST").provenance).toBe("derived");
  expect(item("SUN").text).toContain("31.24");
  expect(item("SUN").source).toBe("mars24-allison-mcewen-2000");
  expect(item("SUN").provenance).toBe("derived");
  expect(item("BG").text).toContain("0.21");
  expect(item("BG").source).toBe("rad-sol4190");
  expect(item("BG").provenance).toBe("replayed");
  expect(item("EVENT").text).toContain("5.5");
  expect(item("EVENT").source).toBe("rad-sol4190");
  expect(item("EVENT").provenance).toBe("replayed");
  expect(item("PHASE").text).toContain("WALKING");
  expect(item("PHASE").source).toBe("engine:session");
  expect(item("PHASE").provenance).toBe("simulated");

  // Every value is labelled and sourced: no unlabelled number on the tablet (FD-110).
  await expectNoUnlabelledNumbers(page, "#/eva/EV1 the conditions row");
});

test("eva-conditions: the conditions row keeps its place in the portrait grid (04 §E.5)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEvaFixture(page, "walking");
  const geometry = await page.evaluate(() => {
    const row = document.querySelector('[data-slot="conditions"]');
    const strip = document.querySelector('[data-slot="meta-strip"]');
    const actions = document.querySelector('[data-slot="action-row"]');
    if (!row || !strip || !actions) return null;
    const r = row.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    const a = actions.getBoundingClientRect();
    return { rowBottom: r.bottom, rowHeight: r.height, stripTop: s.top, actionsTop: a.top, docHeight: document.documentElement.scrollHeight, viewport: window.innerHeight };
  });
  expect(geometry, "the conditions row and the rows around it").not.toBeNull();
  // The row is one 24 px row, above the metadata strip and the action row.
  expect(geometry!.rowHeight).toBeLessThanOrEqual(30);
  expect(geometry!.rowBottom).toBeLessThanOrEqual(geometry!.stripTop + 1);
  expect(geometry!.stripTop).toBeLessThanOrEqual(geometry!.actionsTop + 1);
  // The body does not scroll: the tablet is 100dvh (FD-010).
  expect(geometry!.docHeight).toBeLessThanOrEqual(geometry!.viewport + 1);
});
