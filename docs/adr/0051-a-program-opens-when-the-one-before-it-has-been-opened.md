# ADR-0051: A program opens when the one before it has been opened

## Status

**Accepted**, and amended on 2026-09-20 by
[ADR-0056](0056-the-reading-order-is-gated-on-every-surface-and-every-refusal-says-what-opens-it.md),
which gates the MCP server on this same rule and gives every refusal a sentence. Two
paragraphs below are struck where it overtook them; the rule itself is unchanged.
Confirmed on 2026-09-25 by
[ADR-0065](0065-the-foundation-programs-stay-in-the-reading-order-and-the-index-says-why.md),
which keeps the Foundation programs in the order and records what would reopen it.

Amended on 2026-09-26 by issue #158, with no ADR of its own: a program's summary is served
only once the reader has reached its last frame, so the summary's *Next program* link is shown
only to a reader who has. The paragraph about that link is annotated below; the rule is
unchanged.

Date: 2026-09-20. Narrows
[ADR-0041](0041-the-reading-surface-shows-position-and-never-progress.md); constrained by
[ADR-0004](0004-identity-authservice-and-anonymous-reader.md),
[ADR-0009](0009-the-instrument-measures-the-book.md) and
[ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md), none of which
it amends.

## Context

The owner asked for it in one sentence: *a reader unlocks entry to a tile by going through
from the beginning; until then that entry should be blocked.*

The index offered forty-seven doors of equal weight. That is the right shape for a
reference and the wrong one for a **programmed text**: a Stroud frame is written to be read
after the frame before it, the book's own main sequence assumes its Foundation programs,
and ADR-0036's landing page invited a reader to start at P27 and find out four frames later
that the book had been talking to somebody else. Nothing on the page said so, because
nothing on the page could — a tile is a title and a frame count.

What was already true, and what therefore decided the shape of the answer:

