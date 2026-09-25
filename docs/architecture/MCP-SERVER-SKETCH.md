# The MCP server — a sketch, and what is built so far

**Status: a sketch with a working core.** `web/mcp` builds, typechecks and passes its unit
tier; it speaks MCP over stdio against a checkout, serving the real forty-seven-program
bundle compiled at the pinned revision. **Nothing is deployed** (AGENTS.md #2), and there is
no HTTP transport and no OAuth.

---

## 1. Why this exists

The reading surface asks a reader to come to `ab-ovo`. This asks nothing: it goes to where
readers already are — Claude, ChatGPT, any MCP host — and serves the book there.

That is a distribution argument and it is the whole of the case. It is worth writing down
that it *beat* the argument against, because the argument against is the one this estate
would normally win with: a model that can fetch frames can read ahead, and reading ahead is
the one thing the book's front matter calls non-negotiable — *"Break it and the book
degenerates into a mediocre collection of worked examples."*

What changed is §2. The reveal stopped being a request in a tool description and became an
arithmetic property, at which point the book's own criterion is met as written.
`notes/10-learning-app.md` §1.1 in the book states that criterion and it names a **medium**,
not a platform:

> The single largest gain available to the book is a medium in which the next frame is not
> visible until the reader has committed an answer.

A server that cannot emit an unreached step is such a medium.

---

## 2. The gate, which is the whole design

`web/mcp/src/reveal.ts`, and it is one rule:

> Step `k` of a unit is served if and only if `k <= ` the reader's furthest step, and the
> only thing that raises the furthest step is submitting an answer.

It works because of what `answer` is. `content-schema.v1.json` defines it as *"THE OPENING
OF THIS STEP, WHICH ANSWERS THE PREVIOUS ONE"* — so the answer to step `k` is not on step
`k`, it is on step `k+1`, and there is nowhere else it lives. **Refusing to select step
`k+1` refuses the answer to step `k` as arithmetic, not as filtering.** There is no field to
strip, because the object carrying it was never chosen.

The ceiling is `ReaderProgress.Step`, the row the reading surface already writes. ADR-0019
makes it monotone — a write carrying a lower step does not lower it — which is what stops a
stale client rewinding a reader and re-exposing an answer they had already earned past.
**That dependency is load-bearing:** if furthest-wins ever became last-write-wins, this gate
silently stops holding. `web/mcp/src/cursor.test.ts` asserts the rule here too, so the
coupling fails loudly rather than quietly.

### Two answer-bearing fields the gate does NOT govern

Schema v2 added `Route.answer` — Appendix A's answer to a quiz question — and
`Exercise.answer`, required on every Test exercise and Further problem. Neither is a step,
so `reveal.ts` says nothing about either: they are answers to work the reader has not done,
and whether they escape is a property of **this tool surface alone**.

The surface emits neither, and that is asserted rather than believed. `tools.test.ts`
collects every answer-bearing text in the bundle — steps, routes and exercises — and checks
the non-step ones never appear at any cursor position. The unit tier runs against the **v2**
fixture for exactly this reason: the v1 fixture carries neither field, so a leak test
written against it would pass by having nothing to leak.

Watched failing: making `render()` emit the unit's exercise answers turns that test red and
only that test.

### Why this is not the DOM assertion wearing a new hat

The acceptance suite asserts the answer is absent **from the DOM**. This transport has no
DOM, so that assertion would have stayed green while the property did not apply here at all
— the same shape of failure `docs/ux/UI-UX.md` refuses a service worker for. The replacement
is `reveal.test.ts` and `tools.test.ts`, and both were **watched failing**: deleting the
`n > cursor.step` branch turns the gate tests red, including one asserting a specific answer
string never appears in any tool's output, and the whole-surface property test that walks
the program and checks every tool at every cursor position.

The fixture's own answers are asserted present before their absence is asserted, which is
`lab/tools/labcheck.py`'s rule in the book one artefact over: *a check that passes on an
empty file is not a check*.

---

## 3. The tool surface

`web/mcp/src/tools.ts`. Five tools; only one of them moves.

| Tool | Moves? | What it does |
| --- | --- | --- |
| `list_programs` | no | Tracks and editions; by title in one edition, the programs the reader has a place in, those open now and the one that opens next, with each run of shut programs folded into a line (`all: true` names every one) |
| `open_program` | no | Start or resume, in the edition asked for, the one the program was read in, or the one the reader reads in; returns the step they are on. Refuses a program the reader has not reached |
| `current_step` | no | Re-show the current step without reconstructing it from chat |
| `submit_answer` | **yes** | Records the answer to the step it names, returns the next step — which opens with the book's answer to the one just done |
| `review_step` | no | An earlier step, refused beyond the furthest |

**There is no tool that takes an arbitrary step number and returns it.** `review_step` takes
one and runs it through the same gate.

**There are two gates, and the second one is the book's order**
([ADR-0056](../adr/0056-the-reading-order-is-gated-on-every-surface-and-every-refusal-says-what-opens-it.md),
amending [ADR-0051](../adr/0051-a-program-opens-when-the-one-before-it-has-been-opened.md),
which left this server ungated). A program is shut until the reader has a place in the one
before it — one step of it is enough — and the rule is `isOpenWhere` in
`@ab-ovo/web-kit`, the same function the reading surface calls, over the same
`ReaderProgress` row this server's cursor store already is. Before, the two surfaces
disagreed about one reader's doors and neither could explain the other.

`open_program` refuses a shut program **before** it asks which edition to read, so the
model does not spend the reader's answer on a question that leads nowhere; `current_step`,
`submit_answer` and `review_step` say the same thing rather than advising an
`open_program` that is itself refused; `list_programs` marks a program `open to the
reader now` or `SHUT, opens after F01` and states the rule once per track. Two cursor
reads at most, never a scan, because the rule asks about this program and the one before
it and about nothing else.

**`list_programs` says what is open in a few lines.** For a new reader it used to be about
7 KB (measured 2026-09-24): every unopened program with its title in both editions, and
`SHUT, opens after …` once for each shut program — paid again by the agent every time it
re-checked. It now names every program the reader can act on — the ones with a place, the
ones open now, and the one that opens next — and folds each run of shut programs behind
that into one line per group, such as `F03–F13 — 11 programs, shut: each opens after the one
before it`. The grouping by part or prefix and the rule stated once per track are kept.
Titles are in one edition: the reader's (`CursorStore.edition()`), or English until they
have one, which is the website's default (ADR-0052). `language` gives the other edition, and
`all: true` names every program. The `read` prompt's completions list every id regardless.
`tools.test.ts` holds a new reader's list, on a track the size of the book, to 1.5 KiB with
the in-memory note included.

**The refusal is a refusal and not an error** — `refused`, not `problem`, on `reveal.ts`'s
own reasoning about `not-reached` — and it names the program that opens this one, says one
step of it is enough, and says plainly that nothing is hidden or paid for. That last
clause is for the model: a tool description is a request and not a rule, so the sentence,
`SERVER_INSTRUCTIONS` §8, `open_program`'s description and the `read` prompt all say it,
and none of them can stop an assistant reporting a reading order as a fault.

**Every step says where it is.** A rendered step opens with what the reading surface's top
bar and pager say, in one line, one transport over — `P01 · How a computer stores a number ›
Scientific notation · step 5 of 48` — and the banner that follows names the step it answers. The first version printed a
number and no name, and `list_programs` printed ids: a reader thirty steps in had nothing to
call the program, and a reader choosing one had nothing to choose by. The reader-facing
closing line names no tool; the assistant has the tool's own description for that.

**Fewer arguments, and none whose answer is discarded.** `track` may be left out when the
server carries one track, which `list_programs` shows; a program id matches in any case and
is filed under the bundle's own spelling. `language` may be left out to resume; a different
edition on resume switches, keeps the step (frame-for-frame parity is what makes that safe)
and says so. The first version required the edition on every call and then discarded it
whenever a place existed, so the model asked a question whose answer went nowhere.

**The edition is asked once per reader, not once per program.** The second version still
needed `language` at the first opening of *every* program, and refused without it with
`isError`: an agent asked "English or Polish?" at the start of each program, and the host
painted an ordinary step of the conversation red — the mistake ADR-0056 corrected for
refusals. The website keeps one edition per reader
([ADR-0052](../adr/0052-one-language-control-remembered-and-english-by-default.md));
`CursorStore.edition()` reads the same thing. The API store asks
`GET /api/v1/preferences/language`, and when the reader never chose there, takes the edition
of their most recent place by `updatedAt`. The memory store, with no account, has only the
most recent place. A new program starts in that edition, and the result says so. Only a
reader with no edition anywhere is asked, as an ordinary result naming each edition by the
track's own title in it. On a host that supports elicitation, the reader picks from the
track's editions as an enum, the way `submit_answer` asks for an answer (ADR-0054). Nothing
here writes the preference: choosing the website's language is the website's control. An
edition the track does not have is still an error, because it names nothing.

**The service keeps its edition on a tie, so the API store keeps the switch.** A write at
the same step is answered with the account's edition (`ProgressEndpoints`, and
`reconcile.ts` in the reading surface says why: *"frame 40, in Polish"* is one fact). The
surface has no problem with that because the edition it shows is in the URL; here it is in
the cursor. So `ApiCursorStore` keeps a switch made on the current step in the process, for
that step only, writes it to the account with the next step, and drops it the moment the
account's step moves past — another machine reading on, whose edition travels with its step.

