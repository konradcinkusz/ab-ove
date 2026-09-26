# ADR-0067: A finished program may get a second opinion from the reader's own model, and ab-ovo calls none

## Status

**Proposed.** Date: 2026-09-26. Nothing below is built.

If accepted, it supersedes [ADR-0010](0010-no-language-model-in-the-loop.md) **in part**: the
part that ADR's last paragraph reserves for "a model in an *optional* pane — beside the loop,
never inside it, with its output labelled as a suggestion and recorded nowhere". Everything
else in ADR-0010 stands, and its decision about a frame stands whole. On acceptance, ADR-0010's
Status gains one line naming this ADR, and the refused list in
[`docs/ux/UI-UX.md`](../ux/UI-UX.md#what-is-deliberately-not-on-this-list) narrows its model
entry. A model stays refused at a frame, and it stays refused wherever it would be ab-ovo's
rather than the reader's.

Constrained by these, and amends none of them:
[ADR-0009](0009-the-instrument-measures-the-book.md) (the instrument),
[ADR-0039](0039-a-frame-accepts-the-readers-answer-as-a-commitment.md) (the answer line and
"matches"), [ADR-0046](0046-schema-2-carries-the-books-third-stage.md) (the Quiz and the
exercises), [ADR-0054](0054-submit-answer-elicits-the-reader-before-it-trusts-the-argument.md)
(elicitation) and
[ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
(the MCP server).

## Context

A reader working F01 through `web/mcp` in an MCP host answered step 1 with "Nie, nie da się
zrobić". Step 2 opened with the book's answer: "Nie. Potrzebny jest znak, a nie tylko
wartość." The reader asked whether a local model could compare the two, say whether the
answer was right, show that and carry on. Then they asked the same question about the end of
a program and about the Quiz.

**At a frame, ADR-0010 answers it, and nothing it rests on has moved.** The next step opens
with the answer, and comparing against it is the teaching (`SERVER_INSTRUCTIONS` rule 5 in
`web/mcp/src/tools.ts`). A model's verdict in `FrameOutcome` would carry the model's error
rate and drift (ADR-0009). ADR-0039 measured the book's 1 036 answers: 11% are a bare number,
27% a number in a sentence, 27% a formula and 36% prose, and a machine can say "matches" safely
on the first class only.

**The three places the reader asked about are not the same place.**

| Where the model sits | What the reader has done by then | What the model's mistake costs |
| --- | --- | --- |
| at a frame | nothing yet: comparing is the next thing they do | the lesson, because the model made the comparison for them |
| at the end of a program | every comparison, one frame at a time | one wrong second opinion, which the reader can check against their own |
| at a Quiz item | nothing: the Quiz is read before the program | skipped frames. A quiz answer routes the reader to a frame range (370 quiz routes, ADR-0046), so "right" means "skip those frames" |

Only the middle row is "beside the loop, never inside it". The reveal gate makes that a
position rather than a promise: a program's end is after its last step, and by then every
answer the model could mention has been revealed.

**Where the model runs is the second question, and this estate already answers most of it.**

- **The browser may call no model.** It talks to its own origin and nothing else
  (FRONTEND-BFF.md §1, `AGENTS.md` item 8), and that includes a model on `localhost`. A model
  that runs in the page would have to be served from this origin, which is
  [ADR-0032](0032-a-lab-runtime-is-refused-until-its-wheels-are-on-this-origin.md)'s rule for
  Pyodide. The smallest instruction models worth asking about Polish prose weigh hundreds of
  megabytes, and [ADR-0040](0040-the-python-lab-leaves-the-reader-loop.md) took a 6.4 MB
  runtime out of the loop on cost.
- **A model behind the server would be the operator's, not the reader's.** Whoever runs the
  instance would choose it, pay for it and see what goes into it. It would also send the
  reader's words off their device for the first time: a worksheet is "never counted, listed,
  synced or sent" (`web/app/src/lib/sheet/store.ts`, ADR-0039), and its one way out is a
  download the reader's own browser makes
  ([ADR-0055](0055-the-notebook-exports-what-stands-today-never-a-history.md)). And it puts a
  key, a bill and a provider or a GPU machine on the path ADR-0010's Consequences keep clear.
- **On the MCP surface a model is already there: the host.** The reader chose it and has typed
  every answer into it. If the host runs a local model, nothing leaves the reader's machine. If
  it is a hosted assistant, the answers are already in it. The server does not need to call a
  model; it needs to hand the host both sides at the right moment.

**What the MCP server holds today is nothing.** `submit_answer` echoes the reader's answer and
keeps no copy; `advance` in `web/mcp/src/reveal.ts` takes no answer; `AbOvo.Api` accepts
`AdvanceRequest.Answer` and discards it. The header of `web/mcp/src/cursor.ts` says "THIS
PACKAGE OWNS NO STORE", and it is about the reader's place.

**MCP sampling was considered and not chosen.** With sampling the server asks the host's model
for a completion. That makes ab-ovo's code the caller of a model, which is the line ADR-0010
draws. It also routes the model's output back through ab-ovo's code, which is the only place
something could start recording it. In the shape below the model's output never reaches an
ab-ovo process, and that is a property of the design rather than a rule somebody keeps.

## Decision

### 1. The only model is the reader's own

**The one model that may compare a reader's answers with the book's is the one the reader
brought:** the model behind the MCP host they chose, local or hosted, on their machine or
their account and at their cost. ab-ovo never runs, hosts, configures, proxies, pays for or
chooses one.

- **No instance supplies a model.** Not `AbOvo.Api`, not the BFF, not the hosted MCP server of
  #173, and not an operator's configuration. No model endpoint, key or parameter exists in
  `src/AbOvo.AppHost/AppHost.cs`, `flyio/*.fly.toml`, `secrets.env.example` or a workflow.
  Adding one is not a setting; it supersedes this ADR.
- **No ab-ovo process calls one, not even the reader's.** No MCP sampling (Context above), and
  no other request from the server to the host's model. The server hands the host data, and
  whatever the host's model does with it happens in the host.
- **The reader decides whether their answers reach a model at all, and which.** They typed
  them into that host already; nothing here sends them anywhere else.

### 2. A frame stays as ADR-0010 left it

No model at a frame, on any surface. `SERVER_INSTRUCTIONS` rule 5 keeps its sentence for the
whole of a program. The machine's only verdict at a frame stays ADR-0039's "matches the book".

### 3. A finished program may get a second opinion, on the MCP surface, from the host's model

**`compare_answers` is a new read-only tool in `web/mcp`.**

- **It sits behind the last step's gate.** It serves only when the reader's cursor is at the
  program's last step, the condition the Summary already has (`Reveal.ServeReturnIndex`, #158).
  Below that it refuses the way the gate refuses and names the step the reader is on. It reads
  the book's answer to step *k* by serving step *k*+1 through `serve()`, never by indexing
  `unit.steps`, so the gate is what emits every answer.
- **It returns, for each step that asked something (`step.cue`):**
  - the step's number;
  - the reader's answer as recorded in this session, or that none was recorded;
  - whether the reader confirmed it by elicitation (ADR-0054) or it arrived only as the
    assistant's argument;
  - the book's answer, the opening of step *k*+1;
  - `matches: true` where ADR-0039's fixture lists the frame and the numbers agree, so both
    surfaces say "matches" on the same frames;
  - the Summary items whose range covers the step: the book's own "re-read steps *a*–*b*".
- **It does not return the frame's body.** `review_step` serves any step up to the reader's
  furthest, under the same gate, when the host needs the question.
- **It returns no count, no percentage and no "N of M".** A total across a program is a score
  about the reader (ADR-0009 §1, METRIC-ETHICS.md §5).
- **It returns no quiz `answer` and no `Exercise.answer`.** The leak walk in
  `web/mcp/src/tools.test.ts` covers the new tool at every cursor.
- **The reader asks for it; nothing offers it as a step.** `completion()`, the hand-off at a
  program's end, gains one reader-facing line saying a second opinion is there if they want
  one. The host calls the tool only when the reader asks.

**The comparison is the host's, and the server says how to make it.** It says so in the tool's
description and in the result's text. The header of `tools.ts` already says a description is a
request, not a rule, and it stays one here:

- Give it only when the reader asked, and only for a finished program.
- Say one of three things per step: it says what the book says; it differs, quoting the part
  of the book's answer the reader's does not carry; or you cannot tell.
- Never say "wrong", and never give a mark, a score or a total.
- Add nothing to a step marked `matches`.
- Where an answer differs, point to the Summary item the result names. Do not re-teach, and do
  not write a new explanation or a new exercise: ADR-0010 still refuses both.
- Head it as a suggestion from the reader's own assistant, not from the book, and say that
  nothing was recorded.

`SERVER_INSTRUCTIONS` rule 5 gains this as its one exception, in the same words.

### 4. The server keeps this session's answers in memory, and nowhere else

**`submit_answer` keeps what it recorded,** so that `compare_answers` has the reader's side. It
keeps the answer and the confirmed flag, in a map inside the process, keyed by track, unit and
step, with the bundle tag in the record.

- **ADR-0039's rule for a worksheet applies unchanged:** what the reader wrote, and nothing
  about it. No verdict, no timestamp, no attempt count, no history. A step is answered once,
  because the gate advances once and a retry is refused, so there is nothing to overwrite.
- **An entry recorded under another bundle tag counts as not recorded.** A frame number from
  another tag names another question (ADR-0009 §5).
- **It dies with the process,** as `MemoryCursorStore`'s place does, and `compare_answers` says
  so when entries are missing.
- **It goes nowhere.** Not to `AbOvo.Api`, which keeps discarding `AdvanceRequest.Answer`; not
  to `FrameOutcome`; not to stderr or any log.
- **The header of `cursor.ts` stays true.** It is about the reader's place, and this map holds
  no place. The header gains one sentence naming the map as the one thing the process holds,
  and why.

**A file in the user's state directory was considered and not chosen.** It would survive a
restart, beside the id ADR-0066 §2 keeps. But a reader's words on disk need a forget control
([ADR-0047](0047-forgetting-is-two-presses-because-it-reaches-the-account.md)'s two presses)
and a decision of their own. **Exit:** if readers lose answers to restarts in practice, that
is the ADR that adds the file.

### 5. The Quiz gets no model, on any surface

The Quiz screen waits for a v2 bundle (ADR-0046). When it is built, the reader judges their
answer against Appendix A's, and the reader takes the route it opens. A model there would
decide which frames get skipped, and its mistake would be invisible: a reader who skipped the
frames they needed does not know which ones. This is refused, not deferred.

**Test exercises are the natural next use of §3.** When they are rendered, `compare_answers`
may carry them, after the reader has written their own answer and seen Appendix A's. That is
one paragraph in a later ADR, not a new mechanism.

### 6. The reading surface gets no second opinion, and that is refused, not deferred

The website has no model of the reader's to reach, so under §1 it has none to use.

- **The reader's own model is out of the browser's reach.** The page may call only its own
  origin, so it cannot reach a model on the reader's machine.
- **Every model the website could reach would be ab-ovo's choice, not the reader's.** That
  covers an endpoint the operator configures behind `AbOvo.Api` and a provider behind the BFF.
  It also covers a model served into the page from this origin: ab-ovo would have picked it
  and shipped it.
- **A web worksheet stays in the browser** (ADR-0039), so it never reaches the reader's host
  either. `compare_answers` covers answers given through the host, and no others.

A reader who wants a second opinion on the website's worksheets can export them (ADR-0055)
and take the file to any model they like. That happens outside ab-ovo, and the export still
carries none of the book's text
([ADR-0033](0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)).

### How it is built, if accepted

One change in `web/mcp`. Nothing in `AbOvo.Api`, `AbOvo.Contracts`, `web/app` or the content
schema, and no new entity (`AGENTS.md` item 3).

- **`web/mcp/src/answers.ts`:** the session map, with its unit tests.
- **`web/mcp/src/tools.ts`:**
  - `compare_answers`, with its definition, the `READS` annotations, an `outputSchema`, the
    handler and the result's text;
  - `submit_answer` records into the map;
  - `completion()` gains the offer line;
  - `SERVER_INSTRUCTIONS` rule 5 gains its exception.
- **ADR-0039's verdictable fixture and the comparison in `web/app/src/lib/sheet/number.ts`**
  move to `@ab-ovo/web-kit`. The MCP server becomes their second consumer, which is
  [ADR-0053](0053-the-web-kit-package-is-extracted-on-its-own-exit-condition.md)'s rule.
- **Tests,** in `tools.test.ts` and `server.test.ts`:
  - the tool refuses below the last step;
  - at the last step it emits the book's answer to every step that asked something, and
    nothing else;
  - the leak walk calls it at every cursor;
  - the text and the data carry no total;
  - a retried `submit_answer` overwrites nothing;
  - an answer recorded under another tag reads as not recorded;
  - every result validates against the `outputSchema`;
  - a client that records every request the server sends it works a program through
    and asks for the comparison, and finds no `sampling/createMessage`: §1 as a test, not
    a sentence.
- **Documents:** `web/mcp/README.md`'s tool list,
  [`MCP-SERVER-SKETCH.md`](../architecture/MCP-SERVER-SKETCH.md), the refused list in
  `docs/ux/UI-UX.md`, and ADR-0010's Status.

## Consequences

**ab-ovo still calls no model, on any surface.** What ADR-0010's Consequences say about the
critical path holds unchanged: no key to rotate, no rate limit, no inference bill, and no
provider outage that stops somebody reading.

**The second opinion is only as good as the reader's host, and that is the real cost.** A small
local model will be confidently wrong about formulas and prose, which are the 63% of answers
ADR-0039 says nothing can mark safely. The label is the mitigation, and nothing enforces it.
This is why the opinion comes after the reader's own comparisons, never before them.

**The wording is a request.** A host can ignore the three answers and say "7/10". The server
cannot stop it. What it can guarantee is that the tool gives the host no total to repeat, and
that nothing the host says is recorded.

**Nothing reaches the instrument.** The opinion never passes through ab-ovo's code, so
`FrameOutcome` cannot learn from it, even by mistake. ADR-0009 needs no amendment.

**The server holds a reader's text for the first time, in memory.** It is never logged, and it
is lost at a restart. A reader who finishes a program across two sessions gets a second
opinion on the second half only, and the result tells them so.

**The two surfaces differ, and they stay different.** A reader on the website gets no second
opinion, now or later. The reason is where the model is: the MCP host is the reader's, and
nothing the website can reach is.

**An operator cannot turn this on.** No instance has a model setting to fill in. A
deployment that wants to supply its own model supersedes §1 in an ADR; it does not change a
configuration.
