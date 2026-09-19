import { notFound } from 'next/navigation';

import { FrameBesideLab } from '@/components/read/frame-beside-lab';

import { resolveComposed, type ComposedRouteParams } from './resolve.ts';

/**
 * The frame and the lab pane, on one page — UI-UX.md phase 1, item 1.5.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT IS A LAYOUT, AND THE SEGMENT ORDER IS THE POINT.
 *
 * `/read/<track>/<unit>/<lang>/lab/<lab>/<step>` puts the lab ABOVE the step, so turning a
 * frame changes a segment below this file and Next keeps the layout mounted across the
 * navigation. That is what stops the pane being remounted on every reveal — and a remounted
 * pane is not a slower pane, it is a pane that has thrown away the file the reader was
 * typing into, which lab-pane.tsx calls the worst bug it could have.
 *
 * Put the lab below the step — `<step>/lab/<lab>`, which reads more naturally — and the
 * layout sits under a segment that changes, so it unmounts on every frame turn. Both URLs
 * render the same two components; only one of them is usable. specs/frame-and-lab.spec.ts
 * asserts the editor's contents survive a reveal rather than leaving that to a reading of
 * the router.
 *
 * WHAT THE COMPOSITION MAY NOT DO, and what shape keeps it from doing it: the frame arrives
 * as `children` — server-rendered, one step, by the page below — and is never reconstructed
 * here. This file holds no bundle, no step and no client boundary of its own. The answer to
 * the frame on screen is rendered by the request for the next step and by nothing before
 * it, exactly as on the plain reading route, and there is nothing in this file that could
 * reach for it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It is public on the same terms as everything it composes: `/read/` is in the middleware's
 * public-prefix list and so is `/lab/` for the worker and `/book/` and `/pyodide/` for the
 * bytes. No cookie is read here, no fetch is made, and nothing on this route needs a
 * backend — which is ADR-0004's reader-loop requirement applied to the one screen where
 * both halves of the loop are on the page at once.
 */
export default async function ComposedLabLayout({
  children,
  params,
}: {
  readonly children: React.ReactNode;
  readonly params: Promise<ComposedRouteParams>;
}): Promise<React.JSX.Element> {
  /*
   * Resolved HERE as well as in the page, and not as a belt-and-braces measure: a layout
   * renders around whatever the page produces, INCLUDING a 404. Without this an unknown
   * track or an unknown lab would render the not-found page with a lab pane beside it, for
   * a lab that does not exist. Refusing at the layout is what makes the 404 a 404.
   */
  const resolved = resolveComposed(await params);
  if (!resolved) notFound();

  return (
    <FrameBesideLab
      bundleTag={resolved.tag}
      lab={resolved.lab}
      language={resolved.language}
    >
      {children}
    </FrameBesideLab>
  );
}
