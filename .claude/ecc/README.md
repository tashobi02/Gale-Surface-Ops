# Vendored from ECC

Multi-agent orchestration files copied from [affaan-m/ECC](https://github.com/affaan-m/ECC) at commit `90606c83`, under the MIT licence in [LICENSE](LICENSE). Project rules in `CLAUDE.md` (including the TASK-00 phase gate) take precedence over anything here.

## What was copied

| Upstream | Here |
| --- | --- |
| `skills/orch-pipeline`, `orch-add-feature`, `orch-fix-defect`, `orch-change-feature`, `orch-refine-code`, `tdd-workflow` | `.claude/skills/<same>/` |
| `commands/orch-add-feature`, `orch-fix-defect`, `orch-change-feature`, `orch-refine-code`, `orch-review` | `.claude/commands/<same>.md` |
| `agents/planner`, `architect`, `code-architect`, `code-explorer`, `tdd-guide`, `build-error-resolver`, `code-reviewer`, `typescript-reviewer`, `python-reviewer`, `security-reviewer` | `.claude/agents/<same>.md` |
| `workflows/orch-review.workflow.js` | `.claude/workflows/orch-review.workflow.js` |
| `rules/common/development-workflow`, `security`, `testing`, `code-review` | `.claude/ecc/rules/common/` (kept out of `.claude/rules/` so they are not auto-loaded) |

## Edits made (paths only)

- `orch-pipeline/SKILL.md`: `rules/common/…` → `.claude/ecc/rules/common/…`.
- `commands/orch-review.md`: workflow `scriptPath` → `.claude/workflows/orch-review.workflow.js`.
- `orch-review.workflow.js`: agent types `ecc:<name>` → `<name>`; language map trimmed to the reviewers copied here (typescript, javascript, python). Other languages fall back to no language reviewer, as upstream does for unmapped languages.

## Known gaps

- Skills mention ECC commands not copied here: `/feature-dev`, `/plan`, `/build-fix`, `/refactor-clean`, `/gan-build`, `/tdd`, `/review-pr`. `/code-review` is provided by the `code-review` plugin. Use the agents directly instead.
- `orch-build-mvp` appears in the `orch-pipeline` operation table but was not copied.
- `tdd-workflow` refers to `scripts/setup-package-manager.js`, which is not in this repo.
- `/orch-review` needs Claude Code's Workflow tool (a native workflow script); without it, use `/code-review` or the `code-reviewer` agent.
