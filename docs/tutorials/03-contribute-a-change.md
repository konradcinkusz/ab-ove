# Tutorial 3 — contribute a change

**What you will have at the end:** a change that passes every gate this repository has, and
first-hand experience of two of those gates refusing something — which is the part you cannot
get from reading about them.

**How long:** about thirty minutes.

**What you need:** [tutorial 1](01-first-run.md) finished, so the book is fetched and the
build works.

> **Wersja polska:** [`03-contribute-a-change.pl.md`](03-contribute-a-change.pl.md)

---

## Step 1 — run what CI runs, before you change anything

Do this first, on a clean tree. If something is red now, you want to know it was red before you
touched it.

```bash
dotnet build AbOvo.sln -warnaserror    # warnings are errors, here and in Directory.Build.props
dotnet test AbOvo.sln                  # unit, in-memory integration, and the architecture rules
pnpm --dir web lint
pnpm --dir web typecheck                # tsc over every workspace member, not just what a route reaches
pnpm --dir web build
bash scripts/scan-secrets.sh --staged   # what the pre-commit hook runs
```

The whole set is fast enough that guessing which part your change affects is not worth it.

The distinction that catches people: **the API does not need the book; its tests do.**
`Instrument/Proportion.cs` holds a constant transcribed from the book, so the service runs on a
bare clone while the test that checks that transcription throws on the missing source file.

## Step 2 — watch the architecture rules refuse something

This is the fastest way to understand what the shared kernel is, and it takes one edit you are
about to undo.

Open `src/AbOvo.ServiceDefaults/Extensions.cs` and add a reference to `AbOvo.Api` — any using
directive that reaches into it will do. Then:

```bash
dotnet test AbOvo.sln --filter ArchitectureTests
```

It goes red, and it tells you why. `src/AbOvo.ServiceDefaults` is the shared kernel (P2):
cross-cutting plumbing only, no business entity, no DTO, no enum, no seed data, no
user-facing string. Prose has already failed twice in this estate — a `.Core` library that
began as shared plumbing and ended as a shared domain — so the rule is a test rather than a
convention:

- the kernel may not reference `AbOvo.Api` or `AbOvo.Contracts`;
- it may not declare a `DbContext`;
- it may not export a public unsealed class to inherit from (P10).

Undo the edit. There is a second, weaker gate beside it — `ci.yml`'s `kernel-size` job, a
ceiling on the kernel's **code** lines ([ADR-0011](../adr/0011-kernel-size-gate-counts-code-lines.md)).
It counts code rather than raw lines precisely so the reasoning P14 asks for is free, which is
why **you never resolve a size failure by deleting comments**.

## Step 3 — watch the instrument refuse to learn about a reader

Open `src/AbOvo.Api/Persistence/FrameOutcome.cs` and add a column — `ReaderId`, a timestamp,
anything. Then:

```bash
dotnet test AbOvo.sln --filter OutcomeIsNotAReader
```

Red, and this is the rule the whole product is arranged around
([ADR-0009](../adr/0009-the-instrument-measures-the-book.md)):

> **ab-ovo measures the book, never the reader.**

Three mechanical things hold it, and each was watched refusing something before it was
believed:

1. **Closed column lists.** `Count` must be the only column outside the key, so no row can
   belong to one run.
2. **Every key and index leads with the bundle tag**, so the cheapest aggregate in the schema
   is not *this frame, across every version* — the query that would make the ledger lie about
   a frame somebody has already fixed.
3. **`BundlePinnedQueries` refuses a query that spans texts** before EF compiles it, and
   `ReaderScopedQueries` does the mirror image over the progress store.

Undo the edit. [`../DIAGRAMS.md`](../DIAGRAMS.md) §A5 and §C4 draw both.

## Step 4 — make the change, and its documentation, in one commit

That is P14, and it is the rule this repository is most often judged by.

- **A comment cites the principle or guide section it exists to satisfy.** A rule with no
  citation is somebody's taste, and the next reader cannot tell the two apart.
- **A decision gets an ADR** — [`../adr/`](../adr/), from
  [`0000-template.md`](../adr/0000-template.md): Status / Context / Decision / Consequences.
  Short. Consequences is the heading people skip and the one that makes the record worth
  keeping.
- **A departure from the constitution gets a row in the deviation register**
  ([`../architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md)), with a date, a
  reason and an **exit condition**. A deviation with no stated way out is a drift.
- **Do not state a count of occurrences.** "The only place we do X", "three rigour boxes",
  "fourteen instances" — a tally decays silently and nothing can check it. Name the rule and
  the places it is lifted.
- **Before writing a sentence about another file, open that file.** Most stale documentation in
  this estate is a confident sentence about a neighbour written from memory.

If your change touches anything under [`../tutorials/`](.), [`../how-to/`](../how-to/), or the
documents listed in `scripts/check-doc-parity.mjs`, **the Polish half moves in the same
commit** — see [`../how-to/translate-a-document.md`](../how-to/translate-a-document.md). A
translation that drifts is worse than no translation, because the reader trusts it.

## Step 5 — check the documentation the way CI will

```bash
npm install          # the docs tooling; separate from web/, on purpose
npm run lint:docs    # markdownlint, links, diagram pairing, and EN/PL parity
```

If you added or changed a diagram,
[`../how-to/add-a-diagram.md`](../how-to/add-a-diagram.md) is the recipe; if you changed a
screen, [`../how-to/capture-the-screenshots.md`](../how-to/capture-the-screenshots.md) is how
the pictures get retaken.

## Step 6 — the acceptance suite, if you touched a screen

```bash
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers      # explicit; no install-time browser download
pnpm --dir tests/e2e run test:smoke
```

Two properties of the gates are worth knowing before you try to satisfy one:

- **A guard here fails; it never skips.** `ci.yml`'s e2e job fails when the suite is absent,
  because a green run that tested nothing is the failure the suite exists to prevent. Do not
  "fix" a red guard by making it conditional.
- **An unreferenced test entry point is documentation that lies.** Do not add a script, a
  browser project or a lint configuration that no CI context executes.

## Where to go next

- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — the process around the change.
- [`../../AGENTS.md`](../../AGENTS.md) — the same ground, written for an automated contributor,
  including the nine things most likely to be got wrong.
- [`../architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md) — this repository
  walked against the constitution, P1 to P15, with its deviations and its known gaps.
