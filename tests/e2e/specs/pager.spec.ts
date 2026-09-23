import { expect, test, type Locator, type Page } from '@playwright/test';

import { track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — moving between frames with a mouse, which is what the owner asked for.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * ADR-0063. THE REQUIREMENT, IN THE OWNER'S WORDS: *"there is no next and previous button to
 * click with the mouse on the computer … on the computer the button has to be there, and the
 * keyboard is an option."*
 *
 * The frame had a way forward — the reveal, under the question, at a different height on
 * every frame — and a way back at the other end of the page, under a line teaching the arrow
 * keys. `reading.spec.ts` proves a program can be read from the keyboard, and nothing proved
 * it could be read with the thing most readers hold. So this file asserts the pair itself:
 * on a desktop and on a phone, on a frame long enough to scroll, `Previous` and `Next` are on
 * screen before and after scrolling, labelled with words, a finger tall, in the same place on
 * consecutive frames — and a click on each goes where it says.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE FRAMES ARE THE PROGRAM'S LONGEST OF EACH KIND, chosen from the served bundle rather than
 * written down, so they stay the long ones when the book renumbers itself: one that asks (it
 * carries the answer line and the panes under the text) and one that teaches. A short frame
 * would prove the pager is on screen when nothing could push it off, which is not the claim.
 */
const unitId = 'F01';
const unit = unitNamed(unitId);
const steps = unit.steps;

const at = (language: string, n: number): string => `/read/${track}/${unitId}/${language}/${n}`;

const longest = (asks: boolean) => {
  const found = [...steps]
    .filter((step) => step.n > 1 && step.n < steps.length && Boolean(step.cue) === asks)
    .sort((a, b) => (b.body.en ?? '').length - (a.body.en ?? '').length)[0];
  if (!found) throw new Error(`${unitId} has no ${asks ? 'asking' : 'teaching'} frame past the first`);
  return found;
};

const FRAMES = [
  ['a frame that asks', longest(true)],
  ['a frame that teaches', longest(false)],
] as const;

const SCREENS = [
  ['a desktop', { width: 1280, height: 800 }],
  ['a phone', { width: 360, height: 640 }],
] as const;

/** 44 px — the smallest target a finger hits reliably (UI-UX.md); the pager's are 48. */
const FINGER = 44;

const pager = (page: Page): Locator => page.locator('[data-pager]');
const previous = (page: Page): Locator => pager(page).getByRole('link', { name: /previous/i });

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  expect(box, 'a control has no box, so nothing here measured anything').toBeTruthy();
  return {
    x: Math.round(box!.x),
    y: Math.round(box!.y),
    width: Math.round(box!.width),
    height: Math.round(box!.height),
  };
}

/** Both buttons, whole, on screen, with their words, a finger tall. */
async function bothOnScreen(page: Page, where: string): Promise<void> {
  for (const [name, button, label] of [
    ['Previous', previous(page), /previous/i],
    ['Next', reveal(page), /next/i],
  ] as const) {
    await expect(button, `${name} is not wholly on screen ${where}`).toBeInViewport({ ratio: 1 });
    await expect(button, `${name} has lost its word ${where}`).toHaveText(label);
    const box = await boxOf(button);
    expect(box.height, `${name} is not a finger tall ${where}`).toBeGreaterThanOrEqual(FINGER);
  }
}

