import Link from 'next/link';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { backendConfigured } from '@/lib/server/backends';
import { destinationAt } from '@/lib/page-gate';
import { safeRedirectTarget } from '@/lib/redirect-target';
import { signInProblem } from '@/lib/sign-in-problem';

import styles from '../credentials-form.module.css';

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
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AN ADDRESS NO PAGE ANSWERS IS SAID TO BE ONE (issue #140).
 *
 * The middleware is private by default, so a typo — `/nope` — is bounced here exactly as
 * `/account` is, and this page used to tell that reader they had asked for "one of the few
 * pages that needs to know who you are". It now asks `destinationAt` what stands at the
 * address, which is the gate's own answer plus `PRIVATE_PAGES` (`lib/page-gate.ts`): a page
 * the gate closes gets the words it always had, an address the gate opens is one the reader
 * chose to sign in from and is carried as before, and an address the gate closes with no
 * page behind it gets a page saying so — the programs, a fresh sign-in, and NOT the form,
 * because signing in cannot make a page appear and the destination would be a 404.
 *
 * The gate itself is untouched by this: the typo still meets the sign-in redirect. What
 * changed is only what the sign-in page says when it gets there.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT SAYS WHAT A READER NEEDS TO KNOW, AND THE REASONING STAYS HERE (issue #162).
 *
 * The heading read "Signing in is optional", which answers a question nobody on this page
 * asked; it says what signing in is for now. The form asked for the password registered
 * "with the identity service this deployment is configured against", and a site with no
 * identity service described itself as a deployment "configured" without one — the
 * operator's sentences, both. And a "What happened" section spoke to every visitor: "no
 * destination was carried into this page" to a reader who had simply pressed *Sign in*, and
 * "something asked for an account before showing you" a page that never asks.
 *
 * So the destination is named once, by what `destinationAt` says stands there:
 *
 *   'private-page'  the sentence it always had, now in every state of the page: it is the
 *                   one destination that is a reason to sign in rather than a choice to;
 *   'open'          the page the reader pressed *Sign in* on — the index's link carries
 *                   `/?lang=…`, a frame's carries the frame — which signing in returns them
 *                   to, and which is the way back if they change their mind. It is called
 *                   "where you were" rather than printed: a path is the URL's spelling of a
 *                   place, and the reader already knows the place;
 *   none            nothing to say, so nothing is said.
 * ──────────────────────────────────────────────────────────────────────────────────────
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

  // What stands at the address, asked once, of the gate's own lists (`lib/page-gate.ts`).
  const destination =
    intended === null ? null : { address: intended, kind: destinationAt(intended) };

  // Issue #140 — see the header. The address is never carried any further when no page
  // answers it: not into the form, not onward to `/register`.
  if (destination?.kind === 'no-page') {
    return <NoPageAt address={destination.address} identityConfigured={identityConfigured} />;
  }

  // Validated against a closed set, never rendered from the URL. See sign-in-problem.ts:
  // a page that echoed `?error=<text>` would put any sentence an attacker chose into this
  // site's own chrome, on the screen where a password is being asked for.
  const problem = signInProblem(params['error']);

  /*
    WHETHER THE FORM IS WORTH OFFERING, which `SignInProblem.retryable` was written to
    decide and nothing read. A rejected password is the reader's to fix. A locked account,
    an identity service that is down, a token this deployment refuses — no password
    changes those, and a form under them "is the interface telling the reader the fault is
    theirs" (the field's own words). The two second-factor codes that send the reader back
    here to start from the password are the exception, and `startsOver` names them.
  */
  const offersForm =
    identityConfigured && (problem === null || problem.retryable || problem.startsOver === true);

  const startAgainHref = intended ? `/login?redirect=${encodeURIComponent(intended)}` : '/login';

  const registerHref = intended
    ? `/register?redirect=${encodeURIComponent(intended)}`
    : '/register';

  return (
    <main className="shell">
      <SkipLink language="en" />
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        {/*
          What signing in is for, and then that reading does not need it (issue #162). The
          heading was "Signing in is optional", which is the second half on its own. It
          states rather than invites, so it stays true on a site with no identity service,
          where the section below says there is nothing to sign in to. "This browser
          remembers" is the reader's view of ADR-0061's cookie: the place is on the server,
          and this browser is what it is kept under.
        */}
        <h1 className="lede" id={SKIP_TARGET_ID}>
          Signing in keeps your place across devices.
        </h1>
        <p className="standfirst">
          You do not need an account to read: every frame and the lab work without one, and
          this browser already remembers where you are. An account carries your place to your
          other devices, and that is what it is for.
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
        {/*
          A private page is named whatever else the page says, because it is the one reason
          for being here that the reader did not choose — the true half of what "What
          happened" used to say about every destination (issue #162). Where signing in would
          take them there, the sentence says so.
        */}
        {destination?.kind === 'private-page' ? (
          <p>
            You asked for <code>{destination.address}</code>, which is one of the few pages
            that needs to know who you are.
            {offersForm ? ' Sign in and you will be taken straight there.' : null}
          </p>
        ) : null}
        {identityConfigured && !offersForm ? (
          /*
            The form is withdrawn, and the sentence says why in general terms because the
            panel above has already said it in particular. The link is a FRESH sign-in page
            — the same destination, no error code — so a reader told to wait a minute has
            somewhere to come back to, and nothing on this page invites an attempt the
            panel has just said cannot work.
          */
          <p>
            Typing the password again cannot change that answer, so the form is not offered
            under it. Once the sentence above says an attempt is worth making,{' '}
            <Link href={startAgainHref}>start again</Link> from a fresh sign-in page.
          </p>
        ) : identityConfigured ? (
          <>
            {destination === null ? (
              <p>Use the email address and password you created your account with.</p>
            ) : destination.kind === 'open' ? (
              <p>Sign in and you will be taken back to where you were.</p>
            ) : null}
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
            {/*
              The way to GET an account, which this page invited the reader to have and for
              a long time did not say how to obtain. It carries the destination onward, so a
              reader bounced here off a gated page and sent to register lands where they
              were going rather than at the top of the site.
            */}
            <p>
              No account yet? <Link href={registerHref}>Create one</Link> — it takes an email
              address and a password, and it is only needed to carry your place between
              devices.
            </p>
          </>
        ) : (
          /*
            P8 — a deployment with no identity service is a supported state, and what that
            means to a reader is that there are no accounts here. It said "this deployment
            has no identity service configured, which is a normal way to run ab-ovo", which
            is true and is said to the operator (issue #162). That reading is unaffected is
            the standfirst's to say, and it already has.
          */
          <p>This site has no accounts, so there is nothing to sign in to.</p>
        )}
      </section>

      {/*
        The way out. For a reader who pressed *Sign in* on a page, it is that page — the
        address the gate would have opened anyway, and already validated as same-origin by
        `safeRedirectTarget` — so changing their mind costs one press (issue #162).
      */}
      <footer className="colophon">
        <p>
          {destination?.kind === 'open' ? (
            <Link href={destination.address}>Back to where you were</Link>
          ) : (
            <Link href="/">Back to the reader</Link>
          )}
        </p>
      </footer>
    </main>
  );
}

/**
 * What a reader bounced off an address with no page behind it is shown — issue #140.
 *
 * The words are `not-found.tsx`'s, because it is the same fact: there is no page here. What
 * this adds is the one thing that page cannot say, the address itself (the gate carried it,
 * so this page has it where `not-found.tsx` has none), and why the reader is looking at a
 * sign-in page to learn it. Rendered as text inside `<code>`, never as markup, and only
 * after `safeRedirectTarget` has refused anything that is not a same-origin path.
 *
 * The way to sign in is a FRESH `/login`, with no destination: the one this address would
 * have carried is a page that does not exist.
 */
function NoPageAt({
  address,
  identityConfigured,
}: {
  address: string;
  identityConfigured: boolean;
}): React.JSX.Element {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">There is no page at this address.</h1>
        <p className="standfirst">
          You asked for <code>{address}</code>, and nothing in ab-ovo is there &mdash; a
          mistyped address or an out-of-date link does this. It is not a page that needs an
          account, and signing in would not make one appear.
        </p>
        <p className="enter">
          <Link href="/">Open the programs</Link>
          {identityConfigured ? (
            <Link className="quiet" href="/login">
              Sign in
            </Link>
          ) : null}
        </p>
      </header>

      <section className="section">
        <h2>Why you are on the sign-in page</h2>
        <p>
          An address this site does not recognise is treated as private until it is shown
          otherwise, so a mistyped one lands here rather than on a page that says it is
          missing. The programs, the frames and the lab need no account at all.
          {identityConfigured
            ? null
            : ' And this site has no accounts, so there is nothing here to sign in to.'}
        </p>
      </section>
    </main>
  );
}
