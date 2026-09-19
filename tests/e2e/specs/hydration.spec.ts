import { expect, test } from '@playwright/test';

import { served, track, unitNamed } from './support/bundle.ts';

/**
 * JOURNEY — every page hydrates, which is the one defect that leaves no trace on screen.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS SUITE EXISTS BECAUSE A HYDRATION FAILURE SHIPPED AND NOTHING NOTICED FOR A WHOLE PR.
 *
 * The place row was a `<p>` holding the language switch's `<nav>`. HTML does not allow
 * that, so the parser closed the paragraph early and the browser's DOM had the switch as a
 * sibling where React had rendered it as a child. React's response is to throw away the
 * server-rendered tree and regenerate the whole thing on the client:
 *
 *     In HTML, <nav> cannot be a descendant of <p>. This will cause a hydration error.
 *
 * NOTHING LOOKED WRONG. The page rendered, the switch worked, every existing spec passed,
 * the build was green and so was CI. What it actually cost was paid by every client island
 * on every frame page — each re-mounting from scratch rather than hydrating — and it
 * surfaced, a PR later, as a sketch background that stored correctly and never came back,
 * because a component seeded from `useSyncExternalStore`'s SERVER snapshot was silently
 * getting the client one.
 *
 * So the guard is not "the background comes back". It is this: the browser is asked, on
 * every kind of page this product serves, whether the document it was sent could be
 * hydrated at all. It is the only question that finds this class before a reader does.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THE CONSOLE AND NOT AN ASSERTION ON THE DOM. A mismatch is a disagreement between
 * two trees, and only one of them is in the DOM by the time a test could look. React says
 * so out loud and nothing else does, so the console is the instrument — filtered to the
 * two messages that mean this and nothing else, because a suite that failed on every
 * console error would be red for reasons that are not defects.
 */

const F01 = unitNamed('F01');

/** A cue frame, so the worksheet's own islands are on the page being checked. */
const CUE = F01.steps.find((step) => step.cue)?.n ?? 1;
/** A teaching frame, which renders a different set of islands. */
const TEACHING = F01.steps.find((step) => !step.cue && step.n > 1)?.n ?? 2;

const PAGES: readonly string[] = [
  '/',
  '/about',
  `/read/${track}/F01/en`,
  `/read/${track}/F01/pl`,
  `/read/${track}/F01/en/${CUE}`,
  `/read/${track}/F01/pl/${CUE}`,
  `/read/${track}/F01/en/${TEACHING}`,
  `/read/${track}/F01/en/${F01.steps.length}`,
  `/read/${track}/F01/en/summary`,
];

/** The two messages that mean an invalid nesting or a mismatched tree, and no others. */
const HYDRATION =
  /hydrat|cannot be a descendant|cannot contain a nested|did not match|didn't match/i;

test.describe('hydration', () => {
  for (const path of PAGES) {
    test(`${path} hydrates without a mismatch @core`, async ({ page }) => {
      const complaints: string[] = [];

      page.on('pageerror', (error) => {
        if (HYDRATION.test(error.message)) complaints.push(error.message.split('\n')[0]!);
      });
      page.on('console', (message) => {
        // A minified React build reports the code rather than the words, so both spellings
        // are matched: #418 and #423 are the mismatch family, and the dev build says it in
        // prose. Without the code the production suite would be blind to exactly the thing
        // this file is for.
        const text = message.text();
        if (message.type() === 'error' && (HYDRATION.test(text) || /Minified React error #(418|423|425)/.test(text)))
          complaints.push(text.split('\n')[0]!);
      });

      const response = await page.goto(path);
      expect(response?.status(), `${path} did not answer 200`).toBe(200);

      await page.waitForLoadState('load');

      /*
        ──────────────────────────────────────────────────────────────────────────────────
        WAITING FOR THE ISLAND, NOT FOR THE NETWORK — and the first draft did the latter.

        `networkidle` looked like the right wait and it hangs on `/about`: the integration
        panel keeps a request in flight with no backend behind it, which is a SUPPORTED
        state of this product rather than a fault (see `no-backend.spec.ts`). So the suite
        reported a hydration failure on a page that hydrates perfectly well, which is a
        false alarm in the one file whose whole job is to be believed about this.

        A frame page has a real signal: `FrameKeys` sets `data-frame-keys` when its effect
        runs, which is AFTER hydration by construction. Where there is no such island the
        wait is a short settle, because hydration on a local production build is tens of
        milliseconds and React reports a mismatch synchronously while it happens — the
        margin is two orders of magnitude and the alternative is an instrument that lies.
        ──────────────────────────────────────────────────────────────────────────────────
      */
      if (path.includes('/read/') && /\/\d+$/.test(path)) {
        await page.locator('[data-frame-keys="on"]').waitFor({ state: 'attached' });
      }
      await page.waitForTimeout(1_500);

      expect(complaints, `${path}:\n  ${complaints.join('\n  ')}`).toEqual([]);
    });
  }

  test('the place row holds the language switch rather than being closed by it @core', async ({
    page,
  }) => {
    /*
      The specific nesting, asserted directly as well as through the console — so that the
      day somebody reaches for `<p>` again because it reads like prose, the failure names
      the element rather than naming React.

      `toBeTruthy` on the closest match: the switch must still be INSIDE the row in the
      browser's own DOM. Under the old markup it was a sibling, which is what the parser
      did with it and is exactly what React objected to.
    */
    await page.goto(`/read/${track}/F01/en/${CUE}`);

    const inside = await page.evaluate(() => {
      const nav = document.querySelector('nav');
      if (!nav) return 'no switch on the page at all';
      const row = nav.closest('p');
      return row ? 'the switch is inside a <p>, which the parser will not allow' : 'ok';
    });

    expect(inside).toBe('ok');
  });

  test('the bundle this suite reads is the one the app serves @core', async ({ page }) => {
    // A guard on the guard: every path above is built from `served`, so if that ever
    // resolved a fixture the suite would be checking pages that do not exist and passing.
    expect(served.units.length, 'the served bundle has almost nothing in it').toBeGreaterThan(1);

    const response = await page.goto(`/read/${track}/F01/en/${CUE}`);
    expect(response?.status()).toBe(200);
  });
});
