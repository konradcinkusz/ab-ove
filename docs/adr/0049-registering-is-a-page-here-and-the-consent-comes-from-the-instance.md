# ADR-0049: Registering is a page in this app, and the consent versions come from the instance

## Status

**Accepted.** Date: 2026-09-20.

Extends [ADR-0018](0018-password-sign-in-happens-server-side.md) to the step before it. That
decision is not superseded: registering takes the same route shape, the same same-origin
guard and the same `establishSession`, for the same reasons.

## Context

**You could sign in and you could not sign up.** `middleware.ts` has carried `/register` in
its public-path list since the gate was written — with the reasoning that "a reader deciding
whether to trust what this system measures must not have to register first" — and no page
was ever put behind it. `/login` invited a reader to use "the email address and password you
registered with the identity service this deployment is configured against", and the only
way to obtain one was to `POST /api/v1/auth/register` by hand.

Every gate in this repository was green throughout, which is the part worth recording: a
route in a public-path list is not a page, and nothing in the tree asked whether it was.

Three constraints shaped what could replace it.

**FRONTEND-BFF.md §1 and §3.** The browser talks only to this origin, and the session cookie
is set by a server route because `document.cookie` cannot set `HttpOnly`. A registration form
posting to `authservice` directly breaks the first; one that took tokens through the document
on the way to `/api/auth/session` satisfies §3's minimum and hands §8's "token visible in
devtools" a window. ADR-0018 already refused that trade for a password form, and a chosen
password is the same form one step earlier.

**authservice requires a consent, and defines what it is.** `AuthController.Register` refuses
any registration whose `acceptedTermsVersion` and `acceptedPrivacyVersion` are not exactly
the versions that instance is configured with, and publishes `GET /auth/consents/versions`
anonymously so a sign-up form can ask. Upstream's own comment says why: a frontend that
hard-codes them "silently breaks registration the moment one is bumped — which is the whole
point of them being versioned."

**P8 — a deployment with no identity service is a supported state**, and so is one whose
identity service cannot be reached.

## Decision

**`/register` is a plain HTML form with no client component behind it**, posting to
`/api/auth/register` on this origin. The route talks to authservice server-side, verifies the
token it mints against the JWKS, and sets the two cookies. No token is ever in the document,
and registering works with JavaScript disabled — as reading does.

**The consent versions are fetched, never written down.** The page asks the instance and
renders what it answers, both as the sentence the reader accepts and as two hidden fields.
The route asks again, and **forwards only versions that match what the form carried**:

- the form's copy is what the reader was SHOWN, and it is a value the caller chooses, so it
  is never forwarded as-is;
- the fetched copy is what the instance requires NOW, and forwarding that alone would record
  an acceptance of a document the reader never saw.

A mismatch is `consent-stale` — load the page again and read it — rather than a retry.

**The outcomes are a closed set, in this application's words** (`registration-problem.ts`),
looked up from a code on the query string exactly as `sign-in-problem.ts`'s are, and for the
same reason: the only channel a 303 has back to the page is the URL, and a page that rendered
`?error=<text>` would put any sentence an attacker chose into this site's chrome on the
screen where a password is chosen.

**Three answers are distinguished that a smaller set would collapse**, because each is fixed
somewhere different: an address that already has an account (the remedy is the sign-in form),
a password the policy refuses (the remedy is this form, and the page states all five rules
rather than waiting to refuse again), and a consent that was not given. A fourth,
`verification-required`, is a NOTICE and not a problem: authservice answers 202 with no token
when the deployment can send email, and reporting that as a failure would tell a reader whose
account was created that it was not.

## Consequences

**Two calls to authservice per registration**, where sign-in makes one. Registration is not a
hot path and the second call is a GET, but it is a real cost and it is the price of the
reader accepting a version this app has independently confirmed is current.

**The refusals are matched on upstream's own sentences, and there are TWO body shapes.**
`Register` answers 400 with no error code in either — only sentences — so
`classifyRegisterResponse` matches substrings, as `second-factor.ts` already does. A
rewording upstream degrades to `refused` ("we did not understand the answer"), which is the
safe direction, and the test file says so.

The second shape is the part worth recording, because **reading the source was not enough to
find it**. `[ApiController]` turns `RegisterRequest`'s data annotations into a
`ValidationProblemDetails` *before the action body runs* — so `Register`'s own
`if (!ModelState.IsValid)` branch never executes and the shape it would have written never
appears. What a malformed address actually produces is
`{"errors": {"Email": ["Invalid email format"]}}`, an object keyed by field, where the
controller's own refusals are `{"errors": [ "..." ]}`, a list.

**Measured, on 2026-09-20**, against authservice built from its source at the tag this repo
pins (`v0.3.1`) on a local Postgres, with the web app's own BFF in front of it — the
published image could not be pulled in that sandbox, so the tag was built rather than run.
Captured: a registration answering 303 with both session cookies (`HttpOnly`, `Secure`,
`SameSite=strict`); `taken`, `weak-password`, `consent-stale`, `consent-required` and
`refused` each reached through `POST /api/auth/register`; a cross-origin post refused 403;
and the five 400 bodies, three of them the object shape. A first draft that read only the
list reported `refused` for every malformed address and every password outside 8..100
characters — the kind of answer that sends a reader to check something that is not wrong.

**A rung that creates the account and then times out** reports `taken` from the next rung,
because only `unavailable` may advance the candidate ladder — walking on from any real answer
would mean posting the same registration twice. The reader is told the address already has an
account, which is true, and is sent to the sign-in form, where it is waiting.

**The page is English only**, like `/login`, on the same recorded reasoning: the chrome string
table is keyed by the reading language and this page sits outside `/read/[lang]`.

**It does not close the contract question, even so.** The measurement above is evidence about
one afternoon and one build of one tag, exactly as ADR-0018's was.
`specs/registration.spec.ts` runs against the acceptance suite's fixture, which agrees with
this app by construction, and CI starts no authservice — so nothing in this repository will
notice the day upstream rewords a sentence. `lib/server/register.test.ts` is where that would
be caught by a human reading a diff, and it now carries the captured bodies so the next reader
compares against what was seen rather than against what was assumed.

Not a deviation from the reference architecture; no register row.
