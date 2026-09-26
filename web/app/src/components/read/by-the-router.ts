'use client';

import { useState, useSyncExternalStore } from 'react';

/** Nothing changes underneath this — the store below only tells hydration from a client render. */
const subscribeToNothing = (): (() => void) => () => undefined;
const onTheClient = (): boolean => true;
const onTheServer = (): boolean => false;

/**
 * Whether this component was first rendered by the router, in the browser — `true` — or came
 * in the server's HTML and was hydrated — `false`. Kept for the component's life.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE TWO ARE DIFFERENT PAGES TO A READER, AND TWO ISLANDS ON THE FRAME HAVE TO KNOW WHICH.
 *
 * A frame the router brings — `Next`, `→`, `←` — is rendered in the browser, where
 * `localStorage` can be read before the first paint. A frame the browser loaded — a deep link,
 * a reload — was painted from the server's HTML first, by a server that has no reader, and
 * only then hydrated. `frame-focus.tsx` moves focus only for the first (#159), and
 * `previous-work.tsx` holds a row's space only for the second (#168), because only there can
 * what it shows arrive after the paint.
 *
 * HOW IT TELLS. While React hydrates server HTML, `useSyncExternalStore` answers with the
 * server snapshot, and a component the router renders on the client never hydrates.
 * `useState` keeps the first answer, because hydration's own second render says `true` too.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */
export function useByTheRouter(): boolean {
  const rendering = useSyncExternalStore(subscribeToNothing, onTheClient, onTheServer);
  const [byTheRouter] = useState(rendering);
  return byTheRouter;
}
