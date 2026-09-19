import { expect, test } from '@playwright/test';

import { collectPageErrors, describePageErrors } from './support/page-errors.js';
import { serveNetworkFailure, serveProxyFailure } from './support/service-info.js';

import { track, unitNamed } from './support/bundle.ts';

/**
 * JOURNEY 4 — the app with no backend.
 *
 * This is not an error-handling nicety. ab-ovo's first product requirement is that the
 * reader loop works with NO account and NO backend: frames are served with the site and the
 * lab pane runs Python in the browser under Pyodide, so "no API answered" is a SUPPORTED
 * CONFIGURATION of this product rather than an outage. `/about` says so in prose, and a
 * claim asserted nowhere lasts until the first component that fetches during render.
 *
 * SINCE ADR-0036 THE PREMISE IS ASSERTED WHERE IT IS ACTUALLY SPENT. The landing page is now
 * the index of programs, so the first test below drives the GRID with the API unreachable —
 * a reader with no backend reaching the list of programs and a link into one is the
 * requirement itself, where the old version of this test asserted the page that described
 * it. The prose and the integration panel moved to `/about` and are asserted there.
 *
 * The failure is injected in the BROWSER, with route interception, for two reasons. It is
 * deterministic — no waiting on a real backend to be down, and no 45-second ladder walk —
 * and it reproduces the reader's experience rather than the server's: a dead network, a
 * blocked request, a deployment with nothing behind it, all arriving as the same thing.
 *
 * Each test asserts three separate properties, because any one of them alone would be
 * satisfied by a broken page: the product's own content is fully there, the panel says
 * which fault it was, and the page threw nothing on the way.
 */

/*
  Titles read from the served bundle rather than typed. They WERE typed, as the
  fixture's `How a computer stores a number`, and the day the application started
  serving the real book this file was asserting against a link that does not exist.
  A literal in a spec has no source, so nothing notices when the content moves —
  see specs/support/bundle.ts.
*/
const P01 = unitNamed('P01');
const F01 = unitNamed('F01');

