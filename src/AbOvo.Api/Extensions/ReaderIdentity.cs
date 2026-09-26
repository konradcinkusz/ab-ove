using System.Diagnostics.CodeAnalysis;
using AbOvo.ServiceDefaults;
using Microsoft.AspNetCore.Http;

namespace AbOvo.Api.Extensions;

/// <summary>
/// ADR-0061 — resolves the identity a content read or a cursor advance is filed under,
/// covering the reader `ClientIdentityResolver` (in the kernel) was never asked to cover: one
/// who has never signed in.
/// <para>
/// Lives in <c>AbOvo.Api</c>, not <c>AbOvo.ServiceDefaults</c>. Nothing outside this service
/// resolves a reader's content-reading identity, and the kernel's line-count ceiling (P2)
/// should not absorb a concern with exactly one caller.
/// </para>
/// <para>
/// An authenticated subject is returned BARE, exactly as
/// <see cref="ClientIdentityResolver.Subject"/> and every existing
/// <c>ReaderProgress.Subject</c> row already store it — changing that shape now would
/// silently stop matching every row written before this file existed. Only the new,
/// anonymous case is prefixed, <c>anon:&lt;uuid&gt;</c>, which cannot collide with a bare
/// subject claim by construction (the prefix is not a character a claim value contains) and
/// borrows the visual convention <see cref="ClientIdentityResolver.Resolve"/> already uses
/// for its own, unrelated rate-limit buckets.
/// </para>
/// </summary>
public static class ReaderIdentity
{
    /// <summary>
    /// ADR-0061 — the header the web app's BFF proxy injects server-side, from the reader's
    /// <c>ab_ovo_rid</c> cookie, the same way it already injects <c>Authorization</c> from a
    /// session cookie. Never trusted from anywhere else: a client that could set this itself
    /// could claim any other anonymous reader's cursor.
    /// </summary>
    public const string HeaderName = "X-Ab-Ovo-Reader-Id";

    /// <summary>
    /// The authenticated subject if the request carries one, else the anonymous reader-id
    /// header if it is present and shaped like one, else <c>null</c>. A caller with neither
    /// has no cursor to read or write and must be told so — this method does not invent one;
    /// minting happens once, in the web app's middleware (ADR-0061), not on every API call
    /// that happens to be missing it.
    /// </summary>
    public static string? Resolve(HttpContext context)
    {
        var subject = ClientIdentityResolver.Subject(context.User);
        if (!string.IsNullOrWhiteSpace(subject)) return subject;

        return Anonymous(context);
    }

    /// <summary>
    /// The anonymous reader the header names, as <c>anon:&lt;uuid&gt;</c>, WHETHER OR NOT the
    /// request also carries a bearer — or <c>null</c> when the header is absent or not shaped
    /// like one. <see cref="Resolve"/> lets a bearer win, which is right for every read and
    /// every advance: one request, one cursor. Adoption at sign-in is the one call that needs
    /// both at once — the account the bearer names and the anonymous cursor whose places it
    /// takes (ADR-0068, issue #176) — so it asks for this half by name.
    /// </summary>
    public static string? Anonymous(HttpContext context) =>
        context.Request.Headers.TryGetValue(HeaderName, out var values)
        && TryParseAnonymousId(values.ToString(), out var anonymousId)
            ? $"anon:{anonymousId}"
            : null;

    /// <summary>
    /// Bounds what can reach <c>ReaderProgress.Subject</c> from a header, the same discipline
    /// <c>ProgressEndpoints.IdentifierShape</c> applies to route segments: not injection
    /// defence (EF parameterises), a bound on what a key column may hold. The cookie this
    /// header carries is always minted as <see cref="Guid"/>-shaped by
    /// <c>web/app/src/middleware.ts</c>; anything else did not come from there.
    /// </summary>
    private static bool TryParseAnonymousId(string? raw, [NotNullWhen(true)] out string? id)
    {
        id = null;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        if (!Guid.TryParse(raw, out var parsed)) return false;

        id = parsed.ToString("D");
        return true;
    }
}
