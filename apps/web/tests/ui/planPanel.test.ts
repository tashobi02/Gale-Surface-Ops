/**
 * T08.04, T08.12 — SCR-04 plan panel (03 SCR-04, §C.3, §D; 02 §E.3; 01 FR-05, FR-06, FR-15, FR-39; FD-042, FD-113, FD-114, FD-115).
 * The real PlanPanel is mounted on the real plan store (fake worker). A change reaches the worker 300 ms after the last edit, an
 * invalid value never does, and the field keeps its last valid value. Ranges are 02 §E.3's, checked by `validatePlanInput` in
 * @marswalk/compute; the tests state them as the spec does (inclusive at both ends).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { localTrueSolarTime } from "@marswalk/compute";
import type { AppContext, WorkerClient } from "../../src/ui/context";
import { PlanPanel, fetchSessionSummary, type SessionSummary } from "../../src/ui/screens/scr04PlanPanel";
import { projectedToLatLonE, registerMarsProjection } from "../../src/ui/map/projection";
import { DEFAULT_SCENARIO, SCENARIO_DEBOUNCE_MS } from "../../src/state/planStore";
import { click, installDom, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";
import { START, START_UTC, STOP_FREE, STOP_POI, realPlan, type RealPlan } from "./realPlanStore";

beforeAll(() => installDom());
afterAll(() => removeDom());
beforeEach(() => vi.useFakeTimers());

const SITE = mockLoadedSite();
const open: Mounted[] = [];
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const noSession = (): Promise<SessionSummary | null> => Promise.resolve(null);

async function panel(plan: RealPlan, fetchSession: () => Promise<SessionSummary | null> = noSession): Promise<HTMLElement> {
  const ctx: AppContext = { site: SITE, planStore: plan.store, workerClient: {} as WorkerClient, debug: false };
  const m = await mountRaw(createElement(PlanPanel, { ctx, fetchSession }));
  open.push(m);
  return must(m.container, '[data-slot="plan-panel"]');
}

const field = (root: HTMLElement, key: string): HTMLElement => must(root, `[data-field="${key}"]`);
const input = (root: HTMLElement, key: string): HTMLInputElement => must<HTMLInputElement>(field(root, key), "input");

/** Type into a React-controlled input: the native setter, then the `input` event. */
async function type(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    set.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function blur(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.focus();
    el.blur();
  });
}
const wait = (ms: number): Promise<void> => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const alertOf = (root: HTMLElement, key: string): HTMLElement | null => field(root, key).querySelector('[role="alert"]');
const withStops = (): RealPlan => realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });

/** 02 §E.3 ranges, inclusive at both ends. `bad` values are rejected, `good` values are sent. */
const RULES: { rule: string; key: keyof typeof DEFAULT_SCENARIO; label: RegExp; bad: string[]; good: [string, unknown][] }[] = [
  { rule: "eva_start_utc is ISO-8601 UTC in 2000-2100", key: "eva_start_utc", label: /start/i, bad: ["tomorrow", "2026-11-14 08:00", "1999-12-31T23:59:59Z", "2101-01-01T00:00:00Z", ""], good: [["2000-01-01T00:00:00Z", "2000-01-01T00:00:00Z"], ["2100-12-31T23:59:59Z", "2100-12-31T23:59:59Z"]] },
  { rule: "max_eva_duration_h is 0.5 to 10", key: "max_eva_duration_h", label: /duration/i, bad: ["0.49", "10.01", "abc", ""], good: [["0.5", 0.5], ["10", 10]] },
  { rule: "dwell_min_per_stop is 0 to 180", key: "dwell_min_per_stop", label: /dwell/i, bad: ["-1", "180.5", "x"], good: [["0", 0], ["180", 180]] },
  { rule: "hard_slope_limit_deg is 5 to 35 and above the caution slope", key: "hard_slope_limit_deg", label: /hard slope/i, bad: ["4.9", "35.1", "10", "9"], good: [["10.5", 10.5], ["35", 35]] },
  { rule: "caution_slope_deg is 2 to 30 and below the hard limit", key: "caution_slope_deg", label: /caution slope|hard slope/i, bad: ["1.9", "30.1", "15", "16"], good: [["2", 2], ["14.9", 14.9]] },
  { rule: "walkback_limit_km is 0.5 to 20", key: "walkback_limit_km", label: /walkback/i, bad: ["0.49", "20.1"], good: [["0.5", 0.5], ["20", 20]] },
  { rule: "suited_flat_speed_kmh is 0.5 to 6", key: "suited_flat_speed_kmh", label: /speed/i, bad: ["0.49", "6.1"], good: [["0.5", 0.5], ["6", 6]] },
  { rule: "max_haven_min is 5 to 120", key: "max_haven_min", label: /haven/i, bad: ["4.9", "120.1"], good: [["5", 5], ["120", 120]] },
];

