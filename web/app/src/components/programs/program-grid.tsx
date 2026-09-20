import Link from 'next/link';

import { groupsOf, say, sectionSpans, unitBefore, type Bundle } from '@ab-ovo/web-kit';

import { AccountControl } from '@/components/account/account-control';
import { ConsentControl } from '@/components/consent/consent-control';
import { LanguageChoice } from '@/components/language/language-choice';
import { ThemeSwitch } from '@/components/theme/theme-switch';
import { editionsOffered } from '@/lib/content/chosen-edition';
import { shownBundles } from '@/lib/content/chosen-track';
import { chromeFor } from '@/lib/i18n/chrome';
import { coursesHref, indexHref } from '@/lib/index-href';
import { editionHrefs } from '@/lib/language/hrefs';

import { ClearWorksheets, ExportWorksheets } from '../read/clear-controls.tsx';
import { ForgetProgress, ResumeLast, type Limits } from '../read/resume.tsx';

import styles from './program-grid.module.css';
import { TileEntry } from './tile-entry.tsx';
import { TilePosition } from './tile-position.tsx';

export interface ProgramGridProps {
  readonly bundles: readonly Bundle[];
  /**
   * The edition to render. Always a language since ADR-0052 — what the URL asked for, else
   * what this browser remembers, else English — and resolved by `chosenEdition`, which is
   * where every way of supplying a bad one collapses to the same answer.
   */
  readonly chosen: string;
  /**
   * The course the reader narrowed to, or `undefined` for the index that shows every one.
   * Resolved by `chosenTrack`, which collapses every way of naming a course this deployment
   * does not serve into the same unnarrowed answer.
   */
  readonly chosenTrack: string | undefined;
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
 * ADR-0052 reversed it. `chosen` is now always a language: English unless the reader has
 * said otherwise, and what they say is remembered (`lib/language/store.ts`). Each tile
 * carries one title, in that edition, and the control that changes it is `LanguageChoice`
 * in the row at the top of the page — the same control in the same place on every screen in
 * this application, and the only one.
 *
 * The furniture follows the edition (ADR-0016), which is now unconditional: there is always
 * a reader edition for it to follow.
 *
 * AND THE COURSE IS CHOSEN THE SAME WAY, OR NOT AT ALL (ADR-0048).
 *
 * `chosenTrack` narrows this page to one course, and `undefined` shows every pinned one
 * stacked — which is what this page has always done and reads correctly while there is one
 * course. The choice is made on `/courses` rather than here: a switch with forty-seven tiles
 * under each position is not a switch, and the courses page can say what each course contains
 * where a row of links could only name them.
 */
export function ProgramGrid({ bundles, chosen, chosenTrack }: ProgramGridProps): React.JSX.Element {
  const chrome = chromeFor(chosen);

  /*
    The courses this page renders: the chosen one, or all of them. The narrowing is the only
    thing it changes — every control below reads `bundles`, the whole pinned set, wherever
    what it needs is a fact about the deployment rather than about what is on screen.
  */
  const courses = shownBundles(bundles, chosenTrack);

  /*
    How long each program is, so a reader whose stored place is past the end of a shortened
    program gets clamped rather than a 404 — and so a place in a program this index no
    longer lists produces no control at all. Identifiers and integers; the client boundary
    carries no content here either.

    FROM EVERY PINNED COURSE, NOT FROM THE ONE ON SCREEN, and the difference is the resume
    control. A reader's stored place can perfectly well be in a course they have just narrowed
    away from; reading these limits off the narrowed set would delete *Continue at frame 12*
    for exactly the returning reader ADR-0036 restored it for, and it would look like the
    place had been forgotten rather than like the page had been filtered. A program the
    CONTENT no longer has still produces no control, which is the clause above and is a
    different thing entirely.
  */
  const limits: Limits = Object.fromEntries(
    bundles.flatMap((bundle) =>
      bundle.units.map((unit) => [`${bundle.track.id}/${unit.id}`, unit.steps.length] as const),
    ),
  );

  /*
    Where sign-in should send the reader back to, QUERY AND ALL.

    This is the page `account-control.tsx` warned about: its location is a path plus the
    reader's choices, and the path alone would drop them on the way back from the form.
    Built here because the server already knows the answer, which is what keeps that control
    out of `useSearchParams()` and every other page that renders it statically rendered.
    Both choices go in it since ADR-0048 — signing in from a narrowed index and coming back
    to the unnarrowed one is the same defect as coming back to the wrong edition.
  */
  const returnTo = indexHref({ track: chosenTrack, edition: chosen });

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
        <nav className={styles.chrome} aria-label={chrome.programs}>
          {/*
            THE COURSES, FIRST IN THE ROW AND BEFORE THE ARGUMENT (ADR-0048).

            The two links that go somewhere else are together at the start, and the controls
            that are about this reader follow them. It is offered whatever the deployment
            pins — a page listing one course states what ab-ovo carries, where a SWITCH with
            one position would be a control that cannot move. It carries the chosen edition
            so the page it opens is in the language this one is in.
          */}
          <Link className={styles.chromeLink} href={coursesHref(chosen)}>
            {chrome.courses}
          </Link>
          <Link className={styles.chromeLink} href="/about">
            {chrome.about}
          </Link>
          {/*
            HOW A READER TURNS ON LIGHT MODE (ADR-0048), and the only control in this row
            that is fully rendered on the server.

            It sits after the links that are always here and before everything that is not,
            and that is placement rather than order of arrival: everything after it — the
            resume link, the two destructive controls, the account — is read out of this
            browser and cannot exist in the first paint, so each of them EXTENDS this line
            when it lands. A control that is in the markup from the start belongs before
            them, where nothing can push it sideways.

            It is three words of furniture and not a filled control, on the language
            control's reasoning (`language-choice.tsx`): a reader touches it once and then
            wants it out of the way. Both are now that shape, and both are remembered — the
            theme in `localStorage`, the edition there and on the account (ADR-0052).
          */}
          <ThemeSwitch language={chrome.language} />
          <ResumeLast language={chrome.language} limits={limits} />
          {/*
            A WAY TO KEEP A COPY, BEFORE EITHER WAY TO LOSE ONE. `ExportWorksheets` is one
            press — nothing it does is destructive (ADR-0055) — and sits between the resume
            link and the two destructive controls that follow, so a reader who has just been
            reminded their worksheets exist sees the safe control before the two that erase
            them. It renders nothing when there is nothing to export, on `ClearWorksheets`'s
            own rule about a control that would do nothing.
          */}
          <ExportWorksheets label={chrome.exportWorksheets} language={chrome.language} />
          {/*
            THE TWO DESTRUCTIVE CONTROLS, AFTER THE RESUME LINK AND NOT BESIDE IT. Both are
            two presses (`use-two-step.ts`): the worksheets are the reader's own working and
            nothing brings them back, and the place reaches the account since #11, so
            forgetting it is no longer undone by reading one frame (ADR-0047). *Forget where
            I am* is last of the two — furthest from the filled link a returning reader is
            reaching for, which is ADR-0017's own placement rule. Both render nothing when
            there is nothing to clear, so the row grows no dead control.
          */}
          <ClearWorksheets
            confirmLabel={chrome.clearWorksheetsConfirm}
            label={chrome.clearWorksheets}
            language={chrome.language}
          />
          <ForgetProgress language={chrome.language} />
          <AccountControl language={chrome.language} returnTo={returnTo} />
        </nav>
      </header>

      {/*
        THE HEADING AND THE LANGUAGE CONTROL, SHARING A LINE — this page's one language
        control, and the only one on it (ADR-0052).

        WHY HERE AND NOT IN THE MASTHEAD ROW ABOVE, which is where the other three screens
        put it. That row is `flex-wrap: wrap` and everything in it after the theme switch —
        the resume link, the two destructive controls, the account — is read out of the
        browser and arrives AFTER hydration. One more item's width there was enough to wrap
        the row onto a second line when they landed: `specs/progress.spec.ts` measured 0.013
        against a bound of 0.01, which is the page moving under a reader who is already
        reading it. This row is rendered whole on the server and never changes, so a control
        in it cannot shift anything.

        It is the line the edition switch has always been on, and it still qualifies the grid
        below rather than introducing it — every title on this screen is in the edition it
        names.
      */}
      <div className={styles.headingRow}>
        <h1 className={styles.heading}>{chrome.programs}</h1>
        {/*
          The editions of the courses ON SCREEN, not of every course pinned: a deployment
          whose second course is English-only must not offer a Polish position on a page
          narrowed to it, because that position's page would have nothing in it. Each
          position carries the chosen course too, so changing edition does not un-narrow the
          page, and each is a real URL — the control works with script disabled, and the
          click is what makes the answer stick.
        */}
        <LanguageChoice
          current={chosen}
          hrefs={editionHrefs(editionsOffered(courses), (other) =>
            indexHref({ track: chosenTrack, edition: other }),
          )}
          label={chrome.languageLabel}
          labelLanguage={chrome.language}
          languages={editionsOffered(courses)}
        />
      </div>

      {courses.map((bundle) => {
        /*
          ONE EDITION PER COURSE, AND IT IS READ FROM THE COURSE RATHER THAN FROM THE CONTROL.

          A course that does not publish the chosen edition falls back to its own first
          declared one instead of rendering an empty tile — the bundle's order, not this
          application's opinion. It cannot happen on a NARROWED index, where the control
          offers only what the course on screen has; it can happen on the unnarrowed one, the
          day a deployment pins a second course in one language, and the honest answer then is
          the edition that course HAS rather than a blank where a title should be.
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
              {/*
                THE NARROWING, BOTH WAYS, BESIDE THE TITLE IT IS ABOUT.

                Showing every course, this is the way into one — so the first screen of a
                deployment carrying several is itself the way to one of them rather than a
                list to scroll past. Narrowed, it is the way back out: the `?track=`
                counterpart of the switch's *Both editions*, there for the reason ADR-0036
                gives that position, because a reader who arrived on a link to one course
                would otherwise have no way back to the rest except the URL.

                One control in two states rather than two controls, and absent entirely
                while there is one course — both of its labels would lead to the page the
                reader is already on.
              */}
              {bundles.length > 1 ? (
                <p className={styles.allCourses}>
                  {chosenTrack ? (
                    <Link href={indexHref({ edition: chosen })}>{chrome.allCourses}</Link>
                  ) : (
                    <Link href={indexHref({ track: bundle.track.id, edition: chosen })}>
                      {chrome.onlyThisCourse}
                    </Link>
                  )}
                </p>
              ) : null}
            </div>

            {/*
              GROUPED, THE WAY PR4's INDEX WAS AND THE GRID FORGOT TO BE. `groupsOf` breaks
              the programs where the course does — its parts once a bundle carries them, the
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

                      /*
                        The program that opens this one, read off the manifest rather than
                        off the id (ADR-0051; `unitBefore` says what P07's insertion did to
                        the arithmetic). `undefined` for the book's first program, which is
                        the one tile that is never shut.
                      */
                      const previous = unitBefore(bundle, unit.id)?.id;

                      return (
                        /*
                          `id="p-<unit>"` is where a reader bounced off a shut program
                          lands (`program-gate.tsx` redirects to this fragment): the tile
                          they asked for, carrying the one sentence that explains the
                          bounce. Prefixed for the reason the contents page prefixes its
                          section anchors — a bare `P01` is a name this page does not own.
                        */
                        <li className={styles.tile} id={`p-${unit.id}`} key={unit.id}>
                          <div className={styles.idRow}>
                            <span className={styles.tileId}>{unit.id}</span>
                            {/*
                              Where the reader is in this program, if anywhere — or, if the
                              program is not open to them yet, the one that opens it. Text,
                              in the id's register, arriving after hydration into a row that
                              already has its height. See the component for what it is
                              deliberately not.
                            */}
                            <TilePosition
                              language={chrome.language}
                              last={unit.steps.length}
                              previous={previous}
                              track={bundle.track.id}
                              unit={unit.id}
                            />
                          </div>
                          {/*
                            The way in, which is a link only while the reader may take it.
                            The title is the CONTENT's, so it is resolved here and handed
                            over — the component's own note says why deciding the element on
                            the client is worth that. ONE edition since ADR-0052, so the list
                            has one entry; the prop stays a list because the component's job
                            is the door rather than the count.
                          */}
                          <TileEntry
                            editions={[{ language: shown, title: say(unit.titles, shown) }]}
                            previous={previous}
                            track={bundle.track.id}
                            unit={unit.id}
                          />
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
