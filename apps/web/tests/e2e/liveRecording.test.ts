/** The actual backend-published recording, without a browser or any real site assets. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson, type Recording } from "@marswalk/protocol";
import { createReplaySource } from "../../src/net/replaySource";

const path = new URL("../../../../scenarios/storm-sol4190/recording.json", import.meta.url);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const read = () => JSON.parse(readFileSync(path, "utf8")) as Recording;

describe.skipIf(!existsSync(path))("package 29 committed storm recording (bundle absent if recording missing)", () => {
  it("consumes the complete log to the published end state and independently matches the advertised hash", async () => {
    const recording = read();
    const events = recording.messages.flatMap((m) => m.type === "EVENT" ? [m.event] : []);
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    const expected = sha(events.map((e) => `${canonicalJson(e)}\n`).join(""));
    expect(expected).toBe(recording.log_hash);
    const source = await createReplaySource(recording, sha);
    try {
      expect(source.hashCheck()).toMatchObject({ status: "verified", computed: expected, recorded: expected });
      source.advanceTo(Infinity);
      expect(source.playbackState()).toBe("ended");
      expect(source.position().index).toBe(recording.messages.length);
      expect(source.events()).toEqual(events);
      expect(source.state()?.session).toMatchObject({ status: "ENDED", log_hash: expected });
      expect(source.state()?.sim_time).toBe(recording.messages.at(-1)!.sim_time);
      expect(source.state()?.crew.every((c) => c.activity === "SHELTERED" || c.activity === "IN_HAB")).toBe(true);
    } finally { source.close(); }
  });
  it("detects a changed recorded event even when the advertised hash and snapshots are unchanged", async () => {
    const recording = read();
    const message = recording.messages.find((m) => m.type === "EVENT")!;
    if (message.type !== "EVENT") throw new Error("no recorded event");
    message.event.actor = message.event.actor === "ops" ? "system" : "ops";
    const source = await createReplaySource(recording, sha);
    try { expect(source.hashCheck().status).toBe("mismatch"); } finally { source.close(); }
  });
});
