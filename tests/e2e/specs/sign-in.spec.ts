import { expect, test } from '@playwright/test';

/**
 * JOURNEY — the sign-in screen, and everything about it that does not need an account.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE CANNOT SAY, STATED BEFORE WHAT IT CAN.
 *
 * NOTHING HERE SIGNS ANYBODY IN, and that is still true — but it is no longer a gap. The
 * signed-in path (form post, HttpOnly cookie, session rehydration, the middleware letting a
 * gated page through) now lives in `sign-in-identity.spec.ts`, which runs against the
 * fixture `playwright.config.ts` starts. Issue #29 and ADR-0028.
 *
 * The split is deliberate rather than historical. This file is about the sign-in surface a
 * reader meets BEFORE they have an account, and every assertion in it must hold on a
 * deployment that has no identity service at all — which is a supported state (P8), and the
 * one CI ran exclusively until the fixture existed.
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
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * TWO TAGS, AND THAT IS THE POINT OF THEM (issue #29).
 *
 * The block below carries `@identity` as well as `@smoke`, so it runs TWICE: once under the
 * smoke project, against the web app with no identity service, and once under the identity
 * project, against the second one `playwright.config.ts` starts with a fixture behind it.
 * The `else` branch is exercised by the first run and the `offersForm` branch by the second.
 * Pairing `@identity` with the tag of a project that runs against the first web app is how
 * any spec says "true of both deployments": the last block in this file pairs it with
 * `@core`, and `unknown-address.spec.ts` with `@smoke`.
 *
 * Before the fixture existed, only the `else` branch could ever run. Adding identity to the
 * one deployment would have inverted that rather than fixed it — which is the cost issue
 * #29 names, and which is why there are two deployments instead of a configured one.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
test.describe('the page and the route agree about whether identity exists', () => {
  test('a form is offered exactly when the route can use one @smoke @identity', async ({
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
      // In the reader's words since issue #162: which service a deployment was configured
      // against is the operator's business, and what it means to a reader is this.
      await expect(page.getByRole('main')).toContainText('This site has no accounts');
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

  /**
   * The proxied shape: the browser's host arrives as `x-forwarded-host` and `host` carries
   * something else. A same-origin browser cannot produce it, so nothing else in this suite
   * covers it.
   *
   * Measured while writing the route: Next synthesises `x-forwarded-host` from `host` when
   * nothing upstream sent one, and passes a supplied one through untouched — so this request
   * genuinely overrides it rather than adding a header that was already there. The route
   * accepts a match against either, which is what makes it independent of whatever proxy is
   * in front; see `isSameOrigin` for why a header a caller can set is not a weakness in a
   * check whose whole subject is what a VICTIM'S BROWSER can be made to send.
   */
  test('a forwarded host the browser used is a same-origin request @core', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      headers: {
        origin: 'https://ab-ovo-web-dev.fly.dev',
        'x-forwarded-host': 'ab-ovo-web-dev.fly.dev',
        'content-type': 'application/json',
      },
      // Empty, so a configured deployment stops at "both fields are needed" and no attempt
      // is spent against anybody's account. Either answer means the origin check let it by.
      data: { email: '', password: '' },
      maxRedirects: 0,
    });

    expect(response.status(), 'the origin check refused a host the browser really used').not.toBe(
      403,
    );
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

    // The one a reader cannot fix by typing again, and must not be told to. It used to say
    // so in the words of a token's issuer and audience (issue #162); the page now says whose
    // fault it is and what it means, and `sign-in-problem.ts` keeps the mechanism.
    await page.goto('/login?error=token-rejected');
    await expect(page.getByRole('main')).toContainText('how this site is set up');
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
  /*
    WHERE THE READER WAS IS THE WAY BACK, AND IT IS NO LONGER PRINTED (issue #162).

    A frame's own *Sign in* link carries the frame, and the page used to print that address
    under "What happened", as something that had "asked for an account" — which a page the
    gate opens never did. The reader chose to sign in. So the address is a link now, under
    words a reader would use, and the assertion is on where it leads rather than on the path
    appearing somewhere in the text: that is what "carried" means to a reader, in both
    deployments.
  */
  test('a same-origin path is the way back to where the reader was @core', async ({ page }) => {
    await page.goto('/login?redirect=%2Fread%2Fmath-for-ai-engineers%2FP01%2Fen%2F7');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Back to where you were' }),
    ).toHaveAttribute('href', '/read/math-for-ai-engineers/P01/en/7');
  });

  test('an off-site destination is not echoed, and not offered @smoke', async ({ page }) => {
    await page.goto('/login?redirect=%2F%2Fevil.example');

    // <main>'s textContent, for the reason measured in the test above: the raw query string
    // reaches the flight payload on any server component that reads searchParams, so the
    // question is whether it reaches the PAGE.
    const rendered = await page.locator('main').textContent();
    expect(rendered).not.toContain('evil.example');
    // The page falls back to having no destination at all: no way back to one, and the
    // ordinary way out instead. It used to say "No destination was carried into this page",
    // which is true and is this file's vocabulary rather than a reader's (issue #162).
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Back to where you were' })).toHaveCount(0);
    // The programs, in the edition the page is in — English, as nothing here chose another.
    await expect(main.getByRole('link', { name: 'Back to the reader' })).toHaveAttribute(
      'href',
      '/?lang=en',
    );
  });
});

/**
 * The account pages in a reader's words — issue #162.
 *
 * Sign-in, its second step and registration told readers about "the identity service this
 * deployment is configured against", a token "the issuer or audience this app expects" did
 * not match, and an outcome that "carries a frame, a bundle version" and a verdict. Every one
 * of those sentences was true, and each was the repository describing itself to somebody who
 * came to read a book. The reasoning is in the comments beside the words now
 * (`sign-in-problem.ts`, `registration-problem.ts`, the pages), and the screens say what it
 * means for the reader.
 *
 * Checked on the pages' ordinary states and on the codes #162 rewrote, and in both
 * deployments: the one with no identity service is where "deployment" was said most. The
 * phrases are the ones the issue found — an operator's words — and `textContent` is the
 * scope, for the reason measured above: it is what a screen reader reads.
 */
test.describe('the account pages say what a reader needs to know', () => {
  test('and not how this deployment is configured @core @identity', async ({ page }) => {
    const pages = [
      '/login',
      '/login?redirect=%2Faccount',
      '/login?redirect=%2Fnope',
      '/login?error=token-rejected',
      '/login?error=unverifiable',
      '/login?error=not-configured',
      '/login/2fa',
      '/register',
      '/register?error=token-rejected',
      '/register?error=unverifiable',
      '/register?error=not-configured',
      '/register?notice=verify-email',
    ];
    const operatorWords = ['deployment', 'configured', 'issuer', 'audience', 'token', 'bundle', 'operator'];

    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const said = ((await page.locator('main').textContent()) ?? '').toLowerCase();
      for (const word of operatorWords) {
        expect(said, `${path} says "${word}" to a reader`).not.toContain(word);
      }
    }
  });
});
