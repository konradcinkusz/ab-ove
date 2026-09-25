/**
 * The page gate's lists, held against the pages `app/` actually declares (issue #140).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PROTECTS. `/login` tells a reader bounced off an address one of two things:
 * that it is a page which needs to know who they are, or that no page answers it here. It
 * decides with `PRIVATE_PAGES`, a list the gate itself never reads — so nothing about the
 * gate would notice that list going stale. A private page added without an entry would be
 * described to its own reader as an address that does not exist; an entry left behind by a
 * page that moved would describe a typo as a page. Both are caught here, and only here — and
 * so is a page meant to be public that nobody opened, which fails the same assertion.
 *
 * WHY THE DIRECTORY AND NOT A FIXTURE, for `fly-config-agrees.test.ts`'s reason: a list of
 * routes written into this file would agree with itself forever while `app/` moved on.
 *
 * WHY NOT THE MIDDLEWARE ITSELF. `middleware.ts` imports `next/server`, which plain ESM
 * cannot resolve (the package has no exports map), so `node --test` cannot load it. It
 * decides with `isCarveOut` and `isPublic` and nothing else before it asks for a cookie, and
 * `opensWithoutSession` is those two, in `gate()`'s order — the one function `closed` below
 * and `/login`'s `destinationAt` both call, so the test and the page cannot disagree.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { PRIVATE_PAGES, destinationAt, opensWithoutSession, pageAnswers } from './page-gate.ts';

/** What the middleware's `gate()` does with no session: carve-outs and public paths pass. */
const closed = (pathname: string): boolean => !opensWithoutSession(pathname);

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');

/** The file names by which a directory under `app/` becomes an address (Next's app router). */
const ROUTE_FILE = /^(page|route)\.(tsx|ts|jsx|js)$/;

/**
 * Every address `app/` declares, spelled as `app/` spells it.
 *
 * `api/` is left out because the middleware's matcher leaves it out — the gate never runs
 * there, so no request under it can be bounced to `/login`. The rest of Next's folder rules
 * are applied rather than assumed absent: a `_private` folder is not routable, and a
 * `(group)` or `@slot` folder adds no segment to the address.
 *
 * THE LIMIT OF THE WALK: it knows `page.*` and `route.*` and nothing else. A metadata file
 * (`icon`, `opengraph-image`, `manifest.ts`) is an address too, and so is a file under
 * `public/` that neither the public prefixes nor the matcher's exclusions cover; the gate
 * would close either, this walk would not see it, and `/login` would call it no page. None
 * is in the tree today. Whoever adds one opens it in the gate's lists, or teaches this walk
 * its file name, in the same change.
 */
function declaredRoutes(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry.startsWith('_')) continue;
      if (directory === appRoot && entry === 'api') continue;
      found.push(...declaredRoutes(path));
    } else if (ROUTE_FILE.test(entry)) {
      const segments = relative(appRoot, directory)
        .split(sep)
        .filter((segment) => segment !== '')
        .filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith('@'));
      found.push(`/${segments.join('/')}`);
    }
  }
  return found;
}

/** An address the route answers: each bracketed segment filled with one plain one. */
const sampleOf = (route: string): string => route.replace(/\[\[?(\.\.\.)?[^\]]+\]\]?/g, 'sample');

const routes = [...new Set(declaredRoutes(appRoot))].sort();

/*
 * The instrument first, on answers known before they are asked — the estate's standing rule.
 * A matcher that answered `false` to everything would make every closed page look missing
 * from the list, and one that answered `true` would make every typo look like a page.
 */
