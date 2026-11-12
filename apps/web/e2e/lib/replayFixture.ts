/// <reference types="node" />
/**
 * `#/replay` with a fixture recording (T27.05). The real recording is N-81 (backend); until it exists the page's request
 * for `replay/recording.json` is answered from the committed WS fixture (`tests/fixtures/ws/connect.json`) plus three
 * events, with a log hash computed here with node:crypto over the canonical log lines (05 Session).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { LogEvent, Recording, Snapshot } from "@marswalk/protocol";

/** RFC 8785 for the plain JSON of these fixtures: sorted keys, no whitespace. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function fixtureRecording(): Recording {
  const snapshot = (JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/connect.json", import.meta.url), "utf8")) as Snapshot[])[0]!;
  snapshot.seq = 0;
  snapshot.sim_time = "2024-05-20T13:00:00Z";
  snapshot.session.status = "RUNNING";
  const ev = (seq: number, sim_time: string, kind: LogEvent["kind"], data: Record<string, unknown>): LogEvent =>
    ({ seq, sim_time, kind, actor: "system", data, provenance: {}, command_ref: null }) as LogEvent;
  const events = [
    ev(1, "2024-05-20T13:00:10Z", "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }),
    ev(2, "2024-05-20T13:05:00Z", "LINK_LOST", { node_id: "EV1" }),
    // An hour later, so the fixture never reaches its end while a check inspects it.
    ev(3, "2024-05-20T14:00:00Z", "LINK_RESTORED", { node_id: "EV1" }),
  ];
  const logHash = createHash("sha256").update(events.map((e) => `${canonical(e)}\n`).join("")).digest("hex");
  return {
    format: "marswalk-recording",
    version: 1,
    scenario_id: snapshot.session.scenario_id,
    seed: snapshot.session.seed,
    data_version: snapshot.session.data_version,
    label: "replayed recording",
    log_hash: logHash,
    messages: [snapshot, ...events.map((event) => ({ v: 1 as const, type: "EVENT" as const, seq: event.seq, sim_time: event.sim_time, event }))],
  };
}

/** Answer the page's recording request with the fixture (call before navigating to `#/replay`). */
export async function routeFixtureRecording(page: Page): Promise<Recording> {
  const recording = fixtureRecording();
  await page.route("**/replay/recording.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(recording) }));
  return recording;
}

/** Open `#/replay` on the fixture recording and pause playback. */
export async function openReplayFixture(page: Page): Promise<Recording> {
  const recording = await routeFixtureRecording(page);
  await page.goto("about:blank");
  await page.goto("/?site=mock_site#/replay");
  await page.locator('[data-slot="replay-banner"]').waitFor();
  const play = page.locator('[data-slot="replay-play"]');
  if ((await play.textContent())?.includes("Pause")) await play.click();
  return recording;
}
