'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { revealStep } from '@/lib/actions/reveal';

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
  /**
   * ADR-0060 — added alongside `revealStep`, and it does not weaken the property the header
   * below explains: a track id, a unit id and a language tag are already sitting in the
   * address bar this handler reads `here` out of, so handing them in as props leaks nothing
   * that was not already public. What that property still forbids is a STEP or its content.
   */
  readonly track: string;
  readonly unit: string;
  readonly language: string;
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
 *
 * `g` FOCUSES THE FRAME JUMPER RATHER THAN NAVIGATING ANYTHING ITSELF. It is the one letter
 * key this handler recognises, on the reasoning `place-row.tsx`'s own header gives for why
 * the jumper is one Tab from the top for a reader who never learns it: `g` is what every
 * reading application a reader has met already uses to "go to", so a single guarded letter
 * costs nothing that Space or the arrows would. It reaches the input by DOM id rather than
 * by any prop this component holds, because `frame-jumper.tsx` is an independently-mounted
 * Client Component and a `ref` cannot cross that boundary — the id is the one thing both
 * sides can agree on without either one holding a reference to the other.
 *
 * `Enter` WITH NOTHING FOCUSED PUTS THE CARET IN THE ANSWER LINE, by the same mechanism and
 * for a reason ADR-0041 already wrote down and this file did not have: without it a reader
 * who had just pressed `→` reached the line through four Tab stops on every frame that
 * asks. "Nothing focused" is the whole condition — a tabbed-to link or button keeps its own
 * Enter, and a field is refused above with every other key — so the reveal a reader has
 * tabbed to still follows Enter, as it always did.
 *
 * `Esc` IS NOT HANDLED HERE. Each field returns the reader to reading by blurring itself
 * (`answer-line.tsx`, `working.tsx`, `frame-jumper.tsx`), because only the field knows
 * whether leaving means committing (the line, the pad) or cancelling (the jumper, whose
 * blur would otherwise NAVIGATE to a half-typed number).
 *
 * WHICH FIELD IS FOCUSED IS MIRRORED ONTO `<html>` AS `data-typing`, read off the field's
 * own `data-typing` attribute as focus moves, so the hint can say what is true where the
 * caret is (ADR-0041: "the arrows are dead inside a text field and a hint that promised
 * them would be lying twice a frame"). A field joins the hint by carrying the attribute;
 * nothing here knows their ids.
 */
export function FrameKeys({ base, last, after, track, unit, language }: FrameKeysProps): null {
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

      if (event.key === 'g') {
        const jumper = document.getElementById('frame-jumper');
        if (!jumper) return; // Not mounted yet, or not on this screen — do nothing.
        event.preventDefault();
        jumper.focus();
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
        why a bare navigation can no longer be what raises the cursor. `here`, not `to`, is
        the step being ANSWERED; `${base}/${to}` is where the same idempotency
        `revealStep` relies on always leaves servable once this call returns, whether it
        genuinely advanced the cursor or found this reader already past it.
      */
      void revealStep(track, unit, language, here, `${base}/${to}`);
    };

    // The typing state, for the hint. `focusin` carries the element gaining focus, so one
    // listener both sets the state on entering a field and clears it on entering anything
    // else; `focusout` with no `relatedTarget` is focus leaving to the document itself,
    // which `focusin` never reports.
    const onFocusIn = (event: FocusEvent): void => {
      const state = (event.target as HTMLElement | null)?.dataset?.['typing'];
      if (state) document.documentElement.dataset.typing = state;
      else delete document.documentElement.dataset.typing;
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (!event.relatedTarget) delete document.documentElement.dataset.typing;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      delete document.documentElement.dataset.frameKeys;
      delete document.documentElement.dataset.typing;
    };
  }, [base, last, after, router, track, unit, language]);

  return null;
}
