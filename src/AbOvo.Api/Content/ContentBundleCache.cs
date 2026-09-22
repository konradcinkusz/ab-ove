using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using AbOvo.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Content;

/// <summary>
/// The track's latest bundle, parsed once per process rather than once per request.
/// <para>
/// ADR-0060 made every frame a reader turns to a real request against
/// <see cref="ContentBundle"/>, and <c>ContentEndpoints</c>'s <c>LatestBundle</c>/<c>FindUnit</c>
/// used to answer every one of them by re-running the `ORDER BY IngestedAt DESC LIMIT 1` query
/// and re-running <c>JsonNode.Parse</c> over the WHOLE compiled book — cheap for the rare probe
/// this table was built to serve, expensive for a reading loop that now calls it on every
/// keystroke (measured: a single spec walking one 45-step program end to end drove the CI
/// harness's `AbOvo.Api` into repeated multi-second stalls, each one wide enough to fail
/// several unrelated specs queued right behind it).
/// </para>
/// <para>
/// SAFE TO CACHE FOR THE SAME REASON THE OLD CODE WAS SAFE TO RE-READ: <see cref="ContentBundle"/>
/// is immutable (ADR-0008's "bundle is the unit" carried into ADR-0060 unchanged) — a
/// (Track, Tag) row is never updated, and "the latest" changes only when a NEW tag is
/// ingested. A cache entry can therefore never go stale on its own; it only needs to be
/// dropped the moment THIS process ingests a newer one, which <see cref="Invalidate"/> does.
/// </para>
/// <para>
/// SINGLE-INSTANCE, ON PURPOSE. "Nothing is deployed" (AGENTS.md #2) — there is no second
/// `AbOvo.Api` process this cache could disagree with today. A second instance would need a
/// real invalidation signal (a bus, a poll, a short TTL); until one exists, a process-local
/// dictionary that this same process's own ingest endpoint clears is the whole problem there
/// is to solve, and inventing distributed cache invalidation for a fleet of one would be
/// exactly the premature generality AGENTS.md's domain-model rule warns against elsewhere.
/// </para>
/// </summary>
public sealed class ContentBundleCache
{
    private readonly ConcurrentDictionary<string, (string Tag, JsonObject Root)> _byTrack = new();

    /// <summary>The latest bundle's tag and parsed root for <paramref name="track"/>, or <c>null</c> if none has been ingested.</summary>
    public async Task<(string Tag, JsonObject Root)?> GetLatest(
        AbOvoDbContext db, string track, CancellationToken cancellationToken)
    {
        if (_byTrack.TryGetValue(track, out var cached)) return cached;

        var bundle = await db.ContentBundles
            .Where(c => c.Track == track)
            .OrderByDescending(c => c.IngestedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (bundle is null) return null;

        var root = JsonNode.Parse(bundle.BundleJson)!.AsObject();
        var entry = (bundle.Tag, root);
        _byTrack[track] = entry;
        return entry;
    }

    /// <summary>
    /// Called the moment this process ingests a bundle for <paramref name="track"/>, so the
    /// very next read sees it instead of serving whatever was cached before — never on a read
    /// path, only from the ingestion endpoint that just wrote the new row.
    /// </summary>
    public void Invalidate(string track) => _byTrack.TryRemove(track, out _);
}
