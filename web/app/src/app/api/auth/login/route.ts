import { NextResponse } from 'next/server';

import { backendConfigured } from '@/lib/server/backends';
import { readerAddress } from '@/lib/server/client-ip';
import { isSameOrigin } from '@/lib/server/same-origin';
import { establishSession } from '@/lib/server/session';
import { storeChallenge } from '@/lib/server/challenge';
import { signIn, type SignInOutcome } from '@/lib/server/sign-in';
import { safeRedirectTarget } from '@/lib/redirect-target';
import type { SignInProblemCode } from '@/lib/sign-in-problem';

/**
 * POST /api/auth/login — the password sign-in.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SECOND ROUTE AND NOT THE PROXY.
 *
 * FRONTEND-BFF.md §5 forbids "a hand-written route per backend" — and means the PROXY:
 * one catch-all fronting the estate, so the client keeps one base URL and the bearer
 * injection has one copy. This is not a proxy. It is §3's session establishment, which the
 * guide already gives its own route, and the distinguishing property is that it does NOT
 * pass the upstream body through: the tokens authservice mints are consumed here and the
 * browser is told a status.
 *
 * Going through the proxy instead would have worked and would have put the access token and
 * the refresh token into the document, in JavaScript, for as long as it took to hand them
 * back. That is §8's "Token visible in devtools/localStorage" with a shorter fuse, and it
 * is avoidable for a password form even though it is unavoidable for an OAuth callback.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The route answers a PLAIN HTML FORM. No JavaScript is involved on the happy path, which
 * is deliberate: the reading surface works without script, and a sign-in that did not would
 * be the first thing in the product to require it. A form post gets a 303 and a `Location`;
 * a JSON caller gets a status and a problem code.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Where a reader goes when sign-in worked and nothing said where they were headed. */
const DEFAULT_DESTINATION = '/';

interface Credentials {
  readonly email: string;
  readonly password: string;
  readonly redirectTo: string | null;
  /**
   * Whether this caller is a plain HTML form, and therefore whether the answer is a 303 or
   * a status. It is decided HERE, by the branch that actually parsed the body, rather than
   * by a second `content-type` test beside the first: two reads of one header are two
   * chances for a form post to be handed a JSON answer it cannot do anything with.
   */
  readonly wantsRedirect: boolean;
}

/**
 * Read the credentials out of either shape the route accepts.
 *
 * Both are read as text and trimmed only on the email: a password's leading or trailing
 * space is part of the password, and trimming it is a silent wrong answer that presents as
 * "the password I set does not work".
 */
