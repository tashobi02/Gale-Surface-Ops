/**
 * T18.03 (N-24): the REMS seasonal-weather context (01 FR-13, 03 SCR-07).
 *
 * The pipeline builds the L_s-binned context from the named PDS RDR files
 * (`pipeline/src/marswalk_pipeline/rems.py`) and writes it into the site bundle as `rems_context.json`. The
 * client reads that file and looks up the bin holding the plan's L_s; it never computes an aggregate, a bin or a
 * climatology itself (the same rule as every other number in the app).
 *
 * With no context for the build, or none for the plan's L_s, the panel keeps "Not included in this build" — never
 * placeholder numbers (01 FR-13; 03 SCR-07).
 */
import { useEffect, useState } from "react";
import type { Provenance } from "@marswalk/protocol";

/** One aggregated series of a bin, with the metrics the pipeline computed and the files it read. */
export interface RemsSeries {
  unit: string;
  provenance: Provenance;
  source_id: string;
  count: number;
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
  source_files: string[];
}

/** One L_s bin: the window it covers and the three aggregated series. */
export interface RemsBin {
  ls_bin_start_deg: number;
  ls_bin_end_deg: number;
  provenance: Provenance;
  source_id: string;
  sols: number[];
  source_files: string[];
  air_temp_k: RemsSeries;
  ground_temp_k: RemsSeries;
  pressure_pa: RemsSeries;
}

/** The file the pipeline writes: the bins, the bin width and the source they came from. */
export interface RemsContext {
  ls_bin_width_deg: number;
  provenance: Provenance;
  source_id: string;
  source_files: string[];
  bins: RemsBin[];
}

/** The bin that holds `lsDeg`, or null when the context is absent or has no bin for that L_s. */
export function selectRemsBin(context: RemsContext | null | undefined, lsDeg: number | null | undefined): RemsBin | null {
  if (!context || !Array.isArray(context.bins)) return null;
  if (typeof lsDeg !== "number" || !Number.isFinite(lsDeg)) return null;
  return context.bins.find(bin =>
    Number.isFinite(bin?.ls_bin_start_deg) && Number.isFinite(bin?.ls_bin_end_deg)
    && lsDeg >= bin.ls_bin_start_deg && lsDeg < bin.ls_bin_end_deg) ?? null;
}

/** The path the context is fetched from, inside the site bundle the Hab Core serves statically. */
export const REMS_CONTEXT_PATH = "rems_context.json";

function isSeries(value: unknown): value is RemsSeries {
  if (typeof value !== "object" || value === null) return false;
  const series = value as Partial<RemsSeries>;
  return typeof series.unit === "string"
    && typeof series.source_id === "string"
    && typeof series.provenance === "string"
    && ["min", "p10", "median", "p90", "max"].every(key => typeof (series as Record<string, unknown>)[key] === "number" && Number.isFinite((series as Record<string, number>)[key] as number));
}

/** Whether a parsed value is a context this app may show. A malformed file is treated as no context. */
export function isRemsContext(value: unknown): value is RemsContext {
  if (typeof value !== "object" || value === null) return false;
  const context = value as Partial<RemsContext>;
  if (typeof context.source_id !== "string" || !Array.isArray(context.bins)) return false;
  return context.bins.every(bin =>
    typeof bin?.ls_bin_start_deg === "number" && Number.isFinite(bin.ls_bin_start_deg)
    && typeof bin?.ls_bin_end_deg === "number" && Number.isFinite(bin.ls_bin_end_deg)
    && isSeries(bin.air_temp_k) && isSeries(bin.ground_temp_k) && isSeries(bin.pressure_pa));
}

/**
 * The context for the loaded site, or null while it is loading or when the build carries none. The fetch is
 * aborted on unmount and a failed fetch leaves the panel in its "not included" state; nothing is invented.
 */
export function useRemsContext(siteId: string | undefined): RemsContext | null {
  const [context, setContext] = useState<RemsContext | null>(null);
  useEffect(() => {
    setContext(null);
    if (!siteId) return;
    const abort = new AbortController();
    void fetch(`sites/${siteId}/${REMS_CONTEXT_PATH}`, { signal: abort.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!abort.signal.aborted) setContext(isRemsContext(value) ? value : null); })
      .catch(() => { if (!abort.signal.aborted) setContext(null); });
    return () => abort.abort();
  }, [siteId]);
  return context;
}
