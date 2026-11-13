/**
 * T27.05 — `#/replay` on its route (FR-34, FR-46; N-21). The recording is served by an injected fetch; nothing reaches
 * the network. The ops view stays inspectable (log drawer, panel drawers) and read-only through the replay client, the
 * hash badge says what is verified, playback is paced by sim time with 1×/10×/60×, and every error path says why.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { canonicalJson, PROTOCOL_VERSION, type LogEvent, type Recording, type Snapshot } from "@marswalk/protocol";
import connect from "../fixtures/ws/connect.json";
import type { SocketLike } from "../../src/net/habClient";
import { closeHabSessions, startHabSession } from "../../src/state/habSession";
import { ReplayRoute } from "../../src/ui/live/ReplayRoute";
import { click, flush, installDom, mount, must, removeDom, type Mounted } from "./domHarness";
import { mockManifest, stubReducedMotion, stubResizeObserver } from "./map/mapFixtures";

const nodeSha = (text: string): string => createHash("sha256").update(text).digest("hex");
const hashOf = (events: LogEvent[]): string => nodeSha(events.map((e) => `${canonicalJson(e)}\n`).join(""));
const event = (seq: number, sim_time: string): LogEvent => ({ seq, sim_time, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: null }) as LogEvent;

function recording(logHash?: string): Recording {
  const s = structuredClone((connect as unknown as Snapshot[])[0]!);
  Object.assign(s, { seq: 0, sim_time: "2024-05-20T13:00:00Z" });
  s.session.status = "LOADED";
  const e1 = event(1, "2024-05-20T13:00:10Z");
  const e2 = event(2, "2024-05-20T13:10:00Z");
  return {
    format: "marswalk-recording", version: 1, scenario_id: "storm-sol4190", seed: 4190, data_version: "v1", label: "replayed recording",
    log_hash: logHash ?? hashOf([e1, e2]),
    messages: [
      s,
      { v: PROTOCOL_VERSION, type: "EVENT", seq: 1, sim_time: e1.sim_time, event: e1 },
      { v: PROTOCOL_VERSION, type: "STATE_DELTA", seq: 1, sim_time: e1.sim_time, changes: [{ path: "session/status", value: "RUNNING" }] },
      { v: PROTOCOL_VERSION, type: "EVENT", seq: 2, sim_time: e2.sim_time, event: e2 },
      { v: PROTOCOL_VERSION, type: "STATE_DELTA", seq: 2, sim_time: e2.sim_time, changes: [{ path: "session/status", value: "ENDED" }] },
    ],
  } as Recording;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mountedViews = new Set<Mounted>();

async function open(fetchImpl: (url: string) => Promise<Response>) {
  const mounted = await mount(createElement(ReplayRoute, { fetchImpl }));
  const unmount = mounted.unmount.bind(mounted);
  mounted.unmount = async () => {
    if (!mountedViews.delete(mounted)) return;
    await unmount();
  };
  mountedViews.add(mounted);
  // The hash is computed asynchronously (WebCrypto): wait until the route left its loading state.
  for (let i = 0; i < 200 && mounted.container.querySelector('[data-replay-state="loading"]'); i++) {
    await flush();
    await new Promise((resolve) => setImmediate(resolve));
  }
  return mounted;
}

const pause = async (root: ParentNode) => click(must(root, '[data-slot="replay-play"]'));

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(async () => {
  for (const view of [...mountedViews]) await view.unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  closeHabSessions();
  document.body.innerHTML = "";
  Object.assign(window, { innerWidth: 1024 });
});

describe("ReplayRoute", () => {
  it("fetches the recording relative to the page (injected fetch), once", async () => {
    const fetchImpl = vi.fn(async () => json(recording()));
    await open(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("replay/recording.json");
  });

  it("is read-only without disabling inspection: no fieldset, a visible banner, the log drawer opens", async () => {
    const { container } = await open(async () => json(recording()));
    await pause(container);
    expect(container.querySelector("fieldset")).toBeNull();
    expect(must(container, '[data-slot="replay-banner"]').textContent).toContain("REPLAYED RECORDING — read only");
    // One <main> landmark (the ops console's), never nested in another.
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector("main main")).toBeNull();
    const strip = must<HTMLButtonElement>(container, '[data-slot="event-log-strip"]');
    expect(strip.disabled).toBe(false);
    await click(strip);
    expect(container.querySelector('[data-slot="event-log-drawer"]')).not.toBeNull();
  });

  it("below 1280 px the panel drawers open", async () => {
    Object.assign(window, { innerWidth: 1100 });
    const { container } = await open(async () => json(recording()));
    await pause(container);
    const crew = [...container.querySelectorAll<HTMLButtonElement>('[data-slot="ops-side-drawer"] button')].find((b) => b.textContent?.includes("Crew"))!;
    expect(crew.disabled).toBe(false);
    await click(crew);
    expect(crew.getAttribute("aria-expanded")).toBe("true");
    await click(must(container, '[data-slot="event-log-strip"]'));
    expect(container.querySelector('[data-slot="event-log-drawer"]')).not.toBeNull();
  });

  it("a command is refused with the read-only reason", async () => {
    Object.assign(window, { innerWidth: 1440 });
    const { container } = await open(async () => json(recording()));
    await pause(container);
    await click(must(container, '[aria-label="Start EVA mission"]'));
    await flush();
    expect(must(container, '[data-slot="command-error"]').textContent).toContain("Read-only replay");
  });

  it("verified: the badge says what the hash covers and shows the computed hash", async () => {
    const rec = recording();
    const { container } = await open(async () => json(rec));
    const badge = must(container, '[data-slot="replay-hash"]');
    expect(badge.getAttribute("data-hash-status")).toBe("verified");
    expect(badge.textContent).toContain("log hash verified (events only; state is replayed from the recorded snapshot and deltas)");
    expect(must(container, "[data-log-hash]").textContent).toBe(rec.log_hash);
    expect(must(container, "[data-recorded-log-hash]").textContent).toBe(rec.log_hash);
    expect(badge.querySelector(".status-indicator")?.getAttribute("data-status")).toBe("nominal");
  });

  it("mismatch: MISMATCH (colour + shape + word) with the recorded and the computed hash", async () => {
    const good = recording();
    const { container } = await open(async () => json(recording("f".repeat(64))));
    const badge = must(container, '[data-slot="replay-hash"]');
    expect(badge.getAttribute("data-hash-status")).toBe("mismatch");
    expect(badge.querySelector(".status-indicator")?.getAttribute("data-status")).toBe("warning");
    expect(badge.textContent).toContain("MISMATCH");
    expect(must(container, "[data-recorded-log-hash]").textContent).toBe("f".repeat(64));
    expect(must(container, "[data-log-hash]").textContent).toBe(good.log_hash);
  });

  it("incomplete and unverifiable read differently; the computed hash is — and flagged unavailable", async () => {
    const rec = recording();
    const incomplete = { ...rec, messages: [rec.messages[0], rec.messages[3]] };
    let mounted = await open(async () => json(incomplete));
    let badge = must(mounted.container, '[data-slot="replay-hash"]');
    expect(badge.getAttribute("data-hash-status")).toBe("incomplete");
    expect(badge.textContent).toContain("INCOMPLETE");
    const computed = must(mounted.container, "[data-log-hash]");
    expect(computed.textContent).toBe("—");
    expect(computed.getAttribute("data-unavailable")).toBe("true");
    expect(computed.getAttribute("title")).toBeTruthy();
    await mounted.unmount();
    mounted = await open(async () => json({ ...rec, log_hash: "" }));
    badge = must(mounted.container, '[data-slot="replay-hash"]');
    expect(badge.getAttribute("data-hash-status")).toBe("unverifiable");
    expect(badge.textContent).toContain("UNVERIFIABLE");
  });

  it("plays by sim time with 1×/10×/60× and a labelled position readout", async () => {
    const { container } = await open(async () => json(recording()));
    await pause(container);
    vi.useFakeTimers();
    const position = must(container, '[data-slot="replay-position"]');
    expect(position.getAttribute("data-provenance")).toBe("replayed");
    expect(position.textContent).toContain("1 of 5");
    expect(position.textContent).toContain("2024-05-20T13:00:00Z");
    await click(must(container, '[data-slot="replay-speed-1"]'));
    expect(must(container, '[data-slot="replay-speed-1"]').getAttribute("aria-pressed")).toBe("true");
    await click(must(container, '[data-slot="replay-play"]'));
    // 1×: 5 s of wall time is 5 s of sim time, short of the first message at +10 s.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(must(container, '[data-slot="replay-position"]').textContent).toContain("1 of 5");
    await vi.advanceTimersByTimeAsync(5_200);
    expect(must(container, '[data-slot="replay-position"]').textContent).toContain("3 of 5");
    // 60×: the next message is 9 min 50 s of sim later, about 10 s of wall time.
    await click(must(container, '[data-slot="replay-speed-60"]'));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(must(container, '[data-slot="replay-position"]').textContent).toContain("3 of 5");
    await vi.advanceTimersByTimeAsync(1_200);
    expect(must(container, "[data-replay-state]").getAttribute("data-replay-state")).toBe("ended");
  });

  it("ENDED: says the session ended, keeps the event log readable, and never navigates to the live report", async () => {
    window.location.hash = "#/replay";
    const { container } = await open(async () => json(recording()));
    await pause(container);
    for (let i = 0; i < 4; i++) await click(must(container, '[data-slot="replay-step"]'));
    expect(must(container, "[data-replay-state]").getAttribute("data-replay-state")).toBe("ended");
    expect(must(container, '[data-slot="replay-ended"]').textContent).toContain("Session ended");
    expect(container.querySelectorAll(".event-row")).toHaveLength(2);
    expect(window.location.hash).toBe("#/replay");
  });

  it("HTTP error, bad JSON and an invalid recording each say why", async () => {
    for (const [fetchImpl, text] of [
      [async () => json({ error: "nope" }, 404), "HTTP 404"],
      [async () => new Response("<html>", { status: 200 }), "not valid JSON"],
      [async () => json({ format: "other" }), "Invalid recording"],
      [async () => { throw new TypeError("Failed to fetch"); }, "Failed to fetch"],
    ] as const) {
      const { container, unmount } = await open(fetchImpl);
      expect(must(container, '[role="alert"]').textContent).toContain(text);
      expect(container.querySelector("main")).not.toBeNull();
      await unmount();
    }
  });

  it("entering the replay closes the tab's live Hab Core connection", async () => {
    const close = vi.fn();
    const socket: SocketLike = { readyState: 1, send: () => {}, close, onopen: null, onmessage: null, onclose: null } as unknown as SocketLike;
    startHabSession({ role: "ops", clientId: "c-1", displayName: "Ops console", url: "ws://localhost/ws", socketFactory: () => socket });
    await open(async () => json(recording()));
    expect(close).toHaveBeenCalled();
  });

  it("never calls /api/relay-coverage when a replayed rover carries relay_coverage_rev", async () => {
    stubResizeObserver();
    const restoreMotion = stubReducedMotion(true);
    const style = document.createElement("style");
    style.textContent = readFileSync(resolve(__dirname, "../../src/ui/styles/tokens.css"), "utf8");
    document.head.appendChild(style);
    try {
      const manifest = mockManifest();
      const networkFetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("site-manifest.json")) return json(manifest);
        if (url.endsWith(".geojson")) return json({ type: "FeatureCollection", features: [] });
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal("fetch", networkFetch);
      Object.assign(window, { innerWidth: 1280 });
      const rec = recording();
      const snap = rec.messages[0] as Snapshot;
      snap.plan = { plan_id: "p-1", plan_revision: 1, site_id: manifest.site_id, waypoints: [], legs: [], route_polyline_m: [] } as unknown as Snapshot["plan"];
      snap.vehicles = [{ vehicle_id: "UR1", kind: "utility_rover", state: "IDLE", x_m: 0, y_m: 0, path: [], task: null, relay_coverage_rev: 1 } as unknown as Snapshot["vehicles"][number]];
      const { container } = await open(async () => json(rec));
      await pause(container);
      for (let i = 0; i < 30; i++) {
        await flush();
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(must(container, '[data-slot="ops-map"] button[aria-label="Zoom in"]').hasAttribute("disabled")).toBe(false);
      const apiCalls = networkFetch.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/"));
      expect(apiCalls).toEqual([]);
    } finally {
      style.remove();
      restoreMotion();
    }
  });
});
