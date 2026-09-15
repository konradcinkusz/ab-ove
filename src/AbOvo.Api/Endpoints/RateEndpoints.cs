using AbOvo.Api.Instrument;
using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using AbOvo.ServiceDefaults;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Endpoints;

/// <summary>
/// The instrument's one read: a unit's cells, each with its rate and that rate's interval.
///
/// <para>
/// <b>ON <c>adminApi</c>, WHICH IS A DECISION AND NOT A PRIVACY ONE.</b> Nothing here is
/// about a reader — <see cref="FrameOutcome"/> has no column that could be — so there is no
/// confidentiality argument for a gate, and publishing these numbers is eventually the point
/// (book issue #239 §4: <em>"the first honest sentence the book can print about itself"</em>).
/// What argues for the gate now is that the data is thin, and issue #17 records what a thin
/// ranked list does to a reader: <em>"the frames at the top of an early list are the ones with
/// three attempts rather than the ones that are worst."</em> The author's view carries the
/// sentence that says so; a public JSON endpoint carries nothing. Publishing is a later
/// decision this does not foreclose, and ADR-0024 §4 says what would have to be true first.
/// </para>
/// <para>
/// It also gives the triad's admin group its first endpoint. <c>Program.cs</c> declared it
/// empty on the argument that a group which does not exist cannot be seen to be missing.
/// </para>
/// </summary>
public static class RateEndpoints
{
    public static RouteGroupBuilder MapRateEndpoints(this RouteGroupBuilder adminApi)
    {
        adminApi.MapGet("/rates/{track}/{unit}", async Task<Results<Ok<UnitRates>, ValidationProblem>> (
                string track,
                string unit,
                [FromQuery] string? bundleTag,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                /*
                 * THE TAG IS REQUIRED, AND A 400 IS THE POINT RATHER THAN A CONVENIENCE.
                 *
                 * Omitting it would have to mean one of two things: pick a tag, or pool over
                 * all of them. Picking one silently answers a question the caller did not ask;
                 * pooling averages a reader's experience of two different texts, which is the
                 * thing FrameOutcome's key exists to prevent and which BundlePinnedQueries
                 * refuses one layer down. So the caller says which text they are asking about.
                 *
                 * Refused HERE as well as there, because the interceptor's message is written
                 * for whoever wrote the query and this one is written for whoever called the
                 * API — and because a 500 from a guard is a worse answer to a missing query
                 * parameter than a 400 that names it.
                 */
                if (string.IsNullOrWhiteSpace(bundleTag))
                {
                    return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["bundleTag"] =
                        [
                            "Required. A rate is about one version of the text: pooling two "
                            + "bundle tags would average a reader's experience of two different "
                            + "wordings of the same frame.",
                        ],
                    });
                }

                var rows = await db.FrameOutcomes
                    .AsNoTracking()
                    // The equality BundlePinnedQueries requires, and the one the composite key
                    // leads with — so this is an index seek rather than a scan for the same
                    // reason it is legal at all.
                    .Where(o => o.BundleTag == bundleTag && o.Track == track && o.Unit == unit)
                    .Select(o => new
                    {
                        o.Step,
                        o.Check,
                        o.Attempt,
                        o.Passed,
                        o.Count,
                    })
                    .ToListAsync(cancellationToken);

                /*
                 * THE CELL IS (step, check, attempt) AND THE GROUPING HAPPENS HERE, NOT IN SQL.
                 *
                 * In SQL it would be a GROUP BY over a table whose rows are already the group —
                 * there are exactly two per cell, pass and fail — so the only work is pairing
                 * them. Doing it in memory costs a unit's worth of rows and keeps the whole
                 * arithmetic in one place a test can drive without a database, which is P13.
                 */
                var cells = rows
                    .GroupBy(r => (r.Step, r.Check, r.Attempt))
                    .Select(g => new
                    {
                        g.Key.Step,
                        g.Key.Check,
                        g.Key.Attempt,
                        Passed = g.Where(r => r.Passed).Sum(r => r.Count),
                        Total = g.Sum(r => r.Count),
                    })
                    // A cell can only be here if a row exists, and a row only exists once it
                    // has been incremented — so Total >= 1 by construction. The filter is the
                    // belt: Rate.Of throws on zero, and a 500 from an aggregate endpoint is a
                    // bad way to learn that a migration once wrote a row with Count = 0.
                    .Where(c => c.Total >= 1)
                    .OrderBy(c => c.Step)
                    .ThenBy(c => c.Check, StringComparer.Ordinal)
                    .ThenBy(c => c.Attempt)
                    .Select(c => new CellRate
                    {
                        Step = c.Step,
                        Check = c.Check,
                        Attempt = c.Attempt,
                        Rate = Rate.Of(c.Passed, c.Total, Proportion.HalfWidthOf(c.Passed, c.Total)),
                    })
                    .ToList();

                return TypedResults.Ok(new UnitRates
                {
                    BundleTag = bundleTag,
                    Track = track,
                    Unit = unit,
                    Cells = cells,
                    Selection = MarginOver(cells),
                    Frames = ScoresOver(cells),
                });
            })
            .WithName(EndpointNames.GetRates)
            .WithSummary("Every measured cell of one unit, at one bundle tag, with intervals.")
            .WithDescription(
                "A cell is (frame, check, attempt) — the finest the store has, and the only one "
                + "over which the interval's arithmetic holds: pooling across checks or attempts "
                + "pools observations that share a reader, and this service has no reader "
                + "identifier with which to correct for it. A unit nobody has run is an empty "
                + "array and a 200.")
            .Produces<UnitRates>()
            .ProducesValidationProblem();

        return adminApi;
    }

    /// <summary>
    /// What ranking these cells costs, by Program P27 §5's arithmetic.
    ///
    /// <para>
    /// COMPUTED EVEN THOUGH THIS ENDPOINT DOES NOT RANK, which is the decision worth naming.
    /// The response is in <c>(step, check, attempt)</c> order and the author's view sorts it;
    /// but the margin is not a property of the sort, it is a property of <em>how many noisy
    /// numbers a sort had to choose from</em>, and that is the same for every ordering of the
    /// same cells. Leaving it to the client would put P27's arithmetic in a second place, and
    /// only one of the two would be gated against the book.
    /// </para>
    /// <para>
    /// THE EXTREME IS THE LOWEST RATE, because the view ranks by how badly the book is doing
    /// and reads the worst end. <c>E[min]</c> is <c>-E[max]</c> by symmetry, so the magnitude
    /// is <see cref="Normal.ExpectedMaxOfStandardNormals"/> either way and the sign is carried
    /// by the sentence on the screen rather than by the number.
    /// </para>
    /// </summary>
    private static SelectionMargin? MarginOver(IReadOnlyList<CellRate> cells)
    {
        // No cells is no list. An absent margin rather than a zero one, for the reason
        // Rate.Of refuses a total of zero: a zero renders, and it would say there is a
        // ranking whose extreme is trustworthy.
        if (cells.Count == 0) return null;

        /*
         * THE MAGNITUDE, and Math.Abs here is not a clamp papering over a bad quadrature.
         *
         * E[min] = -E[max] by symmetry, so what this wants is the size of the margin and the
         * direction is carried by the sentence on the screen. Taking it explicitly also
         * removes a latent 500: at m = 1 the integrand is odd and the true answer is zero, so
         * what Simpson returns is a floating-point residual — measured at 2.4e-17 here, and
         * its SIGN is a property of the summation order and of the machine. A negative one
         * would reach SelectionMargin.Of, which refuses negatives for a good reason, and a
         * unit with exactly one cell would answer 500 on some machines and 200 on others.
         *
         * Normal itself is deliberately NOT clamped: NormalGatesTests asserts |E[max of 1]|
         * is under the book's own 1e-9, and a routine that clamped would pass that gate while
         * returning -0.5. The magnitude is taken here, where the caller knows it wants one.
         */
        var standardErrors = Math.Abs(Normal.ExpectedMaxOfStandardNormals(cells.Count));

        // The cell the ranking would put at its extreme, and its own standard error — which
        // is the half-width divided by the z the interval was built with, so the margin and
        // the intervals beside it are in one another's units by construction rather than by
        // a second constant that would have to be kept equal.
        var extreme = cells.MinBy(c => c.Rate.Percent)!;
        var standardError = extreme.Rate.HalfWidth / Proportion.Z;

        return SelectionMargin.Of(cells.Count, standardErrors, standardErrors * standardError);
    }

    /// <summary>
    /// A teaching score per frame, blended from the two measures issue #18 §4.5 names.
    ///
    /// <para>
    /// <b>THE DOWNSTREAM MEASURE IS THE BOOK'S OWN STRUCTURE, READ OUT OF THE ROWS.</b> A
    /// check's docstring names the frames it rests on, and <c>report.ts</c> fans one run's
    /// outcome to every one of them — so a check appearing under several steps is a check that
    /// needs all of those frames at once. A check whose highest step is beyond THIS frame is
    /// therefore a check that carries this frame forward, and whether it passes is evidence
    /// about whether the frame survived to where it is used.
    /// </para>
    /// <para>
    /// Measured before it was designed: eight of Lab P1's thirteen checks rest on more than one
    /// frame, and <c>test_6_store_rounds_to_the_format</c> rests on frames 20 to 24 <em>and
    /// 32</em>. A counter-metric with no data behind it is a weight that would sit wherever it
    /// was set for ever.
    /// </para>
    /// <para>
    /// ATTEMPT 1 ONLY, for both measures. "Did the reader get it right first time" is the
    /// pressurable question, and the counter has to be asked at the same attempt or the two are
    /// not comparable and their blend means nothing.
    /// </para>
    /// </summary>
    private static List<FrameScore> ScoresOver(IReadOnlyList<CellRate> cells)
    {
        // The frames each check reaches. A check is "carrying" at a frame when it is also used
        // at a later one — which is the whole of the downstream definition.
        var lastFrameOf = cells
            .GroupBy(c => c.Check, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Max(c => c.Step), StringComparer.Ordinal);

        var scores = new List<FrameScore>();

        foreach (var frame in cells.Where(c => c.Attempt == 1).GroupBy(c => c.Step).OrderBy(g => g.Key))
        {
            var carrying = frame.Where(c => lastFrameOf[c.Check] > frame.Key).ToList();

            /*
             * NO DOWNSTREAM IS NO SCORE, never a score computed from half its definition.
             *
             * A frame whose checks are used nowhere later has nothing to say about whether it
             * survived — the last frame of a unit always, and any frame whose checks are local
             * to it. Blending in a zero would read as "readers could not use this frame later",
             * which is the opposite of "nobody has asked". Its cells are still reported; the
             * view says which frames are here and why, and ADR-0026 records the decision.
             */
            if (carrying.Count == 0) continue;

            scores.Add(new FrameScore
            {
                Step = frame.Key,
                FirstAttempt = Pooled(frame),
                Downstream = Pooled(carrying),
                Teaching = Instrument.Teaching.Of(Pooled(frame), Pooled(carrying)),
            });
        }

        return scores;
    }

    /// <summary>
    /// One rate over several cells of the same frame and attempt.
    ///
    /// <para>
    /// <b>THIS POOLS, AND ADR-0024 §2 FORBIDS POOLING — so the difference has to be stated.</b>
    /// What that rule refuses is pooling across CHECKS OR ATTEMPTS for a rate this service
    /// reports as a rate, because those observations share a reader and the interval's
    /// arithmetic assumes they do not. The attempt is held fixed here, which is half of it. The
    /// checks are not, and the consequence is carried rather than hidden: the interval on a
    /// pooled rate is narrower than the truth, so <c>Teaching.Of</c> takes a BOUND rather than
    /// a variance and the result is reported as a score to rank by rather than as a rate to
    /// quote. A frame's rate, as a rate, still does not exist anywhere in this product.
    /// </para>
    /// </summary>
    private static Rate Pooled(IEnumerable<CellRate> cells)
    {
        var passed = cells.Sum(c => c.Rate.Passed);
        var total = cells.Sum(c => c.Rate.Total);

        return Rate.Of(passed, total, Proportion.HalfWidthOf(passed, total));
    }
}
