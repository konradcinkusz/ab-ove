import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { FrameView } from '@/components/read/frame-view';
import { bundleFor, languageIn, say, stepIn, unitIn } from '@/lib/content/bundle';

/**
 * One frame of one program, in one language.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A SERVER COMPONENT THAT SENDS ONE STEP, WHICH IS WHAT MAKES THE ANSWER ABSENT.
 *
 * The reveal is a navigation to `n + 1`, so the answer to step `n` is rendered by the
 * request for step `n + 1` and by nothing before it. That property lives in the route's
 * shape rather than in a component's discipline: there is no client state holding the next
 * step, so no refactor can lose it and no `hidden` attribute is standing between a reader
 * and the thing they have not earned yet (issue #4; ADR-0014).
 *
 * The URL is the position — track, unit, language, step — so it survives a reload with no
 * session, which is the reader-loop-needs-no-account requirement of ADR-0004 applied to a
 * deep link. `/read/` is already in the middleware's public-prefix list.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
interface RouteParams {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
  readonly step: string;
}

/**
 * Resolve the four segments, or nothing.
 *
 * One function for the page and the metadata, because two copies of this would be two
 * chances for the title to describe a different frame from the body — and the one that is
 * wrong is the one nobody looks at.
 */
function resolve(params: RouteParams) {
  // An unknown track is a bad URL segment, so this is `undefined` rather than a throw —
  // see bundleFor. A bundle that fails to validate still throws, and still should.
  const bundle = bundleFor(params.track);
  if (!bundle) return undefined;

  const unit = unitIn(bundle, params.unit);
  const language = languageIn(bundle, params.lang);
  if (!unit || !language) return undefined;

  // Number(), not parseInt(): parseInt('3frames') is 3, and a URL segment that is not a
  // number should 404 rather than quietly become one. stepIn refuses anything non-integer.
  const step = stepIn(unit, Number(params.step));
  if (!step) return undefined;

  return { bundle, unit, language, step, next: stepIn(unit, step.n + 1) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = resolve(await params);
  if (!resolved) return { title: 'Not found — ab-ovo' };

  const { unit, step, language } = resolved;
  return {
    title: `Frame ${step.n} — ${say(unit.titles, language)} — ab-ovo`,
    // Deliberately not the body: a description is served to crawlers and to link previews,
    // and a frame's body is the question. The answer is already structurally absent; the
    // question does not need to be handed out either.
    description: `Frame ${step.n} of ${unit.steps.length}.`,
  };
}

export default async function FramePage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const raw = await params;
  const resolved = resolve(raw);
  if (!resolved) notFound();

  return (
    <FrameView
      track={raw.track}
      unit={resolved.unit}
      step={resolved.step}
      language={resolved.language}
      next={resolved.next}
    />
  );
}
