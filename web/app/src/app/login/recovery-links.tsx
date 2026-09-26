import Link from 'next/link';

import { forgotPasswordHref, resendConfirmationHref } from '@/lib/account-href';
import type { Chrome } from '@/lib/i18n/chrome';
import { sendsEmail } from '@/lib/server/account-recovery';
import type { SignInProblem } from '@/lib/sign-in-problem';

import styles from '../credentials-form.module.css';

/**
 * The two ways back into an account that `/login` offers (issue #170), each where the reader
 * meets the reason for it — kept here rather than in the page so that when to offer each is
 * decided in one place, beside why.
 *
 * Each carries the edition and where the reader was going, as every link out of `/login` does
 * (issue #166), and neither prefetches: the pages they open title their tab in the edition
 * (ADR-0067).
 */

interface Where {
  readonly chrome: Chrome;
  readonly edition: string;
  /** Where signing in returns the reader: already passed through `safeRedirectTarget`. */
  readonly redirect: string | null;
}

/**
 * *Forgot your password?*, under the form.
 *
 * OFFERED WHETHER OR NOT THIS DEPLOYMENT CAN SEND EMAIL, unlike the other way below. A reader
 * who has forgotten a password has a question either way, and the page it leads to answers it
 * either way: with the form, or by saying this site sends no email and what that leaves them —
 * issue #170's "say on those pages where to go instead".
 */
export function ForgotPasswordLink({ chrome, edition, redirect }: Where): React.JSX.Element {
  return (
    <p>
      <Link href={forgotPasswordHref({ redirect, edition })} prefetch={false}>
        {chrome.signInPage.forgotPassword}
      </Link>
    </p>
  );
}

/**
 * The confirmation link again, under a problem an unconfirmed address can meet
 * (`SignInProblem.offersResend`) — inside the problem's own panel, so it reads as the way out of
 * what the panel says.
 *
 * OFFERED ONLY WHERE AN EMAIL CAN COME (`sendsEmail`). An identity service that sends no email
 * asks no address to be confirmed — authservice's `RequireConfirmedEmail` follows whether it can
 * send (the probe, §4) — so under a refused password, where most readers meet it, the sentence
 * would describe an account that cannot exist here.
 */
export function ResendConfirmation({
  chrome,
  edition,
  redirect,
  problem,
}: Where & { readonly problem: SignInProblem }): React.JSX.Element | null {
  if (problem.offersResend !== true || !sendsEmail()) return null;
  const words = chrome.signInPage.resend;
  return (
    <p className={styles.problemDetail}>
      {words.before}
      <Link href={resendConfirmationHref({ redirect, edition })} prefetch={false}>
        {words.link}
      </Link>
      {words.after}
    </p>
  );
}
