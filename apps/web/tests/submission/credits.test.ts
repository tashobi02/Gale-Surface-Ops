import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("T16.05 README credits", () => {
  for (const site of ["mock_site", "gale_boxwork"]) {
    it(`names every source and image credit from ${site}`, () => {
      const manifest = JSON.parse(read(`data/sites/${site}/site-manifest.json`)) as { sources: { source_id: string; title: string; credit: string }[] };
      const pois = JSON.parse(read(`data/sites/${site}/vectors/pois.geojson`)) as { features: { properties: { image_credit?: string } }[] };
      const readme = read("README.md");
      for (const source of manifest.sources) {
        expect(readme, source.source_id).toContain(source.title);
        expect(readme, source.source_id).toContain(source.credit);
      }
      for (const poi of pois.features) if (poi.properties.image_credit) expect(readme).toContain(poi.properties.image_credit);
    });
  }
});
