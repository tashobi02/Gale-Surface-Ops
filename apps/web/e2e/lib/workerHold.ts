/**
 * Holds the worker's plan answer back, so a check can observe the plan's Computing state (03 SCR-04, 03 §E.4).
 *
 * The app's worker client assigns `worker.onmessage` (packages: `apps/web/src/ui/workerClient.ts`), so the wrapper
 * intercepts that setter: a `PLAN_RESULT` is remembered instead of delivered, and the sample answers (the inspector)
 * go through untouched. The check releases the held answer when it wants the plan to leave the Computing state.
 *
 * The wrapper is installed with `addInitScript`, before the page's own scripts run, so the app's worker is wrapped from
 * the start. Nothing in the app changes: this is the harness observing the state the app already has.
 */
import type { Page } from "@playwright/test";

/** What the page keeps about its workers, so a check can release a held answer. */
interface HeldWorkerHandle {
  release(): void;
  heldCount: number;
}

/** Installs the wrapper. Call it before the page's first navigation. */
export async function installWorkerHold(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Native = window.Worker;
    /** The workers this page made, so the check can release them. */
    const workers: HeldWorkerHandle[] = [];
    class HeldWorker extends Native {
      private readonly held: MessageEvent[] = [];
      private handler: ((event: MessageEvent) => void) | null = null;
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        workers.push(this);
      }
      get onmessage(): ((event: MessageEvent) => void) | null {
        return this.handler;
      }
      set onmessage(handler: ((event: MessageEvent) => void) | null) {
        this.handler = handler;
        if (!handler) {
          super.onmessage = null;
          return;
        }
        super.onmessage = (event: MessageEvent) => {
          const message = event.data as { type?: string };
          if (message?.type === "PLAN_RESULT") {
            this.held.push(event);
            return;
          }
          handler(event);
        };
      }
      /** Delivers the answers that were held back, in the order they arrived. */
      release(): void {
        const held = this.held.splice(0, this.held.length);
        for (const event of held) this.handler?.(event);
      }
      /** How many answers are held back right now. */
      get heldCount(): number {
        return this.held.length;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = HeldWorker as unknown as typeof Worker;
    (window as unknown as { __heldWorkers: HeldWorkerHandle[] }).__heldWorkers = workers;
  });
}

/**
 * Lets every held plan answer through, so the plan leaves the Computing state.
 *
 * The plan store sends the request 300 ms after the last edit (03 §C.3), so the answer may not have arrived yet when the
 * check asks for it. The helper therefore waits for an answer to be held and then releases it.
 */
export async function releaseWorkerAnswers(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const workers = (window as unknown as { __heldWorkers?: HeldWorkerHandle[] }).__heldWorkers ?? [];
      if (!workers.some((w) => w.heldCount > 0)) return false;
      for (const worker of workers) worker.release();
      return true;
    },
    undefined,
    { timeout: 10000 },
  );
}
