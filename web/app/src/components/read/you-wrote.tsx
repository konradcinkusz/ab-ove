'use client';

import { useEffect } from 'react';

import { reportAnswer } from '@/lib/instrument/report';
import { patchHere, useSheet } from '@/lib/sheet/client';
import { matchesBook } from '@/lib/sheet/number';

import styles from './worksheet.module.css';

export interface YouWroteProps {
  readonly track: string;
  readonly unit: string;
  /** The frame this page IS. The answer on it belongs to `n - 1`, which is what is read. */
  readonly n: number;
  /** The edition, which decides whether a comma is a decimal point or a thousands mark. */
  readonly language: string;
  readonly chromeLanguage: string;
  readonly youWrote: string;
  readonly matches: string;
  /**
   * THIS FRAME'S OWN ANSWER, normalised to one number — or `undefined`, which is the
   * ordinary case (92% of the book's answers are not a number).
   *
   * ────────────────────────────────────────────────────────────────────────────────────
   * IT IS A PROP, AND THAT IS SAFE HERE FOR A REASON WORTH WRITING DOWN, because the
   * neighbouring rule says the opposite.
   *
   * `frame-keys.tsx` may not be handed the next frame's step, and `remember-position.tsx`
   * takes four identifiers and no content, because a Client Component's props are
   * serialised into the document and the next frame's answer must not travel with the
   * frame that asks the question (#4, ADR-0014).
   *
   * This component renders INSIDE the answer box. The number it carries is the number of
   * the answer the reader is looking at, on the page that is showing it — so the prop puts
   * it exactly where it already is, and nothing crosses a boundary that had not crossed.
   * A first draft read it off `data-book-number` instead, which is the same value by a
   * longer route: a `ref`, a `closest()`, an effect, and a `setState` in that effect, which
   * the React compiler rejects. The attribute stays on the box because
   * `frame-view.spec.ts` asserts it is absent on frame n and present on n+1 — a crisper
   * contract than the shape of an RSC payload.
   * ────────────────────────────────────────────────────────────────────────────────────
   */
  readonly bookNumber: string | undefined;
  /** The bundle this page was rendered from — part of the key an outcome is filed under. */
  readonly bundleTag: string;
}

/**
 * What the reader committed, beside the answer they committed it against.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT SAYS "MATCHES" OR IT SAYS NOTHING. There is no second branch to write.
 *
 * `lib/sheet/number.ts` has the measurement: a machine can compare 8% of this book's
 * answers and no more, so a negative verdict would be wrong four times in five, on exactly
 * the answers a reader worked hardest for. `matchesBook` returns `false` both for "the
 * reader is wrong" and for "there is nothing here to compare", deliberately — a component
 * able to tell them apart would be one edit from printing the first.
 *
 * There are no self-marking buttons either. Two toggles on the 92% of reveals with no
 * verdict is a hand-rolled score prompt the book never asks for, and a mark in a store
 * nothing may enumerate buys the reader nothing at all.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ARRIVING HERE IS WHAT LOCKS THE PREVIOUS FRAME'S LINE, via a patch that CREATES NOTHING:
 * a reader who deep-links to this frame has never seen the one before it, and a
 * create-or-update would lock an untouched field before they had written in it.
 */
