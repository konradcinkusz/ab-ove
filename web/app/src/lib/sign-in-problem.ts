/**
 * What went wrong with a sign-in, in words the reader can act on.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A CLOSED SET AND NOT A MESSAGE ON THE QUERY STRING.
 *
 * The sign-in route answers a plain HTML form with a redirect, so the only channel it has
 * back to the page is the URL — and a URL is chosen by whoever sends the link. A page that
 * rendered `?error=<text>` would be a way to put any sentence, in this site's own chrome,
 * in front of anyone who can be persuaded to click: "your account is suspended, telephone
 * this number" is the shape, and React escaping the HTML does nothing about it.
 *
 * So the query string carries a CODE, the code is looked up here, and anything not in this
 * table renders nothing at all. The same reasoning as `safeRedirectTarget` in the page: a
 * value an attacker chooses is validated against what this application knows, never echoed.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The set is deliberately finer than "it did not work". Collapsing these is what produces
 * the sign-in loop a reader cannot escape: an unverified email, a rate-limited address and
 * an issuer mismatch all look like a wrong password if there are only two outcomes, and
 * only one of the three is fixed by typing the password again.
 */
export interface SignInProblem {
  /** The sentence at the top. */
  readonly title: string;
  /** What to do about it, or who it is for. */
  readonly detail: string;
  /**
   * Whether the form is worth offering again. A rejected password is; an identity service
   * that is down or misconfigured is not, and a form that invites a retry which cannot
   * work is the interface telling the reader the fault is theirs.
   */
  readonly retryable: boolean;
}

export const SIGN_IN_PROBLEMS = {
  incomplete: {
    title: 'Both fields are needed.',
    detail: 'Enter the email address and the password for your account.',
    retryable: true,
  },
  rejected: {
    title: 'That email address and password were not accepted.',
    detail:
      'Check both and try again. Nothing else is said here on purpose: which of the two was wrong is not information this page will give out.',
    retryable: true,
  },
  locked: {
    title: 'The account is locked for a few minutes.',
    detail:
      'Too many sign-in attempts failed. Wait, then try again — nothing needs to be reset and no email will arrive.',
    retryable: false,
  },
  unverified: {
    title: 'That email address has not been verified yet.',
    detail:
      'The account exists and the password was right. Open the verification email the identity service sent when the account was created, then sign in here.',
    retryable: false,
  },
  'second-factor': {
    title: 'That account uses a second factor, which this page cannot complete yet.',
    detail:
      'The password was correct. Signing in with an authenticator code is not built here yet, so there is no way through this screen for that account — everything except cross-machine progress works without signing in at all.',
    retryable: false,
  },
  'rate-limited': {
    title: 'Too many sign-in attempts have been made recently.',
    detail:
      'The identity service is refusing new attempts for a minute or so. This limit counts attempts from this server rather than from you, so it can be reached by someone else.',
    retryable: false,
  },
  unavailable: {
    title: 'The identity service could not be reached.',
    detail:
      'This is our side, not yours. Reading and the lab do not need an account and are unaffected; try signing in again in a few minutes.',
    retryable: false,
  },
  'token-rejected': {
    title: 'Sign-in succeeded and the session could not be established.',
    detail:
      'The identity service accepted the password and issued a token this deployment then refused. That is a configuration fault — the issuer or audience this app expects does not match the one signing the token — and no password will get past it. It needs an operator.',
    retryable: false,
  },
  unverifiable: {
    title: 'The session could not be verified.',
    detail:
      'The identity service issued a token and then could not be reached to confirm it. The password was almost certainly right; try again shortly.',
    retryable: false,
  },
  'not-configured': {
    title: 'This deployment has no identity service.',
    detail:
      'Running ab-ovo without one is normal: the frames and the lab need no account, and only progress that follows you between machines does.',
    retryable: false,
  },
} as const satisfies Record<string, SignInProblem>;

export type SignInProblemCode = keyof typeof SIGN_IN_PROBLEMS;

/**
 * Look up a code that arrived on a URL. Anything unrecognised is `null`, never a message.
 */
export function signInProblem(raw: string | string[] | undefined): SignInProblem | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return Object.hasOwn(SIGN_IN_PROBLEMS, value)
    ? SIGN_IN_PROBLEMS[value as SignInProblemCode]
    : null;
}
