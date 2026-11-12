/**
 * Canonical JSON (RFC 8785, JCS) for the plan hash (05 §C PlanExport; FD-134).
 *
 * The same rule the Hab Core uses for `log_hash` (packages/protocol/src/logHash.ts), so the web client
 * and the server agree on the bytes that are hashed: object keys sorted by UTF-16 code units (JavaScript's
 * default sort), no whitespace, strings and numbers as `JSON.stringify` writes them (ECMAScript
 * `Number::toString`, so `1.0` becomes `1` and `1e21` becomes `1e+21`).
 *
 * A property whose value is `undefined` is left out and an `undefined` array item becomes `null`, as in
 * `JSON.stringify`. A non-finite number is not a JSON number and throws rather than silently writing
 * `null` (a hash over `null` would differ from the server's).
 */

/** Canonical JSON of a JSON value. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "boolean" || type === "string") return JSON.stringify(value);
  if (type === "number") {
    if (!Number.isFinite(value as number)) throw new Error(`canonicalJson: ${String(value)} is not a JSON number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      const item = obj[key];
      if (item === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalJson(item)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonicalJson: cannot encode a ${type}`);
}
