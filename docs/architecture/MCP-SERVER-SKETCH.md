# The MCP server — a sketch, and what is built so far

**Status: a sketch with a working core.** `web/mcp` builds, typechecks and passes its unit
tier; it speaks MCP over stdio against a checkout. **Nothing is deployed** (AGENTS.md #2),
there is no HTTP transport and no OAuth, and the content it serves is still the fixture
bundle (ADR-0008's real one is blocked on the book publishing a release).

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
| `list_programs` | no | Tracks, programs, languages, and where the reader is in each |
| `open_program` | no | Start or resume; returns the step the reader is on |
| `current_step` | no | Re-show the current step without reconstructing it from chat |
| `submit_answer` | **yes** | Records the answer, returns the next step — which opens with the book's answer to the one just done |
| `review_step` | no | An earlier step, refused beyond the furthest |

**There is no tool that takes an arbitrary step number and returns it.** `review_step` takes
one and runs it through the same gate.

### The answer contract, and what it can and cannot do

The tool description carries the format rule the host's model reads: `answer` is the
reader's own text, verbatim, any language, any shape, nothing parsed; not composed, not
corrected, not completed; ask the reader rather than filling it in; *"I don't know"* is a
real answer and passes through unchanged.

**That contract is prose, and prose is a request.** ADR-0009 draws the line this estate
works to — *"an anti-goal that exists only as prose is a request; one the architecture
cannot express is a rule."* No gate can decide whether the answer that arrived is the
reader's, because the model fills the argument. So two things sit under it: the server
instructions state the method before any tool is called, and `submit_answer` **echoes back
what it recorded**, so a reader who was answered *for* can see that they were. That is a
narrowing, not a fix, and it is the honest limit of this design.

`ANSWER_CONTRACT` and `SERVER_INSTRUCTIONS` are constants asserted by the unit tier — the
nearest thing a prose contract can have to a gate.

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

**No answers persisted.** What the reader wrote is echoed and dropped. Keeping it would be
reader-generated content in a store built to hold a place and not a history —
`ReaderProgress` is documented as deliberately not an audit log.

**No database access.** `AbOvo.Api` registers `ReaderScopedQueries`, which throws on a query
over `ReaderProgress` that does not pin one `Subject`. A client with its own connection
would be a second, unguarded door past a guard that would still be green.

---

## 6. `@ab-ovo/web-kit` — the exit condition

The root `web/package.json` already records the rule: *"The @ab-ovo/web-kit package of §7 is
deliberately NOT here yet: the kit is what stops two apps diverging, so it is created when
the SECOND app arrives."*

**This is the second app, and the kit is not created here.** That is scope, not
disagreement: the content library is imported by app code, by
`web/app/scripts/prepare-lab-assets.mjs` (ADR-0032) and by the unit tier, so moving it is a
refactor with its own diff and its own review.

What is done instead is to make that refactor cheap and to make skipping it visible:
**exactly one file reaches across the boundary**, `web/mcp/src/content.ts`, which re-exports
what this package uses. The extraction redirects the specifiers in that file and touches
nothing else here.

**Exit condition:** the kit is extracted before a third consumer of the content library
exists, or before anything in `web/mcp` needs a second import from `@ab-ovo/app` — whichever
comes first. A second crossing is the point at which "one file" stops being true and the
divergence the kit exists to prevent has somewhere to start.

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
- **Real content.** The bundle here is the fixture. The book's compiler and its release
  wiring exist; no tag has been pushed since they landed, so no bundle has been attached.

---

## 8. Verifying what is here

```bash
pnpm --dir web install
pnpm --dir web -r typecheck
pnpm --dir web -r test
```

The unit tier needs no network, no database and no deployment: the gate is pure functions
and the tool surface runs against the fixture bundle through an in-memory cursor (P13 —
test at the layer with the logic).

To drive the real protocol over stdio:

```bash
node web/mcp/src/server.ts
```

With neither `AB_OVO_API_URL` nor `AB_OVO_READER_TOKEN` set it keeps the reader's place in
memory and says so on stderr.
