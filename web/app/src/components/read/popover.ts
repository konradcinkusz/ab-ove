/**
 * The two popovers on a reading screen — the program map and the reading settings — driven
 * from script, for the paths the declarative `popovertarget` buttons do not cover: `g`, which
 * opens the map from the keyboard, and a choice made inside a popover, which has to close it
 * before the page moves on (ADR-0063).
 *
 * EVERY CALL IS GUARDED, because the Popover API is Baseline-new rather than widely available
 * (the same reasoning `globals.css` gives for refusing `light-dark()`): a browser without it
 * has no `showPopover`, throws on the `:popover-open` selector, and renders both panels in the
 * page's flow instead — where they are still readable, which is the degradation the reading
 * screens were built for. Nothing here may turn a missing API into a broken page.
 */

/** The program map's element id — its invokers name it in `popovertarget`. */
export const PROGRAM_MAP_ID = 'program-map';

/** The reading settings' element id. */
export const READING_SETTINGS_ID = 'reading-settings';

/**
 * Whether any popover is showing. The arrow keys are the reading surface's way forward, and
 * forward is a write (ADR-0060) — so while a panel is open, with a link inside it focused, `→`
 * must not reveal the next frame behind it.
 */
export function isPopoverOpen(): boolean {
  try {
    return document.querySelector(':popover-open') !== null;
  } catch {
    return false;
  }
}

export function showPopover(id: string): boolean {
  const element = document.getElementById(id);
  if (!element || typeof element.showPopover !== 'function') return false;
  try {
    if (!element.matches(':popover-open')) element.showPopover();
    return true;
  } catch {
    return false;
  }
}

export function hidePopover(id: string): void {
  const element = document.getElementById(id);
  if (!element || typeof element.hidePopover !== 'function') return;
  try {
    if (element.matches(':popover-open')) element.hidePopover();
  } catch {
    // Not supported, or already closing: either way there is nothing left to hide.
  }
}
