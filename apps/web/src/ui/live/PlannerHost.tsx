/**
 * Host of the planner routes (SCR-02 `#/planner`, SCR-08 `#/briefing`, SCR-09 `#/sources`; docs/specs/03 §A; T07.03).
 *
 * Runs the planner boot (site -> worker -> plan store) before a planner screen mounts, shows its failure as plain text
 * naming the file with a retry, and gives the screen its `AppContext`. Planner screens are not built yet, so each shows its
 * not-built placeholder; when a screen lands it mounts here with no edit. SCR-02 is the planner surface: its root carries
 * `data-surface="planner"`, which is what makes the 11 px code size of 04 §C.2 apply on desktop (tokens.css).
 */
import { useEffect, useState, type ReactElement } from "react";
import type { BootProblem, ScreenComponent } from "../context";
import { URL_PARAMS } from "../context";
import type { PlannerBoot, PlannerBootHandle } from "../../boot/bootPlanner";
import { BootError } from "../../boot/loadSite";
import type { Route } from "../router";
import { MapWorkspace } from "../screens/scr02MapWorkspace";
import { BriefingCard } from "../screens/scr08BriefingCard";
import { SourcesMethods } from "../screens/scr09SourcesMethods";
import { BootFailure, NotBuilt, RouteBoundary } from "./placeholders";

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

  const entry = SCREENS[route.id];
  if (!entry) return <NotBuilt screen={route.screen ?? "—"} label={route.id} />;
  const { Screen, label, task, surface } = entry;

  let body: ReactElement;
  if (state.status === "loading") {
    body = (
      <p role="status" data-slot="boot-loading" style={{ padding: "32px" }}>
        LOADING SITE …
      </p>
    );
  } else if (state.status === "failed") {
    body = (
      <BootFailure
        problem={state.problem}
        onRetry={() => {
          planner.reset();
          setAttempt((n) => n + 1);
        }}
      />
    );
  } else if (!state.boot.planStore) {
    // No plan store yet (T08.03 stub): there is no AppContext to give the screen.
    body = <NotBuilt screen={route.screen ?? "—"} label={label} task={`${task} (plan store: T08.03)`} />;
  } else {
    const debug = new URLSearchParams(globalThis.location?.search ?? "").get(URL_PARAMS.DEBUG) === "1";
    const ctx = { site: state.boot.site, planStore: state.boot.planStore, workerClient: state.boot.workerClient, debug };
    body = (
      <RouteBoundary screen={route.screen ?? "—"} label={label} task={task}>
        <Screen ctx={ctx} />
      </RouteBoundary>
    );
  }

  return (
    <div data-screen={route.screen ?? undefined} {...(surface ? { "data-surface": surface } : {})}>
      {body}
    </div>
  );
}
