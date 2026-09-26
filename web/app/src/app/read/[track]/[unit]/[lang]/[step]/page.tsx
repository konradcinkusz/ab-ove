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
import { backendConfigured } from '@/lib/server/backends';
import { fetchStep, fetchTrackContent, fetchUnitSummary } from '@/lib/server/content';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';
import type { TrackContent, UnitSummary } from '@/lib/content/wire';

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

type Resolved =
  | { readonly kind: 'ok'; readonly trackContent: TrackContent; readonly unit: UnitSummary; readonly language: string }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * The track and unit's navigation metadata, or why there is none — shared by the page and
 * `generateMetadata` so the title can never describe a different program from the body.
 *
 * Deliberately does NOT fetch the step: metadata needs only the unit's title and its step
 * count, both ungated, and fetching the gated step here would be a second network call this
 * function's only two callers do not both need (`generateMetadata` never renders the step).
 *
 * WRAPPED IN `cache()` SO ITS TWO CALLERS SHARE ONE PAIR OF REQUESTS, NOT TWO. Next.js runs
 * `generateMetadata` and the page component as separate calls within the same request, and
 * without this, "shared by both" meant "called by both" — `fetchTrackContent` and
 * `fetchUnitSummary` each ran twice per frame, real requests against `AbOvo.Api` doubled
 * for no reason either caller needed, on top of the one `fetchStep` call below and the
 * `postAdvance` a reveal already made (`reveal.ts`). Measured directly: the API's own request
 * log showed every `GET /content/{track}` and `GET /content/{track}/{unit}` pair back to
 * back, every frame, in a suite whose one real end-to-end walk (`reading.spec.ts`) is exactly
 * the spec that turns "twice as many requests as necessary" into "enough extra load to make
 * an otherwise rare transient failure show up reliably". `cache()` is React's own answer to
 * this exact shape of problem — request-scoped memoization, reset between requests, so two
 * calls with the same arguments inside one render become one.
 */
const resolveUnit = cache(async (params: RouteParams): Promise<Resolved> => {
  const store = await cookies();
  const identity = {
    bearer: store.get(ACCESS_TOKEN_COOKIE)?.value,
    readerId: store.get(READER_ID_COOKIE)?.value,
  };

  const trackOutcome = await fetchTrackContent(params.track, identity);
  if (trackOutcome.kind === 'unavailable') return trackOutcome;
  if (trackOutcome.kind === 'not-found') return { kind: 'not-found' };

  const language = trackOutcome.data.languages.includes(params.lang) ? params.lang : undefined;
  if (!language) return { kind: 'not-found' };

  const unitOutcome = await fetchUnitSummary(params.track, params.unit, identity);
  if (unitOutcome.kind === 'unavailable') return unitOutcome;
  if (unitOutcome.kind === 'not-found') return { kind: 'not-found' };

  return { kind: 'ok', trackContent: trackOutcome.data, unit: unitOutcome.data, language };
});

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
  const resolvedParams = await params;
  const resolved = await resolveUnit(resolvedParams);
  const step = Number(resolvedParams.step);
  const numbered = Number.isInteger(step) && step >= 1;

  /*
   * THE SERVER DID NOT ANSWER, SO NOTHING IS KNOWN ABOUT THIS ADDRESS — and the title says
   * nothing it does not know (issue #139). It used to fall in with `not-found` and read
   * "Not found" over a page saying the book's server had not answered, which was a claim
   * about the address nobody had checked. The frame number is the reader's own, so it is
   * safe to repeat, in the edition the address asks for (English where there are no words
   * for it); the program's title came from the server that did not answer, so it is not.
   */
  if (resolved.kind === 'unavailable') {
    return { title: numbered ? `${chromeFor(resolvedParams.lang).frameNumbered(step)} — ab-ovo` : 'ab-ovo' };
  }
  if (resolved.kind === 'not-found' || !numbered || step > resolved.unit.stepCount) {
    return { title: 'Not found — ab-ovo' };
  }

  const chrome = chromeFor(resolved.language);
  return {
    title: `${chrome.frameNumbered(step)} — ${say(resolved.unit.titles, resolved.language)} — ab-ovo`,
    // Deliberately not the body: a description is served to crawlers and to link previews,
    // and a frame's body is the question. The answer is already structurally absent; the
    // question does not need to be handed out either.
    description: `${chrome.frameNumbered(step)} ${chrome.ofTotal(resolved.unit.stepCount)}.`,
  };
}

export default async function FramePage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const resolvedParams = await params;
  const resolved = await resolveUnit(resolvedParams);

  if (resolved.kind === 'unavailable') {
    // Caught by `app/error.tsx` — a deployment fault (the content API could not be
    // reached), never a reader's problem. `bundleFor`'s own doc comment drew this line
    // first: "nothing a reader typed can cause either and nothing a reader does can fix
    // it," carried from a missing file on disk to an unreachable service. The error is
    // MARKED as this failure, so that page can say so and not guess (issue #139).
    throw contentUnavailable(resolved.reason);
  }
  if (resolved.kind === 'not-found') notFound();

  const requestedStep = Number(resolvedParams.step);
  if (!Number.isInteger(requestedStep) || requestedStep < 1) notFound();

  const store = await cookies();
  const identity = {
    bearer: store.get(ACCESS_TOKEN_COOKIE)?.value,
    readerId: store.get(READER_ID_COOKIE)?.value,
  };

  const stepOutcome = await fetchStep(resolvedParams.track, resolvedParams.unit, requestedStep, identity);

  if (stepOutcome.kind === 'unavailable') {
    throw contentUnavailable(stepOutcome.reason);
  }
  if (stepOutcome.kind === 'not-found') notFound();

  const { unit, trackContent, language } = resolved;
  const track = resolvedParams.track;

  if (!stepOutcome.data.ok || !stepOutcome.data.step) {
    const refusal = stepOutcome.data.refusal;
    // `Reveal.Serve` refuses `NoSuchStep` for a step past the program's own end — a bad URL
    // segment, not a gate a reader could ever satisfy by reading further.
    if (!refusal || refusal.kind === 'NoSuchStep') notFound();

    const chrome = chromeFor(language);
    const reading = `/read/${track}/${unit.id}/${language}`;
    // Issue #157 — a reader with no session was gated on the anonymous cursor, and may have
    // read this frame signed in. Offered only where signing in exists (P8), and returning here.
    const signInHref =
      identity.bearer === undefined && backendConfigured('authservice')
        ? `/login?redirect=${encodeURIComponent(`${reading}/${requestedStep}`)}`
        : undefined;
    return (
      <NotReached
        chrome={chrome}
        contentsHref={reading}
        furthest={refusal.furthest}
        furthestHref={`${reading}/${refusal.furthest}`}
        language={language}
        signInHref={signInHref}
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
