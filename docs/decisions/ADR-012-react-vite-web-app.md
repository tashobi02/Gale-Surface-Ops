# ADR-012 — `apps/web` in React + Vite (D-14)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §B](../specs/02_Technical_Requirements_Document.md#b-technology-choices) |
| **Date** | 2026-11-06 |
| **Status** | Proposed by Sadman Shaharier Mahim (product & systems lead), 2026-11-06; kickoff sign-off |
| **Related** | [ADR-008 Hab Core](ADR-008-hab-core-local-server.md) · [Mockup handoff component inventory](../design/mockup-handoff.md#component-inventory) · [Session handoff](../ops/session-handoff-2026-11-06.md) · [Docs index](../README.md#major-proposed-decisions) |

## Decision

Write the web app's role views (planner, ops, EVA, HUD, Earth) as React components in `.tsx` files, built by Vite into one static bundle that the Hab Core serves on the habitat LAN. Hash routes per role stay as 02 §B and 03 §A describe. OpenLayers keeps the map inside one element that a React component owns.

02 §B listed Preact (or vanilla) first and React as the alternative "if the team knows it". The team knows React (and Next.js), so React is the better fit for six build days: components follow the mockup handoff's inventory as written, and testing tools and coding agents target React by default. The app loads once per device over the LAN, so bundle size matters little.

## Not chosen

- **Next.js.** The app must run offline from a static build served by the Hab Core (NFR-01, NFR-08). Next's server rendering and server routes would add a second server, and some defaults reach the internet (for example `next/font` with Google fonts fetches them at build time, against self-hosted fonts, U-27, U-40).
- **Plain TypeScript.** Every live view would need hand-written DOM updates.
- **Preact.** Smaller, but with small React compatibility gaps; no benefit for this team.

## Alternative / trigger

Preact with the same components if the bundle becomes a problem on the demo devices.

## Unresolved items owned by this document

| ID | Item | Owner | Due |
| --- | --- | --- | --- |
| — | None | — | — |
