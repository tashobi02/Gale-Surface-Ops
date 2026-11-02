# Vendored from spec-kit

Spec-review tooling copied from [github/spec-kit](https://github.com/github/spec-kit) at commit `7370e592`, under the MIT licence in [LICENSE](LICENSE).

| Upstream | Here | Changes |
| --- | --- | --- |
| `templates/{spec,plan,tasks,checklist,constitution}-template.md` | `.specify/templates/` | none |
| `templates/commands/{analyze,clarify,checklist}.md` | `.claude/commands/speckit.*.md` | `scripts:` frontmatter removed; the `{SCRIPT}` setup step replaced by a fixed mapping onto `docs/specs` (spec = 01 + 03 + 04, plan = 02 + 05, tasks = 06); `__SPECKIT_COMMAND_*__` → `/speckit.*`; constitution path → `.specify/memory/constitution.md` |
| `templates/constitution-template.md` (filled in) | `.specify/memory/constitution.md` | Principles taken from `CLAUDE.md` §2–§3 and the cited spec sections |

Not copied: the `specify` CLI, setup scripts (`scripts/`), and the `specify`, `plan`, `tasks`, `implement`, `converge` and `taskstoissues` commands; they assume one folder per feature, which this repo does not use.
