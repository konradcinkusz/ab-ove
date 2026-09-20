import { backendCandidates } from './backends.ts';
import { deleteAccount, type DeleteAccountOutcome, type FetchLike } from './delete-account.ts';

/**
 * Deleting an account, which is two services and a cookie.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ORDER IS THE DESIGN, AND IT IS THE OPPOSITE OF THE INTUITIVE ONE.
 *
 * Issue #13 asks for a deletion that removes "the account AND the progress". Those live in
 * different services — the account in authservice, the progress in `AbOvo.Api`'s `apidb`
 * (P3, a database per service) — so there is no transaction over the pair and one of them
 * happens first. Which one is not a matter of taste:
 *
 *   PROGRESS FIRST. The likely failure is a wrong password, and it happens BEFORE
 *   authservice is asked anything, so at that point the synced rows are already gone. The
 *   reader keeps their account, keeps their session, and — because signing out leaves
 *   local progress intact (ADR-0019, issue #11) — their browser still holds every position
 *   it held a second ago. The next sync cycle finds a remote with nothing in it and pushes
 *   the lot back up. The loss is zero and it repairs itself.
 *
 *   ACCOUNT FIRST. The same wrong password costs nothing, which is better. But the rare
 *   failure — anything at all going wrong between the two calls — leaves the account gone
 *   and the progress rows in `apidb` under a subject that can never sign in again. Nobody
 *   can reach them, no reader can ask for them to be removed, and the only way out is an
 *   operator with database access. That is an unremovable row produced by the feature
 *   whose entire purpose is removing rows.
 *
 * One order's worst case repairs itself; the other's is permanent and is precisely the
 * thing the feature exists to prevent. So: progress, then the account.
 *
 * NOTE WHAT THAT ARGUMENT DEPENDS ON. It is only recoverable because #11 decided that
 * local progress survives losing a session. Reverse that decision and this ordering
 * becomes the wrong one. The two are coupled, and the coupling is written down here
 * because the code does not show it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The cookies are cleared LAST, and only on success, for the reason in `delete-account.ts`:
 * authservice revokes refresh tokens and leaves the access token to expire on its own, so
 * until this origin drops its own cookies the reader is still, as far as every request is
 * concerned, signed in. Clearing them is not a courtesy — it is the only thing that ends
 * the session this side.
 */

/** `AbOvo.Api`'s progress endpoint — the whole record for the bearer's subject. */
const PROGRESS_PATH = '/api/v1/progress';

/**
 * `AbOvo.Api`'s other reader-scoped row: the edition they chose (ADR-0052).
 *
 * IT IS DELETED HERE AND NOT ONLY BECAUSE IT IS TIDY. The ordering argument below is that
 * a row left in `apidb` under a subject that can never sign in again is unreachable by any
 * reader for ever — and that argument is about the SUBJECT, not about the progress table.
 * The day this service grew a second table keyed by one, a deletion that cleared only the
 * first became the defect the whole ordering exists to prevent, one table over.
 */
const PREFERENCE_PATH = '/api/v1/preferences/language';

const DEFAULT_TIMEOUT_MS = 45_000;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_API_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