describe("PlanPanel inputs, one test per 02 §E.3 rule (03 SCR-04 Validation)", () => {
  it.each(RULES)("$rule: an out-of-range value shows its range inline and is never sent", async ({ key, label, bad }) => {
    const plan = withStops();
    const root = await panel(plan);
    const before = plan.store.get().scenario[key];
    for (const value of bad) {
      await type(input(root, key), value);
      const alert = alertOf(root, key);
      expect(alert, `${key}=${JSON.stringify(value)} shows an error`).not.toBeNull();
      expect(alert!.textContent).toMatch(label);
      expect(input(root, key).getAttribute("aria-invalid")).toBe("true");
    }
    await wait(SCENARIO_DEBOUNCE_MS * 3);
    expect(plan.calls).toHaveLength(0);
    expect(plan.store.get().scenario[key]).toBe(before);
  });

  it.each(RULES)("$rule: both ends are accepted (inclusive) and reach the worker once", async ({ key, good }) => {
    for (const [text, expected] of good) {
      const plan = withStops();
      const root = await panel(plan);
      await type(input(root, key), text);
      expect(alertOf(root, key), `${key}=${text}`).toBeNull();
      await wait(SCENARIO_DEBOUNCE_MS);
      expect(plan.calls).toHaveLength(1);
      expect(plan.calls[0]!.req.scenario[key]).toBe(expected);
      await open.pop()!.unmount();
    }
  });

  it("solar phase is max or min: the radio group sends exactly those", async () => {
    const plan = withStops();
    const root = await panel(plan);
    const radios = [...field(root, "solar_phase").querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((r) => r.textContent!.trim().toLowerCase())).toEqual(["max", "min"]);
    await click(radios[1]!);
    await wait(SCENARIO_DEBOUNCE_MS);
    expect(plan.calls.at(-1)!.req.scenario.solar_phase).toBe("min");
    expect(radios[1]!.getAttribute("aria-checked")).toBe("true");
  });

  it("loop is a switch with its word, and it recomputes", async () => {
    const plan = withStops();
    const root = await panel(plan);
    const sw = must(field(root, "loop"), '[role="switch"]');
    const was = plan.store.get().scenario.loop;
    await click(sw);
    await wait(SCENARIO_DEBOUNCE_MS);
    expect(plan.calls.at(-1)!.req.scenario.loop).toBe(!was);
    expect(sw.textContent).toMatch(was ? /off/i : /on/i);
  });

  it("waypoints are 2 to 11 (a start and at most 10 stops): at the limit the list says no more can be added", async () => {
    const stops = Array.from({ length: 10 }, (_, i) => ({ id: `wp-${i + 1}`, role: "stop" as const, x_m: i * 10, y_m: 0 }));
    const root = await panel(realPlan({ waypoints: [START, ...stops] }));
    expect(must(root, '[data-slot="stops-limit"]').textContent).toMatch(/limit/i);
    const roomy = await panel(withStops());
    expect(roomy.querySelector('[data-slot="stops-limit"]')).toBeNull();
  });
});

