import { cookies } from 'next/headers';

import { allBundles } from '@ab-ovo/web-kit';

import { chosenEdition } from '@/lib/content/chosen-edition';
import { LANGUAGE_COOKIE, isLanguageTag } from '@/lib/language/store';

/**
 * The edition a page around the book speaks — `/login`, its second step, `/register`,
 * `/about` and the 404 (issue #166), including the tab over a reading address's 404, whose
 * address may name an edition the course is not published in.
 *
 * What the address asks for, else what this browser remembers, else English: ADR-0052's
 * precedence, which `resolvedEdition` writes down once, resolved against the editions the
 * courses are published in — the index's and `/courses`' own call, so these pages and the
 * index cannot disagree about which edition a reader is in. The links into them carry
 * `?lang=`; the remembered edition is what answers for an address that carries nothing, such
 * as the gate's own bounce to `/login`, which is a redirect and not a link.
 *
 * It reads a cookie, which makes the page that calls it rendered per request. The sign-in
 * pages and the reading routes were already; what that cost `/about` and the 404 is measured
 * in ADR-0067.
 */
export async function readerEdition(asked: string | readonly string[] | undefined): Promise<string> {
  const remembered = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  return chosenEdition(allBundles(), asked, isLanguageTag(remembered) ? remembered : undefined);
}
