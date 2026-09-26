import Link from 'next/link';
import { Fragment } from 'react';

import { SkipLink } from '@/components/skip/skip-link';
import { chromeFor } from '@/lib/i18n/chrome';

import styles from './masthead.module.css';

/** One step of the trail after the wordmark: `lab`, then `p01`. */
export interface Crumb {
  readonly label: string;
  /** Where the step leads. Absent on the last one, which is the page the reader is on. */
  readonly href?: string | undefined;
}

/** A way off the page, in the masthead's navigation. */
export interface MastheadLink {
  readonly href: string;
  readonly label: string;
}

export interface MastheadProps {
  /**
   * The language the page speaks — the reader's edition on a page that follows one, and `en`
   * on the lab, the author's view and the legal documents, which are English only. The skip
   * link says its words in it and sets the document's language to it (ADR-0067), and the
   * navigation is named in it.
   */
  readonly language: string;
  /**
   * Where the wordmark leads: the programs, in the page's edition — `indexHref`, so the link
   * carries `?lang=` wherever the page has an edition to carry (#166). ABSENT ON THE INDEX,
   * where the wordmark is the page's own name and a link to where the reader already is would
   * be a control that goes nowhere.
   */
  readonly home?: string | undefined;
  /** Where the page sits under the wordmark, for the pages with a place below it. */
  readonly trail?: readonly Crumb[] | undefined;
  /**
   * What the row holds that goes nowhere — the index's theme switch, the courses page's
   * language control — set before the navigation, so what arrives after the first paint arrives
   * at the row's end (#165).
   */
  readonly tools?: React.ReactNode;
  /** The ways off the page, in the order they are read. */
  readonly links?: readonly MastheadLink[] | undefined;
  /**
   * The account's own control, last in the navigation: it is read from the session after the
   * first paint, and at the end of the row its arrival extends a line rather than moving one
   * (`account-control.tsx`).
   */
  readonly account?: React.ReactNode;
}

/**
 * THE ONE PAGE HEADER OUTSIDE THE READING SCREENS (#169).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THERE WERE THREE, AND A READER COULD SEE WHICH PAGE HAD WHICH.
 *
 * The index and `/courses` had a row — the wordmark, a rule under it, the page's controls at the
 * far end. The pages of `.shell` — `/about`, the sign-in pages, the account's, the 404 and the
 * error page — had a block instead: the wordmark as an underlined blue link over the page's own
 * heading, with the rule under the heading, a screen lower and further in. And `/lab` and
 * `/instrument` had neither: an `ab-ovo / lab` crumb line in a face of each page's own, and on
 * a lab's page no way home at all. So the wordmark moved, changed colour and changed size as a
 * reader went from one page to the next, which is the first thing a reader notices and the
 * last thing that should change.
 *
 * Every one of those pages renders this now, and it is the index's row: the wordmark, the way
 * home (except on the index, which IS home), the trail below it where the page has one — the
 * lab's and the instrument's crumbs became that — and whatever the page puts at the row's end,
 * a navigation named *Site* included, which is the index's since #165 and the courses page's
 * now too. The page's heading comes after it, outside it, which is where the skip link lands.
 * `components/masthead/masthead.test.ts` refuses a page that writes a header of its own, and
 * `specs/masthead.spec.ts` holds that every one of them has this one, in one place.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE SKIP LINK IS RENDERED HERE, FIRST (WCAG 2.4.1, #149). It is the way past this row, and
 * rendering it with the row is what makes a page that has one unable to forget the other —
 * the legal documents' pages, which had neither a skip link nor a masthead of this kind, get
 * both. Every page still puts `SKIP_TARGET_ID` on its own heading, since that is the page's.
 *
 * NO LINK IN IT PREFETCHES (ADR-0067). The wordmark and the navigation lead to the index,
 * `/courses` and `/about`, which title their tab in the reader's edition, and a head prefetched
 * before the reader changed edition titled the next page in the one they had left
 * (`index-href.ts` has the measurement); the trail's steps lead to pages rendered in English
 * whatever the edition, and are held to the same rule rather than to an exception.
 *
 * A Server Component with no state of its own, so it renders in the first paint wherever it is
 * put — inside the 404's and the error page's Client Components too.
 */
export function Masthead({
  language,
  home,
  trail = [],
  tools,
  links = [],
  account,
}: MastheadProps): React.JSX.Element {
  const chrome = chromeFor(language);

  // The mark the reading bar draws too (`reading-top.tsx`), so home looks like home everywhere.
  const mark = (
    <>
      ab<span className={styles.hyphen}>-</span>ovo
    </>
  );

  return (
    <>
      <SkipLink language={language} />
      <header className={styles.masthead}>
        <p className={styles.wordmark}>
          {home === undefined ? (
            mark
          ) : (
            <Link className={styles.home} href={home} prefetch={false}>
              {mark}
            </Link>
          )}
          {trail.map((crumb, index) => (
            <Fragment key={`${index}:${crumb.label}`}>
              <span aria-hidden="true" className={styles.slash}>
                /
              </span>
              {crumb.href === undefined ? (
                <span aria-current="page" className={styles.here}>
                  {crumb.label}
                </span>
              ) : (
                <Link className={styles.crumb} href={crumb.href} prefetch={false}>
                  {crumb.label}
                </Link>
              )}
            </Fragment>
          ))}
        </p>
        {tools}
        {links.length > 0 || account !== undefined ? (
          <nav aria-label={chrome.siteNav} className={styles.nav}>
            {links.map((link) => (
              <Link className={styles.link} href={link.href} key={link.href} prefetch={false}>
                {link.label}
              </Link>
            ))}
            {account}
          </nav>
        ) : null}
      </header>
    </>
  );
}
