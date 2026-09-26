import { cache } from 'react';

import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { say } from '@ab-ovo/web-kit';

import { FrameView } from '@/components/read/frame-view';
import { NotReached } from '@/components/read/not-reached';
import { signInHref } from '@/lib/account-href';
import { chromeFor } from '@/lib/i18n/chrome';
import { contentUnavailable } from '@/lib/read/render-failure';
import { READER_ID_COOKIE } from '@/lib/reader-cookie';
import { backendConfigured } from '@/lib/server/backends';
import type { ReaderIdentity } from '@/lib/server/content';
import { fetchFrame, fetchProgram, frameNumberOf, type ProgramFetch } from '@/lib/server/frame';
import { readerEdition } from '@/lib/server/reader-edition';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';
import type { TrackContent } from '@/lib/content/wire';

/**
 * One frame of one program, in one language.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A SERVER COMPONENT THAT SENDS ONE STEP, WHICH IS WHAT MAKES THE ANSWER ABSENT — ADR-0060
 * SHARPENED WHERE THAT PROPERTY LIVES RATHER THAN CHANGING IT.
 *
 * The reveal used to be a bare navigation to `n + 1`; it is now a live, gated call to
 * `AbOvo.Api` — `GET .../content/{track}/{unit}/{step}` — that refuses to serve anything
 * this reader has not reached. The property this route existed to keep, "the answer is
 * structurally absent, not hidden", is now enforced by the SERVICE rather than by this
 * component alone: there is no compiled bundle in this process to leak from in the first
 * place, gate or no gate.
 *
 * The URL is still the position — track, unit, language, step — so it survives a reload
 * with no session (ADR-0061: the anonymous reader's cursor is a cookie, not a URL
 * parameter, and reading is still account-free). `/read/` is already in the middleware's
 * public-prefix list.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
interface RouteParams {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
  readonly step: string;
}

/** Who is asking: a signed-in reader's bearer, or an anonymous one's cursor cookie (ADR-0061). */
async function readerIdentity(): Promise<ReaderIdentity> {
  const store = await cookies();
  return {
    bearer: store.get(ACCESS_TOKEN_COOKIE)?.value,
    readerId: store.get(READER_ID_COOKIE)?.value,
  };
}

/**
 * The track and the program at this address, asked for together (`lib/server/frame.ts`,
 * issue #160) — shared by `generateMetadata` and the page, so the title can never describe a
 * different program from the body.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * ONE PAIR OF CALLS PER REQUEST, AND THE KEY IS THREE STRINGS, NOT THE ROUTE'S PARAMS OBJECT.
 *
 * Next runs `generateMetadata` and the page as separate calls within one request, and
 * `cache()` is React's request-scoped memo that makes two such calls one. It compares its
 * arguments by identity, though, and the two callers are handed two different params
 * objects — so the version of this that took `params` whole never once hit its cache.
 * Measured on 2026-09-25 through a pass-through that held every call to `AbOvo.Api` 300 ms:
 * one frame cost FIVE calls in THREE rounds — the track twice, then the program twice, then
 * the step — about 930 ms before anything could render. It costs three calls now, leaving
 * together: this pair, shared, and the page's step beside it (`fetchFrame`). Strings compare
 * by value, so the segments are the key, and anything added to it must be a primitive for
 * the same reason.
 *
 * THE STEP IS NOT IN IT. The title does not need it, and `generateMetadata` also runs where
 * the page does not: Next prefetches the head of a frame a link points at, unless the link
 * opts out, and the head is `generateMetadata`, which asks for this pair and nothing else.
 * With the step in here each of those prefetches made the gated read too, for a page nobody
 * had opened. Measured on 2026-09-26, the same way: a prefetched frame link on the contents
 * page asks for the track and the program, and not the step.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */
const programAt = cache(
  async (track: string, unit: string, lang: string): Promise<ProgramFetch> =>
    fetchProgram({ track, unit, lang }, await readerIdentity()),
);

/**
 * The program the book puts immediately before this one — ADJACENCY IN THE MANIFEST,
 * never arithmetic on the id (the book's own main sequence was renumbered once, when P07
 * was inserted). `@ab-ovo/web-kit`'s `unitBefore`, reworked to read `TrackContent.programs`
 * — the same list `ProgramGate`/`RememberPosition` need the id out of — instead of a
 * `Bundle`'s `units`.
 */
