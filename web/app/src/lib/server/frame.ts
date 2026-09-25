import type { StepResponse, TrackContent, UnitSummary } from '@/lib/content/wire';

import {
  fetchStep,
  fetchTrackContent,
  fetchUnitSummary,
  type ContentOutcome,
  type FetchLike,
  type ReaderIdentity,
} from './content.ts';

/**
 * Everything one frame needs from `AbOvo.Api` — the track, the program and the step — asked
 * for AT ONCE, and read back in the order the page used to ask for them (issue #160).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE THREE CALLS DO NOT DEPEND ON ONE ANOTHER, SO NONE OF THEM WAITS FOR ANOTHER.
 *
 * The frame page awaited the track, then the program's summary, then the step: three round
 * trips end to end, on every frame and after every reveal, when nothing in any one of them is
 * an input to the next. The step's address is the route's own; the track is needed only to
 * say whether the edition in the address is one it publishes, and the summary only for the
 * title, the headings and the count. So all three leave together here, and a frame costs the
 * slowest of them rather than their sum.
 *
 * Asking for the step before the edition has been checked costs nothing a reader could see:
 * `GET .../{step}` is the gated READ, never the write — only `.../advance` moves a cursor
 * (`ContentEndpoints.cs`) — and an address that turns out to name no frame may have spent a
 * request or two it did not need, which is the price of a bad URL rather than of every good
 * one.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE ANSWERS ARE READ IN THE OLD ORDER, so what a page makes of an address is what it made
 * of it when the calls ran one after another: a track that is not there, or unreachable,
 * wins over everything; then an edition the track does not publish; then the program; then a
 * step segment that is not a frame number. Only then is the step's own outcome handed over —
 * as it came, because a refusal, a missing step and an unreachable one mean three different
 * pages and the page is where those are decided (`[step]/page.tsx`).
 *
 * A server module, like the calls it makes: nothing here may reach a component
 * (FRONTEND-BFF.md §1, the ESLint boundary on `lib/server`).
 */

/** A frame's address, as the reading route's four segments spell it. */
export interface FrameAddress {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
  /** The raw segment — not yet known to be a frame number. */
  readonly step: string;
}

export type FrameOutcome =
  | {
      readonly kind: 'ok';
      readonly trackContent: TrackContent;
      readonly unit: UnitSummary;
      /** The address's edition, and one the track publishes. */
      readonly language: string;
      /** The address's frame number: a whole number from 1, not yet checked against the count. */
      readonly n: number;
      /** The gated step — or its refusal, or why there is neither. */
      readonly step: ContentOutcome<StepResponse>;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly reason: string };

const NOT_FOUND = { kind: 'not-found' } as const;

/** The frame at `address`, for `identity` — see this module's header. */
export async function fetchFrame(
  address: FrameAddress,
  identity: ReaderIdentity,
  fetchImpl: FetchLike = fetch,
): Promise<FrameOutcome> {
  const n = Number(address.step);
  const numbered = Number.isInteger(n) && n >= 1;

  const [trackOutcome, unitOutcome, stepOutcome] = await Promise.all([
    fetchTrackContent(address.track, identity, fetchImpl),
    fetchUnitSummary(address.track, address.unit, identity, fetchImpl),
    // A segment that is not a frame number is a bad address whatever the API says, and
    // `GET .../{step:int}` would only answer 404 for it — so it is not asked.
    numbered ? fetchStep(address.track, address.unit, n, identity, fetchImpl) : undefined,
  ]);

  if (trackOutcome.kind === 'unavailable') return { kind: 'unavailable', reason: trackOutcome.reason };
  if (trackOutcome.kind === 'not-found') return NOT_FOUND;

  const language = trackOutcome.data.languages.includes(address.lang) ? address.lang : undefined;
  if (language === undefined) return NOT_FOUND;

  if (unitOutcome.kind === 'unavailable') return { kind: 'unavailable', reason: unitOutcome.reason };
  if (unitOutcome.kind === 'not-found') return NOT_FOUND;

  if (stepOutcome === undefined) return NOT_FOUND;

  return {
    kind: 'ok',
    trackContent: trackOutcome.data,
    unit: unitOutcome.data,
    language,
    n,
    step: stepOutcome,
  };
}
