# ADR-008 — Hab Core: a habitat-local server (D-02 v2)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §A.3 Why a habitat server now](../specs/02_Technical_Requirements_Document.md#a3-why-a-habitat-server-now-proposed--reverses-v1-d-02) |
| **Date** | 2026-11-04 |
| **Status** | Proposed by Sadman Shaharier Mahim (product & systems lead), 2026-11-04 |
| **Related** | [ADR-002 (superseded)](ADR-002-static-app-no-backend.md) · [02 §A.5 Network model](../specs/02_Technical_Requirements_Document.md#a5-network-model) · [05 §B Persistence](../specs/05_Backend_and_Database_Schema.md#b-persistence-strategy) · [Docs index](../README.md#major-proposed-decisions) |

This record mirrors D-02 v2. The owning spec is the source of truth.

## Context

v2 adds in-EVA use: several devices (ops, two suits, planner) must share one mission state, a mission clock must keep running when a phone sleeps, and commands such as "summon vehicle" must travel between roles. On Mars there is no internet; a habitat would host its own compute.

## Decision

Add the **Hab Core**, a Node.js server on the habitat LAN: serves the web app and site data, holds the authoritative session state, runs the mission clock and simulation engine, validates commands by role, appends an event log, and fans out state over WebSocket. No database; persistence is an append-only JSONL log plus snapshots. The planner keeps its browser worker and works without the Hab Core.

## Consequences

- The demo runs on a travel router with no WAN: the real LAN stands in for the habitat network; surface radio and the Earth link are **simulated** on top of it (02 §A.5).
- New failure mode (server unreachable) is handled by SCR-18 and NFR-10/NFR-13.
- The GitHub Pages public link shows the planner plus a recorded replay, not the live multi-device system.

## Alternative / trigger

Single-laptop multi-window mode if multi-device networking fails at the venue (06 §D.4 cut 7).
