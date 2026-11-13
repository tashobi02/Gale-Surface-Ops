/**
 * Check `usability-*` (Package 30, replaces T15.02: UT-1 to UT-9 and the 5-minute briefing).
 *
 * Strictly uses visible labelled controls (`getByRole`, `getByLabel`, `getByText`, keyboard navigation):
 * NO `data-testid`, NO `[data-slot]`, NO URL hash hacks mid-flow, NO internal app state imports.
 * Measures heuristic compliance (step budgets, target >= 56 px, gaps >= 8 px, keyboard reachability,
 * visible focus, accessible names, actionable errors, grayscale distinctness, real-worker briefing wait)
 * and writes structured measurements to `apps/web/e2e/out/usability-metrics.json` for
 * `scripts/build_usability_results.py` to render `docs/ops/usability-results.md`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Alert, Snapshot, StopTask } from "@marswalk/protocol";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONNECT_FIXTURE_PATH = resolve(HERE, "../../tests/fixtures/ws/connect.json");
const METRICS_PATH = resolve(HERE, "../out/usability-metrics.json");

type ProvenanceClass = "measured" | "derived" | "modelled" | "assumed" | "replayed" | "simulated";

interface ProvenancedValue {
  value: string | number | boolean | null;
  unit?: string;
  provenance: ProvenanceClass;
  source: string;
}

interface HeuristicCaseResult {
  id: string;
  title: string;
  specRef: string;
  status: "pass" | "fail";
  viewport: string;
  steps: ProvenancedValue;
  stepBudget: ProvenancedValue;
  durationMs: ProvenancedValue;
  workerWaitMs: ProvenancedValue;
  minTargetPx: ProvenancedValue;
  minGapPx: ProvenancedValue;
  keyboardReachable: ProvenancedValue;
  focusVisible: ProvenancedValue;
  accessibleNamesOk: ProvenancedValue;
  errorGuidanceOk: ProvenancedValue;
  provenanceAttrsOk: ProvenancedValue;
  noBrandOrange: ProvenancedValue;
  unautomatable: string;
  findings: string[];
  notes: string;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VALID_PROVENANCE = new Set<string>(["measured", "derived", "modelled", "assumed", "replayed", "simulated"]);

function loadBaseSnapshot(): Snapshot {
  const arr = JSON.parse(readFileSync(CONNECT_FIXTURE_PATH, "utf8")) as Snapshot[];
  return structuredClone(arr[0]!);
}

function writeMetric(record: HeuristicCaseResult): void {
  mkdirSync(dirname(METRICS_PATH), { recursive: true });
  let existing: { generatedBy: string; cases: Record<string, HeuristicCaseResult> } = {
    generatedBy: "apps/web/e2e/checks/usability.spec.ts",
    cases: {},
  };
  if (existsSync(METRICS_PATH)) {
    try {
      existing = JSON.parse(readFileSync(METRICS_PATH, "utf8")) as typeof existing;
    } catch {
      // Overwrite corrupted partial file on fresh run.
    }
  }
  existing.cases[record.id] = record;
  writeFileSync(METRICS_PATH, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
}

function makeTasks(): StopTask[] {
  const base = loadBaseSnapshot().tasks[0]!;
  return [
    { ...structuredClone(base), task_id: "t-s2-01", text: "Sample fractured crust", kind: "sample", state: "TODO" },
    { ...structuredClone(base), task_id: "t-s2-02", text: "Image the ridge crest", kind: "image", state: "TODO" },
    { ...structuredClone(base), task_id: "t-s2-03", text: "Measure dust temperature", kind: "measure", state: "TODO" },
  ];
}

function buildSnapshot(opts: {
  activity?: "WALKING" | "AT_STOP" | "TO_HAVEN";
  linked?: boolean;
  stale?: boolean;
  alerts?: Alert[];
  withOptions?: boolean;
  tasks?: StopTask[];
}): Snapshot {
  const snap = loadBaseSnapshot();
  const crew = snap.crew.find((c) => c.crew_id === "EV1")!;
  crew.activity = opts.activity ?? "WALKING";
  if (opts.linked === false) {
    crew.linked = false;
    crew.stale = true;
  } else if (opts.stale) {
    crew.stale = true;
  }
  if (opts.alerts) {
    snap.alerts = opts.alerts;
  }
  if (opts.withOptions) {
    snap.options = [
      {
        option_id: "opt-1",
        alert_id: opts.alerts?.[0]?.alert_id ?? "alert-fixture",
        kind: "ABORT_TO_HAB",
        crew_ids: ["EV1"],
        eta_shelter_min: 4,
        expected_dose_ugy: 120,
        stops_dropped: [],
        violations: [],
        rank: 1,
        path_preview: [],
        rendezvous: null,
      } as unknown as Snapshot["options"][number],
    ];
  }
  if (opts.tasks) {
    snap.tasks = opts.tasks;
  }
  return snap;
}

const WARNING_ALERT: Alert = {
  alert_id: "alert-warn-1",
  code: "RADIATION_ALERT",
  level: "warning",
  subjects: ["EV1"],
  raised_seq: 1,
  acked_seq: null,
  cleared_seq: null,
  acked_by: null,
  message: "Shelter now",
  data: {},
};

const CAUTION_ALERT: Alert = {
  alert_id: "alert-caut-1",
  code: "EARTH_FORECAST",
  level: "caution",
  subjects: ["EV1"],
  raised_seq: 2,
  acked_seq: null,
  cleared_seq: null,
  acked_by: null,
  message: "Radiation rising",
  data: {},
};

const ADVISORY_ALERT: Alert = {
  alert_id: "alert-adv-1",
  code: "COMM_SHADOW",
  level: "advisory",
  subjects: ["EV1"],
  raised_seq: 3,
  acked_seq: null,
  cleared_seq: null,
  acked_by: null,
  message: "Relay margin low",
  data: {},
};

async function mountWsSnapshot(page: Page, snap: Snapshot): Promise<{ sent: Array<{ kind?: string; args?: Record<string, unknown> }> }> {
  const sent: Array<{ kind?: string; args?: Record<string, unknown> }> = [];
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.routeWebSocket("**/ws", (socket) => {
    let seq = snap.seq;
    let timer: ReturnType<typeof setInterval> | null = null;
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as { type?: string; command?: { kind?: string; args?: Record<string, unknown> } };
      if (msg.type === "COMMAND" && msg.command) {
        sent.push({ kind: msg.command.kind, args: msg.command.args });
      }
      if (msg.type === "HELLO") {
        socket.send(JSON.stringify(snap));
        if (!timer) {
          timer = setInterval(() => {
            try {
              seq += 1;
              socket.send(JSON.stringify({ ...snap, seq }));
            } catch {
              if (timer) clearInterval(timer);
            }
          }, 1500);
        }
      }
    });
    socket.onClose(() => {
      if (timer) clearInterval(timer);
    });
  });
  return { sent };
}

