# The product, in pictures

What ab-ovo looks like to a reader, screen by screen, captured from a real production build.

> **Polish edition:** [`SCREENSHOTS.pl.md`](SCREENSHOTS.pl.md)

Every image below was taken by
[`../tests/e2e/specs/screenshots.spec.ts`](../tests/e2e/specs/screenshots.spec.ts) driving the
application the same way the acceptance suite drives it — a production build, a real browser,
the same content bundle the reader would be served. Nothing here is a mock-up and nothing was
retouched. To take them again, see
[`how-to/capture-the-screenshots.md`](how-to/capture-the-screenshots.md).

**These are the one generated artefact this repository commits.** Everywhere else the rule is
that nothing generated is committed — no PDF, no rendered diagram, no `web/content/`. The
exception is forced rather than chosen: a Markdown document on GitHub cannot render an image
that exists only inside a workflow run's artifact, so a tour illustrated with build output
would show a reader nothing at all.

---

## The mechanism, in two pictures

This is the whole product, and it is the one thing worth understanding before anything else.
A Stroud frame asks you for something **before** it tells you anything, and the next frame
opens with the answer you were supposed to have written down.

### Frame 3 asks

![A frame of program F01. It opens with the previous frame's answer in a tinted box, explains what a rational number is, then asks the reader to write down the decimal expansion of one third. Below the question: a dotted answer line reading "Write it down before you read on", two outlined buttons side by side reading "Work it out" and "Draw it", and a filled "Reveal the answer" button. At the foot, a row of three: "← Previous", the frame count, and "Next section →", with a "Reading settings" disclosure below it.](assets/screenshots/frame-asks-english.png)

The question is *write down the decimal expansion of ⅓*. The answer to it is **not on this
page**: not in an element, not in an attribute, not in a script, and not prefetched. A reader
who opens the inspector finds nothing, because there is nothing to find
([ADR-0014](adr/0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md)).

### Frame 4 answers

![The next frame. It opens with "0.333…, repeating without end" in the same tinted box, then carries on to explain that a rational number's decimal expansion either stops or repeats, and asks the next question.](assets/screenshots/frame-reveals-english.png)

The reveal is a **navigation**, not a toggle. Frame 4's opening *is* frame 3's answer, and it
arrived with frame 4's HTML. That is what makes the property structural rather than a
discipline somebody has to keep: there is no disclosure widget to defeat, because the answer
was never sent.

Both halves are asserted by the acceptance suite, and both were watched failing before they
were believed.

---

## The reading surface

### The place row is the only chrome

The row above the frame carries the program id, the program's title, the section you are in,
the language control, and where you are — `3 / 45`. That frame number is a jumper: press `g` and
type a number. **It shows position and never progress**
([ADR-0041](adr/0041-the-reading-surface-shows-position-and-never-progress.md)) — a percentage
over a book of 47 programs would be a number about the reader, and this product does not make
those.

### The same frame, in Polish

![The same frame of F01 rendered in the Polish edition: the same tinted answer box, the same question, the same worksheet controls, all in Polish.](assets/screenshots/frame-asks-polish.png)

The book is set in English and Polish, and the edition is the reader's choice rather than
something guessed from a header
([ADR-0052](adr/0052-one-language-control-remembered-and-english-by-default.md)). Switching
is a link in the place row; it keeps your frame number — and it is remembered, so the
question is asked once rather than on every screen.

### The worksheet

`Work it out` opens a pad that evaluates arithmetic — a calculator, deliberately not a
computer algebra system ([ADR-0042](adr/0042-the-evaluator-is-a-calculator-not-a-cas.md)).
`Draw it` opens a canvas that takes strokes and never opens itself
([ADR-0043](adr/0043-a-sketch-is-strokes-and-the-pane-never-opens-itself.md)); once a frame
holds a drawing, that button says `Show my sketch` instead. Both are optional, both are
local, and nothing a reader writes on a frame leaves their browser
([ADR-0039](adr/0039-a-frame-accepts-the-readers-answer-as-a-commitment.md)).

They are named by the act and sized to a finger — a 44 px outlined button each, side by side,
either one taking the whole row when it opens
([ADR-0059](adr/0059-a-worksheet-pane-opens-from-a-button-and-says-when-it-holds-a-drawing.md)).

### At a phone width

![The same frame at 360 pixels wide. The place row wraps, the measure narrows, and the worksheet controls stack; the foot becomes one full-width control per row. Nothing is cut off and nothing is positioned over the text.](assets/screenshots/frame-narrow-english.png)

360 px is asserted against the canvas in `specs/narrow-screen.spec.ts`, so this is a checked
property rather than a screenshot somebody once took.

### In dark mode

![The same frame with a dark background and light text: the answer box, the links and the reveal button all re-coloured, not merely inverted.](assets/screenshots/frame-dark-english.png)

Dark mode is a full token swap, not an afterthought — a reader working through a program at
night is the normal case. So is one working it at a desk under a lamp, which is why every
reading screen carries a three-position switch: **System**, **Light**, **Dark**. It is inside
the *Reading settings* disclosure at the foot, with the keyboard map, rather than in the row a
reader scans for the way forward
([ADR-0058](adr/0058-the-reading-foot-is-one-pager-and-the-settings-leave-it.md)). The
first is the default and is `prefers-color-scheme`, exactly as it was before the switch
existed — it is a position a reader can return to rather than the absence of a choice, and it
is the one that needs no JavaScript
([ADR-0048](adr/0048-the-theme-is-a-choice-and-the-system-is-a-position.md)).

---

## Finding something to read

### The landing page is the index

![The landing page. A wordmark; links to Courses and About, a three-position theme switch reading System, Light and Dark, and a link to Sign in; then the Programs heading with the language control offering English and polski at the end of its line, and a grid of tiles — one per program, each with its id, the program that opens it, its title, and how many frames and sections it has. At the foot of the page, a card headed "Help fix the book?" with two buttons.](assets/screenshots/landing-english.png)

The first screen is the thing a reader came for, one navigation from a frame instead of two
([ADR-0036](adr/0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md)). It is a
Server Component that makes no fetch and needs no backend; it reads one cookie, this origin's
own, which is where the reader's chosen edition is kept so that the first paint is already in
it ([ADR-0052](adr/0052-one-language-control-remembered-and-english-by-default.md)).

The card at the foot is the **consent invitation**, and it is last on purpose: a reader who
came to read reaches the programs first and the question afterwards. It is an invitation
rather than a gate, it is three-valued — granted, declined, not yet asked — and it lives in
the browser ([ADR-0022](adr/0022-consent-is-local-versioned-and-three-valued.md)).

### In each edition

![The landing page in the Polish edition: the programs' Polish titles, the Polish chrome.](assets/screenshots/landing-polish.png)

A reader who has chosen nothing reads English. The control at the top of every screen is the
only way to change that, a choice is `/?lang=<edition>` — visible, linkable, leaveable, never
inferred from `Accept-Language` — and **it is remembered**: in this browser, and on the
reader's account when they have one, so the question is asked once rather than on every
screen (ADR-0052).

![The landing page in dark mode.](assets/screenshots/landing-dark.png)

### A program's contents

![The contents of program F01: the program's title, its sections listed with the frame each one starts at, and a way in.](assets/screenshots/program-contents-english.png)

### And its summary

![The end of program F01: a Summary section, a "Can you?" checklist restating what the program set out to teach, and the way into the next program.](assets/screenshots/program-summary-english.png)

*Summary* and *Can you?* are the book's own closing sections, not something this application
invented.

---

## The parts a reader may never reach

### The argument

![The /about page: a masthead reading "a book you work, not a book you read", the anti-goal stated immediately after it, the four steps of the loop, what the product needs from the reader, where the work is, and a live integration panel at the foot.](assets/screenshots/about.png)

The order **is** the argument. The anti-goal — *the instrument measures the book, never the
reader* — is above everything else on the page, because the pressure to misuse a number always
arrives from somebody who did not read to the end.

The panel at the foot is the one live thing on the page and the only component in the app that
reads `/api/config`. Its third state is the interesting one: **unreachable** is not an error,
because "no API answered" is a supported configuration of this product (P8).

### Sign-in

![The /login page: a form for an email address and a password, posting to this app's own origin.](assets/screenshots/login.png)

The form posts **credentials** to `/api/auth/login`, which talks to the identity service
server-side, so a token is never in the document at all
([ADR-0018](adr/0018-password-sign-in-happens-server-side.md)). There is no JavaScript on the
happy path. Where no identity service is configured the page says so plainly rather than
offering a button that cannot work.

An account buys exactly one thing: the same place in the book on a second machine. The reader
loop is identical without one.

### The exercises

![The /lab/p01 page: the book's Lab P1, its exercises listed with the checks each one carries, and a file to work in.](assets/screenshots/lab-p01.png)

The book's own computer exercises, running under Pyodide **in the reader's browser** — no
account, no backend, no Python on any server, and no code leaving the machine
([ADR-0007](adr/0007-exercise-checks-are-python-in-the-browser.md)). The reference solutions
are fetched so the build can prove the exercises solvable and are never served to the browser
([ADR-0012](adr/0012-solutions-are-never-served-to-the-browser.md)).

**It is no longer in the reader loop**
([ADR-0040](adr/0040-the-python-lab-leaves-the-reader-loop.md)): a reader of a mathematics
book should not have to write Python to answer a frame. It is reached from one line on P01's
summary and from nowhere else.

---

## What is not pictured here, and why

- **`/account` and `/instrument/<track>/<unit>`** need an account, which needs an identity
  service. The acceptance suite has one — a stub it starts itself — but photographing a screen
  whose every number came from a fixture would illustrate the fixture rather than the product.
  What those screens do is described in [`ux/UI-UX.md`](ux/UI-UX.md) and drawn in
  [`DIAGRAMS.md`](DIAGRAMS.md) §B6 and §C3.
- **A deployed instance.** There is none, at any address, for anybody. Every screen above was
  served by a local production build.
