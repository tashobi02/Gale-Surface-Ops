/**
 * T12.02, T12.07 — DOM provenance sweep over the planner screens and the role views (01 FR-15, 02 NFR-05; FD-110, FD-217;
 * package 16).
 *
 * SCR-00, 01, 03, 04, 05, 06, 07, 08, 09 are mounted on the F4 site and the canned plan results (OK, over limits, partial,
 * empty); SCR-10 to SCR-14, SCR-17 and SCR-18 on the committed WS fixtures, one test per beat (the beats the browser
 * `provenance` check drives). SCR-02 is the one planner screen left out: its map canvas text is not in the DOM, and the
 * browser check covers its overlays. Each mounted view's text is walked: a text node with a digit must sit inside an
 * element that carries `data-provenance` and `data-source`, or inside an FD-110 identifier (`[data-identifier]`, the scale
 * line, the debug overlay). The allowlist is the browser check's own constant (`PROVENANCE_ALLOWLIST` in
 * `e2e/lib/provenance.ts`), so the two cannot drift. No element says "live" (FD-217): history is "replayed", crew state
 * "simulated".
 *
 * jsdom has no layout, so unlike the browser walk this one cannot skip what is not rendered; it skips only `hidden`
 * subtrees and so is the stricter of the two.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import type { Alert, ContingencyOption, PlanResult, ServerMessage, Snapshot } from "@marswalk/protocol";
import { isKnownSource, PROVENANCE_ALLOWLIST } from "../../e2e/lib/provenance";
import type { AppContext, BootProblem } from "../../src/ui/context";
import type { PlanState } from "../../src/state/planStore";
import { BootErrorScreen } from "../../src/ui/screens/scr00BootError";
import { MissionBriefing } from "../../src/ui/screens/scr01MissionBriefing";
import { LayersPanel, type PanelLayer } from "../../src/ui/screens/scr03LayersPanel";
import { PlanPanel } from "../../src/ui/screens/scr04PlanPanel";
import { RouteResults } from "../../src/ui/screens/scr05RouteResults";
import { PoiDetail } from "../../src/ui/screens/scr06PoiDetail";
import { Conditions } from "../../src/ui/screens/scr07Conditions";
import { BriefingCard } from "../../src/ui/screens/scr08BriefingCard";
import { SourcesMethods } from "../../src/ui/screens/scr09SourcesMethods";
import { Join } from "../../src/ui/screens/scr10Join";
import { OpsConsole } from "../../src/ui/screens/scr11OpsConsole";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { Hud } from "../../src/ui/screens/scr13Hud";
import { Options } from "../../src/ui/screens/scr14Options";
import { PostEvaReport } from "../../src/ui/screens/scr17PostEvaReport";
import { HabLinkLost } from "../../src/ui/screens/scr18HabLinkLost";
import { adaptPostEvaReport } from "../../src/ui/report/reportAdapter";
import { selectOpsProps } from "../../src/ui/ops/liveProps";
import { populatedReport } from "../fixtures/postEvaReport";
import { BEATS, wsFixtures, type Beat } from "../fixtures/ws";
import { storeFromBeat } from "./fixtureStore";
import { installDom, mount, removeDom } from "./domHarness";
import { fakePlanStore, SCENARIO } from "./planStoreFake";
import { mockLoadedSite } from "./map/mapFixtures";
import okFixture from "../fixtures/plan-results/ok.json";
import partialFixture from "../fixtures/plan-results/partial.json";
import overLimitsFixture from "../fixtures/plan-results/over-limits.json";

const PROVENANCE = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"];

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

/** Text nodes with a digit that are neither labelled nor identifiers (the browser walk of `e2e/lib/provenance.ts`). */
function unlabelledNumbers(root: HTMLElement): string[] {
  const skip = ["script", "style", "noscript", "title", ...PROVENANCE_ALLOWLIST].join(", ");
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    const el = node.parentElement;
    if (!text || !/\d/.test(text) || !el) continue;
    if (el.closest("[hidden]") || el.closest(skip)) continue;
    if (el.closest("[data-provenance][data-source]")) continue;
    const path: string[] = [];
    for (let n: Element | null = el; n && n !== root && path.length < 4; n = n.parentElement) {
      path.unshift(n.tagName.toLowerCase() + (n.classList.length ? `.${n.classList[0]}` : ""));
    }
    out.push(`"${text.slice(0, 40)}" (${path.join(" > ")})`);
  }
  return out;
}

