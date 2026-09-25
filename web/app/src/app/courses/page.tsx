import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { allBundles } from '@ab-ovo/web-kit';

import { CourseList } from '@/components/programs/course-list';
import { chosenEdition } from '@/lib/content/chosen-edition';
import { chromeFor } from '@/lib/i18n/chrome';
import { LANGUAGE_COOKIE, isLanguageTag } from '@/lib/language/store';

/**
 * The courses this deployment carries, and the way into each one (ADR-0048).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE INDEX'S SIBLING, AND IT KEEPS THE INDEX'S FIRST PROPERTY.
 *
 * No API call while rendering: `allBundles()` reads the bundle compiled into the app, so the
 * page a reader uses to choose a course renders with no account and with the API down, as the
 * index does. That is today's placement rather than a requirement — ADR-0060 made every
 * frame a live call to `AbOvo.Api`, and the pages that list the book have not moved yet — and
 * `app/page.tsx` carries the argument, and issue #158 (580 in `docs/ux/UI-UX.md`'s order)
 * the decision about whether it stays so. It is rendered per request for the reason the
 * index is — `searchParams` is a request-time API in Next 16 — and the property that
 * rendering mode gives up is held by `@ab-ovo/web-kit`'s `bundle.test.ts` rather than by a
 * build.
 *
 * It reads ONE cookie, this origin's own, for the index's reason (ADR-0052): this is a
 * screen with no language in its URL and nothing on it but titles, so without the remembered
 * edition the first paint would be English for a reader who chose Polish and would correct
 * itself a moment later.
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
  const remembered = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  const chosen = chosenEdition(
    allBundles(),
    (await searchParams)['lang'],
    isLanguageTag(remembered) ? remembered : undefined,
  );
  return { title: `${chromeFor(chosen).courses} — ab-ovo` };
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
    is not published in it shows the title it does have — `course-list.tsx` says why that is
    better than omitting the course or printing nothing.

    Always a language since ADR-0052: what the URL asks for, else what this browser
    remembers, else English.
  */
  const remembered = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  const chosen = chosenEdition(
    bundles,
    (await searchParams)['lang'],
    isLanguageTag(remembered) ? remembered : undefined,
  );

  return <CourseList bundles={bundles} chosen={chosen} />;
}
