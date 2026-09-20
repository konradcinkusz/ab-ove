import { cookies } from 'next/headers';

import { ProgramGrid } from '@/components/programs/program-grid';
import { allBundles } from '@/lib/content/bundle';
import { chosenEdition } from '@/lib/content/chosen-edition';
import { LANGUAGE_COOKIE, isLanguageTag } from '@/lib/language/store';

/**
 * The landing page, which is the index (ADR-0036).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT STILL MAKES NO FETCH AND NEEDS NO BACKEND.
 *
 * That was the old landing page's first property and it is this one's, for the same reason:
 * the reader loop is required to work with no account and no backend (ADR-0004), and a first
 * screen that could not render without an API would break the requirement before the reader
 * reached anything. `allBundles()` reads content compiled into the app. It does now read a
 * COOKIE, which is this origin's own and costs no request — see below.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS RENDERED PER REQUEST RATHER THAN PRERENDERED, AND THAT COST IS NAMED HERE.
 *
 * `searchParams` and `cookies()` are both request-time APIs in Next 16, so reading the
 * chosen edition opts this page into dynamic rendering. What that gives up is the old
 * `/read`'s incidental guarantee that a bundle which fails to validate FAILS THE BUILD
 * rather than reaching a reader.
 *
 * The guarantee is not lost, it has moved somewhere better: `lib/content/bundle.test.ts`
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
 * server can read (ADR-0048; `lib/language/store.ts` has the argument), so the first paint
 * is already right and nothing corrects it afterwards.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const bundles = allBundles();

  const remembered = (await cookies()).get(LANGUAGE_COOKIE)?.value;

  /*
    One resolution, in one place. A URL that names an edition wins, because a link somebody
    was sent has to open the page it names; below that what this browser remembers; below
    that English. Anything that is not an edition the content has — absent, repeated,
    unknown, empty, a cookie somebody edited — falls through to the next step rather than
    erroring, because a typo in a query string is a reader's slip and not a 404.
  */
  const chosen = chosenEdition(
    bundles,
    (await searchParams)['lang'],
    isLanguageTag(remembered) ? remembered : undefined,
  );

  return <ProgramGrid bundles={bundles} chosen={chosen} />;
}
