import { expect, test, type Page } from '@playwright/test';

import { THEMES, THEME_KEY } from '../../../web/app/src/lib/theme/store.ts';

import { track, unitNamed } from './support/bundle.ts';

/**
 * JOURNEY — a reader turns on light mode, and it stays on.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0048. THE QUESTION THIS FILE IS THE ANSWER TO IS "HOW DO I TURN ON LIGHT MODE?"
 *
 * Until now the answer was "change your operating system": the stylesheet swapped every
 * token under `prefers-color-scheme` and the product had no control of its own. The switch
 * that replaced that has three properties a reader would notice losing, and each is a test
 * below rather than a sentence in a document:
 *
 *   1. Pressing `Light` on a machine set to dark really turns the page light.
 *   2. It is still light after a reload, IN THE FIRST PAINT — not after a flash of dark.
 *   3. `System` gives the machine its say back, so the switch has a way out.
 *
 * The third is the one a two-position toggle cannot have, and it is why the control has
 * three (ADR-0015's objection to an invisible default, met one control along).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * NOT ONE COLOUR IS WRITTEN DOWN HERE, and that is deliberate. A spec asserting
 * `rgb(251, 250, 248)` is a second copy of `globals.css` that goes stale the first time
 * somebody warms the paper by two points, and it goes stale SILENTLY — red for a change
 * that is not a defect. So the suite measures the product against itself: what a reader who
 * PRESSED `Light` sees must equal what a reader whose MACHINE says light sees, and the two
 * must differ from dark. Those are the properties; the hex values are the stylesheet's.
 *
 * The key and the positions come from `lib/theme/store.ts` itself, on `support/bundle.ts`'s
 * reasoning: a suite that seeds a browser through a key the application no longer reads is
 * a suite that passes while testing nothing.
 */

/*
  F01, THE PROGRAM EVERY READER MAY OPEN. This was P01's first frame, and a reader with no
  record is not let into P01 — the gate returns them to the index once the page hydrates
  (ADR-0051) — so every test here that pressed something on "the frame" was racing that
  redirect, and passed only while its press landed first. ADR-0063's settings button is one
  press further in, and the race became a timeout: the button was detached mid-click. The
  claims below are about a frame, not about P01, so they are made on a frame the reader can
  stay on.
*/
const FRAME_UNIT = unitNamed('F01').id;
const FRAME = `/read/${track}/${FRAME_UNIT}/en/1`;