describe("PlanPanel recompute rules (03 §C.3)", () => {
  it("debounce 300 ms: one COMPUTE_PLAN 300 ms after the last edit, none before", async () => {
    const plan = withStops();
    const root = await panel(plan);
    await type(input(root, "dwell_min_per_stop"), "30");
    await wait(SCENARIO_DEBOUNCE_MS - 1);
    expect(plan.calls).toHaveLength(0);
    await type(input(root, "dwell_min_per_stop"), "35");
    await wait(SCENARIO_DEBOUNCE_MS - 1);
    expect(plan.calls).toHaveLength(0);
    await wait(1);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]!.req.scenario.dwell_min_per_stop).toBe(35);
  });

  it("invalid keeps last valid: the field text returns to the last valid value on blur, the error stays, nothing is sent", async () => {
    const plan = withStops();
    const root = await panel(plan);
    const el = input(root, "max_eva_duration_h");
    const valid = el.value;
    await type(el, "-1");
    await blur(el);
    expect(el.value).toBe(valid);
    expect(alertOf(root, "max_eva_duration_h")!.textContent).toMatch(/duration/i);
    await wait(SCENARIO_DEBOUNCE_MS * 2);
    expect(plan.calls).toHaveLength(0);
    expect(plan.store.get().scenario.max_eva_duration_h).toBe(DEFAULT_SCENARIO.max_eva_duration_h);
  });

  it("a valid value after an invalid one clears the error", async () => {
    const plan = withStops();
    const root = await panel(plan);
    await type(input(root, "dwell_min_per_stop"), "999");
    expect(alertOf(root, "dwell_min_per_stop")).not.toBeNull();
    await type(input(root, "dwell_min_per_stop"), "30");
    expect(alertOf(root, "dwell_min_per_stop")).toBeNull();
    expect(input(root, "dwell_min_per_stop").getAttribute("aria-invalid")).toBeNull();
  });

  it("the error message gives the allowed range with its source, assumed", async () => {
    const root = await panel(withStops());
    await type(input(root, "walkback_limit_km"), "99");
    const range = must(alertOf(root, "walkback_limit_km")!, "[data-source]");
    expect(range.getAttribute("data-provenance")).toBe("assumed");
    expect(range.getAttribute("data-source")).toBe("spec:02-E.3");
    expect(range.textContent).toContain("0.5");
    expect(range.textContent).toContain("20");
  });
});