test('the matcher reads a route the way app/ does', () => {
  assert.equal(pageAnswers('/account', '/account'), true);
  assert.equal(pageAnswers('/account', '/accounts'), false);
  assert.equal(pageAnswers('/account', '/account/other'), false);
  assert.equal(pageAnswers('/', '/'), true);
  assert.equal(pageAnswers('/', '/nope'), false);

  // One bracketed segment is exactly one segment, and not an empty one.
  assert.equal(pageAnswers('/instrument/[track]/[unit]', '/instrument/t/P01'), true);
  assert.equal(pageAnswers('/instrument/[track]/[unit]', '/instrument/t'), false);
  assert.equal(pageAnswers('/instrument/[track]/[unit]', '/instrument/t/P01/more'), false);
  assert.equal(pageAnswers('/instrument/[track]/[unit]', '/instrument//P01'), false);

  // A catch-all is one or more; an optional one is none or more.
  assert.equal(pageAnswers('/docs/[...slug]', '/docs/a/b'), true);
  assert.equal(pageAnswers('/docs/[...slug]', '/docs'), false);
  assert.equal(pageAnswers('/docs/[[...slug]]', '/docs'), true);
});

test('the walk finds the pages it has to, so an empty walk cannot pass', () => {
  // One of each kind the walk has to recognise: a public page, a private one, a dynamic
  // private one and a route handler. A walk rooted in the wrong directory would find none of
  // them and hold nothing.
  for (const expected of ['/', '/account', '/instrument/[track]/[unit]', '/healthz']) {
    assert.ok(routes.includes(expected), `app/ was walked and ${expected} was not found`);
  }
  assert.ok(
    !routes.some((route) => route.startsWith('/api')),
    'the walk went into app/api/, which the middleware never gates',
  );
});

test('PRIVATE_PAGES names exactly the pages the gate closes', () => {
  const closedRoutes = routes.filter((route) => closed(sampleOf(route)));

  // Each direction separately, so a failure says which kind of drift it is.
  const unnamed = closedRoutes.filter((route) => !PRIVATE_PAGES.includes(route));
  assert.deepEqual(
    unnamed,
    [],
    `the gate closes ${unnamed.join(', ')} and PRIVATE_PAGES in lib/page-gate.ts does not ` +
      'name it, so /login would tell a reader bounced off it that the address does not exist. ' +
      'If it needs an account, name it in PRIVATE_PAGES; if it does not, it was never meant ' +
      'to be closed, and PUBLIC_PATHS or PUBLIC_PREFIXES has to open it.',
  );

  const stale = PRIVATE_PAGES.filter((route) => !closedRoutes.includes(route));
  assert.deepEqual(
    stale,
    [],
    `PRIVATE_PAGES names ${stale.join(', ')}, which is not a page the gate closes — either ` +
      'no page is there any more, or the gate opens it — so /login would describe it wrongly',
  );
});

test('every private page is classified as one, query string and all', () => {
  for (const route of PRIVATE_PAGES) {
    assert.equal(destinationAt(sampleOf(route)), 'private-page', route);
    assert.equal(destinationAt(`${sampleOf(route)}?lang=pl`), 'private-page', route);
  }
});

/*
 * THE POSTURE, which issue #140's option A promises is unchanged. An address no page
 * answers is still CLOSED — the gate is private by default and a typo still meets the
 * sign-in redirect — and what changed is only that `/login` can now say what it is. The
 * near misses are the ones a prefix match would get wrong.
 */
test('an address no page answers is still closed, and is called what it is', () => {
  for (const address of ['/nope', '/accounts', '/account/nope', '/instrumental', '/labour']) {
    assert.equal(closed(address), true, `${address} must still be closed by the gate`);
    assert.equal(destinationAt(address), 'no-page', address);
  }
  assert.equal(destinationAt('/nope?from=an-old-link'), 'no-page');
});

test('an address the gate opens is not the gate sending the reader to sign in', () => {
  // These reach `/login` because a reader chose to sign in from them — the sign-in link
  // carries where they were — so the page must neither call them private nor missing.
  for (const address of [
    '/',
    '/?lang=pl',
    '/courses',
    '/read/math-for-ai-engineers/P01/en/7',
    '/lab/p01',
    '/account/deleted',
    '/login/2fa?redirect=%2Faccount',
  ]) {
    assert.equal(destinationAt(address), 'open', address);
  }
});

test('the address is resolved as the request would have been', () => {
  // Dot segments are resolved before the middleware sees a path, so they are here too.
  assert.equal(destinationAt('/read/../account'), 'private-page');
  assert.equal(destinationAt('/account/../nope'), 'no-page');
});
