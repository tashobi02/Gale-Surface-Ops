"""Tests for scripts/check_ai_use_log.py (T30.02)."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

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
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; cited "
        f"`apps/web/tests/ui/gone.test.ts` and `apps/web/tests/ui/here.test.ts` | No code changed | "
        "Obidit Islam to review | This Codex conversation |\n"
        f"| 2026-11-13 | Codex (gpt-6.1-sol, xhigh) review | Correction to the row above: the broken link was "
        f"the pre-fix form `apps/web/tests/ui/gone.test.ts`, replaced by `apps/web/tests/ui/here.test.ts` | "
        "Did not change the earlier row's text | Obidit Islam to review | This Codex conversation |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 0, res.stdout + res.stderr
    assert "Cited repo paths missing from HEAD and git history: 0" in res.stdout


def test_a_correction_row_using_a_dotted_path_still_exempts(tmp_path: Path) -> None:
    """The correction row may write the path with a leading `./`; it is the same path."""
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
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; cited "
        f"`apps/web/tests/ui/gone.test.ts` and `apps/web/tests/ui/here.test.ts` | No code changed | "
        "Obidit Islam to review | This Codex conversation |\n"
        f"| 2026-11-13 | Codex (gpt-6.1-sol, xhigh) review | Correction to the row above: the broken link was "
        f"the pre-fix form `./apps/web/tests/ui/gone.test.ts`, replaced by `apps/web/tests/ui/here.test.ts` | "
        "Did not change the earlier row's text | Obidit Islam to review | This Codex conversation |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 0, res.stdout + res.stderr
    assert "Cited repo paths missing from HEAD and git history: 0" in res.stdout


def test_a_live_citation_of_a_path_a_correction_row_superseded_is_still_flagged(
    tmp_path: Path,
) -> None:
    """A correction row must not exempt a path that another clause cites as live."""
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
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; cited "
        f"`apps/web/tests/ui/gone.test.ts` and `apps/web/tests/ui/here.test.ts` | No code changed | "
        "Obidit Islam to review | This Codex conversation |\n"
        f"| 2026-11-13 | Codex (gpt-6.1-sol, xhigh) review | Correction to the row above: the broken link was "
        f"the pre-fix form `apps/web/tests/ui/gone.test.ts`; the current file is "
        f"`apps/web/tests/ui/gone.test.ts:12` | Did not change the earlier row's text | "
        "Obidit Islam to review | This Codex conversation |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert res.returncode == 1
    assert "Cited repo paths missing from HEAD and git history: 1" in res.stdout
    assert "gone.test.ts" in res.stdout


def test_a_correction_row_exempts_an_earlier_rows_superseded_commit(tmp_path: Path) -> None:
    """A later row that names a dropped commit exempts the earlier row's citation."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; restored the report from "
        f"`deadbe1` | No code changed | Obidit Islam to review | This Codex conversation |\n"
        f"| 2026-11-13 | Codex (gpt-6.1-sol, xhigh) review | Correction to the row above: the restored report "
        f"came from the dropped commit `deadbe1` | Did not change the earlier row's text | "
        "Obidit Islam to review | This Codex conversation |\n"
        "\n"
        "## Commits with no AI assistance\n\n"
        "| Commit | Date | Subject | Reason |\n| --- | --- | --- | --- |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert "Commit SHAs cited in Log not in HEAD history: 0" in res.stdout
    sha_section = res.stdout.split("[Reverse] Commit SHAs cited in Log not in HEAD history:")[1]
    assert "deadbe1" not in sha_section


def test_a_live_citation_of_a_commit_a_correction_row_dropped_is_still_flagged(tmp_path: Path) -> None:
    """A dropped commit in one clause must not exempt an unrelated cited commit."""
    repo = _init_repo(tmp_path)
    (repo / "apps/web/real.ts").write_text("export const r = 1;\n", encoding="utf-8")
    _git(repo, "add", "apps/web/real.ts")
    _git(repo, "commit", "-q", "-m", "feat(web): add the real screen with its overlay")
    (repo / "docs/AI_USE.md").write_text(
        "# AI use log\n\n## Log\n\n"
        "| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        f"| 2026-11-13 | Codex (GPT-6) | add the real screen with its overlay; implemented commit "
        f"`deadbe1` | No code changed | Obidit Islam to review | This Codex conversation |\n"
        f"| 2026-11-13 | Codex (gpt-6.1-sol, xhigh) review | Correction to the row above: the dropped commit "
        f"`deadbe1` was a different one | Did not change the earlier row's text | "
        "Obidit Islam to review | This Codex conversation |\n"
        "\n"
        "## Commits with no AI assistance\n\n"
        "| Commit | Date | Subject | Reason |\n| --- | --- | --- | --- |\n",
        encoding="utf-8",
    )
    res = _run_check(repo)
    assert "Commit SHAs cited in Log not in HEAD history: 1" in res.stdout
    assert "deadbe1" in res.stdout


