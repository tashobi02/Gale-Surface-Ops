# Package 98 — hunter finding resolution

The hunter reviewed frontend commit `6ed2237`. This resolver used the same baseline and the supplied package 97 report. Browser results below are pending: the sandbox prohibits starting Hab Core and Chromium.

| Finding | Triage and resolution | Evidence / remaining work |
| --- | --- | --- |
| H-01 | Real frontend defect: ops rover placement now supports map-centre selection by keyboard, with pan controls and a visible centre marker (FD-549). | `opsMapKeyboard.test.ts`; `ops-no-terminal` keyboard dispatch awaits browser execution. N-09 and N-101 remain open. |
| H-02 | Real frontend defect: SCR-18 moves and contains focus, hides the covered content from interaction, and restores focus on reconnect (FD-548). | `liveFrame.test.ts`; updated `link-lost` browser focus check awaits execution. |
| H-03 | Real fixture defect: connected EVA and ops fixtures send protocol heartbeats and stop them at page close. | `fixtureHeartbeat.test.ts`; updated `axe` browser checks await execution. |
| H-04 | Real frontend defect: the ops task-limit count now carries provenance and its rule source. | `stopTasks.test.ts`; browser `provenance` awaits execution. N-32 remains open. |
| H-05 | Real frontend defect: missing vehicle parameter set displays an unavailable dash with source (FD-547). | `setup.test.ts`; browser `provenance` awaits execution. |
| H-06 | Real test coverage defect: the target sweep now includes textareas and summaries, with tests that reject undersized controls. | `targetGeometry.test.ts`; expanded `targets` browser check awaits execution. |
| H-07 | Real test coverage defect: the core keyboard scenario traverses the tab order and activates controls by keyboard. | `keyboardPathContract.test.ts`; revised `keyboard-path` browser check awaits execution. |
| H-08 | Real acceptance-check defect and existing backend need N-29: the gated check now requires a real accepted command, authoritative snapshot and task event; the missing server revision capability remains N-29. | `skipRevisionCheck.test.ts`; `targets` case remains `test.fixme` needs N-29. |
| H-09 | Real stale placeholder: frontend undo tests already cover the client, and the named backend test file covers server actor, event and revision behavior. Replaced the placeholder with a reference. | `undoCoverage.test.ts`; backend tests were inspected, not run in this sandbox. |

No finding was rejected. N-29, N-09, N-101 and N-32 were already recorded; no duplicate backend need was added. Initial regressions: 12 failed tests across the nine findings; two additional H-05 provenance assertions failed before their refinement. H-01 and H-02 mutations were detected.

The orchestrator must run these checks outside the sandbox, in the foreground and on port 8185: `E2E_PORT=8185 make e2e-one CHECK=ops-no-terminal`, `E2E_PORT=8185 make e2e-one CHECK=link-lost`, `E2E_PORT=8185 make e2e-one CHECK=axe`, `E2E_PORT=8185 make e2e-one CHECK=provenance`, `E2E_PORT=8185 make e2e-one CHECK=targets`, and `E2E_PORT=8185 make e2e-one CHECK=keyboard-path`. Apply the requested timeout to each. The N-29 case stays gated until the backend need is fulfilled.
