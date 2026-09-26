import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

import { collectPageErrors, describePageErrors } from './support/page-errors.js';

import { track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — a frame on its way says so, where the reader pressed, and the pager stays where it
 * is while it comes.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * ISSUE #160, MEASURED BEFORE IT WAS FIXED. Every frame is rendered by the Next server from
 * live calls to `AbOvo.Api` (ADR-0060), and no frame is there before the press asks for it —
 * a frame's links to other frames are not prefetched (ADR-0014), and a dynamic page's
 * prefetch would not be kept if they were — so every move between frames waits on the
 * server. Only `Next` showed it: `Previous`, clicked or pressed as `←`, a heading chosen in
 * the program map and *Go to frame* looked exactly as they had until the next frame replaced
 * the page, and on a slow server that is a press that seems to do nothing. The frame stays on
 * screen while the next one comes — that is what makes the pager stand still (ADR-0063) — so
 * the control that was pressed is where the wait is said.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * HOW THE SERVER IS MADE SLOW, AND FOR WHOM. The calls a frame waits on are made by the Next
 * SERVER, where no route the browser can intercept reaches them (`error-page.spec.ts` says the
 * same of a failed call). So the fault fixture in front of the first deployment holds the
 * requests of this test's own reader — the id the middleware minted for this browser context
 * and nobody else holds (ADR-0061) — and forwards everybody else's on time
 * (`fixtures/api-fault.mts`). A hold, not a failure: the frame does arrive, and the test sees
 * both the wait and its end.
 *
 * WHY THE HOLD IS LONG. The state under test lasts exactly as long as the server takes, and a
 * web-first assertion polls; two seconds is several polls wide on a slow runner, and it is the
 * whole cost of the wait, once per move, because a frame's calls leave together (#160).
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The frames are F01's, by position, for the reason `no-backend.spec.ts` gives: the first
 * program is open to every reader (ADR-0051), and `walkTo` raises this reader's cursor through
 * the real `advance` endpoint to where a test starts.
 */

const FAULT = process.env.AB_OVO_FAULT_BASE_URL;

const NEEDS_FAULT =
  'Needs the fault fixture in front of a running AbOvo.Api, which playwright.config.ts ' +
  'starts only for a local target given E2E_API_BASE_URL. CI always has both. Skipped ' +
  'rather than made conditional: with no fixture there is no way to slow the API for one ' +
  'reader, and with no API at all there is no frame to wait for.';

/** How long each of this reader's calls to the API is held — see the header. */
const HOLD_MS = 2_000;

const unitId = 'F01';
const unit = unitNamed(unitId);
const at = (n: number): string => `/read/${track}/${unitId}/en/${n}`;

const pager = (page: Page): Locator => page.locator('[data-pager]');
const previous = (page: Page): Locator => pager(page).getByRole('link', { name: 'Previous' });
const position = (page: Page): Locator => page.getByTestId('frame-position');
const map = (page: Page): Locator => page.getByTestId('program-map');

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

async function readerIdOf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === 'ab_ovo_rid');
  expect(cookie, 'no reader cookie was minted, so there is no reader to slow down').toBeTruthy();
  return cookie!.value;
}

/** Holds each of this reader's calls to the API for `ms` first (`PUT ?delay=`). */
async function slow(reader: string, ms: number): Promise<void> {
  const response = await fetch(`${FAULT}/__fault/${encodeURIComponent(reader)}?delay=${ms}`, {
    method: 'PUT',
  });
  expect(response.status, 'the fault fixture refused the delay').toBe(204);
  expect(
    response.headers.get('x-ab-ovo-fault-delay'),
    'the fault fixture did not take the delay — one older than this checkout, left listening by an earlier local run?',
  ).toBe(String(ms));
}

/** Gives this reader the API back, on time (`DELETE`). */
async function restore(reader: string): Promise<void> {
  const response = await fetch(`${FAULT}/__fault/${encodeURIComponent(reader)}`, { method: 'DELETE' });
  expect(response.status, 'the fault fixture refused to give the reader back').toBe(204);
}

/**
 * Frame `n`, rendered and hydrated. A link pressed before the page hydrates is an ordinary page
 * load, which the browser shows by itself and this code never sees — so the test waits on the
 * flag `frame-keys.tsx` raises once the islands are live, as `reading.spec.ts` does.
 */
async function open(page: Page, n: number): Promise<void> {
  await page.goto(at(n));
  await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, n, 'en'));
  await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);
}

/**
 * One move back from frame `n`, made by `press` while every call this reader makes to the API
 * is held, and what the page must show from the press until the frame before has arrived.
 */
