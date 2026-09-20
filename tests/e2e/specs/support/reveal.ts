import type { Page } from '@playwright/test';

/**
 * THE REVEAL, LOCATED BY WHERE IT GOES AND BY WHERE IT IS.
 *
 * Every reading spec finds the reveal by its href rather than by its words —
 * `frame-view.spec.ts` records why the href beats the name: a locator matching the label
 * would be a second copy of the string under test. The bare `a[href="…/n+1"]` that did it
 * was unambiguous while the reveal was the only link on a frame to the next frame.
 *
 * It is not any more. The place row's section picker lists every heading of the program,
 * each linking to its first frame — so on the last frame of a section the reveal and the
 * picker's entry for the next section point at the SAME address, and a bare href locator
 * is a strict-mode violation naming two elements. The reveal is the one that is a direct
 * child of the frame's `<article>`; the picker's links are inside a `<details>` in the
 * place row. `article >` is that fact, said once here rather than in every spec.
 */
export const revealTo = (page: Page, href: string) => page.locator(`article > a[href="${href}"]`);
