import { backendCandidates } from './backends.ts';
import { clientIpHeader } from './client-ip.ts';

/**
 * Completing a sign-in that came back as a two-factor challenge.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SECOND MODULE AND NOT A BRANCH IN `sign-in.ts`.
 *
 * It is a different request to a different endpoint with a different body, a different set
 * of outcomes and — the part that matters — a different thing at stake. `signIn` sends a
 * password; this sends a SIX-DIGIT CODE, and authservice counts a wrong one against the
 * same five-attempt lockout budget (`RejectSecondFactorAsync` calls `AccessFailedAsync`).
 * A module that treated the two as one shape would eventually retry one of them the way it
 * retries the other.
 *
 * The contract below was read from authservice's own source at the tag
 * `flyio/authservice.fly.toml` pins — `TwoFactorController.LoginWithTwoFactor` and
 * `TwoFactorLoginRequest` — and not from any behaviour observed here.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT ACCEPTS, AND WHY THE TWO ARE ONE ARGUMENT. `{challengeToken, code}` and
 * `{challengeToken, recoveryCode}` are the same request with one field swapped, and
 * authservice's own handler reads them as an either/or: a body with neither is a 400 in as
 * many words. Modelling it as a discriminated union here means the caller cannot send both
 * and cannot send neither, which are the only two ways to get that 400.
 */

const LOGIN_PATH = '/api/v1/auth/2fa/login';

const DEFAULT_TIMEOUT_MS = 8_000;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_AUTH_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/** One of the two things a reader can present. Never both, never neither. */
export type SecondFactor =
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'recovery-code'; readonly value: string };

/**
 * What happened, in this application's terms.
 *
 * `signed-in` is deliberately the same shape as `SignInOutcome`'s, because the tokens go
 * through `establishSession` by exactly the same path — nothing downstream should be able
 * to tell which factor produced them.
 *
 * THE TWO FAILURES ARE SEPARATE AND THAT IS THE POINT. A wrong code is *try again*; an
 * expired or unusable challenge is *start the sign-in again*, because the challenge lives
 * about five minutes and the form has nothing left to send. authservice answers 401 for
 * both and distinguishes them only in a message this app does not parse, so the difference
 * is drawn where it can be: a challenge this app never had, or one authservice has already
 * refused once, is expired as far as the reader is concerned.
 */
export type SecondFactorOutcome =
  | { readonly kind: 'signed-in'; readonly accessToken: string; readonly refreshToken: string | null }
  /** The code was wrong. The challenge may still be good, and the reader may try again. */
  | { readonly kind: 'rejected' }
  /** No challenge, or one authservice will not accept. The sign-in starts over. */
  | { readonly kind: 'challenge-expired' }
  /** The account locked out between the first factor and this one. */
  | { readonly kind: 'locked' }
  | { readonly kind: 'rate-limited' }
  /** Our side, or a contract we do not recognise. Never the reader's fault. */
  | { readonly kind: 'unavailable'; readonly reason: string };

