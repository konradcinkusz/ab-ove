import { defineConfig, devices } from '@playwright/test';

/**
 * The ab-ovo end-to-end acceptance harness.
 *
 * TESTING-STRATEGY.md §5 fixes the harness defaults and §2/§3 fix the layers; the values
 * below are those, with two deliberate deviations recorded at the point they are made
 * rather than in a document nobody opens. Both are also in README.md §"Deliberate
 * deviations".
 */

const CI = !!process.env.CI;

/**
 * THE ONE SOURCE OF TRUTH FOR WHERE THE SUITE POINTS.
 *
 * E2E-ACCEPTANCE-TESTING.md §6: "There must be exactly one source of truth for the base URL
 * and ports, and it is the Aspire AppHost.cs orchestration." AppHost.cs maps the web app to
 * port 3000 (`.WithHttpEndpoint(port: 3000, env: "PORT")`), and the same 3000 appears in
 * flyio/web.fly.toml's internal_port and in web/app/Dockerfile's EXPOSE. The default below
 * is that number and no other.
 *
 * The audited estate's failure was a compiled-in fallback that had drifted to a port
 * matching no orchestrated app while the settings file developers were told to use had been
 * updated — "inconsistent defaults across a compiled fallback, a settings file and a setup
 * script are a sign nobody has run the suite in a while". This file is the compiled-in
 * fallback AND the settings file; there is no third place, and .github/workflows/ci.yml
 * exports E2E_BASE_URL rather than encoding a second default of its own.
 */
const DEFAULT_BASE_URL = 'http://localhost:3000';

const baseURL = process.env.E2E_BASE_URL?.trim() || DEFAULT_BASE_URL;

/**
 * Whether the suite is driving a server it is expected to start itself.
 *
 * The same specs run unchanged against a local build and against
 * https://ab-ovo-web-dev.fly.dev after a deploy — that is the point of taking the address
 * from an environment variable. What must NOT run unchanged is `webServer`: starting a local
 * Next server while the assertions go to Fly would test a process nobody is looking at, and
 * `reuseExistingServer` would quietly make it pass.
 */
const target = new URL(baseURL);
const targetIsLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname);

