import Link from 'next/link';

import { AccountControl } from '@/components/account/account-control';
import { say, sectionSpans } from '@/lib/content/bundle';
import type { Bundle } from '@/lib/content/schema';

import { FALLBACK_LANGUAGE, chromeFor } from '@/lib/i18n/chrome';

import styles from './contents.module.css';
import { ForgetProgress, ResumeLast, type Limits } from './resume';

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
  /*
    The index's own controls are English, and that is not the thing ADR-0015 refuses.
    That ADR is about the BOOK's editions: picking one for the reader is an editorial claim
    this product has no standing to make. The furniture is the application's, the repository
    is English by ground rule, and there is no reader language here to follow — every page
    below this one has one in its URL and uses it. The `lang` attribute says which it is
    rather than letting it be inferred.
  */
  const chrome = chromeFor(FALLBACK_LANGUAGE);

  /*
    How long each program is, so a reader whose stored place is past the end of a shortened
    program gets clamped rather than a 404 — and so a place in a program this index no
    longer lists produces no control at all. Identifiers and integers; the client boundary
    carries no content here either.
  */
  const limits: Limits = Object.fromEntries(
    bundles.flatMap((bundle) =>
      bundle.units.map((unit) => [`${bundle.track.id}/${unit.id}`, unit.steps.length] as const),
    ),
  );

  return (
    <main className={styles.page} lang={chrome.language}>
      {/*
        The resume and forget controls extend this line rather than adding a block, for the
        reason resume.tsx gives: they are read from the browser, so they arrive after the
        first paint, and a block would move the whole page when they did.
      */}
      <p className={styles.crumb}>
        <Link href="/">ab-ovo</Link>
        <span className={styles.crumbEnd}>
          <ResumeLast language={chrome.language} limits={limits} />
          <ForgetProgress language={chrome.language} />
          {/*
            The index is the only page that offers an account, and that is a decision about
            where furniture belongs rather than an omission. Every page under this one is a
            frame, and a frame is the one screen in the product that should carry nothing
            but the frame — a sign-out control beside the question is chrome competing with
            the thing the reader is meant to be committing an answer to.
          */}
          <AccountControl language={chrome.language} />
        </span>
      </p>

      <h1 className={styles.heading}>{chrome.programs}</h1>

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
                    {chrome.frames(unit.steps.length)}
                    {sections > 0 ? ` · ${chrome.sections(sections)}` : null}
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