/** Every `data-provenance` is one of the six classes and sits beside a non-empty source id. */
function labelProblems(root: HTMLElement): string[] {
  const problems: string[] = [];
  for (const el of root.querySelectorAll("[data-provenance]")) {
    const prov = el.getAttribute("data-provenance") ?? "";
    const tag = el.tagName.toLowerCase();
    if (!PROVENANCE.includes(prov)) problems.push(`class "${prov}" on ${tag}`);
    if (!el.getAttribute("data-source")) problems.push(`no source id on ${tag} (${prov})`);
  }
  return problems;
}

/**
 * FD-217: no UI copy says "live" (the visible text, `aria-label`, `title` and `placeholder` all count as copy). The only
 * phrases left alone are the two denials in the mandatory disclaimer, "not a live feed from Mars" and "never a live feed"
 * (01 §F.1; the briefing, SCR-09 and the plan export carry them word for word); anything else with the word fails.
 */
function liveWording(root: HTMLElement): string[] {
  const found: string[] = [];
  const word = /\blive\b/i;
  const text = (root.textContent ?? "").replace(/(?:not|never) a live feed(?: from Mars)?/gi, "");
  if (word.test(text)) found.push(`text: ${text.match(/.{0,30}\blive\b.{0,30}/i)?.[0] ?? "live"}`);
  for (const el of root.querySelectorAll("[aria-label], [title], [placeholder]")) {
    for (const attr of ["aria-label", "title", "placeholder"]) {
      const value = el.getAttribute(attr);
      if (value && word.test(value)) found.push(`${attr}: ${value}`);
    }
  }
  return found;
}

/** Mounts one view and asserts the three provenance rules on it. */
async function expectLabelled(element: ReactElement): Promise<void> {
  const { container, unmount } = await mount(element);
  expect(unlabelledNumbers(container), "unlabelled numbers").toEqual([]);
  expect(labelProblems(container), "label problems").toEqual([]);
  expect(liveWording(container), "wording that says live (FD-217)").toEqual([]);
  await unmount();
}

function snapshotOf(beat: Beat, role: "eva:EV1" | "eva:EV2" | "ops" = "eva:EV1"): Snapshot {
  const snapshot = storeFromBeat(beat, role).state();
  if (!snapshot) throw new Error(`no snapshot for beat ${beat}`);
  return snapshot;
}

/** The connect snapshot with the options (and their alert) the `options-proposed` and `radiation-alert` beats carry, as the Hab Core's snapshot would. */
function snapshotWithOptions(): Snapshot {
  const proposed = wsFixtures["options-proposed"].find((m): m is Extract<ServerMessage, { type: "EVENT" }> => m.type === "EVENT" && m.event.kind === "OPTIONS_PROPOSED");
  const raised = wsFixtures["radiation-alert"].find((m): m is Extract<ServerMessage, { type: "EVENT" }> => m.type === "EVENT" && m.event.kind === "ALERT_RAISED");
  if (!proposed || !raised) throw new Error("the fixture beats lost their events");
  const alert = { ...(raised.event.data as object), raised_seq: raised.event.seq, acked_seq: null, cleared_seq: null, acked_by: null } as Alert;
  return { ...snapshotOf("connect"), alerts: [alert], options: (proposed.event.data as { options: ContingencyOption[] }).options };
}

describe("provenance source kinds (T12.02, T12.07)", () => {
  it.each(["scenario.walkback_limit_km", "result.totals.distance_m", "manifest:mock_site", "user:task", "unavailable:result.radiation", "rule:limit", "proj:map", "pois:site"])('accepts the state source %s', (source) => {
    expect(isKnownSource(source, [])).toBe(true);
  });
  it("accepts only dataset ids in the manifest, including multi-dataset values", () => {
    expect(isKnownSource("dem model", ["dem", "model"])).toBe(true);
    expect(isKnownSource("dem unknown", ["dem", "model"])).toBe(false);
    expect(isKnownSource("", ["dem"])).toBe(false);
  });
  it("rejects an invented state path", () => {
    expect(isKnownSource("bogus:value", [])).toBe(false);
  });
});

