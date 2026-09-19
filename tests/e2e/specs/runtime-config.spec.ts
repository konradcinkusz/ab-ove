import { expect, test } from '@playwright/test';

import { SAMPLE_SERVICE_INFO, serveServiceInfo } from './support/service-info.js';

/**
 * JOURNEY 2 — GET /api/config answers with addresses resolved at request time.
 *
 * THE DEFECT THIS GUARDS. The easy way to give a browser an address in Next.js is
 * `NEXT_PUBLIC_*`, which the compiler substitutes into the bundle. An address put there is
 * frozen into the image, so one image per environment follows, build-once-deploy-many is
 * gone, and the first symptom is a staging frontend calling production APIs. The config
 * route exists to remove that option, and these tests exist so that removing it stays
 * removed.
 *
 * HOW A TEST CAN TELL THE TWO APART. It cannot read the bundle and prove a negative, and a
 * suite that tried would be grepping minified chunks for strings it cannot predict — slow,
 * and flaky the first time a legitimate URL appears in a comment. What it can do is assert
 * the three properties that are all false under the compiled-in alternative and all true
 * under this one:
 *
 *   1. the browser ASKS for the configuration on every page load (it disappears the moment
 *      the value is compiled in);
 *   2. what it is handed as the API base is a path on this app's own origin, never a
 *      backend address (the compiled-in alternative hands over a real one);
 *   3. nothing the page loads leaves this origin (the compiled-in alternative is what makes
 *      a browser call a backend directly, and brings CORS with it).
 *
 * Together those are the regression net. Each is asserted below, unconditionally.
 */

