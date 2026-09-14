# `scripts/`

Onboarding and secret scanning. Three scripts and a hook, and each one runs alone.

REPO-BASELINE.md §4: "Put a README BESIDE the scripts listing every environment variable
by tier, plus worked recipes for the common partial operations." That is what §2 below and
§4 below are.

| | What it does | Needs |
|---|---|---|
| `setup.sh` | one-command onboarding, four numbered steps | bash |
| `setup.ps1` | the same four steps on PowerShell | pwsh 7, or Windows PowerShell 5.1 + the .NET SDK |
| `scan-secrets.sh` | the local mirror of the CI secret-scan job | bash, gitleaks |
| `hooks/pre-commit` | blocks a commit whose staged content looks like a secret | bash, gitleaks |

**Both setup scripts exist on purpose.** A generation instruction that only works on one
platform fails at step one of onboarding — and here the step that would fail is the one
that generates the mandatory secret, because PowerShell ships no `openssl`. They do the
same four things and are kept in step deliberately; changing one means changing the other.

**Every script is self-sufficient** (§4): each runs from any working directory, resolves
the repository root itself, and depends on no other script having run first. A script that
only works as step three of a sequence cannot be used in an incident.

---

## 1. Onboarding

```bash
bash scripts/setup.sh              # or:  pwsh -File scripts/setup.ps1
bash scripts/setup.sh --check      # report what is missing; change nothing
bash scripts/setup.sh --non-interactive   # steps 1-3, skip every optional step
bash scripts/setup.sh --help
```

Four numbered steps:

1. **Prerequisites** — every one named, with an install pointer. `--check` is this step
   alone, and it is written to run on a machine with **nothing** installed: every probe is
   guarded, and the path resolution uses shell builtins only. (The first draft used
   `dirname`, which is an external command; with an empty `PATH` it failed silently and the
   script reported a confident wrong repository root. That is the shape of bug this whole
   directory is written against.)
2. **The local secret store** — `dotnet user-secrets init`, plus `core.hooksPath`, so the
   pre-commit hook is a tracked file rather than an untracked copy in `.git/hooks`.
3. **The mandatory secret, generated** — an RSA 2048 PKCS#8 keypair for the local
   authservice container, and the local database password. Generated rather than asked
   for: an invented secret is a weak secret or an empty one. Neither ever touches the
   working tree, so there is no `.pem` to forget to delete.
4. **Optional integrations**, each labelled `(optional — needed for <feature>)` with what
   degrades if it is skipped.

**A fresh clone with every optional step skipped still runs.** That is a property of the
scaffold, not an aspiration: skip all of them and
`dotnet run --project src/AbOvo.Api` serves `/health` and `/api/v1/info` on an in-memory
database, with `/health` naming each degradation.

Both scripts carry a **troubleshooting table keyed on the literal exception text** in their
header — `IDX10703`, `NETSDK1045`, `ERR_PNPM_NO_LOCKFILE`, `Cannot connect to the Docker
daemon`. Keyed that way because symptom prose does not get found: only the literal string
gets found by pasting it into a search box.

### The secret's journey, once

```
local store  ->  AppHost parameter  ->  environment variable  ->  config key
```

```
dotnet user-secrets set          builder.AddParameter(       .WithEnvironment(        configuration[
  "Parameters:auth-signing-key"    "auth-signing-key",         "Jwt__PrivateKeyPem",    "Jwt:PrivateKeyPem"]
  --project src/AbOvo.AppHost      secret: true)               authSigningKey)
```

Two names that are otherwise met without context:

- **`Parameters:<name>`** is the configuration key shape Aspire's `AddParameter` reads.
- **`Jwt__PrivateKeyPem`** is double-underscored because a colon is not legal in an
  environment variable name on every platform; .NET maps `__` to `:`. **A single underscore
  does not map**, and the symptom is a service that starts perfectly and behaves as though
  the setting were absent.

---

## 2. Every variable, by tier

`secrets.env.example` is the authoritative list: it carries each variable's tier, where its
value comes from, and a `without it:` line. This section is the index into it.

| Tier | Means | Where it lives |
|---|---|---|
| **always** | required for the service to be CORRECT | `fly.toml` `[env]`, or the AppHost |
| **mode** | selects behaviour; absent, a documented default is taken | `fly.toml` `[env]`, or the AppHost |
| **secret** | a credential — never in the tree, never in `[env]`, never in a commit | `dotnet user-secrets` / `fly secrets set` |
| **ci** | read by a workflow, not by a running service | GitHub **Environment** `dev` |
| **tuning** | changes a number, not a behaviour; every one has a working default | anywhere |

