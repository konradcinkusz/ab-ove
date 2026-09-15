using AbOvo.Contracts;

namespace AbOvo.Api.Instrument;

/// <summary>
/// The blend: one number per frame, with the counter-metric inside it.
///
/// <para>
/// <b>THIS IS THE WHOLE OF ISSUE #18 §4.5.</b> <em>"First-attempt correctness and downstream
/// success go into one weighted component… The failure this prevents is specific: a
/// counter-metric on its own panel is a counter-metric that gets closed."</em> There is one
/// function here and it takes both measures; there is no arrangement of this API that produces
/// a teaching score from one of them.
/// </para>
/// <para>
/// The weights are not here. They are <see cref="Weights.Teaching"/>, read rather than
/// written, so that the scoring policy is a short document a reviewer can read without reading
/// this file — which is §4.6's <em>"a reviewer can check placement without reading the
/// arithmetic"</em>.
/// </para>
/// </summary>
public static class Teaching
{
    /// <summary>
    /// Blend one frame's two measures.
    ///
    /// <para>
    /// The interval is <c>w1·hw1 + w2·hw2</c>, which is a BOUND rather than the variance. The
    /// two measures share observations — the downstream checks are a subset of the frame's
    /// checks — so their errors are positively correlated, and the exact standard error needs a
    /// covariance this service has no reader identifier to compute. What is taken instead is
    /// what perfect correlation would give, which is an upper bound under every correlation
    /// including the one that actually holds. <see cref="Score"/>'s own note says why the safe
    /// direction is the wide one.
    /// </para>
    /// </summary>
    public static Score Of(Rate firstAttempt, Rate downstream)
    {
        ArgumentNullException.ThrowIfNull(firstAttempt);
        ArgumentNullException.ThrowIfNull(downstream);

        var pressurable = Weights.Of(Measure.FirstAttempt);
        var counter = Weights.Of(Measure.Downstream);

        return Score.Of(
            pressurable * firstAttempt.Percent + counter * downstream.Percent,
            pressurable * firstAttempt.HalfWidth + counter * downstream.HalfWidth);
    }
}
