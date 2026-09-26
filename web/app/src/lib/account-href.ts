/**
 * The addresses of the three pages a reader signs in or registers on — `/login`, its second
 * step and `/register` — carrying where the reader was going and the edition they read in.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE BUILDER, BECAUSE EVERY WAY INTO THESE PAGES HAS TO CARRY THE SAME TWO THINGS (issue #166).
 *
 * The destination was always carried — FRONTEND-BFF.md §4's `?redirect=`, validated on the
 * way back by `safeRedirectTarget` — and the edition was not: the index's *Zaloguj się* and
 * *O ab-ovo* opened English pages, because nothing told them the reader was reading Polish.
 * The pages follow the edition now, and that only holds if every link into them,
 * every link between them and every redirect the auth routes answer with says which one. A
 * template string in each of those places is a chance per place to drop a parameter, and a
 * dropped `lang` reads on the page as the reader's choice being quietly undone — "Start
 * again" on the code screen dropped the destination exactly that way until this issue.
 *
 * `URLSearchParams` does the encoding, and the order is fixed — a code, then the
 * destination, then the edition — so one page has one address, as `index-href.ts` fixes its
 * own order for the same reason.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export interface AccountPageQuery {
  /** A problem code the page looks up in a closed set (`sign-in-problem.ts`) — never a sentence. */
  readonly error?: string | undefined;
  /** A notice code, which only `/register` has (`registration-problem.ts`). */
  readonly notice?: string | undefined;
  /** Where signing in returns the reader: a same-origin path `safeRedirectTarget` has passed. */
  readonly redirect?: string | null | undefined;
  /** The reader's edition, which the page follows (ADR-0052, issue #166). */
  readonly edition?: string | undefined;
}

function accountHref(path: string, { error, notice, redirect, edition }: AccountPageQuery): string {
  const query = new URLSearchParams();
  if (error) query.set('error', error);
  if (notice) query.set('notice', notice);
  if (redirect) query.set('redirect', redirect);
  if (edition) query.set('lang', edition);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** `/login`. */
export function signInHref(query: AccountPageQuery = {}): string {
  return accountHref('/login', query);
}

/** `/login/2fa` — the code, after a password answered with a challenge (ADR-0029). */
export function secondFactorHref(query: AccountPageQuery = {}): string {
  return accountHref('/login/2fa', query);
}

/** `/register`. */
export function registerHref(query: AccountPageQuery = {}): string {
  return accountHref('/register', query);
}
