/**
 * Check `earth-message` (T18.12, FR-48; 03 SCR-16; 02 §D.12).
 *
 * The acceptance of T18.12 is "Messages from the Earth view arrive at Mars at the rule's time". This check sends a message
 * from the SCR-16 composer — the real UI, never a WebSocket frame — and asserts the arrival happens at the time the rule
 * computes, not before and not after.
 *
 * The rule, from `packages/compute/src/earthLink.ts` (header lines 3-6, `to_mars` branch lines 238-276):
 *
 *   Earth → Mars: t_deliver = next_pass_start(t_send_earth + light_time)
 *
 * So a message sent while no relay is overhead waits for the next pass: it is queued with that pass's start as
 * `deliver_utc`, and the Hab Core delivers it in the tick that reaches that time (`apps/hab-core/src/engine/earth.ts`,
 * `earthTick`: a QUEUED message whose `deliver_utc` is at or before sim time is delivered).
 *
 * The default harness uses a declared synthetic table; the real-site run reads the committed storm table and link parameters.
 * In both cases compute's deliveryTime is the oracle; the test does not prescribe a science value.
 *
 * Determinism: the mission clock is driven, never waited on. The clock is paused while the message is sent, then resumed
 * and stepped with the ops console's own controls until the delivery time.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deliveryTime } from "@marswalk/compute";
import type { EarthLinkTable, ParamSet } from "@marswalk/protocol";
import { openFreshOps, sessionLog, sessionSnapshot, startPaused, watchLive } from "../lib/liveMission";
import { syntheticEarthLink } from "../lib/fakeScenario";
import { e2eSite, REAL_SITE } from "../lib/siteBundle";

test("earth-message: a message typed in the SCR-16 composer arrives at Mars at the rule's time (T18.12)", async ({ context }) => {
  test.setTimeout(480_000);
  const { ops, wire } = await openFreshOps(context);
  const earth = await context.newPage();
  try {
    await startPaused(ops, wire);
    const start = (await sessionSnapshot(ops)).session.clock.sim_time;
    const root = join(import.meta.dirname, "../../../..");
    const real = e2eSite() === REAL_SITE;
    const table = real ? JSON.parse(readFileSync(join(root, "scenarios/storm-sol4190/earth_link.json"), "utf8")) as EarthLinkTable : syntheticEarthLink(start);
    const paramsPath = real ? "scenarios/storm-sol4190/param_sets/link-assumed.json" : "apps/hab-core/tests/fixtures/fake-scenario/param_sets/link-assumed.json";
    const params = JSON.parse(readFileSync(join(root, paramsPath), "utf8")) as ParamSet;

    const earthWire = watchLive(earth);
    await earth.goto("/#/earth");
    await expect(earth.getByRole("heading", { name: "Earth support" })).toBeVisible();

    // The message goes through the real composer: type it, then press the view's own submit button.
    await earth.getByLabel("Message", { exact: true }).fill("Request a status check");
    await earthWire.command("SEND_MESSAGE", () => earth.getByRole("button", { name: "Send message" }).click());
    await expect(earth.getByRole("status")).toHaveText("Message queued.");

    // The outgoing queue shows the message with the delivery time the engine computed, labelled with its own source.
    const queued = earth.locator('[data-source="snapshot:earth.queue.deliver_utc"]');
    await expect(queued).toHaveCount(1);
    await expect(queued).toHaveAttribute("data-provenance", "derived");
    const deliverUtc = await queued.textContent();
    const firstPassStart = Date.parse(deliverUtc!);
    // The queue entry is still waiting: the rule's time has not come.
    await expect(earth.locator('[data-source="snapshot:earth.queue.state"]')).toHaveText("QUEUED");

    // The engine logged the queueing with the same time (the log is the authority the report reads).
    const queuedEvent = (await sessionLog(ops)).find((event) => event.kind === "EARTH_MSG_QUEUED");
    expect(queuedEvent, "the Hab Core logged the queueing").toBeTruthy();
    expect((queuedEvent!.data as { direction: string; deliver_utc: string }).direction).toBe("to_mars");
    expect((queuedEvent!.data as { deliver_utc: string }).deliver_utc).toBe(deliverUtc);
    const sent = (queuedEvent!.data as { sent_utc: string }).sent_utc;
    expect(firstPassStart).toBe(Date.parse(deliveryTime(table, "to_mars", sent, params)!.deliver_utc));
    expect(firstPassStart).toBeGreaterThan(Date.parse(sent));

    // Before the rule's time nothing is delivered: step the clock to a point clearly before it and look again. The margin is
    // five minutes so the clock's own overshoot (the clock runs at 60x while the check polls) cannot reach the delivery time.
    await stepClockTo(ops, wire, firstPassStart - 5 * 60_000);
    if (real) expect((await sessionSnapshot(ops)).session.status).toBe("ENDED");
    expect((await sessionLog(ops)).some((event) => event.kind === "EARTH_MSG_DELIVERED"), "not delivered before the rule's time").toBe(false);
    await expect(earth.locator('[data-source="snapshot:earth.queue.state"]')).toHaveText("QUEUED");

    // At the rule's time the Hab Core delivers it, exactly once. The delivery tick is the one that reaches the delivery time.
    await stepClockTo(ops, wire, firstPassStart);
    const delivered = (await sessionLog(ops)).filter((event) => event.kind === "EARTH_MSG_DELIVERED");
    expect(delivered, "delivered once").toHaveLength(1);
    expect((delivered[0]!.data as { message_id: string }).message_id).toBe((queuedEvent!.data as { message_id: string }).message_id);
    expect(Date.parse(delivered[0]!.sim_time), "delivered at the rule's time").toBe(firstPassStart);

    // The queue entry leaves the outgoing list: a delivered message is no longer on its way to Mars.
    await expect(earth.locator('[data-source="snapshot:earth.queue.deliver_utc"]')).toHaveCount(0);
    await expect(earth.getByText("No messages queued.")).toBeVisible();
  } finally { await earth.close(); await ops.close(); }
});

/**
 * Runs the mission clock to `targetMs` with the ops console's own controls: it resumes the clock when it is paused, waits for
 * the sim time to reach the target, and pauses it again. The clock is never waited on in real time: the check waits for the
 * sim time the Hab Core reports.
 */
async function stepClockTo(ops: import("@playwright/test").Page, wire: ReturnType<typeof watchLive>, targetMs: number): Promise<void> {
  const resume = ops.getByRole("button", { name: "Resume mission clock", exact: true });
  if (await resume.count()) await wire.command("SET_CLOCK", () => resume.click());
  await expect
    .poll(async () => Date.parse((await sessionSnapshot(ops)).session.clock.sim_time), { message: "the sim clock reaches the target", timeout: 360_000 })
    .toBeGreaterThanOrEqual(targetMs);
  const pause = ops.getByRole("button", { name: "Pause mission clock", exact: true });
  if (await pause.count()) await wire.command("SET_CLOCK", () => pause.click());
}
