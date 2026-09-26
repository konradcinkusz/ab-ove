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
 * NO CALL IS AN INPUT TO ANOTHER, SO NONE OF THEM WAITS FOR ANOTHER.
 *
 * The frame page awaited the track, then the program's summary, then the step: three round
 * trips end to end, on every frame and after every reveal. Yet every call's address is the
 * route's own, and nothing one of them answers goes into the request for the next. The page
 * does need all three answers — the track says which editions it publishes, and carries the
 * bundle's tag and the program before this one; the summary carries the title, the headings
 * and the count — but only once they are all in. So all three leave together here, and a
 * frame costs the slowest of them rather than their sum.
 *
 * Asking for the step before the edition has been checked costs nothing a reader could see:
 * `GET .../{step}` is the gated READ, never the write — only `.../advance` moves a cursor
 * (`ContentEndpoints.cs`) — and an address that turns out to name no frame may have spent a
 * request or two it did not need, which is the price of a bad URL rather than of every good
 * one.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE PROGRAM IS A HALF OF ITS OWN, BECAUSE THE TAB'S TITLE NEEDS IT AND NOTHING ELSE.
 *
 * The title is the program's name and the frame's number out of the count: the track and the
 * summary, never the step. And `generateMetadata` also runs where the page does not — Next
 * prefetches the head of a frame a link points at, unless the link opts out — so whatever it
 * asks for is asked for by every such prefetch. So the track and the summary are
 * `fetchProgram`, which the page shares with its title (`[step]/page.tsx`), and the step is
 * the page's alone, asked for beside that pair and never after it (`fetchFrame`).
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE ANSWERS ARE READ IN THE OLD ORDER, so what a page makes of an address is what it made
 * of it when the calls ran one after another: a track that is not there, or unreachable,
 * wins over everything; then an edition the track does not publish; then the program; then a
 * step segment that is not a frame number. Only then is the step's own outcome handed over —
 * as it came, because a refusal, a missing step and an unreachable one mean three different
 * pages and the page is where those are decided (`[step]/page.tsx`).
 *
 * The outcomes are called `…Fetch` and not `…Outcome`: the instrument's per-frame count is
 * an entity of that other name (`AbOvoDbContext`, ADR-0009), and a search made while
 * auditing it should not land here.
 *
 * A server module, like the calls it makes: nothing here may reach a component
 * (FRONTEND-BFF.md §1, the ESLint boundary on `lib/server`).
 */

/** A program's address: the track, the program, and the edition it is read in. */
export interface ProgramAddress {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
}

/** A frame's address, as the reading route's four segments spell it. */
export interface FrameAddress extends ProgramAddress {
  /** The raw segment — not yet known to be a frame number. */
  readonly step: string;
}

/** What asking for a program came back with. */
export type ProgramFetch =
  | {
      readonly kind: 'ok';
      readonly trackContent: TrackContent;
      readonly unit: UnitSummary;
      /** The address's edition, and one the track publishes. */
      readonly language: string;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** What asking for a frame came back with: its program, and the step's own outcome. */
export type FrameFetch =
  | (Extract<ProgramFetch, { readonly kind: 'ok' }> & {
      /** The address's frame number: a whole number from 1, not yet checked against the count. */
      readonly n: number;
      /** The gated step — or its refusal, or why there is neither. */
      readonly step: ContentOutcome<StepResponse>;
    })
  | Exclude<ProgramFetch, { readonly kind: 'ok' }>;

const NOT_FOUND = { kind: 'not-found' } as const;

/** The frame number a step segment names — a whole number from 1 — or `undefined` for none. */
export function frameNumberOf(segment: string): number | undefined {
  const n = Number(segment);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** The track and the program at `address`, both asked for at once — see this module's header. */
export async function fetchProgram(
  address: ProgramAddress,
  identity: ReaderIdentity,
  fetchImpl: FetchLike = fetch,
): Promise<ProgramFetch> {
  const [trackOutcome, unitOutcome] = await Promise.all([
    fetchTrackContent(address.track, identity, fetchImpl),
    fetchUnitSummary(address.track, address.unit, identity, fetchImpl),
  ]);

  if (trackOutcome.kind === 'unavailable') return { kind: 'unavailable', reason: trackOutcome.reason };
  if (trackOutcome.kind === 'not-found') return NOT_FOUND;

  const language = trackOutcome.data.languages.includes(address.lang) ? address.lang : undefined;
  if (language === undefined) return NOT_FOUND;

  if (unitOutcome.kind === 'unavailable') return { kind: 'unavailable', reason: unitOutcome.reason };
  if (unitOutcome.kind === 'not-found') return NOT_FOUND;

  return { kind: 'ok', trackContent: trackOutcome.data, unit: unitOutcome.data, language };
}

/**
 * The frame at `address`, for `identity` — see this module's header.
 *
 * `program` is the track and the program when the caller already has them on their way: the
 * frame page shares one pair with its title. Without it they are asked for here. Either way
 * the step's call is made before anything is awaited, so it never waits on the pair.
 */
export async function fetchFrame(
  address: FrameAddress,
  identity: ReaderIdentity,
  fetchImpl: FetchLike = fetch,
  program: Promise<ProgramFetch> = fetchProgram(address, identity, fetchImpl),
): Promise<FrameFetch> {
  const n = frameNumberOf(address.step);

  const [programOutcome, stepOutcome] = await Promise.all([
    program,
    // A segment that is not a frame number is a bad address whatever the API says, and
    // `GET .../{step:int}` would only answer 404 for it — so it is not asked.
    n === undefined ? undefined : fetchStep(address.track, address.unit, n, identity, fetchImpl),
  ]);

  if (programOutcome.kind !== 'ok') return programOutcome;
  if (n === undefined || stepOutcome === undefined) return NOT_FOUND;

  return { ...programOutcome, n, step: stepOutcome };
}