interface TwoFactorBody {
  readonly accessToken?: unknown;
  readonly refreshToken?: unknown;
  readonly error?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * authservice's own words for a challenge it will not accept, read from
 * `LoginWithTwoFactor`'s three `Unauthorized` returns.
 *
 * MATCHED ON A SUBSTRING AND NOT ON THE WHOLE SENTENCE, because the sentence is upstream's
 * to reword and this app does not own it. A rewording therefore degrades to `rejected` —
 * *try the code again* — which is the safe direction: the reader loses a retry rather than
 * being sent back to the start of a sign-in that was working.
 */
const EXPIRED_CHALLENGE = 'challenge';

/**
 * Turn one answer into one outcome. Pure, and therefore the layer this module is tested at
 * (TESTING-STRATEGY.md §3 / P13 — test at the layer with the logic).
 */
export function classifyTwoFactorResponse(status: number, body: unknown): SecondFactorOutcome {
  const parsed: TwoFactorBody = typeof body === 'object' && body !== null ? (body as TwoFactorBody) : {};

  if (status === 200) {
    const accessToken = text(parsed.accessToken);
    if (accessToken) {
      return { kind: 'signed-in', accessToken, refreshToken: text(parsed.refreshToken) };
    }
    // The same positive test `classifyLoginResponse` makes, for the same reason: a 200 with
    // no token is a contract we do not recognise rather than a session with an absent one.
    return { kind: 'unavailable', reason: 'identity service answered 200 with no token' };
  }

  if (status === 401) {
    const message = typeof parsed.error === 'string' ? parsed.error.toLowerCase() : '';

    // Lockout first. authservice discloses it only to a caller who already passed the first
    // factor, so passing it through is carrying its decision rather than making a new one —
    // and it is the one 401 where trying the code again cannot possibly help.
    if (message.includes('locked')) return { kind: 'locked' };

    if (message.includes(EXPIRED_CHALLENGE)) return { kind: 'challenge-expired' };

    return { kind: 'rejected' };
  }

  /**
   * 400 is authservice saying the body carried neither a code nor a recovery code. The
   * union above makes that unreachable from this app, so reaching it means the contract
   * moved — which is OUR problem to report, not a thing to tell the reader about their
   * code. It is deliberately not folded into `rejected`.
   */
  if (status === 400) {
    return { kind: 'unavailable', reason: 'identity service rejected the request shape' };
  }

  if (status === 429) return { kind: 'rate-limited' };

  return { kind: 'unavailable', reason: `identity service answered ${status}` };
}

/**
 * Whether an outcome means "ask the next rung of the ladder".
 *
 * ONLY `unavailable`, and the arithmetic is sharper here than it is for a password. A
 * wrong second factor calls `AccessFailedAsync` against the same five-attempt budget, and
 * `backendCandidates('authservice')` returns up to four addresses for one service — so a
 * ladder that retried a rejection would spend four of five attempts on one mistyped digit
 * and lock the reader out of their own account on the second try.
 *
 * `challenge-expired` does not advance either, and that is not the same reason: the
 * challenge is signed by one service, so a rung that refuses it is not a rung that failed.
 */
function shouldTryNextCandidate(outcome: SecondFactorOutcome): boolean {
  return outcome.kind === 'unavailable';
}

/** Injectable for tests. The global is the only implementation in production. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Exchange a challenge and a factor for tokens, walking FRONTEND-BFF.md §5's ladder.
 *
 * The challenge and the factor are the only things that go out and the outcome is the only
 * thing that comes back — `signIn`'s rule, for `signIn`'s reason: a caller that cannot
 * reach the raw answer cannot hand a piece of it to the browser.
 */
export async function completeSecondFactor(
  challengeToken: string,
  factor: SecondFactor,
  fetchImpl: FetchLike = fetch,
  readerAddress: string | null = null,
): Promise<SecondFactorOutcome> {
  if (!challengeToken) return { kind: 'challenge-expired' };

  const candidates = backendCandidates('authservice');
  let last: SecondFactorOutcome = {
    kind: 'unavailable',
    reason: 'no identity service is configured',
  };

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetchImpl(`${base}${LOGIN_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          // The reader's address, on the same terms and for the same reason as the first
          // factor's: this endpoint is behind authservice's same `auth` rate-limit policy,
          // so without it every reader shares one bucket. See `client-ip.ts`.
          ...(readerAddress === null ? {} : { [clientIpHeader()]: readerAddress }),
        },
        body: JSON.stringify({
          challengeToken,
          ...(factor.kind === 'code' ? { code: factor.value } : { recoveryCode: factor.value }),
        }),
        // A redirect is not part of this contract, and following one would post a valid
        // second factor to an address nobody chose.
        redirect: 'manual',
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A rung answering with something that is not JSON is not authservice. The
        // classifier is given nothing rather than a guess, and the status decides.
      }

      const outcome = classifyTwoFactorResponse(response.status, body);
      if (!shouldTryNextCandidate(outcome)) return outcome;
      last = outcome;
    } catch (error) {
      last = {
        kind: 'unavailable',
        reason: error instanceof Error ? error.message : 'identity service could not be reached',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}
