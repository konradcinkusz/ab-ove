import type { Metadata } from 'next';
import Link from 'next/link';

import { tagFor } from '@/lib/content/bundle';
import { LABS } from '@/lib/lab/protocol';

import styles from './instrument.module.css';

/**
 * The instrument's index: the units it has anything to say about.
 *
 * DRIVEN BY `LABS`, WHICH IS THE ONLY HONEST SOURCE FOR IT. A cell exists because a reader
 * ran a check, a check exists because a lab does, so the units with rates are exactly the
 * units with labs. Listing the book's forty-seven programs here would offer the author
 * forty-six links to an empty table and one to a real one.
 *
 * Private by construction: `/instrument` is in neither `PUBLIC_PATHS` nor `PUBLIC_PREFIXES`,
 * so the middleware gates it with no entry needed. The API gates the data separately and is
 * the authority — see `RateRanking`, which asks and reports what it is told rather than
 * deciding for itself whether the caller may look.
 */
export const metadata: Metadata = {
  title: 'Instrument — ab-ovo',
  description:
    'Frames ranked by how badly the book is doing. Not readers ranked by anything: the ' +
    'store these numbers come from has no column that could name one.',
};

export default function InstrumentIndexPage(): React.JSX.Element {
  return (
    <main className={styles.page}>
      <p className={styles.crumb}>
        <Link href="/">ab-ovo</Link> / instrument
      </p>
      <h1 className={styles.title}>The instrument</h1>
      <p className={styles.subtitle}>
        What the book&rsquo;s own readers found hard, frame by frame. Every number carries the
        interval around it, because a rate quoted without one is a ratio quoted without its two
        quantities — which is a thing this book spends a program complaining about.
      </p>

      <section className={styles.antiGoal} aria-label="What this instrument is for">
        <p>
          It measures <strong>the book</strong>. There is no reader on any row here and no column in
          the store behind it that could name one, so there is nothing to rank readers by even if
          somebody wanted to. That is a property of the schema rather than a policy, and it is
          asserted by a test.
        </p>
      </section>

      <ul className={styles.units} aria-label="Units with measured frames">
        {LABS.map((lab) => {
          const tag = tagFor(lab.track);
          return (
            <li key={`${lab.track}/${lab.unit}`} className={styles.unit}>
              <Link href={`/instrument/${lab.track}/${lab.unit}`}>{lab.program}</Link>
              <span className={styles.unitTitle}>{lab.title}</span>
              {/* The tag is part of the question, not decoration: a rate is about one
                  version of the text, and two tags are two different wordings of the
                  same frame. */}
              <code className={styles.tag}>{tag ?? 'no pinned bundle'}</code>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
