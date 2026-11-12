/**
 * Pure `log_hash` helpers shared by the Hab Core (node:crypto) and the web replay (WebCrypto)
 * (docs/plan/backend/01-contract.md §7, N-21). `log_hash` is the SHA-256 (hex) of the bytes of
 * `session.jsonl`: each line is the RFC 8785 canonical JSON of one LogEvent followed by "\n"
 * (05 Session, decided 2026-11-07); an empty log hashes the empty string. No wall-clock, no randomness.
 */
import type { LogEvent } from "./runtime";

/**
 * Canonical JSON (RFC 8785, JCS; 05 PlanExport and Session, decided 2026-11-07): object keys sorted
 * by UTF-16 code units (JavaScript's default sort), no whitespace, strings and numbers as
 * JSON.stringify writes them (ECMAScript Number::toString). Properties whose value is undefined are
 * left out and undefined array items become null, as in JSON.stringify. Non-finite numbers throw.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonicalJson: ${value} is not a JSON number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonicalJson: cannot encode a ${typeof value}`);
}

/** One line of `session.jsonl`: the canonical JSON of the event and "\n". */
export function logLine(event: LogEvent): string {
  return `${canonicalJson(event)}\n`;
}

/**
 * The `log_hash` of a whole log: `sha256Hex` over the concatenated lines. The Hab Core keeps the same value as a
 * running hash. `contract-change:` the contract's one-step `logHashStep(prevHex, event, sha256Hex)` is not
 * implementable, because a SHA-256 digest of the file bytes cannot be extended from its hex digest; this whole-log
 * form gives the committed hash on both sides.
 */
export function logHashOf<T extends string | Promise<string>>(events: readonly LogEvent[], sha256Hex: (text: string) => T): T {
  return sha256Hex(events.map(logLine).join(""));
}
