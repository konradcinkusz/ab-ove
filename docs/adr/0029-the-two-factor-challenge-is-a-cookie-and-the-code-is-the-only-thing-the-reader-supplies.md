# ADR-0029: The two-factor challenge is a cookie, and the code is the only thing the reader supplies

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #30: an account with two-factor authentication **cannot sign in at all**.

`authservice` answers a *correct* password with HTTP 200 in two shapes — `TokenResponse` for
an account with no second factor, `TwoFactorRequiredResponse` for one with it — and
[ADR-0018](0018-password-sign-in-happens-server-side.md) detects the second and reports it
honestly: *that account uses a second factor, which this page cannot complete yet*. That is
truthful and it is not a sign-in. Such an account had no way through the screen.

The issue names the design question and does not answer it: **where does the challenge live
between the two requests?** A hidden field on a second form, or a short-lived `HttpOnly`
cookie.

The contract was read from authservice's own source at the tag `flyio/authservice.fly.toml`
pins — `TwoFactorController.LoginWithTwoFactor`, `TwoFactorLoginRequest`,
`TokenService.GenerateTwoFactorChallengeToken` — rather than from the issue's prose:

| | |
|---|---|
| endpoint | `POST /api/v1/auth/2fa/login` |
| body | `{challengeToken, code?, recoveryCode?}` — either, never both, never neither |
| 200 | `TokenResponse`, the same shape the first factor produces |
| 401 | invalid or expired challenge · wrong code · **account locked since the first factor** |
| 400 | neither a code nor a recovery code |
| 429 | the same `auth` rate-limit policy as the first factor |
| challenge | `aud` = `<audience>:2fa`, `purpose: two_factor_challenge`, five minutes |

## Decision

### 1. The challenge is a cookie, and the reader's browser never sees it

`ab_ovo_2fa`: `HttpOnly`, `Secure` outside dev, `SameSite=strict`, path `/`, lifetime from
authservice's own `expiresIn` and capped at ten minutes.

**The hidden field was refused.** The challenge is signed with the *same key* as a session
token and separated from one only by audience — which is why `verifyAccessToken` rejects it,
and why it is exactly the sort of thing FRONTEND-BFF.md §8 means by "token visible in
devtools". Putting it in the DOM would additionally leave it in the browser's form restore
and in any screenshot of the page, at the one moment when the reader has already proved
their password.

It costs a third cookie to get the delete path right for, which is the cost the issue names.
That is paid by `CLEARABLE_COOKIES`, deliberately **wider** than `SESSION_COOKIES`: one list
answers *what makes a session*, the other *what must not survive a sign-out*. The middleware
still clears only the session pair, and that is not an oversight — a reader who opens a gated
page in a second tab while their authenticator app is open has done nothing that should cost
them the challenge.

### 2. A wrong code is the one outcome that keeps the challenge

Every other path out of `/api/auth/2fa` clears it. A wrong code does not, because the
challenge is still good and the reader has attempts left; throwing it away would send them
back to the password screen for a mistyped digit.

That distinction is the whole reason there are **two** new problem codes rather than one:
`second-factor-rejected` is *try the code again* and `second-factor-expired` is *start the
sign-in again*, and an expired challenge redirects to `/login` rather than to the code screen,
because a form whose submission can only be refused is the sign-in loop the problem set exists
to prevent.

authservice answers **401 for three different situations** and distinguishes them only in a
message. This is the one place in the application that reads one, and the failure direction is
asserted rather than hoped for: a 401 this app cannot place degrades to `rejected` — *try
again* — which costs the reader one retry, where defaulting to `challenge-expired` would throw
away a working challenge.

### 3. The ladder does not retry a rejection, and the arithmetic is sharper than the password's

`RejectSecondFactorAsync` calls `AccessFailedAsync`, so a wrong code counts against the same
five-attempt lockout budget — and `backendCandidates('authservice')` returns up to four
addresses for one service. A loop that retried a rejection would spend four of the reader's
five attempts on a single mistyped digit and lock them out on the second go.

`challenge-expired` does not advance either, for a *different* reason: the challenge is signed
by one service, so a rung that refuses it is not a rung that failed.

### 4. Retryability was settled by a failing test

`sign-in-problem.test.ts` asserts the whitelist of retryable codes, and the first draft marked
`second-factor` retryable on the strength of its own wording. It is `unavailable` wearing a
second-factor name — the service could not be reached — so offering the code form again would
be the interface inviting an attempt that cannot work. The test now records the decision for
all three codes rather than only the count.

### 5. The fixture's code is a fixed string, deliberately

`fixtures/accounts.mts` carries a two-factor account whose code is `424242`. Computing a real
TOTP would make every acceptance assertion depend on the clock, and what the suite is testing
is this application's handling of the exchange rather than an implementation of RFC 6238. The
contract half is `second-factor.test.ts`, written from authservice's source.

The recovery code **is** single-use, and the fixture makes that real rather than describing it:
it keeps a set of spent codes for the life of the process, which is sound because
`playwright.config.ts` already refuses to reuse a running fixture.

## Consequences

**An account with an authenticator app can sign in, and one with only recovery codes left can
too.** The destination survives the detour, so a reader bounced off `/instrument` lands on
`/instrument`.

**Nothing downstream can tell which factor produced a session.** The tokens go through
`establishSession` by exactly the path ADR-0018 describes, and the acceptance suite asserts
that a two-factor session opens a gated page like any other.

**`second-factor` did not stop being reachable, and the issue's "done when" allowed for that.**
It now means the one case where the second step genuinely could not be completed — a
deployment whose identity service offers a second factor while this app cannot reach the
endpoint.

**Measured, in both directions, before being believed.** Four mutations, each watched failing:

| mutation | what caught it |
|---|---|
| the challenge put in a hidden field | the negative assertion — the one that says which design was chosen |
| the challenge cleared on a wrong code | *a wrong code keeps the challenge and offers the form again* |
| the fixture stops challenging at all | five of fifteen tests |
| recovery codes made reusable | *a recovery code works, and works once* |

**What is still not proved.** That authservice answers this way — the fixture and the code
that reads it agree by construction, which is ADR-0028's standing caveat and the reason the
contract half lives in the unit tests. Nothing here is deployed; #21 is blocked on a human
setting Fly.io secrets.

**And one thing this cannot do at all, which the page says out loud.** ab-ovo cannot reset a
second factor or issue new recovery codes: that belongs to the identity service, not to the
reader and not to this application. A reader who has lost both still has the whole book and
the whole lab, because nothing except cross-machine progress needs an account.
