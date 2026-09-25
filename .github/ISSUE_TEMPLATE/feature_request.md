---
name: Feature request
about: Propose something this system should do and does not
title: ''
labels: enhancement
assignees: ''
---

<!--
  REPO-BASELINE.md §1 — this form asks for impact the way the bug form asks for a repro.
  The questions below are the ones that decide whether a proposal can be built as written.
-->

## The problem

<!--
  The situation a reader or an operator is in, not the feature. "There is no way to X"
  rather than "add a button that X". A proposal stated as a solution has already closed
  off the alternatives.
-->

## Who it is for

<!-- A reader with no account? A reader mid-program? The operator? The instrument? -->

## What it would change

<!-- Which surface: the reader loop, the lab pane, the API, the schema, the instrument. -->

## What it must NOT break

<!--
  These are properties of this system, not preferences. A proposal that breaks one is not
  necessarily wrong, but it has to say so out loud.
-->

- [ ] **Reading needs no account.** Read a frame, commit an answer, reveal the next — none of
      it asks who the reader is; an anonymous reader's place is an opaque cookie, never a
      token (ADR-0061). That is the product's floor.
- [ ] **Every frame and every reveal is a live, gated call to `AbOvo.Api`.** Nothing renders a
      frame from anywhere else, and an API that does not answer is said to the reader rather
      than papered over (ADR-0060).
- [ ] **A fresh clone with every optional integration skipped still runs.**
- [ ] **The image stays promotable across environments** — no address baked in at build
      time.
- [ ] **The instrument measures THE BOOK, never the reader.**

<!--
  That last one is an anti-goal, not a caveat. Everything the instrument collects exists to
  answer "is this frame teaching" — whether a frame's elicitation fires, where readers stop,
  which exercise has no working path through it. Nothing in it exists to rank a person, and
  a proposal that would need that is out of scope by construction rather than by policy.
-->

## Acceptance

<!--
  How would anyone know this was delivered? A sentence somebody could check, not a feeling.
  If the answer involves a number, say which number and what it would have to read.
-->

## What you considered and rejected

<!-- Optional. The alternatives are half the value of the proposal. -->

## Where it would live

<!--
  Roughly: which project, which phase. Phase 1 = the lab pane. Phase 2 = content schema +
  frame view. Phase 3 = progress and accounts. Phase 4 = the instrument.
-->
