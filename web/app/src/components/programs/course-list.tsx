import Link from 'next/link';

import { say, type Bundle } from '@ab-ovo/web-kit';

import { LanguageChoice } from '@/components/language/language-choice';
import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { editionsOffered } from '@/lib/content/chosen-edition';
import { chromeFor, endonym } from '@/lib/i18n/chrome';
import { coursesHref, indexHref } from '@/lib/index-href';
import { editionHrefs } from '@/lib/language/hrefs';

import styles from './course-list.module.css';

export interface CourseListProps {
  readonly bundles: readonly Bundle[];
  /**
   * The edition to render. Always a language since ADR-0052 — what the URL asked for, else
   * what this browser remembers, else English — resolved by `chosenEdition`, the same rule
   * the index applies.
   */
  readonly chosen: string;
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
 * IT MAKES NO FETCH AND NEEDS NO BACKEND, like the index it leads to (ADR-0004). Everything
 * here is in the bundles compiled into the app. The route that renders it reads one cookie,
 * this origin's own, which is where the reader's remembered edition lives (ADR-0052) — no
 * request, and nothing this component knows about.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ONE LINK PER COURSE, CARRYING ITS TITLE IN THE READER'S EDITION.
 *
 * It carried every title it had, in one anchor, so that choosing a course did not make a
 * reader choose an edition on the way — which was ADR-0015's refusal held at one more door.
 * ADR-0052 removed the thing that refusal was protecting: there is always a reader edition
 * now, chosen or defaulted to, so a second title beside the first would be this page asking
 * a question the control at the top of it has already answered. A course this deployment
 * does not publish in that edition shows the title it does have, which is the same fallback
 * the index's tiles make.
 *
 * The `· English · polski` on the meta line is what still tells a reader looking at an
 * English title that the course exists in Polish too, and it is listed WHATEVER they chose,
 * because it is the course's property rather than the page's state.
 */
export function CourseList({ bundles, chosen }: CourseListProps): React.JSX.Element {
  const chrome = chromeFor(chosen);
  const editions = editionsOffered(bundles);

  return (
    <main className={styles.page} lang={chrome.language}>
      {/* Past the masthead to the heading, as on the index (issue #149, `skip-link.tsx`). */}
      <SkipLink language={chrome.language} />
      <header className={styles.top}>
        <p className={styles.wordmark}>
          <Link href={indexHref({ edition: chosen })}>
            ab<span>-</span>ovo
          </Link>
        </p>
        {/*
          A `<div>` holding two navigations rather than one `<nav>` holding another: the
          language control is a navigation of its own, and nesting them makes both ambiguous
          — to a screen reader listing landmarks, and to `language-choice.spec.ts`, which
          counts them. `program-grid.tsx` carries the same shape for the same reason.

          The way back is the whole index rather than a course: a reader who opened this page
          has not said which course they want, and *← Programs* is the label the reading
          surface already uses for the same destination. The chosen edition rides along,
          because leaving this page must not undo the choice that got here.
        */}
        <div className={styles.chrome}>
          {/* THE language control for this screen, at the top of it (ADR-0052). */}
          <LanguageChoice
            current={chosen}
            hrefs={editionHrefs(editions, (other) => coursesHref(other))}
            label={chrome.languageLabel}
            labelLanguage={chrome.language}
            languages={editions}
          />
          <nav className={styles.chromeLinks} aria-label={chrome.courses}>
            <Link className={styles.chromeLink} href={indexHref({ edition: chosen })}>
              {chrome.programsCrumb}
            </Link>
            <Link className={styles.chromeLink} href="/about">
              {chrome.about}
            </Link>
          </nav>
        </div>
      </header>

      <h1 className={styles.heading} id={SKIP_TARGET_ID}>
        {chrome.courses}
      </h1>
      <p className={styles.lead}>{chrome.coursesLead}</p>

      <ul className={styles.list}>
        {bundles.map((bundle) => {
          // The edition this course's title is shown in. Read from the COURSE rather than
          // from the reader's choice, so a course that is not published in the chosen edition
          // shows the title it does have instead of none — the bundle's declared order, not
          // this application's opinion.
          const shown = bundle.track.languages.includes(chosen)
            ? chosen
            : (bundle.track.languages[0] ?? chosen);

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
                <span className={styles.title} lang={shown}>
                  {say(bundle.track.titles, shown)}
                </span>
              </Link>
              <p className={styles.meta}>{meta}</p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
