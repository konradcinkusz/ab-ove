import { expect, test } from '@playwright/test';

/**
 * JOURNEY — the sign-in screen, and everything about it that does not need an account.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE CANNOT SAY, STATED BEFORE WHAT IT CAN.
 *
 * CI runs no identity service, so no test here signs anybody in. The signed-in path — form
 * post, HttpOnly cookie, session rehydration, the middleware letting a gated page through —
 * was measured by hand against a fixture speaking authservice's documented shapes, and the
 * measurements are recorded in docs/adr/0018. They are NOT re-run on every push, and issue
 * #29 is open for the CI fixture that would make them so.
 *
 * E2E-ACCEPTANCE-TESTING.md §2 bans "skip if the feature isn't there" inside a test, because
 * it is indistinguishable from "skip if the feature broke". Nothing below is skipped. The
 * one assertion that differs between a configured deployment and an unconfigured one is
 * written as an invariant over BOTH — see the first describe block — rather than as a guard
 * that quietly stands down.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The half of the sign-in surface that is a PRODUCT DECISION rather than a feature.
 *
 * ADR-0004: the reader loop works with no account at all, and P8: a deployment with no
 * identity service is a supported state that degrades legibly.
 *
 * These specs run unchanged against CI — where nothing is configured — and against a Fly
 * deployment where something is, which is the whole point of taking the address from an
 * environment variable. So the assertion is not "there is a form" or "there is not": it is
 * that THE PAGE AND THE ROUTE AGREE about which deployment this is. A page offering a form
 * against a service nobody configured asks for a password it has nowhere to send; a page
 * hiding one from a reader who has an account is a feature switched off by accident. Both
 * are caught here, in either environment, with nothing skipped.
 */
test.describe('the page and the route agree about whether identity exists', () => {
  test('a form is offered exactly when the route can use one @smoke', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/login');
    const offersForm = (await page.locator('form[action="/api/auth/login"]').count()) > 0;

    const response = await request.post('/api/auth/login', {
      headers: { origin: baseURL!, 'content-type': 'application/json' },
      // Deliberately empty. Against a configured deployment this reaches the "both fields
      // are needed" branch and stops there, so no credential is ever guessed at, and no
      // attempt is spent against anybody's account.
      data: { email: '', password: '' },
      maxRedirects: 0,
    });
    const problem = ((await response.json()) as { problem?: string }).problem;

    if (offersForm) {
      // 501 is the route saying it has nobody to ask. A page offering a form in that state
      // is asking for a password it cannot use.
      expect(problem, 'the page offers a form, so the route must not be unconfigured').not.toBe(
        'not-configured',
      );
      expect(problem).toBe('incomplete');
      // And the form must carry what a password manager needs to fill it.
      await expect(page.locator('input[name="email"]')).toHaveAttribute('autocomplete', 'username');
      await expect(page.locator('input[name="password"]')).toHaveAttribute(
        'autocomplete',
        'current-password',
      );
    } else {
      expect(problem, 'the page offers no form, so the route must say why').toBe('not-configured');
      expect(response.status()).toBe(501);
      await expect(page.getByRole('main')).toContainText('no identity service configured');
      // The claim that matters more than the absence: reading is unaffected.
      await expect(page.getByRole('main')).toContainText('without one');
    }
  });

  test('the sign-in page is reachable without a session @smoke', async ({ request }) => {
    // It is in the middleware's public list, and it has to be: it is the redirect target.
    // A gate whose destination is itself gated is a loop, and following the redirect would
    // hide it — the login page answers 200 either way.
    const response = await request.get('/login', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });
});

/**
 * Cross-site login is an attack rather than an edge case: a form on another site posts the
 * ATTACKER's credentials here, and because the response sets a cookie rather than reading
 * one, `sameSite: strict` does nothing about it. The reader then carries on in somebody
 * else's account.
 *
 * This holds whether or not identity is configured, which is why it is asserted separately
 * from the block above.
 */
