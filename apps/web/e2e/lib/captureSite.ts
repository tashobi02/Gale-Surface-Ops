import { e2eSite, REAL_SITE } from "./siteBundle";

export interface CaptureSiteConfig {
  readonly site: string;
  readonly evaStartUtc: string;
  readonly initialStops: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  readonly refusedStop: readonly [number, number];
  readonly recoveryStop: readonly [number, number];
}

const SITE_CONFIGS: Readonly<Record<string, CaptureSiteConfig>> = {
  mock_site: {
    site: "mock_site",
    evaStartUtc: "2026-11-14T10:00:00Z",
    initialStops: [
      [-1500, -1400],
      [-1300, -1300],
      [-1100, -1200],
    ],
    refusedStop: [50, 1000],
    recoveryStop: [-950, -1200],
  },
  [REAL_SITE]: {
    site: REAL_SITE,
    // Storm Sol 4190 daytime start (avoiding Mars darkness window warnings on the real bundle).
    evaStartUtc: "2024-05-20T04:11:00Z",
    initialStops: [
      [1100, -1600],
      [1100, -1500],
      [1200, -1500],
    ],
    refusedStop: [-2500, 250],
    recoveryStop: [1200, -1600],
  },
};

/** Returns capture planner coordinates and EVA start timestamp for the active E2E site. */
export function captureSiteConfig(site = e2eSite()): CaptureSiteConfig {
  const cfg = SITE_CONFIGS[site];
  if (!cfg) {
    throw new Error(`Unsupported capture site "${site}"; expected one of: ${Object.keys(SITE_CONFIGS).join(", ")}`);
  }
  return cfg;
}

/** Builds a relative SPA URL targeting the requested site and hash route. */
export function captureSiteUrl(hashRoute: string, site = e2eSite(), debug = false): string {
  const normalizedHash = hashRoute.startsWith("#") ? hashRoute : `#${hashRoute}`;
  const query = debug ? `site=${site}&debug=1` : `site=${site}`;
  return `/?${query}${normalizedHash}`;
}
