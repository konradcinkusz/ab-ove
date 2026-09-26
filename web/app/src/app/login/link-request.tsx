import type { Metadata } from 'next';
import Link from 'next/link';

import { Masthead } from '@/components/masthead/masthead';
import { SKIP_TARGET_ID } from '@/components/skip/skip-link';
import {
  forgotPasswordHref,
  resendConfirmationHref,
  signInHref,
  type AccountPageQuery,
} from '@/lib/account-href';
import { chromeFor, type Chrome } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { linkRequestNotice, linkRequestProblem, offersLinkRequestForm } from '@/lib/recovery-problem';
import { safeRedirectTarget } from '@/lib/redirect-target';
import { sendsEmail } from '@/lib/server/account-recovery';
import { backendConfigured } from '@/lib/server/backends';
import { readerEdition } from '@/lib/server/reader-edition';
import { rememberedAddress } from '@/lib/server/sign-in-address';

import styles from '../credentials-form.module.css';

/**
 * The page that asks for a link by email — `/login/forgot` for a new password, `/login/resend`
 * for the confirmation again (issue #170). One page with two purposes, so it is written once and
 * each route names its purpose.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `/login`'S SHAPE, AND ITS REASONS (ADR-0018).
 *
 * A plain form with no client component, posting to this origin: the address goes to a route
 * under `/api/auth/`, which asks authservice from this server and answers with this page and a
 * code from a closed set (`recovery-problem.ts`). The page renders from that set and never from
 * the URL, follows the reader's edition, and every link and redirect carries the edition and
 * where the reader was going (issue #166, `account-href.ts`). No link prefetches (ADR-0067).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT ENDS ON A PAGE THAT SAYS WHAT HAPPENS NEXT — AND ONLY WHAT IT KNOWS.
 *
 * authservice answers both requests the same for every address it can parse — with an account
 * or without, waiting to be confirmed or already confirmed — so the notice the page ends on
 * begins with "if", and nothing on it or in its address says whether an account exists. The
 * form is withdrawn under the notice: the way to ask again is a link, below it, to a fresh page.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE FORM IS OFFERED ONLY WHERE AN EMAIL CAN COME. authservice without a mail provider still
 * answers "a link has been sent" (the probe, §4), so where this deployment has not said it can
 * send email (`sendsEmail`) the page says so instead of promising one — which is issue #170's
 * "say on those pages where to go instead", for a deployment that has the endpoints and nothing
 * to send with.
 *
 * THE ADDRESS A FAILED SIGN-IN WAS MADE WITH FILLS THE FIELD, as it does on `/login`: this page
 * is under `/login`, so the minute-long cookie that route leaves is sent here too, and a reader
 * who met a refusal and followed the way back does not type it again (`sign-in-address.ts`).
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Which link the page asks for: a new password's, or the confirmation's again. */
export type LinkRequestKind = 'reset' | 'verify';

interface Purpose {
  /** The route the form posts to. */
  readonly action: string;
  /** This page's own address, for the way to ask again. */
  readonly href: (query: AccountPageQuery) => string;
  readonly strings: (chrome: Chrome) => Chrome['forgotPage'];
}

const PURPOSES: Readonly<Record<LinkRequestKind, Purpose>> = {
  reset: {
    action: '/api/auth/forgot-password',
    href: forgotPasswordHref,
    strings: (chrome) => chrome.forgotPage,
  },
  verify: {
    action: '/api/auth/resend-verification',
    href: resendConfirmationHref,
    strings: (chrome) => chrome.resendPage,
  },
};

/** The tab, in the page's edition — `/login`'s reason (ADR-0067). */
export async function linkRequestMetadata(
  kind: LinkRequestKind,
  searchParams: SearchParams,
): Promise<Metadata> {
  const chrome = chromeFor(await readerEdition((await searchParams)['lang']));
  return { title: `${PURPOSES[kind].strings(chrome).heading} — ab-ovo` };
}

