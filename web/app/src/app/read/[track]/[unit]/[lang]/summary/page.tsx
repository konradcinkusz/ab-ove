import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { say } from '@ab-ovo/web-kit';

import { NotReached } from '@/components/read/not-reached';
import { ProgramSummary } from '@/components/read/program-summary';
import { chromeFor } from '@/lib/i18n/chrome';
import { contentUnavailable } from '@/lib/read/render-failure';
import { fetchReturnIndex } from '@/lib/server/content';
import { resolveProgram } from '@/lib/server/program';
import { readerIdentity } from '@/lib/server/reader-identity';

/**
 * A program's return index — the Summary and the outcomes — reached from its last frame.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * FROM `AbOvo.Api`, AND BEHIND THE LAST FRAME'S GATE — issue #158, ADR-0060.
 *
 * It read the compiled bundle until then and was reachable from its URL at any frame: three
 * frames into F01 it listed what the whole program concludes, where the MCP server shows the
 * same block only after the last step. The API serves the index now under the rule it serves
 * the last frame by (`Reveal.ServeReturnIndex`), so a reader short of that frame gets the
 * frame's own "Not there yet" (`not-reached.tsx`), and one who has reached it gets the page.
 * An API that does not answer is the error page a frame gets, whose way back is this
 * program's contents (`failedReading`).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The track and the unit are resolved once for the metadata and the page (`resolveProgram`,
 * which the contents page shares), and the gated index is asked for beside them rather than
 * after: none of the three calls needs another's answer. The programs either side are found
 * by ADJACENCY in the API's list (`neighboursOf`, inside the component), which is the order
 * the book's own manifest declares — never by parsing an id like `F01` and adding one.
 */
interface RouteParams {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const resolved = await resolveProgram(resolvedParams.track, resolvedParams.unit, resolvedParams.lang);

  // In the address's edition, and nothing the server that did not answer would have said.
  if (resolved.kind === 'unavailable') {
    return { title: `${chromeFor(resolvedParams.lang).summaryHeading} — ab-ovo` };
  }
  // A 404 is titled as one, in the address's edition too (issue #166): the 404 page speaks it.
  if (resolved.kind === 'not-found') return { title: chromeFor(resolvedParams.lang).notFound.tabTitle };

  // In the reader's edition (issue #158: "Summary — …" and "The return index for …" were
  // English on the Polish page). The title names the program and not a word of its index,
  // so it says nothing the gate would withhold.
  const chrome = chromeFor(resolved.language);
  const unitTitle = say(resolved.unit.titles, resolved.language);
  return {
    title: `${chrome.summaryHeading} — ${unitTitle} — ab-ovo`,
    description: chrome.summaryDescription(unitTitle),
  };
}

export default async function ProgramSummaryPage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const resolvedParams = await params;
  // The gated call is the page's alone — the metadata names the program and nothing in its
  // index — and it is made beside `resolveProgram`, not after it.
  const [resolved, indexOutcome] = await Promise.all([
    resolveProgram(resolvedParams.track, resolvedParams.unit, resolvedParams.lang),
    readerIdentity().then((identity) =>
      fetchReturnIndex(resolvedParams.track, resolvedParams.unit, identity),
    ),
  ]);

  if (resolved.kind === 'unavailable') throw contentUnavailable(resolved.reason);
  if (indexOutcome.kind === 'unavailable') throw contentUnavailable(indexOutcome.reason);
  if (resolved.kind === 'not-found' || indexOutcome.kind === 'not-found') notFound();

  const { trackContent, unit, language } = resolved;
  const track = resolvedParams.track;
  const served = indexOutcome.data;

  if (!served.ok || !served.index) {
    const refusal = served.refusal;
    // `NoSuchStep` is a program with no last frame to reach, which a validated bundle cannot
    // be — a bad address rather than a gate a reader could satisfy.
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
        refused="summary"
        requested={refusal.requested}
        track={track}
        trackLanguages={trackContent.languages}
        unitId={unit.id}
        unitTitle={say(unit.titles, language)}
      />
    );
  }

  return (
    <ProgramSummary
      index={served.index}
      language={language}
      track={track}
      trackContent={trackContent}
      unit={unit}
    />
  );
}
