import { expect, test, type Locator, type Page } from '@playwright/test';

import { pickPair, track, unitNamed } from './support/bundle.ts';
import { openPane, pane } from './support/pane.ts';
import { walkTo } from './support/walk.ts';

/**
 * FOCUS IS THE SHARED RING — IN LIGHT, IN DARK AND IN FORCED COLOURS. Issue #148.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * UI-UX.md says "focus is a ring, never a brightness", and `controls.module.css` draws that
 * ring for every button on the reading screens: a box-shadow in the paper and the accent, and
 * a TRANSPARENT outline beside it. The outline is invisible until Windows' forced colours are
 * on; then the box-shadow is not painted at all, and the outline is, in the system's colour.
 *
 * The audit of 2026-09-24 found controls outside that family that said focus with a colour or
 * a brightness and nothing else:
 *
 *   - the answer line and the pad: `outline: none`, and the dashed rule turned blue;
 *   - the pad's *Do the sums*: its border turned blue;
 *   - the consent's two answers: an eight-percent brightness.
 *
 * In forced colours every border is repainted in one system colour, so the first two showed
 * no focus at all — which is the case this file drives, with Chromium's own forced-colours
 * emulation, where the box-shadow really does disappear and the outline really is painted.
 * `lib/theme/tokens.test.ts` refuses the two declarations that caused it — an outline taken
 * away, and a filter — in any stylesheet; this is what a keyboard reader then sees.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IS ASSERTED IS THE COMPUTED STYLE, NOT A SCREENSHOT. `reading.spec.ts` asserts the
 * reveal's ring the same way. The pictures were looked at once, in each mode, when the ring
 * went on; a stored image would fail for every font and every antialiasing change that is not
 * this one.
 */

const UNIT = 'F01';
const { asking } = pickPair(unitNamed(UNIT));

const MODES = [
  { name: 'light', colorScheme: 'light', forcedColors: 'none' },
  { name: 'dark', colorScheme: 'dark', forcedColors: 'none' },
  { name: 'forced colours', colorScheme: 'light', forcedColors: 'active' },
] as const;

type Mode = (typeof MODES)[number];

/**
 * Focus a control the way a keyboard does.
 *
 * `:focus-visible` is about HOW focus arrived, and a script's `focus()` does not always count
 * (`reading.spec.ts` says so, and tabs). Tabbing from the top of a page to a control at its
 * foot is dozens of presses, so the script puts focus on the control, Tab leaves it, and
 * Shift+Tab comes back: the move that lands on it is the keyboard's.
 */
async function tabTo(page: Page, control: Locator): Promise<void> {
  await control.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(control, 'Shift+Tab did not come back to the control').toBeFocused();
}

/** What `var(--accent)` resolves to on this page, as the `rgb()` a computed style reports. */
const accentOf = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

async function wearsTheRing(page: Page, control: Locator, what: string, mode: Mode): Promise<void> {
  await tabTo(page, control);
  const seen = await control.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      focusVisible: node.matches(':focus-visible'),
      boxShadow: style.boxShadow,
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      outlineColor: style.outlineColor,
      filter: style.filter,
    };
  });
  const where = `${what}, in ${mode.name}`;

  expect(seen.focusVisible, `${where}: focus did not arrive as keyboard focus`).toBe(true);
  expect(seen.filter, `${where}: focus is shown as a filter`).toBe('none');
  // The forced-colours half of the ring is there in every mode, and is the only half there is
  // when forced colours are on.
  expect(seen.outline, `${where}: the ring has no outline for forced colours`).toBe('solid 2px');

  if (mode.forcedColors === 'active') {
    expect(
      seen.outlineColor,
      `${where}: forced colours left the outline transparent, so there is no ring`,
    ).not.toBe('rgba(0, 0, 0, 0)');
  } else {
    expect(seen.boxShadow, `${where}: there is no ring in the accent`).toContain(
      `${await accentOf(page)} 0px 0px 0px 4px`,
    );
  }
}

for (const mode of MODES) {
  test(`on a frame that asks, the answer line, the pad and its button wear the ring, in ${mode.name} @core`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: mode.colorScheme, forcedColors: mode.forcedColors });
    await walkTo(page, UNIT, 'en', asking.n);
    await page.goto(`/read/${track}/${UNIT}/en/${asking.n}`);

    await wearsTheRing(page, page.locator('#answer-line'), 'the answer line', mode);

    await openPane(page, 'working');
    const pad = pane(page, 'working');
    await wearsTheRing(page, pad.locator('textarea'), 'the pad', mode);
    await wearsTheRing(page, pad.getByRole('button'), 'the pad’s button', mode);
  });

  test(`the consent’s two answers wear the ring, in ${mode.name} @core`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode.colorScheme, forcedColors: mode.forcedColors });
    await page.goto('/');

    // The two answers are equal in every other respect (consent.spec.ts), and in focus too.
    await wearsTheRing(page, page.getByRole('button', { name: 'Yes, use my outcomes' }), 'the grant', mode);
    await wearsTheRing(page, page.getByRole('button', { name: 'No thanks' }), 'the decline', mode);
  });
}
