import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * ONE PAGE HEADER OUTSIDE THE READING SCREENS, HELD BY THE SOURCE RATHER THAN BY A SENTENCE —
 * issue #169.
 *
 * `masthead.tsx` says why there is one. What this holds is that it stays one: a page that writes
 * a header of its own — a `<header>`, a wordmark, an `ab-ovo / …` crumb — is the second copy the
 * issue took away, and the first new page to do it would bring the drift back without a red
 * line anywhere. Three rules, each a thing the source says about itself:
 *
 *   - a page's `<main>` comes with a `<Masthead>`: every file outside the reading screens that
 *     renders the one renders the other, once per `<main>` (`/login` has two, one per state);
 *   - nothing but the masthead renders a `<header>` outside the reading screens, whose bar
 *     is `reading-top.tsx`'s;
 *   - the wordmark is written in the masthead and the reading bar and nowhere else.
 *
 * WHY THE SOURCE AND NOT THE PAGES. `specs/masthead.spec.ts` visits the pages and holds what a
 * reader sees; it cannot visit a page nobody listed. This reads every file, so a page added
 * tomorrow is held by the rule the day it is written — P13, the test at the layer with the
 * logic, and `lib/theme/tokens.test.ts`'s reason for reading every stylesheet.
 */

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The reading screens — their routes and their components — which have a bar of their own
 * (`reading-top.tsx`, ADR-0063) and are not this rule's.
 */
const READING = [join('app', 'read') + sep, join('components', 'read') + sep];
/** The one place a header may be written. */
const MASTHEAD = join('components', 'masthead') + sep;

function componentFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) found.push(...componentFiles(path));
    else if (entry.endsWith('.tsx')) found.push(path);
  }
  return found;
}

/** The markup of a file with its comments taken out, so a comment that names a tag is not one. */
const markupOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

const MAIN = /<main[\s>]/g;
const MASTHEAD_ELEMENT = /<Masthead[\s>/]/g;
const HEADER = /<header[\s>]/g;
/**
 * The wordmark as it has been spelled: with its hyphen in a span, or as a bare link's text. Not
 * a `<title>` — `global-error.tsx` names the tab of a page whose layout failed, and a tab's name
 * is not a header.
 */
const WORDMARK = /ab<span[^>]*>-<\/span>ovo|(?<!<title)>\s*ab-ovo\s*</g;

/** What a file's markup says against the three rules, one line per breach. */
function breaches(path: string, text: string): string[] {
  const markup = markupOf(text);
  const found: string[] = [];
  const mains = count(markup, MAIN);
  const mastheads = count(markup, MASTHEAD_ELEMENT);
  if (mastheads < mains) {
    found.push(`${path} renders ${mains === 1 ? 'a <main>' : 'a <main> more than once'} without a <Masthead> for each`);
  }
  if (!path.startsWith(MASTHEAD) && count(markup, HEADER) > 0) {
    found.push(`${path} renders a <header> of its own`);
  }
  if (!path.startsWith(MASTHEAD) && count(markup, WORDMARK) > 0) {
    found.push(`${path} writes the wordmark itself`);
  }
  return found;
}

/*
 * The instrument first, against markup whose answers are known — the estate's standing rule
 * (`imports-carry-extensions.test.ts`). A scan that silently matched nothing would report every
 * file clean, which is the same answer a correct one gives on a correct tree. The fixtures are
 * built from parts, for that file's reason: markup spelled out whole here would be markup this
 * scan reads.
 */
test('the scan tells a page with the masthead from one with a header of its own', () => {
  const tag = (name: string, rest = ''): string => `<${name}${rest}>`;
  const mark = `ab${tag('span', ' className="h"')}-</span>ovo`;
  const page = (body: string): string => `export default function P() { return (${body}); }`;

  // The shape every page has now: one masthead, one main.
  assert.deepEqual(
    breaches('app/x/page.tsx', page(`${tag('main')}${tag('Masthead', ' language="en" /')}</main>`)),
    [],
  );
  // `/login`: two states, two mains, and a masthead in each.
  assert.deepEqual(
    breaches(
      'app/login/page.tsx',
      page(`${tag('main')}${tag('Masthead /')}</main>`) + page(`${tag('main')}${tag('Masthead /')}</main>`),
    ),
    [],
  );
  // The shapes that came before it.
  assert.deepEqual(
    breaches('app/about/page.tsx', page(`${tag('main', ' className="shell"')}${tag('header')}${mark}</header></main>`)),
    [
      'app/about/page.tsx renders a <main> without a <Masthead> for each',
      'app/about/page.tsx renders a <header> of its own',
      'app/about/page.tsx writes the wordmark itself',
    ],
  );
  assert.deepEqual(
    breaches('app/lab/page.tsx', page(`${tag('main')}<p><Link href="/">ab-ovo</Link> / lab</p></main>`)),
    ['app/lab/page.tsx renders a <main> without a <Masthead> for each', 'app/lab/page.tsx writes the wordmark itself'],
  );
  // A second state that forgot its masthead.
  assert.deepEqual(
    breaches('app/y/page.tsx', page(`${tag('main')}${tag('Masthead /')}</main>`) + page(`${tag('main')}</main>`)),
    ['app/y/page.tsx renders a <main> more than once without a <Masthead> for each'],
  );
  // The masthead itself may write both, a comment naming a tag is not one, and a tab's title is
  // not a wordmark.
  assert.deepEqual(breaches(join('components', 'masthead', 'masthead.tsx'), `${tag('header')}${mark}</header>`), []);
  assert.deepEqual(breaches('app/z/page.tsx', `/* ${tag('header')} */ // ${tag('main')}`), []);
  assert.deepEqual(breaches('app/global-error.tsx', `${tag('title')}ab-ovo</title>`), []);
});

test('every page outside the reading screens has the masthead, and no header of its own', () => {
  const files = componentFiles(SOURCE)
    .map((file) => relative(SOURCE, file))
    .filter((file) => !READING.some((reading) => file.startsWith(reading)));
  assert.ok(
    files.some((file) => count(readFileSync(join(SOURCE, file), 'utf8'), MAIN) > 0),
    'no page renders a <main> at all, so this gate is asserting nothing',
  );

  const offenders = files.flatMap((file) => breaches(file, readFileSync(join(SOURCE, file), 'utf8')));
  assert.deepEqual(
    offenders,
    [],
    'a page outside the reading screens renders components/masthead/masthead.tsx and writes no ' +
      'header, wordmark or crumb of its own — one page header, in one place (#169)',
  );
});
