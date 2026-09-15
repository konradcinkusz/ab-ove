import { expect, test } from '@playwright/test';

/**
 * JOURNEY — closing an account, and everything about it that does not need one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE CANNOT SAY, STATED BEFORE WHAT IT CAN.
 *
 * CI runs no identity service, so no test here deletes anything. The deleting path — the
 * progress call, then authservice, then the cookies — is pinned at the layer with the
 * logic in `delete-account.test.ts`, including the ORDER, which is the decision. Issue #29
 * is open for the CI identity fixture that would let a spec cross the whole thing.
 *
 * E2E-ACCEPTANCE-TESTING.md §2 bans "skip if the feature isn't there" inside a test,
 * because it is indistinguishable from "skip if the feature broke". Nothing below is
 * skipped: every assertion is an invariant over BOTH a configured deployment and an
 * unconfigured one, which is what makes the same file meaningful against CI and against
 * Fly.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The gate, and the hole a gate would have punched in this feature.
 *
 * `/account` is private by default — it is in neither list in the middleware — and
 * `/account/deleted` has an entry of its own. That asymmetry is the whole of a defect that
 * is invisible in any single file: the deletion route's last act is to clear the session,
 * so the page the reader is redirected to is reached WITHOUT one. Private, it would bounce
 * them to a sign-in form for the account they had just deleted, and every part in
 * isolation would look correct.
 */
test.describe('the gate, and the page on the other side of it', () => {
  test('the deletion screen needs a session @smoke', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?/);
    // Carried through, so signing in returns the reader to the screen they asked for.
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/account');
  });

  test('the page a deletion ends on does NOT need a session @smoke', async ({ request }) => {
    // `maxRedirects: 0` is load-bearing. Followed, a 307 to /login returns the login page
    // as 200 and this test passes for exactly the wrong reason — which is the same trap
    // `lab-p01.spec.ts` records for the runtime assets.
    const response = await request.get('/account/deleted', { maxRedirects: 0 });
    expect(
      response.status(),
      'a reader whose session has just been ended cannot be asked to sign in to read the confirmation',
    ).toBe(200);
  });
});

/**
 * The sentence issue #13 exists for.
 *
 * "It removes both, AND it says plainly that it cannot retract an anonymous outcome already
 * folded into a rate... A deletion screen that implies otherwise is claiming a capability
 * the schema was designed not to have."
 *
 * It is asserted on `/account/deleted` rather than on `/account` because that page is
 * public and this suite has no session — which is a real property of the design and not a
 * workaround: the sentence is on BOTH screens deliberately, since the moment a reader most
 * needs to know what a deletion did not reach is after it has happened.
 */
test.describe('what a deletion cannot reach is on the page, in the reader’s language', () => {
  test('in English @core', async ({ page }) => {
    await page.goto('/account/deleted');

    const main = page.locator('main');
    await expect(main).toContainText('no row of it knows it was yours');
    await expect(main).toContainText('cannot be taken back out');
    // True only while phase 4 is unbuilt, and gated by a .NET test that fails the build
    // when a second entity appears in the model.
    await expect(main).toContainText('the instrument is not built');
    // What survives, which a reader is as entitled to know as what does not.
    await expect(main).toContainText('This browser keeps its own copy');
  });

  test('in Polish @core', async ({ page }) => {
    await page.goto('/account/deleted?lang=pl');

    const main = page.locator('main');
    await expect(main).toHaveAttribute('lang', 'pl');
    await expect(main).toContainText('żaden jego wiersz nie wie');
    await expect(main).toContainText('instrument nie powstał');
  });

  test('an unknown language falls back rather than failing @core', async ({ page }) => {
    // `chromeFor`'s ordinary fallback. A reader arriving with a language this application
    // has no words for gets English chrome, never `undefined` rendered into a paragraph.
    await page.goto('/account/deleted?lang=xx-nonsense');
    await expect(page.locator('main')).toHaveAttribute('lang', 'en');
    await expect(page.locator('main')).toContainText('no row of it knows it was yours');
  });
});

/**
 * The route, without a session and without an identity service.
 *
 * Every assertion here holds in both deployments, which is what stops this file being a
 * test of CI's configuration rather than of the product.
 */
test.describe('the route refuses what it must refuse', () => {
  test('a cross-site post is refused before anything is read @smoke', async ({ request }) => {
    /*
     * The attack this check exists for, and it is not the sign-in route's.
     *
     * A form on another site, submitted by a reader who IS signed in, carries that
     * reader's cookie and needs no credential of the attacker's at all. The confirmation
     * word does not help, because the attacker's form supplies it. `sameSite: strict` very
     * nearly covers it — and the attribute is one edit away from `lax`, which is not a
     * property to rest an irreversible operation on.
     */
    const response = await request.post('/api/auth/account/delete', {
      headers: { origin: 'https://not-this-origin.example', 'content-type': 'application/json' },
      data: { confirm: 'DELETE', password: '', lang: 'en' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  });

  test('a post with no Origin at all is refused @core', async ({ request }) => {
    // A browser sets `Origin` on every POST and a page cannot forge it, so an absent one
    // is a caller this route was not built for. Refused rather than trusted.
    const response = await request.post('/api/auth/account/delete', {
      headers: { 'content-type': 'application/json' },
      data: { confirm: 'DELETE', password: '', lang: 'en' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  });

  test('a wrong confirmation word never deletes anything @smoke', async ({ request, baseURL }) => {
    /*
     * Written as "never succeeds" rather than as "answers `confirm`", and that is what
     * makes it an invariant over both deployments: an unconfigured one stops earlier, at
     * P8's "there is no account to delete", which is the more useful answer of the two and
     * is worth keeping.
     *
     * What must hold everywhere is the thing that matters — a word that is not a
     * confirmation must not reach the deletion.
     */
    const response = await request.post('/api/auth/account/delete', {
      headers: { origin: baseURL!, 'content-type': 'application/json' },
      data: { confirm: 'yes please', password: '', lang: 'en' },
      maxRedirects: 0,
    });

    expect(response.status(), 'a 204 is this route saying it deleted an account').not.toBe(204);
    expect(response.headers()['location'] ?? '').not.toContain('/account/deleted');
  });
});

/**
 * The page and the route agree about whether identity exists — `sign-in.spec.ts`'s shape,
 * for the same reason and against the same two deployments.
 *
 * It runs against `/account/deleted`, which is the page this suite can reach. That page
 * offers no form, so the agreement asserted here is the narrower one the suite can
 * actually observe: a route that reports itself unconfigured must not be contradicted by a
 * page claiming an account was deleted.
 */
test('an unconfigured deployment says so rather than claiming a deletion @core', async ({
  request,
  baseURL,
}) => {
  const response = await request.post('/api/auth/account/delete', {
    headers: { origin: baseURL!, 'content-type': 'application/json' },
    // A real confirmation word, so a configured deployment gets past the confirm check and
    // stops at the absent session instead. Nothing is deleted either way: there is no
    // cookie on this request.
    data: { confirm: 'DELETE', password: '', lang: 'en' },
    maxRedirects: 0,
  });

  const problem = ((await response.json()) as { problem?: string }).problem;
  expect(
    ['unconfigured', 'signed-out'],
    `the route answered ${problem ?? '(nothing)'} to a request with no session`,
  ).toContain(problem);
});
