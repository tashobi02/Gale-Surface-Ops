---
name: warn-earth-crs-python
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: pipeline/.*\.py$
  - field: new_text
    operator: regex_match
    pattern: EPSG:(3857|4326)
---
Earth CRS code in the Mars pipeline. Use `IAU_2015:49900` and the working `+proj=eqc` string from `config.py`; see the `mars-geospatial` skill.
