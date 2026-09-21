import type { Locator, Page } from '@playwright/test';

/**
 * THE REVEAL, LOCATED BY ITS SHAPE AND ITS PLACE — NEVER BY WHERE IT GOES.
 *
 * ADR-0060 made revealing raise a server-side cursor, so `frame-view.tsx`'s main control (and
 * its "Next section" twin in the foot) is a `<form action={revealStep.bind(...)}>` around a
 * `<button type="submit">` — a Server Action has no `href` for a locator to match against, on
 * the same reasoning `frame-view.tsx`'s own header gives for why it can no longer be a bare
 * `<a>`. Only the hand-off past a program's LAST step — to `/summary` — is still a plain
 * `<Link>`; `ADR-0060`'s gate covers the reading loop within a program and stops there.
 *
 * So this finds the control by STRUCTURE, not destination: a `<form>` that is a direct child
 * of the frame's `<article>` holds the button; an `<a>` that is a direct child of it is the
 * summary hand-off. Exactly one of the two renders on any given frame — `frame-view.tsx`'s own
 * ternary — so `.or()` is safe rather than ambiguous. `article >` is what excludes the place
 * row's section picker and the reading foot's own "Next section" button, both real elements on
 * the page that are NOT direct children of `<article>`: the picker's links sit inside a
 * `<details>` in the place row, and the foot's button sits inside `<nav>` in the reading foot.
 *
 * EVERY CALLER ALREADY ASSERTS THE DESTINATION SEPARATELY, with `expect(page).toHaveURL(...)`
 * immediately after the click — that is what used to make the `href` parameter here a
 * belt-and-suspenders check rather than the only correctness this suite had, so dropping it
 * loses no coverage.
 */
export const reveal = (page: Page): Locator =>
  page.locator('article > form').getByRole('button').or(page.locator('article > a'));
