# ADR-0049: Content is served live by the API, and the reader stays anonymous

## Status

**Accepted.** Date: 2026-09-21. Supersedes the "no backend" half of
[ADR-0004](0004-identity-authservice-and-anonymous-reader.md), the Decision of
[ADR-0008](0008-content-is-a-versioned-bundle.md), the whole of
[ADR-0013](0013-the-book-lives-inside-the-web-build-context.md), and the Decision of
[ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md).

## Context

`AGENTS.md` item 5 and every ADR above rest on one premise, first stated in ADR-0008: "the
reader loop must work with no account and no backend." That premise is wrong. ab-ovo is a
fully interactive product; there is no supported way to use it with the API unreachable, and
there never should have been — a reader whose frame content and reveal both come from a
server they cannot reach has not degraded gracefully, they have stopped reading. Treating "no
API answered" as a supported configuration ([P8](../architecture/00-ARCHITECTURE.md)'s
degrade-visibly principle, correctly applied to auth/db/otlp) was, for content specifically, a
category error: P8 is for *optional* integrations, and content was never optional.

The premise was never one requirement; it bundled two. ADR-0004 kept them separate in its own
text ("whether to build identity" versus "whether the reader needs it"), but every document
downstream collapsed them into a single "no account and no backend." They are independent,
and this ADR reverses only the half that was wrong: content now requires a live API. The
reader stays anonymous — an account still buys nothing but cross-device sync, which is ADR-0004's
other half, standing unchanged.

## Decision

**Every read of a program, unit, or step is a live call to `AbOvo.Api`.** The compiled bundle
is no longer served with the site. `AbOvo.Api` owns ingestion, validation, and serving of
content; `web/app` fetches it over HTTP like every other piece of state it does not own. The
concrete API shape (endpoints, entities) is tracked as its own implementation work, built
against this decision rather than restating it.

**Reading requires no account.** A new, non-JWT identity mechanism carries an anonymous
reader's position — [ADR-0050](0050-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md)
is the decision for its shape. `authservice` remains optional (P8); an anonymous reader never
touches it.

**A read is gated on the reader's furthest step, enforced by the server.**
`web/mcp/src/reveal.ts`'s gate — refuse step `n` unless `n <= cursor.step` — moves into
`AbOvo.Api` and becomes the one copy every client (the web app, and a future MCP client) calls,
rather than a browser-side convention nothing enforced. The web reading surface has never had
this gate; building it is new work, not a port of an existing web mechanism.

**Local storage stops being the record and becomes a resume hint.** `ReaderProgress`
(server-held, already exists for accounts) becomes authoritative for every reader, anonymous
or not. What a browser holds locally may still speed up a repeat visit, but nothing downstream
trusts it without asking the server.

## Consequences

**This is a product change, not a refactor, and it costs what the ADRs it supersedes said it
would.** The reading surface is now exactly as available as `AbOvo.Api` — a bad deploy or a
cold database connection now interrupts reading, which used to be true of nothing except
cross-device sync. P8's zero-credential-degrades-not-fails property stops applying to content
specifically; content becomes the one integration this product does not treat as optional,
and that asymmetry needs to be visible in `docs/architecture/00-ARCHITECTURE.md` rather than
read as an inconsistency with P8 itself.

**Every document that stated the old premise as a fact about the code is now wrong until
corrected**, per P14 — a tracked list, not a backlog item: `README.md` ("the reader loop needs
no account and no backend"), `docs/ux/UI-UX.md` rule 1, `docs/DIAGRAMS.md`/`.pl.md` and
`docs/diagrams/b1-reader-loop.mmd`/`.pl.mmd`, the `/about` page copy (EN/PL) and its test,
`tests/e2e/specs/no-backend.spec.ts`. Each is corrected against this ADR as its own change,
not silently.

**ADR-0013 is discharged outright, not amended.** Once content is not baked into the web
image at all, the question it answered — where the book's fetched tree lives inside the
Docker build context — no longer arises. ADR-0013's own Consequences section named this exact
trigger: "if phase 2's bundle is read by `AbOvo.Api`, that is the moment to... publish the
bundle as a package both images install rather than a directory both images copy." This is
that moment.

**ADR-0017's local-first mechanism does not disappear, it is demoted.** `lib/progress/store.ts`'s
validated, per-entry-safe `localStorage` read survives as a same-tab resume convenience; what
it is no longer is the only record, or one anything downstream trusts without asking the
server.

**Reading no longer costs nothing to scale.** A build-time bundle scaled for free with a
static site; a live, gated API call per step does not. This is an accepted cost, not an
oversight — `AbOvo.Api`'s content endpoints need their own capacity reasoning in
`flyio/INFRASTRUCTURE-ANALYSIS.md` before this reaches production.
