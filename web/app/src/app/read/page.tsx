import { permanentRedirect } from 'next/navigation';

/**
 * The reading index moved to `/` (ADR-0036), and this is what keeps every link to it
 * working.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A 308 RATHER THAN A DELETED ROUTE, AND RATHER THAN A 307.
 *
 * `/read` has been the way into the programs for the whole life of this application. It is
 * in readers' history, and it was in this repository's own screens until every in-app link
 * was pointed at `/` directly (ADR-0036, Consequences) — a redirect a reader's own bookmark
 * pays once is fine; one the contents crumb paid on every click was not. A 404 here would
 * still be this change reaching a reader as a fault.
 *
 * PERMANENT, because the move is. A 307 tells a browser and a crawler to keep asking, which
 * is a promise to move it back; a 308 says the index is at `/` now and is the honest
 * answer. The deep links BELOW this path do not move at all: `/read/<track>/<unit>/<lang>`
 * and everything under it is untouched, which is why this is one redirect rather than a
 * rewrite of a URL space.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `/read` STAYS IN THE MIDDLEWARE'S PUBLIC LIST and must. A redirect is a response, so a
 * private `/read` would answer an anonymous reader with a 307 to `/login` and never reach
 * this file — the reader would be asked to sign in on the way to a page that needs no
 * account, which is the opposite of what the redirect is for.
 */
export default function ReadIndexPage(): never {
  permanentRedirect('/');
}
