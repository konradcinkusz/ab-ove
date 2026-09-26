import type { Locator, Page } from '@playwright/test';

/**
 * THE REVEAL, LOCATED BY ITS HOOK — NEVER BY WHERE IT GOES.
 *
 * ADR-0060 made revealing raise a server-side cursor, so the frame's way forward is a
 * `<form action={revealStep.bind(...)}>` around a `<button type="submit">` — a Server Action
 * has no `href` for a locator to match against. Only the hand-off past a program's LAST step —
 * to `/summary` — is still a plain `<Link>`: there is no step past the last one to raise a
 * cursor to, and `/summary` is served under the last frame's own gate
 * (`Reveal.ServeReturnIndex`, issue #158), which a reader on that frame has already passed.
 *
 * ADR-0063 moved both into the pinned pager as its `Next` cell, and gave that cell a test id:
 * the button reads `Next` on every frame, a frame that asks included, and the summary link
 * reads `Summary`, so neither a label nor the old structural hook (a direct child of the
 * frame's `<article>`) finds it any more. `frame-view.tsx` renders exactly one of the two on
 * any given frame, and both carry `data-testid="frame-reveal"`, so this is one element, never
 * an ambiguous pair.
 *
 * EVERY CALLER ALREADY ASSERTS THE DESTINATION SEPARATELY, with `expect(page).toHaveURL(...)`
 * immediately after the click — that is what made an `href` parameter here a
 * belt-and-suspenders check rather than the only correctness this suite had.
 */
export const reveal = (page: Page): Locator => page.getByTestId('frame-reveal');