async function goBackWhileHeld(page: Page, n: number, press: () => Promise<void>): Promise<void> {
  const reader = await readerIdOf(page.context());

  // The flag is there before anything is pending — it is how the stylesheet and a screen
  // reader tell the two states apart — and it says so.
  const label = previous(page).locator('[data-pending]');
  await expect(label).toHaveAttribute('data-pending', 'no');
  const pagerAt = await boxOf(pager(page));
  const previousAt = await boxOf(previous(page));

  await slow(reader, HOLD_MS);
  await press();

  // THE PRESS WAS TAKEN: the flag, what it says to a screen reader, and what it shows — the
  // cursor, and the arrow leaning the way the reader is going.
  await expect(label, 'Previous showed nothing while its frame was on its way').toHaveAttribute(
    'data-pending',
    'yes',
  );
  await expect(label).toHaveAttribute('aria-busy', 'true');
  await expect(previous(page)).toHaveCSS('cursor', 'progress');
  await expect(previous(page).locator('svg')).not.toHaveCSS('animation-name', 'none');

  // ON THE FRAME IT WAS PRESSED ON, which is still here, under a pager that has not moved.
  // One-shot, and deliberately: "not yet" is a statement about this moment, and a polling
  // assertion would wait for the moment to pass.
  expect(page.url(), 'the frame left before the one it asked for had arrived').toContain(at(n));
  expect(await boxOf(pager(page)), 'the pager moved while the frame was on its way').toEqual(pagerAt);
  expect(await boxOf(previous(page)), 'Previous moved while its frame was on its way').toEqual(
    previousAt,
  );

  // And then the frame arrives, the wait ends, and the pager is where it was.
  await expect(page).toHaveURL(new RegExp(`${at(n - 1)}$`));
  await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, n - 1, 'en'));
  await expect(label, 'Previous still says it is waiting on a frame that arrived').toHaveAttribute(
    'data-pending',
    'no',
  );
  await expect(previous(page)).not.toHaveCSS('cursor', 'progress');
  expect(await boxOf(pager(page)), 'the pager moved when the frame arrived').toEqual(pagerAt);

  await restore(reader);
}

test.describe('a frame on its way', () => {
  test.skip(!FAULT, NEEDS_FAULT);

  test('Previous says it was pressed while the book’s server works, and the pager does not move @core', async ({
    page,
  }) => {
    const pageErrors = collectPageErrors(page);
    const n = 3;
    await walkTo(page, unitId, 'en', n);
    await open(page, n);

    await goBackWhileHeld(page, n, () => previous(page).click());

    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('`←` says the same on Previous, because it presses Previous rather than going by itself @core', async ({
    page,
  }) => {
    /*
      `←` pushed the address itself, outside the link, so the link had no wait to report and
      the page showed nothing until the frame arrived. It presses the pager's own `Previous`
      now (`frame-keys.tsx`), as `→` presses `Next` — so the key's wait is the button's.
    */
    const pageErrors = collectPageErrors(page);
    const n = 3;
    await walkTo(page, unitId, 'en', n);
    await open(page, n);

    await goBackWhileHeld(page, n, () => page.keyboard.press('ArrowLeft'));

    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('a heading or a frame number chosen in the program map is said on the pager until it arrives @core', async ({
    page,
  }) => {
    const pageErrors = collectPageErrors(page);
    // The first frame of the second heading, so the first heading is behind the reader and the
    // map offers it as a link (a heading past the furthest frame is locked, not linked).
    const [first, second] = unit.sections;
    if (!first || !second) {
      throw new Error(`${unitId} has fewer than two headings, so the map offers nothing behind`);
    }
    await walkTo(page, unitId, 'en', second.firstStep);
    await open(page, second.firstStep);
    const reader = await readerIdOf(page.context());
    const pagerAt = await boxOf(pager(page));

    await slow(reader, HOLD_MS);

    /*
      A HEADING. The map shuts on the press (`popover-closer.tsx`), so the row that was pressed
      is off the screen before it could say anything: the map's door says it instead — the
      position that opened it pulses, with the cursor to match, until the frame arrives.
    */
    await position(page).click();
    await expect(map(page)).toBeVisible();
    await map(page).getByRole('link', { name: first.titles.en! }).click();

    await expect(map(page), 'the map stayed open over the frame it was leaving').toBeHidden();
    await expect(position(page), 'nothing said the chosen heading was on its way').toHaveCSS(
      'cursor',
      'progress',
    );
    await expect(position(page)).not.toHaveCSS('animation-name', 'none');
    expect(page.url(), 'the frame left before the heading had arrived').toContain(at(second.firstStep));
    expect(await boxOf(pager(page)), 'the pager moved while the heading was on its way').toEqual(
      pagerAt,
    );

    await expect(page).toHaveURL(new RegExp(`${at(first.firstStep)}$`));
    await expect(position(page)).toContainText(`${first.firstStep} of ${unit.steps.length}`);
    await expect(position(page), 'the position still says it is waiting').toHaveCSS(
      'animation-name',
      'none',
    );

    /*
      A FRAME NUMBER. `Go` is not a link, so its flag is its own (`frame-jumper.tsx`, a
      transition around the push) — and it is read from the same place.
    */
    const target = second.firstStep - 1;
    await position(page).click();
    await expect(map(page)).toBeVisible();
    await map(page).locator('#frame-jumper').fill(String(target));
    await map(page).getByRole('button', { name: 'Go', exact: true }).click();

    // By its shape rather than its role from here on: the map is shut, and a role query does
    // not find what is inside a panel that is not displayed.
    const go = map(page).locator('button[type="submit"]');
    await expect(map(page)).toBeHidden();
    await expect(go, 'Go carried no flag while its frame was on its way').toHaveAttribute(
      'data-pending',
      'yes',
    );
    await expect(position(page), 'nothing said the jump was on its way').toHaveCSS(
      'cursor',
      'progress',
    );
    await expect(position(page)).not.toHaveCSS('animation-name', 'none');
    expect(await boxOf(pager(page)), 'the pager moved while the jump was on its way').toEqual(pagerAt);

    await expect(page).toHaveURL(new RegExp(`${at(target)}$`));
    await expect(position(page)).toContainText(`${target} of ${unit.steps.length}`);
    await expect(go).toHaveAttribute('data-pending', 'no');
    await expect(position(page)).toHaveCSS('animation-name', 'none');

    await restore(reader);
    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });
});