These map onto REPO-BASELINE §2's three tiers as **always + secret** → *always required*,
**ci** → *required in CI*, **mode + tuning** → *optional*. Five are used because "optional"
hides the distinction that matters most in practice: **a `mode` variable left unset does
not fail — it silently picks the other behaviour.**

### always

| Variable | Consumer |
|---|---|
| `ASPNETCORE_URLS` | API (set in the Dockerfile) |
| `Cors__AllowedOrigins__0` | API, authservice |
| `Jwt__Authority` | API |
| `Jwt__Issuer`, `Jwt__Audience` | API, authservice |
| `Jwt__Algorithm` | authservice — **set it explicitly; the inferred value is HS256** |
| `Jwt__PublicBaseUrl` | authservice |
| `AB_OVO_API_URL`, `AB_OVO_AUTH_URL` | web |
| `PORT`, `HOSTNAME` | web (set in the Dockerfile) |

### mode

| Variable | Default if unset |
|---|---|
| `DATABASE_PROVIDER` | InMemory |
| `Database__SchemaMode` | schema init does not run; `/health/ready` never clears |
| `Jwt__RequireHttpsMetadata` | `true` — set `false` **only** in the AppHost |
| `Network__ClientIpHeader` | `Fly-Client-IP` |
| `Network__TrustProxyClientIpHeader` | `false` — the limiter keys on the socket peer |
| `Swagger__Enabled` | off outside Development |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `AB_OVO_AUTH_PUBLIC_URL` | the server-side address is reused |
| `AB_OVO_JWT_ISSUER`, `AB_OVO_JWT_AUDIENCE` | `AbOvo` |

### secret

| Variable | Set by |
|---|---|
| `ConnectionStrings__apidb` | the workflow, **assembled** from a password and a known host |
| `ConnectionStrings__DefaultConnection` | the workflow, assembled, `authdb` only |
| `Jwt__PrivateKeyPem` | the workflow (deployed) / `setup.sh` step 3 (local) |
| `Parameters:auth-signing-key` | `setup.sh` step 3 — local store, never the tree |
| `Parameters:auth-db-password` | `setup.sh` step 3 |

### ci — the GitHub Environment named `dev`

| Variable | Used for |
|---|---|
| `FLY_API_TOKEN` | every `flyctl` call in every workflow |
| `JWT_PRIVATE_KEY_PEM` | `Jwt__PrivateKeyPem` on authservice |
| `POSTGRES_PASSWORD` | the `abovo` superuser |
| `APIDB_PASSWORD` | the `abovo_api` role, and half of the API's connection string |
| `AUTHDB_PASSWORD` | the `abovo_auth` role, and half of authservice's |
| `GITLEAKS_LICENSE` | only if this repository moves to an organisation |

**Five root secrets, and nothing else.** Everything beyond them is **derived**: connection
strings are assembled from a password plus a known host rather than stored per service. A
secret set by hand on one app and forgotten is how environments drift.

They live in a GitHub **Environment**, not in repository secrets: an environment can carry
required reviewers, a branch restriction and a deployment history; a repository secret can
carry none of those and is readable by every workflow in the repo.

### tuning

`OTEL_EXPORTER_OTLP_ENDPOINT` · `Logging__LogLevel__Default` · `AB_OVO_ENVIRONMENT` ·
`AB_OVO_PROXY_TIMEOUT_MS` · `NODE_ENV` · `NEXT_TELEMETRY_DISABLED`

### One authoritative source per variable

The same topology is described in three places and they are **not** equals. The estate's
recorded drift was found exactly here — a variable present in the dev branch of a
composition root and missing from the publish branch.

| Place | Authoritative for |
|---|---|
| `src/AbOvo.AppHost/AppHost.cs` | LOCAL development |
| `flyio/*.fly.toml` `[env]` | DEPLOYED non-secret configuration |
| `.github/workflows/flyio.yml` | DEPLOYED secrets (`fly secrets set`) |

---

## 3. Secret scanning — both halves

| | Runs | Catches |
|---|---|---|
| `hooks/pre-commit` | before each commit, on the staged index | the mistake **before it becomes history** |
| `.github/workflows/secret-scan.yml` | every PR, every push to `main` | contributors **with no hooks installed** |
| `scan-secrets.sh` | on demand | the same scan as CI, in seconds rather than a push cycle |

Neither of the first two substitutes for the other, and that is why both exist. The hook is
the only one that can *prevent* the leak; CI is the only one that covers a machine you do
not control.

All three read `/.gitleaks.toml`. **A hook tuned differently from CI is two scanners, and
the looser of the two defines the repository's real posture.**

