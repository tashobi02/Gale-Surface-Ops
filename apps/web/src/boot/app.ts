/**
 * App boot: route -> session -> render (docs/specs/03 §A; 02 §E.6; T07.03, T25.01).
 *
 * On start and on every `hashchange`: parse the hash (`#/map` is replaced by `#/planner`), set `<html data-mode>` (04 §B.2),
 * open the tab's Hab Core connection for the route's role (boot/session.ts: ops, or eva:<crew> for the tablet and the HUD;
 * one connection per tab), then render the route. The connection is opened before the screen renders, so a screen's first
 * read already sees the client and shows "—" only until the first SNAPSHOT.
 *
 * The planner boot (site, worker, plan store) runs only for the planner routes, so a suit tablet never waits for site tiles.
 * Everything the shell fetches is relative to the page's own origin, the Hab Core (NFR-01).
 */
import { createElement } from "react";
import { closeHabSessions } from "../state/habSession";
import { App } from "../ui/App";
import { parseHash, type Route } from "../ui/router";
import { applyTheme } from "../ui/theme";
import { createPlannerBoot, type PlannerBootHandle } from "./bootPlanner";
import { ensureSessionForRoute, type SessionBootDeps } from "./session";

export interface StartAppOptions {
  /** The element to render into (`#app`). */
  root: HTMLElement;
  /** Connection options; tests pass a fake socket factory. */
  session?: SessionBootDeps;
  planner?: PlannerBootHandle;
  fetchImpl?: (url: string) => Promise<Response>;
}

export interface AppHandle {
  /** Stops listening, unmounts and closes the tab's Hab Core connection. */
  destroy(): void;
}

const TITLE = "Gale Surface Ops";

export async function startApp(options: StartAppOptions): Promise<AppHandle> {
  // react-dom/client reads `window` when it loads, so it is imported here and not at the top of the module.
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(options.root);
  const planner = options.planner ?? createPlannerBoot();
  let destroyed = false;

  const render = (): void => {
    if (destroyed) return;
    const route: Route = parseHash(globalThis.location.hash);
    if (route.redirected) {
      globalThis.location.replace(route.hash); // fires hashchange, which renders the canonical route
      return;
    }
    applyTheme(globalThis.location?.search, route.query, route.id === "planner");
    document.documentElement.setAttribute("data-mode", route.mode);
    document.title = route.screen && route.screen !== "—" ? `${TITLE} — ${route.screen}` : TITLE;
    try {
      ensureSessionForRoute(route, options.session);
    } catch (err) {
      // A socket that cannot be made leaves the hooks reading null: the screens show "—".
      console.error("Hab Core connection could not start", err);
    }
    root.render(createElement(App, { key: route.hash, route, planner, fetchImpl: options.fetchImpl }));
  };

  window.addEventListener("hashchange", render);
  render();

  return {
    destroy() {
      destroyed = true;
      window.removeEventListener("hashchange", render);
      root.unmount();
      closeHabSessions();
    },
  };
}
