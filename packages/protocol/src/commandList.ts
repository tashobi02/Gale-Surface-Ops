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
}

/** The shape of `scenarios/<id>/reference_commands.json`. */
export interface CommandList {
  $comment: string;
  scenario_id: string;
  seed: number;
  commands: RecordedCommand[];
}

/** One line of `commands.jsonl`: every command the Hab Core evaluated, accepted or rejected, in evaluation order. */
export interface CommandJournalLine extends RecordedCommand {
  after_seq: number;
  command_id: string;
  client_id: string;
}
