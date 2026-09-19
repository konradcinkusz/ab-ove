import type { Metadata } from 'next';

import { ReadingIndex } from '@/components/read/reading-index';
import { allBundles } from '@/lib/content/bundle';

/**
 * The landing page, which is the index — see `components/read/reading-index.tsx`.
 *
 * It renders from content compiled into the app and nothing else: no fetch, no cookie, no
 * backend. That is not an optimisation, it is the product's first requirement (ADR-0004 —
 * the reader loop works with no account), and a landing page that could not render without
 * an API would have broken it on the first screen.
 *
 * WHAT USED TO BE HERE IS AT `/about`, in full: the loop, what the product needs from a
 * reader, the four phases, the integration panel and the colophon. None of it was cut. It
 * was in front of the book, and a reader who arrives wanting to read a program should not
 * have to read an argument about reading first.
 */
export const metadata: Metadata = {
  title: 'ab-ovo',
  description:
    'A book you work, not a book you read — the 47 programs of Mathematics from Zero for the AI Engineer, in English and Polish.',
};

export default function LandingPage(): React.JSX.Element {
  return <ReadingIndex bundles={allBundles()} />;
}
