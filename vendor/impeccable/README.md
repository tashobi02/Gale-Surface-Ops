# Vendored from Impeccable

Design skills, agents and hooks copied from [pbakaus/impeccable](https://github.com/pbakaus/impeccable) at commit `c8891a9` (package version 4.8.0, engine launcher 0.1.18), under the Apache-2.0 licence in [LICENSE](LICENSE) with the notices in [NOTICE.md](NOTICE.md). The official installer (`npx impeccable install`) could not be used because it downloads from impeccable.style; the copies below are the per-tool builds committed in the upstream repo.

| Upstream | Here |
| --- | --- |
| `.claude/skills/impeccable/`, `.claude/agents/impeccable-*.md` | same paths |
| `.agents/skills/impeccable/` (Codex build) | same path |
| `.gemini/skills/impeccable/` (Gemini build) | same path |
| `.claude/settings.json` hooks | merged into `.claude/settings.json` next to the graphify hooks |
| `.gemini/settings.json` hooks | `.gemini/settings.json`, plus `context.fileName` so Gemini reads `AGENTS.md` |
| `.codex/hooks.json` | `.codex/hooks.json`, paths changed from `.codex/skills/` to `.agents/skills/` |

Project config: `.impeccable/config.json` suppresses the `overused-font` finding for Inter and Helvetica because docs/specs/04 §C.2 chose them. Upgrade: re-copy the three builds from a newer upstream commit and update this file. How the team uses it: [docs/ops/agentic-workflow.md](../../docs/ops/agentic-workflow.md).
