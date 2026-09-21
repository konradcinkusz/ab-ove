import { expect, test } from '@playwright/test';

import { languages, track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — reading the same frame in the other edition, and being remembered.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0052 — ONE CONTROL PER SCREEN, AT THE TOP OF IT, AND IT KEEPS THE ANSWER.
 *
 * There were four of these: above the programme grid, on every contents page, on every
 * summary and in every frame's place row — and none of them remembered anything, so a
 * reader answered the same question on every screen in the product. What is asserted below
 * is both halves of the fix: the count (exactly one control, wherever the reader is) and
 * the memory (one press, and the next screen already agrees).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Issue #6's "done when" is one clause: *switching language keeps the reader's position*.
 * Every test below is a version of that, and the reason it is cheap is worth stating,
 * because it is a property of the CONTENT rather than of this application: the book's own
 * parity tooling compares the two editions' structural tokens **in order**, so frame n of
 * `programs/en` and frame n of `programs/pl` are the same frame by construction. That makes
 * this a mapping and not a matching problem.
 *
 * And nothing page-derived is involved. The book's four PDFs paginate differently by
 * design, and its notes are emphatic that nothing which matters navigates by page — so a
 * switch keyed on anything but the program and the frame index would be wrong even where it
 * happened to work.
 *
 * STRINGS ARE NOT COPIED INTO THIS FILE, and the chrome's are not read from anywhere
 * either: the assertions below are RELATIONAL — the two editions' controls differ, each
 * declares its own language — so they hold whatever the words are and go red the day the
 * controls stop following the edition. A spec asserting "Pokaż odpowiedź" would be a second
 * copy of a string that has a source, drifting the first time somebody reworded it.
 */
/* F01 from the served bundle — see specs/support/bundle.ts. */
const unit = 'F01';
const program = unitNamed(unit);
const unitTitles = program.titles;
const steps = program.steps;

const contentsAt = (language: string): string => `/read/${track}/${unit}/${language}`;
const frameAt = (language: string, n: number): string => `${contentsAt(language)}/${n}`;

/** The two editions, as the fixture declares them. */
const [first, second] = languages as [string, string];

test.describe('the language control', () => {
  test('switching at a frame lands on the SAME frame in the other edition @smoke', async ({
    page,
  }) => {
    expect(languages.length, 'the fixture no longer has two editions to switch between').toBe(2);

    // Deliberately not frame 1: frame 1 is where a wrong implementation lands by accident,
    // so a test that only ever switched there would pass against one that resets to the
    // start of the program.
    const n = Math.min(3, steps.length);
    expect(n, 'the fixture needs a frame that is not the first').toBeGreaterThan(1);

    await walkTo(page, unit, first, n);
    await page.goto(frameAt(first, n));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, n, first));

    await page.locator(`a[href="${frameAt(second, n)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt(second, n)}$`));
    await expect(
      page.locator('body'),
      'the switch did not land on the same frame in the other edition',
    ).toContainText(uniqueProbeIn(program, n, second));

    // And back, to the same place. A switch that is not its own inverse is a switch that
    // loses the position on the second press rather than the first.
    await page.locator(`a[href="${frameAt(first, n)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt(first, n)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, n, first));
  });

  test('switching on a contents page keeps the program @core', async ({ page }) => {
    // The frame case is the hard one and this is the one a reader meets first. Both pages
    // are addressed by a language, so a switch on one and not the other would strand a
    // reader who went up to the contents after switching at a frame.
    await page.goto(contentsAt(first));
    await page.locator(`a[href="${contentsAt(second)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt(second)}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles[second]!);
  });

  test('the control names both editions, each in its own language @core', async ({ page }) => {
    await page.goto(frameAt(first, 1));

    // A reader reaching for this control may be the reader who cannot read the page they
    // are on, so the label for the other edition must be in THAT edition's language. The
    // assertion is on the `lang` attribute rather than on the words, which is the same
    // thing said in a way that survives a rewording.
    const control = page.getByRole('navigation').filter({ has: page.locator(`[lang="${second}"]`) });
    await expect(control, 'no control offers the other edition').toHaveCount(1);

    // The current edition is SHOWN and is not a link — a lone unexplained link is a control
    // that does not say what it switches between — and `aria-current` is what carries that
    // to a screen reader rather than the colour that carries it to everybody else.
    const current = page.locator(`[aria-current="true"][lang="${first}"]`);
    await expect(current).toHaveCount(1);
    await expect(current).not.toHaveRole('link');
  });

  test('the controls are written in the reader’s edition, not one fixed language @core', async ({
    page,
  }) => {
    // RELATIONAL, so it needs no copy of either string: the same control reads differently
    // in the two editions and each says which language it is in. It goes red against a page
    // that serves Polish content inside English furniture, which is what this repository
    // did until #6.
    const said: Record<string, string> = {};
    for (const language of languages) {
      await page.goto(frameAt(language, 1));
      const control = reveal(page);
      await expect(control).toHaveAttribute('lang', language);
      said[language] = (await control.innerText()).trim();
      expect(said[language]!.length, `the ${language} reveal has no label at all`).toBeGreaterThan(0);
    }
    expect(
      said[first],
      'both editions render the same control text, so the chrome is not following the edition',
    ).not.toBe(said[second]);
  });

  test('a program with one edition would offer no switch — asserted where it is reachable @core', async ({
    page,
  }) => {
    // The fixture declares two languages, so a single-edition track cannot be reached
    // through a route here. What IS assertable from outside is the complement: with two
    // editions the control exists and offers exactly one alternative, never a list padded
    // with the page you are already on.
    await page.goto(frameAt(first, 1));
    await expect(page.locator(`a[href="${frameAt(first, 1)}"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="${frameAt(second, 1)}"]`)).toHaveCount(1);
  });
});

