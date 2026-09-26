# ADR-0018: A password sign-in happens server-side, and the browser is told a status

## Status

**Accepted.** Date: 2026-09-14. Amended on 2026-09-26 (#166): a failed attempt fills the address
back in, through a cookie this origin's server sets and never through the URL, and the sign-in
page follows the reader's edition — see the struck paragraphs under *A plain form* and in
*Consequences*. The route, the form and the reasoning against the URL are unchanged.

Amended on 2026-09-26 (#170): the way back into an account takes the same shape, and the address
and the token in a link from one of the identity service's emails leave the URL at the first hop,
into a `SameSite=Lax` cookie — see *Amendment 2026-09-26 — the way back into an account* at the
end, and the qualified paragraph at the head of *Consequences*.

## Context

[ADR-0004](0004-identity-authservice-and-anonymous-reader.md) adopts `authservice` and
insists the reader loop works with no account at all. [ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md)
built the loop's memory in the browser first, so the account is an addition to something
that already works rather than the thing that makes it work.

What was left was the form. FRONTEND-BFF.md §3 gives the shape: after a sign-in the client
POSTs its tokens to its own BFF route, which sets them as cookies, because `document.cookie`
cannot set `HttpOnly` and a server route is therefore the only way to get the property.
`/api/auth/session` has implemented that since Phase 0.

Two things about `authservice` decided the rest, and both were read out of its source at the
pinned tag rather than assumed:

1. `POST /api/v1/auth/login` takes `{email, password}` and answers **HTTP 200 in two
   different shapes**. An account with no second factor gets `TokenResponse`; an account with
   one gets `TwoFactorRequiredResponse`. Its own controller comments on this, because only
   one type can be declared per status code.
2. The `auth` rate-limit policy partitions per client IP, and account lockout is five failed
   attempts.

## Decision

### The credentials go to this origin, and the tokens never leave this process

`POST /api/auth/login` takes the credentials, calls `authservice` from the server, verifies
the access token it gets back, and sets the two session cookies. The browser receives a
status and a destination. It never holds a token, not even briefly.

The alternative satisfied the guide to the letter and was rejected. The BFF proxy already
fronts `authservice`, so a form could have posted to `/api/proxy/auth/api/v1/auth/login`;
the browser would then have held the access token and the refresh token in JavaScript for as
long as it took to hand them to `/api/auth/session`. §3 permits that, and for an OAuth
callback it is unavoidable — the tokens arrive at the browser by construction. For a
password form it is avoidable, so it is avoided. §8's "Token visible in
devtools/localStorage" cannot happen to a token that was never in the document.

`/api/auth/session` stays exactly as it was. It is the hand-over route for the shape that
cannot be done this way, and both routes set cookies through one `establishSession`, so the
attribute set and the `maxAge` arithmetic have one copy. §8's "Login loop after logout" is
what a second, drifted copy buys.

### A plain form, and no JavaScript on the happy path

`<form method="post" action="/api/auth/login">`, answered with a 303. There is no client
component on the sign-in page. The reading surface works with script disabled and a sign-in
that did not would be the first thing in the product to require it.

303 rather than 302 because the browser must follow it with GET: a 302 after a POST may
repeat the POST, which here means re-submitting a password on a reload.

~~The consequence taken on purpose: the email is **not** filled back in after a failed
attempt. The only channel a redirect has is the URL, and an address bar is the one place a
value reaches browser history and every access log between here and the reader. One retype
is cheaper than that.~~ **Since issue #166 it is filled back in, and still never through the
URL.** The URL is not the redirect's only channel: the 303 can set a cookie, which the browser
sends with the GET it makes next. The route leaves the address in one set by this origin's
server — HttpOnly, SameSite=strict, scoped to `/login`, and gone in a minute
(`web/app/src/lib/server/sign-in-address.ts`) — and removes it as soon as a password is
accepted. The reasoning against the URL is unchanged, and it is why the address travels this
way instead.

### A 200 is not a session

`classifyLoginResponse` tests **positively** on both sides: a body carrying
`requiresTwoFactor` is a challenge, a body carrying a non-empty `accessToken` is a session,
and a 200 carrying neither is a contract this app does not recognise rather than a session
with a missing token.

Reading `accessToken` off a challenge body would not have forged a session —
`verifyAccessToken` refuses a challenge token anyway, because `authservice` signs challenges
with the same key and separates them only by audience (`AbOvo:2fa`). The damage would have
been the **message**: every reader with two-factor enabled told that their correct password
was wrong, for ever, with no password able to fix it. Completing a second factor is
[#30](https://github.com/konradcinkusz/ab-ove/issues/30); until then the page says what has
happened rather than lying about it.

### A rejection is terminal; only a transport failure walks the ladder

FRONTEND-BFF.md §5's candidate ladder returns up to four addresses for the same service.
`authservice` locks an account after five failed attempts. A loop that retried a rejected
password would spend four of a reader's five attempts on one typo and lock them out of their
own account on the second wrong password.

It is the rule in `token.ts` seen from the other side: there, advancing past a terminal
verification error is a verifier shopping for a key set that will accept the token it was
handed; here, advancing past a rejection is a client spraying one credential across every
address it knows.

### The outcomes are finer than "it did not work"

An unverified email, a locked account, a rate-limited address, a second factor and an
issuer/audience mismatch all look like a wrong password if there are only two outcomes — and
only one of the five is fixed by typing the password again. The one that matters most is the
last: `authservice` accepts the password, mints a token, and this deployment's expected
issuer or audience refuses it. Reported as a credential failure that is a loop no reader can
leave, however many times they type the right password. It is reported as a configuration
fault that needs an operator, because that is what it is.

### The page renders from a closed set, never from the URL

The route answers a form post with a redirect, so its only channel back to the page is the
URL — and a URL is chosen by whoever sends the link. `?error=<code>` is looked up in
`SIGN_IN_PROBLEMS`; anything else renders nothing. A page that rendered the raw value would
put any sentence an attacker composed into this site's own chrome, on the screen where a
password is typed, and React escaping the HTML does nothing about that.

`Object.hasOwn`, not `in`: `in` walks the prototype chain, so a table looked up with it
answers `toString` and `constructor`.

### Cross-site posts are refused on `Origin`

A form on another site can POST here with the **attacker's** credentials. Because the
response *sets* a cookie rather than reading one, `sameSite: strict` does nothing about it:
the reader carries on believing they are signed in as themselves while everything they do
lands in somebody else's account. For this product that means their reading progress syncs
somewhere they cannot see.

A browser sets `Origin` on every POST and a page cannot forge it, so it is the defence. A
request with no `Origin` is refused rather than trusted — every caller this route has is a
browser making a same-origin request. The expected host comes from `x-forwarded-host` before
`host`, because Fly terminates TLS and rewrites the latter.

### "Configured" means an operator said so

`backendCandidates` always returns something: rungs three and four are derived and guessed so
that one code path works on a laptop, under Aspire and on Fly. So "is there a candidate" is
true everywhere and answers nothing. `backendConfigured` asks the question the page has to
ask — *was this deployment given an identity service* — and only the explicit and
discovered rungs count. Offering a form on the strength of a guess is how a reader types a
password into a page that had nobody to ask.

It is conservative: a laptop running `authservice` on 8081 with no variable set reads as
unconfigured. The fix is to set the variable, which is P5 and is what every other
environment already does.

## What was measured, and against what

`authservice`'s pinned image **could not be pulled in the sandbox this was written in** —
the egress proxy denies the GHCR blob CDN (`403` from `pkg-containers.githubusercontent.com`),
and so does Docker Hub's. So the paths below were driven against a ~60-line Node fixture
speaking the shapes read out of `AuthController.Login` and `AuthDtos.cs`, serving a real
RS256 JWKS and signing real tokens, with a production `next build` in front of it.

That proves the **wiring**. It does not prove the **contract**, because the fixture and this
code agree by construction. The contract is pinned separately, in
`web/app/src/lib/server/sign-in.test.ts`, whose cases were written from `authservice`'s
source rather than from this module's behaviour — and even that is a claim about one tag.
~~[#29](https://github.com/konradcinkusz/ab-ove/issues/29) is open for the CI fixture that
would run any of this on every push; today none of it does.~~ **#29 is closed**: four of
the rows below now run on every push and on every pull request, against a fixture the
suite starts. See [ADR-0028](0028-the-acceptance-suite-signs-in-against-a-fixture-and-says-what-that-does-not-prove.md).

| what was driven | what came back |
|---|---|
| `GET /login`, identity configured | a form posting to `/api/auth/login`, with `autocomplete` on both fields |
| correct password, form-encoded, same-origin | `303`, `location: /`, two cookies, each `Secure; HttpOnly; SameSite=strict` |
| then `GET /api/auth/session` | `authenticated: true`, with the subject, email and roles off the token |
| wrong password | `303 /login?error=rejected`, **no cookie** |
| an account answering with a 2FA challenge | `303 /login?error=second-factor`, **no cookie** — **superseded by ADR-0029**: it is now `303 /login/2fa`, with a challenge cookie and no session cookie |
| `Origin: https://evil.example` | `403` |
| no `Origin` header | `403` |
| `redirect=//evil.example` | refused; destination falls back to `/` |
| `redirect=/read/P01/en/7` | `303 location: /read/P01/en/7` |
| audience deliberately mismatched | `303 /login?error=token-rejected`, **no cookie** |
| no `AB_OVO_AUTH_URL` at all | no form on the page; route answers `501 not-configured` |
| JSON caller, wrong password | `401 {"problem":"rejected"}` |
| JSON caller, correct password | `204` and the cookies |
| `content-type: text/plain` | `415` |

One defect was found by that run and fixed: the `Location` header was absolute, built from
`request.url`. A request to `127.0.0.1:3100` produced a `Location` naming `localhost:3100`.
A later probe measured why, and it is worse than "reconstructed from the `host` header": on
a production `next start`, a request whose `host` is `127.0.0.1:3000` has a `request.url` of
`http://localhost:3000/...`, so the value is the server's own origin and names the browser's
address in no topology at all. Every `Location` this route emits is now relative, which RFC
7231 allows and which every browser resolves against the address the reader actually used.

## Consequences

**The browser cannot hold a token, and that is now structural rather than disciplined.** No
route hands one out; the proxy injects the bearer server-side from the cookie; the cookie is
`HttpOnly`. There is nothing for a later refactor to lose.

**Since issue #170, *a token* in that paragraph means a session's**: the access and refresh
tokens `establishSession` sets, the bearers the proxy injects. A link from one of authservice's
emails carries a token of another kind, a credential for one purpose that signs nobody in, and it
reaches the browser whatever this app does, in the address bar, because authservice builds the
link. `/reset-password` and `/verify-email` hand it back to the browser in an `HttpOnly` cookie
for up to fifteen minutes, and it is spent only by a POST to this origin, whose route sends it on
to authservice. See the amendment at the end.

**~~An account with two factors cannot sign in.~~** It was detected and reported honestly,
and it was [#30](https://github.com/konradcinkusz/ab-ove/issues/30) — **now closed**. The
challenge this route detects is stored in a short-lived `HttpOnly` cookie and exchanged at
`/api/auth/2fa`; the tokens that come back go through `establishSession` by exactly the path
described above, so nothing in this ADR's reasoning changed. See
[ADR-0029](0029-the-two-factor-challenge-is-a-cookie-and-the-code-is-the-only-thing-the-reader-supplies.md).

Struck through rather than deleted, because the sentence records what this design cost when
it was taken, and a consequence that was true and has been paid is worth more on the page
than an absence.

**Sign-in is deniable, and this decision is what made it so.** `authservice`'s `auth`
policy is twenty attempts a minute per client IP. ADR-0004 already met that problem and
solved it: `flyio/authservice.fly.toml` sets `Network__ClientIpHeader = "Fly-Client-IP"`,
because *"behind Fly every TCP peer is the edge proxy"*. That remedy assumes the browser
reaches `authservice` **through the edge**, which sets the header — and the whole point of
this ADR is that it no longer does. A call over the private `.internal` network never passes
the edge, so the header is absent and `ResolveClientIp` falls back to the socket peer, which
is the web container. Every reader shares one partition again, per web machine.

Password guessing against a particular account is still bounded by `authservice`'s
per-account lockout, which none of this touches. What is unbounded is denial: twenty-one
attempts from anyone, and the next reader to try is refused.

Forwarding the header was not done here, and not because it is hard. This repo's own
`ServiceDefaults/ClientIdentity.cs` records why it cannot be done unconditionally — *"with
nothing in front, the header is client-supplied and every visitor picks their own bucket"* —
so it needs the same trust flag the .NET side has, which is a configuration decision rather
than a line of code. And its whole effect is at `authservice`'s limiter behind a Fly edge,
neither of which exists in the sandbox this was measured in: it would have shipped unmeasured.
[#31](https://github.com/konradcinkusz/ab-ove/issues/31) carries the options.

~~**The sign-in page is English only.** The chrome string table is keyed by the *reading*
language — the edition of the book a reader is in — and this page sits outside `/read/[lang]`,
so there is no language for it to follow. Giving it one is a decision about what a reader's
*interface* language is, which is a different question from which edition they read, and it
is not made here.~~ **It follows the reader's edition since issue #166.** The premise went
with [ADR-0052](0052-one-language-control-remembered-and-english-by-default.md): a reader always
has an edition — asked for, remembered, or English by default — so there is one to follow, and
no guess about an interface language is needed to follow it. Every link into the page carries
`?lang=`, the form carries it on to every page the route answers with, and the words are in
`chrome.ts` beside every other word a reader sees.

**The deployed web app was configured with five variables nothing reads, and this is what
found it.** `flyio/web.fly.toml` carried `AbOvo__ApiBaseUrl`, `AbOvo__AuthBaseUrl`,
`AbOvo__JwksUri`, `AbOvo__Issuer` and `AbOvo__Audience`, on the stated reasoning that the
double-underscore prefix is the estate's convention across both runtimes. The Node side does
not implement that convention: `backends.ts` and `token.ts` read `AB_OVO_API_URL`,
`AB_OVO_AUTH_URL`, `AB_OVO_AUTH_PUBLIC_URL`, `AB_OVO_JWT_ISSUER` and `AB_OVO_JWT_AUDIENCE`,
and a grep for each of the five found that file and no reader.

It failed silently for exactly the reason `backendConfigured` exists: the ladder's derived
`.internal` rung answers, so the proxy and the API would have worked and only a question of
the form *was this deployment configured* could tell. Sign-in is the first such question, and
the symptom would have been `/login` reporting no identity service on the one environment
that has one. Never observed, because nothing has been deployed
([#21](https://github.com/konradcinkusz/ab-ove/issues/21)).

The file now carries the names the code reads, with the public addresses its own comment
argued for — `.internal` does not start a stopped machine — and `secrets.env.example`'s
`value:` lines, which said `.internal`, agree with it. **This is the one change in this PR
that could not be verified by running anything**: the evidence is static, and it is that the
names in the config are now the names in the code.

**`publicAuthBaseUrl` keeps its purpose and loses this caller.** The browser no longer needs
a public address for `authservice`, because it never speaks to it. The function is still the
right answer for the one thing that cannot be proxied — a navigation to an external identity
provider's own page — which is where external sign-in will need it.

## Amendment 2026-09-26 — the way back into an account

### Context

**A reader who forgot the password, or lost the confirmation email, had nowhere to go** (#170).
[The probe](../architecture/AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md) for #156 read the pinned
authservice and ran it. `forgot-password`, `reset-password`, `resend-verification` and
`verify-email` are anonymous JSON endpoints, and none of them issues a token (§2), so this
decision's shape fits all four: a plain form, a route on this origin, and an outcome from a
closed set (§7). Two things about them are authservice's to decide, not this app's:

- **The links in its emails carry the reader's address and a token in the query**, at paths
  it fixes: `{FrontendBaseUrl}/reset-password?token=…&email=…` and `/verify-email?…` (§3). So
  when a reader opens one, the address bar holds both, whatever this app builds. This decision
  kept the sign-in address out of the URL to avoid exactly that. The probe left it to #170 to
  decide whether "Nothing about the account appears in the URL", #170's Done-when, covers that
  arriving address.
- **It answers "a link has been sent" whether or not it can send one.** Without a mail provider
  it sends nothing, and no endpoint says which kind of instance it is (§4).

### Decision

- **The rule covers every address the app shows after a link lands. The landing address is
  authservice's.** No route here can change what authservice writes into an email, so the rule
  is kept from the first hop on. `specs/account-recovery.spec.ts` collects every address on this
  origin the browser commits to from the click on, and holds each one to carrying neither the
  address nor the token.
- **`/reset-password` and `/verify-email` are routes, not pages.** Each reads the pair off its
  own query and keeps it in a cookie only this origin's server reads: `HttpOnly`, for fifteen
  minutes (`lib/server/emailed-link-cookie.ts`). It then answers `303` with `/login/reset` or
  `/login/confirm`, and `Referrer-Policy: no-referrer`. No document is rendered at an address
  that holds a token. The pair never enters the document either: the form on the page carries
  the edition and what the reader types, and its route reads the pair from the cookie and calls
  authservice from this server, as `/api/auth/login` does. That POST is what spends the token,
  and a GET spends nothing, so a mail program that fetches a link to scan it uses nothing up.
  The page gate carves both addresses out by name (`lib/page-gate.ts`), so the query reaches
  the route. A request for a link refused for its address fills its field back in the way a
  failed sign-in does, through the sign-in address's cookie.
- **That cookie is `SameSite=Lax`.** The rule for a cookie this origin's server sets is `Strict`,
  as `sessionCookieAttributes()` and `readerCookieAttributes()` give it. This cookie lifts the
  rule, for a reason only the link has. The link is followed from another site, the reader's
  mail, and a browser does not send a `Strict` cookie on the redirect that such a navigation
  follows. With `Strict`, the page after the landing found no link held: measured. What `Lax`
  gives up is `Strict`'s refusal to send the cookie on a top-level GET another site starts, and
  such a GET only renders a page that says whether a link is held. It is still not sent on a
  POST from another site, and what spends the pair is a POST from this origin's own form, to a
  route that refuses any other `Origin`.
- **Whether an email can come is the deployment's to say: `AB_OVO_AUTH_SENDS_EMAIL`.** There is
  nothing to infer it from. Where it is not `true`, `/login/forgot` and `/login/resend` offer no
  form and say this site sends no email, and `/login` does not offer the confirmation link
  again. The AppHost sets it, because there authservice writes each email's link to its own log.
  A link that has already arrived works either way: the pages it leads to promise nothing.

### Consequences

- **A deployment offers no reset until it can send email.** That takes one change: the secret
  `SendGrid__ApiKey` (`flyio/SECRETS.md`), `SendGrid__FromEmail` in
  `flyio/authservice.fly.toml` beside the `FrontendBaseUrl` already there, and
  `AB_OVO_AUTH_SENDS_EMAIL = "true"` in `flyio/web.fly.toml`. Until then, a reader who forgot a
  password is told on the page that this site sends no email. Nothing is deployed, and no
  deployment described in `flyio/` sends email. No file can check that the flag and the key
  agree, because the key is a secret.
- **The exception has to stay `Lax`.** `Strict` is the direction a review pushes a cookie that
  holds a credential. With it, every emailed link opens a page that says no link is held, and
  nothing reports an error. `specs/account-recovery.spec.ts` follows each link from a page on
  another host, which is the only way a test can see this, and it fails with `Strict`.
- **The landing's own request still carries both halves**, into everything this decision held
  against a URL: history, and every access log between the reader and this origin. authservice
  writes them into the link, and no route here can take them back out. What this app controls
  is everything after that one request: no address it answers with carries either, and going
  back from the page the landing opens returns to the mail, not to the landing.
- **A reset form sent twice before the first answer arrives can report a spent link for a
  password it changed.** It is a plain form with no script, so a double press can send two
  POSTs. The first changes the password, and authservice refuses the second's token as used.
  The page then says nothing was changed, which is untrue. `lib/server/account-recovery.ts`
  records the same sentence for a timeout after authservice has acted. The new password works,
  and the page offers a new link.

Not a deviation from the reference architecture; no register row.
