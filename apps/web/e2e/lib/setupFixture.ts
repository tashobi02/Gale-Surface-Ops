/// <reference types="node" />
/**
 * SCR-20 harness fixture (package 24; FD-344): the states of 03 SCR-20 from committed material, with no backend state invented.
 *
 * Two things in the browser are replaced, for one page only; the Hab Core, its session and the files on disk are not touched:
 *  - the manifest response gets two explicit MOCK `hab_candidates` (the F4 `mock_site` has none). Both records point at the mock
 *    site's own `grid-comm-hab` grid, so the coverage canvas draws real committed bytes. Ids, labels and notes say MOCK.
 *  - the `/ws` socket answers HELLO with the committed `live-loaded` SNAPSHOT (a LOADED session with no plan, F7) and every
 *    COMMAND with a COMMAND_RESULT, because the harness's own session already has a plan and would only ever show Locked.
 *
 * States: `ready`, `computing` (the SELECT_HAB_SITE result is held until `answer()`), `rejected` (every command refused BUSY with a
 * fixed reason) and `locked` (the session is RUNNING, so the setup is closed).
 */
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { Snapshot } from "@marswalk/protocol";
import { startHeartbeat } from "./heartbeat";

export const MOCK_CANDIDATES = ["hab-mock-first", "hab-mock-alternative"] as const;
export type SetupFixtureState = "ready" | "computing" | "rejected" | "locked";
export const REJECTION = "Fixture refusal: the session cannot take this command now";

export interface SetupFixture {
  /** Answers every command held in the `computing` state with ok; a no-op in the other states. */
  answer(): void;
  /** The commands the page sent, as `{kind, args}`, in order. */
  sent: { kind: string; args: Record<string, unknown> }[];
  /** Stops the fixture's heartbeat; the caller does this when the page closes. */
  stop(): void;
}

export async function openSetupFixture(page: Page, state: SetupFixtureState): Promise<SetupFixture> {
  const snapshot = (JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/live-loaded.json", import.meta.url), "utf8")) as Snapshot[])[0]!;
  if (state === "locked") snapshot.session.status = "RUNNING";

  await page.route("**/sites/mock_site/site-manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = (await response.json()) as {
      grid: { hab_mast: { x_m: number; y_m: number; height_m: number }; comm_hab_asset: string };
      aoi: { bbox_geo: number[] };
      default_start: { x_m: number; y_m: number; label: string };
      sources: { source_id: string }[];
    };
    const hab_candidates = MOCK_CANDIDATES.map((candidate_id, index) => ({
      candidate_id,
      label: index === 0 ? "MOCK first choice" : "MOCK alternative",
      rank: index + 1,
      hab_mast: manifest.grid.hab_mast,
      lat: manifest.aoi.bbox_geo[1],
      lon_e: manifest.aoi.bbox_geo[0],
      comm_hab_asset: manifest.grid.comm_hab_asset,
      default_start: manifest.default_start,
      note: "MOCK candidate for the SCR-20 harness check; not a site fact",
      provenance: "assumed",
      source_ids: [manifest.sources[0]!.source_id],
    }));
    // The fixture serves one world: the manifest carries the same data version as the snapshot it answers HELLO with, so
    // the screen does not report a site/session mismatch that the fixture itself created.
    await route.fulfill({ response, json: { ...manifest, data_version: snapshot.session.data_version, hab_candidates } });
  });

  const fixture: SetupFixture = { answer: () => {}, sent: [], stop: () => {} };
  const held: (() => void)[] = [];
  fixture.answer = () => held.splice(0).forEach((send) => send());
  let stopHeartbeat = (): void => {};
  await page.routeWebSocket("**/ws", (socket) => {
    // The Hab Core pings every 2 s and the client reports the link lost after 3 s of silence (02 §E.6). The fixture replaces
    // the server, so it pings too: without it a slow scan (axe on a small project) trips SCR-18 and the overlay covers the
    // screen the check is about to measure.
    stopHeartbeat = startHeartbeat(socket, snapshot.sim_time);
    socket.onMessage((message) => {
      const request = JSON.parse(String(message)) as { type?: string; command_id?: string; command?: { kind: string; args: Record<string, unknown> } };
      if (request.type === "HELLO") socket.send(JSON.stringify(snapshot));
      if (request.type !== "COMMAND" || !request.command_id || !request.command) return;
      fixture.sent.push(request.command);
      const reply = (): void => socket.send(JSON.stringify(state === "rejected"
        ? { v: 1, type: "COMMAND_RESULT", command_id: request.command_id, ok: false, code: "BUSY", message: REJECTION }
        : { v: 1, type: "COMMAND_RESULT", command_id: request.command_id, ok: true, event_seq: snapshot.seq + 1 }));
      if (state === "computing" && request.command.kind === "SELECT_HAB_SITE") held.push(reply);
      else reply();
    });
  });

  await page.goto("about:blank");
  await page.goto("/?site=mock_site#/setup");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-screen="SCR-20"]').waitFor();
  await page.locator('[data-candidate-id="hab-mock-first"] canvas').waitFor({ state: "visible" });
  await page.locator(".setup-state").filter({ hasText: state === "locked" ? /^Locked/ : /^Ready/ }).waitFor();
  fixture.stop = stopHeartbeat;
  return fixture;
}
