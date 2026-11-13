/**
 * T12.04 — the methods content (SCR-09; 03 SCR-09; 02 §A.2, §C.2, §D.1–§D.5; FR-15).
 *
 * FD-148: this file replaces the manual checklist of T12.04. Every entry must cite a section of 02 or 03 that
 * exists, and every source id it names must resolve to a DataSource of the site bundle or of the pipeline's
 * source records. Nothing here checks the wording against the spec by eye: a citation that points at a heading
 * that is not there fails the test, so a stale reference cannot survive.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import methodsJson from "../../src/ui/content/methods.json";
import type { MethodsContent } from "../../src/ui/content/contentTypes";

const methods = methodsJson as MethodsContent;

const ROOT = resolve(__dirname, "../../../..");
const SPEC_01 = readFileSync(join(ROOT, "docs/specs/01_Product_Requirements_Document.md"), "utf8");
const SPEC_02 = readFileSync(join(ROOT, "docs/specs/02_Technical_Requirements_Document.md"), "utf8");
const SPEC_03 = readFileSync(join(ROOT, "docs/specs/03_App_Flow_and_Diagrams.md"), "utf8");

/** The headings of a spec, as the text between the `#`s (the anchor GitHub would use). */
function headingsOf(markdown: string): Set<string> {
  const headings = new Set<string>();
  for (const line of markdown.split("\n")) {
    const match = /^#{2,4}\s+(.*)$/.exec(line);
    if (!match) continue;
    const title = match[1].trim().replace(/\s*\*.*$/, "");
    const anchor = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    headings.add(anchor);
  }
  return headings;
}

const HEADINGS_01 = headingsOf(SPEC_01);
const HEADINGS_02 = headingsOf(SPEC_02);
const HEADINGS_03 = headingsOf(SPEC_03);

/** Every entry of `methods.json` that carries a `spec_ref`. */
function entriesWithRefs(): { id: string; spec_ref: string }[] {
  const out: { id: string; spec_ref: string }[] = [];
  for (const entry of methods.processing) out.push(entry);
  for (const entry of methods.models) out.push(entry);
  for (const entry of methods.limitations) out.push(entry);
  out.push({ id: "ai_use", spec_ref: methods.ai_use.spec_ref });
  return out;
}

/**
 * One cited section: the spec it belongs to and the section itself.
 *
 * The specs number their sections ("§C.2", "§D.4", "SCR-09"), so a reference is split at its separators and each
 * part is checked on its own: "02 §C.2 L1" cites the §C.2 heading and the L1 label inside it, and "02 §D.4, 01 FR-12"
 * cites a section of 02 and a requirement of 01.
 */
