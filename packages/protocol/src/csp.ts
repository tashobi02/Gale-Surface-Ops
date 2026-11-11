/**
 * The one Content-Security-Policy of the app (docs/specs/02 §F NFR-08; 01 NFR-01). The Hab Core serves `CSP_HEADER`
 * on every response and apps/web/index.html carries `CSP_META` (a test checks the page and the header agree).
 *
 * Only what the app uses today: everything from the page's own origin. The plan worker is a same-origin file, React sets
 * element styles through the CSSOM (no inline style attribute in the markup), the map will load same-origin tiles, and
 * the Hab Core WebSocket is same-host, which `connect-src 'self'` covers in CSP3 browsers. So there is no `blob:`,
 * `data:`, `ws:` or `'unsafe-inline'`; add a source here, with the reason, when a feature needs one.
 * TODO(decision): 02 §F NFR-08 still spells `connect-src 'self' ws:`; `ws:` would allow a WebSocket to any host, and
 * Chromium connects with `'self'` alone. Update 02 §F if Sadman agrees; confirm on the venue's Safari and Firefox.
 */
export const CSP_META = "default-src 'self'; connect-src 'self'; base-uri 'self'; object-src 'none'";

/** `frame-ancestors` is ignored in a meta tag, so it is sent as a header only. */
export const CSP_HEADER = `${CSP_META}; frame-ancestors 'none'`;
