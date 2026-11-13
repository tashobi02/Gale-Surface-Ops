# Self-Hosted Outline Icons

This directory contains offline outline SVG icons for Gale Surface Ops per
[04 §C.4](../../../../docs/specs/04_Design_Brief.md#c4-iconography),
[04 §C.1](../../../../docs/specs/04_Design_Brief.md#status-and-alert-colours-ops), and
[02 §F NFR-01, NFR-07](../../../../docs/specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation).
No external icon font or CDN is used.

## Icon Set Registry

- **Icon Set**: Lucide Icons (upstream package: `lucide-static`)
- **Version**: 1.70.0
- **Licence**: ISC License (permissive open-source licence compatible with Apache-2.0)
- **Licence File**: [LICENSE](LICENSE)
- **Source URL**: <https://github.com/lucide-icons/lucide> / <https://www.npmjs.com/package/lucide-static>
- **Date Fetched**: 2026-11-07

## Included Icons (04 §C.4 & §C.1)

| Icon Name | File | Description / Use |
| --- | --- | --- |
| Layers | `layers.svg` | Map overlay layer controls |
| Route | `route.svg` | Traverse route selection / display |
| Flag | `flag.svg` | Waypoint / stop marker |
| Home | `home.svg` | Habitat base location |
| Sun | `sun.svg` | Solar conditions / phase |
| Radiation | `radiation.svg` | Environmental radiation hazard |
| Thermometer | `thermometer.svg` | Thermal conditions |
| Info | `info.svg` | Context / metadata inspection |
| Printer | `printer.svg` | Briefing card print view |
| Download | `download.svg` | Plan export / artifact download |
| Undo | `undo.svg` | Plan modification undo |
| Alert Triangle | `alert-triangle.svg` | Caution status / warning alert |
| Alert Octagon | `alert-octagon.svg` | Warning status alert |
| Alert Circle | `alert-circle.svg` | Advisory alert / notification |
| Check | `check.svg` | Task complete confirmation |
| Circle Check | `circle-check.svg` | Nominal status indicator (04 §C.1) |
| Triangle | `triangle.svg` | Caution status shape (04 §C.1) |
| Octagon | `octagon.svg` | Warning status shape (04 §C.1) |
| Diamond | `diamond.svg` | Unknown status shape (04 §C.1) |
| Circle Help | `circle-help.svg` | Unknown status / help indicator |

## Styling (04 §C.4)

[04 §C.4](../../../../docs/specs/04_Design_Brief.md#c4-iconography) accepts the Lucide defaults as shipped for v1:
`stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. The files here are used unchanged, with no
consumer override. Icons never stand alone for actions on EVA: icon + word.

## Licence and Attribution (T16.05)

Per [04 §C.4](../../../../docs/specs/04_Design_Brief.md#c4-iconography) the icon set is Lucide under the ISC licence.

Lucide Icons are licensed under the ISC License:
Copyright (c) 2026 Lucide Icons and Contributors.
Portions derived from Feather Icons (MIT License, Copyright (c) 2013-2017 Cole Bemis).
The complete licence text is preserved in `apps/web/public/icons/LICENSE`.