def _audit_descriptions(tmp_path: Path, descriptions: list[str], files: tuple[str, ...] = ()) -> subprocess.CompletedProcess[str]:
    """Audit prose against a real Git fixture; every row has an independent match."""
    repo = _init_repo(tmp_path)
    for name in ('apps/web/real.ts', *files):
        target = repo / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('fixture\n', encoding='utf-8')
    _git(repo, 'add', '.')
    _git(repo, 'commit', '-q', '-m', 'test: T13.01 audit fixture')
    (repo / 'docs/AI_USE.md').write_text(
        '# AI use log\n\n## Log\n\n'
        '| Date | Tool | What AI did | What AI did not do | Human review | Prompts |\n'
        '| --- | --- | --- | --- | --- | --- |\n'
        + ''.join(f'| 2026-11-13 | Codex | T13.01: {text} | None | Reviewed | Local |\n' for text in descriptions),
        encoding='utf-8',
    )
    return _run_check(repo)


def test_negated_bare_commit_remains_live(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['not dropped commit deadbe1'])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout


def test_later_bare_occurrence_of_historical_commit_remains_live(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['dropped commit deadbe1; implemented commit deadbe1'])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout


def test_backticked_history_does_not_hide_bare_live_occurrence(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['dropped commit `deadbe1`; implemented commit DEAdbe1'])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout


def test_restoration_across_a_backticked_report_names_only_source_as_historical(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['restored `docs/report.md` from `deadbe1`'], ('docs/report.md',))
    assert res.returncode == 0, res.stdout


def test_restoration_does_not_exempt_its_missing_destination(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['restored `docs/report.md` from `deadbe1`'])
    assert 'Cited repo paths missing from HEAD and git history: 1' in res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 0' in res.stdout


def test_a_literal_colon_number_filename_requires_exact_path(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['created literal filename `docs/report.md:123`'], ('docs/report.md',))
    assert res.returncode == 1, res.stdout
    assert 'Cited repo paths missing from HEAD and git history: 1' in res.stdout


def test_existing_literal_colon_number_filename_is_accepted(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['created literal filename `docs/report.md:123`'], ('docs/report.md:123',))
    assert res.returncode == 0, res.stdout


def test_normal_file_line_citation_still_resolves(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['reviewed `docs/report.md:123`'], ('docs/report.md',))
    assert res.returncode == 0, res.stdout


def test_explicit_correction_resolves_only_the_named_earlier_row(tmp_path: Path) -> None:
    # Without this correction, the original ordinary citation must fail.
    res = _audit_descriptions(tmp_path, [
        'reviewed `apps/web/typo.ts`',
        'Correction to the row above: its citation was the pre-fix form `./apps/web/typo.ts`, replaced by `apps/web/real.ts`',
    ])
    assert res.returncode == 0, res.stdout
    log = tmp_path / 'repo/docs/AI_USE.md'
    text = log.read_text(encoding='utf-8')
    log.write_text('\n'.join(text.splitlines()[:-1]) + '\n', encoding='utf-8')
    without_correction = _run_check(tmp_path / 'repo')
    assert without_correction.returncode == 1
    assert 'Cited repo paths missing from HEAD and git history: 1' in without_correction.stdout


def test_correction_does_not_exempt_later_live_path(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, [
        'reviewed `apps/web/typo.ts`',
        'Correction to the row above: its citation was the pre-fix form `./apps/web/typo.ts`, replaced by `apps/web/real.ts`',
        'implemented `apps/web/typo.ts`',
    ])
    assert res.returncode == 1, res.stdout
    assert 'Cited repo paths missing from HEAD and git history: 1' in res.stdout


def test_explicit_correction_of_earlier_commit_is_scoped(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, [
        'reviewed commit `deadbe1`',
        'Correction to the row above: its citation named the dropped commit `DEADBE1`, not a commit on main',
        'implemented commit `deadbe1`',
    ])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout


def test_full_commit_sha_is_checked(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['implemented commit `deadbe1234567890abcdef1234567890abcdef12`'])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout


@pytest.mark.parametrize('report', ['T05.32 report', 'version 2.5 report', 'report.md', 'v2.0.1 report'])
def test_dotted_restoration_reference_is_historical(tmp_path: Path, report: str) -> None:
    res = _audit_descriptions(tmp_path, [f'restored {report} from `deadbe1`'])
    assert res.returncode == 0, res.stdout


