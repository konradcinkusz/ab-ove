'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { keyOf, positionIn, type Progress, type ProgramRef } from '@/lib/progress/store';
import {
  ask,
  serverSnapshot as sessionOnServer,
  snapshot as session,
  subscribe as onSession,
} from '@/lib/session/client';

import styles from './program-grid.module.css';

/** One program the card can name: how long it is, and its title as the index shows it. */
export interface CardProgram {
  /** Its length, so a place past the end of a shortened program is clamped rather than 404. */
  readonly steps: number;
  /** Its title in `edition`, which is the edition its tile is shown in (`program-grid.tsx`). */
  readonly title: string;
  readonly edition: string;
}

/** `track/unit` → the program, for every program this deployment pins. */
export type CardPrograms = Readonly<Record<string, CardProgram>>;

export interface StartCardProps {
  /** The program a reader with no place starts with: the first of the first course shown. */
  readonly start: ProgramRef;
  readonly programs: CardPrograms;
  /** The index's edition, which the card's own words follow (ADR-0016, since ADR-0052 always one). */
  readonly language: string;
  /**
   * `/login`, returning to this index — given only where this deployment can sign a reader in
   * (`backendConfigured('authservice')`, P8). Without it the quiet line is never shown: a
   * sentence offering an account a deployment cannot open would be a false promise.
   */
  readonly signInHref?: string | undefined;
}

/** The title's id, which the card's link names as its description. One card per page. */
const TITLE_ID = 'start-program';

/**
 * Where *Continue* goes: the program last shown, at that program's furthest frame (issue #157),
 * in the edition it was read in — or `undefined`, and the card offers the start.
 *
 * A program this deployment does not list is no place to continue to: a track unpinned, a unit
 * renamed. The record is not wrong, it is about something that is not here, so the card falls
 * back to the start rather than pointing at a 404 — `lib/server/account-places.ts` leaves such a
 * row out of the account's page by the same rule.
 */
function continueIn(progress: Progress, programs: CardPrograms) {
  const last = progress.last;
  if (!last) return undefined;
  const program = programs[keyOf(last)];
  if (!program) return undefined;

  // Clamped by `positionIn`. A `last` whose program has no furthest is a record this module
  // did not write; it falls back to the frame `last` names rather than to nothing.
  const { language: edition, step } = positionIn(progress, last, program.steps) ?? {
    language: last.language,
    step: Math.min(last.step, program.steps),
  };
  return { track: last.track, unit: last.unit, edition, step, program };
}

/** The reader's record, read the one way this application reads it (`lib/progress/client.ts`). */
const useProgress = () => useSyncExternalStore(subscribe, snapshot, serverSnapshot);

/**
 * Where to sign in to carry a place to another device — `signInHref` — once the session has
 * answered that nobody is signed in here, and `undefined` until then and for every other answer.
 *
 * "We do not know" is not "you are signed out" (`account-control.tsx`), so nothing is offered
 * while the answer is on its way, and `unavailable` — a cookie that could not be verified — is
 * most likely a reader who IS signed in. Asked here rather than trusted to the account control
 * or the sync, so the line does not depend on which other components a page renders; `ask()`
 * collapses callers in the same tick into one request. Where signing in does not exist (no
 * `signInHref`, P8) it asks nothing.
 */
function useCarry(signInHref: string | undefined): string | undefined {
  const status = useSyncExternalStore(onSession, session, sessionOnServer);

  useEffect(() => {
    if (signInHref) void ask();
  }, [signInHref]);

  return status === 'signed-out' ? signInHref : undefined;
}

