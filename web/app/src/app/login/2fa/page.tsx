import Link from 'next/link';

import { readChallenge } from '@/lib/server/challenge';
import { safeRedirectTarget } from '@/lib/redirect-target';
import { signInProblem } from '@/lib/sign-in-problem';

import styles from '../login-form.module.css';

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
 */

export const dynamic = 'force-dynamic';

export default async function SecondFactorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);
  const problem = signInProblem(params['error']);

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
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">One more step.</h1>
        <p className="standfirst">
          That account has a second factor. Your password was accepted; this is the other
          half, and it is the last thing between you and the page you asked for.
        </p>
      </header>

      {problem ? (
        <section className={styles.problem} aria-live="polite">
          <h2 className={styles.problemTitle}>{problem.title}</h2>
          <p className={styles.problemDetail}>{problem.detail}</p>
        </section>
      ) : null}

      <section className="section">
        <h2>Your code</h2>
        {hasChallenge ? (
          <>
            <p>
              Open your authenticator app and enter the current code. If you cannot reach it,
              one of your recovery codes works instead — each of those can be used once.
            </p>
            <form className={styles.form} method="post" action="/api/auth/2fa">
              {intended ? <input type="hidden" name="redirect" value={intended} /> : null}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="code">
                  Authenticator code
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
                  Or a recovery code
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
                Finish signing in
              </button>
            </form>
          </>
        ) : (
          <p>
            There is no sign-in in progress on this device. The first step is good for about
            five minutes, and if it has been longer than that nothing is wrong — the account
            and the password are fine. <Link href="/login">Start again</Link> and you will get
            a fresh one.
          </p>
        )}
      </section>

      <section className="section">
        <h2>If you have lost both</h2>
        <p>
          Recovery codes are the way back when the authenticator is gone, and they run out.
          ab-ovo cannot reset a second factor or issue new recovery codes — that belongs to
          the identity service this deployment is configured against, not to the reader.
        </p>
        <p>
          Nothing except progress that follows you between machines needs an account at all,
          so a locked-out reader still has the whole book and the whole lab.
        </p>
      </section>

      <footer className="colophon">
        <p>
          <Link href="/login">Back to sign in</Link> · <Link href="/">Back to the reader</Link>
        </p>
      </footer>
    </main>
  );
}
