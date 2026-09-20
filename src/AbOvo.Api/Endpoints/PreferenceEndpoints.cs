using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using AbOvo.ServiceDefaults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Endpoints;

/// <summary>
/// Which edition the reader chose, kept for an account.
///
/// <para>
/// ADR-0049 — the language is one control at the top of the page, it defaults to English,
/// and it is remembered. The browser is where it is remembered; this is the copy that makes
/// a second machine agree with the first, on exactly the terms
/// <see cref="ProgressEndpoints"/> keeps the reader's place: the browser renders from its
/// own record and never waits for this one.
/// </para>
/// <para>
/// THE TIE-BREAK IS MOST-RECENT-WINS AND THE TIMESTAMP COMES FROM THE CALLER, which is the
/// one place this group departs from the progress group's shape. A preference has no
/// "further" — see <see cref="PreferenceUpdate"/> — so the server has nothing to merge on
/// except when the reader said it, and the machine that knows that is the one they said it
/// on. Every write therefore answers with the row AS IT NOW STANDS, so a caller whose write
/// lost the tie-break learns the answer instead of assuming its own.
/// </para>
/// <para>
/// A CLIENT'S CLOCK IS NOT TRUSTED, IT IS CLAMPED. A browser an hour fast is ordinary; a
/// browser set to 2099 would otherwise pin a choice that no honest later write could ever
/// dislodge. <see cref="Skew"/> is the whole of the defence and it is deliberately generous:
/// the cost of clamping a genuinely skewed clock is that the reader's choice is recorded as
/// having been made now, which is what they meant anyway.
/// </para>
/// <para>
/// This group is <c>authApi</c> — authenticated and rate-limited — and the row is named by
/// the caller's own subject, read through the kernel's shared resolver. There is no route
/// here that takes a subject, for <see cref="ProgressEndpoints"/>'s reason: an endpoint that
/// let a caller name whose preference they wanted is an endpoint whose authorization is a
/// parameter.
/// </para>
/// </summary>
public static class PreferenceEndpoints
{
    /// <summary>
    /// How far ahead of this service's clock a caller's <c>ChosenAt</c> may be before it is
    /// taken to be now. A past timestamp is not clamped at all: a laptop that was offline
    /// for a week is the case this feature exists for, and refusing it would make the rule
    /// "whichever machine reconnected last", which is the rule the timestamp replaces.
    /// </summary>
    private static readonly TimeSpan Skew = TimeSpan.FromMinutes(5);

    public static RouteGroupBuilder MapPreferenceEndpoints(this RouteGroupBuilder authApi)
    {
        authApi.MapGet("/preferences/language", async (
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var subject = ClientIdentityResolver.Subject(http.User);
                if (string.IsNullOrWhiteSpace(subject)) return TokenCarriesNoSubject();

                var row = await db.ReaderPreferences
                    .AsNoTracking()
                    .SingleOrDefaultAsync(p => p.Subject == subject, cancellationToken);

                // 200 with nulls rather than 404. "This reader has never chosen" is an
                // answer, and the caller acts on it — it keeps its own choice and pushes.
                // A 404 would make the ordinary first sign-in look like a fault in the log
                // of every deployment that has one.
                return Results.Ok(new PreferenceResponse(row?.Language, row?.UpdatedAt));
            })
            .WithName(EndpointNames.GetPreference)
            .WithSummary("The edition this reader chose, or nulls if they never have.")
            .Produces<PreferenceResponse>();

        authApi.MapPut("/preferences/language", async (
                PreferenceUpdate update,
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                [FromServices] TimeProvider clock,
                CancellationToken cancellationToken) =>
            {
                var subject = ClientIdentityResolver.Subject(http.User);
                if (string.IsNullOrWhiteSpace(subject)) return TokenCarriesNoSubject();

                var now = clock.GetUtcNow();
                var chosenAt = update.ChosenAt is { } supplied && supplied <= now + Skew ? supplied : now;

                var existing = await db.ReaderPreferences
                    .SingleOrDefaultAsync(p => p.Subject == subject, cancellationToken);

                if (existing is null)
                {
                    existing = new ReaderPreference
                    {
                        Subject = subject,
                        Language = update.Language,
                        UpdatedAt = chosenAt,
                    };
                    db.ReaderPreferences.Add(existing);
                }
                else if (chosenAt > existing.UpdatedAt)
                {
                    // The rule, and the whole of it. A write carrying an OLDER choice is not
                    // an error and is not a no-op the caller has to detect: it is answered
                    // with what stands, which is how the machine that was behind finds out.
                    existing.Language = update.Language;
                    existing.UpdatedAt = chosenAt;
                }

                await db.SaveChangesAsync(cancellationToken);

                return Results.Ok(new PreferenceResponse(existing.Language, existing.UpdatedAt));
            })
            .WithValidation<PreferenceUpdate>()
            .WithName(EndpointNames.PutPreference)
            .WithSummary("Record a chosen edition. The stored row keeps whichever choice is newer.")
            .Produces<PreferenceResponse>();

        authApi.MapDelete("/preferences/language", async (
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var subject = ClientIdentityResolver.Subject(http.User);
                if (string.IsNullOrWhiteSpace(subject)) return TokenCarriesNoSubject();

                /*
                 * WHY THIS EXISTS AT ALL, given no reader-facing control calls it.
                 *
                 * Account deletion does. Issue #13's requirement is that closing an account
                 * removes what this service holds under the subject, and the moment there is
                 * a second table under that subject, a deletion that cleared only the first
                 * one leaves a row nobody can ever reach: the account cannot sign in again,
                 * so nobody can ask for it to be removed. `account-deletion.ts` calls this
                 * beside the progress delete for exactly that reason.
                 *
                 * It is NOT wired to "Forget where I am". That control clears the reader's
                 * PLACE; resetting their language with it would be a second thing happening
                 * behind a door marked something else.
                 */
                // Loaded and removed rather than `ExecuteDeleteAsync`: there is at most one
                // row, and the InMemory provider — the one a fresh clone and every test runs
                // on (P8, P13) — does not implement the set-based delete at all.
                var row = await db.ReaderPreferences
                    .SingleOrDefaultAsync(p => p.Subject == subject, cancellationToken);

                if (row is not null)
                {
                    db.ReaderPreferences.Remove(row);
                    await db.SaveChangesAsync(cancellationToken);
                }

                return Results.NoContent();
            })
            .WithName(EndpointNames.DeletePreference)
            .WithSummary("Forget the edition this reader chose.")
            .Produces(StatusCodes.Status204NoContent);

        return authApi;
    }

    /// <summary>
    /// A token that authenticated and carries no subject — <see cref="ProgressEndpoints"/>'s
    /// answer, for its reason: the caller's credentials were accepted, so it is not a 401,
    /// and nothing here failed, so it is not a 500.
    /// </summary>
    private static IResult TokenCarriesNoSubject() => Results.Problem(
        title: "The token carries no subject.",
        detail: "This service files a reader's chosen edition under the token's subject claim and the token has none.",
        statusCode: StatusCodes.Status403Forbidden);
}
