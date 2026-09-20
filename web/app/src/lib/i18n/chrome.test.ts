/**
 * The controls, at the layer with the logic.
 *
 * Two of the tests below are gates over DATA rather than over behaviour — every language
 * covers every plural category it can produce, and the fallback entry exists — and both
 * are here because the failure they catch is silent on a page nobody reviews in that
 * language. "5 ramki" is not an exception; it is a button with a wrong word in it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHROME_LANGUAGES, FALLBACK_LANGUAGE, TABLE, chromeFor, endonym } from './chrome.ts';

test('the fallback language has an entry, which every other branch assumes', () => {
  assert.ok(TABLE[FALLBACK_LANGUAGE], 'chromeFor() falls back to a language that is not in the table');
  assert.ok(CHROME_LANGUAGES.includes(FALLBACK_LANGUAGE));
});

test('every language covers every plural category its own language can produce', () => {
  // `resolvedOptions().pluralCategories` is the authoritative list for a language, which is
  // better than probing numbers: it cannot miss a category that only some unusual count
  // selects. English needs two, Polish needs four.
  for (const language of CHROME_LANGUAGES) {
    const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
    assert.ok(categories.length > 0, `${language} resolved to no plural categories at all`);
    for (const noun of ['frame', 'section'] as const) {
      const forms = TABLE[language]![noun];
      for (const category of categories) {
        assert.ok(
          forms[category],
          `${language} "${noun}" has no "${category}" form, so a count in that band silently uses "other"`,
        );
      }
    }
  }
});

test('Polish counts take four different shapes, in the bands CLDR says', () => {
  // The behavioural half of the gate above, and the one that says the rule is the RIGHT
  // rule rather than merely a complete table. The 22-and-25 pair is the point: a naive
  // "n < 5" implementation gets both wrong and passes every other assertion here.
  const pl = chromeFor('pl');
  assert.equal(pl.frames(1), '1 ramka');
  assert.equal(pl.frames(2), '2 ramki');
  assert.equal(pl.frames(5), '5 ramek');
  assert.equal(pl.frames(22), '22 ramki');
  assert.equal(pl.frames(25), '25 ramek');
  assert.equal(pl.frames(0), '0 ramek');
  // 12–14 is the exception band inside the rule; without it 12 would take the 2–4 form.
  assert.equal(pl.frames(12), '12 ramek');
  assert.equal(pl.sections(3), '3 sekcje');
});

test('English counts take two', () => {
  const en = chromeFor('en');
  assert.equal(en.frames(1), '1 frame');
  assert.equal(en.frames(2), '2 frames');
  assert.equal(en.frames(0), '0 frames');
});

test('a language with no controls here gets English ones, and SAYS they are English', () => {
  // The whole reason chromeFor returns a language. A track may declare a language this
  // repository has no word for; serving its content under English controls is right, and
  // serving it under controls that CLAIM to be in that language is not — a screen reader
  // would read "Reveal the answer" with a German voice.
  const de = chromeFor('de');
  assert.equal(de.language, FALLBACK_LANGUAGE);
  assert.equal(de.reveal, chromeFor('en').reveal);
});

test('a language with controls here reports itself, not the fallback', () => {
  // The positive control for the test above: without it, a chromeFor() that always returned
  // English would satisfy it.
  assert.equal(chromeFor('pl').language, 'pl');
  assert.notEqual(chromeFor('pl').reveal, chromeFor('en').reveal);
});

test('every language carries the same key map, entry for entry', () => {
  // The hint on a frame and the foot's full list are both derived from `keysMap`, so a
  // Polish entry that dropped a key, its gate or the state it belongs to would silently
  // show a Polish reader a shorter map than an English one. The WORDS may differ; the
  // keys, the islands they wait for and the states they belong to may not.
  const shape = (language: string) =>
    TABLE[language]!.keysMap.map((entry) => ({
      key: entry.key,
      macKey: entry.macKey,
      needs: entry.needs,
      when: [...entry.when],
    }));
  for (const language of CHROME_LANGUAGES) {
    assert.deepEqual(shape(language), shape(FALLBACK_LANGUAGE), `${language} has a different key map`);
  }
});

test('a language is named in its own language', () => {
  assert.equal(endonym('en'), 'English');
  assert.equal(endonym('pl'), 'polski');
  // Not in the table, and still named: the control is for the reader who cannot read the
  // page they are on, so the label comes from Intl rather than from CHROME_LANGUAGES.
  assert.equal(endonym('de'), 'Deutsch');
});

test('an endonym for nonsense is the code back, not a crash', () => {
  // It arrives from a URL segment. `languageIn()` gates the route, but this function is
  // also handed `track.languages`, which comes from a bundle rather than from this repo.
  assert.equal(endonym('not a language tag'), 'not a language tag');
});
