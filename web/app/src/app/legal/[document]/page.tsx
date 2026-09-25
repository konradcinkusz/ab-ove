import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * `/legal/terms` and `/legal/privacy`, with no version: always a 404.
 *
 * A document is published one version at a time, and the consent links to the version it
 * records (ADR-0049's amendment), so there is no "current" text for this address to show —
 * redirecting to one would be the link that changes under a record of accepting it, which
 * `[version]/page.tsx` exists not to be. The page is here only so that the 404 is
 * `legal/not-found.tsx`'s, which names the shape of a right address, and not the root one,
 * whose every word is about frames.
 *
 * Public under `middleware.ts`'s `/legal/` carve-out, as the documents are (FRONTEND-BFF.md §4).
 */
export const metadata: Metadata = { title: 'Not found — ab-ovo' };

export default function LegalDocumentWithoutVersion(): never {
  notFound();
}
