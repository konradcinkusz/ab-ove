# ab-ovo end-to-end acceptance suite

Playwright, TypeScript, one suite, one frontend. It drives `web/app` — the only frontend
this repository has — over HTTP, from a browser, against either a local production build or
a deployed URL.

Written to `E2E-ACCEPTANCE-TESTING.md` and `TESTING-STRATEGY.md`. Those were extracted from
an audit of a 447-test suite in which roughly 45% of the tests were placeholders or guarded
so that they could never assert anything, and which reported green for five months while
testing nothing. Everything below that reads like pedantry is a line item from that audit.

---

## The one rule

**Every test here executes at least one assertion against real application state,
unconditionally, on every run.** There is no `if (count === 0) return`, no
`try { expect(...) } catch {}`, and no commented-out body anywhere in `specs/`. A scenario
that cannot run yet is declared with `test.skip(condition, reason)` so the runner reports it
as *skipped with a reason* rather than as passed — there is exactly one of those today and
it names both its blocker and the environment variable that turns it on.

The three banned shapes, for the grep that enforces them:

| Banned | Why |
|---|---|
| `if (await x.count() === 0) return;` before the only assertion | "skip if the feature isn't there" is indistinguishable from "skip if the feature broke" |
| `try { await expect(...) } catch {}` | an assertion that may fail without failing the test is a comment with extra steps |
| a commented-out test body, or a test with no assertion | reports the same green checkmark as a test that verified something |
| `waitForTimeout` / `setTimeout` as a wait | flakiness plus wasted minutes; the fix is a web-first assertion |

---

## What this suite covers

Four journeys, twenty tests, two layers. Each journey is one file in `specs/`.

### 1. The landing page renders and states the product's anti-goal — `specs/landing.spec.ts`

The page's own promise is that **the instrument measures the book, never the reader**: a
frame most readers get wrong is evidence about the frame, not about them. The suite asserts
the promise is made (the heading, the anti-goal region, the sentence, and the two
commitments under it) and — separately — that the product contains no affordance that would
contradict it: no leaderboard, ranking or score link, button or heading anywhere on the
page. The day one ships, that test fails and somebody has to delete either the feature or
the promise. That argument is the point of the test.

It also asserts the reader loop's four steps **in order** (a loop that revealed the answer
before asking for one would be a different product), the four phases in the order they are
being built, and that the footer links to `https://github.com/konradcinkusz/ab-ovo` — the
canonical spelling. The repository was created as `ab-ove`, a typo; GitHub redirects the old
name, which is exactly why a wrong link would work and would still be wrong.

### 2. `GET /api/config` returns runtime-resolved addresses — `specs/runtime-config.spec.ts`

The defect this guards is `NEXT_PUBLIC_*`: the compiler substitutes those into the bundle, so
an address put there is frozen into the image, one image per environment follows,
build-once-deploy-many is gone, and the first symptom is a staging frontend calling
production APIs.

A test cannot read a minified bundle and prove that negative without becoming slow and
flaky. What it can do is assert the three properties that are all **false** under the
compiled-in alternative and all **true** under this one:

1. the browser **asks** for its configuration on every page load — the request disappears the
   moment the value is compiled in;
2. what it is handed as the API base is `/api/proxy`, a path on this app's own origin, and is
   asserted not to be an absolute URL — the compiled-in alternative hands over a real backend
   address;
3. **nothing the page loads leaves this origin** — a compiled-in address is what makes a
   browser call a backend directly, and brings CORS with it.

Plus the payload's exact key set (so a fifth field is a decision somebody comes here to make
rather than something that ships with a feature), the coupling invariant between
`accountsAvailable` and `authBaseUrl`, that `authBaseUrl` is either `null` or a
browser-reachable absolute URL and never a `.internal` address, a short/private/SWR
`cache-control`, and a guard that no key or value in the payload is secret-shaped.

### 3. The integration report panel — `specs/integration-report.spec.ts`

This is P8 seen from a browser: a degraded deployment must be legible **in the product**, not
only in a JSON document somebody has to know to curl. `AbOvo.Api` reports each optional
integration as `live` or `degraded` on `/api/v1/info`; the panel is the third rendering of
that list and the only one a reader or an operator will actually look at.

