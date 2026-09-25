import { cache } from 'react';

import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { say } from '@ab-ovo/web-kit';

import { FrameView } from '@/components/read/frame-view';
import { NotReached } from '@/components/read/not-reached';
import { chromeFor } from '@/lib/i18n/chrome';
import { contentUnavailable } from '@/lib/read/render-failure';
import { READER_ID_COOKIE } from '@/lib/reader-cookie';
import { fetchFrame, type FrameOutcome } from '@/lib/server/frame';
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

/**
 * The frame at this address — the track, the program and the gated step, asked for together
 * (`lib/server/frame.ts`, issue #160) — shared by the page and `generateMetadata`, so the
 * title can never describe a different program from the body.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * ONE SET OF CALLS PER REQUEST, AND THE KEY IS FOUR STRINGS, NOT THE ROUTE'S PARAMS OBJECT.
 *
 * Next runs `generateMetadata` and the page as separate calls within one request, and
 * `cache()` is React's request-scoped memo that makes two such calls one. It compares its
 * arguments by identity, though, and the two callers are handed two different params
 * objects — so the version of this that took `params` whole never once hit its cache.
 * Measured on 2026-09-25 through a pass-through that held every call to `AbOvo.Api` 300 ms:
 * one frame cost FIVE calls in THREE rounds — the track twice, then the program twice, then
 * the step — about 930 ms before anything could render. The same measurement now shows three
 * calls leaving together and back in about 310 ms. Strings compare by value, so the four
 * segments are the key, and anything added to it must be a primitive for the same reason.
 *
 * `generateMetadata` waits on the step's call too, and it is not a second call: it is the
 * page's, shared. Nothing of the step reaches the title, which is built from the program's
 * name and count alone, as it always was.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */
const frameAt = cache(
  async (track: string, unit: string, lang: string, step: string): Promise<FrameOutcome> => {
    const store = await cookies();
    return fetchFrame(
      { track, unit, lang, step },
      {
        bearer: store.get(ACCESS_TOKEN_COOKIE)?.value,
        readerId: store.get(READER_ID_COOKIE)?.value,
      },
    );
  },
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
  const frame = await frameAt(track, unit, lang, segment);
  const step = Number(segment);
  const numbered = Number.isInteger(step) && step >= 1;

  /*
   * THE SERVER DID NOT ANSWER, SO NOTHING IS KNOWN ABOUT THIS ADDRESS — and the title says
   * nothing it does not know (issue #139). It used to fall in with `not-found` and read
   * "Not found" over a page saying the book's server had not answered, which was a claim
   * about the address nobody had checked. The frame number is the reader's own, so it is
   * safe to repeat, in the edition the address asks for (English where there are no words
   * for it); the program's title came from the server that did not answer, so it is not.
   */
  if (frame.kind === 'unavailable') {
    return { title: numbered ? `${chromeFor(lang).frameNumbered(step)} — ab-ovo` : 'ab-ovo' };
  }
  if (frame.kind === 'not-found' || frame.n > frame.unit.stepCount) {
    return { title: 'Not found — ab-ovo' };
  }

  const chrome = chromeFor(frame.language);
  return {
    title: `${chrome.frameNumbered(frame.n)} — ${say(frame.unit.titles, frame.language)} — ab-ovo`,
    // Deliberately not the body: a description is served to crawlers and to link previews,
    // and a frame's body is the question. The answer is already structurally absent; the
    // question does not need to be handed out either.
    description: `${chrome.frameNumbered(frame.n)} ${chrome.ofTotal(frame.unit.stepCount)}.`,
  };
}

export default async function FramePage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const { track, unit: unitId, lang, step: segment } = await params;
  const frame = await frameAt(track, unitId, lang, segment);

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
    return (
      <NotReached
        chrome={chrome}
        contentsHref={reading}
        furthest={refusal.furthest}
        furthestHref={`${reading}/${refusal.furthest}`}
        language={language}
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
