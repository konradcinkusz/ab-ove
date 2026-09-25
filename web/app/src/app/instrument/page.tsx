import type { Metadata } from 'next';
import Link from 'next/link';

import { allBundles, say } from '@ab-ovo/web-kit';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { LABS } from '@/lib/lab/protocol';

import styles from './instrument.module.css';

/**
 * The instrument's index: the units it has anything to say about.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * IT WAS DRIVEN BY `LABS`, AND ITS OWN JUSTIFICATION WAS *“a check exists because a lab
 * does, so the units with rates are exactly the units with labs”*. THE WORKSHEET MADE THAT
 * FALSE.
 *
 * A worksheet answer is reported from any program's reveal, so cells now accumulate under
 * all forty-seven — and an index built from `LABS` would have offered the author one link
 * and silently withheld the other forty-six units' data. The old reasoning was sound when
 * it was written and the change that broke it is the change that had to notice.
 *
 * So the list is the pinned bundle's own units, which is the only source that can name
 * every unit a cell could arrive for. What it costs is the thing the old comment was right
 * to avoid: most of these links lead to an empty table today. That is answered on the page
 * rather than by hiding them — an empty table says nobody has answered this program yet,
 * which is a fact about the book and the state every unit starts in, and hiding a unit
 * until it has data means the author cannot tell “nothing here” from “not measured here”.
 * ───────────────────────────────────────────────────────────────────────────
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
      <SkipLink language="en" />
      <p className={styles.crumb}>
        <Link href="/">ab-ovo</Link> / instrument
      </p>
      <h1 className={styles.title} id={SKIP_TARGET_ID}>The instrument</h1>
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
        {allBundles().flatMap((bundle) => {
          /*
            `bundle.track` IS A `Track` RECORD, NOT THE ROUTE SEGMENT. A first draft
            interpolated it straight into the href, which TypeScript accepts — a template
            literal takes any object — and which would have linked every row to
            `/instrument/[object Object]/P01`. The id is the segment the unit page's
            `params.track` receives.
          */
          const track = bundle.track.id;

          /*
            AND THE TITLE IS READ IN A LANGUAGE THE TRACK DECLARES. `say` THROWS on a missing
            one, so hard-coding `'en'` would 500 this whole page for a track published in one
            language that is not English. The author's screen is not an edition of the book,
            so it prefers English and takes whatever the track has otherwise.
          */
          const language = bundle.track.languages.includes('en') ? 'en' : bundle.track.languages[0];

          return bundle.units.map((unit) => (
            <li key={`${track}/${unit.id}`} className={styles.unit}>
              <Link href={`/instrument/${track}/${unit.id}`}>{unit.id}</Link>
              <span className={styles.unitTitle}>
                {language === undefined ? '' : say(unit.titles, language)}
              </span>
              {/* WHICH INSTRUMENTS CAN REACH THIS UNIT, said here rather than left to be
                  inferred from an empty table. Every unit has a worksheet, because every
                  unit has frames that ask; one has a lab as well, and the two measure
                  different things — see the unit view, where the cells are told apart.
                  Matched on the descriptor's own stated `track` and `unit`, which is what
                  those fields exist for: `labFor` takes a bundle's lab id, not a unit. */}
              <span className={styles.sources}>
                {LABS.some((lab) => lab.track === track && lab.unit === unit.id)
                  ? 'worksheet and lab'
                  : 'worksheet'}
              </span>
              {/* The tag is part of the question, not decoration: a rate is about one
                  version of the text, and two tags are two different wordings of the
                  same frame. */}
              <code className={styles.tag}>{bundle.tag}</code>
            </li>
          ));
        })}
      </ul>
    </main>
  );
}
