import { NextResponse } from 'next/server';

import { registerHref } from '@/lib/account-href';
import { indexHref } from '@/lib/index-href';
import { isLanguageTag } from '@/lib/language/store';
import { backendConfigured } from '@/lib/server/backends';
import { readerAddress } from '@/lib/server/client-ip';
import { isSameOrigin } from '@/lib/server/same-origin';
import { establishSession } from '@/lib/server/session';
import { consentVersions, registerAccount } from '@/lib/server/register';
import { safeRedirectTarget } from '@/lib/redirect-target';
import type { RegistrationNoticeCode, RegistrationProblemCode } from '@/lib/registration-problem';

/**
 * POST /api/auth/register — creating an account.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT IS `/api/auth/login` ONE STEP EARLIER, AND IT IS SHAPED THE SAME.
 *
 * Same same-origin guard, same two body shapes, same 303-or-status split, same
 * `establishSession` at the end. The reasons are `login/route.ts`'s and are written out
 * there: this is FRONTEND-BFF.md §3's session establishment rather than §5's proxy,
 * because the tokens authservice mints are consumed HERE and the browser is told a status.
 * Going through the proxy would have put a token into the document for as long as it took
 * to hand it back, which is avoidable for a form and therefore avoided.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IS NEW HERE IS THE CONSENT, and it is the reason this route makes TWO calls to
 * authservice rather than one. `AuthController.Register` refuses any registration that does
 * not accept the exact Terms and Privacy versions the instance is configured with, so the
 * versions have to come from the instance. They arrive in the form as well, from the render
 * — and the two are compared rather than either being trusted alone:
 *
 *   - the form's copy is what the READER was shown and agreed to, and it is a value the
 *     caller chooses, so it is never forwarded as-is;
 *   - the fetched copy is what the instance requires NOW, and forwarding it alone would
 *     record an acceptance of a document the reader was never shown.
 *
 * Equal, they are the same string and the registration proceeds. Different, the versions
 * moved while the page was open, and the answer is `consent-stale` — reload and read it,
 * rather than retry and accept something unseen.
 *
 * Every `Location` carries the edition the form was in, as `/api/auth/login`'s do (issue
 * #166).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Submission {
  readonly email: string;
  readonly password: string;
  /** The affirmative act. An unticked checkbox is not submitted at all, so this is false. */
  readonly accepted: boolean;
  /** The versions the page displayed. Checked against the live ones, never forwarded raw. */
  readonly terms: string;
  readonly privacy: string;
  readonly redirectTo: string | null;
  /** The edition the form was in — its shape checked here, as the sign-in route does. */
  readonly edition: string | undefined;
  /**
   * Whether this caller is a plain HTML form, and therefore whether the answer is a 303 or
   * a status. Decided by the branch that actually parsed the body, for the reason
   * `login/route.ts` records: two reads of one header are two chances for a form post to be
   * handed a JSON answer it cannot do anything with.
   */
  readonly wantsRedirect: boolean;
}

/**
 * Read the details out of either shape the route accepts.
 *
 * The email is trimmed and the password is not — a password's leading or trailing space is
 * part of the password, and trimming it here would silently create an account under a
 * password the reader cannot then type. That is worse at registration than at sign-in: the
 * mismatch is permanent rather than one attempt.
 */
