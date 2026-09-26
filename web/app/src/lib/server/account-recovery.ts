import { backendCandidates } from './backends.ts';
import { clientIpHeader } from './client-ip.ts';
import type { EmailedLink } from './emailed-link.ts';

/**
 * The way back into an account, against authservice, from the server side only (issue #170).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * FOUR ENDPOINTS, READ AND CAPTURED BEFORE A LINE OF THIS WAS WRITTEN.
 *
 * docs/architecture/AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md (#156) records what the pinned
 * authservice does: it read `AuthController`'s `ForgotPassword`, `ResetPassword`,
 * `ResendVerification` and `VerifyEmail` at the tag `flyio/authservice.fly.toml` pins, and
 * captured every answer below from that tag, built and run. All four are anonymous JSON
 * POSTs; none issues a token, so nothing here ever sets a session.
 *
 *   forgot-password       {email}                    200 for every address it can parse
 *   resend-verification   {email}                    200 for every address it can parse
 *   reset-password        {email, token, newPassword}
 *   verify-email          {email, token}
 *
 * The first two answer the same for an address with an account and one without — upstream's
 * own comment says why, and this module keeps it: nothing below turns that answer into a
 * statement about whether an account exists.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ADR-0018's shape, and `register.ts`'s reasons for being its own module: the address, the
 * token and the new password go from this origin's server to authservice's, and the only thing
 * any caller gets back is an outcome in this app's words — no `Response`, no body, no sentence
 * of upstream's (P11). The outcomes are matched on the body's SHAPE first and on upstream's
 * sentences only where there is nothing else, and a sentence this module does not know
 * degrades to "not understood" rather than to a confident wrong answer.
 */

const FORGOT_PASSWORD_PATH = '/api/v1/auth/forgot-password';
const RESET_PASSWORD_PATH = '/api/v1/auth/reset-password';
const RESEND_VERIFICATION_PATH = '/api/v1/auth/resend-verification';
const VERIFY_EMAIL_PATH = '/api/v1/auth/verify-email';

/** `sign-in.ts`'s arithmetic, and its variable: long enough for a cold authservice to wake. */
const DEFAULT_TIMEOUT_MS = 45_000;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_AUTH_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/**
 * Whether this deployment has said its identity service can send email.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A DEPLOYMENT FACT, NOT AN INFERENCE, BECAUSE THERE IS NOTHING TO INFER IT FROM.
 *
 * authservice sends email only when it has a mail provider (`SendGrid__ApiKey`), and otherwise
 * swaps in a service that sends nothing — while `forgot-password` still answers "a password
 * reset link has been sent". No endpoint says which of the two an instance is before an
 * account exists (the probe, §4). So a page that asked for a link on a deployment without a
 * provider would promise an email that never comes, and this is how the web app knows not to:
 * `AB_OVO_AUTH_SENDS_EMAIL`, set to `true` where the emails are delivered — by the provider, or
 * under the AppHost to authservice's own log, where its Development service writes each link —
 * and read per request for `client-ip.ts`'s reason about module-level constants. Unset is the
 * honest default: every deployment `flyio/` describes today sends no email.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It gates only the pages that ASK for an email. A link that has already arrived works whatever
 * this says: the pages it lands on spend a token the reader holds and promise nothing.
 */
export function sendsEmail(): boolean {
  return (process.env.AB_OVO_AUTH_SENDS_EMAIL ?? '').toLowerCase() === 'true';
}

/** Asking for a link — a new password's or the confirmation's — in this application's terms. */
export type LinkRequestOutcome =
  /** 200. The same for an address with an account and one without, and said so on the page. */
  | { readonly kind: 'sent' }
  /** 200 `isOAuthOnly` — an account with no password to replace; upstream sends nothing. */
  | { readonly kind: 'no-password' }
  /** 400 from the request's own annotations: the address is not one the service can parse. */
  | { readonly kind: 'invalid-email' }
  | { readonly kind: 'rate-limited' }
  /** Our side, or an answer this app does not recognise. Never the reader's fault. */
  | { readonly kind: 'unavailable'; readonly reason: string };

