/**
 * Host of the landing route (SCR-01, `#/`; docs/specs/03 §A; BRIEF mode).
 *
 * SCR-01 shows the site the bundle names and loads the demo plan into the plan store, so it needs the same planner boot
 * the planner routes use (site -> worker -> plan store). This host runs that boot, shows its failure as SCR-00 (T14.04)
 * and gives the screen its props. The screen itself owns no navigation: it calls `onNavigate` with a route hash, and
 * this host moves the hash, so the router's one table stays the only route table (ui/router.ts).
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { BootProblem } from "../context";
import type { PlannerBoot, PlannerBootHandle } from "../../boot/bootPlanner";
import { BootError } from "../../boot/loadSite";
import { MissionBriefing } from "../screens/scr01MissionBriefing";
import { BootErrorScreen } from "../screens/scr00BootError";
import { RouteBoundary } from "./placeholders";

type State = { status: "loading" } | { status: "ready"; boot: PlannerBoot } | { status: "failed"; problem: BootProblem };

function problemOf(error: unknown): BootProblem {
  if (error instanceof BootError) return error.problem;
  return { code: "BOOT_FAILED", message: error instanceof Error ? error.message : "Boot failed" };
}

export function BriefingHost({ planner }: { planner: PlannerBootHandle }): ReactElement {
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

  const boot = state.status === "ready" ? state.boot : null;
  const site = useMemo(() => boot?.site ?? null, [boot]);

  if (state.status === "failed") {
    return (
      <RouteBoundary screen="SCR-00" label="Boot error" task="T14.04">
        <BootErrorScreen
          problem={state.problem}
          onRetry={() => {
            planner.reset();
            setAttempt((n) => n + 1);
          }}
        />
      </RouteBoundary>
    );
  }

  if (!site || !boot) {
    return (
      <p role="status" data-slot="boot-loading" style={{ padding: "32px" }}>
        LOADING SITE …
      </p>
    );
  }

  return (
    <RouteBoundary screen="SCR-01" label="Mission briefing" task="T07.05">
      <MissionBriefing
        site={site}
        planStore={boot.planStore}
        onNavigate={(hash) => {
          globalThis.location.hash = hash;
        }}
      />
    </RouteBoundary>
  );
}