function previousProgramId(trackContent: TrackContent, unitId: string): string | undefined {
  const index = trackContent.programs.findIndex((program) => program.id === unitId);
  return index > 0 ? trackContent.programs[index - 1]?.id : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { track, unit, lang, step: segment } = await params;
  const program = await programAt(track, unit, lang);
  const n = frameNumberOf(segment);

  /*
   * THE SERVER DID NOT ANSWER, SO NOTHING IS KNOWN ABOUT THIS ADDRESS — and the title says
   * nothing it does not know (issue #139). It used to fall in with `not-found` and read
   * "Not found" over a page saying the book's server had not answered, which was a claim
   * about the address nobody had checked. The frame number is the reader's own, so it is
   * safe to repeat, in the edition the address asks for (English where there are no words
   * for it); the program's title came from the server that did not answer, so it is not.
   */
  if (program.kind === 'unavailable') {
    return { title: n === undefined ? 'ab-ovo' : `${chromeFor(lang).frameNumbered(n)} — ab-ovo` };
  }
  // A 404 is titled as one, in the edition its page speaks (issue #166): the address's, else
  // the one this browser remembers — `NotFoundPage`'s rule, so an edition the course is not
  // published in does not put an English tab over a Polish page.
  if (program.kind === 'not-found' || n === undefined || n > program.unit.stepCount) {
    return { title: chromeFor(await readerEdition(lang)).notFound.tabTitle };
  }

  const chrome = chromeFor(program.language);
  return {
    title: `${chrome.frameNumbered(n)} — ${say(program.unit.titles, program.language)} — ab-ovo`,
    // Deliberately not the body: a description is served to crawlers and to link previews,
    // and a frame's body is the question. The answer is already structurally absent; the
    // question does not need to be handed out either.
    description: `${chrome.frameNumbered(n)} ${chrome.ofTotal(program.unit.stepCount)}.`,
  };
}

export default async function FramePage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const { track, unit: unitId, lang, step: segment } = await params;
  // The pair the title asked for (or asks for it now), and the step beside it: all three on
  // their way before either half is awaited (`fetchFrame`).
  const program = programAt(track, unitId, lang);
  const identity = await readerIdentity();
  const frame = await fetchFrame({ track, unit: unitId, lang, step: segment }, identity, fetch, program);

  if (frame.kind === 'unavailable') {
    // Caught by `app/error.tsx` — a deployment fault (the content API could not be
    // reached), never a reader's problem. `bundleFor`'s own doc comment drew this line
    // first: "nothing a reader typed can cause either and nothing a reader does can fix
    // it," carried from a missing file on disk to an unreachable service. The error is
    // MARKED as this failure, so that page can say so and not guess (issue #139).
    throw contentUnavailable(frame.reason);
  }
  // A track, an edition or a program that is not there, or a segment that is no frame number.
  if (frame.kind === 'not-found') notFound();

  const { unit, trackContent, language, n: requestedStep, step: stepOutcome } = frame;

  if (stepOutcome.kind === 'unavailable') {
    throw contentUnavailable(stepOutcome.reason);
  }
  if (stepOutcome.kind === 'not-found') notFound();

  if (!stepOutcome.data.ok || !stepOutcome.data.step) {
    const refusal = stepOutcome.data.refusal;
    // `Reveal.Serve` refuses `NoSuchStep` for a step past the program's own end — a bad URL
    // segment, not a gate a reader could ever satisfy by reading further.
    if (!refusal || refusal.kind === 'NoSuchStep') notFound();

    const chrome = chromeFor(language);
    const reading = `/read/${track}/${unit.id}/${language}`;
    // Issue #157 — a reader with no session was gated on the anonymous cursor, and may have
    // read this frame signed in. Offered only where signing in exists (P8), returning here, and
    // in this frame's edition, which the sign-in page follows (issue #166).
    const signIn =
      identity.bearer === undefined && backendConfigured('authservice')
        ? signInHref({ redirect: `${reading}/${requestedStep}`, edition: language })
        : undefined;
    return (
      <NotReached
        chrome={chrome}
        contentsHref={reading}
        furthest={refusal.furthest}
        furthestHref={`${reading}/${refusal.furthest}`}
        language={language}
        signInHref={signIn}
        trackLanguages={trackContent.languages}
        unitId={unit.id}
        unitTitle={say(unit.titles, language)}
        requested={requestedStep}
        track={track}
      />
    );
  }

  return (
    <FrameView
      // ADR-0063 — the gate's own cursor, so the program map can lock what it would refuse.
      // An older API sends none, and the map then links every section and lets the gate answer.
      furthest={stepOutcome.data.furthest ?? undefined}
      hasNext={requestedStep < unit.stepCount}
      language={language}
      previousUnitId={previousProgramId(trackContent, unit.id)}
      sections={unit.sections}
      step={stepOutcome.data.step}
      stepCount={unit.stepCount}
      tag={trackContent.tag}
      track={track}
      trackLanguages={trackContent.languages}
      unitId={unit.id}
      unitTitles={unit.titles}
    />
  );
}
