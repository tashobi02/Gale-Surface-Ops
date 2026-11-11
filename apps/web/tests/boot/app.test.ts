/**
 * T07.03 / T25.01 — the app shell end to end in a DOM: hash routes mount the right screens, the live roles get one
 * Hab Core connection per tab from boot, unknown routes are a safe "—" screen, and nothing leaves the Hab Core origin
 * (docs/specs/03 §A; 02 §E.6, NFR-01, NFR-08). Real screens and client, fake sockets, stubbed fetch.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { CSP_HEADER, CSP_META, type ClientMessage, type ServerMessage } from "@marswalk/protocol";
import type { SocketLike } from "../../src/net/habClient";
import { startApp, type AppHandle } from "../../src/boot/app";
import { BootError } from "../../src/boot/loadSite";
import { createPlannerBoot, type PlannerBootDeps } from "../../src/boot/bootPlanner";
import { closeHabSessions } from "../../src/state/habSession";
import type { LoadedSite, WorkerClient } from "../../src/ui/context";
import { wsFixtures } from "../fixtures/ws";
import { click, flush, installDom, must, removeDom } from "../ui/domHarness";

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: ClientMessage[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
  async receive(...messages: ServerMessage[]): Promise<void> {
    await act(async () => {
      for (const m of messages) this.onmessage?.({ data: JSON.stringify(m) });
    });
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const site = { site: { site_id: "mock_site" } } as unknown as LoadedSite;
const plannerDeps = (over: PlannerBootDeps = {}): PlannerBootDeps => ({
  hasWorker: () => true,
  loadSite: async () => site,
  validateSite: () => [],
  createWorkerClient: () => ({ terminate() {} }) as unknown as WorkerClient,
  createPlanStore: () => {
    throw new Error("TODO(T08.03): not implemented");
  },
  ...over,
});

let handle: AppHandle | null = null;
let sockets: FakeSocket[] = [];
let fetched: string[] = [];

async function boot(hash: string, over: { planner?: PlannerBootDeps; fetchImpl?: (url: string) => Promise<Response> } = {}): Promise<HTMLElement> {
  window.location.hash = hash;
  const root = document.createElement("div");
  document.body.appendChild(root);
  const fetchImpl =
    over.fetchImpl ??
    (async (url: string) => {
      fetched.push(url);
      return json({ error: "no session loaded" }, 404);
    });
  await act(async () => {
    handle = await startApp({
      root,
      session: {
        url: "ws://localhost/ws",
        socketFactory: () => {
          const s = new FakeSocket();
          sockets.push(s);
          return s;
        },
      },
      planner: createPlannerBoot(over.planner ?? plannerDeps()),
      fetchImpl,
    });
  });
  await flush();
  return root;
}

async function go(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    await new Promise((r) => setTimeout(r, 20));
  });
  await flush();
}

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(async () => {
  await act(async () => handle?.destroy());
  handle = null;
  sockets = [];
  fetched = [];
  closeHabSessions();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-mode");
  window.location.hash = "";
});

describe("live roles", () => {
  it("#/ops mounts the ops console on the tab's session; HELLO carries the ops role", async () => {
    const root = await boot("#/ops");
    expect(must(root, '[data-surface="ops"]')).toBeTruthy();
    expect(document.documentElement.getAttribute("data-mode")).toBe("ops");
    expect(sockets).toHaveLength(1);
    sockets[0].onopen?.();
    expect(sockets[0].sent[0]).toMatchObject({ type: "HELLO", role: "ops" });

    await sockets[0].receive(...wsFixtures.connect);
    expect(must(root, '[data-surface="ops"]').textContent).toContain("storm-sol4190");
  });

  it("#/eva/EV1 mounts the tablet for EV1 with the eva:EV1 role, and #/hud/EV1 moves the tab to its own hud:EV1 connection", async () => {
    const root = await boot("#/eva/EV1");
    expect(must(root, '[data-screen="SCR-12"]')).toBeTruthy();
    sockets[0].onopen?.();
    expect(sockets[0].sent[0]).toMatchObject({ role: "eva:EV1" });
    await sockets[0].receive(...wsFixtures.connect);

    await go("#/hud/EV1");
    expect(must(root, '[data-screen="SCR-13"]')).toBeTruthy();
    expect(root.querySelector('[data-screen="SCR-12"]')).toBeNull();
    expect(document.documentElement.getAttribute("data-mode")).toBe("hud");
    expect(sockets).toHaveLength(2); // one open connection per tab: the tablet's closes, the HUD's opens
    expect(sockets[0].closed).toBe(true);
    expect(sockets[1].closed).toBe(false);
    sockets[1].onopen?.();
    expect(sockets[1].sent[0]).toMatchObject({ type: "HELLO", role: "hud:EV1" });
  });

  it("moving to another live role closes the first connection: the tab never holds two", async () => {
    const root = await boot("#/ops");
    await go("#/eva/EV2");
    expect(must(root, '[data-screen="SCR-12"]')).toBeTruthy();
    expect(sockets).toHaveLength(2);
    expect(sockets[0].closed).toBe(true);
    expect(sockets[1].closed).toBe(false);
  });

  it("the EVA tablet shows the link-lost overlay when the connection loses the heartbeat (SCR-18)", async () => {
    vi.useFakeTimers();
    try {
      const root = await boot("#/eva/EV1");
      await sockets[0].receive(...wsFixtures.connect);
      await act(async () => {
        vi.advanceTimersByTime(3100);
      });
      expect(must(root, '[data-slot="link-lost-overlay"]').getAttribute("data-surface")).toBe("eva");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaving a role's route for report keeps its connection (no reconnect on the way back)", async () => {
    const root = await boot("#/ops");
    await go("#/report");
    expect(must(root, '[data-surface="report"]')).toBeTruthy();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].closed).toBe(false);
    await go("#/ops");
    expect(sockets).toHaveLength(1);
  });
});

describe("other routes", () => {
  it("#/join mounts SCR-10 and opens no connection", async () => {
    const root = await boot("#/join");
    expect(must(root, ".scr10-join")).toBeTruthy();
    expect(document.documentElement.getAttribute("data-mode")).toBe("brief");
    expect(sockets).toHaveLength(0);
  });

  it("#/report fetches the report from api/report and shows the layout with the failure reason", async () => {
    const root = await boot("#/report");
    expect(fetched).toContain("api/report");
    expect(must(root, '[data-slot="report-status"]').textContent).toContain("no session loaded");
    expect(document.documentElement.getAttribute("data-mode")).toBe("print");
  });

  it("an unknown route is a safe — screen with a way home, never a blank page or a throw", async () => {
    const root = await boot("#/nope");
    const screen = must(root, '[data-screen="unknown"]');
    expect(screen.textContent).toContain("—");
    expect(must(screen, 'a[href="#/join"]')).toBeTruthy();
    expect(sockets).toHaveLength(0);
  });

  it("an unknown route echoes nothing of what was typed", async () => {
    const root = await boot("#/<img src=x onerror=alert(1)>");
    expect(root.querySelector("img")).toBeNull();
    expect(must(root, '[data-screen="unknown"]').textContent).not.toContain("onerror");
  });

  it("#/map is replaced by #/planner", async () => {
    await boot("#/map");
    await flush();
    expect(window.location.hash).toBe("#/planner");
  });

  it("screens that are not built (SCR-16 earth) show a placeholder naming the screen", async () => {
    const root = await boot("#/earth");
    const screen = must(root, '[data-slot="not-built"]');
    expect(screen.textContent).toContain("SCR-16");
    expect(screen.textContent).toContain("—");
  });

  it("a navigation changes the screen without a reload and updates the title", async () => {
    const root = await boot("#/join");
    await go("#/earth");
    expect(root.querySelector(".scr10-join")).toBeNull();
    expect(document.title).toContain("SCR-16");
  });
});

describe("planner routes", () => {
  it("#/planner runs the planner boot, and the workspace root is data-surface planner (04 §C.2: 11 px codes)", async () => {
    const root = await boot("#/planner");
    const surface = must(root, '[data-surface="planner"]');
    expect(surface.getAttribute("data-screen")).toBe("SCR-02");
    // The workspace itself is still a stub: its placeholder says so inside the planner surface.
    expect(must(surface, '[data-slot="not-built"]').textContent).toContain("SCR-02");
    expect(document.documentElement.getAttribute("data-mode")).toBe("ops");
    expect(sockets).toHaveLength(0);
  });

  it("a boot failure is plain text naming the missing file, with a retry that runs the boot again", async () => {
    let fail = true;
    const root = await boot("#/planner", {
      planner: plannerDeps({
        loadSite: async () => {
          if (fail) throw new BootError({ code: "MANIFEST_NOT_FOUND", message: "Site manifest not found", missingFile: "sites/mock_site/site-manifest.json" });
          return site;
        },
      }),
    });
    const failure = must(root, '[data-slot="boot-failure"]');
    expect(failure.textContent).toContain("sites/mock_site/site-manifest.json");
    expect(failure.textContent).toContain("MANIFEST_NOT_FOUND");
    fail = false;
    await click(must(failure, '[data-slot="boot-retry"]'));
    await flush();
    expect(root.querySelector('[data-slot="boot-failure"]')).toBeNull();
    expect(must(root, '[data-slot="not-built"]')).toBeTruthy();
  });

  it("a planner boot failure never touches the live roles: the tablet needs no site", async () => {
    const root = await boot("#/eva/EV1", { planner: plannerDeps({ loadSite: async () => Promise.reject(new Error("no site")) }) });
    expect(must(root, '[data-screen="SCR-12"]')).toBeTruthy();
  });
});

describe("teardown and network", () => {
  it("destroy() stops listening and closes the connection", async () => {
    const root = await boot("#/ops");
    await act(async () => handle?.destroy());
    expect(sockets[0].closed).toBe(true);
    expect(root.innerHTML).toBe("");
    window.location.hash = "#/join";
    await new Promise((r) => setTimeout(r, 20));
    expect(root.innerHTML).toBe("");
  });

  it("every request the shell makes is relative to the Hab Core's own origin", async () => {
    await boot("#/join");
    await go("#/report");
    expect(fetched.length).toBeGreaterThan(0);
    for (const url of fetched) expect(url, url).not.toMatch(/^([a-z]+:)?\/\//i);
  });
});

describe("index.html (NFR-01, NFR-08)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, "../../index.html"), "utf8");
  const policy = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html)?.[1];

  it("carries the one policy constant the Hab Core also serves as its header (review of #219)", () => {
    expect(policy, "CSP meta tag").toBeDefined();
    expect(policy).toBe(CSP_META);
    // frame-ancestors is ignored in a meta tag, so it is header-only; everything else is identical.
    expect(CSP_HEADER).toBe(`${CSP_META}; frame-ancestors 'none'`);
    expect(CSP_META).not.toContain("frame-ancestors");
  });

  it("allows only the page's own origin: no external origin, no inline or eval script, no inline style, no blob or data sources", () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/<(script|link|img)[^>]+(src|href)="(https?:)?\/\//i);
    expect(CSP_META).toContain("default-src 'self'");
    expect(CSP_META).toContain("connect-src 'self'");
    // 02 §F NFR-08 (changed 2026-11-12): 'self' alone; `ws:` would allow a WebSocket to any host.
    expect(CSP_META.split(";").map((d) => d.trim())).toContain("connect-src 'self'");
    expect(CSP_META).not.toMatch(/'unsafe-(inline|eval)'/);
    expect(CSP_META).not.toMatch(/\b(blob|data|ws|wss|http|https):/);
  });

  it("the page has no inline script or style of its own", () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle="/i);
  });
});
