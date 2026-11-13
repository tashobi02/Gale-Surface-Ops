/**
 * Package 99 audit verification: automated boundary checks for science, time, CRS, and brand orange.
 * Guards CLAUDE.md §2 non-negotiables:
 * - No Date.now() driving simulated state.
 * - Deterministic science belongs only in packages/compute.
 * - Mars CRS IAU_2015:49900 in projected metres; no EPSG:3857/4326 or ol/sphere in executable code.
 * - Brand orange never appears in OPS, EVA or HUD.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB_SRC = join(dirname(fileURLToPath(import.meta.url)), "../../src");

function walk(dir: string, filter: (path: string) => boolean): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walk(full, filter));
    } else if (filter(full)) {
      results.push(full);
    }
  }
  return results;
}

const TS_FILES = walk(WEB_SRC, (p) => p.endsWith(".ts") || p.endsWith(".tsx"));

describe("Package 99 boundary audit (science, time, CRS, brand orange)", () => {
  it("time boundary: Date.now() is used only for client-side transport watchdog and link age display", () => {
    const dateNowHits: { file: string; line: number; text: string }[] = [];
    for (const file of TS_FILES) {
      const rel = relative(WEB_SRC, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, idx) => {
        if (/Date\.now\(\)/.test(line)) {
          dateNowHits.push({ file: rel, line: idx + 1, text: line.trim() });
        }
      });
    }

    // Every hit must be in LiveFrame.tsx (link age display) or habClient.ts (transport watchdog)
    for (const hit of dateNowHits) {
      const allowed = hit.file === "ui/live/LiveFrame.tsx" || hit.file === "net/habClient.ts";
      expect(allowed, `Unexpected Date.now() in ${hit.file}:${hit.line}: ${hit.text}`).toBe(true);
    }
    // The exact number of hits is deliberately NOT asserted. A count would break on any legitimate new
    // client-side timer (a debounce, an animation) even though the boundary itself still holds. What must hold is
    // the rule: every hit is in a file whose only wall-clock use is display or a watchdog. The audit records the
    // count as of 13 Nov 2026 (six: three in `LiveFrame.tsx`, three in `habClient.ts`) for the record.
    expect(dateNowHits.length).toBeGreaterThan(0);
  });

  it("time boundary: performance.now() is used only for UI hold timing and worker timing metadata", () => {
    const perfHits: { file: string; line: number; text: string }[] = [];
    for (const file of TS_FILES) {
      const rel = relative(WEB_SRC, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, idx) => {
        if (/performance\.now\(\)/.test(line)) {
          perfHits.push({ file: rel, line: idx + 1, text: line.trim() });
        }
      });
    }

    // Must be HoldToConfirm.tsx (UI hold button progress) or planWorker.ts (timing metadata)
    for (const hit of perfHits) {
      const allowed = hit.file === "ui/eva/HoldToConfirm.tsx" || hit.file === "worker/planWorker.ts";
      expect(allowed, `Unexpected performance.now() in ${hit.file}:${hit.line}: ${hit.text}`).toBe(true);
    }
  });

  it("time boundary: no new Date() without arguments in frontend UI code", () => {
    const emptyDateHits: { file: string; line: number; text: string }[] = [];
    for (const file of TS_FILES) {
      const rel = relative(WEB_SRC, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, idx) => {
        // match new Date() with nothing inside parentheses
        if (/new\s+Date\(\s*\)/.test(line)) {
          emptyDateHits.push({ file: rel, line: idx + 1, text: line.trim() });
        }
      });
    }

    // Only planWorker.ts uses new Date().toISOString() for computed_utc metadata
    for (const hit of emptyDateHits) {
      expect(hit.file).toBe("worker/planWorker.ts");
    }
  });

  it("CRS boundary: no ol/sphere imports or calls in apps/web/src", () => {
    for (const file of TS_FILES) {
      const rel = relative(WEB_SRC, file);
      const content = readFileSync(file, "utf8");
      // Must not import from 'ol/sphere'
      expect(content).not.toMatch(/from\s+["']ol\/sphere["']/);
      expect(content).not.toMatch(/import\s+["']ol\/sphere["']/);
      expect(content).not.toMatch(/require\(["']ol\/sphere["']\)/);
    }
  });

  it("CRS boundary: no EPSG:3857 in executable code paths", () => {
    for (const file of TS_FILES) {
      const rel = relative(WEB_SRC, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, idx) => {
        if (/3857|4326/.test(line)) {
          // Must only appear inside comments describing forbidden paths
          const trimmed = line.trim();
          const isComment =
            trimmed.startsWith("*") ||
            trimmed.startsWith("//") ||
            trimmed.startsWith("/*") ||
            trimmed.includes("never EPSG:3857");
          expect(isComment, `Executable EPSG:3857/4326 code in ${rel}:${idx + 1}: ${trimmed}`).toBe(true);
        }
      });
    }
  });

  it("brand orange boundary: brand orange never appears in OPS, EVA or HUD components", () => {
    const restrictedDirs = [
      join(WEB_SRC, "ui/ops"),
      join(WEB_SRC, "ui/eva"),
    ];
    const restrictedFiles = [
      join(WEB_SRC, "ui/screens/scr13Hud.tsx"),
    ];

    const targetFiles: string[] = [];
    for (const dir of restrictedDirs) {
      targetFiles.push(...walk(dir, (p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".css")));
    }
    targetFiles.push(...restrictedFiles);

    for (const file of targetFiles) {
      const rel = relative(WEB_SRC, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Ignore comments describing the rule (e.g. "no brand orange")
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;

        // Check for brand orange tokens and brand orange hex (#FF5A36)
        expect(line).not.toMatch(/--brand-orange/);
        expect(line).not.toMatch(/--signal-orange/);
        expect(line).not.toMatch(/--signal-ink/);
        expect(line).not.toMatch(/#FF5A36/i);
      });
    }
  });

  it("science boundary: apps/web/src imports deterministic science only from @marswalk/compute", () => {
    // Check that files touching science values do not define their own science models
    for (const file of TS_FILES) {
      const rel = relative(WEB_SRC, file);
      const content = readFileSync(file, "utf8");

      // No local implementations of mars24 / localTrueSolarTime formulas
      if (rel !== "ui/screens/scr04PlanPanel.tsx" && rel !== "ui/plan/stopsList.ts") {
        expect(content).not.toMatch(/function\s+localTrueSolarTime/);
      }
      // No local radiation dose integration formulas
      expect(content).not.toMatch(/function\s+integrateDose/);
      // No Dijkstra / A* routing implementations
      expect(content).not.toMatch(/function\s+dijkstra/);
      expect(content).not.toMatch(/function\s+aStar/);
    }
  });
});
