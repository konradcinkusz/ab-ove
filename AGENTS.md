# AGENTS.md — working in this repository as an agent

**ab-ovo is a learning platform that encapsulates the book *Mathematics from Zero for the AI
Engineer*.** Read [`README.md`](README.md) first; this file is the part an automated
contributor needs and a human reader mostly already knows.

It is written to be read *before* the first edit, because most of what follows is a rule
somebody has already paid for. This repository treats a stale document as a review finding,
so a rule discovered afterwards is a rule discovered by repeating the failure.

Related, and not duplicated here: [`.github/agents/README.md`](.github/agents/README.md)
carries the rules any *agent definition* must satisfy — tool allowlists, repo-relative paths,
memory policy. [`.claude/settings.json`](.claude/settings.json) declares the standards
adoption. [`CONTRIBUTING.md`](CONTRIBUTING.md) is the same ground for a human.

---

## The nine things most likely to be got wrong

1. **`src/AbOvo.AppHost/AppHost.cs` is not the deployed system.** It is the *development*
   composition root (P1). Production is `flyio/*.fly.toml` and
   `.github/workflows/flyio.yml`, and the two genuinely differ — the AppHost gives
   `authservice` a host port and a plain-HTTP issuer, which a deployed instance must not
   have. Reasoning about "what is deployed" from the AppHost reads the wrong file.

2. **Nothing is deployed.** No Fly app exists, no image has been published, no secret has
   been set. Do not write a sentence, a comment or a document that implies otherwise, and do
   not add a deployment badge.

3. **The domain model is two entities and it stays that size until a ticket says otherwise**
   (INIT-GENERIC-TEMPLATE.md §12). `AbOvoDbContext` declares `ReaderProgress` — where a reader
   is — and `FrameOutcome` — a count against a frame. Do not add a third to make an example
   work, to demonstrate a pattern, or because a scaffold looks empty. Entities arrive with the
   ticket that needs them, each with its own migration. (This item used to say there was no
   domain model at all; that stopped being true with #11, and a rule stated against a fact
   that has moved is a rule nobody can follow.)

4. **The instrument measures the book, never the reader**
   ([ADR-0009](docs/adr/0009-the-instrument-measures-the-book.md)). Do not add a reader,
   user or author identifier to any score or outcome row; do not add a per-reader view,
   route, query parameter or sort control; do not group or order anything by a person. The
   README makes that a claim about the code, and any of those edits makes the README false.

5. **The reader loop must work with no account and no backend.** A change that makes a frame,
   a reveal or an exercise require a fetch has broken the product's first requirement, not
   added a loading state.

6. **No secret is ever a literal, anywhere.** `AppHost.cs` takes them as parameters from
   `dotnet user-secrets`; workflows reference `${{ secrets.NAME }}` and never a value;
   connection strings are assembled in the pipeline from a password and a known host rather
   than stored whole. `secrets.env.example` names every variable and contains no values. A
   pushed commit is public forever, so the remedy for a leak is **rotation first**, history
   second — `SECURITY.md` has the procedure.

7. **No `NEXT_PUBLIC_*`.** An address there is substituted into the bundle by the compiler
   and costs one image per environment (P12, FRONTEND-BFF.md §2). Addresses arrive at run
   time from `/api/config`. The ESLint configuration makes reading one an error, and the
   right response to that error is never to disable the rule.

8. **The browser talks to the web app's own origin and to nothing else**
   (FRONTEND-BFF.md §1). Never to the API, never to `authservice`, never to a CDN — no
   font, stylesheet, script or icon. If a change needs CORS configured on the frontend's
   account, the rule has already been broken.

9. **Repo-relative paths only, in every file you write.** A hardcoded absolute path breaks
   every other machine and CI, and the failure looks like the tool being broken rather than
   like a path being wrong. Write `src/AbOvo.ServiceDefaults/`, never `/home/...` and never
   `C:\Repos\...`.

---

## Where the truth is

