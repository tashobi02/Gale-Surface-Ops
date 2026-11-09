<!-- markdownlint-disable-file MD041 -->
## What and why

<!-- One or two sentences. -->

## Traceability

- Subtask: <!-- Txx.yy -->
- FR / NFR ids touched:
- TASK ids:
- Owning spec sections read:

## Checklist

- [ ] Branch named `txx.yy-<slug>` (§h.1)
- [ ] PR title starts with the subtask id
- [ ] Owning spec updated first if behaviour changed (`docs/specs/…`)
- [ ] Every new displayed value has a provenance label (`data-provenance`) and source id
- [ ] Still works offline (no runtime requests beyond `localhost`)
- [ ] Mars CRS rules kept (no EPSG:3857/WGS84, no `ol/sphere`, east-positive longitude)
- [ ] Tests added or updated (`it.todo` / skipped while the TASK-00 phase gate holds)
- [ ] `make lint typecheck test docs-check` passes
- [ ] `python3 scripts/check_tasks.py` passes (CI enforces this)
- [ ] If this is a `verify` subtask: `docs/ops/verification-log.md` section appended
- [ ] `docs/AI_USE.md` updated if AI tools helped (coding agent and model: ___)
- [ ] UI change: Impeccable critique or `make design-check` run; findings that contradict 04 ignored with a reason
