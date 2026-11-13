/// <reference types="node" />
/**
 * SCR-19 harness fixture (package 23; FD-344): the states of 03 SCR-19 from committed material, with no backend state invented.
 *
 * The presenter panel is the one screen the harness cannot reach through the real Hab Core: its session is the harness's own,
 * which is already running, so the panel would only ever show the running state. One page is replaced for the fixture:
 * the `/ws` socket answers HELLO with the committed `connect` SNAPSHOT (a RUNNING session with a next stop and one crew
 * member on EVA) and every COMMAND with a COMMAND_RESULT, so the panel can be put into the states the accessibility checks
 * need. The Hab Core, its session and the files on disk are not touched.
 *
 * States: `pending` (a command is in flight and the panel shows "Advancing to stop N"), `reset-confirm` (the reset question is
 * open), `rejected` (the command was refused and the reason is shown), `storm-running` (the space weather event has started) and
 * `ended` (the session has ended).
 */
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { Snapshot } from "@marswalk/protocol";
import { startHeartbeat } from "./heartbeat";

export type PresenterFixtureState = "pending" | "reset-confirm" | "rejected" | "storm-running" | "ended";
export const REJECTION = "Fixture refusal: the Hab Core cannot take this command now";

export interface PresenterFixture {
  /** The commands the page sent, as `{kind, args}`, in order. */
  sent: { kind: string; args: Record<string, unknown> }[];
  /** Answers the command held in the `pending` state with ok; a no-op in the other states. */
  answer(): void;
  /** Stops the fixture's heartbeat; the caller does this when the page closes. */
  stop(): void;
}

export async function openPresenterFixture(page: Page, state: PresenterFixtureState): Promise<PresenterFixture> {
  const snapshot = (JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/connect.json", import.meta.url), "utf8")) as Snapshot[])[0]!;
  if (state === "ended") snapshot.session.status = "ENDED";
  if (state === "storm-running") snapshot.session.started_events = [{ event_id: "storm", t0_sim_time: snapshot.sim_time }];

  const fixture: PresenterFixture = { sent: [], answer: () => {}, stop: () => {} };
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
      if (state === "pending") held.push(reply);
      else reply();
    });
  });

  await page.goto("about:blank");
  await page.goto("/?site=mock_site#/presenter");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-screen="SCR-19"]').waitFor();
  // The panel shows "Not connected" until the first snapshot; the session status cell is the value that only a snapshot
  // can change, so waiting for it means the scan never runs against the pre-snapshot panel.
  await page.locator(".presenter-session dd").filter({ hasText: /^(RUNNING|ENDED)$/ }).waitFor();
  if (state === "reset-confirm") await page.getByRole("button", { name: "Reset session" }).click();
  if (state === "pending" || state === "rejected") await page.getByRole("button", { name: "Next stop" }).click();
  fixture.stop = stopHeartbeat;
  return fixture;
}
