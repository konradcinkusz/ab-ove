'use client';

import { useEffect } from 'react';

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
}: YouWroteProps): React.JSX.Element {
  const previous = { track, unit, n: n - 1 };
  const sheet = useSheet(previous);

  useEffect(() => {
    // The reveal has happened: this page IS the answer. A side effect and no state, which
    // is what an effect is for — the store announces and every subscriber re-reads.
    patchHere(previous, { revealed: true });
    // `previous` is rebuilt every render, so the identifiers are the dependencies.
  }, [track, unit, n]); // eslint-disable-line react-hooks/exhaustive-deps

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
