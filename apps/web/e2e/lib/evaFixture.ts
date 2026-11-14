/** Snapshot fixtures for exercising SCR-12 geometry without changing the shared Hab Core session. */
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { Snapshot } from "@marswalk/protocol";
import { startPageHeartbeat } from "./heartbeat";

export type EvaFixtureState = "walking" | "at-stop" | "undo-window" | "ops-added-task" | "alerting" | "alerting-with-options" | "no-hab-link" | "to-haven";

/** A command the client sent over the mocked WebSocket. */
export interface SentCommand {
  /** The command kind (`UPDATE_STOP_TASK`, `ACK_ALERT`, …), read out of the wire message. */
  kind?: string;
  /** The command's args. */
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export function evaFixture(state: EvaFixtureState): Snapshot {
  const snapshot = (JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/connect.json", import.meta.url), "utf8")) as Snapshot[])[0]!;
  const crew = snapshot.crew.find((member) => member.crew_id === "EV1")!;
  crew.activity = state === "to-haven" ? "TO_HAVEN" : ["at-stop", "undo-window", "ops-added-task"].includes(state) ? "AT_STOP" : "WALKING";
  if (state === "no-hab-link") { crew.linked = false; crew.stale = true; }
  if (state === "ops-added-task" && snapshot.tasks[0]) snapshot.tasks[0].origin = "ops";
  if (state === "alerting" || state === "alerting-with-options") {
    snapshot.alerts = [{ alert_id: "alert-fixture", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1"], raised_seq: 1, acked_seq: null, cleared_seq: null, acked_by: null, message: "Shelter now", data: {} }];
  }
  // A warning with no options yet does not open the SCR-14 sheet (FD-081): the sheet would cover the tablet to say
  // "no options proposed yet". With options it opens on its own.
  if (state === "alerting-with-options") {
    snapshot.options = [
      {
        option_id: "opt-1",
        alert_id: "alert-fixture",
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
  return snapshot;
}

export async function openEvaFixture(page: Page, state: EvaFixtureState, sent?: SentCommand[], extra: Pick<Partial<Snapshot>, "vehicles" | "conditions"> = {}): Promise<void> {
  const snapshot = { ...evaFixture(state), ...extra };
  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage((message) => {
      const request = JSON.parse(String(message)) as { type?: string; command?: { kind?: string; args?: Record<string, unknown> } };
      // Every command the client sends is recorded, so a check can see what the tablet asked the Hab Core to do. The wire
      // message carries the command inside `command` ({ kind, args }), not at the top level.
      if (sent && request.type === "COMMAND" && request.command) {
        sent.push({ kind: request.command.kind, args: request.command.args });
      }
      if (request.type === "HELLO") {
        socket.send(JSON.stringify(snapshot));
        startPageHeartbeat(page, socket, snapshot.sim_time);
      }
    });
  });
  // A goto to the URL the page already shows is a same-document (hash) navigation: the React state of the tablet survives, so
  // the list the last fixture opened would still be open here and the tap on TASKS would close it. Going to about:blank first
  // makes the next goto a real document load, so every state starts from the same blank tablet.
  await page.goto("about:blank");
  await page.goto("/?site=mock_site#/eva/EV1");
  await page.locator('[data-slot="haven"] .value').filter({ hasText: String(Math.round(snapshot.crew.find((member) => member.crew_id === "EV1")!.haven.minutes)) }).waitFor();
  if (state === "undo-window") {
    await page.getByTestId("tasks-button").click();
    await page.getByRole("button", { name: /^Mark task done:/ }).click();
    await page.getByRole("button", { name: /^Undo task change:/ }).waitFor();
  }
}
