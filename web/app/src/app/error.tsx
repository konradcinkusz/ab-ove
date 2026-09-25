'use client';

import Link from 'next/link';

/**
 * The page behind a render failure.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A 500 IS A DEPLOYMENT DEFECT, AND THE PAGE SHOULD SAY SO RATHER THAN LOOK BROKEN.
 *
 * `bundleFor` used to throw when the pinned, build-time bundle was missing or did not
 * validate; ADR-0060 moved content off that path, and this page now also catches the
 * reading surface's own throw when `AbOvo.Api`'s content endpoints cannot be reached at
 * all (`read/[track]/[unit]/[lang]/[step]/page.tsx`'s `unavailable` outcome), and
 * `/legal/<document>/<version>`'s when the host that publishes the Terms and the Privacy
 * Policy does not answer (`lib/server/legal.ts`, ADR-0049's amendment) — same reasoning
 * every time: "nothing a reader typed can cause either and nothing a reader does can fix
 * it." A document host is part of the deployment, which the sentence below names first.
 * This page says whose fault it is, what is NOT lost, and offers the two things a reader
 * can do: try the render again, or go to the programs.
 *
 * A CLIENT COMPONENT BY REQUIREMENT — `error.tsx` must be one, because it renders after
 * the server-side tree failed — and it is the only one in the app that is not on the
 * reading surface. `error.message` is never rendered: in production Next redacts it to a
 * generic sentence and the `digest` is what an operator greps the log for, so the digest
 * is the one thing worth printing.
 *
 * English only, on `/login`'s reasoning: there is no edition to follow when the page that
 * would have carried one is the page that failed.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export default function RenderError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): React.JSX.Element {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede">This page could not be rendered.</h1>
        <p className="standfirst">
          That is a fault on this side &mdash; in the deployment or in the book&rsquo;s compiled
          bundle &mdash; and not in the address you asked for. Nothing you wrote is lost: your
          answers, your working and your place in the book are kept in this browser.
        </p>
        <p className="enter">
          <button onClick={() => reset()} type="button">
            Try again
          </button>
          <Link className="quiet" href="/">
            Open the programs
          </Link>
        </p>
      </header>

      {error.digest ? (
        <section className="section">
          <h2>If you report this</h2>
          <p className="meta">
            reference <code>{error.digest}</code>
          </p>
        </section>
      ) : null}
    </main>
  );
}
