# CheesySpace: Martian Map

Our entry for the **NASA Space Apps Challenge**, in the challenge *Interplanetary Survival Guide: Martian Map*.

## The Challenge

NASA has mapped and studied Mars robotically for decades. Existing tools such as JPL's Mars Trek and the USGS-NASA Planetary Geologic Mapping Program show regional and global views. They don't show the hyperlocal areas that astronauts would target on a single surface excursion.

The goal is to build a **map, tool, or interface that a Mars astronaut could use during a surface exploration mission**. It should layer data from multiple NASA missions for a chosen location or route, so a crew can plan and carry out a safe and scientifically productive "Marswalk".

### Requirements from the brief

- **Layered, integrated view** of a specific location or route on Mars, built on NASA data and tools.
- **At least three data types** are suggested. Examples are optical, thermal, spectral, topographic, geophysical, atmospheric, radiation and chemical.
- **Safety first.** Consider radiation and space-weather context, terrain hazards, and suit and equipment mobility limits.
- **Route planning** (if possible) that links the scientific objectives while avoiding major obstacles such as large rock formations.
- **Scientific goals** that guide the choice of location. The brief's example is boxwork formations in the Mount Sharp region, where Curiosity made observations.

### Optional ideas from the brief

- Form factor: a crew-cabin or habitat display, a handheld tablet app, or a helmet HUD.
- Output: a static snapshot, an interactive product, or a tool that generates maps for different locations and data types.
- Time frame: past data, predicted conditions, or none (for stable data such as topography and geology).
- Surface-mission point-of-view imagery, so the astronaut knows what to expect on arrival.
- Crew logistics: rover support, or astronauts working in pairs.

## Repository Contents

```
.
├── README.md
└── docs/
    ├── challenge-overview.md        # Official challenge description, objectives, considerations
    └── mars_scientific_context.md   # Mars reference: geology, atmosphere, radiation, human factors, bibliography
```

| File | Purpose |
|------|---------|
| [docs/challenge-overview.md](docs/challenge-overview.md) | Challenge statement, objectives and optional considerations. |
| [docs/mars_scientific_context.md](docs/mars_scientific_context.md) | A cited reference on Mars science. Its 14 sections cover planetary history, interior, geography, soil and regolith (including perchlorates), atmosphere and dust storms, water and ice, seasons and sunlight, radiation, the human perspective (pressure, partial gravity, thermal, dust, communications delay), habitability, open questions, a glossary and a bibliography. |

## Status

The project is at the **research and planning stage**. The repository holds only the challenge brief and the scientific background. It has no source code, dependencies, build steps or commits yet. This README will gain setup and usage instructions once the implementation exists.

## Next Steps

1. Choose the location or route and the science objective.
2. Select at least three NASA data layers for that site and confirm where they come from.
3. Decide the form factor (tablet, HUD, habitat display or other).
4. Build the layered map, with hazard and route information.
5. Document the data sources, setup and usage here.

## References

- [docs/challenge-overview.md](docs/challenge-overview.md) for the challenge text.
- The bibliography in [docs/mars_scientific_context.md](docs/mars_scientific_context.md) lists NASA, ESA and USGS sources and peer-reviewed publications.
- Challenge resources: see the Resources tab on the NASA Space Apps Challenge page.

