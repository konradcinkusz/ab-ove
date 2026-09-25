# authservice account-recovery probe

**Date:** 2026-09-25 · **Run by:** Claude Code, session `01LdLunh3ULwmSSAssmoRtGM`
**Issue:** [#156](https://github.com/konradcinkusz/ab-ove/issues/156) — order 560, a probe
**Reads into:** [#170](https://github.com/konradcinkusz/ab-ove/issues/170) (700, a way back
from a forgotten password or a lost verification email) and
[#141](https://github.com/konradcinkusz/ab-ove/issues/141) (410, the Terms and Privacy links)
**Subject:** `ghcr.io/konradcinkusz/authservice:v0.3.1`, the pin in
`src/AbOvo.AppHost/AppHost.cs` and `flyio/authservice.fly.toml`
**Result:** **the API exists, and 700 can be written against it — once two settings the
estate does not set today are set.** Password reset (request and confirm), resending the
verification email and confirming an address are all anonymous JSON endpoints, and none of
them issues a token. The emails link to **this web app's** origin, not to pages of
authservice's, and the base of those links is a setting nobody sets yet. authservice
publishes **no** Terms of Use or Privacy Policy text, only the versions.

> **Nothing in the application changed for this probe.** It is a record of what the pinned
> identity service does, so that 700 and 410 are written against a known contract rather
> than a remembered one.

---

## 1. What was checked, and how

1. **The source, at the pinned tag.** `https://github.com/konradcinkusz/authservice` is
   public; it was cloned into a scratch directory and checked out at `v0.3.1`
   (`e32bd5329806de3de7002210806ebf9a7275a474`). Read: `AuthController` (`ForgotPassword`,
   `ResetPassword`, `VerifyEmail`, `ResendVerification`, `SendVerificationEmailAsync`,
   `GetConsentVersions`, `Login`), `DTOs/AuthDtos.cs`, `Program.cs` (Identity options, the
   email-service choice, the rate limiter), `Services/NoOpEmailService.cs`,
   `Services/SendGridEmailService.cs`, `Services/ConsentSettings.cs`, `appsettings.json`.
2. **The same tag, built and run.** No container runtime was available, so the published
   image was not pulled; the tag was built with `dotnet publish` (SDK 10.0.112) and run
   against a local Postgres with the environment `AppHost.cs` gives the container —
   `ASPNETCORE_ENVIRONMENT=Development`, RS256 with a throwaway key, issuer and audience
   `AbOvo`, `Database__SchemaMode=EnsureCreated` — plus one override,
   `Auth__RequireConfirmedEmail=true`, because without a mail provider the verification
   branch is switched off and could not be reached otherwise (§4). Every response quoted
   below was captured from that run with `curl`. The emails were read from the log, where
   the no-op email service writes them in Development.
3. **The later tags**, `v0.3.2` to `v0.3.4`, by `git diff` against `v0.3.1`: the four
   recovery endpoints and `GetConsentVersions` are unchanged; `Login`'s body moved into a
   shared `SignInFlow` class without changing what it answers.

## 2. The endpoints

Every path also answers under the unversioned alias `/api/auth/…`; the versioned path is the
one to use, as `web/app/src/lib/server/register.ts` already does. All four are
`[EnableRateLimiting("auth")]` and none requires a token.

| Endpoint | Body | Answers (captured) |
| --- | --- | --- |
| `POST /api/v1/auth/forgot-password` | `{"email"}` | **200** `{"message":"If an account with that email exists, a password reset link has been sent.","isOAuthOnly":false}` — the same for a known and an unknown address |
| `POST /api/v1/auth/reset-password` | `{"email","token","newPassword"}` | **200** `{"message":"Password has been reset successfully. You can now sign in with your new password."}` |
| `POST /api/v1/auth/resend-verification` | `{"email"}` | **200** `{"message":"If that address needs verification, a new link has been sent."}` — the same for a known, an unknown and an already-verified address |
| `POST /api/v1/auth/verify-email` | `{"email","token"}` | **200** `{"message":"Email address verified. You can now sign in."}`, or `{"message":"Email address is already verified."}` on a second use |

**The refusals, captured.** Three body shapes, as ADR-0049 found for `register`:

- **Annotation failures** answer 400 as `ValidationProblemDetails`, before the action runs —
  `{"title":"One or more validation errors occurred.","status":400,"errors":{"Email":["Invalid email format"]}}`,
  `{"errors":{"Email":["Email is required"]}}`, and for `reset-password`
  `{"errors":{"NewPassword":["Password must be between 8 and 100 characters"]}}`. So
  `ForgotPassword`'s own "answer 200 when the model is invalid" branch is never reached: a
  malformed address is told so.
- **`reset-password`'s own refusals** are the list shape: `{"errors":["Invalid or expired reset token."]}`
  for an unknown address, `{"errors":["Invalid token."]}` for a wrong, reused or expired
  token, and Identity's policy sentences — `"Passwords must have at least one digit ('0'-'9')."`
  and the rest, the ones `register` already translates — for a weak password. A weak
  password does not spend the token: the same token succeeded afterwards.
- **`verify-email`'s refusal** is the SINGULAR field, `{"error":"Invalid or expired verification token."}`,
  for a wrong token and for an unknown address alike.

**A reset ends every session.** After `reset-password` succeeded, the old password answered
401, the new one 200, and a refresh token issued before the reset answered 401
`{"error":"Invalid or expired refresh token"}` (`RevokeRefreshTokensAsync` with reason
`PasswordReset`). A second use of the same reset token answered `Invalid token.`, because the
reset changes the account's security stamp. A verification link sent before a resend still
worked after it: resending does not revoke the earlier link.

**Read, not exercised:** an account with no password hash (made through Google or GitHub) is
answered `isOAuthOnly: true` with a sentence naming the provider, which does disclose that the
address has an account. This estate configures no OAuth provider, so no such account exists
here. Neither `forgot-password` nor `reset-password` checks `IsDeleted`, so a soft-deleted
account can still have its password reset until authservice's own clean-up purges it; `Login`
refuses it either way.

## 3. What the emails link to

Both links are built from **`FrontendBaseUrl`** and a fixed path, in `AuthController`:

```text
{FrontendBaseUrl}/reset-password?token=<url-encoded>&email=<url-encoded>
{FrontendBaseUrl}/verify-email?token=<url-encoded>&email=<url-encoded>
```

- **They point at this web app, never at authservice.** `v0.3.1` has no pages of its own for
  either step — it is an API. The two paths are fixed by upstream; only the base is
  configurable. So 700 has to put `/reset-password` and `/verify-email` in `web/app`,
  public, and carved out of the login redirect so the query string survives
  (`middleware.ts`'s `CARVE_OUT_PREFIXES`, FRONTEND-BFF.md §4).
- **Unset, the links are relative, and that was measured.** The code reads
  `_configuration["FrontendBaseUrl"] ?? "http://localhost:3000"`, and `appsettings.json`
  sets the key to `""`. An empty string is not null, so the fallback never applies: the run
  logged `Reset URL: /reset-password?token=…` and `Verification URL: /verify-email?token=…`,
  which no mail client can open. With `FrontendBaseUrl=https://ab-ovo-web.example.test` set,
  the same run logged `https://ab-ovo-web.example.test/reset-password?…`. Neither
  `AppHost.cs` nor `flyio/authservice.fly.toml` sets it today.
- **The token is in the query string of a GET.** A page that receives it should send no
  `Referer` and load nothing from another origin (the second is already AGENTS.md #8), and
  should spend the token only on a POST the reader makes: a mail scanner that prefetches the
  link must not verify an address or burn a reset.
- **The email address is in that query string as well, and that conflicts with 700's
  Done-when**, "Nothing about the account appears in the URL" (#170). The format is fixed by
  upstream, so the address bar holds the reader's address when the link arrives, whatever
  700 builds. 700 has to decide whether its rule covers that arriving URL or only the URLs
  this app builds. Either way, the receiving page can take both values out of the address
  bar before the reader does anything, for instance by keeping them server-side and
  redirecting to the bare path. This probe did not try that.

## 4. Whether any email is sent at all

**Not in any configuration this repository has.** `Program.cs` chooses
`SendGridEmailService` only when `SendGrid:ApiKey` is set, and the no-op service otherwise.
`Auth:RequireConfirmedEmail` defaults to "can this deployment send email", so with no key:

- registration answers 200 with tokens and the address counts as confirmed (what the
  acceptance fixture and `register.ts` already model);
- `forgot-password` still answers "a password reset link has been sent", and nothing is sent.

The no-op service logs the link and the token in `Development` and a placeholder elsewhere.
**No endpoint says whether this instance can send email** before an account exists
(`EmailCapabilities` is read only inside the controllers, and registration's 200-or-202 shows it
only after the fact), so the web app cannot ask; a "forgot password" form offered on a
deployment without a provider would promise an email that never comes. 700 needs a mail
provider configured first — `SendGrid__ApiKey` is a secret and belongs in `flyio/SECRETS.md`
and `secrets.env.example` when it arrives — and a way for the web app to know it is there.

## 5. The `unverified` sign-in problem is unreachable

With `RequireConfirmedEmail` on, signing in to an unconfirmed account with the RIGHT
password answered **401 `{"error":"Invalid email or password"}`**, not the 403
`{"emailVerificationRequired":true}` that `Login`'s source shows. ASP.NET Identity's
`SignIn.RequireConfirmedEmail` is driven by the same setting, and `CheckPasswordSignInAsync`
refuses the account as `NotAllowed` before the controller's own check runs. Upstream says so
in `v0.3.4`'s `SignInFlow`: "with both driven by one setting, Identity refuses the account
first, as a failure above."

So `sign-in.ts`'s `email-unverified` outcome and `sign-in-problem.ts`'s `unverified` entry are
correct about a status authservice never sends. A reader whose address is unconfirmed is told
the password is wrong. The way back for that reader cannot hang off a distinct sign-in
answer; it has to be offered where any sign-in failure is shown — which `resend-verification`
allows, because it answers identically for every address.

## 6. Rate limits

The `auth` policy (`Program.cs`): a fixed window of **20 requests a minute per client
address**, oldest-first queue of 5; beyond that, 429
`{"error":"Too many requests. Please try again later.","retryAfter":60}` — captured. The
partition key is the policy and the resolved client address, not the endpoint, so login,
register, refresh and all four endpoints above share one budget per address. The address is
the one `Network:ClientIpHeader` names, which is why `client-ip.ts` forwards the reader's own
(ADR-0027); without it every reader behind the web server shares that budget. A global limiter
of 500 a minute per user or address sits behind it.

Tokens are ASP.NET Identity's data-protection tokens with no lifespan configured, so the
framework default applies, one day for both kinds (read, not measured). `v0.3.1` configures no
data-protection key ring, so whether a token survives a redeploy depends on where the
container's default key directory lives; that was not measured.

## 7. Whether ADR-0018's server-side pattern applies

**Yes, and more simply than for sign-in.**
[ADR-0018](../adr/0018-password-sign-in-happens-server-side.md) puts the password form on this
origin and the call to authservice in a server route. All four endpoints fit that shape: a
plain form posts to a route under `/api/auth/`, the route calls authservice through the
candidate ladder with the reader's address forwarded, and the page is told an outcome from a
closed set, never upstream's sentence. None of them returns a token, so no route here sets a
cookie; `reset-password` does not sign the reader in, and the next step is the sign-in form.
AGENTS.md #8 holds because the only thing the browser ever reaches is the link in the email,
and that link is this origin's.

## 8. The Terms of Use and the Privacy Policy (for 410)

**authservice publishes the versions and nothing else.**
`GET /api/v1/auth/consents/versions` is anonymous and answered, captured:
`{"terms":"2026-01-01","privacy":"2026-01-01","cookies":"2026-01-01"}` — the defaults in
`ConsentSettings` and `appsettings.json`, configured as `ConsentVersions__Terms`,
`ConsentVersions__Privacy` and `ConsentVersions__Cookies`. There is no document text, no URL
field, no static-file middleware and no route that serves one, at `v0.3.1` or at `v0.3.4`.
Upstream's README describes the setting as "Legal document versions users must accept", and
its tutorial says only that a registration must match them. The documents are therefore the
deploying product's to publish, and a version is only an identifier for text that lives
somewhere else.

## 9. What was not verified

- **The published image.** The tag was built from source; the image at the pin was not
  pulled. ADR-0049's measurement was made the same way, for the same reason.
- **Real email.** No SendGrid key was used; the email text is from `SendGridEmailService`'s
  source, and the links are the ones the no-op service logged.
- **Token expiry and survival across a redeploy** (§6), and anything about a Fly deployment:
  nothing is deployed.
- **The OAuth-only and soft-deleted branches** (§2), which were read, not exercised.

## 10. Reproducing it

```bash
git clone https://github.com/konradcinkusz/authservice.git && cd authservice
git checkout v0.3.1
dotnet publish src/AuthService/AuthService.csproj -c Release -o ../authservice-v031
# Run ../authservice-v031/AuthService.dll with the environment in §1 (step 2), a throwaway
# RS256 key in Jwt__PrivateKeyPem and a connection string to an empty database, then POST the
# bodies in §2. In Development the log carries each email's link and token.
```
