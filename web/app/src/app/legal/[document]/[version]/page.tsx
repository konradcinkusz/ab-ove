import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  LEGAL_DOCUMENT_TITLES,
  isLegalDocumentId,
  legalDocument,
  paragraphs,
  type LegalDocumentId,
  type LegalDocumentOutcome,
} from '@/lib/server/legal';

import styles from '../../legal.module.css';

/**
 * One legal document, at one version: `/legal/terms/<version>`, `/legal/privacy/<version>`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PAGE THE CONSENT CHECKBOX LINKS TO, AND WHY IT IS ON THIS ORIGIN.
 *
 * `/register` asks a reader to accept a Terms of Use and a Privacy Policy by version, and
 * until #141 linked neither. authservice publishes the versions and no text
 * (docs/architecture/AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md §8), so the text is this
 * deployment's to publish, at `AB_OVO_LEGAL_URL`; this page reads it server-side and shows
 * it here, because the browser talks to this origin and nothing else (FRONTEND-BFF.md §1).
 * ADR-0049 records the decision.
 *
 * THE VERSION IS IN THE ADDRESS, and the page shows that version or none. A link that
 * resolved to "the current terms" would let the text a reader accepted change under the
 * record of their accepting it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Three outcomes, as `bundleFor`'s are: a document this deployment has not published —
 * no host, no such version, an unknown document — is 404, a reader's question about an
 * address; a host that could not be asked is 500, a deployment's fault.
 *
 * PUBLIC, and carved out of the login redirect by `middleware.ts` (FRONTEND-BFF.md §4): a
 * reader deciding whether to make an account has, by definition, none yet.
 *
 * English only in its own words, as `/register` is and for its reason; the document itself
 * is in whatever language the deployment published it in.
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ document: string; version: string }>;

/**
 * One fetch per request, shared by the title and the body — the step page's `frameAt`
 * pattern and its reason: Next calls `generateMetadata` and the page separately, and
 * "shared by both" would otherwise mean "fetched by both". It also keeps the tab from being
 * titled with a document the body then answers 404 for. Keyed on strings, as `frameAt` is:
 * `cache()` compares its arguments by identity, and the two callers' params objects differ.
 */
const documentAt = cache(
  (document: LegalDocumentId, version: string): Promise<LegalDocumentOutcome> =>
    legalDocument(document, version),
);

/**
 * A 404 is titled as one, as the reading routes' are: a tab carrying the site's own title
 * over "No document is published at this address" says the opposite of the page. A host
 * that failed keeps the default, because the page then throws to `app/error.tsx`.
 */
const NOT_FOUND: Metadata = { title: 'Not found — ab-ovo' };

export async function generateMetadata({
  params,
}: {
  readonly params: Params;
}): Promise<Metadata> {
  const { document, version } = await params;
  if (!isLegalDocumentId(document)) return NOT_FOUND;
  const outcome = await documentAt(document, version);
  if (outcome.kind === 'unpublished') return NOT_FOUND;
  if (outcome.kind === 'unavailable') return {};
  return { title: `${LEGAL_DOCUMENT_TITLES[document]} ${version} — ab-ovo` };
}

export default async function LegalDocumentPage({
  params,
}: {
  readonly params: Params;
}): Promise<React.JSX.Element> {
  const { document, version } = await params;
  if (!isLegalDocumentId(document)) notFound();

  const outcome = await documentAt(document, version);
  if (outcome.kind === 'unpublished') notFound();
  if (outcome.kind === 'unavailable') {
    // A deployment defect, and the log is where an operator reads it; see the header.
    throw new Error(`legal document host unavailable: ${outcome.reason}`);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede">{LEGAL_DOCUMENT_TITLES[document]}</h1>
        <p className="standfirst">
          Version <span className={styles.version}>{version}</span> — the text an account made
          here is recorded as accepting under that version. If you came from the registration
          form, it is still open where you left it, with what you typed.
        </p>
      </header>

      <article className={styles.document}>
        {paragraphs(outcome.text).map((paragraph, index) => (
          // The text is fixed for a version, so the position IS the paragraph's identity.
          <p key={index}>{paragraph}</p>
        ))}
      </article>

      <footer className="colophon">
        <p>
          <Link href="/">Back to the reader</Link>
        </p>
      </footer>
    </main>
  );
}
