import { expect, test, type Locator, type Page } from '@playwright/test';

import { track, unitNamed } from './support/bundle.ts';
import { openPane } from './support/pane.ts';
import { reveal } from './support/reveal.ts';

/**
 * JOURNEY — the reveal shows the reader's own working and sketch, not only the typed line (#168).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * The frame after a reveal opens with the book's answer and the reader's line beside it
 * (`worksheet.spec.ts` holds that half). What the reader worked out to reach the line — the
 * lines in *Work it out*, the drawing in *Draw it* — stayed on the frame before, so the
 * comparison the book is built on (ADR-0010) had half of the reader's side. The answer box now
 * offers the rest, behind one closed button, and only when there is a rest to offer.
 *
 * WHAT IS ASSERTED, AND FROM WHERE:
 *
 *   - the offer and what it opens, from the reader's side: its words, both halves of the work,
 *     a drawing that has ink in it — and, from outside, that none of it went on the wire
 *     (ADR-0039);
 *   - its absence, as the issue's other half asks: a frame whose predecessor holds neither
 *     offers nothing, whether the router brought it or the server rendered it;
 *   - that it arrives without moving the frame, both ways a frame arrives — which is the one
 *     design choice here, and `previous-work.tsx` is where it is argued.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * FRAMES 1 AND 2 OF F01, CHECKED RATHER THAN ASSUMED. The first program is open to every reader
 * and frame 1 needs no walk, so the reveal between them is the reader's own click and nothing
 * here seeds the gate. If the book stops asking on frame 1, this says so at load.
 */
const UNIT = 'F01';
const steps = unitNamed(UNIT).steps;
if (!steps.find((step) => step.n === 1)?.cue || !steps.find((step) => step.n === 2)?.answer) {
  throw new Error(`${UNIT}'s frame 1 no longer asks, or frame 2 no longer answers it, so this proves nothing`);
}

const at = (language: string, n: number): string => `/read/${track}/${UNIT}/${language}/${n}`;
const SHEET = `ab-ovo:sheet:v1:${track}/${UNIT}/1`;

/**
 * The pad's lines: arithmetic, as the pad is for, and a line of words nobody else may read — the
 * needle for the wire.
 */
const NEEDLE = 'worked out here and nowhere else';
const LINES = ['2 + 2', 'w = 0.5', 'w * 4', NEEDLE];

/** The offer, by the attribute it carries in every state it has: shown, or held unseen. */
const offerOn = (page: Page): Locator => page.locator('details[data-kept]');

/** Frame 1's sheet, as the store keeps it. */
const sheet = (page: Page): Promise<{ working?: string; hasSketch?: boolean } | null> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SHEET);

/**
 * How many strokes IndexedDB holds for frame 1. It never creates the database the application
 * owns: an upgrade it did not ask for is aborted, so a poll that runs before the pad's first
 * write finds nothing rather than a database with no store in it.
 */
const strokesKept = (page: Page): Promise<number> =>
  page.evaluate(
    (key) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('ab-ovo-sheet', 1);
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const database = open.result;
          if (!database.objectStoreNames.contains('sketches')) {
            database.close();
            resolve(0);
            return;
          }
          const get = database.transaction('sketches', 'readonly').objectStore('sketches').get(key);
          get.onsuccess = () => {
            database.close();
            resolve(Array.isArray(get.result) ? get.result.length : 0);
          };
          get.onerror = () => {
            database.close();
            resolve(0);
          };
        };
      }),
    SHEET,
  );

/** How many of a canvas's pixels carry ink — the only way to see what one shows. */
const inkOn = (canvas: Locator): Promise<number> =>
  canvas.evaluate((node) => {
    const element = node as HTMLCanvasElement;
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) lit += 1;
    return lit;
  });

/**
 * Wait until the frame's islands are bound — `worksheet.spec.ts`'s `paneReady`, for its reason:
 * a `<details>` opens without JavaScript, and a pad or a canvas opened before hydration has no
 * handler behind it.
 */
