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
 * THROUGH THE BFF PROXY, FROM INSIDE THE PAGE — NEVER `page.request`. A first draft used
 * `page.request.post`, which is exactly the mistake `bearer-hop.spec.ts`'s header already
 * measured and named: Playwright's `APIRequestContext` is not the page's own site as far as
 * Chromium's cookie jar is concerned, so a `SameSite=Strict` cookie (`ab_ovo_rid` and
 * `ab_ovo_at` both are — ADR-0061, session-cookies.ts) is withheld from it, and the proxy
 * sees neither identity and answers "No reader identity". `throughProxy`'s own doc comment
 * says the fix: the call has to be `fetch`, made BY the page, so the browser attaches its
 * own cookies the way it would for any same-origin request a reader's own click makes.
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
   * matcher excludes `/api/*` — the fetch below mints nothing by itself). NOT ONE OF THIS
   * FUNCTION'S OWN CHOOSING when the caller is already mid-journey (on a contents page,
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
    const result = await page.evaluate(
      async ([url, payload]) => {
        const response = await fetch(url as string, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: payload as string,
        });
        return { status: response.status, body: await response.text() };
      },
      [
        `/api/proxy/api/v1/content/${track}/${unit}/advance`,
        JSON.stringify({ answeringStep: answering, language }),
      ] as const,
    );

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`advance(${unit}, answering ${answering}) answered ${result.status}: ${result.body}`);
    }

    // The gate answers refusals as DATA, 200 and all (ContentEndpoints.cs — "never an HTTP
    // error"), so a 200 alone does not say the cursor moved. `ok` is the field that does.
    const parsed = JSON.parse(result.body) as { ok: boolean; refusal?: { kind: string } };
    if (!parsed.ok) {
      throw new Error(
        `advance(${unit}, answering ${answering}) refused: ${parsed.refusal?.kind ?? 'unknown'}`,
      );
    }
  }
}
