import Link from 'next/link';

/**
 * The 404 under `/legal/`.
 *
 * The root `not-found.tsx` is about frames — a frame number past the end, a program the book
 * does not have — and every word of it would be wrong here. What a reader at this address
 * needs to know is narrower: this deployment has not published that document at that
 * version, and while that is so the registration form does not offer it for acceptance
 * (`app/register/page.tsx`, ADR-0049). English only, as the page it stands behind is; its
 * links to the index do not prefetch, since the index titles its tab in the reader's edition
 * (ADR-0067).
 */
export default function LegalNotFound(): React.JSX.Element {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/" prefetch={false}>
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede">No document is published at this address.</h1>
        <p className="standfirst">
          The Terms of Use and the Privacy Policy are published one version at a time, at{' '}
          <code>/legal/terms/&lt;version&gt;</code> and{' '}
          <code>/legal/privacy/&lt;version&gt;</code>. This deployment has not published the
          one asked for — and a version that is not published is never offered for
          acceptance when an account is made.
        </p>
        <p className="enter">
          <Link href="/" prefetch={false}>Open the programs</Link>
        </p>
      </header>
    </main>
  );
}
