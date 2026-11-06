# Agentic workflow — one rule set, many coding agents

| | |
| --- | --- |
| **Owner** | Sadman Shaharier Mahim, product & systems lead ([06 §A.1](../specs/06_High_Level_Implementation_Plan.md#a1-roles)) |
| **Date** | 2026-11-05 |
| **Status** | Draft for the 6 Nov kickoff |
| **Related** | [AGENTS.md](../../AGENTS.md) · [CLAUDE.md](../../CLAUDE.md) · [Coordination map §h](../tasks/_coordination.md#h1-branches-prs-and-commits) · [06 §A.2 assignments](../specs/06_High_Level_Implementation_Plan.md#a2-assignment-by-person-proposed-2026-11-05--sign-off-at-the-6-nov-kickoff) · [Mockup handoff](../design/mockup-handoff.md) · [AI use](../AI_USE.md) |

The team uses different coding agents: Claude Code, Codex, Gemini CLI, and some people more than one. This file makes them all follow the same rules and the same process. It adds no requirement; specs 01–06 still decide what to build.

## A. Who reads what

| Agent | Instruction file it reads | Skills folder | Slash commands | Design-check hook |
| --- | --- | --- | --- | --- |
| **Claude Code** | `CLAUDE.md` (which points to the rules in `AGENTS.md`) | `.claude/skills/` | `/orch-*`, `/speckit.*`, `/trace`, `/rehearse-offline`, `/impeccable` | `.claude/settings.json` (graphify guard + Impeccable) |
| **Codex CLI** | `AGENTS.md` | `.agents/skills/` (Impeccable vendored; project skills mirrored by `make agent-skills`) | None: ask it to follow the command file (§D) | `.codex/hooks.json`; approve it once in Codex's `/hooks` (`TODO(verify)` that Codex picks up project hooks from this path, U-49) |
| **Gemini CLI** | `AGENTS.md`, through `context.fileName` in `.gemini/settings.json` | `.gemini/skills/` (Agent Skills may need enabling in Gemini's settings) | None: ask it to follow the command file (§D) | `.gemini/settings.json` |
| **Anything else** (Cursor, Copilot, Antigravity) | `AGENTS.md` | — | — | Run `make design-check` before a UI PR |

`AGENTS.md` is the single rule set. `CLAUDE.md` adds only Claude-specific tooling. Change a rule in `AGENTS.md` first.

## B. Day-one setup (everyone, 6 Nov)

1. Clone the repo, check out `main` after the `v2-surface-ops` PR is merged, and run `make setup` (Node workspaces + conda pipeline environment).
2. Run `make agent-skills` if you use Codex or Gemini. It copies the project's own skills from `.claude/skills/` into `.agents/skills/` and `.gemini/skills/`; the copies are git-ignored, so `.claude/skills/` stays the only source.
3. Start your agent in the repo root and ask it: "Read AGENTS.md and docs/README.md, then tell me the rules you must follow." Check that it names the no-internet, no-AI-numbers, provenance and Mars CRS rules before you give it work.
4. Write your agent in the "Coding agent" column of [06 §A.2](../specs/06_High_Level_Implementation_Plan.md#a2-assignment-by-person-proposed-2026-11-05--sign-off-at-the-6-nov-kickoff).

## C. Branches, pull requests and ownership

- Follow [_coordination.md §h.1](../tasks/_coordination.md#h1-branches-prs-and-commits): one subtask = one branch = one PR, branch `t05.18-astar-core`. v2 tasks are atomized too since 6 Nov: `t20.04-hab-server`, `t05b.04-haven` (lower-case id, letter included).
- Only edit the folders and files your role owns ([_coordination.md §c](../tasks/_coordination.md#c-path-ownership) and 06 §A.1). `packages/protocol` changes need a review from both R2 and R4.
- Never push to `main` directly and never force-push. Rebase on `main` at least once a day.
- Every PR fills the template, including the AI-use line: which agent, which model, what it wrote.

## D. The same pipeline in every agent

Every change goes **plan → human gate → tests first → implement → review → human gate → commit**. That is ECC's gated pipeline ([.claude/ecc/README.md](../../.claude/ecc/README.md)).

| Step | Claude Code | Codex / Gemini / others |
| --- | --- | --- |
| Feature | `/orch-add-feature <TASK id>` | "Follow `.claude/commands/orch-add-feature.md` for `<TASK id>` step by step. Stop at every GATE and wait for me." |
| Bug | `/orch-fix-defect` | Same, with `.claude/commands/orch-fix-defect.md` |
| Spec question before coding | `/speckit.analyze`, `/speckit.clarify` | Same, with `.claude/commands/speckit.analyze.md` or `speckit.clarify.md` |
| UI quality | `/impeccable critique <screen>`, `/impeccable audit <screen>` | Codex: `$impeccable critique <screen>`; Gemini: invoke the `impeccable` skill; others: `make design-check` |
| Before commit | `make lint typecheck test docs-check` | Same |

The agents in `.claude/agents/` are Markdown role descriptions. A non-Claude agent can be told to act as one: "Review this diff as described in `.claude/agents/typescript-reviewer.md`."

## E. Which tool for which job

| Tool | Use it for | Do not use it for |
| --- | --- | --- |
| **spec-kit** (vendored subset) | Checking specs 01–06 for gaps and conflicts before you code a task | Generating new spec folders (`specify`, `plan`, `tasks`): they would create a second source of truth next to `docs/specs` and `docs/tasks` |
| **ECC** (orch pipeline, agents, TDD) | Implementing every TASK and subtask | Overriding the phase gate, the non-negotiables or the test rules in `AGENTS.md` |
| **Impeccable** (v4.8.0, all three builds vendored) | Critique, audit and polish of `apps/web` screens and `docs/design/prototype` | Choosing fonts, colours or layout against 04 |

## F. Precedence when tools disagree

1. Specs 01–06 (04 for anything visual), then the ADRs.
2. `AGENTS.md`, then `CLAUDE.md`.
3. ECC, spec-kit and Impeccable defaults.

Known clash: Impeccable flags Inter and Helvetica as "overused fonts" and discourages IBM Plex; 04 §C.2 chose them. `.impeccable/config.json` already suppresses the Inter and Helvetica findings with that reason. If Impeccable suggests status colours for non-status things, brand orange in OPS or HUD, or moving a fixed-position element, the answer is no (04 §A.3).

## G. Safety rules for agents

- No agent writes a number into data, docs or code unless it comes from `packages/compute`, `pipeline/` or a cited source. Placeholders are `TODO(verify)`.
- Do not run any agent with permission checks bypassed on this repo.
- Impeccable live mode: before `/impeccable live`, set `IMPECCABLE_LIVE_COPY_AGENT=chat` (or `off`). Otherwise its Apply button can start `codex` or `claude` with approvals and sandboxing off.
- The Impeccable engine binary downloads once per machine on first use; it is git-ignored. If a hook times out on first run, run it again.
- Log AI help in the PR and in [AI_USE.md](../AI_USE.md).

## H. One-time Impeccable setup (R6 design, 6 Nov)

Run `/impeccable init` once and tell it: "Derive PRODUCT.md from docs/specs/01 and the design rules from docs/specs/04; 04 wins over your defaults." Review the PRODUCT.md and DESIGN.md it writes before committing them; if either contradicts 04, fix the file, not 04.

## Unresolved items owned by this document

| ID | Item | Owner | Due |
| --- | --- | --- | --- |
| U-49 | Confirm the project-level hook paths that Codex and Gemini actually load (`.codex/hooks.json`, `.gemini/settings.json`), and whether Codex reads skills from `.agents/skills/` in each person's installed version | Whoever uses each agent | 6 Nov |
| U-50 | Each person's coding agent (06 §A.2 column) | Everyone | 6 Nov |
