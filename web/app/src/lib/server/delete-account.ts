import { backendCandidates } from './backends.ts';

/**
 * Account deletion against authservice, from the server side only.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE CONTRACT, READ RATHER THAN REMEMBERED.
 *
 * `AuthController.DeleteAccount` — `[Authorize] [HttpDelete("account")]` under
 * `api/v1/[controller]` — takes `DeleteAccountRequest(string? Password, string
 * Confirmation)` and:
 *
 *   - refuses unless `Confirmation` is exactly `"DELETE"` (400);
 *   - requires the current password IF `user.PasswordHash != null`, and checks it (400);
 *     an OAuth-only account skips that branch entirely;
 *   - revokes the refresh tokens;
 *   - SOFT-deletes: `IsDeleted`, `DeletedAt`, and `ScheduledPermanentDeletionAt` a
 *     retention period out;
 *   - answers 200 `{ message }`.
 *
 * Two of those matter to this application far more than the happy path, and both are
 * things a reader has to be told rather than things this module can paper over.
 *
 * FIRST: THE DELETION IS NOT AN ERASURE. The account is marked and scheduled; the row
 * survives the retention period. A screen that said "your account has been deleted" full
 * stop would be claiming an erasure that has not happened, which is the same class of
 * defect as a metric that reports a rate without its interval.
 *
 * SECOND: THE RESPONSE DOES NOT CARRY THE DATE. `ScheduledPermanentDeletionAt` is computed
 * from a constant in authservice's own assembly and is logged and audited there; the body
 * this caller receives is a message and nothing else. So this application CANNOT state how
 * long the retention period is, and it must not copy the number out of another
 * repository's source — that is a figure nothing here can check, in a repository that does
 * not depend on the one that owns it, and it would go stale silently the day it changed.
 * The screen therefore says a retention period exists and that its length is authservice's
 * to state. ADR-0021.
 *
 * THIRD, and it decides the ordering in `forgetReader`: the ACCESS token is not revoked.
 * Only refresh tokens are. A token already minted stays valid until its own `exp`, and
 * nothing in this deployment consults authservice per request — the proxy injects the
 * bearer and `AbOvo.Api` verifies its signature, issuer and audience. So after a
 * successful deletion the reader is, from this origin's point of view, still signed in
 * until the cookies are cleared. Clearing them is this application's job and not a
 * courtesy.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * P11 — anti-corruption at the edge. authservice's statuses and body shapes appear here
 * and nowhere else; what leaves this module is one of this application's outcomes.
 */

/** authservice's account endpoint. The versioned path, never the unversioned alias. */
const ACCOUNT_PATH = '/api/v1/auth/account';

/**
 * The confirmation authservice demands, verbatim.
 *
 * It is sent by this module rather than typed through from the browser, and that is a
 * decision rather than a convenience: the literal is authservice's vocabulary, so a form
 * that posted it would be a form whose field had to change if authservice changed its
 * word. What the reader types is checked against THIS APPLICATION's word for it, in the
 * reader's own language — see `chrome.deleteConfirmWord`. A Polish reader typing `USUŃ`
 * is confirming as deliberately as an English one typing `DELETE`, and it would be absurd
 * to make them type an English word to prove they meant it.
 */
const CONFIRMATION = 'DELETE';

/**
 * Long enough for a scale-to-zero authservice to wake, start .NET and reach a cold
 * Postgres — the same arithmetic `sign-in.ts` does, and the same symptom if it is too
 * short. Deliberately the same variable: two timeouts for one backend is two numbers that
 * drift.
 */
const DEFAULT_TIMEOUT_MS = 45_000;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_AUTH_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/**
 * What happened, in this application's terms.
 *
 * `password-rejected` and `password-required` are separate because they are different
 * instructions to the reader — one says "try again", the other says "this account has a
 * password and you did not give one", and an OAuth-only reader must never see either.
 */
export type DeleteAccountOutcome =
  /** authservice accepted it. The account is marked deleted and scheduled for erasure. */
  | { readonly kind: 'deleted' }
  /** A password account, and the field was empty. */
  | { readonly kind: 'password-required' }
  /** A password account, and the password was wrong. */
  | { readonly kind: 'password-rejected' }
  /**
   * The bearer was not accepted. The reader's session expired between opening the page
   * and confirming, which on a screen that asks for a password is a realistic gap.
   */
  | { readonly kind: 'unauthenticated' }
  /**
   * authservice has no such user. Nothing to delete THERE — but this application may
   * still hold progress rows under that subject, so it is not simply success.
   */
  | { readonly kind: 'no-such-account' }
  /** Ours, or a contract this application does not recognise. Never the reader's fault. */
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The subset of authservice's error bodies this application is willing to read. */
interface DeleteBody {
  readonly error?: unknown;
}

