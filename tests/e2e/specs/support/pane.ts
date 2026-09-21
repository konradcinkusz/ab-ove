import type { Locator, Page } from '@playwright/test';

/**
 * A worksheet pane, by name rather than by the word on its button.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE SUITE USED TO FIND THESE BY THEIR SUMMARY TEXT, AND THAT STOPPED BEING A HOOK.
 *
 * `getByRole('group').filter({ hasText: 'Sketch' })` worked while each pane's button said
 * one fixed word. ADR-0059 gave the sketch TWO labels — `Draw it` on a blank frame,
 * `Show my sketch` on one the reader has drawn on — and both are in the markup at once, so
 * a text filter would have to name the pair and would then match whichever the stylesheet
 * happens to be showing.
 *
 * Worse, `hasText` matches text that is not visible, so such a filter can quietly start
 * matching an ANCESTOR group and go on passing while testing something else. That is not
 * hypothetical here: the *Reading settings* disclosure is a `group` whose panel contains
 * the word "Keys", which is exactly how `reading.spec.ts`'s touch test nearly kept its
 * green while measuring the wrong element.
 *
 * So the panes carry `data-pane`, and this is the one place that knows it. It is
 * E2E-ACCEPTANCE-TESTING.md's deliberate fallback rather than a shortcut past role-and-name:
 * the element's accessible name is its label, the label is bilingual AND conditional, and a
 * spec that copied it would be a second copy of the string under test — which
 * `language-choice.spec.ts` refuses on its own account.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
export const pane = (page: Page, which: 'working' | 'sketch'): Locator =>
  page.locator(`details[data-pane="${which}"]`);

/** Its button. Opening a pane is always this, on every screen that has one. */
export const openPane = (page: Page, which: 'working' | 'sketch'): Promise<void> =>
  pane(page, which).locator('summary').click();
