import { backendCandidates } from './backends.ts';
import { clientIpHeader } from './client-ip.ts';

/**
 * Sign-in against authservice, from the server side only.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THE CREDENTIALS COME HERE RATHER THAN GOING TO authservice FROM THE BROWSER.
 *
 * FRONTEND-BFF.md §1 — "The browser must talk ONLY to the frontend's own origin." The BFF
 * proxy already fronts authservice, so a form COULD post to
 * `/api/proxy/auth/api/v1/auth/login` and satisfy that sentence to the letter: the browser
 * would then hold the access token and the refresh token in JavaScript for as long as it
 * took to hand them to `/api/auth/session`.
 *
 * §3 allows exactly that, and for an OAuth callback it is unavoidable — the tokens arrive
 * at the browser by construction. For a PASSWORD form it is avoidable, so it is avoided:
 * the credentials cross to this process, the tokens are minted into this process, and the
 * only thing the browser is ever told is a status. §8's "Token visible in
 * devtools/localStorage" cannot happen to a token that was never in the document.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * P11 — anti-corruption at the edge. Everything below translates authservice's vocabulary
 * into this application's, and REFUSES to translate anything it does not recognise. The
 * outcomes are ours; the statuses and body shapes are theirs and appear nowhere else.
 */

/** authservice's password sign-in endpoint. The versioned path, never the alias. */
const LOGIN_PATH = '/api/v1/auth/login';

/**
 * Long enough for a scale-to-zero authservice to wake, start .NET and reach a cold
 * Postgres — the same arithmetic the proxy's own timeout has to cover, and the same
 * symptom if it is too short (§8, "Downloads fail after idle periods"). A sign-in that
 * gives up at five seconds fails only after an idle period, which is the worst kind of
 * intermittent to chase.
 */
const DEFAULT_TIMEOUT_MS = 45_000;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_AUTH_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/**
 * What happened, in this application's terms.
 *
 * Every member except `signed-in` is a thing the reader has to be told accurately, and the
 * whole reason they are separate is that collapsing them is what produces the sign-in loop
 * nobody can escape: an account with an unverified email, a rate-limited IP and a
 * configuration mismatch all present as "wrong password" if the only two outcomes are
 * success and failure.
 */
