import { expect, test, type Page } from '@playwright/test';

import { languages, probe, served, track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { openThrough } from './support/gate.ts';

/**
 * JOURNEY — the two ends of a program: the summary a reader reaches after its last frame, and
 * the contents page's way back to the program before it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ASSERTED, AND WHAT WAS NOT.
 *
 * `navigation.spec.ts` holds the summary to a NEGATIVE — it prints no frame's text and no
 * answer, in either edition — and walks the hand-off from the last frame and back. What no
 * spec asserted was what the summary is FOR: the book's own return index (its Summary items
 * and its *Can you?* outcomes, each with the frames it covers) and the way on to the next
 * program, which is the one filled control on the screen. A summary rendering an empty list
 * and a dead `Next program` would have passed everything. Nor did anything press the contents
 * page's way BACK — `gate.spec.ts` covers only its way on.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The expected text comes from the SERVED bundle (`support/bundle.ts`), never from a copy.
 */

const FIRST = served.units[0]!;
const SECOND = served.units[1]!;
const LAST = served.units[served.units.length - 1]!;

const contentsAt = (unit: string, language: string): string => `/read/${track}/${unit}/${language}`;
const summaryAt = (unit: string, language: string): string => `${contentsAt(unit, language)}/summary`;

const pager = (page: Page) => page.locator('[data-pager]');

test.describe('the summary', () => {
  test('prints the program’s return index — its Summary items and its outcomes, each with its frames @core', async ({
    page,
  }) => {
    const routes = FIRST.routes ?? [];
    const items = routes.filter((route) => route.kind === 'summary');
    const outcomes = routes.filter((route) => route.kind === 'outcome');
    expect(items.length, `${FIRST.id} has no Summary items, so this proves nothing`).toBeGreaterThan(0);
    expect(outcomes.length, `${FIRST.id} has no outcomes, so this proves nothing`).toBeGreaterThan(0);

    for (const language of languages) {
      await page.goto(summaryAt(FIRST.id, language));
      const main = page.locator('main');

      // One entry per route, in the book's order: the Summary items as a numbered list, the
      // outcomes as the list under the one second-level heading.
      const itemRows = main.locator('ol > li');
      const outcomeRows = main.locator('h2 + ul > li');
      await expect(itemRows, `the ${language} summary lost Summary items`).toHaveCount(items.length);
      await expect(outcomeRows, `the ${language} summary lost outcomes`).toHaveCount(outcomes.length);

      let checked = 0;
      for (const [rows, routesOfKind] of [
        [itemRows, items],
        [outcomeRows, outcomes],
      ] as const) {
        for (const [index, route] of routesOfKind.entries()) {
          const row = rows.nth(index);
          // The label is the book's, in this edition — asserted wherever it has a run of
          // plain words to find (a label that is all maths has none).
          const needle = probe(route.labels?.[language] ?? '');
          if (needle) {
            checked += 1;
            await expect(row, `route ${index} of ${language} says something else`).toContainText(needle);
          }
          // And each one links to the frame it starts at — the way back into the program.
          const range = route.from === route.to ? `${route.from}` : `${route.from}–${route.to}`;
          await expect(row.getByRole('link', { name: range, exact: true })).toHaveAttribute(
            'href',
            `${contentsAt(FIRST.id, language)}/${route.from}`,
          );
        }
      }
      expect(checked, `too few ${language} labels had plain words to check`).toBeGreaterThanOrEqual(
        (items.length + outcomes.length) / 2,
      );
    }
  });

  test('leads on to the next program’s first frame, by button and by key @core', async ({ page }) => {
    // A place in the first program is what opens the second (ADR-0051), so the way on is a
    // way somewhere rather than a bounce off the gate — seeded as `gate.ts` seeds it.
    await openThrough(page, SECOND.id);
    await page.goto(summaryAt(FIRST.id, 'en'));

    const onward = pager(page).getByRole('link', { name: new RegExp(SECOND.id) });
    await expect(onward, 'the summary offers no way on').toHaveCount(1);
    // The next program's title rides in the tooltip, the label being a phone's third of the pager.
    await expect(onward).toHaveAttribute('title', `${SECOND.id} · ${SECOND.titles['en']!}`);

    await onward.click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt(SECOND.id, 'en')}/1$`));
    await expect(page.locator('article')).toContainText(uniqueProbeIn(SECOND, 1, 'en'));

    // The same move from the keyboard: `→` on the summary is the button beside it.
    await page.goto(summaryAt(FIRST.id, 'en'));
    await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await page.waitForURL(`**${contentsAt(SECOND.id, 'en')}/1`);
  });

  test('after the last program, leads to the programs rather than to nothing @core', async ({ page }) => {
    // A `Next program` with no next program would be a control that names a place and does
    // not go there. The last summary's way on is the index — and `→` has nowhere else to go.
    await openThrough(page, LAST.id);
    await page.goto(summaryAt(LAST.id, 'en'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(LAST.titles['en']!);

    const links = pager(page).getByRole('link');
    await expect(links).toHaveCount(2);
    await expect(links.last()).toHaveAttribute('href', '/');
    await expect(pager(page).getByRole('link', { name: /next program/i })).toHaveCount(0);

    await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);
    const wasAt = page.url();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(page.url(), '`→` after the last program went somewhere').toBe(wasAt);
  });

  test('offers the program’s exercises where the book has them, and nowhere else @core', async ({ page }) => {
    // `/lab/<id>` is reached from ONE line on that program's summary (ADR-0040). The line is
    // there for the program with a lab and absent for one without, rather than a link to a
    // lab that 404s.
    const withLab = (served.labs ?? [])[0];
    expect(withLab, 'the served bundle declares no lab, so this proves nothing').toBeTruthy();
    const labUnit = unitNamed(withLab!.id);

    await page.goto(summaryAt(FIRST.id, 'en'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main a[href^="/lab/"]'), `${FIRST.id} offers a lab it does not have`).toHaveCount(0);

    await openThrough(page, labUnit.id);
    await page.goto(summaryAt(labUnit.id, 'en'));
    const lab = page.locator(`main a[href="/lab/${labUnit.id.toLowerCase()}"]`);
    await expect(lab, `${labUnit.id}'s summary does not lead to its exercises`).toHaveCount(1);
    await lab.click();
    await expect(page).toHaveURL(new RegExp(`/lab/${labUnit.id.toLowerCase()}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('switches edition without leaving the summary @core', async ({ page }) => {
    const [first, second] = languages;
    await page.goto(summaryAt(FIRST.id, first!));
    const control = page.getByRole('navigation').filter({ has: page.locator(`a[lang="${second}"]`) });
    await control.locator(`a[lang="${second}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${summaryAt(FIRST.id, second!)}$`));
    await expect(page.locator(`main[lang="${second}"]`)).toContainText(FIRST.titles[second!]!);
  });
});

test.describe('a program’s way back', () => {
  test('the first program’s contents lead back to the programs @core', async ({ page }) => {
    await page.goto(contentsAt(FIRST.id, 'en'));
    const back = pager(page).getByRole('link').first();
    await expect(back).toHaveAttribute('href', '/');
    await back.click();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
  });

  test('every later program’s contents lead back to the program before it @core', async ({ page }) => {
    // The second program is open once the first has a place (ADR-0051).
    await openThrough(page, SECOND.id);
    await page.goto(contentsAt(SECOND.id, 'en'));
    const back = pager(page).getByRole('link', { name: `← ${FIRST.id}` });
    await expect(back).toHaveAttribute('href', contentsAt(FIRST.id, 'en'));
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt(FIRST.id, 'en')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FIRST.titles['en']!);
  });
});
