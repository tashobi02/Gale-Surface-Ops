/**
 * SCR-02 — Map Workspace (docs/specs/03 §B; layout in docs/specs/04 §E.3, §F, Appendix A §B).
 * Purpose: Central planning surface (map, layers, traverse, POIs, waypoints, route, point inspector).
 * Requirements: FR-01–FR-10, FR-16, FR-17.
 * Implemented by T07.06, T07.08, T07.13, T13.06.
 *
 * Layout: top bar (logo to SCR-01, site, data-version chip, Briefing, Sources), metadata strip, left drawer (Layers,
 * Plan), the map, right drawer (POI detail, Conditions) and the bottom results panel (SCR-05). From 1280 px the drawers
 * are two columns beside the map; below it (down to 1024 px) one drawer at a time opens over the map (04 §F). The panels
 * of SCR-03, SCR-04, SCR-06 and SCR-07 mount in their drawer tabs as their packages land; until then the tab says so in
 * plain words and shows no value.
 *
 * Map: `createMap` (Mars projection, scale bar, north arrow, readout derived from `proj:IAU_2015:49900`, FD-080) with the
 * keyboard layer (A is the add-stop mode's; B opens the briefing, ? the sources, Delete removes the selected stop, arrows and
 * +/− pan and zoom while the map has focus), the shared MapControls (T07.17, FD-202) and the `?debug=1` overlay. Every map
 * module is attached here: the raster, traverse, POI and route layers and the point inspector. A module whose function
 * is still a "TODO(...)" stub (add-stop mode, waypoint layer, drag, touch) leaves its toolbar control hidden, never dead
 * (FD-118). The root is `data-surface="planner"` on the host (PlannerHost); this component adds no second claim to it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import type OlMap from "ol/Map.js";
import type { AppContext, MapHandle } from "../context";
import { isNotBuilt } from "../../boot/bootPlanner";
import { provAttrs } from "../components/provenance";
import { DebugOverlay } from "../debug";
import { createMap, READOUT_SOURCE_ID } from "../map/createMap";
import type { KeyboardPlanContext } from "../map/keyboard";
import { MapControls, mapControlHandlers } from "../map/MapControls";
import { createPoiLayer } from "../map/poiLayer";
import { createRasterLayers } from "../map/rasterLayers";
import { createRouteLayer } from "../map/routeLayer";
import { createTraverseLayer } from "../map/traverseLayer";
import { initPointInspector } from "../map/inspector";
import { initAddStopMode } from "../map/addStopMode";
import { createWaypointLayer } from "../map/waypointLayer";
import { initWaypointDrag } from "../map/waypointDrag";
import { initTouchInput } from "../map/touchInput";
import { RouteResults } from "./scr05RouteResults";
import "./scr02MapWorkspace.css";

/** 04 §F: planner and ops are three columns from 1280 px; from 1024 to 1279 px one drawer at a time. */
export const THREE_COLUMN_MIN_PX = 1280;

export type WorkspaceLayout = "three-column" | "one-drawer";

export interface MapWorkspaceProps {
  ctx: AppContext;
  /** Called once with the map handle after the map is mounted (tests and the later panels read the map through it). */
  onMapReady?: (handle: MapHandle) => void;
}

type DrawerSide = "left" | "right";
type LeftTab = "layers" | "plan";
type RightTab = "poi" | "conditions";

const subscribeResize = (onChange: () => void): (() => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};
const layoutNow = (): WorkspaceLayout => (window.innerWidth >= THREE_COLUMN_MIN_PX ? "three-column" : "one-drawer");

/** Statuses in which the briefing may be opened (03 SCR-08 Entry; 04 §D): OK, Over limits or Partial, with a stop. */
const BRIEFABLE = new Set(["OK", "OverLimits", "Partial"]);

function usePlanState(planStore: AppContext["planStore"]) {
  const subscribe = useCallback((onChange: () => void) => planStore.subscribe(() => onChange()), [planStore]);
  const read = useCallback(() => planStore.get(), [planStore]);
  return useSyncExternalStore(subscribe, read, read);
}

/** The reason the Briefing button is disabled, or null when it is enabled (04 §D). */
function briefingBlock(status: string, stops: number): string | null {
  if (stops === 0) return "Add a stop first";
  if (status === "Error") return "The computation failed: retry or edit the plan first";
  if (status === "Computing") return "Wait for the computation to finish";
  return BRIEFABLE.has(status) ? null : "Add a stop first";
}

/**
 * A drawer tab whose panel is not built yet: names it plainly, shows no value, and says where it is tracked. The ids are
 * identifiers, not measurements (`data-identifier`).
 */
function PanelPending(props: { screen: string; label: string; task: string }): ReactElement {
  return (
    <div className="scr02-pending" data-slot="panel-pending">
      <b>{props.label}</b>
      <span>
        <span data-identifier>{props.screen}</span> is not built yet; it is tracked as <span data-identifier>{props.task}</span>. No values are shown.
      </span>
    </div>
  );
}

