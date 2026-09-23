import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * THE DARK PALETTE IS IN `globals.css` TWICE, SO SOMETHING OTHER THAN ATTENTION HAS TO HOLD
 * THE TWO COPIES TOGETHER.
 *
 * ADR-0048 gave the theme three positions: no `data-theme` (the reader's system decides),
 * `data-theme="light"`, and `data-theme="dark"`. Two of those need the dark tokens, under
 * two selectors that CSS cannot merge — one is inside `@media (prefers-color-scheme: dark)`
 * and the other is not. The file's own header records why the alternatives (`light-dark()`,
 * or resolving the system's answer in JavaScript) were refused.
 *
 * What that leaves is the classic failure: somebody adjusts a colour for dark mode, finds it
 * in the media query, changes it there, and every reader who *asked* for dark keeps the old
 * one. Nothing errors, the build is green, and it is visible only to a person who switches
 * their operating system halfway through looking at the page.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY A TEST RATHER THAN A LINTER. `imports-carry-extensions.test.ts` is this app's own
 * precedent and the argument is the same one: a stylelint plugin to enforce one project
 * rule is a dependency to keep current for ever, where this is forty lines in the suite that
 * already runs on every pull request, and its failure message can name the token.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * P13 — test at the layer with the logic. The logic here is in a stylesheet, so the test
 * reads the stylesheet. Asserting it through a browser would mean a screenshot diff, which
 * fails for a hundred reasons that are not this one.
 */

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'globals.css');

/** The file with its comments removed, so a token named in prose is not read as a rule. */
const stylesheet = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declarations of the block a selector opens, by matching braces rather than by regex.
 *
 * A regex over `{([^}]*)}` gets the media query wrong — the first `}` it meets closes the
 * inner rule — which would make this gate pass while comparing a block to itself.
 */
function block(selector: string): Readonly<Record<string, string>> {
  const at = stylesheet.indexOf(selector);
  assert.notEqual(at, -1, `globals.css no longer has a "${selector}" rule at all`);

  // From `at` and not past the selector's own length: the light block is found by a
  // selector that already ends in its brace, and skipping it would open the NEXT rule.
  const open = stylesheet.indexOf('{', at);
  let depth = 0;
  let close = open;
  for (; close < stylesheet.length; close += 1) {
    if (stylesheet[close] === '{') depth += 1;
    if (stylesheet[close] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  const declarations: Record<string, string> = {};
  for (const line of stylesheet.slice(open + 1, close).split(';')) {
    const [property, ...rest] = line.split(':');
    const name = property?.trim();
    if (!name || rest.length === 0) continue;
    declarations[name] = rest.join(':').trim().replace(/\s+/g, ' ');
  }
  return declarations;
}

const LIGHT = ':root {';
/** Position one: the system's answer, which is what a page with no JavaScript gets. */
const SYSTEM_DARK = ":root:not([data-theme='light'])";
/** Position three: the reader asked for it. */
const CHOSEN_DARK = ":root[data-theme='dark']";

test('the two dark blocks declare the same tokens with the same values', () => {
  const system = block(SYSTEM_DARK);
  const chosen = block(CHOSEN_DARK);

  // Named one at a time rather than with a deepEqual over both objects, so the failure says
  // which token drifted instead of printing two palettes and leaving the diff to the reader.
  for (const token of new Set([...Object.keys(system), ...Object.keys(chosen)])) {
    assert.equal(
      chosen[token],
      system[token],
      `${token} differs between the two dark blocks: a reader whose system is dark and a reader who chose dark are looking at different pages`,
    );
  }
});

test('every colour a light reader gets has a dark value', () => {
  // The palette is the set of tokens whose value is a hex colour; `--measure` and the three
  // font stacks are deliberately not in it, because they do not change with the theme.
  const light = block(LIGHT);
  const dark = block(CHOSEN_DARK);

  const palette = Object.keys(light).filter(
    (token) => token.startsWith('--') && light[token]!.startsWith('#'),
  );

  assert.ok(palette.length > 0, 'no colour tokens were found at all, so this gate is asserting nothing');

  for (const token of palette) {
    assert.ok(
      dark[token],
      `${token} has a light value and no dark one, so it keeps its light colour on a dark page`,
    );
  }
});

test('each position states the colour scheme it means', () => {
  // Not decoration: the browser paints form fields, scrollbars and the caret from this
  // property rather than from the tokens, so a position that left it unsaid would give a
  // light page dark furniture on a dark machine.
  assert.equal(block(LIGHT)['color-scheme'], 'light');
  assert.equal(block(SYSTEM_DARK)['color-scheme'], 'dark');
  assert.equal(block(CHOSEN_DARK)['color-scheme'], 'dark');
});

test('the system block still stands aside for a reader who asked for light', () => {
  /*
    The `:not()` IS the second position. Without it the media query would win on a dark
    machine and `data-theme="light"` would be a control that does nothing — which is the one
    failure this whole feature exists to fix, and it would look like a storage bug.
  */
  assert.ok(
    stylesheet.includes(`@media (prefers-color-scheme: dark)`),
    'the system position is gone: dark mode no longer follows the reader’s own setting',
  );
  assert.ok(
    stylesheet.includes(SYSTEM_DARK),
    'the dark media query no longer excludes a reader who chose light',
  );
});

/*
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE CONTRAST FLOORS, COMPUTED RATHER THAN CLAIMED — ADR-0063.
 *
 * `--ink-faint` was 4.48:1 on the paper and 4.07:1 on the answer box, under WCAG 1.4.3's
 * 4.5:1 for the small text it is used for, and the outlined buttons wore `--rule`, about
 * 1.3:1 — a border nobody could see, which is part of why the reading screens' buttons did
 * not read as buttons. A sentence in UI-UX.md cannot stop the next palette tweak from undoing
 * that; this can. Both schemes, every surface the token actually sits on.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  assert.ok(match, `${hex} is not a #rrggbb colour, so its contrast cannot be computed here`);
  const [r, g, b] = match.slice(1).map((pair) => {
    const channel = Number.parseInt(pair, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

for (const [scheme, selector] of [
  ['light', LIGHT],
  ['dark', CHOSEN_DARK],
] as const) {
  test(`the faintest ink a reader reads clears 4.5:1 on every surface it sits on (${scheme})`, () => {
    const tokens = { ...block(LIGHT), ...block(selector) };
    for (const surface of ['--paper', '--paper-raised', '--accent-soft']) {
      const ratio = contrast(tokens['--ink-faint']!, tokens[surface]!);
      assert.ok(ratio >= 4.5, `--ink-faint on ${surface} is ${ratio.toFixed(2)}:1 in ${scheme}, under 4.5:1`);
    }
  });

  test(`a control's edge clears 3:1 against the page (${scheme})`, () => {
    const tokens = { ...block(LIGHT), ...block(selector) };
    for (const surface of ['--paper', '--paper-raised']) {
      const ratio = contrast(tokens['--control-edge']!, tokens[surface]!);
      assert.ok(ratio >= 3, `--control-edge on ${surface} is ${ratio.toFixed(2)}:1 in ${scheme}, under 3:1`);
    }
  });

  test(`the label on a filled button clears 4.5:1 (${scheme})`, () => {
    const tokens = { ...block(LIGHT), ...block(selector) };
    const ratio = contrast(tokens['--paper-raised']!, tokens['--accent']!);
    assert.ok(ratio >= 4.5, `the filled button's label is ${ratio.toFixed(2)}:1 in ${scheme}, under 4.5:1`);
  });
}