function citedParts(specRef: string): { spec: string; part: string }[] {
  const trimmed = specRef.trim();
  // The spec of the reference is the first spec number in it; a part may name its own ("02 §D.4, 01 FR-12").
  const first = /^0(\d)/.exec(trimmed);
  const defaultSpec = first ? `0${first[1]}` : "02";
  // Split on the separators that end a citation (a comma, a slash, a "§"), keeping the space that joins a spec
  // number to its section ("01 FR-12" is one citation, not two).
  const chunks = trimmed
    .replace(/§\s*/g, " ")
    .split(/[,/]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  const out: { spec: string; part: string }[] = [];
  for (const chunk of chunks) {
    const own = /^0(\d)\s+(.*)$/.exec(chunk);
    if (own) {
      for (const part of own[2].split(/\s+/)) {
        if (part) out.push({ spec: `0${own[1]}`, part });
      }
    } else {
      for (const part of chunk.split(/\s+/)) {
        if (part) out.push({ spec: defaultSpec, part });
      }
    }
  }
  return out;
}

/**
 * The anchor prefix a cited part must match: "C.2" -> "c2", "L1" -> "l1", "SCR-09" -> "scr-09".
 *
 * The specs write their headings as "### C.2 Data layers", whose GitHub anchor is "c2-data-layers", so a cited
 * section is the anchor's prefix.
 */
function sectionAnchor(part: string): string {
  const normalised = part.toLowerCase().replace(/[^a-z0-9-]/g, "");
  // "C.2" -> "c2": the dot between the letter and the number is punctuation in the heading, not in the anchor.
  return normalised.replace(/^([a-z])(\d)/, "$1$2");
}

/** The headings of the specs this test checks: 02 (the technical requirements) and 03 (the app flow). */
const HEADINGS_BY_SPEC: Record<string, Set<string>> = { "01": HEADINGS_01, "02": HEADINGS_02, "03": HEADINGS_03 };

describe("methods content (T12.04, FD-148)", () => {
  it("every entry cites an existing 02/03 heading", () => {
    const entries = entriesWithRefs();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const cited = citedParts(entry.spec_ref);
      expect(cited.length, entry.id).toBeGreaterThan(0);
      for (const { spec, part } of cited) {
        const headings = HEADINGS_BY_SPEC[spec];
        expect(headings, `${entry.id} cites the unknown spec ${spec}`).toBeDefined();
        const anchor = sectionAnchor(part);
        const found = [...headings!].some((h) => h === anchor || h.startsWith(`${anchor}-`));
        expect(found, `${entry.id} cites "${entry.spec_ref}", which no heading of ${spec} matches`).toBe(true);
      }
    }
  });

  it("every source id resolves", () => {
    const siteManifest = JSON.parse(
      readFileSync(join(ROOT, "data/sites/mock_site/site-manifest.json"), "utf8"),
    ) as { sources: { source_id: string }[] };
    const known = new Set(siteManifest.sources.map((s) => s.source_id));

    const sourceDir = join(ROOT, "pipeline/sites/gale_boxwork/sources");
    // The pipeline's source folder holds one file per DataSource; the files themselves are the authority.
    const pipelineSources = new Set<string>();
    for (const file of existsSync(sourceDir) ? readdirSync(sourceDir) : []) {
      if (file.endsWith(".json")) pipelineSources.add(file.replace(/\.json$/, ""));
    }

    const ids = new Set<string>();
    for (const entry of methods.processing) for (const id of entry.source_ids) ids.add(id);
    for (const entry of methods.models) for (const id of entry.source_ids) ids.add(id);
    for (const entry of methods.limitations) for (const id of entry.source_ids) ids.add(id);

    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      expect(known.has(id) || pipelineSources.has(id), `${id} resolves to no DataSource`).toBe(true);
    }
  });

  it("the AI-use statement is the 03 SCR-09 wording", () => {
    expect(methods.ai_use.text).toBe("No AI computes or generates values in this app.");
  });

  it("the radiation model carries the FD-128 label", () => {
    const radiation = methods.models.find((m) => m.id === "model-radiation-dose");
    expect(radiation).toBeDefined();
    expect(radiation?.label).toBe("measured background rate × planned duration (simplified)");
  });

  it("the walking-speed model carries the 02 §D.3 label verbatim", () => {
    const speed = methods.models.find((m) => m.id === "model-walking-speed");
    expect(speed?.label).toBe(
      "modelled — Earth hiking function scaled to an Apollo lunar planning speed; not validated for Mars suits or 0.38 g",
    );
  });

  it("every model has a label and every entry has a provenance class", () => {
    // A model whose spec section states no formula (Mars24 is an algorithm, 02 §D.5) carries no equation; a
    // model that has equations states at least one.
    for (const model of methods.models) {
      expect(model.label.trim().length, model.id).toBeGreaterThan(0);
      if (model.equations !== undefined) expect(model.equations.length, model.id).toBeGreaterThan(0);
    }
    const classes = new Set(["measured", "derived", "modelled", "assumed", "replayed", "simulated"]);
    for (const entry of [...methods.processing, ...methods.models, ...methods.limitations]) {
      expect(classes.has(entry.provenance), `${entry.id}: ${entry.provenance}`).toBe(true);
      expect(entry.source_ids.length, `${entry.id} names no source`).toBeGreaterThan(0);
    }
  });
});
