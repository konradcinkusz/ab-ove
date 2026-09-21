using System.Text.Json;
using System.Text.Json.Nodes;
using AbOvo.Api.Content;
using AbOvo.Api.Extensions;
using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using AbOvo.ServiceDefaults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Endpoints;

/// <summary>
/// The content API — ADR-0060. `AbOvo.Api` now ingests, stores and serves the book's
/// compiled bundle; the frame-level reveal gate (<see cref="Content.Reveal"/>) lives here,
/// once, so every client calls the same copy instead of each holding its own.
/// <para>
/// The reading group is anonymous — reading requires no account (ADR-0060's other half).
/// The reader's identity, signed in or anonymous, comes from
/// <see cref="AbOvo.Api.Extensions.ReaderIdentity"/>, never from a route parameter.
/// </para>
/// <para>
/// NAVIGATES THE STORED BUNDLE WITH <c>System.Text.Json</c> RATHER THAN A TYPED MODEL. The
/// bundle's real shape lives once, in <c>@ab-ovo/web-kit</c>'s <c>schema.ts</c>; mirroring it
/// as a parallel C# hierarchy would be a second copy with nothing to keep the two in step
/// (P11). What this file reads out of the JSON is exactly what <see cref="StepContent"/> and
/// <see cref="UnitSummary"/> carry — nothing more.
/// </para>
/// </summary>
public static class ContentEndpoints
{
    public static RouteGroupBuilder MapContentEndpoints(this RouteGroupBuilder anonContentApi)
    {
        anonContentApi.MapGet("/content/{track}", async (
                string track,
                [FromServices] ContentBundleCache cache,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var bundle = await cache.GetLatest(db, track, cancellationToken);
                if (bundle is null) return Results.NotFound();

                var root = bundle.Value.Root;
                var programs = root["units"]!.AsArray()
                    .Select(unit => new ProgramSummary(
                        unit!["id"]!.GetValue<string>(),
                        ToText(unit["titles"]),
                        ToPart(unit["part"])))
                    .ToList();
                var languages = root["track"]?["languages"]?.AsArray()
                    .Select(language => language!.GetValue<string>())
                    .ToList() ?? [];

                return Results.Ok(new TrackContent(bundle.Value.Tag, languages, programs));
            })
            .WithName(EndpointNames.GetPrograms)
            .WithSummary("The current bundle's tag, editions and every program in it.")
            .Produces<TrackContent>();

        anonContentApi.MapGet("/content/{track}/{unit}", async (
                string track,
                string unit,
                [FromServices] ContentBundleCache cache,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var unitNode = await FindUnit(cache, db, track, unit, cancellationToken);
                if (unitNode is null) return Results.NotFound();

                var steps = unitNode["steps"]!.AsArray();
                return Results.Ok(new UnitSummary(
                    unitNode["id"]!.GetValue<string>(),
                    ToText(unitNode["titles"]),
                    steps.Count,
                    ToSections(unitNode["sections"]),
                    ToPart(unitNode["part"])));
            })
            .WithName(EndpointNames.GetUnit)
            .WithSummary("A program's title and step count.")
            .Produces<UnitSummary>();

        anonContentApi.MapGet("/content/{track}/{unit}/{step:int}", async (
                string track,
                string unit,
                int step,
                HttpContext http,
                [FromServices] ContentBundleCache cache,
                [FromServices] AbOvoDbContext db,
                CancellationToken cancellationToken) =>
            {
                var unitNode = await FindUnit(cache, db, track, unit, cancellationToken);
                if (unitNode is null) return Results.NotFound();
                var steps = unitNode["steps"]!.AsArray();

                /*
                 * INLINED, NOT A SHARED HELPER — ProgressIsNotEvidenceTests's architecture
                 * test (ADR-0009 §1) only sees a NAMED method reaching ReaderProgress; an
                 * endpoint lambda's own body is invisible to it because the compiler emits
                 * it into a generated closure, which is also why ProgressEndpoints reaches
                 * the table directly rather than through a helper. A reader who has opened
                 * nothing is at step 1 (Reveal.FirstStep), same default a caller with no
                 * resolvable identity gets.
                 */
                var identity = ReaderIdentity.Resolve(http);
                var cursorStep = identity is null
                    ? Reveal.FirstStep
                    : (await db.ReaderProgress.AsNoTracking().SingleOrDefaultAsync(
                        p => p.Subject == identity && p.Track == track && p.Unit == unit,
                        cancellationToken))?.Step ?? Reveal.FirstStep;

                var served = Reveal.Serve(steps.Count, cursorStep, step);

                return Results.Ok(ToStepResponse(served, steps));
            })
            .WithName(EndpointNames.GetStep)
            .WithSummary("One step, subject to the reveal gate.")
            .Produces<StepResponse>();

        anonContentApi.MapPost("/content/{track}/{unit}/advance", async (
                string track,
                string unit,
                AdvanceRequest request,
                HttpContext http,
                [FromServices] ContentBundleCache cache,
                [FromServices] AbOvoDbContext db,
                [FromServices] TimeProvider clock,
                CancellationToken cancellationToken) =>
            {
                var identity = ReaderIdentity.Resolve(http);
                if (identity is null) return NoIdentity();

                var unitNode = await FindUnit(cache, db, track, unit, cancellationToken);
                if (unitNode is null) return Results.NotFound();
                var steps = unitNode["steps"]!.AsArray();

                var existing = await db.ReaderProgress.SingleOrDefaultAsync(
                    p => p.Subject == identity && p.Track == track && p.Unit == unit,
                    cancellationToken);
                var cursorStep = existing?.Step ?? Reveal.FirstStep;

                // Idempotency, the submit_answer precedent from the MCP tool surface: a retry
                // that names a step the reader has already moved past records nothing and
                // hands back the step they are on now, rather than advancing a second time.
                if (request.AnsweringStep != cursorStep)
                {
                    var current = Reveal.Serve(steps.Count, cursorStep, cursorStep);
                    return Results.Ok(ToStepResponse(current, steps));
                }

                var advanced = Reveal.Advance(steps.Count, cursorStep);
                if (!advanced.Ok)
                {
                    return Results.Ok(new StepResponse(false, null, ToGateRefusal(advanced.Refusal!)));
                }

                if (existing is null)
                {
                    db.ReaderProgress.Add(new ReaderProgress
                    {
                        Subject = identity,
                        Track = track,
                        Unit = unit,
                        Step = advanced.NewCursorStep,
                        Language = request.Language,
                        UpdatedAt = clock.GetUtcNow(),
                    });
                }
                else
                {
                    existing.Step = advanced.NewCursorStep;
                    existing.Language = request.Language;
                    existing.UpdatedAt = clock.GetUtcNow();
                }
                await db.SaveChangesAsync(cancellationToken);

                var served = Reveal.Serve(steps.Count, advanced.NewCursorStep, advanced.Step);
                return Results.Ok(ToStepResponse(served, steps));
            })
            .WithValidation<AdvanceRequest>()
            .WithName(EndpointNames.PostAdvance)
            .WithSummary("Submit the reader's answer and reveal the next step. The only way this service's cursor moves forward.")
            .Produces<StepResponse>();

        return anonContentApi;
    }