describe("PlanPanel start time (FD-042, FD-113)", () => {
  it("start empty without hab core: the field is empty and says to set a start time; nothing is computed", async () => {
    const plan = realPlan({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [START, STOP_POI] });
    const root = await panel(plan, () => Promise.reject(new Error("offline")));
    expect(input(root, "eva_start_utc").value).toBe("");
    expect(must(root, '[data-slot="start-required"]').textContent).toBe("Invalid input — set a start time");
    expect(root.getAttribute("data-plan-state")).toBe("invalid");
    await wait(SCENARIO_DEBOUNCE_MS * 2);
    expect(plan.calls).toHaveLength(0);
  });

  it("start default from hab core: the scenario's eva_start_utc from GET /api/session fills the empty field and computes", async () => {
    const plan = realPlan({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [START, STOP_POI] });
    const root = await panel(plan, () => Promise.resolve({ eva_start_utc: "2026-11-14T09:30:00Z" }));
    expect(input(root, "eva_start_utc").value).toBe("2026-11-14T09:30:00Z");
    expect(input(root, "eva_start_utc").getAttribute("data-source")).toBe("session.eva_start_utc");
    expect(input(root, "eva_start_utc").getAttribute("data-provenance")).toBe("assumed");
    await wait(SCENARIO_DEBOUNCE_MS);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]!.req.scenario.eva_start_utc).toBe("2026-11-14T09:30:00Z");
    expect(root.querySelector('[data-slot="start-required"]')).toBeNull();
  });

  it("a session start never replaces a start already set, and an invalid session value is ignored", async () => {
    const set = await panel(withStops(), () => Promise.resolve({ eva_start_utc: "2026-12-01T00:00:00Z" }));
    expect(input(set, "eva_start_utc").value).toBe(START_UTC);
    const plan = realPlan({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [START] });
    const root = await panel(plan, () => Promise.resolve({ eva_start_utc: "soon" }));
    expect(input(root, "eva_start_utc").value).toBe("");
  });

  // The Hab Core's answer is a default for an empty field, never an edit of a field the user is in. Playwright's fill (and a person)
  // focuses the field, then types; a default that lands in between puts its text in the field with the caret after it, and the typed
  // start is appended to it ("2024-05-20T00:00:00Z2026-11-14T08:00:00Z": invalid, for good). T32.26-T32.28 (flaky package-25 checks).
  describe("a session start that arrives while the user is in the field", () => {
    const SESSION_START = "2024-05-20T00:00:00Z";
    async function inFieldWhenSessionAnswers(plan: RealPlan): Promise<{ root: HTMLElement; start: HTMLInputElement; deliver: () => Promise<void> }> {
      let answer!: (summary: SessionSummary) => void;
      const root = await panel(plan, () => new Promise<SessionSummary | null>((resolve) => (answer = resolve)));
      const start = input(root, "eva_start_utc");
      await act(async () => {
        start.focus();
        start.select();
      });
      return { root, start, deliver: () => act(async () => answer({ eva_start_utc: SESSION_START })) };
    }

    it("is not written into the focused field: what the user types is the whole value", async () => {
      const plan = realPlan({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [START, STOP_POI] });
      const { root, start, deliver } = await inFieldWhenSessionAnswers(plan);
      await deliver();
      expect(start.value).toBe("");
      expect(plan.store.get().scenario.eva_start_utc).toBe("");
      await type(start, START_UTC);
      expect(start.value).toBe(START_UTC);
      expect(root.getAttribute("data-plan-state")).not.toBe("invalid");
      await blur(start);
      expect(start.value).toBe(START_UTC);
      expect(plan.store.get().scenario.eva_start_utc).toBe(START_UTC);
      expect(start.getAttribute("data-source")).toBe("user:scenario.eva_start_utc");
    });

    it("waits for the user to leave the field, then fills it when it is still empty", async () => {
      const plan = realPlan({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [START, STOP_POI] });
      const { root, start, deliver } = await inFieldWhenSessionAnswers(plan);
      await deliver();
      expect(start.value).toBe("");
      await blur(start);
      expect(start.value).toBe(SESSION_START);
      expect(start.getAttribute("data-source")).toBe("session.eva_start_utc");
      expect(plan.store.get().scenario.eva_start_utc).toBe(SESSION_START);
      expect(root.querySelector('[data-slot="start-required"]')).toBeNull();
    });

    it("is dropped, not applied later, once the user has set a start of their own", async () => {
      const plan = realPlan({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [START, STOP_POI] });
      const { start, deliver } = await inFieldWhenSessionAnswers(plan);
      await type(start, START_UTC);
      await deliver();
      await blur(start);
      await type(start, "");
      await blur(start);
      expect(plan.store.get().scenario.eva_start_utc).toBe(START_UTC);
    });
  });

  it("the start is entered in UTC and previews LTST at the start waypoint, modelled from Mars24 (FD-113)", async () => {
    const root = await panel(withStops());
    const ltst = must(root, '[data-slot="start-ltst"]');
    registerMarsProjection(SITE.site);
    const lon = projectedToLatLonE(SITE.site, START.x_m, START.y_m).lon_e;
    const expected = localTrueSolarTime(new Date(START_UTC), lon);
    expect(ltst.textContent).toContain(expected);
    expect(ltst.getAttribute("data-provenance")).toBe("modelled");
    expect(ltst.getAttribute("data-source")).toBe("mars24-allison-mcewen-2000");
    expect(field(root, "eva_start_utc").textContent).toMatch(/UTC/);
  });

  it("the LTST preview is the dash, flagged unavailable, while the start is empty or invalid", async () => {
    const plan = realPlan({ scenario: { ...DEFAULT_SCENARIO }, waypoints: [START] });
    const root = await panel(plan);
    expect(must(root, '[data-slot="start-ltst"]').textContent).toBe("—");
    expect(must(root, '[data-slot="start-ltst"]').getAttribute("data-unavailable")).toBe("true");
  });
});