The suite asserts one row per integration, each carrying its own name, its own state and its
own detail; that the count of `live` and `degraded` rows matches what the API reported (a
panel that showed everything as `live` would satisfy a weaker test and be worse than no
panel, because an operator would believe it); that the panel names the service and version it
read the report from; and the three defensive branches — an empty integration list, a payload
in an unrecognised shape, and the fact that none of these may render as "no API".

**The payload is served by the test, and that is deliberate.** The CI context runs the web app
with no API behind it, by design — the Phase 1 reader loop has nothing to say to a backend
yet. A test that needed a live API would be skipped in the only context that runs it, which
is how a suite ends up asserting nothing. Route-fulfilment tests the half that is this
frontend's: that every state the API can report arrives on the page as itself.

The live half is not abandoned. The last test in that file reads a **real** deployment and
asserts at least one integration with a state of `live` or `degraded`. It is declared as a
skip with a reason and is enabled by `E2E_EXPECT_API=1` — see *Running it against a
deployment* below.

### 4. The app with no backend — `specs/no-backend.spec.ts`

Not an error-handling nicety: ab-ovo's first product requirement is that the reader loop
works with **no account and no backend**. "No API answered" is a supported configuration of
this product, not an outage.

The failure is injected in the browser with route interception, which is both deterministic
(no waiting for a real backend to be down, no 45-second ladder walk) and faithful to what a
reader experiences. Four faults are covered separately because the product says four
different things about them: an aborted request, the proxy's 503 (nothing answered), the
proxy's 504 (something answered too slowly, e.g. cold-starting), and an unexpected 500.

Each test asserts three properties, because any one alone would be satisfied by a broken
page:

- **the product is intact** — the heading, the anti-goal, the four loop steps, the four
  phases, asserted element by element exactly as journey 1 asserts them with a backend
  present;
- **the panel is legible** about which fault it was, and is not still showing its loading
  state;
- **the page threw nothing** — collected via `pageerror`. A React client component that
  throws during render leaves the server-rendered HTML on screen, so the first two assertions
  can both pass against a page that crashed.

The last test asserts the landing page does not redirect to sign-in when there is no session
and no identity service. The middleware is private-by-default and opts routes out one at a
time, so `/` being public is a list entry somebody wrote; if it ever falls out of that list,
the symptom is a redirect to a page a deployment without an identity service cannot serve.

---

## What this suite does NOT cover

Stated explicitly, because a suite whose scope is implicit gets cited as coverage nobody is
checking.

- **The lab pane — Phase 1, not built.** The book's computer exercises running in the browser
  under Pyodide. Nothing of it exists in `web/app` today. When it lands, it needs its own
  file in `specs/`, and it will need `data-testid` attributes on the editor and the run
  control, because a code editor has no useful accessible name.
- **The frame view and the content schema — Phase 2, not built.** 47 programs, two languages,
  one structure. The reader loop itself — read a frame, commit an answer, reveal the next —
  is therefore **completely untested**, because there is no frame view to drive. This is the
  single largest gap in the suite and it is a gap in the product, not in the tests.
  `specs/landing.spec.ts` asserts the landing page still *declares* both as unbuilt, which is
  the cheapest available signal that this section has gone stale.
- **Progress and accounts — Phase 3, not built.** No sign-in, no registration, no session.
  Consequently there is **no `storageState`** in this suite. `E2E-ACCEPTANCE-TESTING.md §3`
  requires tests that do not exercise login to start from a saved authenticated state rather
  than driving the login form; that rule has nothing to bite on until an authenticated flow
  exists, and setting up a `storageState` for a session no test needs would be config nobody
  runs. `web/app/src/app/login/page.tsx` exists but is not on any journey.
- **The instrument — Phase 4, not built.**
- **The API's own behaviour.** `/api/v1/info`, `/health`, `/alive`, JWT validation, the
  candidate ladder, the bearer injection. Those are `tests/AbOvo.Api.Tests`'s job.
  `TESTING-STRATEGY.md §1` names "duplicate backend integration tests through a browser" as a
  non-goal: each such test is minutes added to every PR forever.
