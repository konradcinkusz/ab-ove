'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { PROGRAM_MAP_ID, isPopoverOpen, showPopover } from './popover.ts';
import { pressNext } from './reveal-form.tsx';

export interface FrameKeysProps {
  /** `/read/<track>/<unit>/<lang>` — the path a frame number is appended to. */
  readonly base: string;
  /** How many steps this unit has, so the ends of the program are ends. */
  readonly last: number;
  /**
   * Where `→` on the LAST frame goes, instead of doing nothing — `/summary`, when the
   * component rendering this is on a program's final step. Absent everywhere else, so the
   * one place this program's own ceiling stops being a wall is the one place a reader has
   * actually finished the program.
   */
  readonly after?: string;
}

/**
 * One keystroke per frame, so a program can be read end to end without a mouse — for the
 * reader who wants that. It is an extra, not the way in: every move it makes is a labelled
 * button in the pinned pager, and the page no longer advertises the keys under the text
 * (ADR-0063; the full list is in `Reading settings`).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT RECEIVES A PATH AND AN INTEGER, AND THAT IS A SECURITY PROPERTY RATHER THAN A STYLE.
 *
 * The props of a Client Component are SERIALISED INTO THE DOCUMENT so the browser can
 * hydrate them. Hand it the next step —
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
 *
 * `g` OPENS THE PROGRAM MAP AND PUTS THE CARET IN ITS FRAME NUMBER, rather than navigating
 * anything itself (ADR-0063 moved the jump into the map, behind the pager's position). It is
 * the one letter key this handler recognises: `g` is what reading applications already use
 * to "go to", so a single guarded letter costs nothing that Space or the arrows would. It
 * reaches the map and the field by DOM id rather than by any prop, because both are
 * independently-mounted and a `ref` cannot cross that boundary.
 *
 * NOTHING HERE ACTS WHILE A PANEL IS OPEN. The arrows' forward is a WRITE (ADR-0060), and a
 * reader with a link in the program map focused who presses `→` means "the next link", not
 * "reveal the frame behind this panel" — so with any popover showing, the page's keys stand
 * aside and the panel's own (Tab, Enter, Esc) are the only ones that do anything.
 *
 * `Enter` WITH NOTHING FOCUSED PUTS THE CARET IN THE ANSWER LINE, by the same mechanism and
 * for a reason ADR-0041 already wrote down and this file did not have: without it a reader
 * who had just pressed `→` reached the line through four Tab stops on every frame that
 * asks. "Nothing focused" is the whole condition — a tabbed-to link or button keeps its own
 * Enter, and a field is refused above with every other key — so the reveal a reader has
 * tabbed to still follows Enter, as it always did.
 *
 * `Esc` IS NOT HANDLED HERE. Each field returns the reader to reading by blurring itself
 * (`answer-line.tsx`, `working.tsx`), because only the field knows whether leaving means
 * keeping what was typed; the jumper cancels and closes its panel (`frame-jumper.tsx`), and
 * a panel closes itself.
 */
export function FrameKeys({ base, last, after }: FrameKeysProps): null {
  const router = useRouter();

  useEffect(() => {
    /*
      THE FLAG SAYS THE KEYS ARE LIVE. This is a Client Component, so the handler below does
      not exist until the page hydrates — measured: a key pressed immediately after a deep
      link does nothing, a few hundred milliseconds later it works. The flag is on while the
      listener is attached and off with it, and the acceptance suite waits on it before it
      presses anything (`specs/reading.spec.ts`), so a test never races the hydration.

      The pager's buttons are a real `<form>` and real links and need none of this: the
      shortcut is an enhancement on top of a page that already works without JavaScript.
    */
    document.documentElement.dataset.frameKeys = 'on';

    const onKeyDown = (event: KeyboardEvent): void => {
      // Somebody else has already acted on this key.
      if (event.defaultPrevented) return;

      // A modifier means a BROWSER shortcut — Alt+Left is Back, Cmd+Right is forward-word.
      // Stealing those would break navigation to fix navigation.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      // A panel is open: its own keys, not the page's (this file's header).
      if (isPopoverOpen()) return;

      // Anywhere a reader might be typing — the answer line, the pad, the frame number — and
      // anywhere a field is added later: a global key handler that waits for a field to exist
      // before considering it is a handler that eats an arrow key in somebody's answer.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === 'g') {
        const jumper = document.getElementById('frame-jumper');
        if (!(jumper instanceof HTMLInputElement)) return; // Not on this screen — do nothing.
        if (!showPopover(PROGRAM_MAP_ID)) return; // No Popover API: the map is in the page.
        event.preventDefault();
        jumper.focus();
        jumper.select();
        return;
      }

      if (event.key === 'Enter') {
        // Only with NOTHING focused: `document.body` is where focus lands after a soft
        // navigation (measured, in this file's header). A link or a button that has focus
        // owns its own Enter and is not touched.
        if (target && target !== document.body) return;
        const line = document.getElementById('answer-line');
        if (!line) return; // A teaching frame asks nothing and has no line to open.
        event.preventDefault();
        line.focus();
        return;
      }

      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;

      // Where the reader is NOW, rather than where they were when this effect last ran.
      const here = Number(/\/(\d+)\/?$/.exec(window.location.pathname)?.[1]);
      if (!Number.isInteger(here)) return;

      const to = here + step;
      if (to < 1) return; // The start of the program is a start.

      if (to > last) {
        // The end of the program used to be a wall; now `→` opens the one thing past it.
        // Still nothing on `←`, and still nothing at all when nowhere has been declared —
        // a program's own summary route may not exist yet on every caller of this component.
        // `/summary` is not part of ADR-0060's gate (out of this change's scope), so this
        // stays a plain navigation rather than a reveal.
        if (!after) return;
        event.preventDefault();
        router.push(after);
        return;
      }

      event.preventDefault();

      if (step < 0) {
        // Backward is always a re-read of a step the reader has already unlocked — never a
        // reveal, so a plain navigation is correct and the gate (this destination page's own
        // GET) is what would refuse it if it somehow were not.
        router.push(`${base}/${to}`);
        return;
      }

      /*
        FORWARD IS A REVEAL, AND A REVEAL IS A WRITE (ADR-0060) — see reveal.ts's header for
        why a bare navigation can no longer be what raises the cursor.

        IT PRESSES THE PAGER'S `Next` RATHER THAN CALLING THE ACTION (#138). It used to call
        `revealStep` itself, outside any transition: the key showed no busy state, a second
        press sent a second reveal, and a reveal that failed said nothing. Submitting the
        pager's own form gives the key the button's pending state, its sentence when the
        reveal does not happen and its one-at-a-time guard, from the one place each is
        written (`reveal-form.tsx`). What is revealed is the form's own bound step — the frame
        on screen — so there is nothing here to go stale either.
      */
      pressNext();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      delete document.documentElement.dataset.frameKeys;
    };
  }, [base, last, after, router]);

  return null;
}
