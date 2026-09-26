import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import {
  confirmAddressHref,
  forgotPasswordHref,
  resendConfirmationHref,
  resetPasswordHref,
  signInHref,
  type AccountPageQuery,
} from '@/lib/account-href';
import { chromeFor, type Chrome } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { linkProblem } from '@/lib/recovery-problem';
import { backendConfigured } from '@/lib/server/backends';
import { heldEmailedLink, type EmailedLinkKind } from '@/lib/server/emailed-link-cookie';
import { readerEdition } from '@/lib/server/reader-edition';

import styles from '../credentials-form.module.css';

/**
 * The page a link in an email leads to — `/login/reset` to choose a new password,
 * `/login/confirm` to confirm the address (issue #170). One page with two purposes, written
 * once; each route names its purpose and, for the password, its one field.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * NEITHER THE ADDRESS NOR THE TOKEN IS HERE, AND NEITHER IS IN THIS PAGE'S ADDRESS.
 *
 * The link landed on `/reset-password` or `/verify-email`, whose route put both into a cookie
 * only this origin's server can read and answered with this page's clean address
 * (`emailed-link-cookie.ts`). This page asks only whether a link is held — the challenge page's
 * question about its own cookie (`/login/2fa`) — and never reads, renders or carries the pair:
 * ADR-0018's rule, that the address and any token go through this origin's server and never into
 * the document. The form sends what the reader types, and nothing else.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A PLAIN FORM, as on `/login`, and its states are `/login`'s: no identity service is a site with
 * no accounts (P8); no link held is said, with the two ways on — the link again, or a new one;
 * a problem no second attempt fixes withdraws the form and offers the same page fresh; and
 * otherwise the form. The words are `chrome.resetPage`, `chrome.confirmPage` and
 * `chrome.linkProblems`, in the reader's edition, which the page resolves as `/login` does — the
 * link in the email names none, so it is the one this browser remembers. No link prefetches
 * (ADR-0067).
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface Purpose {
  readonly action: string;
  /** This page's own address, fresh. */
  readonly href: (query: AccountPageQuery) => string;
  /** The page that asks for a new link of this kind. */
  readonly newLink: (query: AccountPageQuery) => string;
  readonly strings: (chrome: Chrome) => Chrome['confirmPage'];
}

const PURPOSES: Readonly<Record<EmailedLinkKind, Purpose>> = {
  reset: {
    action: '/api/auth/reset-password',
    href: resetPasswordHref,
    newLink: forgotPasswordHref,
    strings: (chrome) => chrome.resetPage,
  },
  verify: {
    action: '/api/auth/verify-email',
    href: confirmAddressHref,
    newLink: resendConfirmationHref,
    strings: (chrome) => chrome.confirmPage,
  },
};

/** The tab, in the page's edition — `/login`'s reason (ADR-0067). */
export async function linkPageMetadata(kind: EmailedLinkKind, searchParams: SearchParams): Promise<Metadata> {
  const chrome = chromeFor(await readerEdition((await searchParams)['lang']));
  return { title: `${PURPOSES[kind].strings(chrome).heading} — ab-ovo` };
}

export async function LinkPage({
  kind,
  searchParams,
  fields,
}: {
  kind: EmailedLinkKind;
  searchParams: SearchParams;
  /** What the reader types, if anything: the new password's field, on `/login/reset`. */
  fields?: (chrome: Chrome) => ReactNode;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const edition = await readerEdition(params['lang']);
  const chrome = chromeFor(edition);
  const purpose = PURPOSES[kind];
  const strings = purpose.strings(chrome);

  const identityConfigured = backendConfigured('authservice');

  // Validated against a closed set, never rendered from the URL (`recovery-problem.ts`).
  const problem = linkProblem(params['error']);
  const problemWords = problem ? chrome.linkProblems[problem.code] : null;

  // Its presence, and nothing else: the value is the route's to read (see the header).
  const held = identityConfigured && (await heldEmailedLink(kind)) !== null;
  const offersForm = held && (problem === null || problem.retryable);

  // No destination to carry — the link in the email names none — and the edition, always.
  const fresh = purpose.href({ edition });
  const newLink = purpose.newLink({ edition });
  const home = indexHref({ edition });

  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        {/* The way home, as on `/login` (issue #166). */}
        <p className="wordmark">
          <Link href={home} prefetch={false}>
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede" id={SKIP_TARGET_ID}>
          {strings.lede}
        </h1>
        <p className="standfirst">{strings.standfirst}</p>
      </header>

      {problemWords ? (
        <section className={styles.problem} aria-live="polite">
          <h2 className={styles.problemTitle}>{problemWords.title}</h2>
          <p className={styles.problemDetail}>{problemWords.detail}</p>
        </section>
      ) : null}

      <section className="section">
        <h2>{strings.heading}</h2>
        {!identityConfigured ? (
          <p>{strings.noAccounts}</p>
        ) : !held ? (
          /*
            No link on this device: it was never opened here, the page held it past its time, or
            it was used or refused — the route drops it then. The link again is the first remedy
            and costs nothing, since opening it does not use it up; a new one is the second.
          */
          <p>
            {strings.noLink.before}
            <Link href={newLink} prefetch={false}>{strings.noLink.link}</Link>
            {strings.noLink.after}
          </p>
        ) : !offersForm ? (
          <p>
            {strings.withdrawn.before}
            <Link href={fresh} prefetch={false}>{strings.withdrawn.link}</Link>
            {strings.withdrawn.after}
          </p>
        ) : (
          <>
            <p>{strings.instructions}</p>
            {/*
              method="post" and a real action, so this works with no JavaScript; the route
              answers with a 303, which a reload follows as a GET rather than spending the link
              again. Nothing in it but the edition and what the reader types.
            */}
            <form className={styles.form} method="post" action={purpose.action}>
              <input type="hidden" name="lang" value={edition} />
              {fields?.(chrome)}
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
              <Link href={signInHref({ edition })} prefetch={false}>{chrome.backToSignIn}</Link> ·{' '}
            </>
          ) : null}
          <Link href={home} prefetch={false}>{chrome.backToReader}</Link>
        </p>
      </footer>
    </main>
  );
}
