/**
 * The remembered edition, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3. ADR-0049's requirements are all properties of this module —
 * English by default, a choice that sticks, a cookie the server can read, and nothing
 * trusted that came back out of storage — and each is asserted here rather than through a
 * browser. A defect in any of them reaches a reader as "the site keeps forgetting", which
 * is diagnosed as anything but a parse that returned the wrong shape.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LANGUAGE_KEY,
  LANGUAGE_VERSION,
  adopt,
  choose,
  forget,
  isLanguageTag,
  languageCookie,
  languageFromCookies,
  read,
  resolvedEdition,
  type Slot,
} from './store.ts';

/** A `localStorage` that is just an object, so every branch is reachable without a browser. */
function slot(initial?: string): Slot & { readonly held: () => string | undefined } {
  let value = initial;
  return {
    getItem: (key) => (key === LANGUAGE_KEY && value !== undefined ? value : null),
    setItem: (key, next) => {
      if (key === LANGUAGE_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === LANGUAGE_KEY) value = undefined;
    },
    held: () => value,
  };
}

/** A browser refusing storage: a private window, or storage switched off. */
const throwing: Slot = {
  getItem: () => {
    throw new Error('storage is disabled');
  },
  setItem: () => {
    throw new Error('storage is disabled');
  },
  removeItem: () => {
    throw new Error('storage is disabled');
  },
};

const stored = (record: unknown): string => JSON.stringify(record);

// ── Reading ─────────────────────────────────────────────────────────────────────────────

test('a reader who has never chosen has no choice — which is not a choice of English', () => {
  // The distinction the whole account sync turns on: `undefined` loses to anything the
  // account knows, where an explicit `'en'` is an answer that competes on its timestamp.
  assert.equal(read(slot()), undefined);
  assert.equal(read(undefined), undefined);
});

test('a choice written by this module is read back whole', () => {
  const holder = slot();
  const written = choose(holder, 'pl', new Date('2026-03-01T10:00:00.000Z'));

  assert.deepEqual(written, { language: 'pl', chosenAt: '2026-03-01T10:00:00.000Z' });
  assert.deepEqual(read(holder), written);
});

test('a browser refusing storage leaves the reader in English rather than nowhere', () => {
  // `choose` still answers, so the page the reader is navigating to is in the edition they
  // pressed. What they lose is that it does not outlive the tab.
  assert.equal(choose(throwing, 'pl').language, 'pl');
  assert.equal(read(throwing), undefined);
});

/*
 * Everything a reader, an older build or another script on the origin could leave behind.
 * Each resolves to "never chose", which resolves to English — the only safe direction for
 * this module to fail in.
 */
test('a record this module did not write is no choice', () => {
  for (const junk of [
    'not json at all',
    '',
    'null',
    '[]',
    '"pl"',
    stored({ version: LANGUAGE_VERSION }),
    stored({ version: LANGUAGE_VERSION, language: 42 }),
    stored({ version: LANGUAGE_VERSION, language: '' }),
    stored({ version: LANGUAGE_VERSION, language: '../../etc/passwd' }),
    stored({ version: LANGUAGE_VERSION, language: '<script>' }),
    stored({ version: LANGUAGE_VERSION, language: 'a-language-tag-far-too-long' }),
  ]) {
    assert.equal(read(slot(junk)), undefined, `accepted ${junk}`);
  }
});

test('a record at an unrecognised version is discarded rather than migrated', () => {
  assert.equal(
    read(slot(stored({ version: LANGUAGE_VERSION + 1, language: 'pl', chosenAt: '2026-01-01T00:00:00.000Z' }))),
    undefined,
  );
});

test('a choice with an unusable timestamp is still a choice, and the oldest one', () => {
  // A machine that can say WHAT must not be made to say NOTHING because it could not say
  // WHEN: the reader really did pick Polish, and losing the tie-break is the right cost.
  const choice = read(slot(stored({ version: LANGUAGE_VERSION, language: 'pl', chosenAt: 'tuesday' })));

  assert.equal(choice?.language, 'pl');
  assert.equal(Date.parse(choice!.chosenAt), 0);
});

// ── Writing ─────────────────────────────────────────────────────────────────────────────

test('adopting keeps the timestamp of the machine that chose', () => {
  // Stamping it here instead would make a copy of an older decision look fresher than the
  // decision, and the two machines would flap between editions for ever.
  const holder = slot();
  const theirs = { language: 'pl', chosenAt: '2025-06-01T08:00:00.000Z' };

  adopt(holder, theirs);

  assert.deepEqual(read(holder), theirs);
});

