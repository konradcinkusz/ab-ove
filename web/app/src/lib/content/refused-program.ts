import { unitBefore, type Bundle } from '@ab-ovo/web-kit';

/**
 * The program the gate turned this reader away from, resolved against the book.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `?shut=<unit>` IS A QUESTION THE INDEX ASKS THE MANIFEST, NOT AN ANSWER IT PRINTS.
 *
 * `program-gate.tsx` puts it in the address so the reason for a navigation survives the
 * navigation (`lib/index-href.ts` says why it is the URL and not state). Two things have
 * to happen before it becomes a sentence, and they happen in two different places:
 *
 *   here          is `<unit>` a program this deployment actually serves, and if so, which
 *                 program does the book put before it?
 *   `ShutNotice`  does this reader's own record still say it is shut?
 *
 * Splitting them that way is what keeps the second question honest. The manifest is the
 * server's to answer and the record is the browser's, and a page that answered both from
 * the query string would be a page telling a reader they cannot enter a program they may
 * have opened in the next tab.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERYTHING UNRECOGNISED IS `undefined`, WHICH IS AN ORDINARY INDEX. Absent, repeated,
 * empty, a program no pinned course has, a program from a course that is not on screen —
 * each is somebody typing in the address bar, and `chosenTrack`'s own stance applies: a
 * typo in a query string is a reader's slip and not an error page. A repeat is refused
 * rather than resolved to its first element, for the reason `chosenTrack` gives about
 * `?track=a&track=b`: a request with two answers in it has none.
 *
 * `previous` is `undefined` ONLY for the first program of a track, which the gate never
 * refuses (`@ab-ovo/web-kit`'s `gate.ts`) — so the notice has nothing to explain and
 * renders nothing. It is carried rather than asserted away, because the alternative is a
 * `!` on a value read out of a URL.
 */
export interface RefusedProgram {
  readonly track: string;
  readonly unit: string;
  readonly previous: string | undefined;
}

export function refusedProgram(
  bundles: readonly Bundle[],
  raw: string | readonly string[] | undefined,
): RefusedProgram | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;

  for (const bundle of bundles) {
    const found = bundle.units.find((unit) => unit.id === raw);
    if (!found) continue;
    return {
      track: bundle.track.id,
      unit: found.id,
      previous: unitBefore(bundle, found.id)?.id,
    };
  }

  return undefined;
}
