/**
 * QoL Q1 — map views carry no credits box (docs/plan/qol/README.md §1 Q1; NFR-07, FR-15; decided by Sadman Shaharier Mahim,
 * 13 Nov 2026).
 *
 * Every map view (SCR-02 planner, SCR-11 ops map, SCR-12 mini-map and full-screen map, and the briefing thumbnail) is built
 * by `createMap`, so the map it returns must carry no OpenLayers attribution control and no credits box. No other module
 * may mount an attribution control of its own. The credits stay in SCR-09: every `site.layers[].source_ids` entry has a
 * dataset row there.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import type OlMap from "ol/Map.js";
import Attribution from "ol/control/Attribution.js";
import { createMap } from "../../src/ui/map/createMap";
import { SourcesMethods } from "../../src/ui/screens/scr09SourcesMethods";
import type { MapHandle } from "../../src/ui/context";
import { installDom, mount, removeDom, type Mounted } from "./domHarness";
import { mockLoadedSite, sizedHost, stubResizeObserver } from "./map/mapFixtures";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../../src");
const SITE = mockLoadedSite();

beforeAll(() => {
  installDom();
  stubResizeObserver();
});
afterAll(() => removeDom());

const maps: MapHandle[] = [];
const mounted: Mounted[] = [];
afterEach(async () => {
  for (const handle of maps.splice(0)) handle.destroy();
  for (const m of mounted.splice(0)) await m.unmount();
  document.body.innerHTML = "";
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("QoL Q1: no credits box on any map view", () => {
  it("the shared map has no attribution control and renders no credits box", () => {
    const host = sizedHost();
    const handle = createMap({ target: host, site: SITE });
    maps.push(handle);
    const controls = handle.getMap<OlMap>().getControls().getArray();
    expect(controls.some((control) => control instanceof Attribution), "an Attribution control").toBe(false);
    expect(host.querySelector(".ol-attribution"), "the OpenLayers attribution box").toBeNull();
    expect(host.querySelector('[data-testid="attribution"]'), "our credits box").toBeNull();
  });

  it("no map module mounts an attribution control of its own", () => {
    for (const file of sourceFiles(SRC)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/ol\/control\/Attribution|ol\/control\/defaults/);
    }
  });

  it("SCR-09 still credits every source of every map layer", async () => {
    const m = await mount(createElement(SourcesMethods, { site: SITE }));
    mounted.push(m);
    const rows = new Set([...m.container.querySelectorAll<HTMLElement>('[data-slot="dataset-row"]')].map((row) => row.dataset.sourceId));
    const layerSources = SITE.site.layers.flatMap((layer) => layer.source_ids);
    expect(layerSources.length).toBeGreaterThan(0);
    for (const id of layerSources) expect(rows.has(id), `${id} has no SCR-09 row`).toBe(true);
  });
});