async function islandsBound(page: Page): Promise<void> {
  await expect(page.locator('[data-frame-keys="on"]'), 'the frame’s islands never attached').toHaveCount(1);
}

/** Work it out on frame 1's pad, and wait until the pad has kept it. */
async function workItOut(page: Page): Promise<void> {
  await openPane(page, 'working');
  const pad = page.getByRole('textbox', { name: /your working/i });
  await pad.fill(LINES.join('\n'));
  // The pad commits when the reader leaves it (`working.tsx`).
  await pad.blur();
  await expect
    .poll(async () => (await sheet(page))?.working, { message: 'the pad kept nothing, so nothing below proves anything' })
    .toBe(LINES.join('\n'));
}

/**
 * Draw one stroke on frame 1's canvas, and wait until both halves of it are kept: the flag in
 * the sheet and the strokes in IndexedDB. The canvas is brought to the middle of the window first,
 * clear of the pager pinned over its foot — `worksheet.spec.ts`'s `sketchPad` says what a raw
 * `page.mouse` press outside the canvas does, which is nothing, silently.
 */
async function drawIt(page: Page): Promise<void> {
  await openPane(page, 'sketch');
  const canvas = page.getByLabel(/draw your answer/i);
  await canvas.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  const box = await canvas.boundingBox();
  const pager = await page.locator('[data-pager="pinned"]').boundingBox();
  expect(box, 'the pad has no box, so nothing below draws anything').toBeTruthy();
  expect(pager, 'the frame has no pinned pager to keep the stroke clear of').toBeTruthy();
  expect(box!.y + 140 < pager!.y, 'the stroke would reach under the pager and press it').toBe(true);

  await page.mouse.move(box!.x + 60, box!.y + 40);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(box!.x + 60 + i * 14, box!.y + 40 + i * 8);
  await page.mouse.up();

  await expect.poll(async () => (await sheet(page))?.hasSketch, { message: 'the sketch was not kept' }).toBe(true);
  await expect.poll(() => strokesKept(page), { message: 'the strokes never reached IndexedDB' }).toBeGreaterThan(0);
}

/** Where the offer is and how tall, and where the frame's own answer line is below it. */
const placesOf = (page: Page): Promise<{ offer: number; offerHeight: number; answerLine: number }> =>
  page.evaluate(async () => {
    // Measured once the faces are in, so a font arriving is not mistaken for the offer.
    await document.fonts.ready;
    const top = (element: Element | null): number =>
      Math.round((element?.getBoundingClientRect().top ?? Number.NaN) + window.scrollY);
    const offer = document.querySelector('details[data-kept]');
    return {
      offer: top(offer),
      offerHeight: Math.round(offer?.getBoundingClientRect().height ?? Number.NaN),
      answerLine: top(document.getElementById('answer-line')),
    };
  });

