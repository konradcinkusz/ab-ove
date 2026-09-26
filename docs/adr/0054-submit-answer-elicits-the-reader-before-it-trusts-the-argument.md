# ADR-0054: `submit_answer` elicits the reader before it trusts the argument

## Status

**Accepted.** Date: 2026-09-20.

Narrows [`MCP-SERVER-SKETCH.md`](../architecture/MCP-SERVER-SKETCH.md) §3's own stated
limit on a host that supports the mechanism this ADR adds; changes nothing on one that
does not.

## Context

`MCP-SERVER-SKETCH.md` §3 named the one problem no gate in this server can decide: whether
the `answer` argument `submit_answer` receives is actually the reader's, because the model
fills that argument regardless of where the text came from. The mitigation on record —
a prose contract plus echoing the recorded text back — is described there in its own words
as "a narrowing, not a fix... the honest limit of this design." That description was
accurate for what the installed SDK could do at the time it was written.

The installed SDK, `@modelcontextprotocol/sdk@1.30.0`, carries `Server.elicitInput()` and
`Server.getClientCapabilities()`. MCP elicitation lets a server ask the CLIENT to put a
form in front of the human user and return what they submitted — a channel that does not
pass through the model's own output at all. Where a host supports it, "no gate can decide
whether the answer that arrived is the reader's" stops being true: the gate is the form.

## Decision

`submit_answer` takes an optional `elicit` function on `Deps` (`web/mcp/src/tools.ts`):
`(step, proposed, language) => Promise<ElicitOutcome>`, where `ElicitOutcome` is `confirmed`
(carries the reader's own text), `declined`, or `unavailable`. `language` is the step's
edition, which the form's words follow; it was added with #167, and the decision recorded
here does not change with it. `server.ts` wires it to a closure that
checks `getClientCapabilities()?.elicitation?.form` and, if present, calls `elicitInput`
with the model's proposed answer as the form field's `default` — pre-filled, editable,
never assumed correct.

**On a step with a cue** (one that asks for something) **and a host that supports
elicitation, the elicited answer replaces the model's argument outright; it does not merely
confirm it.** The model may still pass `answer`, and should — it becomes the form's
pre-filled suggestion rather than a claim taken on faith, and an assistant that composed a
wrong one gets overruled by whatever the reader actually typed or accepted. The model may
also pass nothing, and the reader is asked directly; today's rule that a cue step needs a
non-empty answer to proceed still applies to what the FORM returns, not to the argument.

**A decline or a cancel records nothing and does not move the reader** — the same shape as
every other refusal in this server (`reveal.ts`'s own "not-reached is the product working,
not a fault"), answered as an ordinary result, never `isError`, telling the model to ask in
the conversation instead.

**Every failure collapses to `unavailable`, including a client that claimed the capability
and then failed the call.** `submit_answer` does not distinguish "this host cannot elicit"
from "elicitation was attempted and something went wrong" — both fall back to trusting the
argument, exactly the behaviour a host with no elicitation support has always had. A step
with no cue never elicits at all, because there is nothing to confirm.

Capability is checked **at call time**, inside the closure, rather than cached from
`initialize`: `getClientCapabilities()` is the SDK's own live read, and a client that
declares `elicitation: {}` may mean URL-mode only, which this server does not use — the
`.form` check is what tells the two apart rather than assuming the broader claim.

## Consequences

**`tools.ts` stays testable without a real transport.** `Deps.elicit` is injected exactly
like `cursors` and `bundles` already are, so the dispatch logic for confirmed, declined,
unavailable, and "never called without a cue" is asserted directly (`tools.test.ts`, five
new cases) — P13, test at the layer with the logic. `server.ts`'s own closure was left
untested when this was decided, as wiring whose shape the SDK's types already guarantee.
`server.test.ts` has since driven it over the SDK's in-memory transport: a reader who
declines the form, and, with #167, the form's words in the edition of the step it confirms,
which no type can check.

**The tool's input schema did not change.** `answer` was already optional on
`submit_answer` — required only where `here.step.cue` is true, and only of the value that
reaches the record, not of the argument. Eliciting when the argument is empty was already
inside what the schema allowed; this ADR is what the server now does with that room.

**A host without elicitation is no worse off, and is owed nothing new.** Every existing
test, and every existing host's behaviour, is unchanged: `deps.elicit` absent, or resolving
to `unavailable`, is the exact code path this server has always run.

**This still does not produce an outcome.** `MCP-SERVER-SKETCH.md` §5's "no outcomes, at
all" stands untouched — a confirmed answer is echoed and dropped, same as before, and
nothing here writes to `FrameOutcome` or anything an instrument could read. Whether an
elicitation-confirmed answer is ever trustworthy enough to feed a future auto-MCP outcomes
channel is the open question
[`TWO-SURFACES-COMPARISON.md`](../architecture/TWO-SURFACES-COMPARISON.md) already named,
and this ADR narrows it without answering it: a confirmed answer is still not a *graded*
one, and ADR-0009 §1's identity boundary is a separate wall this one does not touch.
