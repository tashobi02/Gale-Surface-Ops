/**
 * Recording of a headless run for the GitHub Pages replay (docs/plan/backend/01-contract.md §7, BD-105).
 * Written by the Hab Core CLI (`replay --commands <file> --record <file>`) to
 * `scenarios/storm-sol4190/recording.json`. It is the server message stream of the run: never "live".
 */
import type { EventMessage, Snapshot, StateDelta } from "./ws";

export interface Recording {
  format: "marswalk-recording";
  version: 1;
  scenario_id: string;
  seed: number;
  data_version: string;
  log_hash: string;
  /** Shown by the Pages replay; never "live". */
  label: "replayed recording";
  /** The first message is the SNAPSHOT; then EVENT and STATE_DELTA in `seq` order, deltas coalesced per sim second. */
  messages: (Snapshot | EventMessage | StateDelta)[];
}