test('forgetting returns the reader to never-having-chosen', () => {
  const holder = slot();
  choose(holder, 'pl');
  forget(holder);

  assert.equal(read(holder), undefined);
  assert.equal(holder.held(), undefined);
});

// ── The tag ─────────────────────────────────────────────────────────────────────────────

test('a language tag is checked for shape and never for membership', () => {
  // Membership is the content's to answer — this module holds no bundle, and must not, or
  // the browser's preference store would depend on what the reading surface serves.
  assert.equal(isLanguageTag('en'), true);
  assert.equal(isLanguageTag('pl'), true);
  assert.equal(isLanguageTag('pl-PL'), true);
  assert.equal(isLanguageTag('de'), true, 'an edition nobody publishes is still a tag');

  assert.equal(isLanguageTag('e'), false);
  assert.equal(isLanguageTag(''), false);
  assert.equal(isLanguageTag('en; drop table'), false);
  assert.equal(isLanguageTag(undefined), false);
  assert.equal(isLanguageTag(7), false);
});

// ── The cookie ──────────────────────────────────────────────────────────────────────────

test('the cookie round-trips through the format a browser and a request both use', () => {
  const header = languageCookie('pl', false);

  assert.match(header, new RegExp(`^${LANGUAGE_COOKIE}=pl;`));
  assert.match(header, /Path=\//);
  assert.match(header, /SameSite=Lax/);
  assert.doesNotMatch(header, /Secure/, 'a secure cookie over plain http is never stored');
  assert.match(languageCookie('pl', true), /Secure/);

  assert.equal(languageFromCookies(`${LANGUAGE_COOKIE}=pl`), 'pl');
});

test('the cookie is found among others, wherever it sits and however it is spaced', () => {
  assert.equal(languageFromCookies(`ab_ovo_at=x; ${LANGUAGE_COOKIE}=pl; ab_ovo_rt=y`), 'pl');
  assert.equal(languageFromCookies(`${LANGUAGE_COOKIE}=pl;ab_ovo_at=x`), 'pl');
  assert.equal(languageFromCookies(`  ${LANGUAGE_COOKIE}=pl  `), 'pl');
});

test('a cookie is reader-editable, so a value that is not a tag is no value', () => {
  // It arrives on a request anybody can forge and reaches a `lang` attribute and an href.
  assert.equal(languageFromCookies(`${LANGUAGE_COOKIE}=<script>`), undefined);
  assert.equal(languageFromCookies(`${LANGUAGE_COOKIE}=`), undefined);
  assert.equal(languageFromCookies('ab_ovo_at=x'), undefined);
  assert.equal(languageFromCookies(''), undefined);
  assert.equal(languageFromCookies(undefined), undefined);
  // A cookie whose NAME merely ends in ours is not ours.
  assert.equal(languageFromCookies(`not_${LANGUAGE_COOKIE}=pl`), undefined);
});

// ── The precedence ──────────────────────────────────────────────────────────────────────

const OFFERED = ['en', 'pl'];

test('the URL beats the memory, and the memory beats English', () => {
  assert.equal(resolvedEdition(OFFERED, 'en', 'pl'), 'en');
  assert.equal(resolvedEdition(OFFERED, undefined, 'pl'), 'pl');
  assert.equal(resolvedEdition(OFFERED, undefined, undefined), DEFAULT_LANGUAGE);
});

test('every unusable answer falls through to the next step rather than erroring', () => {
  assert.equal(resolvedEdition(OFFERED, 'de', 'pl'), 'pl', 'an edition nobody publishes');
  assert.equal(resolvedEdition(OFFERED, ['pl', 'en'], 'pl'), 'pl', 'a repeated parameter');
  assert.equal(resolvedEdition(OFFERED, '', undefined), 'en');
  assert.equal(resolvedEdition(OFFERED, undefined, 'de'), 'en', 'a preference the track dropped');
});

test('content without an English edition gets its own first, never a blank', () => {
  assert.equal(resolvedEdition(['pl'], undefined, undefined), 'pl');
  assert.equal(resolvedEdition(['de', 'fr'], 'en', 'en'), 'de');
  assert.equal(resolvedEdition([], undefined, undefined), DEFAULT_LANGUAGE);
});
