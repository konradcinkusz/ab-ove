import Link from 'next/link';

import { AccountControl } from '@/components/account/account-control';
import { ConsentControl } from '@/components/consent/consent-control';
import { LanguageChoice } from '@/components/language/language-choice';
import { groupsOf, say, sectionSpans } from '@/lib/content/bundle';
import { editionsOffered } from '@/lib/content/chosen-edition';
import type { Bundle } from '@/lib/content/schema';
import { chromeFor } from '@/lib/i18n/chrome';
import { editionHrefs } from '@/lib/language/hrefs';

import { ClearWorksheets } from '../read/clear-controls.tsx';
import { ForgetProgress, ResumeLast, type Limits } from '../read/resume.tsx';

import styles from './program-grid.module.css';
import { TilePosition } from './tile-position.tsx';

export interface ProgramGridProps {
  readonly bundles: readonly Bundle[];
  /**
   * The edition to render. Always a language since ADR-0048 — what the URL asked for, else
   * what this browser remembers, else English — and resolved by `chosenEdition`, which is
   * where every way of supplying a bad one collapses to the same answer.
   */
  readonly chosen: string;
}

/**
 * The first screen: every program, as a tile, and the way into each one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0036 — THE INDEX IS THE LANDING PAGE, AND THE ARGUMENT FOR THE PRODUCT IS NOT.
 *
 * What used to be here was prose: what the book is, what a Stroud frame does, the four
 * phases of the work. All of it is true and none of it is a step in the reader loop, so it
 * now lives at `/about` and this page is the programs. A reader arriving at ab-ovo is one
 * move from working one, which is the thing the old first screen asked them to read past.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ONE EDITION, ONE TITLE PER TILE, AND THE CONTROL FOR IT IS IN THE TOP ROW.
 *
 * ADR-0015 refused a default edition, so what stood here rendered every tile's title TWICE
 * — once per edition, each half a link — and offered a three-position switch whose third
 * position was "neither". Ninety-four titles for forty-seven programmes, and the reader who
 * picked one found the question waiting for them again on the next screen, because nothing
 * kept the answer.
 *
 * ADR-0048 reversed it. `chosen` is now always a language: English unless the reader has
 * said otherwise, and what they say is remembered (`lib/language/store.ts`). Each tile
 * carries one title, in that edition, and the control that changes it is `LanguageChoice`
 * in the row at the top of the page — the same control in the same place on every screen in
 * this application, and the only one.
 *
 * The furniture follows the edition (ADR-0016), which is now unconditional: there is always
 * a reader edition for it to follow.
 */
