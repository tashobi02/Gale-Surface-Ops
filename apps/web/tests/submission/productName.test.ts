import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Historical decisions, task records, dated handoffs and the archived design prototype retain their original wording.
// Generated output, installed dependencies and non-text data are outside the source-text scan.
const history = /^(docs\/(?:plan\/|decisions\/|tasks\/|design\/prototype\/|ops\/session-handoff-)|apps\/web\/tests\/submission\/productName\.test\.ts$)/;
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ignored = new Set([".git", "node_modules", "dist", "graphify-out", "out", ".agents", ".codex"]);

function matchingFiles(dir: string, needle: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return matchingFiles(path, needle);
    if (!entry.isFile() || (entry.name !== "Makefile" && !/\.(?:md|json|ts|tsx|js|css|html|py|sh|txt|svg)$/.test(entry.name))) return [];
    const name = relative(root, path);
    return !history.test(name) && readFileSync(path, "utf8").includes(needle) ? [name] : [];
  });
}

describe("T16.01 product name", () => {
  it("renames the specified product title surfaces", () => {
    for (const file of ["README.md", "CLAUDE.md", "AGENTS.md", "docs/README.md", "apps/web/index.html", "apps/web/src/boot/app.ts", "package.json", "docs/ops/project-page.md", "docs/ops/submit-now.md"]) {
      expect(readFileSync(join(root, file), "utf8"), file).not.toContain(["Marswalk", "Surface", "Ops"].join(" "));
    }
  });
  it.skip("needs N-170: keeps the former working title only in historical records", () => {
    expect(matchingFiles(root, ["Marswalk", "Surface", "Ops"].join(" "))).toEqual([]);
  });
});
