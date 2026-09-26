import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { say } from '@ab-ovo/web-kit';

import { ProgramContents } from '@/components/read/program-contents';
import { chromeFor } from '@/lib/i18n/chrome';
import { contentUnavailable } from '@/lib/read/render-failure';
import { resolveProgram } from '@/lib/server/program';
import { readerEdition } from '@/lib/server/reader-edition';

/**
 * One program's contents, in one language.
 *
 * The three segments that address it are the first three of a frame's four, so a reader who
 * deletes `/12` off the end of a deep link arrives here rather than at a 404 — which is
 * what a reader does when they want to know where they are.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * FROM `AbOvo.Api`, AS A FRAME IS — issue #158, ADR-0060.
 *
 * It and the summary read the bundle compiled into the app until then, so both rendered with
 * the API stopped — every heading on this one a link into a frame that then answered 500. It
 * asks the API for the track and the unit now, as the reader
 * (`resolveProgram`), so the unit comes back with this reader's furthest frame and the page
 * can lock what the gate would refuse; and an API that does not answer is the error page a
 * frame gets, marked as that failure, before the reader has clicked into anything
 * (`contentUnavailable`, issue #139). One function feeds both the metadata and the page, so a
 * title cannot come to describe a different program from the body.
 * ──────────────────────────────────────────────────────────────────────────────────────
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

  // The server did not answer, so the title names the page in the address's edition and
  // nothing the server would have said (the frame page's rule, issue #139).
  if (resolved.kind === 'unavailable') {
    return { title: `${chromeFor(resolvedParams.lang).contents} — ab-ovo` };
  }
  // A 404 is titled as one, in the edition its page speaks (issue #166): the address's, else
  // the one this browser remembers — `NotFoundPage`'s rule, so an edition the course is not
  // published in does not put an English tab over a Polish page.
  if (resolved.kind === 'not-found') {
    return { title: chromeFor(await readerEdition(resolvedParams.lang)).notFound.tabTitle };
  }

  const { trackContent, unit, language } = resolved;
  const chrome = chromeFor(language);
  const trackTitle = trackContent.titles?.[language];
  return {
    title: `${say(unit.titles, language)} — ab-ovo`,
    // The frame count and nothing from a frame, in the reader's edition (issue #158: it was
    // "N frames." in English on the Polish page). A description is served to crawlers and to
    // link previews, and this product does not hand out questions in either.
    description: `${trackTitle ? `${trackTitle} · ` : ''}${chrome.frames(unit.stepCount)}.`,
  };
}

export default async function ProgramContentsPage({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<React.JSX.Element> {
  const resolvedParams = await params;
  const resolved = await resolveProgram(resolvedParams.track, resolvedParams.unit, resolvedParams.lang);

  // Caught by `app/error.tsx`, which says the book's server did not answer and offers the
  // programs — the contents are this page, so they are not the way back from it
  // (`failedReading`).
  if (resolved.kind === 'unavailable') throw contentUnavailable(resolved.reason);
  if (resolved.kind === 'not-found') notFound();

  return (
    <ProgramContents
      language={resolved.language}
      track={resolvedParams.track}
      trackContent={resolved.trackContent}
      unit={resolved.unit}
    />
  );
}
