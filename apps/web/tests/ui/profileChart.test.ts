import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Leg, OkLeg } from "@marswalk/protocol";
import { ProfileChart } from "../../src/ui/results/profileChart";
import { resultOf } from "./planStoreFake";
import { STATUS_PATTERN } from "../../src/ui/components/patterns";
import { installDom, removeDom, mount, must, keyDown, fire } from "./domHarness";
import { readFileSync } from "node:fs";
import { applyTokens } from "./tokensDom";
beforeAll(installDom);
afterAll(removeDom);

const leg: OkLeg = {
  from: "wp-0", to: "wp-1", status: "OK", distance_m: 10, walk_time_min: 1,
  climb_m: 2, descent_m: 1, max_slope_deg: 16, cell_path_length: 3,
  geometry: [[0, 0], [10, 0]],
  profile: { dist_m: [0, 5, 10], elev_m: [0, 2, 1], slope_class: ["ok", "caution", "over_limit"] },
};
const chart = (legs: Leg[] = [leg]) => renderToStaticMarkup(createElement(ProfileChart, { result: resultOf({ legs }) }));
const dom = (html: string) => { const el = document.createElement("div"); el.innerHTML = html; return el; };

describe("FR-08 profile", () => {
  it("patterns per slope class", () => {
    const html = chart([{ ...leg, profile: { dist_m: [0, 3, 6, 10], elev_m: [0, 2, 1, 0], slope_class: ["ok", "caution", "over_limit", "unknown"] as OkLeg["profile"]["slope_class"] } }]);
    const el = dom(html);
    expect(must(el, '[data-slope-class="ok"]').getAttribute("fill")).toBe("none");
    for (const [slope, pattern] of [["caution", STATUS_PATTERN.caution], ["over_limit", STATUS_PATTERN.warning], ["unknown", STATUS_PATTERN.unknown]]) {
      const id = must(el, `pattern[id$="-${pattern}"]`).id;
      expect(must(el, `[data-slope-class="${slope}"]`).getAttribute("fill")).toBe(`url(#${id})`);
    }
    expect(html).toContain('data-provenance="derived"');
    expect(html).toContain('data-source="usgs-gale-dem-1m-v3"');
  });
  it("stop markers at cumulative distance", () => {
    const html = chart([leg, { ...leg, from: "wp-1", to: "wp-2" }]);
    expect(html).toMatch(/data-stop="wp-0" data-distance-m="0"/);
    expect(html).toMatch(/data-stop="wp-1" data-distance-m="10"/);
    expect(html).toMatch(/data-stop="wp-2" data-distance-m="20"/);
    expect([...dom(html).querySelectorAll("[data-stop] text:first-of-type")].map(el => Number(el.getAttribute("x")))).toEqual([230, 460, 690]);
    expect(html).toContain("Climb / descent");
  });
  it("missing samples stay a sourced dash rather than invented terrain", () => {
    const html = chart([{ ...leg, profile: { dist_m: [], elev_m: [], slope_class: [] } }]);
    expect(html).toContain("No elevation samples supplied");
    expect(html).toContain("—");
    expect(html).not.toContain("Profile unavailable");
  });
  it("partial profiles identify the unrouted leg without bridging it", () => {
    const html = renderToStaticMarkup(createElement(ProfileChart, { result: resultOf({ status: "PARTIAL", totals: null, legs: [leg, { from: "wp-1", to: "wp-2", status: "NO_ROUTE", reason: "START_BLOCKED" }] }) }));
    expect(html).toContain("NO ROUTE");
    expect(html).toContain("wp-1 → wp-2");
  });
});

it("a middle NO_ROUTE leaves distinct endpoints and a visible gap without fabricating distance", () => {
  const el = dom(chart([leg, { from: "wp-1", to: "wp-2", status: "NO_ROUTE", reason: "START_BLOCKED" }, { ...leg, from: "wp-2", to: "wp-3" }]));
  const before = must(el, '[data-stop="wp-1"] text');
  const after = must(el, '[data-stop="wp-2"] text');
  expect(Number(after.getAttribute("x"))).toBeGreaterThan(Number(before.getAttribute("x")));
  expect(must(el, '[data-stop="wp-2"]').getAttribute("data-distance-m")).toBe("10");
  expect(el.textContent).toContain("NO ROUTE");
});

