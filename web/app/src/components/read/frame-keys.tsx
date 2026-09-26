'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { PROGRAM_MAP_ID, isPopoverOpen, showPopover } from './popover.ts';
import { atRest, typingIn } from './reading-focus.ts';
import { pressNext } from './reveal-form.tsx';

export interface FrameKeysProps {
  /**
   * `/read/<track>/<unit>/<lang>` — the path a frame number is appended to, and the program's
   * contents, where `←` on frame 1 goes.
   */
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
 * whatever has focus. Left and Right scroll nothing on the page — the measure is capped and no
 * page scrolls horizontally — and they are what every reader and slide deck already uses. A
 * formula wider than the measure scrolls inside itself, and has them while it has focus.
 *
 * It listens on `document` rather than on an element, because the point is to work WITHOUT
 * tabbing to anything: focus used to land on `<body>` after a soft navigation (measured), and
 * lands on the new frame's heading since #159 (`frame-focus.tsx`), so a handler on any control
 * would need three tabs first, which is the state this component exists to replace.
 *
 * THE ARROWS AND `Enter` ARE THE PAGE'S ONLY WHILE THE READER IS READING — focus on nothing,
 * or on that heading (`atRest`, in `reading-focus.ts`, #159). A key pressed at a button, a
 * link, a pane's summary or a formula wide enough to scroll is that element's: `→` used to
 * reveal the frame from any of them, and forward is a write. So the keys are named on the
 * pager's buttons in `aria-keyshortcuts` as well as in their tooltips, and are still not
 * printed on the frame (ADR-0063).
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
 * asks. "Nothing focused" is the whole condition — the frame's heading counts as nothing, a
 * tabbed-to link or button keeps its own Enter, and a field is refused above with every
 * other key — so the reveal a reader has tabbed to still follows Enter, as it always did.
 *
 * `←` ON FRAME 1 OPENS THE CONTENTS, which is where the pager's back button leads there
 * (#159). It used to do nothing — "the start of the program is a start" — while the button
 * beside it went somewhere, so the key and the button a reader was told were one move were
 * two.
 *
 * `Esc` IS NOT HANDLED HERE. Each field returns the reader to reading by blurring itself
 * (`answer-line.tsx`, `working.tsx`), because only the field knows whether leaving means
 * keeping what was typed; the jumper cancels and closes its panel (`frame-jumper.tsx`), and
 * a panel closes itself. Nor is `?`, which opens *Reading settings* on every reading screen
 * and so is bound beside that panel (`settings-key.tsx`).
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
      // anywhere a field is added later (`reading-focus.ts`).
      const target = event.target;
      if (typingIn(target)) return;

      if (event.key === 'g') {
        const jumper = document.getElementById('frame-jumper');
        if (!(jumper instanceof HTMLInputElement)) return; // Not on this screen — do nothing.
        if (!showPopover(PROGRAM_MAP_ID)) return; // No Popover API: the map is in the page.
        event.preventDefault();
        jumper.focus();
        jumper.select();
        return;
      }

      // From here on, only while the reader is reading: a key pressed at a control is the
      // control's — its own Enter, a wide formula's arrows (this file's header, #159).
      if (!atRest(target)) return;

      if (event.key === 'Enter') {
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
      if (to < 1) {
        // Before frame 1 is the program's contents, as the pager's back button there says
        // (`frame-view.tsx`) — one move, whether pressed or clicked (#159).
        event.preventDefault();
        router.push(base);
        return;
      }

      if (to > last) {
        // The end of the program used to be a wall; now `→` opens the one thing past it.
        // Still nothing on `←`, and still nothing at all when nowhere has been declared —
        // a program's own summary route may not exist yet on every caller of this component.
        // `/summary` is gated as the last frame is (issue #158), and a reader on the last
        // frame has reached it, so this is a plain navigation rather than a reveal.
        if (!after) return;
        event.preventDefault();
        router.push(after);
        return;
      }

      event.preventDefault();

      if (step < 0) {
        /*
          BACKWARD PRESSES THE PAGER'S `Previous`, AS FORWARD PRESSES ITS `Next` BELOW (#160).
          It pushed the address itself, outside the link, so `useLinkStatus` had nothing to
          report: while the server worked, `←` changed nothing on the page where a click on the
          button beside it showed the wait. A click on that link gives the key the button's
          pending state from the one place it is written (`pending-label.tsx`).

          Backward is always a re-read of a step the reader has already unlocked — never a
          reveal, so a plain navigation is correct and the gate (this destination page's own
          GET) is what would refuse it if it somehow were not. That is why the push is still
          here, for a pager with no link to exactly that frame.
        */
        const back = `${base}/${to}`;
        if (!pressPagerLink(back)) router.push(back);
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

/**
 * Press the pinned pager's own link to `href`, if it has one, and say whether it did — the
 * key and the click then take one path, and the key shows what the button shows while its
 * page is on its way (#160). The pager's link and no other: the program map links some of
 * the same frames, but the key stands for the pager's button, so that is where its wait is
 * shown. Matched on the whole `href`, so no link to anywhere else is ever pressed.
 */
function pressPagerLink(href: string): boolean {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-pager] a[href]')) {
    if (link.getAttribute('href') === href) {
      link.click();
      return true;
    }
  }
  return false;
}
