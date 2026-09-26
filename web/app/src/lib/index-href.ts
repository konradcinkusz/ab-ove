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
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A LINK TO ANY OF THESE PAGES IS `prefetch={false}` (ADR-0067), WHOEVER BUILT ITS HREF.
 *
 * The index, `/courses` and `/about` title their tab in the reader's edition, and Next keeps
 * the head it prefetched for a path and serves it for that path whatever the query or the
 * remembered edition says by the time a link to it is followed. So a prefetch made before a
 * reader changed edition titled the page in the edition they had just left — measured on
 * 2026-09-26: the index in English, *polski* pressed, *O ab-ovo* followed, and the Polish page
 * titled "About — ab-ovo", which since ADR-0067 is read out in a Polish voice. A prefetch made
 * by ANY link to the path does it, the language control's own press included, so the rule is
 * every link and not the ones beside the control. It costs nothing a reader waits for: these
 * pages are rendered per request, and the press asks the server for the page whatever was
 * prefetched (the language control's reason for the same attribute, #160) — the head was all
 * a prefetch kept, and it was the part that went stale.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export interface IndexChoices {
  /** The track id the reader narrowed to, or `undefined` for every course. */
  readonly track?: string | undefined;
  /** The edition the reader chose, or `undefined` for the index that picks neither. */
  readonly edition?: string | undefined;
  /**
   * The program the reader was turned away from, when this address is the gate sending them
   * back (ADR-0051, `program-gate.tsx`).
   *
   * ──────────────────────────────────────────────────────────────────────────────────────
   * NOT A CHOICE LIKE THE OTHER TWO, AND IN THE URL FOR A DIFFERENT REASON.
   *
   * `track` and `edition` are in the address so a reader can see, share and leave them. This
   * is here because the reason for a navigation has to SURVIVE the navigation, and the
   * alternatives were worse: a module-level variable is state two tabs would share and a
   * reload would keep, and `sessionStorage` is state nothing clears. A query parameter is
   * carried by the one thing that is already being replaced, is visible to the reader it is
   * about, and is gone the moment they go anywhere else.
   *
   * IT IS A CLAIM THE PAGE RE-CHECKS, never one it prints. Anyone can type `?shut=F01`, and
   * a reader who opened the program in another tab meanwhile has a record that says
   * otherwise — so `shut-notice.tsx` asks the gate again against the reader's own record and
   * renders nothing when the answer is "open". The parameter says which program to ask
   * about; it never says what the answer is.
   * ──────────────────────────────────────────────────────────────────────────────────────
   */
  readonly shut?: string | undefined;
}

export function indexHref({ track, edition, shut }: IndexChoices = {}): string {
  const query = new URLSearchParams();
  if (track) query.set('track', track);
  if (edition) query.set('lang', edition);
  if (shut) query.set('shut', shut);
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

/**
 * And for `/about`, which follows the reader's edition as well since issue #166 — the
 * index's *O ab-ovo* used to open the English page, because this link carried nothing.
 */
export function aboutHref(edition: string | undefined): string {
  const query = new URLSearchParams();
  if (edition) query.set('lang', edition);
  const search = query.toString();
  return search ? `/about?${search}` : '/about';
}
