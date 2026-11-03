---
name: block-earth-crs
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: web/src/.*\.tsx?$
  - field: new_text
    operator: regex_match
    pattern: EPSG:3857|ol/sphere|fromLonLat|maplibre
---
Earth-default code in a Mars app. Use the site's proj4 projection and projected metres.