async function readSubmission(request: Request): Promise<Submission | null> {
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      return {
        email: String(form.get('email') ?? '').trim(),
        password: String(form.get('password') ?? ''),
        accepted: form.get('accept') !== null,
        terms: String(form.get('terms') ?? '').trim(),
        privacy: String(form.get('privacy') ?? '').trim(),
        redirectTo: safeRedirectTarget(String(form.get('redirect') ?? '')),
        edition: editionOf(form.get('lang')),
        wantsRedirect: true,
      };
    }

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      const str = (key: string): string =>
        typeof body[key] === 'string' ? (body[key] as string) : '';
      return {
        email: str('email').trim(),
        password: str('password'),
        accepted: body['accept'] === true,
        terms: str('terms').trim(),
        privacy: str('privacy').trim(),
        redirectTo: safeRedirectTarget(str('redirect')),
        edition: editionOf(body['lang']),
        wantsRedirect: false,
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** A `lang` field worth carrying on: the shape of a language tag, or nothing. */
function editionOf(value: unknown): string | undefined {
  return isLanguageTag(value) ? value : undefined;
}

/**
 * The HTTP status for a problem, for a JSON caller. A form caller gets a 303 whatever
 * happened, because a form post answered 4xx with a body leaves the reader looking at a
 * bare error document with no way back.
 */
const PROBLEM_STATUS: Readonly<Record<RegistrationProblemCode, number>> = {
  incomplete: 400,
  'consent-required': 400,
  // 409, not 400: nothing about the SUBMISSION is malformed. The state of the world moved.
  'consent-stale': 409,
  taken: 409,
  'weak-password': 400,
  'invalid-email': 400,
  refused: 400,
  'rate-limited': 429,
  // Ours, not theirs. A 5xx is the honest class: the details may have been perfect and this
  // deployment could not turn them into an account or into a session.
  unavailable: 502,
  'token-rejected': 500,
  unverifiable: 502,
  'not-configured': 501,
};

/**
 * The register page, carrying what went wrong (or the notice), where the reader was headed and
 * the edition — `account-href.ts`'s order.
 *
 * A PATH rather than an absolute URL, for the reason `login/route.ts` measured: the only
 * absolute origin available on this side is `request.url`, which names the server's own
 * address rather than the one the browser used.
 */
function registerPagePath(
  outcome: { readonly error: string } | { readonly notice: string },
  submission: Submission,
): string {
  return registerHref({
    ...outcome,
    redirect: submission.redirectTo,
    edition: submission.edition,
  });
}

/** 303, not 302: a reload after registering must re-request a page, not re-post a password. */
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

  const fail = (problem: RegistrationProblemCode): NextResponse =>
    submission.wantsRedirect
      ? seeOther(registerPagePath({ error: problem }, submission))
      : NextResponse.json(
          { problem },
          { status: PROBLEM_STATUS[problem], headers: { 'cache-control': 'no-store' } },
        );

  const notice = (code: RegistrationNoticeCode): NextResponse =>
    submission.wantsRedirect
      ? seeOther(registerPagePath({ notice: code }, submission))
      : NextResponse.json(
          { notice: code },
          { status: 202, headers: { 'cache-control': 'no-store' } },
        );

  // P8 — a deployment with no identity service is a supported state. The page does not
  // render a form in that case, so reaching here means the request did not come from it.
  if (!backendConfigured('authservice')) return fail('not-configured');

  if (!submission.email || !submission.password) return fail('incomplete');

  // The box, before anything is sent. A registration with no consent is one authservice
  // would refuse anyway, and refusing it here spends none of the reader's rate limit on it.
  if (!submission.accepted || !submission.terms || !submission.privacy) {
    return fail('consent-required');
  }

  const current = await consentVersions();
  if (!current) return fail('unavailable');

  // What the reader was shown is what gets recorded, or nothing does. See the header.
  if (current.terms !== submission.terms || current.privacy !== submission.privacy) {
    return fail('consent-stale');
  }

  const outcome = await registerAccount(
    submission.email,
    submission.password,
    current,
    fetch,
    readerAddress(request),
  );

  switch (outcome.kind) {
    case 'taken':
      return fail('taken');
    case 'weak-password':
      return fail('weak-password');
    case 'invalid-email':
      return fail('invalid-email');
    /*
     * The instance refused the very versions it had just reported as current, which means
     * they moved between this route's two calls. The same remedy as a stale form and the
     * same code: load the page again and read what it now says.
     */
    case 'consent-refused':
      return fail('consent-stale');
    case 'refused':
      return fail('refused');
    case 'rate-limited':
      return fail('rate-limited');
    case 'unavailable':
      return fail('unavailable');
    /*
     * THE ACCOUNT EXISTS AND THERE IS NO TOKEN — not a failure, and reported as a notice so
     * that the page says "one step is left" instead of offering a form whose only possible
     * next answer is that the address is taken.
     */
    case 'verification-required':
      return notice('verify-email');
    case 'registered':
      break;
  }

  /**
   * authservice created the account and minted a token. That is not yet a session: it is
   * verified against the JWKS before it is stored, exactly as a password sign-in's is.
   *
   * A rejection HERE is not a credential failure — the reader has just chosen the
   * credentials — so it must not be reported as one. It means this deployment's expected
   * issuer or audience disagrees with the one signing the token, and the account exists
   * regardless, which is why both problems carry `signInInstead`.
   */
  const session = await establishSession(outcome.accessToken, outcome.refreshToken);

  if (session.status === 'rejected') return fail('token-rejected');
  if (session.status === 'unverifiable') return fail('unverifiable');

  // Where the reader was going; else the programs, in the edition they registered from.
  const destination = submission.redirectTo ?? indexHref({ edition: submission.edition });

  return submission.wantsRedirect
    ? seeOther(destination)
    : new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
