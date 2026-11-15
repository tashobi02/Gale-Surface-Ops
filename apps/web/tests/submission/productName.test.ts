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
  // N-170: the backend-owned scenario, replay, hub-core script, the specs, the shared contract, the Makefile and
  // the constitution still carry the retired working title. The frontend surfaces are done (FD-490): the launchpad,
  // the post-EVA report and the export share one boundary statement.
  it.todo("needs N-170: keeps the former working title only in historical records");
  it("the frontend surfaces carry the ADR-013 name only", () => {
    // The frontend lane's own files must not name the retired product. The negative assertion in the video-plan
    // test needs the literal, so that one file is exempt with a reason.
    const exempt = new Set(["apps/web/tests/video/video_plan_test.py"]);
    const retired = ["Marswalk", "Surface", "Ops"].join(" ");
    // Search the owned surfaces directly: walking the whole checkout first also scans
    // downloaded datasets and operator-local histories unrelated to this assertion.
    const found = ["apps/web", "docs/design"].flatMap((dir) => matchingFiles(join(root, dir), retired));
    if (readFileSync(join(root, "docs/ops/demo-script.md"), "utf8").includes(retired)) found.push("docs/ops/demo-script.md");
    const unexpected = found.filter((name) => !exempt.has(name));
    expect(unexpected).toEqual([]);
  });
  it("shows no retired working title on visible UI surfaces in apps/web/src or index.html", () => {
    const technicalTokens = /@marswalk\/|marswalk-ortho|marswalk-recording|marswalk-crosshair|marswalk_grid/g;
    const retired = /\bmarswalk\b/i;
    const targets = ["apps/web/index.html", ...matchingFiles(join(root, "apps/web/src"), "")];
    const hits = targets.filter((name) => retired.test(readFileSync(join(root, name), "utf8").replace(technicalTokens, "")));
    expect(hits).toEqual([]);
  });
});
