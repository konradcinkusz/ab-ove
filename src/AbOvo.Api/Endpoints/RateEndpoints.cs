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
}
