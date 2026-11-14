"""Tests for scripts/check_ai_use_log.py (T30.02)."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check_ai_use_log.py"


def _git(repo: Path, *args: str, env_extra: dict[str, str] | None = None) -> str:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "Test Author",
        "GIT_AUTHOR_EMAIL": "test@example.com",
        "GIT_COMMITTER_NAME": "Test Author",
        "GIT_COMMITTER_EMAIL": "test@example.com",
        "GIT_AUTHOR_DATE": "2026-11-13T10:00:00Z",
        "GIT_COMMITTER_DATE": "2026-11-13T10:00:00Z",
        **(env_extra or {}),
    }
    return subprocess.check_output(["git", *args], cwd=repo, text=True, env=env).strip()


def _init_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q")
    (repo / "docs").mkdir()
    (repo / "apps/web").mkdir(parents=True)
    return repo


def _run_check(repo: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--repo", str(repo), "--ai-use", "docs/AI_USE.md"],
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_clean_repo_passes(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    (repo / "apps/web/widget.ts").write_text("export const x = 1;\n", encoding="utf-8")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| 2026-11-13 | Codex | T13.07/08: added `apps/web/widget.ts` (conversation 56455a5c, `plan_hash` `45cb163eec7f`) | T24.09 untouched | Reviewed | Local |\n",
        encoding="utf-8",
    )
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "feat(web): T13.08 add widget\n\nCo-Authored-By: GPT-6 <noreply@openai.com>")

    res = _run_check(repo)
    assert res.returncode == 0, res.stdout + res.stderr
    assert "Covered: 1" in res.stdout


def test_uncovered_ai_commit_exits_nonzero(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    (repo / "apps/web/other.ts").write_text("export const y = 2;\n", encoding="utf-8")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n",
        encoding="utf-8",
    )
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "chore: missing log row\n\nCo-Authored-By: Claude <noreply@anthropic.com>")

    res = _run_check(repo)
    assert res.returncode == 1
    assert "Uncovered commits WITH AI Co-Authored-By trailer: 1" in res.stdout
    assert "chore: missing log row" in res.stdout


def test_not_do_column_does_not_falsely_cover_commit(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    (repo / "apps/web/a.ts").write_text("export const a = 1;\n", encoding="utf-8")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| 2026-11-13 | Codex | T13.01: updated `apps/web/a.ts` | Did not touch T24.09 | Reviewed | Local |\n",
        encoding="utf-8",
    )
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "feat(web): T13.01 initial")

    (repo / "apps/web/b.ts").write_text("export const b = 2;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/b.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): T24.09 unrelated")

    res = _run_check(repo)
    assert res.returncode == 1
    assert "T24.09 unrelated" in res.stdout


def test_reverse_checks_flag_unmatched_row_missing_sha_and_missing_path(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| 2026-11-13 | Codex | T99.99: phantom `apps/web/missing.ts` from commit `deadbeef1` | None | Reviewed | Local |\n",
        encoding="utf-8",
    )
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): T01.01 real commit")

    res = _run_check(repo)
    assert res.returncode == 1
    assert "Log rows matching zero commits in HEAD: 1" in res.stdout
    assert "Commit SHAs cited in Log not in HEAD history: 1" in res.stdout
    assert "Cited repo paths missing from HEAD and git history: 1" in res.stdout


def test_documented_mechanical_commit_is_covered_by_exact_sha(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "chore: regenerate progress")
    sha = _git(repo, "rev-parse", "--short=7", "HEAD")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n\n"
        "## Commits with no AI assistance\n\n"
        "| Commit | Date | Subject | Reason |\n| --- | --- | --- | --- |\n"
        f"| `{sha}` | 2026-11-13 | chore: regenerate progress | Mechanical output |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 0, res.stdout + res.stderr


def test_no_ai_section_does_not_hide_ai_trailers(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat: real\n\nCo-Authored-By: Claude <noreply@anthropic.com>")
    sha = _git(repo, "rev-parse", "--short=7", "HEAD")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n\n"
        "## Commits with no AI assistance\n\n"
        "| Commit | Date | Subject | Reason |\n| --- | --- | --- | --- |\n"
        f"| `{sha}` | 2026-11-13 | feat: real | Incorrect entry |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 1
    assert "Uncovered commits WITH AI Co-Authored-By trailer: 1" in res.stdout


def test_superseded_path_and_commit_are_not_required_to_resolve(tmp_path: Path) -> None:
    """A row may name a path or commit it corrected; such a reference need not exist."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    (repo / "apps/web/tests/ui").mkdir(parents=True)
    # The replacement path exists; only the pre-fix form is absent.
    (repo / "apps/web/tests/ui/here.test.ts").write_text("export const h = 1;\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; fixed one broken link (the pre-fix form "
        f"`apps/web/tests/ui/gone.test.ts` -> `apps/web/tests/ui/here.test.ts`) and "
        f"restored the report from `deadbe1` | No code changed | Obidit Islam to review | This Codex conversation |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 0, res.stdout + res.stderr
    assert "Cited repo paths missing from HEAD and git history: 0" in res.stdout
    assert "Commit SHAs cited in Log not in HEAD history: 0" in res.stdout


def test_a_real_missing_path_is_still_flagged(tmp_path: Path) -> None:
    """The superseded-reference rule must not hide a genuinely absent citation."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; wrote "
        "`apps/web/src/ui/never_existed.ts` | nothing | review | session |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 1
    assert "Cited repo paths missing from HEAD and git history: 1" in res.stdout


def test_a_marker_in_another_clause_does_not_exempt_the_citation(tmp_path: Path) -> None:
    """A supersession phrase must be in the clause that introduces the citation."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; dropped a cache; wrote "
        "`apps/web/src/ui/never_existed.ts` | nothing | review | session |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 1
    assert "Cited repo paths missing from HEAD and git history: 1" in res.stdout


def test_a_marker_elsewhere_does_not_exempt_a_cited_commit(tmp_path: Path) -> None:
    """A dropped commit in one clause must not exempt an unrelated cited commit."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; dropped an unused variable; "
        f"implemented commit `deadbe1` | nothing | review | session |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 1
    assert "Commit SHAs cited in Log not in HEAD history: 1" in res.stdout
    assert "deadbe1" in res.stdout


def test_the_replacement_of_a_superseded_path_must_still_exist(tmp_path: Path) -> None:
    """Exempting the pre-fix form must not exempt the path that replaced it."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; fixed one broken link (the pre-fix form "
        f"`apps/web/tests/ui/gone.test.ts` -> `apps/web/tests/ui/here.test.ts`) | nothing | review | session |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 1
    assert "Cited repo paths missing from HEAD and git history: 1" in res.stdout
    assert "here.test.ts" in res.stdout


def test_a_correction_row_exempts_an_earlier_rows_superseded_citation(tmp_path: Path) -> None:
    """An earlier row stays verbatim; a later correction row records the fix."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    (repo / "apps/web/tests/ui").mkdir(parents=True)
    (repo / "apps/web/tests/ui/here.test.ts").write_text("export const h = 1;\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; fixed one broken link "
        f"(`apps/web/tests/ui/gone.test.ts` -> `apps/web/tests/ui/here.test.ts`) | No code changed | "
        "Obidit Islam to review | This Codex conversation |\n"
        f"| 2026-11-13 | Codex (gpt-6.1-sol, xhigh) review | Correction to the row above: the broken link was "
        f"the pre-fix form `apps/web/tests/ui/gone.test.ts`, replaced by `apps/web/tests/ui/here.test.ts` | "
        "Did not change the earlier row's text | Obidit Islam to review | This Codex conversation |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 0, res.stdout + res.stderr
    assert "Cited repo paths missing from HEAD and git history: 0" in res.stdout
