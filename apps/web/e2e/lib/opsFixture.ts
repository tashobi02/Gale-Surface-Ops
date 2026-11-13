/** SCR-11 states from the committed WS fixtures; no backend state is invented by the screen. */
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { LogEvent, Snapshot, ServerMessage } from "@marswalk/protocol";

/** Open the panel before a scoped assertion; desktop panels are already visible. */
export async function openOpsPanel(page: Page, panel: "crew" | "mission"): Promise<void> {
  const opener = page.getByRole("button", { name: panel === "crew" ? "Crew & vehicles" : "Conditions & options", exact: true });
  if (await opener.count() && await opener.getAttribute("aria-expanded") === "false") await opener.click();
  await page.locator(`aside[aria-label="${panel === "crew" ? "Crew and vehicles" : "Conditions and options"}"]`).waitFor({ state: "visible" });
}

/** A parked utility rover with an empty queue (package 21), added to a fixture to open SCR-15 from its card. */
export const UTILITY_ROVER: Snapshot["vehicles"][number] = { vehicle_id: "UR1", kind: "utility_rover", param_set: "ur1-assumed", x_m: -1700, y_m: -1450, state: "PARKED", task: null, path: [], eta_s: null, battery_wh: 900, task_id: null, queue: [], relay_coverage_rev: null };

export type OpsFixtureState = "no-session" | "loaded" | "running" | "paused" | "alerting" | "ended";
/** `vehicles` are added to the fixture's vehicle list (package 21: a utility rover to task). */
export async function openOpsFixture(page: Page, state: OpsFixtureState, extra: { vehicles?: Snapshot["vehicles"]; clockKeys?: boolean; denyTask?: boolean } = {}) {
  const commands: { kind: string; args: Record<string, unknown> }[] = [];
  const snapshot = (JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/connect.json", import.meta.url), "utf8")) as Snapshot[])[0]!;
  // Use the committed fake-scenario plan so first-task controls are exercised at an actual planned stop.
  snapshot.plan = (JSON.parse(readFileSync(new URL("../../../hab-core/tests/fixtures/fake-scenario/scenario.json", import.meta.url), "utf8")) as { plan: Snapshot["plan"] }).plan;
  snapshot.session.status = state === "ended" ? "ENDED" : state === "loaded" ? "LOADED" : state === "paused" ? "PAUSED" : "RUNNING";
  snapshot.session.clock.paused = state === "paused" || state === "loaded";
  snapshot.vehicles = [...snapshot.vehicles, ...(extra.vehicles ?? [])];
  const events: { event: LogEvent }[] = state === "alerting" ? [
    ...JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/radiation-alert.json", import.meta.url), "utf8")),
    ...JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/options-proposed.json", import.meta.url), "utf8")),
  ] : [];
  const alert = events.find(({ event }) => event.kind === "ALERT_RAISED")?.event;
  const proposal = events.find(({ event }) => event.kind === "OPTIONS_PROPOSED")?.event;
  if (alert) snapshot.alerts = [{ ...alert.data, raised_seq: alert.seq, acked_seq: null, cleared_seq: null, acked_by: null } as Snapshot["alerts"][number]];
  if (proposal) snapshot.options = proposal.data.options as Snapshot["options"];
  let send: (message: ServerMessage) => void = () => { throw new Error("fixture socket not connected"); };
  await page.routeWebSocket("**/ws", (socket) => {
    send = message => socket.send(JSON.stringify(message));
    socket.onMessage((message) => {
      // 02 §E.6 / ws.ts: per-kind fields are nested in `command`.
      const request = JSON.parse(String(message)) as { type?: string; command_id?: string; command?: { kind?: string; args?: Record<string, unknown> } };
      if (request.type === "COMMAND" && request.command?.kind) {
        commands.push({ kind: request.command.kind, args: request.command.args ?? {} });
        socket.send(JSON.stringify(extra.denyTask && request.command.kind === "ADD_STOP_TASK"
          ? { v: snapshot.v, type: "COMMAND_RESULT", command_id: request.command_id, ok: false, code: "FORBIDDEN_ROLE", message: "ops may not send ADD_STOP_TASK" }
          : { v: snapshot.v, type: "COMMAND_RESULT", command_id: request.command_id, ok: true, event_seq: snapshot.seq }));
      }
      if (request.type === "HELLO" && state !== "no-session") {
        socket.send(JSON.stringify(snapshot));
        for (const event of events) socket.send(JSON.stringify(event));
      }
    });
  });
  await page.goto("about:blank");
  await page.goto(`/?site=mock_site${extra.clockKeys ? "&clock=keys" : ""}#/ops`);
  if (state === "ended") await page.waitForURL(/#\/report/);
  else if ((page.viewportSize()?.width ?? 1280) < 1024) await page.getByRole("heading", { name: "Use a larger screen" }).waitFor();
  else if (state === "no-session") await page.getByTestId("clock-control").waitFor();
  else await page.locator('.crew-card').first().waitFor({ state: "attached" });
  return { commands, snapshot, send };
}
