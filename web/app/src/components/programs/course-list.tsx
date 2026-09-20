import Link from 'next/link';

import { say, type Bundle } from '@ab-ovo/web-kit';

import { FALLBACK_LANGUAGE, chromeFor, endonym } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';

import styles from './course-list.module.css';

export interface CourseListProps {
  readonly bundles: readonly Bundle[];
  /**
   * The edition the reader asked for, or `undefined` for the page that picks neither —
   * resolved by `chosenEdition`, the same rule the index applies.
   */
  readonly chosen: string | undefined;
}

/**
 * Every course ab-ovo carries, and the way into each one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0048 — THE COURSES ARE A PAGE, AND THE INDEX NARROWS TO ONE.
 *
 * The index stacks every pinned course, which reads correctly while there is one and becomes
 * a scroll of several hundred tiles the day there are three. The choice could have been a
 * switch above the grid, beside the edition switch; it is a page because the two controls
 * are not the same size. An edition is a word — *English*, *polski* — and a course is a
 * title, a length and a set of editions, which a row of links cannot say and a reader
 * deciding between two courses needs.
 *
 * IT MAKES NO FETCH, READS NO COOKIE AND NEEDS NO BACKEND, like the index it leads to
 * (ADR-0004). Everything here is in the bundles compiled into the app.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ONE LINK PER COURSE, CARRYING EVERY TITLE IT HAS, and that is the one place this page does
 * not copy the index's tiles. A tile's title is a link into the READING route, where a
 * language is part of the address, so a tile with two editions has two links by necessity.
 * A course's link is into the index, which needs no language at all — so both titles go
 * inside one anchor and the reader chooses a course without being made to choose an edition
 * on the way. That is ADR-0015's refusal held at one more door; the edition switch on the
 * page this opens is where an edition is chosen, and it still lights nothing until it is.
 */
export function CourseList({ bundles, chosen }: CourseListProps): React.JSX.Element {
  const chrome = chromeFor(chosen ?? FALLBACK_LANGUAGE);

  return (
    <main className={styles.page} lang={chrome.language}>
      <header className={styles.top}>
        <p className={styles.wordmark}>
          <Link href={indexHref({ edition: chosen })}>
            ab<span>-</span>ovo
          </Link>
        </p>
        {/*
          The way back, and it is the whole index rather than a course: a reader who opened
          this page has not said which course they want, and *← Programs* is the label the
          reading surface already uses for the same destination. The chosen edition rides
          along, because leaving this page must not undo the choice that got here.
        */}
        <nav className={styles.chrome} aria-label={chrome.courses}>
          <Link className={styles.chromeLink} href={indexHref({ edition: chosen })}>
            {chrome.programsCrumb}
          </Link>
          <Link className={styles.chromeLink} href="/about">
            {chrome.about}
          </Link>
        </nav>
      </header>

      <h1 className={styles.heading}>{chrome.courses}</h1>
      <p className={styles.lead}>{chrome.coursesLead}</p>

      <ul className={styles.list}>
        {bundles.map((bundle) => {
          // The editions this course has, narrowed to the chosen one if it publishes it. Read
          // from the COURSE rather than from the reader's choice, so a course that is not
          // published in the chosen edition shows the titles it does have instead of none.
          const offered = chosen
            ? bundle.track.languages.filter((language) => language === chosen)
            : bundle.track.languages;
          const titles = offered.length > 0 ? offered : bundle.track.languages;

          /*
            What the course is, as three measured facts and no adjective: how many programs,
            how many frames across them, and which editions it is published in. The
            editions are listed WHATEVER the reader chose — it is the course's property, not
            the page's state, and it is the one line that tells a reader looking at an
            English title that the course is in Polish too.
          */
          const frames = bundle.units.reduce((total, unit) => total + unit.steps.length, 0);
          const meta = [
            chrome.programCount(bundle.units.length),
            chrome.frames(frames),
            ...bundle.track.languages.map(endonym),
          ].join(' · ');

          return (
            <li className={styles.course} key={bundle.track.id}>
              <Link
                className={styles.into}
                href={indexHref({ track: bundle.track.id, edition: chosen })}
              >
                {titles.map((language) => (
                  <span className={styles.title} key={language} lang={language}>
                    {say(bundle.track.titles, language)}
                  </span>
                ))}
              </Link>
              <p className={styles.meta}>{meta}</p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
