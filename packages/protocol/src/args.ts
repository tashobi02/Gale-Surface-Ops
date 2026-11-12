/**
 * Typed `COMMAND.command.args` per command kind (docs/plan/backend/01-contract.md §7, N-08). Key names are the
 * ones the handlers in apps/hab-core/src/commands.ts and src/engine/* parse; where a handler is still a stub
 * (SEND_MESSAGE, T26.04) the key is the 05 EarthMessage field, and work package 18 may refine it through a
 * `contract-change:` note. `Command.args` stays an open record on the wire; these types are for senders.
 */
import type { CrewId, MissionSetup, StopTaskKind, StopTaskReason, StopTaskSeed, StopTaskState, TaskRoverArgs, AlertLevel } from "./runtime";
import type { PlanExport } from "./schema";

export interface LoadScenarioArgs {
  scenario_id: string;
}
export interface SetClockArgs {
  speed?: 1 | 10 | 60;
  paused?: boolean;
}
export interface PublishPlanArgs {
  plan: PlanExport;
  /** One TASK_ADDED per seed is logged at publish; `plan_hash` is unchanged by them (BD-91). */
  stop_tasks?: StopTaskSeed[];
}
export interface SummonVehicleArgs {
  crew: CrewId[];
  option_id?: string;
}
export interface AbortArgs {
  crew: CrewId[];
}
export interface AckAlertArgs {
  alert_id: string;
}
export interface ApproveOptionArgs {
  option_id: string;
}
export interface SendMessageArgs {
  body: string;
}
export interface InjectEventArgs {
  level: AlertLevel;
  /** 1-60 characters (04 §D.2). */
  message: string;
  subjects?: string[];
}
export interface AddStopTaskArgs {
  stop_id: string;
  text: string;
  crew_id?: CrewId | null;
  kind?: StopTaskKind;
}
export interface UpdateStopTaskArgs {
  task_id: string;
  state: StopTaskState;
  reason?: StopTaskReason | null;
  undo?: boolean;
}
export interface StartEventArgs {
  event_id: string;
}
export interface SelectHabSiteArgs {
  candidate_id: string;
}
export type SetMissionSetupArgs = Partial<MissionSetup>;

/** Command kind -> its `args`. */
export interface CommandArgs {
  LOAD_SCENARIO: LoadScenarioArgs;
  SET_CLOCK: SetClockArgs;
  JUMP_NEXT_EVENT: Record<string, never>;
  START_EVA: Record<string, never>;
  PUBLISH_PLAN: PublishPlanArgs;
  SUMMON_VEHICLE: SummonVehicleArgs;
  ABORT: AbortArgs;
  ACK_ALERT: AckAlertArgs;
  APPROVE_OPTION: ApproveOptionArgs;
  TASK_ROVER: TaskRoverArgs;
  SEND_MESSAGE: SendMessageArgs;
  INJECT_EVENT: InjectEventArgs;
  UPDATE_STOP_TASK: UpdateStopTaskArgs;
  ADD_STOP_TASK: AddStopTaskArgs;
  JUMP_NEXT_STOP: Record<string, never>;
  START_EVENT: StartEventArgs;
  RESET_SESSION: Record<string, never>;
  SELECT_HAB_SITE: SelectHabSiteArgs;
  SET_MISSION_SETUP: SetMissionSetupArgs;
}
