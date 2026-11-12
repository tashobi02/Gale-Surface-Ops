/** T32.21: SCR-20 on F7 and an explicitly mocked two-candidate manifest. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { readFileSync } from "node:fs";
import type { CommandResult, HabCandidate, Site, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../src/net/habClient";
import type { LoadedSite } from "../../src/ui/context";
import { wsFixtures } from "../fixtures/ws";
import { accepted, recordingClient, rejected, storeFromBeat } from "./fixtureStore";
import { click, fire, flush, installDom, mount, must, removeDom, type Mounted } from "./domHarness";

const loaded = wsFixtures["live-loaded"][0] as Snapshot;
const manifest = JSON.parse(readFileSync(new URL("../../../../data/sites/mock_site/site-manifest.json", import.meta.url), "utf8")) as Site;
// MOCK DATA only: positions and sources deliberately reuse the F4 manifest, not real candidate science.
const candidates: HabCandidate[] = ["hab-first", "hab-alternative"].map((candidate_id, i) => ({
  candidate_id, label: i === 0 ? "Mock first choice" : "Mock alternative", rank: i + 1,
  hab_mast: manifest.grid.hab_mast, lat: manifest.aoi.bbox_geo[1], lon_e: manifest.aoi.bbox_geo[0],
  // F4 flags is a second u8 asset standing in for the alternative's comm asset in this mock manifest only.
  default_start: manifest.default_start, comm_hab_asset: i === 0 ? manifest.grid.comm_hab_asset : manifest.grid.flags_asset,
  note: "Mock pre-checked site note", provenance: "assumed", source_ids: [manifest.sources[0]!.source_id],
}));
function site(withCandidates = true): LoadedSite {
  return { site: { ...manifest, hab_candidates: withCandidates ? candidates : undefined }, layers: new Map(), sources: new Map(manifest.sources.map((s) => [s.source_id, s])), pois: new Map(),
    assets: new Map(manifest.assets.map((a) => [a.asset_id, { ...a, url: `sites/mock_site/${a.path}` }])),
  };
}
const clients: HabClient[] = []; const mounts: Mounted[] = [];
beforeAll(() => {
  installDom();
  const tokens = readFileSync(new URL("../../src/ui/styles/tokens.css", import.meta.url), "utf8");
  for (const [semantic, primitive] of [["--fg-1", "--text-1"], ["--surface-1", "--panel"]]) {
    document.documentElement.style.setProperty(semantic!, new RegExp(`${primitive}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)![1]!);
  }
}); afterAll(removeDom);
afterEach(async () => { for (const m of mounts.splice(0)) await m.unmount(); for (const c of clients.splice(0)) c.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function setup(snapshot: Snapshot | null = loaded, bundle: LoadedSite | null = site(), answer: () => CommandResult | Promise<CommandResult> = accepted, role: HabClient["role"] = "ops") {
  const real = storeFromBeat("live-loaded", "ops"); clients.push(real);
  const { client, sent } = recordingClient({ ...real, role, state: () => snapshot }, answer);
  const putImageData = vi.fn();
  vi.spyOn(window.HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData, imageSmoothingEnabled: true })) as never);
  const fetchGrid = vi.fn(async () => new Response(new Uint8Array(manifest.grid.width * manifest.grid.height).fill(1)));
  const { MissionSetup } = await import("../../src/ui/screens/scr20MissionSetup");
  const m = await mount(createElement(MissionSetup, { client, site: bundle, fetchGrid })); mounts.push(m);
  return { ...m, client, sent, fetchGrid, putImageData };
}
async function select(el: HTMLSelectElement, value: string) { el.value = value; await fire(el, new window.Event("change", { bubbles: true })); }

describe("SCR-20 mission setup", () => {
  it("reads every card fact, preview asset and provenance from hab_candidates", async () => {
    const { container, fetchGrid, putImageData } = await setup();
    expect(container.querySelectorAll('[data-candidate-id]')).toHaveLength(2);
    for (const candidate of candidates) {
      const card = must(container, `[data-candidate-id="${candidate.candidate_id}"]`);
      expect(card.textContent).toContain(candidate.label); expect(card.textContent).toContain(candidate.note);
      expect(card.textContent).toContain(`${candidate.hab_mast.x_m} m`);
      expect(card.textContent).toContain(`${candidate.lat}°`);
      expect(must(card, "canvas").getAttribute("data-source")).toBe(candidate.source_ids.join(" "));
      expect(must(card, "canvas").getAttribute("data-provenance")).toBe(candidate.provenance);
    }
    for (const candidate of candidates) expect(fetchGrid).toHaveBeenCalledWith(`sites/mock_site/${manifest.assets.find((a) => a.asset_id === candidate.comm_hab_asset)!.path}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(putImageData).toHaveBeenCalled();
  });

  it("shows the single manifest default site as fixed when candidates are absent", async () => {
    const { container } = await setup(loaded, site(false));
    expect(container.textContent).toContain("Fixed site"); expect(container.textContent).toContain(manifest.default_start.label);
    expect(container.querySelector('[data-candidate-id]')).toBeNull();
    expect(container.textContent).toContain(`${manifest.default_start.x_m} m`);
  });

  it("sends SELECT_HAB_SITE and SET_MISSION_SETUP without changing authoritative values", async () => {
    const { container, sent } = await setup();
    await click(must(container, 'button[aria-label="Select Mock alternative"]'));
    expect(sent).toEqual([{ kind: "SELECT_HAB_SITE", args: { candidate_id: "hab-alternative" } }]);
    expect(must(container, 'button[aria-label="Select Mock first choice"]').getAttribute("aria-pressed")).toBe("true");
    await select(must(container, 'select[aria-label="Crew count"]'), "1");
    await click(must(container, 'input[aria-label="Vehicle available"]'));
    await select(must(container, 'select[aria-label="Solar phase"]'), "min");
    const haven = must<HTMLInputElement>(container, 'input[aria-label="Maximum time to haven (min)"]');
    haven.value = "35"; await fire(haven, new window.FocusEvent("focusout", { bubbles: true }));
    expect(sent).toContainEqual({ kind: "SET_MISSION_SETUP", args: { crew_count: 1 } });
    expect(sent).toContainEqual({ kind: "SET_MISSION_SETUP", args: { vehicle_available: false } });
    expect(sent).toContainEqual({ kind: "SET_MISSION_SETUP", args: { solar_phase: "min" } });
    expect(sent).toContainEqual({ kind: "SET_MISSION_SETUP", args: { max_haven_min: 35 } });
    expect(must<HTMLSelectElement>(container, 'select[aria-label="Solar phase"]').value).toBe("max");
    expect(container.textContent).toContain("Defaults are assumptions");
    expect(container.textContent).toContain("prepared on Earth, pre-checked");
  });

  it("renders Loading, Ready, Computing, Locked and rejected reasons", async () => {
    const loading = await setup(null, null); expect(loading.container.textContent).toContain("Loading");
    let resolve!: (r: CommandResult) => void;
    const computing = await setup(loaded, site(), () => new Promise((r) => { resolve = r; }));
    expect(computing.container.textContent).toContain("Ready");
    await click(must(computing.container, 'button[aria-label="Select Mock alternative"]'));
    expect(computing.container.textContent).toContain("Computing haven fields");
    expect(must<HTMLAnchorElement>(computing.container, 'a[href="#/planner"]').hasAttribute("aria-disabled")).toBe(false);
    await act(async () => resolve(rejected("BUSY", "Server setup refusal")));
    expect(computing.container.textContent).toContain("BUSY: Server setup refusal");
    // A non-null plan is the publication signal; the setup never reads the plan's contents.
    const locked = await setup({ ...loaded, plan: {} as NonNullable<Snapshot["plan"]>, session: { ...loaded.session, plan_revision: 1 } });
    expect(locked.container.textContent).toContain("Locked");
    expect(must<HTMLButtonElement>(locked.container, 'button[aria-label="Select Mock alternative"]').disabled).toBe(true);
    expect(must<HTMLInputElement>(locked.container, 'input[aria-label="Maximum time to haven (min)"]').matches(":disabled")).toBe(true);
  });

  it("offers setup controls only to ops and Continue navigates to the planner", async () => {
    for (const role of ["presenter", "planner", "eva:EV1", "earth"] as const) {
      const { container, sent } = await setup(loaded, site(), accepted, role);
      expect(container.querySelector("button, input, select")).toBeNull(); expect(sent).toEqual([]);
      expect(container.textContent).toContain("Ops only");
    }
    const { container } = await setup();
    expect(must<HTMLAnchorElement>(container, 'a[aria-label="Continue to the planner"]').getAttribute("href")).toBe("#/planner");
  });

  it("refuses an out-of-range or blank haven time locally, explains why and sends nothing", async () => {
    const { container, sent } = await setup();
    const haven = must<HTMLInputElement>(container, 'input[aria-label="Maximum time to haven (min)"]');
    expect(haven.value).toBe("30");
    for (const value of ["4", "121", "", "abc"]) {
      haven.value = value; await fire(haven, new window.FocusEvent("focusout", { bubbles: true }));
      expect(container.textContent, `value ${JSON.stringify(value)}`).toContain("Maximum time to haven must be between 5 and 120 min.");
      expect(haven.value).toBe("30");
    }
    expect(sent).toEqual([]);
    haven.value = "5"; await fire(haven, new window.FocusEvent("focusout", { bubbles: true }));
    expect(sent).toEqual([{ kind: "SET_MISSION_SETUP", args: { max_haven_min: 5 } }]);
    expect(container.textContent).not.toContain("must be between 5 and 120");
  });

  it("offers only the snapshot's rover parameter sets and sends the chosen one", async () => {
    const { container, sent } = await setup();
    const picker = must<HTMLSelectElement>(container, 'select[aria-label="Vehicle parameter set"]');
    expect([...picker.options].map((o) => o.value)).toEqual(["", "pr1-assumed"]);
    await select(picker, "pr1-assumed");
    expect(sent).toEqual([{ kind: "SET_MISSION_SETUP", args: { vehicle_param_set: "pr1-assumed" } }]);
  });

  it("shows — and no coverage when a candidate's grid cannot be fetched", async () => {
    const real = storeFromBeat("live-loaded", "ops"); clients.push(real);
    const { client } = recordingClient({ ...real, role: "ops", state: () => loaded }, accepted);
    const { MissionSetup } = await import("../../src/ui/screens/scr20MissionSetup");
    const m = await mount(createElement(MissionSetup, { client, site: site(), fetchGrid: async () => new Response("Missing", { status: 404 }) })); mounts.push(m);
    const card = must(m.container, '[data-candidate-id="hab-first"]');
    expect(must<HTMLCanvasElement>(card, "canvas").hidden).toBe(true);
    expect(card.textContent).toContain("—");
    expect(card.textContent).not.toContain("Loading coverage");
  });

  it("loads the URL's site and recovers from a missing manifest with Retry", async () => {
    const real = storeFromBeat("live-loaded", "ops"); clients.push(real);
    let fail = true;
    window.history.replaceState(null, "", "/?site=mock_site#/setup");
    const fetchImpl = vi.fn(async (url: string) => {
      if (fail) return new Response("Missing", { status: 404 });
      if (url === "sites/mock_site/site-manifest.json") return new Response(JSON.stringify(manifest));
      if (url === "sites/mock_site/vectors/pois.geojson") return new Response(readFileSync(new URL("../../../../data/sites/mock_site/vectors/pois.geojson", import.meta.url), "utf8"));
      return new Response("Missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const { MissionSetup } = await import("../../src/ui/screens/scr20MissionSetup");
    const m = await mount(createElement(MissionSetup, { client: real })); mounts.push(m); await flush();
    expect(m.container.textContent).toContain("Site could not load");
    fail = false;
    await click(must(m.container, 'button'));
    await flush();
    expect(m.container.textContent).toContain("Fixed site");
    expect(m.container.textContent).toContain("Ready");
    expect(fetchImpl.mock.calls.every(([url]) => url.startsWith("sites/mock_site/"))).toBe(true);
    window.history.replaceState(null, "", "/");
  });
});