describe("PlanPanel haven rule, crew and vehicle (T08.12; 05 MissionScenario; FR-39)", () => {
  it("haven rule input: max_haven_min reaches the worker with the vehicle and crew inputs", async () => {
    const plan = withStops();
    const root = await panel(plan);
    expect(input(root, "max_haven_min").value).toBe(String(DEFAULT_SCENARIO.max_haven_min));
    await type(input(root, "max_haven_min"), "45");
    await click([...field(root, "crew_count").querySelectorAll<HTMLElement>('[role="radio"]')][0]!);
    await click(must(field(root, "vehicle_available"), '[role="switch"]'));
    await wait(SCENARIO_DEBOUNCE_MS);
    const sent = plan.calls.at(-1)!.req.scenario;
    expect(sent.max_haven_min).toBe(45);
    expect(sent.crew_count).toBe(1);
    expect(sent.vehicle_available).toBe(!DEFAULT_SCENARIO.vehicle_available);
  });

  it("crew count offers 1 and 2 only", async () => {
    const root = await panel(withStops());
    expect([...field(root, "crew_count").querySelectorAll('[role="radio"]')].map((r) => r.textContent!.trim())).toEqual(["1", "2"]);
  });
});

describe("PlanPanel defaults and provenance (01 FR-05, FR-15; FD-114)", () => {
  it("shows the Defaults are assumptions badge", async () => {
    const root = await panel(withStops());
    expect(must(root, '[data-slot="defaults-badge"]').textContent).toBe("Defaults are assumptions — not flight rules.");
  });

  it("every input value is assumed with source scenario.<field>; an edit makes the source user:scenario.<field>", async () => {
    const root = await panel(withStops());
    expect(input(root, "dwell_min_per_stop").getAttribute("data-provenance")).toBe("assumed");
    expect(input(root, "dwell_min_per_stop").getAttribute("data-source")).toBe("scenario.dwell_min_per_stop");
    await type(input(root, "dwell_min_per_stop"), "30");
    expect(input(root, "dwell_min_per_stop").getAttribute("data-source")).toBe("user:scenario.dwell_min_per_stop");
    expect(input(root, "walkback_limit_km").getAttribute("data-source")).toBe("scenario.walkback_limit_km");
    for (const f of root.querySelectorAll<HTMLElement>("[data-field]")) {
      const shown = f.querySelector("[data-provenance][data-source]");
      expect(shown, f.getAttribute("data-field")!).not.toBeNull();
    }
  });

  it("Reset defaults restores every field to its default, keeps the start time, and returns the sources to scenario.<field>", async () => {
    const plan = withStops();
    const root = await panel(plan);
    await type(input(root, "dwell_min_per_stop"), "30");
    await wait(SCENARIO_DEBOUNCE_MS);
    await click(must(root, '[data-action="reset-defaults"]'));
    await wait(SCENARIO_DEBOUNCE_MS);
    expect(plan.store.get().scenario).toEqual({ ...DEFAULT_SCENARIO, eva_start_utc: START_UTC });
    expect(input(root, "dwell_min_per_stop").value).toBe(String(DEFAULT_SCENARIO.dwell_min_per_stop));
    expect(input(root, "dwell_min_per_stop").getAttribute("data-source")).toBe("scenario.dwell_min_per_stop");
  });

  it("Reset defaults clears an invalid entry's error", async () => {
    const root = await panel(withStops());
    await type(input(root, "dwell_min_per_stop"), "999");
    await click(must(root, '[data-action="reset-defaults"]'));
    expect(alertOf(root, "dwell_min_per_stop")).toBeNull();
  });
});

