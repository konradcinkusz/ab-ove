import { ProgramGrid } from '@/components/programs/program-grid';
import { allBundles } from '@/lib/content/bundle';
import { chosenEdition } from '@/lib/content/chosen-edition';
import { chosenTrack, shownBundles } from '@/lib/content/chosen-track';

/**
 * The landing page, which is the index (ADR-0036).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT STILL MAKES NO FETCH, READS NO COOKIE AND NEEDS NO BACKEND.
 *
 * That was the old landing page's first property and it is this one's, for the same reason:
 * the reader loop is required to work with no account and no backend (ADR-0004), and a
 * first screen that could not render without an API would break the requirement before the
 * reader reached anything. `allBundles()` reads content compiled into the app. What changed
 * is what the page is made of, not what it depends on.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS RENDERED PER REQUEST RATHER THAN PRERENDERED, AND THAT COST IS NAMED HERE.
 *
 * `searchParams` is a request-time API in Next 16, so reading the chosen edition opts this
 * page into dynamic rendering. What that gives up is the old `/read`'s incidental guarantee
 * that a bundle which fails to validate FAILS THE BUILD rather than reaching a reader.
 *
 * The guarantee is not lost, it has moved somewhere better: `lib/content/bundle.test.ts`
 * asserts that the pinned bundle validates and that `allBundles()` returns one per pin, and
 * `pnpm --dir web test` runs in CI on every pull request. A unit test holds that property
 * whatever this page's rendering mode is, where the prerender held it only for as long as
 * nobody added a query parameter — which is exactly what happened.
 *
 * `allBundles()` still throws on an invalid bundle, and an index that quietly omitted a
 * program would tell the reader it does not exist. Loud either way (ADR-0014).
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

  /*
    `lang` is read here and validated in one place. Everything that is not an edition the
    content actually has — absent, repeated, unknown, empty — comes back `undefined`, which
    is the index that picks neither rather than an error: a typo in a query string is a
    reader's slip, and ADR-0015's whole point is that the tidy response to it would be a
    default nobody chose. `track` collapses the same way, for the same reason.
  */
  const chosen = chosenEdition(shownBundles(bundles, track), asked['lang']);

  return <ProgramGrid bundles={bundles} chosen={chosen} chosenTrack={track} />;
}
