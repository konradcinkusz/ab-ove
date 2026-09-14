'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export interface FrameKeysProps {
  /** `/read/<track>/<unit>/<lang>` — the path a frame number is appended to. */
  readonly base: string;
  /** How many steps this unit has, so the ends of the program are ends. */
  readonly last: number;
}

/**
 * One keystroke per frame, so a program can be read end to end without a mouse.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT RECEIVES A PATH AND AN INTEGER, AND THAT IS A SECURITY PROPERTY RATHER THAN A STYLE.
 *
 * This is the reading surface's only Client Component, and the props of a Client Component
 * are SERIALISED INTO THE DOCUMENT so the browser can hydrate them. Hand it the next step —
 * the obvious shape, and what every other component on this page takes — and the next
 * frame's answer would be sitting in the HTML of the frame that asks the question, which is
 * the one thing this whole product is built not to do (#4, ADR-0014).
 *
 * `specs/frame-view.spec.ts` asserts over `page.content()` rather than over rendered text
 * precisely so that a future refactor widening these props fails loudly.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE POSITION COMES FROM THE URL AT KEYPRESS TIME, NOT FROM A PROP, and that is what makes
 * the handler correct rather than merely convenient.
 *
 * The first draft took `next` and `previous` as URLs. It worked, and it had a staleness
 * window: after a soft navigation the listener still closed over the PREVIOUS frame's
 * targets until React flushed the new effect, so a second press landing inside that window
 * navigated to where the reader already was. Measured — the suite pressed twice in
 * succession, went 4 → 3, and then sat on 3 until it timed out. A human at reading speed
 * would never have found it; a slow RSC fetch would have widened it until they did.
 *
 * `base` and `last` do not change while a reader moves through a program, so the effect
 * binds once and never rebinds, and the only moving part — which frame is on screen — is
 * read from `location.pathname`, which #5 already made the single source of that truth.
 *
 * WHY THE ARROWS AND NOT THE SPACE BAR. Space is the reader's scroll on a frame that does
 * not fit the screen, and taking it would trade one ergonomic for another. Enter belongs to
 * whatever has focus. Left and Right scroll nothing here — the measure is capped and no
 * page scrolls horizontally — and they are what every reader and slide deck already uses.
 *
 * It listens on `document` rather than on an element, because the point is to work WITHOUT
 * tabbing to anything: focus lands on `<body>` after a soft navigation (measured), so a
 * handler on any focusable element would need three tabs first, which is the state this
 * component exists to replace.
 */
export function FrameKeys({ base, last }: FrameKeysProps): null {
  const router = useRouter();

  useEffect(() => {
    /*
      THE HINT MUST NOT PROMISE A SHORTCUT THAT IS NOT LIVE YET.

      This is a Client Component, so the handler below does not exist until the page
      hydrates — measured: pressing the key immediately after a deep link does nothing, and
      pressing it a few hundred milliseconds later works. That gap is unavoidable (the
      alternative is an inline script, which is worse) and it is invisible to a reader who
      is reading rather than racing the browser. What is NOT acceptable is a page that tells
      them about a key before the key does anything.

      So the flag goes on while the listener is attached and comes off with it, and the
      stylesheet reveals the hint from it. `visibility` rather than `display`, deliberately:
      the line occupies its space either way, so nothing on the page moves when it appears —
      which `specs/reading.spec.ts` asserts as a layout-shift bound rather than trusting.

      The reveal link is a real `<a>` and needs none of this, so the no-JS path is never
      broken: the shortcut is an enhancement on top of a page that already works.
    */
    document.documentElement.dataset.frameKeys = 'on';

    const onKeyDown = (event: KeyboardEvent): void => {
      // Somebody else has already acted on this key.
      if (event.defaultPrevented) return;

      // A modifier means a BROWSER shortcut — Alt+Left is Back, Cmd+Right is forward-word.
      // Stealing those would break navigation to fix navigation.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      // Anywhere a reader might be typing. There is no field on a frame today; there is one
      // on /login and there will be an editor in the lab pane, and a global key handler that
      // waits for those to exist before considering them is a handler that eats an arrow
      // key in somebody's answer.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;

      // Where the reader is NOW, rather than where they were when this effect last ran.
      const here = Number(/\/(\d+)\/?$/.exec(window.location.pathname)?.[1]);
      if (!Number.isInteger(here)) return;

      const to = here + step;
      // The ends of the program are ends: the key does nothing rather than wrapping round,
      // which is the shape of "nothing happened" a reader can trust.
      if (to < 1 || to > last) return;

      // Only once we are certain we are acting: past the last frame ArrowRight must still
      // do whatever the browser would have done.
      event.preventDefault();
      router.push(`${base}/${to}`);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      delete document.documentElement.dataset.frameKeys;
    };
  }, [base, last, router]);

  return null;
}