export type SignInOutcome =
  | { readonly kind: 'signed-in'; readonly accessToken: string; readonly refreshToken: string | null }
  /**
   * authservice answered 200 with a two-factor CHALLENGE rather than tokens. See
   * `classifyLoginResponse` — this is the sharp edge of the contract.
   *
   * THE CHALLENGE TOKEN IS CARRIED, which it was not when this outcome only had to be
   * REPORTED. It is what `POST /api/v1/auth/2fa/login` exchanges for real tokens, it is
   * signed with the same key as a session token and separated only by audience
   * (`<audience>:2fa`), and it expires in five minutes — `expiresIn` says in how many
   * seconds, and it is carried rather than assumed so nothing here has to know the number.
   */
  | {
      readonly kind: 'second-factor-required';
      readonly challengeToken: string;
      readonly expiresIn: number | null;
    }
  /** The credentials were not accepted. No further detail, deliberately. */
  | { readonly kind: 'rejected' }
  /** The password was right and the account is locked out. authservice's own disclosure. */
  | { readonly kind: 'locked' }
  | { readonly kind: 'email-unverified' }
  | { readonly kind: 'rate-limited' }
  /** Our side, or a contract we do not recognise. Never the reader's fault. */
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The subset of authservice's response body this app is willing to read. */
interface LoginBody {
  readonly accessToken?: unknown;
  readonly refreshToken?: unknown;
  readonly requiresTwoFactor?: unknown;
  readonly challengeToken?: unknown;
  readonly expiresIn?: unknown;
  readonly lockedOut?: unknown;
  readonly emailVerificationRequired?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A positive whole number of seconds, or null. Anything else is not a lifetime. */
function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Turn one answer from authservice into one outcome. Pure, and therefore the layer this
 * module is tested at (TESTING-STRATEGY.md §3 / P13 — test at the layer with the logic).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ONE THAT MATTERS: 200 IS NOT "SIGNED IN".
 *
 * authservice returns HTTP 200 for BOTH outcomes of a correct password. An account with no
 * second factor gets `TokenResponse`; an account with one gets `TwoFactorRequiredResponse`
 * — `{requiresTwoFactor, challengeToken, expiresIn}` — at the same 200. Its own controller
 * says so in a comment, because only one type can be declared per status code.
 *
 * So the test is POSITIVE on both sides: a body carrying `requiresTwoFactor` is a
 * challenge, a body carrying a non-empty `accessToken` is a session, and a 200 carrying
 * neither is a contract we do not recognise rather than a session with an absent token.
 *
 * Reading `accessToken` off a challenge body yields `undefined`, so the failure would not
 * have been a forged session — `verifyAccessToken` would have refused the challenge token
 * anyway, since authservice signs challenges with the same key and separates them ONLY by
 * audience (`AbOvo:2fa`). The damage would have been the MESSAGE: every reader with two-
 * factor enabled told their correct password was wrong, for ever.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function classifyLoginResponse(status: number, body: unknown): SignInOutcome {
  const parsed: LoginBody = typeof body === 'object' && body !== null ? (body as LoginBody) : {};

  if (status === 200) {
    if (parsed.requiresTwoFactor === true) {
      /*
       * A CHALLENGE WITH NO TOKEN IS NOT A CHALLENGE, and it is reported as our fault
       * rather than as a step the reader can take. There is nothing to exchange, so a
       * screen asking for an authenticator code would be asking for something it could not
       * use — which is the shape of the sign-in loop this whole union exists to prevent,
       * one outcome further in than the case the paragraph above describes.
       */
      const challengeToken = text(parsed.challengeToken);
      if (!challengeToken) {
        return { kind: 'unavailable', reason: 'two-factor challenge carried no challenge token' };
      }
      return {
        kind: 'second-factor-required',
        challengeToken,
        expiresIn: seconds(parsed.expiresIn),
      };
    }

    const accessToken = text(parsed.accessToken);
    if (accessToken) {
      return { kind: 'signed-in', accessToken, refreshToken: text(parsed.refreshToken) };
    }

    return { kind: 'unavailable', reason: 'identity service answered 200 with no token' };
  }

  /**
   * 401 is translated without consulting the body, because 401 means "these credentials
   * were not accepted" in every HTTP vocabulary there is — a platform edge that emits one
   * is saying the same thing. `lockedOut` is a detail authservice adds, and it is read
   * positively: authservice discloses lockout only to a caller who already proved they
   * know the password, so passing it through is carrying its decision rather than making
   * a new one.
   */
  if (status === 401) {
    return parsed.lockedOut === true ? { kind: 'locked' } : { kind: 'rejected' };
  }

  /**
   * 403, by contrast, is NOT translated on the status alone. authservice means "your email
   * is unverified"; a platform edge in front of it means "wrong ingress" and says nothing
   * about the account. Only a body that names the reason gets the specific message, which
   * is what stops an infrastructure artefact being reported to the reader as a fact about
   * their account. The unrecognised case advances the ladder, in `signIn` below.
   */
  if (status === 403) {
    return parsed.emailVerificationRequired === true
      ? { kind: 'email-unverified' }
      : { kind: 'unavailable', reason: '403 with no reason this app recognises' };
  }

  if (status === 429) return { kind: 'rate-limited' };

  return { kind: 'unavailable', reason: `identity service answered ${status}` };
}

/**
 * Whether an outcome means "ask the next rung of the ladder".
 *
 * Only `unavailable` advances, and the reason is arithmetic rather than taste:
 * authservice locks an account after FIVE failed attempts, and
 * `backendCandidates('authservice')` returns up to four addresses for the SAME service. A
 * ladder that retried a rejected password would spend four of the reader's five attempts
 * on one typo and lock them out of their own account in two goes.
 *
 * That is the mirror image of the rule in `token.ts`: there, a terminal verification error
 * must not advance, because walking on is "a verifier shopping for a key set that will
 * accept the token it was handed". Here, walking on is a client spraying one credential
 * across every address it knows.
 */
function shouldTryNextCandidate(outcome: SignInOutcome): boolean {
  return outcome.kind === 'unavailable';
}

/** Injectable for tests. The global is the only implementation in production. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Post the credentials to authservice, walking FRONTEND-BFF.md §5's candidate ladder.
 *
 * The credentials are the only thing that goes out and the outcome is the only thing that
 * comes back: no `Response`, no body, no headers. A caller that cannot reach the raw answer
 * cannot accidentally hand a piece of it to the browser.
 */
export async function signIn(
  email: string,
  password: string,
  fetchImpl: FetchLike = fetch,
  readerAddress: string | null = null,
): Promise<SignInOutcome> {
  const candidates = backendCandidates('authservice');
  let last: SignInOutcome = { kind: 'unavailable', reason: 'no identity service is configured' };

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetchImpl(`${base}${LOGIN_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          /*
           * THE READER'S ADDRESS, WHEN THIS DEPLOYMENT HAS ONE IT TRUSTS.
           *
           * authservice partitions its sign-in rate limit on this header and has no trust
           * flag of its own, so whatever arrives here is what it buckets on. `readerAddress`
           * is what decides whether there is anything worth sending — see `client-ip.ts`,
           * which will not forward a client-supplied value, because every visitor picking
           * their own partition is strictly worse than one shared bucket.
           *
           * Absent is the configured answer rather than a failure: authservice then falls
           * through to the socket peer, which is this web machine, and the bucket is per
           * machine. That is what every deployment did before this header existed.
           */
          ...(readerAddress === null ? {} : { [clientIpHeader()]: readerAddress }),
        },
        body: JSON.stringify({ email, password }),
        // A redirect is not part of this contract, and following one would post the
        // credentials to an address nobody chose.
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A non-JSON body is a rung that is not authservice — a platform error page, an
        // ingress banner. `classifyLoginResponse` sees `null` and, for any status it does
        // not translate on the status alone, returns `unavailable`, so the ladder moves on.
        body = null;
      }

      const outcome = classifyLoginResponse(response.status, body);
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