/**
 * The index's one filled control, and the program it leads into — issue #165.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A NEW READER WAS OFFERED NOTHING, AND A RETURNING ONE FOUND THEIR PLACE IN THE MASTHEAD.
 *
 * `ResumeLast`, which this replaces, rendered nothing without a record, so a first visit had
 * forty-seven tiles and no word on where to begin; with one, it was a filled link at the end
 * of the masthead, in a row it shared with the theme switch, *Forget where I am* and *Clear my
 * worksheets*. The card is above the grid and holds one thing: *Start with F01* under the first
 * open program's title for a reader with no place, and `F01 · Continue at frame 12` under the
 * title of the program last read for a reader with one. The destructive controls are a screen
 * away, in *Your data in this browser* at the foot (`program-grid.tsx`), which is ADR-0017's
 * placement rule — the control that destroys is not the one beside the cursor — kept by a
 * page's length rather than by a place in a row.
 *
 * *Start* opens the program's contents, where *Start at frame 1* is the filled control
 * (`entry-control.tsx`), so the two read as one move and then the next; the first program of a
 * course is open to everybody (ADR-0051). *Continue* opens the furthest frame of the program
 * last shown (issue #157), the frame the contents page's control and the tile's `at frame 12`
 * name too, from the same `positionIn`, so the three cannot disagree.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE ELEMENT IN BOTH STATES, SO THE SWAP MOVES NOTHING.
 *
 * The record is in this browser, so the server renders a reader with no record — *Start* —
 * and a returning reader's *Continue* arrives at hydration, the way `entry-control.tsx`'s does:
 * the same box, a different title, label and href. The title is one line in every state (the
 * stylesheet cuts a title longer than the card rather than wrapping it) and the action row is a
 * finger tall with or without what follows the button, so `progress.spec.ts`'s shift bound holds
 * with the swap inside it. `progress.spec.ts` also holds the page to one link to the reader's
 * frame, and this is it: the tile's `at frame 12` is text (`tile-position.tsx`).
 *
 * The title is the CONTENT's, so it crosses the client boundary, on `tile-entry.tsx`'s reasoning:
 * there is no answer on the index, and every title here is already on the page. The link is
 * named by its own words — `F01`, never the title — because a link named by the title would be a
 * second link called by it, beside the tile's; the title is the link's description instead, so a
 * screen reader hears it with the link.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE QUIET LINE, FOR A READER WITH NO ACCOUNT WHO HAS A PLACE — BESIDE *CONTINUE* WHERE THE
 * ROW HAS ROOM FOR IT, AND NOWHERE IN THE CARD WHERE IT DOES NOT.
 *
 * The audit of 2026-09-24 found that nothing told an anonymous reader where their place is kept.
 * Beside *Continue* it now says so, and that signing in is what carries it to another device
 * (`chrome.placeKeptHere`) — only when all three are true: this deployment can sign a reader in
 * (`signInHref`, P8), the reader has a place, which is the *Continue* state, and the session has
 * answered `signed-out` (`useCarry`).
 *
 * It arrives after the session's round trip, so it can only go where arriving moves nothing: the
 * action row the button is already in, which it shares at a tablet's width and wider, two lines
 * at most inside the row's own height. A phone's card has no room beside the button, and under it
 * the line pushed every tile down once the session answered, on every visit of the reader it is
 * for — a layout shift of 0.021 at 390 px (measured 2026-09-26), over the 0.02 that
 * `progress.spec.ts` holds this page to. So below
 * that width the stylesheet keeps it out of the card (`.startNote`), and the phone reader is told
 * at the foot instead: *Your data in this browser* says that the place is kept here for every
 * reader, and `PlaceKeptLink` adds the way to carry it for this one.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function StartCard({ start, programs, language, signInHref }: StartCardProps): React.JSX.Element | null {
  const progress = useProgress();
  const carry = useCarry(signInHref);
  const chrome = chromeFor(language);

  const place = continueIn(progress, programs);
  const program = place?.program ?? programs[keyOf(start)];
  // A deployment pins at least one course, and every course a program; a card with nothing to
  // name is absent rather than a box with a button leading nowhere.
  if (!program) return null;

  const href = place
    ? `/read/${place.track}/${place.unit}/${place.edition}/${place.step}`
    : `/read/${start.track}/${start.unit}/${program.edition}`;
  const label = place ? `${place.unit} · ${chrome.continueAtFrame(place.step)}` : chrome.startWith(start.unit);
  const quiet = place ? carry : undefined;

  return (
    <div className={styles.start} data-testid="start-card">
      <p className={styles.startTitle} id={TITLE_ID} lang={program.edition}>
        {program.title}
      </p>
      <div className={styles.startAction}>
        <Link aria-describedby={TITLE_ID} className={styles.startLink} href={href} lang={chrome.language}>
          {label}
        </Link>
        {quiet ? (
          <p className={styles.startNote} lang={chrome.language}>
            {chrome.placeKeptHere}{' '}
            {/* Titled in the edition, so not prefetched (ADR-0067, `account-href.ts`). */}
            <Link className={styles.carryLink} href={quiet} prefetch={false}>
              {chrome.signInToCarry}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface PlaceKeptLinkProps {
  readonly programs: CardPrograms;
  readonly language: string;
  /** As `StartCardProps.signInHref`: present only where this deployment can sign a reader in. */
  readonly signInHref?: string | undefined;
}

/**
 * The quiet line's way to carry a place, on a phone — issue #165, and `StartCard`'s last block
 * says why it is not in the card there.
 *
 * It ends the lead of *Your data in this browser* (`program-grid.tsx`), whose own sentence —
 * rendered on the server for every reader — already says that the place is kept in this
 * browser, so what it adds is the half that is for this reader alone: *Sign in to carry it to
 * another device*, on the card's three conditions exactly, so the two places cannot disagree
 * about who is offered it. The stylesheet shows it below the width at which the card shows its
 * own line and hides it from there up (`.placeKept`), so a reader meets it once.
 *
 * At the foot, below every tile, its arrival moves nothing a reader is looking at — the
 * reasoning the reader's three controls under it rest on.
 */
export function PlaceKeptLink({ programs, language, signInHref }: PlaceKeptLinkProps): React.JSX.Element | null {
  const progress = useProgress();
  const carry = useCarry(signInHref);
  const chrome = chromeFor(language);

  const quiet = continueIn(progress, programs) ? carry : undefined;
  if (!quiet) return null;

  return (
    <span className={styles.placeKept} lang={chrome.language}>
      {' '}
      <Link className={styles.carryLink} href={quiet} prefetch={false}>
        {chrome.signInToCarry}
      </Link>
    </span>
  );
}
