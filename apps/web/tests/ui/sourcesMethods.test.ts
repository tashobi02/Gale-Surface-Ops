/**
 * T12.03 — SCR-09 sources and methods (03 SCR-09; 04 §E.9; 01 FR-15; FD-143, FD-144, FD-146).
 *
 * The real component is mounted with the F4 mock site: the datasets table lists every manifest source with all
 * six columns of 03 SCR-09, the deep-link anchor (`#/sources#layer-slope`) scrolls to the named entry, and every
 * section of 03 SCR-09 is present.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { SourcesMethods } from "../../src/ui/screens/scr09SourcesMethods";
import { click, installDom, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";

beforeAll(() => installDom());
afterAll(() => removeDom());

const open: Mounted[] = [];
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
});

async function sources(anchor?: string) {
  const site = mockLoadedSite();
  const m = await mountRaw(createElement(SourcesMethods, { site, anchor }));
  open.push(m);
  return { root: m.container, site };
}

describe("SCR-09 sources and methods (T12.03)", () => {
  it("every manifest source listed", async () => {
    const { root, site } = await sources();
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-slot="dataset-row"]'));
    expect(rows.length).toBe(site.site.sources.length);
    for (const source of site.site.sources.values()) {
      const row = rows.find((r) => r.getAttribute("data-source-id") === source.source_id);
      expect(row, `${source.source_id} has no row`).toBeDefined();
      // All six columns of 03 SCR-09: name, version, mission/instrument, resolution, licence/credit, link.
      for (const column of ["dataset-name", "dataset-version", "dataset-mission", "dataset-resolution", "dataset-licence", "dataset-link"]) {
        expect(row!.querySelector(`[data-slot="${column}"]`), `${source.source_id} has no ${column}`).not.toBeNull();
      }
      expect(row!.textContent).toContain(source.title);
      // A source id is a catalogue code: the row carries it as its identifier (04 §E.9).
      expect(row!.getAttribute("data-identifier")).toBe(source.source_id);
    }
  });

  it("every source title is on the screen (the SCR-09 half of the `credits` check, FD-249)", async () => {
    // The `credits` harness check stays a fixme for package 31 (its README half is package 31's), so the SCR-09 half it
    // will assert is asserted here now.
    const { root, site } = await sources();
    const screen = root.textContent ?? "";
    for (const source of site.site.sources.values()) {
      expect(screen, `${source.source_id} missing from SCR-09`).toContain(source.title);
    }
  });

  it("anchor scrolls to layer", async () => {
    const { root } = await sources("layer-slope");
    // The deep link names an entry of the layer table; the entry is in view and marked as the target.
    const target = must(root, '[data-slot="layer-entry"][data-layer-id="slope"]');
    expect(target.getAttribute("data-anchor-target")).toBe("true");
    // The anchor scrolls the entry into view (04 §E: instant under prefers-reduced-motion).
    expect(target.getAttribute("data-scrolled")).toBe("true");
  });

  it("an anchor that names nothing leaves the screen as it is", async () => {
    const { root } = await sources("layer-does-not-exist");
    expect(root.querySelector('[data-anchor-target="true"]')).toBeNull();
  });

  it("every section of 03 SCR-09 is present", async () => {
    const { root } = await sources();
    for (const section of ["datasets", "processing", "models", "assumptions", "replay-sources", "limitations", "ai-use", "diagnostics"]) {
      expect(root.querySelector(`[data-slot="section-${section}"]`), section).not.toBeNull();
    }
  });

  it("the index lists every section and jumps to it", async () => {
    const { root } = await sources();
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-slot="index-link"]'));
    expect(links.length).toBeGreaterThanOrEqual(8);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href, link.textContent ?? "").toMatch(/^#(datasets|processing|models|assumptions|replay-sources|limitations|ai-use|diagnostics)$/);
    }
  });

  it("the AI-use statement is the 03 SCR-09 wording", async () => {
    const { root } = await sources();
    expect(must(root, '[data-slot="section-ai-use"]').textContent).toContain("No AI computes or generates values in this app.");
  });

  it("the radiation rates come from the manifest env_constants and carry their source id", async () => {
    const { root, site } = await sources();
    const constants = site.site.env_constants.filter((c) => c.source_id);
    expect(constants.length).toBeGreaterThan(0);
    for (const constant of constants) {
      const cell = root.querySelector(`[data-slot="env-constant"][data-const-id="${constant.const_id}"]`);
      expect(cell, `${constant.const_id} is not shown`).not.toBeNull();
      expect(cell!.getAttribute("data-source")).toBe(constant.source_id);
      expect(cell!.getAttribute("data-provenance")).toBe(constant.provenance);
    }
  });

  it("a model entry carries its equations and its provenance label", async () => {
    const { root } = await sources();
    const model = must(root, '[data-slot="model-entry"][data-model-id="model-radiation-dose"]');
    expect(model.querySelector('[data-slot="equations"]')).not.toBeNull();
    expect(model.getAttribute("data-provenance")).toBe("modelled");
    expect(model.textContent).toContain("measured background rate × planned duration (simplified)");
  });

  it("the diagnostics section names the data version and the checksum status", async () => {
    const { root, site } = await sources();
    const diagnostics = must(root, '[data-slot="section-diagnostics"]');
    expect(diagnostics.textContent).toContain(site.site.data_version);
    expect(diagnostics.querySelector('[data-slot="checksum-status"]')).not.toBeNull();
  });

  it("the index links are reachable by keyboard", async () => {
    const { root } = await sources();
    const link = must<HTMLAnchorElement>(root, '[data-slot="index-link"]');
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBeTruthy();
    // Clicking an index link does not throw (the anchor is a plain in-page link).
    await click(link);
  });
});
