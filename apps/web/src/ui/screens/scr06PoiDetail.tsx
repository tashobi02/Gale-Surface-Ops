/** SCR-06 specimen detail (FR-04, FR-45; FD-014, FD-015, FD-131, FD-132). */
import { useCallback, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { MAX_STOPS } from "@marswalk/compute";
import type { POIFeature, TaskLibraryEntry } from "@marswalk/protocol";
import type { AppContext } from "../context";
import { EZ_STOP_TYPES } from "../map/ezLayer";
import { poiPlaceRequest, type Placement } from "../map/waypointLayer";
import { Metric } from "../components/metric";
import { isUsableValue, provAttrs, type Sourced } from "../components/provenance";
import "./scr06PoiDetail.css";

export interface PoiDetailProps {
  ctx: AppContext;
  selectedPoiId: string | null;
  placement?: Pick<Placement, "place">;
  /** Package 25 supplies the scenario library; this screen only presents the entries. */
  suggestedTasks?: readonly TaskLibraryEntry[];
}

/** Only the local manifest asset is requested; a catalogue source URL is reference text. */
function localImage(url: string | undefined): string | null {
  if (!url) return null;
  const base = new URL(typeof location === "undefined" ? "http://localhost/" : location.href);
  try {
    const resolved = new URL(url, base);
    return resolved.origin === base.origin && ["http:", "https:"].includes(resolved.protocol) ? url : null;
  } catch { return null; }
}

function TextValue({ value, source, field }: { value: string | number | null | undefined; source: Sourced; field?: string }): ReactElement {
  const present = isUsableValue(value);
  return <span {...provAttrs(present ? source : { prov: source.prov, src: `unavailable:${source.src}${field ? `.${field}` : ""}`, unavailable: true })}>{present ? value : "—"}</span>;
}

function Specimen({ ctx, poi, placement, suggestedTasks }: { ctx: AppContext; poi: POIFeature; placement?: Pick<Placement, "place">; suggestedTasks?: readonly TaskLibraryEntry[] }): ReactElement {
  const subscribe = useCallback((notify: () => void) => ctx.planStore.subscribe(notify), [ctx.planStore]);
  const state = useSyncExternalStore(subscribe, ctx.planStore.get, ctx.planStore.get);
  const p = poi.properties;
  const src = `pois:${p.poi_id}`;
  const source = { prov: p.provenance, src };
  const imageSource = { prov: "measured", src } as const;
  const imageUrl = localImage(p.image_asset ? ctx.site.assets.get(p.image_asset)?.url : undefined);
  const [imageState, setImageState] = useState<"loading" | "shown" | "missing">(imageUrl ? "loading" : "missing");
  const dialog = useRef<HTMLDialogElement>(null);
  const enlarge = useRef<HTMLButtonElement>(null);
  const stop = state.waypoints.find(w => w.role === "stop" && w.poi_id === p.poi_id);
  const atLimit = state.waypoints.filter(w => w.role === "stop").length >= MAX_STOPS;
  const index = [...ctx.site.pois.keys()].indexOf(p.poi_id) + 1;
  const type = EZ_STOP_TYPES[p.stop_type];
  const code = type ? `EZ—${({ science: "SCI", resource: "RES", engineering: "ENG" } as const)[p.stop_type]} ${String(index).padStart(2, "0")}` : "—";
  const alt = [p.name, p.image_camera, p.image_sol !== null && p.image_sol !== undefined ? `sol ${p.image_sol}` : null].filter(Boolean).join(" · ");
  const typePoints = type ? Array.from({ length: type.points }, (_, i) => {
    const angle = i * Math.PI * 2 / type.points + type.angle - Math.PI / 2;
    return `${12 + Math.cos(angle) * 10},${12 + Math.sin(angle) * 10}`;
  }).join(" ") : "";
  return <section className="scr06-specimen" data-poi-detail aria-label="POI detail">
    <header className="scr06-header">
      <span className="scr06-code" {...provAttrs({ prov: "derived", src })}>{code}</span>
      <h2><TextValue value={p.name} source={source} /></h2>
      <span className="scr06-stop-type" data-stop-type={p.stop_type} data-shape={type?.shape} {...provAttrs(source)}>
        {type ? <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><polygon points={typePoints} fill="none" stroke="currentColor" strokeWidth="2" /></svg> : null}
        {type?.word ?? "—"}
      </span>
      {p.ez_theme ? <p {...provAttrs(source)}>{p.ez_theme}</p> : null}
    </header>

    <figure className="scr06-image" data-image-state={imageState}>
      {imageUrl && imageState !== "missing" ? <>
        <button type="button" ref={enlarge} data-enlarge-image disabled={imageState !== "shown"} aria-label={`Enlarge ${p.name} image`} onClick={() => dialog.current?.showModal()}>
          <img src={imageUrl} alt={alt} className={imageState === "loading" ? "scr06-image-loading" : undefined} onLoad={() => setImageState("shown")} onError={() => setImageState("missing")} {...provAttrs(imageSource)} />
        </button>
        {imageState === "loading" ? <span role="status">Loading image…</span> : null}
      </> : <div className="scr06-image-missing" role="status"><strong>Image not available</strong><p>The image is not stored in this build or could not be loaded. Position and objective are still usable.</p></div>}
      <figcaption>
        {(["credit", "sol", "date", "camera"] as const).map(field => {
          const value = p[`image_${field}`];
          const present = value !== null && value !== undefined && value !== "";
          return <span key={field} {...{ [`data-image-${field}`]: true }} {...provAttrs(present ? imageSource : { prov: "measured", src: `unavailable:${src}.image_${field}`, unavailable: true })}>{field === "sol" ? "sol " : ""}{present ? value : "—"}</span>;
        })}
        {p.image_source_url ? <a className="scr06-source-url" href={p.image_source_url} target="_blank" rel="noreferrer" {...provAttrs(imageSource)}>Image source record</a> : null}
        <a href="#/sources">Sources and methods</a>
        {imageState === "shown" && imageUrl ? <a href={imageUrl} target="_blank" rel="noreferrer">View original</a> : null}
      </figcaption>
    </figure>

    <h3>Science objective</h3><p><TextValue value={p.science_objective} source={source} /></p>
    <h3>Why it matters</h3><p className="scr06-why"><TextValue value={p.why_it_matters} source={source} /></p>
    <details className="scr06-evidence"><summary>Evidence <span {...provAttrs({ prov: "derived", src })}>{p.evidence.length} {p.evidence.length === 1 ? "source" : "sources"}</span></summary>
      <ul>{p.evidence.map((evidence, i) => <li key={i} {...provAttrs({ prov: p.provenance, src: evidence.source_id })}>{evidence.text || "—"} <span>{ctx.site.sources.get(evidence.source_id)?.title || evidence.source_id}</span></li>)}</ul>
    </details>
    <h3>Position</h3>
    <p data-position {...provAttrs(source)}><TextValue value={p.position_source} source={source} /><br />{Number.isFinite(p.position_uncertainty_m) ? "±" : null}<Metric value={Number.isFinite(p.position_uncertainty_m) ? p.position_uncertainty_m : null} unit="m" prov={p.provenance} src={src} /></p>
    <section aria-label="Suggested tasks"><h3>Suggested tasks</h3>{suggestedTasks ? suggestedTasks.some(task => task.poi_id === p.poi_id) ? <ul>{suggestedTasks.filter(task => task.poi_id === p.poi_id).map(task => <li key={task.library_task_id} {...provAttrs({ prov: "assumed", src: task.source_id ?? `scenario.task_library:${task.library_task_id}` })}>{task.text}</li>)}</ul> : <p>No suggested tasks for this POI.</p> : <p><span {...provAttrs({ prov: "assumed", src: "unavailable:scenario.task_library", unavailable: true })}>—</span> Task library unavailable.</p>}</section>
    {stop ? <button type="button" data-remove-stop onClick={() => ctx.planStore.deleteWaypoint(stop.id)}>Remove stop</button> : <button type="button" data-add-stop disabled={atLimit || !placement || !poiPlaceRequest(poi)} aria-describedby={atLimit ? "scr06-stop-limit" : undefined} onClick={() => { const request = poiPlaceRequest(poi); if (request) void placement?.place(request); }}>Add as stop</button>}
    {atLimit && !stop ? <p id="scr06-stop-limit">Stop limit reached (<span {...provAttrs({ prov: "assumed", src: "spec:02-E.3" })}>{MAX_STOPS}</span>). Remove a stop to add another.</p> : null}
    {imageUrl && imageState === "shown" ? <dialog ref={dialog} className="scr06-image-dialog" aria-label={`${p.name} image`} onClose={() => enlarge.current?.focus()}>
      <button type="button" onClick={() => dialog.current?.close()}>Close image</button><img src={imageUrl} alt={alt} {...provAttrs(imageSource)} />
      <p {...provAttrs(imageSource)}>{p.image_credit || "—"}</p>
    </dialog> : null}
  </section>;
}

export function PoiDetail({ ctx, selectedPoiId, placement, suggestedTasks }: PoiDetailProps): ReactElement {
  const poi = selectedPoiId ? ctx.site.pois.get(selectedPoiId) : undefined;
  return poi ? <Specimen key={`${poi.properties.poi_id}:${poi.properties.image_asset ?? ""}`} ctx={ctx} poi={poi} placement={placement} suggestedTasks={suggestedTasks} /> : <section className="scr06-empty" data-poi-detail aria-label="POI detail">Select a POI on the map to see its objective and ground image.</section>;
}
