'use client';

import { useEffect } from 'react';

import { rememberHere, snapshot } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';

export interface RememberPositionProps {
  readonly track: string;
  readonly unit: string;
  readonly language: string;
  readonly step: number;
  /**
   * The program the book puts before this one, or `undefined` for the first (ADR-0048).
   * A fifth identifier, and the boundary below is unchanged: it is an id, not a step.
   */
  readonly previous: string | undefined;
}

/**
 * Record where the reader is, in their own browser and nowhere else.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * FIVE IDENTIFIERS, AND THAT IS THE SAME BOUNDARY `frame-keys.tsx` KEEPS.
 *
 * A Client Component's props are serialised into the document so the browser can hydrate
 * them, so this takes three ids, a language tag and an integer — never the step. Handing
 * it the step object would put the answer it carries into the HTML of the frame that asks
 * the question (#4, ADR-0014), and `specs/frame-view.spec.ts` asserts over `page.content()`
 * so that widening these props fails loudly rather than quietly.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT RENDERS NOTHING, which is the point: no badge, no "12 of 45 read", no progress bar.
 * ADR-0009 §1 puts the instrument on the book and never on the reader, and the cheapest way
 * to keep a record from becoming a score is for the record to have nothing in it worth
 * scoring — see `lib/progress/store.ts`, which has no timestamp and no counter.
 *
 * On mount rather than on unload. `beforeunload` is unreliable on mobile and skipped on a
 * soft navigation, which is how a reader moves between frames here; arriving IS the event.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT DOES NOT RECORD A PLACE IN A PROGRAM THE READER MAY NOT BE IN, AND THAT IS THE HOLE
 * ADR-0048 WOULD OTHERWISE HAVE.
 *
 * Arriving is the event, so a deep link into a shut program would arrive, be recorded, and
 * — because a place in a program is one of the three things that OPENS it — unlock it on
 * the way past. One typed URL would have bought the whole book, permanently, and the gate
 * on the same page would have been the thing that made it permanent.
 *
 * So the recorder asks the same question `program-gate.tsx` asks, from the same pure
 * function, and writes nothing when the answer is no. The two are deliberately independent
 * rather than ordered: effects in a tree run children before parents, and a rule that only
 * held because the redirect happened to win a race would be a rule that breaks the first
 * time somebody moves a component. The gate takes the reader away; this makes sure nothing
 * was left behind if it does not.
 *
 * The record is read with `snapshot()` rather than subscribed to, because the question is
 * asked once, at the moment of arrival, inside the effect — there is nothing for this
 * component to re-render.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function RememberPosition({
  track,
  unit,
  language,
  step,
  previous,
}: RememberPositionProps): null {
  useEffect(() => {
    // A program this reader has not reached yet records nothing — see the note above for
    // what writing here would have bought them.
    if (!isOpen(snapshot(), { track, unit, previous })) return;

    // Through the client module rather than the store directly, so the resume controls —
    // which may be on another tab — hear about it. A storage failure is swallowed there: a
    // private window or a quota error costs a reader their place and never the page.
    rememberHere({ track, unit }, { language, step });
  }, [track, unit, language, step, previous]);

  return null;
}