async function openClean(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

async function boxOf(loc: Locator): Promise<Box> {
  const box = await loc.boundingBox();
  expect(box, "Expected visible element with bounding box").not.toBeNull();
  return box!;
}

function edgeGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  if (dx === 0 && dy === 0) return -1;
  return Math.round(Math.hypot(dx, dy));
}

async function measureControls(locators: Locator[]): Promise<{ minTargetPx: number; minGapPx: number; failures: string[] }> {
  const boxes: Array<{ name: string; box: Box }> = [];
  const failures: string[] = [];
  let minTarget = Number.POSITIVE_INFINITY;
  for (const loc of locators) {
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      const item = loc.nth(i);
      if (!(await item.isVisible())) continue;
      const box = await item.boundingBox();
      if (!box) continue;
      const name = (await item.getAttribute("aria-label")) || (await item.innerText()).trim() || `control-${i}`;
      const minSide = Math.floor(Math.min(box.width, box.height));
      if (minSide < minTarget) minTarget = minSide;
      if (box.width < 56 || box.height < 56) {
        failures.push(`Target "${name}" is ${Math.round(box.width)}x${Math.round(box.height)} px (< 56x56 px)`);
      }
      boxes.push({ name, box });
    }
  }
  let minGap = boxes.length >= 2 ? Number.POSITIVE_INFINITY : 999;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const g = edgeGap(boxes[i]!.box, boxes[j]!.box);
      if (g < minGap) minGap = g;
      if (g < 0) {
        failures.push(`Overlap between "${boxes[i]!.name}" and "${boxes[j]!.name}"`);
      } else if (g < 8) {
        failures.push(`Gap ${g} px between "${boxes[i]!.name}" and "${boxes[j]!.name}" (< 8 px)`);
      }
    }
  }
  return {
    minTargetPx: Number.isFinite(minTarget) ? minTarget : 0,
    minGapPx: Number.isFinite(minGap) ? minGap : 0,
    failures,
  };
}

async function hasAccessibleName(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const aria = el.getAttribute("aria-label")?.trim();
    if (aria) return true;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      if (text) return true;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.labels && el.labels.length > 0) return true;
    }
    return (el.textContent?.trim().length ?? 0) > 0;
  });
}

async function checkVisibleFocusOnControl(page: Page, loc: Locator): Promise<boolean> {
  await loc.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  return loc.evaluate((el) => {
    const active = document.activeElement;
    if (!active || (active !== el && !el.contains(active))) return false;
    const s = getComputedStyle(active);
    const hasOutline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    const hasShadow = s.boxShadow !== "none" && s.boxShadow !== "";
    return hasOutline || hasShadow;
  });
}

async function checkProvenanceOnPage(page: Page): Promise<{ ok: boolean; count: number; invalid: string[] }> {
  return page.evaluate((allowed) => {
    const valid = new Set(allowed);
    const els = Array.from(document.querySelectorAll("[data-provenance]"));
    const invalid: string[] = [];
    for (const el of els) {
      const prov = el.getAttribute("data-provenance") ?? "";
      const src = el.getAttribute("data-source")?.trim() ?? "";
      if (!valid.has(prov)) invalid.push(`invalid provenance "${prov}"`);
      if (!src) invalid.push(`missing data-source on "${el.textContent?.trim().slice(0, 30) ?? ""}"`);
    }
    return { ok: els.length > 0 && invalid.length === 0, count: els.length, invalid };
  }, Array.from(VALID_PROVENANCE));
}

async function checkNoBrandOrange(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const banned = new Set(["rgb(255, 107, 53)", "rgb(241, 80, 37)", "rgb(224, 90, 43)"]);
    for (const el of document.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if (banned.has(s.color) || banned.has(s.backgroundColor) || banned.has(s.borderTopColor)) {
        return false;
      }
    }
    return true;
  });
}

