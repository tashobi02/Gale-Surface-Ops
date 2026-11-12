/**
 * Ops Options Panel (docs/specs/03 SCR-14; layout in 04 §E.4, 04 §D.3, 04 §E.7; mode OPS).
 * Implementation: T25.04 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements: FR-44, NFR-04, NFR-05.
 * Wraps the shared SCR-14 Options component with variant="ops" for the Ops Console.
 * Ranked contingency options (1–3); approving an option uses 800 ms hold-to-confirm
 * and dispatches APPROVE_OPTION to the Hab Core.
 * Communicates path preview on option selection to the ops tactical map.
 */

import { useCallback, type ReactElement } from "react";
import type { ContingencyOption, CrewId, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useSnapshot } from "../../state/habSession";
import { sortAlerts, isOnBar } from "./AlertStack";
import { provAttrs, unavailableOf } from "../components/provenance";
import { Options } from "../screens/scr14Options";

export interface OptionsPanelProps {
  client?: HabClient | null;
  /** Legacy caller crew; ops uses the alert's affected crew list (FD-055). */
  crewId: CrewId | null;
  snapshot?: Snapshot | null;
  onApproveOption?: (option: ContingencyOption) => void;
  onPreviewPath?: (path: [number, number][], option?: ContingencyOption | null) => void;
  className?: string;
}

/**
 * OptionsPanel wraps SCR-14 Options for ops console side panel.
 * Never duplicates options logic (04 §E.7 / Agent brief).
 */
export function OptionsPanel({
  client,
  snapshot,
  onApproveOption,
  onPreviewPath,
  className = "",
}: OptionsPanelProps): ReactElement {
  const stored = useSnapshot(client);
  const active = snapshot === undefined ? stored : snapshot;
  const alert = sortAlerts(active?.alerts.filter(isOnBar) ?? [])[0];
  const relevant = alert && active ? { ...active, options: active.options.filter((option) => option.alert_id === alert.alert_id) } : active;
  const affectedCrew = alert?.subjects.filter((subject): subject is CrewId => subject === "EV1" || subject === "EV2") ?? [];
  const preview = useCallback((option: ContingencyOption | null) => onPreviewPath?.(option?.path_preview ?? [], option), [onPreviewPath]);
  return (
    <aside
      className={`ops-options-panel ${className}`}
      data-surface="ops"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
      }}
      aria-label="Contingency Options Panel"
    >
      <div>Override for crew: <span data-slot="affected-crew" {...(affectedCrew.length ? provAttrs({ prov: "simulated", src: `snapshot:alerts/${alert!.alert_id}/subjects` }) : provAttrs(unavailableOf(null, "alerts.subjects")))}>{affectedCrew.join(", ") || "—"}</span></div>
      <Options
        client={client}
        snapshot={relevant}
        variant="ops"
        onPreviewOption={preview}
        onSelectOption={(option) => onApproveOption?.(option)}
      />
    </aside>
  );
}
