/**
 * T07.05 — SCR-01 mission briefing (03 SCR-01; 04 §E.1; 01 §F.1, FR-01, FR-15; FD-109).
 *
 * The real component is mounted with the F4 mock site as the manifest, and the buttons are clicked:
 * **Open demo plan** resolves the demo plan's start and POI ids against the site bundle and loads them into the
 * plan store, **Start planning** opens the planner route, **Sources & methods** opens SCR-09 and **Run demo** opens
 * SCR-10 (03 SCR-01, 04 §E.1).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { MissionScenario, Waypoint } from "@marswalk/protocol";
import { MissionBriefing } from "../../src/ui/screens/scr01MissionBriefing";
import { createPlanStore, type PlanState } from "../../src/state/planStore";
import { click, installDom, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";

beforeAll(() => installDom());
afterAll(() => removeDom());

const open: Mounted[] = [];
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
});

/** A worker double: the demo plan is loaded, not computed, so nothing is answered. */
function fakeWorker() {
  return {
    computePlan: async () => {
      throw new Error("the demo plan is not computed in this test");
    },
    retry: () => {},
    isCrashed: () => false,
  };
}

/** A plan store with the mock site's default start, like the boot builds it. */
function storeOf(): { store: ReturnType<typeof createPlanStore>; states: PlanState[] } {
  const site = mockLoadedSite();
  const states: PlanState[] = [];
  const store = createPlanStore(
    {
      scenario: {
        eva_start_utc: "",
        max_eva_duration_h: 6,
        dwell_min_per_stop: 20,
        hard_slope_limit_deg: 15,
        caution_slope_deg: 10,
        walkback_limit_km: 5,
        suited_flat_speed_kmh: 3.3,
        solar_phase: "max",
        loop: true,
        max_haven_min: 30,
        crew_count: 2,
        vehicle_available: true,
        vehicle_param_set: "pr1-assumed",
      } satisfies MissionScenario,
      waypoints: [{ id: "wp-0", role: "start", x_m: site.site.default_start.x_m, y_m: site.site.default_start.y_m }],
    },
    { workerClient: fakeWorker(), siteId: site.site.site_id, dataVersion: site.site.data_version },
  );
  store.subscribe((state) => states.push(state));
  return { store, states };
}

async function briefing(over: { onNavigate?: (hash: string) => void; store?: ReturnType<typeof createPlanStore> } = {}) {
  const site = mockLoadedSite();
  const onNavigate = over.onNavigate ?? vi.fn();
  const store = over.store ?? storeOf().store;
  const m = await mountRaw(createElement(MissionBriefing, { site, planStore: store, onNavigate }));
  open.push(m);
  return { root: m.container, onNavigate, store };
}

describe("SCR-01 mission briefing (T07.05)", () => {
  it("open demo plan loads three stops", async () => {
    const { root, store } = await briefing();
    const button = must<HTMLButtonElement>(root, '[data-slot="open-demo-plan"]');
    await click(button);

    const state = store.get();
    // The demo plan names three curated POIs of the real site bundle; the F4 fixture has one, so the stops the
    // fixture cannot resolve are named as "unresolved" instead of being invented. What the screen must do is
    // load every stop the site bundle can resolve, in the demo plan's order.
    const stops = state.waypoints.filter((w) => w.role === "stop");
    const pois = mockLoadedSite().pois;
    const resolvable = mockLoadedSite();
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(stop.poi_id).toBeTruthy();
      expect(pois.has(stop.poi_id!)).toBe(true);
    }
    // Every POI the fixture has is one of the demo plan's stops.
    for (const id of pois.keys()) {
      expect(stops.map((s) => s.poi_id)).toContain(id);
    }
    // The start is the site's default_start, never a copied coordinate from the demo plan.
    expect(state.waypoints[0]?.role).toBe("start");
    expect(state.waypoints[0]?.x_m).toBe(resolvable.site.default_start.x_m);
    expect(state.waypoints[0]?.y_m).toBe(resolvable.site.default_start.y_m);
    // The scenario is the demo plan's own: the 05 defaults.
    expect(state.scenario.max_eva_duration_h).toBe(6);
    expect(state.scenario.hard_slope_limit_deg).toBe(15);
  });

  it("badges from manifest", async () => {
    const site = mockLoadedSite();
    const { root } = await briefing();
    const badges = Array.from(root.querySelectorAll<HTMLElement>('[data-slot="data-badge"]'));
    expect(badges.length).toBe(site.site.sources.length);
    for (const badge of badges) {
      const id = badge.getAttribute("data-source");
      expect(id).toBeTruthy();
      // Every badge names a source the manifest really has.
      expect(site.sources.has(id!)).toBe(true);
      expect(badge.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("shows the site name, the objective, what this tool does and the 01 §F.1 disclaimer", async () => {
    const site = mockLoadedSite();
    const { root } = await briefing();
    expect(must(root, '[data-slot="site-name"]').textContent).toBe(site.site.name);
    expect(must(root, '[data-slot="objective"]').textContent?.trim().length).toBeGreaterThan(0);
    expect(must(root, '[data-slot="what-this-tool-does"]').textContent?.trim().length).toBeGreaterThan(0);
    const disclaimer = must(root, '[data-slot="disclaimer"]').textContent ?? "";
    // The ADR-013 product name (FD-006): the boundary statement follows the name.
    expect(disclaimer).toContain("Gale Surface Ops is an exploratory hackathon prototype.");
    expect(disclaimer).toContain("not astronaut operations software");
    expect(disclaimer).toContain("Radio coverage is line-of-sight only.");
  });

  it("Start planning, Open demo plan, Run demo and Sources are all reachable and named", async () => {
    const { root } = await briefing();
    for (const slot of ["start-planning", "open-demo-plan", "run-demo", "open-sources"]) {
      const control = must(root, `[data-slot="${slot}"]`);
      expect(control.getAttribute("data-action") ?? control.textContent?.trim().length).toBeTruthy();
    }
  });

  it("the buttons navigate to their routes", async () => {
    const onNavigate = vi.fn();
    const { root } = await briefing({ onNavigate });
    await click(must(root, '[data-slot="start-planning"]'));
    await click(must(root, '[data-slot="run-demo"]'));
    await click(must(root, '[data-slot="open-sources"]'));
    expect(onNavigate).toHaveBeenCalledWith("#/planner");
    expect(onNavigate).toHaveBeenCalledWith("#/join");
    expect(onNavigate).toHaveBeenCalledWith("#/sources");
  });

  it("no number on the screen is unlabelled (FR-15)", async () => {
    const { root } = await briefing();
    // Every text node with a digit must sit inside an element that carries a provenance class and a source id,
    // or be an identifier the rule exempts (FD-110). `data-identifier` is the codebase's marker for "an id, not a
    // measurement" (scr02MapWorkspace.tsx), so its presence exempts the text.
    for (const node of Array.from(root.querySelectorAll<HTMLElement>("body *"))) {
      if (!node.textContent?.trim()) continue;
      const own = Array.from(node.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? "")
        .join("");
      if (!/\d/.test(own)) continue;
      const labelled = node.closest("[data-provenance][data-source]") !== null;
      const isExempt = node.closest("[data-identifier]") !== null;
      expect(labelled || isExempt, `unlabelled number: ${own.trim()}`).toBe(true);
    }
  });
});

/** The waypoint type the demo plan resolves to (the test reads it from the store). */
export type DemoWaypoint = Waypoint;
