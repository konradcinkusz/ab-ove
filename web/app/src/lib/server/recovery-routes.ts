import { NextResponse } from 'next/server';

import { signInHref, type AccountPageQuery } from '@/lib/account-href';
import {
  LINK_REQUEST_PROBLEMS,
  type LinkProblemCode,
  type LinkRequestNoticeCode,
  type LinkRequestProblemCode,
} from '@/lib/recovery-problem';
import { sendsEmail, type LinkRequestOutcome, type LinkUseOutcome } from '@/lib/server/account-recovery';
import { backendConfigured } from '@/lib/server/backends';
import { readerAddress } from '@/lib/server/client-ip';
import type { EmailedLink } from '@/lib/server/emailed-link';
import {
  forgetEmailedLink,
  heldEmailedLink,
  type EmailedLinkKind,
} from '@/lib/server/emailed-link-cookie';
import {
  crossSiteRefused,
  problemAnswer,
  readFormPost,
  seeOther,
  unreadableBody,
  type FormPost,
} from '@/lib/server/form-post';
import { isSameOrigin } from '@/lib/server/same-origin';
import { rememberAddress } from '@/lib/server/sign-in-address';
import type { SignInNoticeCode } from '@/lib/sign-in-problem';

/**
 * What the four routes of the way back into an account do (issue #170), written once for each
 * of the two kinds: the pair that ASKS for a link, and the pair that USES one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `/api/auth/login`'s SHAPE, FOUR TIMES OVER (ADR-0018).
 *
 * A plain form posts to this origin; the route refuses any other origin (`same-origin.ts`),
 * calls authservice from this server with the reader's own address forwarded (`client-ip.ts`),
 * and answers a 303 to a page that renders from a closed set (`recovery-problem.ts`) — never
 * upstream's sentence, never the address, never a token. A JSON caller gets the same code and
 * a status instead. Nothing here sets a session: none of the four endpoints issues a token, and
 * a new password is followed by the sign-in form, not by a sign-in (the probe, §7).
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/** The status for a JSON caller; a form caller gets a 303 whatever happened (`login/route.ts`). */
const REQUEST_STATUS: Readonly<Record<LinkRequestProblemCode, number>> = {
  incomplete: 400,
  'invalid-email': 400,
  // The request was understood and there is nothing to send: the account has no password.
  'no-password': 409,
  'rate-limited': 429,
  unavailable: 502,
  'no-email': 501,
  'not-configured': 501,
};

const USE_STATUS: Readonly<Record<LinkProblemCode, number>> = {
  incomplete: 400,
  'weak-password': 400,
  // 410: what is gone is the link, not anything about the request.
  'link-invalid': 410,
  'link-lapsed': 410,
  'rate-limited': 429,
  unavailable: 502,
  refused: 400,
  'not-configured': 501,
};

/** One of the two pages that ask for a link: where it is, and what it asks authservice. */
export interface LinkRequestRoute {
  readonly page: (query: AccountPageQuery) => string;
  readonly ask: (email: string, readerAddress: string | null) => Promise<LinkRequestOutcome>;
}

/**
 * Ask for a link — a new password's, or the confirmation's again.
 *
 * The answer says nothing about whether the address has an account, because authservice's
 * does not: `sent` is what every address it can parse is told. So the page it lands on says
 * what happens next IF the address has one, and that is the whole of what it can say.
 */
export async function answerLinkRequest(request: Request, route: LinkRequestRoute): Promise<NextResponse> {
  if (!isSameOrigin(request)) return crossSiteRefused();
  const post = await readFormPost(request);
  if (!post) return unreadableBody();

  const email = post.field('email').trim();
  const pageWith = (outcome: { error: string } | { notice: string }): string =>
    route.page({ ...outcome, redirect: post.redirectTo, edition: post.edition });

  const fail = async (problem: LinkRequestProblemCode): Promise<NextResponse> => {
    if (!post.wantsRedirect) return problemAnswer(problem, REQUEST_STATUS[problem]);
    /*
     * Where the form stays, the address goes back into its field — in the minute-long cookie a
     * failed sign-in leaves it in, scoped to `/login` and the pages under it, which these are
     * (`sign-in-address.ts`). Never on the `Location`.
     */
    if (LINK_REQUEST_PROBLEMS[problem].retryable) await rememberAddress(email);
    return seeOther(pageWith({ error: problem }));
  };

  const notice = (code: LinkRequestNoticeCode): NextResponse =>
    post.wantsRedirect
      ? seeOther(pageWith({ notice: code }))
      : NextResponse.json({ notice: code }, { status: 202, headers: { 'cache-control': 'no-store' } });

  // P8, and then the deployment fact `sendsEmail` records: the page offers no form in either
  // case, so a post arriving here did not come from it.
  if (!backendConfigured('authservice')) return fail('not-configured');
  if (!sendsEmail()) return fail('no-email');
  if (!email) return fail('incomplete');

  const outcome = await route.ask(email, readerAddress(request));
  switch (outcome.kind) {
    case 'sent':
      return notice('sent');
    case 'no-password':
    case 'invalid-email':
    case 'rate-limited':
    case 'unavailable':
      return fail(outcome.kind);
  }
}

/** One of the two pages a link leads to: which link it spends, and what that asks authservice. */
export interface LinkUseRoute {
  readonly kind: EmailedLinkKind;
  readonly page: (query: AccountPageQuery) => string;
  /** What `/login` is told once the link has done its work. */
  readonly done: SignInNoticeCode;
  /**
   * Spend the link. `incomplete` is the route's own answer, before anything is sent — the one
   * field a reader types was empty.
   */
  readonly use: (
    link: EmailedLink,
    post: FormPost,
    readerAddress: string | null,
  ) => Promise<LinkUseOutcome | { readonly kind: 'incomplete' }>;
}

/**
 * Spend a link a reader opened: choose the new password, or confirm the address.
 *
 * THE LINK IS DROPPED WHEREVER IT CANNOT BE USED AGAIN, and kept wherever it can: gone once it
 * has worked and once authservice has refused it; kept for a password the policy refuses —
 * which does not spend it (the probe, §2) — and for our own failures, so trying again needs no
 * new email.
 */
export async function answerLinkUse(request: Request, route: LinkUseRoute): Promise<NextResponse> {
  if (!isSameOrigin(request)) return crossSiteRefused();
  const post = await readFormPost(request);
  if (!post) return unreadableBody();

  const fail = (problem: LinkProblemCode): NextResponse =>
    post.wantsRedirect
      ? seeOther(route.page({ error: problem, edition: post.edition }))
      : problemAnswer(problem, USE_STATUS[problem]);

  if (!backendConfigured('authservice')) return fail('not-configured');

  // Absent: the page was open longer than the link is held, or it was never opened here.
  const link = await heldEmailedLink(route.kind);
  if (!link) return fail('link-lapsed');

  const outcome = await route.use(link, post, readerAddress(request));
  switch (outcome.kind) {
    case 'done':
      await forgetEmailedLink(route.kind);
      return post.wantsRedirect
        ? seeOther(signInHref({ notice: route.done, edition: post.edition }))
        : new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    case 'link-invalid':
      await forgetEmailedLink(route.kind);
      return fail('link-invalid');
    case 'incomplete':
    case 'weak-password':
    case 'refused':
    case 'rate-limited':
    case 'unavailable':
      return fail(outcome.kind);
  }
}
