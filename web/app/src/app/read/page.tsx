import type { Metadata } from 'next';

import { ProgramList } from '@/components/read/program-list';
import { allBundles } from '@/lib/content/bundle';

/**
 * The reading index: every program this application serves.
 *
 * A Server Component over content compiled into the app — no fetch, no cookie, no backend —
 * which is the reader-loop-needs-no-account requirement of ADR-0004 applied to the page a
 * reader arrives at first. `/read` is in the middleware's PUBLIC_PATHS rather than covered
 * by the `/read/` prefix, because every entry in the prefix list ends in a slash and an
 * index path therefore needs its own line.
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
  return <ProgramList bundles={allBundles()} />;
}