describe("the sweep itself (a check that cannot fail checks nothing)", () => {
  it("finds a bare number, accepts a labelled one and an identifier, and finds the word live", async () => {
    const bare = await mount(createElement("p", null, "Haven 12 min"));
    expect(unlabelledNumbers(bare.container)).toHaveLength(1);
    await bare.unmount();
    const labelled = await mount(createElement("p", null,
      createElement("span", { "data-provenance": "modelled", "data-source": "snapshot:crew.haven.minutes" }, "12 min"),
      createElement("span", { "data-identifier": "" }, "EV1")));
    expect(unlabelledNumbers(labelled.container)).toEqual([]);
    expect(labelProblems(labelled.container)).toEqual([]);
    await labelled.unmount();
    const unsourced = await mount(createElement("p", { "data-provenance": "measured" }, "12 min"));
    expect(labelProblems(unsourced.container)).toHaveLength(1);
    await unsourced.unmount();
    const live = await mount(createElement("p", { "aria-label": "Live feed" }, "Live data"));
    expect(liveWording(live.container)).toHaveLength(2);
    await live.unmount();
    const denial = await mount(createElement("p", null, "on a simulated clock — not a live feed from Mars; never a live feed."));
    expect(liveWording(denial.container)).toEqual([]);
    await denial.unmount();
    const claim = await mount(createElement("p", null, "Live feed from Mars"));
    expect(liveWording(claim.container)).toHaveLength(1);
    await claim.unmount();
  });
});

const RESULTS: [string, PlanState["status"], PlanResult | null][] = [
  ["OK", "OK", okFixture as unknown as PlanResult],
  ["over limits", "OverLimits", overLimitsFixture as unknown as PlanResult],
  ["partial", "Partial", partialFixture as unknown as PlanResult],
  ["empty", "Empty", null],
];
const planCtx = (status: PlanState["status"], result: PlanResult | null): AppContext =>
  ({ site: mockLoadedSite(), planStore: fakePlanStore({ scenario: { ...SCENARIO, loop: true }, status, result }).store, workerClient: {} as never, debug: false });

describe("SCR-00 boot error", () => {
  it.each([
    ["a missing manifest", { code: "MANIFEST_NOT_FOUND", message: "Failed to fetch site manifest: sites/gale_boxwork/site-manifest.json (404 Not Found)", missingFile: "sites/gale_boxwork/site-manifest.json" }],
  ] as [string, BootProblem][])("%s", async (_name, problem) => {
    await expectLabelled(createElement(BootErrorScreen, { problem, onRetry: () => {} }));
  });
});

