'use client';

import { useEffect } from 'react';

import { rememberHere } from '@/lib/progress/client';

export interface RememberPositionProps {
  readonly track: string;
  readonly unit: string;
  readonly language: string;
  readonly step: number;
}

/**
 * Record where the reader is, in their own browser and nowhere else.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * FOUR IDENTIFIERS, AND THAT IS THE SAME BOUNDARY `frame-keys.tsx` KEEPS.
 *
 * A Client Component's props are serialised into the document so the browser can hydrate
 * them, so this takes two strings, a language tag and an integer — never the step. Handing
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
 */
export function RememberPosition({
  track,
  unit,
  language,
  step,
}: RememberPositionProps): null {
  useEffect(() => {
    // Through the client module rather than the store directly, so the resume controls —
    // which may be on another tab — hear about it. A storage failure is swallowed there: a
    // private window or a quota error costs a reader their place and never the page.
    rememberHere({ track, unit }, { language, step });
  }, [track, unit, language, step]);

  return null;
}
