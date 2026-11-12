/**
 * App shell: maps a route (ui/router.ts) to its screen (docs/specs/03 §A; T07.03, T25.01).
 *
 * Live roles read the tab's Hab Core session through the hooks (state/habSession.ts), which boot opened before this
 * renders (boot/session.ts): no client is passed down. Each live host sits in `LiveFrame`, which adds the SCR-18 overlay.
 * Screens that are still stubs throw their "TODO(...)" error and the boundary shows a placeholder, so no route is blank.
 * Not wired yet: SCR-15 rover tasking, SCR-16 earth, replay mode (`#/replay`). SCR-19 and SCR-20 are mounted here as the minimal
 * registration the harness checks need; T32.23 (package 22) adds the join tile and owns these two cases.
 */
import type { ReactElement } from "react";
import type { PlannerBootHandle } from "../boot/bootPlanner";
import { ownClientId } from "../boot/session";
import type { Route } from "./router";
import { MissionBriefing } from "./screens/scr01MissionBriefing";
import { EarthView } from "./screens/scr16EarthView";
import { Presenter } from "./screens/scr19Presenter";
import { MissionSetup } from "./screens/scr20MissionSetup";
import { EvaRoute } from "./live/EvaRoute";
import { HudRoute } from "./live/HudRoute";
import { JoinRoute } from "./live/JoinRoute";
import { LiveFrame } from "./live/LiveFrame";
import { OpsRoute } from "./live/OpsRoute";
import { PlannerHost } from "./live/PlannerHost";
import { NotBuilt, RouteBoundary, UnknownRoute } from "./live/placeholders";
import { ReportRoute } from "./live/ReportRoute";

export interface AppProps {
  route: Route;
  planner: PlannerBootHandle;
  /** Same-origin fetch for the join status and the report; default the global `fetch`. */
  fetchImpl?: (url: string) => Promise<Response>;
}

export function App({ route, planner, fetchImpl }: AppProps): ReactElement {
  switch (route.id) {
    case "landing":
      return (
        <RouteBoundary screen="SCR-01" label="Mission briefing" task="T07.05">
          <MissionBriefing />
        </RouteBoundary>
      );
    case "join":
      return <JoinRoute fetchImpl={fetchImpl} joinRole={route.joinRole} ownClientId={ownClientId()} />;
    case "planner":
    case "briefing":
    case "sources":
      return <PlannerHost route={route} planner={planner} />;
    case "ops":
      return (
        <LiveFrame variant="ops">
          <OpsRoute />
        </LiveFrame>
      );
    case "eva":
      return route.crewId ? (
        <LiveFrame variant="eva" crewId={route.crewId}>
          <EvaRoute crewId={route.crewId} />
        </LiveFrame>
      ) : (
        <UnknownRoute />
      );
    case "hud":
      return route.crewId ? (
        <LiveFrame variant="hud" crewId={route.crewId}>
          <HudRoute crewId={route.crewId} />
        </LiveFrame>
      ) : (
        <UnknownRoute />
      );
    case "report":
      return <ReportRoute fetchImpl={fetchImpl} />;
    case "earth":
      return (
        <RouteBoundary screen="SCR-16" label="Earth view" task="T18.12">
          <EarthView />
        </RouteBoundary>
      );
    case "presenter":
      return (
        <LiveFrame variant="ops">
          <Presenter />
        </LiveFrame>
      );
    case "setup":
      return (
        <LiveFrame variant="ops">
          <MissionSetup />
        </LiveFrame>
      );
    case "replay":
      return <NotBuilt screen="—" label="Replay mode" task="T27.05" />;
    case "unknown":
      return <UnknownRoute />;
  }
}