test.describe('the pager', () => {
  for (const [screen, viewport] of SCREENS) {
    for (const [what, frame] of FRAMES) {
      test(`on ${screen}, ${what}: Previous and Next are on screen and a click on each goes there @smoke`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await walkTo(page, unitId, 'en', frame.n);
        await page.goto(at('en', frame.n));

        const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        expect(tall, `frame ${frame.n} does not scroll at this size, so this proves less than it reads`).toBeGreaterThan(40);

        // At the top of the frame, with nothing scrolled — where every reader arrives.
        await bothOnScreen(page, `at the top of frame ${frame.n}`);
        const top = { back: await boxOf(previous(page)), next: await boxOf(reveal(page)) };

        // At the bottom of the frame: the same two buttons, in the same place.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await bothOnScreen(page, `at the bottom of frame ${frame.n}`);
        expect(await boxOf(previous(page)), 'Previous moved when the frame scrolled').toEqual(top.back);
        expect(await boxOf(reveal(page)), 'Next moved when the frame scrolled').toEqual(top.next);

        // A click — the mouse's own, at the button's centre — on each.
        await reveal(page).click();
        await expect(page).toHaveURL(new RegExp(`${at('en', frame.n + 1)}$`));
        await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, frame.n + 1, 'en'));

        await previous(page).click();
        await expect(page).toHaveURL(new RegExp(`${at('en', frame.n)}$`));
        await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, frame.n, 'en'));
      });
    }

    test(`on ${screen}, the two buttons are in the same place on consecutive frames @core`, async ({
      page,
    }) => {
      /*
        THE POINT OF A PAGER. The reveal used to be wherever the question ended, so a reader's
        hand chased it down the page from one frame to the next. Here it is measured across a
        turn from a frame that asks to the frame that answers — the pair whose layouts differ
        most, the second opening with the answer box — and the two rectangles must not move
        by a pixel.
      */
      const asks = longest(true);
      await page.setViewportSize(viewport);
      await walkTo(page, unitId, 'en', asks.n);
      await page.goto(at('en', asks.n));
      const before = { back: await boxOf(previous(page)), next: await boxOf(reveal(page)) };

      await reveal(page).click();
      await expect(page).toHaveURL(new RegExp(`${at('en', asks.n + 1)}$`));
      await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, asks.n + 1, 'en'));

      expect(await boxOf(previous(page)), 'Previous is somewhere else on the next frame').toEqual(before.back);
      expect(await boxOf(reveal(page)), 'Next is somewhere else on the next frame').toEqual(before.next);
    });
  }

  test('nothing a reader focuses is hidden under the pager @core', async ({ page }) => {
    /*
      WCAG 2.4.11 — focus not obscured. The pager is the one thing on these pages positioned
      over the text (ADR-0063), so it is the one thing that could cover a field a keyboard
      reader has just reached; the page pays for that with `scroll-padding-bottom`, and this
      is the assertion that the payment covers it. On a phone, where the pager is the largest
      share of the screen, and on the longest frame that asks, where the most controls sit
      under the text: every stop Tab reaches outside the two bars is above the pager's top.
    */
    const asks = longest(true);
    await page.setViewportSize({ width: 360, height: 640 });
    await walkTo(page, unitId, 'en', asks.n);
    await page.goto(at('en', asks.n));
    await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);

    const checked: string[] = [];
    for (let presses = 0; presses < 16; presses += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const focused = document.activeElement;
        if (!focused || focused === document.body) return undefined;
        const bar = document.querySelector('[data-pager]')?.getBoundingClientRect();
        const box = focused.getBoundingClientRect();
        return {
          name: `${focused.tagName.toLowerCase()} ${(focused.textContent ?? '').trim().slice(0, 30)}`,
          inBars: focused.closest('[data-pager], header') !== null,
          top: box.top,
          bottom: box.bottom,
          floor: bar?.top ?? window.innerHeight,
        };
      });
      if (!stop || stop.inBars) continue;
      checked.push(stop.name);
      expect(stop.bottom, `"${stop.name}" is focused under the pager`).toBeLessThanOrEqual(stop.floor + 1);
      expect(stop.top, `"${stop.name}" is focused above the top of the screen`).toBeGreaterThanOrEqual(0);
    }
    expect(checked, 'Tab reached nothing in the frame, so nothing here was measured').not.toEqual([]);
    expect(
      checked.some((name) => name.startsWith('textarea')),
      'Tab never reached the answer line, which is the field this is about',
    ).toBe(true);
  });
});

