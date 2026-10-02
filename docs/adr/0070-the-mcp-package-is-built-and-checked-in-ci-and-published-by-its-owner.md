# ADR-0070: The MCP package is built and checked in CI and published by its owner, and CI publishes only by trusted publishing, never by a token

## Status

**Accepted.** Date: 2026-10-02. Decided for #172 (order 720 in
[`docs/ux/UI-UX.md`](../ux/UI-UX.md#the-order)), which
[ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§3 left the question of trusted publishing to. It amends none of the ADRs it is constrained by:

- [ADR-0033](0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)
  (the licence: the book is the book's to licence);
- [ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md) and
  [ADR-0061](0061-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md) (the reader
  needs a live API and no account);
- [ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
  §3 and §4 (a package first; what the licence allows on each route).

## Context

ADR-0066 decided that the first way an agent reaches the book is a package a host starts with
one command, that it carries no book, that CI builds and packs it, and that **the owner
publishes it from their own npm account, under a name they choose.** These facts shape how:

- **The package could not be published as it was.** `web/mcp` was `private`, and it ran
  TypeScript. Node strips types from the files of a checkout, and it does not strip them from a
  file under `node_modules`, which is where an installed package lives. The server also imports
  `@ab-ovo/web-kit`, a private workspace package no registry has.
- **A version published to npm cannot be used again,** and a scope on npm belongs to an
  account. Making a version public is the one step here that cannot be taken back, and the name
  is not this repository's to pick.
- **Nothing is deployed** (AGENTS.md #2), so there is no public API to point the package at.
  Until the first deploy a package reaches only an API somebody runs themselves.
- **A host runs this package with the user's own rights,** on every machine that configures
  it. What a reader receives, and that it is the thing the owner meant to publish, matters more
  here than for a library nobody executes unattended.

## Decision

### 1. The package ships JavaScript, made without a bundler

`web/mcp/scripts/build.ts` writes `dist/`. It follows the server's imports from
`src/server.ts`, strips each module's types with Node's own `module.stripTypeScriptTypes`, and
rewrites each import specifier: `./api.ts` to `./api.js`, and `@ab-ovo/web-kit` to the copy of
the kit's modules it carries in `dist/web-kit/`. Nothing is minified or joined, and the
stripper replaces each type with whitespace, so a line of `dist/` is the line of `src/` it came
from. `@ab-ovo/web-kit` is therefore a **development** dependency, and the one runtime
dependency is the MCP SDK.

- **The launcher runs `src/` wherever it is present, and `dist/` where it is not.** A checkout
  always has `src/`, so a stale `dist/` is never run under a developer, and the package has none.
  The development path, and the unit tier, are unchanged.
- **Why not esbuild or `tsup`:** a new dependency to pin and to keep current, a tool of its own to
  understand, and a single minified file that no longer reads as the source does. The stripper is
  the transform that already runs every `.ts` file of this package in the unit tier. Node marks
  it experimental, which the Consequences name.
- **Why not publish `@ab-ovo/web-kit`:** a second public package, with a name, a version and a
  release of its own, for a kit whose consumers are packages of this workspace
  ([ADR-0053](0053-the-web-kit-package-is-extracted-on-its-own-exit-condition.md) extracted it
  for them, and says nothing of publishing it). That is a decision of its own, and nothing here
  needs it.

### 2. The tarball carries what is listed, and the book is not in it

`web/mcp/package.json` declares `license: MIT` and `files`: the launcher, `dist/`, `LICENSE` and
`README.md`. The book is CC BY-NC-SA 4.0, and putting it in the package would be this
repository redistributing it through npm
([ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§4, [ADR-0033](0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)).
It is refused at each layer, so that one layer's mistake is another's failure:

- the build refuses a file under `web/content/` but the pin, which is the book's revision and
  never the book, and refuses test code and a bare import the manifest does not declare;
- `web/mcp/scripts/verify-tarball.ts` reads the packed file and refuses anything off a short
  list of what a package of this kind carries, TypeScript, the book, test code, a file or a
  total large enough to be a book, a missing or wrong licence, a dependency no registry can
  resolve, and any install-time script;
- the unit tier (`src/package.test.ts`) shows each of those refusals firing.

### 3. `private: true` stays until the owner's first publish

npm refuses to publish a private package. Keeping the line means no command run by accident
(`pnpm -r publish`, an `npm publish` in the wrong directory) can make a version public under a
name nobody chose. Packing is not publishing, so CI is not held back. Removing the line is a step
of the owner's checklist, in the same commit that sets the name, so that what they publish is a
revision the history shows them choosing. The package's name is set in one place:
`name` in `web/mcp/package.json`. `@ab-ovo/mcp` is the workspace's name for it until the owner
chooses.

### 4. CI builds, packs, checks and uploads, and holds no credential

`.github/workflows/mcp-package.yml` builds the tarball with `pnpm pack`, runs
`verify-tarball.ts` on it (contents, then an install with the npm that ships with Node into an
empty directory outside the checkout, then `--version`, `--help` and the MCP handshake against a
stub of `AbOvo.Api`, which must show the book's credit), and uploads it as an artifact. A second
job runs the same file on the oldest Node `engines` allows and on the next long-term-support
line. The workflow holds `contents: read`: **no publish step, no npm token, no `id-token`.**

### 5. CI publishes, if it ever does, by trusted publishing, and the owner turns that on

**Decided for it, and not yet.** A stored npm token is a long-lived secret that can publish as the
owner from anywhere it leaks to, and AGENTS.md #6 says no secret is ever a literal and
`secrets.env.example` names every one; a token would be a new secret to hold, rotate and
name. npm's trusted publishing authenticates a workflow run by GitHub's OIDC token instead, so
there is nothing to store, and it attaches provenance, which links the published file to the
commit and the workflow that made it. That matters most for a package a host runs unattended. A
person still decides, because the workflow below runs only from `workflow_dispatch`, in a GitHub
environment whose required reviewer is the owner. ADR-0066 §3's "the step that makes a version
public stays with a person" holds.

**It does not start with the first version, and the workflow is not in the tree.**

- The first publish is by hand, from the owner's machine and their 2FA. The name is theirs to
  choose, and a trusted publisher is configured on a package's settings page on npm, which
  belongs to a package that exists.
- Provenance is generated only for a public repository and a public package, and whether this
  repository is public by then is for the owner to see.
- The configuration names the repository and the workflow file, so it is set once, after the
  rename of the repository (#78), and not before.

**What the owner turns on, when they choose to:**

1. On npmjs.com, in the package's settings, add a **trusted publisher**: GitHub Actions, owner
   `konradcinkusz`, the repository's name at that time, workflow file `mcp-publish.yml`,
   environment `npm-publish`. Afterwards, npm's own setting that requires two-factor
   authentication and disallows tokens can be turned on.
2. On GitHub, create the environment `npm-publish` with the owner as required reviewer, limited
   to the `main` branch.
3. Add `.github/workflows/mcp-publish.yml` with the text below, and set `repository.url` in
   `web/mcp/package.json` to the renamed repository. npm compares it with the repository the
   workflow runs in.
4. Confirm the requirements against npm's current documentation. What follows is what was known on
   2026-10-02 (npm CLI 11.5.1 or later, and a Node new enough to carry it), and **it could not be
   checked from where this was written**, because npm's documentation was not reachable. If a
   requirement has moved, this ADR is amended and the workflow is changed with it.

```yaml
name: Publish the MCP package

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: npm-publish
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          package_json_file: web/package.json
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml
      - run: pnpm --dir web install --frozen-lockfile
      - name: Require an npm that can publish with OIDC
        run: |
          need=11.5.1
          have=$(npm --version)
          if [ "$(printf '%s\n%s\n' "$need" "$have" | sort -V | head -n1)" != "$need" ]; then
            echo "::error::npm $have cannot publish with OIDC; it needs $need or later."
            exit 1
          fi
      - name: Build, pack and check the tarball for publishing
        id: pack
        run: |
          set -euo pipefail
          out="$RUNNER_TEMP/mcp-package"
          mkdir -p "$out"
          pnpm --dir web/mcp pack --pack-destination "$out"
          set -- "$out"/*.tgz
          node web/mcp/scripts/verify-tarball.ts "$1" --for-publish
          echo "tarball=$1" >> "$GITHUB_OUTPUT"
      - name: Publish
        env:
          TARBALL: ${{ steps.pack.outputs.tarball }}
        run: npm publish "$TARBALL" --access public
```

### 6. The server is configured by its environment, and credits the book

`AB_OVO_API_URL` is required and `AB_OVO_READER_TOKEN` is optional, as `web/mcp/README.md`
says, and a value that is not an http or https address is said on stderr once as well as in
every result (#137's wording). Without a token the reader is anonymous under the id file
[ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§2 decided (#171).

The book is credited where the server's prose reaches a reader, in words and as data
([ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§4): in the server instructions, and in `list_programs` under each track, in the listing's
edition, with a `credits` member in its structured content. The table is
`web/mcp/src/credit.ts`: the title in each edition, the author, the copyright notice as the
book's `LICENSE-CONTENT` states it, CC BY-NC-SA 4.0 with its link, and where the book is.

## Consequences

**The owner takes a step this repository cannot take for them, and it is written down.**
[`docs/how-to/publish-the-mcp-package.md`](../how-to/publish-the-mcp-package.md) is the
checklist: the name, the removal of `private`, the check of the tarball CI produced, the
publish, and what to look at afterwards. A version published is a version spent.

**What is true before the package is pointed at a deployed instance** is in that checklist and
in `web/mcp/README.md`, and it is this. The credit is in the package. The instance must still
serve the book free, as ADR-0033's NonCommercial term requires. And the reading surface owes the
same credit, which ADR-0066 said belongs to the first deploy (#71) and which nothing here does.

**The build depends on an experimental Node API.** `module.stripTypeScriptTypes` may change its
output between versions, and Node says so each time it runs. What is written is run before it is
shipped: by the unit tier, and by the workflow from the packed tarball on the Node versions it names, so a
change there is a red build and not a broken package.

**The package's Node floor stays 22.18.0, although compiled JavaScript would run on an older
Node.** The floor is the Node the package is built and tested on, and the launcher says so. Lowering
it is a decision with its own change to the matrix in `mcp-package.yml`.

**The published `package.json` carries this repository's `//` comments.** They are the estate's
convention for the reasoning beside a field, and they are visible on the registry. The ones that
are about the owner's first publish (`//name`, `//private`) are rewritten or deleted by the
checklist.

**`dist/web-kit/` carries the kit's loader though the server does not call it,** because the
build follows imports and the kit's barrel re-exports it. The loader reads a book from disk only
when it is asked to, and nothing in the server asks. The cost is a few kilobytes of code that is
not used. The refusals above still hold: the book itself cannot enter.

**Trusted publishing ties the setup to names.** The repository's name (#78), the workflow's file
name and the environment's name are all in npm's configuration, and a rename of any of them
breaks the next publish until the configuration is edited. The checklist says to set it up after
the rename for that reason.

**Nothing is deployed, and this adds no deviation.** The package reaches an API somebody runs,
such as the local stack, until #70 and #71 exist, and says so in its README.
