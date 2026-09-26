import type { Page } from '@playwright/test';

/**
 * Registering through `/register`, with an address nobody else holds.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * SHARED BY `registration.spec.ts`, WHICH IS ABOUT THE FORM, AND `account-overview.spec.ts`,
 * WHICH NEEDS AN ACCOUNT NOBODY ELSE WRITES TO.
 *
 * It lived inside `registration.spec.ts` until the overview needed it, and moved for
 * `sign-in.ts`'s reason: a second copy would be the drift this suite's README refuses, and
 * importing it from a spec file would register that spec's tests a second time under the
 * importer's name.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The form is located by field NAME, as `sign-in.ts` locates `/login`'s and for the same
 * reason: a field's name is the same in every edition the page follows (issue #166), and a
 * helper that read its labels would be a second copy of strings that have a source.
 */

/**
 * A fresh address per call, because the fixture REMEMBERS: an account registered by one
 * test is still there for the next, exactly as a real one would be. A fixed address would
 * make every test after the first fail on "already taken", and — worse — would make them
 * pass or fail depending on the order the runner chose.
 */
export const freshEmail = (): string =>
  `new-reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/**
 * Satisfies the identity service's policy — eight to a hundred characters, an upper and a
 * lower case letter from A to Z, a digit, a symbol — and so the browser's check of it too.
 */
export const GOOD_PASSWORD = 'Fixture-password-1!';

/** Fill `/register`'s form, accept the consent, and wait for wherever the route sends it. */
export async function register(
  page: Page,
  email: string,
  password: string,
  destination: RegExp,
): Promise<void> {
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="accept"]');
  await Promise.all([page.waitForURL(destination), page.click('button[type="submit"]')]);
}
