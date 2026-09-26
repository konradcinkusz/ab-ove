# The MCP server — a sketch, and what is built so far

**Status: a sketch with a working core.** `web/mcp` builds, typechecks and passes its unit
tier; it speaks MCP over stdio from a checkout, as a client of `AbOvo.Api`, which serves it the
book and keeps its reader's place (#171,
[ADR-0066](../adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§1). **Nothing is deployed** (AGENTS.md #2), and there is no HTTP transport and no OAuth.

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

One rule:

> Step `k` of a unit is served if and only if `k <= ` the reader's furthest step, and the
> only thing that raises the furthest step is submitting an answer.

**It is `AbOvo.Api`'s** (`src/AbOvo.Api/Content/Reveal.cs`), and this server asks it for every
step: `GET /api/v1/content/{track}/{unit}/{step}` serves the step or refuses it, and
`POST …/advance` is the one way a place moves. The rule was first written here, as
`web/mcp/src/reveal.ts`; [ADR-0060](../adr/0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md)
moved it into the API as the one copy every client asks, and #171 deleted this package's copy
when it became one of those clients. What is left here is how a refusal is told
(`src/refusal.ts`): its kinds as data, and its sentences in the reader's edition.

It works because of what `answer` is. `content-schema.v1.json` defines it as *"THE OPENING
OF THIS STEP, WHICH ANSWERS THE PREVIOUS ONE"* — so the answer to step `k` is not on step
`k`, it is on step `k+1`, and there is nowhere else it lives. **Refusing to select step
`k+1` refuses the answer to step `k` as arithmetic, not as filtering.** There is no field to
strip, because the object carrying it was never chosen — and, since #171, never sent to this
server at all.

The ceiling is `ReaderProgress.Step`, the row the reading surface also writes.
[ADR-0019](../adr/0019-furthest-frame-wins.md) makes it monotone — a write carrying a lower
step does not lower it — which is what stops a stale client rewinding a reader and re-exposing
an answer they had already earned past. And since #171 nothing but an answer raises it: `PUT`
refuses a step past the one the reader reached, which discharged the deviation register's row
that said it could. **Both halves are load-bearing:** were furthest-wins to become
last-write-wins, or a write to name a step it did not earn, this gate would silently stop
holding. `ProgressEndpointTests` asserts both, beside the row they guard.

### Two answer-bearing fields the gate does NOT govern

Schema v2 added `Route.answer` — Appendix A's answer to a quiz question — and
`Exercise.answer`, required on every Test exercise and Further problem. Neither is a step,
so the gate says nothing about either: they are answers to work the reader has not done.
The API does not send them — a `ReturnRoute` is a route's labels and span, and a step's
`check` names its exercise and nothing of its answer — and this surface does not say them.

That is asserted rather than believed. `tools.test.ts` collects every answer-bearing text in
the bundle — steps, routes and exercises — and checks the non-step ones never appear at any
cursor position. The unit tier runs against a stub of the API (`src/testing/stub-api.ts`)
that serves the **v2** fixture for exactly this reason: the v1 fixture carries neither field,
so a leak test written against it would pass by having nothing to leak. The stub serves what
the API serves and no more, so the walks are walks over what this server can actually be sent.

### The structured half is a second way out, and the walks read it too

Every result that is not an error carries its data as `structuredContent` (§3), and "the
answer to step *k* lives only in step *k + 1*" has to hold there as it holds in the text.
It holds by construction: no field of the data is read from an answer's words, and
`answersStep` says only that a step opens with an answer. It is also asserted. The leak walks
read every string of both halves, value by value rather than through a serialisation that
would escape a backslash, and one of them walks a three-program track whose answers name
their program. At every place in every program it asks every tool about every program, and
checks that no step shown in the data lies past the furthest. Each walk runs once in each of
the fixture's editions, because the server's own sentences differ from one edition to another
(#167), and each checks that it was framed in the edition it names.

Watched failing before #171, when the steps were this package's own: carrying the next step's
answer in a step's data turns the leak walks red, and the output-schema validation in
`server.test.ts` with them. Carrying the next program's
answer in a finished program's `finished.next` turns the three-program walk red and leaves
the single-program walks green, which is why that walk crosses programs at all. A place line
that ignores the edition turns every Polish walk red and leaves every English one green, which
is why each walk checks its framing: without that, the Polish walk could pass as a second
English one.

### Why this is not the DOM assertion wearing a new hat

The acceptance suite asserts the answer is absent **from the DOM**. This transport has no
DOM, so that assertion would have stayed green while the property did not apply here at all
— the same shape of failure `docs/ux/UI-UX.md` refuses a service worker for. The replacement
is in two places now. The gate's own tests are the API's (`ContentEndpointTests`, against the
real pipeline). This package's are `tools.test.ts`'s walks, which check every tool at every
cursor position against the stub API. Before #171 both halves were here, and both were
**watched failing**: deleting the `n > cursor.step` branch turned the gate tests red, and the
whole-surface walk with them.

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
`ReaderProgress` rows, read from the API. Before, the two surfaces disagreed about one
reader's doors and neither could explain the other. The API does not hold this order
(ADR-0065), so `open_program` asks it before it records an opening, as the browser's recorder
does before it writes.
[ADR-0065](../adr/0065-the-foundation-programs-stay-in-the-reading-order-and-the-index-says-why.md)
keeps the Foundation programs inside that order: a reader who already knows them still opens
one step of each before P01, here as in the browser.

`open_program` refuses a shut program **before** it asks which edition to read, so the
model does not spend the reader's answer on a question that leads nowhere; `current_step`,
`submit_answer` and `review_step` say the same thing rather than advising an
`open_program` that is itself refused; `list_programs` marks a program `open to the
reader now` or `SHUT, opens after F01` and states the rule once per track. The rule asks
about this program and the one before it, and the call already holds every place the reader
has, from the one read of them it makes anyway.

**`list_programs` says what is open in a few lines.** For a new reader it used to be about
7 KB (measured 2026-09-24): every unopened program with its title in both editions, and
`SHUT, opens after …` once for each shut program — paid again by the agent every time it
re-checked. It now names every program the reader can act on — the ones with a place, the
ones open now, and the one that opens next — and folds each run of shut programs behind
that into one line per group, such as `F03–F13 — 11 programs, shut: each opens after the one
before it`. The grouping by part or prefix and the rule stated once per track are kept.
Titles are in one edition: the reader's (`AbOvoApi.edition()`), or English until they
have one, which is the website's default (ADR-0052). `language` gives the other edition, and
`all: true` names every program. The `read` prompt's completions list every id regardless,
and a `read` prompt given an edition and no program asks for the list in that edition.
`tools.test.ts` holds a new reader's list, on a track the size of the book, to 1.5 KiB with
the in-memory note included, and its structured half to 2 KiB: the data names the programs
the text names and folds what the text folds.

**The refusal is a refusal and not an error** — `refused`, not `problem`, on the gate's own
reasoning about `not-reached`, which `refusal.ts` keeps — and it names the program that opens
this one, says one step of it is enough, and says plainly that nothing is hidden or paid for.
That last clause is for the model: a tool description is a request and not a rule, so the
sentence, `SERVER_INSTRUCTIONS` §8, `open_program`'s description and the `read` prompt all say
it, and none of them can stop an assistant reporting a reading order as a fault.

**Every step says where it is.** A rendered step opens with what the reading surface's top
bar and pager say, in one line, one transport over — `P01 · How a computer stores a number ›
Scientific notation · step 5 of 48` — and the banner that follows names the step it answers. The first version printed a
number and no name, and `list_programs` printed ids: a reader thirty steps in had nothing to
call the program, and a reader choosing one had nothing to choose by. The reader-facing
closing line names no tool; the assistant has the tool's own description for that.

**Fewer arguments, and none whose answer is discarded.** `track` may be left out when the
server carries one track, which `list_programs` shows; a program id matches in any case and
is filed under the book's own spelling. `language` may be left out to resume; a different
edition on resume switches, keeps the step (frame-for-frame parity is what makes that safe)
and says so. The first version required the edition on every call and then discarded it
whenever a place existed, so the model asked a question whose answer went nowhere.

**The edition is asked once per reader, not once per program.** The second version still
needed `language` at the first opening of *every* program, and refused without it with
`isError`: an agent asked "English or Polish?" at the start of each program, and the host
painted an ordinary step of the conversation red — the mistake ADR-0056 corrected for
refusals. The website keeps one edition per reader
([ADR-0052](../adr/0052-one-language-control-remembered-and-english-by-default.md));
`AbOvoApi.edition()` reads the same thing. For an account it asks
`GET /api/v1/preferences/language`, and when the reader never chose there, takes the edition
of their most recent place by `updatedAt`. A reader with no account has no preference kept,
and so only the most recent place. A new program starts in that edition, and the result says
so. Only a reader with no edition anywhere is asked, as an ordinary result naming each edition
by the track's own title in it. On a host that supports elicitation, the reader picks from the
track's editions as an enum, the way `submit_answer` asks for an answer (ADR-0054). Nothing
here writes the preference: choosing the website's language is the website's control. An
edition the track does not have is still an error, because it names nothing.

**An opening writes nothing on a place that exists, so the client keeps the switch.** The
API records an edition with the step it belongs to (`reconcile.ts` in the reading surface says
why: *"frame 40, in Polish"* is one fact), and a switch on the step the reader is on has no step
to go with. The surface has no problem with that because the edition it shows is in the URL;
here it is in the cursor. So `AbOvoApi` keeps a switch made on the current step in the process,
for that step only, sends it with the next advance, and drops it the moment the API's step
moves past — another machine reading on, whose edition travels with its step.

**The sentences around a step are in the reader's edition too** (#167). They were English in
every edition: measured on 2026-09-24 through a real MCP client, a Polish step arrived between
an English place line, English banners and an English closing line, and the refusals, the
hand-off and the in-memory note were English as well. The host's model translated them, against
the instruction to show a step as it is served. `web/mcp/src/framing.ts` is now a table on the
reading surface's `chrome.ts` pattern — an entry per language, English as the fallback, a count
through `Intl.PluralRules` — and in its vocabulary
([`translate-a-document.md`](../how-to/translate-a-document.md)). So where this server's English
says *step*, the Polish says *ramka*, as the book and the reading surface do: `F01 · Liczby,
potęgi i pierwiastki › Jakie są liczby · ramka 1 z 45`.

The table holds only what the reader is shown: the place line, the banners and the closing line
of `render()`, the refusals of `explain()`, the hand-off of `completion()`, the notes about the
reader's place, the group headings of `list_programs` and the form that confirms an answer.
**What is addressed to the assistant stays English**: the tool descriptions,
`SERVER_INSTRUCTIONS`, the output schemas, the prompt, the edition question (asked because no
edition is known), and the sentences of a result that tell the model about its call — what was
started, recorded or not, and which call opens the next program. A shut program is refused in
the reader's edition, and the `open_program` call that opens it follows in English. The list's
apparatus around its titles stays English too: its rule, each program's state and its notes are
what the model reads to choose a program. `framing.test.ts` holds that line from the table's
side, since no sentence there may name a tool. It also holds the Polish to ADR-0016's rule,
under which no sentence may make the reader a man or a woman. The data does not change:
`step.language` was already there, and the only words in it are `text`.

**Finishing a program is a hand-off, not an error and not a dead end.** The last
`submit_answer` used to be refused as `program-complete`, and a reader who had worked
forty-eight steps was told the server had failed and given nowhere to go. It now records the
answer and returns the reading surface's `/summary`, one transport over: the book's own
Summary and *Can you?* — the routes' **labels only**, never `route.answer`, because a label
may name the skill and may not carry the finding — and the next program, found by adjacency
in the track's listing, which keeps the manifest's order, with the `open_program` call that
opens it. The cursor does not move.
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
start that `not-reached` "is NOT an error — it is the product working" (`refusal.ts` says it
now), and the first tool layer sent it with `isError: true` anyway, along with a finished
program; a host paints that red and a model apologises for it. Now only an argument that
names nothing — a track, a program, an edition or a step number the book does not have, an
empty answer to a step that asked for one — is an error, beside the two failures of the
deployment described next: no book, and a place out of reach. The gate's sentence and the end of a program travel as
results.

**A deployment with no book answers with the fix.** The book is the API's, so there are two
ways to have none, and each has its own fix. `AB_OVO_API_URL` is not set, and the variable is the
fix; or the API answers 404 for the listing of a track this server carries, which means nothing
was ingested into it or what answers is not the ab-ovo API. `api.ts` throws `NoBook` for either,
and `handle()` answers it with `noBookNote`. The server read a compiled bundle from its checkout
until #171, and the note then named the fetch script, the checkout and the paths looked at
(#136).

**An API that cannot be reached answers with what fixes it.** A non-2xx answer used to throw a
bare `Error` and a rejected `fetch` passed straight through; both reached the host as
`MCP error -32603` carrying `progress read failed: 401` or `fetch failed`. `api.ts` now throws
`ApiUnavailable` with a reason — `unauthorised`, `unreachable` or `refused` — and `handle()`
answers it beside `NoBook`, as a result with `isError`: nothing is lost, a failed write may not
have been recorded and is safe to repeat either way, and the fix for that reason (a fresh
token, a moment, or the address). A 401 names the token only when there is one; a reader with
no account sends none, so for them it names the address. An `AB_OVO_API_URL` that is not an
http or https address is `refused` before anything is sent, rather than `unreachable` and
retried for nothing. So is a redirect, which is not followed (§4), and so is an answer that
parses and is not the shape the API sends. The gate's refusals are untouched. Anything else
`handle()` cannot name still throws, because a sentence would dress a defect in this package up
as the deployment's.

What the note tells the reader follows their edition: the one the call named, if the track is
published in it, else the one the session last spoke in, else English. The API that says which
editions a track has is the thing out of reach, so nothing is asked of it: the track's editions
are the ones it last listed. The named edition is looked up among those (`editionIn` in
`tools.ts`), as a named edition is everywhere else in this server, and is never used as sent.
A host's arguments reach `handle()` unchecked, and the first version of this note took
`language` raw. `constructor` then found `Object.prototype`'s member in the
table and threw out of `handle()`, the defect #137 exists to end, and `PL` was honoured where
every other call refuses it. `framingFor()` looks up only the table's own entries besides. The
fixes for whoever runs the server stay English with the variables they name, and so does the
whole of the note for a deployment with no book, which has no editions to follow.

**A place held in memory is said in the results, once.** When the anonymous reader's id cannot
be kept in the state directory (§4), the process holds it in memory, and the place lasts as long
as the process. `server.ts` says why on stderr, which no reader of a host sees, so the results
say it too, and the reader learns it before losing their place rather than by losing it. It
used to end every `list_programs` and `open_program` result, so a reader heard it at each call
and at every re-check of the list. It now ends the first result of a session that is not an error — an error's text is a
fix the model acts on, and a note spent there may never be relayed — and every result
carries `placeIsEphemeral` in its data. It is in the edition of the result it ends. The
session is the server's, one per connection over stdio.

**Every result carries the same thing as data** (#164). A result that is not an error has a
`structuredContent` beside its text, described by the tool's `outputSchema`, so an agent
reads fields rather than prose. A step is `{ track, unit, step, total, asks, language,
answersStep? }`, which gives the number `submit_answer` names and says whether the step asks.
The list is `programs`, one entry for each program its text names, with `open`, `place` and,
on a shut one, `after`. A refusal is `refusal`, with its `kind`. The end of a program is
`finished`, and the edition question is `question`. The text is unchanged for a host that
reads only text. The schemas use only keywords that draft-07 and 2020-12 read alike, since
the spec assumes 2020-12 and the SDK's own client validates with Ajv's draft-07. A test
refuses any other keyword, because Ajv's default skips one it does not know, misspelt or
not.

**The words travel in the data as well, and that is not decoration.** Claude Code's
documentation, under *Return structured data*, says that when a result carries
`structuredContent`, the model receives the JSON and not the text blocks, which "are assumed
to duplicate the structured data" (read on 2026-09-25). That is the host the package README
installs the server into. So every result's
data carries its words as `text`, word for word, and without them a reader there would be
told a step's number and none of its words. A host that forwards both halves reads the words
twice: the cheaper failure. An error carries its text alone, and every host forwards that.

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
that decision. The form is written in the edition of the step it confirms (#167): a host shows
it to the reader with no model in between to translate it.

**On a host that does not support elicitation, the limit is exactly what it was.**
`submit_answer` **echoes back what it recorded**, so a reader who was answered *for* can see
that they were — a narrowing, not a fix, and the honest floor under every host regardless of
what it can ask its reader directly.

`ANSWER_CONTRACT` and `SERVER_INSTRUCTIONS` are constants asserted by the unit tier — the
nearest thing a prose contract can have to a gate, and still the whole of the protection on
a host with no elicitation to fall through to.

---

## 4. Transport and identity

Today: **stdio**, one process, one reader. That is enough to run it from a checkout and to have
exercised every tool over the real protocol.

**The reader is a bearer or an opaque id** ([ADR-0066](../adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§2, built by #171):

- `AB_OVO_READER_TOKEN`, when set, is an account's access token, sent as a bearer. It comes
  first, the order `ReaderIdentity.Resolve` reads in, and it works for as long as the token
  lives.
- Otherwise the reader is anonymous, on [ADR-0061](../adr/0061-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md)'s
  pattern: a GUID from a CSPRNG, sent as `X-Ab-Ovo-Reader-Id`, which the API files as
  `anon:<id>`. It is kept in `reader-ids` in the user's state directory, readable by that user
  alone, one line per API origin (`src/identity.ts`), and a process reads it there at its first
  request; only when the file has no line for the origin is one minted. The file is created by
  an exclusive create and added to by appending a line; a process reads it again after
  appending and takes the first line for its origin, so two hosts that start together still
  end on one id. The id is sent to its own origin and to nothing else — a redirect is not
  followed — and it is never said in a result or on stderr. An anonymous MCP reader and an
  anonymous browser are two readers, and an account is the way to one place on both.
- The API gave that reader what it had only for an account: `GET /api/v1/progress/anonymous`,
  every place the id's reader has, and `POST /api/v1/content/{track}/{unit}/open`, which records
  an opening at step 1 for a reader with or without an account and never raises a step. So
  `open_program` keeps a place without `PUT`, and nothing here calls `PUT`.

The shape a stranger on claude.ai or ChatGPT connects to is **Streamable HTTP with OAuth**,
and it is deliberately a separate commit:

- the token must arrive **per call**, not from the environment. `AbOvoApi` is one reader's
  view of the API — its bearer or its id, and the edition switch it holds — and its bearer is
  a string fixed when it is made, which suits stdio, where the token is read once. A server
  that serves many readers makes one per reader and never shares one, since a shared one
  would be one reader's credential answering another reader's request, and hands it the
  bearer per call, as `ApiCursorStore`'s `() => string` did before #171;
- `authservice` is adopted, pinned at a published image (ADR-0004), and the pinned `v0.3.1`
  cannot act as the OAuth authorization server for a third-party MCP host. Later tags can, for
  a host the operator pre-registers with a secret, and none lets a host register itself
  ([`AUTHSERVICE-OAUTH-PROBE.md`](AUTHSERVICE-OAUTH-PROBE.md));
- a deployed server is a fifth Fly app in a topology none of whose `fly.toml` files has ever
  been applied, and it needs its own address row in `flyio/README.md`.

**[ADR-0066](../adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
answers the questions this section left open:**

- **The implementation.** This package stays in TypeScript and is a client of the content API
  (#171, built). No .NET client is planned.
- **An anonymous reader's identity.** The opaque id above, one per API origin, kept by the
  process in the user's state directory. Pairing it with a browser is out.
- **The order.** A one-command package comes first (#172). This Streamable HTTP shape comes
  after the first deploy, and only once `authservice` can be the authorization server for a
  third-party host (#173). [The probe](AUTHSERVICE-OAUTH-PROBE.md) found that the pinned
  `v0.3.1` cannot, and that `v0.3.2` to `v0.3.4` can for a host the operator pre-registers.
  For such a host this shape waits on moving the pin, a decision of its own; for a host that
  registers itself, on an upstream release.
- **Taking the token per call is a caution as well as a plan.** The shape above passes the
  reader's bearer on to the API, and the MCP authorization specification forbids a server to
  do that with a token a host gave it. #173 has to settle what the hosted server presents
  instead. The probe found that `authservice` mints nothing for it to present: no grant
  exchanges a host's token for one the API accepts.

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

**No answers persisted, and no verdict.** What the reader wrote is echoed and dropped. It is
not sent to the API either: the advance names the step it answers and the edition, and nothing
the reader wrote.

This is narrower than the reading surface, and [ADR-0039](../adr/0039-a-frame-accepts-the-readers-answer-as-a-commitment.md)
is the decision to read it against. That ADR splits the answer line into two things: the
**commitment** — the reader writes before the reveal — and the **worksheet**, the stored
text plus one flag saying it was committed before the reveal.

This transport implements the commitment and not the worksheet. The commitment is what the
gate is: `submit_answer` is the only thing that advances and it requires the reader's text.
The worksheet it does not keep, because `ReaderProgress` holds a place and not a history,
and ADR-0039's store is the reader's own local one — which an MCP host does not have. A
reader who works some frames here and some in the browser will find their written lines only
in the browser, and one place on both only when both read as one account (§4). That is a real
gap, named rather than papered over.

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
on `@ab-ovo/web-kit` as an ordinary workspace package, and since #171 it reads no bundle through
it. `content.ts`, the crossing the extraction redirected, is gone with the bundle. What it takes
from the kit is the reading order (`isOpenWhere`), the grouping and adjacency of a track's
programs (`groupsOf`, `unitBefore`, which read the API's listing as they read a bundle), and the
content API's wire shapes, which moved there from `web/app/src/lib/content/wire.ts` when this
package became their second consumer — ADR-0053's rule applied to them. Nothing in this package
reaches into `@ab-ovo/app`, and nothing needs to.

---

## 7. Follow-ups, named rather than implied

- **Lint.** `@ab-ovo/mcp` declares no `lint` script, so `pnpm -r lint` skips it. A stub that
  echoed would be TESTING-STRATEGY.md §9's defect — green forever, proving nothing. A flat
  ESLint config is a follow-up with its own dependency decision; `eslint-config-next` is
  Next's and not this package's.
- **Concurrency.** `AbOvoApi` holds one reader's edition switch and nothing guards it. Over
  stdio a host waits for each result, so it does not arise; a deployed server should not rely
  on that.
- **The tracks it carries.** The server asks the API about the tracks this checkout pins
  (`PINS`), because `AbOvo.Api` lists no courses yet — the index's row in the deviation
  register names that listing. A package pointed at an instance that serves another track
  (#172) needs it.
- **The copied words.** `web/mcp/src/framing.ts` copies the Polish words it shares with the
  reading surface's `chrome.ts` rather than importing them (ADR-0053), and nothing checks one
  copy against the other; [`translate-a-document.md`](../how-to/translate-a-document.md) asks
  for both to change in one commit, which is a convention and not a gate. A gate has a
  decision of its own to take first: either package's tests reading the other's source, or
  the shared words moving into `@ab-ovo/web-kit`.
- **The licence.** Serving the book's prose through third-party hosts is a redistribution
  question and it is the book's to answer, not this repository's (ADR-0033). The book's
  `LICENSE-CONTENT` still carries its undecided block, and neither of its licence files
  names `lab/` or `figures/values/`.
  [ADR-0066](../adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
  §4 says what each route may do under the licence as it stands. The package carries no
  book, since #171. An instance, and a hosted server, serve the prose free and credited, never
  behind a payment. Every route must credit the book where its reader sees it, and today none
  does.
- **Schema version.** The book's compiler at the pinned revision emits a v1 bundle; the
  application supports v1 and v2. Nothing here depends on the difference — `Step.answer`
  means the same in both — but the leak assertion above needs a v2 shape, which is why the
  stub API the unit tier runs against serves the v2 fixture.

---

## 8. Verifying what is here

```bash
pnpm --dir web install
pnpm --dir web -r typecheck
pnpm --dir web -r test
```

The unit tier needs no network, no database, no book and no deployment. The tool surface
runs against a stub of `AbOvo.Api` (`src/testing/stub-api.ts`) that serves the committed v2
fixture and answers as the API does, gate and all (P13 — test at the layer with the logic),
and `server.test.ts` drives the protocol itself — tools, annotations, output schemas, the
prompt, completions — over `InMemoryTransport`. It validates every result it receives against
its tool's output schema, with the validator the SDK's own client uses. `restart.test.ts` starts
the launcher itself as its own process, twice, against that stub served over HTTP, and finds
the anonymous reader where the first process left them. What the API does is
`tests/AbOvo.Api.Tests`'s to assert.

To drive the real protocol over stdio, against an API that holds the book:

```bash
AB_OVO_API_URL=http://localhost:<port> node web/mcp/bin/ab-ovo-mcp.mjs
```

The launcher is plain JavaScript that checks for Node 22.18 before importing the
TypeScript server, because the Node that cannot strip types cannot be told so by a file it
cannot parse; `web/mcp/README.md` has the host configuration and what the variables mean. With
no `AB_OVO_API_URL` every call says what to set. With no `AB_OVO_READER_TOKEN` the reader is
anonymous, under an id kept in the user's state directory; when that cannot be kept, the
process says so on stderr, in the text of the session's first result, and in the data of every
result.

**It can be started from any working directory**, which is what a host does, and nothing in it
looks at the working directory: the book is the API's, and the reader's id is in the state
directory. Until #171 the book was looked for in the server's own checkout, and a host that
started the server from `/` was once told there was no book while it sat there (#136);
`restart.test.ts` still starts the launcher from a scratch directory with `CI` set, which is
where a test-only module once stopped the server before it could look. To see it the way a host
does:

```bash
cd / && AB_OVO_API_URL=http://localhost:<port> node /absolute/path/to/ab-ovo/web/mcp/bin/ab-ovo-mcp.mjs
```
