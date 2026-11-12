/** SCR-12 surface map: locally served Mars tiles and snapshot geometry. */
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
import { tokenColor } from "../map/tokenColors";
import type { MapHandle } from "../context";

export function MiniMap({ snapshot, onOpen }: { snapshot: Snapshot | null; onOpen?: () => void }): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const layers = useRef<OpsLayers | null>(null);
  const route = useRef<VectorSource | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const [unavailable, setUnavailable] = useState(false);
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
        map.addLayer(new TileLayer({ source: new XYZ({ projection, tileGrid: createTileGrid(def.tile_grid, site.site.aoi.extent_m), wrapX: false, url: `${asset.url}/{z}/{x}/{y}.${def.tile_grid.format}`, attributions: attribution }) }));
      }
      const source = new VectorSource();
      const routeLayer = new VectorLayer({ source, style: new Style({ stroke: new Stroke({ color: tokenColor("route"), width: 4 }) }) });
      routeLayer.setZIndex(55);
      map.addLayer(routeLayer);
      route.current = source;
      ops = createOpsLayers(handle);
      layers.current = ops;
      ops.update(latest.current);
      ops.setHab(site.site.grid.hab_mast);
      const grid = site.site.grid;
      const commAsset = site.assets.get(grid.comm_hab_asset);
      if (commAsset) {
        void fetch(commAsset.url).then((response) => {
          if (!response.ok) throw new Error("comm grid unavailable");
          return response.arrayBuffer();
        }).then((buffer) => {
          if (!cancelled && buffer.byteLength === grid.width * grid.height) {
            ops?.setCommGrid({ cell_m: grid.cell_m, width: grid.width, height: grid.height, origin_m: grid.origin_m, values: new Uint8Array(buffer), source_id: grid.comm_hab_asset });
          }
        }).catch(() => {});
      }
      for (const leg of latest.current?.plan?.result.legs ?? []) {
        if (leg.status === "OK" && leg.geometry.length >= 2) source.addFeature(new Feature(new LineString(leg.geometry)));
      }
      setUnavailable(false);
    }).catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; layers.current = null; route.current = null; ops?.destroy(); handle?.destroy(); };
  }, [siteId]);

  useEffect(() => {
    layers.current?.update(snapshot);
    const source = route.current;
    if (!source) return;
    source.clear();
    for (const leg of snapshot?.plan?.result.legs ?? []) {
      if (leg.status === "OK" && leg.geometry.length >= 2) source.addFeature(new Feature(new LineString(leg.geometry)));
    }
  }, [snapshot]);

  return <div className="eva-mini-map">
    <div data-slot="map-canvas" ref={host} aria-label="Surface map" />
    {unavailable && <span data-provenance="derived" data-source="site:manifest" data-unavailable="true">Map unavailable —</span>}
    <button type="button" data-slot="mini-map-open" aria-label="Open full-screen map" onClick={onOpen}><span>FULL MAP</span></button>
  </div>;
}
