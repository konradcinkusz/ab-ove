// P1 — one command brings the system up: dotnet run --project src/AbOvo.AppHost
//
// Every resource is declared here with its edges — WithReference, WaitFor,
// WithHttpHealthCheck — and nothing else. No secret is ever a literal: parameters come from
// `dotnet user-secrets` via AddParameter(..., secret: true) (P5).

var builder = DistributedApplication.CreateBuilder(args);

// ── Identity ────────────────────────────────────────────────────────────────────────────
// authservice is adopted as an external service, run from its PUBLISHED image. Its source is
// never vendored or modified (INIT §7, SHARED-SERVICE-REUSE.md §2: pinned, never :latest).
//
// v0.3.1, not the v0.1.0 that every upstream doc example shows: RS256, the JWKS endpoint and
// the discovery document do not exist before v0.3.0, and pointing a validator at an earlier
// tag leaves the shared-secret model P5 exists to forbid.
var authSigningKey = builder.AddParameter("auth-signing-key", secret: true);
var authDbPassword = builder.AddParameter("auth-db-password", secret: true);

// ── Data ────────────────────────────────────────────────────────────────────────────────
// P3 — one Postgres instance, a logical database per service. Physical co-location is a
// cost decision and is allowed; the logical boundary is what must not be crossed.
var postgres = builder.AddPostgres("postgres", password: authDbPassword)
    .WithDataVolume("ab-ovo-pgdata")
    .WithPgAdmin();

var apiDb = postgres.AddDatabase("apidb");
var authDb = postgres.AddDatabase("authdb");

var authservice = builder.AddContainer("authservice", "ghcr.io/konradcinkusz/authservice", "v0.3.1")
    .WithHttpEndpoint(port: 8081, targetPort: 8080, name: "http")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithEnvironment("Jwt__Algorithm", "RS256")
    .WithEnvironment("Jwt__PrivateKeyPem", authSigningKey)
    .WithEnvironment("Jwt__Issuer", AbOvoIdentity.Issuer)
    .WithEnvironment("Jwt__Audience", AbOvoIdentity.Audience)
    .WithEnvironment("Database__SchemaMode", "EnsureCreated")
    .WithEnvironment("ConnectionStrings__DefaultConnection", authDb.Resource.ConnectionStringExpression)
    .WithEnvironment("Cors__AllowedOrigins__0", "http://localhost:3000")
    .WaitFor(authDb);

// ── Services ────────────────────────────────────────────────────────────────────────────
var api = builder.AddProject<Projects.AbOvo_Api>("api")
    .WithReference(apiDb)
    .WaitFor(apiDb)
    .WithEnvironment("DATABASE_PROVIDER", "PostgreSQL")
    .WithEnvironment("Jwt__Authority", authservice.GetEndpoint("http"))
    .WithEnvironment("Jwt__Issuer", AbOvoIdentity.Issuer)
    .WithEnvironment("Jwt__Audience", AbOvoIdentity.Audience)
    // The AppHost's own endpoint is plain http, so metadata discovery must be allowed over
    // it. On Fly the issuer is https and this is never set (see flyio/api.fly.toml).
    .WithEnvironment("Jwt__RequireHttpsMetadata", "false")
    .WithEnvironment("Cors__AllowedOrigins__0", "http://localhost:3000")
    .WithHttpHealthCheck("/health");

// ── Product surface ─────────────────────────────────────────────────────────────────────
builder.AddNextJsApp("web", "../../web/app")
    .WithPnpm()
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(port: 3000, env: "PORT")
    // Addresses reach the frontend at RUN time, never baked in at build time: a
    // NEXT_PUBLIC_* address costs one image per environment and breaks build-once-deploy-many
    // (FRONTEND-BFF.md §2, P12). The web app re-reads these per request in /api/config.
    .WithEnvironment("AB_OVO_API_URL", api.GetEndpoint("http"))
    .WithEnvironment("AB_OVO_AUTH_URL", authservice.GetEndpoint("http"));

builder.Build().Run();

/// <summary>
/// One issuer and one audience for this system, referenced rather than retyped.
/// <para>
/// authservice defaults both to the bare string "AuthService", and its own deployment guide
/// states the rule: "Two products both on the defaults would accept each other's tokens."
/// Every deployment is meant to be an independent trust root, so both are product-specific.
/// </para>
/// </summary>
internal static class AbOvoIdentity
{
    internal const string Issuer = "AbOvo";
    internal const string Audience = "AbOvo";
}
