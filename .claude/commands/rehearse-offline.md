---
description: Offline rehearsal checklist (docs/specs/06 §D.6 demo freeze criteria)
---

# Offline rehearsal

Walk the team through an offline rehearsal. Run the automatable checks yourself; present the rest as a checklist for a human and record results.

Automatable (run and report output):

- [ ] `make test` — all Vitest suites and pytest green (06 §D.6)
- [ ] `make docs-check`
- [ ] Manifest validator green: `.venv/bin/validate-manifest web/public/sites/<site_id>` (TASK-03; report "not implemented" until then)
- [ ] `npm run -s build` succeeds from a clean clone with documented commands (06 §D.6)

Manual (human, Wi-Fi off, `make demo`):

- [ ] Core scenario (01 §E, steps 1–9) runs offline twice in a row without intervention
- [ ] Browser devtools Network panel shows no request leaving `localhost` (FR-01, NFR-01)
- [ ] No console errors on the demo path
- [ ] Briefing card prints on one page in Chrome (FR-14)
- [ ] Missing thermal-inertia tiles show "Layer unavailable" and routing still works (FR-16)

Write the date, who ran it, and each result into the rehearsal log (06 TASK-14).
