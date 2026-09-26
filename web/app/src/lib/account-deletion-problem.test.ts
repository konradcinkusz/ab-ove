/**
 * The deletion problem table, at the layer with the logic.
 *
 * The lookup is `sign-in-problem.test.ts`'s property: a code arrives on a URL anybody can
 * compose, so anything unrecognised renders nothing at all. The sentences are the other half,
 * and one fact about them moved under the screen without the screen moving with it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DELETION_PROBLEMS, deletionProblem, deletionProblemMessage } from './account-deletion-problem.ts';
import { CHROME_LANGUAGES, chromeFor } from './i18n/chrome.ts';

test('every code has a sentence in every language', () => {
  for (const language of CHROME_LANGUAGES) {
    for (const code of DELETION_PROBLEMS) {
      assert.ok(
        deletionProblemMessage(code, chromeFor(language)).length > 0,
        `${language} has no sentence for ${code}`,
      );
    }
  }
});

test('a code that is not in the table renders nothing at all', () => {
  assert.equal(deletionProblem('Your account has been compromised, confirm below'), null);
  assert.equal(deletionProblem('PASSWORD-REJECTED'), null);
  assert.equal(deletionProblem(undefined), null);
  assert.equal(deletionProblem(['password-rejected', 'confirm']), 'password-rejected');
});

/**
 * ADR-0021 removes what the account had stored BEFORE it asks the identity service to delete
 * the account, and the password is checked there — so a refused password leaves the account
 * and not its reading position. That used to repair itself: the next sync pushed the
 * browser's copy back. ADR-0068 stopped the push, and the refusals went on saying only that
 * the password was missing or not accepted, to a reader whose position was already gone and
 * whose frames the gate would now refuse while they stayed signed in. Each sentence has to say
 * it, in each language this page speaks; a language added without it fails here by name.
 */
const ALREADY_REMOVED: Readonly<Record<string, RegExp>> = {
  en: /reading position stored on it was removed before the password was checked, and this browser does not send it back/,
  pl: /pozycję w lekturze usunięto przed sprawdzeniem hasła, a ta przeglądarka nie wyśle jej z powrotem/,
};

/**
 * And they do not say the edition the reader chose is lost with it, because it is not: the
 * root layout's `LanguageSync` sends this browser's choice to an account that holds none, on
 * the page the refusal is shown on (`lib/language/sync.ts`).
 */
const EDITION: Readonly<Record<string, RegExp>> = {
  en: /edition/i,
  pl: /wydani/i,
};

test('a refused password says the account kept no reading position', () => {
  for (const language of CHROME_LANGUAGES) {
    const said = ALREADY_REMOVED[language];
    assert.ok(said, `${language} has no wording to hold its password refusals to`);
    const edition = EDITION[language];
    assert.ok(edition, `${language} has no word for an edition to hold its password refusals to`);
    for (const code of ['password-required', 'password-rejected'] as const) {
      const sentence = deletionProblemMessage(code, chromeFor(language));
      assert.match(sentence, said, `${language} ${code}`);
      assert.doesNotMatch(sentence, edition, `${language} ${code} says the chosen edition is lost`);
    }
  }
});
