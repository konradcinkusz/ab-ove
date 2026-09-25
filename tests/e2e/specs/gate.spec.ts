import { expect, test } from '@playwright/test';

import { served, track } from './support/bundle.ts';
import { openThrough } from './support/gate.ts';

/**
 * JOURNEY — the book is entered at the beginning.
 *
 * ADR-0051's requirement in one sentence: *a program opens when the reader has a place in
 * the one before it, and until then the way in is not there.* No account, and nothing sent
 * anywhere — the gate is a question put to the reader's own record in the browser, so this
 * suite is the anonymous reader's, like `progress.spec.ts` beside it. The frames it opens
 * come from `AbOvo.Api` like every frame (ADR-0060), whose own gate is per step within a
 * program; the program-level rule this file asserts is not the API's (`program-gate.tsx`).
 *
 * THE PROGRAMS ARE READ OFF THE SERVED BUNDLE rather than named. The rule is about the
 * manifest's ORDER, so a spec naming F01 and F02 would be asserting today's book: the day
 * a program is inserted, the names would still exist, the assertion would still pass, and
 * it would have stopped being about the first two programs.
 */
const [first, second, third] = served.units;

const contentsOf = (unitId: string, language = 'en'): string =>
  `/read/${track}/${unitId}/${language}`;

const KEY = 'ab-ovo:progress:v1';

/** The stored record, as the browser holds it — or null, which is the fresh reader. */
const stored = (page: import('@playwright/test').Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), KEY);

/**
 * The tile for a program, found by its id rather than its title: a shut tile has no link,
 * so the title is not a role this page can be searched by for half of its own grid.
 */
const tileFor = (page: import('@playwright/test').Page, unitId: string) =>
  page.locator(`li[id="p-${unitId}"]`);

test.beforeAll(() => {
  // Three programs, because the claim needs one that is open, one that opens next, and one
  // that is still shut when the second one has been entered.
  expect(served.units.length, 'the served bundle has fewer than three programs').toBeGreaterThan(2);

  /*
    A GUARD FOR THE OTHER SPECS, stated here because this is the file that knows the rule.

    Most of the reading suite opens `F01` in a fresh browser and expects a frame — which is
    only true while F01 is the program the book starts with. This assertion is the one
    place that says so, so the day the book opens with something else the suite reports a
    sentence naming the cause instead of a dozen journeys redirecting to the index for no
    stated reason. The fix when it fires is `openThrough` in those files, not a change
    here.
  */
  expect(
    first!.id,
    'the reading specs open F01 in a fresh browser, which the gate allows only for the ' +
      'first program of the track — see specs/support/gate.ts',
  ).toBe('F01');
});

