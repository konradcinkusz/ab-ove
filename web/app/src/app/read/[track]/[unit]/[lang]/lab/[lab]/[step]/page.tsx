import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { FrameView } from '@/components/read/frame-view';
import { say, stepIn } from '@/lib/content/bundle';

import {
  composedBase,
  resolveComposed,
  type ComposedRouteParams,
} from '../resolve.ts';

/**
 * One frame of one program, in one language, with a lab open beside it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SAME SERVER COMPONENT, SENDING THE SAME ONE STEP.
 *
 * This page renders exactly what `/read/<track>/<unit>/<lang>/<step>` renders and differs
 * from it in one prop: `baseFor`, which keeps the reveal, the back link, the keyboard
 * shortcut and the edition switch inside the composition instead of dropping the reader
 * back onto the plain route with their exercise file gone.
 *
 * Everything the plain route's own header claims is claimed here for the same reason and by
 * the same construction. There is no client boundary: the reveal is a navigation to
 * `n + 1`, so the answer to step `n` is rendered by the request for step `n + 1` and by
 * nothing before it, and `prefetch={false}` on that one link — `FrameView`'s, unchanged —
 * is what keeps the next step's payload off the wire until the reader has committed. The
 * pane beside it is a Client Component and is a SIBLING of this page rather than a wrapper
 * round it, so none of the step reaches its props.
 *
 * WHAT IS NOT HERE, deliberately: no link from a frame's own `check` to this route. Which
 * exercise a frame opens is #55's decision, and it needs an address to point at — this
 * one. A route that read `step.check` to decide what to show would have taken that decision
 * on the way past.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
interface RouteParams extends ComposedRouteParams {
  readonly step: string;
}

/**
 * Resolve all five segments, or nothing.
 *
 * One function for the page and the metadata, on the plain route's own reasoning: two
 * copies would be two chances for the title to describe a different frame from the body,
 * and the one that is wrong is the one nobody looks at.
 */
function resolve(params: RouteParams) {
  const composed = resolveComposed(params);
  if (!composed) return undefined;

  // Number(), not parseInt(): parseInt('3frames') is 3, and a URL segment that is not a
  // number should 404 rather than quietly become one. stepIn refuses anything non-integer.
  const step = stepIn(composed.unit, Number(params.step));
  if (!step) return undefined;

  return { ...composed, step, next: stepIn(composed.unit, step.n + 1) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = resolve(await params);
  if (!resolved) return { title: 'Not found — ab-ovo' };

  const { unit, step, language, lab } = resolved;
  return {
    title: `Frame ${step.n} — ${say(unit.titles, language)} — ${lab.program} lab — ab-ovo`,
    // The frame count and the lab, and nothing from a frame. A description is served to
    // crawlers and to link previews, and this product hands out neither its questions nor
    // its answers in either.
    description: `Frame ${step.n} of ${unit.steps.length}, with the ${lab.program} exercises open beside it.`,
  };
}

export default async function FrameWithLabPage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const resolved = resolve(await params);
  if (!resolved) notFound();

  return (
    <FrameView
      bundle={resolved.bundle}
      unit={resolved.unit}
      step={resolved.step}
      language={resolved.language}
      next={resolved.next}
      baseFor={composedBase(resolved.bundle.track.id, resolved.unit.id, resolved.lab.id)}
    />
  );
}
