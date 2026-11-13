/**
 * SCR-09 — Sources & Methods (docs/specs/03 SCR-09; layout in docs/specs/04 §E.9; 01 FR-15).
 * Purpose: Credibility: what each value is and where it comes from.
 * Implemented by T12.03; the methods content is T12.04 (FD-148).
 *
 * BRIEF mode, an editorial long-form page (04 §E.9): a left index (Datasets · Processing · Models · Assumptions
 * (ParamSets) · Replay sources · Limitations · AI use · Diagnostics) and a right column with the tables.
 *
 * The datasets table lists **every** manifest source with the six columns of 03 SCR-09 (name, version, mission and
 * instrument, resolution, licence and credit, link). The dataset fields are `measured` metadata with the DataSource id as
 * source (FD-143): a fact of the dataset, not a measurement of Mars.
 *
 * The layer table carries the anchors of FD-144 (`layer-<layer_id>`, `source-<source_id>`, `param-<param_id>`,
 * `model-<model_id>`); the anchor of the route (`#/sources#layer-slope`) scrolls its entry into view and marks it as the
 * target. An anchor that names nothing leaves the screen as it is.
 *
 * Every displayed value carries `data-provenance` and `data-source` (FR-15, NFR-05); a value the bundle does not have
 * renders "—". The equations of the models are the spec's own text (they are not numbers, FD-110).
 */
import { useEffect, useRef, type ReactElement } from "react";
import type { Layer, ParamSet } from "@marswalk/protocol";
import type { LoadedSite } from "../context";
import { Metric } from "../components/metric";
import { UNAVAILABLE, provAttrs } from "../components/provenance";
import methodsContent from "../content/methods.json";
import type { MethodsContent } from "../content/contentTypes";
import "./scr09SourcesMethods.css";

const METHODS = methodsContent as MethodsContent;

/** The sections of 03 SCR-09, in the order the index lists them. */
const SECTIONS = [
  { id: "datasets", title: "Datasets" },
  { id: "processing", title: "Processing" },
  { id: "models", title: "Models" },
  { id: "assumptions", title: "Assumptions (ParamSets)" },
  { id: "replay-sources", title: "Replay sources" },
  { id: "limitations", title: "Limitations" },
  { id: "ai-use", title: "AI use" },
  { id: "diagnostics", title: "Diagnostics" },
] as const;

export interface SourcesMethodsProps {
  /** The loaded site bundle (the manifest, its layers, sources, assets and POIs). */
  site: LoadedSite;
  /** The SCR-09 deep-link anchor (`#/sources#layer-slope`), when the route carries one. */
  anchor?: string;
  /** Scenario files when the host can supply them. */
  paramSets?: readonly ParamSet[];
  replaySource?: { source_id: string; title: string };
}

/** The catalogue code of a dataset row: the DataSource id (04 P1, P3). */
function datasetIdentifier(sourceId: string): string {
  return sourceId;
}

/** The mission and instrument line of a dataset: what the source names, or "—" when it names none. */
function missionLine(missions: readonly string[], instruments: readonly string[]): string {
  const parts = [...missions, ...instruments];
  return parts.length > 0 ? parts.join(" · ") : UNAVAILABLE;
}

/**
 * The anchor target of an entry: the entry's own id (`layer-slope`, `source-usgs-gale-dem-1m-v3`, `param-pr1-assumed`,
 * `model-radiation-dose`). FD-144.
 */
function anchorId(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}

