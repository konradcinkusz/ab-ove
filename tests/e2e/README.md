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
as *skipped with a reason* rather than as passed. `grep -rn 'test.skip(' specs/` is the list;
a number here would be a claim nobody re-runs. Today it finds `integration-report.spec.ts`,
waiting on a deployment with `AbOvo.Api` behind the BFF proxy and on `E2E_EXPECT_API=1`,
and its reason names both.

The banned shapes, for the grep that enforces them. They are listed rather than counted,
because this heading said *three* over a table of four from this file's first commit
(`f064c6b`, where both the heading and the fourth row arrived together) until it was read
— a claim about itself that nothing checks, which is the shape the file exists to ban:

| Banned | Why |
|---|---|
| `if (await x.count() === 0) return;` before the only assertion | "skip if the feature isn't there" is indistinguishable from "skip if the feature broke" |
| `try { await expect(...) } catch {}` | an assertion that may fail without failing the test is a comment with extra steps |
| a commented-out test body, or a test with no assertion | reports the same green checkmark as a test that verified something |
| `waitForTimeout` / `setTimeout` as a wait | flakiness plus wasted minutes; the fix is a web-first assertion |

---

## What this suite covers

One file in `specs/` per journey, over two layers. How many tests that is, in total or per
layer, is deliberately not written here: `playwright test --list` answers it in a second and
is never stale. This file already took that decision for the counts in its *Running it*
section, and the ones it left standing here had gone the same way.

### 1. The product's argument, and its anti-goal — `specs/about.spec.ts`

The product's own promise is that **the instrument measures the book, never the reader**: a
frame most readers get wrong is evidence about the frame, not about them. The suite asserts
the promise is made (the heading, the anti-goal region, the sentence, and the two
commitments under it) and — separately — that the product contains no affordance that would
contradict it: no leaderboard, ranking or score link, button or heading. The day one ships,
that test fails and somebody has to delete either the feature or the promise. That argument
is the point of the test.

It also asserts the reader loop's four steps **in order** (a loop that revealed the answer
before asking for one would be a different product), the four phases in the order they are
being built, and that the footer links to `https://github.com/konradcinkusz/ab-ovo` — the
canonical spelling. The repository was created as `ab-ove`, a typo; GitHub redirects the old
name, which is exactly why a wrong link would work and would still be wrong.

**This journey ran against `/` until
[ADR-0036](../../docs/adr/0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md)**,
which made the landing page the index of programs and moved the argument to `/about`. The
same sentences, the same two negative assertions, one URL — with one deliberate exception:
the negative assertions are ALSO kept on `/` by journey 1b, because the index is the page a
leaderboard would actually appear on. A promise enforced only on the page that states it is
enforced where it is least likely to be broken.

### 1b. The landing page is the index — `specs/landing.spec.ts`

What replaced the argument on `/`: a grid of programs, an edition switch, and the account
control at the top. The assertions are about **hrefs into the reading route** rather than
about tiles existing — a grid of tiles linking nowhere would satisfy every weaker form of
this test, and "a reader arriving is one move from working a program" is the requirement the
change was made for.

The edition switch gets four of them, because it is the part that could quietly undo
[ADR-0015](../../docs/adr/0015-the-reading-index-has-no-default-language.md): both editions
are linked when nothing is chosen, one when something is, an edition the book does not have
is no choice rather than a fallback to English, and *Both editions* gets a reader back to
the page that picks neither. `web/app/src/lib/content/chosen-edition.test.ts` covers the
same rule at the layer with the logic (P13); this covers it on the page.

It also asserts that `/read` still answers **308** to `/`. A redirect nobody asserts is one
somebody removes as dead code.

The grid is divided into the book's own runs — *Foundation* and *Main sequence* — under
level-three headings, and the test that says so also says the level-one heading is still the
only one: a heading list that reads as a tree is the property, and a second `<h1>` would
pass every other assertion here. The returning reader's half of the index — the tile that
says `at frame N`, the filled resume control, and the layout not moving when either arrives
— is in `specs/progress.spec.ts`, because it needs a place to have been recorded first.

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

