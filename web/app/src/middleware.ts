import { NextResponse, type NextRequest } from 'next/server';

import {
  ACCESS_TOKEN_COOKIE,
  SESSION_COOKIES,
  sessionCookieAttributes,
} from '@/lib/session-cookies';
import { READER_ID_COOKIE, readerCookieAttributes } from '@/lib/reader-cookie';
import { isCarveOut, isPublic } from '@/lib/page-gate';
import { isPlausiblyUnexpired, verifyAccessToken } from '@/lib/server/token';

/**
 * The page gate.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * FRONTEND-BFF.md §4 — "Middleware protects PAGES only. The APIs behind the proxy still
 * enforce their own authorization — THE MIDDLEWARE IS UX, THE SERVICES ARE THE BOUNDARY.
 * Do not remove a service-side authorization check because middleware exists."
 *
 * What the AUTH half of this file buys is that a reader who is not signed in lands on the
 * sign-in page instead of on a page that renders empty and then explains itself.
 * `AbOvo.Api` declares its own authorization triad in its composition root and every request
 * that reaches it is authorized there, whether it came through this app or from curl.
 * Deleting one of those checks because "middleware already handles it" removes the only
 * enforcement that exists.
 *
 * ONE THING WAS ADDED THAT IS NOT UX: ADR-0061's anonymous reader-id cookie is minted here,
 * on every page response that arrives without one, because this is the one place that
 * already runs on every page request and already sets cookies. It is not a second gate —
 * nothing here reads it or decides anything from it — this file only ensures it exists so a
 * Server Component reading content has a cursor to send `AbOvo.Api`.
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

/*
 * THE LISTS THIS GATE DECIDES WITH — PUBLIC_PATHS, PUBLIC_PREFIXES and CARVE_OUT_PREFIXES,
 * with the reasoning for every entry — are in `lib/page-gate.ts`, moved there word for word
 * so `/login` can put the gate's own question to the address it was handed (issue #140).
 * The direction is unchanged: private by default, opted out one at a time, and a public
 * page is still an entry in those lists. A private page still needs no entry the gate
 * reads. It needs one the gate does NOT read — `PRIVATE_PAGES`, beside them, which is how
 * `/login` knows a real page from a typo — and `page-gate.test.ts` fails until it has one.
 */

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

async function gate(request: NextRequest, pathname: string): Promise<NextResponse> {
  // Carve-outs first, before anything looks at a cookie: these requests are unauthenticated
  // by construction and must reach their page with the query string they arrived with.
  //
  // This exit and the one below are restated in one place, `opensWithoutSession` in
  // `lib/page-gate.ts`, for `/login` to explain the gate with (issue #140). An exit added here
  // is added there too, or `/login` and `page-gate.test.ts` go on believing the gate closes
  // what it now opens.
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

/**
 * ADR-0061 — mint the anonymous reader's cursor cookie if this request did not already carry
 * one, on WHATEVER response the gate above produced (a redirect included: a cookie set on a
 * redirect response is still stored by the browser before it follows the Location header).
 *
 * Never overwrites an existing value. A reader's furthest step lives server-side, keyed by
 * this cookie's value (ADR-0060) — replacing it would silently start a new, empty cursor for
 * somebody who has already read forty frames.
 */
function ensureReaderCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (request.cookies.has(READER_ID_COOKIE)) return response;

  response.cookies.set({
    name: READER_ID_COOKIE,
    value: crypto.randomUUID(),
    ...readerCookieAttributes(),
  });
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const response = await gate(request, request.nextUrl.pathname);
  return ensureReaderCookie(request, response);
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
