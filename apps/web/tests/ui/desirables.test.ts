/** Package 35: explicit PRINT-based light OPS theme (T13.08, FD-002/FD-061). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDom, removeDom, mount, click, keyDown } from "./domHarness";
import { applyTheme } from "../../src/ui/theme";
import { saveLastPlan, restoreLastPlan, LAST_PLAN_STORAGE_KEY } from "../../src/state/persist";
import { exportPlan } from "../../src/export/planExport";
import { createPlanStore, DEFAULT_SCENARIO } from "../../src/state/planStore";
import { mockManifest } from "./map/mapFixtures";
import { SCENARIO, WAYPOINTS, resultOf, stateOf } from "./planStoreFake";
import type { ComputePlanRequest, PlanExport, PlanResultMessage } from "@marswalk/protocol";
import { contrast } from "./wcag";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/styles");
const readStyle = (f: string): string => readFileSync(join(STYLES_DIR, f), "utf8");

describe("T13.08: light theme only by param (FD-002, FD-061)", () => {
  beforeEach(() => {
    installDom();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    removeDom();
  });

  it("light theme only by param: sets data-theme='light' only when ?theme=light is supplied", () => {
    // 1. When URL search has theme=light, data-theme='light' is set
    applyTheme("?theme=light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // 2. When URL search has no theme param or theme=dark, data-theme is removed (dark stays default)
    applyTheme("");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();

    applyTheme("?theme=dark");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();

    applyTheme("?site=mock_site");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();

    // 3. Hash query param fallback works
    applyTheme("", { theme: "light" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("light.css contains no prefers-color-scheme media query (dark stays default per FD-002)", () => {
    const raw = readStyle("light.css");
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(raw).not.toMatch(/TODO\((decision|verify)\)/);
  });

  it("light.css defines PRINT tokens and print neutrals with verified contrast and no brand orange (FD-061)", () => {
    const css = readStyle("light.css");
    // Overrides token names
    expect(css).toMatch(/--surface-0\s*:\s*#FFFFFF/i);
    expect(css).toMatch(/--fg-1\s*:\s*var\(--print-text\)/);
    expect(css).toMatch(/--accent\s*:\s*var\(--print-text\)/);
    // Verified print contrast values
    expect(contrast("#111827", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // print-text on surface-0
    expect(contrast("#4B5563", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // secondary text on surface-0
    expect(contrast("#0E7A4F", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // nominal on white
    expect(contrast("#9A5B00", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // caution on white
    expect(contrast("#B42318", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // warning on white
  });
});

describe("package 35 review route scope", () => {
  beforeEach(installDom);
  afterEach(removeDom);
  it("leaves other OPS routes dark when a light planner parameter remains in the URL", () => {
    applyTheme("?theme=light", undefined, true);
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("?theme=light", undefined, false);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("light theme review regressions", () => {
  beforeEach(installDom);
  afterEach(removeDom);

  function styles(mode: string): CSSStyleDeclaration {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.mode = mode;
    const sheet = document.createElement("style");
    sheet.textContent = ":root { --print-text: #111827; }" + readStyle("light.css");
    document.head.append(sheet);
    return getComputedStyle(document.documentElement);
  }

  it.each(["hud", "brief", "print"])("does not remap the %s palette", mode => {
    expect(styles(mode).getPropertyValue("--surface-0")).toBe("");
  });

  it("control boundaries use a PRINT colour with at least 3:1 on both light surfaces", () => {
    expect(styles("ops").getPropertyValue("--control-edge").trim()).toBe("#111827");
    for (const surface of ["#FFFFFF", "#F3F4F6"]) expect(contrast("#111827", surface)).toBeGreaterThanOrEqual(3);
  });

  it("keeps status patterns and uses legible ink on the PRINT status fills", () => {
    const css = readStyle("light.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/background-image\s*:\s*none/);
    for (const fill of ["#0E7A4F", "#9A5B00", "#B42318", "#1D4ED8", "#6D28D9"])
      expect(contrast("#FFFFFF", fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("T13.07 coach marks dismiss and keyboard ownership", () => {
  beforeEach(installDom);
  afterEach(removeDom);

  async function coach() {
    const { CoachMarks } = await import("../../src/ui/coachMarks");
    const { createElement } = await import("react");
    const before = document.createElement("button");
    before.textContent = "Previous focus";
    document.body.append(before);
    before.focus();
    const onDismiss = vi.fn();
    const mounted = await mount(createElement(CoachMarks, { onDismiss }));
    return { ...mounted, before, onDismiss, CoachMarks, createElement };
  }

  it("coach marks dismiss: exactly three steps, focus returns and dismissal survives remount in memory", async () => {
    const c = await coach();
    const titles = ["Turn on Slope", "Click a POI → Add as stop", "Open Briefing"];
    for (const title of titles) {
      expect(c.container.querySelector("h3")?.textContent).toBe(title);
      expect(c.container.contains(document.activeElement)).toBe(true);
      await click(c.container.querySelector('[data-action="next"]')!);
    }
    expect(c.container.textContent).toBe("");
    expect(document.activeElement).toBe(c.before);
    expect(c.onDismiss).toHaveBeenCalledTimes(1);
    await c.unmount();
    const again = await mount(c.createElement(c.CoachMarks));
    expect(again.container.textContent).toBe("");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    await again.unmount();
  });

  it("Escape dismisses once and releases its handler so other controls keep Escape", async () => {
    const c = await coach();
    await keyDown(document.activeElement!, "Escape");
    expect(c.container.textContent).toBe("");
    expect(document.activeElement).toBe(c.before);
    await keyDown(c.before, "Escape");
    expect(c.onDismiss).toHaveBeenCalledTimes(1);
    await c.unmount();
  });

  it("coach mark counter carries provenance and text describes the real POI action", async () => {
    const c = await coach();
    const counter = c.container.querySelector(".coach-mark-step-counter")!;
    expect(counter.getAttribute("data-provenance")).toBe("derived");
    expect(counter.getAttribute("data-source")).toBeTruthy();
    await click(c.container.querySelector('[data-action="next"]')!);
    expect(c.container.textContent).not.toContain("press A");
    await click(c.container.querySelector('[data-action="dismiss"]')!);
    expect(c.container.textContent).toBe("");
    await c.unmount();
  });

  it("anchors to the visible drawer toggle when Layers is hidden and follows drawer changes", async () => {
    const tab = document.createElement("button");
    tab.id = "scr02-left-tab-layers";
    const toggle = document.createElement("button");
    toggle.dataset.slot = "drawer-toggle";
    toggle.dataset.for = "left";
    document.body.append(tab, toggle);
    let visible = false;
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
    tab.getBoundingClientRect = () => visible ? rect(20, 90, 100, 32) : rect(0, 0, 0, 0);
    toggle.getBoundingClientRect = () => rect(100, 40, 100, 32);
    const c = await coach();
    expect((c.container.firstChild as HTMLElement).style.top).toBe("84px");
    visible = true;
    await c.rerender(c.createElement(c.CoachMarks, { onDismiss: c.onDismiss }));
    expect((c.container.firstChild as HTMLElement).style.top).toBe("134px");
    await c.unmount();
  });

  it("moves clear of an open one-drawer overlay so it never intercepts drawer controls", async () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 844 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 390 });
    try {
      const workspace = document.createElement("div");
      workspace.className = "scr02";
      workspace.dataset.layout = "one-drawer";
      const toggle = document.createElement("button");
      toggle.dataset.slot = "drawer-toggle";
      toggle.dataset.for = "left";
      const rightDrawer = document.createElement("aside");
      rightDrawer.dataset.drawer = "right";
      workspace.append(toggle, rightDrawer);
      document.body.append(workspace);

      const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
      toggle.getBoundingClientRect = () => rect(535, 2, 66, 44);
      rightDrawer.getBoundingClientRect = () => rect(524, 72, 320, 138);

      const { CoachMarks } = await import("../../src/ui/coachMarks");
      const { createElement } = await import("react");
      const c = await mount(createElement(CoachMarks));
      const popover = c.container.firstChild as HTMLElement;
      popover.getBoundingClientRect = () => {
        const left = parseFloat(popover.style.left || "0");
        const top = parseFloat(popover.style.top || "0");
        return rect(left, top, 320, 169);
      };
      await c.rerender(createElement(CoachMarks));
      const popLeft = parseFloat(popover.style.left);
      expect(popLeft + 320).toBeLessThanOrEqual(524);
      expect(popLeft).toBeGreaterThanOrEqual(12);
      await c.unmount();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
    }
  });

  it("yields pointer events when a narrow one-drawer screen leaves no non-overlapping space outside the top bar", async () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 740 });
    try {
      const workspace = document.createElement("div");
      workspace.className = "scr02";
      workspace.dataset.layout = "one-drawer";
      const topBar = document.createElement("header");
      topBar.className = "scr02-top-bar";
      const toggle = document.createElement("button");
      toggle.dataset.slot = "drawer-toggle";
      toggle.dataset.for = "left";
      topBar.append(toggle);
      const rightDrawer = document.createElement("aside");
      rightDrawer.dataset.drawer = "right";
      workspace.append(topBar, rightDrawer);
      document.body.append(workspace);

      const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
      topBar.getBoundingClientRect = () => rect(0, 0, 360, 152);
      toggle.getBoundingClientRect = () => rect(12, 50, 96, 44);
      rightDrawer.getBoundingClientRect = () => rect(40, 180, 320, 530);

      const { CoachMarks } = await import("../../src/ui/coachMarks");
      const { createElement } = await import("react");
      const c = await mount(createElement(CoachMarks));
      const popover = c.container.firstChild as HTMLElement;
      popover.getBoundingClientRect = () => {
        const left = parseFloat(popover.style.left || "0");
        const top = parseFloat(popover.style.top || "0");
        return rect(left, top, 320, 150);
      };
      await c.rerender(createElement(CoachMarks));
      expect(popover.style.pointerEvents).toBe("none");
      expect(popover.style.visibility).toBe("hidden");
      await c.unmount();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
    }
  });

  it("uses existing anchors, remains available on small screens and obeys pointer targets", async () => {
    const { COACH_MARK_STEPS } = await import("../../src/ui/coachMarks");
    expect(COACH_MARK_STEPS.map(step => step.anchorSelector)).toEqual([
      "#scr02-left-tab-layers", '[data-slot="map-host"]', '[data-slot="briefing"]',
    ]);
    const css = readFileSync(join(STYLES_DIR, "../screens/scr02MapWorkspace.css"), "utf8");
    const coachCss = css.slice(css.indexOf("/* First-run coach marks"));
    expect(coachCss).not.toMatch(/display:\s*none/);
    expect(coachCss).not.toMatch(/min-height:\s*auto/);
  });
});

const SITE = mockManifest();
function savedPlan(overrides: Partial<PlanExport> = {}): PlanExport {
  return { ...exportPlan(SITE, stateOf({ result: resultOf({ legs: [] }) })), ...overrides };
}

describe("T18.07 persist restore", () => {
  beforeEach(installDom);
  afterEach(() => { vi.restoreAllMocks(); removeDom(); });

  it("persist restore: saves a PlanExport, restores inputs only, and ignores stored results", () => {
    const plan = savedPlan();
    saveLastPlan(plan);
    expect(JSON.parse(window.localStorage.getItem(LAST_PLAN_STORAGE_KEY)!)).toEqual(plan);
    expect(restoreLastPlan(SITE)).toEqual({ scenario: plan.scenario, waypoints: plan.waypoints });
  });

  it.each([
    { site_id: "another-site" }, { data_version: "another-version" },
    { export_schema_version: "2.0.0" }, { export_schema_version: "1.invalid" },
    { scenario: {} }, { scenario: { ...SCENARIO, loop: "yes" } },
    { scenario: { ...SCENARIO, max_eva_duration_h: 99 } },
    { waypoints: [WAYPOINTS[0], null] },
    { waypoints: [WAYPOINTS[0], { ...WAYPOINTS[1], id: "wp-0" }] },
    { waypoints: [WAYPOINTS[0], { ...WAYPOINTS[1], role: "invalid" }] },
    { waypoints: [WAYPOINTS[0], { ...WAYPOINTS[1], x_m: "100" }] },
  ])("rejects and removes mismatched or malformed persisted inputs: %j", patch => {
    window.localStorage.setItem(LAST_PLAN_STORAGE_KEY, JSON.stringify({ ...savedPlan(), ...patch }));
    expect(restoreLastPlan(SITE)).toBeNull();
    expect(window.localStorage.getItem(LAST_PLAN_STORAGE_KEY)).toBeNull();
  });

  it("corrupt JSON and blocked storage never prevent planner use", () => {
    window.localStorage.setItem(LAST_PLAN_STORAGE_KEY, "{broken");
    expect(restoreLastPlan(SITE)).toBeNull();
    const proto = Object.getPrototypeOf(window.localStorage);
    for (const method of ["getItem", "setItem", "removeItem"]) vi.spyOn(proto, method).mockImplementation(() => { throw new Error("storage blocked"); });
    expect(() => saveLastPlan(savedPlan())).not.toThrow();
    expect(restoreLastPlan(SITE)).toBeNull();
  });

  it("planner startup restores inputs and recomputes once, never showing the stored result", async () => {
    const plan = savedPlan();
    saveLastPlan(plan);
    const requests: Omit<ComputePlanRequest, "type">[] = [];
    const store = createPlanStore({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [WAYPOINTS[0]!] }, {
      siteId: SITE.site_id, dataVersion: SITE.data_version,
      workerClient: { computePlan: req => { requests.push(req); return new Promise(() => {}); }, retry() {}, isCrashed: () => false },
    });
    expect(store.get().scenario).toEqual(plan.scenario);
    expect(store.get().waypoints).toEqual(plan.waypoints);
    expect(store.get().result).toBeNull();
    expect(store.get().status).toBe("Computing");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.scenario).toEqual(plan.scenario);
  });

  it("only the latest successful computed revision is saved; a supplied plan is not overwritten on startup", async () => {
    saveLastPlan(savedPlan({ scenario: { ...SCENARIO, loop: true } }));
    const calls: { req: Omit<ComputePlanRequest, "type">; resolve: (value: PlanResultMessage) => void }[] = [];
    const store = createPlanStore({ scenario: SCENARIO, waypoints: WAYPOINTS }, {
      siteId: SITE.site_id, dataVersion: SITE.data_version,
      workerClient: { computePlan: req => new Promise(resolve => calls.push({ req, resolve })), retry() {}, isCrashed: () => false },
    });
    expect(store.get().scenario.loop).toBe(false);
    store.moveWaypoint("wp-1", 200, 200);
    store.moveWaypoint("wp-1", 300, 300);
    const reply = (i: number) => ({ type: "PLAN_RESULT", request_id: calls[i]!.req.request_id, plan_revision: calls[i]!.req.plan_revision, ...resultOf({ legs: [] }) }) as PlanResultMessage;
    calls[1]!.resolve(reply(1));
    await Promise.resolve();
    expect(restoreLastPlan(SITE)?.waypoints[1]?.x_m).toBe(300);
    calls[0]!.resolve(reply(0));
    await Promise.resolve();
    expect(restoreLastPlan(SITE)?.waypoints[1]?.x_m).toBe(300);
  });
});

describe("T18.03/T18.06 unavailable backend displays", () => {
  beforeEach(installDom);
  afterEach(removeDom);

  it("SCR-07 seasonal context stays unavailable while N-24 is missing", async () => {
    const { createElement } = await import("react");
    const { Conditions } = await import("../../src/ui/screens/scr07Conditions");
    const { fakePlanStore } = await import("./planStoreFake");
    const { mockLoadedSite } = await import("./map/mapFixtures");
    const ctx = { site: mockLoadedSite(), planStore: fakePlanStore().store, workerClient: {} as never, debug: false };
    const c = await mount(createElement(Conditions, { ctx }));
    const missing = c.container.querySelector('[data-condition="seasonal-weather"] [data-unavailable="true"]');
    expect(missing?.textContent).toBe("—");
    expect(missing?.getAttribute("data-source")).toBe("unavailable:N-24");
    expect(missing?.getAttribute("data-provenance")).toBe("derived");
    expect(c.container.textContent).toContain("Not included in this build");
    await c.unmount();
  });

  it("SCR-05/SCR-08 O₂ placeholders stay illustrative and carry unavailable provenance", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { RouteResults } = await import("../../src/ui/screens/scr05RouteResults");
    const { BriefingCard } = await import("../../src/ui/screens/scr08BriefingCard");
    const { fakePlanStore } = await import("./planStoreFake");
    const { mockLoadedSite } = await import("./map/mapFixtures");
    const site = mockLoadedSite();
    const planStore = fakePlanStore({ result: resultOf({ legs: [] }) }).store;
    const ctx = { site, planStore, workerClient: {} as never, debug: false };
    const results = await mount(createElement(RouteResults, { site, planStore }));
    await click(results.container.querySelector('[aria-label="Show per-leg details"]') ?? results.container.querySelector('.scr05-details-toggle')!);
    const briefing = document.createElement("div");
    briefing.innerHTML = renderToStaticMarkup(createElement(BriefingCard, { ctx }));
    for (const surface of [results.container, briefing]) {
      expect(surface.textContent).toContain("O₂ rate (illustrative)");
      const missing = surface.querySelector('[data-source="unavailable:compute.o2LitresPerMinute"][data-unavailable="true"]');
      expect(missing?.textContent).toBe("—");
      expect(missing?.getAttribute("data-provenance")).toBe("modelled");
    }
    await results.unmount();
  });
});
