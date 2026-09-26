/**
 * Which addresses the page gate opens without a session, and which pages stand behind it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THE GATE'S LISTS LIVE HERE AND NOT IN `middleware.ts`, WHERE THEY WERE WRITTEN.
 *
 * Two things read them now. The middleware DECIDES with them, exactly as it did before they
 * moved: PUBLIC_PATHS, PUBLIC_PREFIXES, CARVE_OUT_PREFIXES, `isPublic` and `isCarveOut` are
 * the middleware's own, word for word, and the gate is still private by default
 * (FRONTEND-BFF.md §4). And `/login` EXPLAINS with them (issue #140). A reader bounced off
 * an address no page answers — a typo, an old link — used to be told it was "one of the few
 * pages that needs to know who you are", because the sign-in page could not tell `/nope`
 * from `/account`. Telling them apart needs the gate's own answer to "does this address need
 * a session?", and a second copy of that answer in the page would be a copy that drifts.
 *
 * So this module imports nothing — no `next/server`, no `@/` alias — which is what lets the
 * Edge bundle, a Server Component and `node --test` load the same file. `page-gate.test.ts`
 * holds it against every page `app/` declares.
 *
 * It is a security-relevant path for the reason the middleware is: one entry added to the
 * public lists removes authentication from a page, and nothing fails a build. So
 * `.github/CODEOWNERS` names it beside `middleware.ts`, in the Auth section
 * (REPO-BASELINE.md §1).
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * FRONTEND-BFF.md §4 / Checklist item 4 — "Middleware carries an explicit public-route
 * list; routes are PRIVATE BY DEFAULT and opted out one at a time."
 *
 * The default direction is the whole point. A list of private routes fails open: the page
 * somebody forgets to add is a page with no gate, and nothing about it looks wrong. This
 * list fails closed: the page somebody forgets to add redirects to sign-in, which is
 * noticed immediately.
 *
 * ab-ovo's reader loop requires NO account (ADR-0004, corrected by ADR-0060: it does now
 * require a live API, which is a separate axis from this gate entirely — this list decides
 * who needs to sign in, not who needs a network), so most of this product is deliberately
 * public. That is a product decision, written down here as entries rather than left as an
 * absent gate.
 */
const PUBLIC_PATHS = new Set<string>([
  '/', // the landing page, which is the index of programs (ADR-0036)
  // What the landing page used to be: the product's argument and the anti-goal it commits
  // to in public. Public for the same reason `/` is — it needs no account, and a reader
  // deciding whether to trust what this system measures must not have to register first.
  '/about',
  // The courses this deployment carries, and the way into each one (ADR-0048). Public on the
  // index's own terms: it is a step in the reader loop — the one that says which course — and
  // it reads content compiled into the app, so an account would gate a page that needs
  // nothing an account provides.
  '/courses',
  '/login',
  '/register',
  // The platform health check. `flyio/web.fly.toml` points [[http_service.checks]] at
  // /healthz, and Fly's checker does NOT follow redirects — so without this entry the
  // check receives the 307 to /login that the middleware issues for an unauthenticated
  // request, reads it as unhealthy, and every web deploy fails. Caught by running the
  // finished image rather than by reading it: the page renders, the route answers, and
  // only the check sees the redirect.
  '/healthz',

  // The two index paths. They are here rather than in PUBLIC_PREFIXES because every entry
  // in that list ends in a slash — '/lab' as a prefix also matches '/labour' and
  // '/lab-admin', and a gate that opens a page nobody has written yet is a gate that will
  // one day open a page somebody has. The trailing slash costs exactly this: the index path
  // of a public section needs its own entry. Write both, or the section's front door 307s
  // while every page behind it is public.
  //
  // '/read' is now a 308 to '/' (ADR-0036) and STILL BELONGS HERE. A redirect is a response
  // like any other, so removing this entry would answer an anonymous reader with a bounce
  // to '/login' on the way to a page that needs no account — the redirect would never run.
  '/lab',
  '/read',

  // The page a reader lands on once their account is gone, and it HAS to be public for a
  // reason that is only visible by following the redirect: the deletion route's last act
  // is to clear the session cookies, so by the time the browser follows the 303 there is
  // no cookie left. Private, this page would bounce the reader to
  // `/login?redirect=/account/deleted` — a sign-in form for the account they have just
  // deleted. Nothing warns: the route answers 303 and succeeds, and the page renders
  // perfectly well for anybody who still has a session.
  //
  // `/account` and `/account/delete` are deliberately NOT here: the overview and the deletion
  // screen are the account's, and both need a session. This is the only page under the
  // prefix that is public, which is why there is no `/account/` entry in PUBLIC_PREFIXES —
  // and why the deletion screen's address, one letter shorter than this one, is gated.
  '/account/deleted',
]);

const PUBLIC_PREFIXES: readonly string[] = [
  '/read/', // the frames — the reader loop needs no account
  '/lab/', // the Pyodide exercise pane — runs in the browser, needs no account
  '/legal/', // see the carve-outs below

  // The bytes the reader loop is MADE of, not merely the pages that frame it.
  //
  // These are files under public/, and public/ is served by the Next server at root paths,
  // so — unlike _next/static/ — they do reach this matcher. Without these two entries the
  // lab pane renders, asks for its runtime, and is handed a 307 to /login for every asset:
  // the page looks fine and sits on "loading Python…" for ever. Measured on both `next
  // start` and the standalone server, and asserted by tests/e2e/specs/lab-p01.spec.ts,
  // which checks the status code with maxRedirects: 0 — followed, the redirect returns the
  // login page as 200 and the test passes for the wrong reason.
  //
  // They are here rather than in the matcher's exclusion list because that list is for
  // things that are not the product's business, and these are: the book is readable, and
  // its exercises runnable, with no account at all (ADR-0004). That is a product decision
  // and it belongs in the list a reviewer greps for product decisions.
  '/book/', // the fetched book content, pinned — web/content/book.lock.json
  '/pyodide/', // the Python runtime, vendored and served from our own origin (FRONTEND-BFF §1)
  // And the maths. Same class as the two above and a worse failure than either: KaTeX falls
  // back to system fonts when its faces 307 to /login, so the page renders, nothing errors,
  // and the maths is merely a bit wrong — where the lab at least sits visibly on "loading
  // Python…" for ever. scripts/prepare-katex-assets.mjs stages these.
  '/katex/',
];

