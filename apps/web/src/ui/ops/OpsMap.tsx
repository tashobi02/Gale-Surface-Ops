/**
 * SCR-11 map column: the shared map module with the ops layers (docs/specs/03 SCR-11 map; 04 §C.1 overlays, §E.4;
 * 01 FR-30, FR-39, FR-41, FR-42). Package 21 (T25.02, T29.04).
 *
 * - The map is `createMap` (T07.06) with the site's optical tiles, never a fork; the ops layers are `createOpsLayers`.
 *   Positions are working-projection metres (IAU_2015:49900): no EPSG:3857, no `ol/sphere` (02 §C.1).
 * - The comm shadow comes from the site's `comm_hab` grid; relay coverage from `GET /api/relay-coverage/<vehicle_id>`
 *   for a utility rover whose `relay_coverage_rev` is set (BD-112, FD-071); the haven per crew from `Crew.haven` (N-28).
 *   A layer without data reads "— not computed" in the layer list (FD-071), each row with its class and source.
 * - Picking (SCR-15, T29.04): while `picking`, one click on the map hands its projected position to `onPick`.
 * - + / − / FIT drive the shared map handle; they are disabled until the map exists.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { Snapshot } from "@marswalk/protocol";
import type OlMap from "ol/Map.js";
import type MapBrowserEvent from "ol/MapBrowserEvent.js";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import { loadSite } from "../../boot/loadSite";
import type { LoadedSite, MapHandle } from "../context";
import { createMap } from "../map/createMap";
import { createOpsLayers, opsLayerRows, type CommGridInput, type OpsLayerRow, type OpsLayers } from "../map/opsLayers";
import { createTileGrid, ensureMarsProjection } from "../map/projection";
import { PROVENANCE_GLYPHS, provAttrs, unavailableOf } from "../components/provenance";

export interface OpsMapProps {
  snapshot: Snapshot | null;
  /** While true, a click on the map is a target pick for SCR-15. */
  picking?: boolean;
  /** The picked position in working-projection metres. */
  onPick?: (target: { x_m: number; y_m: number }) => void;
}

const controlStyle: CSSProperties = {
  minHeight: "32px",
  minWidth: "32px",
  padding: "4px 12px",
  backgroundColor: "var(--raised)",
  color: "var(--text-1)",
  border: "1px solid var(--edge)",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
};

/** Optical raster tiles of the site (as the EVA mini-map draws them), with their credits. */
function addOpticalTiles(map: OlMap, site: LoadedSite): void {
  const projection = ensureMarsProjection(site.site);
  for (const def of site.site.layers) {
    if (def.kind !== "raster_tiles" || !def.tile_grid || def.category !== "optical") continue;
    const asset = site.assets.get(def.asset_id);
    if (!asset || asset.format !== "tiles") continue;
    const attributions = def.source_ids.map((id) => site.sources.get(id)?.credit).filter((value): value is string => Boolean(value));
    map.addLayer(
      new TileLayer({
        source: new XYZ({ projection, tileGrid: createTileGrid(def.tile_grid, site.site.aoi.extent_m), wrapX: false, url: `${asset.url}/{z}/{x}/{y}.${def.tile_grid.format}`, attributions }),
      }),
    );
  }
}

/** A u8 grid in the `comm_hab` layout of the site grid, or null when its size does not match. */
function gridOf(site: LoadedSite, buffer: ArrayBuffer, source_id: string): CommGridInput | null {
  const g = site.site.grid;
  if (buffer.byteLength !== g.width * g.height) return null;
  return { cell_m: g.cell_m, width: g.width, height: g.height, origin_m: g.origin_m, values: new Uint8Array(buffer), source_id };
}

