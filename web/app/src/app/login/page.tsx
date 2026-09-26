import type { Metadata } from 'next';
import Link from 'next/link';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { registerHref, signInHref } from '@/lib/account-href';
import { chromeFor, type Chrome } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { backendConfigured } from '@/lib/server/backends';
import { readerEdition } from '@/lib/server/reader-edition';
import { rememberedAddress } from '@/lib/server/sign-in-address';
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
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IN THE READER'S EDITION SINCE ISSUE #166.
 *
 * It was English only, on the argument that the chrome table is keyed by the READING language
 * and this page sits outside `/read/[lang]` with none to follow. ADR-0052 answered that: a
 * reader always has an edition, asked for or remembered, and a Polish reader pressing
 * *Zaloguj się* was sent to an English page. Every link here carries `?lang=`
 * (`account-href.ts`), the page resolves it as the index does (`readerEdition`), the words are
 * `chrome.signInPage` and `chrome.signInProblems`, and every link and redirect out of here —
 * the form's own, through a hidden field — carries the edition on.
 *
 * A FAILED ATTEMPT KEEPS THE ADDRESS, and still not in the URL: the route leaves it in a
 * minute-long HttpOnly cookie scoped to this page (`lib/server/sign-in-address.ts`).
 * ──────────────────────────────────────────────────────────────────────────────────────
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
 *   'private-page'  the sentence it always had, now in every state of the page — after the
 *                   reason, where the form is withdrawn (see `asked`): it is the one
 *                   destination that is a reason to sign in rather than a choice to;
 *   'open'          the page the reader pressed *Sign in* on — the index's link carries
 *                   `/?lang=…`, a frame's carries the frame — which signing in returns them
 *                   to, and which is the way back if they change their mind. It is called
 *                   "where you were" rather than printed: a path is the URL's spelling of a
 *                   place, and the reader already knows the place;
 *   none            nothing to say, so nothing is said.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = 'force-dynamic';

