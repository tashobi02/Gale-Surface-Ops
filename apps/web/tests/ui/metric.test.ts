/**
 * T12.01 — the Metric component: value, unit and provenance chip from a `Sourced`, always with `data-provenance` and
 * `data-source` on the value (FR-15, NFR-05; 04 §A.3 #8, §C.1 chips, §D.1 Metric tile; FD-106, FD-058).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { Metric, type MetricProps } from "../../src/ui/components/metric";
import { PROVENANCE_GLYPHS, unavailableOf } from "../../src/ui/components/provenance";
import { THIN_SPACE } from "../../src/ui/components/format";
import { installDom, mount, must, removeDom } from "./domHarness";
import { PROVENANCE_VALUES } from "../../src/ui/context";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

const ui = (props: MetricProps) => createElement(Metric, props);
const valueOf = (root: ParentNode): HTMLElement => must(root, ".metric-value");

describe("Metric (T12.01)", () => {
  it("metric always carries provenance and source", async () => {
    for (const prov of PROVENANCE_VALUES) {
      const view = await mount(ui({ value: 12, unit: "min", prov, src: "tobler-1993" }));
      const value = valueOf(view.container);
      expect(value.getAttribute("data-provenance")).toBe(prov);
      expect(value.getAttribute("data-source")).toBe("tobler-1993");
      expect(value.getAttribute("title")).toBe("tobler-1993");
      expect(value.hasAttribute("data-unavailable")).toBe(false);
      await view.unmount();
    }
  });

  it("unavailable renders dash with unavailable source", async () => {
    const view = await mount(ui({ value: null, unit: "km", prov: "derived", src: "result.totals.distance_m" }));
    const value = valueOf(view.container);
    expect(value.textContent).toBe("—");
    expect(value.getAttribute("data-unavailable")).toBe("true");
    expect(value.getAttribute("data-source")).toBe("unavailable:result.totals.distance_m");
    expect(value.getAttribute("data-provenance")).toBe("derived"); // the field's own class, never "assumed"
    expect(view.container.querySelector(".metric-unit")).toBeNull(); // no unit beside a dash
    expect(view.container.querySelector(".metric-chip")).toBeNull(); // no glyph beside a dash
  });

  it("keeps an unavailable source the caller already built, and the unknown class absent", async () => {
    const view = await mount(ui({ value: null, ...unavailableOf(null, "result.radiation.dose_mSv") }));
    const value = valueOf(view.container);
    expect(value.getAttribute("data-source")).toBe("unavailable:result.radiation.dose_mSv");
    expect(value.hasAttribute("data-provenance")).toBe(false);
  });

  it("treats a non-finite number, blank text and the dash itself as unavailable", async () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "", "  ", "—"]) {
      const view = await mount(ui({ value, prov: "modelled", src: "hassler-2014-rad" }));
      const el = valueOf(view.container);
      expect(el.textContent, String(value)).toBe("—");
      expect(el.getAttribute("data-unavailable")).toBe("true");
      expect(el.getAttribute("data-source")).toBe("unavailable:hassler-2014-rad");
      await view.unmount();
    }
  });

  it("shows zero as a value, not as missing", async () => {
    const view = await mount(ui({ value: 0, unit: "mSv", prov: "modelled", src: "hassler-2014-rad" }));
    expect(valueOf(view.container).textContent).toBe("0.00");
    expect(valueOf(view.container).hasAttribute("data-unavailable")).toBe(false);
  });

  it("formats a number by its unit (FD-124) and attaches the unit with a thin space", async () => {
    const cases: [number, string, string][] = [
      [0.42, "km", "0.42"],
      [147.6, "min", "148"],
      [12.64, "°", "12.6"],
      [0.066, "mSv", "0.07"],
      [3.14, "mGy", "3.1"],
      [1184.2, "m", "1184"],
      [87.5, "%", "88"],
    ];
    for (const [value, unit, text] of cases) {
      const view = await mount(ui({ value, unit, prov: "derived", src: "usgs-gale-dem-1m-v3" }));
      expect(valueOf(view.container).textContent, unit).toBe(text);
      expect(must(view.container, ".metric-unit").textContent).toBe(`${THIN_SPACE}${unit}`);
      await view.unmount();
    }
  });

  it("shows a string value as given, and a number with no known unit as the number", async () => {
    const text = await mount(ui({ value: "14:05 LTST", prov: "derived", src: "mars24" }));
    expect(valueOf(text.container).textContent).toBe("14:05 LTST");
    const bare = await mount(ui({ value: 3, prov: "assumed", src: "scenario.crew_count" }));
    expect(valueOf(bare.container).textContent).toBe("3");
  });

  it("full chip: glyph and class word, carrying the same class and source as the value", async () => {
    const view = await mount(ui({ value: 5, unit: "km", prov: "assumed", src: "scenario.walkback_limit_km" }));
    const chip = must(view.container, ".metric-chip");
    expect(chip.textContent).toBe(`${PROVENANCE_GLYPHS.assumed} ASSUMED`);
    expect(chip.getAttribute("data-provenance")).toBe("assumed");
    expect(chip.getAttribute("data-source")).toBe("scenario.walkback_limit_km");
  });

  it("glyph chip (EVA and HUD): the glyph alone, still labelled for assistive technology", async () => {
    const view = await mount(ui({ value: 5, unit: "km", prov: "derived", src: "x", chip: "glyph" }));
    const chip = must(view.container, ".metric-chip");
    expect(chip.textContent).toBe(PROVENANCE_GLYPHS.derived);
    expect(chip.getAttribute("aria-label")).toBe("DERIVED");
    expect(chip.getAttribute("data-provenance")).toBe("derived");
    expect(valueOf(view.container).getAttribute("data-provenance")).toBe("derived");
  });

  it("renders a label when given, and none otherwise", async () => {
    const labelled = await mount(ui({ value: 1, unit: "km", label: "Distance", prov: "derived", src: "x" }));
    expect(must(labelled.container, ".metric-label").textContent).toBe("Distance");
    const plain = await mount(ui({ value: 1, unit: "km", prov: "derived", src: "x" }));
    expect(plain.container.querySelector(".metric-label")).toBeNull();
  });

  it("flags the whole metric unavailable for styling", async () => {
    const view = await mount(ui({ value: null, prov: "derived", src: "x" }));
    expect(must(view.container, ".metric").getAttribute("data-unavailable")).toBe("true");
  });
});
