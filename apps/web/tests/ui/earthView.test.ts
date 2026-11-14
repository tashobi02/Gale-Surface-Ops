import { describe, expect, it } from "vitest";
import type { EarthMessage } from "@marswalk/protocol";
import { earthLinkState, asOfStamp, outgoingToMars } from "../../src/ui/screens/scr16EarthView";
import { parseHash } from "../../src/ui/router";

describe("SCR-16 Earth view", () => {
  it("connects with the earth role", () => expect(parseHash("#/earth").role).toBe("earth"));
  it("shows conjunction blackout", () => expect(earthLinkState({ blackout: true })).toBe("CONJUNCTION BLACKOUT"));
  it("does not invent an available or waiting relay state", () => expect(earthLinkState({ blackout: false })).toBeNull());
  it("shows supplied link states", () => {
    expect(earthLinkState({ blackout: false, link_state: "AVAILABLE" })).toBe("AVAILABLE");
    expect(earthLinkState({ blackout: false, link_state: "WAITING" })).toBe("WAITING");
  });
  it("shows unavailable when the feed is absent", () => expect(earthLinkState(null)).toBeNull());
  it("formats an as-of stamp from simulated timestamps", () => expect(asOfStamp("2026-11-13T12:00:00Z", "2026-11-13T12:13:00Z")).toBe("as of 12:00 (13 min ago)"));
  it("rejects future or missing timestamps", () => {
    expect(asOfStamp("2026-11-13T12:14:00Z", "2026-11-13T12:13:00Z")).toBeNull();
    expect(asOfStamp(null, "2026-11-13T12:13:00Z")).toBeNull();
  });
});

/** T18.12: the outgoing queue shows the messages on their way to Mars, with the arrival time the engine computed. */
describe("the SCR-16 outgoing queue (T18.12, FR-48)", () => {
  const message = (over: Partial<EarthMessage>): EarthMessage => ({
    message_id: "m-1",
    direction: "to_mars",
    body: "Request a status check",
    sent_utc: "2024-05-20T00:00:00Z",
    deliver_utc: "2024-05-20T00:30:00.000Z",
    via: "mro",
    state: "QUEUED",
    provenance: { state: "simulated", deliver_utc: "derived" },
    ...over,
  });

  it("keeps a queued Earth → Mars message with the delivery time the engine computed", () => {
    const queue = outgoingToMars([message({})]);
    expect(queue).toHaveLength(1);
    // The arrival time is the engine's, never one the page computed.
    expect(queue[0]!.deliver_utc).toBe("2024-05-20T00:30:00.000Z");
    expect(queue[0]!.provenance.deliver_utc).toBe("derived");
  });

  it("drops a delivered message: it has arrived and is no longer on its way", () => {
    expect(outgoingToMars([message({ state: "DELIVERED" })])).toEqual([]);
  });

  it("leaves out messages bound for Earth", () => {
    expect(outgoingToMars([message({ direction: "to_earth" })])).toEqual([]);
  });

  it("keeps an in-transit message", () => {
    expect(outgoingToMars([message({ state: "IN_TRANSIT" })])).toHaveLength(1);
  });

  it("has nothing to show when the snapshot carries no queue", () => {
    expect(outgoingToMars(undefined)).toEqual([]);
    expect(outgoingToMars([])).toEqual([]);
  });
});
