# Migrations

Schema for `apidb`, which this service owns and no other service opens a connection to (P3).

They are applied by `MigrationHostedService` — `MigrateAsync`, never `EnsureCreated`, after
Kestrel starts, so a slow migration is not read as a failed deploy (P4). The one exception is
the InMemory provider, which has no migrator and is given `EnsureCreatedAsync` on that path
alone.

## These are PostgreSQL migrations, and that is not a formality

Read the generated SQL rather than assuming the DSL is portable:

```csharp
Subject   = table.Column<string>(type: "character varying(64)", …)
UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", …)
```

`character varying` and `timestamp with time zone` are PostgreSQL types. `MigrationBuilder`
looks provider-agnostic and is not: the column types are baked in when the migration is
generated, by whichever provider the design-time factory selected.

So **`DATABASE_PROVIDER=SqlServer` has no migrations here**, and applying these to SqlServer
fails with a SQL syntax error rather than doing something subtle. That is not a regression —
before this folder existed there were no migrations at all, and SqlServer would have started
with no tables and failed on the first query instead — but it is now reachable, and it is
worth knowing which of the two you are looking at.

Supporting SqlServer means a second migration set and a runtime choice between them:

- a second `IDesignTimeDbContextFactory` selecting `UseSqlServer`, in its own project so the
  two sets do not collide, and `MigrationsAssembly(...)` per provider in
  `DatabaseProviderExtensions`;
- and a way to run them, because a migration nobody has applied to a real SqlServer is a
  migration nobody has tested. This estate deploys PostgreSQL — `flyio/api.fly.toml` sets
  it, the AppHost runs it — so there is nowhere to run them today.

Nobody has asked for SqlServer. The provider switch keeps the option and this file records
what taking it would cost, which is cheaper than a second untested migration set nobody
runs.

## Adding one

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add <Name> \
  --project src/AbOvo.Api --startup-project src/AbOvo.Api \
  --output-dir Persistence/Migrations
```

`DesignTimeDbContextFactory` pins the provider so the generated SQL does not depend on what
happened to be in the environment when it ran. It carries a placeholder connection string
that is never opened, and no credential may be put in it.

Commit the migration, its `.Designer.cs` and the updated `AbOvoDbContextModelSnapshot.cs`
together. A snapshot that disagrees with the migrations makes the next `migrations add`
generate a diff against the wrong model, and the symptom is a migration that drops a column
somebody still uses.
