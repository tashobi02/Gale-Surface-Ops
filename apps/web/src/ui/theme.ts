/**
 * Light theme controller (docs/specs/04 U-08; FD-002, FD-061).
 * Activates light theme via ?theme=light; dark theme stays default.
 * Never activates via prefers-color-scheme.
 */
export function applyTheme(search?: string, hashQuery?: Record<string, string>): void {
  if (typeof document === "undefined") return;
  const rawSearch = search !== undefined ? search : typeof window !== "undefined" ? window.location.search : "";
  let theme: string | null = null;
  if (rawSearch) {
    try {
      const params = new URLSearchParams(rawSearch);
      theme = params.get("theme");
    } catch {
      // ignore malformed query
    }
  }
  if (!theme && hashQuery?.theme) {
    theme = hashQuery.theme;
  }

  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
