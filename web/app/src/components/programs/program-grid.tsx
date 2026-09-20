import Link from 'next/link';

import { AccountControl } from '@/components/account/account-control';
import { ConsentControl } from '@/components/consent/consent-control';
import { ThemeSwitch } from '@/components/theme/theme-switch';
import { groupsOf, say, sectionSpans } from '@/lib/content/bundle';
import { editionsOffered } from '@/lib/content/chosen-edition';
import { shownBundles } from '@/lib/content/chosen-track';
import type { Bundle } from '@/lib/content/schema';
import { FALLBACK_LANGUAGE, chromeFor, endonym } from '@/lib/i18n/chrome';
import { coursesHref, indexHref } from '@/lib/index-href';

import { ClearWorksheets } from '../read/clear-controls.tsx';
import { ForgetProgress, ResumeLast, type Limits } from '../read/resume.tsx';

import styles from './program-grid.module.css';
import { TilePosition } from './tile-position.tsx';

export interface ProgramGridProps {
  readonly bundles: readonly Bundle[];
  /**
   * The edition the reader asked for, or `undefined` for the index that picks neither.
   * Resolved by `chosenEdition`, which is where every way of supplying a bad one collapses
   * to the same answer.
   */
  readonly chosen: string | undefined;
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
 * THE EDITION IS CHOSEN BY THE READER OR BY NOBODY.
 *
 * ADR-0015 refused a default edition and this page keeps that refusal: `chosen` is
 * `undefined` until a reader picks one in the switch, and until then every tile carries a
 * title per edition, each in its own language, each the link into it. The switch is what
 * ADR-0036 adds and it is offered rather than applied — a reader who has not touched it is
 * looking at a page that has made no editorial claim about which edition of the book is
 * the real one.
 *
 * The furniture follows the choice once there is one (ADR-0016), and is English until then.
 * That is not a third rule: ADR-0016 says the controls follow the reader's edition, and on
 * a page with no reader edition there is nothing to follow.
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
  const chrome = chromeFor(chosen ?? FALLBACK_LANGUAGE);

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

            It sits after the one link that is always here and before everything that is
            not, and that is placement rather than order of arrival: everything after it — the resume link, the two destructive controls, the account
            — is read out of this browser and cannot exist in the first paint, so each of
            them EXTENDS this line when it lands. A control that is in the markup from the
            start belongs before them, where nothing can push it sideways.

            It is three words of furniture and not a filled control, on `EditionSwitch`'s
            reasoning below: a reader touches it once and then wants it out of the way.
          */}
          <ThemeSwitch language={chrome.language} />
          <ResumeLast language={chrome.language} limits={limits} />
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

      <div className={styles.headingRow}>
        <h1 className={styles.heading}>{chrome.programs}</h1>
        {/*
          The editions of the courses ON SCREEN, not of every course pinned. A deployment whose
          second course is English-only must not offer a Polish position on a page narrowed to
          it: the switch would light a position whose page has nothing in it.
        */}
        <EditionSwitch
          both={chrome.bothEditions}
          chosen={chosen}
          editions={editionsOffered(courses)}
          label={chrome.languageLabel}
          track={chosenTrack}
        />
      </div>

      {courses.map((bundle) => {
        // The editions this track has, narrowed to the one chosen if there is one. Read from
        // the TRACK rather than from the switch, so a track that does not publish the chosen
        // edition shows the editions it does have instead of an empty tile.
        const editions = chosen
          ? bundle.track.languages.filter((language) => language === chosen)
          : bundle.track.languages;
        const shown = editions.length > 0 ? editions : bundle.track.languages;

        return (
          <section key={bundle.track.id}>
            <div className={styles.track}>
              {shown.map((language) => (
                <h2 className={styles.trackTitle} key={language} lang={language}>
                  {say(bundle.track.titles, language)}
                </h2>
              ))}
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
              than forty-seven tiles. The heading is the part's own title in each shown
              edition, or this application's word for the prefix; a prefix it has no word
              for is grouped without one. One group is a list, and gets no heading.
            */}
            {groupsOf(bundle).map((group) => {
              const label = group.part
                ? shown.map((language) => say(group.part!.titles, language)).join(' · ')
                : group.prefix
                  ? chrome.groupLabels[group.prefix]
                  : undefined;

              return (
                <div key={group.key || 'all'}>
                  {label ? (
                    <h3 className={styles.groupLabel} lang={group.part ? undefined : chrome.language}>
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
                            {shown.map((language) => (
                              <Link
                                className={styles.title}
                                href={`/read/${bundle.track.id}/${unit.id}/${language}`}
                                key={language}
                                lang={language}
                              >
                                {say(unit.titles, language)}
                              </Link>
                            ))}
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

/**
 * The edition switch, above the grid, offering and never applying.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT HAS THREE POSITIONS AND ONE OF THEM IS "NEITHER", WHICH IS WHAT KEEPS ADR-0015 TRUE.
 *
 * A two-position switch has a default by construction — whichever one is lit when the
 * reader arrives — and ADR-0015's objection to a default is that it is invisible to the
 * reader who happens to share it. So the page a reader arrives at lights neither, and
 * `bothEditions` is how they get back to it after choosing. No cookie, no `Accept-Language`
 * and nothing remembered: the choice is in the URL, where the reader can see it, link to it
 * and leave it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * LINKS RATHER THAN BUTTONS, so the switch works with JavaScript off and each position is a
 * URL a reader can share. Each language is named in its own language (`endonym`), because
 * the reader reaching for this control is exactly the one who cannot read the current page.
 *
 * EVERY POSITION CARRIES THE CHOSEN COURSE (ADR-0048). The two narrowings are independent, so
 * changing edition must not un-narrow the page: a switch that dropped `?track=` would
 * answer "show me this in Polish" with every course on the platform, and the reader would
 * have to find their way back to the one they were in.
 */
function EditionSwitch({
  both,
  chosen,
  editions,
  label,
  track,
}: {
  readonly both: string;
  readonly chosen: string | undefined;
  readonly editions: readonly string[];
  readonly label: string;
  readonly track: string | undefined;
}): React.JSX.Element | null {
  // One edition is not a choice, and a switch offering it would be furniture that does
  // nothing. A track that publishes a second one makes this appear without a code change.
  if (editions.length < 2) return null;

  return (
    <nav aria-label={label} className={styles.editions}>
      {editions.map((language) => (
        <Link
          aria-current={language === chosen ? 'true' : undefined}
          className={styles.edition}
          href={indexHref({ track, edition: language })}
          key={language}
          lang={language}
        >
          {endonym(language)}
        </Link>
      ))}
      {/*
        The way back to the page that picks neither. It is a link even when it is the
        current position: all three positions are the same kind of thing, and a control
        that turns into plain text when you are on it is one a reader has to re-learn.
        `aria-current` is what says which one is live, and it says it for this one too.
      */}
      <Link
        aria-current={chosen ? undefined : 'true'}
        className={styles.edition}
        href={indexHref({ track })}
      >
        {both}
      </Link>
    </nav>
  );
}