/** SCR-09 sources and methods (React, ADR-012). */
export function SourcesMethods({ site, anchor, paramSets = [], replaySource }: SourcesMethodsProps): ReactElement {
  const root = useRef<HTMLDivElement | null>(null);

  // The deep link scrolls its entry into view. The scroll is instant under `prefers-reduced-motion` (04 §C.6): the CSS
  // handles the smooth case, and the browser honours the preference on `scrollIntoView` with "auto".
  useEffect(() => {
    if (!anchor || !root.current) return;
    const target = root.current.querySelector(`[data-anchor-id="${CSS.escape(anchor)}"]`);
    if (!(target instanceof HTMLElement)) return;
    target.setAttribute("data-anchor-target", "true");
    // `scrollIntoView` is missing in the test DOM; the entry is still marked, so the deep link works there.
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start", behavior: "auto" });
    target.setAttribute("data-scrolled", "true");
  }, [anchor]);

  const layers: readonly Layer[] = site.site.layers;

  return (
    <div className="scr09" ref={root} data-screen="SCR-09" data-surface="brief">
      <header className="scr09-header">
        <a className="scr09-index-link" href="#/planner">Back to map</a>
        <p className="module-label">Sources &amp; methods</p>
        <h1 className="scr09-title display">What each value is, and where it comes from</h1>
      </header>

      <div className="scr09-body">
        <nav className="scr09-index" aria-label="Sections">
          <p className="module-label">Index</p>
          <ul className="scr09-index-list">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a className="scr09-index-link" data-slot="index-link" href={`#${section.id}`} onClick={(event) => {
                  event.preventDefault();
                  const target = root.current?.querySelector<HTMLElement>(`#${section.id}`);
                  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                  target?.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" });
                }}>
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="scr09-content">
          {/* ------------------------------------------------------------ datasets */}
          <section className="scr09-section" data-slot="section-datasets" id="datasets" aria-labelledby="scr09-datasets">
            <h2 className="scr09-section-title" id="scr09-datasets">
              Datasets
            </h2>
            <table className="scr09-table">
              <caption className="scr09-caption">Every source of the site bundle, with the metadata of the dataset.</caption>
              <thead>
                <tr>
                  <th scope="col">Dataset</th>
                  <th scope="col">Version</th>
                  <th scope="col">Mission / instrument</th>
                  <th scope="col">Resolution</th>
                  <th scope="col">Licence / credit</th>
                  <th scope="col">Link</th>
                </tr>
              </thead>
              <tbody>
                {site.site.sources.map((source) => (
                  <tr
                    key={source.source_id}
                    className="scr09-dataset"
                    data-slot="dataset-row"
                    data-source-id={source.source_id}
                    data-identifier={datasetIdentifier(source.source_id)}
                    data-anchor-id={anchorId("source", source.source_id)}
                  >
                    <th scope="row" data-slot="dataset-name" data-provenance="measured" data-source={source.source_id}>
                      {source.title}
                    </th>
                    <td data-slot="dataset-version" data-unavailable={!source.version ? "true" : undefined} data-provenance="measured" data-source={source.source_id}>
                      {source.version || UNAVAILABLE}
                    </td>
                    <td data-slot="dataset-mission" data-unavailable={source.missions.length + source.instruments.length === 0 ? "true" : undefined} data-provenance="measured" data-source={source.source_id}>
                      {missionLine(source.missions, source.instruments)}
                    </td>
                    <td data-slot="dataset-resolution" data-provenance="measured" data-source={source.source_id}>
                      <Metric
                        value={source.native_resolution_m ?? null}
                        unit="m"
                        prov="measured"
                        src={source.source_id}
                        chip="glyph"
                      />
                    </td>
                    <td data-slot="dataset-licence" data-unavailable={!source.licence ? "true" : undefined} data-provenance="measured" data-source={source.source_id}>
                      {source.licence || UNAVAILABLE}
                      {source.credit ? ` · ${source.credit}` : ""}
                    </td>
                    <td data-slot="dataset-link" data-unavailable={!source.url ? "true" : undefined} data-provenance="measured" data-source={source.source_id}>
                      {source.url ? (
                        <a href={source.url} rel="noreferrer noopener">
                          Open the source
                        </a>
                      ) : (
                        UNAVAILABLE
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="scr09-subtitle">Layers</h3>
            <ul className="scr09-layer-list">
              {layers.map((layer) => (
                <li
                  key={layer.layer_id}
                  className="scr09-layer"
                  data-slot="layer-entry"
                  data-layer-id={layer.layer_id}
                  data-anchor-id={anchorId("layer", layer.layer_id)}
                >
                  <span className="scr09-layer-title">{layer.title}</span>
                  <span className="scr09-layer-meta" data-provenance={layer.provenance} data-source={layer.source_ids[0] ?? `layer:${layer.layer_id}`}>
                    {layer.provenance}
                  </span>
                  <span className="scr09-layer-meta">
                    Native{" "}
                    <Metric value={layer.native_resolution_m} unit="m" prov={layer.provenance} src={layer.source_ids[0] ?? `layer:${layer.layer_id}`} chip="glyph" />
                  </span>
                  {/* The note is the manifest's own words about the layer, numbers included ("1 m posts"): it takes the layer's class (FD-481). */}
                  <span
                    className="scr09-layer-note"
                    {...(layer.limitations ? provAttrs({ prov: layer.provenance, src: `manifest:layers.${layer.layer_id}.limitations` }) : {})}
                  >
                    {layer.limitations}
                  </span>
                </li>
              ))}
            </ul>

            <h3 className="scr09-subtitle">Environment constants</h3>
            <ul className="scr09-const-list">
              {site.site.env_constants.map((constant) => (
                <li key={constant.const_id} className="scr09-const" data-slot="env-constant" data-const-id={constant.const_id} data-source={constant.source_id} data-provenance={constant.provenance}>
                  <span className="scr09-const-name">{constant.quantity}</span>
                  <Metric value={constant.value} unit={constant.unit} prov={constant.provenance} src={constant.source_id} chip="glyph" />
                  <span className="scr09-const-note">{constant.note ?? constant.source_id}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* --------------------------------------------------------- processing */}
          <section className="scr09-section" data-slot="section-processing" id="processing" aria-labelledby="scr09-processing">
            <h2 className="scr09-section-title" id="scr09-processing">
              Processing
            </h2>
            <ol className="scr09-steps">
              {METHODS.processing.map((step) => (
                <li key={step.id} className="scr09-step" data-slot="processing-entry" data-provenance={step.provenance} data-source={step.source_ids[0] ?? `processing:${step.id}`}>
                  <h3 className="scr09-step-title">{step.title}</h3>
                  <p className="scr09-step-ref" data-identifier>
                    {step.spec_ref}
                  </p>
                  <p className="prose scr09-step-text">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* ------------------------------------------------------------- models */}
          <section className="scr09-section" data-slot="section-models" id="models" aria-labelledby="scr09-models">
            <h2 className="scr09-section-title" id="scr09-models">
              Models
            </h2>
            <ul className="scr09-model-list">
              {METHODS.models.map((model) => (
                <li
                  key={model.id}
                  className="scr09-model"
                  data-slot="model-entry"
                  data-model-id={model.id}
                  data-anchor-id={anchorId("model", model.id)}
                  data-provenance={model.provenance}
                  data-source={model.source_ids[0] ?? `model:${model.id}`}
                >
                  <h3 className="scr09-model-title">{model.title}</h3>
                  <p className="scr09-model-label">{model.label}</p>
                  {model.equations ? (
                    <div className="scr09-equations" data-slot="equations">
                      {model.equations.map((equation) => (
                        <p key={equation} className="scr09-equation" data-identifier>
                          {equation}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <p className="prose scr09-model-text">{model.text}</p>
                  <p className="scr09-model-ref" data-identifier>
                    {model.spec_ref}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* ------------------------------------------------------- assumptions */}
          <section className="scr09-section" data-slot="section-assumptions" id="assumptions" aria-labelledby="scr09-assumptions">
            <h2 className="scr09-section-title" id="scr09-assumptions">
              Assumptions (ParamSets)
            </h2>
            <p className="prose scr09-note">
              The vehicle parameter sets the scenario loads. Each value is an assumption we chose, never a measurement of
              Mars.
            </p>
            {paramSets.length ? <ul className="scr09-param-list">
              {paramSets.map((param) => <li key={param.param_set_id} className="scr09-param" data-slot="param-entry" data-param-id={param.param_set_id} data-anchor-id={anchorId("param", param.param_set_id)} data-provenance={param.provenance} data-source={param.source_ids?.[0] ?? `unavailable:param-set-source`}>
                <span className="scr09-param-title">{param.title}</span>
                <span className="scr09-param-id" data-identifier>{param.param_set_id}</span>
                {Object.entries(param.values).map(([key, value]) => <span key={key} data-provenance={param.provenance} data-source={param.source_ids?.[0] ?? `unavailable:param-set-source`}>{key}: {String(value)}</span>)}
              </li>)}
            </ul> : <span data-unavailable="true" data-source="unavailable:scenario.param_sets">{UNAVAILABLE}</span>}
          </section>

          {/* ------------------------------------------------------ replay sources */}
          <section className="scr09-section" data-slot="section-replay-sources" id="replay-sources" aria-labelledby="scr09-replay">
            <h2 className="scr09-section-title" id="scr09-replay">
              Replay sources
            </h2>
            <p className="prose scr09-note">
              The solar events the scenario replays. They are real historical records on a simulated clock, never a live
              feed.
            </p>
            {replaySource ? <ul className="scr09-replay-list"><li className="scr09-replay" data-slot="replay-entry" data-source-id={replaySource.source_id} data-anchor-id={anchorId("source", replaySource.source_id)} data-provenance="replayed" data-source={replaySource.source_id}>{replaySource.title}</li></ul>
              : <span data-unavailable="true" data-source="unavailable:scenario.dose_series.source_id">{UNAVAILABLE}</span>}
          </section>

          {/* --------------------------------------------------------- limitations */}
          <section className="scr09-section" data-slot="section-limitations" id="limitations" aria-labelledby="scr09-limitations">
            <h2 className="scr09-section-title" id="scr09-limitations">
              Limitations
            </h2>
            <ul className="scr09-limitation-list">
              {METHODS.limitations.map((limitation) => (
                <li key={limitation.id} className="scr09-limitation" data-slot="limitation-entry" data-provenance={limitation.provenance} data-source={limitation.source_ids[0] ?? `limitation:${limitation.id}`}>
                  <h3 className="scr09-limitation-title">{limitation.title}</h3>
                  <p className="prose scr09-limitation-text">{limitation.text}</p>
                  <p className="scr09-limitation-ref" data-identifier>
                    {limitation.spec_ref}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* -------------------------------------------------------------- AI use */}
          <section className="scr09-section" data-slot="section-ai-use" id="ai-use" aria-labelledby="scr09-ai-use">
            <h2 className="scr09-section-title" id="scr09-ai-use">
              {METHODS.ai_use.title}
            </h2>
            <p className="prose scr09-ai-text">{METHODS.ai_use.text}</p>
            <p className="scr09-ai-ref" data-identifier>
              {METHODS.ai_use.spec_ref}
            </p>
          </section>

          {/* --------------------------------------------------------- diagnostics */}
          <section className="scr09-section" data-slot="section-diagnostics" id="diagnostics" aria-labelledby="scr09-diagnostics">
            <h2 className="scr09-section-title" id="scr09-diagnostics">
              Diagnostics
            </h2>
            <dl className="scr09-diagnostics">
              <dt>Data version</dt>
              <dd data-slot="data-version" data-identifier>
                {site.site.data_version}
              </dd>
              <dt>Site id</dt>
              <dd data-identifier>{site.site.site_id}</dd>
              <dt>Working projection</dt>
              <dd data-identifier>{site.site.crs.base}</dd>
              <dt>Checksums</dt>
              <dd data-slot="checksum-status" data-provenance="derived" data-source={`manifest:${site.site.site_id}`}>
                {site.site.assets.length} files carry a SHA-256 checksum in the manifest
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
