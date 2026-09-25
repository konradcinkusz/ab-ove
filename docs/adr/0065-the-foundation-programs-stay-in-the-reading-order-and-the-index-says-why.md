# ADR-0065: The Foundation programs stay in the reading order, and the index says why

## Status

**Accepted.** Date: 2026-09-25. Decided for #154 (order 540 in
[`docs/ux/UI-UX.md`](../ux/UI-UX.md#the-order)) under the owner's delegation of that date.
The option taken keeps the reading order the owner asked for in ADR-0051.

Confirms [ADR-0051](0051-a-program-opens-when-the-one-before-it-has-been-opened.md) and
[ADR-0056](0056-the-reading-order-is-gated-on-every-surface-and-every-refusal-says-what-opens-it.md)
and amends neither. Constrained by [ADR-0009](0009-the-instrument-measures-the-book.md),
[ADR-0041](0041-the-reading-surface-shows-position-and-never-progress.md) and
[ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md).

## Context

#154 asked whether a reader who already knows the Foundation programs may start the Main
sequence. What was true when it was asked, read rather than recalled:

- **The rule is ADR-0051's.** A program opens once the reader has a place in the program
  before it, and "before" is adjacency in the manifest. P01 follows F13, so a new reader
  opens one frame of every Foundation program, in order, before P01 opens. The audit measured
  about 36 clicks on 2026-09-24: index, program, frame, over and over.
- **The course is written for AI engineers**, and many of them know that material already.
- **The gate is a reading order, not an entitlement.** `web/web-kit/src/gate.ts` says it is
  "not a security boundary".
- **The book answers this reader itself.** Its "How to use this book" has a section, *If you
  already have a degree* (`frontmatter/en/how-to-use.tex`; the Polish edition says the same).
  It tells that reader not to read Part I in order: work each Foundation Quiz, enter a
  Foundation program only where its Quiz goes badly, "then start at Program 1 and read the
  main parts in order". It names F3 and F12 as worth working even when the Quiz goes well.
  So the book's route for this reader still passes through every Foundation program. It
  passes through the Quiz, though, not through the frames. P01's first frame opens by citing
  "Program F1".
- **The app cannot offer that route yet.** The pinned bundle (`dev-e24a4919026e`) is schema
  v1. Its quiz routes carry no question
  ([ADR-0046](0046-schema-2-carries-the-books-third-stage.md)), and none of its units carries
  a `part`. That was checked on 2026-09-25 against the compiled bundle.

#154 laid out three options:

1. Keep ADR-0051, and say on the index why the Foundation programs come first.
2. An explicit, recorded choice, "I know the foundations — start at P01".
3. Make the Foundation part recommended rather than required, so the gate works only within a
   part.

## Decision

**The reading order stays as ADR-0051 decided it, on every surface (ADR-0056).** P01 opens
once the reader has a place in F13, just as every other program opens after the one before
it. Nothing in the code changes.

**The index says why the Foundation programs come first, and it says so without a hover.**
The place for it is #163 (order 630). That issue puts a legend line above the grid whenever
a tile is shut, and links the shut notice to the program that opens it. This decision adds
two things the legend must also say, as visible text:

- the Main sequence is built on the Foundation programs;
- nothing is hidden or paid for. Today that clause is only in the shut tile's `title`
  tooltip (`web/app/src/components/programs/tile-entry.tsx`), which touch and keyboard
  readers never see.

#163's body was amended on 2026-09-25 to carry both. The wording and the Polish belong to
that issue. ADR-0056's refusals already say why a program is shut and how small the
move that opens it is, but only after a door has been tried. The legend says it on the first
screen.

**Option 2 is not taken.** It makes the gate a stored fact:

- **The choice needs somewhere to live, and has nowhere cheap.** ADR-0051 chose its rule
  because it stores nothing. A declared choice is neither a position nor derivable from one.
  The browser could hold it: an anonymous reader's gate is still computed from
  `localStorage` today (`web/app/src/lib/progress/gate.ts`). But ADR-0060 decided that this
  store becomes a resume hint, and the next bullet says why the browser alone is not enough.
  `ReaderPreference` holds the edition and nothing else, and its endpoints need a sign-in. So
  a server-held choice would need either a new field (a migration) or a new entity, and
  AGENTS.md item 3 holds the model at its size until a ticket says otherwise.
- **Both surfaces would have to know it.** Suppose the browser held the choice and the MCP
  server did not. That is the disagreement ADR-0056 was written to end. So the choice would
  have to be held by the server for anonymous readers too, which widens the per-reader state
  that [ADR-0061](0061-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md) kept to
  a single cursor.
- **It needs rules of its own.** *Forget where I am*
  ([ADR-0047](0047-forgetting-is-two-presses-because-it-reaches-the-account.md)) and account
  deletion would each have to decide what happens to the choice.
- **It replaces the book's triage with a declaration.** The book asks this reader to take a
  Quiz in each Foundation program. It never offers "I know this".

**Option 3 is not taken:**

- **It reverses the owner's request for everyone** instead of making room for one reader.
  Every new reader would find P01 open on the first screen, including the reader who does not
  know the material. ADR-0051 was written for that reader: someone who starts in the middle
  and finds out four frames later that the book was talking to somebody else.
- **It needs a boundary the pinned bundle does not carry.** No unit has a `part`. Without
  one, the Foundation–Main boundary is visible only in the letter an id begins with. The
  index uses that letter to group its tiles under a label, and that is all it is fit for.
  ADR-0051 refuses to read structure out of an id, and `gate.ts` gives the reason: "an id is
  a name, not an index".
- **The book does not make Part I optional.** It makes it quick: a Quiz each.

**What would reopen the question.** Each of these is a fact, not a feeling:

1. **A schema-2 bundle carrying the Foundation Quizzes is pinned** (ADR-0046). The book's own
   route can then be rendered, and the question becomes whether answering a program's Quiz
   opens the next program. That is option 2 in the book's own shape, and it needs its own ADR.
2. **The book changes its advice or its order.** The order belongs to the book (ADR-0056),
   and the gate follows it.
3. **Readers tell the owner that the gate stops them.** Told, not measured: nothing may count
   readers at the gate (ADR-0009;
   [ADR-0020](0020-no-aggregate-touches-the-progress-store.md)), and no metric is to be added
   to find out.

**One argument for reopening it is already standing, and was weighed here.** Since ADR-0047,
*Forget where I am* costs a reader access as well as a place. ADR-0051 calls this "the
strongest argument anybody will have for reopening this decision". It is not a future fact,
so it is not in the list above. This decision keeps the order anyway: what a forget costs is
the same walk a new reader takes, one frame per program.

## Consequences

**A reader who knows the material still pays for it before P01.** The audit measured about
36 clicks on 2026-09-24. This decision accepts that cost instead of removing it. In return
the product keeps one rule and stores nothing, and the two surfaces agree. The cost is a
click per program, not a reading: arriving on a frame records the place, and nothing asks
that frame to be answered. #163's sentence and its link make the cost cheaper to understand.
They do not remove it.

**On the MCP server the same walk is one `open_program` call per Foundation program.** It
stays one call for an anonymous reader once #171 lands, because
[ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§2 gives that reader a write that records opening a program. An agent can make those calls
for the reader. ADR-0056's refusal already names the program that opens the next one, so the
agent knows which call to make, and nothing here changes that.

**The program order is still held by the surfaces and never by `AbOvo.Api`.**
`ContentEndpoints` serves the first step of any program to any caller, and a step's reveal
gate knows nothing about the program before it (read on 2026-09-25). This decision does not
move the order into the API. It is a reading order, not an entitlement, and a reader who
wants P27 can still be there in ten seconds (`gate.ts`).

**#154's second done-when does not arise.** The option taken is the first, so no
implementation issue is opened and no row is added to the order table.

**This is not a deviation from the reference architecture**, and it adds no row to the
deviation register in [`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md).
