using System.Text.RegularExpressions;
using AbOvo.Api.Content;
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
/// is a rule nobody can enforce and a reader cannot predict. Since #171 no write here raises
/// a step past one the reveal gate has served: <c>PUT</c> raises none, and adoption copies
/// into the account only the anonymous cursor's steps, which nothing but
/// <c>POST .../content/{track}/{unit}/advance</c> raises, applying the furthest-frame rule
/// where the two copies meet (ADR-0068).
/// </para>
/// <para>
/// Every write therefore answers with the row AS IT NOW STANDS rather than with a status.
/// The caller adopts an answer instead of assuming its own, which is what makes "my phone
/// was behind" a thing the phone learns rather than a thing it overwrites. ADR-0019.
/// </para>
/// <para>
/// <see cref="MapProgressEndpoints"/> maps onto <c>authApi</c> — authenticated and
/// rate-limited — and every row is named by the caller's own subject, read through the kernel's
/// shared resolver. <see cref="MapAnonymousProgressEndpoints"/> maps the anonymous read and the
/// anonymous forget onto <c>openWriteApi</c>, for the reasons given on each. There is no route
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
         * A PLACE AT THE FIRST STEP, OR THE PLACE AS IT STANDS — AND NEVER A RAISE (#171).
         *
         * This write used to raise `Step` to whatever a caller named, subject only to "does not
         * lower it", and the reveal gate `GET/POST .../content/**` enforces then served whatever
         * it said: a caller could name step 48 and read it having answered nothing. That was the
         * 2026-09-21 row of the deviation register in docs/architecture/00-ARCHITECTURE.md,
         * discharged on 2026-09-26. Its two callers are gone: web/app's sync sends the account no
         * place (ADR-0068), and web/mcp opens a program through `POST .../open` and moves
         * through `POST .../advance` (ADR-0066). So a step past the furthest this reader has
         * reached is REFUSED, a 409 with nothing written, and only `advance` raises one.
         *
         * What it still does, for an account: it records a place at a program's first step when
         * the account has none there, a step the gate serves to any reader (Reveal.FirstStep);
         * and it answers a step at or below the stored one with the row as it stands, ADR-0019's
         * "a phone that was behind is told the truth". A tie keeps the stored edition, as it did.
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

                // The furthest the gate has served this reader here: the stored step, or the
                // first step, which it serves to anybody. Nothing past it is this write's to name.
                var reached = existing?.Step ?? Reveal.FirstStep;
                if (update.Step > reached) return StepNotEarned(track, unit, update.Step, reached);

                if (existing is null)
                {
                    existing = new ReaderProgress
                    {
                        Subject = subject,
                        Track = track,
                        Unit = unit,
                        Step = Reveal.FirstStep,
                        Language = update.Language,
                        UpdatedAt = clock.GetUtcNow(),
                    };
                    db.ReaderProgress.Add(existing);
                    await db.SaveChangesAsync(cancellationToken);
                }

                // Otherwise nothing changes and nothing is saved: a step at or below the stored
                // one is a phone that was behind, and UpdatedAt stays where it was (ADR-0009).
                return Results.Ok(new ProgressRecord(
                    existing.Track, existing.Unit, existing.Step, existing.Language, existing.UpdatedAt));
            })
            .WithValidation<ProgressUpdate>()
            .WithName(EndpointNames.PutProgress)
            .WithSummary("Record a place at a program's first step, or be told the place as it stands. Never raises a step: a step past the furthest reached is refused, and only POST .../advance raises one.")
            .Produces<ProgressRecord>()
            .ProducesProblem(StatusCodes.Status409Conflict);

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
         * the account's copy whole: ADR-0019, exactly as the browser's `reconcile.ts` applies
         * it. The anonymous rows are LEFT AS THEY WERE. Signing in has no
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
    /// The read and the forget of a reader with NO account — issue #171 (ADR-0066 §2) and
    /// ADR-0068 §5 (issue #176). Mapped on the anonymous, rate-limited group
    /// (<c>openWriteApi</c> in <c>Program.cs</c>), because the reader they are for has no bearer
    /// to put in front of <c>authApi</c>, whose <c>GET</c> and <c>DELETE /progress</c> answer
    /// them 401. The forget's reasons follow; the read's are on it.
    /// <para>
    /// The forget removes the rows of the anonymous cursor the header names and nothing else: no
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
        /*
         * EVERY PLACE OF THE ANONYMOUS READER THE REQUEST CARRIES — ADR-0066 §2, issue #171.
         *
         * `GET /progress` answers a bearer only, and an MCP reader with no account needs the
         * same list in one call: the programs it has a place in are what `list_programs` names
         * and what the program gate asks (ADR-0056), and the edition of its most recent place
         * is the one a new program starts in. The reader is the one the header names and
         * nothing else, even beside a bearer — the forget below's rule, for its reason: an
         * account's rows are `authApi`'s to answer. Holding the id is the whole of the cursor's
         * credential (ADR-0061), so its holder may read it as they may advance it.
         *
         * One Subject, by an equality (`ReaderScopedQueries`, ADR-0020), and ordered as
         * `GET /progress` is, so the two answers read alike.
         */
        openWriteApi.MapGet("/progress/anonymous", async (
                HttpContext http,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var anonymous = ReaderIdentity.Anonymous(http);
                if (anonymous is null) return NoAnonymousReader();

                var records = await db.ReaderProgress
                    .AsNoTracking()
                    .Where(p => p.Subject == anonymous)
                    .OrderBy(p => p.Track).ThenBy(p => p.Unit)
                    .Select(p => new ProgressRecord(p.Track, p.Unit, p.Step, p.Language, p.UpdatedAt))
                    .ToListAsync(cancellationToken);

                return Results.Ok(new ProgressResponse(records));
            })
            .WithName(EndpointNames.GetAnonymousProgress)
            .WithSummary("Every place of the anonymous reader the request carries, and the furthest frame reached in each. Needs no account.")
            .Produces<ProgressResponse>();

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
    /// A <c>PUT</c> naming a step past the furthest this reader has reached — issue #171. A 409
    /// rather than a 400 or a 403: the request is well formed and the caller may write its own
    /// place, but not to a step the gate has not served, and the same request against a place
    /// further on would be answered. It names the endpoint that raises a step, so a client
    /// written against the old rule is told what replaced it and not only that it was refused.
    /// </summary>
    private static IResult StepNotEarned(string track, string unit, int named, int reached) => Results.Problem(
        title: "A step is raised by an answer, not by this write.",
        detail: $"This write names step {named}, and the furthest this reader has reached in the program is {reached}. " +
                $"Only POST /api/v1/content/{track}/{unit}/advance raises a step: it reveals the step the answer opens. " +
                "Nothing was written.",
        statusCode: StatusCodes.Status409Conflict);

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
    /// A call about the anonymous cursor — an adoption, the anonymous read or the anonymous
    /// forget — that names no anonymous reader, or names one in a shape no reader id has. A 400
    /// rather than an empty success: the caller asked about a cursor and sent nothing that
    /// identifies one, which is a fault in the request and not "no places", "nothing to adopt"
    /// or "nothing to forget".
    /// </summary>
    private static IResult NoAnonymousReader() => Results.Problem(
        title: "No anonymous reader.",
        detail: "This call acts on the anonymous reader the X-Ab-Ovo-Reader-Id header names, and it carries no such header, or none shaped like a reader id.",
        statusCode: StatusCodes.Status400BadRequest);
}