test.describe('no backend', () => {
  test('reaches the programs when the API cannot be reached at all @smoke', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await serveNetworkFailure(page);

    const response = await page.goto('/');
    expect(response?.status(), 'the page itself must still answer 200').toBe(200);

    /*
      THE REQUIREMENT, NOT A DESCRIPTION OF IT. With no backend at all, the index renders and
      a program is one click away — asserted as the href into the reading route, because a
      grid that rendered tiles linking nowhere would pass every weaker form of this test.

      Both editions, because the index that picks neither is the one a reader arrives at, and
      neither of those two links may depend on a service that is not there (ADR-0015).
    */
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');
    for (const language of ['en', 'pl']) {
      await expect(
        page.getByRole('link', { name: P01.titles[language]! }),
        `the ${language} link into P01 is not on the index`,
      ).toHaveAttribute('href', `/read/${track}/P01/${language}`);
    }

    // And the way to the product's argument is still there, so a reader who wants to know
    // what this is before working a frame is not stranded by a missing service either.
    await expect(page.getByRole('link', { name: 'About ab-ovo' })).toBeVisible();

    // It did not throw on the way. A client component that throws during render leaves the
    // server-rendered HTML on screen, so every assertion above can pass on a crashed page.
    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('renders the whole of the argument when the API cannot be reached at all @smoke', async ({
    page,
  }) => {
    const pageErrors = collectPageErrors(page);
    await serveNetworkFailure(page);

    const response = await page.goto('/about');
    expect(response?.status(), 'the page itself must still answer 200').toBe(200);

    // 1. The product is intact. Not "the body is non-empty" — the argument the page is for,
    //    element by element, exactly as journey 1 asserts it with a backend present.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A book you work, not a book you read.',
    );
    await expect(
      page.getByRole('region', { name: 'What this instrument is for' }),
    ).toContainText('The instrument measures the book, never the reader.');
    await expect(
      page.getByRole('list').filter({ hasText: 'Read a frame.' }).getByRole('listitem'),
    ).toHaveCount(4);
    await expect(
      page.getByRole('heading', { name: 'What it needs from you', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('list').filter({ hasText: 'Phase 1' }).getByRole('listitem'),
    ).toHaveCount(4);

    // 2. The panel is legible about it rather than silent or stuck. A spinner that never
    //    resolves is the common failure here and it reads as a slow page, not a broken one.
    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toContainText('no API');
    await expect(report).toContainText('The API could not be reached from the browser.');
    await expect(report).not.toContainText('Asking the API what it has');

    // 3. And it did not throw on the way. A client component that throws during render
    //    leaves the server-rendered HTML on screen, so assertions 1 and 2 can both pass
    //    against a page that crashed.
    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('tells the reader the loop does not need the backend that is missing @smoke', async ({
    page,
  }) => {
    // 503 is the proxy's own answer when every rung of its candidate ladder failed — the
    // shape of a deployment running with no API at all, which is exactly what CI runs and
    // what a reader on a self-hosted copy may run forever.
    await serveProxyFailure(page, 503);
    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toContainText('no API');
    await expect(report).toContainText(
      'No backend answered. This deployment is running without an API.',
    );

    /**
     * The sentence that makes this a supported state rather than an apology. If this text
     * ever goes, the panel becomes an error message on a product whose whole premise is that
     * this is not an error — and the reader who sees a red badge with no explanation
     * reasonably concludes the site is broken and leaves.
     */
    await expect(report).toContainText(
      'frames render from content shipped with the site and the lab pane runs Python in your browser',
    );
    await expect(report).toContainText(
      'An account and a backend buy you progress that follows you between machines',
    );

    // No row is invented to fill the space. An empty list here and a degraded list in
    // journey 3 are different answers and must stay different.
    await expect(report.getByRole('listitem')).toHaveCount(0);
  });

  test('distinguishes a slow backend from an absent one @core', async ({ page }) => {
    // 504 is the proxy's answer when a rung was reached and did not finish inside the
    // timeout. It is a different fault from 503 and the product says a different thing about
    // it, which matters to whoever is holding the pager: one means nothing is deployed, the
    // other means something is there and cold.
    await serveProxyFailure(page, 504);
    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toContainText('The API did not answer in time. It may be starting from cold.');

    // The distinction is only worth having if the two do not collapse into one message.
    await expect(report).not.toContainText('No backend answered.');
  });

  test('reports an unexpected status without pretending it succeeded @core', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await page.route('**/api/proxy/api/v1/info', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    // Neither of the two known faults, so the panel states the status rather than guessing.
    await expect(report).toContainText('The API answered 500.');
    await expect(report).toContainText('no API');
    await expect(report.getByRole('listitem')).toHaveCount(0);

    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('keeps the landing page public when there is no session and no identity service @core', async ({
    page,
  }) => {
    // The middleware is private-by-default and opts routes out one at a time, so the landing
    // page being public is a list entry somebody wrote rather than an absent gate. A reader
    // with no cookie must reach it — if '/' ever falls out of that list the symptom is a
    // redirect to a sign-in page that a deployment without an identity service cannot even
    // serve, and the product's first requirement is gone.
    await serveNetworkFailure(page);

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname, 'the landing page must not redirect to sign-in').toBe('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');
    await expect(
      page.getByRole('link', { name: F01.titles['en']! }),
      'the index rendered its heading and lost the programs — the list is compiled in and needs no API',
    ).toBeVisible();
  });

  test('keeps the about page public on the same terms @core', async ({ page }) => {
    // Same gate, second entry. ADR-0036 moved the anti-goal to a page of its own, and a
    // commitment about what this system measures that a reader must sign in to read would be
    // worth very little — so `/about` is in the middleware's public list beside `/`, and this
    // is the assertion that says so rather than the list saying it to itself.
    await serveNetworkFailure(page);

    const response = await page.goto('/about');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname, 'the about page must not redirect to sign-in').toBe(
      '/about',
    );

    await expect(page.getByRole('region', { name: 'What this instrument is for' })).toBeVisible();
  });
});