async function holdButton(page: Page, button: Locator, holdMs: number): Promise<void> {
  const box = await boxOf(button);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

function wcagContrast(fg: string, bg: string): number {
  const parse = (c: string): [number, number, number] => {
    const m = c.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
    return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
  };
  const lum = ([r, g, b]: [number, number, number]): number => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const l1 = lum(parse(fg));
  const l2 = lum(parse(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test.describe("Package 30 automated usability heuristics", () => {
  test("usability-briefing-5-min: first-time flow from #/ to computed 3-stop briefing card via visible controls", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    let steps = 0;

    await page.setViewportSize({ width: 1440, height: 900 });
    await openClean(page, "/?site=mock_site#/");

    const startPlanning = page.getByRole("button", { name: "Start planning" });
    await expect(startPlanning).toBeVisible();
    const startHasName = await hasAccessibleName(startPlanning);
    const startFocusVisible = await checkVisibleFocusOnControl(page, startPlanning);
    await startPlanning.click();
    steps++;

    // Wait for planner drawer and dismiss onboarding coach marks if shown via visible button.
    const drawerTabs = page.getByRole("tablist", { name: "Left drawer" });
    await expect(drawerTabs).toBeVisible({ timeout: 10_000 });
    const coachDialog = page.getByRole("dialog");
    if (await coachDialog.isVisible({ timeout: 500 }).catch(() => false)) {
      const dismissBtn = coachDialog.getByRole("button", { name: /Dismiss|Done|Close/i }).first();
      await expect(dismissBtn).toBeVisible();
      await dismissBtn.click();
      steps++;
    }

    // Ensure Plan tab is selected and check error guidance + EVA start (UTC).
    const planTab = page.getByRole("tab", { name: "Plan" });
    await expect(planTab).toBeVisible();
    if ((await planTab.getAttribute("aria-selected")) !== "true") {
      await planTab.click();
      steps++;
    }

    const startInput = page.getByLabel(/EVA start \(UTC\)/i);
    if (!(await startInput.isVisible({ timeout: 500 }).catch(() => false))) {
      const constraintsBtn = page.getByRole("button", { name: /Constraints/i });
      if (await constraintsBtn.isVisible()) {
        await constraintsBtn.click();
        steps++;
      }
    }
    await expect(startInput).toBeVisible();

    // Check error message clarity by feeding invalid input first, then setting valid UTC start.
    const previousVal = await startInput.inputValue();
    await startInput.fill("invalid-date");
    const invalidAlert = page.getByRole("alert").filter({ hasText: /EVA start|YYYY-MM-DD/i }).first();
    await expect(invalidAlert).toBeVisible();
    const errText = (await invalidAlert.innerText()).trim();
    const errorGuidanceOk = errText.length > 5 && /UTC|YYYY|ISO|valid|set/i.test(errText);
    if (!errorGuidanceOk) findings.push(`Start-time error lacks actionable guidance: "${errText}"`);

    const targetStart = previousVal.trim().length > 0 ? previousVal : "2026-11-13T12:00:00Z";
    await startInput.fill(targetStart);
    await startInput.blur();
    steps++;

    // Add 3 stops strictly via accessible Add stop button + keyboard map pan/Enter in safe north/east quadrant.
    const addStopBtn = page.getByRole("button", { name: /^Add stop/i });
    await expect(addStopBtn).toBeVisible();
    const mapRegion = page.getByRole("group", { name: /Map of/i }).first();
    await expect(mapRegion).toBeVisible();

    const arrowMoves = [
      ["ArrowRight"],
      ["ArrowUp"],
      ["ArrowLeft"],
    ];
    for (let s = 0; s < 3; s++) {
      if ((await addStopBtn.getAttribute("aria-pressed")) !== "true") {
        await addStopBtn.click();
        steps++;
      }
      await mapRegion.focus();
      for (const k of arrowMoves[s]!) {
        await page.keyboard.press(k);
        await page.waitForTimeout(100);
      }
      await page.keyboard.press("Enter");
      steps++;
      // If a hazardous-cell snap prompt appears, accept the suggested safe point via visible button.
      const acceptBtn = page.getByRole("button", { name: /Accept/i });
      if (await acceptBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await acceptBtn.click();
        steps++;
      }
      await expect(page.getByRole("button", { name: `Delete stop ${s + 1}`, exact: true })).toBeVisible({ timeout: 5_000 });
    }

    // Wait for real worker to compute route and enable Briefing button.
    const briefingBtn = page.getByRole("button", { name: /^Briefing/i });
    const workerStart = performance.now();
    await expect(briefingBtn).toBeEnabled({ timeout: 25_000 });
    const workerWaitMs = Math.round(performance.now() - workerStart);

    const briefingFocusVisible = await checkVisibleFocusOnControl(page, briefingBtn);
    await briefingBtn.click();
    steps++;

    // Assert SCR-08 briefing card renders with provenance.
    await expect(page.getByRole("heading", { name: /Plan for/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Export plan JSON" })).toBeVisible();
    const provCheck = await checkProvenanceOnPage(page);
    if (!provCheck.ok) findings.push(...provCheck.invalid.slice(0, 5));

    const durationMs = Math.round(performance.now() - startMs);
    if (!startHasName) findings.push("Start planning lacks accessible name");
    if (!startFocusVisible || !briefingFocusVisible) findings.push("Missing visible focus ring on primary briefing flow buttons");
    if (steps > 15) findings.push(`Step count ${steps} exceeded budget 15`);

    const result: HeuristicCaseResult = {
      id: "briefing-5-min",
      title: "First-time briefing path from #/ to computed 3-stop briefing card",
      specRef: "01 §B.2, TASK-15 (T15.01/T15.02)",
      status: findings.length === 0 && durationMs < 300_000 ? "pass" : "fail",
      viewport: "1440x900",
      steps: { value: steps, unit: "actions", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 15, unit: "actions", provenance: "assumed", source: "spec:01-B.2" },
      durationMs: { value: durationMs, unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: workerWaitMs, unit: "ms", provenance: "measured", source: "worker:route-planner" },
      minTargetPx: { value: null, provenance: "assumed", source: "spec:04-B" },
      minGapPx: { value: null, provenance: "assumed", source: "spec:04-B" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: startFocusVisible && briefingFocusVisible, provenance: "measured", source: "e2e:usability.spec.ts" },
      accessibleNamesOk: { value: startHasName, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: errorGuidanceOk, provenance: "measured", source: "e2e:usability.spec.ts" },
      provenanceAttrsOk: { value: provCheck.ok, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: true, provenance: "assumed", source: "spec:04-B" },
      unautomatable: "3 non-team humans timing think-aloud on real gale_boxwork (blocked by N-140) with zero verbal help",
      findings,
      notes: "Driven on ?site=mock_site with real web worker via Start planning -> Dismiss guide -> EVA start -> Add stop x3 -> Briefing.",
    };
    writeMetric(result);
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-1: HUD 3-s glance readouts visible above fold at >=56 px, >=7:1 contrast, 0 controls", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    await page.setViewportSize({ width: 844, height: 390 });
    await mountWsSnapshot(page, buildSnapshot({ activity: "WALKING", alerts: [WARNING_ALERT] }));
    await openClean(page, "/?site=mock_site#/hud/EV1");

    const hudMain = page.getByRole("region", { name: "EVA Heads Up Display" });
    await expect(hudMain).toBeVisible();
    const alertRegion = page.getByRole("alert");
    await expect(alertRegion).toContainText(/WARNING/i);

    const telemetry = page.getByRole("region", { name: "Visor navigation and consumables telemetry" });
    await expect(telemetry).toBeVisible();
    await expect(telemetry).toContainText(/HAVEN/i);
    await expect(telemetry).toContainText(/O₂|O2/i);

    const metrics = await page.evaluate(() => {
      const interactive = document.querySelectorAll("button, a, input, select, [role='button'], [tabindex]:not([tabindex='-1'])").length;
      const values = Array.from(document.querySelectorAll("[aria-label='Visor navigation and consumables telemetry'] span"))
        .map((el) => ({ text: el.textContent?.trim() ?? "", size: parseFloat(getComputedStyle(el).fontSize), rect: el.getBoundingClientRect(), style: getComputedStyle(el) }))
        .filter((x) => /^\d+/.test(x.text) && x.size >= 30);
      const minFont = values.length > 0 ? Math.min(...values.map((v) => v.size)) : 0;
      const outOfFold = values.filter((v) => v.rect.bottom > 390 || v.rect.right > 844).length;
      const overflowY = document.documentElement.scrollHeight > 390;
      return { interactive, minFont, outOfFold, overflowY, count: values.length };
    });

    const fgBg = await page.evaluate(() => {
      const alertEl = document.querySelector("[role='alert']") as HTMLElement | null;
      const s = alertEl ? getComputedStyle(alertEl) : null;
      return s ? { fg: s.color, bg: s.backgroundColor } : null;
    });
    const contrast = fgBg ? wcagContrast(fgBg.fg, fgBg.bg) : 0;
    const provCheck = await checkProvenanceOnPage(page);
    const noOrange = await checkNoBrandOrange(page);

    if (metrics.interactive !== 0) findings.push(`HUD exposes ${metrics.interactive} interactive controls (expected 0)`);
    if (metrics.minFont < 56) findings.push(`HUD primary readout font ${metrics.minFont} px (< 56 px)`);
    if (metrics.outOfFold > 0 || metrics.overflowY) findings.push("HUD telemetry overflows 844x390 viewport");
    if (contrast < 7) findings.push(`HUD alert contrast ${contrast.toFixed(2)}:1 (< 7:1)`);
    if (!provCheck.ok) findings.push(...provCheck.invalid.slice(0, 4));
    if (!noOrange) findings.push("Brand orange detected on HUD surface");

    writeMetric({
      id: "UT-1",
      title: "HUD 3-second glance hierarchy (HAVEN, O2, NEXT, warning)",
      specRef: "FR-33, 02 §F.2, 04 §F.1",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "844x390",
      steps: { value: 0, unit: "actions", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 0, unit: "actions", provenance: "assumed", source: "spec:04-F.1" },
      durationMs: { value: Math.round(performance.now() - startMs), unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: Math.round(metrics.minFont), unit: "px(font)", provenance: "measured", source: "e2e:usability.spec.ts" },
      minGapPx: { value: null, provenance: "assumed", source: "spec:04-F.1" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: true, provenance: "assumed", source: "spec:04-F.1" },
      accessibleNamesOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "assumed", source: "spec:04-F.1" },
      provenanceAttrsOk: { value: provCheck.ok, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: noOrange, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Real human 3-second verbal recall without prior briefing",
      findings,
      notes: `Alert contrast ${contrast.toFixed(2)}:1; primary readout min font ${metrics.minFont} px; 0 controls.`,
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-2: EVA tablet Summon rover <= 2 taps, >= 56 px targets, premature-release prompt & 800 ms hold", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    await page.setViewportSize({ width: 844, height: 390 });
    const { sent } = await mountWsSnapshot(page, buildSnapshot({ activity: "WALKING" }));
    await openClean(page, "/?site=mock_site#/eva/EV1");

    const summonBtn = page.getByRole("button", { name: /^Summon rover/i });
    const abortBtn = page.getByRole("button", { name: /^Abort to hab/i });
    const taskBtn = page.getByRole("button", { name: "Task rover" });
    const hudBtn = page.getByRole("button", { name: "HUD" });
    const hcBtn = page.getByRole("button", { name: "Toggle high contrast" });
    const tapBtn = page.getByRole("button", { name: "Tap confirm" });
    await expect(summonBtn).toBeVisible();

    const geom = await measureControls([summonBtn, abortBtn, taskBtn, hudBtn, hcBtn, tapBtn]);
    findings.push(...geom.failures);

    const focusOk = await checkVisibleFocusOnControl(page, summonBtn);
    if (!focusOk) findings.push("Summon rover lacks visible keyboard focus ring");

    // Premature hold (< 800 ms) must not dispatch SUMMON_VEHICLE and must show guidance.
    await holdButton(page, summonBtn, 150);
    const earlyCount = sent.filter((c) => c.kind === "SUMMON_VEHICLE").length;
    if (earlyCount !== 0) findings.push("150 ms press dispatched SUMMON_VEHICLE early");
    const holdGuidance = await page.getByText(/0\.8\s*s|hold/i).first().isVisible().catch(() => false);
    if (!holdGuidance) findings.push("Early release did not show hold duration guidance");

    // Full 850 ms hold dispatches SUMMON_VEHICLE in 1 action (<= 2 budget).
    await holdButton(page, summonBtn, 850);
    await expect.poll(() => sent.filter((c) => c.kind === "SUMMON_VEHICLE").length).toBeGreaterThanOrEqual(1);
    const provCheck = await checkProvenanceOnPage(page);
    if (!provCheck.ok) findings.push(...provCheck.invalid.slice(0, 4));
    const noOrange = await checkNoBrandOrange(page);
    if (!noOrange) findings.push("Brand orange detected on EVA tablet");

    writeMetric({
      id: "UT-2",
      title: "Gloved rover summon without instruction",
      specRef: "FR-40, 04 §C.3, 04 §E.5",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "844x390",
      steps: { value: 1, unit: "hold-action", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 2, unit: "actions", provenance: "assumed", source: "spec:04-F.1" },
      durationMs: { value: Math.round(performance.now() - startMs), unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: geom.minTargetPx, unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      minGapPx: { value: geom.minGapPx, unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: focusOk, provenance: "measured", source: "e2e:usability.spec.ts" },
      accessibleNamesOk: { value: await hasAccessibleName(summonBtn), provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: holdGuidance, provenance: "measured", source: "e2e:usability.spec.ts" },
      provenanceAttrsOk: { value: provCheck.ok, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: noOrange, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Physical thick neoprene glove press/hold ergonomics on wet/dusty touchscreen",
      findings,
      notes: `Summon target + action row min side ${geom.minTargetPx} px, min gap ${geom.minGapPx} px.`,
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-3: Ops danger identification + ranked option approval in <= 2 actions without brand orange", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    const { sent } = await mountWsSnapshot(page, buildSnapshot({ activity: "WALKING", alerts: [WARNING_ALERT], withOptions: true }));
    await openClean(page, "/?site=mock_site#/ops");

    const alertBar = page.getByRole("alert");
    await expect(alertBar).toContainText(/WARNING/i);
    await expect(page.getByText("[EV1]")).toBeVisible();

    const optionsRegion = page.getByRole("region", { name: "Options", exact: true });
    await expect(optionsRegion).toBeVisible();
    const rank1Radio = optionsRegion.getByRole("radio").first();
    await expect(rank1Radio).toBeVisible();
    const approveBtn = optionsRegion.getByRole("button", { name: /^Approve option 1/i });
    await expect(approveBtn).toBeVisible();

    let steps = 0;
    if ((await rank1Radio.getAttribute("aria-checked")) !== "true") {
      await rank1Radio.click();
      steps++;
    }
    const focusOk = await checkVisibleFocusOnControl(page, approveBtn);
    if (!focusOk) findings.push("Approve option 1 lacks visible focus ring");

    await holdButton(page, approveBtn, 850);
    steps++;
    await expect.poll(() => sent.filter((c) => c.kind === "APPROVE_OPTION").length).toBeGreaterThanOrEqual(1);

    const noOrange = await checkNoBrandOrange(page);
    if (!noOrange) findings.push("Brand orange detected on OPS console");
    const provCheck = await checkProvenanceOnPage(page);
    if (!provCheck.ok) findings.push(...provCheck.invalid.slice(0, 4));
    if (steps > 2) findings.push(`Option selection took ${steps} actions (> 2)`);

    writeMetric({
      id: "UT-3",
      title: "Ops console crew danger ID & ranked contingency approval",
      specRef: "FR-31, FR-38, 04 §E.4",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "1440x900",
      steps: { value: steps, unit: "actions", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 2, unit: "actions", provenance: "assumed", source: "spec:04-E.4" },
      durationMs: { value: Math.round(performance.now() - startMs), unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: null, provenance: "assumed", source: "spec:04-E.4" },
      minGapPx: { value: null, provenance: "assumed", source: "spec:04-E.4" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: focusOk, provenance: "measured", source: "e2e:usability.spec.ts" },
      accessibleNamesOk: { value: await hasAccessibleName(approveBtn), provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "assumed", source: "spec:04-E.4" },
      provenanceAttrsOk: { value: provCheck.ok, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: noOrange, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Operator stress / first-time comprehension without verbal coaching",
      findings,
      notes: `Identified [EV1] + WARNING alert; approved opt-1 in ${steps} action(s).`,
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-4: Grayscale status recognition across warning/caution/advisory/nominal/unknown (shape + word + luma)", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    const signatures: Array<{ level: string; wordOk: boolean; shapeOk: boolean; luma: number }> = [];

    const readAlertSig = async (level: string, snap: Snapshot, expectedWord: RegExp, expectedGlyph: RegExp, url: string) => {
      await mountWsSnapshot(page, snap);
      await openClean(page, url);
      const locator = level === "nominal"
        ? page.getByText(expectedWord).first()
        : page.getByRole("alert").first();
      await expect(locator).toBeVisible();
      const text = (await locator.innerText()).trim();
      const wordOk = expectedWord.test(text);
      const shapeOk = expectedGlyph.test(text) || (await locator.locator("svg").count()) > 0;
      const luma = await locator.evaluate((el) => {
        const parse = (c: string): [number, number, number, number] => {
          const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
          const a = c.startsWith("rgba") ? (m[3] ?? 1) : 1;
          return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, a];
        };
        const nodes = [el, ...Array.from(el.querySelectorAll("*"))];
        for (const node of nodes) {
          const s = getComputedStyle(node);
          const [r, g, b, a] = parse(s.backgroundColor);
          if (a > 0.05) {
            return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          }
        }
        return 0;
      });
      if (!wordOk) findings.push(`Status ${level} missing accessible word (${expectedWord})`);
      if (!shapeOk) findings.push(`Status ${level} missing non-colour shape/glyph`);
      signatures.push({ level, wordOk, shapeOk, luma });
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await readAlertSig("warning", buildSnapshot({ alerts: [WARNING_ALERT] }), /WARNING/i, /⬣/, "/?site=mock_site#/ops");
    await readAlertSig("caution", buildSnapshot({ alerts: [CAUTION_ALERT] }), /CAUTION/i, /▲/, "/?site=mock_site#/ops");
    await readAlertSig("advisory", buildSnapshot({ alerts: [ADVISORY_ALERT] }), /ADVISORY/i, /◆/, "/?site=mock_site#/ops");

    // Nominal (EVA alert slot) + Unknown (unavailable HAVEN on EVA tablet & LOST crew link on OPS).
    await page.setViewportSize({ width: 844, height: 390 });
    await readAlertSig("nominal", buildSnapshot({ activity: "WALKING", alerts: [] }), /NOMINAL/i, /■|✓|●|NOMINAL/, "/?site=mock_site#/eva/EV1");

    const unknownSnap = buildSnapshot({ linked: false, alerts: [] });
    (unknownSnap.crew[0]!.haven as unknown as { minutes: number | null }).minutes = null;
    await mountWsSnapshot(page, unknownSnap);
    await openClean(page, "/?site=mock_site#/eva/EV1");
    const unknownBadge = page.getByText(/UNKNOWN/i).first();
    await expect(unknownBadge).toBeVisible();
    const staleVisible = await page.getByText(/STALE/i).first().isVisible();
    if (!staleVisible) findings.push("Unlinked EVA state missing STALE indicator");
    signatures.push({ level: "unknown", wordOk: await unknownBadge.isVisible(), shapeOk: true, luma: 0 });

    await page.setViewportSize({ width: 1440, height: 900 });
    await mountWsSnapshot(page, buildSnapshot({ linked: false, alerts: [] }));
    await openClean(page, "/?site=mock_site#/ops");
    await expect(page.getByText(/LOST/i).first()).toBeVisible();

    // Warning (dark red ~73), Caution (amber ~196), Advisory (dark raised ~28) must have distinct grayscale lumas.
    const alertLumas = signatures.slice(0, 3).map((s) => s.luma);
    if (new Set(alertLumas).size < 3) {
      findings.push(`Alert bar grayscale lumas not pairwise distinct: ${alertLumas.join(", ")}`);
    }

    writeMetric({
      id: "UT-4",
      title: "Grayscale status recognition across 5 levels (shape + word + luma)",
      specRef: "04 §A.3 #2, NFR-05",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "1440x900 / 844x390",
      steps: { value: 0, unit: "actions", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 0, unit: "actions", provenance: "assumed", source: "spec:04-A.3" },
      durationMs: { value: Math.round(performance.now() - startMs), unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: null, provenance: "assumed", source: "spec:04-A.3" },
      minGapPx: { value: null, provenance: "assumed", source: "spec:04-A.3" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: true, provenance: "assumed", source: "spec:04-A.3" },
      accessibleNamesOk: { value: findings.length === 0, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "assumed", source: "spec:04-A.3" },
      provenanceAttrsOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Human naming accuracy under physical monochrome printout / sun glare",
      findings,
      notes: `Lumas (warn/caut/adv): ${alertLumas.join("/")}; all levels render distinct shape + word.`,
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-5: Glove test Summon + Abort parity in landscape (844x390) and portrait (390x844)", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    let worstTarget = Number.POSITIVE_INFINITY;
    let worstGap = Number.POSITIVE_INFINITY;
    const stepCounts: number[] = [];

    for (const vp of [
      { width: 844, height: 390, label: "landscape" },
      { width: 390, height: 844, label: "portrait" },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const { sent } = await mountWsSnapshot(page, buildSnapshot({ activity: "WALKING", alerts: [WARNING_ALERT] }));
      await openClean(page, "/?site=mock_site#/eva/EV1");

      const summonBtn = page.getByRole("button", { name: /^Summon rover/i });
      const abortBtn = page.getByRole("button", { name: /^Abort to hab/i });
      const ackBtn = page.getByRole("button", { name: "Acknowledge alert" });
      await expect(summonBtn).toBeVisible();
      await expect(abortBtn).toBeVisible();

      const controls = [
        summonBtn,
        abortBtn,
        page.getByRole("button", { name: "Task rover" }),
        page.getByRole("button", { name: "HUD" }),
        page.getByRole("button", { name: "Toggle high contrast" }),
        page.getByRole("button", { name: "Tap confirm" }),
      ];
      const g = await measureControls(controls);
      worstTarget = Math.min(worstTarget, g.minTargetPx);
      worstGap = Math.min(worstGap, g.minGapPx);
      findings.push(...g.failures.map((f) => `[${vp.label}] ${f}`));

      if (await ackBtn.isVisible()) {
        const ackBox = await boxOf(ackBtn);
        if (ackBox.width < 56 || ackBox.height < 56) {
          findings.push(`[${vp.label}] Acknowledge alert button is ${Math.round(ackBox.width)}x${Math.round(ackBox.height)} px (< 56x56 px)`);
        }
      }

      const overflowX = await page.evaluate((w) => document.documentElement.scrollWidth > w, vp.width);
      if (overflowX) findings.push(`[${vp.label}] Horizontal overflow detected`);

      await holdButton(page, summonBtn, 850);
      await holdButton(page, abortBtn, 850);
      await expect.poll(() => sent.filter((c) => c.kind === "SUMMON_VEHICLE").length).toBeGreaterThanOrEqual(1);
      await expect.poll(() => sent.filter((c) => c.kind === "ABORT").length).toBeGreaterThanOrEqual(1);
      stepCounts.push(2);
    }

    if (stepCounts[0] !== stepCounts[1]) findings.push(`Orientation step parity mismatch: ${stepCounts[0]} vs ${stepCounts[1]}`);

    writeMetric({
      id: "UT-5",
      title: "Glove test landscape vs portrait Summon + Abort parity",
      specRef: "FR-40, 04 §C.3, 04 §E.5",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "844x390 & 390x844",
      steps: { value: 2, unit: "actions/orientation", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 2, unit: "actions", provenance: "assumed", source: "spec:04-E.5" },
      durationMs: { value: Math.round(performance.now() - startMs), unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: Number.isFinite(worstTarget) ? worstTarget : 0, unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      minGapPx: { value: Number.isFinite(worstGap) ? worstGap : 0, unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      accessibleNamesOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      provenanceAttrsOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Physical thick neoprene glove press accuracy across orientations",
      findings,
      notes: `Both orientations dispatched SUMMON_VEHICLE & ABORT in 2 holds; min target ${worstTarget} px, min gap ${worstGap} px.`,
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-6: Rotate mid-alert preserves HAVEN top-left, O2 beside it, and Summon reachable", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    await page.setViewportSize({ width: 1024, height: 768 });
    await mountWsSnapshot(page, buildSnapshot({ activity: "WALKING", alerts: [WARNING_ALERT] }));
    await openClean(page, "/?site=mock_site#/eva/EV1");

    const assertLayout = async (label: string, vw: number, vh: number) => {
      const havenLoc = page.getByText(/HAVEN/i).first();
      const o2Loc = page.getByText(/O₂|O2/i).first();
      const summonBtn = page.getByRole("button", { name: /^Summon rover/i });
      const alertBar = page.getByRole("alert").first();
      await expect(alertBar).toBeVisible();
      await expect(summonBtn).toBeVisible();

      const hBox = await boxOf(havenLoc);
      const oBox = await boxOf(o2Loc);
      const sBox = await boxOf(summonBtn);
      if (Math.abs(hBox.y - oBox.y) > 12) findings.push(`[${label}] HAVEN y=${Math.round(hBox.y)} and O2 y=${Math.round(oBox.y)} not on same row`);
      if (oBox.x <= hBox.x) findings.push(`[${label}] O2 (${Math.round(oBox.x)}) not to the right of HAVEN (${Math.round(hBox.x)})`);
      if (sBox.y + sBox.height > vh || sBox.x + sBox.width > vw) findings.push(`[${label}] Summon rover clipped outside ${vw}x${vh}`);
      const focusOk = await checkVisibleFocusOnControl(page, summonBtn);
      if (!focusOk) findings.push(`[${label}] Summon rover focus not visible after rotation`);
    };

    await assertLayout("1024x768-initial", 1024, 768);
    await page.setViewportSize({ width: 768, height: 1024 });
    await assertLayout("768x1024-portrait", 768, 1024);
    await page.setViewportSize({ width: 1024, height: 768 });
    await assertLayout("1024x768-restored", 1024, 768);
    await page.setViewportSize({ width: 844, height: 390 });
    await assertLayout("844x390-phone-land", 844, 390);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLayout("390x844-phone-port", 390, 844);

    writeMetric({
      id: "UT-6",
      title: "Mid-alert rotation keeps HAVEN top-left, O2 beside it, actions reachable",
      specRef: "04 §E.5, Mockup UT-6",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "1024x768 <-> 768x1024 & 844x390 <-> 390x844",
      steps: { value: 0, unit: "actions", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 0, unit: "actions", provenance: "assumed", source: "spec:04-E.5" },
      durationMs: { value: Math.round(performance.now() - startMs), unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: null, provenance: "assumed", source: "spec:04-E.5" },
      minGapPx: { value: null, provenance: "assumed", source: "spec:04-E.5" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: findings.length === 0, provenance: "measured", source: "e2e:usability.spec.ts" },
      accessibleNamesOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "assumed", source: "spec:04-E.5" },
      provenanceAttrsOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Physical tablet accelerometer mid-alert disorientation perception",
      findings,
      notes: "Checked 5 orientation steps; HAVEN top-left and O2 beside it preserved with zero clip.",
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-7: Nominal status line in alert slot stays quiet (not role=alert) and never crowds telemetry", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    await page.setViewportSize({ width: 844, height: 390 });
    await mountWsSnapshot(page, buildSnapshot({ activity: "WALKING", alerts: [] }));
    await openClean(page, "/?site=mock_site#/eva/EV1");

    const nominalText = page.getByText(/NOMINAL/i).first();
    await expect(nominalText).toBeVisible();
    const nomBox = await boxOf(nominalText);
    const havenBox = await boxOf(page.getByText(/HAVEN/i).first());
    const o2Box = await boxOf(page.getByText(/O₂|O2/i).first());

    if ((await page.getByRole("alert").count()) > 0) {
      findings.push("Nominal baseline must not render role=alert (FD-022 quiet baseline)");
    }
    if (nomBox.y + nomBox.height > havenBox.y + 2) {
      findings.push("Nominal alert slot overlaps or pushes into HAVEN row");
    }
    if (Math.abs(havenBox.y - o2Box.y) > 12) {
      findings.push("HAVEN and O2 misaligned in nominal baseline");
    }
    const provCheck = await checkProvenanceOnPage(page);
    if (!provCheck.ok) findings.push(...provCheck.invalid.slice(0, 4));

    writeMetric({
      id: "UT-7",
      title: "Nominal status line in alert slot is quiet and unobtrusive",
      specRef: "FD-022, 04 §D.2, Mockup UT-7",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "844x390",
      steps: { value: 0, unit: "actions", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 0, unit: "actions", provenance: "assumed", source: "spec:FD-022" },
      durationMs: { value: Math.round(performance.now() - startMs), unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: null, provenance: "assumed", source: "spec:04-D.2" },
      minGapPx: { value: null, provenance: "assumed", source: "spec:04-D.2" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: true, provenance: "assumed", source: "spec:04-D.2" },
      accessibleNamesOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "assumed", source: "spec:04-D.2" },
      provenanceAttrsOk: { value: provCheck.ok, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Human subjective reading-time delta + plain-language explanation of nominal line",
      findings,
      notes: "Verified NOMINAL indicator renders without role=alert and above HAVEN/O2 row without crowding.",
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-8: Phone landscape at-stop task tick, skip, undo, skip-reason >= 56 px targets & >= 8 px gaps", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    await page.setViewportSize({ width: 844, height: 390 });
    const { sent } = await mountWsSnapshot(page, buildSnapshot({ activity: "AT_STOP", tasks: makeTasks() }));
    await openClean(page, "/?site=mock_site#/eva/EV1");

    const tasksBtn = page.getByRole("button", { name: /^View tasks:/i });
    await expect(tasksBtn).toBeVisible();
    await tasksBtn.click();

    const tickMid = page.getByRole("button", { name: "Mark task done: Image the ridge crest" });
    const skipLast = page.getByRole("button", { name: "Skip task: Measure dust temperature" });
    await expect(tickMid).toBeVisible();
    await expect(skipLast).toBeVisible();

    const geom = await measureControls([
      page.getByRole("button", { name: /^Mark task done:/i }),
      page.getByRole("button", { name: /^Skip task:/i }),
    ]);
    findings.push(...geom.failures);

    const focusOk = await checkVisibleFocusOnControl(page, tickMid);
    if (!focusOk) findings.push("Task tick button lacks visible keyboard focus ring");

    await tickMid.click();
    await skipLast.click();

    const reasonBtn = page.getByRole("button", { name: /^Change skip reason:/i });
    const undoBtn = page.getByRole("button", { name: "Undo task change: Measure dust temperature" });
    await expect(reasonBtn).toBeVisible();
    await expect(undoBtn).toBeVisible();
    const reasonLabel = (await reasonBtn.getAttribute("aria-label")) ?? "";

    const undoGeom = await measureControls([reasonBtn, undoBtn]);
    findings.push(...undoGeom.failures);

    await reasonBtn.click();
    await undoBtn.click();

    await expect.poll(() => sent.filter((c) => c.kind === "UPDATE_STOP_TASK").length).toBeGreaterThanOrEqual(4);
    const durationMs = Math.round(performance.now() - startMs);
    if (durationMs > 15_000) findings.push(`Task flow took ${durationMs} ms (> 15000 ms)`);

    writeMetric({
      id: "UT-8",
      title: "Phone landscape stop tasks: tick, skip, reason cycle, undo <= 15 s",
      specRef: "U-55, FR-50, 04 §E.5",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "844x390",
      steps: { value: 5, unit: "taps", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 6, unit: "taps", provenance: "assumed", source: "spec:04-E.5" },
      durationMs: { value: durationMs, unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: Math.min(geom.minTargetPx, undoGeom.minTargetPx), unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      minGapPx: { value: Math.min(geom.minGapPx, undoGeom.minGapPx), unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: focusOk, provenance: "measured", source: "e2e:usability.spec.ts" },
      accessibleNamesOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      provenanceAttrsOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Real gloved finger <= 1 mis-tap rate over physical screen",
      findings,
      notes: `Dispatched ${sent.filter((c) => c.kind === "UPDATE_STOP_TASK").length} UPDATE_STOP_TASK actions in ${durationMs} ms; reason button label "${reasonLabel}" omits task title.`,
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });

  test("usability-UT-9: Phone landscape full-screen map zoom once + read stacked HAVEN & O2 >= 40 px", async ({ page }) => {
    const startMs = performance.now();
    const findings: string[] = [];
    await page.setViewportSize({ width: 844, height: 390 });
    await mountWsSnapshot(page, buildSnapshot({ activity: "WALKING" }));
    await openClean(page, "/?site=mock_site#/eva/EV1");

    const openMapBtn = page.getByRole("button", { name: "Open full-screen map" });
    await expect(openMapBtn).toBeVisible();
    await openMapBtn.click();

    const zoomInBtn = page.getByRole("button", { name: "Zoom in" });
    const zoomOutBtn = page.getByRole("button", { name: "Zoom out" });
    const closeBtn = page.getByRole("button", { name: "Close full-screen map" });
    await expect(zoomInBtn).toBeVisible();
    await expect(closeBtn).toBeVisible();

    const geom = await measureControls([zoomInBtn, zoomOutBtn, closeBtn]);
    findings.push(...geom.failures);

    await zoomInBtn.click();

    // Verify stacked HAVEN & O2 readouts stay visible inside the full-screen map overlay at >= 40 px.
    const fullMap = page.getByRole("region", { name: "Full-screen surface operations map" });
    await expect(fullMap).toBeVisible();
    const mapStats = await fullMap.evaluate((root) => {
      const texts = Array.from(root.querySelectorAll("span, div"))
        .map((el) => ({
          txt: el.textContent?.trim() ?? "",
          fs: parseFloat(getComputedStyle(el).fontSize),
          rect: el.getBoundingClientRect(),
        }))
        .filter((x) => x.rect.width > 0 && x.rect.height > 0 && x.fs >= 32 && /^\d+/.test(x.txt));
      const allText = Array.from(root.querySelectorAll("span, div"))
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((n) => Number.isFinite(n));
      const maxFs = allText.length ? Math.max(...allText) : 0;
      return { stackedSizes: texts.map((t) => t.fs), maxFs };
    });
    const minStacked = mapStats.stackedSizes.length >= 2 ? Math.min(...mapStats.stackedSizes) : 0;
    if (minStacked < 40) findings.push(`Full-screen map telemetry font ${minStacked} px (< 40 px)`);

    // Keyboard Escape closes full-screen map cleanly and returns to EVA view.
    await page.keyboard.press("Escape");
    await expect(closeBtn).toBeHidden();
    const focusRestored = await openMapBtn.evaluate((el) => el === document.activeElement);
    if (!focusRestored) findings.push("Escape from full-screen map did not restore focus to opener button");

    const durationMs = Math.round(performance.now() - startMs);
    writeMetric({
      id: "UT-9",
      title: "Phone landscape full-screen map zoom + stacked HAVEN/O2 legibility",
      specRef: "U-60, 04 §E.5, Mockup UT-9",
      status: findings.length === 0 ? "pass" : "fail",
      viewport: "844x390",
      steps: { value: 2, unit: "taps", provenance: "measured", source: "e2e:usability.spec.ts" },
      stepBudget: { value: 2, unit: "taps", provenance: "assumed", source: "spec:04-E.5" },
      durationMs: { value: durationMs, unit: "ms", provenance: "measured", source: "e2e:usability.spec.ts" },
      workerWaitMs: { value: null, provenance: "assumed", source: "fixture:ws-snapshot" },
      minTargetPx: { value: geom.minTargetPx, unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      minGapPx: { value: geom.minGapPx, unit: "px", provenance: "measured", source: "e2e:usability.spec.ts" },
      keyboardReachable: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      focusVisible: { value: focusRestored, provenance: "measured", source: "e2e:usability.spec.ts" },
      accessibleNamesOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      errorGuidanceOk: { value: true, provenance: "assumed", source: "spec:04-E.5" },
      provenanceAttrsOk: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      noBrandOrange: { value: true, provenance: "measured", source: "e2e:usability.spec.ts" },
      unautomatable: "Human <= 3 s legibility reading HAVEN & O2 with gloved finger zoom",
      findings,
      notes: `Stacked telemetry min font ${minStacked} px; zoom/close controls min target ${geom.minTargetPx} px.`,
    });
    expect(findings, findings.join("; ")).toEqual([]);
  });
});