describe("SCR-01 mission briefing, SCR-03 layers, SCR-06 POI detail, SCR-09 sources and methods", () => {
  it("SCR-01 on the F4 site with no plan", async () => {
    await expectLabelled(createElement(MissionBriefing, { site: mockLoadedSite(), planStore: fakePlanStore({ status: "Empty" }).store, onNavigate: () => {} }));
  });
  it.each(RESULTS)("SCR-04 plan panel, %s", async (_name, status, result) => {
    await expectLabelled(createElement(PlanPanel, { ctx: planCtx(status, result), fetchSession: () => Promise.resolve(null) }));
  });
  it("SCR-03 with the scientific overlays on and off", async () => {
    const row = (id: string, over: Partial<PanelLayer> = {}): PanelLayer => ({ id, title: id, scientific: false, visible: false, opacity: 1, status: "ready", provenance: "derived", sourceIds: ["usgs-gale-dem-1m-v3"], nativeResolutionM: 1, legend: { type: "none" }, ...over });
    await expectLabelled(createElement(LayersPanel, { layers: [row("ortho", { visible: true }), row("slope", { scientific: true, visible: true }), row("elevation", { scientific: true }), row("traverse", { visible: true })], onVisibleChange: () => {}, onOpacityChange: () => {} }));
  });
  it("SCR-06 for the first point of interest", async () => {
    const site = mockLoadedSite();
    const poi = [...site.pois.values()][0]!;
    const ctx = { site, planStore: fakePlanStore().store } as AppContext;
    await expectLabelled(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  });
  it("SCR-09 on the F4 site", async () => {
    await expectLabelled(createElement(SourcesMethods, { site: mockLoadedSite() }));
  });
});

describe("SCR-05 route results, SCR-07 conditions, SCR-08 briefing card: every plan status", () => {
  it.each(RESULTS)("SCR-05, %s", async (_name, status, result) => {
    await expectLabelled(createElement(RouteResults, { planStore: fakePlanStore({ scenario: { ...SCENARIO, loop: true }, status, result }).store }));
  });
  it("SCR-05, computation failed", async () => {
    await expectLabelled(createElement(RouteResults, { planStore: fakePlanStore({ status: "Error", last_error_code: "TIMEOUT", result: null }).store }));
  });
  it.each(RESULTS)("SCR-07, %s", async (_name, status, result) => {
    await expectLabelled(createElement(Conditions, { ctx: planCtx(status, result) }));
  });
  it.each(RESULTS)("SCR-08, %s", async (_name, status, result) => {
    await expectLabelled(createElement(BriefingCard, { ctx: planCtx(status, result) }));
  });
});

describe("SCR-10 join: every state of the connection badge and the role tiles", () => {
  it.each([
    ["unset", {}],
    ["connecting", { status: "connecting" }],
    ["ready", { status: "ready", sessionScenario: "storm-sol4190" }],
    ["ready, a role taken", { status: "ready", takenRoles: ["ops", "eva:EV1"], sessionScenario: "storm-sol4190" }],
    ["unreachable", { status: "unreachable" }],
  ] as [string, Parameters<typeof Join>[0]][])("%s", async (_name, props) => {
    await expectLabelled(createElement(Join, props));
  });
});

describe("SCR-11 ops console: every fixture beat", () => {
  it.each([...BEATS])("beat %s", async (beat) => {
    const client = storeFromBeat(beat, "ops");
    const snapshot = client.state();
    await expectLabelled(createElement(OpsConsole, { client, snapshot, ...selectOpsProps(snapshot, []) }));
  });
  it("without a session every value reads — and carries its source", async () => {
    await expectLabelled(createElement(OpsConsole, { client: null, snapshot: null, ...selectOpsProps(null, []) }));
  });
});

describe("SCR-12 EVA tablet: every fixture beat, both crew members, and no snapshot", () => {
  it.each([...BEATS])("beat %s, EV1", async (beat) => {
    await expectLabelled(createElement(EvaTablet, { client: storeFromBeat(beat), crewId: "EV1" }));
  });
  it.each(["connect", "walking", "radiation-alert"] as const)("beat %s, EV2", async (beat) => {
    await expectLabelled(createElement(EvaTablet, { client: storeFromBeat(beat, "eva:EV2"), crewId: "EV2" }));
  });
  it("no snapshot", async () => {
    await expectLabelled(createElement(EvaTablet, { crewId: "EV1", snapshot: null }));
  });
});

describe("SCR-13 HUD: every fixture beat and no snapshot", () => {
  it.each([...BEATS])("beat %s", async (beat) => {
    await expectLabelled(createElement(Hud, { crewId: "EV1", snapshot: snapshotOf(beat) }));
  });
  it("no snapshot", async () => {
    await expectLabelled(createElement(Hud, { crewId: "EV1", snapshot: null }));
  });
});

describe("SCR-14 options: the proposed options on the EVA sheet and the ops layout", () => {
  it.each(["eva", "ops"] as const)("variant %s with the options of the options-proposed beat", async (variant) => {
    const snapshot = snapshotWithOptions();
    expect(snapshot.options.length, "the beat proposes options").toBeGreaterThan(0);
    await expectLabelled(createElement(Options, { client: storeFromBeat("connect"), snapshot, variant, crewId: "EV1" }));
  });
  it("no options", async () => {
    await expectLabelled(createElement(Options, { client: storeFromBeat("connect"), snapshot: snapshotOf("connect"), variant: "eva", crewId: "EV1" }));
  });
});

describe("SCR-17 post-EVA report: populated reports and no report", () => {
  it("populated, adapted from the typed wire fixture", async () => {
    await expectLabelled(createElement(PostEvaReport, { report: adaptPostEvaReport(populatedReport()) }));
  });
  it("a short populated report with one alert", async () => {
    await expectLabelled(createElement(PostEvaReport, { report: adaptPostEvaReport(populatedReport({ stops: 2, alerts: 1, tracePoints: 4 })) }));
  });
  it("no report: every value reads —", async () => {
    await expectLabelled(createElement(PostEvaReport, {}));
  });
});

describe("SCR-18 hab link lost", () => {
  it.each([["with an age", 42], ["without an age", undefined]] as const)("%s", async (_name, ageSeconds) => {
    await expectLabelled(createElement(HabLinkLost, { crewId: "EV1", snapshot: snapshotOf("link-lost-restored"), ageSeconds }));
  });
});
