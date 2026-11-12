/** Snapshot fixtures for exercising SCR-12 geometry without changing the shared Hab Core session. */
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { Snapshot } from "@marswalk/protocol";

export type EvaFixtureState = "walking" | "at-stop" | "undo-window" | "ops-added-task" | "alerting" | "no-hab-link" | "to-haven";

export function evaFixture(state: EvaFixtureState): Snapshot {
  const snapshot = (JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/connect.json", import.meta.url), "utf8")) as Snapshot[])[0]!;
  const crew = snapshot.crew.find((member) => member.crew_id === "EV1")!;
  crew.activity = state === "to-haven" ? "TO_HAVEN" : ["at-stop", "undo-window", "ops-added-task"].includes(state) ? "AT_STOP" : "WALKING";
  if (state === "no-hab-link") { crew.linked = false; crew.stale = true; }
  if (state === "ops-added-task" && snapshot.tasks[0]) snapshot.tasks[0].origin = "ops";
  if (state === "alerting") snapshot.alerts = [{ alert_id: "alert-fixture", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1"], raised_seq: 1, acked_seq: null, cleared_seq: null, acked_by: null, message: "Shelter now", data: {} }];
  return snapshot;
}

export async function openEvaFixture(page: Page, state: EvaFixtureState): Promise<void> {
  const snapshot = evaFixture(state);
  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage((message) => {
      const request = JSON.parse(String(message)) as { type?: string };
      if (request.type === "HELLO") socket.send(JSON.stringify(snapshot));
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
