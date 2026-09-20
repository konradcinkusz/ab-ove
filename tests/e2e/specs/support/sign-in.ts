import type { Page } from '@playwright/test';

/**
 * Fill the sign-in form and wait for wherever the route sends the browser.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * SHARED BY EVERY `@identity` SPEC THAT NEEDS A SESSION FIRST.
 *
 * It lived inside `sign-in-identity.spec.ts` until `account-deletion.spec.ts` needed it
 * too. A second copy would be the drift this suite's own README refuses, and importing it
 * from a spec file would register that spec's tests a second time under the importer's
 * name — measured on the first draft, which doubled the identity project's count.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The form is located by field NAME rather than by label, on purpose: `/login` is English
 * only by its own recorded reasoning, and a spec that read its labels would be a copy of
 * two strings that have a source.
 */
export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export async function signIn(page: Page, account: Credentials, destination: RegExp): Promise<void> {
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await Promise.all([page.waitForURL(destination), page.click('button[type="submit"]')]);
}
