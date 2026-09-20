import { backendCandidates } from './backends.ts';
import { clientIpHeader } from './client-ip.ts';

/**
 * Creating an account against authservice, from the server side only.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A THIRD MODULE BESIDE `sign-in.ts` AND `second-factor.ts`.
 *
 * The same reasoning that separated those two, one step earlier: a different endpoint, a
 * different body, a different set of outcomes, and a different thing at stake. Registering
 * sends a CHOSEN password and a consent, and its failures are things the reader fixes in
 * three different places — an address that already has an account, a password the policy
 * refuses, a box that was not ticked. A module that treated registration as sign-in with a
 * different path would have to collapse those into "not accepted", which is the answer
 * that leaves a reader retyping a password that was never the problem.
 *
 * The credentials cross to this process and the tokens are minted into it, for the reason
 * `sign-in.ts` sets out at length: FRONTEND-BFF.md §1 and §3, and §8's "Token visible in
 * devtools/localStorage" cannot happen to a token that was never in the document.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * P11 — anti-corruption at the edge. The outcomes below are ours; the statuses and body
 * shapes are authservice's and appear nowhere else. Every shape was read from its source at
 * the tag `AppHost.cs` and `flyio/authservice.fly.toml` pin — `AuthController.Register`,
 * `RegisterRequest`, `RegistrationPendingVerificationResponse` and `GetConsentVersions`.
 *
 * ONE OF THEM IS NOT IN THAT SOURCE, and it is the reason this paragraph no longer claims
 * the contract was read from source alone: `[ApiController]` turns `RegisterRequest`'s data
 * annotations into a `ValidationProblemDetails` body BEFORE the action runs, so the refusal
 * shape a reader sees for a malformed address is one the controller never writes. See
 * `refusals` — it was found by putting a real v0.3.1 behind this module, and a draft written
 * from the source alone had it wrong.
 */

/** authservice's registration endpoint. The versioned path, never the alias. */
const REGISTER_PATH = '/api/v1/auth/register';

/**
 * The consent versions a registration must accept.
 *
 * ANONYMOUS ON PURPOSE, upstream's comment says so in as many words: `POST /register`
 * rejects any request that does not accept the EXACT versions the instance is configured
 * with, and a sign-up form has no token yet. Hard-coding them here would break registration
 * silently the first time one is bumped — which is the whole point of them being versioned.
 */
const CONSENT_VERSIONS_PATH = '/api/v1/auth/consents/versions';

/** The same arithmetic `sign-in.ts` records: long enough for a cold authservice to wake. */
const DEFAULT_TIMEOUT_MS = 45_000;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_AUTH_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/** Which documents, at which versions, an account is created under. */
export interface ConsentVersions {
  readonly terms: string;
  readonly privacy: string;
}

/**
 * What happened, in this application's terms.
 *
 * `verification-required` is the member most worth naming separately, because it is
 * neither a failure nor a session: the account EXISTS and no token was issued. Reported as
 * a failure it would invite a second attempt that can only answer "that address is already
 * taken", about the account the first attempt made.
 */
