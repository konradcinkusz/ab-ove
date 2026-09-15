/**
 * The reader's own address, forwarded to authservice so its rate limit is theirs and not
 * everybody's.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM THIS EXISTS FOR, AND WHY IT IS THE BFF'S TO SOLVE.
 *
 * `POST /api/auth/login` calls authservice SERVER-SIDE, which is the property the design was
 * chosen for: the tokens never enter the document. The cost is on the other side of the same
 * coin — authservice sees one client.
 *
 * Its `auth` policy partitions on `ResolveClientIp`, which reads `Network:ClientIpHeader` and
 * otherwise the socket peer. `flyio/authservice.fly.toml` sets that to `Fly-Client-IP`, and
 * [ADR-0004](../../../../docs/adr/0004-identity-authservice-and-anonymous-reader.md) records
 * why: behind Fly every TCP peer is the edge proxy, so without the header every reader shares
 * one bucket. **That remedy was written for a browser reaching authservice through the edge.**
 * The BFF reaches it over the private `.internal` network instead, where the edge never sees
 * the request and never sets the header — so the remedy is in place and this design routes
 * around it.
 *
 * **THE NUMBERS ARE authservice's OWN, READ AT THE PINNED TAG, because the first draft of this
 * paragraph guessed one and was wrong.** It said "twenty-one attempts a minute from anyone, and
 * the next reader to try is refused". `Program.cs`'s `auth` policy is a FIXED WINDOW with
 * `PermitLimit = 20`, `Window = 1 minute` and `QueueLimit = 5`, oldest first — so twenty pass,
 * the next five are HELD until the window turns rather than refused, and only from the
 * twenty-sixth does anyone get a 429. The middle case is what the guess lost: a sign-in that is
 * not rejected and simply takes up to a minute, for a quota somebody else spent.
 *
 * It is a denial of sign-in and not a guessing hole: account lockout is separate, per-account,
 * and unaffected. Reading and the lab need no account and are untouched, which is ADR-0004's
 * second half working exactly as intended.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * NO `server-only` IMPORT, and that is the convention rather than an omission: nothing in this
 * app has one, it is not a dependency, and adding it would put every module under `lib/server/`
 * outside the bare `node --test` runner the whole estate's unit tests use. The directory is the
 * guard; a first draft of this file imported it and the tests could not load.
 *
 * **AND AUTHSERVICE HAS NO TRUST FLAG**, which is what makes this the BFF's decision rather
 * than a configuration change over there. Read at the pinned tag, `ResolveClientIp` takes the
 * header whenever one is configured, with no check that a proxy set it. That is safe for a
 * request through Fly's edge, which sets `Fly-Client-IP` itself; it is not safe for anything
 * the BFF chooses to put there. So the BFF must forward only a value it has reason to trust,
 * and "do I have a proxy in front of me" is a deployment fact this side has to be told.
 *
 * Forwarding it unconditionally would be **strictly worse than the shared bucket**: with
 * nothing in front, the header is client-supplied, and every visitor would pick their own
 * partition at authservice. That is the failure `ServiceDefaults/ClientIdentity.cs` already
 * describes for this estate's own limiter, and this mirrors its flag rather than inventing a
 * second policy.
 */

/**
 * A deployment fact, not an inference — `ClientIdentity.cs`'s words, and its default.
 *
 * Read per call rather than captured at import. A module-level constant is settled by
 * whichever test imported this file first, which makes the off case and the on case
 * unassertable in one suite; two environment reads on a path that runs once per sign-in is
 * not a cost worth that.
 *
 * Off means the header on an incoming request is client-supplied and is not forwarded, so
 * authservice falls through to the socket peer and buckets per web machine. That is today's
 * behaviour, and it is the honest state for a local run, a bare container, or any deployment
 * whose operator has not said a proxy is there.
 */
const trustsProxy = (): boolean =>
  (process.env.AB_OVO_TRUST_PROXY_CLIENT_IP ?? '').toLowerCase() === 'true';

/**
 * The header carrying the reader's address, read from the incoming request and sent onward
 * under the same name.
 *
 * ONE NAME FOR BOTH ENDS, because both ends must agree: this is the header Fly's edge sets on
 * the way in, and the one `authservice.fly.toml` names in `Network__ClientIpHeader` on the way
 * out. `fly-config-agrees.test.ts` asserts the two files still say the same thing — a mismatch
 * would forward a header nobody reads, which fails silently and looks exactly like this
 * feature working.
 *
 * `AB_OVO_*` rather than the API's `Network__*`, because that is what the web app's own code
 * reads. `flyio/web.fly.toml` records a past failure from carrying `AbOvo__*` names no reader
 * ever looked at.
 */
export const clientIpHeader = (): string =>
  process.env.AB_OVO_CLIENT_IP_HEADER || 'Fly-Client-IP';

/**
 * An address this is willing to pass on, or `null`.
 *
 * <b>MEASURED, because the first draft of this comment gave two reasons and one of them
 * described a path that cannot happen.</b> It said a value carrying a newline is header
 * injection; the test asserting it could not be written, because `Headers.append` refuses
 * `"203.0.113.7\r\nX-Injected: 1"` outright — so a CRLF cannot reach this function through a
 * real `Request` at all, and the platform is the defence rather than this regex.
 *
 * What remains is the reason that does hold: a partition key that is not an address is a
 * bucket nobody can reason about, and values that are merely odd rather than illegal —
 * `203.0.113.7 evil`, a two-hundred-character string — pass through `Headers` perfectly well.
 * The regex is cheap, and it keeps this function's output to the one shape its only caller
 * means to send.
 */
const ADDRESS = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * The address to forward with a sign-in, or `null` to forward nothing.
 *
 * `null` is not a failure: it is the configured answer whenever this deployment has not said a
 * proxy is in front of it, and the caller sends no header at all rather than sending an empty
 * one. `ResolveClientIp` guards with `IsNullOrWhiteSpace` and falls through to the socket peer,
 * so an empty header would work — read, not assumed. It would still say this side had an
 * opinion it does not have, and that is the kind of thing which survives into a version that
 * reads it differently.
 */
export function readerAddress(request: Request): string | null {
  if (!trustsProxy()) return null;

  const raw = request.headers.get(clientIpHeader());
  if (!raw) return null;

  // The first entry, in case the platform ever emits a list — authservice's own
  // `ResolveClientIp` does `value.Split(',')[0].Trim()`, and a key of "a, b" is a bucket that
  // exists for exactly one pair of hops.
  //
  // THE TRIM IS LOAD-BEARING ON ONE SHAPE, and a surviving mutation is how that was
  // established rather than asserted. `Headers.get` already trims the outer edges, so for a
  // lone address it is redundant; RFC 9110 permits whitespace around a list delimiter, and
  // for "a , b" the split leaves "203.0.113.7 ", which fails `ADDRESS` — so dropping the trim
  // answers `null` to a good address and puts the reader back in the shared bucket, silently.
  const first = raw.split(',')[0]?.trim() ?? '';

  return ADDRESS.test(first) ? first : null;
}