test.describe('the reveal shows the reader’s working', () => {
  test('pad lines and a sketch on frame 1 are offered on frame 2, and opening shows both @core', async ({
    page,
  }) => {
    await page.goto(at('en', 1));
    await islandsBound(page);
    // The whole of a reader's side: the line, the pad and the drawing.
    await page.getByRole('textbox', { name: /your answer/i }).fill('it needs a sign');
    await workItOut(page);
    await drawIt(page);

    // Everything the page asks for from here on: ADR-0039's promise, held from outside.
    const sent: string[] = [];
    page.on('request', (request) => sent.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`));

    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 2)}$`));

    await expect(page.locator('#frame-answer'), 'the reader’s line did not come back').toContainText('it needs a sign');
    const offer = offerOn(page);
    await expect(offer, 'frame 2 does not offer what was worked out on frame 1').toBeVisible();
    // It names both halves, and the frame they are from — this frame has a pad of its own.
    await expect(offer.locator('summary')).toHaveAccessibleName('Show my working and sketch (frame 1)');
    // And it is shut until the reader opens it (ADR-0043).
    await expect(offer, 'the offer opened itself').not.toHaveAttribute('open');

    /*
      A FINGER TALL TO PRESS, AND NOT OVER THE READER'S WORDS (#147). The row is a line of text,
      and the box a press lands in is drawn round it rather than padded into it — padded, the
      box and the focus ring on it reached down through the foot of the `You wrote` line. So it
      is asked of the page where a press lands: across 44 px through the button's middle, and
      nowhere on the words above it, down to the foot of their glyphs.
    */
    const reach = await offer.locator('summary').evaluate((summary) => {
      const lands = (x: number, y: number): boolean => summary.contains(document.elementFromPoint(x, y));
      const box = summary.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const middle = box.top + box.height / 2;
      let up = 0;
      while (lands(x, middle - up - 1)) up += 1;
      let down = 0;
      while (lands(x, middle + down + 1)) down += 1;
      // `You wrote`'s label and the reader's line: an inline box is as tall as its glyphs.
      const words = Array.from(document.querySelectorAll('#frame-answer p[aria-live] span'), (span) =>
        span.getBoundingClientRect(),
      );
      return {
        tall: up + down + 1,
        words: words.length,
        onTheWords: words.some(
          (word) => lands(word.left + 2, word.bottom - 1) || lands(word.right - 2, word.bottom - 1),
        ),
      };
    });
    expect(reach.tall, 'the offer is not a finger tall to press').toBeGreaterThanOrEqual(43);
    expect(reach.words, 'the reader’s line is not on the frame, so no press on it was tried').toBeGreaterThan(0);
    expect(reach.onTheWords, 'a press on the reader’s own line would land on the offer').toBe(false);

    await offer.locator('summary').click();
    await expect(offer, 'the offer did not open').toHaveAttribute('open', '');
    await expect(offer.getByRole('figure', { name: 'Your working' }).locator('pre')).toHaveText(LINES.join('\n'));
    const drawing = offer.getByRole('img', { name: 'Your sketch' });
    await expect(drawing).toBeVisible();
    await expect.poll(() => inkOn(drawing), { message: 'the sketch came back empty' }).toBeGreaterThan(0);

    const leaked = sent.filter((entry) => entry.includes(NEEDLE) || entry.includes(encodeURIComponent(NEEDLE)));
    expect(leaked, 'the reader’s own working was put on the wire').toEqual([]);
    const asked = sent.filter((entry) => entry.includes('/api/proxy'));
    expect(asked, 'showing a reader their own work asked a server').toEqual([]);
  });

  test('with neither on frame 1, frame 2 offers nothing new, turned to or loaded @core', async ({ page }) => {
    await page.goto(at('en', 1));
    await islandsBound(page);
    // An answer, which `You wrote` shows and which is not new — and nothing in the pad or the sketch.
    await page.getByRole('textbox', { name: /your answer/i }).fill('an answer and nothing else');

    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 2)}$`));
    await expect(
      page.locator('#frame-answer'),
      'the reader’s line did not come back, so this is not the frame the test is about',
    ).toContainText('an answer and nothing else');

    // Turned to, the browser read the sheet before the first paint: there is nothing at all.
    await expect(offerOn(page), 'a frame turned to offered a disclosure with nothing behind it').toHaveCount(0);

    // Loaded, the server could not know, so its closed row is there — and unseen: no words, no
    // Tab stop, nothing a screen reader is given.
    await page.reload();
    await islandsBound(page);
    await expect(offerOn(page), 'a loaded frame held no row, so an offer would have moved it').toHaveCount(1);
    await expect(offerOn(page)).toHaveAttribute('data-kept', 'none');
    await expect(offerOn(page), 'a loaded frame shows an offer with nothing behind it').toBeHidden();
  });

  test('the offer arrives without moving the frame, turned to or loaded @core', async ({ page, browser }) => {
    /*
      ────────────────────────────────────────────────────────────────────────────────────
      THE TWO WAYS A FRAME ARRIVES, AND THE TWO RULES THAT KEEP THE OFFER FROM MOVING IT.

      Turned to, the router renders the frame in the browser and the offer is in its first
      paint. So where the frame's answer line is in the new frame's FIRST animation frame — the
      callback runs before that frame is painted, and asking for a box lays it out as it will be
      painted — is where it must still be once the offer is showing.

      NOT A LAYOUT-SHIFT SCORE, and the reason was measured. A `PerformanceObserver` counting
      every shift inside the new frame, recent input or not, went on reading nothing against a
      build whose offer arrived 150 ms after the frame, because its callbacks are delivered
      after the frames that caused them; `reading.spec.ts` waits 700 ms for them. A position
      read inside the frame it is painted in has nothing to wait for.

      Loaded, the server paints first and cannot know; it holds the offer's row unseen, and the
      browser shows it in the same box. So the server's page — read here with no script at all,
      which is that page and nothing else — and the hydrated one must put the offer and the frame
      below it in the same place.

      Only the pad, and no answer line: `You wrote` keeps its own row, and this is about the
      offer's.
      ────────────────────────────────────────────────────────────────────────────────────
    */
    await page.goto(at('en', 1));
    await islandsBound(page);
    await workItOut(page);

    await page.evaluate(() => {
      const scope = window as unknown as { __firstPainted?: number };
      // Frame 1 has no answer box and frame 2 has one, so its arrival is the new frame's.
      const arrived = new MutationObserver(() => {
        if (!document.getElementById('frame-answer')) return;
        arrived.disconnect();
        requestAnimationFrame(() => {
          const line = document.getElementById('answer-line');
          scope.__firstPainted = line ? Math.round(line.getBoundingClientRect().top + window.scrollY) : Number.NaN;
        });
      });
      arrived.observe(document.body, { childList: true, subtree: true });
    });

    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 2)}$`));
    const firstPainted = (): Promise<number | undefined> =>
      page.evaluate(() => (window as unknown as { __firstPainted?: number }).__firstPainted);
    await expect
      .poll(firstPainted, { message: 'the new frame was never seen arriving, so nothing here measured it' })
      .toEqual(expect.any(Number));
    await expect(offerOn(page).locator('summary')).toHaveAccessibleName('Show my working (frame 1)');
    const settled = await placesOf(page);
    expect(settled.answerLine, 'the offer arrived after the frame was painted, and moved it').toBe(
      await firstPainted(),
    );

    await page.reload();
    await islandsBound(page);
    await expect(offerOn(page), 'a loaded frame did not offer the working').toBeVisible();
    const hydrated = await placesOf(page);

    const withoutScript = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
      viewport: page.viewportSize(),
    });
    try {
      const served = await withoutScript.newPage();
      await served.goto(page.url());
      await expect(offerOn(served), 'the server rendered no row for the offer to arrive in').toHaveCount(1);
      await expect(offerOn(served)).toBeHidden();
      expect(await placesOf(served), 'showing the offer after hydration moved it or the frame below it').toEqual(
        hydrated,
      );
    } finally {
      await withoutScript.close();
    }
  });

  test('in Polish the offer says what it holds in Polish @core', async ({ page }) => {
    // The sheet has no edition in its key (`lib/sheet/store.ts`), so the Polish reader's working
    // is the same working; what changes is every word around it.
    await page.goto(at('pl', 1));
    await islandsBound(page);
    await openPane(page, 'working');
    const pad = page.getByRole('textbox', { name: /twoje obliczenia/i });
    await pad.fill('1,5 + 1,5');
    await pad.blur();
    await expect.poll(async () => (await sheet(page))?.working, { message: 'the pad kept nothing' }).toBe('1,5 + 1,5');

    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('pl', 2)}$`));
    const offer = offerOn(page);
    await expect(offer.locator('summary')).toHaveAccessibleName('Pokaż moje obliczenia (ramka 1)');
    await offer.locator('summary').click();
    await expect(offer.getByRole('figure', { name: 'Twoje obliczenia' }).locator('pre')).toHaveText('1,5 + 1,5');
    await expect(offer.getByRole('img'), 'a pad alone was offered with a sketch').toHaveCount(0);
  });
});
