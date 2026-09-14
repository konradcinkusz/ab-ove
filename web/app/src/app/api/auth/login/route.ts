import { NextResponse } from 'next/server';

import { backendConfigured } from '@/lib/server/backends';
import { establishSession } from '@/lib/server/session';
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

/**
 * Cross-site login is an attack, not an edge case.
 *
 * A form on another site can POST here with the attacker's own credentials, and — because
 * the response SETS the session cookie rather than reading one — `sameSite: strict` does
 * nothing about it. The reader carries on believing they are signed in as themselves while
 * everything they do lands in the attacker's account; for this product that means their
 * reading progress syncs somewhere they cannot see.
 *
 * `Origin` is the defence because a browser sets it on every POST and a page cannot forge
 * it. A request without one is refused rather than trusted: every caller this route has is
 * a browser making a same-origin request, so an absent `Origin` is a caller this route was
 * not built for.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  /*
   * The host as the reader's browser addressed it. Either header counts, and what the two
   * of them actually contain was measured rather than assumed — an earlier draft of this
   * function read `x-forwarded-host` first on the stated belief that "Fly rewrites host",
   * which was a belief and not a measurement.
   *
   * Put to a production `next start` with a probe route:
   *
   *   no proxy headers sent  ->  host: 127.0.0.1:3000   x-forwarded-host: 127.0.0.1:3000
   *   client sends one       ->  host: 127.0.0.1:3000   x-forwarded-host: evil.example
   *
   * So Next SYNTHESISES `x-forwarded-host` from `host` when nothing upstream sent one, and
   * passes a client-supplied one through untouched. Two consequences, and they pull in
   * opposite directions:
   *
   *   - reading either header is enough in every topology, because when no proxy sets one
   *     Next has already copied `host` into it;
   *   - `x-forwarded-host` is therefore an input a CALLER can choose.
   *
   * The second is not a weakness HERE, and the reason is the threat model rather than a
   * mitigation. This check exists to stop login CSRF, which needs a VICTIM'S BROWSER to make
   * the request: a cross-site HTML form cannot set a header at all, and a cross-site `fetch`
   * that tried would trip a CORS preflight this route does not answer. The only client that
   * can set `x-forwarded-host` is one like `curl`, which has no victim's session to ride and
   * is simply posting its own credentials to get its own cookie — which is what the route is
   * for. A forgeable header adds nothing to an attacker who has no victim.
   *
   * Do not narrow this to `host` alone on the strength of that paragraph. The measurement
   * above is of one Next version on one machine; accepting either is what makes the check
   * independent of both that and of what any proxy in front does.
   */
  const candidates = ['x-forwarded-host']
    .map((name) => request.headers.get(name))
    // A comma-separated list means several hops; the first is the one the browser used.
    .map((value) => value?.split(',')[0]?.trim())
    .filter((value): value is string => !!value);

  return candidates.includes(originHost);
}

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
function problemFor(outcome: Exclude<SignInOutcome, { kind: 'signed-in' }>): SignInProblemCode {
  switch (outcome.kind) {
    case 'second-factor-required':
      return 'second-factor';
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
 * the reader actually used, which is the property that matters here: the only absolute
 * origin available on this side is `request.url`, and behind a TLS-terminating proxy that
 * is reconstructed from headers rather than from what the browser typed. Measured locally,
 * a request to `127.0.0.1:3100` produced a `Location` naming `localhost:3100` — harmless
 * there, and the same mechanism on Fly names the container's own host.
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

  const outcome = await signIn(credentials.email, credentials.password);
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