function Tabs<T extends string>(props: {
  label: string;
  tabs: readonly { id: T; name: string }[];
  selected: T;
  onSelect: (id: T) => void;
  idPrefix: string;
}): ReactElement {
  return (
    <div className="scr02-tabs" role="tablist" aria-label={props.label}>
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${props.idPrefix}-tab-${tab.id}`}
          aria-selected={props.selected === tab.id}
          aria-controls={`${props.idPrefix}-panel`}
          onClick={() => props.onSelect(tab.id)}
        >
          {tab.name}
        </button>
      ))}
    </div>
  );
}

function Drawer(props: { side: DrawerSide; shown: boolean; label: string; children: ReactNode }): ReactElement {
  return (
    <aside className="scr02-drawer" data-drawer={props.side} aria-label={props.label} hidden={!props.shown}>
      {props.children}
    </aside>
  );
}

const LEFT_TABS = [
  { id: "layers", name: "Layers" },
  { id: "plan", name: "Plan" },
] as const;
const RIGHT_TABS = [
  { id: "poi", name: "POI detail" },
  { id: "conditions", name: "Conditions" },
] as const;

/** SCR-02 map workspace (React, ADR-012). */
export function MapWorkspace({ ctx, onMapReady }: MapWorkspaceProps): ReactElement {
  const layout = useSyncExternalStore(subscribeResize, layoutNow, () => "three-column" as WorkspaceLayout);
  const plan = usePlanState(ctx.planStore);
  const [leftTab, setLeftTab] = useState<LeftTab>("layers");
  const [rightTab, setRightTab] = useState<RightTab>("poi");
  const [open, setOpen] = useState<DrawerSide | null>(null);
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [notReady, setNotReady] = useState<ReadonlySet<string>>(new Set());
  const hostRef = useRef<HTMLDivElement>(null);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  const stops = plan.waypoints.filter((w) => w.role === "stop").length;
  const blocked = briefingBlock(plan.status, stops);

  // The keyboard layer reads the plan store when a key is pressed (04 §E); the start waypoint is never deleted by it.
  const planContext = useMemo<KeyboardPlanContext>(
    () => ({
      getSelectedStopId: () => {
        const state = ctx.planStore.get();
        const selected = state.waypoints.find((w) => w.id === state.selected_waypoint_id);
        return selected && selected.role !== "start" ? selected.id : null;
      },
      deleteStop: (id) => ctx.planStore.deleteWaypoint(id),
      canOpenBriefing: () => {
        const state = ctx.planStore.get();
        return briefingBlock(state.status, state.waypoints.filter((w) => w.role === "stop").length) === null;
      },
    }),
    [ctx.planStore],
  );

  // The map: one instance for the life of the screen.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const created = createMap({ target: host, site: ctx.site, keyboard: { planContext } });
    setHandle(created);
    onMapReadyRef.current?.(created);
    return () => {
      created.destroy();
      setHandle(null);
    };
  }, [ctx.site, planContext]);

  // Every map module is attached once the map exists; a stub that is not built yet is reported, not run (FD-118).
  useEffect(() => {
    if (!handle) return undefined;
    const map = handle.getMap<OlMap>();
    const mapCtx: AppContext = { ...ctx, mapHandle: handle };
    const cleanups: (() => void)[] = [];
    const missing = new Set<string>();
    const attach = (name: string, init: () => void | (() => void)): void => {
      try {
        const cleanup = init();
        if (cleanup) cleanups.push(cleanup);
      } catch (error) {
        if (!isNotBuilt(error)) throw error;
        missing.add(name);
      }
    };

    attach("raster", () => {
      const raster = createRasterLayers(ctx.site, { scenario: ctx.planStore, mapHandle: handle });
      const layers = raster.olLayers();
      for (const layer of layers) map.addLayer(layer);
      return () => {
        for (const layer of layers) map.removeLayer(layer);
        raster.destroy();
      };
    });
    attach("traverse", () => {
      const traverse = createTraverseLayer(ctx.site);
      map.addLayer(traverse.layer);
      const detach = traverse.attach(handle);
      return () => {
        detach();
        map.removeLayer(traverse.layer);
        traverse.destroy();
      };
    });
    attach("pois", () => {
      const pois = createPoiLayer(ctx.site);
      map.addLayer(pois.layer);
      const detach = pois.attach(handle);
      return () => {
        detach();
        map.removeLayer(pois.layer);
        pois.destroy();
      };
    });
    attach("route", () => {
      const route = createRouteLayer(ctx.planStore);
      map.addLayer(route);
      return () => {
        map.removeLayer(route);
        route.destroy();
      };
    });
    attach("inspector", () => {
      const inspector = initPointInspector(handle, mapCtx);
      return () => inspector.destroy();
    });
    attach("waypoints", () => void createWaypointLayer(ctx.planStore));
    attach("waypoint-drag", () => initWaypointDrag(handle, ctx.planStore));
    attach("touch", () => initTouchInput(handle));
    attach("add-stop", () => initAddStopMode(handle, ctx.planStore));
    setNotReady(missing);

    return () => {
      for (const cleanup of cleanups.reverse()) cleanup();
    };
  }, [handle, ctx]);

  const fitAoi = useCallback((): void => {
    handle?.fitExtent(ctx.site.site.aoi.extent_m as [number, number, number, number]);
  }, [handle, ctx.site]);
  const controls = useMemo(
    () => (handle ? mapControlHandlers(handle, { fitExtent: () => ctx.site.site.aoi.extent_m as [number, number, number, number] }) : null),
    [handle, ctx.site],
  );

  const toggle = (side: DrawerSide): void => setOpen((current) => (current === side ? null : side));
  const oneDrawer = layout === "one-drawer";
  const shown = (side: DrawerSide): boolean => !oneDrawer || open === side;
  const dataVersion = provAttrs({ prov: "derived", src: "manifest:data_version" });
  const site = provAttrs({ prov: "derived", src: "manifest:site_id" });
  const crs = provAttrs({ prov: "derived", src: READOUT_SOURCE_ID });
  const mapCtx: AppContext = useMemo(() => ({ ...ctx, ...(handle ? { mapHandle: handle } : {}) }), [ctx, handle]);

  return (
    <div className="scr02" data-slot="map-workspace" data-layout={layout}>
      <header className="scr02-top-bar" data-slot="top-bar">
        <a className="scr02-logo" data-slot="logo" href="#/" aria-label="Marswalk, back to the mission briefing">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 2h10l5 5v10l-5 5H7l-5-5V7Z" />
          </svg>
          Marswalk
        </a>
        <span className="scr02-site-name" {...site}>
          {ctx.site.site.name}
        </span>
        <span className="scr02-chip" data-slot="data-version" {...dataVersion}>
          DATA {ctx.site.site.data_version}
        </span>
        <span className="spacer" />
        {oneDrawer && (
          <>
            <button type="button" data-slot="drawer-toggle" data-for="left" aria-expanded={open === "left"} onClick={() => toggle("left")}>
              Layers · Plan
            </button>
            <button type="button" data-slot="drawer-toggle" data-for="right" aria-expanded={open === "right"} onClick={() => toggle("right")}>
              POI · Conditions
            </button>
          </>
        )}
        <button
          type="button"
          data-slot="briefing"
          disabled={blocked !== null}
          title={blocked ?? "Open the briefing card (B)"}
          onClick={() => {
            window.location.hash = "#/briefing";
          }}
        >
          Briefing <span className="scr02-key">B</span>
        </button>
        <a className="scr02-link" data-slot="sources" href="#/sources" title="Sources and methods (?)">
          Sources <span className="scr02-key">?</span>
        </a>
      </header>

      <div className="scr02-meta-strip" data-slot="meta-strip">
        <span>
          SITE <span {...site}>{ctx.site.site.site_id}</span>
        </span>
        <span>
          CRS <span {...crs}>IAU_2015:49900</span>
        </span>
      </div>

      <div className="scr02-main">
        <Drawer side="left" shown={shown("left")} label="Left drawer: layers and plan">
          <Tabs label="Left drawer" tabs={LEFT_TABS} selected={leftTab} onSelect={setLeftTab} idPrefix="scr02-left" />
          <div className="scr02-tabpanel" role="tabpanel" id="scr02-left-panel" aria-labelledby={`scr02-left-tab-${leftTab}`}>
            {leftTab === "layers" ? (
              <PanelPending screen="SCR-03" label="Layers" task="T07.07" />
            ) : (
              <PanelPending screen="SCR-04" label="Plan" task="T08.04" />
            )}
          </div>
        </Drawer>

        <div className="scr02-map-box" data-slot="map-box">
          <div className="scr02-map-host" data-slot="map-host" ref={hostRef} />
          <div className="scr02-map-toolbar" data-slot="map-toolbar">
            {controls && (
              <MapControls variant="planner" follow={false} layersOpen={false} onZoom={controls.onZoom} onFit={fitAoi} />
            )}
          </div>
          {notReady.size > 0 && <span hidden data-slot="modules-not-ready" data-modules={[...notReady].join(" ")} />}
          <DebugOverlay ctx={mapCtx} />
        </div>

        <Drawer side="right" shown={shown("right")} label="Right drawer: POI detail and conditions">
          <Tabs label="Right drawer" tabs={RIGHT_TABS} selected={rightTab} onSelect={setRightTab} idPrefix="scr02-right" />
          <div className="scr02-tabpanel" role="tabpanel" id="scr02-right-panel" aria-labelledby={`scr02-right-tab-${rightTab}`}>
            {rightTab === "poi" ? (
              <PanelPending screen="SCR-06" label="POI detail" task="T10.01" />
            ) : (
              <PanelPending screen="SCR-07" label="Conditions" task="T10.02" />
            )}
          </div>
        </Drawer>
      </div>

      <div data-slot="results-panel" className="scr02-results">
        <RouteResults planStore={ctx.planStore} mapHandle={handle ?? undefined} />
      </div>
    </div>
  );
}
