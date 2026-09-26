import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The identity fixture's outbox — the reader's mail, where the links its recovery endpoints
 * "send" are followed from (issue #170, `fixtures/authservice-stub.mts`).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A LINK IS FOLLOWED THE WAY A READER FOLLOWS ONE: BY CLICKING IT ON ANOTHER SITE.
 *
 * `page.goto(link)` would be a navigation the reader typed, and no browser treats that as
 * cross-site — so it would pass for a cookie the web app's landing sets `SameSite=Strict`, which
 * a real reader arriving from their mail would never get back (`emailed-link-cookie.ts`). So the
 * outbox page is opened under `localhost` while the identity deployment is `127.0.0.1`: two
 * hosts, and so two sites, because a browser tells sites apart by host and never by port.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Shared by `account-recovery.spec.ts` and `accessibility.spec.ts`, which scans the pages a
 * link leads to with a link held — `sign-in.ts`'s reason for a support module: a second copy
 * drifts, and importing it from a spec would register that spec's tests twice.
 */

/** The fixture's address, as `playwright.config.ts` publishes it to the specs. */
function stubBaseUrl(): URL {
  const published = process.env.AB_OVO_STUB_BASE_URL;
  if (!published) throw new Error('playwright.config.ts did not publish AB_OVO_STUB_BASE_URL');
  return new URL(published);
}

/** The outbox page for `address`, on a host that is another site from the web app's. */
export function outboxFor(address: string): string {
  const outbox = new URL('/__outbox', stubBaseUrl());
  outbox.hostname = 'localhost';
  outbox.searchParams.set('to', address);
  return outbox.toString();
}

/**
 * Open the newest email to `address` whose link reads `label`, and click it — `Reset Password`
 * and `Verify email address` are the two, in `SendGridEmailService`'s words. Returns the link's
 * address, token and all, so a spec can say what must never appear again.
 */
export async function followEmailLink(page: Page, address: string, label: string): Promise<string> {
  await page.goto(outboxFor(address));
  const link = page.getByRole('link', { name: label, exact: true }).first();
  await expect(link, `no email to ${address} carries a "${label}" link`).toBeVisible();
  const href = await link.getAttribute('href');
  if (!href) throw new Error('the link in the email has no address');
  await link.click();
  // The landing answers with a redirect, so the page settles on the web app's origin.
  await page.waitForURL((url) => url.origin === new URL(href).origin);
  return href;
}

/**
 * A fresh address the fixture registers as an instance that sends email would: waiting to be
 * confirmed, with a confirmation email in the outbox — the fixture's own convention, its
 * `UNCONFIRMED_DOMAIN`. Fresh for `register.ts`'s `freshEmail` reason: the fixture remembers.
 */
export const unconfirmedAddress = (): string =>
  `new-reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@unconfirmed.example.test`;

/**
 * The consent the fixture requires of a registration — `ConsentSettings`' defaults, which its
 * own `GET /consents/versions` publishes — asked of the fixture rather than written here, as
 * `registration.spec.ts` reads it off the form rather than assuming it.
 */
async function consent(request: APIRequestContext): Promise<{ terms: string; privacy: string }> {
  const response = await request.get(new URL('/api/v1/auth/consents/versions', stubBaseUrl()).toString());
  expect(response.status()).toBe(200);
  return (await response.json()) as { terms: string; privacy: string };
}

/**
 * An account of the calling test's own, made at the fixture directly: the way back is what
 * the test is about, and the registration form has its own spec. A fixed account would be
 * shared with every other spec signing in with it, and a reset would change its password
 * under them.
 */
export async function accountAtFixture(request: APIRequestContext, email: string, password: string): Promise<void> {
  const versions = await consent(request);
  const response = await request.post(new URL('/api/v1/auth/register', stubBaseUrl()).toString(), {
    data: { email, password, acceptedTermsVersion: versions.terms, acceptedPrivacyVersion: versions.privacy },
  });
  expect(response.ok(), `the fixture did not register ${email}`).toBe(true);
}
