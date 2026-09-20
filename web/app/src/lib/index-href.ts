/**
 * The address of the index, carrying whichever of the reader's two choices they have made.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE FUNCTION, BECAUSE THE INDEX NOW HAS TWO QUERY PARAMETERS AND FOUR CALLERS.
 *
 * `/` narrows by course (`?track=`) and by edition (`?lang=`), and both are in the URL rather
 * than in a cookie precisely so a reader can see, share and leave them (ADR-0015,
 * ADR-0036). That only holds if every link back to the index carries what the reader chose:
 * the edition switch, the *All courses* link, the courses page's own entries and the sign-in
 * return address all build one, and a hand-rolled template string in four places is four
 * chances to drop a parameter — which reads on the page as the reader's choice being
 * quietly undone rather than as a broken link.
 *
 * `URLSearchParams` does the encoding, so an identifier with a character that needs it
 * cannot produce a malformed href. The order is fixed — course, then edition — so two links
 * to the same page are the same string; a set that varied by construction order would give
 * the browser two history entries and `aria-current` two answers.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export interface IndexChoices {
  /** The track id the reader narrowed to, or `undefined` for every course. */
  readonly track?: string | undefined;
  /** The edition the reader chose, or `undefined` for the index that picks neither. */
  readonly edition?: string | undefined;
}

export function indexHref({ track, edition }: IndexChoices = {}): string {
  const query = new URLSearchParams();
  if (track) query.set('track', track);
  if (edition) query.set('lang', edition);
  const search = query.toString();
  return search ? `/?${search}` : '/';
}

/**
 * The same, for the courses page — which follows the reader's edition and knows nothing about
 * a chosen course, since it is the page that lists every one of them.
 */
export function coursesHref(edition: string | undefined): string {
  const query = new URLSearchParams();
  if (edition) query.set('lang', edition);
  const search = query.toString();
  return search ? `/courses?${search}` : '/courses';
}
