/**
 * Test helper: gives the jsdom document the design tokens of `src/ui/styles/tokens.css`. jsdom does not load
 * stylesheets and Vitest blanks CSS imports, so the `:root` primitives (the `--name: value;` lines of the first `:root`
 * block) are read from the file and set on the document element, where `getComputedStyle` finds them as in the app.
 * Call after `installDom()`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TOKENS_PATH = fileURLToPath(new URL("../../src/ui/styles/tokens.css", import.meta.url));

export function applyTokens(): Record<string, string> {
  const css = readFileSync(TOKENS_PATH, "utf8");
  const root = /:root\s*{([\s\S]*?)\n}/.exec(css);
  if (!root?.[1]) throw new Error("tokens.css has no :root block");
  const tokens: Record<string, string> = {};
  for (const m of root[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)) tokens[m[1]!] = m[2]!.trim();
  for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, value);
  return tokens;
}
