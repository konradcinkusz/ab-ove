# ADR-0007: The exercise checks are Python, run in the reader's browser under Pyodide

## Status

**Accepted.** Date: 2026-09-14.

## Context

The book ships computer exercises, and they are Python — that is a property of the book, not
a choice this repository gets to make. Every expected value in them is a number the book
itself prints, so the exercises and the text cannot drift apart.

The product's first requirement is that **the reader loop works with no account and no
backend**. A server-side runner would make the lab pane the one part of the loop that needs a
deployment, on the phase that is meant to ship first.

And running reader-supplied code server-side is a sandboxing problem with a long history of
being got wrong. The cheapest way to be safe from arbitrary code execution is to have no path
by which arbitrary code reaches a server.

**Python appears nowhere in the standards**, which is the honest starting position for this
record rather than something to work around quietly.

## Decision

The exercises are Python, and their checks **run client-side under Pyodide**, in the reader's
browser. No reader-supplied code is executed on any server this estate operates.

A check compares **strings, never floats** — the formatted value against the expected string
the book committed — because two numbers are the same number only if they print the same way,
and a float comparison introduces a tolerance nobody chose.

A failed check names **the frames to re-read**, never the solution. The message is the
covered answer box: the whole mechanism of the book is that the reader commits an answer
before seeing one.

## Consequences

**Pyodide is a large download** — a WebAssembly Python runtime, megabytes of it — and it is
loaded lazily, only when a reader opens the lab pane. A reader who never opens it never pays
for it. That is a real constraint on where the lab pane can appear in the UI and it is
recorded in [`docs/ux/UI-UX.md`](../ux/UI-UX.md).

### What it costs, measured in a browser

This paragraph said "megabytes of it" and stopped, and the book's own risk register put the
figure at about 10 MB and said it would be measured on the first e2e run. It is measured now.

`tests/e2e/specs/runtime-cost.spec.ts` drives the same `/lab/p01` journey the acceptance
suite already drives, in the same Chromium and against the same production build, and reads
the instruments while it goes. **Every figure below names the machine that produced it**,
because a figure with no machine beside it can be neither reproduced nor falsified — and
because the same source on a slower device or a real link gives different answers for
reasons that are not about this decision.

**Machine A, 19 September 2026** — the container this was taken in: headless Chromium
141.0.7390.37, four vCPUs (Intel Xeon @ 2.10 GHz), 15 GiB RAM, Ubuntu 24.04, Playwright
1.63.0 driving `next start` over loopback, `pyodide` pinned at 314.0.7, one worker, eight
runs. The byte figures were identical on every run; the times are the full range across
them, ends included rather than trimmed, because the spread is a property of the machine
and hiding it would make the figures look more transferable than they are.

| | first visit | second visit |
|---|---|---|
| bytes over the wire, encoded bodies | 6,623,991 | 2,325 |
| of which `public/pyodide/` | 6,443,505 | 0 |
| requests | 27, all 200 | 27, all 200, none with a body |
| the browser's own `transferSize`, bodies and headers | 6,630,422 | 7,081 |
| navigation start until the Check button enables | 2.08–2.43 s | 1.75–2.02 s |
| a session's first check run, click until the SUMMARY line is on the page | 0.047–0.075 s | — |
| a repeat check run | 0.013–0.014 s | — |

**The total moves with the app and the runtime's share does not.** Taken again over three
builds of this tree while other work landed, `public/pyodide/` came back at 6,443,505 bytes
every time and the total moved by a hundred or so, which is the page's own JavaScript being
rebuilt. Quote the runtime's row when the question is what Pyodide costs; quote the total
when the question is what the lab page costs, and re-measure it, because it is a figure
about a build rather than about this decision.

The runtime's own share of the first visit, file by file, as served and as stored:

| file | on the wire | in `public/` |
|---|---|---|
| `pyodide.asm.wasm` | 3,603,412, gzip | 9,598,218 |
| `python_stdlib.zip` | 2,545,637, as stored | 2,545,637 |
| `pyodide.asm.mjs` | 261,494, gzip | 1,250,344 |
| `pyodide-lock.json` | 25,748, gzip | 119,077 |
| `pyodide.mjs` | 7,214, gzip | 17,931 |

`pyodide.mjs.map` is staged and is not fetched, because nothing asks for a source map with
devtools closed. It is still worth staging, and the reason is at the file list in
`web/app/scripts/prepare-lab-assets.mjs`.

**What those numbers say that the estimate did not.**

The download is **nearer six megabytes than ten**, because everything but the standard library
compresses and the interpreter compresses hard — 9.6 MB of WebAssembly leaves as 3.6. The
corollary is the useful half: `python_stdlib.zip` is already compressed and is served as it
is stored, so a smaller first visit means **shipping less standard library**, never finding
a better encoding.

A **second visit costs about two kilobytes**. The assets are served with
`Cache-Control: public, max-age=0` and an ETag, and Chromium answered every `/pyodide/`
request from its own cache without a body. That header is `next start`'s default for
`public/`; a deployment could set another, and nothing is deployed yet (see the deployment
note in [`AGENTS.md`](../../AGENTS.md)), so it is a property of this build rather than a
promise about a reader.

**Caching the bytes does not buy back the boot.** A second visit transfers essentially
nothing and still spends about two seconds before the reader can press Check, so the boot is
dominated by instantiating WebAssembly and starting CPython rather than by the transfer.
The lazy load this paragraph already prescribes is therefore about the bytes *and* about a
cost that survives them.

**The machine moves the boot as much as the cache does.** Run at two workers on the same
four vCPUs, the first visit takes 2.81–2.91 s and a first check run 0.061–0.099 s. Contention
is worth as much as the whole warm-cache saving, which is the strongest reason not to read
any single one of these figures as "the" number.

**Machine B — Node, which is not a browser** — reported on issue #52: about 6 MB gzip, 2.7 s
to boot, and 0.14 s for both check passes, on the same Pyodide line with `check.py` and
`labkit.py` unchanged. **It is recorded here as the lower bound it is and is not adopted as
the browser's**: Node has no first-visit download at all and caches WebAssembly compilation
differently, so it cannot bound a reader's first visit from above. Where it does agree with
Machine A — the wire size, and a check run near a tenth of a second — it agrees because the
same files are being weighed and the same interpreter is running them, which is worth
knowing and is not a confirmation of the figure it cannot produce.

**What is not measured, and is not invented.** Nothing here contains a reader's download
time: the suite drives a server on loopback, so the first-visit figure is what the runtime
costs to instantiate with the bytes essentially free, and a reader pays the first-visit bytes
above divided by their own link on top of it. Measuring that needs either a throttled profile
in the acceptance suite or a deployed origin, and this record would rather say so than carry
a number nobody ran.

**Not every library the book's exercises use is available under Pyodide.** Pure Python and
the scientific packages Pyodide ships are; anything else is not, and an exercise that needs
one is an exercise that cannot be a lab exercise. That is a constraint on the *content*, and
it has to be checked per program rather than assumed.

**The reader's code never leaves the machine**, which removes a class of privacy question
rather than answering it — there is nothing to store, nothing to retain and nothing to
disclose. The consequence for the instrument is in
[ADR-0009](0009-the-instrument-measures-the-book.md): a check run reports its own outcome,
not its input.

This is a deviation, recorded with its exit condition in
[`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md): **the standards
evidence a browser-side runtime.** The blast radius is bounded by the browser's own sandbox —
Pyodide has no path to the API, the database or any credential, and nothing in P6's container
rules, P7's listener rules or P12's build rules is touched by it.