export type ProgressOutcome =
  /** The rows are gone, or there were none. 204 either way — the endpoint is idempotent. */
  | { readonly kind: 'forgotten' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * Ask `AbOvo.Api` to forget every row it holds for the bearer's subject.
 *
 * As with the account, the subject is not a parameter: `ProgressEndpoints` reads it off the
 * token and there is no route that takes one, "because an endpoint that let a caller name
 * whose progress they wanted is an endpoint whose authorization is a parameter".
 */
export function forgetStoredProgress(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProgressOutcome> {
  return forgetRowsAt(PROGRESS_PATH, accessToken, fetchImpl);
}

/**
 * The same, for the reader's chosen edition. `PreferenceEndpoints`' delete is idempotent
 * for this caller's benefit: a retry after a half-failed deletion must not look like a new
 * failure on the screen that is telling somebody their account is gone.
 */
export function forgetStoredPreference(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProgressOutcome> {
  return forgetRowsAt(PREFERENCE_PATH, accessToken, fetchImpl);
}

/**
 * One DELETE against `AbOvo.Api`, over whichever of the reader's rows the path names.
 *
 * Written once rather than twice because the two calls differ only in the path: the
 * candidate walk, the timeout, the 401/403 collapse and the failure text are the same
 * decisions for both, and a second copy is a second place for them to drift.
 */
async function forgetRowsAt(
  path: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<ProgressOutcome> {
  const candidates = backendCandidates('api');
  let last: ProgressOutcome = { kind: 'unavailable', reason: 'no api is configured' };

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetchImpl(`${base}${path}`, {
        method: 'DELETE',
        headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.status === 204) return { kind: 'forgotten' };
      // 403 is `TokenCarriesNoSubject` — a token this service cannot file anything under.
      // It joins 401 because the instruction to the reader is the same (sign in again) and
      // because the alternative is telling them their own token is malformed.
      if (response.status === 401 || response.status === 403) return { kind: 'unauthenticated' };

      last = { kind: 'unavailable', reason: `api answered ${response.status}` };
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

/**
 * The outcome of the whole operation, in the terms the screen renders.
 *
 * `progress-not-removed` exists as its own member rather than folding into `unavailable`
 * because the two need different sentences: one says "nothing happened, try again", the
 * other has to say "your account is untouched and your reading position on this device is
 * untouched, but the copy on the account could not be removed". A reader who is told the
 * first when the second is true will not try the one thing that would fix it.
 *
 * IT COVERS BOTH OF `AbOvo.Api`'s READER ROWS and stays ONE member, which is a decision
 * rather than an oversight. The place and the chosen edition fail the same way, for the
 * same reason, and the instruction to the reader is identical — so a second member would
 * be a distinction nothing acts on, in return for a sentence nobody could write differently.
 * The screen's wording says "what your account had stored" for exactly this reason.
 */
export type AccountDeletionOutcome =
  | { readonly kind: 'deleted' }
  | { readonly kind: 'password-required' }
  | { readonly kind: 'password-rejected' }
  | { readonly kind: 'unauthenticated' }
  /** The progress call failed, so nothing was attempted against the account. */
  | { readonly kind: 'progress-not-removed'; readonly reason: string }
  /** The progress is gone and the account is not. Recoverable: the reader can try again. */
  | { readonly kind: 'account-not-removed'; readonly reason: string };

/** The calls, injected, so the ORDER is a thing a test can assert rather than read. */
export interface DeletionSteps {
  readonly forgetProgress: (accessToken: string) => Promise<ProgressOutcome>;
  /** The reader's chosen edition (ADR-0052) — `AbOvo.Api`'s other reader-scoped row. */
  readonly forgetPreference: (accessToken: string) => Promise<ProgressOutcome>;
  readonly deleteAccount: (
    accessToken: string,
    password: string | null,
  ) => Promise<DeleteAccountOutcome>;
}

const LIVE: DeletionSteps = {
  forgetProgress: (accessToken) => forgetStoredProgress(accessToken),
  forgetPreference: (accessToken) => forgetStoredPreference(accessToken),
  deleteAccount: (accessToken, password) => deleteAccount(accessToken, password),
};

/**
 * Remove everything `AbOvo.Api` holds for the reader, then their account.
 *
 * It does NOT clear the session cookies and does not touch the browser: this function is
 * the part with the decision in it, and keeping it free of `next/headers` is what lets the
 * ordering be tested without a request (P13). The route does the cookies.
 *
 * `no-such-account` from authservice is reported as `deleted`, deliberately. The progress
 * is gone and authservice has no such user, so the reader's stated goal — that neither
 * service holds anything of theirs — is met. Reporting a failure would ask them to retry
 * an operation that has nothing left to do.
 */
export async function deleteReaderAccount(
  accessToken: string,
  password: string | null,
  steps: DeletionSteps = LIVE,
): Promise<AccountDeletionOutcome> {
  /*
    BOTH OF THIS SERVICE'S READER ROWS, AND BOTH BEFORE THE ACCOUNT. The ordering argument
    above is about the SUBJECT: once authservice has marked the account deleted, nobody can
    sign in as that subject again, so anything still filed under it in `apidb` is
    unreachable for ever. That is true of the chosen edition exactly as it is of the place,
    which is why the second call is here rather than after the account — and why a failure
    in it stops the operation rather than being swallowed as the lesser of the two rows.
  */
  for (const forget of [steps.forgetProgress, steps.forgetPreference]) {
    const removed = await forget(accessToken);

    if (removed.kind === 'unauthenticated') return { kind: 'unauthenticated' };
    if (removed.kind === 'unavailable') {
      return { kind: 'progress-not-removed', reason: removed.reason };
    }
  }

  const account = await steps.deleteAccount(accessToken, password);

  switch (account.kind) {
    case 'deleted':
    case 'no-such-account':
      return { kind: 'deleted' };
    case 'password-required':
      return { kind: 'password-required' };
    case 'password-rejected':
      return { kind: 'password-rejected' };
    case 'unauthenticated':
      return { kind: 'unauthenticated' };
    case 'unavailable':
      return { kind: 'account-not-removed', reason: account.reason };
  }
}
