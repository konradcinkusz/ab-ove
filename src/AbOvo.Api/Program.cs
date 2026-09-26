using AbOvo.Api.Content;
using AbOvo.Api.Endpoints;
using AbOvo.Api.Extensions;
using AbOvo.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

// P9 — Program.cs is a manifest: a list of capabilities, each one call into an extension
// method. Wiring lives in ServiceCollectionExtensions; transport stays thin.

builder.AddServiceDefaults();

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddCorsPolicy(builder.Configuration, CorsPolicies.Frontend);
builder.Services.AddStandardRateLimiting(builder.Configuration);
builder.Services.AddApiPersistence(builder.Configuration);
// Singleton, not scoped: the parsed bundle it holds outlives any one request by design — see
// ContentBundleCache's own doc comment for why that is safe.
builder.Services.AddSingleton<ContentBundleCache>();
builder.Services.AddSwaggerWithJwt(
    title: "ab-ovo API",
    version: "v1",
    description: "Reader progress and the book's instrument. Validates RS256 tokens issued by authservice; holds no key material and mints nothing (P5).");

builder.Services.AddProblemDetails();

var app = builder.Build();

// One uniform error shape for the whole surface (SERVICE-API-PATTERNS.md §3).
app.UseExceptionHandler();
app.UseStatusCodePages();

app.UseCors(CorsPolicies.Frontend);
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.UseSwaggerWithJwt("v1", "ab-ovo API");

app.MapDefaultEndpoints();

// The authorization triad, in the composition root (SERVICE-API-PATTERNS.md §2).
var publicApi = app.MapGroup("/api/v1").WithTags("v1");
var authApi = app.MapGroup("/api/v1").WithTags("v1")
    .RequireAuthorization()
    .RequireRateLimiting(RateLimitPolicies.Api);
var adminApi = app.MapGroup("/api/v1/admin").WithTags("admin")
    .RequireAuthorization(policy => policy.RequireRole("Admin", "SuperAdmin"))
    .RequireRateLimiting(RateLimitPolicies.Api);

/*
 * A FOURTH GROUP, AND IT IS NOT A FOURTH MEMBER OF THE TRIAD.
 *
 * SERVICE-API-PATTERNS.md §2's triad is about AUTHORIZATION, and this group's authorization
 * is `publicApi`'s: none, deliberately. Consent is not an account (issue #14) and the reader
 * loop works without one (ADR-0004), so an instrument that required a token would measure
 * the book as experienced by account-holders and call it the book.
 *
 * What it does not share with `publicApi` is the RATE LIMIT. That group carries none because
 * its endpoints are health and service-info — reads, and ones a probe makes. This group
 * WRITES, anonymously, so it takes the same explicit policy the authenticated group does
 * rather than falling through to the global limiter. It is a separate `MapGroup` because
 * adding `.RequireRateLimiting` to `publicApi` would put it on the probes too, and a probe
 * that gets 429'd takes the machine out of rotation — which the kernel already goes out of
 * its way to prevent.
 */
var openWriteApi = app.MapGroup("/api/v1").WithTags("v1")
    .RequireRateLimiting(RateLimitPolicies.Api);

publicApi.MapSystemEndpoints();
authApi.MapProgressEndpoints();
authApi.MapPreferenceEndpoints();
openWriteApi.MapOutcomeEndpoints();

// ADR-0068 §5 — the forget of a reader with no account, which has to reach the anonymous
// cursor adoption would otherwise copy into the next account signed in on that browser. It
// WRITES with no account, so it is this group's and not authApi's.
openWriteApi.MapAnonymousProgressEndpoints();

// ADR-0060 — content reads share openWriteApi's shape (anonymous, explicitly rate-limited)
// rather than publicApi's: these are real content-serving reads a reader's session drives
// repeatedly, not a probe. The reveal gate inside them is what keeps a reader from naming an
// unreached step, not this group's authorization, which is none, deliberately (ADR-0004).
openWriteApi.MapContentEndpoints();

// The instrument's read, and the admin group's first endpoint. Nothing on it is about a
// reader, so the gate is not a confidentiality one — it is that a thin ranked list misleads
// its reader, and the author's view carries the sentence that says so where a public JSON
// endpoint would carry nothing (ADR-0024 §4, issue #17).
adminApi.MapRateEndpoints();

// Content ingestion — ADR-0060. Admin because publishing a new bundle is a deliberate,
// auditable act (ADR-0008's "content lags, and that is the cost of the pin"), not an implicit
// step of every deploy.
adminApi.MapContentAdminEndpoints();

app.LogIntegrationBanner();

app.Run();

/// <summary>Exposed so <c>AbOvo.Api.Tests</c> can drive the real pipeline with WebApplicationFactory.</summary>
public partial class Program;
