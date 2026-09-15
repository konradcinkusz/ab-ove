import { NextResponse } from 'next/server';

import { backendConfigured } from '@/lib/server/backends';
import { clearChallenge, readChallenge } from '@/lib/server/challenge';
import { readerAddress } from '@/lib/server/client-ip';
import { isSameOrigin } from '@/lib/server/same-origin';
import { establishSession } from '@/lib/server/session';
import { completeSecondFactor, type SecondFactor } from '@/lib/server/second-factor';
import { safeRedirectTarget } from '@/lib/redirect-target';
import type { SignInProblemCode } from '@/lib/sign-in-problem';

/**
 * POST /api/auth/2fa — the second step of a sign-in that came back as a challenge.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT IS THE SAME ROUTE AS `/api/auth/login`, ONE FACTOR LATER, AND IT IS SHAPED THE SAME.
 *
 * Same same-origin guard, same two body shapes, same 303-or-status split, same
 * `establishSession` at the end — because the tokens that come out of this are the tokens
 * that come out of that, and anything downstream that could tell which factor produced
 * them would be a place where a session's provenance leaked.
 *
 * What differs is the credential. The challenge comes from a COOKIE rather than the body:
 * it is a token proving the password was right, and `session-cookies.ts` records why it is
 * not in the document. The reader supplies only the thing they know.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE CHALLENGE IS CLEARED ON EVERY PATH OUT OF HERE EXCEPT ONE. A wrong code leaves it,
 * because the reader may try again and the challenge is still good; everything else —
 * success, expiry, lockout, our own failures — removes it, because in none of those cases
 * can it be used again and a credential nobody can spend should not sit in a browser.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_DESTINATION = '/';

interface Submission {
  readonly factor: SecondFactor | null;
  readonly redirectTo: string | null;
  readonly wantsRedirect: boolean;
}

/**
 * Read the code out of either shape this route accepts.
 *
 * TRIMMED, unlike a password, and the difference is not inconsistency. A password's
 * leading space is part of the password; an authenticator code is six digits and a
 * recovery code is a printed string, and both arrive from a clipboard often enough that a
 * trailing space would be the commonest way to be told a correct code is wrong.
 *
 * The CODE WINS when both are present, which mirrors authservice's own handler — it tests
 * `Code` first and ignores a recovery code beside it. Deciding it here means the reader is
 * never silently charged a single-use recovery code because a field was left filled in.
 */
async function readSubmission(request: Request): Promise<Submission | null> {
  const contentType = request.headers.get('content-type') ?? '';

  const build = (code: string, recoveryCode: string, redirect: string, form: boolean): Submission => ({
    factor: code
      ? { kind: 'code', value: code }
      : recoveryCode
        ? { kind: 'recovery-code', value: recoveryCode }
        : null,
    redirectTo: safeRedirectTarget(redirect),
    wantsRedirect: form,
  });

  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      return build(
        String(form.get('code') ?? '').trim(),
        String(form.get('recoveryCode') ?? '').trim(),
        String(form.get('redirect') ?? ''),
        true,
      );
    }

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      const str = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');
      return build(str('code'), str('recoveryCode'), str('redirect'), false);
    }
  } catch {
    return null;
  }

  return null;
}

const PROBLEM_STATUS: Readonly<Record<SignInProblemCode, number>> = {
  incomplete: 400,
  rejected: 401,
  locked: 423,
  unverified: 403,
  'second-factor': 409,
  'second-factor-rejected': 401,
  'second-factor-expired': 410,
  'rate-limited': 429,
  unavailable: 502,
  'token-rejected': 500,
  unverifiable: 502,
  'not-configured': 501,
};

/**
 * Where a problem sends a form caller.
 *
 * AN EXPIRED CHALLENGE GOES BACK TO `/login`, NOT TO THIS SCREEN. There is nothing left to
 * send from here, so a code screen offering the form again would be asking for something it
 * cannot use — the sign-in loop the problem set exists to prevent, at the one step where
 * the reader has already typed a correct password.
 */
function pageFor(problem: SignInProblemCode, redirectTo: string | null): string {
  const restart = problem === 'second-factor-expired' || problem === 'locked';
  const query = new URLSearchParams({ error: problem });
  if (redirectTo) query.set('redirect', redirectTo);
  return `${restart ? '/login' : '/login/2fa'}?${query.toString()}`;
}

/** 303, not 302: the browser must follow with GET, or a reload re-submits the code. */
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

  const submission = await readSubmission(request);
  if (!submission) {
    return NextResponse.json(
      { error: 'expected a form or JSON body' },
      { status: 415, headers: { 'cache-control': 'no-store' } },
    );
  }

  const fail = (problem: SignInProblemCode): NextResponse =>
    submission.wantsRedirect
      ? seeOther(pageFor(problem, submission.redirectTo))
      : NextResponse.json(
          { problem },
          { status: PROBLEM_STATUS[problem], headers: { 'cache-control': 'no-store' } },
        );

  // P8, and the same answer the first step gives: a deployment with no identity service is
  // supported, and this screen is unreachable in one, so arriving here means the request
  // did not come from it.
  if (!backendConfigured('authservice')) return fail('not-configured');

  const challengeToken = await readChallenge();
  if (!challengeToken) {
    // No cookie is what a reader who waited too long, or who arrived here directly, has.
    // It is not reported as a fault and it costs no lockout attempt, because nothing is
    // sent: `completeSecondFactor` would refuse it anyway, and refusing it here is cheaper.
    return fail('second-factor-expired');
  }

  if (!submission.factor) return fail('incomplete');

  const outcome = await completeSecondFactor(
    challengeToken,
    submission.factor,
    fetch,
    readerAddress(request),
  );

  // A wrong code is the ONE outcome that leaves the challenge alone: it is still good, and
  // the reader has attempts left. Everything else has finished with it.
  if (outcome.kind !== 'rejected') await clearChallenge();

  switch (outcome.kind) {
    case 'rejected':
      return fail('second-factor-rejected');
    case 'challenge-expired':
      return fail('second-factor-expired');
    case 'locked':
      return fail('locked');
    case 'rate-limited':
      return fail('rate-limited');
    case 'unavailable':
      return fail('second-factor');
    case 'signed-in':
      break;
  }

  /**
   * The same verification the first factor's tokens go through, and for the same reason: a
   * token authservice minted is not yet a session until this deployment's expected issuer
   * and audience have been checked against the one that signed it.
   *
   * A rejection here is not a credential failure — the reader has just proved two factors —
   * so it must not be reported as one.
   */
  const session = await establishSession(outcome.accessToken, outcome.refreshToken);

  if (session.status === 'rejected') return fail('token-rejected');
  if (session.status === 'unverifiable') return fail('unverifiable');

  const destination = submission.redirectTo ?? DEFAULT_DESTINATION;

  return submission.wantsRedirect
    ? seeOther(destination)
    : new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