export function OpsMap({ snapshot, picking = false, onPick }: OpsMapProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const layersRef = useRef<OpsLayers | null>(null);
  const siteRef = useRef<LoadedSite | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const pickRef = useRef({ picking, onPick });
  pickRef.current = { picking, onPick };
  const relayRevs = useRef(new Map<string, number>());
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [rows, setRows] = useState<OpsLayerRow[]>(() => opsLayerRows(null));
  const siteId = snapshot?.plan?.site_id;

  const refreshRows = (): void => {
    if (layersRef.current) setRows(layersRef.current.rows());
  };

  useEffect(() => {
    let cancelled = false;
    let handle: MapHandle | undefined;
    let ops: OpsLayers | undefined;
    void loadSite(siteId)
      .then((site) => {
        if (cancelled || !host.current) return;
        handle = createMap({ target: host.current, site, keyboard: false });
        const map = handle.getMap<OlMap>();
        addOpticalTiles(map, site);
        ops = createOpsLayers(handle);
        handleRef.current = handle;
        layersRef.current = ops;
        siteRef.current = site;
        relayRevs.current.clear();
        ops.setHab(site.site.grid.hab_mast);
        ops.update(latest.current);
        ops.setHavenRule(latest.current?.session.mission_setup?.max_haven_min ?? null);
        map.on("singleclick", (event: MapBrowserEvent) => {
          const { picking: on, onPick: pick } = pickRef.current;
          const [x, y] = event.coordinate as [number, number];
          if (on && pick && Number.isFinite(x) && Number.isFinite(y)) pick({ x_m: x, y_m: y });
        });
        const grid = site.site.grid;
        const commAsset = site.assets.get(grid.comm_hab_asset);
        if (commAsset) {
          void fetch(commAsset.url)
            .then((response) => (response.ok ? response.arrayBuffer() : null))
            .then((buffer) => {
              const comm = buffer ? gridOf(site, buffer, grid.comm_hab_asset) : null;
              if (!cancelled && comm) {
                ops?.setCommGrid(comm);
                refreshRows();
              }
            })
            .catch(() => undefined);
        }
        setUnavailable(false);
        setReady(true);
        refreshRows();
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
      layersRef.current = null;
      handleRef.current = null;
      siteRef.current = null;
      setReady(false);
      ops?.destroy();
      handle?.destroy();
    };
  }, [siteId]);

  // Crew, vehicles, havens and the relay grids follow the snapshot.
  useEffect(() => {
    const ops = layersRef.current;
    const site = siteRef.current;
    if (!ops || !site) return;
    ops.update(snapshot);
    ops.setHavenRule(snapshot?.session.mission_setup?.max_haven_min ?? null);
    const revs = relayRevs.current;
    const rovers = (snapshot?.vehicles ?? []).filter((v) => v.kind === "utility_rover");
    for (const id of [...revs.keys()]) {
      const rover = rovers.find((v) => v.vehicle_id === id);
      if (!rover || typeof rover.relay_coverage_rev !== "number") {
        revs.delete(id);
        ops.setRelayCoverage(id, null);
      }
    }
    for (const rover of rovers) {
      const rev = rover.relay_coverage_rev;
      if (typeof rev !== "number" || revs.get(rover.vehicle_id) === rev) continue;
      revs.set(rover.vehicle_id, rev);
      const id = rover.vehicle_id;
      void fetch(`/api/relay-coverage/${encodeURIComponent(id)}`)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((buffer) => {
          if (layersRef.current !== ops || revs.get(id) !== rev) return;
          ops.setRelayCoverage(id, buffer ? gridOf(site, buffer, `api:relay-coverage/${id}`) : null);
          refreshRows();
        })
        .catch(() => undefined);
    }
    refreshRows();
  }, [snapshot, ready]);

  const fit = (): void => {
    const site = siteRef.current;
    if (site) handleRef.current?.fitExtent(site.site.aoi.extent_m);
  };

  return (
    <div data-slot="ops-map" style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: "320px", gap: "8px" }}>
      <div style={{ position: "absolute", top: "8px", right: "8px", zIndex: 2, display: "flex", gap: "4px" }}>
        <button type="button" style={controlStyle} aria-label="Zoom in" disabled={!ready} onClick={() => handleRef.current?.zoomBy(1)}>
          +
        </button>
        <button type="button" style={controlStyle} aria-label="Zoom out" disabled={!ready} onClick={() => handleRef.current?.zoomBy(-1)}>
          −
        </button>
        <button type="button" style={controlStyle} aria-label="Fit view" disabled={!ready} onClick={fit}>
          FIT
        </button>
      </div>
      <div
        ref={host}
        data-slot="map-canvas"
        aria-label={picking ? "Ops map: click to place the rover target" : "Ops map"}
        style={{ flex: 1, minHeight: "280px", cursor: picking ? "crosshair" : "default", outline: picking ? "var(--selection-width, 2px) solid var(--route)" : "none" }}
      />
      {picking ? (
        <div role="status" data-slot="pick-hint" style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-1)" }}>
          ▸ PICK TARGET — click the map
        </div>
      ) : null}
      {unavailable ? (
        <span {...provAttrs(unavailableOf("derived", "site:manifest"))} style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-2)" }}>
          Map unavailable —
        </span>
      ) : null}
      <ul data-slot="ops-layer-rows" aria-label="Map layers" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "4px 16px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-2)" }}>
        {rows.map((row) => (
          <li key={row.id} data-layer={row.id} {...provAttrs(row.unavailable ? unavailableOf(row.prov, row.id) : { prov: row.prov, src: row.src })}>
            {row.text} {row.unavailable ? "" : PROVENANCE_GLYPHS[row.prov]}
          </li>
        ))}
      </ul>
    </div>
  );
}