/**
 * Turn one answer from authservice into one outcome. Pure, and therefore the layer this
 * module is tested at (P13 / TESTING-STRATEGY.md §3 — test at the layer with the logic).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * 400 IS THREE DIFFERENT THINGS AND THE STATUS CANNOT TELL THEM APART.
 *
 * `DeleteAccount` answers 400 with `{ error }` for a wrong confirmation, for a missing
 * password and for a wrong password — and `{ errors }` for an Identity update failure.
 * They are distinguished ONLY by the message string, which is English prose in another
 * repository and is not a contract anybody promised to keep.
 *
 * So the strings are matched POSITIVELY and loosely, and anything unrecognised falls
 * through to `unavailable` rather than to the most likely guess. The cost of guessing
 * wrong here is specific: report a wrong confirmation as a wrong password and the reader
 * retypes a password that was right, for ever, with no way to discover the real fault.
 *
 * A wrong CONFIRMATION cannot arise from the browser at all — this module sends the
 * literal — so if authservice ever reports one it means the constant above has drifted
 * from its contract. That is a deployment fault, not a reader fault, and it is reported
 * as `unavailable` with the reason so it reaches a log rather than a reader.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function classifyDeleteResponse(status: number, body: unknown): DeleteAccountOutcome {
  const parsed: DeleteBody = typeof body === 'object' && body !== null ? (body as DeleteBody) : {};
  const error = typeof parsed.error === 'string' ? parsed.error.toLowerCase() : '';

  if (status === 200) return { kind: 'deleted' };

  if (status === 400) {
    if (error.includes('password is required')) return { kind: 'password-required' };
    if (error.includes('invalid password')) return { kind: 'password-rejected' };
    if (error.includes('confirmation')) {
      return {
        kind: 'unavailable',
        reason: 'the identity service rejected the confirmation this application sends',
      };
    }
    return { kind: 'unavailable', reason: '400 with no reason this application recognises' };
  }

  // 401 means "this bearer was not accepted" in every HTTP vocabulary there is, so it is
  // translated on the status alone — a platform edge that emits one is saying the same
  // thing, and the answer to the reader is the same either way: sign in again.
  if (status === 401) return { kind: 'unauthenticated' };

  if (status === 404) return { kind: 'no-such-account' };

  return { kind: 'unavailable', reason: `identity service answered ${status}` };
}

/**
 * Whether an outcome means "ask the next rung of the ladder".
 *
 * Only `unavailable` advances, for `sign-in.ts`'s reason with a sharper edge: a ladder
 * that retried a REJECTED PASSWORD would spend the reader's lockout budget on one typo —
 * and it would do so on the one screen where being locked out means being unable to delete
 * your own account.
 */
function shouldTryNextCandidate(outcome: DeleteAccountOutcome): boolean {
  return outcome.kind === 'unavailable';
}

/** Injectable for tests. The global is the only implementation in production. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Ask authservice to delete the account the bearer names.
 *
 * The bearer and the password are the only things that go out, and an outcome is the only
 * thing that comes back: no `Response`, no body, no headers. A caller that cannot reach
 * the raw answer cannot hand a piece of it to the browser.
 *
 * Note that the SUBJECT is not a parameter. authservice reads it off the token's
 * `NameIdentifier` claim, so there is no way for this call to name whose account it wants
 * — which is the same property `AbOvo.Api`'s progress endpoints have, for the same reason.
 */
export async function deleteAccount(
  accessToken: string,
  password: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<DeleteAccountOutcome> {
  const candidates = backendCandidates('authservice');
  let last: DeleteAccountOutcome = {
    kind: 'unavailable',
    reason: 'no identity service is configured',
  };

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetchImpl(`${base}${ACCOUNT_PATH}`, {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        // `Password` is omitted rather than sent as null when there is none: authservice
        // branches on `user.PasswordHash != null`, so an OAuth-only account never reads
        // the field, and sending an empty string to an account that DOES have a password
        // would turn "you did not give one" into "it was wrong".
        body: JSON.stringify(
          password === null || password.length === 0
            ? { confirmation: CONFIRMATION }
            : { password, confirmation: CONFIRMATION },
        ),
        // Following a redirect would send the bearer AND the password to an address
        // nobody chose.
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A non-JSON body is a rung that is not authservice — a platform error page, an
        // ingress banner. Any status but 200 then reads as `unavailable` and the ladder
        // moves on; a 200 with an unreadable body is still a deletion, because
        // `DeleteAccount` has already committed by the time it serialises anything.
        body = null;
      }

      const outcome = classifyDeleteResponse(response.status, body);
      if (!shouldTryNextCandidate(outcome)) return outcome;
      last = outcome;
    } catch (error) {
      const detail =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${timeoutMs()}ms`
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
