using AbOvo.Seed;

// ════════════════════════════════════════════════════════════════════════════════════════
// THE LOCAL SEEDER — a development tool, started from the Aspire dashboard.
//
// It exists because a fresh clone could sign in and could not sign up, so every account in
// the estate had to be made by hand with curl before anything behind the gate could be
// looked at. `/register` closes the reader's half of that; this closes the DEVELOPER's,
// including the half `/register` cannot reach — a role, which `POST /auth/register` never
// grants.
//
// WHY IT IS A RESOURCE AND NOT A `WithCommand` ON authservice. Aspire's own documentation
// gives this shape for exactly this job: a project declared with `WithExplicitStart()`, not
// run at startup, started from the dashboard when it is wanted. What that buys over a
// command is the LOG — the dashboard shows this process's stdout beside every other
// resource's, so "which accounts exist and what happened to each" is a thing you read
// rather than a toast that disappears. It also keeps `AppHost.cs` to what it says it is:
// resources and their edges, and nothing else.
//
// IT IS FOR DEVELOPMENT AND SAYS SO. P1 — the AppHost is the development composition root
// and not the production topology; nothing under `flyio/` references this project, and a
// deployed estate has no seed resource to start.
// ════════════════════════════════════════════════════════════════════════════════════════

// P5 — configuration through the environment, and no secret is ever a literal. The AppHost
// supplies all three: the address as a resource endpoint, the password as a generated
// parameter persisted to `dotnet user-secrets`, and the administrator's address as the same
// constant it hands authservice, so the two cannot disagree about who the administrator is.
var authBaseUrl = Environment.GetEnvironmentVariable("AB_OVO_AUTH_URL");
var password = Environment.GetEnvironmentVariable("AB_OVO_SEED_PASSWORD");
var administratorEmail = Environment.GetEnvironmentVariable("AB_OVO_SEED_ADMIN_EMAIL");

if (string.IsNullOrWhiteSpace(authBaseUrl) || string.IsNullOrWhiteSpace(password))
{
    // The message is the command, which is this repository's standing rule for a tool that
    // stops (scripts/README.md keys its troubleshooting table on literal text for the same
    // reason). A seeder that merely said "misconfigured" would send somebody reading code.
    Console.Error.WriteLine(
        """
        The seeder needs an identity service and a password, and was given neither or only one.

          AB_OVO_AUTH_URL        where authservice is        (set: {0})
          AB_OVO_SEED_PASSWORD   the example accounts' one   (set: {1})

        Both are supplied by the AppHost. Start this from the Aspire dashboard rather than
        on its own:

          dotnet run --project src/AbOvo.AppHost

        then press Start on the `seed` resource.
        """
            .Replace("{0}", string.IsNullOrWhiteSpace(authBaseUrl) ? "no" : "yes")
            .Replace("{1}", string.IsNullOrWhiteSpace(password) ? "no" : "yes"));
    return 1;
}

using var cancellation = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    // A seeder is interruptible: it makes accounts one at a time and leaves the ones it has
    // already made, which is the same state a second run starts from.
    eventArgs.Cancel = true;
    cancellation.Cancel();
};

using var http = new HttpClient
{
    BaseAddress = new Uri(authBaseUrl, UriKind.Absolute),
    // Per REQUEST, not for the run. The readiness loop below owns the overall patience.
    Timeout = TimeSpan.FromSeconds(30),
};

var identity = new Identity(http);
var token = cancellation.Token;

Console.WriteLine($"seeding example accounts against {authBaseUrl}");

// authservice creates its schema in a background service, so "listening" and "ready" are
// different moments. See `WaitUntilReadyAsync`.
if (!await identity.WaitUntilReadyAsync(TimeSpan.FromMinutes(3), token))
{
    Console.Error.WriteLine(
        $"authservice at {authBaseUrl} did not report ready within three minutes. Nothing was created.");
    return 1;
}

var consent = await identity.ConsentVersionsAsync(token);
if (consent is null)
{
    Console.Error.WriteLine(
        """
        authservice would not say which Terms and Privacy versions a registration must accept
        (GET /api/v1/auth/consents/versions). Nothing was created — an account made without
        that answer is one it refuses, and a guessed version would be a consent record that
        says something untrue.
        """);
    return 1;
}

