import type { Metadata } from 'next';
import Link from 'next/link';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { signInHref } from '@/lib/account-href';
import { chromeFor } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { readChallenge } from '@/lib/server/challenge';
import { readerEdition } from '@/lib/server/reader-edition';
import { safeRedirectTarget } from '@/lib/redirect-target';
import { signInProblem } from '@/lib/sign-in-problem';

import styles from '../../credentials-form.module.css';

/**
 * The second step of a sign-in: the code.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SAME PLAIN FORM AS `/login`, ONE FACTOR LATER, AND IT SHARES THAT PAGE'S STYLESHEET
 * RATHER THAN CARRYING A COPY. The two screens are one flow and a reader should not be
 * able to tell they are two files; a second module would be two places for the same
 * spacing to drift.
 *
 * No `'use client'` here either. A sign-in that needed JavaScript would be the first thing
 * in the product to require it, and that is as true of the second factor as of the first.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS PAGE DOES NOT HAVE, and it is the design decision issue #30 asks about: the
 * challenge token. It is in an HttpOnly cookie the browser will send and the document
 * cannot read. The obvious alternative — a hidden field — would put a credential proving
 * the reader's password was right into the DOM, into form restore, and into any screenshot
 * of this page. `session-cookies.ts` carries the full reasoning.
 *
 * So the only thing this form collects is the thing the reader knows.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IN THE READER'S EDITION, AND EVERY WAY BACK KEEPS WHERE THEY WERE GOING (issue #166).
 *
 * `/login`'s reasoning for the edition, one step on: the words are `chrome.secondFactorPage`
 * and `chrome.signInProblems`, and the edition rides the form and every link. And *Start
 * again* — the way out for a reader whose challenge has lapsed — linked a bare `/login`, so a
 * reader bounced off `/instrument` who took five minutes over the code finished signing in on
 * the index. It carries the destination now, as the route's own restart always did.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = 'force-dynamic';

/** The tab, in the page's edition — `/login`'s reason (ADR-0067). */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const chrome = chromeFor(await readerEdition((await searchParams)['lang']));
  return { title: `${chrome.secondFactorPage.heading} — ab-ovo` };
}

export default async function SecondFactorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);
  const problem = signInProblem(params['error']);
  const edition = await readerEdition(params['lang']);
  const chrome = chromeFor(edition);
  const strings = chrome.secondFactorPage;
  const problemWords = problem ? chrome.signInProblems[problem.code] : null;

  // The password screen, carrying the destination and the edition — the way back from here
  // in every state, and the one that was a bare `/login` (issue #166).
  const startAgainHref = signInHref({ redirect: intended, edition });

  /**
   * Whether this browser is holding a challenge at all.
   *
   * A reader who bookmarked this address, or who left the tab open past the five minutes,
   * has none — and the honest answer is to say so and point at the password screen rather
   * than render a form whose submission can only ever be refused. It is the same decision
   * `/login` makes about an unconfigured deployment: say which situation this is.
   *
   * The cookie's VALUE is never read here and never rendered. Only its presence is.
   */
  const hasChallenge = (await readChallenge()) !== null;

  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        {/* The way home, as on `/login` (issue #166). */}
        <p className="wordmark">
          <Link href={indexHref({ edition })}>
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
        {hasChallenge ? (
          <>
            <p>{strings.instructions}</p>
            <form className={styles.form} method="post" action="/api/auth/2fa">
              {intended ? <input type="hidden" name="redirect" value={intended} /> : null}
              <input type="hidden" name="lang" value={edition} />

              <div className={styles.field}>
                <label className={styles.label} htmlFor="code">
                  {strings.codeLabel}
                </label>
                {/*
                  `inputMode="numeric"` and `autoComplete="one-time-code"` are what put a
                  numeric keypad on a phone and offer the code from the platform's own
                  autofill. `type="text"` rather than `type="number"`: a number input drops
                  leading zeros and offers a spinner, and a six-digit code beginning 0 is one
                  code in ten.
                */}
                <input
                  className={styles.input}
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={8}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="recoveryCode">
                  {strings.recoveryLabel}
                </label>
                <input
                  className={styles.input}
                  id="recoveryCode"
                  name="recoveryCode"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>

              {/*
                Neither field is `required`, because exactly one of them is. The route
                decides — and prefers the code when both are filled, which is authservice's
                own precedence and stops a reader silently spending a single-use recovery
                code on a form they left half-filled.
              */}
              <button className={styles.submit} type="submit">
                {strings.submit}
              </button>
            </form>
          </>
        ) : (
          <p>
            {strings.noChallenge.before}
            <Link href={startAgainHref}>{strings.noChallenge.link}</Link>
            {strings.noChallenge.after}
          </p>
        )}
      </section>

      <section className="section">
        <h2>{strings.lostBothTitle}</h2>
        <p>{strings.lostBoth}</p>
        <p>{strings.lostBothReading}</p>
      </section>

      <footer className="colophon">
        <p>
          <Link href={startAgainHref}>{strings.backToSignIn}</Link> ·{' '}
          <Link href={indexHref({ edition })}>{chrome.backToReader}</Link>
        </p>
      </footer>
    </main>
  );
}
