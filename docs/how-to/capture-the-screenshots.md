# How to capture the screenshots

The pictures in [`../SCREENSHOTS.md`](../SCREENSHOTS.md) come out of the acceptance suite,
against a real production build. This is how to take them again.

> **Wersja polska:** [`capture-the-screenshots.pl.md`](capture-the-screenshots.pl.md)

## The command

```bash
bash scripts/fetch-book-content.sh     # the app has nothing to serve without it
pnpm --dir web install
pnpm --dir web build
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers      # explicit; no install-time browser download
pnpm --dir tests/e2e run screenshots
```

The Playwright config starts the web app itself, but not `AbOvo.Api`, and the tour needs one
that holds the book: a frame, a program's contents and its summary are all fetched from it
([ADR-0060](../adr/0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md)),
and the tour walks to a program's last frame through it before it photographs the summary. Give
its address as `E2E_API_BASE_URL`. The `e2e` job in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) is the recipe: a Postgres, the API
started against it, and the bundle ingested with
[`ingest-content.mts`](../../tests/e2e/fixtures/ingest-content.mts). Without one, those captures
fail rather than photograph the error page. The images land in `docs/assets/screenshots/`,
overwriting what is there.

## What it is, and what it is not

[`../../tests/e2e/specs/screenshots.spec.ts`](../../tests/e2e/specs/screenshots.spec.ts) is a
Playwright **project** — `screenshots` — alongside `smoke`, `core` and `identity`. It is a
project rather than a script of its own because capturing a screenshot of this product needs
exactly what this suite already has: a production build, a pinned browser, and a page object
that can wait for hydration rather than sleeping. A second capture script would have bought a
second Playwright version, a second browser download and a second way to start the app.

**It is not visual regression testing.** Nothing compares against a stored image, and a change
to the design does not turn it red. What each test asserts is that the screen it is about to
photograph is *the screen it claims to be* — because a documentation set illustrated with a
photograph of an error page is worse than one with no pictures at all.

**It is deliberately not in `smoke`, `core` or `identity`.** It writes into the working tree,
which no other project does, and folding it into `core` would mean every merge to main
rewrote files under `docs/`.

## Why the images are committed

They are the one generated artefact this repository commits, and the exception is forced
rather than chosen: a Markdown document on GitHub cannot render an image that exists only
inside a workflow run's artifact. Everywhere else — PDFs, rendered diagrams, `web/content/` —
nothing generated is committed.

## When to retake them

When a screen in the tour changes. A screenshot of a screen that no longer exists is worse
than no screenshot, because it is a confident picture of something false.

After retaking, look at what changed:

```bash
git status docs/assets/screenshots/
```

A diff of PNGs is not readable, so **open the changed images** before committing. If only one
screen changed, `git checkout -- docs/assets/screenshots/<the rest>` and commit the one that
matters; a commit that rewrites every image because the capture ran is noise in the history.

## Adding a screen to the tour

1. Add a test to `screenshots.spec.ts` inside the `@screenshots` describe block. Assert that
   the screen is the screen, then `shoot(page, '<name>')`.
2. Add the image to **both** [`../SCREENSHOTS.md`](../SCREENSHOTS.md) and
   [`../SCREENSHOTS.pl.md`](../SCREENSHOTS.pl.md), with alt text that describes what is in the
   picture — the alt text is what a reader on a screen reader gets, and it is also what a
   reader gets when the image fails to load.
3. `npm run lint:docs` — the link checker verifies that the file you referenced exists.

## What is not captured, and why

`/account` and `/instrument/<track>/<unit>` need an account, which needs an identity service.
The suite has one — a stub it starts itself — but photographing a screen whose every number
came from a fixture would illustrate the fixture rather than the product.

## See also

- [`run-the-tests.md`](run-the-tests.md) — the rest of the acceptance suite.
- [`../SCREENSHOTS.md`](../SCREENSHOTS.md) — the tour itself.