**The payload is served by the test, and that is deliberate.** These tests run against the
web app on `:3000`, which has no API behind it — by design, and still, since the backend the
e2e job now starts is given to the signed-in deployment alone (ADR-0035). A test that needed
a live API would be skipped in the only context that runs it, which is how a suite ends up
asserting nothing. Route-fulfilment tests the half that is this frontend's: that every state
the API can report arrives on the page as itself.

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

### 5. The Lab P1 pane — `specs/lab-p01.spec.ts`

`notes/10 §6.1` fixes this phase's definition of done as one journey: **open Lab P1, paste the
reference solution of one exercise, press Check, and see the `ok` line for that check and the
`SUMMARY` line.** The first test is that journey and nothing else. Every other test in the file
is there to make the first one worth believing, and the table at the end of this section names
the broken pane each of them kills.

**Why one exercise, and what that does not buy.** One exercise is what `notes/10 §6.1`
specifies, and it is the stronger assertion: the result has to be *partial* in exactly the way
the reader's work was partial — two `ok` lines and eleven `todo` lines, not thirteen of either
— so the summary's bookkeeping is a claim about the pane having run the reader's code rather
than about a run having happened. A whole-file paste asserting thirteen `ok` lines would
collapse every per-check assertion into one.

What it does **not** buy, measured rather than supposed: it does not catch a pane that reports
success unconditionally. Run against one that rewrites every result line to `ok`, **the
headline test passes** — the two `ok` lines it looks for are there, and `ok=13 fail=0 todo=0`
satisfies every property it checks. The second test is what catches that, by requiring the
untouched stub to report `SUMMARY ok=0 fail=0 todo=13` — and the second test in turn passes
against a pane that ignores the editor entirely, which is what the first one catches. Neither
is redundant and neither is sufficient. `E2E-ACCEPTANCE-TESTING.md §2`: a real assertion proves
only that a test *can* pass, not that it can catch anything, which is why both were written as
a pair and both were watched failing — see the table at the end of this section. The book's own
`lab/tools/labcheck.py --tests` holds the engine to exactly this both-directions rule; these two
tests are that rule applied one artefact over, to the pane.

The others:

- **a wrong answer** produces one `FAIL` line naming the check, and **hands back no solution**.
  The lab's three rules say a failed check "names the frames to re-read, never the solution";
  the assertion is that no line which occurs in `lab/solutions/` and nowhere in the stub appears
  in the output. The pane is then asserted to be still usable — run enabled, status back to
  ready, the reader's work still in the editor.
- **a second Check reports the second answer, not the first.** Two answers one keystroke apart
  and, deliberately, **the same number of bytes** — see *The re-run test* below, which is the
  most load-bearing paragraph in this section.
- **a run that cannot start** — a syntax error in the reader's file — shows the traceback and
  leaves the pane usable. `lab/check.py` imports the reader's module outside any `try`, so this
  is the one outcome that arrives as an uncaught Python traceback with no `FAIL` line and no
  `SUMMARY` line at all, and it is the outcome a reader reaches most often, because a half-typed
  function is a syntax error.
- **a run that will not end can be stopped, and the reader keeps their code.** Every exercise
  is a stub the reader completes, and Lab P1 asks for `threshold` by bisection and
  `flips_to_zero` by a multiply-until-zero loop, so `while True:` is an expected input — and Pyodide runs CPython on the worker's own thread, so the only thing
  that reaches a spinning interpreter is `terminate()`. The test submits a non-terminating
  exercise, presses Stop, and asserts the status line says what happened, the pane comes back
  to `ready`, the editor still holds the reader's file byte for byte, and **a Check runs
  afterwards** — the last of those being the only one that can tell a rebooted interpreter from
  a pane that merely says it is ready. ADR-0034 records why this ends the interpreter rather
  than interrupting it.
- **the whole journey fetches from this origin and from nowhere else** (`FRONTEND-BFF.md §1`,
  `notes/10 §6.1`). Pyodide's own documentation leads with a jsDelivr `indexURL`, and taking that
  advice would put a third-party host in the critical path of a reader loop whose first
  requirement is that it needs no backend. Asserted over the boot *and* the run, with the
  positive half too — the runtime arrived from `/pyodide/` and the book from `/book/` — without
  which "nothing off-origin" would be satisfied by a page that fetched nothing.
