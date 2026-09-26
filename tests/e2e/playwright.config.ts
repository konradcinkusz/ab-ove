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

/**
 * THE SECOND DEPLOYMENT, AND WHY THERE HAS TO BE ONE (issue #29).
 *
 * Until now every spec ran against a web app with NO identity service, because that is what
 * this job can start. The signed-in half of the product — a form post, two cookies, session
 * rehydration, the middleware letting a gated page through — was measured by hand once and
 * recorded in docs/adr/0018. Evidence about one afternoon is not a gate.
 *
 * So the suite starts a SECOND web app, configured against the fixture in
 * `fixtures/authservice-stub.mts`, and the specs that need an account run against that one.
 * The first app stays exactly as it was, and that is not tidiness: `sign-in.spec.ts`'s
 * opening block asserts that the PAGE and the ROUTE agree about which deployment this is,
 * and it has two branches. Configure the only server and the unconfigured branch stops being
 * exercised anywhere — which is the real cost issue #29 names, and running both deployments
 * side by side is what pays it.
 *
 * Both ports are DERIVED from the one number this file already treats as the single source
 * of truth, so a developer who moves the base URL moves all three together and a second
 * constant cannot drift from the first.
 */
const webPort = Number(target.port || '3000');
const identityPort = webPort + 100;
const stubPort = webPort + 200;
const identityBaseUrl = `http://127.0.0.1:${identityPort}`;
const stubBaseUrl = `http://127.0.0.1:${stubPort}`;

/**
 * THE API, AND WHY BOTH DEPLOYMENTS ARE NOW TOLD ABOUT IT (issue #170, ADR-0060).
 *
 * `.github/workflows/ci.yml`'s e2e job runs a Postgres service container and a real
 * `AbOvo.Api` against it, ingests the compiled book bundle into it, and publishes the
 * API's address as `E2E_API_BASE_URL`. It is read here rather than passed straight through
 * as `AB_OVO_API_URL` because Playwright merges `webServer.env` over `process.env`, so a
 * variable read at THIS scope would reach every process this config itself starts (this
 * file's own dev server, if anyone ran it directly) and not just the two web apps below —
 * each `webServer` entry states its own env explicitly instead.
 *
 * ADR-0060 is why it goes to BOTH entries now: reading needs no account, so an identity
 * service, and what registering against one needs, is what the two deployments differ on
 * (see the big comment over `identityBaseUrl` above, and the second entry's env below).
 * Before that ADR the first deployment was deliberately kept
 * "backend-less" to exercise the product's old "no backend at all" requirement (ADR-0004,
 * ADR-0035) — that state is still exercised, by `no-backend.spec.ts`, but as a BROWSER-side
 * failure injected with route interception rather than as a real absence of `AB_OVO_API_URL`
 * in one deployment's own environment, since a live API is no longer optional for either
 * one to have.
 *
 * Absent when the variable is: a developer running the suite on a laptop with no API still
 * gets a build — `/` and `/about` degrade the way `no-backend.spec.ts` documents, and a
 * reading page throws to `app/error.tsx`'s boundary rather than failing to render at all.
 */
const apiBaseUrl = process.env.E2E_API_BASE_URL?.trim();

/**
 * THE FIRST DEPLOYMENT REACHES THE API THROUGH A FIXTURE THAT CAN CUT ONE READER OFF IT
 * (issue #139) — `fixtures/api-fault.mts`, whose header carries the reasoning.
 *
 * A frame whose server-side call to `AbOvo.Api` fails lands on `app/error.tsx`, and nothing
 * a browser can intercept reaches that call. The fixture forwards every request unchanged,
 * except for a reader a spec has cut, whose requests it drops, or slowed, whose requests it
 * holds first — so `error-page.spec.ts` can take the API away from its own reader, and
 * `frame-loading.spec.ts` can make it late for its own (#160), while every other spec reads
 * through the same process as if it were not there.
 *
 * ONLY THE FIRST DEPLOYMENT, because the reader it cuts or slows is the anonymous one
 * (ADR-0061's cookie, sent as a header only when there is no bearer) and that is who reads on
 * `:3000`. `:3100` keeps its direct address: nothing there needs either, and a hop nothing
 * needs is a hop that can only add a way to fail.
 *
 * Its port is derived from the web app's like the other two, and it runs only when there is
 * an API to stand in front of. Without one, `error-page.spec.ts` and `frame-loading.spec.ts`
 * are skipped with the reason rather than made conditional.
 */
