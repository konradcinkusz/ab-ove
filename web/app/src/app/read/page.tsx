import type { Metadata } from 'next';

import { ReadingIndex } from '@/components/read/reading-index';
import { allBundles } from '@/lib/content/bundle';

/**
 * The reading index at its own address — the same page `/` renders.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE COMPONENT, TWO ROUTES, AND NOT A REDIRECT. `/` is the index now (see
 * `reading-index.tsx` for why the manifesto moved to `/about`), and this path still exists
 * because the middleware names it in PUBLIC_PATHS, five acceptance specs address it, and
 * `/read/<track>/...` makes `/read` a reasonable thing for a reader to type. A 308 here
 * would work and would make every one of those a redirect to follow — including the
 * `maxRedirects: 0` checks that exist precisely to catch a route answering with a
 * redirect it should not.
 *
 * The two files differ in their metadata and in nothing else. That is deliberate: this
 * page is addressed by somebody who wants the programs, and `/` by somebody who has been
 * handed the product, so the title each one puts in a tab and a search result is not the
 * same title even though the page is.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `allBundles()` throws if a pinned bundle does not validate, and this page is prerendered,
 * so THAT THROW FAILS THE BUILD rather than reaching a reader at all. Measured, not
 * reasoned about — the first draft of this comment said "a 500", which is what the two
 * server-rendered routes under this one would do; breaking the fixture deliberately gave
 * `Export encountered an error on /read/page`, exit 1, with the validator's JSON pointer
 * in the output. Either way the failure is loud, which is the point: an index that quietly
 * omitted a program would tell the reader it does not exist (ADR-0014, and bundleFor's own
 * note on why a reader's typo and a deployment defect are not the same failure).
 */
export const metadata: Metadata = {
  title: 'Programs — ab-ovo',
  description: 'Every program available to work, in each edition it has been written in.',
};

export default function ProgramsPage(): React.JSX.Element {
  return <ReadingIndex bundles={allBundles()} />;
}
