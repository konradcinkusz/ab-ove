import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { allBundles } from '@ab-ovo/web-kit';

import { SignOut } from '@/components/account/sign-out';
import { ExportWorksheets } from '@/components/read/clear-controls';
import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { chromeFor } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { fetchAccountPlaces, placesInBookOrder } from '@/lib/server/account-places';
import { verifyAccessToken } from '@/lib/server/token';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';

import styles from './account.module.css';

/**
 * The account's own page: the reader's overview (issue #161).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT WAS THE DELETION SCREEN, AND ONLY THAT.
 *
 * The index's *Account* link opened a page headed "Delete your account", which said nothing
 * else about the account: not whose it was, not what it held, and nothing a reader could do
 * with it short of ending it. That screen is `/account/delete` now, unchanged in substance,
 * and this page is what an account link promises — in the order a reader asks:
 *
 *   who is signed in       the address the session's token carries, verified here;
 *   where they are         the furthest frame the ACCOUNT holds in each program, which is
 *                          the one thing an account buys (ADR-0004), read from `AbOvo.Api`;
 *   what it does not hold  their worksheets, which never leave this browser, and the export
 *                          the index offers, the same control (ADR-0055);
 *   and the two ways out   *Sign out*, and a quiet link to the deletion screen.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE READER'S OWN RECORD, SHOWN TO THAT READER, AND NOTHING ABOUT HOW THEY DID.
 *
 * The places are the rows `ProgressEndpoints` files under the bearer's own subject — the
 * query ADR-0020 leaves open, because it names one reader by equality — fetched with the
 * reader's own token (`lib/server/account-places.ts`). Each is a position and never a
 * progress (ADR-0041): a program and a frame, with no count, no fraction and no date. This
 * is not the per-reader view forbidden by the second of UI-UX.md's rules every screen
 * inherits: that rule is about the instrument, which has no reader in it to show, and this
 * page shows a reader nothing but where they left off.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * BILINGUAL, on the deletion screen's reasoning (`account/delete/page.tsx`): the index's
 * account link carries the edition it is labelled in, and the language rides the href.
 *
 * Private by default: it is in neither `PUBLIC_PATHS` nor `PUBLIC_PREFIXES`, so the
 * middleware only lets a verified session through, and `PRIVATE_PAGES` names it for
 * `/login`'s sake (issue #140). Rendered per request, because every line of it is about the
 * request's own session.
 *
 * No `'use client'` at the page. Everything but the two controls renders on the server,
 * with no script — the address, the places and the ways out are links and text.
 */

export const dynamic = 'force-dynamic';

/**
 * The tab, in the page's edition: since ADR-0067 the document's language is the page's, and a
 * title left as the site's English one would be read out in the page's voice.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const requested = (await searchParams)['lang'];
  const chrome = chromeFor(typeof requested === 'string' ? requested : '');
  return { title: `${chrome.accountOverview.title} — ab-ovo` };
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const requested = params['lang'];
  const chrome = chromeFor(typeof requested === 'string' ? requested : '');
  const strings = chrome.accountOverview;

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;

  /*
    Both at once: neither needs the other, and the page waits for the slower of the two
    rather than for their sum. The token is verified again rather than decoded — the
    middleware verified it for the gate, and an address read off an unverified token would
    be a claim the cookie makes about itself (FRONTEND-BFF.md §4). The JWKS is cached
    (`token.ts`), so the second verification costs a signature check and no request.
  */
  const [holder, held] = token
    ? await Promise.all([verifyAccessToken(token), fetchAccountPlaces(token)])
    : [null, null];

  const address = holder?.status === 'valid' ? holder.claims.email : null;

  /*
    P8 — places that could not be read are a sentence on the page and a line in the server's
    log, and the reason goes to the log alone: it names backend addresses (FRONTEND-BFF.md
    §1). `lib/actions/reveal.ts` logs its own failures the same way, for the same operator.
  */
  if (held?.kind === 'unavailable') {
    console.error(`the account's places could not be read: ${held.reason}`);
  }
  const places = held?.kind === 'held' ? placesInBookOrder(held.records, allBundles()) : null;

  // Where the reader goes back to, and where signing out sends them: the programs, in the
  // edition this page is in, so leaving does not undo the choice that labelled the link here.
  const programs = indexHref({ edition: chrome.language });

  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        {/* The way home, to the programs in this edition — it was text (issue #166). */}
        <p className="wordmark">
          <Link href={programs}>
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede" id={SKIP_TARGET_ID}>
          {strings.title}
        </h1>
        {/*
          Whose account, and the way to stop it being this browser's — together, because the
          one is the reason for the other. The address is text and never a control: it is not
          editable here, and a field that looked editable would promise a feature there is not.
        */}
        <div className={styles.holder}>
          <p className={styles.address}>
            {address ? strings.signedInAs(address) : strings.signedIn}
          </p>
          <SignOut label={chrome.signOut} language={chrome.language} then={programs} />
        </div>
      </header>

      <section className="section">
        <h2>{strings.placesTitle}</h2>
        {places === null ? (
          <p>{strings.placesUnavailable}</p>
        ) : places.length === 0 ? (
          <p>{strings.placesNone}</p>
        ) : (
          <>
            <p>{strings.placesLead}</p>
            {/*
              `role="list"` is not redundant: WebKit and Chromium drop the list role from a
              `<ul>` styled `list-style: none`, and a screen reader then hears the programs as
              loose links — the finding `program-map.tsx` and `keys-details.tsx` carry too.
            */}
            <ul className={styles.places} role="list">
              {places.map((place) => (
                <li key={`${place.track}/${place.unit}`}>
                  {/*
                    The whole row is the way back in, to the frame the account holds. The
                    spaces between the parts are text on purpose: a link's accessible name is
                    its text run together, and without them a screen reader hears the id and
                    the title as one word.
                  */}
                  <Link className={styles.place} href={place.href}>
                    <span className={styles.placeId}>{place.unit}</span>{' '}
                    <span className={styles.placeTitle} lang={place.language}>
                      {place.title}
                    </span>{' '}
                    <span className={styles.placeAt}>{chrome.atFrame(place.step)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="section">
        <h2>{strings.worksheetsTitle}</h2>
        <p>{strings.worksheets}</p>
        {/*
          THE INDEX'S EXPORT, NOT A SECOND ONE. It reads this browser's storage, so it cannot
          exist in the first paint and renders nothing when nothing is written here — and its
          line is held open from the first paint (`account.module.css`), so its arrival moves
          nothing below it: issue #7's constraint on the index's row, kept on this page.
        */}
        <p className={styles.export}>
          <ExportWorksheets label={chrome.exportWorksheets} language={chrome.language} />
        </p>
      </section>

      {/*
        THE WAY TO DELETION: A LINK TO A PAGE, NOT AN ACT. The page it opens says what a
        deletion removes, what it leaves and what it cannot reach before it offers the button
        (ADR-0021), and asks for the confirmation word there — so nothing needs guarding here.
        It is named by that page's own heading, so the link and the page cannot disagree about
        where it leads, and it carries the edition, which that page follows too.
      */}
      <section className="section">
        <p>
          <Link
            className={styles.delete}
            href={`/account/delete?lang=${encodeURIComponent(chrome.language)}`}
          >
            {chrome.deleteAccount.title}
          </Link>
        </p>
      </section>

      <footer className="colophon">
        <p>
          <Link href={programs}>{strings.keepReading}</Link>
        </p>
      </footer>
    </main>
  );
}
