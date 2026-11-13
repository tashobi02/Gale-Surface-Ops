/**
 * Recorded commands of a session (docs/plan/backend/01-contract.md §7, BD-93; 02 §D.17 "Command list file").
 * `commands.jsonl` beside `session.jsonl` holds `CommandJournalLine`s; it is not part of `log_hash`
 * and the engine never reads it. A replay reads a `CommandList` with `--commands <file>`.
 */
import type { CommandKind, Role } from "./runtime";

export interface RecordedCommand {
  sim_time: string;
  role: Role;
  kind: CommandKind;
  args: Record<string, unknown>;
  /**
   * The ids the command was sent with. `command_ref` is part of every command event, so an exact replay of a live session
   * needs them (BD-121); a hand-written list leaves them out and the replay uses `replay` and `replay-<n>`.
   */
  command_id?: string;
  client_id?: string;
}

/** The shape of `scenarios/<id>/reference_commands.json`. */
export interface CommandList {
  $comment: string;
  scenario_id: string;
  seed: number;
  commands: RecordedCommand[];
  /** Command that created this session, when SESSION_LOADED was caused by LOAD_SCENARIO (BD-121). */
  initial_load?: RecordedCommand;
  /** The session id the list was exported from (`s-0002`): the replay starts its session under the same id, which SESSION_LOADED holds (BD-121). */
  session_id?: string;
  /** The sim time of the exported session's last event: the replay runs no further. Without it the replay runs to ENDED or the maximum EVA duration (BD-121). */
  until_sim_time?: string;
}

/** One line of `commands.jsonl`: every command the Hab Core evaluated, accepted or rejected, in evaluation order. */
export interface CommandJournalLine extends RecordedCommand {
  after_seq: number;
  command_id: string;
  client_id: string;
}