```bash
bash scripts/scan-secrets.sh                  # all history reachable from HEAD  (CI on push)
bash scripts/scan-secrets.sh --since main     # only this branch's commits       (CI on a PR)
bash scripts/scan-secrets.sh --staged         # the index                        (the hook)
bash scripts/scan-secrets.sh --working-tree   # files on disk, tracked or not
bash scripts/scan-secrets.sh --report out.json
```

The hook **fails closed** when gitleaks is absent, and names the install command. A hook
that passes when the scanner is missing is indistinguishable from one that passed because
the commit was clean. To commit once without it — CI still scans:

```bash
ABOVO_SKIP_SECRET_SCAN=1 git commit ...
```

**If a scan finds something already pushed, stop and read `SECURITY.md`.** The order is
**rotate first, clean history second**: the commit was public the moment it was pushed, so
scrubbing without rotating is theatre.

---

## 4. Worked recipes

### Re-run onboarding on a machine that already has secrets

```bash
bash scripts/setup.sh
```

Idempotent. An existing `Parameters:auth-signing-key` is **left alone** — regenerating it
invalidates every token already issued locally.

### Rotate the local signing key deliberately

```bash
dotnet user-secrets remove "Parameters:auth-signing-key" --project src/AbOvo.AppHost
bash scripts/setup.sh --non-interactive
```

Existing local tokens stop validating, which is the point. `IDX10501 ... Unable to match
key` is what a stale one looks like.

### Check prerequisites without changing anything

```bash
bash scripts/setup.sh --check     # exit 1 if a REQUIRED prerequisite is missing
```

### Install only the hook, on a machine that is already set up

```bash
git config core.hooksPath scripts/hooks
```

### Reproduce the CI secret-scan failure locally

```bash
bash scripts/scan-secrets.sh --since origin/main
```

CI checks out with `fetch-depth: 0` because a shallow clone is a scan of the tip commit
wearing the report of a full one — it would pass on a repository whose second commit added
a key and whose third removed it from the working tree. If a local scan disagrees with CI,
check the clone depth before the rules.

### Run without a container engine

```bash
dotnet run --project src/AbOvo.Api     # in-memory database; /health names the degradation
dotnet test
```

The full stack — Postgres and authservice — needs
`dotnet run --project src/AbOvo.AppHost` and a running engine.

### Verify a deployed signing key actually published a JWKS

```bash
curl -fsS https://ab-ovo-authservice-dev.fly.dev/.well-known/jwks.json | jq -e '.keys | length > 0'
```

An empty `keys` array is a **green deployment in which every downstream service rejects
every token** — the shape a missing key plus an unset `Jwt__Algorithm` produces. That one
request is the difference between finding out now and finding out from a user.

### Reach the database by hand

```bash
fly proxy 15432:5432 --app ab-ovo-postgres
psql "host=localhost port=15432 dbname=apidb user=abovo_api"
```

Never over a public listener — there is not one, and there will not be one.

---

## 5. What is deliberately NOT here

**No numbered deployment runbook.** REPO-BASELINE §4 prescribes `0-setup-first-time`,
`1-build-push`, `2-deploy-dev`, `3-destroy-dev` as thin aliases over descriptively named
implementations, with a `.last-image-tag` hand-off file and a documented tag-resolution
order — *explicit parameter → hand-off file → `latest`*.

**This repository deploys from CI**, and the three workflows are the runbook:
`flyio.yml` (tag-driven build and ordered deploy), `flyio-scale.yml`, `flyio-destroy.yml`.
App and volume creation are idempotent and live in the workflow, never in `fly launch` from
a laptop — `fly launch` writes a config nobody reviewed and creates an app whose settings
exist nowhere in git.

The convention is written down here rather than implemented, so that **if** hand-run
deployment scripts are ever added they land in `flyio/` under those names, with the
hand-off file and the documented resolution order, rather than being invented afresh. Two
rules go with them and are cheap to forget:

- **Teardown lists keep HISTORICAL names.** After any rename, the destroy list keeps the
  legacy aliases alongside the current ones — otherwise the old resources outlive every
  cleanup and bill forever. (`ab-ove` is the current repository name and `ab-ovo` is the
  intended one; the app names are already `ab-ovo-*`.)
- **Bulk cleanup treats an individual failure as a SKIP, not an abort.** One failure
  aborting the run means the cleanup never completes.

---

## Related

| | |
|---|---|
| `secrets.env.example` | every variable, its tier, and what degrades without it |
| `SECURITY.md` | reporting, and the rotate-then-scrub order |
| `.gitleaks.toml` | the rules all three scanners read |
| `flyio/SECRETS.md` | the five root secrets and the one-time human setup |
| `flyio/README.md` | the deployed topology |
