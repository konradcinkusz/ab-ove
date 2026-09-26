using System.Text.RegularExpressions;
using AbOvo.Api.Extensions;
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
/// <see cref="MapProgressEndpoints"/> maps onto <c>authApi</c> — authenticated and
/// rate-limited — and every row is named by the caller's own subject, read through the kernel's
/// shared resolver. <see cref="MapAnonymousProgressEndpoints"/> maps the one anonymous forget
/// onto <c>openWriteApi</c>, for the reason given on it. There is no route
/// here that takes a subject: an endpoint that let a caller name whose progress they wanted
/// is an endpoint whose authorization is a parameter.
/// </para>
/// <para>
/// A SECOND READER IS NAMED THE WAY THE FIRST IS: by what the request carries, and never by a
/// route or a body. Adoption (<c>POST /progress/adopt</c>) and the forget
/// (<c>DELETE /progress</c>) act on the anonymous cursor the request's header names
/// (ADR-0061) as well as on the account, each reader in a query of its own pinned by its own
/// equality (ADR-0068). A row is added or raised for the caller's account and for no other
/// reader; the cursor's rows are read, or removed when the reader asks to be forgotten.
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
         * closed here (it would break web/mcp, which still raises Step through it until #171
         * moves it to `POST .../advance`) and what retires it. web/app's
         * sync no longer calls it at all: a place read without an account reaches the account
         * through adoption at sign-in, below, and nothing else the browser holds does
         * (ADR-0068).
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

                /*
                 * AND THE ANONYMOUS CURSOR THE REQUEST CARRIES — ADR-0068 §5, issue #176.
                 *
                 * Adoption copies that cursor into the account at every sign-in, so a forget
                 * that left it behind would be undone by the next one — and told to the reader
                 * as reading done elsewhere. `web/app`'s proxy sends the cursor's header beside
                 * the bearer, so the forget a signed-in reader presses reaches both here, in
                 * one SaveChanges. Its own query, pinned by its own equality
                 * (`ReaderScopedQueries`, ADR-0020): two readers are two queries, never a set.
                 *
                 * A request with no header — account deletion's, made from web/app's own server
                 * (`account-deletion.ts`) — leaves the cursor alone, as that deletion leaves the
                 * browser's own record alone (ADR-0021).
                 */
                var anonymous = ReaderIdentity.Anonymous(http);
                if (anonymous is not null)
                {
                    var theirs = await db.ReaderProgress
                        .Where(p => p.Subject == anonymous)
                        .ToListAsync(cancellationToken);

                    db.ReaderProgress.RemoveRange(theirs);
                }

                await db.SaveChangesAsync(cancellationToken);

                return Results.NoContent();
            })
            .WithName(EndpointNames.DeleteProgress)
            .WithSummary("Forget every record of where this reader got to: the account's, and the anonymous cursor's the request carries.")
            .Produces(StatusCodes.Status204NoContent);

        /*
         * ADOPTION AT SIGN-IN — ADR-0068, issue #176.
         *
         * A reader who read without an account has their place under the anonymous cursor
         * (ADR-0061), and the account they then sign in to, or create, may be behind it. This
         * is how the account learns that place: `web/app` calls it from its own server as a
         * session begins, with the bearer it has just been handed and the reader-id cookie the
         * browser already held. No step arrives from the caller. Every step adopted here was
         * earned through the reveal gate: an anonymous row's step is the gate's to raise
         * (`POST .../advance`), and no write lets a caller name one — which is what lets
         * web/app's sync stop raising a step through the `PUT` above.
         *
         * Per program the furthest frame wins and its edition travels with it, and a tie keeps
         * the account's copy whole: ADR-0019, exactly as the `PUT` above and the browser's
         * `reconcile.ts` apply it. The anonymous rows are LEFT AS THEY WERE. Signing in has no
         * more claim over the cookie's place than signing out does (ADR-0061), so a reader who
         * signs out again still reads what they read without an account, a second adoption
         * changes nothing, and a sign-in whose adoption failed is repaired by the next one.
         * They go when the reader forgets them — the `DELETE` above, or the anonymous one below.
         *
         * Two reads, each pinned to one Subject by an equality (`ReaderScopedQueries`,
         * ADR-0020): the account the token names, and the anonymous reader the header names.
         * Nothing in the route or the body names either, so a caller can adopt only a cursor
         * whose id it holds — and holding the id is already the whole of that cursor's
         * credential.
         */
        authApi.MapPost("/progress/adopt", async (
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                [FromServices] TimeProvider clock,
                CancellationToken cancellationToken) =>
            {
                var subject = ClientIdentityResolver.Subject(http.User);
                if (string.IsNullOrWhiteSpace(subject)) return TokenCarriesNoSubject();

                var anonymous = ReaderIdentity.Anonymous(http);
                if (anonymous is null) return NoAnonymousReader();

                var theirs = await db.ReaderProgress
                    .AsNoTracking()
                    .Where(p => p.Subject == anonymous)
                    .ToListAsync(cancellationToken);

                if (theirs.Count > 0)
                {
                    var held = await db.ReaderProgress
                        .Where(p => p.Subject == subject)
                        .ToListAsync(cancellationToken);

                    foreach (var place in theirs)
                    {
                        /*
                         * A loop, not `held.Find(p => ...)`, and that was measured: a lambda
                         * that takes a ReaderProgress and captures `place` is compiled into a
                         * closure nested directly in this class, and ProgressIsNotEvidenceTests's
                         * reachability rule then names ProgressEndpoints. Putting it on that
                         * rule's allow-list would be a decision (ADR-0020); a loop needs none.
                         */
                        ReaderProgress? existing = null;
                        foreach (var row in held)
                        {
                            if (row.Track != place.Track || row.Unit != place.Unit) continue;
                            existing = row;
                            break;
                        }

                        if (existing is null)
                        {
                            db.ReaderProgress.Add(new ReaderProgress
                            {
                                Subject = subject,
                                Track = place.Track,
                                Unit = place.Unit,
                                Step = place.Step,
                                Language = place.Language,
                                UpdatedAt = clock.GetUtcNow(),
                            });
                        }
                        else if (place.Step > existing.Step)
                        {
                            existing.Step = place.Step;
                            existing.Language = place.Language;
                            existing.UpdatedAt = clock.GetUtcNow();
                        }
                    }

                    // One SaveChanges, so a relational provider adopts every program or none.
                    // A row this changed nothing about keeps its UpdatedAt, as the PUT's does.
                    await db.SaveChangesAsync(cancellationToken);
                }

                // The account's rows as they now stand, as the `PUT` above answers with its row.
                var records = await db.ReaderProgress
                    .AsNoTracking()
                    .Where(p => p.Subject == subject)
                    .OrderBy(p => p.Track).ThenBy(p => p.Unit)
                    .Select(p => new ProgressRecord(p.Track, p.Unit, p.Step, p.Language, p.UpdatedAt))
                    .ToListAsync(cancellationToken);

                return Results.Ok(new ProgressResponse(records));
            })
            .WithName(EndpointNames.PostAdoptProgress)
            .WithSummary("Adopt the places of the anonymous reader the request carries into this account. The furthest frame wins; the anonymous places stay as they were.")
            .Produces<ProgressResponse>();

        return authApi;
    }

    /// <summary>
    /// The forget of a reader with NO account — ADR-0068 §5, issue #176. Mapped on the
    /// anonymous, rate-limited group (<c>openWriteApi</c> in <c>Program.cs</c>), because the
    /// reader it is for has no bearer to put in front of <c>authApi</c>, whose
    /// <c>DELETE /progress</c> answers them 401.
    /// <para>
    /// It removes the rows of the anonymous cursor the header names and nothing else: no
    /// route or body names a reader, and an account's rows are <c>authApi</c>'s to remove
    /// even when the request carries a bearer. Holding the id is the whole of the cursor's
    /// credential (ADR-0061), so its holder may forget it as they may advance it.
    /// </para>
    /// <para>
    /// Without it, a reader who read without an account and pressed Forget kept their place on
    /// the server, and the account they made next adopted it back.
    /// </para>
    /// </summary>
    public static RouteGroupBuilder MapAnonymousProgressEndpoints(this RouteGroupBuilder openWriteApi)
    {
        openWriteApi.MapDelete("/progress/anonymous", async (
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var anonymous = ReaderIdentity.Anonymous(http);
                if (anonymous is null) return NoAnonymousReader();

                // Loaded and removed, for the reason the account's `DELETE` gives above; pinned
                // to the one Subject by an equality (`ReaderScopedQueries`, ADR-0020).
                var rows = await db.ReaderProgress
                    .Where(p => p.Subject == anonymous)
                    .ToListAsync(cancellationToken);

                db.ReaderProgress.RemoveRange(rows);
                await db.SaveChangesAsync(cancellationToken);

                return Results.NoContent();
            })
            .WithName(EndpointNames.DeleteAnonymousProgress)
            .WithSummary("Forget every place of the anonymous reader the request carries. Needs no account.")
            .Produces(StatusCodes.Status204NoContent);

        return openWriteApi;
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

    /// <summary>
    /// A call about the anonymous cursor — an adoption, or the anonymous forget — that names no
    /// anonymous reader, or names one in a shape no reader id has. A 400 rather than an empty
    /// success: the caller asked about a cursor and sent nothing that identifies one, which is
    /// a fault in the request and not "nothing to adopt" or "nothing to forget".
    /// </summary>
    private static IResult NoAnonymousReader() => Results.Problem(
        title: "No anonymous reader.",
        detail: "This call acts on the anonymous reader the X-Ab-Ovo-Reader-Id header names, and it carries no such header, or none shaped like a reader id.",
        statusCode: StatusCodes.Status400BadRequest);
}