- **Cross-browser.** One browser, chromium. See *Deliberate deviations*.
- **Visual regression.** Pixel-checking is a stated non-goal.
- **Mutation testing.** `E2E-ACCEPTANCE-TESTING.md §2` asks for Stryker to be run at least
  once after an assertion-discipline pass, as the actual proof the assertions catch broken
  code. **It has not been run against this suite.** It is a tool, not a per-PR gate, and it is
  outstanding.

---

## Running it

The suite is a self-contained pnpm package. It is **not** a member of the `web/` workspace —
that workspace lists exactly one package and owns exactly one lockfile, and `FRONTEND-BFF.md
§7` is emphatic that it stays that way. Same package manager, two install roots.

```bash
cd tests/e2e
pnpm install                 # no browsers: onlyBuiltDependencies is [] on purpose
pnpm run browsers            # playwright install --with-deps chromium — the explicit step
```

An install that silently pulls ~150 MB of browser binaries is an install nobody can audit, so
the download is a separate, greppable command — the same one CI runs.

### Against a local build

The suite drives a **production build**, not `next dev`: a dev server has different timing,
different error overlays and different bundle behaviour from the artifact that ships, and a
suite that only ever sees the dev server is testing a program nobody deploys.

```bash
pnpm --dir ../../web install
pnpm --dir ../../web build   # required — Playwright starts the server, it does not build it

cd tests/e2e
pnpm run test:smoke          # 8 tests, the critical path
pnpm run test:full           # 20 tests, smoke + core regression
pnpm test                    # both projects
pnpm run test:ui             # the Playwright UI, for writing tests
pnpm run report              # open the last HTML report
```

`playwright.config.ts` starts the web app itself, on `http://localhost:3000`, with
`reuseExistingServer: !CI` — so if you already have one running, it is used. If you have not
built, `next start` exits with a message saying so and the run fails loudly, which is the
correct outcome.

> `next start` prints a warning that it "does not work with output: standalone". **Do not
> take its advice here.** The standalone bundle is a traced subset that does not include
> `.next/static` or `public` — `web/app/Dockerfile` copies both in as separate steps — so a
> standalone server started without those steps serves HTML and 404s every stylesheet and
> script. The page would render, the client component would never run, and journeys 3 and 4
> would fail with a panel stuck on "Asking the API what it has…". `next start` serves the same
> program from `.next` with its assets; the warning is about packaging, and the packaging is
> the Dockerfile's.

### Against a deployment

```bash
E2E_BASE_URL=https://ab-ovo-web-dev.fly.dev pnpm run test:smoke
```

`playwright.config.ts` omits its `webServer` entry entirely when the target is not localhost.
Starting a local Next server while the assertions go to Fly would be a process nobody is
looking at, and `reuseExistingServer` would quietly make it pass.

To include the one live-API test — which reads a real `AbOvo.Api` through the BFF proxy and
asserts at least one integration is `live` or `degraded`:

```bash
E2E_BASE_URL=https://ab-ovo-web-dev.fly.dev E2E_EXPECT_API=1 pnpm run test:full
```

Without `E2E_EXPECT_API` that test reports as **skipped with a reason**, never as passed. It
is gated on an explicit operator statement ("I expect an API here") rather than on probing
whether one answered, because a test that quietly passes when the backend is absent cannot
tell that from a backend that broke.

### The base URL

| | |
|---|---|
| Variable | `E2E_BASE_URL` |
| Default | `http://localhost:3000` |
| CI | `http://127.0.0.1:3000`, exported by the `e2e` job |

There is exactly one source of truth for that port and it is `src/AbOvo.AppHost/AppHost.cs`,
which maps the web app to 3000 — the same number in `flyio/web.fly.toml`'s `internal_port`
and `web/app/Dockerfile`'s `EXPOSE`. `playwright.config.ts` is both the compiled-in fallback
and the settings file; there is no third place, and `ci.yml` exports the variable rather than
encoding a second default. Defaults drifting across a fallback, a settings file and a setup
script are themselves the sign that nobody has run the suite in a while.

