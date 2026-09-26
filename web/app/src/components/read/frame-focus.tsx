'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { FRAME_HEADING_ID } from './reading-focus.ts';

/** Nothing changes underneath this — the store below only tells hydration from a client render. */
const subscribeToNothing = (): (() => void) => () => undefined;
const onTheClient = (): boolean => true;
const onTheServer = (): boolean => false;

/**
 * Next's route announcer: the element `app-router-announcer.js` appends to `<body>`, whose
 * open shadow root holds the region it writes each new page's title into.
 */
const ROUTE_ANNOUNCER = 'next-route-announcer';

/**
 * How long focus waits after the router's announcement, or after the frame's arrival when the
 * router says nothing: Chromium's interval between two accessibility updates — 150 ms once the
 * document has loaded, 350 ms while it is still loading (`GetDeferredEventsDelay`, which asks
 * `readyState`) — and a frame and some margin for the update that carries the announcement to
 * go out (the header says why).
 */
const afterTheAnnouncementMs = (): number => (document.readyState === 'complete' ? 200 : 400);

/**
 * A FRAME THAT ARRIVES BY A TURN OF THE PAGE TAKES FOCUS ON ITS HEADING (#159) — AFTER THE
 * ROUTER HAS STARTED SAYING THE PAGE'S TITLE, AND NEVER BESIDE IT.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * FOCUS WAS LOST ON EVERY TURN, AND THE ANSWER WENT UNSAID. Measured before this, in a
 * production build: after a click on `Next` and after `→` alike, focus was on `<body>` — the
 * `Next` that had it is replaced with the rest of the screen — and nothing called `focus()` on
 * anything. What a screen reader was given was the router's announcement below: the new page's
 * title, `Frame 4 — Numbers, powers and roots — ab-ovo`. Nothing read the answer the frame
 * opens with, which is what the turn was for.
 *
 * So the heading takes focus: the program's title and the position (`Numbers, powers and roots
 * · 3 of 45`), which a screen reader reads as the new frame's name, described by the answer box
 * when the frame opens with one — so the book's answer is read with it (`frame-view.tsx`). It
 * is `tabIndex={-1}` and off the page, so a mouse reader sees nothing move, and the next Tab
 * goes into the new frame rather than back to the top of the document. The keys count it as
 * the page (`atRest`), so `→`, `←` and `Enter` go on working from it.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * AND IT TAKES IT LAST, BECAUSE THE ROUTER SPEAKS ON EVERY TURN TOO, AND ASSERTIVELY.
 *
 * Next's App Router announces each client navigation itself: `<next-route-announcer>` holds a
 * `role="alert"`, `aria-live="assertive"` region, and on every navigation it writes the new
 * `document.title` into it — or the first `<h1>`'s text, this heading's, while the title is
 * still empty (`next/dist/client/components/app-router-announcer.js`). Measured on this page
 * while focus was moved here at once: the region changed a few milliseconds AFTER the heading
 * took focus, on every turn, by `Next`, `→` and `←`.
 *
 * WHICH COMES FIRST IN THE DOM IS NOT WHAT A SCREEN READER HEARS FIRST. Chromium's renderer
 * sends a page's accessibility changes to the browser process, which is what a screen reader
 * talks to, at most once every 150 ms after the page has loaded (350 ms before) — except that a
 * change of focus goes at once, and takes everything waiting with it
 * (`third_party/blink/renderer/modules/accessibility/ax_object_cache_impl.cc`). Within one
 * update the browser process fires the focus before any other change that is not on the
 * focused element's ancestors, the announcer's among them
 * (`ui/accessibility/platform/browser_accessibility_manager.cc`; both read at Chromium 141, the
 * suite's). So a focus a few milliseconds either side of the announcement reaches the screen
 * reader FIRST and the alert after it, and an assertive alert may cut into what is being said:
 * the heading, and the answer with it.
 *
 * So focus waits until the announcement has gone out in an update of its own:
 * `afterTheAnnouncementMs` after the announcer's region last changed, or after the frame
 * arrived when it does not change (a title that stayed the same, or an announcement made before
 * this mounted). The screen reader starts on the title, and the focus — which screen readers
 * generally speak over whatever they were saying — brings the heading and the answer last. No
 * screen reader was run here: what is measured is the order and the interval the page makes the
 * two changes at (`specs/reading-loop.spec.ts`), and Chromium's code is what says how they leave
 * it.
 *
 * A READER WHO MOVES DURING THE WAIT KEEPS WHERE THEY WENT — a Tab, a click in the answer line,
 * `Enter`, which puts the caret there (`frame-keys.tsx`). Focus is moved only if it is still
 * where the frame's arrival left it, which is `<body>`: the element that had it went with the
 * frame before.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ONLY A FRAME THE ROUTER BROUGHT, NEVER ONE THE BROWSER LOADED. On a load — a deep link, a
 * reload — the document starts where every page starts, with the skip link first
 * (`skip-link.tsx`, WCAG 2.4.1), and a screen reader begins at the top by itself; moving focus
 * there would skip the one control a keyboard reader's first Tab is for. The difference is
 * hydration: while React hydrates server HTML, `useSyncExternalStore` answers with the server
 * snapshot, and a component the router renders on the client never hydrates. `useState` keeps
 * the first answer, because hydration's own second render says `true` too. (The router says
 * nothing on a load either: the announcer skips the first title, which a screen reader reads on
 * a load by itself.)
 *
 * Inside the frame's keyed `<article>`, so every frame mounts a new one and nothing here has to
 * notice a change of frame; a turn made while one waits unmounts it, and only the frame the
 * reader stops on takes focus. A failed reveal renders no new frame (#138), so focus stays on
 * `Next`, beside the sentence saying why.
 */
export function FrameFocus(): null {
  const rendering = useSyncExternalStore(subscribeToNothing, onTheClient, onTheServer);
  const [byTheRouter] = useState(rendering);

  useEffect(() => {
    if (!byTheRouter) return;
    const leftOn = document.activeElement;
    let timer: number | undefined;

    const land = (): void => {
      announced.disconnect();
      if (document.activeElement === leftOn) document.getElementById(FRAME_HEADING_ID)?.focus();
    };
    const wait = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(land, afterTheAnnouncementMs());
    };
    // Every change to what the router says starts the wait again.
    const announced = new MutationObserver(wait);

    wait();
    const region = document.querySelector(ROUTE_ANNOUNCER)?.shadowRoot;
    if (region) announced.observe(region, { characterData: true, childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      announced.disconnect();
    };
  }, [byTheRouter]);

  return null;
}
