import type { Metadata } from 'next';

import { CourseList } from '@/components/programs/course-list';
import { allBundles } from '@/lib/content/bundle';
import { chosenEdition } from '@/lib/content/chosen-edition';
import { FALLBACK_LANGUAGE, chromeFor } from '@/lib/i18n/chrome';

/**
 * The courses this deployment carries, and the way into each one (ADR-0048).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE INDEX'S SIBLING, AND IT KEEPS THE INDEX'S FIRST PROPERTY.
 *
 * No fetch, no cookie, no backend: `allBundles()` reads content compiled into the app, so
 * the page a reader uses to choose a course works under exactly the conditions the reader
 * loop is required to work under (ADR-0004). It is rendered per request for the reason the
 * index is — `searchParams` is a request-time API in Next 16 — and the property that
 * rendering mode gives up is held by `lib/content/bundle.test.ts` rather than by a build.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS ROUTE EXISTS RATHER THAN A SECOND SWITCH ON `/`. The index already carries the
 * edition switch, and a course is not the same size as an edition: it has a title in each
 * edition, a number of programs and a number of frames, and a reader choosing between two
 * of them is choosing between things a row of links cannot describe. `components/programs/
 * course-list.tsx` carries the rest of that reasoning.
 */
export async function generateMetadata({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  /*
    The document title follows the reader's edition, as every other word on this page does
    (ADR-0016). `/login` is English-only because it sits outside any edition and has none to
    follow; this page has the same `?lang=` the index has, so a Polish page with an English
    tab title would be this application disagreeing with itself in the one place a reader
    cannot see the disagreement.
  */
  const chosen = chosenEdition(allBundles(), (await searchParams)['lang']);
  return { title: `${chromeFor(chosen ?? FALLBACK_LANGUAGE).courses} — ab-ovo` };
}

export default async function CoursesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const bundles = allBundles();

  /*
    The edition, resolved against every course rather than against one: this page lists them
    all, so an edition any of them publishes is a choice a reader can make here. A course that
    is not published in it shows the titles it does have — `course-list.tsx` says why that is
    better than omitting the course or printing nothing.
  */
  const chosen = chosenEdition(bundles, (await searchParams)['lang']);

  return <CourseList bundles={bundles} chosen={chosen} />;
}
