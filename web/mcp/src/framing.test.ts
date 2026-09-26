/**
 * The server's own sentences, as data (#167).
 *
 * `chrome.test.ts`'s gates, one package over, and for its reason: every failure below is
 * silent in the edition nobody reviews. "5 ramki" is not an exception, and neither is an
 * English sentence left in the Polish entry — it renders, and a Polish reader's assistant
 * translates it, which is the defect this table exists to end. Two gates are this table's
 * own: a sentence here names no tool, because naming one makes it the assistant's; and the
 * Polish never makes the reader a man or a woman (ADR-0016).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { FALLBACK_LANGUAGE, FRAMING_LANGUAGES, TABLE, framingFor } from './framing.ts';
import type { Framing, Strings } from './framing.ts';
import { TOOLS } from './tools.ts';

/**
 * Every sentence of one entry, by key: each function called with the same two arguments,
 * so an entry's sentences can be read, and two entries' compared, without knowing which
 * key takes what. A number in a string's place prints as itself, which is all a scan needs.
 * An entry of the table or what `framingFor()` builds from one, whose counts are functions.
 */
function sentencesOf(strings: Strings | Framing): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(strings)) {
    if (typeof value === 'string') found.set(key, value);
    else if (typeof value === 'function') found.set(key, (value as unknown as (a: number, b: number) => string)(7, 9));
    else for (const [part, words] of Object.entries(value as Record<string, string>)) found.set(`${key}.${part}`, words);
  }
  return found;
}

test('the fallback language has an entry, which every other branch assumes', () => {
  assert.ok(TABLE[FALLBACK_LANGUAGE], 'framingFor() falls back to a language that is not in the table');
  assert.ok(FRAMING_LANGUAGES.includes(FALLBACK_LANGUAGE));
});

test('every language covers every plural category its own language can produce', () => {
  // `chrome.test.ts`'s gate, and its reasoning: `resolvedOptions().pluralCategories` is the
  // authoritative list, and a missing Polish `many` is "5 ramki" in a heading nobody reads.
  for (const language of FRAMING_LANGUAGES) {
    const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
    assert.ok(categories.length > 0, `${language} resolved to no plural categories at all`);
    for (const category of categories) {
      assert.ok(TABLE[language]!.step[category], `${language} "step" has no "${category}" form`);
    }
  }
});

test('a count takes the form its band needs, in both editions', () => {
  const pl = framingFor('pl');
  assert.equal(pl.steps(1), '1 ramka');
  assert.equal(pl.steps(4), '4 ramki');
  assert.equal(pl.steps(5), '5 ramek');
  assert.equal(pl.steps(12), '12 ramek');
  assert.equal(pl.steps(22), '22 ramki');
  assert.equal(pl.steps(48), '48 ramek');
  const en = framingFor('en');
  assert.equal(en.steps(1), '1 step');
  assert.equal(en.steps(48), '48 steps');
});

test('an edition with no sentences here gets English ones, and says they are English', () => {
  // ADR-0016's two sets: a track may publish an edition this server has no words for, and
  // its step is then framed in English rather than refused.
  const de = framingFor('de');
  assert.equal(de.language, FALLBACK_LANGUAGE);
  assert.equal(de.asks, framingFor('en').asks);
  // The positive control: without it, a framingFor() that always answered English would pass.
  assert.equal(framingFor('pl').language, 'pl');
  assert.notEqual(framingFor('pl').asks, framingFor('en').asks);
});

test('a name every object answers to is not a language: it gets English, every sentence of it', () => {
  // `sign-in-problem.test.ts`'s gate, one package over, for the same lookup: the table is an
  // object literal, and `TABLE['constructor']` used to find `Object.prototype`'s member and
  // build a Framing whose every sentence was undefined — a TypeError out of handle(), or the
  // word "undefined" said to a reader (#167, on #137's note).
  const english = sentencesOf(framingFor(FALLBACK_LANGUAGE));
  for (const inherited of ['constructor', '__proto__', 'toString']) {
    const framing = framingFor(inherited);
    assert.equal(framing.language, FALLBACK_LANGUAGE, `"${inherited}" was taken for a language`);
    assert.deepEqual(sentencesOf(framing), english, `"${inherited}" is not framed as English is`);
  }
});

test('no sentence is left untranslated: every Polish one differs from its English twin', () => {
  // The plural's forms differ in number by design — the gate above holds them — so the
  // groups are compared without them, and each English form against its Polish twin.
  const english = sentencesOf(TABLE[FALLBACK_LANGUAGE]!);
  const groups = (sentences: Map<string, string>): string[] =>
    [...sentences.keys()].filter((key) => !key.startsWith('step.')).sort();
  for (const language of FRAMING_LANGUAGES.filter((other) => other !== FALLBACK_LANGUAGE)) {
    const own = sentencesOf(TABLE[language]!);
    assert.deepEqual(groups(own), groups(english), `${language} heads other groups than English does`);
    for (const [key, words] of english) {
      assert.notEqual(own.get(key), words, `${language} "${key}" is the English sentence`);
    }
  }
});

test('no sentence here names a tool: a sentence that names one is the assistant\'s, and English', () => {
  // The line `framing.ts` draws, held from this side. A reader-facing sentence that told the
  // reader to "call open_program" would be a sentence for the model in the reader's edition.
  for (const language of FRAMING_LANGUAGES) {
    for (const [key, words] of sentencesOf(TABLE[language]!)) {
      for (const tool of TOOLS) {
        assert.ok(!words.includes(tool.name), `${language} "${key}" names ${tool.name}`);
      }
    }
  }
});

test('the Polish chooses no gender for the reader, and says ramka where the English says step', () => {
  // ADR-0016: a second-person past tense or conditional cannot be written without choosing
  // one (`napisałeś`, `napisałaś`), and the book does not know who is reading.
  const gendered = /(?:łeś|łaś|łbyś|łabyś)(?!\p{L})/u;
  // translate-a-document.md: the numbered unit is `ramka` in the book and on every screen,
  // and a second Polish word for it is the drift that vocabulary exists to stop.
  const secondWord = /(?<!\p{L})krok/iu;
  for (const [key, words] of sentencesOf(TABLE['pl']!)) {
    assert.doesNotMatch(words, gendered, `pl "${key}" chooses the reader's gender`);
    assert.doesNotMatch(words, secondWord, `pl "${key}" calls a frame a krok`);
  }
});