/** What the page is actually painted in, which is the only thing a reader can see. */
const paper = (page: Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** The position the switch shows as live, read from the document rather than from React. */
const live = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

/**
 * Reach the switch where this screen keeps it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0058 — ON A READING SCREEN IT IS INSIDE *READING SETTINGS*, AND THAT IS THE POINT.
 *
 * ADR-0048's reasoning is untouched: the answer to "how do I turn on light mode" is still
 * this page rather than the operating system, and still one press from where the reader
 * already is. What changed is that a setting nobody touches twice a season stopped sharing
 * a row with the control they press on every frame. So the switch is one press down, and
 * this suite makes it: since ADR-0063 the panel is a popover opened by the *Reading settings*
 * button in the top bar, rather than a disclosure at the foot of the page.
 *
 * The index has no such panel (`program-grid.tsx` keeps the switch in its chrome row), so
 * this is a no-op there and the landing-page assertions below are unchanged. A panel that is
 * already open is left open — a press inside a popover does not close it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const reachTheme = async (page: Page): Promise<void> => {
  const settings = page.getByTestId('reading-settings');
  if ((await settings.count()) === 0 || (await settings.isVisible())) return;
  await page.getByTestId('reading-settings-button').click();
  await expect(settings, 'the Reading settings button did not open the panel').toBeVisible();
};

const press = async (page: Page, name: string) => {
  await reachTheme(page);
  await page
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name, exact: true })
    .click();
};

test.describe('the theme', () => {
  test('a reader on a dark machine can turn on light mode, and it survives a reload @smoke', async ({
    browser,
  }) => {
    /*
      TWO CONTEXTS, BECAUSE THE BASELINE HAS TO COME FROM THE PRODUCT.

      `light` is whatever this application paints for a reader whose machine says light. It
      is read here, from a browser that has chosen nothing, and it is the value the pressed
      control is then held to.
    */
    const daylight = await browser.newContext({ colorScheme: 'light' });
    const bright = await daylight.newPage();
    await bright.goto('/');
    const light = await paper(bright);
    await daylight.close();

    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/');

    const dark = await paper(page);
    expect(dark, 'a dark machine and a light one painted the same page').not.toBe(light);
    expect(await live(page), 'a reader who has chosen nothing carries no theme').toBeNull();

    await press(page, 'Light');
    expect(await paper(page), 'pressing Light did not change the page').toBe(light);
    expect(await live(page)).toBe('light');

    // And it is still light on the way back. WHEN it becomes light — the property the
    // inline boot script exists for — is asserted by the last test in this file, which is
    // the only instrument that can tell "before the first paint" from "very soon after".
    await page.reload();
    expect(await paper(page), 'the choice did not survive a reload').toBe(light);
    expect(await live(page)).toBe('light');

    await context.close();
  });

  test('the choice is the reader’s, not the page’s @core', async ({ browser }) => {
    // A theme that had to be re-chosen inside a program would be a preference in name only.
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();

    await page.goto('/');
    await press(page, 'Light');
    const light = await paper(page);

    await page.goto(FRAME);
    expect(await live(page), 'the frame forgot what the index was told').toBe('light');
    expect(await paper(page)).toBe(light);

    // And the switch on the frame is the same control, showing the same position — behind
    // the frame's own `Reading settings`, which is where ADR-0058 put every setting.
    await reachTheme(page);
    await expect(
      page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await context.close();
  });

  test('System gives the machine its say back @core', async ({ browser }) => {
    /*
      THE WAY OUT. A two-position toggle has no state meaning "whatever my machine says" —
      once pressed, it is pressed for ever — and a reader who tries a theme they do not like
      should not have to clear their site data to get back to the one they had.
    */
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/');

    const dark = await paper(page);

    await press(page, 'Light');
    expect(await paper(page)).not.toBe(dark);

    await press(page, 'System');
    expect(await paper(page), 'System did not return the machine’s own answer').toBe(dark);
    expect(await live(page), 'System is an attribute rather than an absence').toBeNull();

    // And it is remembered as a choice, so the page it paints is the one it painted before.
    await page.reload();
    expect(await paper(page)).toBe(dark);

    await context.close();
  });

  test('dark is reachable from a light machine too @core', async ({ browser }) => {
    // The mirror of the headline test, and not a duplicate of it: the failure it catches is
    // a switch wired to work in one direction, which the other three tests would not see.
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/');

    const light = await paper(page);
    await press(page, 'Dark');

    expect(await paper(page)).not.toBe(light);
    expect(await live(page)).toBe('dark');

    await context.close();
  });

  test('a choice made in one tab reaches the other @core', async ({ browser }) => {
    /*
      `ThemeFlag` in the root layout is what this is about (`components/theme/theme-flag.tsx`).
      Without it the second tab would keep the old theme until its next navigation — which is
      not a crash and is exactly the kind of half-working a reader reports as "it sometimes
      forgets".
    */
    const context = await browser.newContext({ colorScheme: 'dark' });
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto('/');
    await second.goto(FRAME);

    const dark = await paper(second);
    await press(first, 'Light');

    await expect
      .poll(() => paper(second), { message: 'the other tab kept the old theme' })
      .not.toBe(dark);
    expect(await live(second)).toBe('light');

    await context.close();
  });

  test('the switch speaks the reader’s edition @core', async ({ page }) => {
    // ADR-0016 — the reading controls follow the reader's edition. A control that appeared
    // in English on a Polish frame would be this application's vocabulary leaking into the
    // book's.
    await page.goto(`/read/${track}/${FRAME_UNIT}/pl/1`);
    await reachTheme(page);

    const polish = page.getByRole('group', { name: 'Tryb' });
    await expect(polish).toBeVisible();
    for (const name of ['Systemowy', 'Jasny', 'Ciemny']) {
      await expect(polish.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });

  test('every position the store knows is offered @core', async ({ page }) => {
    // A guard on the control rather than on the page: `THEMES` is what `theme-switch.tsx`
    // maps over, so a position added to the store and given no label would render an empty
    // button — visible to nobody reviewing the store, and to every reader.
    await page.goto('/');

    const group = page.getByRole('group', { name: 'Theme' });
    await expect(group.getByRole('button')).toHaveCount(THEMES.length);
    for (const position of THEMES) {
      const button = group.locator(`button[data-position="${position}"]`);
      await expect(button).toHaveText(/\S/);
    }
  });

  test('a reader who chose light keeps it even if the application’s JavaScript never arrives @core', async ({
    browser,
  }) => {
    /*
      ────────────────────────────────────────────────────────────────────────────────────
      THE STRONGEST FORM OF "NO FLASH", AND THE ONE A TIMER CANNOT FAKE.

      Every other test here lets the page finish loading, so a theme applied by hydration
      would pass them — it would merely arrive a few hundred milliseconds late, which is
      precisely the defect the inline boot script exists to prevent and precisely what a
      screenshot taken at the end cannot see.

      So this one throws the application's own chunks away. What is left is the document and
      the stylesheet: no React, no hydration, no `ThemeSwitch`. If the page is light, the
      only thing that can have made it light is the inline script in `<head>` — which is the
      thing that runs before the first paint for a reader whose connection is simply slow.
      ────────────────────────────────────────────────────────────────────────────────────
    */
    const daylight = await browser.newContext({ colorScheme: 'light' });
    const bright = await daylight.newPage();
    await bright.goto('/');
    const light = await paper(bright);
    await daylight.close();

    const context = await browser.newContext({ colorScheme: 'dark' });
    const baseline = await context.newPage();
    await baseline.goto('/');
    const dark = await paper(baseline);
    await baseline.close();

    // Seeded through the store's own key, at document start, exactly as a returning reader's
    // browser would have it.
    await context.addInitScript(
      ([key, value]) => {
        try {
          window.localStorage.setItem(key!, value!);
        } catch {
          /* a private window; the assertions below would fail loudly, which is right */
        }
      },
      [THEME_KEY, 'light'],
    );
    /*
      THE SCRIPTS AND NOT THE STYLESHEET. Next serves both out of `_next/static/`, and an
      earlier draft of this test aborted the directory: the page then had no CSS either, its
      background was `rgba(0, 0, 0, 0)`, and "not dark" was true of a page with no theme at
      all. The suffix is what keeps the assertion about a page a reader could read.
    */
    await context.route('**/_next/static/**/*.js', (route) => route.abort());

    const page = await context.newPage();
    // `domcontentloaded` rather than `commit`: the document is parsed, so the inline script
    // in `<head>` has certainly run, and no wall-clock guess is involved. With every chunk
    // aborted there is no hydration for it to be racing.
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(await live(page), 'nothing put the theme on the document').toBe('light');
    expect(await paper(page), 'the page was dark with no JavaScript to correct it').toBe(light);
    expect(dark, 'this browser was not set to dark, so the test proved nothing').not.toBe(light);

    await context.close();
  });
});
