/**
 * The loaded scenario's own metadata for the planner's Sources and methods screen (SCR-09; N-30, BD-158; 01 FR-15).
 * Read-only and pure: every value is copied from a loaded file (ParamSets, dose series, event library, Earth-link table),
 * nothing is computed here. A title or label that no loaded file gives is null, never made up.
 */
import type { DoseSeries, ParamSet } from "@marswalk/protocol";
import type { LoadedScenario } from "./scenario";

export interface ScenarioMeta {
  scenario_id: string;
  title: string;
  data_version: string;
  /** Every ParamSet the scenario loaded, by `param_set_id`, as loaded (values, provenance, source ids, note). */
  param_sets: ParamSet[];
  /** The replayed dose series. `title` and `label` are those of the event-library entry that draws on its source, else null. */
  dose_series: {
    series_id: string;
    source_id: string;
    title: string | null;
    label: string | null;
    method: DoseSeries["method"];
    quantity: string;
    unit: DoseSeries["unit"];
    provenance: "replayed";
    background_rate_ugy_h: number;
    first_utc: string | null;
    last_utc: string | null;
    sample_count: number;
  };
  /** The Earth-link table (SPICE geometry precomputed by the pipeline): its step and span, and the source ids of its kernels. */
  earth_link: { step_s: number; first_utc: string | null; last_utc: string | null; kernel_source_ids: string[]; provenance: "derived" };
  /** Every source id the scenario draws on (05 Scenario `source_ids`). */
  source_ids: string[];
}

export function scenarioMeta(loaded: LoadedScenario): ScenarioMeta {
  const { scenario, dose, earthLink } = loaded;
  const entry = loaded.eventLibrary.find((e) => e.source_id === dose.source_id);
  return {
    scenario_id: scenario.scenario_id,
    title: scenario.title,
    data_version: scenario.data_version,
    param_sets: Object.keys(loaded.params).sort().map((id) => loaded.params[id]!),
    dose_series: {
      series_id: dose.series_id,
      source_id: dose.source_id,
      title: entry?.title ?? null,
      label: entry?.label ?? null,
      method: dose.method,
      quantity: dose.quantity,
      unit: dose.unit,
      provenance: dose.provenance,
      background_rate_ugy_h: dose.background_rate,
      first_utc: dose.samples[0]?.[0] ?? null,
      last_utc: dose.samples.at(-1)?.[0] ?? null,
      sample_count: dose.samples.length,
    },
    earth_link: {
      step_s: earthLink.step_s,
      first_utc: earthLink.rows[0]?.t_utc ?? null,
      last_utc: earthLink.rows.at(-1)?.t_utc ?? null,
      kernel_source_ids: [...new Set(earthLink.kernels.map((k) => k.source_id))].sort(),
      provenance: earthLink.provenance,
    },
    source_ids: [...scenario.source_ids],
  };
}
