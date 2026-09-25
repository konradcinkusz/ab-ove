'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { FRAME_HEADING_ID } from './reading-focus.ts';

/** Nothing changes underneath this — the store below only tells hydration from a client render. */
const subscribeToNothing = (): (() => void) => () => undefined;
const onTheClient = (): boolean => true;
const onTheServer = (): boolean => false;

/**
 * A FRAME THAT ARRIVES BY A TURN OF THE PAGE TAKES FOCUS ON ITS HEADING (#159).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * FOCUS WAS LOST ON EVERY TURN, AND NOTHING SAID THE PAGE HAD TURNED. Measured before this, in
 * a production build: after a click on `Next` and after `→` alike, focus was on `<body>` — the
 * `Next` that had it is replaced with the rest of the screen — and nothing called `focus()` on
 * anything. The new frame was announced by nothing, and neither was the answer it opens with.
 *
 * So the heading takes it: the program's title and the position (`Numbers, powers and roots ·
 * 3 of 45`), which a screen reader reads as the new frame's name, described by the answer box
 * when the frame opens with one — so the book's answer is read with it (`frame-view.tsx`). It
 * is `tabIndex={-1}` and off the page, so a mouse reader sees nothing move, and the next Tab
 * goes into the new frame rather than back to the top of the document. The keys count it as
 * the page (`atRest`), so `→`, `←` and `Enter` go on working from it.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ONLY A FRAME THE ROUTER BROUGHT, NEVER ONE THE BROWSER LOADED. On a load — a deep link, a
 * reload — the document starts where every page starts, with the skip link first
 * (`skip-link.tsx`, WCAG 2.4.1), and a screen reader begins at the top by itself; moving focus
 * there would skip the one control a keyboard reader's first Tab is for. The difference is
 * hydration: while React hydrates server HTML, `useSyncExternalStore` answers with the server
 * snapshot, and a component the router renders on the client never hydrates. `useState` keeps
 * the first answer, because hydration's own second render says `true` too.
 *
 * Inside the frame's keyed `<article>`, so every frame mounts a new one and nothing here has to
 * notice a change of frame. A failed reveal renders no new frame (#138), so focus stays on
 * `Next`, beside the sentence saying why.
 */
export function FrameFocus(): null {
  const rendering = useSyncExternalStore(subscribeToNothing, onTheClient, onTheServer);
  const [byTheRouter] = useState(rendering);

  useEffect(() => {
    if (!byTheRouter) return;
    document.getElementById(FRAME_HEADING_ID)?.focus();
  }, [byTheRouter]);

  return null;
}
