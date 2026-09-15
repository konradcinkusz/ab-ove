using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using AbOvo.ServiceDefaults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Endpoints;

/// <summary>
/// The instrument's one write.
///
/// <para>
/// THIS GROUP IS ANONYMOUS, AND THAT IS THE DESIGN RATHER THAN AN OVERSIGHT. Consent is not
/// an account (issue #14): the reader loop works with no account at all (ADR-0004), so an
/// endpoint that required one would measure the book as experienced by account-holders and
/// call it the book. There is no route, header or claim here that names a reader, and the
/// service could not tell two callers apart if it wanted to.
/// </para>
/// <para>
/// It is rate-limited nonetheless — see <c>Program.cs</c> — because an anonymous write is a
/// volume surface whatever else it is. What rate limiting does NOT buy is integrity: a
/// determined caller can still post outcomes that never happened. That is the standing cost
/// of an anonymous instrument, it is not solvable without the identifier this design exists
/// not to have, and ADR-0023 states it rather than implying otherwise. What carries the
/// weight instead is the honest presentation issues #16 and #17 require: every rate with its
/// interval, and a wide interval reading as <em>early, not wrong</em>.
/// </para>
/// <para>
/// THE WRITE IS AN INCREMENT, NEVER AN INSERT OF AN EVENT. <see cref="FrameOutcome"/> says
/// why at length; the consequence here is that this handler reads a tally, adds to it, and
/// stores no time and no row identity. Two readers reporting the same check on the same
/// frame at the same attempt increment the same row and are afterwards indistinguishable
/// from one reader who ran it twice.
/// </para>
/// </summary>
public static class OutcomeEndpoints
{
    public static RouteGroupBuilder MapOutcomeEndpoints(this RouteGroupBuilder outcomeApi)
    {
        outcomeApi.MapPost("/outcomes", async (
                OutcomeReport report,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                /*
                 * DUPLICATE CHECK NAMES IN ONE REPORT ARE COLLAPSED, NOT COUNTED TWICE.
                 *
                 * A run reports each check once, so two entries naming the same check are a
                 * caller getting it wrong or a caller inflating a tally. Taking the LAST is
                 * arbitrary and taking either is defensible; what is not defensible is
                 * adding both, which lets one request move a rate by as much as it likes
                 * within the batch limit.
                 */
                var results = report.Results
                    .GroupBy(r => r.Check, StringComparer.Ordinal)
                    .Select(g => g.Last())
                    .ToList();

                foreach (var result in results)
                {
                    await Increment(db, report, result, cancellationToken);
                }

                await db.SaveChangesAsync(cancellationToken);

                /*
                 * 204, and it carries nothing back.
                 *
                 * The caller has no use for a tally and must not be handed one: a response
                 * carrying "this frame has now failed 41 times out of 260" would make this
                 * endpoint a read of the aggregate for anybody who can write to it, which
                 * is the surface issues #16 and #17 own and will present WITH its interval.
                 * A bare rate is the "ratio quoted without its two quantities" the book
                 * spends a program complaining about.
                 */
                return Results.NoContent();
            })
            .WithValidation<OutcomeReport>()
            .WithName(EndpointNames.PostOutcomes)
            .WithSummary("Report what one run of a frame's checks said. Anonymous by construction.")
            .Produces(StatusCodes.Status204NoContent);

        return outcomeApi;
    }

    /// <summary>
    /// Add one to the tally for this exact question, inserting the row if nobody has asked
    /// it before.
    ///
    /// <para>
    /// Read-modify-write rather than a provider-specific upsert, for the reason
    /// <c>ProgressEndpoints</c> gives for loading rather than <c>ExecuteDeleteAsync</c>: the
    /// InMemory provider is what a fresh clone and every test run on (P8, P13), and a
    /// provider branch here would be a second code path exercised by exactly one
    /// environment.
    /// </para>
    /// <para>
    /// TWO CONCURRENT REPORTS CAN LOSE AN INCREMENT, and that is accepted rather than
    /// locked against. What is lost is one count out of a tally whose whole purpose is to
    /// be divided into another tally — issue #16's interval is wider than any plausible
    /// loss, and a transaction per check on an anonymous write is a cost paid on every
    /// request to protect a digit nobody reads on its own.
    /// </para>
    /// </summary>
    private static async Task Increment(
        AbOvoDbContext db,
        OutcomeReport report,
        CheckResult result,
        CancellationToken cancellationToken)
    {
        var existing = await db.FrameOutcomes.SingleOrDefaultAsync(
            o => o.BundleTag == report.BundleTag
                && o.Track == report.Track
                && o.Unit == report.Unit
                && o.Step == report.Step
                && o.Check == result.Check
                && o.Attempt == report.Attempt
                && o.Passed == result.Passed,
            cancellationToken);

        if (existing is null)
        {
            db.FrameOutcomes.Add(new FrameOutcome
            {
                BundleTag = report.BundleTag,
                Track = report.Track,
                Unit = report.Unit,
                Step = report.Step,
                Check = result.Check,
                Attempt = report.Attempt,
                Passed = result.Passed,
                Count = 1,
            });
        }
        else
        {
            existing.Count += 1;
        }
    }
}
