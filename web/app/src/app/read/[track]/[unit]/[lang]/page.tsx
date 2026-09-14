import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProgramContents } from '@/components/read/program-contents';
import { bundleFor, languageIn, say, unitIn } from '@/lib/content/bundle';

/**
 * One program's contents, in one language.
 *
 * The three segments that address it are the first three of a frame's four, so a reader who
 * deletes `/12` off the end of a deep link arrives here rather than at a 404 — which is
 * what a reader does when they want to know where they are. The resolve-or-nothing shape is
 * the frame page's, for the same reason it gives: one function feeding both the metadata
 * and the page, so a title cannot come to describe a different program from the body.
 */
interface RouteParams {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
}

function resolve(params: RouteParams) {
  // Unknown track is a bad URL segment and therefore `undefined` → 404; a pinned bundle
  // that does not validate still throws → 500. See bundleFor for why those are not the
  // same failure.
  const bundle = bundleFor(params.track);
  if (!bundle) return undefined;

  const unit = unitIn(bundle, params.unit);
  const language = languageIn(bundle, params.lang);
  if (!unit || !language) return undefined;

  return { bundle, unit, language };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = resolve(await params);
  if (!resolved) return { title: 'Not found — ab-ovo' };

  const { bundle, unit, language } = resolved;
  return {
    title: `${say(unit.titles, language)} — ab-ovo`,
    // The frame count and nothing from a frame. A description is served to crawlers and to
    // link previews, and this product does not hand out questions in either.
    description: `${say(bundle.track.titles, language)} · ${unit.steps.length} frames.`,
  };
}

export default async function ProgramContentsPage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const resolved = resolve(await params);
  if (!resolved) notFound();

  return (
    <ProgramContents
      bundle={resolved.bundle}
      unit={resolved.unit}
      language={resolved.language}
    />
  );
}
