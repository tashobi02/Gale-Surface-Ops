/**
 * Warnings list (T09.04; docs/specs/01 FR-10; 04 §C.1 status colours, §A.3 four cues, §E accessibility, §F SCR-05).
 * Originally by Saba Atharique (#180, a DOM-building renderer tested on a hand-written DOM shim); reworked as a React
 * component and tested by mounting it in jsdom.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Warning } from "@marswalk/protocol";
import {
  WarningsList,
  formatUtc,
  formatWarningLocation,
  sortWarnings,
  type WarningsListProps,
} from "../../src/ui/results/warningsList";
import { click, installDom, mount, must, removeDom } from "./domHarness";
import { fakeMapHandle } from "./fakeMapHandle";
import okFixture from "../fixtures/plan-results/ok.json";
import overLimits from "../fixtures/plan-results/over-limits.json";
import { mockLoadedSite } from "./map/mapFixtures";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

const w = (overrides: Partial<Warning> = {}): Warning => ({
  code: "CAUTION_SLOPE",
  severity: "caution",
  leg: 0,
  from_m: 1210,
  to_m: 1290,
  message: "Slope 12.6° exceeds caution 10° for 80 m",
  ...overrides,
});

const ui = (props: WarningsListProps) => createElement(WarningsList, props);

describe("sortWarnings (04 §F: most severe first)", () => {
  it("orders blocked, then caution, then unknown, and by leg and distance inside a severity, without mutating", () => {
    const input = [
      w({ severity: "unknown", code: "TI_UNKNOWN", leg: 0, from_m: 5 }),
      w({ severity: "caution", leg: 1, from_m: 10 }),
      w({ severity: "caution", leg: 0, from_m: 300 }),
      w({ severity: "blocked", code: "OVER_HARD_SLOPE", leg: 2, from_m: 0 }),
      w({ severity: "caution", leg: 0, from_m: 20 }),
    ];
    const copy = [...input];
    const sorted = sortWarnings(input);
    expect(sorted.map((x) => [x.severity, x.leg, x.from_m])).toEqual([
      ["blocked", 2, 0],
      ["caution", 0, 20],
      ["caution", 0, 300],
      ["caution", 1, 10],
      ["unknown", 0, 5],
    ]);
    expect(input).toEqual(copy);
  });

  it("puts a warning without a location after the located ones of its severity", () => {
    const sorted = sortWarnings([
      w({ severity: "blocked", code: "EVA_DURATION_EXCEEDED", leg: null, from_m: null, to_m: null }),
      w({ severity: "blocked", code: "OVER_HARD_SLOPE", leg: 0, from_m: 50 }),
    ]);
    expect(sorted.map((x) => x.code)).toEqual(["OVER_HARD_SLOPE", "EVA_DURATION_EXCEEDED"]);
  });
});

describe("formatUtc and formatWarningLocation", () => {
  it("formats an ISO UTC instant as 'YYYY-MM-DD HH:MM UTC'", () => {
    expect(formatUtc("2026-11-14T08:20:30Z")).toBe("2026-11-14 08:20 UTC");
    expect(formatUtc("2026-11-14T08:20:00+02:00")).toBe("2026-11-14 06:20 UTC");
  });

  it("returns the no-data dash for a value that is not a date", () => {
    expect(formatUtc("not a date")).toBe("—");
    expect(formatUtc("")).toBe("—");
  });

  it("words a located warning with leg number (1-based) and the stretch in metres, and a time warning with its time", () => {
    expect(formatWarningLocation(w())).toBe("Leg 1 · 1210–1290 m");
    expect(formatWarningLocation(w({ leg: 2, from_m: 12.4, to_m: 99.6 }))).toBe("Leg 3 · 12–100 m");
    expect(
      formatWarningLocation(w({ code: "DARKNESS", leg: null, from_m: null, to_m: null, at_utc: "2026-11-14T13:40:00Z" })),
    ).toBe("At 2026-11-14 13:40 UTC");
  });

  it("is empty for a warning with neither a location nor a time", () => {
    expect(formatWarningLocation(w({ code: "EVA_DURATION_EXCEEDED", leg: null, from_m: null, to_m: null }))).toBe("");
  });
});

describe("WarningsList: four cues, never colour alone (04 §A.3 #2)", () => {
  it("shows shape, word and message for each severity, the unknown one as UNKNOWN with the ? shape", async () => {
    const view = await mount(
      ui({
        warnings: [
          w({ severity: "caution" }),
          w({ severity: "blocked", code: "OVER_HARD_SLOPE", message: "Slope above the hard limit" }),
          w({ severity: "unknown", code: "TI_UNKNOWN", message: "Thermal inertia unknown here", leg: null, from_m: null, to_m: null }),
        ],
      }),
    );
    const items = [...view.container.querySelectorAll("li")];
    expect(items).toHaveLength(3);
    expect(items[0]!.getAttribute("data-severity")).toBe("blocked");
    expect(items[0]!.querySelector(".status-glyph svg polygon")).not.toBeNull(); // the drawn octagon (FD-208)
    expect(items[0]!.textContent).toContain("BLOCKED");
    expect(items[1]!.textContent).toContain("▲");
    expect(items[1]!.textContent).toContain("CAUTION");
    expect(items[2]!.querySelector(".status-unknown")).not.toBeNull();
    expect(items[2]!.textContent).toContain("?");
    expect(items[2]!.textContent).toContain("UNKNOWN");
    expect(items[2]!.textContent).not.toContain("CAUTION");
    expect(items[2]!.textContent).toContain("Thermal inertia unknown here");
    await view.unmount();
  });

  it("treats a severity outside the 05 enum as unknown, not as caution", async () => {
    const view = await mount(ui({ warnings: [w({ severity: "bogus" as unknown as Warning["severity"] })] }));
    expect(must(view.container, "li").querySelector(".status-unknown")).not.toBeNull();
    expect(must(view.container, "li").textContent).not.toContain("CAUTION");
    await view.unmount();
  });

  it("is a labelled list, the text alternative for the map warnings (04 §E)", async () => {
    const view = await mount(ui({ warnings: [w()] }));
    expect(must(view.container, "ul").getAttribute("aria-label")).toBe("Warnings");
    await view.unmount();
  });

  it("carries the provenance class and a source id on each warning (FR-15, NFR-05)", async () => {
    const view = await mount(ui({ warnings: [w()] }));
    const item = must(view.container, "li");
    expect(item.getAttribute("data-provenance")).toBe("derived");
    expect(item.getAttribute("data-source")).toBe("rule:CAUTION_SLOPE usgs-gale-dem-1m-v3");
    await view.unmount();
  });

  it("says 'No active warnings' for an empty list", () => {
    const html = renderToStaticMarkup(ui({ warnings: [] }));
    expect(html).toContain("No active warnings");
    expect(html).not.toContain("<ul");
  });
});

describe("WarningsList: located and time warnings", () => {
  it("shows the stretch, and an at_utc time formatted instead of the raw ISO string", async () => {
    const view = await mount(
      ui({
        warnings: [
          w(),
          w({ code: "DARKNESS", severity: "blocked", leg: null, from_m: null, to_m: null, at_utc: "2026-11-14T13:40:00Z", message: "Sun below the horizon" }),
        ],
      }),
    );
    const text = view.container.textContent ?? "";
    expect(text).toContain("Leg 1 · 1210–1290 m");
    expect(text).toContain("At 2026-11-14 13:40 UTC");
    expect(text).not.toContain("T13:40:00Z");
    await view.unmount();
  });

  it("renders a located warning with a keyboard-reachable zoom button and an unlocated one as a plain item", async () => {
    const view = await mount(
      ui({ warnings: [w(), w({ code: "EVA_DURATION_EXCEEDED", severity: "blocked", leg: null, from_m: null, to_m: null, message: "EVA longer than the limit" })] }),
    );
    const items = [...view.container.querySelectorAll("li")];
    // blocked first: the unlocated EVA_DURATION_EXCEEDED has no button
    expect(items[0]!.querySelector("button")).toBeNull();
    const button = must<HTMLButtonElement>(items[1]!, "button");
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toContain("Zoom to Leg 1 · 1210–1290 m");
    expect(button.getAttribute("aria-label")).toContain("Slope 12.6° exceeds caution 10° for 80 m");
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    await view.unmount();
  });

  it("zooms the map to the stretch's extent through the map handle when a located warning is clicked", async () => {
    const { handle, fitted } = fakeMapHandle();
    const warning = w();
    const getLegExtent = vi.fn((_leg: number, _from: number, _to: number) => [10, 20, 30, 40] as [number, number, number, number]);
    const onZoom = vi.fn();
    const view = await mount(ui({ warnings: [warning], mapHandle: handle, getLegExtent, onZoom }));
    await click(must(view.container, "button"));
    expect(getLegExtent).toHaveBeenCalledWith(0, 1210, 1290);
    expect(fitted).toEqual([[10, 20, 30, 40]]);
    expect(onZoom).toHaveBeenCalledWith(warning);
    await view.unmount();
  });

  it("does not touch the map when the extent is unknown or there is no map handle", async () => {
    const { handle, fitted } = fakeMapHandle();
    const none = await mount(ui({ warnings: [w()], mapHandle: handle, getLegExtent: () => null }));
    await click(must(none.container, "button"));
    expect(fitted).toEqual([]);
    await none.unmount();
    const bare = await mount(ui({ warnings: [w()], getLegExtent: () => [0, 0, 1, 1] }));
    await click(must(bare.container, "button"));
    expect(fitted).toEqual([]);
    await bare.unmount();
  });
});

describe("WarningsList: React owns its DOM", () => {
  it("replaces the items when the warnings change, with no leftovers and no cleared nodes", async () => {
    const view = await mount(ui({ warnings: [w(), w({ severity: "blocked", code: "OVER_HARD_SLOPE", message: "A" })] }));
    expect(view.container.querySelectorAll("li")).toHaveLength(2);
    const list = must(view.container, "ul");
    await view.rerender(ui({ warnings: [w({ message: "only one" })] }));
    expect(view.container.querySelectorAll("li")).toHaveLength(1);
    expect(must(view.container, "ul")).toBe(list);
    await view.rerender(ui({ warnings: [] }));
    expect(view.container.textContent).toContain("No active warnings");
    await view.rerender(ui({ warnings: [w()] }));
    expect(view.container.querySelectorAll("li")).toHaveLength(1);
    await view.unmount();
  });

  it("lists the F2 fixtures' warnings, most severe first", async () => {
    const view = await mount(ui({ warnings: overLimits.warnings as unknown as Warning[] }));
    const words = [...view.container.querySelectorAll(".status-label")].map((e) => e.textContent);
    expect(words).toEqual(["BLOCKED", "CAUTION"]);
    await view.unmount();
    const ok = await mount(ui({ warnings: okFixture.warnings as unknown as Warning[] }));
    expect(ok.container.querySelectorAll("li")).toHaveLength(1);
    await ok.unmount();
  });
});

it("severity then position order", () => {
  const input = [w({ severity: "unknown", from_m: 0 }), w({ from_m: 30 }), w({ from_m: 10 }), w({ severity: "blocked", from_m: 50 })];
  expect(sortWarnings(input).map(x => [x.severity, x.from_m])).toEqual([["blocked", 50], ["caution", 10], ["caution", 30], ["unknown", 0]]);
});
it("reduced motion zoom is instant", async () => {
  const { handle } = fakeMapHandle();
  const fit = vi.spyOn(handle, "fitExtent");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
  const view = await mount(ui({ warnings: [w()], mapHandle: handle, getLegExtent: () => [0, 0, 1, 1] }));
  await click(must(view.container, "button"));
  expect(fit).toHaveBeenCalledWith([0, 0, 1, 1], { animate: false });
  await view.unmount();
  delete (window as unknown as Record<string, unknown>).matchMedia;
});
it("TI and comm warnings use registered source ids, preferring manifest layer sources", async () => {
  const site = mockLoadedSite();
  const warnings = [w({ code: "LOW_TI" }), w({ code: "TI_UNKNOWN" }), w({ code: "COMM_SHADOW" })];
  const view = await mount(ui({ warnings, site }));
  expect([...view.container.querySelectorAll("li")].map(el => el.getAttribute("data-source"))).toEqual(["rule:LOW_TI usgs-themis-ti-30s120e", "rule:TI_UNKNOWN usgs-themis-ti-30s120e", "rule:COMM_SHADOW usgs-gale-dem-1m-v3"]);
  site.layers.set("thermal_inertia", { ...site.layers.get("slope")!, source_ids: ["usgs-themis-ti-30s120e", "usgs-gale-dem-1m-v3"] });
  site.layers.set("comm_hab", { ...site.layers.get("slope")!, source_ids: ["usgs-gale-dem-1m-v3", "usgs-themis-ti-30s120e"] });
  await view.rerender(ui({ warnings, site }));
  expect([...view.container.querySelectorAll("li")].map(el => el.getAttribute("data-source"))).toEqual(["rule:LOW_TI usgs-themis-ti-30s120e usgs-gale-dem-1m-v3", "rule:TI_UNKNOWN usgs-themis-ti-30s120e usgs-gale-dem-1m-v3", "rule:COMM_SHADOW usgs-gale-dem-1m-v3 usgs-themis-ti-30s120e"]);
  await view.unmount();
});
