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
