/**
 * Maths lifting and rendering, and — the plan's own render guarantee — every body, title,
 * answer and route label of the PINNED BUNDLE, in both editions, run through the exact
 * lift-then-parse path `rich-text.tsx` uses, with every maths span actually rendered by
 * KaTeX. This is the test that stands in for the book's own (unpinned) CI check: see
 * `maths.ts`'s header for why this repository does not trust that check to mean the same
 * thing on this side of a version bump.
 *
 * Skips rather than fails when no bundle has been fetched yet, on `bundle.test.ts`'s own
 * precedent (`HAVE_REAL_BUNDLE`) — this file has the same reason: a machine that has not
 * run `scripts/fetch-book-content.sh` has nothing to render, and that is a setup step
 * missing, not a defect in this code.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PINS, bundleFor, say } from './bundle.ts';
import { KNOWN_BLOCK_KINDS, KNOWN_INLINE_KINDS, collectTokenKinds, parseBody, parseInline } from './markdown.ts';
import { liftMaths, renderMathSpan, restoreRaw, splitPlaceholders } from './maths.ts';
import type { Bundle } from './schema.ts';

const HAVE_REAL_BUNDLE = PINS.length > 0 && (() => {
  try {
    return bundleFor(PINS[0]!.track) !== undefined;
  } catch {
    return false;
  }
})();

// ── liftMaths / splitPlaceholders / restoreRaw ─────────────────────────────────────────

test('liftMaths lifts inline and display spans, in order, and leaves plain text alone', () => {
  const { text, spans } = liftMaths('A number $50$ and a display $$x^2$$ and text.');
  assert.equal(spans.length, 2);
  assert.deepEqual(spans[0], { tex: '50', display: false });
  assert.deepEqual(spans[1], { tex: 'x^2', display: true });
  assert.ok(!text.includes('$'), 'a lifted string should carry no dollar sign at all');
  assert.deepEqual(splitPlaceholders(text), ['A number ', 0, ' and a display ', 1, ' and text.']);
});

test('display maths is matched before inline, so $$...$$ is never read as two $...$ spans', () => {
  const { spans } = liftMaths('$$a + b$$');
  assert.equal(spans.length, 1);
  assert.equal(spans[0]!.display, true);
});

test('a maths span containing _ and < survives the lift untouched by Markdown syntax', () => {
  // The book's own probe: 906 spans with `_`, 163 with `<`/`>` — `x_i` reads as emphasis and
  // `w_{<i}` reads as an HTML tag start to a Markdown lexer unless lifted first.
  const { text, spans } = liftMaths('$w_{<i}$ and $x_i$');
  assert.equal(spans[0]!.tex, 'w_{<i}');
  assert.equal(spans[1]!.tex, 'x_i');
  const tokens = parseBody(text);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0]!.type, 'paragraph');
});

test('splitPlaceholders returns the whole string as one part when there is nothing to lift', () => {
  assert.deepEqual(splitPlaceholders('no maths here'), ['no maths here']);
  assert.deepEqual(splitPlaceholders(''), ['']);
});

test('restoreRaw puts the original delimiters back, exactly as liftMaths removed them', () => {
  const original = 'Compare $50$ against $$x^2$$.';
  const { text, spans } = liftMaths(original);
  assert.equal(restoreRaw(text, spans), original);
});

// ── renderMathSpan ──────────────────────────────────────────────────────────────────────

test('renderMathSpan renders an ordinary expression to KaTeX HTML, inline and display', () => {
  const inline = renderMathSpan({ tex: '2^5 = 32', display: false });
  assert.ok(inline.includes('katex'), 'expected KaTeX markup');
  assert.ok(!inline.includes('katex-display'), 'an inline span should not carry the display wrapper');

  const display = renderMathSpan({ tex: 'x^2', display: true });
  assert.ok(display.includes('katex-display'), 'a display span should carry the display wrapper');
});

test('renderMathSpan refuses rather than degrades on a construct it cannot reproduce', () => {
  // strict: true, throwOnError: true — the book's own CI options, copied rather than
  // loosened. \relax is a real TeX primitive with no KaTeX support at all.
  assert.throws(() => renderMathSpan({ tex: '\\thisMacroDoesNotExist{}', display: false }));
});

// ── the render guarantee: every span, body, title, answer and label of the pinned bundle ──

test(
  'every maths span in the pinned bundle renders under KaTeX in both editions',
  { skip: !HAVE_REAL_BUNDLE && 'no compiled bundle on disk — run scripts/fetch-book-content.sh' },
  () => {
    const bundle = bundleFor(PINS[0]!.track) as Bundle;
    let spanCount = 0;
    const failures: string[] = [];

    for (const language of bundle.track.languages) {
      for (const unit of bundle.units) {
        const texts: string[] = [say(unit.titles, language)];
        for (const section of unit.sections ?? []) texts.push(say(section.titles, language));
        for (const step of unit.steps) {
          texts.push(say(step.body, language));
          if (step.titles) texts.push(say(step.titles, language));
          if (step.answer) texts.push(say(step.answer, language));
        }
        for (const route of unit.routes ?? []) {
          if (route.labels) texts.push(say(route.labels, language));
        }

        for (const text of texts) {
          const { spans } = liftMaths(text);
          for (const span of spans) {
            spanCount += 1;
            try {
              renderMathSpan(span);
            } catch (error) {
              failures.push(`${unit.id} (${language}): "${span.tex}" — ${(error as Error).message}`);
            }
          }
        }
      }
    }

    assert.ok(spanCount > 1000, `expected several thousand maths spans across the book, found ${spanCount}`);
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} span(s) failed to render (first 10 shown)`);
  },
);

test(
  'every body and answer in the pinned bundle parses to a token tree rich-text.tsx recognises',
  { skip: !HAVE_REAL_BUNDLE && 'no compiled bundle on disk' },
  () => {
    const bundle = bundleFor(PINS[0]!.track) as Bundle;
    const failures: string[] = [];
    let checked = 0;

    for (const language of bundle.track.languages) {
      for (const unit of bundle.units) {
        for (const step of unit.steps) {
          for (const [label, text] of [
            ['body', say(step.body, language)],
            ...(step.answer ? [['answer', say(step.answer, language)] as const] : []),
          ] as const) {
            checked += 1;
            const { text: lifted } = liftMaths(text);
            try {
              const tokens = parseBody(lifted);
              const kinds = collectTokenKinds(tokens);
              for (const kind of kinds) {
                if (!KNOWN_BLOCK_KINDS.has(kind)) {
                  failures.push(`${unit.id} step ${step.n} (${language}) ${label}: unknown block kind "${kind}"`);
                }
              }
            } catch (error) {
              failures.push(`${unit.id} step ${step.n} (${language}) ${label}: ${(error as Error).message}`);
            }
          }
        }
      }
    }

    assert.ok(checked > 1000, `expected several thousand bodies and answers, checked ${checked}`);
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} failure(s) (first 10 shown)`);
  },
);

test(
  'every title and route label in the pinned bundle is well-formed inline text, in both editions',
  { skip: !HAVE_REAL_BUNDLE && 'no compiled bundle on disk' },
  () => {
    const bundle = bundleFor(PINS[0]!.track) as Bundle;
    const failures: string[] = [];
    let checked = 0;

    for (const language of bundle.track.languages) {
      for (const unit of bundle.units) {
        const inlineTexts: string[] = [say(unit.titles, language)];
        for (const section of unit.sections ?? []) inlineTexts.push(say(section.titles, language));
        for (const step of unit.steps) if (step.titles) inlineTexts.push(say(step.titles, language));
        for (const route of unit.routes ?? []) if (route.labels) inlineTexts.push(say(route.labels, language));

        for (const text of inlineTexts) {
          checked += 1;
          const { text: lifted } = liftMaths(text);
          try {
            const tokens = parseInline(lifted);
            const kinds = collectTokenKinds(tokens);
            for (const kind of kinds) {
              if (!KNOWN_INLINE_KINDS.has(kind)) {
                failures.push(`${unit.id} (${language}): unknown inline kind "${kind}" in ${JSON.stringify(text)}`);
              }
            }
          } catch (error) {
            failures.push(`${unit.id} (${language}): ${(error as Error).message} — ${JSON.stringify(text)}`);
          }
        }
      }
    }

    assert.ok(checked > 40, `expected dozens of titles and labels, checked ${checked}`);
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} failure(s) (first 10 shown)`);
  },
);