- **The record is one position per program, in the reader's own browser** (ADR-0017), and
  it has carried an account copy since #11 — `ReaderProgress(Subject, Track, Unit, Step,
  Language, UpdatedAt)`, one row per program, merged by furthest-frame-wins (ADR-0019).
- **The reading pages render with no reader at all.** ADR-0004's second half requires the
  loop to work with no account and no backend, so the server that renders a frame does not
  know who is asking and must not begin to.
- **"Finished" is not a value the record has.** `entry-control.tsx` states it as a finding:
  the store holds a frame number, so *read the last frame* and *opened the summary* are the
  same record, and `program-summary.tsx` declines to write one at all rather than let N
  become a claim about a deep link.

Three gates were live. **Finish the previous program** and **open its summary** both need a
fact the record does not carry: each would cost a new field, a version bump, a migration
and a column on `ReaderProgress` — a second source of truth for one fact, and a third
entity in a domain model that AGENTS.md holds at two until a ticket says otherwise. **Any
place in the previous program** needs nothing new. It was chosen for that reason and for a
better one: it is the weakest rule that still makes the order true, and a gate that audits
how well a reader read is the measurement ADR-0009 §1 puts on the book and never on them.

## Decision

**A program is open to a reader when any one of three things is true**, and shut otherwise:

1. it is the first program of its track;
2. the reader has a place in it;
3. the reader has a place in the program immediately before it.

"Immediately before" is **adjacency in the manifest** (`unitBefore`, in
`lib/content/bundle.ts`), never arithmetic on the id — the book renumbered its own main
sequence when P07 was inserted, so `P08 - 1` stopped being a program that day.

**The rule is one pure function** (`@ab-ovo/web-kit`'s `gate.ts` since ADR-0056; it was
`lib/progress/gate.ts`, which is now the browser's adapter over it) over the record that
already exists. Nothing new is stored, nothing new is sent, and the reader who signs in gets the
same doors open on every machine because the positions were already synchronised.

**Every way into a program asks it.** The tile renders its title without a link
(`tile-entry.tsx`) and says `opens after P06` in the slot that already holds `at frame 12`;
the contents page, the frame and the summary each carry `ProgramGate`, which returns the
reader to the index; the contents page's foot does not offer a next program that is shut
(and says what opens it instead — ADR-0056).

**A shut program records nothing.** `remember-position.tsx` asks the same question before
it writes, because arriving is what records a place and a place is what opens a program —
without that, one typed URL would have bought the program permanently, and the gate on the
same page would have been the thing that made it permanent.

## Consequences

> **Struck by [ADR-0056](0056-the-reading-order-is-gated-on-every-surface-and-every-refusal-says-what-opens-it.md):**
> the tile's `opens after P06` was the whole of what this decision said about a shut
> program, and the reader who most needed it — the one a deep link had just moved — was
> the one it did not reach. The tile still says it; four more places say it at length.

**The first paint of a shut program is the program, and a reader with script off is not
gated at all.** The record is in the browser, so the gate cannot be a server redirect
without making the server know who is asking, which is the product ADR-0004 refuses. A
deep link therefore renders and is left a few hundred milliseconds later. This is a reading
order, not an entitlement: nothing behind the gate is secret, and ADR-0012's rule that a
solution is never served to the browser is enforced by the route not carrying it, which is
untouched here.

**On the index it is the other way round: the first paint is the index of a reader with no
record.** The server renders from an empty one, so the first program is a link and the
rest are titles; the reader's own record arrives with hydration and opens what it opens. A
first paint cannot be right for both readers, and this is the direction that is right for
the new one and a moment late for the returning one — the alternative offers forty-six
doors and then takes them away. The reader with script off keeps the first program's link
and the URL bar, and is gated by nothing.

**It is not a security boundary and must never be described as one.** `localStorage` is a
text field a reader can edit — `store.ts` opens with that sentence — so a reader who wants
to be at P27 can be there in ten seconds.

***Forget where I am* now costs access, not only a link.** Since ADR-0047 it reaches the
account as well, so a reader who presses it twice is returned to the first program on every
machine. That is the honest consequence of deriving the gate from the record rather than
storing a second one, and it is the strongest argument anybody will have for reopening this
decision.

**ADR-0041 is narrowed, and its test still holds.** The index now shows one thing derived
from the record that is not a position: a shut door. It is still not a progress — no
fraction, no bar, no count of frames read, and above all no tick on a finished program,
because the rule cannot tell a finished program from an opened one. The tile names the
program that opens this one, which is an instruction a reader can act on rather than a
measurement of them. ADR-0009 is untouched: no aggregate, no per-reader view, and no new
row anywhere.

**A record that skipped ahead keeps its doors open.** Clause 2 is a safety valve rather
than a convenience: every record written before this rule names the programs a reader
jumped to and not the ones before them, so without it a reader at frame 31 of P20 would
find P20 shut with their own resume control pointing into it. It is also what makes a
record arriving from another machine safe to adopt.

**It is per course, because the record is.** A position is keyed `track/unit` and
`unitBefore` reads one bundle, so the first program of EVERY course is open and a reader
who has walked one course has opened nothing in another. The index that narrows to a
course ([ADR-0048](0048-the-courses-are-a-page-and-the-index-narrows-to-one.md)) therefore
needs no rule of its own, and the redirect carries the reader's course as well as their
edition — through `indexHref`, which is the one place that address is built.

> **Amended by issue #158:** a deep link to `/summary` short of the program's last frame is
> now refused on arrival, with the frame's *Not there yet*: `AbOvo.Api` serves the summary
> under the last frame's own gate (`Reveal.ServeReturnIndex`). The *Next program* link below
> is still not gated, and is now shown only to a reader who has reached the last frame.

**The summary's *Next program* link is not gated, and that is a judgement rather than an
omission.** Reaching a summary the way the product intends means having read to the last
frame, which is a place, which opens the next program. The link is shut only for a reader
who deep-linked to `/summary`, and the gate catches them one navigation later.

> **Struck by [ADR-0056](0056-the-reading-order-is-gated-on-every-surface-and-every-refusal-says-what-opens-it.md).**
> The conversation this paragraph deferred has happened, and the answer went the other
> way: the reading order is a property of the book rather than of a navigation, and two
> surfaces reading one record while disagreeing about which doors are open is a defect a
> reader meets and nobody can explain. `open_program` now refuses a shut program and names
> the one that opens it. The paragraph is kept because its reasoning is what the new ADR
> had to answer.

~~**The MCP server is not gated, and it could be.** `web/mcp` reads the same record — its
cursor store IS `ReaderProgress`, over the same API the browser's BFF uses — so
`open_program` could ask this question and does not. It is left alone deliberately: the
request this decision answers was about the reading surface, the two surfaces have never
shared a navigation rule, and gating a tool call is a different conversation about what a
host may do on a reader's behalf. Until that conversation happens, `open_program` opens
any program, and no document may claim the gate covers the whole product.~~

**The acceptance suite grew a seed.** Specs that deep-link past the first program — the
worksheet, the sync, the bearer hop, the landing page's own P01 assertions — are journeys
of a reader who got there, so they call `openThrough` (`specs/support/gate.ts`) to have the
record such a reader would have. `specs/gate.spec.ts` is the journey itself, and
`lib/progress/gate.test.ts` holds the rule at the layer with the logic (P13), including the
two cases a browser cannot reach: a record written before the rule and one merged from
another machine.

**The committed screenshots are of a reader with no record**, so `landing-english.png` and
its siblings now show one open tile and the rest saying `opens after …`. They are
regenerated by `specs/screenshots.spec.ts` — `docs/how-to/capture-the-screenshots.md` is
the procedure — and until that is run against the real bundle they are one release out of
date.
