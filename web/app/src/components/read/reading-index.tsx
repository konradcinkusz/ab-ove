import Link from 'next/link';

import { AccountControl } from '@/components/account/account-control';
import { ConsentControl } from '@/components/consent/consent-control';
import { say, sectionSpans } from '@/lib/content/bundle';
import type { Bundle, Unit } from '@/lib/content/schema';
import { FALLBACK_LANGUAGE, chromeFor } from '@/lib/i18n/chrome';

import styles from './contents.module.css';
import { ForgetProgress, ResumeLast, type Limits } from './resume.tsx';

export interface ReadingIndexProps {
  readonly bundles: readonly Bundle[];
}

/**
 * Every program the application serves, and the way into each one — at `/` AND at `/read`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE COMPONENT AT TWO PATHS, BECAUSE `/` USED TO BE A DOOR WITH NO ROOM BEHIND IT.
 *
 * The landing page was seven sections of manifesto — the loop, what it needs from you, the
 * phases, an integration panel, a colophon — and one link into the book, below all of it.
 * The owner's complaint on first running the application was "too much side text unrelated
 * to the frames", and that page is where it starts: a reader who wants to read is asked to
 * read an argument about reading first.
 *
 * So `/` IS the index now. Not a redirect to `/read` — the anti-goal below has to stay on
 * the page a reader arrives at, and UI-UX.md §`/` records that as a decision rather than a
 * habit — and not a second list beside it either, which is how two indexes get to disagree.
 * One component, two routes, and `/read` keeps existing because the middleware and five
 * specs name it and because a section's index path is a reasonable thing to type.
 *
 * The manifesto is at `/about`, linked from the foot, unshortened. Nothing was deleted to
 * make this page quiet; it was moved to the page a reader goes to when they want it.
 * ──────────────────────────────────────────────────────────────────────────────────────
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
 * ONE FLAT PAGE PER TRACK, AND IT SURVIVES A SECOND TRACK. A track index listing one track
 * would be a page a reader clicks through for nothing. Listing each track's programs under
 * its own heading reads correctly at one track and at three, and if it ever grows too long
 * for one page, a per-track `/read/<track>` is an ADDITION rather than a restructure — the
 * deep links below it do not move.
 */
