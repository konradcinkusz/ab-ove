#!/usr/bin/env node
/**
 * check-diagrams.mjs — every Mermaid diagram exists in three places, and all three agree.
 *
 * WHY THREE:
 *
 *   `docs/DIAGRAMS.md` and `docs/DIAGRAMS.pl.md` must carry the diagram source INLINE,
 *   because inline is the only form GitHub renders. `docs/diagrams/<id>-<slug>.mmd` and its
 *   `.pl.mmd` twin must exist separately, because a diagram nobody can open on its own is a
 *   diagram nobody reuses — in a slide, an issue, a review comment, or an `mmdc` render into
 *   the LaTeX editions.
 *
 *   Three copies of anything is a drift surface. This repository's answer to a drift surface
 *   is never "remember to update all of them"; it is a check that fails. The same reasoning
 *   produced the content digest check in scripts/fetch-book-content.sh and the closed column
 *   lists in src/AbOvo.Api/Persistence.
 *
 * THE PAIRING RULE IS THE SECTION ID. A section headed `### A1. …` owns the file whose name
 * starts `a1-`, in whichever language the containing document is. That keeps the filename
 * free to describe the diagram while the id does the joining, and it means a renamed
 * diagram cannot half-land: the English and Polish halves are found by the same key.
 *
 * WHY THE TWO LANGUAGES ARE SEPARATE FILES RATHER THAN ONE SHARED DIAGRAM. The product is
 * bilingual — the book it carries is set in English and Polish — and a Polish document whose
 * every picture is captioned in English is a translation that stopped at the prose. Code
 * identifiers (route paths, class names, workflow filenames, column names) stay English in
 * both, because those are the real names and a diagram has to be greppable.
 *
 * ZERO DEPENDENCIES ON PURPOSE: this runs in the same job as check-links.mjs, and both have
 * to work before anything has been installed.
 *
 * Usage: node scripts/check-diagrams.mjs
 * Exit:  0 = every diagram is paired and identical; 1 = at least one is not.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const dirPath = join(repoRoot, 'docs', 'diagrams');

/** The two halves of this document, and the filename suffix each one's diagrams carry. */
const EDITIONS = [
  { doc: 'docs/DIAGRAMS.md', suffix: '.mmd', otherSuffix: '.pl.mmd', language: 'English' },
  { doc: 'docs/DIAGRAMS.pl.md', suffix: '.pl.mmd', otherSuffix: '.mmd', language: 'Polish' },
];

if (!existsSync(dirPath)) {
  console.error('check-diagrams: docs/diagrams/ is missing. It is the reusable half of every pair.');
  process.exit(1);
}

const failures = [];
const everyFile = readdirSync(dirPath).filter((name) => name.endsWith('.mmd'));

/** Files belonging to one edition. `.mmd` alone must not swallow the `.pl.mmd` twins. */
const filesFor = (suffix) =>
  everyFile.filter((name) =>
    suffix === '.mmd' ? name.endsWith('.mmd') && !name.endsWith('.pl.mmd') : name.endsWith(suffix),
  );

/**
 * Sections and the Mermaid block each one owns. A section heading looks like
 * `### A1. System context — who talks to what`; the id is `A1`. The id pattern is
 * deliberately loose about the letter so a fifth part can be added without editing this
 * script, and strict about the shape so a prose heading is never mistaken for a diagram.
 */
function sectionsOf(markdown) {
  const sections = [];
  let current = null;
  let fence = null;

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^###\s+([A-Z]\d+)\.\s+(.+)$/);

    if (heading) {
      current = { id: heading[1].toLowerCase(), title: heading[2].trim(), source: null };
      sections.push(current);
      continue;
    }

    if (fence === null && line.trim() === '```mermaid') {
      fence = [];
      continue;
    }

    if (fence !== null && line.trim() === '```') {
      if (current && current.source === null) {
        current.source = `${fence.join('\n')}\n`;
      }
      fence = null;
      continue;
    }

    if (fence !== null) {
      fence.push(line);
    }
  }

  return sections;
}

const claimed = new Set();
const counts = [];

