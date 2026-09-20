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

// The one password every seeded example account shares — GENERATED rather than written
// here, and persisted to this project's `dotnet user-secrets` so it is the same on the next
// run. AGENTS.md's rule 6 is absolute ("no secret is ever a literal, anywhere") and it bites
// here in a way it does not in tests/e2e/fixtures/accounts.mts: that file's value is allowed
// because no deployment has ever accepted it, and these accounts are accepted by a running
// identity service. `scripts/setup.sh`'s reasoning for generating rather than asking applies
// unchanged — an invented secret is a weak secret or an empty one.
//
// Read it back with: dotnet user-secrets list --project src/AbOvo.AppHost
var seedPassword = builder.AddParameter(
    "seed-password",
    new GenerateParameterDefault
    {
        // authservice's Identity policy, read from its Program.cs: eight or more, with an
        // upper, a lower, a digit and a non-alphanumeric. A generated value that missed one
        // would fail every registration with a message about the reader's password.
        MinLength = 24,
        MinLower = 1,
        MinUpper = 1,
        MinNumeric = 1,
        MinSpecial = 1,
    },
    secret: true,
    persist: true);

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
    // The one account authservice makes itself. Its own DbSeeder creates the three role
    // rows and, from these two keys, a SuperAdmin — the only role that may grant a role, so
    // without it `AbOvo.Api`'s admin group is unreachable from a fresh clone and `seed`
    // below has no one to promote the author with. Skipped once any SuperAdmin exists, so
    // it is safe across restarts of a kept volume.
    .WithEnvironment("InitialAdmin__Email", AbOvoDevAccounts.Administrator)
    .WithEnvironment("InitialAdmin__Password", seedPassword)
    // ADR-0004: the readiness endpoint is /health/ready and NOT /health — the latter answers
    // 200 as soon as Kestrel binds, while the schema is still being created in a background
    // service. Declared here so `WaitFor(authservice)` means "ready" rather than "started",
    // which is the difference between the seeder's first registration landing in a database
    // with tables and one without.
    .WithHttpHealthCheck("/health/ready")
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

// ── Development tools ───────────────────────────────────────────────────────────────────
// The example accounts, made on demand rather than at startup.
//
// `WithExplicitStart()` is Aspire's own idiom for this — its documentation's example is a
// database clean-up tool that "isn't started with the app host; the resource start command
// can be used to run it on demand later". The resource appears in the dashboard stopped,
// with a Start button, and its console output appears beside every other resource's log.
//
// NOT AT STARTUP, deliberately, and for two reasons. It writes to a database that outlives
// the process (`ab-ovo-pgdata`), so a run that nobody asked for is a side effect nobody
// asked for; and P1's promise is that one command brings the system UP, which a seeder that
// has to succeed before the estate is usable would quietly turn into two things that must
// both work.
builder.AddProject<Projects.AbOvo_Seed>("seed")
    .WithEnvironment("AB_OVO_AUTH_URL", authservice.GetEndpoint("http"))
    .WithEnvironment("AB_OVO_SEED_PASSWORD", seedPassword)
    // The same constant authservice is given above, so the two cannot disagree about which
    // address is the administrator's — the seeder signs in as it to grant a role.
    .WithEnvironment("AB_OVO_SEED_ADMIN_EMAIL", AbOvoDevAccounts.Administrator)
    .WaitFor(authservice)
    .WithExplicitStart();

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

/// <summary>
/// The accounts a LOCAL machine gets, and the one address two resources have to agree on.
/// <para>
/// authservice seeds this one itself, from <c>InitialAdmin__Email</c>; <c>seed</c> signs in
/// as it to grant the author's role, because only a SuperAdmin may grant one. Two literals
/// would be two chances for the second to be edited and the first forgotten, which presents
/// as a seeder that cannot sign in for no visible reason.
/// </para>
/// <para>
/// <c>.test</c> is reserved by RFC 2606 and resolves nowhere, which is the same convention
/// <c>tests/e2e/fixtures/accounts.mts</c> uses: an address that cannot receive mail cannot
/// become somebody's real account by accident. The PASSWORD is never here — it is the
/// generated <c>seed-password</c> parameter above (AGENTS.md rule 6).
/// </para>
/// </summary>
internal static class AbOvoDevAccounts
{
    internal const string Administrator = "admin@ab-ovo.test";
}
