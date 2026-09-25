import { expect, test, type Locator, type Page } from '@playwright/test';

import { chromeFor } from '../../../web/app/src/lib/i18n/chrome.ts';

import { track, unitNamed } from './support/bundle.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — a keyboard reader's first Tab offers a way past the masthead, on every page, in
 * their own edition (WCAG 2.4.1, issue #149).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHAT A READER WITH NO MOUSE PAID BEFORE THIS.
 *
 * On the index, every control in the masthead — the destinations, the theme, and whatever a
 * returning reader's place, worksheets and account add — before the first program. On a
 * frame, the whole top bar before the answer line, on every frame of every program. The link
 * that removes that cost is hidden until it has focus, so a sighted mouse reader never sees
 * it, and that is exactly why nothing but a test that presses Tab would notice it gone.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE WORDS ARE READ FROM `chrome.ts` ITSELF, on `theme.spec.ts`'s reasoning about the theme
 * store: a copy of the label here would be a second source for a string that has one. What
 * this file asserts about them is relational as well — the Polish label is not the English
 * one and declares its own language — so a Polish entry that was quietly English goes red.
 *
 * THE TARGET IS FOLLOWED, NOT NAMED. Every assertion starts from the link's own `href`, so
 * the test holds whatever the target's id is and goes red the day the link points at an
 * element that is not there.
 *
 * WHAT IT DOES NOT ASSERT: that focus lands ON the target. The target carries no `tabindex`
 * (`skip-link.tsx` says why), so following the link moves the browser's starting point for
 * the next Tab rather than focus itself, and the next Tab is what a reader experiences. That
 * press is what is asserted.
 */

const en = chromeFor('en');
const pl = chromeFor('pl');

const UNIT = 'F01';
const program = unitNamed(UNIT);
/** The first frame past frame 1 that asks for something, and so carries the answer line. */
const asks = program.steps.find((step) => step.cue && step.n > 1);
if (!asks) throw new Error(`${UNIT} has no frame past the first that asks, so this proves less`);

const contentsAt = (language: string): string => `/read/${track}/${UNIT}/${language}`;
const frameAt = (language: string, n: number): string => `${contentsAt(language)}/${n}`;

/** What has focus now, described by what the assertions below need to know about it. */
async function focused(page: Page): Promise<{
  readonly tag: string;
  readonly id: string;
  readonly href: string | null;
  readonly inHeader: boolean;
}> {
  return page.evaluate(() => {
    const element = document.activeElement ?? document.body;
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id,
      href: element.getAttribute('href'),
      inHeader: element.closest('header') !== null,
    };
  });
}

/**
 * The first Tab on a freshly loaded page, and the element it reached.
 *
 * On a page that has SETTLED — every request its arrival makes has answered, as
 * `accessibility.spec.ts`'s scan waits for. Pressed straight after `load`, the first Tab on the
 * 404 page was once lost with nothing focused at all, while the link was first in the page:
 * the page was still being rendered under the key. A reader's first Tab comes after they have
 * seen the page, which is what the wait stands for.
 */
async function firstTab(page: Page): Promise<Locator> {
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  return page.locator(':focus');
}

/**
 * Whether the element that has focus comes after `selector`'s element in the document, or
 * inside it — which is what "past the masthead" means once the masthead is behind the target.
 */
