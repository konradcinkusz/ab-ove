# ADR-0056: The reading order is gated on every surface, and every refusal says what opens it

## Status

**Accepted.** Date: 2026-09-20. Amends
[ADR-0051](0051-a-program-opens-when-the-one-before-it-has-been-opened.md) — which left the
MCP server ungated on purpose and said the conversation would have to happen — and narrows
nothing else. Constrained by
[ADR-0004](0004-identity-authservice-and-anonymous-reader.md),
[ADR-0009](0009-the-instrument-measures-the-book.md),
[ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md) and
[ADR-0019](0019-furthest-frame-wins.md), none of which it amends.

## Context

The owner put it in one sentence: *there is nowhere I can find out why a program will not
open; I cannot tell why I cannot open F02.* ADR-0051 shipped the rule and two places that
state it, and the places turned out to be the wrong two.

What was true before this decision, checked rather than recalled:

- **The index tile says `opens after F01`**, in the slot that already holds `at frame 12`
  (`tile-position.tsx`). Three words, in the faintest type on the page, arriving after
  hydration into one tile among forty-seven. It is the right size of note for a reader
  *scanning* the index and it is the whole of what the product said.
- **A deep link was answered by a silent navigation.** `program-gate.tsx` replaced the
  address with the index and a fragment. ADR-0051's own consequence called the tile's note
  "the whole of the explanation, and it is at the destination rather than in a notice this
  page would have to invent" — which assumes a reader who notices a navigation they did not
  ask for, understands that the new page is an answer to the old address, and then finds
  one tile in forty-seven. A reader following a bookmark cannot tell a rotted link from a
  deleted program from a reading order.
- **The contents page's foot said nothing at all.** `when-open.tsx` rendered the way on
  only while the reader could take it — a control that is reliably refused is worse than no
  control — and put nothing in its place. The foot of F01 was the one screen in the product
  where F02's *existence* was withheld.
- **The MCP server had no gate whatsoever.** ADR-0051 left it so deliberately and said what
  that cost: "no document may claim the gate covers the whole product." Both surfaces read
  the same `ReaderProgress` row (`web/mcp/src/cursor.ts` — "a second table keyed by reader
  would be a second answer to where is this person"), so a reader could be inside a program
  in one window that the other window refuses, with neither able to explain the other. An
  agent could not answer *why can I not open F02* because on its own surface the question
  had no answer.

The line ADR-0051 drew — "gating a tool call is a different conversation about what a host
may do on a reader's behalf" — is the conversation this ADR is. The answer is that the
reading order is a property of **the book**, not of a navigation: the reason P27 assumes
P26 is that Stroud wrote it that way, and a tutor that starts a reader four frames into a
conversation they cannot follow has done the same damage a tile would have.

## Decision

**Every surface asks the same question, and it is one function.** `isOpenWhere`
(`web/web-kit/src/gate.ts`) states the rule ADR-0051 decided — first program, or a place in
it, or a place in the one before it — and takes a *predicate* rather than a record, because
the two callers hold a reader's places in shapes that have nothing to do with each other: a
`Progress` out of `localStorage` and `Cursor` rows over HTTP. `@ab-ovo/app`'s
`lib/progress/gate.ts` is now an adapter over the browser's record and the MCP server's
`shutBehind` is one over the cursor store. It is exported from `@ab-ovo/web-kit/gate` and
not from the barrel, because the barrel reaches `node:fs` and the browser's copy of the
rule must not.

**`open_program` refuses a shut program**, before it asks which edition to read, and the
refusal is a `Refusal` in the gate's own voice (`refused`, not `problem`) — not an error,
because a reader starting at the wrong end of a book has broken nothing. `current_step`,
`submit_answer` and `review_step` answer the same way instead of advising a call that is
itself refused. `list_programs` marks every program `open to the reader now` or `SHUT,
opens after F01`, and states the rule once per track.

**Every refusal names the program that opens it, and says that one step of it is enough.**
That clause is load-bearing rather than friendly: ADR-0051 chose the weakest gate that
still makes the order true, and "opens after F01" read alone means "finish F01 first",
which is a much larger promise than the code keeps. Each of the five sentences — the tile's
tooltip and its screen-reader description, the index notice, the contents foot, the MCP
refusal, the MCP listing — answers the same four questions in the same order: what was
refused, why this is what happened, what opens it and how small that move is, and where to
go now.

**The reason for a bounce travels in the address.** `program-gate.tsx` redirects with
`?shut=<unit>`, the index resolves it against the manifest (`refused-program.ts`) and
`shut-notice.tsx` puts it **back to the gate** against the reader's own record before it
says a word, rendering nothing when the answer is "open". A query parameter is a claim
anybody can type and one that goes stale the moment the reader opens the program in another
tab; it names the program to ask about and never the answer. The notice takes focus once on
arrival, so the explanation is what the reader lands on rather than the tile below it.

**No new state, on either surface.** The gate is still a question put to the record that
already exists. No field, no version bump, no migration, no third entity — ADR-0051's own
reason for choosing this rule, unchanged.

## Consequences

**The MCP server can now refuse a call it used to answer, and that is a behaviour change
for anybody who had one wired up.** A host that opened P27 for a reader with no record will
be refused where it used to be served. It is the correct refusal and it is still a
refusal: ADR-0051's clause 2 means no reader loses a program they have *already* opened,
so what changes is the jump, not anybody's place.

**A model can report a refusal as a failure, and prose is the only thing stopping it.**
`tools.ts` opens with that limit — "a tool description is a request, not a rule" — so the
refusal sentence, `SERVER_INSTRUCTIONS` §8, `open_program`'s description and the `read`
prompt all say the same thing four times over, and none of them is a gate on the model's
wording. The test asserts the server's half; what the assistant then says is a request.

**The index grew a block that moves the grid down.** Everything else on that page that
arrives after hydration extends a line rather than adding one, because `progress.spec.ts`
holds the page's layout shift at zero. The notice renders on exactly one visit — the one
the reader did not ask for, where they are not scanning the grid yet and focus moves to the
notice as it lands — and on no other, so the bound the rest of the page is held to is
untouched.

**The contents foot now prints a sentence where a control was refused.** That is a
deliberate exception to the repository's own rule about dead affordances, and the
distinction is that a *control* stays absent while a *fact* is owed: the reader is told the
next program exists and what opens it, in plain text that cannot be clicked, focused or
opened in a new tab.

**Two sentences in ADR-0051's Consequences are now false and are struck there**, rather
than left to be found: the MCP paragraph, and the claim that the tile's note is the whole of
the explanation.

**The screenshots are unchanged.** The committed captures are of a reader with no record on
the index (`landing-english.png` and siblings), and nothing on that first paint moved: the
notice needs `?shut=`, and the tooltip and description are attributes rather than pixels.

**What is still not covered.** A reader with script off is gated by nothing and told
nothing, exactly as before (ADR-0051) — the gate is client-side because the record is, and
ADR-0004 is what put it there. And this is still not a security boundary: `localStorage` is
a text field a reader can edit and the MCP cursor is a row they own, so a reader who wants
to be at P27 can be there in ten seconds. Nothing behind the gate is secret, and ADR-0012's
rule about solutions is enforced by the route not carrying them.