export function YouWrote({
  track,
  unit,
  n,
  language,
  chromeLanguage,
  youWrote,
  matches,
  bookNumber,
  bundleTag,
}: YouWroteProps): React.JSX.Element {
  const previous = { track, unit, n: n - 1 };
  const sheet = useSheet(previous);

  useEffect(() => {
    // The reveal has happened: this page IS the answer. A side effect and no state, which
    // is what an effect is for — the store announces and every subscriber re-reads.
    patchHere(previous, { revealed: true });
    // `previous` is rebuilt every render, so the identifiers are the dependencies.
  }, [track, unit, n]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    ────────────────────────────────────────────────────────────────────────────────────────
    AND, IF THE READER AGREED TO IT, HOW THE FRAME WENT — A BOOLEAN AND NEVER THEIR WORDS.

    `reportAnswer` asks the consent store before it assembles anything. This decides only
    WHAT there is to say, and the answer is "usually nothing". Each refusal below was a
    defect in a draft of this effect; no count of them is stated, because a tally in a
    comment is a claim nothing can check and this one has already changed once.

    NOTHING WHEN THE READER HAS NO SHEET HERE. That is a frame passed without touching the
    worksheet, which is the method the book prescribes — *write it down, on paper* — and
    counting it would measure the reader's habit rather than the book. It is also the one
    case that CANNOT be deduplicated: `revealed` is written by a patch that creates nothing,
    so a frame with no record has nowhere to remember having been counted, and every
    re-read would report it again.

    NOTHING ON A RE-READ. `revealed` is already set when a reader returns to a frame they
    have seen, and a second report is a second attempt at a question they answered once. The
    attempt number is what the instrument's first-attempt rate is built on, so this is the
    guard that keeps that number meaning what it says.

    NOTHING UNLESS THIS FRAME'S WHOLE ANSWER IS ONE PRINTED NUMBER — 85 frames of 1 036. On
    the rest `matchesBook` is `false` for "the reader is wrong" and for "there is nothing to
    compare" alike, deliberately, so a report from here would file the second as the first
    and tell the book's author a frame is failing when nobody has asked. THE BLANK IS INSIDE
    THAT GATE RATHER THAN BEFORE IT, which is the correction that matters here: reporting a
    blank on the other 951 frames would file a check that can only ever fail, whose rate is
    0% however the book is written. `answerCheckName` has the measurement and the eleven
    frames of P01 where such a cell would also have polluted the first-attempt pool.

    So a blank on a verdict-able frame is a FAIL on the same cell as a wrong answer, and the
    thing the reader sees is unchanged either way: the row says what they wrote, and says
    "matches" or says nothing. Telling a give-up from a miss would be the more interesting
    signal and this schema cannot carry it without putting engagement inside a number the
    author's view labels "right first time"; it is written up as owed rather than faked.
    ────────────────────────────────────────────────────────────────────────────────────────
  */
  useEffect(() => {
    if (sheet === undefined || sheet.revealed) return;

    const step = n - 1;
    const frame = { bundleTag, track, unit, step };

    // THE NUMBER GATE COMES FIRST, AND A BLANK IS INSIDE IT RATHER THAN BEFORE IT.
    // A draft reported blanks on every cue frame and matched/missed only here, which put a
    // check that can only ever fail on 951 frames. See `answerCheckName`.
    if (bookNumber === undefined) return;

    const written = sheet.answer.trim().length > 0;
    void reportAnswer(
      frame,
      written ? (matchesBook(sheet.answer, bookNumber, language) ? 'matched' : 'missed') : 'blank',
    );
  }, [track, unit, n, bundleTag, bookNumber, language, sheet]);

  const written = sheet && sheet.answer.trim().length > 0 ? sheet.answer : undefined;
  const agrees = written !== undefined && matchesBook(written, bookNumber, language);

  /*
    THE ROW IS ALWAYS IN THE DOM AND ONLY SOMETIMES VISIBLE, which is the same trick the
    keys hint uses and for the same reason. It cannot be rendered on the server — the
    reader's text is in their browser — so it arrives after paint, and a row that appeared
    would push the frame's body down at the exact moment the reader is reading the answer.
    `visibility` keeps the space either way; `specs/reading.spec.ts` asserts the reveal's
    layout shift stays under 0.01 and this is what keeps it there.
  */
  return (
    <p
      aria-live="polite"
      className={styles.youWrote}
      data-written={written === undefined ? 'no' : 'yes'}
    >
      {written === undefined ? null : (
        <>
          <span className={styles.youWroteLabel} lang={chromeLanguage}>
            {youWrote}:
          </span>{' '}
          <span className={styles.youWroteText}>{written}</span>
          {agrees ? (
            <span className={styles.agrees} lang={chromeLanguage}>
              {matches}
            </span>
          ) : null}
        </>
      )}
    </p>
  );
}
