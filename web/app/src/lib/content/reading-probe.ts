/**
 * Whether a probe of the content API says reading is unavailable — the index's notice (issue
 * #158), kept out of the `.tsx` for `place.ts`'s reason: the unit tier has no JSX transform.
 *
 * The probe is `GET /api/proxy/api/v1/content/<track>` from the browser, the call a program's
 * contents make from the server, and it answers the one question the notice's sentence asks:
 * is the book's server not answering? That is what a program's contents would then be — the
 * error page that says so (`lib/server/content.ts`'s `unavailable`, issue #139):
 *
 *   - no answer at all (`'failed'`), or the proxy's own 503 or 504 when no rung of its ladder
 *     answered in time;
 *   - any other 5xx — a server that answered and could not serve the course, which the reading
 *     pages report as the same failure, in the same words.
 *
 * A 404 IS NOT UNAVAILABLE. The server answered: it does not hold this course, which a
 * program's contents report on the not-found page rather than on the error page, and which
 * "the book's server is not answering" would misdescribe. It is a deployment whose API was
 * never given the course this app was built with, and no sentence on the index fixes that.
 *
 * A 429 IS NOT UNAVAILABLE EITHER. It is `AbOvo.Api`'s rate limiter answering, which means the
 * service is up and talking (`lib/server/content.ts` stops its ladder on it for that reason),
 * and the reader's own next page is a different request that will very likely be served. A
 * notice on a busy moment would tell a reader the book is down when it is not.
 */
export type ProbeResult = number | 'failed';

export function readingUnavailable(result: ProbeResult): boolean {
  return result === 'failed' || result >= 500;
}