| Question | The file that answers it, and nothing else does |
| --- | --- |
| What runs locally, and how | `src/AbOvo.AppHost/AppHost.cs` |
| What is deployed | `flyio/*.fly.toml`, `.github/workflows/flyio.yml` — describing apps that do not exist yet |
| Which address reaches what | `flyio/README.md` |
| What is a secret and where it lives | `flyio/SECRETS.md` for the deployed estate; `secrets.env.example` for the authoritative list of every variable by tier |
| How a machine gets set up | `scripts/setup.sh` and `scripts/setup.ps1`, described in `scripts/README.md` |
| Package versions | `Directory.Packages.props` — one version per package; no `.csproj` carries a `Version` |
| Everything that is not a version | `Directory.Build.props` |
| The SDK version | `global.json` — and only there |
| The Node major | `.github/workflows/ci.yml`'s `NODE_VERSION`, the Dockerfile, and `web/.npmrc`'s engine-strict; all three must agree |
| The pnpm version | `web/package.json`'s `packageManager` field |
| Which tests run in which context | `.github/workflows/ci.yml`'s header matrix |
| Why a decision was taken | `docs/adr/` |
| Where this tree departs from the constitution | `docs/architecture/00-ARCHITECTURE.md`, deviation register |
| What is planned, ranked | `docs/ux/UI-UX.md` |
| Which document a reader needs | `docs/START-HERE.md` — and its Polish half, which is the same page |
| What the system looks like as a picture | `docs/DIAGRAMS.md` and `docs/DIAGRAMS.pl.md`; the `.mmd` sources under `docs/diagrams/` |
| What a screen actually looks like | `docs/SCREENSHOTS.md` — captured from a build, not drawn |
| Which documents are bilingual | `scripts/check-doc-parity.mjs`, which holds the list and enforces it |

**A check does not exist because a config file exists.** A lint configuration in the tree
proves nothing about whether any job runs it. Check `.github/workflows/`.

---

## The kernel has two rules, and both are mechanical

`src/AbOvo.ServiceDefaults` is the shared kernel (P2): cross-cutting plumbing only. No
business entity, DTO, enum, seed dataset, pricing constant or user-facing string may enter
it. Prose has already failed twice in this estate — a `.Core` library that began as shared
plumbing and ended as a shared domain — so neither rule is advisory:

- **`tests/AbOvo.Api.Tests/ArchitectureTests.cs`** — the kernel may not reference
  `AbOvo.Api` or `AbOvo.Contracts`, may not declare a `DbContext`, and may not export a
  public unsealed class to inherit from (P10). This is the check that matters.
- **`ci.yml`'s `kernel-size` job** — a ceiling of 800 non-blank, non-comment lines, with the
  raw count printed beside it and never gated
  ([ADR-0011](docs/adr/0011-kernel-size-gate-counts-code-lines.md)). It is a *proxy* for the
  first one.

**Do not resolve a size failure by deleting comments.** The gate counts code lines precisely
so that the reasoning P14 asks for is free. If the kernel is genuinely too large, something
belongs outside it; if the ceiling is genuinely wrong, raise it in a diff to that workflow
and say why in the pull request.

---

## Verifying a change

On a machine that is not set up, `bash scripts/setup.sh --check` reports what is missing and
changes nothing; `bash scripts/setup.sh` does the four onboarding steps and is idempotent
(`scripts/setup.ps1` is the PowerShell twin, and the two are kept in step deliberately).
`scripts/README.md` carries a troubleshooting table keyed on the **literal exception text**,
because that is the string somebody pastes into a search box.

Then run what CI runs, in this order. The whole set is fast enough that guessing is not
worth it.

```bash
bash scripts/fetch-book-content.sh     # FIRST, once per clone: `dotnet test` and `pnpm --dir web build` both fail without it
dotnet build AbOvo.sln -warnaserror   # warnings are errors, here and in Directory.Build.props
dotnet test AbOvo.sln                 # unit, in-memory integration, architecture rules
pnpm --dir web lint
pnpm --dir web typecheck               # tsc over every workspace member, not just what a route reaches
pnpm --dir web build
bash scripts/scan-secrets.sh --staged  # what the pre-commit hook runs
npm install && npm run lint:docs      # links, diagram pairing, EN/PL parity, markdownlint
```

