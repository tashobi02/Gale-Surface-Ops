/** SCR-12 map lifetime and data wiring. All geometry is supplied in Mars projected metres. */
import { useEffect, useRef, useState } from "react";
import type { CrewId, Snapshot, Provenance } from "@marswalk/protocol";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import { tokenColor } from "./tokenColors";
import type OlMap from "ol/Map.js";
import { loadSite } from "../../boot/loadSite";
import { DEFAULT_SCENARIO, type PlanState } from "../../state/planStore";
import type { MapHandle, MapView } from "../context";
import { createMap } from "./createMap";
import { createOpsLayers, type OpsLayers } from "./opsLayers";
import { createRasterLayers, type RasterLayersController, type LayerStatus } from "./rasterLayers";
import type { FullScreenMapLayer } from "./FullScreenMap";

export type FullMapLayerStates = Record<FullScreenMapLayer, LayerStatus>;
const absent: FullMapLayerStates = { slope: "unavailable", thermal_inertia: "unavailable", comm_shadow: "unavailable", haven_bands: "unavailable" };

export function useFullMap(snapshot: Snapshot | null | undefined, crewId: CrewId | undefined, following: boolean, activeLayers: FullScreenMapLayer[]) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const ops = useRef<OpsLayers | null>(null);
  const rasters = useRef<RasterLayersController | null>(null);
  const route = useRef<VectorSource | null>(null);
  const routeKey = useRef<string | null>(null);
  const extent = useRef<[number, number, number, number] | null>(null);
  const latest = useRef({ snapshot, crewId, following, activeLayers });
  latest.current = { snapshot, crewId, following, activeLayers };
  const [view, setView] = useState<MapView>();
  const [zoom, setZoom] = useState<number>();
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [basemapAvailable, setBasemapAvailable] = useState(false);
  const [layerSources, setLayerSources] = useState<Partial<Record<FullScreenMapLayer, { prov: Provenance; src: string }>>>({});
  const [layerStates, setLayerStates] = useState<FullMapLayerStates>(absent);
  const siteId = snapshot?.plan?.site_id;
  const hasSnapshot = Boolean(snapshot);

  const apply = (): void => {
    const state = latest.current;
    const current = handle.current;
    const geometry = state.snapshot?.plan?.result.legs.flatMap((leg) => leg.status === "OK" && leg.geometry.length >= 2 ? [leg.geometry] : []) ?? [];
    const key = JSON.stringify(geometry);
    if (route.current && key !== routeKey.current) {
      route.current.clear(); routeKey.current = key;
      for (const line of geometry) route.current.addFeature(new Feature(new LineString(line)));
    }
    ops.current?.setOwnCrew(state.crewId ?? null);
    ops.current?.update(state.snapshot ?? null);
    ops.current?.setHavenRule(state.snapshot?.session.mission_setup?.max_haven_min ?? null);
    const scenario = state.snapshot?.plan?.scenario;
    if (scenario) rasters.current?.setSlopeLimits(scenario.caution_slope_deg, scenario.hard_slope_limit_deg);
    const member = state.snapshot?.crew.find((c) => c.crew_id === state.crewId);
    if (state.following && member && Number.isFinite(member.x_m) && Number.isFinite(member.y_m)) current?.setCenter([member.x_m, member.y_m]);
    for (const id of Object.keys(absent) as FullScreenMapLayer[]) ops.current?.toggleLayer(id, state.activeLayers.includes(id) && (id !== "slope" || Boolean(state.snapshot?.plan)));
  };

  useEffect(() => {
    if (!hasSnapshot) { setStatus("unavailable"); return; }
    let cancelled = false;
    const abort = new AbortController();
    let stopView: (() => void) | undefined;
    let current: MapHandle | undefined;
    let raster: RasterLayersController | undefined;
    let layers: OpsLayers | undefined;
    setStatus("loading");
    setLayerStates(absent);
    void loadSite(siteId).then(async (site) => {
      if (cancelled || !host.current) return;
      current = createMap({ target: host.current, site, keyboard: false });
      handle.current = current;
      const map = current.getMap<OlMap>();
      extent.current = site.site.aoi.extent_m;
      const refresh = (): void => {
        if (cancelled) return;
        const available = layers?.availability();
        const thermal = [...(raster?.layers.values() ?? [])].find((layer) => layer.category === "thermal");
        setBasemapAvailable([...(raster?.layers.values() ?? [])].some((layer) => layer.category === "optical" && layer.getStatus() !== "unavailable"));
        setLayerStates({
          slope: latest.current.snapshot?.plan ? raster?.getLayer("slope")?.getStatus() ?? "unavailable" : "unavailable",
          thermal_inertia: thermal?.getStatus() ?? "unavailable",
          comm_shadow: available?.comm_shadow ? "ready" : "unavailable",
          haven_bands: available?.haven_bands ? "ready" : "unavailable",
        });
      };
      raster = createRasterLayers(site, {
        scenario: { get: () => ({ scenario: latest.current.snapshot?.plan?.scenario ?? DEFAULT_SCENARIO }) as PlanState, subscribe: () => () => {} },
        mapHandle: current,
        onStatusChange: refresh,
      });
      rasters.current = raster;
      for (const layer of raster.layers.values()) {
        layer.setVisible(layer.category === "optical");
        map.addLayer(layer.layer);
      }
      const routeSource = new VectorSource();
      route.current = routeSource;
      routeKey.current = null;
      map.addLayer(new VectorLayer({ source: routeSource, zIndex: 55, style: new Style({ stroke: new Stroke({ color: tokenColor("route"), width: 4 }) }) }));
      layers = createOpsLayers(current);
      ops.current = layers;
      for (const id of ["slope", "thermal_inertia"] as const) {
        const layer = id === "thermal_inertia" ? [...raster.layers.values()].find((entry) => entry.category === "thermal") : raster.getLayer(id);
        if (layer) layers.bindLayer(id, layer.layer);
      }
      const sources: Partial<Record<FullScreenMapLayer, { prov: Provenance; src: string }>> = { comm_shadow: { prov: "derived", src: site.site.grid.comm_hab_asset } };
      for (const managed of raster.layers.values()) {
        const id = managed.category === "thermal" ? "thermal_inertia" : managed.layerId === "slope" ? "slope" : null;
        if (id) sources[id] = { prov: managed.provenance, src: managed.sourceIds.join(" ") };
      }
      setLayerSources(sources);
      layers.setHab(site.site.grid.hab_mast);
      const readView = (): void => {
        if (!current) return;
        const [x, y] = current.getCenter();
        const resolution = current.getResolution();
        if (resolution !== undefined) setView({ center_x_m: x, center_y_m: y, resolution_m_per_px: resolution });
        setZoom(current.getZoom());
      };
      stopView = current.onViewChange(readView);
      apply(); readView(); refresh(); setStatus("ready");
      // No time field is in the site/snapshot contract (N-100/N-120). Haven bands remain explicitly unavailable.
      const grid = site.site.grid;
      const asset = site.assets.get(grid.comm_hab_asset);
      if (asset) {
        try {
          const response = await fetch(asset.url, { signal: abort.signal });
          if (!response.ok) throw new Error(`comm grid: HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength !== grid.width * grid.height) throw new Error("comm grid size differs from site");
          if (!cancelled) {
            layers.setCommGrid({ cell_m: grid.cell_m, width: grid.width, height: grid.height, origin_m: grid.origin_m, values: new Uint8Array(buffer), source_id: grid.comm_hab_asset });
            refresh(); apply();
          }
        } catch (error) {
          if (!cancelled) { console.error("full map comm grid", error); refresh(); }
        }
      }
    }).catch((error: unknown) => {
      if (!cancelled) { console.error("full map", error); setStatus("unavailable"); setLayerStates(absent); }
    });
    return () => {
      cancelled = true; abort.abort(); stopView?.();
      handle.current = null; ops.current = null; rasters.current = null; route.current = null; routeKey.current = null;
      layers?.destroy(); raster?.destroy(); current?.destroy();
    };
    // Snapshot values update in place below; rebuilding is only for a different site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, hasSnapshot]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(apply, [snapshot, crewId, following, activeLayers]);
  return {
    host, view, zoom, status, layerStates, layerSources, basemapAvailable,
    zoomBy: (direction: 1 | -1) => handle.current?.zoomBy(direction),
    fit: () => { if (extent.current) handle.current?.fitExtent(extent.current); },
  };
}
