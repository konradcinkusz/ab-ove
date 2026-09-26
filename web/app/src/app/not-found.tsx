import type { Metadata } from 'next';

import { allBundles } from '@ab-ovo/web-kit';

import { NotFoundPage } from '@/components/not-found-page';
import { editionsOffered } from '@/lib/content/chosen-edition';
import { chromeFor } from '@/lib/i18n/chrome';
import { readerEdition } from '@/lib/server/reader-edition';

/**
 * The page behind a 404.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE STATUS WAS ALWAYS RIGHT AND THE PAGE BEHIND IT WAS THE FRAMEWORK'S.
 *
 * A frame number past the end of a program, a program id the book does not have, an
 * edition it is not published in — each answers 404 by design (`bundleFor` and the route
 * resolvers: a reader's typo is a 404, a deployment defect is a 500), and
 * `specs/navigation.spec.ts` asserts the status. What stood behind the status was Next's
 * bare default: a centred "404" and nothing a reader could click, on a product whose
 * every other screen is in one design language. A reader who mistyped `/13` as `/31`
 * arrived at a wall with no wordmark and no way back.
 *
 * This page is in the same register as `/login` and `/about` — the global shell classes,
 * the wordmark leading home, one filled way back to the programs.
 *
 * WHERE IT IS MET. The middleware is private by default, so an unknown TOP-LEVEL path is
 * answered with the sign-in redirect before any 404 renders; this page is what a reader
 * reaches under the public prefixes — `/read/…`, `/lab/…` — and anywhere at all once
 * signed in. That is a property of the gate rather than of this file, and UI-UX.md says
 * so beside the routes table. The sign-in page that redirect lands on says what this page
 * says, under this page's headline, and names the address this page cannot
 * (`login/page.tsx`'s `NoPageAt`, issue #140) — so a typo is not a page wherever it is met.
 *
 * NOTHING HERE IS FETCHED, and it takes no props: `not-found.tsx` receives none, which is
 * why it cannot say which segment was wrong. It says how to get from a frame's address to
 * its program's contents instead, which is the thing a reader can act on — in words, since
 * issue #162. It used to print the address's shape,
 * `/read/<track>/<program>/<edition>/<frame>`, and *track* is the content's word for a
 * course and on no screen (`chrome.ts`, on `courses`), so a reader who mistyped a frame
 * number met it here before anywhere else.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IN THE READER'S EDITION SINCE ISSUE #166 — THE ADDRESS'S, ELSE THE ONE THIS BROWSER REMEMBERS.
 *
 * It was English only, on `/login`'s old argument that it had no edition to follow. It has
 * two. The address comes first: on the reading surface it names an edition, and `app/error.tsx`
 * has read the 500's from it since issue #139. Where it names none, the edition this browser
 * remembers. A component that gets no props can read its address only in the browser, so the
 * page is `NotFoundPage`, a Client Component, as the 500's is — and it reads the remembered
 * edition there too, from the store every control reads.
 *
 * NOT FROM THE COOKIE ON THE SERVER, and that was measured rather than assumed. The root
 * not-found is rendered into EVERY route's payload, as the boundary it is, so a request-time
 * API in this component took the static rendering of every page that had one — `/lab`,
 * `/lab/p01`, `/instrument` and `/read` went from prerendered to per-request in the build
 * output. Read in the browser instead, it costs a reader whose choice only the browser holds
 * one render in English before the edition they chose, on an address that names none.
 *
 * The TAB is titled on the server, from the cookie: metadata runs for this page alone, so it
 * costs `/_not-found` its prerender and nothing else (ADR-0067 records both measurements).
 * The reading routes title their own 404s the way this page's body picks its words: the
 * address's edition, else the remembered one (`readerEdition`).
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: chromeFor(await readerEdition(undefined)).notFound.tabTitle };
}

export default function NotFound(): React.JSX.Element {
  return <NotFoundPage offered={editionsOffered(allBundles())} />;
}
