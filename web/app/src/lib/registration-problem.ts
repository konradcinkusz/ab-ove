/**
 * What went wrong with a registration, in words the reader can act on.
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
 */
export interface RegistrationProblem {
  /** The sentence at the top. */
  readonly title: string;
  /** What to do about it, or who it is for. */
  readonly detail: string;
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
  incomplete: {
    title: 'Both fields are needed.',
    detail: 'Enter the email address you want the account under, and a password.',
    retryable: true,
  },
  'consent-required': {
    title: 'The terms have to be accepted before an account can be created.',
    detail:
      'The identity service records which version of its Terms of Use and Privacy Policy an account was created under, and it will not create one without that. Tick the box and submit again.',
    retryable: true,
  },
  /**
   * The versions moved between the page being rendered and the form being submitted. It is
   * rare and it is not the reader's fault, and the remedy is a RELOAD rather than a retry:
   * the form in front of them names documents that are no longer the current ones, and
   * submitting it again would record an acceptance of a version nobody is being offered.
   */
  'consent-stale': {
    title: 'The terms changed while this page was open.',
    detail:
      'What the form offered to accept is no longer the current version, so nothing was recorded. Load the page again and read what it says before accepting it.',
    retryable: true,
  },
  taken: {
    title: 'That email address already has an account.',
    detail:
      'Nothing was changed and no email was sent. Sign in with it instead — or, if the password is the thing that is missing, the identity service is where it gets reset.',
    retryable: false,
    signInInstead: true,
  },
  /**
   * WORDED FROM authservice's OWN POLICY, which is read from its `Program.cs` rather than
   * guessed: eight characters or more, with an upper case letter, a lower case letter, a
   * digit and one character that is none of those. A message that said only "not strong
   * enough" would send the reader round the same rejection with a longer password.
   */
  'weak-password': {
    title: 'The identity service will not accept that password.',
    detail:
      'It asks for at least eight characters, including an upper case letter, a lower case letter, a digit, and one character that is none of those. Nothing was created; choose another and submit again.',
    retryable: true,
  },
  'invalid-email': {
    title: 'That address was not accepted as an email address.',
    detail: 'Check it for a typo — a missing @, a stray space — and submit again.',
    retryable: true,
  },
  /**
   * A 400 this app cannot place. It is kept separate from the three above rather than
   * folded into them, because telling a reader their password is too weak when the
   * identity service said something else entirely is worse than admitting the answer was
   * not understood.
   */
  refused: {
    title: 'The identity service refused those details.',
    detail:
      'It did not say anything this page knows how to explain, and nothing was created. Check the address and the password, and try once more.',
    retryable: true,
  },
  'rate-limited': {
    title: 'Too many attempts have been made recently.',
    detail:
      'The identity service is refusing new ones for a minute or so. The limit counts an address rather than an account, so you can meet it on your first attempt — someone else on the same network may have spent it.',
    retryable: false,
  },
  unavailable: {
    title: 'The identity service could not be reached.',
    detail:
      'This is our side, not yours, and nothing was created. Reading and the worksheet need no account and are unaffected; try again in a few minutes.',
    retryable: false,
  },
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
  'token-rejected': {
    title: 'Your account was created, but this site could not sign you in.',
    detail:
      'The fault is in how this site is set up, not in anything you typed. The account exists; signing in will fail the same way until the fault is fixed.',
    retryable: false,
    signInInstead: true,
  },
  unverifiable: {
    title: 'Your account was created, but the sign-in could not be confirmed.',
    detail:
      'The identity service could not be reached to confirm it. The account exists — wait a moment, then sign in.',
    retryable: false,
    signInInstead: true,
  },
  /** P8, in the reader's words: `sign-in-problem.ts`'s `not-configured`, one form over. */
  'not-configured': {
    title: 'This site has no accounts.',
    detail:
      'There is nothing to register with, and nothing else needs an account: the frames and the worksheet work without one.',
    retryable: false,
  },
} as const satisfies Record<string, RegistrationProblem>;

export type RegistrationProblemCode = keyof typeof REGISTRATION_PROBLEMS;

/** Look up a code that arrived on a URL. Anything unrecognised is `null`, never a message. */
export function registrationProblem(
  raw: string | string[] | undefined,
): RegistrationProblem | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return Object.hasOwn(REGISTRATION_PROBLEMS, value)
    ? REGISTRATION_PROBLEMS[value as RegistrationProblemCode]
    : null;
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
export const REGISTRATION_NOTICES = {
  // "Will not issue a session until…" was the service's account of it (issue #162).
  'verify-email': {
    title: 'The account was created. One step is left.',
    detail:
      'Signing in waits until the address is confirmed, so a message with a link is on its way to it. Open that, then sign in here.',
  },
} as const;

export type RegistrationNoticeCode = keyof typeof REGISTRATION_NOTICES;

export function registrationNotice(
  raw: string | string[] | undefined,
): (typeof REGISTRATION_NOTICES)[RegistrationNoticeCode] | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return Object.hasOwn(REGISTRATION_NOTICES, value)
    ? REGISTRATION_NOTICES[value as RegistrationNoticeCode]
    : null;
}
