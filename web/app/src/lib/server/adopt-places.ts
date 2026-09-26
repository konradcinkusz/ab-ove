import { READER_ID_HEADER } from '../reader-cookie.ts';

import { backendCandidates } from './backends.ts';

/**
 * The account adopts the places this browser read without one, as a session begins —
 * ADR-0068, issue #176.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THE ACCOUNT HAS TO BE TOLD, AND WHY IT IS NOT THE BROWSER THAT TELLS IT.
 *
 * A reader with no account reads under the anonymous cursor, the `ab_ovo_rid` cookie
 * (ADR-0061). Once they are signed in the reveal gate asks the ACCOUNT's cursor instead, so an
 * account that has not heard of that place refuses them the frames they have just read. It
 * used to hear of it from the browser: the sync sent the browser's own number through `PUT` —
 * frame 40 here and frame 12 on the account sent 40 — which is a step no gate saw earned, and
 * the web half of the deviation-register row "`PUT` … can still name a step it did not earn".
 *
 * It hears of it from `AbOvo.Api` now. `POST /api/v1/progress/adopt` takes the steps of the
 * anonymous cursor's rows — which only the reveal's own `POST …/advance` ever moved — into the
 * account, the furthest frame winning, and leaves the anonymous rows as they were. What this
 * module sends is two identities and no step.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * AT SIGN-IN, FROM THIS ORIGIN'S SERVER, because that is the one moment it holds both: the
 * bearer it has just been handed and the cookie the browser sent with the form. Both go server
 * to server and neither passes through the document (FRONTEND-BFF.md §1). `establishSession`
 * makes the call, so every route that begins a session — a password, a second factor, a new
 * account, a handed-over token — adopts, and a route added later cannot be the one that forgot.
 *
 * A FAILURE DOES NOT FAIL THE SIGN-IN. The session is good whatever `AbOvo.Api` answered, and a
 * reader turned away because a second service was slow would be turned away for nothing they
 * did. What a failure costs, and what repairs it, is ADR-0068's to say: the frames read without
 * an account are refused while signed in, until a later sign-in adopts them — which it can,
 * because the anonymous rows are still there.
 *
 * The candidate ladder and the budgets are `content.ts`'s, for its reason: the reader is
 * waiting for a page to arrive, and only the address a deployment configured has earned the
 * full budget.
 */

/** `AbOvo.Api`'s adoption endpoint. The account is the bearer's; the cursor is the header's. */
const ADOPT_PATH = '/api/v1/progress/adopt';

const DEFAULT_TIMEOUT_MS = 8_000;
const GUESSED_RUNG_TIMEOUT_MS = 1_500;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_API_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

export type AdoptionOutcome =
  /** The API answered for this account: every place the cursor held is now the account's too. */
  | { readonly kind: 'adopted' }
  /** No anonymous cursor came with the request, so there is nothing to adopt. Nothing was asked. */
  | { readonly kind: 'nothing-to-adopt' }
  /**
   * No rung adopted anything. The reason is for the server's log — it names backend addresses
   * (FRONTEND-BFF.md §1) — and never for a page.
   */
  | { readonly kind: 'unavailable'; readonly reason: string };

/** Injectable for tests, on `account-places.ts`'s pattern. The global is production's only one. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Ask `AbOvo.Api` to adopt the anonymous cursor's places into the bearer's account.
 *
 * The ladder walks on a transport failure and on an ambiguous status, and STOPS on an answer
 * that is not ambiguous, as `account-places.ts` does and for its reasons: a 401 or a 403 is the
 * API refusing this bearer, and asking the next rung would be shopping for an address that
 * accepts it (ADR-0018); a 429 is the configured rung busy rather than absent. A 400 is the API
 * saying the cookie's value is no reader id — which every rung would say again.
 *
 * A 404 STOPS IT TOO, which `account-places.ts` does not do, and that was measured: pointed at
 * an `AbOvo.Api` older than this endpoint, the configured rung answered 404, the walk went on
 * through the addresses `backends.ts` guesses, and the line in the server's log named the last
 * of them — `localhost:8080: fetch failed` — rather than the API that had answered. A 404 from
 * the address a deployment configured is that API saying it has no such route; the log should
 * say so.
 */
export async function adoptAnonymousPlaces(
  accessToken: string,
  readerId: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<AdoptionOutcome> {
  if (!readerId) return { kind: 'nothing-to-adopt' };

  const candidates = backendCandidates('api');
  let last: AdoptionOutcome = { kind: 'unavailable', reason: 'no api is configured' };

  for (const [index, base] of candidates.entries()) {
    const budget = index === 0 ? timeoutMs() : GUESSED_RUNG_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);

    try {
      const response = await fetchImpl(`${base}${ADOPT_PATH}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          [READER_ID_HEADER]: readerId,
        },
        // Following a redirect would send the bearer and the cursor to an address nobody chose
        // — the same reasoning `deleteAccount` gives.
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      // The answer is the account as it now stands, which nothing here reads: this call is made
      // for what it does to the account. The body is let go rather than left open, and a body
      // that will not be let go is not a reason to ask the next rung.
      await response.body?.cancel().catch(() => undefined);

      if (response.ok) return { kind: 'adopted' };

      if ([400, 401, 403, 404, 429].includes(response.status)) {
        return { kind: 'unavailable', reason: `${base}: api answered ${response.status}` };
      }

      last = { kind: 'unavailable', reason: `${base}: api answered ${response.status}` };
    } catch (error) {
      const detail =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${budget}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      last = { kind: 'unavailable', reason: `${base}: ${detail}` };
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}

/**
 * What `establishSession` calls, in one line: adopt, and put a failure in the server's log
 * rather than in front of the reader. It never throws, because nothing about the session it
 * is called from depends on it (see the header above).
 */
export async function adoptOnSignIn(
  accessToken: string,
  readerId: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<AdoptionOutcome> {
  const outcome = await adoptAnonymousPlaces(accessToken, readerId, fetchImpl);
  if (outcome.kind === 'unavailable') {
    console.error(
      `sign-in: the account did not adopt this browser's places read without one: ${outcome.reason}`,
    );
  }
  return outcome;
}
