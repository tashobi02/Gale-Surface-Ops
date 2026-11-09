# Self-Hosted Fonts

This directory contains offline font assets bundled for Marswalk Surface Ops per
[04 §C.2](../../../../docs/specs/04_Design_Brief.md#c2-typography) and
[02 §F NFR-01, NFR-07](../../../../docs/specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation).
No external font network requests or CDNs are permitted.

Only the weights specifically required by 04 §C.2 are included:

- **Inter**: 400 (Regular), 500 (Medium), 600 (SemiBold) for UI text
- **IBM Plex Mono**: 500 (Medium) for tabular numbers and microcopy

## Font Registry

| Family | Files | Version | Source URL | Licence | Date Fetched |
| --- | --- | --- | --- | --- | --- |
| Inter | `Inter-Regular.woff2`<br>`Inter-Medium.woff2`<br>`Inter-SemiBold.woff2` | 4.1 | [github.com/rsms/inter/releases/tag/v4.1](https://github.com/rsms/inter/releases/tag/v4.1) | SIL Open Font License 1.1 (`inter/LICENSE`) | 2026-11-07 |
| IBM Plex Mono | `IBMPlexMono-Medium.woff2` | 1.1.0 | [github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%401.1.0](https://github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%401.1.0) | SIL Open Font License 1.1 (`ibm-plex-mono/LICENSE.txt`) | 2026-11-07 |

## Licences and Redistribution

Both font families are distributed under the **SIL Open Font License, Version 1.1**,
which permits bundling, modification, and redistribution with software applications
(including public Apache-2.0 repositories), provided font names are preserved and
the fonts are not sold individually.

## Credits (for T16.03 / Main README)

- **Inter**: Copyright © 2016 The Inter Project Authors (<https://github.com/rsms/inter>), licensed under SIL Open Font License 1.1.
- **IBM Plex Mono**: Copyright © 2017 IBM Corp. with Reserved Font Name "Plex", licensed under SIL Open Font License 1.1.
