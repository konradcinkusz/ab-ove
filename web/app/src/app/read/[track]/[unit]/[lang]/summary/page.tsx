import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProgramSummary } from '@/components/read/program-summary';
import { bundleFor, languageIn, say, unitIn } from '@/lib/content/bundle';

/**
 * A program's return index — the Summary and the outcomes — reached from its last frame.
 *
 * Same resolve-or-nothing shape as the contents page and the frame page: one function
 * feeding both the metadata and the body, so a title cannot come to describe a different
 * program from the one on screen. `nextUnit` is found by ADJACENCY in `bundle.units`,
 * which is the order the book's own manifest declares the programs in — the same order
 * `program-list.tsx` renders them — rather than by parsing an id like `F01` and adding one,
 * which breaks the moment a track's ids do not sort the way a reader would expect (P7,
 * inserted between P6 and P7 rather than after P34, is exactly this book's own history).
 */
interface RouteParams {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
}

function resolve(params: RouteParams) {
  const bundle = bundleFor(params.track);
  if (!bundle) return undefined;

  const unit = unitIn(bundle, params.unit);
  const language = languageIn(bundle, params.lang);
  if (!unit || !language) return undefined;

  const index = bundle.units.indexOf(unit);
  const nextUnit = bundle.units[index + 1];

  return { bundle, unit, language, nextUnit };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = resolve(await params);
  if (!resolved) return { title: 'Not found — ab-ovo' };

  const { unit, language } = resolved;
  return {
    title: `Summary — ${say(unit.titles, language)} — ab-ovo`,
    description: `The return index for ${say(unit.titles, language)}.`,
  };
}

export default async function ProgramSummaryPage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const resolved = resolve(await params);
  if (!resolved) notFound();

  return (
    <ProgramSummary
      bundle={resolved.bundle}
      language={resolved.language}
      nextUnit={resolved.nextUnit}
      unit={resolved.unit}
    />
  );
}