export type RegisterOutcome =
  | {
      readonly kind: 'registered';
      readonly accessToken: string;
      readonly refreshToken: string | null;
    }
  /** 202 — created, and unusable until the address is confirmed. No tokens, by design. */
  | { readonly kind: 'verification-required' }
  /** The address already has an account. The remedy is the sign-in form. */
  | { readonly kind: 'taken' }
  /** The password does not meet the identity service's policy. */
  | { readonly kind: 'weak-password' }
  | { readonly kind: 'invalid-email' }
  /** The consent this app sent is not the one the instance requires. */
  | { readonly kind: 'consent-refused' }
  /** A refusal this app cannot place. Never reported as one of the four above. */
  | { readonly kind: 'refused' }
  | { readonly kind: 'rate-limited' }
  /** Our side, or a contract we do not recognise. Never the reader's fault. */
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The subset of authservice's response body this app is willing to read. */
interface RegisterBody {
  readonly accessToken?: unknown;
  readonly refreshToken?: unknown;
  readonly emailVerificationRequired?: unknown;
  readonly errors?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The refusals, as one lower-cased string.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `errors` ARRIVES IN TWO SHAPES, AND BOTH ARE READ. This was measured against a real
 * authservice v0.3.1, not reasoned about, and a first draft that handled only the second
 * one reported `refused` — "we did not understand the answer" — for every malformed
 * address and every password outside 8..100 characters.
 *
 *   { "title": "...", "status": 400, "errors": { "Email": ["Invalid email format"] } }
 *   { "errors": ["Email 'x@y.test' is already taken."] }
 *
 * The first is `ValidationProblemDetails`, which `[ApiController]` produces AUTOMATICALLY
 * from `RegisterRequest`'s data annotations, before the action body runs — so `Register`'s
 * own `if (!ModelState.IsValid)` branch is never reached and its shape never emitted. The
 * second is what the controller returns itself: its consent check, and
 * `UserManager.CreateAsync`'s result.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Neither carries a CODE, in either shape — there are only sentences, so the sentences are
 * what get read. The field names of the first shape are folded in beside its messages:
 * `{"AcceptedTermsVersion": [...]}` names the thing that was wrong as precisely as any
 * sentence, and a body that only said "is required" would be placed by nothing.
 */
function refusals(value: unknown): string {
  const flatten = (entry: unknown): string[] =>
    Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string') : [];

  if (Array.isArray(value)) return flatten(value).join(' | ').toLowerCase();

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([field, messages]) => [field, ...flatten(messages)])
      .join(' | ')
      .toLowerCase();
  }

  return '';
}

/**
 * Turn one answer from authservice into one outcome. Pure, and therefore the layer this
 * module is tested at (TESTING-STRATEGY.md §3 / P13 — test at the layer with the logic).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ONE THAT MATTERS: 200 AND 202 ARE BOTH SUCCESS, AND ONLY ONE OF THEM IS A SESSION.
 *
 * `Register` returns `TokenResponse` at 200 when the deployment cannot send verification
 * email, and `RegistrationPendingVerificationResponse` at 202 when it can — the account is
 * made either way. A client that read only "2xx means signed in" would look for a token in
 * the 202 body, find none, and report a failure about an account that had just been
 * created successfully.
 *
 * So, as in `classifyLoginResponse`, the tests are POSITIVE on both sides: a 202, or a body
 * that says verification is required, is the pending outcome; a body carrying a non-empty
 * `accessToken` is a session; and a 2xx carrying neither is a contract we do not recognise
 * rather than a session with an absent token.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE 400s ARE MATCHED ON SUBSTRINGS OF UPSTREAM'S OWN SENTENCES, which is the idiom
 * `second-factor.ts` already carries and it comes with the same caveat: the sentences are
 * upstream's to reword, and a rewording degrades to `refused` — "we did not understand the
 * answer" — rather than to a confident wrong one. That is the safe direction. The strings
 * come from ASP.NET Identity's `IdentityErrorDescriber` ("is already taken", "Passwords
 * must...", "is invalid") and from `Register`'s own consent sentence.
 */
export function classifyRegisterResponse(status: number, body: unknown): RegisterOutcome {
  const parsed: RegisterBody = typeof body === 'object' && body !== null ? (body as RegisterBody) : {};

  if (status === 200 || status === 202) {
    if (status === 202 || parsed.emailVerificationRequired === true) {
      return { kind: 'verification-required' };
    }

    const accessToken = text(parsed.accessToken);
    if (accessToken) {
      return { kind: 'registered', accessToken, refreshToken: text(parsed.refreshToken) };
    }

    return { kind: 'unavailable', reason: 'identity service answered 200 with no token' };
  }

  if (status === 400) {
    const said = refusals(parsed.errors);

    // ORDER IS LOAD-BEARING. "Email 'x' is already taken." contains the word email, and a
    // reader told to check that address for a typo when the truth is that it is theirs
    // already would be sent to fix something that is not broken.
    if (said.includes('already taken') || said.includes('already in use')) {
      return { kind: 'taken' };
    }
    // Upstream's consent sentence names both documents; the model-validation one says
    // "Terms acceptance is required". Neither mentions a password or an address.
    if (said.includes('terms') || said.includes('privacy')) return { kind: 'consent-refused' };
    if (said.includes('password')) return { kind: 'weak-password' };
    if (said.includes('email')) return { kind: 'invalid-email' };

    return { kind: 'refused' };
  }

  if (status === 429) return { kind: 'rate-limited' };

  return { kind: 'unavailable', reason: `identity service answered ${status}` };
}

