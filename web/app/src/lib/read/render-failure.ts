/**
 * What the error page can know about the failure it stands behind (issue #139) — kept out of
 * the `.tsx` files for `place.ts`'s reason: the unit tier strips types and has no JSX
 * transform, so logic that lives only in a component is tested by nothing but a browser.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PAGE IS HANDED TWO THINGS, AND EACH ANSWERS ONE QUESTION.
 *
 * `app/error.tsx` receives the error and nothing else about the request. In production Next
 * redacts the error's message before it reaches the browser, so the only facts it can read
 * are the ADDRESS that failed and the error's DIGEST — and between them they answer the two
 * questions the page has to: which edition to speak, and what to say happened.
 *
 *   - The address is `/read/<track>/<unit>/<lang>/…` on the whole reading surface, so the
 *     edition and the program are in it (`failedReading`).
 *   - The digest is set by the server, and a digest the server set ITSELF survives the trip
 *     where the message does not: Next keeps a digest an error already carries
 *     (`next/dist/server/app-render/create-error-handler.js`, "respect the original digest")
 *     and computes one only when there is none. So the reading page marks the one failure
 *     it knows the cause of — the content API did not answer (ADR-0060) — and the page can
 *     say that and only that, instead of blaming the one cause for every failure the way the
 *     old page blamed the bundle for all of them.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The digest prefix of "the content API did not answer". What follows it is random, so each
 * failure still has its own reference for a reader to quote and an operator to find in the
 * log — which is what the digest was for before it carried a meaning.
 */
export const CONTENT_UNAVAILABLE = 'ab-ovo-content-unavailable';

/**
 * The error a reading page throws when every candidate address of `AbOvo.Api` failed
 * (`lib/server/content.ts`'s `unavailable`). The reason — which addresses, what each said —
 * is in the MESSAGE, which only the server's log sees; the digest carries none of it, because
 * the digest is sent to the browser and a backend address never is (FRONTEND-BFF.md §1).
 */
export function contentUnavailable(reason: string): Error & { readonly digest: string } {
  return Object.assign(new Error(`content API unavailable: ${reason}`), {
    digest: `${CONTENT_UNAVAILABLE}:${crypto.randomUUID().slice(0, 8)}`,
  });
}

/**
 * Whether the failure the error page stands behind is the content API not answering. It takes
 * whatever was thrown, as Next's own `ErrorInfo` types it, because a throw need not be an
 * `Error` and a guess about its shape is how a page crashes while explaining a crash.
 */
export function isContentUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false;
  const { digest } = error;
  return typeof digest === 'string' && digest.startsWith(`${CONTENT_UNAVAILABLE}:`);
}

/** The edition and the way back, read off a failed address. */
export interface FailedReading {
  /** The edition segment when the address is a reading address; the page falls back to English. */
  readonly language?: string;
  /**
   * The program's contents, when the address names a program and is not those contents
   * itself — the one page it would be pointless to offer as the way back from them.
   */
  readonly contentsHref?: string;
}

/**
 * What a failed address says about where the reader was.
 *
 * Only a whole reading address counts — `/read/<track>/<unit>/<lang>` and anything under it —
 * and only its own segments are used, as they arrived: the href is the address the reader was
 * already at, cut back, so it can lead nowhere the reader was not already asking to go.
 */
export function failedReading(pathname: string | null | undefined): FailedReading {
  const [, root, track, unit, language, ...rest] = (pathname ?? '').split('/');
  if (root !== 'read' || !track || !unit || !language) return {};

  const onContents = rest.every((segment) => segment === '');
  return onContents ? { language } : { language, contentsHref: `/read/${track}/${unit}/${language}` };
}
