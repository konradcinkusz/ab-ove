import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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

/*
 * ────────────────────────────────────────────────────────────────────────────────────────
 * AND NO CONTROL'S EDGE IS DRAWN IN `--rule` — issue #146, WCAG 1.4.11.
 *
 * The floor above holds `--control-edge` at 3:1, and a floor proves nothing about a control
 * that never uses the token. The audit of 2026-09-24 found controls that did not: the sign-in
 * and account fields, the consent's Decline and the sketch canvas, each drawn in `--rule` at
 * about 1.3:1 while the reading screens beside them had moved on. axe has no rule for 1.4.11,
 * so ADR-0064's scan was green over all of them, and nothing else would have turned red.
 *
 * So this reads every stylesheet in the app and refuses a border in `--rule` on a CONTROL,
 * which it recognises by what the stylesheet itself says about the element rather than by a
 * list of class names that would go stale with the first new form:
 *
 *   - a class the same stylesheet gives a `:focus-visible` rule — it takes keyboard focus;
 *   - a class the same stylesheet gives `cursor: pointer` — it is pressed;
 *   - a form element, a button, a link or a `<summary>` named by its element.
 *
 * `--rule` stays right for everything else: a panel, a card, a divider, a `<kbd>`. Those are
 * lines that separate, and a separator at 3:1 would be a page drawn in boxes. And a
 * `@media print` rule is not a control's edge at all — on paper nothing is pressed.
 *
 * Per stylesheet, because that is how CSS Modules scope a class: `.title` in one module and
 * `.title` in another are two different elements, and one being a control says nothing about
 * the other.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

interface CssRule {
  readonly selectors: readonly string[];
  readonly declarations: Readonly<Record<string, string>>;
  /** The preludes of the at-rules around it, outermost first: `@media print`, and so on. */
  readonly within: readonly string[];
}

/** Split on `separator` wherever it is not inside brackets, parentheses or quotes. */
function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]!;
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (depth === 0 && separator.test(char)) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Every style rule in a stylesheet, with the at-rules it sits inside.
 *
 * By matching braces rather than by regex, for `block()`'s reason: a media query holds rules,
 * and the first `}` a regex meets closes the inner one. `@keyframes` is skipped whole — its
 * `from` and `50%` are not selectors.
 */
function rulesOf(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];

  const walk = (from: number, to: number, within: readonly string[]): void => {
    let at = from;
    while (at < to) {
      const open = text.indexOf('{', at);
      if (open === -1 || open >= to) return;
      let depth = 0;
      let close = open;
      for (; close < to; close += 1) {
        if (text[close] === '{') depth += 1;
        if (text[close] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      // A statement at-rule before the block (`@import …;`) is not part of its prelude.
      const prelude = (text.slice(at, open).split(';').at(-1) ?? '').trim();
      if (prelude.startsWith('@')) {
        if (!/^@(-webkit-)?keyframes/.test(prelude)) walk(open + 1, close, [...within, prelude]);
      } else {
        const declarations: Record<string, string> = {};
        for (const line of text.slice(open + 1, close).split(';')) {
          const [property, ...rest] = line.split(':');
          const name = property?.trim();
          if (!name || rest.length === 0) continue;
          declarations[name] = rest.join(':').trim().replace(/\s+/g, ' ');
        }
        rules.push({ selectors: splitTopLevel(prelude, /,/), declarations, within });
      }
      at = close + 1;
    }
  };

  walk(0, text.length, []);
  return rules;
}

/** The compounds of a selector, left to right: `.pane[open] > .summary` is two. */
const compoundsOf = (selector: string): string[] => splitTopLevel(selector, /[\s>+~]/);

/** A compound's class — the first one outside a `:global()`, `:has()` or `:not()`. */
function classOf(compound: string): string | undefined {
  let depth = 0;
  for (let at = 0; at < compound.length; at += 1) {
    const char = compound[at]!;
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (depth === 0 && char === '.') return /^\.[\w-]+/.exec(compound.slice(at))?.[0];
  }
  return undefined;
}

/** The element a compound names by tag, if it names one: `a.title` is `a`, `.x` is none. */
const elementOf = (compound: string): string | undefined => /^[a-z][\w-]*/i.exec(compound)?.[0];

const CONTROL_ELEMENTS = new Set(['a', 'button', 'input', 'select', 'summary', 'textarea']);

/** `border`, a side of it, or its colour — the declarations that draw an edge. */
const EDGE = /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/;

/** Every border in `--rule` on a control, as `selector { property: value }`. */
function ruleEdgesOnControls(css: string): string[] {
  const rules = rulesOf(css);

  const controls = new Set<string>();
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      const compounds = compoundsOf(selector);
      for (const compound of compounds) {
        const name = classOf(compound);
        if (name && compound.includes(':focus-visible')) controls.add(name);
      }
      const subject = classOf(compounds.at(-1) ?? '');
      if (subject && rule.declarations['cursor'] === 'pointer') controls.add(subject);
    }
  }

  const found: string[] = [];
  for (const rule of rules) {
    if (rule.within.some((prelude) => /\bprint\b/.test(prelude))) continue;
    for (const selector of rule.selectors) {
      const subject = compoundsOf(selector).at(-1) ?? '';
      const name = classOf(subject);
      const element = elementOf(subject);
      const isControl =
        (name !== undefined && controls.has(name)) ||
        (name === undefined && element !== undefined && CONTROL_ELEMENTS.has(element));
      if (!isControl) continue;
      for (const [property, value] of Object.entries(rule.declarations)) {
        if (EDGE.test(property) && value.includes('var(--rule)')) {
          found.push(`${selector} { ${property}: ${value} }`);
        }
      }
    }
  }
  return found;
}