export function ReadingIndex({ bundles }: ReadingIndexProps): React.JSX.Element {
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
        The wordmark is a name and is not the page's subject, so it is not the heading. The
        `<h1>` says what is on the page, which is the programs — and that is also what
        `navigation.spec.ts` asserts, because a reader arriving at `/read` by typing it
        should be told what they have arrived at rather than which product wrote it.

        The resume control extends this line rather than adding a block, for the reason
        resume.tsx gives: it is read from the browser, so it arrives after the first paint,
        and a block would move the whole page when it did.
      */}
      <p className={styles.crumb}>
        <span className={styles.wordmark}>ab-ovo</span>
        <span className={styles.crumbEnd}>
          <ResumeLast language={chrome.language} limits={limits} />
        </span>
      </p>

      <h1 className={styles.heading}>{chrome.programs}</h1>

      {/*
        ────────────────────────────────────────────────────────────────────────────────
        THE ANTI-GOAL, ABOVE THE LIST AND NOT BELOW IT.

        Every system that measures learning drifts towards measuring the learner, because
        that is the easier number to produce and the one that looks like progress. This
        product's instrument points the other way: a frame that most readers get wrong is
        evidence about the frame. Saying so on the first page is the cheapest way to keep it
        true — a claim made publicly is one a later feature has to argue with.

        UI-UX.md §`/` records the ordering ("before any feature, above the fold of the
        argument") and it is UPHELD rather than reversed by this page becoming the index:
        two sentences before a list of 47 programs is not the side text the owner objected
        to, and moving them below would be quietly retiring the decision.
        ────────────────────────────────────────────────────────────────────────────────
      */}
      <section aria-label="What this instrument is for" className={styles.antigoal}>
        <p>
          <strong>The instrument measures the book, never the reader.</strong> When a frame
          is answered wrongly by many readers, that is a finding about the frame — its
          wording, its position, the frame before it — and it goes into revising the book.
        </p>
        <p>
          ab-ovo does not score you, rank you, or build a profile of what you are bad at.
          There is no leaderboard and there will not be one.
        </p>
      </section>

      {bundles.map((bundle) => (
        <section key={bundle.track.id}>
          <div className={styles.track}>
            {bundle.track.languages.map((language) => (
              <h2 className={styles.trackTitle} key={language} lang={language}>
                {say(bundle.track.titles, language)}
              </h2>
            ))}
          </div>

          {groupsOf(bundle).map((group) => (
            <div key={group.key}>
              {group.label ? (
                <h3 className={styles.groupLabel}>{group.label}</h3>
              ) : null}
              <ol className={styles.list}>
                {group.units.map((unit) => {
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
            </div>
          ))}
        </section>
      ))}

      {/*
        ────────────────────────────────────────────────────────────────────────────────
        THE READER'S OWN CONTROLS, ALL OF THEM, IN ONE QUIET FOOT.

        They were scattered: the account control and the forget control sat in the crumb at
        the top, where destructive and identity-bearing buttons are the first thing a reader
        meets, and the consent invitation sat alone at the bottom of `/read` — a page the
        designed path no longer went through once `/` became the index, which would have
        left the instrument's one opt-in door on a page nobody was sent to.

        Last on the page is where they belong rather than where they fit. None of them can
        render on the server (each reads the browser), so each appears after the first paint
        — and appearing has to shift nothing already on the page, which is the constraint
        issue #7 put on the resume controls. And the consent question is an invitation
        rather than a gate: a reader who came to read should reach the programs first.
        ────────────────────────────────────────────────────────────────────────────────
      */}
      <footer className={styles.indexFoot}>
        <ConsentControl language={chrome.language} />
        <p className={styles.indexControls}>
          <ForgetProgress language={chrome.language} />
          <AccountControl language={chrome.language} />
        </p>
        <p className={styles.indexLinks}>
          <Link href="/about">About ab-ovo</Link>
          <a href="https://github.com/konradcinkusz/ab-ovo">github.com/konradcinkusz/ab-ovo</a>
        </p>
      </footer>
    </main>
  );
}

interface Group {
  readonly key: string;
  /** `undefined` for a track whose ids carry no prefix worth grouping by. */
  readonly label: string | undefined;
  readonly units: readonly Unit[];
}

/**
 * The programs, in the manifest's order, broken where their id prefix changes.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * BY ID PREFIX, AND THE LIMITATION IS FLAGGED RATHER THAN HIDDEN.
 *
 * Forty-seven entries in one list is a scroll rather than an index, and this book's own
 * ids already carry the division a reader needs: `F` for the thirteen Foundation programs
 * that assume nothing, `P` for the thirty-four that follow. The book's real structure is
 * its NINE PARTS, and `content-schema.v1.json` has no field for them — `unit.part` is
 * proposed for v2. Until a bundle carries it, this groups by the one thing the data has.
 *
 * It degrades to the flat list it replaced rather than inventing a division: a track whose
 * ids share one prefix, or carry none, comes back as a single unlabelled group. And the
 * labels are only written for prefixes this application knows the meaning of, so a third
 * track's `X07` is grouped without being described.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
function groupsOf(bundle: Bundle): readonly Group[] {
  const KNOWN: Readonly<Record<string, string>> = {
    F: 'Foundation',
    P: 'Main sequence',
  };

  const groups: Group[] = [];
  for (const unit of bundle.units) {
    const key = /^[A-Za-z]+/.exec(unit.id)?.[0] ?? '';
    const last = groups.at(-1);
    if (last?.key === key) {
      (last.units as Unit[]).push(unit);
    } else {
      groups.push({ key, label: KNOWN[key], units: [unit] });
    }
  }

  return groups.length > 1 ? groups : [{ key: '', label: undefined, units: bundle.units }];
}
