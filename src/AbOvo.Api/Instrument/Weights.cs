namespace AbOvo.Api.Instrument;

/// <summary>
/// What goes into a frame's teaching score. A closed set, and that is the point.
///
/// <para>
/// <b>ISSUE #18 ASKS FOR AN ABSENCE THAT CANNOT DRIFT.</b> Its §4.6: anything that guesses at
/// a reader's state — frustration, confusion, fatigue — is <em>"absent from the weights table
/// entirely, not present at zero. A zero weight is a wire that somebody can set to 0.05 in a
/// one-line diff that reads as a tuning change; an absent row is a wire that has to be built,
/// which is a conversation."</em>
/// </para>
/// <para>
/// An enum is that conversation made structural. A weight cannot be added by editing a
/// dictionary literal; the member has to exist first, in this file, beside the note below, and
/// <c>WeightsAreArtefactMeasuresTests</c> fails on any member that is not a property of an
/// artefact. METRIC-ETHICS.md §4 is the rule — <em>"keep the heuristic outside the scoring
/// engine entirely, as a separate analyzer, rather than inside with a zero weight"</em> — and
/// §5 is why: the unit of evaluation is the artefact, never the person.
/// </para>
/// <para>
/// <b>Every member here measures A FRAME.</b> Not a reader, and not a guess about one. That is
/// checkable rather than promised, because the store this is computed from has no reader
/// identifier on any row (ADR-0023) — so a human-state measure could not be computed here even
/// if a member existed for it.
/// </para>
/// </summary>
public enum Measure
{
    /// <summary>
    /// Did the reader get this frame's checks right the first time they ran them.
    ///
    /// <para>
    /// <b>THE PRESSURABLE ONE</b>, and METRIC-ETHICS.md §2 requires its degenerate strategy to
    /// be named: <em>give the answer away.</em> A frame rewritten so that its answer is on the
    /// page above the question raises this number immediately, and an author watching only this
    /// would read that as the frame improving.
    /// </para>
    /// </summary>
    FirstAttempt,

    /// <summary>
    /// Did the checks that need this frame LATER still pass.
    ///
    /// <para>
    /// The counter-metric, and it is in the same component rather than beside it — see
    /// <see cref="Weights.Teaching"/>. Giving a frame's answer away raises
    /// <see cref="FirstAttempt"/> and cannot raise this, because a check that rests on this
    /// frame and on a later one only passes if the reader still has this frame when they
    /// arrive. Issue #18: <em>"Optimising a frame for immediate correctness at the cost of
    /// whether the reader can use it three programs later is a real and easy win, and the only
    /// defence that survives contact is arithmetic that cannot be skipped."</em>
    /// </para>
    /// <para>
    /// IT IS THE BOOK'S OWN STRUCTURE rather than an edge this product invented. Each check's
    /// docstring names the frames it rests on, and eight of Lab P1's thirteen name more than
    /// one — <c>test_6_store_rounds_to_the_format</c> rests on frames 20 to 24 <em>and 32</em>.
    /// Measured before this was designed, because a counter-metric with no data behind it is a
    /// weight that would sit at whatever it was set to for ever.
    /// </para>
    /// </summary>
    Downstream,
}

/// <summary>
/// The weights, in one place, as data.
///
/// <para>
/// Issue #18's §4.5: <em>"Done when there is no panel a reviewer can decline to look at, and
/// the weights are data in one place."</em> This is the one place. <c>weights.contract.json</c>
/// beside it is generated from exactly this table and asserted to match, so a reviewer can read
/// the whole scoring policy as a short document without reading any arithmetic — which is
/// §4.6's <em>"a reviewer can check placement without reading the arithmetic"</em>.
/// </para>
/// <para>
/// <b>COMPILED, NOT CONFIGURED</b>, and that is a decision rather than an omission. P5 puts
/// configuration in the environment, and a weight that could be set there would be a scoring
/// policy one deploy away from changing with nobody reviewing it as a policy. The whole force
/// of §4.6 is that the shape of this table is a conversation; an environment variable would
/// make it a deployment detail.
/// </para>
/// </summary>
/// <summary>
/// One measure's place in a component: what it weighs, whether it is the pressurable one, and
/// what it is there to do.
///
/// <para>
/// The last field is a sentence rather than a comment, and that is the point. METRIC-ETHICS.md
/// §2 requires every pressurable metric to have its degenerate strategy NAMED; a name in a
/// comment is not in the document a reviewer reads. Here it is generated into
/// <c>weights.json</c> beside the number it justifies, so the table and its reasoning cannot
/// come apart.
/// </para>
/// </summary>
/// <param name="Weight">Its share of the component. The shares sum to 1.</param>
/// <param name="Pressurable">
/// Whether an author could move this number without doing the underlying good.
/// </param>
/// <param name="Because">
/// For a pressurable measure, the degenerate strategy. For a counter-metric, what it catches.
/// </param>
public sealed record Weighted(double Weight, bool Pressurable, string Because);

/// <summary>
/// The weights, in one place, as data.
///
/// <para>
/// Issue #18's §4.5: <em>"Done when there is no panel a reviewer can decline to look at, and
/// the weights are data in one place."</em> This is the one place. <c>weights.json</c> beside
/// it is generated from exactly this table and asserted to match, so a reviewer can read the
/// whole scoring policy as a short document without reading any arithmetic — which is §4.6's
/// <em>"a reviewer can check placement without reading the arithmetic"</em>.
/// </para>
/// <para>
/// <b>COMPILED, NOT CONFIGURED</b>, and that is a decision rather than an omission. P5 puts
/// configuration in the environment, and a weight that could be set there would be a scoring
/// policy one deploy away from changing with nobody reviewing it as a policy. The whole force
/// of §4.6 is that the shape of this table is a conversation; an environment variable would
/// make it a deployment detail.
/// </para>
/// </summary>
public static class Weights
{
    /// <summary>
    /// The teaching score's one component, and both measures are inside it.
    ///
    /// <para>
    /// Not two numbers on two panels. METRIC-ETHICS.md §2: <em>"A counter-metric on its own
    /// panel is one somebody can decline to look at; folded into the same weighted term, the
    /// pressurable number cannot move without it. That is the difference between a warning and
    /// a constraint."</em>
    /// </para>
    /// <para>
    /// <b>The pressurable measure carries the smaller share, deliberately.</b> §2 again:
    /// <em>"Keep the pressurable metric's weight modest while you are at it. A number that is
    /// one fifth of a composite is a poor target."</em> A third is not a fifth — there are only
    /// two measures here, so a fifth would leave the counter-metric doing almost all the work
    /// and make the score insensitive to the thing an author most directly controls. The split
    /// is stated rather than swept, and ADR-0026 records what would change it.
    /// </para>
    /// </summary>
    public static readonly IReadOnlyDictionary<Measure, Weighted> Teaching =
        new Dictionary<Measure, Weighted>
        {
            [Measure.FirstAttempt] = new(
                0.35,
                Pressurable: true,
                Because: "Give the frame's answer away and this rises immediately. An author "
                         + "watching only this would read that as the frame improving."),

            [Measure.Downstream] = new(
                0.65,
                Pressurable: false,
                Because: "A check resting on this frame and on a later one passes only if the "
                         + "reader still has this frame when they arrive, so giving the answer "
                         + "away cannot raise it and replacing teaching with a giveaway lowers "
                         + "it."),
        };

    /// <summary>The share of a measure in the teaching component.</summary>
    public static double Of(Measure measure) => Teaching[measure].Weight;
}
