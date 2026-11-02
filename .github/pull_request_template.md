<!-- markdownlint-disable-file MD041 -->
## What and why

<!-- One or two sentences. -->

## Traceability

- FR / NFR ids touched:
- TASK ids:
- Owning spec sections read:

## Checklist

- [ ] Owning spec updated first if behaviour changed (`docs/specs/…`)
- [ ] Every new displayed value has a provenance label (`data-provenance`) and source id
- [ ] Still works offline (no runtime requests beyond `localhost`)
- [ ] Mars CRS rules kept (no EPSG:3857/WGS84, no `ol/sphere`, east-positive longitude)
- [ ] Tests added or updated (`it.todo` / skipped while the TASK-00 phase gate holds)
- [ ] `make lint typecheck test docs-check` passes
- [ ] `docs/AI_USE.md` updated if AI tools helped
