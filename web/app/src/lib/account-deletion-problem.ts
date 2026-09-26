/**
 * What went wrong with an account deletion — as a CODE, never as a message.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY A CLOSED SET, WHICH IS `sign-in-problem.ts`'s REASONING AND NOT A NEW ONE.
 *
 * The deletion route answers a plain HTML form with a redirect, so its only channel back
 * to the page is the URL — and a URL is chosen by whoever sends the link. A page that
 * rendered `?error=<text>` would be a way to put any sentence, in this site's own chrome,
 * in front of anyone who can be persuaded to click. On THIS page that is worse than on the
 * sign-in one, because the sentence would arrive beside a button that deletes an account:
 * "your account has been compromised, confirm below" is the shape.
 *
 * So the query string carries a code, the code is looked up here, and anything
 * unrecognised renders nothing at all.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHERE THIS DIFFERS FROM `sign-in-problem.ts`: that module holds the English sentences
 * beside the codes. This one holds no prose, because this screen is bilingual and its
 * sentences live in `lib/i18n/chrome.ts` with every other word the reader sees. Putting
 * them here would be a second place the product speaks from, and only one of the two would
 * ever be translated.
 */
import type { Chrome } from './i18n/chrome.ts';

export const DELETION_PROBLEMS = [
  /** The typed word was not a confirmation. Nothing was attempted. */
  'confirm',
  /**
   * The password refusals come from the identity service, and they come LAST: what the
   * account had stored in `AbOvo.Api` was removed first, by ADR-0021's order, and the account
   * was not. Since ADR-0068 nothing sends that back, so the account keeps no reading position,
   * and the sentences for these codes say so (`account-deletion-problem.test.ts` holds them).
   */
  'password-required',
  'password-rejected',
  /** The session ended between opening the page and confirming. */
  'signed-out',
  /** The progress could not be removed, so the account was not asked for. */
  'progress',
  /** The progress is gone and the account is not. The reader can try again. */
  'account',
  /** P8 — a deployment with no identity service is a supported state. */
  'unconfigured',
] as const;

export type DeletionProblemCode = (typeof DELETION_PROBLEMS)[number];

/** Look up a code that arrived on a URL. Anything unrecognised is `null`, never a message. */
export function deletionProblem(raw: string | string[] | undefined): DeletionProblemCode | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return (DELETION_PROBLEMS as readonly string[]).includes(value)
    ? (value as DeletionProblemCode)
    : null;
}

/**
 * The sentence for a code, in the reader's language.
 *
 * A total switch rather than a lookup table keyed by the code: `DELETION_PROBLEMS` gaining
 * a member then fails the build here, which is the only thing that stops a new outcome
 * reaching the screen as blank space.
 */
export function deletionProblemMessage(code: DeletionProblemCode, chrome: Chrome): string {
  const strings = chrome.deleteAccount;
  switch (code) {
    case 'confirm':
      return strings.problemConfirm;
    case 'password-required':
      return strings.problemPasswordRequired;
    case 'password-rejected':
      return strings.problemPasswordRejected;
    case 'signed-out':
      return strings.problemSignedOut;
    case 'progress':
      return strings.problemProgress;
    case 'account':
      return strings.problemAccount;
    case 'unconfigured':
      return strings.problemUnconfigured;
  }
}
