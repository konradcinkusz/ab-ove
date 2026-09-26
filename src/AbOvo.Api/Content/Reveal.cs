namespace AbOvo.Api.Content;

/// <summary>
/// THE GATE. Ported from <c>web/mcp/src/reveal.ts</c>, where it was already identity-agnostic
/// and I/O-free — this is the arithmetic that file already had, now the one copy every
/// client (the web app, a future MCP client) calls over HTTP instead of each holding its own.
/// <para>
/// ONE RULE: step <c>k</c> of a unit is served if and only if <c>k &lt;= </c> the reader's
/// FURTHEST step, and the only thing that raises the furthest step is submitting an answer.
/// The unit's return index is served under the same rule, as its last step
/// (<see cref="ServeReturnIndex"/>).
/// The reveal is the request for the next step; there is no field to strip on refusal,
/// because the object carrying the answer was never selected (ADR-0014's "absent rather than
/// hidden", reproduced on a transport with no DOM).
/// </para>
/// <para>
/// Deliberately does NOT implement the separate, program-level "is this unit open at all"
/// gate (<c>web/web-kit/src/gate.ts</c>, ADR-0051/ADR-0056) — that gate's own docstring says
/// it is "not a security boundary... nothing behind it is paid for, secret, or unsafe to
/// see", which this one is not true of. Porting it is tracked separately rather than folded
/// in here where it would blur that distinction.
/// </para>
/// </summary>
public static class Reveal
{
    /// <summary>The first step of any program. A reader who has opened nothing is at step 1, not 0.</summary>
    public const int FirstStep = 1;

    public enum RefusalKind
    {
        /// <summary>The gate doing its job. NOT an error — the product working.</summary>
        NotReached,
        NoSuchStep,
        ProgramComplete,
    }

    public sealed record Refusal(RefusalKind Kind, int Requested, int Furthest, int Steps)
    {
        /// <summary>
        /// The reader's own sentence for a refusal — the thing a caller should show, so a
        /// model or a UI does not report the gate working as a fault.
        /// </summary>
        public string Explain() => Kind switch
        {
            RefusalKind.NotReached =>
                $"Step {Requested} has not been reached yet; the furthest is {Furthest}. " +
                "This is the method working, not a fault: the answer to a step is the opening " +
                "of the next one, so the next step arrives when an answer has been submitted " +
                "for this one.",
            RefusalKind.NoSuchStep =>
                $"This program has {Steps} steps; step {Requested} is not one of them.",
            RefusalKind.ProgramComplete =>
                $"This program is finished — all {Steps} steps have been worked.",
            _ => throw new ArgumentOutOfRangeException(nameof(Kind), Kind, null),
        };
    }

    public sealed record Served(bool Ok, int Step, Refusal? Refusal);

    public sealed record Advanced(bool Ok, int Step, int NewCursorStep, Refusal? Refusal);

    /// <summary>
    /// Read one step, subject to the gate.
    /// <para>
    /// The order of the two refusals matters: a step past the END of the program is answered
    /// <c>NoSuchStep</c> even when it is also past the reader's furthest, because telling
    /// somebody "you have not reached step 900" of a 48-step program invites them to keep
    /// going. The bound they are hitting is the program's.
    /// </para>
    /// </summary>
    public static Served Serve(int totalSteps, int cursorStep, int requested)
    {
        if (requested < FirstStep || requested > totalSteps)
        {
            return new Served(false, 0, new Refusal(RefusalKind.NoSuchStep, requested, cursorStep, totalSteps));
        }

        if (requested > cursorStep)
        {
            return new Served(false, 0, new Refusal(RefusalKind.NotReached, requested, cursorStep, totalSteps));
        }

        return new Served(true, requested, null);
    }

    /// <summary>
    /// The program's return index — its Summary and its outcomes — gated AS ITS LAST STEP IS,
    /// which adds a place to serve rather than a second rule (issue #158).
    /// <para>
    /// A Summary item paraphrases what a run of steps concluded, so the index is the end of
    /// the program in the same sense the last step is: a reader whose furthest step is the
    /// last one may open both, and a reader short of it is refused both, with the same
    /// <c>NotReached</c> naming the last step as the one to reach. It is not a step past the
    /// last one — <see cref="Advance"/> still answers <c>ProgramComplete</c> there, and nothing
    /// here moves a cursor — so the rule above stays whole: only an answer raises the ceiling.
    /// </para>
    /// </summary>
    public static Served ServeReturnIndex(int totalSteps, int cursorStep)
        => Serve(totalSteps, cursorStep, totalSteps);

    /// <summary>
    /// THE ONLY OPERATION THAT RAISES THE CEILING, which is why submitting an answer is the
    /// only way to see the next step. Takes no answer text — nothing here grades it
    /// (ADR-0010: "the reader's own comparison against the next frame" is the teaching); the
    /// caller's job is only to have required one before calling this.
    /// </summary>
    public static Advanced Advance(int totalSteps, int cursorStep)
    {
        if (cursorStep >= totalSteps)
        {
            return new Advanced(false, 0, cursorStep, new Refusal(RefusalKind.ProgramComplete, 0, cursorStep, totalSteps));
        }

        var moved = cursorStep + 1;
        var served = Serve(totalSteps, moved, moved);
        return new Advanced(served.Ok, served.Step, moved, served.Refusal);
    }
}