async function readCredentials(request: Request): Promise<Credentials | null> {
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      return {
        email: String(form.get('email') ?? '').trim(),
        password: String(form.get('password') ?? ''),
        redirectTo: safeRedirectTarget(String(form.get('redirect') ?? '')),
        wantsRedirect: true,
      };
    }

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      return {
        email: typeof body['email'] === 'string' ? body['email'].trim() : '',
        password: typeof body['password'] === 'string' ? body['password'] : '',
        redirectTo: safeRedirectTarget(
          typeof body['redirect'] === 'string' ? body['redirect'] : undefined,
        ),
        wantsRedirect: false,
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** This app's outcomes, mapped onto the codes the sign-in page knows how to render. */
/**
 * `second-factor-required` is excluded as well as `signed-in`, and the type says so rather
 * than a comment: both are handled in `POST` before this is reached, and neither is a
 * problem to report. A future outcome that forgets to handle one fails to compile here.
 */
function problemFor(
  outcome: Exclude<SignInOutcome, { kind: 'signed-in' | 'second-factor-required' }>,
): SignInProblemCode {
  switch (outcome.kind) {
    case 'rejected':
      return 'rejected';
    case 'locked':
      return 'locked';
    case 'email-unverified':
      return 'unverified';
    case 'rate-limited':
      return 'rate-limited';
    case 'unavailable':
      return 'unavailable';
  }
}

/**
 * The HTTP status for a problem.
 *
 * A JSON caller gets these; a form caller gets a 303 whatever happened, because a form post
 * that answers 401 with a body leaves the reader looking at a bare error document with no
 * way back. The statuses are here rather than inline so the two callers cannot come to
 * different conclusions about the same outcome.
 */
const PROBLEM_STATUS: Readonly<Record<SignInProblemCode, number>> = {
  incomplete: 400,
  rejected: 401,
  locked: 423,
  unverified: 403,
  'second-factor': 409,
  // A wrong code is the same class as a wrong password, and an expired challenge is a
  // request this app can no longer complete — 410 rather than 401, because the thing that
  // is gone is the challenge and not the credentials.
  'second-factor-rejected': 401,
  'second-factor-expired': 410,
  'rate-limited': 429,
  // Ours, not theirs. A 5xx is the honest class for all three: the credentials may have
  // been perfect and this deployment could not turn them into a session.
  unavailable: 502,
  'token-rejected': 500,
  unverifiable: 502,
  'not-configured': 501,
};

/**
 * The sign-in page, carrying what went wrong and where the reader was headed.
 *
 * Built as a PATH rather than an absolute URL, and so is every other `Location` this route
 * emits. RFC 7231 allows a relative one and every browser resolves it against the address
 * the reader actually used, which is the property that matters here.
 *
 * The only absolute origin available on this side is `request.url`, and it does not name
 * the address the browser used. Measured twice, on a production `next start`: a request to
 * `127.0.0.1:3000` gives `request.url` of `http://localhost:3000/...` while the `host`
 * header says `127.0.0.1:3000`, so it is not even reconstructed from the header — it is the
 * server's own origin. An absolute `Location` built from it named `localhost:3100` for a
 * request nobody made to localhost. Harmless there; behind Fly it would name the
 * container.
 */
function loginPagePath(problem: SignInProblemCode, redirectTo: string | null): string {
  const query = new URLSearchParams({ error: problem });
  if (redirectTo) query.set('redirect', redirectTo);
  return `/login?${query.toString()}`;
}

/**
 * 303, not 302: the reader's browser must follow it with GET. A 302 after a POST is
 * permitted to repeat the POST, which here means re-submitting a password on a reload.
 */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'this route accepts same-origin requests only' },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  }

  const credentials = await readCredentials(request);
  if (!credentials) {
    return NextResponse.json(
      { error: 'expected a form or JSON body' },
      { status: 415, headers: { 'cache-control': 'no-store' } },
    );
  }

  const fail = (problem: SignInProblemCode): NextResponse =>
    credentials.wantsRedirect
      ? seeOther(loginPagePath(problem, credentials.redirectTo))
      : NextResponse.json(
          { problem },
          { status: PROBLEM_STATUS[problem], headers: { 'cache-control': 'no-store' } },
        );

  // P8 — a deployment with no identity service is a supported state. The page does not
  // render a form in that case, so reaching here means the request did not come from it;
  // answering "not configured" is still better than a 45-second walk down a ladder of
  // addresses nobody said were there.
  if (!backendConfigured('authservice')) return fail('not-configured');

  if (!credentials.email || !credentials.password) return fail('incomplete');

  /*
   * The reader's own address goes with the credentials, so authservice's rate limit is theirs
   * rather than everybody's. `readerAddress` returns null unless this deployment has said a
   * proxy is in front of it — see `client-ip.ts` for why forwarding a client-supplied header
   * would be worse than forwarding nothing.
   */
  const outcome = await signIn(
    credentials.email,
    credentials.password,
    fetch,
    readerAddress(request),
  );

  /**
   * A CHALLENGE IS NOT A FAILURE, and it is handled before the failure mapping so that it
   * cannot be turned into one.
   *
   * The password was correct. What comes back is a five-minute token that buys exactly one
   * thing — the right to present a second factor — so it is stored the way every other
   * credential in this app is stored (HttpOnly, never in the document; see
   * `session-cookies.ts` for why a hidden field was refused) and the reader is sent to the
   * screen that asks for the code.
   *
   * The destination survives the detour: a reader bounced off `/instrument` must land on
   * `/instrument` when the second factor completes, not on the top of the site.
   */
  if (outcome.kind === 'second-factor-required') {
    await storeChallenge(outcome.challengeToken, outcome.expiresIn);

    const next = new URLSearchParams();
    if (credentials.redirectTo) next.set('redirect', credentials.redirectTo);
    const query = next.toString();
    const destination = query ? `/login/2fa?${query}` : '/login/2fa';

    return credentials.wantsRedirect
      ? seeOther(destination)
      : NextResponse.json(
          { secondFactorRequired: true, next: destination },
          { status: 200, headers: { 'cache-control': 'no-store' } },
        );
  }

  if (outcome.kind !== 'signed-in') return fail(problemFor(outcome));

  /**
   * authservice accepted the password. That is not yet a session: the token it minted is
   * verified against the JWKS before it is stored, exactly as a token handed over by an
   * OAuth callback would be.
   *
   * A rejection HERE is not a credential failure — authservice had just authenticated the
   * reader to mint it — so it must not be reported as one. It means this deployment's
   * expected issuer or audience disagrees with the one signing the token, which no password
   * will ever get past. See `establishSession`.
   */
  const session = await establishSession(outcome.accessToken, outcome.refreshToken);

  if (session.status === 'rejected') return fail('token-rejected');
  if (session.status === 'unverifiable') return fail('unverifiable');

  const destination = credentials.redirectTo ?? DEFAULT_DESTINATION;

  return credentials.wantsRedirect
    ? seeOther(destination)
    : new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
