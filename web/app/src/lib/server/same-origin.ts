/**
 * Is this request from a page on this origin?
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE COPY, BECAUSE TWO ROUTES NEED IT AND A SECOND COPY IS THE ONE THAT DRIFTS.
 *
 * It was written for `/api/auth/login`, where a cross-site form posting the attacker's own
 * credentials signs the reader into the attacker's account and everything they read syncs
 * somewhere they cannot see. `/api/auth/account/delete` needs the same check for the
 * opposite reason: there the cross-site form carries no credentials at all, rides the
 * reader's own session, and deletes the reader's own account.
 *
 * `sameSite: strict` does not cover either. On the login route the response SETS the
 * cookie rather than reading one. On the deletion route it very nearly does cover it — and
 * "very nearly" is not a property to rest an irreversible operation on, since the
 * attribute is one edit away from `lax` and nothing would fail.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  /*
   * The host as the reader's browser addressed it. Either header counts, and what the two
   * of them actually contain was measured rather than assumed — an earlier draft of this
   * function read `x-forwarded-host` first on the stated belief that "Fly rewrites host",
   * which was a belief and not a measurement.
   *
   * Put to a production `next start` with a probe route:
   *
   *   no proxy headers sent  ->  host: 127.0.0.1:3000   x-forwarded-host: 127.0.0.1:3000
   *   client sends one       ->  host: 127.0.0.1:3000   x-forwarded-host: evil.example
   *
   * So Next SYNTHESISES `x-forwarded-host` from `host` when nothing upstream sent one, and
   * passes a client-supplied one through untouched. Two consequences, and they pull in
   * opposite directions:
   *
   *   - reading either header is enough in every topology, because when no proxy sets one
   *     Next has already copied `host` into it;
   *   - `x-forwarded-host` is therefore an input a CALLER can choose.
   *
   * The second is not a weakness HERE, and the reason is the threat model rather than a
   * mitigation. This check exists to stop login CSRF, which needs a VICTIM'S BROWSER to make
   * the request: a cross-site HTML form cannot set a header at all, and a cross-site `fetch`
   * that tried would trip a CORS preflight this route does not answer. The only client that
   * can set `x-forwarded-host` is one like `curl`, which has no victim's session to ride and
   * is simply posting its own credentials to get its own cookie — which is what the route is
   * for. A forgeable header adds nothing to an attacker who has no victim.
   *
   * Do not narrow this to `host` alone on the strength of that paragraph. The measurement
   * above is of one Next version on one machine; accepting either is what makes the check
   * independent of both that and of what any proxy in front does.
   */
  const candidates = ['x-forwarded-host']
    .map((name) => request.headers.get(name))
    // A comma-separated list means several hops; the first is the one the browser used.
    .map((value) => value?.split(',')[0]?.trim())
    .filter((value): value is string => !!value);

  return candidates.includes(originHost);
}
