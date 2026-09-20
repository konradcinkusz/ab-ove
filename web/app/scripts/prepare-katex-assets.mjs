#!/usr/bin/env node
/**
 * Stage KaTeX's stylesheet and fonts into public/katex/, on this origin — the same
 * FRONTEND-BFF.md §1 reasoning `prepare-lab-assets.mjs` already applies to Pyodide, one
 * dependency over: nothing a reader's browser fetches while reading a frame may come from a
 * host this application does not control.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE STYLESHEET IS UPSTREAM'S OWN `swap` VARIANT, NOT A HAND-EDITED ONE.
 *
 * KaTeX 0.18.7 ships two built CSS files: `katex.min.css` (`font-display: block`, KaTeX's
 * default — measured: it hides every maths span for up to 3 s on a slow connection, and
 * F01 frame 1, the first screen a reader or the owner opens, is maths-heavy) and
 * `katex-swap.min.css` (`font-display: swap` — verified by grep against the built file
 * rather than assumed from the name). Swap shows the fallback glyph immediately and
 * re-flows once the real face arrives, which is one shift rather than up to three seconds
 * of nothing, and it costs nothing to reach: upstream already built it, so this script
 * copies THAT file rather than rewriting `font-display` by hand into the default one.
 *
 * A more elaborate plan — measure which faces F01/1 actually needs and `<link rel=preload>`
 * exactly those — was the first draft here and is not what shipped: it would need
 * recomputing every time a program's first frame changes which symbols it uses, which is
 * exactly the kind of number this repository's own book warns against carrying across a
 * change (CLAUDE.md: "a measurement carried across a change is the class of defect...").
 * `swap` needs no such list and does not go stale.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WOFF2-ONLY, THE OTHER HALF OF THE REWRITE.
 *
 * The built CSS lists three formats per face (`woff2`, `woff`, `truetype`) for browsers old
 * enough to lack woff2 support — none exist among this application's targets (Next 16 /
 * React 19 already assume evergreen browsers), and shipping three copies of twenty font
 * files would be triple the bytes for formats nothing here will ever request. This script
 * strips the `woff` and `truetype` `src` entries with a text substitution verified against
 * the built file (20 matches, one per face, checked below) and copies only the `.woff2`
 * files — 259 792 B total, measured, no `.woff`/`.ttf` staged at all.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const publicDir = join(app, 'public');

function fail(message) {
  console.error(`\nprepare-katex-assets: ${message}\n`);
  process.exit(1);
}

/**
 * `,url(...) format("woff"),url(...) format("truetype")` → nothing, leaving the woff2 entry
 * as the face's only source. Anchored on the literal format strings rather than a generic
 * "drop everything after the first url()" pattern, so a future KaTeX release that reorders
 * or adds a fourth format fails this script's own match-count check instead of silently
 * keeping (or dropping) the wrong thing.
 */
const WOFF_AND_TTF = /,url\([^)]+\) format\("woff"\),url\([^)]+\) format\("truetype"\)/g;

const { katexDir, version } = await (async () => {
  const require = createRequire(import.meta.url);
  let pkgPath;
  try {
    pkgPath = require.resolve('katex/package.json');
  } catch {
    return fail('the `katex` package is not installed.\n' + '  Fix:  pnpm install   (from web/)');
  }
  const dir = dirname(pkgPath);
  const version = JSON.parse(await readFile(pkgPath, 'utf8')).version;
  return { katexDir: dir, version };
})();

const dest = join(publicDir, 'katex');
await rm(dest, { recursive: true, force: true });
await mkdir(join(dest, 'fonts'), { recursive: true });

// The stylesheet, rewritten.
const source = join(katexDir, 'dist', 'katex-swap.min.css');
let css;
try {
  css = await readFile(source, 'utf8');
} catch {
  fail(
    `katex ${version} does not ship dist/katex-swap.min.css.\n` +
      '  This script names the swap-variant file explicitly (see its own header) — check\n' +
      '  what the new version renamed it to, or whether it dropped the variant, before\n' +
      '  editing this script.',
  );
}
if (!css.includes('font-display:swap')) {
  fail(`${source} does not declare font-display:swap — is this still the swap variant?`);
}

const matches = css.match(WOFF_AND_TTF) ?? [];
if (matches.length !== 20) {
  fail(
    `expected to strip exactly 20 woff/truetype src entries (one per KaTeX face) from ` +
      `${source}, found ${matches.length}.\n` +
      '  The face count is a fact about this KaTeX version, not a guess — recount before\n' +
      "  changing this script's expectation.",
  );
}
const rewritten = css.replace(WOFF_AND_TTF, '');
if (rewritten.includes('format("woff")') || rewritten.includes('format("truetype")')) {
  fail(`${source}: a woff or truetype reference survived the rewrite.`);
}
await writeFile(join(dest, 'katex.min.css'), rewritten, 'utf8');

// The fonts: woff2 only, named one at a time by reading the rewritten CSS's own references
// rather than a directory copy — the same "a decision, not a directory copy" reasoning
// `prepare-lab-assets.mjs` already applies to the Pyodide file list.
const referenced = [...rewritten.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map((match) => match[1]);
if (referenced.length !== 20) {
  fail(`expected 20 distinct woff2 references in the rewritten stylesheet, found ${referenced.length}.`);
}

let bytes = 0;
for (const relative of referenced) {
  const from = join(katexDir, 'dist', relative);
  const to = join(dest, relative);
  let size;
  try {
    size = (await stat(from)).size;
  } catch {
    fail(`katex ${version} does not ship ${relative}, which its own stylesheet references.`);
  }
  bytes += size;
  await cp(from, to);
}

// Nothing else in dist/ is staged: no .js, no .mjs, no README, no contrib/ — a directory
// copy would put katex's own renderer on the public origin, which this application never
// serves (rendering happens server-side, in lib/content/maths.ts).
const staged = await readdir(join(dest, 'fonts'));
if (staged.length !== referenced.length) {
  fail(`staged ${staged.length} font files but the stylesheet references ${referenced.length}.`);
}

const kb = (bytes / 1024).toFixed(1);
console.log(
  `prepare-katex-assets: public/katex ← katex ${version} ` +
    `(katex.min.css ${rewritten.length} B, swap, woff2-only; ${referenced.length} fonts, ${kb} KB)`,
);
