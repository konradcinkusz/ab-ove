# ADR-0053: The web-kit package is extracted, on its own exit condition

## Status

**Accepted.** Date: 2026-09-20.

## Context

The trigger has been on record since before `@ab-ovo/mcp` existed. `web/package.json` said
the kit "is created when the SECOND app arrives"; once mcp did arrive, its own
`package.json` said moving the content library out of `@ab-ovo/app` "is a refactor with its
own diff and its own review" — deferred, not disputed — and restated the exit condition in
[`docs/architecture/MCP-SERVER-SKETCH.md`](../architecture/MCP-SERVER-SKETCH.md) §6: "before
a third consumer of the content library exists, or before anything in web/mcp needs a second
import from @ab-ovo/app — whichever comes first." `web/mcp/src/reveal.ts` already took that
second import (`Step`, `Unit` from `schema.ts`, reached the same relative way as
`content.ts`'s own crossing), so the condition was met before this commit; this is the
refactor those two files predicted, executed on its own.

[`docs/architecture/TWO-SURFACES-COMPARISON.md`](../architecture/TWO-SURFACES-COMPARISON.md)
row 18 reached the same conclusion independently, evaluating an external proposal against
this repository's actual state: "worth doing now — the repo's own stated trigger condition
for the @ab-ovo/web-kit extraction is already met."

## Decision

`bundle.ts`, `schema.ts`, `validate.ts` and `have-bundle.ts` move from
`app/src/lib/content/` to a new package, `web/web-kit/`, `@ab-ovo/web-kit` —
`content.ts`'s own three-part description of what belongs there, taken literally rather than
as a chance to move more: "the loader, the validator that refuses rather than degrades, and
the schema types." `have-bundle.ts` moves with `bundle.ts` rather than staying behind: it is
the loader's own test infrastructure (skip locally, refuse to skip in CI), and leaving it in
`@ab-ovo/app` would have made this package's own `bundle.test.ts` reach BACKWARDS into the
app that depends on it — the one shape this extraction exists to rule out.

Rendering (`maths.ts`, `markdown.ts`), the index's edition/track selection
(`chosen-edition.ts`, `chosen-track.ts`) and lab-runtime asset staging (`runtime-assets.ts`)
stay in `@ab-ovo/app`. None of them is "the loader, the validator or the schema types", and
`@ab-ovo/mcp` needs none of them — it returns the book's own text to a model, never a
rendered page.

Both `@ab-ovo/app` and `@ab-ovo/mcp` depend on the kit as a workspace package
(`workspace:*`), shipped as raw TypeScript with no build step — `@ab-ovo/mcp`'s own
precedent for a package nothing publishes. `@ab-ovo/app`'s Next build reads it because it is
named in `next.config.mjs`'s `transpilePackages`; both packages' `node --test` unit tiers
read it because Node's type stripping resolves `.ts` directly through the package's own
`exports` map, the same way each package already read its own source.

## Consequences

Nineteen import sites moved from a relative path, or the app's own `@/` alias, to
`@ab-ovo/web-kit`: fourteen across `@ab-ovo/app`'s pages and components, three inside
`app/src/lib/content` itself (`chosen-edition.ts`, `chosen-track.ts`, and the two test files
that read `have-bundle.ts`), one in `scripts/prepare-lab-assets.mjs`, and two in
`web/mcp/src` — `content.ts`'s existing crossing, redirected, and `reveal.ts` /
`reveal.test.ts`'s own second import, discharged. None of them changed behaviour: verified
by running the full unit tier of all three packages against the real compiled bundle at the
pinned revision (400 + 66 + 59 tests, all passing, not skipped) and a full `next build`, not
a typecheck standing in for one.

The loader's own path-resolution function (`candidateBundlePaths`, in `bundle.ts`) needed no
logic change. It already generalised to any direct child of `web/` before this move, because
`web/mcp` and the new `web/web-kit` are both siblings of `web/app` under the same directory —
only its comment was out of date, and is corrected here.

`@ab-ovo/web-kit` carries two subpath exports beyond its main barrel — `./fixtures/*` and
`./content-schema.v*.json` — for callers that need the raw, unvalidated JSON rather than what
`index.ts` would otherwise hand back pre-parsed: `@ab-ovo/mcp`'s own fixture-injection
design, and two of `@ab-ovo/app`'s own tests that read the schema document directly rather
than through `validateBundle`.

This discharges the deferred half of the exit condition `MCP-SERVER-SKETCH.md` §6 stated.
That document, and `web/package.json`'s and `web/mcp/package.json`'s own header comments, are
updated in this commit rather than left describing a trigger that already fired.
