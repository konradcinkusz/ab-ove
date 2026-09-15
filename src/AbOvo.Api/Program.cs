using AbOvo.Api.Endpoints;
using AbOvo.Api.Extensions;
using AbOvo.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

// P9 — Program.cs is a manifest: a list of capabilities, each one call into an extension
// method. Wiring lives in ServiceCollectionExtensions; transport stays thin.

builder.AddServiceDefaults();

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddCorsPolicy(builder.Configuration, CorsPolicies.Frontend);
builder.Services.AddStandardRateLimiting();
builder.Services.AddApiPersistence(builder.Configuration);
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

publicApi.MapSystemEndpoints();
authApi.MapProgressEndpoints();

// adminApi carries no endpoint yet. It is declared here rather than when the first one
// arrives, because the triad is what a reviewer greps for: a group that does not exist
// cannot be seen to be missing (SERVICE-API-PATTERNS.md §2).
_ = adminApi;

app.LogIntegrationBanner();

app.Run();

/// <summary>Exposed so <c>AbOvo.Api.Tests</c> can drive the real pipeline with WebApplicationFactory.</summary>
public partial class Program;
