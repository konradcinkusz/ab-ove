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
  /**
   * The problem was met on a LATER step and sends the reader back to the password form,
   * so on `/login` the form is the remedy even though the step that failed is not
   * retryable. `retryable` answers for the form the problem was met on; this answers for
   * the one it is reported on. Absent everywhere else, deliberately: a third state on
   * every row would be a flag somebody sets to make a page behave.
   */
  readonly startsOver?: true;
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
  /**
   * WHAT THIS MEANS CHANGED WITH ISSUE #30, and the code was kept rather than renamed.
   *
   * It used to mean "this page cannot complete a second factor". It now means the reader
   * reached the code screen and something went wrong getting back out of it — the message
   * below is the one case where the second factor is genuinely unavailable, which is a
   * deployment whose identity service offers it while this app cannot reach the endpoint.
   *
   * The ordinary path no longer produces a problem at all: a challenge is a redirect to
   * `/login/2fa`, not an error.
   */
  'second-factor': {
    title: 'That account uses a second factor and this sign-in could not complete it.',
    detail:
      'The password was correct and the code never got a fair hearing: something between here and the identity service failed on the second step. That is our side rather than yours, and the sign-in has to start from the password again.',
    // NOT retryable, and it took a failing test to settle it. This is `unavailable` wearing
    // a second-factor label — the service could not be reached — so offering the code form
    // again would be the interface inviting an attempt that cannot work. The route has
    // already cleared the challenge, so the page renders its start-again branch.
    retryable: false,
    // Reported on `/login`, where the sentence above says the sign-in starts from the
    // password again — so that page offers its form under it.
    startsOver: true,
  },
  'second-factor-rejected': {
    title: 'That code was not accepted.',
    detail:
      'Check the current code in your authenticator app and enter it again — they change every thirty seconds, and one that has just expired will be refused. A recovery code works here too if you have one left.',
    retryable: true,
  },
  'second-factor-expired': {
    title: 'That sign-in took too long and has to start again.',
    detail:
      'The challenge from the first step is good for about five minutes. Nothing is wrong with the account or the password — enter them again and you will get a fresh one.',
    retryable: false,
    // "Enter them again" is an instruction the page it lands on has to be able to honour.
    startsOver: true,
  },
  /**
   * WORDED TO BE TRUE UNDER BOTH CONFIGURATIONS, which is the only reason it says "an
   * address" rather than naming one. authservice rate-limits by the address it sees. With
   * `AB_OVO_TRUST_PROXY_CLIENT_IP` off that address is this server's, so the bucket is
   * shared by every reader at once; with it on it is the reader's own, and is still shared
   * with anyone behind the same network. The previous wording said the limit "counts
   * attempts from this server rather than from you" — true today, and false on a Fly
   * deployment the moment the flag is turned on, which is a sentence that would have gone
   * quietly wrong rather than visibly.
   */
  'rate-limited': {
    title: 'Too many sign-in attempts have been made recently.',
    detail:
      'The identity service is refusing new attempts for a minute or so. The limit counts an address rather than an account, so you can meet it on your first attempt — someone else on the same network, or using this site at the same time, may have spent it.',
    retryable: false,
  },
  unavailable: {
    title: 'The identity service could not be reached.',
    detail:
      'This is our side, not yours. Reading and the lab do not need an account and are unaffected; try signing in again in a few minutes.',
    retryable: false,
  },
  /**
   * THE MECHANISM IS HERE, AND THE SCREEN SAYS WHAT IT MEANS (issue #162).
   *
   * The identity service accepted the password and issued a token this deployment then
   * refused: the issuer or audience this app expects does not match the one signing the
   * token. That is a configuration fault, no password gets past it, and it needs an operator
   * — all of which the detail used to say, in those words. What a reader can use of it is
   * whose fault it is and that trying again will not help, so that is what it says now.
   */
  'token-rejected': {
    title: 'Your password was accepted, but this site could not sign you in.',
    detail:
      'The fault is in how this site is set up, not in anything you typed, and trying again will not get past it until it is fixed. Reading needs no account and is unaffected.',
    retryable: false,
  },
  /**
   * A token was issued and the key set that would verify it could not be reached — the
   * sign-in is not refused, it is unconfirmed. Said without the token since issue #162.
   */
  unverifiable: {
    title: 'Your sign-in could not be confirmed.',
    detail:
      'Your password was accepted, and then the identity service could not be reached to confirm the sign-in. The password was almost certainly right; try again shortly.',
    retryable: false,
  },
  /**
   * P8 — a deployment with no identity service is a supported state, and "this deployment"
   * is the operator's name for it. To a reader it is a site with no accounts (issue #162).
   */
  'not-configured': {
    title: 'This site has no accounts.',
    detail:
      'There is nothing to sign in to, and nothing else needs an account: the frames and the lab work without one.',
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
