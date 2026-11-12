/**
 * Host of the planner routes (SCR-02 `#/planner`, SCR-08 `#/briefing`, SCR-09 `#/sources`; docs/specs/03 §A; T07.03).
 *
 * Runs the planner boot (site -> worker -> plan store) before a planner screen mounts, shows its failure as SCR-00 (T14.04:
 * plain-language cause, the missing file, Retry) and gives the screen its `AppContext`. A planner screen that is not built
 * yet shows its not-built placeholder; when a screen lands it mounts here with no edit. SCR-02 is the planner surface: its
 * root carries `data-surface="planner"`, which is what makes the 11 px code size of 04 §C.2 apply on desktop (tokens.css).
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { BootProblem, ScreenComponent } from "../context";
import { URL_PARAMS } from "../context";
import type { PlannerBoot, PlannerBootHandle } from "../../boot/bootPlanner";
import { BootError } from "../../boot/loadSite";
import type { Route } from "../router";
import { MapWorkspace } from "../screens/scr02MapWorkspace";
import { BriefingCard } from "../screens/scr08BriefingCard";
import { SourcesMethods } from "../screens/scr09SourcesMethods";
import { BootErrorScreen } from "../screens/scr00BootError";
import { NotBuilt, RouteBoundary } from "./placeholders";

interface PlannerScreen {
  Screen: ScreenComponent;
  label: string;
  task: string;
  /** SCR-02 to SCR-07 are the planner desktop surface (04 §C.2). */
  surface?: "planner";
}

const SCREENS: Partial<Record<Route["id"], PlannerScreen>> = {
  planner: { Screen: MapWorkspace as ScreenComponent, label: "Map workspace", task: "T07.08", surface: "planner" },
  briefing: { Screen: BriefingCard as ScreenComponent, label: "Briefing card", task: "T11.03" },
  sources: { Screen: SourcesMethods as ScreenComponent, label: "Sources & Methods", task: "T12.03" },
};

type State = { status: "loading" } | { status: "ready"; boot: PlannerBoot } | { status: "failed"; problem: BootProblem };

function problemOf(error: unknown): BootProblem {
  if (error instanceof BootError) return error.problem;
  return { code: "BOOT_FAILED", message: error instanceof Error ? error.message : "Boot failed" };
}

export function PlannerHost({ route, planner }: { route: Route; planner: PlannerBootHandle }): ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    planner.get().then(
      (boot) => live && setState({ status: "ready", boot }),
      (error: unknown) => live && setState({ status: "failed", problem: problemOf(error) }),
    );
    return () => {
      live = false;
    };
  }, [planner, attempt]);

  // The context is rebuilt only when the boot changes, so screens that compare it by reference do not re-run.
  const boot = state.status === "ready" ? state.boot : null;
  const ctx = useMemo(() => {
    if (!boot) return null;
    const debug = new URLSearchParams(globalThis.location?.search ?? "").get(URL_PARAMS.DEBUG) === "1";
    return { site: boot.site, planStore: boot.planStore, workerClient: boot.workerClient, debug };
  }, [boot]);

  const entry = SCREENS[route.id];
  if (!entry) return <NotBuilt screen={route.screen ?? "—"} label={route.id} />;
  const { Screen, label, task, surface } = entry;

  let body: ReactElement;
  if (state.status === "failed") {
    body = (
      <BootErrorScreen
        problem={state.problem}
        onRetry={() => {
          planner.reset();
          setAttempt((n) => n + 1);
        }}
      />
    );
  } else if (ctx) {
    body = (
      <RouteBoundary screen={route.screen ?? "—"} label={label} task={task}>
        <Screen ctx={ctx} />
      </RouteBoundary>
    );
  } else {
    body = (
      <p role="status" data-slot="boot-loading" style={{ padding: "32px" }}>
        LOADING SITE …
      </p>
    );
  }

  // SCR-00 is its own screen (it carries data-screen="SCR-00"): the wrapper claims the route's screen and surface only
  // while that screen is what is shown.
  const failed = state.status === "failed";
  return (
    <div {...(failed ? {} : { "data-screen": route.screen ?? undefined })} {...(surface && !failed ? { "data-surface": surface } : {})}>
      {body}
    </div>
  );
}
