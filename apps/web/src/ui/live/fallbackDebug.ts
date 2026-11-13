/** Diagnostics only: never changes the selected degradation path. */
export function logLiveFallback(path: string): void {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1") {
    console.info("live fallback", path);
  }
}