var (terms, privacy) = consent.Value;
Console.WriteLine($"consent versions: terms {terms}, privacy {privacy}");
Console.WriteLine();

var failed = false;

foreach (var reader in ExampleReaders.All)
{
    var (result, detail) = await identity.RegisterAsync(reader.Email, password, terms, privacy, token);

    // `AlreadyExists` is a success and is reported as one. This tool is meant to be run
    // again — after a restart, after a colleague's branch, out of habit — and a second run
    // that reported failures nobody needed to act on would teach its reader to ignore it.
    var ok = result != Registration.Refused;
    failed |= !ok;

    Console.WriteLine($"{(ok ? "  ok    " : "  FAILED")} {reader.Email,-24} {detail}");
    Console.WriteLine($"          {reader.Purpose}");
}

Console.WriteLine();

// ── The roles ───────────────────────────────────────────────────────────────────────────
//
// `POST /api/v1/auth/register` grants none — authservice's own DbSeeder creates the three
// role rows and stops there — so an account that needs one is registered first and promoted
// second, through the admin surface, which only a SuperAdmin may use. That SuperAdmin is
// the one authservice seeds itself from `InitialAdmin__Email`/`InitialAdmin__Password`; the
// AppHost sets both, and this tool is told which address to expect.

var wantRoles = ExampleReaders.All.Where(reader => reader.Roles.Length > 0).ToArray();

if (wantRoles.Length == 0)
{
    Console.WriteLine("no example account asks for a role; nothing to promote.");
    return failed ? 1 : 0;
}

if (string.IsNullOrWhiteSpace(administratorEmail))
{
    // Not a failure: a deployment may deliberately have no seeded administrator, and the
    // accounts above are still made and still usable. What must not happen is silence —
    // `/instrument` would then 403 for every seeded account with nothing saying why.
    Console.WriteLine(
        "AB_OVO_SEED_ADMIN_EMAIL is unset, so no administrator was available to grant roles.");
    Console.WriteLine(
        $"  {string.Join(", ", wantRoles.Select(reader => reader.Email))} exist without theirs;");
    Console.WriteLine("  /instrument will refuse them until a SuperAdmin grants the role.");
    return failed ? 1 : 0;
}

var administratorToken = await identity.SignInAsync(administratorEmail, password, token);

if (administratorToken is null)
{
    Console.Error.WriteLine(
        $"""
         Could not sign in as {administratorEmail}, so no role was granted.

         authservice seeds that account from InitialAdmin__Email/InitialAdmin__Password at
         startup, and SKIPS the seeding entirely once any SuperAdmin exists — so the usual
         cause is a database volume that outlived the password. Either sign in with the
         password that account was made with, or drop the volume and start again:

           docker volume rm ab-ovo-pgdata
         """);
    return 1;
}

foreach (var reader in wantRoles)
{
    var found = await identity.FindAsync(administratorToken, reader.Email, token);

    if (found is null)
    {
        Console.Error.WriteLine($"  FAILED {reader.Email,-24} not found through the admin surface");
        failed = true;
        continue;
    }

    var (userId, held) = found.Value;

    foreach (var role in reader.Roles)
    {
        // Asked before granted, because upstream answers a duplicate grant with a 400 that
        // is indistinguishable from a real refusal without reading its sentence. Checking
        // first is what makes a second run quiet rather than merely harmless.
        if (held.Contains(role, StringComparer.OrdinalIgnoreCase))
        {
            Console.WriteLine($"  ok     {reader.Email,-24} already holds {role}");
            continue;
        }

        var refusal = await identity.AssignRoleAsync(administratorToken, userId, role, token);

        if (refusal is null)
        {
            Console.WriteLine($"  ok     {reader.Email,-24} granted {role}");
        }
        else
        {
            Console.Error.WriteLine($"  FAILED {reader.Email,-24} {role}: {refusal}");
            failed = true;
        }
    }
}

Console.WriteLine();
Console.WriteLine("Sign in at http://localhost:3000/login with any address above.");
Console.WriteLine("The password is the `seed-password` parameter, which the AppHost generated:");
Console.WriteLine("  dotnet user-secrets list --project src/AbOvo.AppHost");
Console.WriteLine();
// Printed nowhere, deliberately. The value is one command away for whoever is running this,
// and a log line is the one place a credential ends up in a telemetry exporter.

return failed ? 1 : 0;
