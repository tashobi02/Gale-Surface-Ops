/** SCR-11 states from the committed WS fixtures; no backend state is invented by the screen. */
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { LogEvent, Snapshot } from "@marswalk/protocol";

export type OpsFixtureState = "no-session" | "loaded" | "running" | "paused" | "alerting" | "ended";
export async function openOpsFixture(page: Page, state: OpsFixtureState): Promise<{ commands: { kind: string; args: Record<string, unknown> }[] }> {
  const commands: { kind: string; args: Record<string, unknown> }[] = [];
  const snapshot = (JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/connect.json", import.meta.url), "utf8")) as Snapshot[])[0]!;
  snapshot.session.status = state === "ended" ? "ENDED" : state === "loaded" ? "LOADED" : state === "paused" ? "PAUSED" : "RUNNING";
  snapshot.session.clock.paused = state === "paused" || state === "loaded";
  const events: { event: LogEvent }[] = state === "alerting" ? [
    ...JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/radiation-alert.json", import.meta.url), "utf8")),
    ...JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/options-proposed.json", import.meta.url), "utf8")),
  ] : [];
  const alert = events.find(({ event }) => event.kind === "ALERT_RAISED")?.event;
  const proposal = events.find(({ event }) => event.kind === "OPTIONS_PROPOSED")?.event;
  if (alert) snapshot.alerts = [{ ...alert.data, raised_seq: alert.seq, acked_seq: null, cleared_seq: null, acked_by: null } as Snapshot["alerts"][number]];
  if (proposal) snapshot.options = proposal.data.options as Snapshot["options"];
  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage((message) => {
      // 02 §E.6 / ws.ts: per-kind fields are nested in `command`.
      const request = JSON.parse(String(message)) as { type?: string; command_id?: string; command?: { kind?: string; args?: Record<string, unknown> } };
      if (request.type === "COMMAND" && request.command?.kind === "APPROVE_OPTION") {
        commands.push({ kind: request.command.kind, args: request.command.args ?? {} });
        socket.send(JSON.stringify({ v: snapshot.v, type: "COMMAND_RESULT", command_id: request.command_id, ok: true, event_seq: snapshot.seq }));
      }
      if (request.type === "HELLO" && state !== "no-session") {
        socket.send(JSON.stringify(snapshot));
        for (const event of events) socket.send(JSON.stringify(event));
      }
    });
  });
  await page.goto("about:blank");
  await page.goto("/?site=mock_site#/ops");
  if (state === "ended") await page.waitForURL(/#\/report/);
  else if ((page.viewportSize()?.width ?? 1280) < 1024) await page.getByRole("heading", { name: "Use a larger screen" }).waitFor();
  else if (state === "no-session") await page.getByTestId("clock-control").waitFor();
  else await page.locator('.crew-card').first().waitFor({ state: "attached" });
  return { commands };
}