/**
 * The two clauses the owner asked for in as many words: *only and exclusively once at the
 * top of the page*, and *remembered*.
 */
test.describe('one control, remembered', () => {
  /** Every screen that used to carry a switch of its own, plus the index that had a third. */
  const screens = [
    ['the index', '/'],
    ['a contents page', contentsAt(first)],
    ['a frame', frameAt(first, 1)],
    ['a summary', `${contentsAt(first)}/summary`],
  ] as const;

  for (const [what, where] of screens) {
    test(`${what} carries exactly one language control @core`, async ({ page }) => {
      await page.goto(where);

      /*
        Counted by the thing that makes a control a control: a `<nav>` naming the OTHER
        edition. Two of them on one screen is the defect this change removed — and it is
        also, exactly, the ambiguity `place-row.tsx` records as the reason that row is a
        `<div>` rather than a `<nav>`.
      */
      const controls = page
        .getByRole('navigation')
        .filter({ has: page.locator(`a[lang="${second}"]`) });

      await expect(controls, `${what} has more than one language control`).toHaveCount(1);
    });
  }

  test('the control is in the top of the page, above the reading matter @core', async ({
    page,
  }) => {
    // "At the top" is a requirement and not a decoration, so it is measured rather than
    // assumed: the control sits above the page's own heading on every screen that has one.
    for (const where of [contentsAt(first), `${contentsAt(first)}/summary`]) {
      await page.goto(where);

      const control = page
        .getByRole('navigation')
        .filter({ has: page.locator(`a[lang="${second}"]`) })
        .first();
      const heading = page.getByRole('heading', { level: 1 }).first();

      const top = (await control.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
      const title = (await heading.boundingBox())?.y ?? 0;

      expect(top, `the control is below the heading on ${where}`).toBeLessThan(title);
    }
  });

  test('one press follows the reader from screen to screen @smoke', async ({ page }) => {
    /*
      THE CLAUSE THE WHOLE CHANGE IS FOR, and the one no previous spec could have asserted:
      the answer is asked for ONCE. A reader switches at a frame, walks up to the index by
      the links the product gives them, and the index is already in the edition they chose
      — without the query string, because the query string is what a remembered choice must
      not depend on.
    */
    await walkTo(page, unit, first, 2);
    await page.goto(frameAt(first, 2));
    await page.locator(`a[href="${frameAt(second, 2)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt(second, 2)}$`));

    await page.goto('/');
    await expect(
      page.getByRole('link', { name: unitTitles[second]! }),
      'the index forgot the edition the reader chose at a frame',
    ).toHaveAttribute('href', contentsAt(second));
    await expect(page.getByRole('link', { name: unitTitles[first]! })).toHaveCount(0);
  });

  test('a reader who has chosen nothing gets English @smoke', async ({ page }) => {
    // The default, asserted from a context that has never chosen. `first` is the fixture's
    // own first declared edition and is English for the served bundle; the assertion is on
    // what the INDEX shows rather than on the string, so it survives a track reordering.
    await page.goto('/');
    await expect(page.getByRole('link', { name: unitTitles['en']! })).toBeVisible();
  });
});