export function ProgramGrid({ bundles, chosen }: ProgramGridProps): React.JSX.Element {
  const chrome = chromeFor(chosen);
  const editions = editionsOffered(bundles);

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

  /*
    Where sign-in should send the reader back to, QUERY AND ALL.

    This is the page `account-control.tsx` warned about: its location is a path plus a
    chosen edition, and the path alone would drop the edition on the way back from the form.
    Built here because the server already knows the answer, which is what keeps that control
    out of `useSearchParams()` and every other page that renders it statically rendered.
  */
  const returnTo = `/?lang=${encodeURIComponent(chosen)}`;

  return (
    <main className={styles.page} lang={chrome.language}>
      <header className={styles.top}>
        <p className={styles.wordmark}>
          ab<span>-</span>ovo
        </p>

        {/*
          The account sits at the top of the first screen, which is a change of position and
          not of policy: signing in still buys exactly one thing, progress that follows the
          reader between machines, and the page behind it still works with no account at all
          (ADR-0004). `AccountControl` renders nothing until it knows, so this row is one
          link shorter on the first paint and does not move when the answer arrives — the
          reason it is at the END of the row rather than the start.
        */}
        {/*
          THE CHROME ROW IS A `<div>` HOLDING TWO NAVIGATIONS, AND THAT IS NOT A STYLE
          CHOICE.

          The language control is a `<nav>` with its own accessible name. It used to sit
          INSIDE the destinations' `<nav>`, which is legal HTML and wrong in the way
          `place-row.tsx` records: two navigations containing a `[lang]` descendant make the
          control ambiguous to anybody — a screen reader listing landmarks, and
          `language-choice.spec.ts`, which counts them and found this. The fix is the same
          one that row made: the container is a plain element, and the navigations inside it
          are siblings.
        */}
        <div className={styles.chrome}>
          {/*
            THE LANGUAGE CONTROL, AT THE TOP, AND THE ONLY ONE ON THIS PAGE (ADR-0048). It
            is first in the row because it qualifies everything below it — every title on
            this screen is in the edition it names — where `About`, the resume link and the
            account are destinations. Its href carries the edition in the query, so it works
            with script disabled; the click is what makes the answer stick.
          */}
          <LanguageChoice
            current={chosen}
            hrefs={editionHrefs(editions, (other) => `/?lang=${encodeURIComponent(other)}`)}
            label={chrome.languageLabel}
            labelLanguage={chrome.language}
            languages={editions}
          />

          <nav className={styles.chromeLinks} aria-label={chrome.programs}>
            <Link className={styles.chromeLink} href="/about">
              {chrome.about}
            </Link>
            <ResumeLast language={chrome.language} limits={limits} />
            {/*
              THE TWO DESTRUCTIVE CONTROLS, AFTER THE RESUME LINK AND NOT BESIDE IT. Both
              are two presses (`use-two-step.ts`): the worksheets are the reader's own
              working and nothing brings them back, and the place reaches the account since
              #11, so forgetting it is no longer undone by reading one frame (ADR-0047).
              *Forget where I am* is last of the two — furthest from the filled link a
              returning reader is reaching for, which is ADR-0017's own placement rule. Both
              render nothing when there is nothing to clear, so the row grows no dead
              control.
            */}
            <ClearWorksheets
              confirmLabel={chrome.clearWorksheetsConfirm}
              label={chrome.clearWorksheets}
              language={chrome.language}
            />
            <ForgetProgress language={chrome.language} />
            <AccountControl language={chrome.language} returnTo={returnTo} />
          </nav>
        </div>
      </header>

      {/*
        The section label, alone on its line now: the edition switch that used to share it
        is one control in the row above (ADR-0048), so there is nothing left for this row to
        hold apart. It stays a row rather than becoming a bare `<h1>` because the heading's
        own rule and spacing live on `.headingRow`, and a reader would see the grid move for
        a change that is not about the grid.
      */}
      <div className={styles.headingRow}>
        <h1 className={styles.heading}>{chrome.programs}</h1>
      </div>

      {bundles.map((bundle) => {
        /*
          ONE EDITION PER TRACK, AND IT IS READ FROM THE TRACK RATHER THAN FROM THE CONTROL.

          A track that does not publish the chosen edition falls back to its own first
          declared one instead of rendering an empty tile — the bundle's order, not this
          application's opinion. That case does not arise for the pinned content, where both
          tracks publish both editions; it arises the day one does not, and the honest answer
          then is the edition that track HAS rather than a blank where a title should be.
        */
        const shown = bundle.track.languages.includes(chosen)
          ? chosen
          : (bundle.track.languages[0] ?? chosen);

        return (
          <section key={bundle.track.id}>
            <div className={styles.track}>
              <h2 className={styles.trackTitle} lang={shown}>
                {say(bundle.track.titles, shown)}
              </h2>
            </div>

            {/*
              GROUPED, THE WAY PR4's INDEX WAS AND THE GRID FORGOT TO BE. `groupsOf` breaks
              the programs where the book does — its parts once a bundle carries them, the
              id prefix until then — and a returning reader scans two headed runs rather
              than forty-seven tiles. The heading is the part's own title in the shown
              edition, or this application's word for the prefix; a prefix it has no word
              for is grouped without one. One group is a list, and gets no heading.
            */}
            {groupsOf(bundle).map((group) => {
              const label = group.part
                ? say(group.part.titles, shown)
                : group.prefix
                  ? chrome.groupLabels[group.prefix]
                  : undefined;

              return (
                <div key={group.key || 'all'}>
                  {label ? (
                    <h3 className={styles.groupLabel} lang={group.part ? shown : chrome.language}>
                      {label}
                    </h3>
                  ) : null}
                  <ul className={styles.grid}>
                    {group.units.map((unit) => {
                      const sections = sectionSpans(unit).length;
                      const meta = `${chrome.frames(unit.steps.length)}${
                        sections > 0 ? ` · ${chrome.sections(sections)}` : ''
                      }`;

                      return (
                        <li className={styles.tile} key={unit.id}>
                          <div className={styles.idRow}>
                            <span className={styles.tileId}>{unit.id}</span>
                            {/*
                              Where the reader is in this program, if anywhere — text, in
                              the id's register, arriving after hydration into a row that
                              already has its height. See the component for what it is
                              deliberately not.
                            */}
                            <TilePosition
                              language={chrome.language}
                              last={unit.steps.length}
                              track={bundle.track.id}
                              unit={unit.id}
                            />
                          </div>
                          <span className={styles.titles}>
                            <Link
                              className={styles.title}
                              href={`/read/${bundle.track.id}/${unit.id}/${shown}`}
                              lang={shown}
                            >
                              {say(unit.titles, shown)}
                            </Link>
                          </span>
                          <p className={styles.meta}>{meta}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}

      {/*
        LAST ON THE PAGE, AND THAT IS WHERE IT BELONGS RATHER THAN WHERE IT FITS.

        It is absent from the first paint — it cannot render on the server, because the
        server has no reader and the invitation must not reach somebody who has already
        declined (see the component). So it has to appear somewhere that appearing shifts
        nothing already on the page, which is the same constraint issue #7 put on the resume
        controls.

        And it is an invitation rather than a gate: a reader who came to read should reach
        the programs first and the question afterwards. Putting it above the grid would make
        the first thing in the reading surface a request for permission.
      */}
      <ConsentControl language={chrome.language} />
    </main>
  );
}
