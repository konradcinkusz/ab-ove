import Link from 'next/link';

import { say, sectionSpans } from '@/lib/content/bundle';
import type { Bundle } from '@/lib/content/schema';

import styles from './contents.module.css';
import { count } from './plural';

export interface ProgramListProps {
  readonly bundles: readonly Bundle[];
}

/**
 * Every program the application serves, and the way into each one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS PAGE HAS NO LANGUAGE, SO IT RENDERS BOTH AND PICKS NEITHER.
 *
 * Every page below it is addressed by a language — `/read/<track>/<unit>/<lang>/<n>` — but
 * the index is where a reader who has not chosen yet arrives, so choosing for them would be
 * the one place this product could quietly make the book monolingual. Each entry therefore
 * carries a title per edition, in that edition's own language, and each title IS the link
 * into it. No flag, no "also available in", no language toggle whose default is a decision.
 *
 * The order the two titles appear in is `track.languages`, which is the bundle's own
 * declaration. A vertical list has an order whether or not anyone chooses one; what is
 * avoided is this file inventing it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ONE FLAT PAGE, DELIBERATELY, AND IT SURVIVES A SECOND TRACK. A track index listing one
 * track would be a page a reader clicks through for nothing. Listing each track's programs
 * under its own heading reads correctly at one track and at three, and if it ever grows too
 * long for one page, a per-track `/read/<track>` is an ADDITION rather than a restructure —
 * the deep links below it do not move.
 */
export function ProgramList({ bundles }: ProgramListProps): React.JSX.Element {
  return (
    <main className={styles.page}>
      <p className={styles.crumb}>
        <Link href="/">ab-ovo</Link>
      </p>

      <h1 className={styles.heading}>Programs</h1>

      {bundles.map((bundle) => (
        <section key={bundle.track.id}>
          <div className={styles.track}>
            {bundle.track.languages.map((language) => (
              <h2 className={styles.trackTitle} key={language} lang={language}>
                {say(bundle.track.titles, language)}
              </h2>
            ))}
          </div>

          <ol className={styles.list}>
            {bundle.units.map((unit) => {
              const sections = sectionSpans(unit).length;
              return (
                <li className={styles.entry} key={unit.id}>
                  <span className={styles.entryId}>{unit.id}</span>
                  <span className={styles.editions}>
                    {bundle.track.languages.map((language) => (
                      <Link
                        className={styles.edition}
                        href={`/read/${bundle.track.id}/${unit.id}/${language}`}
                        key={language}
                        lang={language}
                      >
                        {say(unit.titles, language)}
                      </Link>
                    ))}
                  </span>
                  <p className={styles.meta}>
                    {count(unit.steps.length, 'frame', 'frames')}
                    {sections > 0 ? ` · ${count(sections, 'section', 'sections')}` : null}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </main>
  );
}
