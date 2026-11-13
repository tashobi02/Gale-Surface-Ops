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
  // The tokens the comm preview canvas reads: the three coverage fills (04 §A.3.2) and the card background.
  for (const [semantic, primitive] of [["--fg-1", "--text-1"], ["--fg-3", "--text-3"], ["--route", "--route"], ["--surface-1", "--panel"]]) {
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

describe("SCR-20 unavailable vehicle parameter set (FR-15)", () => {
  it("shows a sourced unavailable dash when the optional set is null", async () => {
    const snapshot = structuredClone(loaded);
    snapshot.session.mission_setup!.vehicle_param_set = null;
    snapshot.session.mission_setup!.vehicle_available = false;
    snapshot.vehicles = [];
    const { container } = await setup(snapshot, site(false));
    const field = must<HTMLSelectElement>(container, 'select[aria-label="Vehicle parameter set"]');
    expect(field.getAttribute("data-unavailable")).toBe("true");
    expect(field.getAttribute("data-provenance")).toBe("derived");
    expect(field.getAttribute("data-source")).toBe("unavailable:session.mission_setup.vehicle_param_set");
    expect(field.selectedOptions[0]?.textContent).toBe("—");
  });
  it("shows an unavailable dash before mission settings arrive", async () => {
    const { container } = await setup(null, site(false));
    const field = must<HTMLSelectElement>(container, 'select[aria-label="Vehicle parameter set"]');
    expect(field.getAttribute("data-unavailable")).toBe("true");
    expect(field.getAttribute("data-provenance")).toBe("derived");
    expect(field.selectedOptions[0]?.textContent).toBe("—");
  });
});

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

  it("gives every candidate button an accessible name that contains its visible text (WCAG 2.5.3)", async () => {
    const { container } = await setup();
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".setup-candidate button"));
    expect(buttons.length).toBe(candidates.length);
    for (const button of buttons) {
      const visible = (button.textContent ?? "").trim();
      const name = button.getAttribute("aria-label") ?? visible;
      expect(name, `the name "${name}" must contain the visible text "${visible}"`).toContain(visible);
    }
  });

  it("sends SELECT_HAB_SITE and SET_MISSION_SETUP without changing authoritative values", async () => {
    const { container, sent } = await setup();
    await click(must(container, 'button[aria-label="Select site — Mock alternative"]'));
    expect(sent).toEqual([{ kind: "SELECT_HAB_SITE", args: { candidate_id: "hab-alternative" } }]);
    expect(must(container, 'button[aria-label="Selected — Mock first choice"]').getAttribute("aria-pressed")).toBe("true");
    await click(must(container, 'input[aria-label="Vehicle available"]'));
    await select(must(container, 'select[aria-label="Solar phase"]'), "min");
    const haven = must<HTMLInputElement>(container, 'input[aria-label="Maximum time to haven (min)"]');
    haven.value = "35"; await fire(haven, new window.FocusEvent("focusout", { bubbles: true }));
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
    await click(must(computing.container, 'button[aria-label="Select site — Mock alternative"]'));
    expect(computing.container.textContent).toContain("Computing haven fields");
    expect(must<HTMLAnchorElement>(computing.container, 'a[href="#/planner"]').hasAttribute("aria-disabled")).toBe(false);
    await act(async () => resolve(rejected("BUSY", "Server setup refusal")));
    expect(computing.container.textContent).toContain("BUSY: Server setup refusal");
    // A non-null plan is the publication signal; the setup never reads the plan's contents.
    const locked = await setup({ ...loaded, plan: {} as NonNullable<Snapshot["plan"]>, session: { ...loaded.session, plan_revision: 1 } });
    expect(locked.container.textContent).toContain("Locked");
    expect(must<HTMLButtonElement>(locked.container, 'button[aria-label="Select site — Mock alternative"]').disabled).toBe(true);
    expect(must<HTMLInputElement>(locked.container, 'input[aria-label="Maximum time to haven (min)"]').matches(":disabled")).toBe(true);
  });

  it("offers only the scenario crew count and never an empty vehicle parameter option", async () => {
    const { container, sent } = await setup();
    const crew = must<HTMLSelectElement>(container, 'select[aria-label="Crew count"]');
    expect([...crew.options].map((option) => option.value)).toEqual([String(loaded.crew.length)]);
    const vehicle = must<HTMLSelectElement>(container, 'select[aria-label="Vehicle parameter set"]');
    expect([...vehicle.options].some((option) => option.value === "")).toBe(false);
    await select(vehicle, "");
    expect(sent).toEqual([]);
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
    expect([...picker.options].map((o) => o.value)).toEqual(["pr1-assumed"]);
    await select(picker, "pr1-assumed");
    expect(sent).toEqual([{ kind: "SET_MISSION_SETUP", args: { vehicle_param_set: "pr1-assumed" } }]);
  });

  it("marks absent values unavailable and never labels them assumed", async () => {
    const { container } = await setup(null, null);
    // No snapshot and no site: the settings fieldset has no values at all, so every one of them is "—".
    const settings = must(container, ".setup-settings");
    for (const el of settings.querySelectorAll("[data-source]")) {
      expect(el.getAttribute("data-source"), el.outerHTML).toMatch(/^unavailable:/);
      expect(el.getAttribute("data-unavailable"), el.outerHTML).toBe("true");
      expect(el.getAttribute("data-provenance"), el.outerHTML).not.toBe("assumed");
    }
    expect(settings.textContent).toContain("—");
  });

  it("marks a candidate without a note unavailable instead of assuming one", async () => {
    const withoutNote = candidates.map((candidate) => ({ ...candidate, note: undefined }));
    const bundle = { ...site(), site: { ...manifest, hab_candidates: withoutNote } };
    const { container } = await setup(loaded, bundle);
    const card = must(container, '[data-candidate-id="hab-first"]');
    const note = must(card, 'p[data-source^="unavailable:candidate:hab-first:note"]');
    expect(note.textContent).toBe("—");
    expect(note.getAttribute("data-unavailable")).toBe("true");
    expect(note.getAttribute("data-provenance")).not.toBe("assumed");
    expect(note.getAttribute("data-source")).toMatch(/^unavailable:/);
  });

  it("marks an unavailable coverage grid unavailable, never assumed", async () => {
    const real = storeFromBeat("live-loaded", "ops"); clients.push(real);
    const { client } = recordingClient({ ...real, role: "ops", state: () => loaded }, accepted);
    const { MissionSetup } = await import("../../src/ui/screens/scr20MissionSetup");
    const m = await mount(createElement(MissionSetup, { client, site: site(), fetchGrid: async () => new Response("Missing", { status: 404 }) })); mounts.push(m);
    const note = must(must(m.container, '[data-candidate-id="hab-first"]'), "p[data-source^='unavailable:']");
    expect(note.getAttribute("data-unavailable")).toBe("true");
    expect(note.getAttribute("data-provenance")).not.toBe("assumed");
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

  it("commits the haven time on Enter and on Apply, and never snaps the field back mid-edit", async () => {
    const { container, sent } = await setup();
    const haven = must<HTMLInputElement>(container, 'input[aria-label="Maximum time to haven (min)"]');
    haven.focus();
    haven.value = "42";
    await fire(haven, new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(sent).toContainEqual({ kind: "SET_MISSION_SETUP", args: { max_haven_min: 42 } });
    // The field keeps what the user typed until the snapshot answers; it never snaps back to the old value.
    expect(haven.value).toBe("42");

    const apply = must<HTMLButtonElement>(container, 'button[aria-label="Apply maximum time to haven"]');
    haven.value = "55";
    await click(apply);
    expect(sent).toContainEqual({ kind: "SET_MISSION_SETUP", args: { max_haven_min: 55 } });
  });

  it("keeps the status live region mounted before its text changes", async () => {
    const { container } = await setup();
    const status = must(container, ".setup-state");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    // The element that carries the role is always in the tree, so a screen reader sees a region before it changes.
    expect(status.isConnected).toBe(true);
  });

  it("says so when the loaded site and the session disagree on the data version", async () => {
    const other = { ...site(), site: { ...manifest, data_version: "other-2026.11.09" } };
    const { container } = await setup(loaded, other);
    const notice = must(container, ".setup-mismatch");
    expect(notice.textContent).toContain("other-2026.11.09");
    expect(notice.textContent).toContain(loaded.session.data_version);
    expect(notice.getAttribute("role")).toBe("alert");
  });

  it("shows no mismatch notice when the site and the session agree", async () => {
    const matching = { ...site(), site: { ...manifest, data_version: loaded.session.data_version } };
    const { container } = await setup(loaded, matching);
    expect(container.querySelector(".setup-mismatch")).toBeNull();
  });

  it("refuses a candidate change once the session is not LOADED, and sends nothing", async () => {
    for (const status of ["RUNNING", "PAUSED", "ENDED"] as const) {
      const { container, sent } = await setup({ ...loaded, session: { ...loaded.session, status } });
      const button = must<HTMLButtonElement>(container, 'button[aria-label="Select site — Mock alternative"]');
      expect(button.disabled).toBe(true);
      await click(button);
      expect(sent).toEqual([]);
    }
  });

  it("sends one command only while one is in flight", async () => {
    let resolve!: (r: CommandResult) => void;
    const { container, sent } = await setup(loaded, site(), () => new Promise((r) => { resolve = r; }));
    const button = must<HTMLButtonElement>(container, 'button[aria-label="Select site — Mock alternative"]');
    await click(button);
    expect(sent).toHaveLength(1);
    expect(button.disabled).toBe(true);
    await click(button);
    expect(sent).toHaveLength(1);
    await act(async () => resolve(accepted()));
    expect(sent).toHaveLength(1);
  });

  it("sends nothing when the link is lost or the role was taken over", async () => {
    const real = storeFromBeat("live-loaded", "ops"); clients.push(real);
    const listeners = new Set<() => void>(); let lost = false; let taken = false;
    const { client, sent } = recordingClient({ ...real, role: "ops", state: () => loaded,
      linkLost: () => ({ lost, since_ms: null }), takenOver: () => taken,
      subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    });
    const { MissionSetup } = await import("../../src/ui/screens/scr20MissionSetup");
    const m = await mount(createElement(MissionSetup, { client, site: site() })); mounts.push(m);
    await act(async () => { lost = true; for (const l of listeners) l(); });
    await click(must(m.container, 'button[aria-label="Select site — Mock alternative"]'));
    expect(sent).toEqual([]);
    await act(async () => { lost = false; taken = true; for (const l of listeners) l(); });
    await click(must(m.container, 'button[aria-label="Select site — Mock alternative"]'));
    expect(sent).toEqual([]);
  });

  it("follows a new session id with a fresh, locked panel", async () => {
    const matching = { ...site(), site: { ...manifest, data_version: loaded.session.data_version } };
    const { container } = await setup(loaded, matching);
    expect(must(container, ".setup-state").textContent).toBe("Ready");
    // A new session id re-keys the panel, so the new session's own status decides whether it is locked.
    const next = { ...loaded, seq: 2, session: { ...loaded.session, session_id: "s-0008", status: "RUNNING" as const } };
    const { container: after } = await setup(next, matching);
    expect(must(after, ".setup-state").textContent).toContain("Locked");
    expect(must(container, ".setup-state").textContent).toBe("Ready");
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