describe("PlanPanel states (03 SCR-04: Empty, Editing, Invalid input, Computing)", () => {
  const state = (root: HTMLElement): string | null => root.getAttribute("data-plan-state");

  it("Empty: only the start", async () => {
    expect(state(await panel(realPlan()))).toBe("empty");
  });

  it("Editing: stops and a result", async () => {
    const plan = withStops();
    const root = await panel(plan);
    await type(input(root, "dwell_min_per_stop"), "30");
    await wait(SCENARIO_DEBOUNCE_MS);
    plan.answer();
    await wait(0);
    expect(state(root)).toBe("editing");
  });

  it("Invalid input: an error is showing", async () => {
    const root = await panel(withStops());
    await type(input(root, "dwell_min_per_stop"), "999");
    expect(state(root)).toBe("invalid");
  });

  it("Computing: the store is computing the latest edit", async () => {
    const plan = withStops();
    const root = await panel(plan);
    await type(input(root, "dwell_min_per_stop"), "30");
    expect(state(root)).toBe("computing");
  });
});

describe("PlanPanel layout (04 §B)", () => {
  it("the inputs sit in a Constraints accordion that collapses after the first edit once focus leaves it; the stops list stays open", async () => {
    const plan = withStops();
    const root = await panel(plan);
    const toggle = must(root, '[data-action="toggle-constraints"]');
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("Constraints");
    await type(input(root, "dwell_min_per_stop"), "30");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await blur(input(root, "dwell_min_per_stop"));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector('[data-slot="constraints-body"]')).toBeNull();
    expect(must(root, '[data-slot="stops-list"]')).toBeTruthy();
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("every field has a visible label tied to its input, and the unit beside it", async () => {
    const root = await panel(withStops());
    for (const f of root.querySelectorAll<HTMLElement>("[data-field] input:not([type=radio])")) {
      const label = root.querySelector(`label[for="${f.id}"]`);
      expect(label, f.id).not.toBeNull();
    }
    expect(must(field(root, "max_eva_duration_h"), ".scr04-unit").textContent).toBe("h");
  });

  it("an invalid message from the recompute is not hidden: the Notice component is a polite status region", async () => {
    const root = await panel(withStops());
    const notice = must(root, '[data-slot="notice"]');
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.getAttribute("aria-live")).toBe("polite");
  });
});

describe("fetchSessionSummary against the merged Hab Core (N-05; FD-042, FD-239)", () => {
  const answer = (routes: Record<string, unknown>) => {
    const calls: string[] = [];
    (globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
      calls.push(url);
      return url in routes ? { ok: true, json: async () => routes[url] } : { ok: false, json: async () => ({}) };
    };
    return calls;
  };
  afterEach(() => {
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
  });

  it("reads the scenario's start from the published plan in GET api/session when the summary has none yet", async () => {
    answer({ "api/session/summary": { eva_start_utc: null }, "api/session": { plan: { scenario: { eva_start_utc: "2026-11-14T09:30:00Z" } } } });
    expect(await fetchSessionSummary()).toEqual({ eva_start_utc: "2026-11-14T09:30:00Z" });
  });

  it("uses the summary's eva_start_utc when it has one", async () => {
    const calls = answer({ "api/session/summary": { eva_start_utc: "2026-11-14T10:00:00Z" } });
    expect(await fetchSessionSummary()).toEqual({ eva_start_utc: "2026-11-14T10:00:00Z" });
    expect(calls).toEqual(["api/session/summary"]);
  });

  it("is null with no Hab Core, with no plan, or on a malformed body", async () => {
    answer({});
    expect(await fetchSessionSummary()).toBeNull();
    answer({ "api/session/summary": { eva_start_utc: null }, "api/session": { plan: null } });
    expect(await fetchSessionSummary()).toBeNull();
    answer({ "api/session/summary": 7, "api/session": { plan: { scenario: { eva_start_utc: 5 } } } });
    expect(await fetchSessionSummary()).toBeNull();
  });
});
