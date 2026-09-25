using System.Text.RegularExpressions;
using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using AbOvo.ServiceDefaults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Endpoints;

/// <summary>
/// The reader's place in each program, kept for an account.
///
/// <para>
/// THE MERGE IS SERVER-SIDE, AND THAT IS WHAT MAKES TWO MACHINES CONVERGE. A write carrying
/// a lower step does not lower the stored one, so the row is monotone and the order two
/// clients' writes arrive in stops mattering. The alternative — store whatever arrives and
/// let clients sort it out — converges only if every client implements the same rule, which
/// is a rule nobody can enforce and a reader cannot predict.
/// </para>
/// <para>
/// Every write therefore answers with the row AS IT NOW STANDS rather than with a status.
/// The caller adopts an answer instead of assuming its own, which is what makes "my phone
/// was behind" a thing the phone learns rather than a thing it overwrites. ADR-0019.
/// </para>
/// <para>
/// This group is <c>authApi</c> — authenticated and rate-limited — and every row is named by
/// the caller's own subject, read through the kernel's shared resolver. There is no route
/// here that takes a subject: an endpoint that let a caller name whose progress they wanted
/// is an endpoint whose authorization is a parameter.
/// </para>
/// </summary>
public static class ProgressEndpoints
{
    /// <summary>
    /// What a content identifier may look like. The service holds no bundle and cannot check
    /// that a track or a program EXISTS — only that the string is the shape of one, bounded
    /// and free of anything that has no business in an identifier.
    /// <para>
    /// This is not SQL-injection defence; EF parameterises. It is a bound on what reaches a
    /// key column from a route segment, so that a caller cannot fill the table with rows
    /// nobody can read and a log line cannot be forged with a newline.
    /// </para>
    /// </summary>
    private static readonly Regex IdentifierShape =
        new("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static RouteGroupBuilder MapProgressEndpoints(this RouteGroupBuilder authApi)
    {
        authApi.MapGet("/progress", async (
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var subject = ClientIdentityResolver.Subject(http.User);
                if (string.IsNullOrWhiteSpace(subject)) return TokenCarriesNoSubject();

                var records = await db.ReaderProgress
                    .AsNoTracking()
                    .Where(p => p.Subject == subject)
                    // Ordered so the response is stable between calls: an unordered list that
                    // happens to be stable in one provider and not another is a diff nobody
                    // can read and a cache nobody can validate.
                    .OrderBy(p => p.Track).ThenBy(p => p.Unit)
                    .Select(p => new ProgressRecord(p.Track, p.Unit, p.Step, p.Language, p.UpdatedAt))
                    .ToListAsync(cancellationToken);

                return Results.Ok(new ProgressResponse(records));
            })
            .WithName(EndpointNames.GetProgress)
            .WithSummary("Every program this reader has opened, and the furthest frame reached in each.")
            .Produces<ProgressResponse>();

        /*
         * KNOWN, TRACKED GAP SINCE ADR-0060: this write still trusts the caller's `Step`
         * (subject only to "does not lower it"), which is exactly what a caller could use to
         * skip the reveal gate `GET/POST .../content/**` now enforces — see the 2026-09-21
         * deviation register row in docs/architecture/00-ARCHITECTURE.md for why this is not
         * closed here (it would break the two callers that still raise Step through it:
         * web/mcp, and web/app's sync.ts pushing a place read anonymously) and what retires
         * it.
         */
        authApi.MapPut("/progress/{track}/{unit}", async (
                string track,
                string unit,
                ProgressUpdate update,
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                [FromServices] TimeProvider clock,
                CancellationToken cancellationToken) =>
            {
                var subject = ClientIdentityResolver.Subject(http.User);
                if (string.IsNullOrWhiteSpace(subject)) return TokenCarriesNoSubject();

                if (!IdentifierShape.IsMatch(track) || !IdentifierShape.IsMatch(unit))
                {
                    return Results.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["program"] = ["The track and unit must be short identifiers: letters, digits, dot, dash or underscore."],
                    });
                }

                var existing = await db.ReaderProgress
                    .SingleOrDefaultAsync(
                        p => p.Subject == subject && p.Track == track && p.Unit == unit,
                        cancellationToken);

                if (existing is null)
                {
                    existing = new ReaderProgress
                    {
                        Subject = subject,
                        Track = track,
                        Unit = unit,
                        Step = update.Step,
                        Language = update.Language,
                        UpdatedAt = clock.GetUtcNow(),
                    };
                    db.ReaderProgress.Add(existing);
                }
                else if (update.Step > existing.Step)
                {
                    // The rule, and the whole of it. The language travels with the step it
                    // belongs to: a record that loses the merge loses its language too,
                    // because "frame 40, in Polish" is one fact and not two.
                    existing.Step = update.Step;
                    existing.Language = update.Language;
                    existing.UpdatedAt = clock.GetUtcNow();
                }

                // A write that changed nothing is not an error and does not touch UpdatedAt.
                // It is the ordinary case: a phone that was behind, saying so.
                await db.SaveChangesAsync(cancellationToken);

                return Results.Ok(new ProgressRecord(
                    existing.Track, existing.Unit, existing.Step, existing.Language, existing.UpdatedAt));
            })
            .WithValidation<ProgressUpdate>()
            .WithName(EndpointNames.PutProgress)
            .WithSummary("Report a frame reached. The stored record keeps whichever is further.")
            .Produces<ProgressRecord>();

        authApi.MapDelete("/progress", async (
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var subject = ClientIdentityResolver.Subject(http.User);
                if (string.IsNullOrWhiteSpace(subject)) return TokenCarriesNoSubject();

                /*
                 * WHY THIS EXISTS IN THE SYNC TICKET RATHER THAN THE DELETION ONE.
                 *
                 * The reading surface already has a "forget me" control, and it clears the
                 * browser. The moment progress also lives on an account, a forget that
                 * cleared only the browser would be undone by the next sync — the reader
                 * presses it, the record comes back, and the control has lied to them.
                 *
                 * This is not account deletion (#13), which removes the account itself and
                 * has to say what it cannot retract. This removes the rows and nothing else.
                 */
                // Loaded and removed rather than `ExecuteDeleteAsync`, for two reasons and
                // the second is the one that decided it: a reader has at most one row per
                // program they have opened, so there is nothing to stream; and the InMemory
                // provider — the one a fresh clone and every test runs on (P8, P13) — does
                // not implement the set-based delete at all. A provider branch here would
                // be a second code path exercised by exactly one environment.
                var rows = await db.ReaderProgress
                    .Where(p => p.Subject == subject)
                    .ToListAsync(cancellationToken);

                db.ReaderProgress.RemoveRange(rows);
                await db.SaveChangesAsync(cancellationToken);

                return Results.NoContent();
            })
            .WithName(EndpointNames.DeleteProgress)
            .WithSummary("Forget every record of where this reader got to.")
            .Produces(StatusCodes.Status204NoContent);

        return authApi;
    }

    /// <summary>
    /// A token that authenticated and carries no subject. Not a 401 — the caller's
    /// credentials were accepted — and not a 500, because nothing failed here: it is a token
    /// this service cannot file anything under, which is a fault in what issued it.
    /// </summary>
    private static IResult TokenCarriesNoSubject() => Results.Problem(
        title: "The token carries no subject.",
        detail: "This service files progress under the token's subject claim and the token has none.",
        statusCode: StatusCodes.Status403Forbidden);
}
