# Tutorial 1 — your first run

**What you will have at the end:** ab-ovo running on your own machine, serving the whole
book, with a frame open in front of you that has asked you a question and is refusing to
answer it.

**How long:** about twenty minutes, most of it waiting for a build.

**What you need:** a clone of this repository, and nothing else. No account, no credential,
no service, no key. That is not a convenience — it is a property of the product, and by the
end of this tutorial you will have seen it.

> **Wersja polska:** [`01-first-run.pl.md`](01-first-run.pl.md)

---

## Step 1 — find out what your machine is missing

```bash
bash scripts/setup.sh --check
```

This changes nothing. It reports what is absent and where to get it. Read the output before
installing anything: it names each prerequisite with an install pointer, so you do not have to
guess a version.

Then run the real thing:

```bash
bash scripts/setup.sh
```

Four numbered steps: check the prerequisites, initialise the **local** secret store, generate
the one mandatory secret, then offer each optional integration as a labelled step you may
skip. Skipping every optional step is a supported outcome — the mandatory steps are enough for
everything below.

**No secret ever lands in the working tree.** Step 2 initialises `dotnet user-secrets`;
`secrets.env.example` names every variable and contains no values.

## Step 2 — fetch the book

```bash
bash scripts/fetch-book-content.sh
```

This is the step people miss, and the failure it produces does not look like a missing step
(#75). `web/content/` is **derived, not committed** — the book is a separate repository,
pinned by commit, and this script fetches its lab engine file by file, verifying a digest on
each one, then compiles the book's 47 programs into a content bundle using the book's own
compiler ([ADR-0008](../adr/0008-content-is-a-versioned-bundle.md),
[ADR-0038](../adr/0038-the-bundle-is-compiled-at-a-pinned-revision.md)).

You will see a line per file ending in `ok`, then a compile summary. Run it again any time to
re-verify what is on disk; it is idempotent.

> **If a digest does not match**, somebody hand-edited a fetched file. That is what the digest
> is for. Delete `web/content/` and run the script again.

## Step 3 — run it

```bash
dotnet run --project src/AbOvo.AppHost
```

The AppHost is the **development** composition root (P1): it brings up Postgres, the identity
service container, the API and the web app together, and prints a dashboard URL. It is not the
deployed topology and it never will be — see [tutorial 3](03-contribute-a-change.md) and
[`../DIAGRAMS.md`](../DIAGRAMS.md) §D2.

Open <http://localhost:3000>.

If you would rather not run .NET at all, the reader surface needs none of it:

```bash
pnpm --dir web install
pnpm --dir web build
pnpm --dir web start
```

That serves the same site with no API, no database and no identity service behind it — which
is the point of the next step.

## Step 4 — watch the product refuse to tell you something

You are looking at the index of programs. Pick **F01 — Numbers, powers and roots**, and read
to frame 3.

![A frame of program F01, asking the reader to write down the decimal expansion of one third, with a dotted answer line below it and a "Reveal the answer" button.](../assets/screenshots/frame-asks-english.png)

Frame 3 tells you what a rational number is and then asks you to write down the decimal
expansion of ⅓. Below the question is a dotted line that says *write it down before you read
on*.

Now do the thing you would do with any other web page: open your browser's inspector and
search the document for the answer.

**It is not there.** Not in an element, not in an attribute, not in a script tag, not in a
prefetch. There is nothing to find, because the answer to the frame you are on is rendered by
the request for the *next* frame and by nothing before it. The reveal is a navigation, not a
toggle ([ADR-0014](../adr/0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md)).

Press <kbd>→</kbd>, or click **Reveal the answer**.

![The next frame, which opens with "0.333…, repeating without end".](../assets/screenshots/frame-reveals-english.png)

Frame 4 opens with the answer you were supposed to have written. That is the book's own
mechanism, and making it structural rather than a hidden element is the reason this product
exists at all.

## Step 5 — turn everything off and keep reading

Stop the AppHost. Stop the API. Stop the database.

Reload the frame.

**Nothing changes.** The frames are served with the site as a versioned bundle, and everything
you write on a frame stays in your browser
([ADR-0039](../adr/0039-a-frame-accepts-the-readers-answer-as-a-commitment.md)). The reader
loop is required to work with no account and no backend, and a screen in it that could not
render without a fetch would be a defect rather than a loading state.

Try the rest of it while the backend is off:

- Open `Working` under the answer line — a pad that evaluates arithmetic. A calculator,
  deliberately not a computer algebra system
  ([ADR-0042](../adr/0042-the-evaluator-is-a-calculator-not-a-cas.md)).
- Open `Sketch` — a canvas that takes strokes and never opens itself
  ([ADR-0043](../adr/0043-a-sketch-is-strokes-and-the-pane-never-opens-itself.md)).
- Switch the edition in the place row. The same frame, in Polish, keeping your frame number.
- Press <kbd>g</kbd> and type a frame number.

## What you have seen

| Claim | Where you saw it |
| --- | --- |
| The answer is absent rather than hidden | Step 4, in the inspector |
| The reader loop needs no account and no backend | Step 5, with everything stopped |
| The book is content, not source, and is pinned | Step 2, one digest per file |
| The edition is the reader's choice, never guessed | Step 5, the place row |

## Where to go next

- [**Tutorial 2 — read a program the way it was meant to be read**](02-read-a-program.md), if
  you want to understand the product rather than the repository.
- [**Tutorial 3 — contribute a change**](03-contribute-a-change.md), if you want to make one.
- [`../START-HERE.md`](../START-HERE.md) routes you to everything else.