for (const edition of EDITIONS) {
  const docPath = join(repoRoot, edition.doc);

  if (!existsSync(docPath)) {
    console.error(`check-diagrams: ${edition.doc} is missing. It is the rendered ${edition.language} half.`);
    process.exit(1);
  }

  const sections = sectionsOf(readFileSync(docPath, 'utf8'));
  const files = filesFor(edition.suffix);

  if (sections.length === 0) {
    console.error(`check-diagrams: ${edition.doc} declares no diagram sections. That cannot be right — failing loudly.`);
    process.exit(1);
  }

  for (const section of sections) {
    if (section.source === null) {
      failures.push(`${edition.doc}: section ${section.id.toUpperCase()} ("${section.title}") has no \`\`\`mermaid block.`);
      continue;
    }

    const matches = files.filter((name) => name.startsWith(`${section.id}-`));

    if (matches.length === 0) {
      failures.push(
        `${edition.doc}: section ${section.id.toUpperCase()} ("${section.title}") has no file in docs/diagrams/. `
        + `Expected one named ${section.id}-<slug>${edition.suffix}.`,
      );
      continue;
    }

    if (matches.length > 1) {
      failures.push(`${edition.doc}: section ${section.id.toUpperCase()} matches more than one file: ${matches.join(', ')}.`);
      continue;
    }

    const [name] = matches;
    claimed.add(name);

    if (readFileSync(join(dirPath, name), 'utf8') !== section.source) {
      failures.push(
        `docs/diagrams/${name} and section ${section.id.toUpperCase()} of ${edition.doc} have drifted. `
        + 'Whichever you edited, copy it to the other — they are the same diagram.',
      );
    }
  }

  counts.push(`${sections.length} ${edition.language}`);
}

// Every diagram is bilingual, and a half-landed rename is the failure this catches: an
// English file whose Polish twin still carries the old id reads as "no file for section A3"
// in one edition and "unreferenced file" in the other, which is two confusing errors for one
// mistake. Saying it once, by name, is the point.
for (const name of filesFor('.mmd')) {
  const twin = `${name.slice(0, -'.mmd'.length)}.pl.mmd`;

  if (!everyFile.includes(twin)) {
    failures.push(`docs/diagrams/${name} has no Polish twin. Expected docs/diagrams/${twin}.`);
  }
}

for (const name of filesFor('.pl.mmd')) {
  const original = `${name.slice(0, -'.pl.mmd'.length)}.mmd`;

  if (!everyFile.includes(original)) {
    failures.push(`docs/diagrams/${name} has no English original. Expected docs/diagrams/${original}.`);
  }
}

for (const name of everyFile) {
  if (!claimed.has(name)) {
    failures.push(`docs/diagrams/${name} is referenced by no section of docs/DIAGRAMS.md or docs/DIAGRAMS.pl.md.`);
  }
}

/** Every ```mermaid block in a document, in order, each ending in a newline. */
function mermaidBlocks(source) {
  const blocks = [];
  let fence = null;

  for (const line of source.split('\n')) {
    if (fence === null && line.trim() === '```mermaid') {
      fence = [];
      continue;
    }

    if (fence !== null && line.trim() === '```') {
      blocks.push(`${fence.join('\n')}\n`);
      fence = null;
      continue;
    }

    if (fence !== null) {
      fence.push(line);
    }
  }

  return blocks;
}

// Any other document may embed a diagram, and the rule there is weaker but still mechanical:
// it cannot join on an id, so it joins on content. Copying a diagram into the README and then
// editing one of the two copies is the drift this catches.
const byContent = new Map(everyFile.map((name) => [readFileSync(join(dirPath, name), 'utf8'), name]));
const EMBEDDERS = ['README.md', 'docs/START-HERE.md', 'docs/START-HERE.pl.md'];
const embeddedNames = [];

for (const relative of EMBEDDERS) {
  const path = join(repoRoot, relative);

  if (!existsSync(path)) {
    continue;
  }

  for (const [index, source] of mermaidBlocks(readFileSync(path, 'utf8')).entries()) {
    const match = byContent.get(source);

    if (match === undefined) {
      failures.push(
        `${relative}'s Mermaid block #${index + 1} is identical to no file in docs/diagrams/. `
        + 'A document outside docs/DIAGRAMS.md embeds a COPY of a diagram, never one of its own: '
        + 'copy the .mmd it came from verbatim, or add the diagram to docs/DIAGRAMS.md, '
        + 'docs/DIAGRAMS.pl.md and docs/diagrams/ first.',
      );
      continue;
    }

    embeddedNames.push(`${relative} -> ${match}`);
  }
}

if (failures.length > 0) {
  console.error('check-diagrams: FAILED\n');

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}

const embeddedNote = embeddedNames.length > 0 ? ` Embedded unchanged: ${embeddedNames.join(', ')}.` : '';

console.log(`check-diagrams: ${counts.join(' and ')} diagram section(s), each paired with docs/diagrams/ and identical.${embeddedNote}`);