/**
 * The tab, in the page's edition: since ADR-0067 the document's language is the page's, and it
 * is the title Next's route announcer reads out. An address no page answers is titled as one.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const chrome = chromeFor(await readerEdition(params['lang']));
  const intended = safeRedirectTarget(params['redirect']);
  return {
    title:
      intended !== null && destinationAt(intended) === 'no-page'
        ? chrome.notFound.tabTitle
        : `${chrome.signIn} — ab-ovo`,
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);
  const edition = await readerEdition(params['lang']);
  const chrome = chromeFor(edition);
  const strings = chrome.signInPage;

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
    return (
      <NoPageAt
        address={destination.address}
        chrome={chrome}
        edition={edition}
        identityConfigured={identityConfigured}
      />
    );
  }

  // Validated against a closed set, never rendered from the URL. See sign-in-problem.ts:
  // a page that echoed `?error=<text>` would put any sentence an attacker chose into this
  // site's own chrome, on the screen where a password is being asked for.
  const problem = signInProblem(params['error']);
  const problemWords = problem ? chrome.signInProblems[problem.code] : null;

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

  // Every way on carries where the reader was going and the edition they read in (#166), and
  // no link on this page prefetches: the pages they open title their tab in the edition, and a
  // prefetched head outlives a change of it (ADR-0067, `index-href.ts`).
  const startAgainHref = signInHref({ redirect: intended, edition });
  const createHref = registerHref({ redirect: intended, edition });
  const home = indexHref({ edition });

  /*
    The address a failed attempt was made with, which the route left in a cookie scoped to
    this page — read only where there is a form to put it in, and put into the field and
    nowhere else. See `lib/server/sign-in-address.ts`.
  */
  const address = offersForm ? await rememberedAddress() : null;

  /*
    A private page is named whatever else the page says, because it is the one reason for
    being here that the reader did not choose — the true half of what "What happened" used
    to say about every destination (issue #162). Where signing in would take them there, the
    sentence says so, and where the form is withdrawn, that starting again still will: the
    fresh sign-in page carries the same destination.

    WHERE IT STANDS IS PART OF WHAT IT SAYS, so each branch below places it. With a form, or
    with no identity service, it comes first. Under a withdrawn form it comes AFTER the
    paragraph saying why, because that paragraph is about the problem panel above it, and
    this sentence standing between the two once made it read as a remark about `/account` —
    to the very reader the route sends here, bounced off `/account` with a code no password
    fixes.
  */
  const asked =
    destination?.kind === 'private-page' ? (
      <p>
        {chrome.askedPrivate.before}
        <code>{destination.address}</code>
        {chrome.askedPrivate.after}
        {offersForm
          ? strings.askedPrivateSignIn
          : identityConfigured
            ? strings.askedPrivateStartAgain
            : null}
      </p>
    ) : null;

  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        {/*
          The wordmark is the way home — to the programs, in this edition — as it is on
          `/about` and the 404. On the account's pages it was text (issue #166).
        */}
        <p className="wordmark">
          <Link href={home} prefetch={false}>
            ab<span>-</span>ovo
          </Link>
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
        <h2>{chrome.signIn}</h2>
        {identityConfigured && !offersForm ? (
          <>
            {/*
              The form is withdrawn, and the sentence says why in general terms because the
              panel above has already said it in particular. It names the panel — "the
              problem described above" — instead of pointing at "the sentence above", so
              what it refers to does not depend on what stands between them, and it stands
              first anyway, directly under the heading (see `asked`). The link is a FRESH
              sign-in page — the same destination, no error code — so a reader told to wait
              a minute has somewhere to come back to, and nothing on this page invites an
              attempt the panel has just said cannot work.
            */}
            <p>
              {strings.withdrawn.before}
              <Link href={startAgainHref} prefetch={false}>{strings.withdrawn.link}</Link>
              {strings.withdrawn.after}
            </p>
            {asked}
          </>
        ) : identityConfigured ? (
          <>
            {asked}
            {destination === null ? (
              <p>{strings.useYourAccount}</p>
            ) : destination.kind === 'open' ? (
              <p>{strings.takenBack}</p>
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
              {/*
                The edition rides the same way, so the page the route answers with — this one
                with a problem, the code screen, or where the reader was going — is in it.
              */}
              <input type="hidden" name="lang" value={edition} />

              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">
                  {chrome.emailAddress}
                </label>
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

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">
                  {chrome.password}
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
                {chrome.signIn}
              </button>
            </form>
            {/*
              The way to GET an account, which this page invited the reader to have and for
              a long time did not say how to obtain. It carries the destination onward, so a
              reader bounced here off a gated page and sent to register lands where they
              were going rather than at the top of the site.
            */}
            <p>
              {strings.noAccount.before}
              <Link href={createHref} prefetch={false}>{strings.noAccount.link}</Link>
              {strings.noAccount.after}
            </p>
          </>
        ) : (
          <>
            {asked}
            {/*
              P8 — a deployment with no identity service is a supported state, and what that
              means to a reader is that there are no accounts here. It said "this deployment
              has no identity service configured, which is a normal way to run ab-ovo", which
              is true and is said to the operator (issue #162). That reading is unaffected is
              the standfirst's to say, and it already has.
            */}
            <p>{strings.noAccounts}</p>
          </>
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
            <Link href={destination.address} prefetch={false}>{strings.backToWhereYouWere}</Link>
          ) : (
            <Link href={home} prefetch={false}>{chrome.backToReader}</Link>
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
 * have carried is a page that does not exist. It keeps the edition, as every way out of these
 * pages does (issue #166), and it has the skip link and the wordmark home `LoginPage` has.
 */
function NoPageAt({
  address,
  chrome,
  edition,
  identityConfigured,
}: {
  address: string;
  chrome: Chrome;
  edition: string;
  identityConfigured: boolean;
}): React.JSX.Element {
  const strings = chrome.signInPage;
  // No link here prefetches, for the page's own reason (`LoginPage`, ADR-0067).
  const home = indexHref({ edition });
  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        <p className="wordmark">
          <Link href={home} prefetch={false}>
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede" id={SKIP_TARGET_ID}>
          {chrome.notFound.title}
        </h1>
        <p className="standfirst">
          {strings.noPage.before}
          <code>{address}</code>
          {strings.noPage.after}
        </p>
        <p className="enter">
          <Link href={home} prefetch={false}>{chrome.openPrograms}</Link>
          {identityConfigured ? (
            <Link className="quiet" href={signInHref({ edition })} prefetch={false}>
              {chrome.signIn}
            </Link>
          ) : null}
        </p>
      </header>

      <section className="section">
        <h2>{strings.whyHereTitle}</h2>
        <p>
          {strings.whyHere}
          {identityConfigured ? null : strings.whyHereNoAccounts}
        </p>
      </section>
    </main>
  );
}
