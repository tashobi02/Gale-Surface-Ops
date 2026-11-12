import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OkLeg } from "@marswalk/protocol";
import { ProfileChart } from "../../src/ui/results/profileChart";
import { resultOf } from "./planStoreFake";

const leg: OkLeg = {
  from: "wp-0", to: "wp-1", status: "OK", distance_m: 10, walk_time_min: 1,
  climb_m: 2, descent_m: 1, max_slope_deg: 16, cell_path_length: 3,
  geometry: [[0, 0], [10, 0]],
  profile: { dist_m: [0, 5, 10], elev_m: [0, 2, 1], slope_class: ["ok", "caution", "over_limit"] },
};
const chart = (legs: OkLeg[] = [leg]) => renderToStaticMarkup(createElement(ProfileChart, { result: resultOf({ legs }) }));

describe("FR-08 profile", () => {
  it("patterns per slope class", () => {
    const html = chart();
    expect(html).toContain('data-slope-class="ok"');
    expect(html).toMatch(/data-slope-class="caution"[^>]*fill="url\(#[^)]*hatch\)"/);
    expect(html).toMatch(/data-slope-class="over_limit"[^>]*fill="url\(#[^)]*crosshatch\)"/);
    expect(html).toContain('data-provenance="derived"');
    expect(html).toContain('data-source="usgs-gale-dem-1m-v3"');
  });
  it("stop markers at cumulative distance", () => {
    const html = chart([leg, { ...leg, from: "wp-1", to: "wp-2" }]);
    expect(html).toMatch(/data-stop="wp-0" data-distance-m="0"/);
    expect(html).toMatch(/data-stop="wp-1" data-distance-m="10"/);
    expect(html).toMatch(/data-stop="wp-2" data-distance-m="20"/);
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
it("linked cursor has a visible sourced tooltip", () => {
  const html = renderToStaticMarkup(createElement(ProfileChart, { result: resultOf({ legs: [leg] }), hover: { distance_m: 5, leg_index: 0, coord: [5, 0] } }));
  expect(html).toMatch(/<output[^>]*data-profile-tooltip[^>]*data-provenance="derived"[^>]*>5 m · 2 m elevation · caution<\/output>/);
});
it("coordinate-only map hover selects the closest supplied sample", () => {
  const html = renderToStaticMarkup(createElement(ProfileChart, { result: resultOf({ legs: [leg] }), hover: { leg_index: 0, coord: [5, 0] } }));
  expect(html).toMatch(/<output[^>]*>5 m · 2 m elevation · caution<\/output>/);
});
