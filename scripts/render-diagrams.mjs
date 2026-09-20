#!/usr/bin/env node
/**
 * render-diagrams.mjs — render every Mermaid diagram to vector PDF, for the LaTeX editions.
 *
 * GitHub speaks Mermaid; a PDF does not. The wrong answer to that gap is redrawing each
 * picture a second time in TikZ for the paper — two sources of truth for one diagram, and it
 * drifts. So the .mmd is the one source and this script renders it, into a directory that is
 * gitignored like every other build output.
 *
 * RENDERED DIAGRAMS ARE BUILD OUTPUT. Nothing this script writes is committed. The .tex
 * editions include them by relative path from docs/diagrams/rendered/, and
 * .github/workflows/build-overview-pdf.yml runs this BEFORE latexmk for that reason: a
 * workflow that builds a diagram-carrying paper without it fails on the first
 * \includegraphics whose file is not there.
 *
 * THE RENDERER IS RESOLVED LOCALLY, NOT THROUGH npx. On a fresh clone whose node_modules is
 * still empty, `npx mmdc` reaches past it to the registry and resolves a squatter package
 * literally named `mmdc`, then fails with a message that names nothing useful. A missing
 * binary should say "run npm ci", so this invokes node_modules/.bin/mmdc directly and says
 * exactly that when it is not there.
 *
 * --no-sandbox IS NOT OPTIONAL HERE. mermaid-cli drives a headless Chromium, and CI
 * containers and dev containers both commonly run as root, where Chromium's sandbox refuses
 * to start. Where the environment already has a browser, point at it with
 * PUPPETEER_EXECUTABLE_PATH rather than downloading a second one.
 *
 * Usage:
 *   node scripts/render-diagrams.mjs            every diagram, both languages
 *   node scripts/render-diagrams.mjs a1 b2      only the diagrams whose id matches
 *   node scripts/render-diagrams.mjs --en       only the English edition
 *   node scripts/render-diagrams.mjs --pl       only the Polish edition
 */

import { mkdirSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const sourceDir = join(repoRoot, 'docs', 'diagrams');
const outputDir = join(sourceDir, 'rendered');
const mmdc = join(repoRoot, 'node_modules', '.bin', 'mmdc');

if (!existsSync(mmdc)) {
  console.error(
    'render-diagrams: node_modules/.bin/mmdc is not there.\n'
    + '  Run `npm ci` in the repository root first — @mermaid-js/mermaid-cli is a pinned\n'
    + '  devDependency of package.json, so the lockfile decides the version rather than\n'
    + "  whatever the registry's floating latest happens to be today.",
  );
  process.exit(1);
}

const argv = process.argv.slice(2);
const wantEnglish = !argv.includes('--pl') || argv.includes('--en');
const wantPolish = !argv.includes('--en') || argv.includes('--pl');
const ids = argv.filter((argument) => !argument.startsWith('--')).map((id) => id.toLowerCase());

const isPolish = (name) => name.endsWith('.pl.mmd');

const files = readdirSync(sourceDir)
  .filter((name) => name.endsWith('.mmd'))
  .filter((name) => (isPolish(name) ? wantPolish : wantEnglish))
  .filter((name) => ids.length === 0 || ids.some((id) => name.startsWith(`${id}-`)))
  .sort();

if (files.length === 0) {
  console.error(`render-diagrams: nothing matched${ids.length > 0 ? ` ${ids.join(', ')}` : ''}.`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

// The puppeteer flags go in a file rather than on the command line because that is the only
// input mermaid-cli takes for them. It is written to a temporary directory rather than into
// the repository: it is configuration for one invocation, not a fact about this project, and
// a committed copy would be one more file somebody has to wonder about.
const puppeteerConfig = join(tmpdir(), `ab-ovo-mmdc-${process.pid}.json`);

writeFileSync(
  puppeteerConfig,
  JSON.stringify({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }),
);

let rendered = 0;

try {
  for (const name of files) {
    const output = join(outputDir, `${name.slice(0, -'.mmd'.length)}.pdf`);

    execFileSync(
      mmdc,
      ['-i', join(sourceDir, name), '-o', output, '-p', puppeteerConfig, '--pdfFit', '-b', 'transparent'],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );

    rendered += 1;
    console.log(`  ${name} -> docs/diagrams/rendered/${name.slice(0, -'.mmd'.length)}.pdf`);
  }
} finally {
  rmSync(puppeteerConfig, { force: true });
}

console.log(`render-diagrams: ${rendered} diagram(s) rendered to docs/diagrams/rendered/.`);
