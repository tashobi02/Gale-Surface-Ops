/**
 * `#/ops` — SCR-11 on live data (docs/specs/03 SCR-11; 01 FR-30–FR-38, FR-44, FR-46; T25.01).
 * Reads the tab's session through the hooks and hands the console what the snapshot carries (`selectOpsProps`); what it
 * does not carry reads "—".
 */
import type { ReactElement } from "react";
import { useEvents, useSnapshot } from "../../state/habSession";
import { selectOpsProps } from "../ops/liveProps";
import { OpsConsole } from "../screens/scr11OpsConsole";

export function OpsRoute(): ReactElement {
  const snapshot = useSnapshot();
  const events = useEvents();
  return <OpsConsole snapshot={snapshot} {...selectOpsProps(snapshot, events)} />;
}
