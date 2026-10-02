# How to publish the MCP package

The owner's manual step: making the package that `web/mcp` builds public on npm. CI builds,
packs and checks it and never publishes it, and this is the checklist for the part that stays
with a person.

> **Wersja polska:** [`publish-the-mcp-package.pl.md`](publish-the-mcp-package.pl.md)

**Nothing here has been done.** The package is not on npm, and nothing is deployed
(AGENTS.md #2), so a published package reaches only an API somebody runs themselves until the
first deploy gives it a public one to point at.

## Why this is a person's step

A version published to npm **cannot be used again**, not even after it is unpublished, and a
scope on npm belongs to an account, so the name is not this repository's to pick
([ADR-0066](../adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§3). `web/mcp/package.json` is `"private": true` until this checklist removes the line, so no
command run by accident can publish it
([ADR-0070](../adr/0070-the-mcp-package-is-built-and-checked-in-ci-and-published-by-its-owner.md)
§3). The workflow that builds it, `.github/workflows/mcp-package.yml`, holds no npm token.

## What the owner needs

- an npm account with two-factor authentication on, and the scope of the name if it has one
  (the account's own, or an organisation's it owns);
- Node and the `npm` that ships with it;
- a checkout of this repository with the workspace installed (`pnpm --dir web install`), which
  is where the check of the tarball runs;
- a running `AbOvo.Api` that holds the book, if the credit is to be seen in a list as the check
  below does ([`01-first-run.md`](../tutorials/01-first-run.md) runs one). Without it the check
  reads from a stub.

## The checklist

1. **Choose the name, and look at it on npm.** `npm view <name>` answering `E404` means nobody
   has it. A scoped name needs its scope, which is the account's own or an organisation's it
   owns: the account's page on npmjs.com shows which. Choose the first version number too: it is
   `version` in `web/mcp/package.json`, and it is spent when published.
2. **Make one commit that says so.** On a branch:
   - set `name` in `web/mcp/package.json`, the one place it is set, and rewrite the `//name`
     comment above it, which says the name is still to be chosen;
   - remove `"private": true` and the `//private` comment above it;
   - set `repository.url` to the repository's address as it is at that time. The rename to
     `ab-ovo` (#78) changes it, and npm's trusted publishing compares it with the repository a
     workflow runs in (ADR-0070 §5);
   - write the name where `web/mcp/README.md` says `<package-name>`, since that file is the
     package's page on npm.

   Open a pull request, and let it merge on the usual terms: this is a change to a manifest that
   a host runs, and it is reviewed as one.
3. **Get the tarball of the merged commit from CI.** The run of `MCP package` that the merge to
   `main` starts uploads it, as the artifact `ab-ovo-mcp-package`: a zip with one `.tgz` in it,
   which expires after the retention `mcp-package.yml` sets. **Actions, MCP package, Run
   workflow** makes another for `main` on demand. The pull request's own run builds the merge of the branch with `main` as it was then,
   which is not the merged commit if `main` has moved since, so it is not the file to publish.
   Publish a tarball CI made, and not one made on a machine: what the check below reads is that
   file, and the checksum in the run's summary says the download is the one CI made.
4. **Check the file, not the tree** (the next section). It has to pass with `--for-publish`.
5. **Publish that file, from the owner's own machine,** logged in to npm:

   ```bash
   npm login
   npm publish path/to/<tarball>.tgz --access public --dry-run   # what would be published, and nothing is
   npm publish path/to/<tarball>.tgz --access public
   ```

   `--access public` is for a scoped name, which npm publishes as restricted otherwise; the
   package is free (ADR-0066 §4). A tarball still marked `private` is refused by npm with
   `EPRIVATE`, and step 2 is what removes that.
6. **Look at what happened.** From an empty directory, `npx -y <name> --version` prints the name
   and the version, and `npm view <name>` shows the package and its licence (MIT). Then point a host at it
   (`claude mcp add ab-ovo -e AB_OVO_API_URL=http://localhost:<port> -- npx -y <name>`) and call
   `list_programs`: the book's credit is under the track.
7. **Tag the commit `mcp-v<version>`, and never `v*`.** `flyio.yml` deploys on a tag matching
   `v*` (it has never run), so a tag that starts that way would start the deploy chain. A tag
   beside the publish says which commit a version was made from.

**A mistake is not undone, it is superseded.** A published version can be deprecated
(`npm deprecate <name>@<version> "<why>"`) but its number is gone: fix it in a new commit and
publish the next version.

## Checking the tarball CI made

The same script CI runs on every tarball it uploads, on the download. It reads the file, not the
directory it was made from, and it is of no use unless it is run on the file that will be
published.

```bash
node web/mcp/scripts/verify-tarball.ts path/to/<tarball>.tgz --for-publish
node web/mcp/scripts/verify-tarball.ts path/to/<tarball>.tgz --api http://localhost:<port>   # against a running API
```

What it checks, in order:

1. **The contents.** Nothing but the launcher, JavaScript under `dist/`, web-kit's content
   schemas and the pin, `package.json`, `LICENSE` and `README.md`. No TypeScript, which Node would not
   strip under `node_modules`; **no copy of the book**, which is CC BY-NC-SA 4.0 and is not
   redistributed through npm (ADR-0033, ADR-0066 §4); no test code; nothing large enough to be a
   book. The licence is the MIT one the manifest declares, and nothing in `dependencies` is a
   specifier no registry can resolve. There is no install-time script, which would run on every
   reader's machine.
2. **The install,** with the `npm` that ships with Node, into an empty directory outside the
   checkout, and every JavaScript file parses.
3. **The start:** `--version` through the shim `npx` runs, `--help`, and a refusal of an argument.
4. **The handshake:** the installed server is started as a host starts it, a client connects,
   and `list_programs` comes back with **the book's credit** in the server's instructions and in
   the list, in words and as data.
5. **`--for-publish` only:** the manifest is no longer `private`.

**What it does not check,** and the owner does: that the name is free and theirs (step 1),
that the version has not been published (npm says so, at the end of step 5, too late to be
repaired), and that an API holds the book.

Also worth a look before step 5, since the check reads a list and not a judgment: `tar -tzf
<tarball>.tgz` is the whole contents, and a package of this kind is a short list.

## Before the package is pointed at a deployed instance

None exists yet. When one does, these are true first (`web/mcp/README.md` has the reasons):

- the credit is shown by that instance's list, which `--api <its address>` above checks;
- the instance serves the book free, with no charge, no paid tier and no advertising against it
  (ADR-0033);
- the reading surface credits the book as well, which belongs to the first deploy (#71);
- anonymous readers' rows are retained on a rule (ADR-0061, ADR-0066's Consequences).

## Later: CI publishes, with no token

ADR-0070 §5 decides that if CI ever publishes, it is by npm's trusted publishing over GitHub
OIDC and never by a stored token, and that the owner turns it on. The workflow is not in the
tree. The ADR carries its text and says exactly what to set on npm and on GitHub. The first
publish stays this checklist, by hand.

## See also

- [`../adr/0070-the-mcp-package-is-built-and-checked-in-ci-and-published-by-its-owner.md`](../adr/0070-the-mcp-package-is-built-and-checked-in-ci-and-published-by-its-owner.md)
- [`../../web/mcp/README.md`](../../web/mcp/README.md) — connecting an agent, and the credit.
- [`run-the-tests.md`](run-the-tests.md)
