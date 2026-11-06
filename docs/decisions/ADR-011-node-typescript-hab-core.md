# ADR-011 — Hab Core in Node.js + TypeScript (D-12)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §A.4](../specs/02_Technical_Requirements_Document.md#a4-why-nodejs--typescript-for-hab-core-proposed-d-12) |
| **Date** | 2026-11-04 |
| **Status** | Proposed by Sadman Shaharier Mahim (product & systems lead), 2026-11-04 |
| **Related** | [ADR-008 Hab Core](ADR-008-hab-core-local-server.md) · [ops/team.md](../ops/team.md) · [Docs index](../README.md#major-proposed-decisions) |

## Decision

Write the Hab Core in Node.js + TypeScript (Fastify, `ws`) so it imports the same `packages/compute` as the planner's browser worker: one implementation of every science function, one test suite. npm workspaces (`apps/*`, `packages/*`), as the repo already used npm.

## Alternative / trigger

FastAPI (the organizer guide's default) if fewer than two people can work in TypeScript. [ops/team.md](../ops/team.md) lists TypeScript or JavaScript for four of six members, so Node stands.
