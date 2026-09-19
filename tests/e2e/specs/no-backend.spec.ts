import { expect, test } from '@playwright/test';

import { collectPageErrors, describePageErrors } from './support/page-errors.js';
import { serveNetworkFailure, serveProxyFailure } from './support/service-info.js';

/**
 * JOURNEY 4 — the app with no backend.
 *
 * This is not an error-handling nicety. ab-ovo's first product requirement is that the
 * reader loop works with NO account and NO backend: frames are served with the site and the
 * lab pane runs Python in the browser under Pyodide, so "no API answered" is a SUPPORTED
 * CONFIGURATION of this product rather than an outage. The landing page says so in prose,
 * and a claim asserted nowhere lasts until the first component that fetches during render.
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

test.describe('no backend', () => {
  test('renders the whole landing page when the API cannot be reached at all @smoke', async ({
    page,
  }) => {
    const pageErrors = collectPageErrors(page);
    await serveNetworkFailure(page);

    /*
      TWO PAGES, BECAUSE THE PRODUCT'S FIRST SCREEN AND ITS ARGUMENT ARE NO LONGER ONE.

      `/` is the index: the anti-goal and 47 programs, served from content compiled into
      the app. `/about` carries the loop, the phases and the panel. Both have to survive a
      dead API and the failure would look different on each — the index would lose its
      list, the argument page would lose its panel — so both are asserted here rather than
      one standing in for the other.
    */
    const index = await page.goto('/');
    expect(index?.status(), 'the index must still answer 200').toBe(200);

    // 1a. The index is intact: the anti-goal, and the book itself.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');
    await expect(
      page.getByRole('region', { name: 'What this instrument is for' }),
    ).toContainText('The instrument measures the book, never the reader.');
    await expect(
      page.getByRole('link', { name: 'Numbers, powers and roots' }),
      'the index lost the programs, which are compiled in and need no API at all',
    ).toBeVisible();

    const response = await page.goto('/about');
    expect(response?.status(), 'the page itself must still answer 200').toBe(200);

    // 1b. The argument is intact. Not "the body is non-empty" — element by element,
    //     exactly as journey 1 asserts it with a backend present.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A book you work, not a book you read.',
    );
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

  test('keeps the public pages public with no session and no identity service @core', async ({
    page,
  }) => {
    // The middleware is private-by-default and opts routes out one at a time, so each of
    // these being public is a list entry somebody wrote rather than an absent gate. A
    // reader with no cookie must reach all three — if one falls out of that list the
    // symptom is a redirect to a sign-in page that a deployment without an identity
    // service cannot even serve, and the product's first requirement is gone.
    //
    // THREE PATHS RATHER THAN ONE, because `/about` is a new entry in that list and a new
    // entry is exactly the kind that gets forgotten. `/read` was already there; it is
    // asserted here too so this test names the whole public surface a reader meets before
    // opening a frame.
    await serveNetworkFailure(page);

    for (const path of ['/', '/about', '/read']) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} did not answer 200`).toBe(200);
      expect(new URL(page.url()).pathname, `${path} redirected to sign-in`).toBe(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});
