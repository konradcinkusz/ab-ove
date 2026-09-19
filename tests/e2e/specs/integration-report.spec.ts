import { expect, test } from '@playwright/test';

import {
  SAMPLE_INTEGRATIONS,
  SAMPLE_SERVICE_INFO,
  serveServiceInfo,
} from './support/service-info.js';

/**
 * JOURNEY 3 — the integration report, which is P8 seen from a browser.
 *
 * P8 asks that a degraded deployment be LEGIBLE, not merely correct: a service can degrade
 * perfectly and still waste an afternoon if the only way to find out what degraded is to
 * read the configuration that was not set. AbOvo.Api answers /api/v1/info with one row per
 * optional integration and prints the same list as a startup banner; this panel is the
 * third rendering, and the only one a reader or an operator will actually look at.
 *
 * WHY THE PAYLOAD IS SERVED BY THE TEST. The suite's own CI context runs the web app with no
 * API behind it — deliberately, because the Phase 1 reader loop has nothing to say to a
 * backend yet. A test that needed a live API would therefore have to be skipped in the only
 * context that runs it, which is how a suite ends up asserting nothing. Fulfilling the route
 * puts a known answer in front of the browser and tests the half that is actually this
 * frontend's: that every state the API can report arrives on the page as itself.
 *
 * The live half is not abandoned — it is the last test in this file, declared as a skip with
 * a reason and an environment variable that turns it on, so the runner reports it as skipped
 * rather than as passed. E2E-ACCEPTANCE-TESTING.md §2: "301 passed, 146 skipped with reasons"
 * is the honest number; "447/447 passed, uniformly opaque" is not.
 */

test.describe('integration report', () => {
  test('renders one row per integration, each carrying the state the API reported @smoke', async ({
    page,
  }) => {
    await serveServiceInfo(page, SAMPLE_SERVICE_INFO);
    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toBeVisible();

    const rows = report.getByRole('listitem');
    await expect(rows).toHaveCount(SAMPLE_INTEGRATIONS.length);

    // The fixture is a module constant, so this cannot be a loop over an empty array — but
    // asserting it costs one line and removes the one shape of test that reports a pass
    // having executed no assertion at all.
    expect(SAMPLE_INTEGRATIONS.length).toBeGreaterThan(0);

    for (const integration of SAMPLE_INTEGRATIONS) {
      const row = rows.filter({ hasText: integration.name });

      // Exactly one row, which is also what catches a locator that has quietly started
      // matching two things. The audited estate's guard-then-bail pattern would have read an
      // always-empty match as "feature not present" and passed.
      await expect(row, `expected exactly one row for "${integration.name}"`).toHaveCount(1);

      await expect(row).toContainText(integration.name);
      await expect(row).toContainText(integration.state);
      await expect(row).toContainText(integration.detail);
    }

    // At least one of each state, and each rendered as itself. A panel that showed every row
    // as "live" would satisfy a weaker test and would be worse than no panel, because an
    // operator would believe it.
    const live = rows.filter({ hasText: 'live' });
    const degraded = rows.filter({ hasText: 'degraded' });
    await expect(live).toHaveCount(SAMPLE_INTEGRATIONS.filter((i) => i.state === 'live').length);
    await expect(degraded).toHaveCount(
      SAMPLE_INTEGRATIONS.filter((i) => i.state === 'degraded').length,
    );

    // A degraded integration is not an unreachable API, and the panel must not conflate
    // them. This is the assertion that separates this journey from journey 4.
    await expect(report).not.toContainText('no API');
  });

  test('names the service and version it read the report from @core', async ({ page }) => {
    await serveServiceInfo(page, SAMPLE_SERVICE_INFO);
    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });

    // Without these an operator cannot tell which deployment answered, which is most of what
    // the panel is for when two environments are open in two tabs.
    await expect(report).toContainText(
      new RegExp(`${SAMPLE_SERVICE_INFO.service}\\s+${SAMPLE_SERVICE_INFO.version}`),
    );

    // And it says what a degraded row means, so the reader does not read the panel as a
    // fault report. The service is meant to start and answer without any of them.
    await expect(report).toContainText('A degraded row is not a fault');
  });

  test('says so plainly when the API reports no optional integrations @core', async ({ page }) => {
    await serveServiceInfo(page, { ...SAMPLE_SERVICE_INFO, integrations: [] });
    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toContainText('The API answered and reports no optional integrations.');

    // An empty report is not an unreachable one, and the two must not render alike.
    await expect(report.getByRole('listitem')).toHaveCount(0);
    await expect(report).not.toContainText('no API');
  });

  test('refuses a payload it does not recognise instead of rendering it @core', async ({
    page,
  }) => {
    // The panel validates the shape before trusting it. This is the branch that decides
    // whether a backend returning something unexpected — a proxy error page, a half-migrated
    // contract, an HTML login redirect — becomes a broken page or a sentence.
    await page.route('**/api/proxy/api/v1/info', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ service: 'AbOvo.Api', unexpected: true }),
      }),
    );

    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toContainText('The API answered in a shape this page did not expect.');
    await expect(report.getByRole('listitem')).toHaveCount(0);

    // The rest of the page is untouched by it, which is the whole design: the panel is below
    // the fold of the argument and everything above it is true whether or not it found
    // anything.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('reads a real deployment and finds at least one live or degraded integration @core', async ({
    page,
  }) => {
    test.skip(
      !process.env.E2E_EXPECT_API,
      'Requires a deployment with AbOvo.Api reachable behind the BFF proxy. Set E2E_EXPECT_API=1 ' +
        'to run it — for example against https://ab-ovo-web-dev.fly.dev after a deploy. It is ' +
        'skipped rather than deleted because the CI context runs the web app with no API by ' +
        'design (.github/workflows/ci.yml, e2e job), and skipped rather than made conditional ' +
        'because a test that quietly passes when the backend is absent cannot tell that from ' +
        'a backend that broke.',
    );

    // A Fly machine may be scaled to zero and the proxy's ladder is sized to cover a cold
    // start, so this one assertion is given room the rest of the suite is not. The waiting is
    // still a web-first assertion that polls until it passes; the number is a ceiling, not a
    // sleep.
    test.setTimeout(120_000);

    await page.goto('/about');

    const report = page.getByRole('region', { name: 'Integration report' });
    await expect(report).toBeVisible();

    const rows = report.getByRole('listitem');
    await expect(
      rows,
      'the deployment reported no integrations — either the API is unreachable or P8 stopped ' +
        'being true',
    ).not.toHaveCount(0, { timeout: 90_000 });

    const texts = await rows.allInnerTexts();
    // Without this, the loop below would assert nothing on an empty list and report a pass.
    expect(texts.length).toBeGreaterThan(0);

    for (const text of texts) {
      // AbOvo.Api maps each integration's boolean to the literal "live" or "degraded" and to
      // nothing else. A third word on the page means the contract moved.
      expect(text, `row did not carry a recognised state:\n${text}`).toMatch(
        /\b(live|degraded)\b/,
      );
    }

    await expect(report).not.toContainText('no API');
  });
});