- **the reference solutions are not served to the browser.** `lab/solutions/` exists so the
  build can prove the exercises solvable; copying it into `public/book/` would put every answer
  one devtools tab away. Asserted in both directions, because a 404 for the solutions proves
  nothing on its own — a build that copied no book at all would also 404 — so the exercise stub
  and the values file are asserted present with their real contents. `maxRedirects: 0`
  throughout: the middleware answers an unauthorised request with a 307 to `/login`, and a
  followed redirect returns the sign-in page with status 200, which would read as "served" for
  the one and "absent" for the other, both wrong and both silently.

**The solution is read in Node, not fetched by the page**, and that is the point rather than a
workaround: it is not served to the browser, so the test supplies it, exactly as the answer
reaches a real reader from outside the pane. Nothing in `specs/` contains a line of the book's
Python. `specs/support/lab.ts` reads the pinned files from `web/content/book/` and splices one
`# region:` block — the book's own markers, which `lab/tools/labcheck.py --files` already
requires the two files to share — so there is no second copy to drift when the pin moves. How
many checks the lab has is **counted** from the pinned test module rather than written down;
`13` appears nowhere in the suite.

#### The re-run test, and a mechanism that is not what it is usually said to be

The defect: a second Check reports the *first* version of the reader's code. It looks like a
working pane to anybody who presses Check once, and to anybody else it is indistinguishable
from their own bug — they fix their answer, the same failure comes back, and what they conclude
is that they have not fixed it.

It is usually attributed to `sys.modules`. **Measured against the pinned engine, it is not.**
`lab/tests/labkit.py` loads the reader's file with `module_from_spec` + `exec_module`, which
never registers it — `"p01_floating_point" in sys.modules` is `False` after a run — so popping
that name and calling `importlib.invalidate_caches()` is a no-op. Run twice with that guard in
place and the stale result still comes back. What bites in CPython is the `__pycache__`
**bytecode** cache, validated against the source's mtime *and its size*, with mtime compared as
whole seconds: two Checks inside one second on a file whose size did not change reuses a stale
compile. That is measured, three ways — no guard: stale; the `sys.modules` guard: stale;
`sys.dont_write_bytecode = True`: the result changes.

**And in the browser neither mechanism is live**, which is also measured: Pyodide sets
`sys.dont_write_bytecode` to `True` by default, and its in-memory file system stamps mtime with
millisecond precision. So the pane is protected today by two accidents rather than by the guard
usually written for it — and it stops being protected the day somebody clears either one.

None of that is asserted. The test asserts the *observable* property, which is what a reader
experiences and is broken by far more mundane things than Python caching — an editor written to
the virtual file system only at boot, an output pane that is never cleared, a stale read of
component state. What the mechanism did change is the test's data: the two answers are
`    return 0.0` and `    return 1.0`, **the same length**, because a wrong and a right answer of
different lengths would invalidate a stale compile on size alone and the test would pass against
a pane carrying the defect. The test asserts the two are the same length before it types either,
so that reasoning is checked rather than trusted.

#### What it cost, and what was watched failing

Pyodide is seconds, not milliseconds, so this file raises its own timeouts rather than inflating
the suite's: 180 s per test, 90 s for the boot, 60 s for a run. They are ceilings; there is no
sleep in the file and every wait is a web-first assertion. **Measured: the boot — page,
`pyodide.mjs` and the ~9 MB `pyodide.asm.wasm` from this origin, the runtime instantiating, the
virtual file system written and `lab-run` enabled — is about 2 seconds per fresh browser
context, and a Check on top of a booted runtime is about 100 ms.** Read that with its caveat:
it was taken against a harness serving the same Pyodide build and the same book from local
disk, because at the time of writing the real pane could not boot at all — the middleware
returns 307 to `/login` for `/pyodide/**` and `/book/**`, which is the defect the last test in
this file reports in 38 ms. **The figure is therefore a floor and has not been measured against
the shipped route.** Expect a Next.js route with hydration in front of it to cost more, and a
cold CI runner more again; whoever first sees a green lab run should replace the number. The
ceilings are several times the floor for exactly that reason.

**Every test in this file was watched failing**, against panes built to be wrong in one specific
way each — which is `E2E-ACCEPTANCE-TESTING.md §2`'s mutation-testing argument done by hand,
and the only thing that separates an assertion that can pass from one that can catch something.
The tests are named by their position in the file:

| a pane that… | fails |
|---|---|
| is faithful to the contract | *none — every test passes* |
| ignores the editor and always runs the stub | 1, 3, 4, 5 |
| rewrites every result line to `ok` | 2, 3, 4, 5 |
| writes the editor to the virtual FS only on the first Check | 4, 5 |
| renders Stop and wires it to nothing | 6 |
| stops the run and puts the stub back in the editor | 6 |
| reboots on Stop, reports `ready`, and cannot run again | 6 |
| serves `lab/solutions/` | 8 |
| makes one third-party fetch | 7 |
| lets the middleware bounce `/book/**` to sign-in | 8 |

Read rows two and three against each other. The headline journey (1) is absent from row three:
a pane that reports success unconditionally passes it. The stub test (2) is absent from row two:
a pane that ignores what the reader typed passes it. Each is caught only by the other, which is
the whole argument for writing them as a pair.

---

## What this suite does NOT cover

Stated explicitly, because a suite whose scope is implicit gets cited as coverage nobody is
checking.

- **The lab pane's Reset control.** It is in the pane's contract and is not asserted.
  `lab-reset` is asserted present and enabled after a failure — a pane that wedges its own
  controls fails there — but nothing presses it and asserts the stub comes back. A test
  somebody should write.

  **The in-flight control states are now asserted, and the objection that kept them out is
  worth keeping.** They were refused because a run that finishes before the assertion polls
  fails a test about a *correct* pane, and a Check on a booted runtime is about 100 ms — a
  test flaky by construction is worse than the gap it fills. The Stop test escapes that by
  construction rather than by a longer timeout: its run **cannot** finish, so the window is
  unbounded. That is the only place in this suite where the in-flight contract can be
  asserted honestly, and a test that drives a terminating run still must not assert it.
- **A second lab.** `specs/lab-p01.spec.ts` drives P1 because P1 is the only lab the book
  has. The suite's fixtures read `web/content/book/lab/{exercises,solutions}/p01_floating_point.py`
  by name; a second lab is a second spec and a parameter, not a rewrite.
- **The frame view and the content schema — Phase 2, not built.** 47 programs, two languages,
  one structure. The *reading* half of the reader loop — read a frame, commit an answer,
  reveal the next — is therefore **untested**, because there is no frame view to drive. The
  *working* half is now covered by journey 5. This is the single largest gap in the suite and
  it is a gap in the product, not in the tests.
  `specs/about.spec.ts` asserts `/about` still names it among the phases, which is the
  cheapest available signal that this section has gone stale.
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

  **The COMPOSITION of those pieces is covered, and it is a different claim.** Issue #180:
  each piece is individually asserted and the hop between them — this app's proxy carrying a
  real bearer from an HttpOnly cookie to a real `AbOvo.Api` — was asserted nowhere, because
  `sync.spec.ts` stubs the account at the network and the API's own tests hand
  `WebApplicationFactory` a principal rather than a cookie. `specs/bearer-hop.spec.ts` drives
  it, in the `identity` project, against the backend `ci.yml` now starts (ADR-0035). It
  asserts nothing the API could answer on its own: every assertion is about what a browser
  holding this app's cookie gets back through this app's proxy. Its §1 needs no API and runs
  everywhere; §§2–5 need one and say in the skip's own reason what is lost without it.
- **Cross-browser.** One browser, chromium. See *Deliberate deviations*.
- **Visual regression.** Pixel-checking is a stated non-goal.
- **Mutation testing, as a tool.** `E2E-ACCEPTANCE-TESTING.md §2` asks for Stryker to be run
  at least once after an assertion-discipline pass, as the actual proof the assertions catch
  broken code. **Stryker has not been run against this suite** and is outstanding. What has
  been done is the same argument by hand, for journey 5 only: every test in that file was
  watched failing against a pane deliberately broken in one specific way, and the table is in
  that journey's section above. Journeys 1 to 4 have had no such pass.

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
bash ../../scripts/fetch-book-content.sh   # required — web/content/book is not in git
pnpm --dir ../../web install
pnpm --dir ../../web build   # required — Playwright starts the server, it does not build it