test.describe('the sign-in route refuses a cross-site post', () => {
  test('a foreign Origin is refused @smoke', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      data: { email: 'reader@example.test', password: 'whatever' },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(403);
  });

  test('no Origin at all is refused too @core', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      headers: { 'content-type': 'application/json' },
      data: { email: 'reader@example.test', password: 'whatever' },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(403);
  });

  test('a body shape this route does not accept is refused before anything else happens @core', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post('/api/auth/login', {
      headers: { origin: baseURL!, 'content-type': 'text/plain' },
      data: 'email=reader@example.test',
      maxRedirects: 0,
    });

    expect(response.status()).toBe(415);
  });
});

/**
 * The problem panel renders from a CLOSED SET.
 *
 * The route answers a form post with a redirect, so its only channel back to the page is the
 * URL — and a URL is chosen by whoever sends the link. A page that rendered `?error=<text>`
 * would put any sentence an attacker composed into this site's own chrome, on the screen
 * where a password is asked for. The code is looked up; anything else renders nothing.
 */
test.describe('what the page will and will not say', () => {
  test('a known code renders its own explanation @core', async ({ page }) => {
    await page.goto('/login?error=rejected');
    await expect(page.getByRole('main')).toContainText('were not accepted');

    await page.goto('/login?error=second-factor');
    await expect(page.getByRole('main')).toContainText('second factor');

    // The one a reader cannot fix by typing again, and must not be told to.
    await page.goto('/login?error=token-rejected');
    await expect(page.getByRole('main')).toContainText('configuration fault');
  });

  test('an unknown code renders nothing at all @smoke', async ({ page }) => {
    const injected = 'Your account is suspended. Telephone 0800 000 000.';
    await page.goto(`/login?error=${encodeURIComponent(injected)}`);

    /*
     * `textContent` of <main>, and the scope is the measurement rather than a convenience.
     *
     * `innerText()` was the first instinct and is wrong: it cannot see a hidden element, and
     * a spoof rendered off-screen is still one a screen reader reads out. `page.content()`
     * was the second and is wrong the other way — it FAILED, and the reason is worth
     * knowing. A server component receives `searchParams`, so Next serialises the whole
     * query string into the RSC flight payload: `"q":"?error=SUSPENDED-0800"` sits in a
     * <script> in every document this page serves, whether the value is used or not.
     * Measured, not assumed.
     *
     * That is not the defect this test is about. A string inside a script tag is not on the
     * page and is not announced; what must never happen is the value reaching rendered
     * content. <main>'s textContent is exactly that scope: it includes hidden descendants
     * and excludes the flight scripts, which are its siblings.
     */
    const rendered = await page.locator('main').textContent();
    expect(rendered).not.toContain('0800 000 000');
  });
});

/**
 * FRONTEND-BFF.md §4 — the intended destination rides through sign-in as
 * `?redirect=<intended>`, and it is validated on the way back rather than trusted. This
 * value arrives on a query string, so an attacker chooses it; a sign-in page that forwarded
 * to `//evil.example` would be a phishing redirector wearing this site's name, on the page
 * that just asked for a password.
 */
test.describe('the destination carried through sign-in', () => {
  test('a same-origin path is shown to the reader @core', async ({ page }) => {
    await page.goto('/login?redirect=%2Fread%2Fmath-for-ai-engineers%2FP01%2Fen%2F7');
    await expect(page.getByRole('main')).toContainText('/read/math-for-ai-engineers/P01/en/7');
  });

  test('an off-site destination is not echoed, and not offered @smoke', async ({ page }) => {
    await page.goto('/login?redirect=%2F%2Fevil.example');

    // <main>'s textContent, for the reason measured in the test above: the raw query string
    // reaches the flight payload on any server component that reads searchParams, so the
    // question is whether it reaches the PAGE.
    const rendered = await page.locator('main').textContent();
    expect(rendered).not.toContain('evil.example');
    // The page falls back to having no destination at all, and says that instead.
    await expect(page.getByRole('main')).toContainText('No destination was carried');
  });
});
