import Link from 'next/link';

import { deletionProblem, deletionProblemMessage } from '@/lib/account-deletion-problem';
import { chromeFor } from '@/lib/i18n/chrome';
import { backendConfigured } from '@/lib/server/backends';

import styles from './account.module.css';

/**
 * The account page, which today is the deletion screen, and only that.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE WORDING IS THE FEATURE, WHICH IS WHY THIS PAGE IS BILINGUAL AND `/login` IS NOT.
 *
 * `/login`'s own comment argues, correctly, that it is English-only because there is no
 * language for it to follow: the middleware bounces arbitrary requests there, "what is a
 * reader's interface language" is a different question from "which edition are they
 * reading", and it declines to answer the first by guessing at the second.
 *
 * This page differs in both halves of that argument.
 *
 * It HAS a language to follow. It is reached from a link in the reading chrome, which
 * already knows which edition the reader is in and already labels itself in it; the
 * language rides the href, and a reader who arrives without one gets English by
 * `chromeFor`'s ordinary fallback. Nothing is being asserted about interface preference —
 * the same signal that decided the word on the link decides the words on the page it opens.
 *
 * And it NEEDS one. Issue #13's requirement is not that the deletion works; it is that the
 * screen "says plainly that it cannot retract an anonymous outcome already folded into a
 * rate". A reader who cannot read those four paragraphs has not been told, and a deletion
 * screen whose explanation is in a language the reader does not have is the screen the
 * issue is written against. `/login` can afford English because a reader can guess at
 * "email" and "password"; nobody guesses at this.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Private by default: it is in neither `PUBLIC_PATHS` nor `PUBLIC_PREFIXES`, so the
 * middleware gates it with no entry needed. `/account/deleted` is public, and has to be —
 * see its own page.
 *
 * No `'use client'`, for `/login`'s reason: the reading surface works with script
 * disabled, and a reader who has decided to leave is the last person to demand a working
 * browser from.
 */

export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const requested = params['lang'];
  const chrome = chromeFor(typeof requested === 'string' ? requested : '');
  const strings = chrome.deleteAccount;

  // Validated against a closed set, never rendered from the URL. On this page that matters
  // more than on `/login`: an arbitrary sentence would arrive beside a button that deletes
  // an account. See `account-deletion-problem.ts`.
  const problem = deletionProblem(params['error']);

  // P8 — a deployment with no identity service is a supported state. There is then no
  // account to delete, and offering the form would be offering an operation that cannot
  // run against a service nobody said was there.
  const identityConfigured = backendConfigured('authservice');

  return (
    <main className="shell" lang={chrome.language}>
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">{strings.title}</h1>
      </header>

      {problem ? (
        <section className={styles.problem} aria-live="polite">
          <p className={styles.problemDetail}>{deletionProblemMessage(problem, chrome)}</p>
        </section>
      ) : null}

      {identityConfigured ? (
        <>
          <section className="section">
            <p>{strings.lead}</p>
            <ul className={styles.removes}>
              <li>{strings.removesProgress}</li>
              <li>{strings.removesAccount}</li>
            </ul>
          </section>

          <section className="section">
            <h2>{strings.staysTitle}</h2>
            <p>{strings.stays}</p>
          </section>

          {/*
            The two paragraphs issue #13 exists for. They are rendered BEFORE the form and
            not after it, and not behind a disclosure: a consequence a reader meets after
            confirming is a consequence they were not told.
          */}
          <section className="section">
            <h2>{strings.cannotReachTitle}</h2>
            <p>{strings.cannotReach}</p>
          </section>

          <section className="section">
            <h2>{strings.notImmediateTitle}</h2>
            <p>{strings.notImmediate}</p>
          </section>

          <section className="section">
            {/*
              A real action and method="post", so this works with no JavaScript. The route
              answers with a 303, which the browser follows as a GET — a reload afterwards
              re-requests a page rather than re-submitting a password.
            */}
            <form className={styles.form} method="post" action="/api/auth/account/delete">
              <input type="hidden" name="lang" value={chrome.language} />

              <div className={styles.field}>
                <label className={styles.label} htmlFor="confirm">
                  {strings.confirmLabel(strings.confirmWord)}
                </label>
                <input
                  className={styles.input}
                  id="confirm"
                  name="confirm"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">
                  {strings.passwordLabel}
                </label>
                <input
                  className={styles.input}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                />
                {/*
                  NOT `required`. An account created through Google or GitHub has no
                  password at all — authservice branches on `user.PasswordHash != null` and
                  never reads the field — so a required attribute would lock exactly those
                  readers out of deleting their own accounts, with no way to satisfy it.
                */}
                <p className={styles.hint}>{strings.passwordHint}</p>
              </div>

              <button className={styles.submit} type="submit">
                {strings.submit}
              </button>
            </form>
          </section>
        </>
      ) : (
        <section className="section">
          <p>{strings.problemUnconfigured}</p>
        </section>
      )}

      <footer className="colophon">
        <p>
          <Link href="/">{strings.cancel}</Link>
        </p>
      </footer>
    </main>
  );
}
