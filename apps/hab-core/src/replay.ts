/**
 * Headless replay (NFR-14): run a scenario at full speed with no clients, write the log, and return
 * `log_hash`. Used by CI (determinism) and as the video fallback. TASK-22.
 */
export async function replayHeadless(scenarioDir: string, seed?: number): Promise<string> {
  throw new Error("TODO(TASK-22): not implemented");
}