    /// <summary>
    /// Ingestion — ADR-0060. Trusts that the caller already ran <c>@ab-ovo/web-kit</c>'s
    /// <c>validateBundle</c> against this exact JSON before POSTing it; this endpoint checks
    /// only the shape it needs to serve (a track id, a tag, a non-empty units array), not the
    /// full structural contract. A second, independent implementation of six hundred lines of
    /// structural rules would be the thing P11 exists to prevent, not a safety net.
    /// </summary>
    public static RouteGroupBuilder MapContentAdminEndpoints(this RouteGroupBuilder adminApi)
    {
        adminApi.MapPost("/content/bundles", async (
                HttpContext http,
                [FromServices] ContentBundleCache cache,
                [FromServices] AbOvoDbContext db,
                [FromServices] TimeProvider clock,
                CancellationToken cancellationToken) =>
            {
                using var reader = new StreamReader(http.Request.Body);
                var raw = await reader.ReadToEndAsync(cancellationToken);

                JsonNode? root;
                try
                {
                    root = JsonNode.Parse(raw);
                }
                catch (JsonException ex)
                {
                    return IngestRejected($"the body is not valid JSON: {ex.Message}");
                }

                var trackId = root?["track"]?["id"]?.GetValue<string>();
                var tag = root?["tag"]?.GetValue<string>();
                var units = root?["units"]?.AsArray();

                if (string.IsNullOrWhiteSpace(trackId) || string.IsNullOrWhiteSpace(tag)
                    || units is null || units.Count == 0)
                {
                    return IngestRejected(
                        "expected a compiled bundle with track.id, tag and a non-empty units " +
                        "array — this endpoint trusts that validateBundle already ran on the " +
                        "caller's side and only checks the shape it needs to serve.");
                }

                var existing = await db.ContentBundles.SingleOrDefaultAsync(
                    c => c.Track == trackId && c.Tag == tag, cancellationToken);
                if (existing is not null)
                {
                    // ADR-0008's immutability, carried forward: a bundle is never re-ingested
                    // under the same (track, tag). Re-posting the same pin is a no-op, not an
                    // overwrite — new content needs a new tag.
                    return Results.Ok();
                }

                db.ContentBundles.Add(new ContentBundle
                {
                    Track = trackId,
                    Tag = tag,
                    BundleJson = root!.ToJsonString(),
                    IngestedAt = clock.GetUtcNow(),
                });
                await db.SaveChangesAsync(cancellationToken);
                // So the very next read of this track sees this bundle rather than whatever
                // was cached before it — see ContentBundleCache's own doc comment.
                cache.Invalidate(trackId);

                return Results.Created($"/api/v1/content/{trackId}", new { trackId, tag });
            })
            .WithName(EndpointNames.PostIngestBundle)
            .WithSummary("Ingest a compiled, already-validated content bundle.")
            .Produces(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status200OK);

        return adminApi;
    }

