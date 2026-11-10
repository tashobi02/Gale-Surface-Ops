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

import { type ReactElement } from "react";
import type { ContingencyOption, CrewId, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { Options } from "../screens/scr14Options";

export interface OptionsPanelProps {
  client?: HabClient | null;
  /**
   * The crew member this panel is shown for, taken from the caller or the session. Required: there is no default
   * crew. null = the caller has none to give (no crew in the session yet).
   * TODO(decision): scr14 `Options` still defaults its own `crewId` to "EV1" when this is null; for the ops variant it
   * only affects the EVA-only "queued" flag, so nothing the ops console shows or sends depends on it.
   */
  crewId: CrewId | null;
  snapshot?: Snapshot | null;
  onApproveOption?: (option: ContingencyOption) => void;
  onPreviewPath?: (path: [number, number][]) => void;
  className?: string;
}

/**
 * OptionsPanel wraps SCR-14 Options for ops console side panel.
 * Never duplicates options logic (04 §E.7 / Agent brief).
 */
export function OptionsPanel({
  client,
  crewId,
  snapshot,
  onApproveOption,
  onPreviewPath,
  className = "",
}: OptionsPanelProps): ReactElement {
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
      <Options
        client={client}
        crewId={crewId ?? undefined}
        snapshot={snapshot}
        variant="ops"
        onSelectOption={(option) => {
          if (option.path_preview && onPreviewPath) {
            onPreviewPath(option.path_preview);
          }
          onApproveOption?.(option);
        }}
      />
    </aside>
  );
}