export default defineConfig({
  testDir: './specs',

  /**
   * Every spec in this suite is read-only: it navigates, it intercepts its own page's
   * requests, and it creates nothing on any server. Playwright gives each test its own
   * browser context, so parallelism is safe by construction rather than by convention —
   * see README.md §"Independence and cleanup", which records that decision explicitly
   * instead of assuming it (E2E-ACCEPTANCE-TESTING.md §5).
   */
  fullyParallel: true,

  /**
   * CI-only, per TESTING-STRATEGY.md §5.
   *
   * `workers` is spread in rather than written as `workers: CI ? 1 : undefined`, and so is
   * `webServer` at the foot of this file. tsconfig.json sets `exactOptionalPropertyTypes`,
   * under which an explicit `undefined` is not the same thing as an absent key and does not
   * typecheck. The spread is the form that says "omit this key", which is what is meant.
   */
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  ...(CI ? { workers: 1 } : {}),

  /**
   * The retry above is DIAGNOSTIC CAPTURE, not a licence to merge an intermittent test.
   * TESTING-STRATEGY.md §6 holds zero tolerance for flakiness and §5 prescribes
   * `retries: 2` paired with `trace: 'on-first-retry'`; the tension is deliberate and the
   * resolution is that a test which only passes on retry is fixed or deleted, never left.
   */
  timeout: 30_000,
  expect: {
    /**
     * Ten seconds, not Playwright's five. The one thing this suite waits on that is not
     * local rendering is the panel that fetches through the BFF proxy, and against a
     * deployed target that proxy may be walking its candidate ladder. Tests that need more
     * than this ask for it at the assertion, visibly — there is no global inflation to
     * cover one slow case.
     */
    timeout: 10_000,
  },

  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /**
     * Fail on an off-origin navigation rather than silently following one. The colophon on
     * the landing page promises that nothing is fetched from anywhere else
     * (FRONTEND-BFF.md §1), and specs/runtime-config.spec.ts asserts it; this makes the
     * harness itself honest about which origin it is talking to.
     */
    ignoreHTTPSErrors: false,
  },

  /**
   * DEVIATION 1 — one browser, not three.
   *
   * TESTING-STRATEGY.md §5's harness defaults list three browser projects, and §2 puts
   * cross-browser in the extended layer that runs nightly. This repository has no nightly
   * CI context: .github/workflows/ci.yml runs `test:smoke` on pull_request and `test:full`
   * on push, installs chromium and nothing else, and says so in its own comments. §9 is
   * decisive about the gap — "If a layer is aspirational, delete its config and track it as
   * an issue instead of committing a config for it" — so firefox and webkit projects are
   * absent rather than present-and-never-run. They arrive in the same change as the nightly
   * workflow that runs them.
   *
   * Layer membership is configuration, never a directory convention (§3): a spec belongs to
   * a layer because of the tag in its title, and the `grep` below is the only thing that
   * reads that tag.
   */
  projects: [
    {
      /**
       * Smoke — 5-10 minute budget, every ready PR, single browser.
       * The critical path: the landing page renders its argument, the runtime config route
       * answers, the integration report renders what the API reported, and the whole thing
       * survives having no API at all.
       */
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      grep: /@smoke/,
    },
    {
      /**
       * Core regression — 20-30 minute budget, merge to main.
       * The charter's full protected-flow set, which includes the smoke set rather than
       * sitting beside it: a core run that skipped the critical path would report on
       * everything except the part that matters most.
       */
      name: 'core',
      use: { ...devices['Desktop Chrome'] },
      grep: /@smoke|@core/,
    },
  ],

  /**
   * DEVIATION 2 — `webServer` is present only when the target is local.
   *
   * TESTING-STRATEGY.md §5 prescribes a `webServer` array with `reuseExistingServer: !CI`,
   * and that is exactly what is below for a localhost target. Against a deployed target
   * there is deliberately no entry: the server is already running, and starting a second
   * one locally would be a process the assertions never touch.
   *
   * `pnpm --dir ../../web start` runs `next start` against a PRODUCTION build — ci.yml
   * builds the app in the step before this suite runs, and a developer must too (see
   * README.md). `next dev` has different timing, different error overlays and different
   * bundle behaviour from the artifact that ships, and a suite that only ever sees the dev
   * server is testing a program nobody deploys. When no build exists, `next start` exits
   * with a message saying so and the whole run fails loudly, which is the correct outcome:
   * a suite that quietly tested a dev server instead is the failure this file exists to
   * prevent.
   *
   * ON THE WARNING `next start` PRINTS. The app sets `output: 'standalone'`, and `next start`
   * says on every launch that it "does not work with output: standalone. Use node
   * .next/standalone/server.js instead." Taking that advice here BREAKS THIS SUITE, and
   * quietly: the standalone bundle is a traced subset that does not include `.next/static`
   * or `public` — web/app/Dockerfile copies both in as separate COPY steps — so a standalone
   * server started without those steps serves HTML and 404s every stylesheet and script. The
   * page would render, the client component would never run, and the integration-report and
   * no-backend journeys would fail with a panel stuck on "Asking the API what it has…".
   * `next start` serves the same program from `.next` directly, assets included; measured on
   * this build, the document and every referenced chunk answer 200. The warning is about
   * packaging, not about behaviour, and it is the packaging the Dockerfile owns.
   */
  ...(targetIsLocal
    ? {
        webServer: [
          {
            command: 'pnpm --dir ../../web start',
            url: baseURL,
            reuseExistingServer: !CI,
            timeout: 120_000,
            stdout: 'pipe' as const,
            stderr: 'pipe' as const,
            env: { PORT: target.port || '3000' },
          },
        ],
      }
    : {}),
});
