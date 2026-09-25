import { cookies } from 'next/headers';

import { allBundles } from '@ab-ovo/web-kit';

import { ProgramGrid } from '@/components/programs/program-grid';
import { chosenEdition } from '@/lib/content/chosen-edition';
import { chosenTrack, shownBundles } from '@/lib/content/chosen-track';
import { refusedProgram } from '@/lib/content/refused-program';
import { LANGUAGE_COOKIE, isLanguageTag } from '@/lib/language/store';

/**
 * The landing page, which is the index (ADR-0036).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT STILL CALLS NO API WHILE RENDERING, AND THAT IS NOW A CHOICE RATHER THAN A REQUIREMENT.
 *
 * It was the old landing page's first property, and the reason was a requirement that joined
 * two halves: the reader loop would need no account and no server (ADR-0004). ADR-0060 kept
 * the first half and reversed the second — every frame and every reveal is a live, gated
 * call to `AbOvo.Api` (`lib/server/content.ts`) — so the frame a tile leads to needs the API
 * and this page does not. `allBundles()` reads the bundle compiled into the app, which means
 * a reader who arrives while the API is down still sees the programs, and the frame they open
 * is the page that says the fault is on this side. Whether the index stays off the API is
 * issue #158's (580 in `docs/ux/UI-UX.md`'s order) to decide. It does read a COOKIE, which
 * is this origin's own and costs no request — see below.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS RENDERED PER REQUEST RATHER THAN PRERENDERED, AND THAT COST IS NAMED HERE.
 *
 * `searchParams` and `cookies()` are both request-time APIs in Next 16, so reading the
 * chosen edition opts this page into dynamic rendering. What that gives up is the old
 * `/read`'s incidental guarantee that a bundle which fails to validate FAILS THE BUILD
 * rather than reaching a reader.
 *
 * The guarantee is not lost, it has moved somewhere better: `@ab-ovo/web-kit`'s `bundle.test.ts`
 * asserts that the pinned bundle validates and that `allBundles()` returns one per pin, and
 * `pnpm --dir web test` runs in CI on every pull request. A unit test holds that property
 * whatever this page's rendering mode is, where the prerender held it only for as long as
 * nobody added a query parameter — which is exactly what happened.
 *
 * `allBundles()` still throws on an invalid bundle, and an index that quietly omitted a
 * program would tell the reader it does not exist. Loud either way (ADR-0014).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THE EDITION IS READ FROM A COOKIE HERE AND FROM `localStorage` EVERYWHERE ELSE.
 *
 * This is the one screen with no language in its URL, and it is nothing but titles. A
 * reader who chose Polish months ago would otherwise get an English index on the first
 * paint and a Polish one a moment later when script caught up — a flash of the wrong book,
 * on the screen where it is most visible. The cookie is the same answer in the one form a
 * server can read (ADR-0052; `lib/language/store.ts` has the argument), so the first paint
 * is already right and nothing corrects it afterwards.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const bundles = allBundles();
  const asked = await searchParams;

  /*
    THE BOOK FIRST, THEN THE EDITION, AND THE ORDER IS THE POINT (ADR-0048).

    `?track=` narrows the page to one book and `?lang=` narrows it to one edition, and the
    editions on offer are a property of the books ON SCREEN — so the edition is resolved
    against the narrowed set. Asking for `?track=x&lang=pl` where x is English-only is then
    the same answer as every other unusable value: no edition chosen, every edition x has.
    Resolved the other way round, that request would light a switch position whose page is
    empty.
  */
  const track = chosenTrack(bundles, asked['track']);

  const remembered = (await cookies()).get(LANGUAGE_COOKIE)?.value;

  /*
    One resolution, in one place. A URL that names an edition wins, because a link somebody
    was sent has to open the page it names; below that what this browser remembers; below
    that English. Anything that is not an edition the content has — absent, repeated,
    unknown, empty, a cookie somebody edited — falls through to the next step rather than
    erroring, because a typo in a query string is a reader's slip and not a 404.

    RESOLVED AGAINST THE COURSES ON SCREEN, which is the clause the narrowing added: the
    editions on offer are a property of the books being shown, so a reader on an
    English-only course does not get a Polish position that leads nowhere — they get that
    course's own first edition, which is the last step of `resolvedEdition`'s ladder. The
    remembered answer goes through the same gate as the URL and falls through the same way,
    so a preference for an edition this course does not publish is not an error either.
  */
  const chosen = chosenEdition(
    shownBundles(bundles, track),
    asked['lang'],
    isLanguageTag(remembered) ? remembered : undefined,
  );

  /*
    WHY THIS PAGE, WHEN THE READER ASKED FOR A PROGRAM THAT IS NOT OPEN YET.

    `?shut=<unit>` arrives from `program-gate.tsx`, which is the only thing that writes it,
    and is resolved against the book HERE — the manifest is the server's to read, and the
    question it answers is "is this a program at all, and what precedes it". Whether the
    reader may enter it is a question about their own record and is asked in the browser,
    which is the split `refused-program.ts` exists to keep.

    Against the courses ON SCREEN, like the edition above it: a notice about a program of a
    course this page has been narrowed away from would point at a tile that is not here.
  */
  const shut = refusedProgram(shownBundles(bundles, track), asked['shut']);

  return <ProgramGrid bundles={bundles} chosen={chosen} chosenTrack={track} shut={shut} />;
}
