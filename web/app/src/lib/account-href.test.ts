/**
 * The addresses of the sign-in pages, at the layer with the logic (P13).
 *
 * What is worth a test is the property issue #166 is about: nothing a link into these pages
 * has to carry is ever dropped — the destination, the edition, and on a redirect the code —
 * and one page has one spelling. A dropped `lang` renders a page in the wrong edition and
 * nothing else goes wrong, which is why no other layer notices it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerHref, secondFactorHref, signInHref } from './account-href.ts';

test('nothing to carry is the bare page, with no empty query string on the end', () => {
  assert.equal(signInHref(), '/login');
  assert.equal(signInHref({ redirect: null, edition: '' }), '/login');
  assert.equal(secondFactorHref({}), '/login/2fa');
  assert.equal(registerHref({ edition: undefined }), '/register');
});

test('the index’s own Sign in carries where the reader was and the edition they read in', () => {
  // `/?lang=pl` is itself an address with a query, so it is encoded whole inside this one.
  assert.equal(
    signInHref({ redirect: '/?lang=pl', edition: 'pl' }),
    '/login?redirect=%2F%3Flang%3Dpl&lang=pl',
  );
});

test('a code comes first, then the destination, then the edition — one page, one address', () => {
  // The order the sign-in route has always written `?error=` and `?redirect=` in, so the
  // addresses already in readers' histories and in the specs are unchanged by the edition.
  assert.equal(
    signInHref({ edition: 'en', redirect: '/account', error: 'locked' }),
    '/login?error=locked&redirect=%2Faccount&lang=en',
  );
  assert.equal(
    registerHref({ notice: 'verify-email', redirect: '/instrument', edition: 'pl' }),
    '/register?notice=verify-email&redirect=%2Finstrument&lang=pl',
  );
});

test('the code screen keeps the destination, which its Start again used to drop', () => {
  assert.equal(
    secondFactorHref({ redirect: '/instrument', edition: 'pl' }),
    '/login/2fa?redirect=%2Finstrument&lang=pl',
  );
  assert.equal(
    signInHref({ redirect: '/instrument', edition: 'pl' }),
    '/login?redirect=%2Finstrument&lang=pl',
  );
});
