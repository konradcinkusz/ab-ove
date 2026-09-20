#!/usr/bin/env node
/**
 * check-links.mjs — every relative link in the documentation resolves to a file that exists.
 *
 * WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 *   It checks RELATIVE links only: `[x](adr/0009-...md)`, `[y](../flyio/README.md)`,
 *   `![z](assets/screenshots/landing-english.png)`. Those are the ones that break on a
 *   rename, in silence, and that nobody notices until a reader clicks one.
 *
 *   It does NOT check http(s) links. A network call in a lint job is a lint job that goes red
 *   because somebody else's site was slow, and a check that is red for reasons the author
 *   cannot fix is a check people learn to ignore.
 *
 *   It does NOT check anchors within a file. GitHub's heading-slug rules are not the only
 *   ones in play — this repository's Markdown is also read in editors and rendered into
 *   LaTeX — and a checker that was wrong about a slug would report a failure nobody could act
 *   on. A broken anchor lands the reader on the right page; a broken path lands them on a 404.
 *
 * ZERO DEPENDENCIES: it runs in the same job as check-diagrams.mjs and check-doc-parity.mjs,
 * before anything has been installed.
 *
 * Usage: node scripts/check-links.mjs
 * Exit:  0 = every relative link resolves; 1 = at least one does not.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, relative } from 'node:path';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/**
 * Every Markdown file git knows about, which is the right set rather than a walk of the tree:
 * a walk would descend into node_modules, into web/content/ and into anything else a
 * contributor happens to have lying around, and would then report failures in files this
 * repository does not own.
 */
const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8', cwd: repoRoot })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

if (files.length === 0) {
  console.error('check-links: git knows about no Markdown files. That cannot be right — failing loudly.');
  process.exit(1);
}

/** `[text](target)` and `![alt](target)`, with the target un-titled and un-angled. */
const LINK = /!?\[(?:[^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;

const SKIP = /^(https?:|mailto:|tel:|data:|#|\/\/)/;

const failures = [];
let checked = 0;

for (const file of files) {
  const absolute = join(repoRoot, file);
  const source = readFileSync(absolute, 'utf8');

  // Fenced code blocks are stripped first. A diagram's `%%` comments and a shell recipe both
  // contain things that look like links and are not, and a check that reported them would be
  // a check whose failures are mostly noise.
  const prose = source.replace(/^```[\s\S]*?^```/gm, '');

  for (const match of prose.matchAll(LINK)) {
    const target = match[1];

    if (SKIP.test(target)) {
      continue;
    }

    checked += 1;

    // An in-page anchor on a real path (`DIAGRAMS.md#part-a`) still has a path to check.
    const path = target.split('#')[0];

    if (path === '') {
      continue;
    }

    const resolved = resolve(dirname(absolute), decodeURIComponent(path));

    if (!existsSync(resolved)) {
      failures.push(`${file}: ${target} resolves to ${relative(repoRoot, resolved)}, which does not exist.`);
      continue;
    }

    // A link to a directory is fine — GitHub renders its listing, or its README — but only if
    // the target really is one. A link ending in `/` that points at a file is a typo.
    if (path.endsWith('/') && !statSync(resolved).isDirectory()) {
      failures.push(`${file}: ${target} ends in a slash but ${relative(repoRoot, resolved)} is a file.`);
    }
  }
}

if (failures.length > 0) {
  console.error('check-links: FAILED\n');

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}

console.log(`check-links: ${checked} relative link(s) across ${files.length} Markdown file(s), all resolving.`);
