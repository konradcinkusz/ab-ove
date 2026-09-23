import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — an anonymous reader's place is theirs, and only the cookie that holds it can
 * claim it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * ADR-0061. A reader with no account is identified by an opaque cookie, `ab_ovo_rid`: a
 * random value, not a token, and "possession of this value is the only credential"
 * (`lib/reader-cookie.ts`). Two properties follow, and neither was asserted by any spec:
 *
 *   1. THE COOKIE IS OUT OF THE PAGE'S REACH — `HttpOnly`, `SameSite=Strict`, `Secure` —
 *      because a value that IS the credential must not be readable by a script on the page,
 *      sent by another site's form, or read off plain HTTP.
 *
 *   2. NO HEADER CAN STAND IN FOR IT. The API reads a reader's id from a header,
 *      `x-ab-ovo-reader-id`, which this app's servers inject from the cookie — the BFF proxy
 *      for a request the page makes, the Server Components for a page they render. The proxy
 *      DROPS the header when a client sends it (`api/proxy/[...path]/route.ts`), "a client
 *      that could set its own reader-id header could claim any other anonymous reader's
 *      cursor". That sentence is the whole of the protection, and nothing held it.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERY REFUSAL BELOW HAS A CONTROL BESIDE IT: the reader whose id is being claimed can read
 * the same step, and a context holding that reader's COOKIE can too. Without them a refusal
 * would pass for a proxy that refuses everything.
 */

const UNIT = 'F01';
const program = unitNamed(UNIT);
/** How far reader A has read — far enough that a fresh reader is refused it. */
const AHEAD = Math.min(6, program.steps.length - 1);

const COOKIE = 'ab_ovo_rid';
const HEADER = 'x-ab-ovo-reader-id';

const frameAt = (n: number): string => `/read/${track}/${UNIT}/en/${n}`;
const stepThrough = (n: number): string => `/api/proxy/api/v1/content/${track}/${UNIT}/${n}`;
const advanceThrough = `/api/proxy/api/v1/content/${track}/${UNIT}/advance`;

interface StepAnswer {
  readonly ok: boolean;
  readonly refusal?: { readonly kind: string; readonly furthest: number } | null;
}

async function readerIdOf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === COOKIE);
  expect(cookie, 'no reader cookie was minted, so there is no place to claim').toBeTruthy();
  return cookie!.value;
}

/** A step through this app's proxy, asked for by the page itself — with any header it adds. */
async function askForStep(page: Page, n: number, headers: Record<string, string> = {}): Promise<StepAnswer> {
  return page.evaluate(
    async ([url, extra]) => {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', headers: extra });
      return (await response.json()) as StepAnswer;
    },
    [stepThrough(n), headers] as const,
  );
}

test.describe('an anonymous reader’s place', () => {
  test('is held in a cookie the page cannot read, another site cannot send, and plain HTTP cannot carry @core', async ({
    page,
    context,
  }) => {
    await page.goto(frameAt(1));

    const cookie = (await context.cookies()).find((candidate) => candidate.name === COOKIE);
    expect(cookie, 'arriving at a frame minted no reader cookie').toBeTruthy();
    expect(cookie!.httpOnly, 'the page can read the value that IS the credential').toBe(true);
    expect(cookie!.sameSite, 'another site could send the reader’s place along').toBe('Strict');
    expect(cookie!.secure, 'the credential may travel over plain HTTP').toBe(true);
    expect(cookie!.path).toBe('/');
    // Opaque and random: a UUID, which carries nothing about the reader and cannot be guessed.
    expect(cookie!.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // Long-lived: a resume mechanism meant to be found a year later (about 400 days).
    const days = (cookie!.expires - Date.now() / 1000) / 86_400;
    expect(days, 'the place would be forgotten long before a reader comes back').toBeGreaterThan(300);

    expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);

    // Minted once: the next page keeps the same place rather than starting a new reader.
    await page.goto(`/read/${track}/${UNIT}/en`);
    expect(await readerIdOf(context)).toBe(cookie!.value);
  });

  test('cannot be claimed by another reader with a header, through the proxy @core', async ({ browser }) => {
    const readerA = await browser.newContext();
    const pageA = await readerA.newPage();
    await walkTo(pageA, UNIT, 'en', AHEAD);
    const idA = await readerIdOf(readerA);

    // CONTROL: A reads the step A has reached.
    expect((await askForStep(pageA, AHEAD)).ok, 'reader A cannot read its own furthest step').toBe(true);

    const readerB = await browser.newContext();
    const pageB = await readerB.newPage();
    await pageB.goto(frameAt(1));
    expect(await readerIdOf(readerB), 'two contexts were given the same reader').not.toBe(idA);

    // B claims A's place with the header the proxy injects — and gets B's own place.
    const claimed = await askForStep(pageB, AHEAD, { [HEADER]: idA });
    expect(claimed.ok, 'a header claimed another reader’s place').toBe(false);
    expect(claimed.refusal?.kind).toBe('NotReached');
    expect(claimed.refusal?.furthest, 'the refusal is not B’s own').toBe(1);

    // And B cannot MOVE A's place either: an advance sent with A's id leaves A where A was.
    await pageB.evaluate(
      async ([url, header, id, answering]) => {
        await fetch(url, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', [header]: id },
          body: JSON.stringify({ answeringStep: answering, language: 'en' }),
        });
      },
      [advanceThrough, HEADER, idA, AHEAD] as const,
    );
    const next = await askForStep(pageA, AHEAD + 1);
    expect(next.ok, 'another reader’s advance moved A’s place').toBe(false);
    expect(next.refusal?.furthest).toBe(AHEAD);

    // CONTROL: the COOKIE is the credential — a third context holding A's cookie is A.
    const holder = await browser.newContext();
    const origin = new URL(pageA.url()).origin;
    await holder.addCookies([
      { name: COOKIE, value: idA, url: origin, httpOnly: true, secure: true, sameSite: 'Strict' },
    ]);
    const pageHolder = await holder.newPage();
    await pageHolder.goto(frameAt(1));
    expect((await askForStep(pageHolder, AHEAD)).ok, 'A’s own cookie does not reach A’s place').toBe(true);

    await Promise.all([readerA.close(), readerB.close(), holder.close()]);
  });

  test('cannot be claimed by another reader with a header on a page request either @core', async ({ browser }) => {
    /*
      THE OTHER DOOR. The frame's Server Component reads the reader's place itself, from the
      cookie, and sends the header to the API on the server (`lib/server/content.ts`). A
      header on the page REQUEST must not reach that — so B navigates with A's id on every
      request it makes, and is told the frame is not reached yet, as a fresh reader is.
    */
    const readerA = await browser.newContext();
    const pageA = await readerA.newPage();
    await walkTo(pageA, UNIT, 'en', AHEAD);
    const idA = await readerIdOf(readerA);
    const probe = uniqueProbeIn(program, AHEAD, 'en');

    // CONTROL: A is served the frame.
    await pageA.goto(frameAt(AHEAD));
    await expect(pageA.locator('article')).toContainText(probe);

    const readerB = await browser.newContext({ extraHTTPHeaders: { [HEADER]: idA } });
    const pageB = await readerB.newPage();
    await pageB.goto(frameAt(AHEAD));
    await expect(pageB.getByRole('heading', { level: 1 })).toHaveText('Not there yet');
    await expect(pageB.locator('body'), 'the frame reached B through A’s id').not.toContainText(probe);

    await Promise.all([readerA.close(), readerB.close()]);
  });
});