@pytest.mark.parametrize('description,category', [
    ('dropped a cache and wrote file `apps/web/missing.ts`', 'Cited repo paths missing from HEAD and git history'),
    ('dropped a cache and implemented commit `deadbe1`', 'Commit SHAs cited in Log not in HEAD history'),
    ('dropped version 2. Implemented file `apps/web/missing.ts`', 'Cited repo paths missing from HEAD and git history'),
    ('renamed from `apps/web/view.ts.bak` to `apps/web/view.ts`', 'Cited repo paths missing from HEAD and git history'),
    ('the pre-fix form `apps/web/missing.ts`; reviewed `apps/web/missing.ts`', 'Cited repo paths missing from HEAD and git history'),
    ('the pre-fix form `./apps/web/missing.ts`; reviewed `apps/web/missing.ts:12`', 'Cited repo paths missing from HEAD and git history'),
    ('dropped commit `deadbe1`; implemented commit `DEADBE1`', 'Commit SHAs cited in Log not in HEAD history'),
    ('not dropped commit `deadbe1`', 'Commit SHAs cited in Log not in HEAD history'),
    ('never rebased away commit deadbe1', 'Commit SHAs cited in Log not in HEAD history'),
    ('restored report.md. copied from `deadbe1`', 'Commit SHAs cited in Log not in HEAD history'),
])
def test_historical_marker_does_not_hide_live_reference(tmp_path: Path, description: str, category: str) -> None:
    res = _audit_descriptions(tmp_path, [description])
    assert res.returncode == 1, res.stdout
    assert f'{category}: 1' in res.stdout


def test_bare_dropped_list_from_real_log_is_historical(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['dropped the duplicate eebc08e, the merge c539af0 and his T05.32 handler commit 5d80664'])
    assert res.returncode == 0, res.stdout


def test_restoration_with_compound_report_name_from_real_log(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['Restored the historical TASK-14 system-test report, command ledger and reproduction probes from `fa25bee`'])
    assert res.returncode == 0, res.stdout


def test_bare_restoration_source_after_backticked_destination(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['restored `docs/report.md` from deadbe1'], ('docs/report.md',))
    assert res.returncode == 0, res.stdout


def test_literal_filename_keeps_hash_and_trailing_punctuation(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['created literal filename `docs/report#part.md.`'], ('docs/report#part.md.',))
    assert res.returncode == 0, res.stdout


@pytest.mark.parametrize('description', [
    'log_hash abc1234; implemented commit `deadbe1`',
    'digest abc1234; implemented commit deadbe1',
])
def test_non_commit_digest_marker_does_not_hide_later_commit(tmp_path: Path, description: str) -> None:
    res = _audit_descriptions(tmp_path, [description])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout
    assert 'deadbe1' in res.stdout


@pytest.mark.parametrize('source', ['`deadbe1`', 'deadbe1'])
def test_backticked_restoration_destination_from_commit_source(tmp_path: Path, source: str) -> None:
    res = _audit_descriptions(tmp_path, [f'restored `docs/report.md` from commit {source}'], ('docs/report.md',))
    assert res.returncode == 0, res.stdout


@pytest.mark.parametrize('source', ['`deadbe1`', 'deadbe1'])
def test_negated_restoration_from_commit_is_live(tmp_path: Path, source: str) -> None:
    res = _audit_descriptions(tmp_path, [f'not restored `docs/report.md` from commit {source}'], ('docs/report.md',))
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout


def test_restoration_from_commit_still_requires_destination(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['restored `docs/report.md` from commit `deadbe1`'])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 0' in res.stdout
    assert 'Cited repo paths missing from HEAD and git history: 1' in res.stdout


@pytest.mark.parametrize('sha', ['deadbee', '1234567'])
@pytest.mark.parametrize('quoted', [False, True])
def test_explicit_commit_id_may_have_only_letters_or_only_digits(tmp_path: Path, sha: str, quoted: bool) -> None:
    citation = f'`{sha}`' if quoted else sha
    res = _audit_descriptions(tmp_path, [f'implemented commit {citation}'])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout


def test_ordinary_alpha_word_and_counter_are_not_inferred_as_commits(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['used label `deadbee` and counter `1234567`'])
    assert res.returncode == 0, res.stdout


def test_typed_plan_hash_comparison_is_not_a_commit_pair(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['a different `plan_hash` (`abc1234` against `def5678`)'])
    assert res.returncode == 0, res.stdout


def test_typed_hash_comparison_cannot_hide_later_commit(tmp_path: Path) -> None:
    res = _audit_descriptions(tmp_path, ['`plan_hash` (`abc1234` against `def5678`); implemented commit `deadbe1`'])
    assert res.returncode == 1, res.stdout
    assert 'Commit SHAs cited in Log not in HEAD history: 1' in res.stdout