/** Injectable for tests. The global is the only implementation in production. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Whether an outcome means "ask the next rung of the ladder".
 *
 * Only `unavailable`, as in `sign-in.ts` — and here the argument is not about a lockout
 * budget but about a SIDE EFFECT. Every other outcome is an answer authservice actually
 * gave, and walking on from one would mean posting the same registration to a second
 * address: either two accounts, or a second attempt that answers "already taken" about the
 * account the first one just made.
 *
 * A rung that times out AFTER creating the account is the one case this cannot make clean,
 * and the failure is benign in the direction that matters: the next rung answers `taken`,
 * which sends the reader to the sign-in form — where the account they now have is waiting.
 */
function shouldTryNextCandidate(outcome: RegisterOutcome): boolean {
  return outcome.kind === 'unavailable';
}

/**
 * The versions of the Terms and the Privacy Policy this instance requires right now.
 *
 * `null` means no rung answered with a shape this app recognises — which is a reason not to
 * offer the form rather than a reason to guess, because a guessed version is a registration
 * authservice will refuse and a consent record that would have been a lie if it had not.
 */
export async function consentVersions(fetchImpl: FetchLike = fetch): Promise<ConsentVersions | null> {
  for (const base of backendCandidates('authservice')) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetchImpl(`${base}${CONSENT_VERSIONS_PATH}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) continue;

      const body = (await response.json()) as { terms?: unknown; privacy?: unknown };
      const terms = text(body.terms);
      const privacy = text(body.privacy);
      if (terms && privacy) return { terms, privacy };
    } catch {
      // A rung that is not authservice — a platform error page, a closed port, a timeout.
      // The ladder moves on; a GET has no side effect to be careful about.
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/**
 * Post the registration to authservice, walking FRONTEND-BFF.md §5's candidate ladder.
 *
 * The details are the only thing that goes out and the outcome is the only thing that comes
 * back: no `Response`, no body, no headers. A caller that cannot reach the raw answer
 * cannot accidentally hand a piece of it to the browser — and the raw answer here is a list
 * of sentences from another product, which is exactly the class of text `sign-in-problem.ts`
 * refuses to render.
 */
export async function registerAccount(
  email: string,
  password: string,
  consent: ConsentVersions,
  fetchImpl: FetchLike = fetch,
  readerAddress: string | null = null,
): Promise<RegisterOutcome> {
  const candidates = backendCandidates('authservice');
  let last: RegisterOutcome = { kind: 'unavailable', reason: 'no identity service is configured' };

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetchImpl(`${base}${REGISTER_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          // The reader's own address, when this deployment has one it trusts, so
          // authservice's rate limit is theirs rather than everybody's. See `client-ip.ts`.
          ...(readerAddress === null ? {} : { [clientIpHeader()]: readerAddress }),
        },
        body: JSON.stringify({
          email,
          password,
          acceptedTermsVersion: consent.terms,
          acceptedPrivacyVersion: consent.privacy,
        }),
        // Following a redirect would post a chosen password to an address nobody chose.
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A non-JSON body is a rung that is not authservice. `classifyRegisterResponse`
        // sees `null` and answers `unavailable` for any status it does not translate on
        // the status alone, so the ladder moves on.
        body = null;
      }

      const outcome = classifyRegisterResponse(response.status, body);
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
