import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { tagFor } from '@ab-ovo/web-kit';

import { RateRanking } from '@/components/instrument/rate-ranking';
import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';

import styles from '../../instrument.module.css';

/**
 * One unit's frames, ranked by how badly the book is doing.
 *
 * A SERVER SHELL AROUND A CLIENT COMPONENT, and the split is where the bundle tag comes
 * from. A rate is about one version of the text — pooling two tags averages a reader's
 * experience of two different wordings of the same frame, which the API refuses with a 400
 * — and the tag lives in `content/book.lock.json`, which is a server-side pin. So the page
 * resolves it and hands it down; the client component never guesses one and there is no URL
 * a caller can type that asks for a tag the deployment does not carry.
 */
export const dynamic = 'force-dynamic';

interface Params {
  readonly params: Promise<{ track: string; unit: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { unit } = await params;
  return {
    title: `${unit} — instrument — ab-ovo`,
    description: `Frames of ${unit} ranked by how badly the book is doing, each with its interval.`,
  };
}

export default async function UnitRankingPage({ params }: Params): Promise<React.JSX.Element> {
  const { track, unit } = await params;
  const bundleTag = tagFor(track);

  // An unknown track is a question about a URL and the answer is 404 — `bundle.ts` makes the
  // same split for the reading surface, and for the same reason: a 500 there fills error
  // monitoring with other people's typos.
  if (bundleTag === undefined) notFound();

  return (
    <main className={styles.page}>
      <SkipLink language="en" />
      <p className={styles.crumb}>
        {/* Not prefetched: the index titles its tab in the reader's edition (ADR-0067). */}
        <Link href="/" prefetch={false}>ab-ovo</Link> / <Link href="/instrument">instrument</Link> / {unit}
      </p>
      <h1 className={styles.title} id={SKIP_TARGET_ID}>{unit}, worst first</h1>
      <p className={styles.subtitle}>
        Frames ranked by how badly the book is doing, at <code>{bundleTag}</code>. A frame&rsquo;s
        place is decided by its worst check at one attempt — never by an average of its checks,
        which would need an interval nothing here could defend.
      </p>

      <RateRanking track={track} unit={unit} bundleTag={bundleTag} />
    </main>
  );
}
