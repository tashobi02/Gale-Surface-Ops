/**
 * N-21: `log_hash` is the SHA-256 of the bytes of session.jsonl, and the helpers in `packages/protocol/src/logHash.ts` give the
 * same hash with node:crypto (the Hab Core) and WebCrypto (the Pages replay). docs/plan/backend/01-contract.md §7; 05 Session.
 */
import { createHash, webcrypto } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { logHashOf, logLine, type LogEvent } from "@marswalk/protocol";
import { readScenario } from "../src/scenario";
import { loadSession } from "../src/session";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const nodeSha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const webSha = async (text: string): Promise<string> =>
  Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function session(): { events: LogEvent[]; hash: string; file: string } {
  const varDir = mkdtempSync(join(tmpdir(), "marswalk-loghash-"));
  dirs.push(varDir);
  const s = loadSession(fake, varDir);
  s.apply({ command_id: "k-1", role: "ops", kind: "START_EVA", args: {} }, "c-ops");
  s.advance(120);
  const file = readFileSync(join(varDir, "sessions/s-0001/session.jsonl"), "utf8");
  return { events: s.eventsAfter(0), hash: s.snapshot([]).session.log_hash, file };
}

describe("logHashOf (N-21)", () => {
  it("with node:crypto gives the Hab Core's log_hash", () => {
    const { events, hash, file } = session();
    expect(events.length).toBeGreaterThan(3);
    expect(logHashOf(events, nodeSha)).toBe(hash);
    expect(events.map(logLine).join("")).toBe(file);
  });

  it("with WebCrypto gives the same hash as node:crypto", async () => {
    const { events, hash } = session();
    expect(await logHashOf(events, webSha)).toBe(hash);
  });

  it("an empty log hashes the empty string", async () => {
    expect(logHashOf([], nodeSha)).toBe(nodeSha(""));
    expect(await logHashOf([], webSha)).toBe(nodeSha(""));
  });
});