    private static async Task<JsonObject?> FindUnit(
        ContentBundleCache cache, AbOvoDbContext db, string track, string unit,
        CancellationToken cancellationToken)
    {
        var bundle = await cache.GetLatest(db, track, cancellationToken);
        if (bundle is null) return null;

        return bundle.Value.Root["units"]!.AsArray()
            .Select(u => u!.AsObject())
            .FirstOrDefault(u => u["id"]!.GetValue<string>() == unit);
    }

    private static StepResponse ToStepResponse(Reveal.Served served, JsonArray steps)
    {
        if (!served.Ok) return new StepResponse(false, null, ToGateRefusal(served.Refusal!));

        var stepNode = steps[served.Step - 1]!.AsObject();
        return new StepResponse(true, new StepContent(
            stepNode["n"]!.GetValue<int>(),
            stepNode["kind"]!.GetValue<string>(),
            ToText(stepNode["body"]),
            stepNode["titles"] is { } titles ? ToText(titles) : null,
            stepNode["answer"] is { } answer ? ToText(answer) : null,
            stepNode["cue"]?.GetValue<bool>() ?? false), null);
    }

    private static GateRefusal ToGateRefusal(Reveal.Refusal refusal) => new(
        refusal.Kind.ToString(), refusal.Requested, refusal.Furthest, refusal.Steps, refusal.Explain());

    private static Dictionary<string, string> ToText(JsonNode? node)
    {
        var result = new Dictionary<string, string>();
        if (node is null) return result;
        foreach (var (language, value) in node.AsObject())
        {
            result[language] = value?.GetValue<string>() ?? string.Empty;
        }
        return result;
    }

    /// <summary>
    /// <c>unit.part</c> — Schema v2, absent from a v1 bundle and from any track that has no
    /// parts (<c>web-kit</c>'s <c>Part</c>). Navigation metadata only: an id and its titles,
    /// never a step range — the book's own <c>--parts</c> check is the one source for that.
    /// </summary>
    private static PartSummary? ToPart(JsonNode? node)
        => node is null ? null : new PartSummary(node["id"]!.GetValue<string>(), ToText(node["titles"]));

    /// <summary>
    /// <c>unit.sections</c> — headings and where they start, never the steps under them. A
    /// unit may open under no heading (a Quiz and an opener precede §1 in every program), so
    /// an absent array is an empty list rather than a default section invented here.
    /// </summary>
    private static List<SectionSummary> ToSections(JsonNode? node)
        => node is null
            ? []
            : node.AsArray()
                .Select(section => new SectionSummary(
                    section!["id"]!.GetValue<string>(),
                    ToText(section["titles"]),
                    section["firstStep"]!.GetValue<int>()))
                .ToList();

    private static IResult IngestRejected(string detail) => Results.Problem(
        title: "Not a content bundle.",
        detail: detail,
        statusCode: StatusCodes.Status400BadRequest);

    private static IResult NoIdentity() => Results.Problem(
        title: "No reader identity.",
        detail: "This call carries neither a session token nor the anonymous reader-id header.",
        statusCode: StatusCodes.Status400BadRequest);
}