/**
 * FRONTEND-BFF.md §4 — "Middleware carries carve-outs so OAuth callbacks and legal pages
 * keep their query strings instead of being bounced through the login redirect."
 *
 * §8 names the symptom: "OAuth callback loses its parameters — Middleware redirect lacks
 * the callback carve-out." A callback arrives unauthenticated BY CONSTRUCTION — it is
 * carrying the thing that will make it authenticated — so a gate that treats "no cookie"
 * as "go and sign in" sends the reader back to the start of the flow, minus the `code` and
 * `state` that were the point of the request.
 *
 * Legal pages are here for a different reason with the same shape: a consent or policy
 * link carries the parameters that say where the reader came from, and they must survive.
 */
const CARVE_OUT_PREFIXES: readonly string[] = ['/auth/callback', '/login/2fa', '/legal/'];

export function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isCarveOut(pathname: string): boolean {
  return CARVE_OUT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Whether the gate lets `pathname` through before it asks for a cookie: the early exits at
 * the top of middleware.ts's `gate()`, carve-outs then public paths, in its order.
 *
 * `gate()` calls `isCarveOut` and `isPublic` itself, so its code reads as it did before the
 * lists moved. This is the one restatement of those exits, for what EXPLAINS the gate rather
 * than running it — `destinationAt` below, and `page-gate.test.ts` — so the page and the
 * test cannot come to disagree. An early exit added to `gate()` belongs here too.
 */
export function opensWithoutSession(pathname: string): boolean {
  return isCarveOut(pathname) || isPublic(pathname);
}

/**
 * The pages the gate closes, NAMED — issue #140.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE GATE NEVER READS THIS LIST, AND IT MUST NOT START TO. The comment over PUBLIC_PATHS
 * says why: a list of private routes fails open, and the page somebody forgets to add is a
 * page with no gate. The gate stays private by default and closes every address not opened
 * above, whether a page stands behind it or not.
 *
 * This list exists so `/login` can tell the reader the truth about an address the gate
 * closed: either it is one of these pages, and signing in opens it, or no page answers it
 * at all, and signing in would not change that. Forgetting an entry here therefore fails
 * the other way from forgetting one above — the reader of a real private page would be told
 * the address does not exist — and `page-gate.test.ts` is what stops it: it walks `app/`
 * and holds this list EQUAL to the pages the gate closes.
 *
 * Spelled as `app/` spells a route, so an entry reads as the directory it names: a
 * bracketed segment is any one segment.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export const PRIVATE_PAGES: readonly string[] = [
  '/account', // the reader's overview: who is signed in, their place, export, sign-out
  '/account/delete', // the deletion screen, one link from the overview (issue #161)
  '/instrument', // the author's view: frames ranked by how badly the book is doing
  '/instrument/[track]/[unit]', // one program's frames, under that view
];

/**
 * Whether `pathname` is an address the route `pattern` declares, by `app/`'s own rules: a
 * bracketed segment is any one segment, a catch-all (`[...x]`) is one or more, and an
 * optional catch-all (`[[...x]]`) is none or more. `pageAnswers` rather than a regex per
 * entry, so the list above stays in the spelling a reader can check against the directory.
 */
export function pageAnswers(pattern: string, pathname: string): boolean {
  const wanted = pattern.split('/').slice(1);
  const given = pathname.split('/').slice(1);

  for (const [index, segment] of wanted.entries()) {
    if (segment.startsWith('[[...')) return true;
    if (segment.startsWith('[...')) return given.length > index && given[index] !== '';
    if (index >= given.length) return false;
    if (segment.startsWith('[')) {
      if (given[index] === '') return false;
    } else if (segment !== given[index]) {
      return false;
    }
  }
  return wanted.length === given.length;
}

/**
 * What stands at a destination carried into `/login` as `?redirect=`.
 *
 *   'open'          the gate lets it through with no session, so the gate did not send the
 *                   reader here — they chose to sign in from a page they were on.
 *   'private-page'  the gate closes it and a page stands behind it: signing in opens it.
 *   'no-page'       the gate closes it and nothing stands behind it. A mistyped or stale
 *                   address, closed only because the gate is private by default.
 */
export type Destination = 'open' | 'private-page' | 'no-page';

/**
 * Classify a same-origin path, query and all, as `safeRedirectTarget` passes it.
 *
 * It is parsed as a URL rather than cut at the `?` so the question is put to the pathname
 * the middleware would have seen for the same address — dot segments resolved, and the
 * query and fragment gone. The base is never used for anything but the parse.
 */
export function destinationAt(target: string): Destination {
  const { pathname } = new URL(target, 'http://page-gate.invalid');

  if (opensWithoutSession(pathname)) return 'open';

  return PRIVATE_PAGES.some((pattern) => pageAnswers(pattern, pathname))
    ? 'private-page'
    : 'no-page';
}