---

## Layers, and when each runs

| Layer | Project | Budget | Trigger | Contents |
|---|---|---|---|---|
| Smoke | `smoke` | 5–10 min | every ready PR | 8 tests, single browser — the critical path |
| Core regression | `core` | 20–30 min | push to `main` | 20 tests — the full protected-flow set, smoke included |
| Extended / edge | — | 30–60 min | nightly | **not present**, see below |

The budget is part of the definition. A layer that grows past its budget is pruned, not
renamed into a longer-budget tier.

Layer membership is **configuration, never a directory convention**: a test belongs to a layer
because of the `@smoke` or `@core` tag in its title, and the `grep` on each project in
`playwright.config.ts` is the only thing that reads it.

### The when-to-run matrix, as implemented

|  | PR draft | PR ready | merge to main | nightly | release candidate |
|---|---|---|---|---|---|
| Unit + lint | always | always | always | always | always |
| Integration | skip | always | always | always | always |
| Smoke E2E | skip | **always** | always | always | always |
| Core regression | skip | if touched area | **always** | always | always |
| Extended / cross-browser | skip | skip | skip | always | always |

The two bold cells are what this suite implements. `.github/workflows/ci.yml`'s `e2e` job
runs `test:smoke` on `pull_request` and `test:full` on `push`, and skips the whole job on a
draft PR. There is no nightly or release-candidate context in this repository yet, so the
bottom row has no implementation and this suite has no config for it.

**Every script in `package.json` is executed by a CI context.** An unreferenced test entry
point is not a latent capability, it is documentation that lies.

---

## Deliberate deviations

Two, both recorded here and again at the point in `playwright.config.ts` where they are made.

**One browser, not three.** `TESTING-STRATEGY.md §5`'s harness defaults list three browser
projects, and §2 puts cross-browser in the extended layer that runs nightly. This repository
has no nightly CI context: `ci.yml` installs chromium and nothing else, and says so in its own
comments. §9 is decisive about the gap — *if a layer is aspirational, delete its config and
track it as an issue instead of committing a config for it* — so firefox and webkit projects
are **absent** rather than present-and-never-run. They arrive in the same change as the
nightly workflow that runs them.

**`webServer` only when the target is local.** §5 prescribes a `webServer` array with
`reuseExistingServer: !CI`, and that is exactly what is configured for a localhost target.
Against a deployed target there is no entry at all, for the reason given above.

---

## Locator convention

Fixed, ranked, and the same for anyone adding a test or a component.

| Preference | Example | Breaks when |
|---|---|---|
| **1st — role + accessible name** | `getByRole('region', { name: 'Integration report' })` | copy changes (often desirable to catch) or the element's ARIA role changes |
| **2nd — label / placeholder / text** | `getByRole('main').toContainText(...)` | copy changes |
| **3rd — `data-testid`, for what the above cannot reach** | `[data-testid="lab-run-button"]` | never, by design — but only covers what it was added for |
| **Avoid — CSS class chains, DOM traversal** | `.panel .badge.badge-live` | any styling refactor, with no relation to behaviour |

**`web/app` carries no `data-testid` attributes today, and that is correct, not a shortfall.**
Accessible locators rank *above* `data-testid`, and every element these journeys drive
already has a role and an accessible name: `<main>`, the `<h1>`, the two `<section>`s that
carry `aria-label` / `aria-labelledby` and are therefore `region`s, the `<ol>`/`<ul>` lists
and their items, and the footer link. `data-testid` is the deliberate fallback for elements
the first two preferences cannot reach — and the first of those is coming: the lab pane's
code editor and run control will need them, added **at the moment those components are first
built**, not retrofitted. Retrofitting means changing both sides at once for every test
already written against a fragile selector.

Two mechanical traps, both from the audit, both avoided here:

- **`hasText` matches one literal substring, never a comma-delimited OR list.** Thirteen call
  sites in the audited suite passed it a list it does not support, silently disabling every
  test built on them. Every `filter({ hasText })` in `specs/` passes a single substring.
