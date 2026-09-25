import { expect, test } from '@playwright/test';

import { collectPageErrors, describePageErrors } from './support/page-errors.js';
import { serveNetworkFailure, serveProxyFailure } from './support/service-info.js';

import { served, track } from './support/bundle.ts';

/**
 * JOURNEY 4 — the app with no backend in reach of the browser.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS FILE USED TO ASSERT THE PRODUCT'S FIRST REQUIREMENT, AND HALF OF THAT REQUIREMENT IS
 * GONE. The reader loop was specified to need no account and no server — frames served with
 * the site, the lab running Python in the browser — so "no API answered" was a supported
 * configuration of the whole product. ADR-0060 kept the first half and reversed the second:
 * every frame and every reveal is now a live, gated call to `AbOvo.Api`, made server-side,
 * and with the API down a reader cannot read. ADR-0062 records why the suite no longer runs
 * a whole deployment with no API.
 *
 * WHAT IT STILL ASSERTS IS TRUE, AND IS WORTH ASSERTING. The failure here is injected in the
 * BROWSER, so it cuts off exactly what the browser reaches through the proxy — and the pages
 * driven below need none of it to render: the index reads the bundle compiled into the app
 * (`app/page.tsx` says why that is today's placement rather than a requirement), and `/about`'s
 * one live part is the integration panel, which must say which fault it was rather than
 * crash or spin. It asserts nothing about a frame, and must not be read as a claim that one
 * renders without the API.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * SINCE ADR-0036 THE INDEX IS DRIVEN FIRST. The landing page is the index of programs, so the
 * first test below drives the GRID with the API unreachable from the browser — the list of
 * programs and a link into one — where the old version of this test asserted the page that
 * described it. The prose and the integration panel moved to `/about` and are asserted there.
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

  THE FIRST PROGRAM RATHER THAN P01, since ADR-0051. This file's reader has no account, no
  API in reach of the browser and — the part that is new — no record either, so the program
  that is one click from the index is the first one of the track. Asserting P01 would have
  needed a seeded record, and a seeded record is a thing this suite must never need: what it
  is about is a browser that can reach nothing behind this origin. Read by POSITION and not
  by name, because which program is first is the manifest's answer and not this file's.
*/
const FIRST = served.units[0]!;

test.describe('no backend', () => {
  test('reaches the programs when the API cannot be reached at all @smoke', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await serveNetworkFailure(page);

    const response = await page.goto('/');
    expect(response?.status(), 'the page itself must still answer 200').toBe(200);

    /*
      THE PROPERTY, NOT A DESCRIPTION OF IT. With the API unreachable from the browser, the
      index renders and a program is one click away — asserted as the href into the reading
      route, because a grid that rendered tiles linking nowhere would pass every weaker form
      of this test. The frame behind that link is the API's to serve (ADR-0060).

      Both editions, one at a time: the index shows the reader's own (ADR-0052), and neither
      edition may be reachable only when a service this deployment does not have is up. The
      language control is the whole path between them and it is a plain link, so it works
      here for the same reason the tiles do.
    */
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');
    for (const language of ['en', 'pl']) {
      await page.goto(`/?lang=${language}`);
      await expect(
        page.getByRole('link', { name: FIRST.titles[language]! }),
        `the ${language} link into ${FIRST.id} is not on the index`,
      ).toHaveAttribute('href', `/read/${track}/${FIRST.id}/${language}`);
    }
    await page.goto('/');

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
    //    And it says what the fault costs a reader: since ADR-0060, reading (#142).
    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toContainText('no API');
    await expect(report).toContainText('The API could not be reached from the browser.');
    await expect(report).toContainText('Reading is unavailable while the API is down');
    await expect(report).not.toContainText('Asking the API what it has');

    // 3. And it did not throw on the way. A client component that throws during render
    //    leaves the server-rendered HTML on screen, so assertions 1 and 2 can both pass
    //    against a page that crashed.
    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('tells the reader that reading is unavailable while the backend is missing @smoke', async ({
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
     * THE SENTENCE THAT TELLS A READER WHAT THIS COSTS THEM, and it used to say the reverse.
     *
     * It asserted that frames rendered from content shipped with the site and that the lab
     * ran in the browser, so "no API" was a supported state. ADR-0060 made every frame and
     * every reveal a live call to `AbOvo.Api`, and the panel went on saying it — shown
     * precisely when no API answered, which is when every frame was failing (#142). A red
     * badge with no explanation reads as a broken site; a badge with a false explanation
     * sends the reader to a frame that will not open. So the panel says reading is
     * unavailable, and keeps ADR-0060's other half: none of it needs an account.
     */
    await expect(report).toContainText(
      'Reading is unavailable while the API is down: every frame and every reveal is fetched from it as you read.',
    );
    await expect(report).toContainText('reading needs no account');

    // And the old claim is gone, rather than surviving beside the new one — a panel that
    // said both would pass the two assertions above.
    await expect(report).not.toContainText('shipped with the site');

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
      page.getByRole('link', { name: FIRST.titles['en']! }),
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
