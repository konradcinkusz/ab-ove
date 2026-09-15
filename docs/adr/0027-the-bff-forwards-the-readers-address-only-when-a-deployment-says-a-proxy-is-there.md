# ADR-0027: The BFF forwards the reader's address only when a deployment says a proxy is there

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #31 reports that every reader on a deployment shares one sign-in rate-limit bucket,
and that the cause is a property of a design this repository chose on purpose.

`POST /api/auth/login` calls authservice **server-side**. That is
[ADR-0004](0004-identity-authservice-and-anonymous-reader.md)'s arrangement and
FRONTEND-BFF.md §3 and §8's, and it was chosen for the property it buys: the access token and
the refresh token are consumed in the BFF and never enter the document, so §8's "token visible
in devtools/localStorage" cannot happen on the password path.

The cost is on the other side of the same coin. authservice partitions its `auth` rate-limit
policy on `ResolveClientIp`, which reads the header named by `Network:ClientIpHeader` and
otherwise takes the socket peer. `flyio/authservice.fly.toml` sets that header, and ADR-0004
records why: behind Fly's edge every TCP peer is the proxy, so without it every reader shares
one bucket.

**That remedy was written for a browser reaching authservice through the edge, and the BFF
does not.** It reaches it from inside, where the edge never saw the request and never set the
header, so authservice falls through to the socket peer — which is one web machine. The
remedy is correctly in place and the design routes around it.

The size of it is authservice's own, read at the pinned tag rather than estimated: the `auth`
policy is a fixed window of one minute with `PermitLimit = 20` and `QueueLimit = 5`, oldest
first. Twenty sign-in attempts from anybody exhaust the window for everybody; the next five
are **held** until it turns; from the twenty-sixth the answer is a 429. The held ones are
worth naming separately, because they do not present as a rate limit — they present as a
sign-in that takes a minute.

It is a denial of sign-in rather than a guessing hole. Account lockout is separate, is
per-account and is unaffected; reading and the lab need no account and are untouched, which is
ADR-0004's second half working exactly as intended. It is still the kind of failure that
presents as "your site is broken" and is invisible to every gate, because **the limiter works
perfectly on the key it was given**.

## Decision

### 1. The header is forwarded, and the decision to forward it is the BFF's

The BFF reads the reader's address off the incoming request and sends it onward with the
credentials, so authservice's limit is the reader's own.

It has to be the BFF's decision rather than a configuration change on authservice, and that
was **read at the pinned tag rather than assumed**: `ResolveClientIp` takes the configured
header whenever one is set, with no check that a proxy put it there. There is no trust flag
over there to turn on. That is safe for a request arriving through Fly's edge, which sets
`Fly-Client-IP` itself and overwrites whatever the caller sent; it is not safe for a value the
BFF chooses to put in a header, because the BFF is choosing it from something a client sent.

So the question "is there a proxy in front of me" is a deployment fact this side has to be
told, and that is what `AB_OVO_TRUST_PROXY_CLIENT_IP` is (P5 — the variable is named in
`flyio/web.fly.toml` and read from the environment; nothing in the code carries a default that
turns it on).

### 2. Unconditional forwarding was rejected, because it is worse than the bug

The obvious implementation — read `Fly-Client-IP` and pass it on — was considered and refused.
With nothing trustworthy in front of the app, that header is **client-supplied**, so every
visitor would nominate the partition they are rate-limited in and the limit would stop being a
limit at all. The shared bucket is a bad limit; that is no limit.

This mirrors a policy the estate already has rather than inventing a second one:
`ServiceDefaults/ClientIdentity.cs` gates its own header read behind
`Network:TrustProxyClientIpHeader`, defaulting false, and says the same thing in its own
comment. Two limiters in one estate disagreeing about whether a header may be trusted is the
shape of a rule that gets applied in one place and forgotten in the other.

**Off is therefore the default and it is not a degraded state.** A local run, a bare
container, or any deployment whose operator has not said a proxy is there gets one bucket,
which is today's behaviour and is the honest answer to a question nobody has answered.

### 3. `null` sends no header, rather than an empty one

`readerAddress` returns `string | null`, and `null` makes the caller omit the header entirely.

An empty header would work today — `ResolveClientIp` treats blank as absent — and it would say
this side had an opinion it does not have. That is a difference that costs nothing to respect
now and is the kind of thing that survives into a version which reads it differently.

### 4. Both ends name the header in configuration, and a test holds them together

`AB_OVO_CLIENT_IP_HEADER` on the web app and `Network__ClientIpHeader` on authservice must be
the same string. They are two files, so they can drift, and **the drift fails silently in the
most expensive way available**: this side forwards a header nobody reads, that side reads one
nothing sends, the shared bucket stays exactly where it was, and both files look configured.
The only observable is a rate limit that is still wrong, on a deployment, under load.

`web/app/src/lib/server/fly-config-agrees.test.ts` parses both files and asserts the pair. It
also asserts that the name each file carries is the one `clientIpHeader()` falls back to, so a
deployment that omits the variable still agrees rather than quietly reverting to a shared
bucket. TESTING-STRATEGY.md §3 puts a test at the layer holding the logic; the logic here is a
coupling between two files in neither layer, and this is the only thing in the repository that
can see the pair at once.

### 5. The reader-facing message no longer names the server

The `rate-limited` text said the limit "counts attempts from this server rather than from
you". That is true today and becomes **false the moment the flag is turned on** — a sentence
that would have gone quietly wrong rather than visibly. It now says the limit counts an
address rather than an account, and that a reader can meet it on their first attempt, which is
true under both configurations: with forwarding off the address is the server's and is shared
by everyone; with it on it is the reader's own and is still shared with anyone behind the same
network.

## Consequences

**A reader on a Fly deployment gets their own bucket, and a deployment without a trusted proxy
keeps the one it had.** Nothing about the token path changes: the tokens are still consumed in
the BFF and still never reach the document.

**Two variables and one test exist whose only job is to keep two files agreeing.** That is a
real cost and it is smaller than the alternative, which is finding out from a deployment.

**The regex on the forwarded value is narrower than its first justification.** It was written
against two reasons and one of them was measured to be impossible: `Headers.append` refuses a
value carrying CRLF outright, so a header-injection payload cannot reach this function through
a real `Request` at all and the platform is the defence rather than this code. What the regex
does buy is that a partition key is an address and not a two-hundred-character string, and the
comment now says only that. A test keeps the measurement.

**One line of that function was decoration until a mutation said otherwise.** Deleting the
`.trim()` on the forwarded value left every test green. Measured: `Headers.get` trims the outer
edges already, so for a lone address it is redundant — and RFC 9110 permits whitespace around a
list delimiter, where dropping it turns a good address into `null` and puts the reader back in
the shared bucket without a sound. It is also the point at which this resolver and
authservice's, which trims, would have started keying differently on the same input. The test
that now holds it exists because the mutation pass ran, not because the case was foreseen.

**This does not make sign-in rate limiting correct in general, and the ADR should not be read
as claiming it.** Readers behind one corporate NAT or one mobile carrier gateway still share a
bucket; that is a property of address-based limiting rather than of this change, and a fix
would be a per-account or per-challenge limit at authservice, which is upstream's to make. It
is out of scope here in the precise sense that this repository does not own that service's
policy.

**Not deployed, and therefore not observed.** The whole of it is reasoning against
`flyio/*.toml`, against authservice's source at its pinned tag, and against unit tests; issue
#21 is the first deploy, and it is blocked on a human setting Fly.io secrets. The gate that
would show the shared bucket actually gone is a live one and it has not been run.
