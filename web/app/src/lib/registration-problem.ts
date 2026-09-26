/**
 * What went wrong with a registration — as a CODE, which the page turns into words the
 * reader can act on (`chrome.registrationProblems`).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A SECOND CLOSED SET, AND NOT AN EXTENSION OF `sign-in-problem.ts`.
 *
 * The reasoning about the CHANNEL is identical and is written out there: the route answers
 * a plain HTML form with a redirect, the only way back to the page is the URL, and a page
 * that rendered `?error=<text>` would put any sentence an attacker chose into this site's
 * own chrome — on the screen where a password is being chosen. So the query string carries
 * a CODE, the code is looked up here, and anything else renders nothing at all.
 *
 * What differs is WHICH answers exist. Signing in has one fault the reader can fix (the
 * password) and a handful they cannot; registering has three the reader fixes in three
 * different places — an address that already has an account, a password the identity
 * service will not accept, and a consent that has to be given before anything happens.
 * Collapsing those into `rejected` would be the registration equivalent of the sign-in
 * loop that set exists to prevent: "that did not work" over a form whose next attempt is
 * identical to the last.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The words are in `i18n/chrome.ts`, as `sign-in-problem.ts`'s are and for its reason
 * (issue #166): the page follows the reader's edition, and `chrome.registrationProblems` and
 * `chrome.registrationNotices` are keyed by the codes below, so a code without words in
 * either edition does not build. What stays here is what no translation may change.
 */
export interface RegistrationProblem {
  /** Which problem — the key its words are under in `chrome.registrationProblems`. */
  readonly code: RegistrationProblemCode;
  /**
   * Whether the form is worth offering again. The same question `SignInProblem.retryable`
   * answers and for the same reason: a form offered under a sentence that says no attempt
   * can work is the interface telling the reader the fault is theirs.
   */
  readonly retryable: boolean;
  /**
   * The address already has an account, so the remedy is the OTHER form. The page reads
   * this to offer a sign-in link in place of the invitation to try again — absent
   * everywhere else, because on every other row signing in would not help either.
   */
  readonly signInInstead?: true;
}

export const REGISTRATION_PROBLEMS = {
  incomplete: { retryable: true },
  'consent-required': { retryable: true },
  /**
   * The versions moved between the page being rendered and the form being submitted. It is
   * rare and it is not the reader's fault, and the remedy is a RELOAD rather than a retry:
   * the form in front of them names documents that are no longer the current ones, and
   * submitting it again would record an acceptance of a version nobody is being offered.
   */
  'consent-stale': { retryable: true },
  taken: { retryable: false, signInInstead: true },
  /**
   * The rules the words state are authservice's own, read from its source at the pinned tag
   * rather than guessed — `password-policy.ts` has the reading, and the form checks the same
   * rules before anything is sent (issue #166). A message that said only "not strong enough"
   * would send the reader round the same rejection with a longer password.
   */
  'weak-password': { retryable: true },
  'invalid-email': { retryable: true },
  /**
   * A 400 this app cannot place. It is kept separate from the three above rather than
   * folded into them, because telling a reader their password is too weak when the
   * identity service said something else entirely is worse than admitting the answer was
   * not understood.
   */
  refused: { retryable: true },
  'rate-limited': { retryable: false },
  unavailable: { retryable: false },
  /**
   * The account WAS created and this deployment could not turn the token into a session.
   * Reported separately from `unavailable` because the remedy is different in a way that
   * matters: there is nothing to create a second time, and a reader who tried again would
   * be told the address is taken by the account they just made.
   *
   * The cause is `sign-in-problem.ts`'s `token-rejected` — the issuer or audience this app
   * expects does not match the one signing the token, a configuration fault only an
   * operator can fix — and, as there, it is kept here and not on the screen (issue #162).
   */
  'token-rejected': { retryable: false, signInInstead: true },
  unverifiable: { retryable: false, signInInstead: true },
  /** P8, in the reader's words: `sign-in-problem.ts`'s `not-configured`, one form over. */
  'not-configured': { retryable: false },
} as const satisfies Record<string, Omit<RegistrationProblem, 'code'>>;

export type RegistrationProblemCode = keyof typeof REGISTRATION_PROBLEMS;

/** Look up a code that arrived on a URL. Anything unrecognised is `null`, never a message. */
export function registrationProblem(
  raw: string | string[] | undefined,
): RegistrationProblem | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !Object.hasOwn(REGISTRATION_PROBLEMS, value)) return null;
  const code = value as RegistrationProblemCode;
  return { code, ...REGISTRATION_PROBLEMS[code] };
}

/**
 * The one outcome that is neither a failure nor a session: the account was created and the
 * identity service is waiting for the address to be confirmed before it will issue a token.
 *
 * It is a NOTICE rather than a problem, and it travels on its own query parameter for that
 * reason — `?error=` is read by a page that renders a warning panel and decides whether to
 * withdraw the form, and neither is right here. A deployment reaches this only when it can
 * actually send email; the AppHost's cannot, so locally registration signs the reader
 * straight in (authservice's `RequireConfirmedEmail` defaults to "on when email works").
 */
export const REGISTRATION_NOTICES = ['verify-email'] as const;

export type RegistrationNoticeCode = (typeof REGISTRATION_NOTICES)[number];

/** Look up a notice that arrived on a URL. Anything unrecognised is `null`, never a message. */
export function registrationNotice(
  raw: string | string[] | undefined,
): RegistrationNoticeCode | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return (REGISTRATION_NOTICES as readonly string[]).includes(value)
    ? (value as RegistrationNoticeCode)
    : null;
}
