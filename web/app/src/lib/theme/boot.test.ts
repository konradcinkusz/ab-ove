import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { THEME_BOOT } from './boot.ts';
import { THEME_KEY, THEMES } from './store.ts';

/**
 * THE ONE PIECE OF THIS APPLICATION NOTHING ELSE CHECKS: a script that lives as a string.
 *
 * `boot.ts` is inlined into every document by `layout.tsx` and runs before the first paint.
 * Being a string, it is invisible to TypeScript, to ESLint and to the bundler — a typo in it
 * is a syntax error at the top of every page, which in a browser means the parser stops and
 * the rest of the document does not run. Nothing in the build would have said so.
 *
 * So it is RUN here, in a `vm` context with a stub `window` and `document`, rather than
 * pattern-matched. Matching the text would assert that a string contains another string;
 * running it asserts the behaviour the reader actually gets, including that it parses at all.
 *
 * P13 again: this is the layer with the logic, and the alternative instrument — a browser
 * noticing a flash of the wrong colour — is one no suite can hold steady.
 */

interface Ran {
  readonly attribute: string | undefined;
  readonly removed: boolean;
}

/** Run the boot script against a browser that holds `stored`, and report what it did. */
function boot(stored: string | null | (() => never)): Ran {
  let attribute: string | undefined;
  let removed = false;

  const context = {
    window: {
      localStorage: {
        getItem: (key: string) => {
          if (typeof stored === 'function') stored();
          return key === THEME_KEY ? (stored as string | null) : null;
        },
      },
    },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          if (name === 'data-theme') attribute = value;
        },
        removeAttribute: (name: string) => {
          if (name === 'data-theme') removed = true;
        },
      },
    },
  };

  runInNewContext(THEME_BOOT, context);
  return { attribute, removed };
}

test('a reader who chose a theme has it in the first paint', () => {
  assert.equal(boot('light').attribute, 'light');
  assert.equal(boot('dark').attribute, 'dark');
});

test('a reader who chose nothing is left to the stylesheet and the media query', () => {
  // Nothing set AND nothing removed: the server renders no attribute, so the system
  // position needs no work done to it, and a line clearing an attribute nobody set could
  // never be reached from a fresh document.
  for (const stored of [null, 'system', '', 'sepia', 'LIGHT', '{"theme":"dark"}']) {
    const ran = boot(stored);
    assert.equal(ran.attribute, undefined, `"${stored}" put a theme on the document`);
    assert.equal(ran.removed, false);
  }
});

test('a browser with storage switched off still renders the page', () => {
  /*
    `localStorage` THROWS on access when site data is blocked — it does not return null —
    and an exception at the top of the document stops the parser before there is a body.
    This is the assertion that the try/catch is not decoration.
  */
  const ran = boot(() => {
    throw new Error('storage is disabled');
  });
  assert.equal(ran.attribute, undefined);
});

test('the script reads the key the store writes, and knows every theme it can hold', () => {
  // Derived rather than typed out (see boot.ts), and this is what says the derivation still
  // holds: a renamed key or a fourth theme has to appear here without anybody editing it.
  assert.ok(THEME_BOOT.includes(JSON.stringify(THEME_KEY)));
  for (const theme of THEMES) {
    if (theme === 'system') continue;
    assert.equal(boot(theme).attribute, theme, `the boot script does not recognise "${theme}"`);
  }
});

test('the script is safe to put in a document', () => {
  // It reaches the page through `dangerouslySetInnerHTML`, so the one thing that must never
  // appear in it is a tag delimiter: `</script>` inside the text would close the element
  // early and spill the rest into the document as markup. Everything in it is derived from
  // two constants in this repository, and this is the gate that says so.
  assert.ok(!THEME_BOOT.includes('<'), 'the boot script contains a tag delimiter');
});