export async function LinkRequestPage({
  kind,
  searchParams,
}: {
  kind: LinkRequestKind;
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);
  const edition = await readerEdition(params['lang']);
  const chrome = chromeFor(edition);
  const purpose = PURPOSES[kind];
  const strings = purpose.strings(chrome);

  // P8, and then whether an email can come at all — see the header.
  const identityConfigured = backendConfigured('authservice');
  const canSend = identityConfigured && sendsEmail();

  // Both validated against closed sets, never rendered from the URL (`recovery-problem.ts`).
  // The notice says a link is on its way, so it is shown only where one could be: `?notice=`
  // is an address anybody can compose, on a site that sends nothing as on one that does.
  const problem = linkRequestProblem(params['error']);
  const notice = canSend ? linkRequestNotice(params['notice']) : null;
  const problemWords = problem ? chrome.linkRequestProblems[problem.code] : null;

  /*
    WHETHER THE FORM IS WORTH OFFERING — `/login`'s rule, decided in `offersLinkRequestForm`,
    pure and tested there, because two of the states that withdraw it are ones no acceptance
    deployment is in. The fresh page each state links to offers it again.
  */
  const offersForm = offersLinkRequestForm({ identityConfigured, sendsEmail: canSend, notice, problem });

  // Put into the field and nowhere else, and read only where there is a field (`/login`'s way).
  const address = offersForm ? await rememberedAddress() : null;

  // Every way on carries the destination and the edition (issue #166); none prefetches (ADR-0067).
  const again = purpose.href({ redirect: intended, edition });
  const signIn = signInHref({ redirect: intended, edition });
  const home = indexHref({ edition });

  return (
    <main className="shell" lang={chrome.language}>
      {/*
        The one masthead (#169), as on `/login`: its wordmark is the way home, to the programs in
        this edition (#166), and it renders the skip link.
      */}
      <Masthead home={home} language={chrome.language} />
      <h1 className="lede" id={SKIP_TARGET_ID}>
        {strings.lede}
      </h1>
      <p className="standfirst">{strings.standfirst}</p>

      {problemWords ? (
        <section className={styles.problem} aria-live="polite">
          <h2 className={styles.problemTitle}>{problemWords.title}</h2>
          <p className={styles.problemDetail}>{problemWords.detail}</p>
        </section>
      ) : null}

      {/* What happens next: the page the request ends on (issue #170's Done-when). */}
      {notice ? (
        <section className={styles.notice} aria-live="polite">
          <h2 className={styles.noticeTitle}>{strings.sent.title}</h2>
          <p className={styles.noticeDetail}>{strings.sent.detail}</p>
        </section>
      ) : null}

      <section className="section">
        <h2>{strings.heading}</h2>
        {!identityConfigured ? (
          <p>{strings.noAccounts}</p>
        ) : !canSend ? (
          <p>{strings.noEmail}</p>
        ) : notice ? (
          <p>
            {strings.sentNext.before}
            <Link href={again} prefetch={false}>{strings.sentNext.link}</Link>
            {strings.sentNext.after}
          </p>
        ) : !offersForm ? (
          <p>
            {strings.withdrawn.before}
            <Link href={again} prefetch={false}>{strings.withdrawn.link}</Link>
            {strings.withdrawn.after}
          </p>
        ) : (
          <>
            <p>{strings.instructions}</p>
            {/*
              method="post" and a real action, so this works with no JavaScript; the route
              answers with a 303, which a reload follows as a GET rather than sending again.
            */}
            <form className={styles.form} method="post" action={purpose.action}>
              {/* Carried in the body, re-validated on arrival — `/login`'s hidden fields. */}
              {intended ? <input type="hidden" name="redirect" value={intended} /> : null}
              <input type="hidden" name="lang" value={edition} />

              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">
                  {chrome.emailAddress}
                </label>
                {/*
                  `username`, as on `/login`: the address IS the account's name, and a password
                  manager that knows it can offer the one it saved.
                */}
                <input
                  className={styles.input}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  defaultValue={address ?? undefined}
                  required
                />
              </div>

              <button className={styles.submit} type="submit">
                {strings.submit}
              </button>
            </form>
          </>
        )}
      </section>

      <footer className="colophon">
        <p>
          {identityConfigured ? (
            <>
              <Link href={signIn} prefetch={false}>{chrome.backToSignIn}</Link> ·{' '}
            </>
          ) : null}
          <Link href={home} prefetch={false}>{chrome.backToReader}</Link>
        </p>
      </footer>
    </main>
  );
}