**The sentences around a step are English in every edition.** The place line's *step n of
N*, the answer banner and the closing line are the server's, not the book's, and they have
one language; the step itself is in the reader's edition. The host's model relays them. A
table like the reading surface's `chrome.ts` is the fix, when a reader of the Polish edition
asks for it.

**Finishing a program is a hand-off, not an error and not a dead end.** The last
`submit_answer` used to be refused as `program-complete`, and a reader who had worked
forty-eight steps was told the server had failed and given nowhere to go. It now records the
answer and returns the reading surface's `/summary`, one transport over: the book's own
Summary and *Can you?* — the routes' **labels only**, never `route.answer`, because a label
may name the skill and may not carry the finding — and the next program, found by adjacency
in the manifest, with the `open_program` call that opens it. The cursor does not move.
`open_program` on a finished program shows the last step and the same block; `list_programs`
says *finished*. The leak walk in `tools.test.ts` covers the block at every cursor, and a
two-program bundle walks the next-program branch with its answers in the off-limits set.

**`submit_answer` names the step it answers, so a retry cannot advance twice.** A host that
timed out and called again used to move the reader two steps: the skipped step's body was
never shown while its answer arrived in the next banner. A submit for a step the reader is
no longer on records nothing and hands back the step they are on — an ordinary result. A
step with no cue asks nothing, and needs no answer to go on from; the first version demanded
one there too, so the assistant invented a word or put a question nobody had asked.

