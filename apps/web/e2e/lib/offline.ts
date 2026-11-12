/**
 * Offline guard (NFR-01, NFR-08): the app may talk only to the Hab Core on the habitat LAN or `localhost`.
 *
 * `guardNetwork(page)` aborts every request whose host is not `127.0.0.1` or `localhost`, records it, and records every
 * response so a check can also assert that fonts and icons came back 200 from the origin (FD-152).
 */
import type { Page } from "@playwright/test";
import { ROUTES } from "../../src/ui/router";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export interface RecordedResponse {
  url: string;
  status: number;
  type: string;
}

export interface NetworkGuard {
  /** URLs the guard aborted because their host is not local. */
  blocked: string[];
  /** Every response the page received. */
  responses: RecordedResponse[];
}

export async function guardNetwork(page: Page): Promise<NetworkGuard> {
  const guard: NetworkGuard = { blocked: [], responses: [] };
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (LOCAL_HOSTS.has(new URL(url).hostname)) {
      await route.continue();
    } else {
      guard.blocked.push(url);
      await route.abort("blockedbyclient");
    }
  });
  page.on("response", (res) => {
    guard.responses.push({ url: res.url(), status: res.status(), type: res.request().resourceType() });
  });
  return guard;
}

/** Fails, listing every blocked URL, when the page tried to reach a non-local host. */
export function expectNoExternal(guard: NetworkGuard): void {
  if (guard.blocked.length > 0) {
    throw new Error(`${guard.blocked.length} external request(s) blocked (NFR-01, NFR-08):\n  ${guard.blocked.join("\n  ")}`);
  }
}

/** Fails when a font or image the page asked its own origin for did not come back with a 2xx or 3xx status. */
export function expectLocalAssetsOk(guard: NetworkGuard, types: readonly string[] = ["font", "image"]): void {
  const bad = guard.responses.filter((r) => types.includes(r.type) && r.status >= 400);
  if (bad.length > 0) {
    throw new Error(`${bad.length} local ${types.join("/")} request(s) failed:\n  ${bad.map((r) => `${r.status} ${r.url}`).join("\n  ")}`);
  }
}

/** Number of responses of a resource type the page received (a font check that saw no font proves nothing). */
export const countResponses = (guard: NetworkGuard, type: string): number => guard.responses.filter((r) => r.type === type).length;

const hashOf = (path: string, crew?: string): string => `#/${path}${crew ? `/${crew}` : ""}`;

/** Route hashes whose HTML mode is one of `modes` (all modes when omitted), read from the router's one table (03 §A). */
export function routeHashesInMode(modes?: readonly string[]): string[] {
  return ROUTES.filter((r) => !modes || modes.includes(r.mode)).flatMap((r) =>
    r.crew ? [hashOf(r.path, "EV1"), hashOf(r.path, "EV2")] : [hashOf(r.path)],
  );
}

/** Every route of 03 §A as a hash. A crew route is expanded to both crew members. */
export const routeHashes = (): string[] => routeHashesInMode();