test.describe('a program opens when the one before it has been opened', () => {
  test('the first program is the way in, and the next one is not @smoke', async ({ page }) => {
    await page.goto('/');

    // The first program: a link, as every tile used to be.
    await expect(
      tileFor(page, first!.id).getByRole('link', { name: first!.titles['en']! }),
    ).toHaveCount(1);

    /*
      The second: the tile is all still there — id, title, frame count — and the way in is
      not. Both halves matter. A tile that vanished would be a book hiding its own table of
      contents; a tile that kept its link would be ADR-0051 as decoration.
    */
    const shut = tileFor(page, second!.id);
    await expect(shut.getByText(`opens after ${first!.id}`, { exact: true })).toBeVisible();
    await expect(shut.getByRole('link')).toHaveCount(0);
    await expect(shut).toContainText(second!.titles['en']!);
  });

  test('a shut program refuses a deep link and records nothing on the way @smoke', async ({
    page,
  }) => {
    /*
      THE HOLE THIS TEST EXISTS FOR. Arriving at a frame is what records a place
      (`remember-position.tsx`), and a place in a program is one of the three things that
      OPENS it — so a recorder that wrote before the gate redirected would have made one
      typed URL buy the program permanently. The assertion is therefore not only "the
      reader was moved" but "nothing was left behind".
    */
    await page.goto(`${contentsOf(second!.id)}/1`);

    await page.waitForURL((url) => url.pathname === '/');
    expect(await stored(page), 'a shut program recorded a place').toBeNull();

    // And it lands on the tile it was asking for, which is where the explanation is.
    expect(page.url()).toContain(`#p-${second!.id}`);
    await expect(
      tileFor(page, second!.id).getByText(`opens after ${first!.id}`, { exact: true }),
    ).toBeVisible();
  });

  test('the contents page of a shut program refuses it too @core', async ({ page }) => {
    await page.goto(contentsOf(second!.id));
    await page.waitForURL((url) => url.pathname === '/');
  });

  test('the reader is told why they are on this page, not only which tile @smoke', async ({
    page,
  }) => {
    /*
      THE BOUNCE USED TO BE SILENT. A reader who followed a bookmark to a shut program got
      the index, a coloured border on one tile in forty-seven, and three words in that
      tile's id row — with no way to tell a rotted link from a program that does not exist
      from the book's own reading order. `?shut=` carries the reason across the navigation
      and `shut-notice.tsx` re-asks the gate before it says a word.
    */
    await page.goto(contentsOf(second!.id));
    await page.waitForURL((url) => url.searchParams.get('shut') === second!.id);

    const notice = page.getByRole('status');
    await expect(notice).toContainText(`${second!.id} is not open yet`);
    // It names the move, and the move is one the reader can make.
    await expect(notice).toContainText(first!.id);

    // And it is where the page has put them, so a keyboard is beside the explanation
    // rather than at the top of a grid they did not ask for.
    await expect(notice).toBeFocused();
  });

  test('an ordinary visit to the index says nothing about shut programs @core', async ({
    page,
  }) => {
    // The notice is for the reader who was moved. A reader who came here on purpose is
    // scanning a table of contents, and a standing explanation of a rule they have not hit
    // is the prose ADR-0036 took off this page.
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('a claim in the address is re-asked of the record, never printed @core', async ({
    page,
  }) => {
    /*
      `?shut=` is a query parameter, so anybody can type one and any link carrying one goes
      stale the moment the reader opens the program in another tab. A notice rendered from
      the parameter alone would tell a reader they cannot enter a program that is, in fact,
      open to them.
    */
    await openThrough(page, second!.id);
    await page.goto(`/?shut=${second!.id}`);

    await expect(tileFor(page, second!.id).getByRole('link')).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('a shut tile explains itself at length, to the pointer and to a screen reader @core', async ({
    page,
  }) => {
    await page.goto('/');

    // The three words in the id row are the note; the sentence is what a reader gets when
    // they ask the tile what it means. Both are the same fact, and the long one says how
    // small the move is — which "opens after F01" cannot.
    const shutTitle = tileFor(page, second!.id).locator('span[title]');
    await expect(shutTitle).toHaveAttribute('title', new RegExp(`any frame of ${first!.id}`));

    const describedBy = await shutTitle.getAttribute('aria-describedby');
    expect(describedBy, 'the shut title carries no description').toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toContainText(`any frame of ${first!.id}`);
  });

  test('the contents foot says what opens the next program, where it used to say nothing @core', async ({
    page,
  }) => {
    /*
      The foot of the first program's contents is the one place the next program's
      EXISTENCE was withheld: the way on is rendered only while the reader may take it
      (`when-open.tsx` — a control that is reliably refused is worse than no control), and
      what stood in its place was an empty half of a foot.
    */
    await page.goto(contentsOf(first!.id));

    const foot = page.getByRole('navigation', { name: 'Where to next' });
    await expect(foot).toContainText(
      `${second!.id} opens once you have read any frame of this program.`,
    );
    await expect(foot.getByRole('link', { name: `${second!.id} →` })).toHaveCount(0);
  });

  test('reading one frame of a program opens the next one, and only the next @core', async ({
    page,
  }) => {
    // One frame. Not the last one, not every one — ADR-0051 chose the weakest gate that
    // still makes the order true, and this is the test of exactly that choice.
    await page.goto(`${contentsOf(first!.id)}/1`);
    await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, KEY);

    await page.goto('/');
    await expect(
      tileFor(page, second!.id).getByRole('link', { name: second!.titles['en']! }),
    ).toHaveCount(1);

    // The one after it has not moved: opening a door does not open the corridor.
    const still = tileFor(page, third!.id);
    await expect(still.getByText(`opens after ${second!.id}`, { exact: true })).toBeVisible();
    await expect(still.getByRole('link')).toHaveCount(0);

    // And the program itself now opens on the route, which is the half a tile cannot prove.
    await page.goto(contentsOf(second!.id));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(second!.titles['en']!);
  });

  test('the contents foot offers the next program only once this one has been opened @core', async ({
    page,
  }) => {
    // A reader on a contents page has not necessarily opened a FRAME of it — the gate let
    // them in on the program before. `F02 →` at the foot would lead somewhere they would
    // be sent back from, so it is not offered yet.
    await openThrough(page, second!.id);
    await page.goto(contentsOf(second!.id));

    const onward = page.getByRole('link', { name: `${third!.id} →` });
    await expect(onward).toHaveCount(0);

    // Read one frame of it, and the way on appears.
    await page.goto(`${contentsOf(second!.id)}/1`);
    await page.waitForFunction(
      ([key, at]) => {
        const raw = window.localStorage.getItem(key!);
        return raw !== null && JSON.parse(raw).positions?.[at!] !== undefined;
      },
      [KEY, `${track}/${second!.id}`] as const,
    );
    await page.goto(contentsOf(second!.id));
    await expect(onward).toHaveCount(1);
  });

  test('a reader who already has a place in a program keeps it, however they got there @core', async ({
    page,
  }) => {
    /*
      The safety valve, at the layer a unit test cannot reach: a record that names a
      program and NOT the one before it — which is every record written before this rule
      existed, and any record that reached this browser from another machine (ADR-0019).
      The door cannot shut behind a reader who is already through it.
    */
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      [
        KEY,
        JSON.stringify({
          version: 1,
          positions: { [`${track}/${third!.id}`]: { language: 'en', step: 2 } },
        }),
      ] as const,
    );

    await page.goto(contentsOf(third!.id));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(third!.titles['en']!);

    // Its tile says where they are rather than what opens it — and the program it skipped
    // is still shut, because a place opens the door the reader is in and not the corridor
    // behind them.
    await page.goto('/');
    await expect(tileFor(page, third!.id).getByText('at frame 2', { exact: true })).toBeVisible();
    await expect(tileFor(page, second!.id).getByRole('link')).toHaveCount(0);
  });
});
