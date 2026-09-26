import type { Metadata } from 'next';
import Link from 'next/link';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { registerHref, signInHref } from '@/lib/account-href';
import { chromeFor } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { destinationAt } from '@/lib/page-gate';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '@/lib/password-policy';
import { backendConfigured } from '@/lib/server/backends';
import { legalDocument, legalPath, offersRegistrationForm } from '@/lib/server/legal';
import { readerEdition } from '@/lib/server/reader-edition';
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
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IN THE READER'S EDITION SINCE ISSUE #166, for `/login`'s reason and by `/login`'s means: the
 * edition rides every link in and out and the form's hidden field, and the words are
 * `chrome.registerPage` and `chrome.registrationProblems`.
 *
 * AND THE PASSWORD'S RULES ARE THE FIELD'S OWN. They were a paragraph under it that nothing
 * tied to it, and the browser checked one of the five, so a reader typing `password1` met
 * the other four as a round trip and a refusal. Now the paragraph is the field's description
 * (`aria-describedby`), which a screen reader says with it, and the browser refuses before
 * anything is sent what the identity service would refuse after (`lib/password-policy.ts`).
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
  return { title: `${chrome.registerPage.heading} — ab-ovo` };
}

/** The password field's description, by id — the paragraph that states the rules. */
const PASSWORD_RULES_ID = 'password-rules';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);
  const edition = await readerEdition(params['lang']);
  const chrome = chromeFor(edition);
  const strings = chrome.registerPage;

  /*
    What stands at the destination, by the gate's own lists — `/login`'s question, asked for
    `/login`'s reason (issue #162). `/login`'s *Create one* carries whatever it was handed,
    and most of that is the page the reader pressed *Sign in* on, which this page used to
    call "one of the few pages that needs to know who you are". Only a private page is.
  */
  const destination = intended === null ? null : destinationAt(intended);

  // P8 — a deployment with no identity service is a supported state. `backendConfigured`
  // rather than `publicAuthBaseUrl`: the browser never speaks to authservice, so what
  // matters is whether this SERVER was told where identity is.
  const identityConfigured = backendConfigured('authservice');

  // Both validated against closed sets, never rendered from the URL. See
  // registration-problem.ts: a page that echoed `?error=<text>` would put any sentence an
  // attacker chose into this site's chrome, on the screen where a password is being chosen.
  const problem = registrationProblem(params['error']);
  const notice = registrationNotice(params['notice']);
  const problemWords = problem ? chrome.registrationProblems[problem.code] : null;
  const noticeWords = notice ? chrome.registrationNotices[notice] : null;

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

  // Every way on carries the destination and the edition (issue #166) — the fresh page
  // under an answer too, which was a bare `/register` and dropped where the reader was going.
  // None of them prefetches, for `/login`'s reason (ADR-0067).
  const signIn = signInHref({ redirect: intended, edition });
  const startAgain = registerHref({ redirect: intended, edition });
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

      {noticeWords ? (
        <section className={styles.notice} aria-live="polite">
          <h2 className={styles.noticeTitle}>{noticeWords.title}</h2>
          <p className={styles.noticeDetail}>{noticeWords.detail}</p>
        </section>
      ) : null}

      <section className="section">
        <h2>{strings.heading}</h2>

        {!identityConfigured ? (
          /*
            P8, in the reader's words rather than the operator's: no identity service means
            no accounts here (issue #162, as on `/login`). The standfirst has already said
            that nothing a reader reads needs one.
          */
          <p>{strings.noAccounts}</p>
        ) : consent === null ? (
          /*
            Configured, and not answering — or answering something this app cannot read.
            The distinction matters to whoever is operating the deployment and not to the
            reader, so the sentence says what it means for them: nothing they can do, and
            nothing they need an account for is affected.
          */
          <p>{strings.versionsUnavailable}</p>
        ) : answered ? (
          <p>
            {notice ? (
              <>
                {strings.noticeNext.before}
                <Link href={signIn} prefetch={false}>{strings.noticeNext.link}</Link>
                {strings.noticeNext.after}
              </>
            ) : problem?.signInInstead ? (
              <>
                {strings.signInInstead.before}
                <Link href={signIn} prefetch={false}>{strings.signInInstead.link}</Link>
                {strings.signInInstead.after}
              </>
            ) : (
              <>
                {strings.answered.before}
                <Link href={startAgain} prefetch={false}>{strings.answered.link}</Link>
                {strings.answered.after}
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
          <p>{strings.documentsUnavailable}</p>
        ) : (
          <>
            <p>
              {destination === 'private-page' ? (
                <>
                  {chrome.askedPrivate.before}
                  <code>{intended}</code>
                  {chrome.askedPrivate.after}
                  {strings.askedPrivateNext.before}
                  <Link href={signIn} prefetch={false}>{strings.askedPrivateNext.link}</Link>
                  {strings.askedPrivateNext.after}
                </>
              ) : destination === 'open' ? (
                <>
                  {strings.takenBack.before}
                  <Link href={signIn} prefetch={false}>{strings.takenBack.link}</Link>
                  {strings.takenBack.after}
                </>
              ) : (
                <>
                  {strings.whereItGoes.before}
                  <Link href={signIn} prefetch={false}>{strings.whereItGoes.link}</Link>
                  {strings.whereItGoes.after}
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
              {/* The edition rides the same way, so the page the route answers with is in it. */}
              <input type="hidden" name="lang" value={edition} />

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
                  {chrome.emailAddress}
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
                  {chrome.password}
                </label>
                {/*
                  THE BROWSER REFUSES WHAT THE IDENTITY SERVICE WOULD (issue #166): the floor as
                  `minLength`, the four classes and the ceiling as `pattern` — both read from the
                  pinned service's source, and `password-policy.ts` says why the ceiling is not
                  `maxLength`. The browser's own message for a pattern names no rule, so the
                  paragraph below is the field's DESCRIPTION: said with the field when it is
                  reached, and there to read when the browser points at it.
                */}
                <input
                  className={styles.input}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  pattern={PASSWORD_PATTERN}
                  aria-describedby={PASSWORD_RULES_ID}
                  required
                />
                <p className={styles.hint} id={PASSWORD_RULES_ID}>
                  {strings.passwordRules}
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

                  The names are the reader's edition's (`chrome.registerPage.accept`, whose note
                  says why they name no owner); the pages they open are English, as the legal
                  pages are.
                */}
                <label className={styles.consentLabel} htmlFor="accept">
                  {strings.accept.before}
                  <a href={legalPath('terms', consent.terms)} target="_blank" rel="noopener">
                    {strings.accept.terms} <span className={styles.version}>{consent.terms}</span>
                  </a>
                  {strings.accept.between}
                  <a href={legalPath('privacy', consent.privacy)} target="_blank" rel="noopener">
                    {strings.accept.privacy}{' '}
                    <span className={styles.version}>{consent.privacy}</span>
                  </a>
                  {strings.accept.after}
                </label>
              </div>

              <button className={styles.submit} type="submit">
                {strings.submit}
              </button>
            </form>
          </>
        )}
      </section>

      <section className="section">
        <h2>{strings.whatNotTitle}</h2>
        {/*
          ADR-0009 §1: an outcome is keyed by a frame in a bundle version, an attempt and a
          check run, and never by a reader — said in the consent's words (#153), which are the
          question the reader was actually asked (`chrome.registerPage.whatNot`).
        */}
        <p>{strings.whatNot}</p>
      </section>

      <footer className="colophon">
        <p>
          <Link href={home} prefetch={false}>{chrome.backToReader}</Link>
        </p>
      </footer>
    </main>
  );
}
