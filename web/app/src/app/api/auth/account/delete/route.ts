import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { DeletionProblemCode } from '@/lib/account-deletion-problem';
import { isConfirmationWord } from '@/lib/i18n/chrome';
import { deleteReaderAccount } from '@/lib/server/account-deletion';
import { backendConfigured } from '@/lib/server/backends';
import { isSameOrigin } from '@/lib/server/same-origin';
import { clearSession } from '@/lib/server/session';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';

/**
 * POST /api/auth/account/delete — remove the reader's progress, then their account.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * POST, AND THE VERB IS A DECISION.
 *
 * `DELETE` is the honest verb and a plain HTML form cannot issue one. The reading surface
 * works with no JavaScript and the sign-in form does too; a deletion that needed script
 * would be the first thing in the product to require it — and it would require it of a
 * reader who has decided to leave, which is the worst possible moment to demand a working
 * browser. So the form posts, and the path says what the verb cannot.
 *
 * It is `/account/delete` rather than `/account` for the same reason: a later `POST
 * /api/auth/account` that created something would collide with a route whose only meaning
 * was destructive, and the collision would be silent.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It orchestrates rather than proxies, and the order is `account-deletion.ts`'s: progress
 * first, then the account, then the cookies. The cookies are last because authservice
 * revokes only the REFRESH tokens — the access token stays valid until its own `exp`, and
 * nothing here consults authservice per request, so until this origin drops its own
 * cookies the reader is still signed in as an account that no longer exists.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Where the reader lands afterwards. The reading surface, which needs no account. */
const AFTER_DELETION = '/account/deleted';

interface Confirmation {
  readonly typed: string;
  readonly password: string;
  /** The reader's language, so the answer comes back on a page in it. */
  readonly language: string;
  readonly wantsRedirect: boolean;
}

/**
 * Read the confirmation out of either shape the route accepts.
 *
 * The password is NOT trimmed, for `readCredentials`'s reason: a leading or trailing space
 * is part of a password, and removing it is a silent wrong answer that presents as "the
 * password I set does not work". The typed confirmation IS trimmed, inside
 * `isConfirmationWord`, because a trailing space there is a typo and not a secret.
 */
async function readConfirmation(request: Request): Promise<Confirmation | null> {
  const contentType = request.headers.get('content-type') ?? '';

  const shape = (get: (name: string) => string, wantsRedirect: boolean): Confirmation => ({
    typed: get('confirm'),
    password: get('password'),
    language: get('lang'),
    wantsRedirect,
  });

  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      return shape((name) => String(form.get(name) ?? ''), true);
    }
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      return shape((name) => (typeof body[name] === 'string' ? (body[name] as string) : ''), false);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * The HTTP status for a problem, for a JSON caller. A form caller gets a 303 whatever
 * happened, because a form post answering 401 with a body leaves the reader looking at a
 * bare error document with no way back — and on this route, no way to tell what was
 * removed before it stopped.
 */
const PROBLEM_STATUS: Readonly<Record<DeletionProblemCode, number>> = {
  confirm: 400,
  'password-required': 400,
  'password-rejected': 400,
  'signed-out': 401,
  // Both of these are ours: the reader did everything right and this deployment could not
  // finish. A 4xx would put the fault on them.
  progress: 502,
  account: 502,
  unconfigured: 501,
};

/**
 * The deletion screen, carrying what went wrong and the language it was asked in.
 *
 * THE SCREEN THE FORM WAS ON, which since issue #161 is `/account/delete` and not
 * `/account`: the account's address is its overview now, and a failure sent there would
 * land the reader one page away from the form they have to fill in again, with the reason
 * rendered nowhere — the overview reads no `?error=`.
 *
 * A PATH rather than an absolute URL, for the reason `loginPagePath` records: the only
 * absolute origin available server-side is `request.url`, which names this server's own
 * origin rather than the address the browser used.
 */
function deletionPagePath(problem: DeletionProblemCode, language: string): string {
  const query = new URLSearchParams({ error: problem });
  // Passed through rather than validated against the chrome table: `chromeFor` already
  // falls back to English for anything it does not know, and the page renders the code
  // rather than the language, so there is nothing here an arbitrary value could reach.
  if (language) query.set('lang', language);
  return `/account/delete?${query.toString()}`;
}

/** 303: the browser must follow it with GET, or a reload re-posts the password. */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  /*
   * Cross-site deletion is the attack this check exists for here.
   *
   * Unlike the login route, this one RIDES an existing session rather than establishing
   * one: a form on another site, submitted by a reader who is signed in, deletes that
   * reader's account with no credentials of the attacker's involved at all. The
   * confirmation word does not help, because the attacker's form supplies it.
   *
   * `sameSite: strict` very nearly covers this one — and "very nearly" is not a property
   * to rest an irreversible operation on, since the attribute is one edit away from `lax`
   * and nothing else would fail.
   */
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'this route accepts same-origin requests only' },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  }

  const confirmation = await readConfirmation(request);
  if (!confirmation) {
    return NextResponse.json(
      { error: 'expected a form or JSON body' },
      { status: 415, headers: { 'cache-control': 'no-store' } },
    );
  }

  const fail = (problem: DeletionProblemCode): NextResponse =>
    confirmation.wantsRedirect
      ? seeOther(deletionPagePath(problem, confirmation.language))
      : NextResponse.json(
          { problem },
          { status: PROBLEM_STATUS[problem], headers: { 'cache-control': 'no-store' } },
        );

  // P8 — a deployment with no identity service is a supported state, and there is then no
  // account to delete. The page does not render the form in that case, so reaching here
  // means the request did not come from it.
  if (!backendConfigured('authservice')) return fail('unconfigured');

  // Checked HERE as well as in the browser, and the browser's copy is a convenience. This
  // is the one that counts: the form can be submitted with script disabled, by curl, or by
  // a page that never rendered the field.
  if (!isConfirmationWord(confirmation.typed)) return fail('confirm');

  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return fail('signed-out');

  const outcome = await deleteReaderAccount(
    accessToken,
    confirmation.password.length > 0 ? confirmation.password : null,
  );

  switch (outcome.kind) {
    case 'password-required':
      return fail('password-required');
    case 'password-rejected':
      return fail('password-rejected');
    case 'unauthenticated':
      return fail('signed-out');
    case 'progress-not-removed':
      return fail('progress');
    case 'account-not-removed':
      return fail('account');
    case 'deleted':
      break;
  }

  /*
   * ONLY NOW, AND ONLY ON SUCCESS.
   *
   * Clearing earlier would throw away the bearer the two calls above need. Clearing on
   * failure would sign out a reader whose account still exists, which turns every
   * recoverable outcome — a mistyped password most of all — into one they cannot retry
   * without signing in again.
   *
   * The reader's LOCAL progress is deliberately not touched, here or anywhere on this
   * path. It is theirs, they can carry on reading without an account, and `Forget where I
   * am` on the reading page is the control for clearing it. A deletion that also wiped the
   * browser would punish leaving more than signing out does (ADR-0019).
   */
  await clearSession();

  return confirmation.wantsRedirect
    ? seeOther(
        AFTER_DELETION +
          (confirmation.language ? `?lang=${encodeURIComponent(confirmation.language)}` : ''),
      )
    : new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
