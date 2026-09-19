import { NextResponse, type NextRequest } from 'next/server';

import {
  ACCESS_TOKEN_COOKIE,
  SESSION_COOKIES,
  sessionCookieAttributes,
} from '@/lib/session-cookies';
import { isPlausiblyUnexpired, verifyAccessToken } from '@/lib/server/token';

/**
 * The page gate.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * FRONTEND-BFF.md §4 — "Middleware protects PAGES only. The APIs behind the proxy still
 * enforce their own authorization — THE MIDDLEWARE IS UX, THE SERVICES ARE THE BOUNDARY.
 * Do not remove a service-side authorization check because middleware exists."
 *
 * What this file buys is that a reader who is not signed in lands on the sign-in page
 * instead of on a page that renders empty and then explains itself. It buys nothing else.
 * AbOvo.Api declares its own authorization triad in its composition root and every request
 * that reaches it is authorized there, whether it came through this app or from curl.
 * Deleting one of those checks because "middleware already handles it" removes the only
 * enforcement that exists.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ON THE FILE NAME. Next 16 deprecates `middleware.ts` in favour of `proxy.ts` and says so
 * on every build. This file keeps the old name deliberately, for two reasons and for as
 * long as `next` stays pinned at the version in package.json:
 *
 *   1. FRONTEND-BFF.md names `middleware.ts` verbatim, and §4 is written about "the
 *      middleware". A scaffold that silently renames the file the guide names makes the
 *      guide unusable as a map of the code.
 *   2. This app already has a thing called the proxy — the §5 catch-all at
 *      app/api/proxy/[...path] — and it is a different thing that does a different job.
 *      Two files called proxy, one a page gate and one a request forwarder, is worse for
 *      the next reader than one deprecation warning.
 *
 * When the pin moves, `npx @next/codemod@canary middleware-to-proxy .` performs the rename;
 * whoever does it should rename §5's route in the same commit so the collision never lands.
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
 * ab-ovo's reader loop is required to work with NO account and NO backend, so most of this
 * product is deliberately public. That is a product decision, written down here as entries
 * rather than left as an absent gate.
 */
const PUBLIC_PATHS = new Set<string>([
  '/', // the landing page
  '/login',
  '/register',
  // The platform health check. `flyio/web.fly.toml` points [[http_service.checks]] at
  // /healthz, and Fly's checker does NOT follow redirects — so without this entry the
  // check receives the 307 to /login that the middleware issues for an unauthenticated
  // request, reads it as unhealthy, and every web deploy fails. Caught by running the
  // finished image rather than by reading it: the page renders, the route answers, and
  // only the check sees the redirect.
  '/healthz',

  // What the landing page used to be. It is public for the same reason `/` is: it explains
  // the product to somebody who has not got an account and is deciding whether to want one,
  // and a sign-in form is a poor answer to "what is this".
  '/about',

  // The two index pages. They are here rather than in PUBLIC_PREFIXES because every entry
  // in that list ends in a slash — '/lab' as a prefix also matches '/labour' and
  // '/lab-admin', and a gate that opens a page nobody has written yet is a gate that will
  // one day open a page somebody has. The trailing slash costs exactly this: the index path
  // of a public section needs its own entry. Write both, or the section's front door 307s
  // while every page behind it is public.
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
  // `/account` itself is deliberately NOT here. It is the only page under this prefix that
  // is public, which is why there is no `/account/` entry in PUBLIC_PREFIXES.
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

  // The same failure mode as the two above, on the frame's own maths rather than the lab's
  // runtime: without this entry every request for public/katex/katex.min.css or one of its
  // fonts is a 307 to /login, KaTeX's system-font fallback quietly hides the break (a
  // maths span still renders, in the wrong typeface, so nothing looks broken), and the
  // page ships looking fine while every reader pays for a redirect on every visit.
  '/katex/', // KaTeX's stylesheet and fonts — scripts/prepare-katex-assets.mjs
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

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isCarveOut(pathname: string): boolean {
  return CARVE_OUT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * FRONTEND-BFF.md §4 / Checklist item 4 — "On invalid or expired token, clear BOTH cookies
 * and redirect to login preserving the intended destination as `?redirect=<intended>`."
 *
 * Note the plural the guide uses: the session is two cookies. Clearing only the access
 * cookie leaves a refresh token that mints a new session on the next request, which is a
 * logout that does not log anybody out.
 *
 * The cookies are deleted with the attributes from `sessionCookieAttributes()` — the same
 * object the set path uses. §8: "Login loop after logout — Cookie deleted with different
 * attributes than it was set with."
 */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);

  // The intended destination, path and query together: a reader bounced off
  // /read/P12?frame=7 must come back to frame 7, not to the top of the program.
  const intended = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', intended);

  const response = NextResponse.redirect(loginUrl);
  const attributes = sessionCookieAttributes();
  for (const name of SESSION_COOKIES) {
    response.cookies.set({ name, value: '', ...attributes, maxAge: 0 });
  }
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Carve-outs first, before anything looks at a cookie: these requests are unauthenticated
  // by construction and must reach their page with the query string they arrived with.
  if (isCarveOut(pathname)) return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return redirectToLogin(request);

  // FRONTEND-BFF.md §4 step 1 — the cheap `exp` decode, as a FAST PATH.
  //
  // Its only job is to skip the network round trip for a cookie that is plainly stale. It
  // is placed before the verify and it does not replace it: the recorded failure is
  // middleware that stopped here, and accepted any base64 payload with a future expiry.
  if (!isPlausiblyUnexpired(token)) return redirectToLogin(request);

  // FRONTEND-BFF.md §4 step 2 — the actual authentication. Signature, issuer, audience,
  // against the JWKS authservice publishes.
  const verification = await verifyAccessToken(token);

  if (verification.status === 'valid') return NextResponse.next();

  // 'unverifiable' means the key set could not be reached, not that the token is forged.
  // A gate fails closed either way — but it fails closed to the SIGN-IN page rather than
  // to a blank error, and the API behind the proxy is still enforcing regardless, so a
  // brief identity-service outage costs a redirect and not a security hole.
  return redirectToLogin(request);
}

export const config = {
  matcher: [
    /*
     * Pages only.
     *
     * `api` is excluded because the BFF routes under /api are not pages and do their own
     * work: the proxy of §5 reads the cookie and injects the bearer server-side, and
     * /api/config must answer before a reader is signed in. Running a page redirect over
     * them would turn a 401 into a 307 to an HTML document, which no fetch caller can use.
     *
     * The static exclusions keep the gate off assets: a redirect on a stylesheet is a page
     * that renders unstyled rather than a page that asks anybody to sign in.
     */
    '/((?!api/|_next/static/|_next/image/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)',
  ],
};
