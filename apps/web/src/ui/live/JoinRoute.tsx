/**
 * `#/join` — SCR-10 with the Hab Core's own status (docs/specs/03 SCR-10; 01 FR-30, FR-31; T25.06, T07.03).
 *
 * Polls `api/session` on the page's own origin (the Hab Core; NFR-01): an answer means the Hab Core is reachable
 * ("ready"; the scenario and the roles already connected come from the SNAPSHOT it returns); 404 is "no session loaded",
 * still reachable, scenario "—"; a network error or any other status is "unreachable", and polling goes on so the badge
 * recovers. Nothing is assumed before the first answer ("connecting").
 *
 * A QR link `#/join?role=eva:EV1` goes straight to that role once the first answer shows it free; a role that is taken
 * stays on this screen so the take-over question is asked (the confirm is in scr10Join.tsx; the Hab Core displaces the old device, 02 §E.4).
 * This tab's own connection (`ownClientId`) is not counted as taken.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { Role, Snapshot } from "@marswalk/protocol";
import { Join, ROLE_DESCRIPTORS, type JoinProps } from "../screens/scr10Join";

export interface JoinRouteProps {
  fetchImpl?: (url: string) => Promise<Response>;
  /** Poll interval, ms. */
  pollMs?: number;
  /** `#/join?role=` when valid. */
  joinRole?: Role;
  /** This tab's own client id: its own open connection is not "taken by another device". */
  ownClientId?: string;
}

interface HabStatus {
  status: NonNullable<JoinProps["status"]>;
  scenario?: string;
  taken: string[];
}

const CONNECTING: HabStatus = { status: "connecting", taken: [] };

async function probe(fetchImpl: (url: string) => Promise<Response>, ownClientId?: string): Promise<HabStatus> {
  try {
    const response = await fetchImpl("api/session");
    if (response.status === 404) return { status: "ready", taken: [] };
    if (!response.ok) return { status: "unreachable", taken: [] };
    const snapshot = (await response.json()) as Partial<Snapshot>;
    const scenario = typeof snapshot.session?.scenario_id === "string" ? snapshot.session.scenario_id : undefined;
    const taken = Array.isArray(snapshot.clients) ? snapshot.clients.filter((c) => c.client_id !== ownClientId).map((c) => String(c.role)) : [];
    return { status: "ready", scenario, taken };
  } catch {
    return { status: "unreachable", taken: [] };
  }
}

export function JoinRoute({ fetchImpl, pollMs = 3000, joinRole, ownClientId }: JoinRouteProps): ReactElement {
  const [hab, setHab] = useState<HabStatus>(CONNECTING);
  const redirected = useRef(false);

  useEffect(() => {
    let live = true;
    const doFetch = fetchImpl ?? ((url: string) => fetch(url));
    const run = async (): Promise<void> => {
      const next = await probe(doFetch, ownClientId);
      if (!live) return;
      setHab(next);
      if (joinRole && !redirected.current && next.status === "ready" && !next.taken.includes(joinRole)) {
        redirected.current = true;
        const target = ROLE_DESCRIPTORS.find((r) => r.role === joinRole);
        if (target) globalThis.location.hash = target.route;
      }
    };
    void run();
    const timer = setInterval(() => void run(), pollMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [fetchImpl, pollMs, joinRole, ownClientId]);

  return <Join status={hab.status} takenRoles={hab.taken} sessionScenario={hab.scenario} />;
}
