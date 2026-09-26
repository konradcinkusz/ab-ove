/**
 * What went wrong on the way back into an account (issue #170) — as CODES, which the pages turn
 * into words the reader can act on (`chrome.linkRequestProblems`, `chrome.linkProblems`).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * CLOSED SETS, FOR `sign-in-problem.ts`'s REASON, one flow over.
 *
 * The four routes answer plain HTML forms with a redirect, so their only channel back to the
 * page is the URL — and a URL is chosen by whoever sends the link. Here that matters more than
 * on `/login`: these are the pages a reader reaches FROM AN EMAIL, which is exactly the shape a
 * forged "your password must be changed, call this number" arrives in. So the query carries a
 * code, the code is looked up here with `Object.hasOwn`, and anything else renders nothing.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Two sets, because there are two kinds of page:
 *
 *   ASKING FOR A LINK   `/login/forgot` (a new password) and `/login/resend` (the confirmation,
 *                       again). The reader types an address; the identity service answers the
 *                       same for every address, so nothing here says whether one has an account.
 *   USING THE LINK      `/login/reset` (choosing the password) and `/login/confirm`. The address
 *                       and the token came from the link and are held by this origin's server;
 *                       the reader types, at most, a password.
 *
 * What each code decides — whether the form is worth offering again — is here; the words, in
 * both editions, are in `i18n/chrome.ts`, keyed by these sets, so a code added without words
 * does not build.
 */
export interface RecoveryProblem<Code extends string> {
  /** Which problem — the key its words are under. */
  readonly code: Code;
  /**
   * Whether the form is worth offering again: `SignInProblem.retryable`'s question, for its
   * reason — a form offered under a sentence that says no attempt can work is the interface
   * telling the reader the fault is theirs.
   */
  readonly retryable: boolean;
}

export const LINK_REQUEST_PROBLEMS = {
  incomplete: { retryable: true },
  /**
   * `[EmailAddress]` on the request, which `[ApiController]` answers before the action runs —
   * so a malformed address IS told so, although `ForgotPassword`'s own code would have answered
   * 200 (the probe, §2). An address the service accepts the shape of is never refused: it is
   * told a link is on its way whether or not it has an account.
   */
  'invalid-email': { retryable: true },
  /**
   * `isOAuthOnly: true` — an account made through another service, with no password to
   * replace. Read in the pinned source and not exercised (the probe, §2): this estate configures
   * no other service, so no such account exists here. Its own code rather than `sent`, because
   * upstream sends nothing for it, and a page promising a link would be promising an email that
   * never comes.
   */
  'no-password': { retryable: false },
  'rate-limited': { retryable: false },
  unavailable: { retryable: false },
  /**
   * This deployment has not said its identity service can send email (`sendsEmail`), so there
   * is no link to ask for. The page withdraws its form and says so; a post that arrives anyway
   * did not come from it.
   */
  'no-email': { retryable: false },
  /** P8 — a deployment with no identity service is a supported state. */
  'not-configured': { retryable: false },
} as const satisfies Record<string, Omit<RecoveryProblem<string>, 'code'>>;

export type LinkRequestProblemCode = keyof typeof LINK_REQUEST_PROBLEMS;

/**
 * The page the request ends on says what happens next — issue #170's first Done-when. A NOTICE,
 * for `/register`'s reason: something was done, and the warning panel would say it had not.
 */
export const LINK_REQUEST_NOTICES = ['sent'] as const;

export type LinkRequestNoticeCode = (typeof LINK_REQUEST_NOTICES)[number];

export const LINK_PROBLEMS = {
  incomplete: { retryable: true },
  /**
   * Identity's policy, refused by the service in the same sentences `register.ts` reads — and
   * a refused password does not spend the link (measured, the probe §2), so the form stays.
   */
  'weak-password': { retryable: true },
  /**
   * The link was used, or is too old, or is not one the service issued. Nothing a reader types
   * changes that, and the page's way on is a new link. The route drops the link it was holding,
   * which is what puts the page in its "no link here" state.
   */
  'link-invalid': { retryable: false },
  /**
   * The page was open longer than this origin holds the link (`emailed-link-cookie.ts`). The
   * link itself still works if it has not been used: the remedy is to open it again.
   */
  'link-lapsed': { retryable: false },
  'rate-limited': { retryable: false },
  unavailable: { retryable: false },
  /**
   * A 400 this app cannot place — `register.ts`'s `refused`, for its reason: saying the
   * password was weak or the link spent, when the service said something else, is worse than
   * admitting the answer was not understood. The link is kept, so trying again is possible.
   */
  refused: { retryable: true },
  'not-configured': { retryable: false },
} as const satisfies Record<string, Omit<RecoveryProblem<string>, 'code'>>;

export type LinkProblemCode = keyof typeof LINK_PROBLEMS;

/** Look up a code that arrived on a URL. Anything unrecognised is `null`, never a message. */
export function linkRequestProblem(
  raw: string | string[] | undefined,
): RecoveryProblem<LinkRequestProblemCode> | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !Object.hasOwn(LINK_REQUEST_PROBLEMS, value)) return null;
  const code = value as LinkRequestProblemCode;
  return { code, ...LINK_REQUEST_PROBLEMS[code] };
}

/** Look up a notice that arrived on a URL. Anything unrecognised is `null`, never a message. */
export function linkRequestNotice(raw: string | string[] | undefined): LinkRequestNoticeCode | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return (LINK_REQUEST_NOTICES as readonly string[]).includes(value)
    ? (value as LinkRequestNoticeCode)
    : null;
}

/**
 * Whether a page that asks for a link offers its form — `/login`'s rule, one decision, pure so
 * it is tested where the state that withdraws it can be reached. Two of those states are ones no
 * acceptance deployment is in: an identity service with no way to send email, and a site with
 * no identity service showing a notice somebody composed (`legal.ts`'s `offersRegistrationForm`
 * is the same move, for the same reason).
 *
 * Not under the notice, which has answered the reader; not under a problem no second attempt
 * fixes; not where no email can come, since the service would say it had sent one anyway.
 */
export function offersLinkRequestForm(state: {
  readonly identityConfigured: boolean;
  readonly sendsEmail: boolean;
  readonly notice: LinkRequestNoticeCode | null;
  readonly problem: RecoveryProblem<LinkRequestProblemCode> | null;
}): boolean {
  if (!state.identityConfigured || !state.sendsEmail) return false;
  if (state.notice !== null) return false;
  return state.problem === null || state.problem.retryable;
}

/** Look up a code that arrived on a URL. Anything unrecognised is `null`, never a message. */
export function linkProblem(raw: string | string[] | undefined): RecoveryProblem<LinkProblemCode> | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !Object.hasOwn(LINK_PROBLEMS, value)) return null;
  const code = value as LinkProblemCode;
  return { code, ...LINK_PROBLEMS[code] };
}
