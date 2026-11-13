# Self-Hosted Fonts

This directory contains offline font assets bundled for Gale Surface Ops per
[04 §C.2](../../../../docs/specs/04_Design_Brief.md#c2-typography) and
[02 §F NFR-01, NFR-07](../../../../docs/specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation).
No external font network requests or CDNs are permitted.

Only the weights specifically required by 04 §C.2 are included:

- **Inter**: 400 (Regular), 500 (Medium), 600 (SemiBold) for UI text
- **IBM Plex Mono**: 500 (Medium) for tabular numbers and microcopy
- **Chakra Petch**: 500 (Medium) for display and headings (never for digits or text under 20 px)
- **Source Serif 4**: 400 (Regular) for long-form text (BRIEF, PRINT)

## Font Registry

| Family | Files | Version | Source URL | Licence | Date Fetched |
| --- | --- | --- | --- | --- | --- |
| Inter | `Inter-Regular.woff2`<br>`Inter-Medium.woff2`<br>`Inter-SemiBold.woff2` | 4.1 | [github.com/rsms/inter/releases/tag/v4.1](https://github.com/rsms/inter/releases/tag/v4.1) | SIL Open Font License 1.1 (`inter/LICENSE`) | 2026-11-07 |
| IBM Plex Mono | `IBMPlexMono-Medium.woff2` | 1.1.0 | [github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%401.1.0](https://github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%401.1.0) | SIL Open Font License 1.1 (`ibm-plex-mono/LICENSE.txt`) | 2026-11-07 |
| Chakra Petch | `ChakraPetch-Medium.woff2` (500, Latin subset) | `@fontsource/chakra-petch` 5.3.0 (file `chakra-petch-latin-500-normal.woff2`; SHA-256 `36ad966cb653de70ba37355c41003b02de8940b2df6cbcd46480a6ad8cadd65d`) | [registry.npmjs.org/@fontsource/chakra-petch/-/chakra-petch-5.3.0.tgz](https://registry.npmjs.org/@fontsource/chakra-petch/-/chakra-petch-5.3.0.tgz); licence from [google/fonts ofl/chakrapetch/OFL.txt](https://github.com/google/fonts/blob/main/ofl/chakrapetch/OFL.txt) | SIL Open Font License 1.1 (`chakra-petch/OFL.txt`) | 2026-11-11 |
| Source Serif 4 | `SourceSerif4-Regular.woff2` (400, Latin subset) | `@fontsource/source-serif-4` 5.3.1 (file `source-serif-4-latin-400-normal.woff2`; SHA-256 `02194deb92d3975dd30e11a3824a1f1db32b48c93654e60560cb81ce8e7b5f95`) | [registry.npmjs.org/@fontsource/source-serif-4/-/source-serif-4-5.3.1.tgz](https://registry.npmjs.org/@fontsource/source-serif-4/-/source-serif-4-5.3.1.tgz); licence from [google/fonts ofl/sourceserif4/OFL.txt](https://github.com/google/fonts/blob/main/ofl/sourceserif4/OFL.txt) | SIL Open Font License 1.1 (`source-serif-4/OFL.txt`) | 2026-11-11 |

## Licences and Redistribution

All four font families are distributed under the **SIL Open Font License, Version 1.1**,
which permits bundling, modification, and redistribution with software applications
(including public Apache-2.0 repositories), provided font names are preserved and
the fonts are not sold individually.

## Credits (for T16.03 / Main README)

- **Inter**: Copyright © 2016 The Inter Project Authors (<https://github.com/rsms/inter>), licensed under SIL Open Font License 1.1.
- **IBM Plex Mono**: Copyright © 2017 IBM Corp. with Reserved Font Name "Plex", licensed under SIL Open Font License 1.1.
- **Chakra Petch**: Copyright 2018 The Chakra Petch Project Authors (<https://github.com/m4rc1e/Chakra-Petch>), licensed under SIL Open Font License 1.1.
- **Source Serif 4**: Copyright 2014 The Source Serif 4 Project Authors (<https://github.com/adobe-fonts/source-serif>), licensed under SIL Open Font License 1.1.
