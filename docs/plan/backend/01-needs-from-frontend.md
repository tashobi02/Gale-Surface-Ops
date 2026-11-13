# Needs from the frontend

| | |
| --- | --- |
| **Owner** | Backend lane (Claude) for Sadman Shaharier Mahim |
| **Date** | 2026-11-13 |
| **Status** | Cross-lane list: the frontend lane's agent reads this file at the start of every batch ([plan README §5](../README.md)) |
| **Related** | [Needs from the backend](../frontend/01-needs-from-backend.md) · [Overview](00-overview.md) |

| ID | Need | Owner |
| --- | --- | --- |
| B-01 | `apps/web/tests/ui/replayRoute.test.ts` is flaky in CI (once: "window is not defined" — a timer fires after jsdom teardown). Clear timers and unmount in `afterEach`. | frontend lane |
