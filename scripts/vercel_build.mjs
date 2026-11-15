#!/usr/bin/env node
// Vercel build (docs/ops/hosting.md §5): `npm run build` has already written apps/web/dist; this copies every site bundle
// to dist/sites/ (the path the app fetches, 02 §E.1) and fails the build if a manifest asset is missing or its SHA-256
// differs. That also catches Git LFS pointer files, which is what a build receives when LFS is disabled for the project.
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "apps/web/dist");
const sitesIn = join(root, "data/sites");
const sitesOut = join(dist, "sites");

if (!existsSync(join(dist, "index.html"))) throw new Error("apps/web/dist/index.html missing: run `npm run build` first");
if (!existsSync(join(dist, "replay/recording.json"))) throw new Error("apps/web/dist/replay/recording.json missing");

cpSync(sitesIn, sitesOut, { recursive: true });

function assetsOf(node, out = []) {
  if (Array.isArray(node)) node.forEach((child) => assetsOf(child, out));
  else if (node && typeof node === "object") {
    if (typeof node.sha256 === "string" && typeof node.path === "string") out.push(node);
    Object.values(node).forEach((child) => assetsOf(child, out));
  }
  return out;
}

const problems = [];
let checked = 0;
for (const site of readdirSync(sitesOut)) {
  const manifestPath = join(sitesOut, site, "site-manifest.json");
  if (!existsSync(manifestPath)) continue;
  for (const asset of assetsOf(JSON.parse(readFileSync(manifestPath, "utf8")))) {
    const file = join(sitesOut, site, asset.path);
    if (existsSync(file) && statSync(file).isDirectory()) continue;
    checked += 1;
    if (!existsSync(file)) problems.push(`${site}: missing ${asset.path}`);
    else if (createHash("sha256").update(readFileSync(file)).digest("hex") !== asset.sha256) {
      problems.push(`${site}: sha256 mismatch ${asset.path} (Git LFS pointer? enable Git LFS in the Vercel project)`);
    }
  }
}
if (problems.length > 0) {
  console.error(`site bundle does not match its manifest:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`vercel_build: copied data/sites to dist/sites; ${checked} manifest assets verified`);