test.describe('the program map', () => {
  test('opens from the position, closes on Esc and on its close button, and holds the arrows @core', async ({
    page,
  }) => {
    const n = Math.min(3, steps.length);
    await walkTo(page, unitId, 'en', n);
    await page.goto(at('en', n));
    await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);

    const position = page.getByTestId('frame-position');
    const map = page.getByTestId('program-map');
    await expect(position, 'the position does not say where the reader is').toContainText(
      `${n} of ${steps.length}`,
    );
    await expect(map).toBeHidden();

    await position.click();
    await expect(map, 'the position did not open the program map').toBeVisible();

    /*
      THE ARROWS STAND ASIDE WHILE A PANEL IS OPEN. Forward is a write — it raises the
      reader's cursor on the server — so a `→` meant for a list must not turn the page under
      it (frame-keys.tsx).
    */
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(page.url(), 'an arrow key turned the page under the open map').toContain(at('en', n));
    await expect(map).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(map, 'Esc did not close the program map').toBeHidden();

    await position.click();
    await expect(map).toBeVisible();
    await map.getByRole('button', { name: 'Close' }).click();
    await expect(map, 'the close button did not close the program map').toBeHidden();

    // And the arrows are the page's again once it is closed.
    await page.keyboard.press('ArrowRight');
    await page.waitForURL(`**${at('en', n + 1)}`);
  });

  test('a frame number past the reader’s furthest frame is answered in place, with the way there @core', async ({
    page,
  }) => {
    /*
      THE JUMP DOES NOT LEAD TO A REFUSAL. The frame number used to navigate to anything it
      was given, and a number past the reader's furthest frame landed on *Not there yet*.
      The API sends the furthest frame with the frame (ADR-0063), so the map answers such a
      number where it was typed, and offers that frame instead.
    */
    const furthest = Math.min(6, steps.length - 2);
    const n = furthest - 2;
    await walkTo(page, unitId, 'en', furthest);
    await page.goto(at('en', n));

    await page.getByTestId('frame-position').click();
    const jumper = page.locator('#frame-jumper');
    await expect(jumper).toHaveValue(String(n));

    await jumper.fill(String(furthest + 1));
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(String(furthest));
    await page.waitForTimeout(300);
    expect(page.url(), 'a number past the furthest frame navigated anyway').toContain(at('en', n));

    // A number the program does not have is answered the same way.
    await jumper.fill(String(steps.length + 1));
    await jumper.press('Enter');
    await expect(page.getByRole('status')).toContainText(String(steps.length));
    expect(page.url()).toContain(at('en', n));

    // And a number the reader has reached goes there, and the map closes behind it.
    await jumper.fill(String(furthest));
    await jumper.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${at('en', furthest)}$`));
    await expect(page.getByTestId('program-map')).toBeHidden();
  });
});

test.describe('the other panels and screens in the same frame', () => {
  test('Reading settings open from the top bar and close on Esc @core', async ({ page }) => {
    await page.goto(at('en', 1));
    const settings = page.getByTestId('reading-settings');
    await expect(settings).toBeHidden();

    await page.getByTestId('reading-settings-button').click();
    await expect(settings, 'the button did not open the reading settings').toBeVisible();
    await expect(settings.getByRole('group', { name: 'Theme' })).toBeVisible();
    await expect(settings.getByRole('list', { name: 'Keys' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(settings, 'Esc did not close the reading settings').toBeHidden();
  });

  test('a frame the reader has not reached offers the one they have, in the pager @core', async ({
    page,
  }) => {
    // A fresh reader's furthest frame is 1 (ADR-0060), so frame 3 is refused.
    await page.goto(at('en', 3));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const onward = pager(page).getByRole('link', { name: /go to frame 1/i });
    await expect(onward, 'the refusal offers no way to where the reader is').toBeInViewport();
    await expect(pager(page).getByRole('link', { name: 'Contents' })).toBeInViewport();

    await onward.click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 1)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));
  });
});

test.describe('with no JavaScript at all', () => {
  /*
    THE BUTTONS ARE A FORM AND A LINK, AND THAT IS WHAT THEY ARE FOR. `Next` is a Server
    Action behind a real `<form>` (ADR-0060) and `Previous` a real `<a>`, so a reader whose
    script never arrived can still read the program with the mouse — the one claim the
    keyboard, being script, can never make.
  */
  test.use({ javaScriptEnabled: false });

  test('Next and Previous still go where they say @core', async ({ page }) => {
    await page.goto(at('en', 1));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));

    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 2)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 2, 'en'));

    await previous(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 1)}$`));
  });
});