**A refusal by the gate is an ordinary result, not an error.** `reveal.ts` said from the
start that `not-reached` "is NOT an error — it is the product working", and the first tool
layer sent it with `isError: true` anyway, along with a finished program; a host paints that
red and a model apologises for it. Now only an argument that names nothing — a track, a
program, an edition or a step number the book does not have, an empty answer to a step that
asked for one — is an error, beside the two failures of the deployment described next: no
book, and a place out of reach. The gate's sentence and the end of a program travel as
results.

**A deployment with no book answers with the fix.** The loader's throw for a bundle that was
never fetched used to reach the host as a JSON-RPC error on the reader's first call, carrying
a developer's message. `content.ts` wraps it at the one crossing as `ContentUnavailable`, and
`handle()` answers it with `noContentNote`: the paths it looked at, and the fix for the case
it is in — never fetched into this checkout (run the fetch script, from the root it names),
pointed by `AB_OVO_CONTENT_BUNDLE` at a file that is not there (correct the variable), or
found and refused by the validator (not "missing", and the loader's message follows).

**A place that cannot be reached answers with what fixes it.** With the API store, a
non-2xx answer used to throw a bare `Error` and a rejected `fetch` passed straight through;
both reached the host as `MCP error -32603` carrying `progress read failed: 401` or
`fetch failed`. `ApiCursorStore` now throws `PlaceUnavailable` with a reason —
`unauthorised`, `unreachable` or `refused` — and `handle()` answers it beside
`ContentUnavailable`, as a result with `isError`: nothing is lost, a failed write recorded
nothing and is safe to repeat, and the fix for that reason (a fresh token, a moment, or the
address). The gate's refusals are untouched. Anything else `handle()` cannot name still
throws, because a sentence would dress a defect in this package up as the deployment's.

**A place kept in memory is said in the results.** `server.ts` warned on stderr, which no
reader of a host sees; `list_programs` and `open_program` now carry the same sentence, so
the reader learns it before losing their place rather than by losing it.

**Every tool carries its annotations, and there is a prompt.** A host that has not been
told a tool is read-only asks the reader's permission for it, so a re-read cost a prompt
three times a frame and the gate's own refusal looked like the server asking to do
something. `list_programs`, `current_step` and `review_step` say `readOnlyHint`;
`open_program` and `submit_answer` say they write, never destroy, and are idempotent — the
last because a submit names its step, so a retry records nothing. Hints, not gates: the
spec says so, and every one is true of the code rather than of a wish. A host surfaces a
server's prompts as menu entries, which is the only way a reader who does not know the tool
names finds the way in: the one prompt, `read`, states the method in the reader's voice and
then asks for `list_programs` or `open_program`, and its `program` argument completes to
the ids (`completion/complete`), because a completion value is what the host inserts and
the titles are in the list. Registered on the low-level `Server`, with `prompts` and
`completions` declared as capabilities — the SDK refuses a handler for an undeclared one at
start-up. `prompts.ts` is the logic; `server.test.ts` drives it over an in-memory transport.

### The answer contract, and what it can and cannot do

The tool description carries the format rule the host's model reads: `answer` is the
reader's own text, verbatim, any language, any shape, nothing parsed; not composed, not
corrected, not completed; ask the reader rather than filling it in; *"I don't know"* is a
real answer and passes through unchanged.

**That contract is prose, and prose is a request.** ADR-0009 draws the line this estate
works to — *"an anti-goal that exists only as prose is a request; one the architecture
cannot express is a rule."* No gate can decide whether the answer that arrived is the
reader's, because the model fills the argument. Two things sit under it, and they are not
the same shape of thing: the server instructions state the method before any tool is
called, which is still prose; and, where the host supports it, MCP elicitation puts the
argument in front of the reader directly and records what comes back from *that* instead —
which is the gate the paragraph above says nothing can be, on the one transport where a
form can stand between the model's claim and the record.
[ADR-0054](../adr/0054-submit-answer-elicits-the-reader-before-it-trusts-the-argument.md) is
that decision.

**On a host that does not support elicitation, the limit is exactly what it was.**
`submit_answer` **echoes back what it recorded**, so a reader who was answered *for* can see
that they were — a narrowing, not a fix, and the honest floor under every host regardless of
what it can ask its reader directly.

`ANSWER_CONTRACT` and `SERVER_INSTRUCTIONS` are constants asserted by the unit tier — the
nearest thing a prose contract can have to a gate, and still the whole of the protection on
a host with no elicitation to fall through to.

---

## 4. Transport and identity — the part that is NOT built

Today: **stdio**, one process, one reader, token from the environment. That is enough to run
it against a checkout and to have exercised every tool over the real protocol.

The shape a stranger on claude.ai or ChatGPT connects to is **Streamable HTTP with OAuth**,
and it is deliberately a separate commit:

- the token must arrive **per call**, not from the environment. `ApiCursorStore` already
  takes a `() => string` rather than holding one, for exactly this reason: a field would be
  one reader's bearer answering another reader's request;
- `authservice` is adopted, pinned at a published image (ADR-0004), and whether it can act
  as an OAuth provider for a third-party MCP host is an open question, not an assumption;
- a deployed server is a fifth Fly app in a topology none of whose `fly.toml` files has ever
  been applied, and it needs its own address row in `flyio/README.md`.

---

## 5. What it deliberately does not do

**No exercise checking.** The labs are Python under Pyodide in the reader's browser
(ADR-0007). Moving them server-side is a different decision with its own ADR. A step that
carries a `check` says so and names it; the reading surface runs it.

**No outcomes, at all.** This is the cut that matters most, and it protects the thing the
instrument exists for. A cursor has the reader's identity by construction; `FrameOutcome`
must not have it, and ADR-0020 forbids any aggregate touching the progress store. Consent is
local-first and versioned (ADR-0022) and an MCP host has no `localStorage` to hold it. So
this server records nothing an instrument could read, and closing that gap is its own
design problem rather than a line of code.

**No answers persisted, and no verdict.** What the reader wrote is echoed and dropped.

This is narrower than the reading surface, and [ADR-0039](../adr/0039-a-frame-accepts-the-readers-answer-as-a-commitment.md)
is the decision to read it against. That ADR splits the answer line into two things: the
**commitment** — the reader writes before the reveal — and the **worksheet**, the stored
text plus one flag saying it was committed before the reveal.

This transport implements the commitment and not the worksheet. The commitment is what the
gate is: `submit_answer` is the only thing that advances and it requires the reader's text.
The worksheet it does not keep, because `ReaderProgress` holds a place and not a history,
and ADR-0039's store is the reader's own local one — which an MCP host does not have. A
reader who works some frames here and some in the browser will find their place synchronised
and their written lines only in the browser. That is a real gap, named rather than papered
over.

On verdicts, ADR-0039 is a **ceiling and not a floor**: *"The machine may say 'matches the
book'. It may never say anything else."* This server says nothing at all, which is inside
it. Saying "matches" here would need the normalised `data-book-number` the surface renders on
frame n+1, and the hand-reviewed verdict-able fixture that ADR-0039 requires a person to
re-read when a bundle bump moves a frame in or out of it.

**No database access.** `AbOvo.Api` registers `ReaderScopedQueries`, which throws on a query
over `ReaderProgress` that does not pin one `Subject`. A client with its own connection
would be a second, unguarded door past a guard that would still be green.

---

## 6. `@ab-ovo/web-kit` — the exit condition, discharged

This section used to record why the kit was not created yet and what would trigger it. The
trigger fired — `reveal.ts` took a second import from `@ab-ovo/app` beside `content.ts`'s
existing one — and
[ADR-0053](../adr/0053-the-web-kit-package-is-extracted-on-its-own-exit-condition.md) is the
record of the extraction itself: what moved (`bundle.ts`, `schema.ts`, `validate.ts`,
`have-bundle.ts`), what stayed in `@ab-ovo/app` and why, and what verified that nothing's
behaviour changed.

**What is true now, for a reader of this file rather than of the ADR:** this package depends
on `@ab-ovo/web-kit` as an ordinary workspace package. `content.ts` still exists and still
does real work — `BundleSource`, `ContentUnavailable`, `fixtureBundles()` — but its
specifiers at the top now name `@ab-ovo/web-kit` rather than a relative path three
directories up, and `reveal.ts` / `reveal.test.ts` import their types from the same place.
Nothing else in this package reaches into `@ab-ovo/app` any more, and nothing needs to.

---

## 7. Follow-ups, named rather than implied

- **Lint.** `@ab-ovo/mcp` declares no `lint` script, so `pnpm -r lint` skips it. A stub that
  echoed would be TESTING-STRATEGY.md §9's defect — green forever, proving nothing. A flat
  ESLint config is a follow-up with its own dependency decision; `eslint-config-next` is
  Next's and not this package's.
- **Concurrency.** `MemoryCursorStore` has no locking. Over stdio a host waits for each
  result, so it does not arise; a deployed server should not rely on that.
- **The licence.** Serving the book's prose through third-party hosts is a redistribution
  question and it is the book's to answer, not this repository's (ADR-0033). The book's
  `LICENSE-CONTENT` still carries its undecided block, and neither of its licence files
  names `lab/` or `figures/values/`.
- **Schema version.** The book's compiler at the pinned revision emits a v1 bundle; the
  application supports v1 and v2. Nothing here depends on the difference — `Step.answer`
  means the same in both — but the leak assertion above needs a v2 shape, which is why the
  unit tier reads the v2 fixture rather than what `bundleFor()` currently serves.

---

## 8. Verifying what is here

```bash
pnpm --dir web install
pnpm --dir web -r typecheck
pnpm --dir web -r test
```

The unit tier needs no network, no database and no deployment: the gate is pure functions
and the tool surface runs against the committed fixture through an in-memory cursor (P13 —
test at the layer with the logic), and `server.test.ts` drives the protocol itself —
tools, annotations, the prompt, completions — over `InMemoryTransport`. The fixture is **injected**, not fetched — `Deps.bundles`
is a `BundleSource`, because `bundleFor()` deliberately never serves a fixture and throws
when the compiled bundle has not been fetched. `bash scripts/fetch-book-content.sh` is what
the running server needs; the tests do not.

To drive the real protocol over stdio:

```bash
node web/mcp/bin/ab-ovo-mcp.mjs
```

The launcher is plain JavaScript that checks for Node 22.18 before importing the
TypeScript server, because the Node that cannot strip types cannot be told so by a file it
cannot parse; `web/mcp/README.md` has the host configuration. With neither
`AB_OVO_API_URL` nor `AB_OVO_READER_TOKEN` set it keeps the reader's place in memory and
says so — on stderr, and in every result that shows a place.

**It can be started from any working directory**, which is what a host does. The book is
looked for in the server's own checkout, not relative to where the process was started:
`content.ts` finds `web/` from its own `import.meta.url` — reliable here because Node runs
this package's source directly — and hands it to `@ab-ovo/web-kit`'s `bundleFor`, which then
tries `AB_OVO_CONTENT_BUNDLE` and that one path and guesses nothing. Before, the loader's
guesses were all relative to the working directory, and a host that started the server from
`/` was told there was no book while it sat in the checkout. `@ab-ovo/app` passes no
`web/` — its bundled server code cannot know its own place on disk — so its candidates, and
its Docker image, are unchanged. `bundle.test.ts` asserts the loader's half from a scratch
directory; `content.test.ts` asserts that the live source names this checkout and finds the
book from outside it. To see it the way a host does:

```bash
cd / && node /absolute/path/to/ab-ovo/web/mcp/bin/ab-ovo-mcp.mjs
```