`web/content/book/` is derived rather than committed (ADR-0008), and `ci.yml` fetches
before Restore for this reason. The distinction that catches people: **the Api does not
need the book, its tests do** — `Instrument/Proportion.cs` holds `public const double Z =
1.96;` transcribed from the book, so the service runs on a bare clone while the tests that
check that transcription throw on the missing `p27.tex`.

For the acceptance suite (it drives a production build, not `next dev`):

```bash
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers      # explicit; no install-time browser download
pnpm --dir tests/e2e run test:smoke
```

Two properties of the gates worth knowing before you try to satisfy one:

- **A guard here fails; it never skips.** `ci.yml`'s e2e job fails when the suite is absent,
  because a green run that tested nothing is the failure the suite exists to prevent
  (E2E-ACCEPTANCE-TESTING.md §2). Do not "fix" a red guard by making it conditional.
- **An unreferenced test entry point is documentation that lies** (TESTING-STRATEGY.md §9).
  Do not add a `test:extended` script, a browser project or a lint configuration that no CI
  context executes.

---

## When you change something, change its documentation in the same commit

That is P14, and it is the rule this repository is most often judged by.

- **A comment cites the principle or guide section it exists to satisfy.** A rule with no
  citation is somebody's taste, and the next reader cannot tell the two apart.
- **A decision gets an ADR** — `docs/adr/`, from
  [`0000-template.md`](docs/adr/0000-template.md), Status / Context / Decision /
  Consequences. Short. The Consequences heading is the one people skip and the one that
  makes the record worth keeping.
- **A departure from the constitution gets a row in the deviation register**, with a date, a
  reason and an **exit condition**. A deviation with no stated way out is a drift.
- **Do not state a count of occurrences** in a document — "the only place we do X", "three
  rigour boxes", "fourteen instances". A tally decays silently and nothing can check it.
  Name the rule and the places it is lifted.
- **Before writing a sentence about another file, open that file.** Most stale documentation
  in this estate is a confident sentence about a neighbour written from memory.
- **Numbers are measured, not remembered.** The kernel line count in
  `docs/architecture/00-ARCHITECTURE.md` carries a date and the instrument that produces it,
  because a figure in a document is stale the moment the next commit lands.

**Three of those rules are mechanical now, and `npm run lint:docs` is what runs them.** It is
the root `package.json`, deliberately not a member of the `web/` pnpm workspace, and
`.github/workflows/docs.yml` runs it on every pull request that touches a document:

- **Every relative link resolves.** A rename that breaks one is silent otherwise.
- **Every diagram exists three times and the three agree** — inline in `docs/DIAGRAMS.md`,
  inline in `docs/DIAGRAMS.pl.md`, and as `docs/diagrams/<id>-<slug>.mmd` and its `.pl.mmd`
  twin. A separate job renders each one, because GitHub shows an invalid Mermaid block as
  source rather than erroring.
- **Neither half of a bilingual document moves alone.** No script can check that a translation
  is correct; this checks that somebody looked, which is the failure that actually bites.

So: **if you edit a tutorial, a how-to guide, `START-HERE`, `DIAGRAMS` or `SCREENSHOTS`, edit
the `.pl` half in the same commit.** `docs/how-to/translate-a-document.md` carries the
vocabulary to match — the product already speaks Polish in `web/app/src/lib/i18n/chrome.ts`,
and inventing a second word for a concept it already names is the thing that rule prevents.

---

## What not to assume

- **That there is a credential to use.** Nothing in this repository holds one, by design. An
  agent that needs one needs a different design.
- **That a warning suppression is an oversight.** `ASPIRE010` and `ASPIREJAVASCRIPT001` are
  suppressed in `src/AbOvo.AppHost/AbOvo.AppHost.csproj` with the reasoning beside them.
  Read it before removing either.
- **That the repository name is the system name.** The repository is `ab-ove` and the system
  is `ab-ovo`; the rename is coming and every derived name is already `ab-ovo`
  ([ADR-0005](docs/adr/0005-slug-ab-ovo.md)). Do not "fix" a document by changing `ab-ovo`
  to `ab-ove`.
- **That a version pin is neglect.** `eslint` is held at 9.x and `authservice` at `v0.3.1`,
  and both pins carry their reasoning at the pin. Moving either is a decision, not an
  update.
