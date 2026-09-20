# ADR-0013: The book's lab engine lives at `web/content/`, inside the web build context

## Status

**Accepted.** Date: 2026-09-14.

## Context

Phase 1's lab pane runs the book's own exercise engine in the browser under Pyodide. The
engine is a pinned, digest-verified artefact of the book (ADR-0008), fetched by
`scripts/fetch-book-content.sh` and staged into `web/app/public/book/` by the app's
`prebuild` script so that Pyodide has a virtual file system to mount.

The engine was first fetched into `content/` at the **repository root**, which is the
natural place for something neither the web app nor the API owns. The web image then could
not be built.

**Reproduced before it was fixed**, by giving `prepare-lab-assets.mjs` the layout the
builder stage has — the context root as `/workspace`, `app/` beneath it, nothing above:

```text
prepare-lab-assets: content/book.lock.json was not found at <ctx>/../content/book.lock.json
  The lab engine is fetched from the book at a pinned revision, not authored here.
  Fix:  bash scripts/fetch-book-content.sh
EXIT=1
```

That is the script failing exactly as designed — loudly, rather than shipping a pane with no
engine. The defect is not in the script. It is that **`content/` was outside the context**,
and Docker cannot `COPY` from outside a build context.

The context is `web/`, the pnpm workspace root, and that is not adjustable:

- **FRONTEND-BFF.md §7** puts the single lockfile at the workspace root, so a context rooted
  at `web/app/` could not run `pnpm install --frozen-lockfile`.
- **FLY-IO-DEPLOYMENT.md §4** makes the context the directory holding the lockfile.
  `flyio/web.fly.toml` declares `context = "../web"` and quotes the rule.

## Options weighed

**Widen the web context to the repository root.** Rejected. Docker reads `.dockerignore`
from the context root, and the API image already has the repository root as *its* context
with an ignore file that excludes `web/` — because **REPO-BASELINE.md §1** says "the backend
image build must not ship `web/`, `tests/` or the infra tree as build context". One context
root gets one ignore file, so the two images would need opposite rules from the same file.
BuildKit's per-Dockerfile `<name>.dockerignore` would sidestep that, and this repository
deliberately does not depend on BuildKit-only behaviour (`web/app/Dockerfile` removed its
`# syntax=` directive for exactly that reason). A fix that rests on a frontend the daemon
may not be using is a fix that is inert on some builders and nobody can tell which.

**Fetch the book inside the Dockerfile.** Rejected, though less firmly than it first looked:
the objection "a network call in an image build" is weak when `pnpm install` two lines above
is already one, and the book fetch is pinned to a commit sha and digest-verified per file,
which is *stronger* than the registry fetch beside it. It fails for a different reason — the
lock file that names the pin would still have to be in the context, so it solves nothing.

**Stage the book into the context from the host before `docker build`.** Rejected: the image
would depend on a step having run outside it, invisibly, and the builder's `pnpm build` runs
`prebuild` again regardless and would still fail.

**Symlink `web/content -> ../content`.** Rejected: Docker does not follow a symlink out of
the context.

## Decision

**`content/` moves to `web/content/`, lock file and fetched tree together**, and
`web/app/Dockerfile`'s builder stage carries `COPY content ./content`.

- `web/content/book.lock.json` and `web/content/README.md` are committed. The fetched tree
  `web/content/book/` is not — `.gitignore` says so, which is what turns "nothing under
  `web/content/book/` is authored here" from a request into a rule.
- `prepare-lab-assets.mjs` resolves the lock from the **workspace** root rather than the
  repository root, so the arithmetic is identical on a developer's machine and in the image.
  Reproducing the real layout is cheaper than making the script search for its own root.
- `lock.destination` stays repository-relative (`web/content/book`) because
  `scripts/fetch-book-content.sh` runs from the repository root. The prebuild names its
  source directly rather than reassembling that path, because inside the image the path's
  first segment does not exist.

**Verified end to end in the artefact that ships**, not in a dev server: the image builds,
and a container of it answers `200` for every runtime and book asset, `404` for
`/book/lab/solutions/p01_floating_point.py` (ADR-0012), and `307` for an unknown page — so
the page gate is still failing closed while the reader loop needs no account.

## Consequences

**It reads as though the web app owns the book, and it does not.** That is the real cost and
it is worth stating plainly rather than arguing away. What makes it acceptable is that the
directory is explicitly interim: `web/content/README.md` records that phase 2 replaces this
file-by-file fetch with the content bundle the book attaches to a `v*` release, and the
placement is the first thing to revisit when it does. A bundle is one artefact, and where a
single artefact is unpacked is a much smaller question than where a directory tree lives.

**A future API consumer would be reaching into `web/`.** Phase 1 has none — the two consumers
are the app's prebuild and the Playwright fixtures. If phase 2's bundle is read by
`AbOvo.Api`, that is the moment to split the pin from its unpacked tree, or to publish the
bundle as a package both images install rather than a directory both images copy.

**The web image's `.dockerignore` moved too, and was doing nothing where it was.** It sat at
`web/app/.dockerignore`; Docker reads the ignore file from the **context root**, which is
`web/`. The daemon's built-in frontend therefore found no ignore file at all and uploaded
the whole working tree — `app/node_modules` included — on every build. Nothing was *broken*
by it, which is exactly why it was invisible: the Dockerfile's COPYs name what they want and
the builder discards a carried-in `node_modules`, so the file only ever bought upload time
and cache stability. It is now at `web/.dockerignore`, which is the path
`flyio/web.fly.toml` already names in its own contract, and it carries an explicit
instruction that nothing in it may exclude `content/`.
