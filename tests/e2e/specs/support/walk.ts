import type { Page } from '@playwright/test';

import { track } from './bundle.ts';

/**
 * RAISES THIS READER'S SERVER-SIDE CURSOR TO `step`, THROUGH THE REAL `advance` ENDPOINT —
 * NEVER BY CLICKING.
 *
 * ADR-0060 gave the reveal a real gate: a fresh reader's cursor starts at step 1, and
 * `AbOvo.Api`'s `Reveal.Serve` refuses `GET .../{step}` for anything past it with
 * `NotReached`. Before that ADR a spec could `page.goto` straight to any step of an open
 * program — there was nothing server-side to have not reached. Most of this suite's specs
 * were written then, and many still open on a frame found by searching the book for some
 * property (an asking frame with a numeric answer, the first `cue` step, ...) rather than on
 * frame 1 — which is exactly the case the gate now refuses for a reader who arrives with no
 * history.
 *
 * WHY THIS CALLS THE ENDPOINT DIRECTLY RATHER THAN CLICKING THROUGH EVERY INTERVENING FRAME.
 * `support/gate.ts`'s `openThrough` sets the precedent: seed the record a walk would have
 * left, directly, rather than performing the walk in the browser — "the cheapest honest way
 * to be that reader". Clicking N-1 reveals here would work too, but it is what a first draft
 * of this fix did and it is why PR #129's e2e job took thirty-plus minutes: real page loads,
 * real renders, real KaTeX, repeated for every spec that opens past frame 1. The `advance`
 * endpoint is the ONE thing that actually moves the cursor (`ContentEndpoints.cs`'s own
 * comment: "the only way this service's cursor moves forward") — calling it directly raises
 * the exact same row `ReaderProgress` would hold after N real clicks, in N requests with no
 * browser work behind them.
 *
 * THROUGH THE BFF PROXY (`/api/proxy/api/v1/content/...`), NEVER STRAIGHT TO `AbOvo.Api` —
 * the one thing a raw `fetch` here cannot do for itself is identity. The proxy already reads
 * whichever cookie this reader actually has (`ACCESS_TOKEN_COOKIE` for a signed-in reader,
 * `READER_ID_COOKIE` for an anonymous one — `route.ts`'s own header injection) and attaches
 * the right one; this helper would otherwise have to know which case it is in and duplicate
 * that translation. `page.request` shares the page's own cookie jar for a same-origin call,
 * which a relative URL against `playwright.config.ts`'s `baseURL` is.
 *
 * WHY IT NEEDS A REAL `AbOvo.Api`, said once here rather than swallowed as a skip: a
 * developer running the suite with no API gets the same "throws to `app/error.tsx`" outcome
 * every OTHER reading-surface spec already gets without one — this is not a new requirement,
 * it is the same one `playwright.config.ts`'s `apiBaseUrl` already documents.
 */
export async function walkTo(
  page: Page,
  unit: string,
  language: string,
  step: number,
): Promise<void> {
  if (step <= 1) return;

  /*
   * A NAVIGATION IS WHAT MINTS THE READER'S COOKIE (`web/app/src/middleware.ts`, whose own
   * matcher excludes `/api/*` — the proxy call below mints nothing by itself). NOT ONE OF
   * THIS FUNCTION'S OWN CHOOSING when the caller is already mid-journey (on a contents page,
   * about to click a link): navigating here would leave that click landing on the wrong
   * page. Only when there is reason to think none has happened yet.
   */
  const hasSession =
    (await page.context().cookies()).find(
      (entry) => entry.name === 'ab_ovo_rid' || entry.name === 'ab_ovo_at',
    ) !== undefined;
  if (!hasSession) {
    await page.goto(`/read/${track}/${unit}/${language}/1`);
  }

  for (let answering = 1; answering < step; answering += 1) {
    const response = await page.request.post(
      `/api/proxy/api/v1/content/${track}/${unit}/advance`,
      {
        headers: { 'content-type': 'application/json' },
        data: { answeringStep: answering, language },
      },
    );
    if (!response.ok()) {
      throw new Error(
        `advance(${unit}, answering ${answering}) answered ${response.status()}: ${await response.text()}`,
      );
    }

    // The gate answers refusals as DATA, 200 and all (ContentEndpoints.cs — "never an HTTP
    // error"), so a 200 alone does not say the cursor moved. `ok` is the field that does.
    const body = (await response.json()) as { ok: boolean; refusal?: { kind: string } };
    if (!body.ok) {
      throw new Error(
        `advance(${unit}, answering ${answering}) refused: ${body.refusal?.kind ?? 'unknown'}`,
      );
    }
  }
}