test.describe('runtime configuration', () => {
  test('GET /api/config returns the client-safe runtime shape @smoke', async ({ request }) => {
    const response = await request.get('/api/config', {
      headers: { accept: 'application/json' },
    });

    expect(response.status(), 'the config route must answer 200').toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = (await response.json()) as Record<string, unknown>;

    /**
     * The exact key set, not a subset.
     *
     * This response is delivered to a browser, so the test for adding a field is not "is it
     * useful" but "would I put it in the page source". An exact key set is what makes a
     * fifth field a decision somebody has to come here and make, rather than something that
     * arrives with a feature and ships to every reader.
     */
    expect(Object.keys(body).sort()).toEqual([
      'accountsAvailable',
      'apiBaseUrl',
      'authBaseUrl',
      'environment',
    ]);

    // Property 2. The one base URL the client has is origin-relative by construction. Handing
    // the browser https://ab-ovo-api-dev.fly.dev instead would reintroduce CORS,
    // per-environment client builds and a token the client must hold, all three at once.
    expect(body['apiBaseUrl']).toBe('/api/proxy');
    expect(String(body['apiBaseUrl'])).toMatch(/^\//);
    expect(
      String(body['apiBaseUrl']),
      'the API base handed to the browser must not be an absolute backend address',
    ).not.toMatch(/^https?:\/\//i);

    expect(typeof body['environment']).toBe('string');
    expect(String(body['environment']).length).toBeGreaterThan(0);
    // 'undefined' and 'null' as strings are the tell of an unset variable interpolated
    // rather than defaulted. The route defaults to the literal 'unknown', which is a
    // deliberate answer and passes here.
    expect(['undefined', 'null']).not.toContain(String(body['environment']));

    expect(typeof body['accountsAvailable']).toBe('boolean');

    const authBaseUrl = body['authBaseUrl'];
    expect(authBaseUrl === null || typeof authBaseUrl === 'string').toBe(true);

    /**
     * The coupling invariant.
     *
     * A deployment with no identity service is a supported state of this product, not a
     * broken one — the reader loop needs no account. What must never happen is the UI
     * offering a sign-in that 503s, and the two fields going out of step is how that
     * happens. They are computed from one value in the route; this asserts they still are.
     */
    expect(
      body['accountsAvailable'],
      'accountsAvailable must agree with whether an auth address was resolved',
    ).toBe(authBaseUrl !== null);

    if (typeof authBaseUrl === 'string') {
      // The one address that genuinely crosses to the client, because signing in is a
      // browser NAVIGATION and a navigation cannot be proxied without becoming a different
      // site. It has to be absolute and browser-reachable to be worth anything.
      expect(authBaseUrl).toMatch(/^https?:\/\//i);
      expect(() => new URL(authBaseUrl), 'authBaseUrl must parse as a URL').not.toThrow();
      // A private-network address is not an answer to "where do I send the browser".
      expect(new URL(authBaseUrl).host).not.toMatch(/\.internal(:\d+)?$/i);
    }
  });

  test('GET /api/config leaks no secret-shaped field @smoke', async ({ request }) => {
    const response = await request.get('/api/config');
    expect(response.status()).toBe(200);

    const raw = await response.text();
    const body = (await response.json()) as Record<string, unknown>;

    const keys = Object.keys(body);
    expect(keys.length, 'the config payload must not be empty').toBeGreaterThan(0);

    // The loop is over a set proved non-empty on the line above. A for-loop over an array
    // that could be empty asserts nothing and reports a pass, which is the silent-placeholder
    // shape wearing a loop.
    for (const key of keys) {
      expect(key, `config key "${key}" is secret-shaped`).not.toMatch(
        /secret|password|credential|private|connectionstring/i,
      );
    }

    // The signing key is a PKCS#8 PEM and the connection strings carry a password. Neither
    // has any business in a document a browser downloads, and both have a shape that is
    // cheap to recognise.
    expect(raw).not.toContain('BEGIN PRIVATE KEY');
    expect(raw).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(raw).not.toMatch(/Password=/i);
  });

  test('the browser asks for its configuration on every page load @smoke', async ({ page }) => {
    // Property 1, and the sharpest of the three. If the addresses were compiled into the
    // bundle there would be nothing to ask for and this request would never be made, so the
    // test fails the moment somebody reintroduces NEXT_PUBLIC_*.
    //
    // The wait is armed BEFORE the navigation. Arming it after is a race the fast case
    // loses, and the fix for that race is never a sleep.
    const configRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/config',
    );

    /*
      `/about`, and the choice of page is part of the assertion since ADR-0036.

      `<IntegrationReport />` is the only component in this app that reads the runtime
      config, and it moved to `/about` with the rest of the argument. The landing page
      therefore makes NO request of its own at all any more — which is a better first screen
      and a worse place to assert this property from, because a test pointed at `/` would go
      green on a page that had stopped asking rather than on one whose addresses were
      compiled in. Pointed here it still fails the moment somebody reintroduces
      NEXT_PUBLIC_*.
    */
    await page.goto('/about');

    const request = await configRequest;
    expect(request.method()).toBe('GET');

    const response = await request.response();
    expect(response?.status(), 'the page must be able to read its own configuration').toBe(200);

    /**
     * And it must be served with caching that lets an operator's `fly secrets set` become
     * visible. The values are asserted as properties rather than as an exact header string:
     * `private` so the environment cannot land in a shared cache, a short max-age so a
     * change settles inside a deploy, and stale-while-revalidate so the read stays off the
     * critical path. Tuning 30 to 60 is somebody's call; turning it into a year is the
     * defect.
     */
    const cacheControl = response?.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('stale-while-revalidate');

    const maxAge = /max-age=(\d+)/.exec(cacheControl)?.[1];
    expect(maxAge, 'the config response must carry a max-age').toBeDefined();
    expect(Number(maxAge)).toBeLessThanOrEqual(300);
  });

  test('the browser talks to this origin and to nothing else @core', async ({ page, baseURL }) => {
    expect(baseURL, 'the suite must be pointed at a base URL').toBeTruthy();
    const origin = new URL(String(baseURL)).origin;

    const offOrigin: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      // data: and blob: are the page's own bytes under another scheme; only a real network
      // hop to another host is the thing being ruled out.
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (url.origin !== origin) offOrigin.push(request.url());
    });

    // A known answer for the one live fetch on the page, so the client path runs to
    // completion deterministically and the request list is the whole list rather than
    // whatever had happened by the time the assertion ran.
    await serveServiceInfo(page, SAMPLE_SERVICE_INFO);
    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report.getByRole('listitem')).toHaveCount(
      SAMPLE_SERVICE_INFO.integrations.length,
    );

    /**
     * Property 3, and this page's own colophon as an assertion: "No font, stylesheet,
     * script or icon is fetched from anywhere else, and the browser never talks to a backend
     * directly." A compiled-in backend address is what breaks this, and so is a
     * `next/font/google` import somebody adds because it reads well.
     */
    expect(offOrigin, `the page fetched from another origin:\n${offOrigin.join('\n')}`).toEqual([]);
  });
});
