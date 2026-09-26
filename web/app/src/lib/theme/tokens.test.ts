import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { PAPER } from './paper.ts';

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
 * THE TWO PLACES A TOKEN HAS TO BE WRITTEN OUT AS A LITERAL — issue #150.
 *
 * The browser's own furniture (`theme-color`, from `paper.ts`) and the tab's icon
 * (`app/icon.svg`) are painted by the browser outside this stylesheet, so neither can say
 * `var(--paper)` or `var(--ink)`. Each is therefore a copy, and a copy drifts silently: warm
 * the paper by two points and the address bar is a different colour from the page under it,
 * with nothing red anywhere. These hold the copies to the tokens, in both schemes.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const BRAND = join(APP, '..', '..', '..', '..', 'docs', 'assets', 'brand', 'ab-ovo-logo.svg');
const icon = readFileSync(join(APP, 'icon.svg'), 'utf8');

/** Every `#rrggbb` in a piece of text, lower-cased, as a set. */
const coloursIn = (text: string): Set<string> =>
  new Set([...text.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0].toLowerCase()));

test('theme-color is the paper, in both schemes', () => {
  assert.equal(PAPER.light, block(LIGHT)['--paper'], 'theme-color for a light machine is not --paper');
  assert.equal(PAPER.dark, block(CHOSEN_DARK)['--paper'], 'theme-color for a dark machine is not --paper');
});

test('the tab’s icon is drawn in the ink and the accent, in both schemes', () => {
  // The icon's light rules come before its media query and its dark rules inside it — the
  // file's own shape (`app/icon.svg`), and asserted here rather than assumed.
  const style = /<style>([\s\S]*?)<\/style>/.exec(icon)?.[1];
  assert.ok(style, 'app/icon.svg has no style element, so it can no longer follow the scheme');
  const split = style.indexOf('@media (prefers-color-scheme: dark)');
  assert.notEqual(split, -1, 'app/icon.svg no longer switches for a dark machine');

  for (const [scheme, text, selector] of [
    ['light', style.slice(0, split), LIGHT],
    ['dark', style.slice(split), CHOSEN_DARK],
  ] as const) {
    const tokens = { ...block(LIGHT), ...block(selector) };
    assert.deepEqual(
      coloursIn(text),
      new Set([tokens['--ink'], tokens['--accent']]),
      `the icon's ${scheme} colours are not --ink and --accent`,
    );
  }
});