const faultPort = webPort + 300;
const faultBaseUrl = `http://127.0.0.1:${faultPort}`;
const faultUpstream = targetIsLocal ? apiBaseUrl : undefined;
if (faultUpstream) process.env.AB_OVO_FAULT_BASE_URL = faultBaseUrl;

/**
 * The fixture's address, published to the specs through the environment.
 *
 * A SIDE EFFECT IN A CONFIG FILE, deliberately and with the alternatives rejected. One spec
 * has to talk to the fixture DIRECTLY — see `sign-in-identity.spec.ts`'s test that the
 * fixture still emits a single role as a bare string, which nothing else can see — and a
 * spec cannot import this file without importing its `webServer` commands too.
 *
 * The alternative was to have the spec derive the port from its own `baseURL`, which works
 * and encodes the `+100`/`+200` relationship in a second place. This keeps the arithmetic
 * here, where the comment above it explains why the numbers are what they are, and hands
 * the spec an address rather than a rule for computing one.
 */
process.env.AB_OVO_STUB_BASE_URL = stubBaseUrl;

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
       * Screenshots — the pictures docs/SCREENSHOTS.md shows, captured from a real build.
       *
       * NOT A TEST LAYER, AND DELIBERATELY NOT IN ANY OF THE THREE ABOVE. It asserts that
       * each screen is the screen it claims to be and then photographs it; it compares
       * against no stored image, so a redesign does not turn it red, and it writes into the
       * working tree, which the other projects never do. Folding it into `core` would mean
       * every merge to main rewrote files under docs/ — a test suite with a side effect,
       * which is the sort of thing that surprises somebody at the worst moment.
       *
       * It is not aspirational config either (TESTING-STRATEGY.md §9): the docs workflow
       * runs it. If that workflow stops running it, this project is deleted rather than
       * left here.
       */
      name: 'screenshots',
      use: { ...devices['Desktop Chrome'] },
      grep: /@screenshots/,
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
    /**
     * Identity — the specs that need an account, against the second deployment above.
     *
     * PRESENT ONLY FOR A LOCAL TARGET, and absent rather than present-and-failing for any
     * other. Its server is one this config starts; against a deployed target there is
     * nothing for it to point at, and a project that existed there would fail on every run
     * for a reason that is not a defect. TESTING-STRATEGY.md §9's rule about aspirational
     * config, applied to a project rather than to a layer.
     *
     * The grep is `@identity` and not `@smoke|@identity`: every other smoke spec is about
     * the reading surface, which does not change when an identity service exists, and
     * running the whole layer twice would double the budget to assert the same things. The
     * one spec that IS about the difference carries both tags, so it runs in both projects
     * and each run exercises the branch that environment is in.
     */
    ...(targetIsLocal
      ? [
          {
            name: 'identity',
            use: { ...devices['Desktop Chrome'], baseURL: identityBaseUrl },
            grep: /@identity/,
          },
        ]
      : []),
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
            // AB_OVO_API_URL, when the job gave one — see `apiBaseUrl` above — and it is
            // the fault fixture's address, which forwards to that API (see `faultBaseUrl`).
            // This deployment still gets no AB_OVO_AUTH_URL, which is the property
            // no-backend.spec.ts's identity-gate tests actually rest on.
            env: { PORT: target.port || '3000', ...(faultUpstream ? { AB_OVO_API_URL: faultBaseUrl } : {}) },
          },
          /**
           * The fault fixture in front of the API (issue #139 — see `faultBaseUrl`).
           *
           * `reuseExistingServer` as the web app has it, and for the web app's reason: it holds
           * no key, and the only state it keeps is keyed by reader ids nobody else holds, so a
           * fixture an earlier local run left forwarding to the same API is indistinguishable
           * from a new one — unless it predates a control a spec now sends, which is why a
           * delay is echoed back and `frame-loading.spec.ts` reads the echo (#160).
           */
          ...(faultUpstream
            ? [
                {
                  command: 'node --experimental-strip-types fixtures/api-fault.mts',
                  url: `${faultBaseUrl}/__fault/health`,
                  reuseExistingServer: !CI,
                  timeout: 30_000,
                  stdout: 'pipe' as const,
                  stderr: 'pipe' as const,
                  env: { AB_OVO_FAULT_PORT: String(faultPort), AB_OVO_FAULT_UPSTREAM: faultUpstream },
                },
              ]
            : []),
          /**
           * The identity fixture, and the second web app pointed at it (issue #29).
           *
           * ORDER IS NOT A DEPENDENCY. Playwright starts every entry and waits for each
           * `url` to answer, so the fixture being first is legibility rather than
           * sequencing — and it does not need to be a dependency, because the web app
           * reaches authservice lazily, per request, rather than at boot.
           *
           * The fixture answers `/health` because Playwright needs SOMETHING to poll, and
           * that is the path authservice itself serves for liveness. Polling
           * `/.well-known/jwks.json` would have worked too and would have been a worse
           * choice: it is the endpoint under test.
           *
           * NO `reuseExistingServer` ON THE FIXTURE, even locally. A stale fixture from an
           * earlier run holds a DIFFERENT signing key, so every token the second web app
           * minted against the old one would fail verification against the new JWKS — and
           * the failure would read as "the session did not rehydrate", which is the exact
           * defect this project exists to catch. The web app beside it may be reused
           * locally, on the existing reasoning, because it holds no key.
           */
          {
            command: 'node --experimental-strip-types fixtures/authservice-stub.mts',
            url: `${stubBaseUrl}/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            stdout: 'pipe' as const,
            stderr: 'pipe' as const,
            env: { AB_OVO_STUB_PORT: String(stubPort) },
          },
          {
            command: 'pnpm --dir ../../web start',
            url: `${identityBaseUrl}/healthz`,
            reuseExistingServer: false,
            timeout: 120_000,
            stdout: 'pipe' as const,
            stderr: 'pipe' as const,
            /**
             * `AB_OVO_AUTH_URL` is rung one of the candidate ladder, it is what
             * `backendConfigured('authservice')` answers on, and `token.ts` builds the
             * JWKS address from the same rung. The issuer and the audience are left
             * unset, because the code's own defaults — `AbOvo` for both — are what the
             * fixture mints, and restating them here would be two places for one string.
             *
             * `AB_OVO_API_URL` is the same rung for the other backend. Both deployments
             * get it now (ADR-0060 — see `apiBaseUrl` above); this one also gets
             * `AB_OVO_AUTH_URL` and, because registration only exists where there is an
             * identity service, `AB_OVO_LEGAL_URL`. Neither is given to the deployment
             * above (ADR-0062, as amended).
             *
             * `AB_OVO_LEGAL_URL` is where the deployment publishes the Terms and the
             * Privacy Policy its registration asks a reader to accept — the same fixture
             * process, under a path that is labelled there as not authservice's (#141,
             * ADR-0049). Without it `/register` withdraws its form, correctly, and
             * `registration.spec.ts` would be testing that instead.
             */
            env: {
              PORT: String(identityPort),
              AB_OVO_AUTH_URL: stubBaseUrl,
              AB_OVO_LEGAL_URL: `${stubBaseUrl}/legal`,
              ...(apiBaseUrl ? { AB_OVO_API_URL: apiBaseUrl } : {}),
            },
          },
        ],
      }
    : {}),
});
