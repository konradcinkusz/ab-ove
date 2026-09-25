# ADR-0066: The MCP server is a TypeScript client of the API, installed before it is hosted

## Status

**Accepted.** Date: 2026-09-25. Decided for #155 (order 550 in
[`docs/ux/UI-UX.md`](../ux/UI-UX.md#the-order)) under the owner's delegation of that date.

It amends the reason and the exit condition of one row in the deviation register
([`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md)): "`PUT
/api/v1/progress/{track}/{unit}` can still name a step it did not earn". It answers the
questions that [`MCP-SERVER-SKETCH.md`](../architecture/MCP-SERVER-SKETCH.md) §4 and §7 left
open.

Constrained by these, and amends none of them:

- [ADR-0004](0004-identity-authservice-and-anonymous-reader.md) (identity);
- [ADR-0009](0009-the-instrument-measures-the-book.md) (the instrument);
- [ADR-0033](0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)
  (the licence);
- [ADR-0056](0056-the-reading-order-is-gated-on-every-surface-and-every-refusal-says-what-opens-it.md)
  (the gate);
- [ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md)
  (content from the API);
- [ADR-0061](0061-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md) (the
  anonymous cursor).

## Context

Measured for #155 on 2026-09-24, and read again on 2026-09-25.

**The server.**

- `web/mcp` is TypeScript. It runs over stdio from a checkout and needs Node 22.18 and a
  bundle the book's own compiler has built. Its package is `private: true`.
- Its tool contract is written against the MCP SDK pinned in its `package.json`: the tools
  and their annotations, the `read` prompt with its completions, elicitation
  ([ADR-0054](0054-submit-answer-elicits-the-reader-before-it-trusts-the-argument.md)), and
  refusals that come back as results. The unit tier holds all of it.
- #164 (order 640) and #167 (order 670) extend that contract.

**The reader's place.**

- With `AB_OVO_API_URL` and `AB_OVO_READER_TOKEN` set, the place is `ReaderProgress`,
  reached through `GET /api/v1/progress` and `PUT /api/v1/progress/{track}/{unit}`.
  Otherwise it lives in memory and is lost at restart.
- The token is an access token, read once from the environment. It expires at its own `exp`,
  and nothing refreshes it.

**The API is ready for a second client.**

- The content endpoints are open to a reader with no account. The reveal gate is in one
  place, and `POST …/advance` is idempotent on the step it answers.
- `ReaderIdentity.Resolve` takes a bearer, or an `X-Ab-Ovo-Reader-Id` shaped like a GUID. It
  files the second as `anon:<id>`.
- `web/app/src/lib/server/content.ts` is already a TypeScript client of those endpoints.
- Not everything an MCP reader needs is open to an anonymous reader. `GET /api/v1/progress`
  (every place the reader has) and the language preference both sit behind `authApi`.

**A .NET replacement is named in the register row's exit**: "Phase 5 replaces `web/mcp`
with a .NET client that calls `POST .../advance`". #155 records that no issue and no ADR
carried that plan.

**`PUT` has a second caller that raises `Step`, and the row did not name it.**
`web/app/src/lib/progress/sync.ts` pushes `reconcile.ts`'s `toPush` rows through
`PUT /api/v1/progress/{track}/{unit}`, under [ADR-0019](0019-furthest-frame-wins.md): frame
40 in this browser and frame 12 on the account pushes 40. That lands in the handler's
`update.Step > existing.Step` branch, or creates the row when the account holds none.

**What `authservice` v0.3.1 is known to do**, from this repository:

- sign in with a password, called server-side
  ([ADR-0018](0018-password-sign-in-happens-server-side.md));
- refresh tokens, and a two-factor challenge;
- sign-in on its own pages with an OAuth callback, and accounts with no password
  (`web/app/src/lib/runtime-config.ts`, `web/app/src/lib/server/delete-account.ts`);
- RS256, a JWKS and a discovery document (ADR-0004).

Its `iss` is a bare string, which "a full OIDC discovery client rejects" (ADR-0004 §4).
Nothing here shows it issuing a token to a client that is not this web app.

**The licence.**

- The book's `LICENSE-CONTENT` puts its prose under CC BY-NC-SA 4.0: `programs/`, and so
  the bundle compiled from it.
- Its *NOTE FOR THE AUTHOR* block is still there at the content pin `e24a4919`. This was read
  in a clone at that revision on 2026-09-25. So ADR-0033's tightest-term reading stands.
- Nothing credits the book. The bundle carries no author and no licence field. A search of
  `web/app/src` and `web/mcp/src` on 2026-09-25 found neither the licence nor the author's
  name.

## Decision

### 1. `web/mcp` stays in TypeScript and becomes a client of the API

**#171 (order 710) keeps `web/mcp` and makes it a client of `AbOvo.Api`.**

- Tracks, programs and steps come from `GET /api/v1/content/**`.
- Every advance goes through `POST …/advance`.
- It keeps no bundle on disk and no copy of the reveal gate.
- #164 and #167 are built in `web/mcp`.
- No .NET MCP client is planned.

**The reasons:**

- **What the register needs from `web/mcp` has nothing to do with language.** It needs a
  client that calls `POST …/advance` and never raises a step with `PUT`.
- **The expensive part is the contract hosts see, and the tests that hold it.** #171 must
  leave that contract unchanged. A rewrite would have to derive it again on a second SDK.
- **A one-command package is a Node package.** #172's done-when is a machine with only Node
  installed.
- **The wire shapes already exist in TypeScript.** `web/app/src/lib/content/wire.ts` is a
  shadow of `AbOvo.Contracts`. When `web/mcp` becomes their second consumer they move to
  `@ab-ovo/web-kit`, the rule
  [ADR-0053](0053-the-web-kit-package-is-extracted-on-its-own-exit-condition.md) applied to
  the loader.

The program order stays `isOpenWhere` from `@ab-ovo/web-kit`. Both surfaces import that one
function, so it is not a copy.

### 2. An anonymous MCP reader holds an opaque id, kept in a file

**The shape is ADR-0061's, unchanged.**

- The id is a GUID from a CSPRNG, sent as `X-Ab-Ovo-Reader-Id`.
- The API files it as `anon:<id>`.
- It is not a token: nothing is signed, and `AbOvo.Api` mints nothing (P5).

**The MCP process mints the id once and keeps it in a file.**

- It mints the id the first time it needs a place.
- The file is in the user's own state directory, readable by that user alone.
- Not the working directory, which the host chooses (`web/mcp/README.md`). Not the package
  directory either, which a package runner's cache may throw away.
- The file holds one id per API origin, keyed by the origin of `AB_OVO_API_URL`. Anyone may
  run an instance (ADR-0033), so one id sent everywhere would let any instance's operator
  replay it against another. An id goes only to the origin it was minted for.
- Every later process run by that user on that machine reads the same file, so every host
  there reads as one reader of each instance.
- The file is created atomically, by an exclusive create or by writing and renaming. A
  process that loses the race reads the file again, so two hosts that start together for the
  first time still end on one id.
- The host keeps nothing. An id in the host's configuration would be a credential in a file
  that people copy into bug reports and dotfile repositories.

**The id is a credential**, because possession is the only credential (ADR-0061). It never
appears in a tool result or on stderr, and it is never sent to anything but the `AbOvo.Api`
instance it was minted for.

**A place that cannot be kept is said out loud.** If the file cannot be written, the process
holds the place in memory and says so in its results. The in-memory store follows the same
rule today (P8).

**A bearer still wins.** When `AB_OVO_READER_TOKEN` is set it comes first, the same order as
`ReaderIdentity.Resolve`. It stays the developer's way to an account's place, and it works
for as long as that token lives.

**Pairing with a browser is out.**

- An anonymous MCP reader and an anonymous browser are two readers, and nothing joins them.
  There is no pairing code, no page that shows the `HttpOnly` cookie, and no import of an id.
- ADR-0061 already refused this: making the anonymous mechanism "travel between browsers
  would be building account-equivalent tracking without an account".
- The way to one place on both surfaces is an account. An account buys synchronisation and
  nothing else (ADR-0004).

**#171 adds three things to the API side:**

- A way for an anonymous reader to read every place they have in one call.
  `CursorStore.readAll` needs it for `list_programs` and for the program gate, and
  `GET /api/v1/progress` accepts only a bearer today. The read stays pinned to one `Subject`
  (`ReaderScopedQueries`).
- A write that records opening a program, for a reader with or without an account. One
  shape that fits is `POST /api/v1/content/{track}/{unit}/open` in `openWriteApi`, carrying
  the chosen edition.
  - **Why.** Today `open_program` records the step-1 place with
    `PUT /api/v1/progress/{track}/{unit}`, which takes a bearer only. `GET …/{step}` writes
    nothing, and `POST …/advance` creates a row only once step 1 has been answered. Without
    this write an anonymous `open_program` keeps neither the place nor the edition, and the
    program gate would need one answered step per program instead of one opened frame. That
    breaks ADR-0056's one rule on every surface: the browser records a place on arrival
    (`remember-position.tsx`), and ADR-0065 counts on one `open_program` per program.
  - **What it does.** It is pinned to one `Subject`. When no row exists it creates one at
    `Reveal.FirstStep` with the chosen edition. It never raises `Step`, and on an existing
    row it writes nothing: an edition switch is recorded by the next `POST …/advance`, which
    already carries the edition.
  - **What it does not do.** It does not check the reading order, which the API still does
    not hold (ADR-0065). The MCP server asks `isOpenWhere` before it writes, as
    `remember-position.tsx` does in the browser. With this write `web/mcp` needs `PUT` for
    nothing.
- Corrections to three doc comments in `src/AbOvo.Api/Extensions/ReaderIdentity.cs`, each of
  which becomes false once an MCP process mints ids:
  - `HeaderName` says the header is "never trusted from anywhere else" than the BFF;
  - `Resolve` says "minting happens once, in the web app's middleware";
  - `TryParseAnonymousId` says the id is always minted by `web/app/src/middleware.ts`, and
    "anything else did not come from there".

  What protects an id is that nobody can guess it, not where it came from: the API cannot
  tell a BFF from any other caller. What the BFF enforces is that a browser never picks the
  value (FRONTEND-BFF.md §1). An MCP process is not a browser, and it holds its own reader's
  id just as the BFF holds a cookie's.

### 3. A package first; a hosted server after the first deploy, and only if `authservice` can do OAuth

Both routes, in this order:

1. **#171 first.** Then the package carries no book and needs no compiler.
2. **#172 (order 720): the one-command package.**
   - It is published to npm, so a host starts it with one `npx` command.
   - `AB_OVO_API_URL` configures it, and a token can be added.
   - Publishing is the owner's manual step. CI builds and packs, and the owner publishes from
     his own npm account, under a name that is his to choose. A version number once
     published to npm cannot be used again, so the step that makes a version public stays
     with a person. Publishing from CI later is not ruled out: npm's trusted publishing over
     GitHub OIDC stores no token. Whether to move to it is #172's to decide.
   - Until #70 deploys `AbOvo.Api` the package reaches only an API somebody runs themselves.
3. **#173 (order 730): Streamable HTTP with OAuth.** It waits for the first deploy (#70,
   #71), and for a probe that answers whether `authservice` can be the authorization server
   for a third-party host. The MCP authorization specification makes the server an OAuth
   resource server. A host finds the authorization server through published metadata and
   registers itself with it. What is unknown:
   - whether v0.3.1 grants an authorization code with PKCE to any client but this web app;
   - whether a host can register itself, either dynamically or with a client metadata
     document;
   - whether it can publish authorization-server metadata with an issuer URL. Its `iss` is
     the bare string `AbOvo` (ADR-0004 §4), and changing that changes every validator;
   - what the hosted server presents to `AbOvo.Api`. The specification forbids a server to
     pass the host's token on to an upstream API, and the shape in `MCP-SERVER-SKETCH.md` §4
     does exactly that: the reader's bearer, per call, handed to `ApiCursorStore`.

**If the probe says no, #173 stays blocked, and no OAuth server is built here.**

- P5 lets exactly one service hold a signing key, so neither `AbOvo.Api` nor the MCP server
  becomes an issuer.
- `authservice` is adopted from its published image and never modified
  (SHARED-SERVICE-REUSE.md §2, ADR-0004).
- The way forward is an upstream release, adopted by moving the pin.

**A hosted server still serves readers with no account** (AGENTS.md item 5). A host that has
not signed its reader in can still read. The hosted server mints that reader an id on
ADR-0061's pattern for the MCP session, and the place lasts as long as the session does. The
results say so. OAuth is what keeps the place and shares it with the browser. The id is never
derived from, or equal to, the `Mcp-Session-Id`: the MCP specification forbids a server to
use sessions for authentication. That alone does not satisfy the rule. Any server-side map
from a session to a reader id makes whoever holds the session id the holder of that place.
#173 either binds the reader id to something other than the session, or accepts that
explicitly for a place that has little at stake, and says which.

### 4. What the licence allows on each route

The prose is CC BY-NC-SA 4.0. ADR-0033's rule holds: the tightest term governs, and
NonCommercial binds the deployment as well as copying.

| Route | Carries the book | Allowed | Not allowed |
| --- | --- | --- | --- |
| The npm package, after #171 | No. MIT code only. Its fixtures are paraphrase, not the book (`web/web-kit/src/fixtures/README.md`). | Publishing it free under MIT. Anyone may run it, fork it or ship it. | Publishing it with a bundle inside, which would be this repository redistributing the book through npm. |
| The `AbOvo.Api` instance a package or a host reads from | Yes: it serves the prose. | Serving it free and credited, to anyone, through any client. Running an instance is fine (ADR-0033). | Charging for access, a paid tier, or advertising against the content. |
| The hosted server (Streamable HTTP) | Yes: it puts the prose into a third-party host's conversation. | The same as above. The host is a medium the reader chose. | Any paid access. #173 is not a paid-access path, whatever `TWO-SURFACES-COMPARISON.md` row 22 recorded of the proposal it evaluated. |

**Every route that puts the prose in front of a reader credits it there.** The credit gives
the title, the author, the copyright notice as `LICENSE-CONTENT` states it ("Copyright (c)
2026 Konrad Cinkusz"), and CC BY-NC-SA 4.0 with its link. Where it is reasonably practicable
it also refers to the licence's disclaimer of warranties, which the licence's §3(a)(1)(A)
asks for. On an MCP server it goes in the
instructions and in `list_programs`. It is owed before #172 points a package at a deployed
instance, and before #173 ships. Compiling the book's LaTeX into the bundle changes the
format, and this repository reads the licence's §2(a)(4) as allowing that without making an
adaptation. The server's own sentences around a step are its own. This is a reading, not
legal advice (ADR-0033).

**Only the book can widen any of this.** If it moves to CC BY 4.0, the alternative its NOTE
names, the NonCommercial limit leaves every row. ADR-0033's relicense table then applies,
with one more row for the MCP credit.

## Consequences

**The register's .NET exit is replaced, and #171 alone does not discharge the row.** The
row's Reason and Exit now name both callers that raise `Step` through `PUT`. #171 removes
`web/mcp`'s dependency on `PUT`, and nothing more.

- **The second caller is `web/app`'s sync** (`web/app/src/lib/progress/sync.ts`, ADR-0019).
  A reader who read anonymously to frame 40 and then signs in to an account at frame 12
  reaches 40 on the account only through that push. If `PUT` were narrowed first, the
  reveal gate would refuse that reader frames 13 to 40 while signed in.
- **What discharges the row** is the account's place no longer coming from a number the
  browser sends. One mechanism that fits: at sign-in the API adopts the steps of the
  reader's `anon:<id>` rows into the account, the furthest frame winning, and sync then sends
  nothing the API does not already hold. A place that only this browser's `localStorage`
  holds would then not reach the account. That trade is for the change to decide.
- **No issue carries that change yet.** It needs one. Until it lands, #171 leaves `PUT` as it
  is: narrowing it, and discharging the row, wait for `web/app`'s sync to stop needing `PUT`
  to raise `Step`.

**#171 gets larger than its issue says.** It adds two anonymous endpoints to `AbOvo.Api`: an
"all my places" read, and a write that records opening a program at step 1 and never raises
`Step`. It also corrects three `ReaderIdentity` comments and moves the wire shapes into
`@ab-ovo/web-kit`. #164 and #167 need not wait for any of it: they are TypeScript either way.

**Anonymous MCP readers add rows to `ReaderProgress`.** The package adds one reader per user
account on each machine, for each instance it is pointed at. A hosted server adds one reader
per anonymous session. ADR-0061's retention job, which is required before production, now
has to cover these rows too. A reader who deletes the id file leaves orphan rows they cannot
delete, because `DELETE /api/v1/progress` needs a bearer. Clearing a cookie leaves the same
kind of rows.

**One file is one reader of each instance.** Two people who share an operating-system account
are one reader. A host that runs the server in a sandbox with no lasting home loses the place
at every start, and says so.

**The published package ships JavaScript.** Node does not strip types from a file under
`node_modules`, so the launcher that imports `src/server.ts` from a checkout cannot be what
is published. #172 publishes compiled output, bundled with `@ab-ovo/web-kit`, which is a
`private` workspace package. `web/mcp/package.json` has no `license` field today, and it
needs `MIT` before the package can be published free under MIT as §4 says.

**Hosts that can only connect remotely cannot reach the book until #173 ships.** That
includes a host in a web page, and #173 may stay blocked on `authservice` for a long time.
This is the price of shipping the package first and of refusing to build an issuer here.

**The web reading surface owes the same credit.** It does not name the book's author or
licence either. Settling that belongs to the first deploy (#71), not to this decision. It is
named here so that nobody has to discover it.

**This is not a new deviation.** It changes the exit of one existing register row and adds
none.