it("profile samples use one roving tab stop and labelled non-button semantics without a map", async () => {
  const view = await mount(createElement(ProfileChart, { result: resultOf({ legs: [leg] }) }));
  const samples = [...view.container.querySelectorAll<HTMLElement>("[data-profile-sample]")];
  const tabbed = () => samples.filter(el => el.tabIndex === 0);
  expect(tabbed()).toHaveLength(1);
  expect(samples.every(el => el.getAttribute("role") !== "button" && el.getAttribute("aria-label"))).toBe(true);
  await keyDown(samples[0]!, "ArrowRight");
  expect(document.activeElement).toBe(samples[1]);
  expect(tabbed()).toEqual([samples[1]]);
  await keyDown(samples[1]!, "End");
  expect(document.activeElement).toBe(samples[2]);
  await keyDown(samples[2]!, "Home");
  expect(document.activeElement).toBe(samples[0]);
  await view.unmount();
});
it("touch can scrub the full profile plot instead of targeting a tiny sample", async () => {
  const view = await mount(createElement(ProfileChart, { result: resultOf({ legs: [leg] }) }));
  const plot = must<SVGElement>(view.container, 'svg[aria-label^="Elevation"]');
  Object.defineProperty(plot, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 720, height: 106 }) });
  await fire(plot, new window.MouseEvent("pointerdown", { bubbles: true, clientX: 460, clientY: 50, buttons: 1 }));
  expect(must(view.container, "[data-profile-tooltip]").textContent).toContain("5 m · 2 m elevation");
  await fire(plot, new window.MouseEvent("pointermove", { bubbles: true, clientX: 690, clientY: 50, buttons: 1 }));
  expect(must(view.container, "[data-profile-tooltip]").textContent).toContain("10 m · 1 m elevation");
  await view.unmount();
});
it("profile viewBox tracks real container pixels without stretching text or circles", async () => {
  let resize: ResizeObserverCallback = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(fn: ResizeObserverCallback) { resize = fn; } observe() {} disconnect() {} });
  const view = await mount(createElement(ProfileChart, { result: resultOf({ legs: [leg] }) }));
  const { act } = await import("react");
  await act(async () => resize([{ contentRect: { width: 480 } } as ResizeObserverEntry], {} as ResizeObserver));
  const svg = must(view.container, 'svg[aria-label^="Elevation"]');
  expect(svg.getAttribute("viewBox")).toBe("0 0 480 106");
  expect(svg.getAttribute("preserveAspectRatio")).not.toBe("none");
  await view.unmount();
  vi.unstubAllGlobals();
});
it("profile keyboard focus uses the OPS white ring and touch plot is at least 44 pixels", async () => {
  const tokens = applyTokens();
  const style = document.createElement("style");
  style.textContent = readFileSync(new URL("../../src/ui/screens/scr05RouteResults.css", import.meta.url), "utf8");
  document.head.append(style);
  const view = await mount(createElement(ProfileChart, { result: resultOf({ legs: [leg] }) }));
  const cssTokens = readFileSync(new URL("../../src/ui/styles/tokens.css", import.meta.url), "utf8");
  const ring = /--focus-ring:\s*([^;]+);/.exec(cssTokens)![1]!;
  view.container.style.setProperty("--focus-ring", ring);
  await keyDown(must(view.container, "[data-profile-sample]"), "ArrowRight");
  const focused = window.getComputedStyle(document.activeElement!);
  expect(focused.boxShadow).toContain("rgb(255, 255, 255) 0px 0px 0px 4px");
  expect(focused.boxShadow).toContain("0px 0px 0px 2px");
  expect(window.getComputedStyle(must(view.container, ".profile-plot")).minHeight).toBe(tokens["--target-touch"]);
  style.remove();
  await view.unmount();
});
it("linked cursor has a visible sourced tooltip", () => {
  const html = renderToStaticMarkup(createElement(ProfileChart, { result: resultOf({ legs: [leg] }), hover: { distance_m: 5, leg_index: 0, coord: [5, 0] } }));
  expect(html).toMatch(/<output[^>]*data-profile-tooltip[^>]*data-provenance="derived"[^>]*>5 m · 2 m elevation · caution<\/output>/);
});
it("coordinate-only map hover selects the closest supplied sample", () => {
  const html = renderToStaticMarkup(createElement(ProfileChart, { result: resultOf({ legs: [leg] }), hover: { leg_index: 0, coord: [5, 0] } }));
  expect(html).toMatch(/<output[^>]*>5 m · 2 m elevation · caution<\/output>/);
});
