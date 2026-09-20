# ADR-0048: The courses are a page of their own, and the index narrows to one

## Status

**Accepted.** Date: 2026-09-20.

Extends [ADR-0036](0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md), which
made `/` the index of programs, and applies
[ADR-0015](0015-the-reading-index-has-no-default-language.md)'s refusal of a default one
level up. Neither is superseded.

## Context

ab-ovo is a platform for programmed-learning **courses**, not an application wrapped around
one of them. The content layer has said so from the start: `PINS` in
`web/app/src/lib/content/bundle.ts` is a list of `(track, tag)` pairs, `bundleFor` takes a
track, every reading URL is `/read/<track>/<unit>/<lang>`, and the MCP server's
`list_programs` already names a track per call and says which to use when a server carries
several.

The reading surface did not say so. One course is pinned today, and three things were
written as though one were the maximum:

- **`/` stacks every pinned course**, one section each, in pin order. That reads correctly
  for one course and becomes a scroll of several hundred tiles for three — the same defect
  ADR-0036's own grouping note records at the level below ("forty-seven entries in one list
  is a scroll rather than an index").
- **There was no way to ask for one course.** The index narrows by edition, `?lang=`, and by
  nothing else, so the only address for a course was a deep link into one of its programs.
- **The document title named one course for every page of the product** — `ab-ovo —
  Mathematics from Zero for the AI Engineer` — so a second course's frames would carry a
  first course's name in the browser tab.

Two constraints govern the fix, and they are the same two ADR-0036 worked under:

- **ADR-0004 — the reader loop works with no account and no backend.** Whatever chooses a
  course must render from content compiled into the app.
- **[ADR-0015](0015-the-reading-index-has-no-default-language.md) — nothing is chosen for
  the reader.** A platform that served one course by default would make the same editorial
  claim about which work matters that ADR-0015 refuses to make about which edition does,
  one level up and louder.

A word had to be picked, and it is the part of this decision most likely to be revisited.
*Program* is what a reader reaches for, and it is taken: it is this application's word for
one of the forty-seven units of a course — the book's own term, from programmed learning —
and it is on the index's heading, on every breadcrumb and in `groupLabels`. One word cannot
mean both without a reader finding out by pressing the wrong thing.

## Decision

**A course is what a reader chooses between, and `/courses` is where.** It lists every
pinned course with its title in each edition, how many programs and frames it has, and the
editions it is published in — all of it read from the compiled bundles, so the page makes no
fetch, reads no cookie and needs no backend. It is public in the middleware's list on the
index's own terms.

**The word is *course* in English and *kurs* in Polish, in `lib/i18n/chrome.ts` with every
other word for readers.** The code keeps saying `track`, which is the content's word and
stays in the schema, the routes and the MCP tools. *Program* keeps meaning what it has
always meant here.

**`/` narrows to one course with `?track=<id>`**, beside `?lang=<edition>` and independent
of it. Every way of naming a course the deployment does not serve — absent, repeated,
unknown, empty — resolves to the index that shows every one, which is not an error and not a
fall back to the first course. `lib/content/chosen-track.ts` is the one place that resolves
it, mirroring `chosen-edition.ts`.

**The two narrowings never undo each other.** Every position of the edition switch carries
the chosen course, the sign-in return address carries both, and `lib/index-href.ts` is the
single builder of that address so no caller can drop half of it.

**A reader can always get out of a narrowing, and into one, from the index itself.** Beside
a course's title: *Only this course* when the index is showing every one, *All courses* when
it is narrowed — one control in two states, absent while the deployment pins a single course
because both labels would lead to the page the reader is already on.

**The top row of the index carries *Courses*, before *About ab-ovo*.** Unlike the two
controls above, this link is offered whatever the deployment pins: a page that lists one
course states what ab-ovo carries, where a *switch* with one position would be a control
that cannot move.

**The product's own name for itself is the platform, not a course on it.** The root layout's
title is `ab-ovo — courses you work, a frame at a time`; the course pinned today is named in
the description, where it is a fact about this deployment rather than a claim about the
product.

## Consequences

**The reader's surface now has two words that sound alike, and the burden is on the
labels.** *Courses* and *Programs* sit in the same chrome row minutes apart, and a reader
who has not read either page cannot tell from the words alone which is the bigger thing. The
alternative was worse in both directions: reusing *program* for a course would have made the
index's own heading ambiguous, and renaming the forty-seven units would have put this
application at odds with the book that compiles them and with every ADR that names them. If
this proves to be the wrong trade, the labels are two strings in `chrome.ts` and this file is
what a replacement has to argue with.

**The index is still one page, and a deployment with many courses will eventually outgrow
it.** `?track=` makes a long index narrowable, not short. A platform carrying ten courses
wants the unnarrowed index to be something else — a page of courses, with programs behind
them — and that is a decision for the deployment that has ten, taken with a real page to look
at rather than now.

**The resume control reads from every pinned course, not from the one on screen.** A place
stored in a course the reader has just narrowed away from still produces *Continue at frame
12*, because the alternative — the index's one filled control disappearing when a filter is
applied — would read as the place having been forgotten. The limits map is therefore built
from `bundles` and never from the narrowed set; the clause about a program the *content* no
longer has is unaffected.

**The edition switch now offers the editions of what is on screen.** On a narrowed index
that is the chosen course's editions, so a deployment whose second course is English-only
cannot light a Polish position whose page has nothing in it. The unnarrowed index is
unchanged, which is why no existing assertion moved.

**The acceptance suite cannot see a second course, and says so where it counts.**
`specs/support/bundle.ts` reads the single compiled bundle the application serves, so
`specs/courses.spec.ts` asserts one entry per pinned course and fails loudly the day a
second is pinned — the file that has to learn to read a second bundle is named in the
assertion. The multi-course properties are held at the layer with the logic (P13):
`lib/content/chosen-track.test.ts` is written against two courses, and
`lib/index-href.test.ts` against every combination of the two query parameters.

**Nothing here pins a second course, and the content pipeline is still the blocker.**
`web/content/book.lock.json` carries one `contentBundle`, `scripts/fetch-book-content.sh`
compiles that one into one destination, and `PINS` derives one pin from it. A second course
needs that lock file to carry a list and the fetch script to walk it —
`docs/ux/UI-UX.md`'s backlog item **350 — a second track** — which is content work, not
this. What this decision removes is the reason that work would also have needed a redesign
of the first screen.

**One screenshot in `docs/SCREENSHOTS.md` is now a picture of an older top row.** The docs
workflow re-captures and reports the difference rather than gating on it; the image is
replaced when a maintainer looks at the capture, which is that workflow's own rule.

Not a deviation from the reference architecture; no register row.
