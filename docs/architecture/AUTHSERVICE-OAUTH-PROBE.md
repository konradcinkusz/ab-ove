# authservice OAuth probe

**Date:** 2026-09-26 · **Run by:** Claude Code, session `01LdLunh3ULwmSSAssmoRtGM`
**Issue:** [#173](https://github.com/konradcinkusz/ab-ove/issues/173) — order 730, the probe it
names
**Reads into:** [#173](https://github.com/konradcinkusz/ab-ove/issues/173) and
[ADR-0066](../adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§3
**Subject:** `ghcr.io/konradcinkusz/authservice:v0.3.1`, the pin in
`src/AbOvo.AppHost/AppHost.cs` and `flyio/authservice.fly.toml`, and the tags after it up to
`v0.3.4`
**Result:** **No: the pinned `v0.3.1` has no authorization endpoint, no token endpoint, no
client registration and no authorization-server metadata, so it cannot be the authorization
server for any MCP host.** The upstream release ADR-0066 names as the way forward already
exists in part. `v0.3.2` added an OAuth 2.1 authorization server, which `v0.3.4`, the latest
tag, carries unchanged: an authorization code with PKCE (`S256` only), RFC 8414 metadata under
an https issuer that leaves the `AbOvo` tokens as they are, and exactly one RFC 8707 resource
per token as its audience, behind sign-in and consent pages. It serves only clients the
operator writes into configuration, each confidential and holding a secret. No host can
register itself at any tag, dynamically or with a client ID metadata document.

> **Nothing in the application changed for this probe.** It is a record of what the pinned
> identity service, and the tags after it, can do for a third-party MCP host, so that #173 is
> decided against a known contract rather than a hoped-for one.

---

## 1. What was checked, and how

1. **The source, at the pinned tag.** `https://github.com/konradcinkusz/authservice` is public;
   it was cloned into a scratch directory and read at `v0.3.1`
   (`e32bd5329806de3de7002210806ebf9a7275a474`): `Program.cs` (the JWT options, the discovery
   and JWKS endpoints), `Services/TokenService.cs`, `Controllers/ExternalAuthController.cs`, and
   upstream's own scope decision, `docs/decisions/0003-scope.md`. Below, a path such as
   `Program.cs` or `Services/…` is upstream's, under its `src/AuthService/`, and so are
   `docs/decisions/…`, `docs/analysis/…` and `docs/DEPLOYMENT.md`; this repository's own files
   are named from its root, and its documents are linked. Every line number is at the tag its
   section names.
2. **The later tags**, by `git diff` against `v0.3.1`: `v0.3.2` (`5200201a8d50`, tagged
   2026-09-23), `v0.3.3` (`94db1360cf5c`) and `v0.3.4`
   (`dfcce91fcf086cd740477ed706687ce5863cd88e`), the latest tag. **`v0.3.2` is where the
   authorization server arrives**: `Controllers/AuthorizationController.cs`,
   `Controllers/AuthorizationInteractionController.cs`,
   `Extensions/AuthorizationServerExtensions.cs`, `Services/AuthorizationServerOptions.cs`,
   `Services/AuthorizationClientSync.cs`, the pages under `Pages/Connect/`, upstream's ADR 0005
   (`docs/decisions/0005-mcp-authorization-server.md`), its analysis
   (`docs/analysis/AUTH-MCP-01.md`) and the runbook section *Registering an MCP client* in
   `docs/DEPLOYMENT.md`. From `v0.3.2` to `v0.3.4` the authorization server's code gains only
   OpenAPI response annotations, and the rest of the service only dependency updates and the
   change §3 ends with. `main` after `v0.3.4` (`b8f7962`) changes documentation only. The tags
   `mcp-v0.1.0` and `mcp-v0.1.1` sit on the commits of `v0.3.3` and `v0.3.4` and version
   upstream's own `integrate` MCP server, which is not the authorization server.
3. **Both ends, built and run.** No container runtime was available, so no image was pulled;
   GHCR's tag list for the package, queried anonymously, names `v0.3.2`, `v0.3.3` and `v0.3.4`
   as well as the pin. Each tag was built with `dotnet publish` (SDK 10.0.112) from the clone,
   and each build carries its tag's commit in its informational version. Each ran against a
   local Postgres database of its own:
   - `v0.3.1` with the environment `AppHost.cs` gives the container —
     `ASPNETCORE_ENVIRONMENT=Development`, RS256 with a throwaway key, issuer and audience
     `AbOvo`, `Database__SchemaMode=EnsureCreated`, plain HTTP — and once more with
     `Jwt__Issuer` and `Jwt__PublicBaseUrl` set to an https URL, to see what its discovery
     document can say;
   - `v0.3.4` with the same environment plus what its authorization server needs to start: one
     client (`probe-host`, a throwaway secret, the redirect URI
     `https://host.example.test/callback`, the scopes `book:read` and `offline_access`, the
     resource `https://mcp.ab-ovo.example.test/mcp`), a throwaway
     `AuthorizationServer__EncryptionKey`, `Jwt__PublicBaseUrl=https://localhost:5303`, and
     Kestrel serving TLS with a throwaway self-signed certificate. It ran in Hosted mode, in
     External mode, with no client, over plain http only, and against the database `v0.3.1`
     had created.

   Every response quoted below was captured from those runs, with `curl` or a short Python
   client. Codes, tokens and handles are shown as placeholders, and a token by its claims.

## 2. The answers

| Question (ADR-0066 §3) | `v0.3.1`, the pin | `v0.3.4`, the latest tag |
| --- | --- | --- |
| An authorization code with PKCE, to a client other than this web app | No authorization-code grant at all | Yes, to a client the operator pre-registered; PKCE required, `S256` only |
| A host registers itself (RFC 7591, or a client ID metadata document) | No registration of any kind | No: clients come from configuration only, confidential, each with a secret |
| Authorization-server metadata with an issuer URL | No: RFC 8414 answers 404, and the OIDC document is key discovery with `issuer` `AbOvo` | Yes: RFC 8414 with an https `issuer`; the OIDC document is unchanged |
| Redirect-URI validation | Nothing to validate | Exact, port and trailing slash included, against the client's configured list |
| A token for an audience other than `AbOvo` (RFC 8707) | No: every access token carries `aud` `AbOvo` | Yes: exactly one allowed `resource` becomes `aud`; `AbOvo` is refused as a resource |
| An interactive authorize page | No: JSON endpoints, and the Google and GitHub redirect | Yes: authservice's own sign-in and consent pages (Hosted), or the consumer's (External) |

### 2.1 An authorization code with PKCE, to a client other than this web app

**At `v0.3.1` there is no authorization-code grant, for this web app or for anyone.** Every
path an OAuth client would try answers **404**, captured: `GET /connect/authorize` with
`response_type=code`, a `client_id`, a `redirect_uri`, an `S256` challenge and a `resource`;
`GET /authorize` and `GET /oauth/authorize`; `POST /connect/token`, `POST /token` and
`POST /oauth/token`. The OpenAPI document Development publishes lists no authorization, token
or client-registration path: signing in is `POST /api/v1/auth/login`, a JSON body answered with
a token pair ([ADR-0018](../adr/0018-password-sign-in-happens-server-side.md)). The source says
why, at `Program.cs:472–475`: the discovery document "is deliberately not a claim to be an OIDC
provider — there is no authorization endpoint and no token endpoint here (ADR 0003)". Upstream's
`docs/decisions/0003-scope.md:34–38` excludes "authorization code flow, an authorization
endpoint, a standards-shaped token endpoint, consent screens, client registration,
introspection".

**The one code `v0.3.1` issues is not an OAuth code.** After a Google or GitHub sign-in,
`ExternalAuthController.cs:268–274` sends the browser to `…/oauth/callback?code=…` with a
single-use exchange code, and `:281–318` trades it for an ordinary `AbOvo` token pair. It names
no client, carries no PKCE and no scope, and goes only to `/oauth/callback` on an origin the
operator lists (`:344–366`). Neither `AppHost.cs` nor `flyio/authservice.fly.toml` configures a
provider: `GET /api/v1/external-auth/providers` answered `{"providers":[]}`, and a host's return
URL answered **400** `{"error":"returnUrl is not from an allowed origin."}` (captured).

**At `v0.3.4` the grant exists, for a pre-registered client.** Captured in Hosted mode, from a
browser with no session:

1. `GET /connect/authorize?response_type=code&client_id=probe-host&redirect_uri=…&scope=book:read offline_access&state=s1&code_challenge=…&code_challenge_method=S256&resource=https://mcp.ab-ovo.example.test/mcp`
   answered **302** to `/connect/signin?returnUrl=/connect/authorize?…`.
2. The sign-in page answered **200** `text/html`, titled `Sign in · Auth Service`, with the
   fields `Email` and `Password`. Posting it answered **302** back to the authorization request
   and set the session cookie `__Secure-authservice-as`.
3. The authorization request, signed in, answered **302** to `/connect/consent?…`. The consent
   page reads "Probe host wants access to your account", lists "Read the book" and "Stay
   connected when you are not using it", and names the host the browser will return to,
   `host.example.test`.
4. Allowing it answered **302** to
   `https://host.example.test/callback?code=<code>&state=s1&iss=https://localhost:5303`.
5. `POST /connect/token` with the code, the redirect URI, the `code_verifier`, the `client_id`
   and the `client_secret` answered **200**
   `{"access_token":"<access_token>","token_type":"Bearer","expires_in":899,"scope":"book:read offline_access","refresh_token":"<refresh_token>"}`.

A second authorization request from the same browser, with the session live and the consent
remembered, went straight to step 4. The refusals, captured:

| Request | Answer |
| --- | --- |
| No `code_challenge` | **400** `invalid_request`, "The mandatory 'code_challenge' parameter is missing." |
| `code_challenge_method=plain` | **400** `invalid_request`, "The specified 'code_challenge_method' is not supported." |
| `response_type=token` | **400** `unsupported_response_type` |
| `scope=openid`, or a scope the client is not allowed | **400** `invalid_scope` |
| A token request with the wrong `code_verifier` | **400** `invalid_grant`, "The specified 'code_verifier' is invalid." |
| The same code a second time | **400** `invalid_grant`, "The specified authorization code has already been redeemed.", and the refresh token its first redemption issued stopped working |
| `grant_type` `client_credentials`, `password`, token exchange (RFC 8693) or device code | **400** `unsupported_grant_type` |

Refresh tokens rotate and are single-use: a refresh answered **200** with a new refresh token;
the old one, presented again, answered `invalid_grant` "has already been redeemed"; and the new
one then answered "is no longer valid", because a replay ends the chain. In the source:
`AuthorizationServerExtensions.cs:160` allows the authorization-code and refresh-token grants
and no other, `:162–167` requires PKCE and removes every method but `S256`, `:207` sets the
refresh-token reuse leeway to zero, and `AuthorizationClientSync.cs:112–115` gives every client
the PKCE requirement.

### 2.2 Whether a host can register itself

**No, at any tag.** At `v0.3.1` `POST /connect/register` and `POST /register` answer **404**,
and nothing has clients to register.

At `v0.3.4` the authorization server's clients are `AuthorizationServer:Clients` in
configuration — "Pre-registered confidential clients" (`AuthorizationServerOptions.cs:22–23`).
`AuthorizationClientSync` copies them into the client store at startup and deletes any client
no longer configured, with its authorizations and tokens (`AuthorizationClientSync.cs:49–91`).
A restart with no client configured logged "Removed MCP client probe-host, which is no longer
configured, with its authorizations and tokens". So adding a host is the operator's
configuration change and a restart, never the host's request. Captured:

- `POST /connect/register` and `POST /register` answer **404**, and so do `/connect/introspect`,
  `/connect/revoke`, `/connect/userinfo` and `/connect/device`.
- The metadata in §2.3 advertises no `registration_endpoint`, no
  `client_id_metadata_document_supported` and no `none` authentication method, on purpose: the
  comment on the method that builds it says it "advertises nothing this server does not do",
  names each of them, and says the last "would invite Claude to try CIMD"
  (`AuthorizationServerExtensions.cs:290–294`).
- A `client_id` that is a metadata document's URL,
  `https://host.example.test/oauth/client.json`, answered **400** `invalid_request`, "The
  specified 'client_id' is invalid.": nothing was fetched.
- A token request without the client secret answered **401** `invalid_client`, "Client
  authentication is required for this application." Every client is confidential
  (`AuthorizationClientSync.cs:100`), startup refuses a secret shorter than 32 bytes
  (`AuthorizationServerOptions.cs:143–150`), and `private_key_jwt` is switched off
  (`AuthorizationServerExtensions.cs:172–173`). A host known only by a metadata document shares
  no secret with this server, so it cannot finish the exchange.

Upstream chose this for its first version. ADR 0005's D3 is "Static pre-registered clients, no
dynamic registration" (`docs/decisions/0005-mcp-authorization-server.md:35`), and its amendment
of ADR 0003 keeps "no dynamic client registration" (`:48–54`). Its analysis lists client
metadata documents, public clients and Claude Code ("loopback redirects and its own CIMD") as
out of scope (`docs/analysis/AUTH-MCP-01.md:329`, `:338–339`), and reads its brief's "allow
adding DCR later" as a second registration mechanism later, "CIMD first" (`:67`).

**Which hosts that leaves was not measured.** No host was connected. Upstream's runbook names
one: Claude's custom connectors take a client id and secret under *Advanced settings*, and "left
blank, Claude acts as a public client, and v1 accepts confidential clients only"
(`docs/DEPLOYMENT.md:273–277`).

### 2.3 Authorization-server metadata, and an issuer URL

**`v0.3.1` publishes none.** `GET /.well-known/oauth-authorization-server` answers **404**. The
OIDC document, with the environment `AppHost.cs` gives the container, answered (captured):

```json
{"issuer":"AbOvo","jwks_uri":"/.well-known/jwks.json","id_token_signing_alg_values_supported":["RS256"],"response_types_supported":[],"subject_types_supported":["public"]}
```

Its `issuer` is `Jwt:Issuer` (`Program.cs:490`), "the value tokens actually carry in `iss` — not
this service's URL" (`:478–480`), and `response_types_supported` is empty on purpose, "so the
distinction is machine-readable: there are no flows here to discover" (upstream's
`docs/decisions/0003-scope.md:44–46`). With `Jwt__Issuer` and `Jwt__PublicBaseUrl` both set to
`https://auth.ab-ovo.example.test`, the same document said
`"issuer":"https://auth.ab-ovo.example.test"`, still with no endpoint to discover, and RFC 8414
still answered 404. A URL issuer is therefore available at `v0.3.1` only by replacing, on every
token, the bare `iss` that [ADR-0004](../adr/0004-identity-authservice-and-anonymous-reader.md)
§4 records — the change ADR-0066 §3 says "changes every validator" — and it buys nothing a host
can use.

**`v0.3.4` publishes RFC 8414 metadata**, captured:

```json
{"issuer":"https://localhost:5303","authorization_endpoint":"https://localhost:5303/connect/authorize","token_endpoint":"https://localhost:5303/connect/token","jwks_uri":"https://localhost:5303/.well-known/jwks.json","scopes_supported":["book:read","offline_access"],"response_types_supported":["code"],"grant_types_supported":["authorization_code","refresh_token"],"code_challenge_methods_supported":["S256"],"token_endpoint_auth_methods_supported":["client_secret_basic","client_secret_post"],"authorization_response_iss_parameter_supported":true}
```

- **The issuer is `Jwt:PublicBaseUrl`, and it must be an https origin.** With a client
  configured, startup refused both `http://localhost:8081`, an http origin like the one
  `AppHost.cs` gives the container, and an unset value, captured: "Jwt:PublicBaseUrl must be set
  to this service's public https origin … when AuthorizationServer:Clients is configured. It is
  the issuer of MCP tokens and is never derived from the request."
  (`AuthorizationServerOptions.cs:93–99`).
- **Nothing that validates `AbOvo` tokens changes.** On the same instance the OIDC document
  still answered `"issuer":"AbOvo"` with `"response_types_supported":[]`, and an ordinary
  sign-in still issued `typ` `JWT`, `iss` `AbOvo`, `aud` `AbOvo`. The token issued to the MCP
  client carried `typ` `at+jwt`, `iss` `https://localhost:5303`, `aud` the resource, `scope`,
  `client_id`, `iat` and `jti`, and the claims ordinary tokens carry; its `sub` equalled the
  ordinary token's (all captured). Upstream calls this "Two issuers, one key, one JWKS"
  (`docs/decisions/0005-mcp-authorization-server.md:60`). So ADR-0004 §4's bare `iss` stays as
  it is, and ADR-0066 §3's "changing that changes every validator" does not arise: only the
  hosted MCP server validates the new issuer.
- **The authorization response names its issuer** (RFC 9207): `iss=https://localhost:5303` in
  step 4 of §2.1.

### 2.4 Redirect-URI validation

At `v0.3.1` there is no authorization endpoint to validate one. The external-provider return
URL is held to `/oauth/callback` on the listed origins (`ExternalAuthController.cs:344–366`).

At `v0.3.4` matching is exact. Each of these answered **400** `invalid_request`, "The specified
'redirect_uri' is not valid for this client application.", rendered by authservice rather than
sent to the unvalidated address (captured): an unregistered URI; the registered URI with `?x=1`
appended; the registered URI with a trailing slash; and, with `http://127.0.0.1/callback`
registered, `http://127.0.0.1:49152/callback`, a loopback port chosen at run time. An unknown
`client_id` answered **400**, "The specified 'client_id' is invalid.". A configured URI must be
https, or http on a loopback address, with no fragment (`AuthorizationServerOptions.cs:152–162`,
`:253–264`).

### 2.5 Resource indicators, and an audience other than `AbOvo`

**At `v0.3.1` every access token is for `AbOvo`.** `TokenService.cs:251–257` writes `Jwt:Issuer`
and `Jwt:Audience` into each one, and the decoded token carried `aud` `AbOvo` (captured). The
only other audience is `AbOvo:2fa`, on two-factor challenge tokens (`:124–128`), which are not
access tokens (ADR-0004 §5).

**At `v0.3.4` an MCP token is for exactly one resource.** Captured:

| Authorization request | Answer |
| --- | --- |
| No `resource` | **302** back to the client with `error=invalid_target`, "Exactly one resource parameter is required." |
| Two `resource` parameters | **400** `invalid_request`, "This client application is not allowed to use the specified resource(s)." |
| A resource the client is not allowed | **400**, the same |
| `resource=AbOvo` | **400** `invalid_request`, "The 'resource' parameter must be a valid absolute URI." |

Startup refused `AllowedResources` of `AbOvo` as well: "must be an absolute https URI with no
fragment" (captured). The token's `aud` is the granted resource,
`https://mcp.ab-ovo.example.test/mcp` (captured), and a token request that names another
resource is refused with `invalid_target` (`AuthorizationController.cs:101–104`, read, not
exercised). authservice's own API refused the MCP token: `GET /api/v1/auth/me` with it answered
**401** `invalid_token`, "The audience '(null)' is invalid" (captured). So no token for the
audience `AbOvo` comes out of the authorization server, and `AbOvo.Api`, which validates `iss`
and `aud` `AbOvo` exactly (`src/AbOvo.ServiceDefaults/AuthenticationExtensions.cs`), would
refuse an MCP token on both counts. That last point was read, not run.

### 2.6 An interactive authorize page

**`v0.3.1` renders no HTML.** The tag has no `Pages/`, no views and no `wwwroot`. Signing in is
`POST /api/v1/auth/login` and `POST /api/v1/auth/2fa/login`, JSON both, and the only redirect
flow is the Google and GitHub one in §2.1.

**`v0.3.4` has pages, in whichever mode `AuthorizationServer__Interaction__Mode` picks per
deployment, Hosted or External:**

- **Hosted, the default.** authservice serves `/connect/signin`, `/connect/2fa` and
  `/connect/consent` itself. Captured on the sign-in and consent pages:
  `Content-Security-Policy: default-src 'none'; style-src 'nonce-…'; frame-ancestors 'none'; base-uri 'none'`
  and `X-Frame-Options: DENY`, a policy under which no script runs. The pages are English only
  (`Pages/Shared/_ConnectLayout.cshtml:10` sets `<html lang="en">`, and nothing localises them),
  and they name the product through `App__Name`, which unset reads "Auth Service" (the captured
  title). Registration and password reset are not offered there; the sign-in page links to
  `FrontendBaseUrl` instead (`Pages/Connect/SignIn.cshtml:41–44`), when it is set, which
  neither `AppHost.cs` nor `flyio/authservice.fly.toml` does
  ([the account-recovery probe](AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md), §3).
- **External.** The consumer's own pages sign the reader in and ask for consent. Captured:
  `GET /connect/authorize…` answered **302** to the configured
  `https://web.ab-ovo.example.test/connect?interaction=<interaction>` and set
  `__Secure-authservice-as-binding`. `GET /api/v1/oauth/interactions/<interaction>` with the
  reader's ordinary bearer, the `iss` `AbOvo` token `POST /api/v1/auth/login` returns, answered
  **200**
  `{"clientId":"probe-host","clientName":"Probe host","redirectHost":"host.example.test","scopes":[{"name":"book:read","description":"Read the book"},{"name":"offline_access","description":"Stay connected when you are not using it"}],"resource":"https://mcp.ab-ovo.example.test/mcp","expiresAt":"…"}`,
  and with no bearer **401**. `POST …/accept` answered **200** with a `redirectTo` on
  authservice's `/connect/authorize` carrying `interaction_ticket=<ticket>`. The browser that
  started the request followed it and was sent to
  `https://host.example.test/callback?code=<code>&state=s1&iss=https://localhost:5303`; another
  browser following an approved `redirectTo` was sent to the client with
  `error=access_denied`, "The request was started in a different browser."

## 3. What `v0.3.4` asks of a deployment

This is what moving the pin would take, measured where it says so.

- **An https issuer.** `flyio/authservice.fly.toml` already sets `Jwt__PublicBaseUrl` to an https
  origin. `AppHost.cs` sets none and gives the container a plain-HTTP port, and with a client
  configured startup refuses that (§2.3). Local work on 730 needs authservice reached over TLS,
  which the AppHost does not provide today.
- **HTTPS at the process, or a proxy it trusts.** Over plain http, with no https listener,
  `GET /connect/authorize…` and `POST /connect/token` both answered **400** `invalid_request`,
  "This server only accepts HTTPS requests." (captured). Behind Fly's proxy the process sees
  http unless it trusts `X-Forwarded-Proto` from it; upstream's runbook asks for
  `Network__KnownProxies`, `Network__KnownNetworks` or `Network__TrustAllProxies=true`
  (`docs/DEPLOYMENT.md:161–164`), and `flyio/authservice.fly.toml` sets only
  `Network__ClientIpHeader`. Not measured on Fly, because nothing is deployed.
- **New secrets.** `AuthorizationServer__EncryptionKey`, and a `…__ClientSecret` for every
  client. They belong in `flyio/SECRETS.md` and `secrets.env.example` when they arrive
  (AGENTS.md rule 6).
- **A client per host, in configuration,** and a restart for every change (§2.2).
- **The schema.** On an empty database, `EnsureCreated` at `v0.3.4` created the authorization
  server's tables and registered the client (measured). On the database `v0.3.1` had created it
  did not: it logged "Database already exists — EnsureCreated made no changes", the client sync
  failed with `relation "OpenIddictApplications" does not exist`, and `GET /connect/authorize`
  answered **500**, while `POST /api/v1/auth/login` went on answering as before (measured).
  Upstream's way out is its `adopt-migrations` script and `Database__SchemaMode=Migrate`
  (`docs/DEPLOYMENT.md:156–160`). That bites a local AppHost volume created at `v0.3.1`; nothing
  is deployed, so no deployed database exists to migrate.
- **A choice of who renders sign-in and consent.** Hosted has the reader type their password
  into authservice's English page, on authservice's origin, where
  [ADR-0018](../adr/0018-password-sign-in-happens-server-side.md) keeps this app's own password
  form on this origin and calls authservice server-side. External keeps sign-in and consent on
  this origin, in the reader's edition, with the BFF calling the interaction API server-side
  with the bearer it already holds (§2.6). Either way the reader's browser makes top-level
  navigations to authservice's `/connect/authorize`, which need no CORS: the kind of traffic
  `web/app/src/lib/runtime-config.ts` already sends to `authBaseUrl` ("signing in and the OAuth
  callback are browser NAVIGATIONS to authservice's own pages"). Whether AGENTS.md rule 8 reads
  that as the browser talking to authservice is #173's to settle.
- **Nothing more, with no client.** `v0.3.4` with exactly the environment `AppHost.cs` gives the
  pin answered **404** at `/.well-known/oauth-authorization-server`, `/connect/authorize`,
  `/connect/token` and `/connect/signin`, and its banner read
  `AuthorizationServer=disabled (no client configured)` (captured). One thing does differ: under
  that environment `v0.3.1`'s discovery document gives `jwks_uri` as the bare path
  `/.well-known/jwks.json`, and `v0.3.4`'s gives an absolute URL built from the request
  (`http://127.0.0.1:5308/.well-known/jwks.json`, captured), because `Program.cs:119–124` at
  `v0.3.4` treats a blank `Jwt:PublicBaseUrl` as unset. That bare path was the gap
  [`docs/tutorials/01-first-run.md`](../tutorials/01-first-run.md) step 3 recorded against
  `v0.3.1`. `AppHost.cs` sets `Jwt__PublicBaseUrl` to the container's published address as of
  2026-09-26, so the pin publishes an absolute `jwks_uri` as well and that step now records
  the gap as closed. The `issuer` comes from `Jwt:Issuer` either way (§2.3), so nothing about
  the bare `iss` changes.

## 4. What it means for 730

- **The probe is done, and at the pin the answer is no. #173 stays blocked**, as ADR-0066 §3
  decides for that answer. No OAuth server is built here: P5 lets exactly one service hold a
  signing key, and `authservice` is adopted from its published image and never modified
  (ADR-0004).
- **The way forward ADR-0066 names, an upstream release adopted by moving the pin, exists in
  part.** `v0.3.2` to `v0.3.4` are that release for a host that accepts a pre-registered client.
  For such a host the authservice half of the blocker is no longer upstream: it is moving the
  pin to `v0.3.4`. That is a decision rather than an update (AGENTS.md, *What not to assume*),
  it amends ADR-0004's pin, and it needs an ADR of its own, with §3 among its consequences.
  This probe does not take it.
- **For a host that registers itself the blocker is still upstream**, and §5 lists what that
  release would have to add.
- **Only the second of #173's done-when items waits on authservice.** "A host with no local
  install connects and reads anonymously" is ADR-0066 §3's anonymous path, an id minted for the
  MCP session, and no token is involved; "Signed in through OAuth" is the one this probe bears
  on. Whether the anonymous half could ship before the pin moves is #173's to decide; the issue
  lists the probe as blocking the whole of it.
- **ADR-0066 §3's fourth question stays open, and is narrower.** What the hosted server presents
  to `AbOvo.Api` cannot be the host's token: the MCP specification forbids passing it on
  (ADR-0066 §3), and its audience is the MCP server (§2.5). Nor can it be a second token from
  authservice, because no grant exchanges one (§2.1) and `AbOvo` is refused as a resource.
  What authservice does hand the hosted server is the reader's account id in `sub`, the same id
  `AbOvo.Api` sees in that reader's ordinary tokens. Upstream's ADR 0004, which proposes
  delegated issuance, is still *Proposed* at `v0.3.4`.
- **A pre-registered client's secret would reach readers.** Upstream's comment on the per-user
  token limit speaks of "a user who holds the client's secret, as Claude's individual plans
  require" (`AuthorizationServerOptions.cs:293–297`). For a book any stranger may read, that
  secret would go to every reader who connects that way, which makes it a published value
  rather than a secret. Not verified against any host; #173 has to weigh it.
- **Unchanged:** #173 still waits for #171 (710) and for the first deploy (#70, #71), and
  nothing is deployed.

## 5. What an upstream release would have to add

For a host that registers itself, against `v0.3.4`:

1. **Client ID metadata documents.** Accept an https URL as `client_id`, fetch and validate the
   document it names, its redirect URIs above all, and advertise
   `client_id_metadata_document_supported` in the RFC 8414 document. Today such a `client_id` is
   "invalid" (§2.2).
2. **Public clients.** PKCE with no client secret, and `none` among
   `token_endpoint_auth_methods_supported`. A host known only by a metadata document shares no
   secret with this server, and today startup refuses a client without one.
3. **Loopback redirects for a host on the reader's own machine**, matched whatever the port
   (RFC 8252 §7.3). Today a loopback port chosen at run time is refused (§2.4), and upstream's
   analysis names Claude Code, which "uses loopback redirects and its own CIMD", as out of reach
   of pre-registration (`docs/analysis/AUTH-MCP-01.md:77`).
4. **Dynamic registration (RFC 7591), optionally,** for a host that supports it and not metadata
   documents. Upstream's analysis reads the revision of the MCP specification it worked from,
   2026-07-28, as keeping it only for backwards compatibility
   (`docs/analysis/AUTH-MCP-01.md:23`, `:67`).
5. **Only if #173 decides the hosted server must carry the reader's authority to `AbOvo.Api` as
   a token:** a grant that exchanges an MCP token for one with the API's audience (RFC 8693),
   the delegated issuance upstream's ADR 0004 proposes.

## 6. What was not verified

- **The published images.** Both tags were built from source; no image was pulled. GHCR lists
  `v0.3.2` to `v0.3.4`, and the probe did not check that those images were built from the tags'
  commits.
- **Any real MCP host.** None was connected. Which hosts accept a pre-registered client id and
  secret is upstream's claim for Claude and unknown for every other host.
- **Fly.** Forwarded headers behind Fly's proxy, whether a cold start stays inside the 10
  seconds upstream's runbook says Claude waits for the discovery and token endpoints
  (`docs/DEPLOYMENT.md:165–167`), and anything else about a deployment: nothing is deployed.
- **`v0.3.2` and `v0.3.3` were not run.** Their authorization server differs from `v0.3.4`'s by
  OpenAPI annotations at most (by diff).
- **Read, not exercised:** the second-factor page and the Google and GitHub buttons on the
  Hosted pages; a token request naming a resource its grant does not cover; a denied consent in
  either mode; `AbOvo.Api` refusing an MCP token; key rotation and a restart in the middle of a
  sign-in, which upstream lists among its residual risks.

## 7. Reproducing it

```bash
git clone https://github.com/konradcinkusz/authservice.git && cd authservice
git checkout v0.3.1 && dotnet publish src/AuthService/AuthService.csproj -c Release -o ../authservice-v031
git checkout v0.3.4 && dotnet publish src/AuthService/AuthService.csproj -c Release -o ../authservice-v034
# Run each DLL with the environment in §1 against an empty database. For v0.3.4 generate the
# client secret with `openssl rand -hex 32` and the encryption key with `openssl rand -base64 32`,
# serve TLS through Kestrel__Certificates__Default__Path and __KeyPath, and configure the client
# with AuthorizationServer__Clients__0__ClientId, __DisplayName, __ClientSecret,
# __RedirectUris__0, __AllowedScopes__0 and __1 (offline_access), __AllowedResources__0.
# Then request the metadata, walk /connect/authorize with an S256 challenge and a resource,
# and exchange the code at /connect/token, as §2 does.
```
