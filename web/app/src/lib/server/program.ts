import { cache } from 'react';

import type { TrackContent, UnitSummary } from '@/lib/content/wire';

import { fetchTrackContent, fetchUnitSummary } from './content.ts';
import { readerIdentity } from './reader-identity.ts';

/** A program resolved against `AbOvo.Api` for the reader asking, or why it could not be. */
export type ResolvedProgram =
  | {
      readonly kind: 'ok';
      readonly trackContent: TrackContent;
      readonly unit: UnitSummary;
      readonly language: string;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * The course and the program an address names, as `AbOvo.Api` serves them to this reader —
 * what a program's contents and its summary render from since issue #158 (ADR-0060), in one
 * place because the two pages ask exactly the same question.
 *
 * AS THE READER, because the unit comes back with this reader's furthest frame
 * (`UnitSummary.furthest`), which is how the contents lock a heading the gate would refuse.
 *
 * The two calls run together — neither needs the other's answer — and a server that did not
 * answer outranks a 404 from the other call: nothing is known about the address until both
 * have been heard, and saying "not found" about it would be a claim nobody checked (issue
 * #139). An edition the course is not published in is a bad URL segment, and a 404.
 *
 * WRAPPED IN `cache()`, KEYED BY THE THREE SEGMENTS, so a page's metadata and its body share
 * one pair of requests per render rather than making two — the frame page's reasoning for
 * its own `cache()`, with strings for keys: `cache()` compares its arguments by identity, and
 * three strings are the same key wherever they came from.
 */
export const resolveProgram = cache(
  async (track: string, unit: string, lang: string): Promise<ResolvedProgram> => {
    const identity = await readerIdentity();
    const [trackOutcome, unitOutcome] = await Promise.all([
      fetchTrackContent(track, identity),
      fetchUnitSummary(track, unit, identity),
    ]);

    if (trackOutcome.kind === 'unavailable') return trackOutcome;
    if (unitOutcome.kind === 'unavailable') return unitOutcome;
    if (trackOutcome.kind === 'not-found' || unitOutcome.kind === 'not-found') return { kind: 'not-found' };
    if (!trackOutcome.data.languages.includes(lang)) return { kind: 'not-found' };

    return { kind: 'ok', trackContent: trackOutcome.data, unit: unitOutcome.data, language: lang };
  },
);
