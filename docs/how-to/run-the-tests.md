# How to run the tests

Every tier, what each one covers, and what to run when you only want one.

> **Wersja polska:** [`run-the-tests.pl.md`](run-the-tests.pl.md)

## Everything CI runs, in order

```bash
bash scripts/fetch-book-content.sh     # FIRST, once per clone
dotnet build AbOvo.sln -warnaserror
dotnet test AbOvo.sln
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web build
bash scripts/scan-secrets.sh --staged
```

The whole set is fast enough that guessing which part your change affects is not worth it.

**The fetch is first for a reason.** `web/content/` is derived rather than committed, and the
tests that assert against the whole book would otherwise skip silently — a green tick over an
assertion nobody made. `web/app/src/lib/content/have-bundle.ts` refuses to load at all when
the bundle is missing and `CI` is set, so the honest outcome in a pipeline is red rather than
a skip.

## One tier at a time

| You want | Run |
| --- | --- |
| The .NET unit and in-memory integration tiers | `dotnet test AbOvo.sln` |
| The architecture rules alone | `dotnet test AbOvo.sln --filter ArchitectureTests` |
| One .NET test by name | `dotnet test AbOvo.sln --filter <substring of the method name>` |
| The web unit tier | `pnpm --dir web test` |
| ESLint over the workspace | `pnpm --dir web lint` |
| `tsc` over every workspace member | `pnpm --dir web typecheck` |
| The documentation checks | `npm run lint:docs` (after `npm install` in the root) |

## The acceptance suite

It drives a **production build**, not `next dev`, because that is what a reader gets.

```bash
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers      # explicit; no install-time browser download
pnpm --dir tests/e2e run test:smoke    # the critical path, minutes
pnpm --dir tests/e2e run test:full     # the core regression layer
pnpm --dir tests/e2e run test:identity # the specs that need an account
```

The config starts the web app itself and reuses a server you already have running locally. The
identity layer additionally starts a stub identity service, and exists **only for a local
target** — against a deployed target there is nothing for it to point at, and a project that
existed there would fail on every run for a reason that is not a defect.

```bash
pnpm --dir tests/e2e run report        # open the HTML report of the last run
```

## Two properties of these gates

- **A guard fails; it never skips.** `ci.yml`'s e2e job fails when the suite is absent,
  because a green run that tested nothing is the failure the suite exists to prevent
  (E2E-ACCEPTANCE-TESTING.md §2). Do not "fix" a red guard by making it conditional.
- **An unreferenced test entry point is documentation that lies** (TESTING-STRATEGY.md §9).
  Do not add a script, a browser project or a lint configuration that no CI context executes.

## When something fails and the message is not enough

[`../../scripts/README.md`](../../scripts/README.md) carries a troubleshooting table keyed on
the **literal exception text**, because that is the string somebody pastes into a search box.

## See also

- [`../tutorials/03-contribute-a-change.md`](../tutorials/03-contribute-a-change.md) — watching
  two of these gates refuse something, which is the part you cannot get from reading.
- [`../DIAGRAMS.md`](../DIAGRAMS.md) §D1 — the gates, drawn.
