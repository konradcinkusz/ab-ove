/**
 * The book's credit (#172, ADR-0066 §4): there is one for every track this server can carry,
 * and it names the book as the book names itself.
 *
 * What the credit is said with, and where, is `tools.test.ts`'s and `framing.test.ts`'s. This
 * file holds the table against the two things it answers to: the pins, because a track with
 * no credit would be served uncredited, and the pinned bundle, whose track titles are the
 * book's own. The copyright notice has nothing to be checked against here, because the fetch
 * writes no licence file (`credit.ts` says what that leaves).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PINS, bundleFor } from '@ab-ovo/web-kit';
import { skipWithoutBundle } from '@ab-ovo/web-kit/have-bundle';

import { CREDITS, creditFor, creditIn } from './credit.ts';

test('every track this server can carry has a credit, so none is served uncredited', () => {
  // The tracks the server carries are the pins (`api.ts`), so a pin is where a new book
  // would arrive, and this is where it would be found to have no credit.
  assert.ok(PINS.length > 0, 'nothing is pinned, so nothing was checked');
  for (const pin of PINS) {
    assert.ok(creditFor(pin.track), `the pinned track "${pin.track}" has no credit in credit.ts`);
  }
});

test('the credit names the book in every edition, as the pinned bundle does', { skip: skipWithoutBundle() }, () => {
  // The bundle's track titles are compiled from the book's own sources, so a title that
  // drifted here from the book's would be caught the day the pin moved to it.
  for (const pin of PINS) {
    const bundle = bundleFor(pin.track);
    assert.ok(bundle, `no bundle for the pinned track "${pin.track}"`);
    assert.deepEqual(creditFor(pin.track)?.titles, bundle.track.titles, `the credit of "${pin.track}" is not titled as the book is`);
  }
});

test('each credit carries what ADR-0066 §4 names: title, author, notice, licence with its link, and the source', () => {
  for (const [track, credit] of Object.entries(CREDITS)) {
    assert.ok(Object.keys(credit.titles).length > 0, `${track}: no title`);
    assert.ok(credit.author.trim() !== '', `${track}: no author`);
    // As LICENSE-CONTENT states it: the words, the year and the holder.
    assert.match(credit.copyright, /^Copyright \(c\) \d{4} \S/, `${track}: not a copyright notice`);
    // The licence the book declares today (ADR-0033). A relicense changes these, and this
    // test with them, in the same commit.
    assert.equal(credit.licence, 'CC BY-NC-SA 4.0', `${track}: the licence`);
    assert.equal(credit.licenceUrl, 'https://creativecommons.org/licenses/by-nc-sa/4.0/', `${track}: the licence's link`);
    assert.match(credit.source, /^https:\/\/\S+$/, `${track}: no address for the book itself`);
  }
});

test('a name every object answers to is not a track, and an edition with no title of its own gets English', () => {
  // framingFor()'s reason, for this table: CREDITS is an object literal.
  for (const inherited of ['constructor', '__proto__', 'toString']) {
    assert.equal(creditFor(inherited), undefined, `"${inherited}" was taken for a track`);
  }
  const credit = creditFor('math-for-ai-engineers');
  assert.ok(credit);
  assert.equal(creditIn(credit, 'pl').title, 'Matematyka od zera dla inżyniera AI');
  assert.equal(creditIn(credit, 'de').title, credit.titles['en']);
  assert.equal(creditIn(credit, 'constructor').title, credit.titles['en']);
  assert.equal(creditIn(credit, 'de').licenceUrl, credit.licenceUrl, 'the rest of the credit reads the same in any edition');
});