cd tests/e2e
pnpm run test:smoke          # the critical path
pnpm run test:full           # smoke + core regression
pnpm run test:identity       # the signed-in path, against the fixture
pnpm test                    # every project
pnpm run test:ui             # the Playwright UI, for writing tests
pnpm run report              # open the last HTML report
```

The counts that used to be in those comments are gone rather than corrected. They said
twelve and twenty-seven against a suite that now runs forty-one and a hundred and ten, and a
number in a README is a claim nothing checks — `--list` answers it in a second and is never
stale.

The book fetch is first because two things need it: the web build copies `web/content/book` into
`public/book` so the lab pane has a file system to mount, and `specs/lab-p01.spec.ts` reads the
pinned exercise and solution files in Node. Without it the build fails and the lab journey
cannot run; `.github/workflows/ci.yml`'s `e2e` job runs the same command for the same reason.

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

**CI does not set it, and that did not change when CI grew a backend** (ADR-0035). That test
is tagged `@core`, so it runs against the `:3000` deployment, which is the one deliberately
left with no API; the backend the e2e job starts belongs to `:3100`. Turning the variable on
in CI would mean giving `:3000` an API too, and that would retire the only un-intercepted run
this suite has against a genuinely backend-less web app — which is the product's first
requirement, not a gap. It stays a deployment-only switch.

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
| Smoke | `smoke` | 5–10 min | every ready PR | single browser — the critical path |
| Core regression | `core` | 20–30 min | push to `main` | the full protected-flow set, smoke included |
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

`test:identity` runs on **both** events and sits in none of those rows, because it is not a
layer — it is the same protected flows against a second deployment. See ADR-0028 and
`playwright.config.ts`: the suite starts a fixture identity service and a second web app
pointed at it, so the signed-in half of the product is gated rather than measured by hand.
A gate that only ran after merge would report on a commit you can no longer decline, which
is why it is on the pull request too.

The fixture knows three accounts, in `fixtures/accounts.mts`, and each exists for a
property rather than for a scenario:

| account | what it is for |
|---|---|
| `READER` | one role, so the token carries the role claim as a **bare string** |
| `AUTHOR` | two roles, so it carries an **array** — the shape a naive consumer gets wrong |
| `TWO_FACTOR` | a correct password answers with a **challenge** rather than tokens (ADR-0029) |

None of them is a credential: no deployment of ab-ovo has ever accepted them, and they are
in the tree rather than in the environment because a test's inputs must not depend on a
deployment. `TWO_FACTOR`'s code is a fixed string and not a real TOTP — computing one would
make every assertion depend on the clock, and the exchange is what is under test.

**Every script in `package.json` is executed by a CI context.** An unreferenced test entry
point is not a latent capability, it is documentation that lies.

---

## Deliberate deviations

Three, each recorded here and again at the point in `playwright.config.ts` where it is made.

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

**A project that does not always exist.** `identity` is present only for a local target,
because the servers it drives are ones this config starts. Against a deployed
`E2E_BASE_URL` there is nothing to point it at, and a project that existed there would fail
every run for a reason that is not a defect — which is §9's rule about aspirational config
applied one level down, to a project rather than to a layer. It is also why `test:identity`
is its own script: `--project=identity` appended to `test:smoke` would fail with *project
not found* on exactly the deployed run the other deviations exist to keep working.

**And `reuseExistingServer: false` on both of the identity entries, even locally**, against
`!CI` on the entry beside them. The fixture holds a signing key generated on boot, so a
stale one from an earlier run publishes a JWKS that does not match the tokens the second web
app is minting — and the failure presents as *the session did not rehydrate*, which is the
defect the whole project exists to catch.

---

## Locator convention

Fixed, ranked, and the same for anyone adding a test or a component.

| Preference | Example | Breaks when |
|---|---|---|
| **1st — role + accessible name** | `getByRole('region', { name: 'Integration report' })` | copy changes (often desirable to catch) or the element's ARIA role changes |
| **2nd — label / placeholder / text** | `getByRole('main').toContainText(...)` | copy changes |
| **3rd — `data-testid`, for what the above cannot reach** | `getByTestId('lab-run')` | never, by design — but only covers what it was added for |
| **Avoid — CSS class chains, DOM traversal** | `.panel .badge.badge-live` | any styling refactor, with no relation to behaviour |

**Journeys 1 to 4 use no `data-testid` at all, and journey 5 uses nothing else. Both are
correct.** Accessible locators rank *above* `data-testid`, and every element those journeys
drive already has a role and an accessible name: `<main>`, the `<h1>`, the two `<section>`s
that carry `aria-label` / `aria-labelledby` and are therefore `region`s, the `<ol>`/`<ul>`
lists and their items, the footer link, and — on the index — each program's title as the
name of the link into it.

The lab pane is the deliberate fallback the third row is for. A code editor, a stdout pane and
a machine-readable summary line have no useful accessible name — "the textarea whose label is
Your code" would be a locator for the label rather than for the thing being driven — so seven
ids carry that journey:

```
lab-status  lab-editor  lab-run  lab-reset  lab-output  lab-summary  lab-exercise-count
```

They were **agreed as a contract before either side was built** and added to the components as
they were built, which is the whole of what `E2E-ACCEPTANCE-TESTING.md §3` asks: "if the tests
will live in a separate repo, or be written by a separate team, from the frontend, the chosen
locator convention must be a contract between them from day one — not a review comment
discovered months in." The audited estate's failure was the opposite — a strategy doc naming
`data-testid` as preferred beside four apps carrying none — and retrofitting means changing both
sides at once for every test already written against a fragile selector.

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

Timeouts: 30 s per test, 10 s per assertion, and there is no global inflation to cover a slow
case. Two places ask for more, visibly and at the point they need it — the live-API test allows
90 s at the assertion, because a Fly machine may be scaled to zero and the proxy's ladder is
sized to cover a cold start; and `specs/lab-p01.spec.ts` raises its own per-test timeout at the
top of the file, because Pyodide fetches and instantiates a ~9 MB wasm before anything on that
page can be driven. Raising the suite's 30 s to cover the second would buy every other spec a
slower failure.

**There are no custom assertion or wait wrappers in this suite.** `specs/support/` contains
route handlers, an error collector and a file-reading fixture, and nothing else — every file
says so at the top. `lab.ts` does one thing the others do not: it throws when the pinned book
no longer has the shape a splice needs, which is not an assertion about the application but a
refusal to hand a spec a fixture that is quietly wrong. The
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

**And one file now does create server-side state, so the paragraph above has an exception
rather than a slow drift into being false.** `specs/bearer-hop.spec.ts` writes progress rows
to a real `AbOvo.Api`, because a hop that carries nothing proves nothing. Two consequences,
both taken deliberately:

- **It cleans up after itself.** The service offers exactly one teardown — `DELETE /progress`
  forgets every row for the caller's own subject — and the file calls it before and after the
  tests that write, so a crashed earlier run cannot decide what "the furthest frame" is.
- **It is the one file in `specs/` that is not `fullyParallel`-safe by construction**, and it
  says so at its own `test.describe.configure({ mode: 'serial' })`. The fixture's accounts
  exist for claim shapes rather than for scenarios, so these tests share one account, and the
  only teardown available is "forget everything for this subject". CI already runs one worker;
  the serial mode is what makes a local run deterministic as well.

Generating an identity per test is the right answer and is not available: the identity
service here is a fixture with three accounts compiled into it (`fixtures/accounts.mts`), and
inventing a registration endpoint for it would be a fixture proving something about itself.

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
    about.spec.ts                   journey 1 — the argument and its anti-goal
    landing.spec.ts                 journey 1b — the index, its tiles and its edition switch
    runtime-config.spec.ts          journey 2 — GET /api/config, resolved at request time
    integration-report.spec.ts      journey 3 — P8, seen from a browser
    no-backend.spec.ts              journey 4 — the reader loop's premise
    lab-p01.spec.ts                 journey 5 — the Lab P1 pane, Pyodide in the browser
    support/
      service-info.ts               the API's payload shape and the route handlers
      page-errors.ts                uncaught-exception collector
      lab.ts                        the pinned book's exercise file, solutions and splices
      bundle.ts                     the served bundle, and the needles the reading specs assert
      reveal.ts                     the reveal's locator: the article's own child, not any href
      sign-in.ts                    signing in against the identity fixture
```

`specs/support/` holds no assertions and no waits, by design. Playwright's default
`testMatch` collects only `*.spec.ts`, so nothing in there is mistaken for a test.
