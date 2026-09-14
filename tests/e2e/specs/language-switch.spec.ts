import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * JOURNEY — reading the same frame in the other edition.
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
const HERE = dirname(fileURLToPath(import.meta.url));

function bundle() {
  const path = join(
    HERE,
    '..',
    '..',
    '..',
    'web',
    'app',
    'src',
    'lib',
    'content',
    'fixtures',
    'book-p01.bundle.json',
  );
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const unit = parsed?.units?.[0];
  if (!parsed?.track?.id || !unit?.id || !Array.isArray(unit.steps)) {
    throw new Error(
      `${path} no longer has the shape this suite reads. Fixture and spec must move together.`,
    );
  }
  return {
    track: parsed.track.id as string,
    languages: parsed.track.languages as string[],
    unit: unit.id as string,
    unitTitles: unit.titles as Record<string, string>,
    steps: unit.steps as { n: number; body: Record<string, string> }[],
  };
}

const { track, languages, unit, unitTitles, steps } = bundle();

const contentsAt = (language: string): string => `/read/${track}/${unit}/${language}`;
const frameAt = (language: string, n: number): string => `${contentsAt(language)}/${n}`;

/** The two editions, as the fixture declares them. */
const [first, second] = languages as [string, string];

test.describe('the language switch', () => {
  test('switching at a frame lands on the SAME frame in the other edition @smoke', async ({
    page,
  }) => {
    expect(languages.length, 'the fixture no longer has two editions to switch between').toBe(2);

    // Deliberately not frame 1: frame 1 is where a wrong implementation lands by accident,
    // so a test that only ever switched there would pass against one that resets to the
    // start of the program.
    const n = Math.min(3, steps.length);
    expect(n, 'the fixture needs a frame that is not the first').toBeGreaterThan(1);

    await page.goto(frameAt(first, n));
    await expect(page.locator('body')).toContainText(steps[n - 1]!.body[first]!);

    await page.locator(`a[href="${frameAt(second, n)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt(second, n)}$`));
    await expect(
      page.locator('body'),
      'the switch did not land on the same frame in the other edition',
    ).toContainText(steps[n - 1]!.body[second]!);

    // And back, to the same place. A switch that is not its own inverse is a switch that
    // loses the position on the second press rather than the first.
    await page.locator(`a[href="${frameAt(first, n)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt(first, n)}$`));
    await expect(page.locator('body')).toContainText(steps[n - 1]!.body[first]!);
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
      const reveal = page.locator(`a[href="${frameAt(language, 2)}"]`);
      await expect(reveal).toHaveAttribute('lang', language);
      said[language] = (await reveal.innerText()).trim();
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