/** Using a link — choosing the password, or confirming the address — in this application's terms. */
export type LinkUseOutcome =
  | { readonly kind: 'done' }
  /** Identity's policy, or the request's length annotation. The link is not spent by it. */
  | { readonly kind: 'weak-password' }
  /** The token or the address the link carried is refused: used, expired, or never issued. */
  | { readonly kind: 'link-invalid' }
  /** A 400 this app cannot place. Never reported as one of the two above. */
  | { readonly kind: 'refused' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The subset of authservice's bodies this module is willing to read. */
interface Body {
  readonly message?: unknown;
  readonly isOAuthOnly?: unknown;
  readonly error?: unknown;
  readonly errors?: unknown;
}

const bodyOf = (body: unknown): Body =>
  typeof body === 'object' && body !== null ? (body as Body) : {};

/**
 * A 2xx is only a success when it is authservice's: every one of the four answers a JSON object
 * with a `message` sentence. A rung that is not authservice — a platform page answering 200 in
 * HTML — reaches here as `null`, and is walked past rather than reported as "sent" about an
 * email nobody sent. Positive on the shape, as `classifyLoginResponse` is.
 */
const saysSomething = (parsed: Body): boolean =>
  typeof parsed.message === 'string' && parsed.message.length > 0;

/**
 * The refusals, as one lower-cased string — `register.ts`'s `refusals`, for the two shapes the
 * probe captured on these endpoints as it did on `register`:
 *
 *   { "title": "...", "status": 400, "errors": { "Email": ["Invalid email format"] } }
 *   { "errors": ["Invalid token."] }
 *
 * The first is `[ApiController]`'s, from the request's annotations, before the action runs; the
 * second is the action's own. The field names of the first are folded in with their messages,
 * because a field name says what was wrong as exactly as any sentence does.
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
 * `forgot-password` and `resend-verification`, whose answers share one shape. Pure, and the
 * layer these are tested at (P13).
 *
 * A 400 is placed on the ADDRESS only when it names the address: both requests carry nothing
 * else a reader typed, so the only 400 either can meet from this form is `[EmailAddress]` or
 * `[Required]` on `Email`. Anything else — a body this app built wrong — is ours, and is
 * `unavailable` rather than a sentence sending the reader to look for a typo.
 */
export function classifyLinkRequestResponse(status: number, body: unknown): LinkRequestOutcome {
  const parsed = bodyOf(body);

  if (status === 200) {
    if (!saysSomething(parsed)) {
      return { kind: 'unavailable', reason: 'identity service answered 200 with no message' };
    }
    // Read positively: only an explicit `true` is the no-password account, so a body that
    // leaves the field out — `resend-verification` always does — is the ordinary answer.
    return parsed.isOAuthOnly === true ? { kind: 'no-password' } : { kind: 'sent' };
  }

  if (status === 400) {
    return refusals(parsed.errors).includes('email')
      ? { kind: 'invalid-email' }
      : { kind: 'unavailable', reason: 'identity service refused a request this app built' };
  }

  if (status === 429) return { kind: 'rate-limited' };

  return { kind: 'unavailable', reason: `identity service answered ${status}` };
}

/**
 * `reset-password`. Pure, and tested here.
 *
 * ORDER IS LOAD-BEARING. A refusal that names the token or the address is about the LINK, and
 * no password gets past it, so it is placed before one that names a password: a reader told to
 * choose a stronger password under a spent link would choose one, and meet the same refusal.
 * Identity itself checks the token before the policy, so both never arrive together from
 * `ResetPasswordAsync`; they can from the annotations, where a link with no token and a short
 * password would name both.
 *
 * The sentences are the probe's captures: `Invalid token.` for a wrong, reused or expired
 * token, `Invalid or expired reset token.` for an address with no account, and Identity's
 * `Passwords must …` for the policy — the ones `register.ts` already reads.
 */
export function classifyResetResponse(status: number, body: unknown): LinkUseOutcome {
  const parsed = bodyOf(body);

  if (status === 200) {
    return saysSomething(parsed)
      ? { kind: 'done' }
      : { kind: 'unavailable', reason: 'identity service answered 200 with no message' };
  }

  if (status === 400) {
    const said = refusals(parsed.errors);
    if (said.includes('token') || said.includes('email')) return { kind: 'link-invalid' };
    if (said.includes('password')) return { kind: 'weak-password' };
    return { kind: 'refused' };
  }

  if (status === 429) return { kind: 'rate-limited' };

  return { kind: 'unavailable', reason: `identity service answered ${status}` };
}

/**
 * `verify-email`. Pure, and tested here.
 *
 * Its own refusal is the SINGULAR `error` — `{"error":"Invalid or expired verification token."}`,
 * for a wrong token and an address with no account alike — where the annotations' is the
 * `errors` object: both are about the link, which is all this request carries. A 200 is
 * success whether it says "verified" or "already verified": a reader who opens the link twice
 * has an address that is confirmed either way, and matching the two sentences apart would
 * trade a true answer for a brittle one.
 */
export function classifyVerifyResponse(status: number, body: unknown): LinkUseOutcome {
  const parsed = bodyOf(body);

  if (status === 200) {
    return saysSomething(parsed)
      ? { kind: 'done' }
      : { kind: 'unavailable', reason: 'identity service answered 200 with no message' };
  }

  if (status === 400) {
    if (typeof parsed.error === 'string') return { kind: 'link-invalid' };
    const said = refusals(parsed.errors);
    return said.includes('token') || said.includes('email') ? { kind: 'link-invalid' } : { kind: 'refused' };
  }

  if (status === 429) return { kind: 'rate-limited' };

  return { kind: 'unavailable', reason: `identity service answered ${status}` };
}

/** Injectable for tests. The global is the only implementation in production. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Post one request to authservice, walking FRONTEND-BFF.md §5's candidate ladder.
 *
 * ONLY `unavailable` ADVANCES, as in `sign-in.ts` and `register.ts`, and for `register.ts`'s
 * reason: each of these has a side effect. A second rung asked after an ANSWER would send a
 * second email, or spend a link twice. A rung that times out after acting is the one case this
 * cannot make clean, and each fails toward the truth or near it: a second email; a second
 * confirmation, answered "already verified"; and a reset whose second attempt is told the link
 * is spent and nothing was changed — the one untrue sentence, since the password WAS changed. A
 * reset form sent twice before the first answer arrives — a double press, on a form with no
 * script — meets the same sentence the same way (ADR-0018's amendment for issue #170).
 */
async function postToIdentity<Outcome extends { readonly kind: string }>(
  path: string,
  payload: Record<string, string>,
  classify: (status: number, body: unknown) => Outcome,
  unavailable: (reason: string) => Outcome,
  fetchImpl: FetchLike,
  readerAddress: string | null,
): Promise<Outcome> {
  let last = unavailable('no identity service is configured');

  for (const base of backendCandidates('authservice')) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          // The reader's own address, so authservice's rate limit — one budget per address,
          // shared with sign-in and registration (the probe, §6) — is theirs rather than
          // everybody's. `client-ip.ts` decides whether there is one worth sending.
          ...(readerAddress === null ? {} : { [clientIpHeader()]: readerAddress }),
        },
        body: JSON.stringify(payload),
        // Following a redirect would post a token, or a new password, to an address nobody chose.
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A rung that is not authservice. The classifiers see `null` and answer `unavailable`
        // for anything they do not translate on the status alone, so the ladder moves on.
        body = null;
      }

      const outcome = classify(response.status, body);
      if (outcome.kind !== 'unavailable') return outcome;
      last = outcome;
    } catch (error) {
      const detail =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${timeoutMs()}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      last = unavailable(`${base}: ${detail}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}

const requestUnavailable = (reason: string): LinkRequestOutcome => ({ kind: 'unavailable', reason });
const useUnavailable = (reason: string): LinkUseOutcome => ({ kind: 'unavailable', reason });

/** Ask for a link to choose a new password, sent to `email` if it has an account. */
export function requestPasswordReset(
  email: string,
  fetchImpl: FetchLike = fetch,
  readerAddress: string | null = null,
): Promise<LinkRequestOutcome> {
  return postToIdentity(
    FORGOT_PASSWORD_PATH,
    { email },
    classifyLinkRequestResponse,
    requestUnavailable,
    fetchImpl,
    readerAddress,
  );
}

/** Ask for the confirmation link again, sent to `email` if it is waiting to be confirmed. */
export function requestConfirmationEmail(
  email: string,
  fetchImpl: FetchLike = fetch,
  readerAddress: string | null = null,
): Promise<LinkRequestOutcome> {
  return postToIdentity(
    RESEND_VERIFICATION_PATH,
    { email },
    classifyLinkRequestResponse,
    requestUnavailable,
    fetchImpl,
    readerAddress,
  );
}

/**
 * Choose the new password with the link a reader opened. The password is sent exactly as
 * typed — `register.ts` records why a password is never trimmed.
 */
export function resetPassword(
  link: EmailedLink,
  newPassword: string,
  fetchImpl: FetchLike = fetch,
  readerAddress: string | null = null,
): Promise<LinkUseOutcome> {
  return postToIdentity(
    RESET_PASSWORD_PATH,
    { email: link.email, token: link.token, newPassword },
    classifyResetResponse,
    useUnavailable,
    fetchImpl,
    readerAddress,
  );
}

/** Confirm the address with the link a reader opened. */
export function confirmAddress(
  link: EmailedLink,
  fetchImpl: FetchLike = fetch,
  readerAddress: string | null = null,
): Promise<LinkUseOutcome> {
  return postToIdentity(
    VERIFY_EMAIL_PATH,
    { email: link.email, token: link.token },
    classifyVerifyResponse,
    useUnavailable,
    fetchImpl,
    readerAddress,
  );
}