- **Prefer a single-element locator to `getByText(...)` when an ancestor has the same text.**
  Several assertions here are written as `expect(region).toContainText(...)` rather than
  `expect(region.getByText(...)).toBeVisible()` for exactly this reason: the anti-goal
  sentence is a `<strong>` alone inside a `<p>`, so both elements carry that text.

---

## Waiting

No fixed sleeps, anywhere. Every wait in this suite is either a web-first auto-retrying
assertion (`expect(locator).toBeVisible()`, `.toHaveCount()`, `.toContainText()`) or
`page.waitForRequest`, armed *before* the navigation it observes — arming it after is a race
the fast case loses, and the fix for that race is never a sleep.

Timeouts: 30 s per test, 10 s per assertion. The one test that needs more asks for it at the
assertion, visibly — the live-API test allows 90 s because a Fly machine may be scaled to
zero and the proxy's ladder is sized to cover a cold start. There is no global inflation to
cover one slow case.

**There are no custom assertion or wait wrappers in this suite.** `specs/support/` contains
route handlers and an error collector and nothing else, and both files say so at the top. The
audited estate shipped a helper that accepted a `timeoutMs` and ignored it in five of its
seven methods, indistinguishable at the call site; the cheapest defence is for shared code to
have nothing to hide. Every assertion and every wait is in a spec file, in plain sight.

---

## Independence and cleanup

Decided explicitly rather than assumed, because generated-per-test data buys independence and
deletes nothing.

**This suite creates no server-side state at all.** Every test navigates, intercepts its own
page's requests, and asserts; none signs up, signs in, writes a record or uploads a file.
There is therefore nothing to tear down, and no orphan data can accumulate against a
persistent environment however often it runs. `fullyParallel` is safe by construction:
Playwright gives each test its own browser context, and `page.route` handlers are scoped to
that context, so two tests interfering is not possible rather than merely unlikely.

This stops being true the moment a journey signs in. When Phase 3 lands, that test needs both
a generated identity (`test.user.{uuid}@example.com`) **and** a teardown that deletes it —
unless the environment it runs against is mechanically guaranteed to be thrown away, which
the shared dev estate is not.

---

## Retries and flakiness

CI runs `retries: 2`, paired with `trace: 'on-first-retry'`. That is **diagnostic capture,
not a licence to merge an intermittent test.** Zero tolerance stands: a test that only passes
on retry is fixed or deleted before merge, because a retried-until-green test is a false
regression net — worse than no test, because it is trusted.

When a test fails in CI and passes locally, triage in this order: environment variables
unset, database unseeded, services not fully started, race conditions the faster CI box
exposes.

---

## Adding a test

1. It states **one business goal** in its title and asserts the outcome, never that a button
   was clicked.
2. It carries `@smoke` or `@core` in its title. `@smoke` is the critical path and costs
   minutes on every PR forever; the default is `@core`.
3. It asserts unconditionally. No count guard before the only assertion, no `try`/`catch`
   around one, no empty body. If it cannot run yet, `test.skip(condition, reason)` with the
   blocker named.
4. It selects by role and accessible name first. If an element has no accessible name, add a
   `data-testid` **to the component, in the same change**, kebab-case as
   `<feature>-<element>-<role>`.
5. It waits for conditions, never for a duration.
6. It creates no server-side state — or it cleans up what it creates.
7. `pnpm run typecheck` passes.

---

## Files

```
tests/e2e/
  package.json                      scripts; every one is run by a CI context
  playwright.config.ts              base URL, layers, harness defaults, webServer
  tsconfig.json                     strict; `pnpm run typecheck` is a real gate
  specs/
    landing.spec.ts                 journey 1 — the page and its anti-goal
    runtime-config.spec.ts          journey 2 — GET /api/config, resolved at request time
    integration-report.spec.ts      journey 3 — P8, seen from a browser
    no-backend.spec.ts              journey 4 — the reader loop's premise
    support/
      service-info.ts               the API's payload shape and the route handlers
      page-errors.ts                uncaught-exception collector
```

`specs/support/` holds no assertions and no waits, by design. Playwright's default
`testMatch` collects only `*.spec.ts`, so nothing in there is mistaken for a test.
