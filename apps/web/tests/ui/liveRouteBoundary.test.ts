/**
 * T32.19-T32.22 (review round): the presenter and setup routes are wrapped in the same RouteBoundary as every other
 * route, and a manifest entry the screen cannot read (a candidate without `source_ids`) does not blank the page.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import type { HabCandidate, Site, Snapshot } from "@marswalk/protocol";
import type { PlannerBootHandle } from "../../src/boot/bootPlanner";
import type { HabClient } from "../../src/net/habClient";
import type { LoadedSite } from "../../src/ui/context";
import { wsFixtures } from "../fixtures/ws";
import { accepted, recordingClient, storeFromBeat } from "./fixtureStore";
import { installDom, mount, must, removeDom, type Mounted } from "./domHarness";

const loaded = wsFixtures["live-loaded"][0] as Snapshot;
const manifest = JSON.parse(readFileSync(new URL("../../../../data/sites/mock_site/site-manifest.json", import.meta.url), "utf8")) as Site;

const clients: HabClient[] = [];
const mounts: Mounted[] = [];
beforeAll(installDom);
afterAll(removeDom);
afterEach(async () => { for (const m of mounts.splice(0)) await m.unmount(); for (const c of clients.splice(0)) c.close(); vi.restoreAllMocks(); });

const planner = { get: async () => ({}) as never, reset: () => {} } as unknown as PlannerBootHandle;

function site(candidates: HabCandidate[] | undefined): LoadedSite {
  return {
    site: { ...manifest, hab_candidates: candidates },
    layers: new Map(),
    sources: new Map(manifest.sources.map((s) => [s.source_id, s])),
    pois: new Map(),
    assets: new Map(manifest.assets.map((a) => [a.asset_id, { ...a, url: `sites/mock_site/${a.path}` }])),
  };
}

/** A candidate with no `source_ids` at all: the manifest schema requires them, but the screen must not blank on one. */
const broken = {
  candidate_id: "hab-broken",
  label: "Mock broken candidate",
  rank: 1,
  hab_mast: manifest.grid.hab_mast,
  lat: manifest.aoi.bbox_geo[1],
  lon_e: manifest.aoi.bbox_geo[0],
  comm_hab_asset: manifest.grid.comm_hab_asset,
  default_start: manifest.default_start,
  provenance: "assumed",
} as unknown as HabCandidate;

describe("SCR-19 and SCR-20 route boundaries", () => {
  it("shows the presenter screen inside a route boundary, not a blank page", async () => {
    const { App } = await import("../../src/ui/App");
    const { parseHash } = await import("../../src/ui/router");
    const real = storeFromBeat("live-loaded"); clients.push(real);
    const { client } = recordingClient({ ...real, role: "presenter", state: () => loaded }, accepted);
    const m = await mount(createElement(App, { route: parseHash("#/presenter"), planner, fetchImpl: async () => new Response("{}") }));
    mounts.push(m);
    expect(m.container.querySelector('[data-screen="SCR-19"]')).not.toBeNull();
    expect(m.container.querySelector('[data-slot="screen-error"]')).toBeNull();
    void client;
  });

  it("shows the setup screen inside a route boundary, not a blank page", async () => {
    const { App } = await import("../../src/ui/App");
    const { parseHash } = await import("../../src/ui/router");
    const real = storeFromBeat("live-loaded", "ops"); clients.push(real);
    const { client } = recordingClient({ ...real, role: "ops", state: () => loaded }, accepted);
    const m = await mount(createElement(App, { route: parseHash("#/setup"), planner, fetchImpl: async () => new Response("{}") }));
    mounts.push(m);
    expect(m.container.querySelector('[data-screen="SCR-20"]')).not.toBeNull();
    expect(m.container.querySelector('[data-slot="screen-error"]')).toBeNull();
    void client;
  });

  it("a candidate without source_ids does not blank the setup screen", async () => {
    const { MissionSetup } = await import("../../src/ui/screens/scr20MissionSetup");
    const real = storeFromBeat("live-loaded", "ops"); clients.push(real);
    const { client } = recordingClient({ ...real, role: "ops", state: () => loaded }, accepted);
    vi.spyOn(window.HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn(), imageSmoothingEnabled: true })) as never);
    const m = await mount(createElement(MissionSetup, {
      client,
      site: site([broken]),
      fetchGrid: async () => new Response(new Uint8Array(manifest.grid.width * manifest.grid.height).fill(1)),
    }));
    mounts.push(m);
    expect(m.container.querySelector('[data-candidate-id="hab-broken"]')).not.toBeNull();
    // The card still renders its facts; the source line is "—", not a crash.
    expect(m.container.textContent).toContain("Mock broken candidate");
    expect(must(m.container, '[data-candidate-id="hab-broken"]').textContent).toContain("—");
  });
});
