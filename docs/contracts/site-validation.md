# Site boot validation (C10, T14.03, T14.05)

| | |
| --- | --- |
| **Date** | 2026-11-15 |
| **Status** | Proposed implementation clarification, FD-566; resumed under Obidit Islam's instruction |
| **Owners** | Frontend boot and integration tests |
| **Sources** | [02 §E.1](../specs/02_Technical_Requirements_Document.md#e1-static-asset-contract), [05 §E.3–E.6](../specs/05_Backend_and_Database_Schema.md#e3-referential-integrity-validated-by-the-validate-manifest-command-and-at-app-boot-in-dev-builds), [C9 tile index](tile-grid.md#33-tiles-root-index-file-v12) |

The previous synchronous validator was a throwing stub. Asset fetching and Web Crypto hashing require an
asynchronous implementation. C10 `SiteValidator` accepts a promise of the existing `BootProblem[]` result;
synchronous injected validators remain supported. Planner boot awaits validation before creating a worker or
plan store. Validation failures end on SCR-00; an implementation stub is no longer a successful boot path.

The manifest schema major is compared with the bundled schema's major. Asset and source references must
resolve. Required grid arrays, required layers, POIs and traverse assets are fatal when missing. Optional layer
assets may be unavailable: boot removes their entries from the loaded asset lookup, so the existing map layer
controller and SCR-03 report them unavailable. The manifest remains unchanged. Missing optional thermal-inertia
data reaches the worker as `ti: null`, preserving `TI_UNKNOWN` warnings instead of inventing values.

Development builds fetch and hash asset bytes with Web Crypto. A tiles-root asset names its C9 `index.json`;
the manifest checksum covers that index. Production builds probe required-asset availability without computing checksums; optional assets are not
probed in production (BD-83), where the existing tile-load recovery reports unavailable layers. Grid delivery
still fetches the arrays it needs. All URLs stay relative to the selected site on the habitat
origin, and validation issues name the file. These details implement the existing acceptance criteria without
changing requirement text, ids, numerical thresholds or status labels.
