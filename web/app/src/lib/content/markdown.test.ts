/**
 * The lexer wrapper and the allow-list it hands `rich-text.tsx` — the half of the
 * render guarantee that is plain `.ts` and can run through `node --test` directly. The
 * other half, "does this token tree actually become the JSX I expect", is
 * `specs/frame-view.spec.ts`'s job: `rich-text.tsx` is a `.tsx` file and this repository's
 * unit tier does not transform JSX (see `KNOWN_BLOCK_KINDS`'s own comment).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADMONITION_KIND,
  KNOWN_BLOCK_KINDS,
  KNOWN_INLINE_KINDS,
  collectTokenKinds,
  parseBody,
  parseInline,
} from './markdown.ts';

test('a plain paragraph parses to one paragraph token carrying one text token', () => {
  const tokens = parseBody('Hello, world.');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0]!.type, 'paragraph');
  const kinds = collectTokenKinds(tokens);
  assert.deepEqual([...kinds].sort(), ['paragraph', 'text']);
});

test('every inline kind is also a block kind', () => {
  // `rich-text.tsx`'s `renderBlockToken` handles 'space' itself (as null, same as inline)
  // and falls through to `renderInlineToken` for the rest of `KNOWN_INLINE_KINDS` — its own
  // comment: "a leaf token can arrive directly at block level inside a 'tight' list item".
  // If either stopped being true, a tight list's leaf items would throw "no block renderer"
  // for a kind this set calls known.
  for (const kind of KNOWN_INLINE_KINDS) {
    assert.ok(KNOWN_BLOCK_KINDS.has(kind), `"${kind}" is inline-known but not block-known`);
  }
});

test('parseBody recognises the book\'s admonitions, tables, code fences, lists and emphasis without throwing', () => {
  const markdown = [
    '**Trap**',
    '',
    'A paragraph with **bold**, *em*, `code`, and ~~strikethrough~~.',
    '',
    '| a | b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '- one',
    '- two',
    '',
    '```',
    'a fenced block',
    '```',
    '',
    '---',
  ].join('\n');
  const tokens = parseBody(markdown);
  const kinds = collectTokenKinds(tokens);
  for (const kind of kinds) {
    assert.ok(KNOWN_BLOCK_KINDS.has(kind), `"${kind}" is not in rich-text.tsx's block allow-list`);
  }
  // The fixture is built to exercise every admonition-adjacent shape at once — this is a
  // sanity check on the fixture itself, not a claim about the book.
  assert.ok(kinds.has('table'), 'the table row above did not parse to a table token');
  assert.ok(kinds.has('list'), 'the list above did not parse to a list token');
  assert.ok(kinds.has('code'), 'the fence above did not parse to a code token');
  assert.ok(kinds.has('hr'), 'the rule above did not parse to an hr token');
});

test('every admonition title in either edition is recognised by parseBody as a lone bold lead', () => {
  for (const title of Object.keys(ADMONITION_KIND)) {
    const tokens = parseBody(`**${title}**\n\nWhat follows the title.`);
    assert.equal(tokens[0]!.type, 'paragraph');
    const lead = tokens[0]!.type === 'paragraph' ? tokens[0]!.tokens : undefined;
    assert.equal(lead?.length, 1);
    assert.equal(lead?.[0]?.type, 'strong');
  }
});

test('parseInline refuses a title that is not a single paragraph', () => {
  assert.throws(() => parseInline('# A heading'), /expected inline text/);
  assert.throws(() => parseInline('One paragraph.\n\nAnd a second.'), /expected inline text/);
});

test('parseInline returns nothing for whitespace, and the paragraph\'s own tokens otherwise', () => {
  assert.deepEqual(parseInline(''), []);
  assert.deepEqual(parseInline('   '), []);
  const tokens = parseInline('Program *F1*');
  const kinds = collectTokenKinds(tokens);
  for (const kind of kinds) {
    assert.ok(KNOWN_INLINE_KINDS.has(kind), `"${kind}" is not in rich-text.tsx's inline allow-list`);
  }
  assert.ok(kinds.has('em'), 'the emphasis above did not parse to an em token');
});
