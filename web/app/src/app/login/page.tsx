import Link from 'next/link';

import { backendConfigured } from '@/lib/server/backends';
import { safeRedirectTarget } from '@/lib/redirect-target';
import { signInProblem } from '@/lib/sign-in-problem';

import styles from './login-form.module.css';

/**
 * The sign-in page.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A PLAIN FORM, POSTING TO THIS ORIGIN, WITH NO CLIENT COMPONENT BEHIND IT.
 *
 * FRONTEND-BFF.md §3 — the tokens must be set as cookies by a server route, because
 * `document.cookie` CANNOT set HttpOnly and any design in which the client writes the
 * session cookie has already lost the property. This form goes one step further than the
 * guide's minimum: the credentials go to `/api/auth/login`, that route talks to authservice
 * server-side, and the tokens are never in the document at all. The browser learns a status
 * and a destination.
 *
 * There is no `'use client'` anywhere in this page, which is the other half of the point:
 * the reading surface works with script disabled, and a sign-in that did not would be the
 * first thing in the product to require it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The page is English-only, as it was before the form arrived. The chrome string table is
 * keyed by the READING language — the edition of the book a reader is in — and this page
 * sits outside `/read/[lang]`, so there is no language for it to follow. Giving it one is a
 * decision about what a reader's interface language IS, and that is a separate question
 * from which edition they are reading.
 */

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);

  /**
   * P8 — a deployment with no identity service is a supported state, so the page says which
   * of the two situations the reader is in rather than offering a form that cannot work.
   *
   * `backendConfigured`, not `publicAuthBaseUrl`: the browser no longer needs a public
   * address for authservice, because it never speaks to it. What matters is whether this
   * SERVER was told where identity is.
   */
  const identityConfigured = backendConfigured('authservice');

  // Validated against a closed set, never rendered from the URL. See sign-in-problem.ts:
  // a page that echoed `?error=<text>` would put any sentence an attacker chose into this
  // site's own chrome, on the screen where a password is being asked for.
  const problem = signInProblem(params['error']);

  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">Signing in is optional.</h1>
        <p className="standfirst">
          Almost nothing in ab-ovo needs an account: the frames and the lab run without one,
          and your place in a program is already kept on this device. An account exists to
          carry that between machines, and for nothing else.
        </p>
      </header>

      {problem ? (
        <section className={styles.problem} aria-live="polite">
          <h2 className={styles.problemTitle}>{problem.title}</h2>
          <p className={styles.problemDetail}>{problem.detail}</p>
        </section>
      ) : null}

      <section className="section">
        <h2>Sign in</h2>
        {identityConfigured ? (
          <>
            <p>
              {intended ? (
                <>
                  You asked for <code>{intended}</code>, which is one of the few pages that
                  needs to know who you are. Sign in and you will be taken straight there.
                </>
              ) : (
                <>
                  Use the email address and password you registered with the identity service
                  this deployment is configured against.
                </>
              )}
            </p>
            {/*
              method="post" and a real action, so this works with no JavaScript. The route
              answers a form post with a 303, which the browser follows as a GET — a reload
              after signing in re-requests a page rather than re-submitting a password.
            */}
            <form className={styles.form} method="post" action="/api/auth/login">
              {/*
                The destination rides along in the body rather than the URL, so it survives
                the post without being appended to an address that is about to carry an
                error code as well. It is re-validated on arrival: this page's copy proves
                nothing about what the route is handed.
              */}
              {intended ? <input type="hidden" name="redirect" value={intended} /> : null}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">
                  Email address
                </label>
                <input
                  className={styles.input}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">
                  Password
                </label>
                <input
                  className={styles.input}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button className={styles.submit} type="submit">
                Sign in
              </button>
            </form>
            {/*
              The email is deliberately NOT filled back in after a failed attempt. The only
              way to carry it through a form post that answers with a redirect is the query
              string, and an address bar is the one place a value ends up in browser history
              and in every access log between here and the reader. One retype is cheaper.
            */}
          </>
        ) : (
          <p>
            This deployment has no identity service configured, which is a normal way to run
            ab-ovo. Everything except progress that follows you between machines works
            without one, and there is nothing here to sign in to.
          </p>
        )}
      </section>

      <section className="section">
        <h2>What happened</h2>
        <p>
          {intended ? (
            <>
              Something asked for an account before showing you <code>{intended}</code>. That
              is unusual — the frames, the contents and the lab are all reachable without
              one.
            </>
          ) : (
            <>
              No destination was carried into this page, so nothing is waiting on the other
              side of a sign-in. Go back and carry on reading.
            </>
          )}
        </p>
      </section>

      <footer className="colophon">
        <p>
          <Link href="/">Back to the reader</Link>
        </p>
      </footer>
    </main>
  );
}