/** Every stylesheet under `src/` — the modules beside their components, and globals.css. */
function stylesheetsUnder(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) found.push(...stylesheetsUnder(path));
    else if (entry.endsWith('.css')) found.push(path);
  }
  return found;
}

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/*
 * The instrument first, against a stylesheet whose answer is known — the estate's standing
 * rule (`imports-carry-extensions.test.ts`). A reader that silently parsed nothing would
 * report every file clean, which is the same answer a correct one gives on a correct tree.
 */
test('the edge scan tells a control drawn in --rule from a separator drawn in it', () => {
  const edge = 'var(--rule)';
  const sheet = `
    .field { border: 1px solid ${edge}; }
    .field:focus-visible { outline: 2px solid var(--accent); }
    .go { border-color: ${edge}; cursor: pointer; }
    .pane[open] > .go { border-bottom: 1px solid ${edge}; }
    .card:focus-within, .panel { border: 1px solid ${edge}; }
    .into:focus-visible .title { text-decoration: underline; }
    .title { border-top: 1px solid ${edge}; }
    .list kbd { border: 1px solid ${edge}; }
    .row input { border: 1px solid ${edge}; }
    .ok { border: 1px solid var(--control-edge); cursor: pointer; }
    @media print { .field { border-bottom: 1px solid ${edge}; } }
    @media (max-width: 30rem) { .field { border-width: 2px; border-color: ${edge}; } }
  `;

  assert.deepEqual(ruleEdgesOnControls(sheet), [
    `.field { border: 1px solid ${edge} }`,
    `.go { border-color: ${edge} }`,
    `.pane[open] > .go { border-bottom: 1px solid ${edge} }`,
    `.row input { border: 1px solid ${edge} }`,
    `.field { border-color: ${edge} }`,
  ]);
});

test('no control in the app draws its edge in --rule', () => {
  const sheets = stylesheetsUnder(SOURCE);
  assert.ok(sheets.length > 1, 'no stylesheet was found at all, so this gate is asserting nothing');

  const offenders = sheets.flatMap((file) =>
    ruleEdgesOnControls(readFileSync(file, 'utf8')).map((found) => `${relative(SOURCE, file)}: ${found}`),
  );

  assert.deepEqual(
    offenders,
    [],
    'a control drawn in --rule is about 1.3:1 against the page, under WCAG 1.4.11’s 3:1 — ' +
      'use --control-edge, which the floors above hold in both schemes',
  );
});

/*
 * ────────────────────────────────────────────────────────────────────────────────────────
 * AND FOCUS IS NEVER TAKEN AWAY, OR SHOWN AS A BRIGHTNESS — issue #148, WCAG 2.4.7.
 *
 * UI-UX.md: "focus is a ring, never a brightness". The audit found the rule broken in two
 * ways, neither of which axe can see:
 *
 *   - `outline: none` on a focused control. The answer line and the pad said focus with a
 *     border turning blue, and nothing else; the filled buttons that drew a box-shadow ring had
 *     removed the outline too. Windows' forced colours paint no box-shadow and repaint every
 *     border in one system colour, so for a reader in high contrast each of these showed no
 *     focus at all. `controls.module.css` has the answer: hide the browser's ring with a
 *     TRANSPARENT outline, which forced colours paint in the system's colour, never with `none`.
 *   - a `filter` on focus. The consent's two buttons brightened by eight percent, which is a
 *     change nobody tabbing to them could see.
 *
 * Both are one declaration in a `:focus` or `:focus-visible` rule, so both are refused
 * wherever they are written. A control that needs the browser's ring gone draws the shared
 * ring instead.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

/** Every focus rule that removes the outline or shows focus as a filter. */
function focusShownWrongly(css: string): string[] {
  const found: string[] = [];
  for (const rule of rulesOf(css)) {
    const focused = rule.selectors.filter((selector) => /:focus(-visible)?(?![\w-])/.test(selector));
    if (focused.length === 0) continue;
    for (const [property, value] of Object.entries(rule.declarations)) {
      const removes =
        (property === 'outline' && /^(none|0(px)?)(\s|$)/.test(value)) ||
        (property === 'outline-style' && value === 'none') ||
        (property === 'outline-width' && /^0(px)?$/.test(value));
      if (removes || property === 'filter') {
        found.push(`${focused.join(', ')} { ${property}: ${value} }`);
      }
    }
  }
  return found;
}

test('the focus scan tells a removed outline from a transparent one', () => {
  const sheet = `
    .line:focus-visible { border-bottom-color: var(--accent); outline: none; }
    .pad:focus { outline: 0; }
    .go:hover, .go:focus-visible { filter: brightness(1.08); }
    .ring:focus-visible { box-shadow: 0 0 0 4px var(--accent); outline: 2px solid transparent; }
    .row:focus-within { outline: none; }
    .quiet:focus-visible { color: var(--ink); }
    @media (forced-colors: active) { .x:focus-visible { outline-style: none; } }
  `;

  assert.deepEqual(focusShownWrongly(sheet), [
    '.line:focus-visible { outline: none }',
    '.pad:focus { outline: 0 }',
    '.go:focus-visible { filter: brightness(1.08) }',
    '.x:focus-visible { outline-style: none }',
  ]);
});

test('no control in the app takes its focus outline away or shows focus as a brightness', () => {
  const offenders = stylesheetsUnder(SOURCE).flatMap((file) =>
    focusShownWrongly(readFileSync(file, 'utf8')).map((found) => `${relative(SOURCE, file)}: ${found}`),
  );

  assert.deepEqual(
    offenders,
    [],
    'draw the shared ring instead (components/read/controls.module.css): a box-shadow, and ' +
      '`outline: 2px solid transparent` for forced colours, which paint no box-shadow',
  );
});