const focusFollows = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((target) => {
    const anchor = document.querySelector(target);
    const element = document.activeElement;
    if (!anchor || !element || element === document.body) return false;
    return (
      anchor.contains(element) ||
      (anchor.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    );
  }, selector);

test.describe('the skip link', () => {
  test('on the index, the first Tab offers it, and taking it goes past the masthead @smoke', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const skip = page.getByRole('link', { name: en.skipToContent });
    await expect(skip).toHaveCount(1);

    // Hidden until it has focus: in the tab order and the accessibility tree, taking no room.
    const resting = await skip.boundingBox();
    expect(resting?.width ?? 0, 'the skip link is on screen before anybody pressed Tab').toBeLessThanOrEqual(1);

    const first = await firstTab(page);
    await expect(first, 'the first Tab reached something other than the skip link').toHaveText(en.skipToContent);
    await expect(skip).toBeFocused();

    // And on screen once it has focus, a finger tall, inside the viewport.
    const shown = await skip.boundingBox();
    expect(shown, 'the focused skip link has no box').not.toBeNull();
    expect(shown!.width, 'the focused skip link is still clipped to nothing').toBeGreaterThan(1);
    expect(shown!.height, 'the focused skip link is not a finger tall').toBeGreaterThanOrEqual(44);
    expect(shown!.y, 'the focused skip link is above the top of the screen').toBeGreaterThanOrEqual(0);

    const href = await skip.getAttribute('href');
    expect(href, 'the skip link is not an in-page link').toMatch(/^#./);
    await expect(page.locator(href!), 'the skip link points at nothing').toHaveCount(1);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    await page.keyboard.press('Tab');
    const landed = await focused(page);
    expect(landed.inHeader, `after the skip, Tab reached "${landed.tag}" in the masthead`).toBe(false);
    expect(await focusFollows(page, href!), 'after the skip, Tab reached something before the target').toBe(
      true,
    );
  });

  test('without it, the second Tab is still in the masthead @smoke', async ({ page }) => {
    /*
      THE CONTROL for the test above: the masthead has controls to skip, and Tab walks into
      them when the link is passed over. If this stops being true the test above proves
      nothing — the row it skips would be empty.
    */
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect((await focused(page)).inHeader, 'the second Tab left the masthead, so there is nothing to skip').toBe(
      true,
    );
  });

  test('on a frame that asks, taking it reaches the answer line before anything in the top bar @core', async ({
    page,
  }) => {
    await walkTo(page, UNIT, 'en', asks.n);
    await page.goto(frameAt('en', asks.n));
    await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);

    const first = await firstTab(page);
    await expect(first, 'the first Tab on a frame reached something other than the skip link').toHaveText(
      en.skipToContent,
    );
    const href = await first.getAttribute('href');
    await expect(page.locator(`main${href}`), 'on a frame the skip link does not land on <main>').toHaveCount(1);

    // Taking it with Enter: the frame's own keys leave a focused link's Enter alone.
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('textbox', { name: /your answer/i }),
      'after the skip, Tab did not reach the answer line',
    ).toBeFocused();
  });

  test('speaks the reader’s edition @core', async ({ page }) => {
    expect(pl.language, 'the chrome has no Polish, so this proves nothing').toBe('pl');
    expect(pl.skipToContent, 'the Polish label is the English one').not.toBe(en.skipToContent);

    // The index, whose edition is a query parameter, and a frame, whose edition is the path.
    for (const path of ['/?lang=pl', frameAt('pl', 1)]) {
      await page.goto(path);
      const first = await firstTab(page);
      await expect(first, `${path}: the first Tab reached something else`).toHaveText(pl.skipToContent);
      await expect(first, `${path}: the Polish link does not say it is Polish`).toHaveAttribute('lang', 'pl');
    }
  });

  /*
    EVERY OTHER PAGE A READER WITH NO ACCOUNT CAN REACH, each of which renders its own link
    (`skip-link.tsx` says why the layout cannot). The author's view is behind an account and
    runs in the `identity` project's specs; the error page needs a fault to render.
  */
  const PAGES: readonly string[] = [
    '/about',
    '/courses',
    contentsAt('en'),
    `${contentsAt('en')}/summary`,
    frameAt('en', 1),
    frameAt('en', program.steps.length),
    `/read/${track}/NOPE/en`,
    '/login',
    '/register',
    '/account/deleted',
    '/lab',
    '/lab/p01',
  ];

  for (const path of PAGES) {
    test(`is the first thing Tab reaches on ${path} @core`, async ({ page }) => {
      // The summary itself, not the "Not there yet" it is before the last frame (#158).
      if (path.endsWith('/summary')) await walkTo(page, UNIT, 'en', program.steps.length);
      await page.goto(path);
      const first = await firstTab(page);
      await expect(first, 'the first Tab reached something other than the skip link').toHaveText(
        en.skipToContent,
      );
      const href = await first.getAttribute('href');
      expect(href, 'the skip link is not an in-page link').toMatch(/^#./);
      await expect(page.locator(href!), 'the skip link points at nothing').toHaveCount(1);
    });
  }
});
