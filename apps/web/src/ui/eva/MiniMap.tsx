/**
 * SCR-12 surface map: locally served Mars tiles and snapshot geometry (04 §E.5; plan step 2 of
 * `docs/plan/frontend/17-eva-tablet.md`).
 *
 * - The ortho basemap carries the shared `OPS_ORTHO_LAYER_CLASS` (FD-003), so the OPS grayscale rule reaches this
 *   mini-map as well as the planner's map: one name for "the ortho", used by `rasterLayers.ts` and here.
 * - "Me" and "buddy" are told apart: the crew member this tablet belongs to is drawn with a ring around the chevron
 *   and labelled "ME"; the others keep the plain chevron.
 * - The route source is updated only when the route itself changed: a snapshot that does not change the route leaves
 *   the drawn geometry alone instead of clearing and rebuilding it.
 * - The comm grid is fetched once. A failure is logged and the comm layer is shown as unavailable, never silently
 *   absent (04 §D.1: a missing value says so).
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { Snapshot } from "@marswalk/protocol";
import OlMap from "ol/Map.js";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import VectorLayer from "ol/layer/Vector.js";
import TileLayer from "ol/layer/Tile.js";
import VectorSource from "ol/source/Vector.js";
import XYZ from "ol/source/XYZ.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import { loadSite } from "../../boot/loadSite";
import { createMap } from "../map/createMap";
import { createOpsLayers, type OpsLayers } from "../map/opsLayers";
import { createTileGrid, ensureMarsProjection } from "../map/projection";
import { OPS_ORTHO_LAYER_CLASS } from "../map/rasterLayers";
import { tokenColor } from "../map/tokenColors";
import type { MapHandle } from "../context";

export interface MiniMapProps {
  snapshot: Snapshot | null;
  /** The crew member this tablet belongs to: their marker is drawn as "me". */
  crewId?: string;
  onOpen?: () => void;
}

/** The key of the route geometry: when it is unchanged the drawn route is left alone. */
function routeKeyOf(snapshot: Snapshot | null): string {
  const legs = snapshot?.plan?.result.legs ?? [];
  return legs.map((leg) => `${leg.status}:${leg.status === "OK" ? leg.geometry.length : 0}`).join("|");
}

/** The legs with a route to draw: only an OK leg has geometry (05 §C Leg). */
function routeLegsOf(snapshot: Snapshot | null): { geometry: [number, number][] }[] {
  const legs = snapshot?.plan?.result.legs ?? [];
  return legs.flatMap((leg) => (leg.status === "OK" && leg.geometry.length >= 2 ? [{ geometry: leg.geometry }] : []));
}

export function MiniMap({ snapshot, crewId, onOpen }: MiniMapProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const layers = useRef<OpsLayers | null>(null);
  const route = useRef<VectorSource | null>(null);
  const routeKey = useRef<string | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const [unavailable, setUnavailable] = useState(false);
  const [commUnavailable, setCommUnavailable] = useState(false);
  const siteId = snapshot?.plan?.site_id;

  useEffect(() => {
    let cancelled = false;
    let handle: MapHandle | undefined;
    let ops: OpsLayers | undefined;
    void loadSite(siteId).then((site) => {
      if (cancelled || !host.current) return;
      handle = createMap({ target: host.current, site, keyboard: false });
      handle.getTargetElement().tabIndex = -1;
      const map = handle.getMap<OlMap>();
      const projection = ensureMarsProjection(site.site);
      for (const def of site.site.layers) {
        if (def.kind !== "raster_tiles" || !def.tile_grid || def.category !== "optical") continue;
        const asset = site.assets.get(def.asset_id);
        if (!asset || asset.format !== "tiles") continue;
        const attribution = def.source_ids.map((id) => site.sources.get(id)?.credit).filter((value): value is string => Boolean(value));
        // The shared OPS grayscale class (FD-003): the ortho is grey in OPS here as it is on the planner's map.
        map.addLayer(new TileLayer({ source: new XYZ({ projection, tileGrid: createTileGrid(def.tile_grid, site.site.aoi.extent_m), wrapX: false, url: `${asset.url}/{z}/{x}/{y}.${def.tile_grid.format}`, attributions: attribution }), className: OPS_ORTHO_LAYER_CLASS }));
      }
      const source = new VectorSource();
      const routeLayer = new VectorLayer({ source, style: new Style({ stroke: new Stroke({ color: tokenColor("route"), width: 4 }) }) });
      routeLayer.setZIndex(55);
      map.addLayer(routeLayer);
      route.current = source;
      ops = createOpsLayers(handle);
      layers.current = ops;
      ops.setOwnCrew(crewId ?? null);
      ops.update(latest.current);
      ops.setHab(site.site.grid.hab_mast);
      const grid = site.site.grid;
      const commAsset = site.assets.get(grid.comm_hab_asset);
      if (commAsset) {
        void fetch(commAsset.url).then((response) => {
          if (!response.ok) throw new Error(`comm grid unavailable: HTTP ${response.status}`);
          return response.arrayBuffer();
        }).then((buffer) => {
          if (cancelled) return;
          if (buffer.byteLength !== grid.width * grid.height) throw new Error(`comm grid has ${buffer.byteLength} bytes, expected ${grid.width * grid.height}`);
          ops?.setCommGrid({ cell_m: grid.cell_m, width: grid.width, height: grid.height, origin_m: grid.origin_m, values: new Uint8Array(buffer), source_id: grid.comm_hab_asset });
        }).catch((error: unknown) => {
          // The failure is logged, not swallowed, and the comm layer is shown as unavailable (04 §D.1).
          console.error("mini-map comm grid", error);
          if (!cancelled) setCommUnavailable(true);
        });
      } else {
        console.error("mini-map comm grid unavailable: no asset", grid.comm_hab_asset);
        setCommUnavailable(true);
      }
      const key = routeKeyOf(latest.current);
      routeKey.current = key;
      for (const leg of routeLegsOf(latest.current)) {
        source.addFeature(new Feature(new LineString(leg.geometry)));
      }
      setUnavailable(false);
    }).catch((error: unknown) => {
      // The failure is logged, not swallowed: a silent "map unavailable" would hide a broken site or a missing token.
      console.error("mini-map site load", error);
      if (!cancelled) setUnavailable(true);
    });
    return () => { cancelled = true; layers.current = null; route.current = null; routeKey.current = null; ops?.destroy(); handle?.destroy(); };
    // `crewId` is applied by the update effect below, so the map is not rebuilt when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    layers.current?.setOwnCrew(crewId ?? null);
    layers.current?.update(snapshot);
  }, [snapshot, crewId]);

  useEffect(() => {
    const source = route.current;
    if (!source) return;
    // The route is redrawn only when it changed: a snapshot that leaves the route alone keeps the drawn geometry.
    const key = routeKeyOf(snapshot);
    if (routeKey.current === key) return;
    routeKey.current = key;
    source.clear();
    for (const leg of routeLegsOf(snapshot)) {
      source.addFeature(new Feature(new LineString(leg.geometry)));
    }
  }, [snapshot]);

  return <div className="eva-mini-map">
    <div data-slot="map-canvas" ref={host} aria-label="Surface map" />
    {unavailable && <span data-provenance="derived" data-source="site:manifest" data-unavailable="true">Map unavailable —</span>}
    {commUnavailable && <span data-provenance="derived" data-source="unavailable:comm_hab" data-unavailable="true">Comms grid unavailable —</span>}
    <button type="button" data-slot="mini-map-open" aria-label="Open full-screen map" onClick={onOpen}><span>FULL MAP</span></button>
  </div>;
}