test('the tab’s icon is the brand’s mark, not a redrawing of it', () => {
  // Every path the icon draws is a path of the README's lockup, character for character. A
  // mark redrawn for the tab is a second logo, and nothing would say so.
  const paths = (svg: string): string[] => [...svg.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]!);
  const mark = paths(icon);
  assert.ok(mark.length > 0, 'app/icon.svg draws no path at all, so this is asserting nothing');
  const lockup = new Set(paths(readFileSync(BRAND, 'utf8')));
  for (const path of mark) {
    assert.ok(lockup.has(path), `app/icon.svg draws a path the brand mark does not have: ${path}`);
  }
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

/** `color-mix(in srgb, a share, b)`: each encoded channel weighted, as a `#rrggbb` colour. */
function mix(a: string, b: string, share: number): string {
  const channels = (hex: string): number[] => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const [left, right] = [channels(a), channels(b)];
  return `#${left
    .map((value, index) => Math.round(value * share + right[index]! * (1 - share)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The shared set of buttons (#169), whose hover fills the floors below are computed from. */
const CONTROLS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'components', 'read', 'controls.module.css');

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

  // The deletion screen's button, filled in `--degraded` since #169 (`controls.module.css`'s
  // `.danger`), carries the same label and is held to the same floor.
  test(`the label on a destructive button clears 4.5:1 (${scheme})`, () => {
    const tokens = { ...block(LIGHT), ...block(selector) };
    const ratio = contrast(tokens['--paper-raised']!, tokens['--degraded']!);
    assert.ok(ratio >= 4.5, `the destructive button's label is ${ratio.toFixed(2)}:1 in ${scheme}, under 4.5:1`);
  });

  /*
   * AND UNDER THE POINTER AND THE PRESS (#169). A filled button's hover is its fill mixed with
   * `--ink` rather than a brightness, and the mix is read out of `controls.module.css` and
   * computed here — sRGB, channel by channel, which is what `color-mix(in srgb, …)` does — so a
   * percentage moved there is a ratio measured here. The label on every one of them is
   * `--paper-raised`, the filled buttons' own.
   */
  test(`the label on a filled button clears 4.5:1 under the pointer and the press (${scheme})`, () => {
    const tokens = { ...block(LIGHT), ...block(selector) };
    const mixes = [
      ...readFileSync(CONTROLS, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(
        /background:\s*color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+(\d+(?:\.\d+)?)%,\s*var\((--[\w-]+)\)\)/g,
      ),
    ];
    assert.ok(mixes.length > 0, 'controls.module.css mixes no fill, so this is asserting nothing');
    for (const [declaration, from, share, toward] of mixes) {
      const fill = mix(tokens[from!]!, tokens[toward!]!, Number(share) / 100);
      const ratio = contrast(tokens['--paper-raised']!, fill);
      assert.ok(ratio >= 4.5, `${declaration} puts the label at ${ratio.toFixed(2)}:1 in ${scheme}, under 4.5:1`);
    }
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
 *   - a class that COMPOSES a control: one of the shared set's buttons or its field, from
 *     `components/read/controls.module.css`, or a control of its own stylesheet (#169). Since
 *     #169 that is all most buttons and fields say about themselves — the pointer and the ring
 *     are the set's — so a scan that stopped at the stylesheet's own rules would see none of them;
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
  /**
   * Every `composes:` in the rule, in order. CSS Modules take one per stylesheet a class is
   * composed from, and `declarations` keeps only a property's last value — so a second
   * `composes:` there would hide the first, and with it a button's being one (#169).
   */
  readonly composes: readonly string[];
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
        const composes: string[] = [];
        for (const line of text.slice(open + 1, close).split(';')) {
          const [property, ...rest] = line.split(':');
          const name = property?.trim();
          if (!name || rest.length === 0) continue;
          const value = rest.join(':').trim().replace(/\s+/g, ' ');
          declarations[name] = value;
          if (name === 'composes') composes.push(value);
        }
        rules.push({ selectors: splitTopLevel(prelude, /,/), declarations, composes, within });
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

/** A `:focus-visible` rule — the mark of something that takes keyboard focus. */
const FOCUS_VISIBLE = /:focus-visible/;

/**
 * A `:focus` or a `:focus-visible` rule, and not `:focus-within` — the button scan's mark below,
 * which is how the skip link says it takes focus, and the one the shared set is read with (#169).
 */
const FOCUS = /:focus(-visible)?(?![\w-])/;

/** What a `composes:` names: its classes, and the stylesheet they are from — none for its own. */
function composedFrom(value: string): { readonly names: readonly string[]; readonly from: string | undefined } {
  const [names = '', from] = value.split(/\s+from\s+/);
  return {
    names: names.split(' ').filter((name) => name.length > 0).map((name) => `.${name}`),
    from: from?.replace(/^(['"])(.*)\1$/, '$2'),
  };
}

/** A `from` that reaches the shared set — by whatever relative path the module takes to it. */
const FROM_THE_SHARED_SET = /(^|\/)controls\.module\.css$/;

/**
 * The classes a stylesheet marks as controls: those it gives a rule matching `focus`, those it
 * gives `cursor: pointer`, and those that compose a control — one of `shared` from the shared
 * set's file, or one this stylesheet marks. Per stylesheet, for the reason above.
 */
function controlClassesOf(rules: readonly CssRule[], focus: RegExp, shared: ReadonlySet<string>): Set<string> {
  const controls = new Set<string>();
  /** Each class that composes classes of its own stylesheet, with the classes it composes. */
  const composingOwn: (readonly [string, readonly string[]])[] = [];
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      const compounds = compoundsOf(selector);
      for (const compound of compounds) {
        const name = classOf(compound);
        if (name && focus.test(compound)) controls.add(name);
      }
      const subject = classOf(compounds.at(-1) ?? '');
      if (!subject) continue;
      if (rule.declarations['cursor'] === 'pointer') controls.add(subject);
      for (const value of rule.composes) {
        const { names, from } = composedFrom(value);
        if (from === undefined) composingOwn.push([subject, names]);
        else if (FROM_THE_SHARED_SET.test(from) && names.some((name) => shared.has(name))) controls.add(subject);
      }
    }
  }
  // Round again until a round adds nothing: a class may compose one that composes a control, and
  // a stylesheet may declare the two in either order.
  for (let grew = true; grew; ) {
    grew = false;
    for (const [subject, names] of composingOwn) {
      if (!controls.has(subject) && names.some((name) => controls.has(name))) {
        controls.add(subject);
        grew = true;
      }
    }
  }
  return controls;
}

/**
 * THE SHARED SET'S OWN CONTROLS, read from `controls.module.css` by the same rules rather than
 * listed: `.button`, which takes the pointer and the ring, the weights that compose it, and the
 * field. A class anywhere else that composes one of these is a control (#169).
 */
const SHARED_CONTROLS = controlClassesOf(rulesOf(readFileSync(CONTROLS, 'utf8')), FOCUS, new Set());

test('the scans read the shared set’s controls from its own file', () => {
  // The weights say only `composes: button`, so this is the rule for a stylesheet's own classes
  // at work. Were it to stop, every button composed from a weight would stop being a control, and
  // every scan below would pass over all of them in silence.
  for (const name of ['.button', '.primary', '.secondary', '.ghost', '.field']) {
    assert.ok(SHARED_CONTROLS.has(name), `controls.module.css's ${name} is not read as a control`);
  }
  // A part of a button is not one, and composing it makes nothing a control.
  for (const name of ['.icon', '.label', '.visuallyHidden']) {
    assert.ok(!SHARED_CONTROLS.has(name), `controls.module.css's ${name} is read as a control`);
  }
});

/** Whether a selector's subject — its last compound — is one of `controls`, or a control element. */
function subjectIsControl(selector: string, controls: ReadonlySet<string>): boolean {
  const subject = compoundsOf(selector).at(-1) ?? '';
  const name = classOf(subject);
  const element = elementOf(subject);
  return (
    (name !== undefined && controls.has(name)) ||
    (name === undefined && element !== undefined && CONTROL_ELEMENTS.has(element))
  );
}

/** Every border in `--rule` on a control, as `selector { property: value }`. */
function ruleEdgesOnControls(css: string): string[] {
  const rules = rulesOf(css);
  const controls = controlClassesOf(rules, FOCUS_VISIBLE, SHARED_CONTROLS);

  const found: string[] = [];
  for (const rule of rules) {
    if (rule.within.some((prelude) => /\bprint\b/.test(prelude))) continue;
    for (const selector of rule.selectors) {
      if (!subjectIsControl(selector, controls)) continue;
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
    .entry { composes: field from '../read/controls.module.css'; border-color: ${edge}; }
    .caption { composes: label from '../read/controls.module.css'; border-bottom: 1px solid ${edge}; }
    @media print { .field { border-bottom: 1px solid ${edge}; } }
    @media (max-width: 30rem) { .field { border-width: 2px; border-color: ${edge}; } }
  `;

  assert.deepEqual(ruleEdgesOnControls(sheet), [
    `.field { border: 1px solid ${edge} }`,
    `.go { border-color: ${edge} }`,
    `.pane[open] > .go { border-bottom: 1px solid ${edge} }`,
    `.row input { border: 1px solid ${edge} }`,
    // A field composed from the shared set is one, though nothing here says it takes focus; a
    // label composed from it is not.
    `.entry { border-color: ${edge} }`,
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

/*
 * ────────────────────────────────────────────────────────────────────────────────────────
 * ONE FAMILY OF BUTTONS, AND OUTSIDE THE READING SCREENS NOBODY DRAWS ANOTHER — issue #169.
 *
 * ADR-0063 gave the reading screens one family (`components/read/controls.module.css`). Beside
 * them a second one went on being drawn by hand: the index's and the 404's *Open the programs*,
 * the error page's *Try again*, the sign-in forms' submit, the consent's two answers, the
 * account's *Sign out* and the deletion screen's button each carried a 3 px corner, about 34 px
 * of height and a brightness on hover, and the lab's buttons a corner of 4 px. Each looked like
 * a button; together they looked like two products.
 *
 * So a CONTROL — recognised as the edge scan above recognises one, a `composes:` of the shared
 * set's buttons or field included, and by a `:focus` rule as well, which is how the skip link
 * says it takes focus — is never PAINTED by a rule of its own in a stylesheet outside
 * `components/read/`:
 *
 *   - no fill: a `background` that is not `none` or `transparent`;
 *   - no edge all the way round: a `border`, or its colour, width or style, that draws one;
 *   - no corner: a `border-radius`.
 *
 * A control that is shaped — a button, a field, the skip link when it shows — takes the shape
 * from `controls.module.css` by `composes:`, and a rule beside it may place, size or recolour
 * the text, or draw the ring on the surface it sits on. `components/read/` is where the shared
 * set lives and where ADR-0063 drew the reading screens' own controls from it and its tokens; a
 * side rule (`border-left`) is a mark rather than an edge, and a `@media print` rule paints
 * nothing a reader presses.
 *
 * WHAT IS DRAWN AS A BOX ON PURPOSE IS NAMED IN `DRAWN_ON_PURPOSE`, with its reason here: the
 * index's edition choice (#163) — two ADDRESSES drawn as joined boxes, which no shape in the
 * shared set is. It is drawn with the set's tokens and its ring, and `landing.spec.ts` holds the
 * shape.
 *
 * AND NO CONTROL CHANGES BY A FILTER, ANYWHERE: the brightness on hover was both families'
 * (`controls.module.css`'s `.primary` had it too), and it is now neither's — the set's own
 * weights are held here as well, which are controls only by composing `.button`. The focus scan
 * above already refused one on focus.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

/** What a declaration paints, if anything: a fill, an edge all the way round, or a corner. */
function paints(property: string, value: string): boolean {
  if (/^(inherit|initial|unset|revert)$/.test(value)) return false;
  if (property === 'background' || property === 'background-color') {
    return !/^(none|transparent)$/.test(value);
  }
  if (property === 'border' || property === 'border-color') {
    return !/^(0(px)?|none)(\s|$)/.test(value) && !/\btransparent\b/.test(value);
  }
  if (property === 'border-width') return !/^0(px)?$/.test(value);
  if (property === 'border-style') return value !== 'none';
  if (/^border(-(top|bottom)-(left|right)|-(start|end)-(start|end))?-radius$/.test(property)) {
    return !/^0(px)?$/.test(value);
  }
  return false;
}

/**
 * Every rule in a stylesheet that paints a control as a button — or, asked for `filter`, every
 * one that gives a control a filter, which no stylesheet may — as `selector { property: value }`.
 */
function buttonPaint(css: string, what: 'paint' | 'filter'): string[] {
  const rules = rulesOf(css);
  const controls = controlClassesOf(rules, FOCUS, SHARED_CONTROLS);

  const found: string[] = [];
  for (const rule of rules) {
    if (what === 'paint' && rule.within.some((prelude) => /\bprint\b/.test(prelude))) continue;
    for (const selector of rule.selectors) {
      if (!subjectIsControl(selector, controls)) continue;
      for (const [property, value] of Object.entries(rule.declarations)) {
        const wrong = what === 'paint' ? paints(property, value) : property === 'filter' && value !== 'none';
        if (wrong) found.push(`${selector} { ${property}: ${value} }`);
      }
    }
  }
  return found;
}

/**
 * The controls outside the shared set that are drawn as boxes on purpose, by file and by the
 * class of the subject — the section's header says why each is, and so does its stylesheet.
 */
const DRAWN_ON_PURPOSE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [join('components', 'language', 'language-choice.module.css'), new Set(['.other'])],
]);

/** The shared set's home and the reading screens' modules, which this scan leaves to ADR-0063. */
const READING = join('components', 'read') + sep;

/** The class of the subject of a `selector { property: value }` line. */
const subjectClassOf = (found: string): string | undefined =>
  classOf(compoundsOf(found.slice(0, found.indexOf(' {'))).at(-1) ?? '');

test('the button scan tells a painted control from a placed or a composed one', () => {
  const sheet = `
    .enter a, .enter button { background: var(--accent); border-radius: 3px; }
    .enter a:hover { filter: brightness(1.1); }
    .submit { background: var(--accent); border: 0; cursor: pointer; }
    .decline { border: 1px solid var(--control-edge); cursor: pointer; }
    .decline:focus-visible { box-shadow: 0 0 0 4px var(--accent); }
    .skip:focus { border-radius: var(--radius-control); }
    .field { composes: field from './controls.module.css'; }
    .field:focus-visible { outline: 2px solid var(--accent); }
    .quiet { background: none; border: 0; cursor: pointer; }
    .ghost { background: transparent; border: 1px solid transparent; cursor: pointer; }
    .notice { border-left: 2px solid var(--accent); }
    .notice:focus-visible { outline: 2px solid var(--accent); }
    .card { background: var(--paper-raised); border: 1px solid var(--rule); border-radius: 6px; }
    .card:focus-within { border-color: var(--accent); }
    .send { composes: primary from '../components/read/controls.module.css'; border-radius: 3px; justify-self: start; }
    .send:hover { filter: brightness(1.1); }
    .wide { composes: primary from './controls.module.css'; composes: row from './layout.module.css'; background: var(--accent); }
    .caption { composes: label from './controls.module.css'; background: var(--accent-soft); }
    .next { composes: primary; }
    .next:active { filter: brightness(0.9); }
    .button { cursor: pointer; }
    .primary { composes: button; }
    .primary:hover { filter: brightness(1.08); }
    @media print { .submit { border: 1px solid; } }
  `;

  /*
    From `.send` on, the shapes a control has taken since #169: a button that says only that it
    composes the shared set's `primary`, by whatever path — with a second `composes:` after it,
    too — is one; a label composed from the set is not; and in a stylesheet shaped like the set's
    own, `.primary` composes `.button`, and `.next` composes `.primary` before it is declared.
  */
  assert.deepEqual(buttonPaint(sheet, 'paint'), [
    '.enter a { background: var(--accent) }',
    '.enter a { border-radius: 3px }',
    '.enter button { background: var(--accent) }',
    '.enter button { border-radius: 3px }',
    '.submit { background: var(--accent) }',
    '.decline { border: 1px solid var(--control-edge) }',
    '.skip:focus { border-radius: var(--radius-control) }',
    '.send { border-radius: 3px }',
    '.wide { background: var(--accent) }',
  ]);
  assert.deepEqual(buttonPaint(sheet, 'filter'), [
    '.enter a:hover { filter: brightness(1.1) }',
    '.send:hover { filter: brightness(1.1) }',
    '.next:active { filter: brightness(0.9) }',
    '.primary:hover { filter: brightness(1.08) }',
  ]);
  assert.equal(subjectClassOf('.offered .other:hover { border-color: var(--accent) }'), '.other');
});

test('no stylesheet outside the shared set paints a button', () => {
  const sheets = stylesheetsUnder(SOURCE).filter((file) => !relative(SOURCE, file).startsWith(READING));
  assert.ok(sheets.length > 1, 'no stylesheet was found outside the reading screens, so this gate is asserting nothing');

  const offenders = sheets.flatMap((file) => {
    const allowed = DRAWN_ON_PURPOSE.get(relative(SOURCE, file)) ?? new Set<string>();
    return buttonPaint(readFileSync(file, 'utf8'), 'paint')
      .filter((found) => !allowed.has(subjectClassOf(found) ?? ''))
      .map((found) => `${relative(SOURCE, file)}: ${found}`);
  });

  assert.deepEqual(
    offenders,
    [],
    'a button, a field or a skip link off the reading screens takes its shape from ' +
      'components/read/controls.module.css with `composes:` — one family of buttons (#169)',
  );
});

test('no control in the app changes by a filter', () => {
  const offenders = stylesheetsUnder(SOURCE).flatMap((file) =>
    buttonPaint(readFileSync(file, 'utf8'), 'filter').map((found) => `${relative(SOURCE, file)}: ${found}`),
  );

  assert.deepEqual(
    offenders,
    [],
    'a hover or a press is a change of fill, edge or colour (controls.module.css), never a ' +
      'brightness a reader has to squint to see (#169)',
  );
});
