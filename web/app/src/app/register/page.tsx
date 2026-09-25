import Link from 'next/link';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { backendConfigured } from '@/lib/server/backends';
import { legalDocument, legalPath, offersRegistrationForm } from '@/lib/server/legal';
import { consentVersions } from '@/lib/server/register';
import { safeRedirectTarget } from '@/lib/redirect-target';
import { registrationNotice, registrationProblem } from '@/lib/registration-problem';

import styles from '../credentials-form.module.css';

/**
 * The registration page.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PAGE THAT WAS MISSING, AND THE MIDDLEWARE ALREADY KNEW IT.
 *
 * The page gate has carried `/register` in `PUBLIC_PATHS` since it was written —
 * "a reader deciding whether to trust what this system measures must not have to register
 * first" — and there was no page behind it. So `/login` invited a reader to use "the email
 * address and password you registered with", the only way to get one was to POST to
 * authservice by hand, and the honest summary of the product's account story was that you
 * could sign in and could not sign up.
 *
 * It is a PLAIN FORM with no client component behind it, for `/login`'s reasons exactly:
 * FRONTEND-BFF.md §3 puts session establishment in a server route because `document.cookie`
 * cannot set HttpOnly, and this form goes one step further — the chosen password goes to
 * `/api/auth/register`, that route talks to authservice server-side, and no token is ever
 * in the document. There is no `'use client'` here, so registering works with script
 * disabled, exactly as reading does.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * English only, as `/login` is and for the same recorded reason: the chrome string table is
 * keyed by the READING language — which edition of the book a reader is in — and this page
 * sits outside `/read/[lang]`, so there is no language for it to follow.
 */

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);

  // P8 — a deployment with no identity service is a supported state. `backendConfigured`
  // rather than `publicAuthBaseUrl`: the browser never speaks to authservice, so what
  // matters is whether this SERVER was told where identity is.
  const identityConfigured = backendConfigured('authservice');

  // Both validated against closed sets, never rendered from the URL. See
  // registration-problem.ts: a page that echoed `?error=<text>` would put any sentence an
  // attacker chose into this site's chrome, on the screen where a password is being chosen.
  const problem = registrationProblem(params['error']);
  const notice = registrationNotice(params['notice']);

  /**
   * THE VERSIONS ARE FETCHED, NOT WRITTEN DOWN HERE.
   *
   * `AuthController.Register` refuses any registration that does not accept the exact
   * Terms and Privacy versions the instance is configured with, and publishes
   * `GET /api/v1/auth/consents/versions` anonymously so that a sign-up form can ask. A
   * page that hard-coded them would break registration silently the first time one was
   * bumped — which is the whole point of them being versioned.
   *
   * `null` means no rung of the ladder answered. The form is then withdrawn rather than
   * offered with a guess: a guessed version is a registration authservice refuses, and a
   * consent record that would have been a lie if it had not.
   */
  const consent = identityConfigured ? await consentVersions() : null;

  /*
    WHETHER THE FORM IS WORTH OFFERING. `/login`'s rule, one page over: a password the
    identity service refused is the reader's to fix and the form is the place to fix it; an
    address that already has an account, a service that is down, a token this deployment
    will not accept — no retype changes any of those, and a form under them is the
    interface telling the reader the fault is theirs.

    The notice is the other reason to withdraw it. The account HAS been created and is
    waiting on a verification email; a form under that sentence invites a second attempt
    whose only possible answer is that the address is taken.
  */
  const answered = notice !== null || (problem !== null && !problem.retryable);

  /*
    THE DOCUMENTS HAVE TO EXIST FOR THE CONSENT TO MEAN ANYTHING (#141).

    authservice publishes the versions and no text — docs/architecture/
    AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md §8 — so a version is only a name, and the text it
    names is this deployment's to publish (`lib/server/legal.ts`, ADR-0049). Both names in
    the consent sentence link to the exact version being accepted, on this origin; and when
    either text cannot be shown the form is withdrawn, as it is when the versions cannot be
    fetched. A checkbox offering a document nobody can read would be the form asserting a
    consent the reader had no way to give.

    Asked for only when the form is otherwise going to be offered: a page that has already
    answered the reader has no checkbox to back. The decision itself is
    `offersRegistrationForm`, pure and tested in `legal.test.ts`, because the state that
    withdraws the form is the one no acceptance deployment is in.
  */
  const documents =
    consent !== null && !answered
      ? await Promise.all([
          legalDocument('terms', consent.terms),
          legalDocument('privacy', consent.privacy),
        ])
      : null;

  const offersForm = offersRegistrationForm({
    identityConfigured,
    versionsKnown: consent !== null,
    answered,
    documents,
  });

  const signInHref = intended ? `/login?redirect=${encodeURIComponent(intended)}` : '/login';

  return (
    <main className="shell">
      <SkipLink language="en" />
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede" id={SKIP_TARGET_ID}>
          An account is optional, and this is where one is made.
        </h1>
        <p className="standfirst">
          The frames, the worksheet and the programs all work without one, and your place is
          already kept on this device. An account carries that place between machines. That
          is the whole of what it buys, and nothing you read is recorded against it.
        </p>
      </header>

      {problem ? (
        <section className={styles.problem} aria-live="polite">
          <h2 className={styles.problemTitle}>{problem.title}</h2>
          <p className={styles.problemDetail}>{problem.detail}</p>
        </section>
      ) : null}

      {notice ? (
        <section className={styles.notice} aria-live="polite">
          <h2 className={styles.noticeTitle}>{notice.title}</h2>
          <p className={styles.noticeDetail}>{notice.detail}</p>
        </section>
      ) : null}

      <section className="section">
        <h2>Create an account</h2>

        {!identityConfigured ? (
          <p>
            This deployment has no identity service configured, which is a normal way to run
            ab-ovo. Everything except progress that follows you between machines works
            without one, and there is nothing here to register with.
          </p>
        ) : consent === null ? (
          /*
            Configured, and not answering — or answering something this app cannot read.
            The distinction matters to whoever is operating the deployment and not to the
            reader, so the sentence says what it means for them: nothing they can do, and
            nothing they need an account for is affected.
          */
          <p>
            The identity service could not be asked which terms an account is created
            under, so the form is not offered — an account made without that answer would
            be one it refuses. This is our side rather than yours; reading needs no account
            and is unaffected. Try again in a few minutes.
          </p>
        ) : answered ? (
          <p>
            {notice ? (
              <>
                Nothing else is needed here. When the address is confirmed,{' '}
                <Link href={signInHref}>sign in</Link>.
              </>
            ) : problem?.signInInstead ? (
              <>
                There is nothing to create, so the form is not offered under it.{' '}
                <Link href={signInHref}>Sign in</Link> instead.
              </>
            ) : (
              <>
                Submitting the same details again cannot change that answer, so the form is
                not offered under it. Once the sentence above says an attempt is worth
                making, <Link href="/register">start again</Link> from a fresh page.
              </>
            )}
          </p>
        ) : !offersForm ? (
          /*
            The versions are known and a text for one of them is not — no host is
            configured, the host has no such file, or it did not answer. As with the
            versions above, which of those it was matters to the operator and not to the
            reader, and none of it is something the reader can fix.
          */
          <p>
            The Terms of Use and the Privacy Policy an account here is created under cannot
            be shown right now, so the form is not offered — accepting them unread would not
            be a consent. This is our side rather than yours; reading needs no account and is
            unaffected.
          </p>
        ) : (
          <>
            <p>
              {intended ? (
                <>
                  You asked for <code>{intended}</code>, which is one of the few pages that
                  needs to know who you are. Make an account and you will be taken straight
                  there — or <Link href={signInHref}>sign in</Link> if you already have one.
                </>
              ) : (
                <>
                  The address and password go to the identity service this deployment is
                  configured against; this site never stores either.{' '}
                  <Link href={signInHref}>Sign in</Link> if you already have an account.
                </>
              )}
            </p>

            {/*
              method="post" and a real action, so this works with no JavaScript. The route
              answers a form post with a 303, which the browser follows as a GET — a reload
              after registering re-requests a page rather than re-submitting a password.
            */}
            <form className={styles.form} method="post" action="/api/auth/register">
              {/*
                The destination rides in the body rather than the URL, so it survives the
                post without being appended to an address that is about to carry an error
                code as well. It is re-validated on arrival: this page's copy proves nothing
                about what the route is handed.
              */}
              {intended ? <input type="hidden" name="redirect" value={intended} /> : null}

              {/*
                WHAT WAS ON SCREEN WHEN THE BOX WAS TICKED. The route re-reads the live
                versions and refuses to forward anything that does not match these, so a
                caller cannot choose what an account is recorded as having accepted — and a
                reader cannot be recorded as accepting a document that was swapped while the
                page was open. See the route's header.
              */}
              <input type="hidden" name="terms" value={consent.terms} />
              <input type="hidden" name="privacy" value={consent.privacy} />

              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">
                  Email address
                </label>
                <input
                  className={styles.input}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
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
                  autoComplete="new-password"
                  // authservice's own policy, read from its Program.cs. The browser enforces
                  // the length; the other four rules are its to enforce and this page's to
                  // state, which is why the sentence below says all five.
                  minLength={8}
                  required
                />
                <p className={styles.hint}>
                  At least eight characters, with an upper case letter, a lower case letter,
                  a digit, and one character that is none of those.
                </p>
              </div>

              <div className={styles.consent}>
                <input
                  className={styles.consentBox}
                  id="accept"
                  name="accept"
                  type="checkbox"
                  value="yes"
                  required
                />
                {/*
                  EACH NAME LINKS TO THE VERSION BEING ACCEPTED, never to "the current" text:
                  the address carries the same string the hidden field above does. A new tab,
                  because the reader is part-way through this form, and a navigation away
                  and back is not guaranteed to bring back what they typed (#141). A link
                  inside a <label> does not tick the box it labels — activating it follows the
                  link and nothing else.

                  "The" Terms, not "the identity service's": authservice records which version
                  was accepted and publishes no text, so the documents are this deployment's
                  (ADR-0049's amendment), and the sentence does not name an owner they lack.
                */}
                <label className={styles.consentLabel} htmlFor="accept">
                  I accept the{' '}
                  <a href={legalPath('terms', consent.terms)} target="_blank" rel="noopener">
                    Terms of Use <span className={styles.version}>{consent.terms}</span>
                  </a>{' '}
                  and{' '}
                  <a href={legalPath('privacy', consent.privacy)} target="_blank" rel="noopener">
                    Privacy Policy <span className={styles.version}>{consent.privacy}</span>
                  </a>
                  . Each opens in a new tab, so nothing typed here is lost. Those versions are
                  recorded against the account, with the time and this device&rsquo;s address,
                  because that is what makes the acceptance evidence rather than a claim.
                </label>
              </div>

              <button className={styles.submit} type="submit">
                Create account
              </button>
            </form>
          </>
        )}
      </section>

      <section className="section">
        <h2>What an account does not do</h2>
        <p>
          It does not gate anything you are reading, and it is not how the book is measured.
          An outcome carries a frame, a bundle version and whether an answer matched — never
          a reader — so there is no per-reader score to sign in and see, and creating an
          account does not start one.
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
