/**
 * Tests for SCR-05 Route Results panel (T09.03, 03 SCR-05, 04 §F, FR-07–FR-12, FR-15, NFR-05).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteResults } from "../../src/ui/screens/scr05RouteResults";
import type { PlanState, PlanStore } from "../../src/state/planStore";
import type { PlanResult } from "@marswalk/protocol";
import okFixture from "../fixtures/plan-results/ok.json";
import partialFixture from "../fixtures/plan-results/partial.json";
import overLimitsFixture from "../fixtures/plan-results/over-limits.json";

function createMockPlanStore(initialState: Partial<PlanState> = {}): PlanStore {
  const defaultScenario = {
    site_id: "gale_boxwork",
    crew: [{ id: "EV1", name: "Astronaut 1" }],
    eva_start_utc: "2026-11-14T08:00:00Z",
    max_eva_duration_h: 7.0,
    walkback_limit_km: 3.6,
    speed_model: "tobler_standard",
    headlamp_lux: 40,
    solar_elevation_min_deg: 0,
    dwell_per_stop_min: 20,
  } as any;

  let state: PlanState = {
    scenario: defaultScenario,
    waypoints: [
      { id: "wp-0", role: "start", x_m: 0, y_m: 0, label: "Hab" },
      { id: "wp-1", role: "stop", x_m: 1000, y_m: 1000, label: "Stop 1" },
    ],
    plan_revision: 1,
    status: "OK",
    result: okFixture as unknown as PlanResult,
    last_error_code: null,
    can_undo: false,
    selected_waypoint_id: null,
    hover: null,
    ...initialState,
  };

  const listeners = new Set<(s: PlanState) => void>();

  return {
    get: () => state,
    setScenario: vi.fn(),
    setWaypoints: vi.fn(),
    undo: vi.fn(),
    retry: vi.fn(),
    selectWaypoint: vi.fn(),
    setHover: vi.fn(),
    addWaypoint: vi.fn(),
    moveWaypoint: vi.fn(),
    deleteWaypoint: vi.fn(),
    reorderWaypoints: vi.fn(),
    resetDefaults: vi.fn(),
    loadPlan: vi.fn(),
    subscribe: (listener: (s: PlanState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as PlanStore;
}

describe("SCR-05 Route Results (T09.03)", () => {
  it("renders Empty state when plan has no stops", () => {
    const store = createMockPlanStore({
      waypoints: [{ id: "wp-0", role: "start", x_m: 0, y_m: 0 }],
      status: "Empty",
      result: null,
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("Add at least one stop");
    expect(html).toContain("—");
  });

  it("renders Computing state with layout preserved and dimmed metrics", () => {
    const store = createMockPlanStore({
      status: "Computing",
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("Computing…");
    expect(html).toContain("data-computing=\"true\"");
  });

  it("renders OK result with 6 headline metrics, units and provenance attributes", () => {
    const store = createMockPlanStore({
      status: "OK",
      result: okFixture as unknown as PlanResult,
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("OK");
    // 6 headline metrics: Distance, Walk time, EVA total, Max slope, Max walkback, Dose
    expect(html).toContain("6.12"); // km
    expect(html).toContain("128"); // min walk time
    expect(html).toContain("148"); // min EVA total
    expect(html).toContain("12.6"); // deg max slope
    expect(html).toContain("3.06"); // km max walkback
    expect(html).toContain("0.066"); // mSv dose

    // Provenance attributes (FR-15, NFR-05)
    expect(html).toContain("data-provenance=\"derived\"");
    expect(html).toContain("data-provenance=\"modelled\"");
    expect(html).toContain("data-source-id=\"compute:route\"");
    expect(html).toContain("data-source-id=\"model:tobler\"");
  });

  it("renders PARTIAL status with NO_ROUTE reason and hides totals", () => {
    const store = createMockPlanStore({
      status: "Partial",
      result: partialFixture as unknown as PlanResult,
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("Partial");
    expect(html).toContain("DISCONNECTED_BY_SLOPE");
    // Totals must be omitted (02 §E.2)
    expect(html).toContain("data-totals-hidden=\"true\"");
  });

  it("renders OVER_LIMITS status with exceeded limits in banner", () => {
    const store = createMockPlanStore({
      status: "OverLimits",
      result: overLimitsFixture as unknown as PlanResult,
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("Over limits");
    expect(html).toContain("WALKBACK_EXCEEDED");
  });

  it("renders Error state with 'Computation failed' and Retry button", () => {
    const store = createMockPlanStore({
      status: "Error",
      last_error_code: "TIMEOUT",
      result: null,
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("Computation failed");
    expect(html).toContain("Retry");
  });

  it("includes aria-live='polite' region announcing status", () => {
    const store = createMockPlanStore({
      status: "OK",
      result: okFixture as unknown as PlanResult,
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("aria-live=\"polite\"");
    expect(html).toContain("Plan updated: OK");
  });

  it("renders collapsible status strip toggle and details breakdown", () => {
    const store = createMockPlanStore({
      status: "OK",
      result: okFixture as unknown as PlanResult,
    });

    const html = renderToStaticMarkup(React.createElement(RouteResults, { planStore: store }));

    expect(html).toContain("scr05-results-panel");
    expect(html).toContain("Details");
  });
});

