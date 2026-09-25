import Link from 'next/link';

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
 * the wordmark leading home, one filled way back to the programs. English only, on
 * `/login`'s own reasoning: it has no edition to follow, because the address that led
 * here may not have carried one.
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
 * why it cannot say which segment was wrong. It says what the shape of a right address
 * is instead, which is the thing a reader can act on.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export default function NotFound(): React.JSX.Element {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede">There is no page at this address.</h1>
        <p className="standfirst">
          A frame number past the end of a program, a program the book does not have, or an
          edition it is not published in all answer this way. The book itself is fine, and
          the programs are one link away.
        </p>
        <p className="enter">
          <Link href="/">Open the programs</Link>
        </p>
      </header>

      <section className="section">
        <h2>If you followed a link</h2>
        <p>
          A frame is addressed as <code>/read/&lt;track&gt;/&lt;program&gt;/&lt;edition&gt;/&lt;frame&gt;</code>.
          Drop the last segment to reach that program&rsquo;s contents, which lists every
          section and the frame it opens at.
        </p>
      </section>
    </main>
  );
}
