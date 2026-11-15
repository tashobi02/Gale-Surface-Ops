"""Progress must count registered task suffixes without merging their task rows."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


SPEC = importlib.util.spec_from_file_location(
    "update_progress", Path(__file__).resolve().parents[1] / "update_progress.py"
)
assert SPEC and SPEC.loader
progress = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(progress)


@pytest.fixture
def task_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    tasks = tmp_path / "docs" / "tasks"
    tasks.mkdir(parents=True)
    (tasks / "README.md").write_text(
        "| Task | Title |\n| --- | --- |\n"
        "| TASK-05 | [Compute core](TASK-05_compute-core.md) |\n"
        "| TASK-05b | [Compute v2](TASK-05b_compute-v2.md) |\n"
    )
    for name in ("TASK-05_compute-core.md", "TASK-05b_compute-v2.md"):
        (tasks / name).write_text("# Test task\n")
    monkeypatch.setattr(progress, "TASKS", tasks)
    return tasks


def test_read_status_counts_letter_suffixes(task_dir: Path) -> None:
    (task_dir / "status.md").write_text(
        "| T05.01 | done | 2026-11-15 | core evidence |\n"
        "| T05b.01 | done | 2026-11-15 | v2 evidence |\n"
        "| T05b.02 | wip | 2026-11-15 | v2 work |\n"
    )
    problems: list[str] = []
    state = progress.read_status(dict.fromkeys(("T05.01", "T05b.01", "T05b.02")), problems)
    assert state == {"T05.01": "done", "T05b.01": "done", "T05b.02": "wip"}
    assert problems == []


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        ("| T05b.99 | done | date | evidence |\n", "unknown subtask T05b.99"),
        ("| T05b.01 | complete | date | evidence |\n", "T05b.01 has state 'complete'"),
        (
            "| T05b.01 | done | date | first |\n| T05b.01 | wip | date | duplicate |\n",
            "duplicate row for T05b.01",
        ),
    ],
)
def test_letter_suffixes_receive_the_same_validation(
    task_dir: Path, rows: str, message: str
) -> None:
    (task_dir / "status.md").write_text(rows)
    problems: list[str] = []
    progress.read_status({"T05b.01": {}}, problems)
    assert len(problems) == 1
    assert message in problems[0]


def test_render_separates_task_suffix_title_link_and_totals(task_dir: Path) -> None:
    reg = {
        "T05.01": {"type": "implement", "tag": "core"},
        "T05b.01": {"type": "implement", "tag": "core"},
        "T05b.02": {"type": "test", "tag": "core"},
        "T05b.21": {"type": "fallback", "tag": "core"},
    }
    state = {"T05.01": "done", "T05b.01": "done", "T05b.02": "wip", "T05b.21": "done"}
    rendered = progress.render(reg, state)
    assert "2 of 3 subtasks done, 1 in progress" in rendered
    rows = [line for line in rendered.splitlines() if line.startswith("| [TASK-")]
    assert len(rows) == 2
    assert "[TASK-05 Compute core](docs/tasks/TASK-05_compute-core.md)" in rows[0]
    assert rows[0].endswith("100 % | 1 | 0 | 1 |")
    assert "[TASK-05b Compute v2](docs/tasks/TASK-05b_compute-v2.md)" in rows[1]
    assert rows[1].endswith("50 % | 1 | 1 | 2 |")
    assert "1 fallback and desirable subtasks" in rendered
    assert "1 of them done" in rendered
