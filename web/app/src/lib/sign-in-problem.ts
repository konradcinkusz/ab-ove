/**
 * What went wrong with a sign-in — as a CODE, which the page turns into words the reader can
 * act on (`chrome.signInProblems`).
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
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE CODES AND WHAT THEY DO ARE HERE; THE WORDS ARE IN `i18n/chrome.ts` (issue #166).
 *
 * This file held the English sentences beside the codes, and the page that shows them was
 * English only. It follows the reader's edition now, so the sentences moved to
 * `chrome.signInProblems`, in both editions, with the reasoning about their wording beside
 * them — `account-deletion-problem.ts` already kept its prose there, for the reason it gives:
 * a second place the product speaks from is a place only one edition would ever reach. What
 * stays is what decides the page's behaviour, which no translation may change: the closed
 * set, and whether the form is worth offering under each code. `chrome.signInProblems` is
 * keyed by `SignInProblemCode`, so a code added here without words fails the build there.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export interface SignInProblem {
  /** Which problem — the key its words are under in `chrome.signInProblems`. */
  readonly code: SignInProblemCode;
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
  incomplete: { retryable: true },
  rejected: { retryable: true },
  locked: { retryable: false },
  unverified: { retryable: false },
  /**
   * WHAT THIS MEANS CHANGED WITH ISSUE #30, and the code was kept rather than renamed.
   *
   * It used to mean "this page cannot complete a second factor". It now means the reader
   * reached the code screen and something went wrong getting back out of it — the one case
   * where the second factor is genuinely unavailable, which is a deployment whose identity
   * service offers it while this app cannot reach the endpoint.
   *
   * The ordinary path no longer produces a problem at all: a challenge is a redirect to
   * `/login/2fa`, not an error.
   */
  'second-factor': {
    // NOT retryable, and it took a failing test to settle it. This is `unavailable` wearing
    // a second-factor label — the service could not be reached — so offering the code form
    // again would be the interface inviting an attempt that cannot work. The route has
    // already cleared the challenge, so the page renders its start-again branch.
    retryable: false,
    // Reported on `/login`, where the sentence says the sign-in starts from the password
    // again — so that page offers its form under it.
    startsOver: true,
  },
  'second-factor-rejected': { retryable: true },
  'second-factor-expired': {
    retryable: false,
    // "Enter them again" is an instruction the page it lands on has to be able to honour.
    startsOver: true,
  },
  'rate-limited': { retryable: false },
  unavailable: { retryable: false },
  /**
   * The identity service accepted the password and issued a token this deployment then
   * refused: the issuer or audience this app expects does not match the one signing the
   * token. That is a configuration fault, no password gets past it, and it needs an operator
   * — which the words used to say, in those words (issue #162); they say whose fault it is
   * now, and the mechanism is kept here.
   */
  'token-rejected': { retryable: false },
  /**
   * A token was issued and the key set that would verify it could not be reached — the
   * sign-in is not refused, it is unconfirmed.
   */
  unverifiable: { retryable: false },
  /** P8 — a deployment with no identity service is a supported state. */
  'not-configured': { retryable: false },
} as const satisfies Record<string, Omit<SignInProblem, 'code'>>;

export type SignInProblemCode = keyof typeof SIGN_IN_PROBLEMS;

/**
 * Look up a code that arrived on a URL. Anything unrecognised is `null`, never a message.
 */
export function signInProblem(raw: string | string[] | undefined): SignInProblem | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !Object.hasOwn(SIGN_IN_PROBLEMS, value)) return null;
  const code = value as SignInProblemCode;
  return { code, ...SIGN_IN_PROBLEMS[code] };
}
