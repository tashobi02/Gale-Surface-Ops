/**
 * The shapes of the two content files of SCR-01 and SCR-09 (`briefing.json`, `methods.json`).
 *
 * The JSON modules carry no type of their own, so the screens and the tests read them through these types.
 * `src/export/planExport.ts` builds the export's provenance summary from its own table (FD-244) until the shared
 * `provenanceMap.json` (FD-136) exists.
 */
import type { Provenance } from "@marswalk/protocol";

/** One source id of an entry: a DataSource id of the site bundle. */
export type SourceId = string;

/** An entry of `methods.json`: processing step, model or limitation (T12.04). */
export interface MethodsEntry {
  /** kebab-case id, unique inside its list; the anchor of the entry is `model-<id>` or `layer-<id>`. */
  id: string;
  title: string;
  /** The section this entry is copied from ("02 §C.2 L1"). */
  spec_ref: string;
  /** The class of the values the entry carries (FR-15). */
  provenance: Provenance;
  /** The DataSource ids the entry's values come from. */
  source_ids: SourceId[];
  text: string;
}

/** A model of `methods.json`: a `MethodsEntry` with its equations and its label (02 §D.2–§D.5). */
export interface MethodsModel extends MethodsEntry {
  /** The one-line label of the model, verbatim from its spec section. */
  label: string;
  /** The equations of the model, character for character as the spec writes them. Absent when the spec states none. */
  equations?: string[];
}

/** The AI-use statement of 03 SCR-09. */
export interface MethodsAiUse {
  spec_ref: string;
  title: string;
  text: string;
}

/** The whole `methods.json` (T12.04). */
export interface MethodsContent {
  $comment?: string;
  processing: MethodsEntry[];
  models: MethodsModel[];
  limitations: MethodsEntry[];
  ai_use: MethodsAiUse;
}

/** One dataset of the SCR-09 datasets table (03 SCR-09; FD-143). */
export interface BriefingDataset {
  /** The DataSource id, shown as the catalogue code of the specimen card (04 §E.9). */
  id: string;
  title: string;
  /** The one-line statement of what the dataset is. */
  description: string;
}


/** The whole `briefing.json` (FD-109: copy from 01 §A/§E and 03 SCR-01, no numbers). */
export interface BriefingContent {
  $comment?: string;
  /** The science objective of the mission (03 SCR-01: boxwork, groundwater history). */
  objective: string;
  /** "What this tool does", in the planner's words (03 SCR-01). */
  what_this_tool_does: string;
  /**
   * The sentence each data badge carries, keyed by DataSource id. A source the file does not name takes the
   * manifest's own title and no sentence; a badge is never invented for a source the manifest does not have.
   */
  source_descriptions: Record<string, string>;
}
