# Secrets

What is a secret, where it lives, how to set it, and the one-time human setup.
Governed by FLY-IO-DEPLOYMENT §9 (configuration and secrets) and §11 (bootstrapping).

**Nothing in this file is a value.** Every secret below is named, never written down.
If you find yourself about to paste a value into this file, into a `fly.toml`, or into
a commit message, that is the failure this document exists to prevent.

---

## 1. The split

|                   | Where                     | Visible in                                          | Set by          |
| ----------------- | ------------------------- | --------------------------------------------------- | --------------- |
| Non-secret config | `[env]` in a `fly.toml`   | `git diff`, `fly config show`, image metadata        | committed file  |
| Secrets           | Fly secrets               | nothing — names and digests only                     | `fly secrets set`, from CI |

The test is §9's: **would you paste it into a pull request?** If not, it is a secret —
and everything in `[env]` ends up in the image config and in `fly config show`, so
"it is only in the toml" is not a mitigation.

Concretely, for ab-ovo: authority URLs, the issuer and audience strings, allowed
origins, `DATABASE_PROVIDER`, `Jwt__Algorithm`, `Database__SchemaMode`, the client-IP
header name and the log level are **configuration**. Connection strings, the RSA
signing key and the Postgres passwords are **secrets**.

---

## 2. What is a secret, per app

Secrets are named here and set by the pipeline. No app holds a credential for a
database it does not own — that is P3, and `flyio/postgres.fly.toml` enforces it in
SQL (`REVOKE CONNECT … FROM PUBLIC`) rather than relying on these names alone.

### `ab-ovo-postgres`

| Secret              | Required | What it is |
| ------------------- | -------- | ---------- |
| `POSTGRES_PASSWORD` | yes      | The superuser password for the `abovo` role. Never handed to a service. |
| `APIDB_PASSWORD`    | yes      | Password for `abovo_api`, the role that owns `apidb`. |
| `AUTHDB_PASSWORD`   | yes      | Password for `abovo_auth`, the role that owns `authdb`. |

**Ordering matters, once.** The two role passwords are read by the first-boot init
script in `postgres.fly.toml`, and the postgres entrypoint runs
`/docker-entrypoint-initdb.d/*` **only when the data directory is empty**. So they
must be staged *before* the app's first deploy — create app, stage secrets, deploy.
Stage them afterwards and you get a healthy Postgres with no application databases in
it, and the recovery is to destroy the volume and redeploy.

Rotating either one later is two steps, not one: `ALTER ROLE … PASSWORD` against the
running instance (`fly proxy 15432:5432 --app ab-ovo-postgres`), then re-set the
consuming service's connection string. Re-running the init script is not an option.

### `ab-ovo-authservice-dev`

| Secret                                 | Required | What it is |
| -------------------------------------- | -------- | ---------- |
| `ConnectionStrings__DefaultConnection`  | yes      | `authdb` only. Assembled by the workflow; never stored whole. |
| `Jwt__PrivateKeyPem`                    | yes      | PKCS#8 RSA ≥ 2048. The one key that signs every token in the estate. |

`Jwt__PrivateKeyPem` is the reason §9 says to check for critical secrets explicitly and
exit non-zero: a service that boots with an **ephemeral** signing key looks perfectly
healthy while invalidating every token it ever issued, on every restart. And with
`Jwt__Algorithm` unset a missing key silently infers HS256 and publishes an **empty**
JWKS — green health checks, and every downstream validator rejecting every token.
`Jwt__Algorithm = "RS256"` is pinned in the toml for that reason, and the post-deploy
assertion in §5 below is what actually catches it.

### `ab-ovo-api-dev`

| Secret                        | Required | What it is |
| ----------------------------- | -------- | ---------- |
| `ConnectionStrings__apidb`     | no\*     | `apidb` only. Assembled by the workflow. |

\* Not required to **start**. P8: with no connection string the service falls back to
InMemory and `/health` reports the degradation rather than refusing to boot. It *is*
required for the service to be useful, so the workflow treats it as critical for a
deploy to `dev` and fails if it is missing.

The API holds **no key material at all** (P5). It validates RS256 against
authservice's published JWKS; there is no shared symmetric secret, because a symmetric
secret shared between two services means verify = mint.

### `ab-ovo-web-dev`

None today, and that is a property worth keeping. Reading needs no account, so the
browser needs no credential; and although every frame is now a server-side call to the API
([ADR-0060](../docs/adr/0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md)),
that call carries the reader's own bearer or their opaque reader cookie
([ADR-0061](../docs/adr/0061-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md)),
not a credential of this app's — so the server side still has nothing to keep. The day this
app becomes a BFF holding a session cookie key, that key goes in Fly secrets and not in
`[env]`.

---

## 3. One-time human setup

Exactly three things, once per repository (§11). **No app creation, no volume
creation, no `fly launch`** — `fly launch` writes a config nobody reviewed and creates
an app whose settings exist nowhere in git. The workflow creates apps and volumes
idempotently.

### 3a. The Fly deploy token

```bash
fly tokens create org --name "ab-ovo github actions" --expiry 8760h
```

Store the output as **`FLY_API_TOKEN`** in a GitHub **Environment** named `dev` —
*Settings → Environments → dev → Environment secrets* — and **not** as a repository
secret. An environment can carry required reviewers, a branch restriction and a
deployment history; a repository secret can carry none of those and is readable by
every workflow in the repo.

### 3b. The RSA signing keypair

```bash
# PKCS#8, RSA 2048. `genpkey` emits "BEGIN PRIVATE KEY" — which is what authservice wants.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out abovo-jwt-private.pem

# The public half, for inspection only. It is NOT a secret and does NOT need to be
# deployed anywhere: validators fetch it from the JWKS endpoint.
openssl rsa -in abovo-jwt-private.pem -pubout -out abovo-jwt-public.pem
```

**Use `genpkey`, not `genrsa`.** `openssl genrsa` emits PKCS#1 (`BEGIN RSA PRIVATE
KEY`), which is the wrong container — the header alone tells you which you have.

**On Windows**, run this under **WSL** or **Git Bash**; both ship `openssl`. PowerShell
does not, and the `openssl.exe` bundled with some tooling has produced a key with CRLF
line endings, which is not a PEM.

Paste the **whole file including both header lines** into the `dev` environment as
**`JWT_PRIVATE_KEY_PEM`**. A GitHub secret preserves newlines; a PEM with its newlines
stripped is not parseable and the service will start anyway on an inferred HS256.

Then delete the local copy, or keep it somewhere a laptop backup will not reach.

### 3c. The three database passwords

```bash
openssl rand -hex 32     # run three times
```

`-hex` rather than `-base64` on purpose: the output is `[0-9a-f]` only, so it needs no
escaping inside a connection string, inside the SQL string literal the init script
builds, or inside a shell argument. A `base64` password containing `+` or `/` is legal
everywhere and looks fine right up until something quotes it differently.

Store them in the `dev` environment as **`POSTGRES_PASSWORD`**, **`APIDB_PASSWORD`**
and **`AUTHDB_PASSWORD`**.

### The complete `dev` environment

| Name                   | Used for |
| ---------------------- | -------- |
| `FLY_API_TOKEN`        | every `flyctl` call in every workflow |
| `POSTGRES_PASSWORD`    | the `abovo` superuser on `ab-ovo-postgres` |
| `APIDB_PASSWORD`       | the `abovo_api` role; also half of the API's connection string |
| `AUTHDB_PASSWORD`      | the `abovo_auth` role; also half of authservice's connection string |
| `JWT_PRIVATE_KEY_PEM`  | `Jwt__PrivateKeyPem` on authservice |

Five root secrets, and nothing else. **Everything else the estate needs is derived**
(§9): connection strings are assembled from a password plus a known host, not stored
per service. A secret set by hand on one app and forgotten is how environments drift.

---

## 4. How the pipeline sets them

Always `--stage`. `fly secrets set` restarts the app, and staging holds the change
until the next deploy so one release does not restart a service twice (§9).

```bash
# Postgres — staged BEFORE the app's first deploy (see §2).
flyctl secrets set -a ab-ovo-postgres --stage \
  "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
  "APIDB_PASSWORD=$APIDB_PASSWORD" \
  "AUTHDB_PASSWORD=$AUTHDB_PASSWORD"

# authservice — the connection string is ASSEMBLED, not stored.
# .internal, not .flycast and not a public address: a database is reached over 6PN
# and never has a public listener (§5, §6).
flyctl secrets set -a ab-ovo-authservice-dev --stage \
  "ConnectionStrings__DefaultConnection=Host=ab-ovo-postgres.internal;Port=5432;Database=authdb;Username=abovo_auth;Password=$AUTHDB_PASSWORD" \
  "Jwt__PrivateKeyPem=$JWT_PRIVATE_KEY_PEM"

# API — apidb only. It gets no credential for authdb (P3).
flyctl secrets set -a ab-ovo-api-dev --stage \
  "ConnectionStrings__apidb=Host=ab-ovo-postgres.internal;Port=5432;Database=apidb;Username=abovo_api;Password=$APIDB_PASSWORD"
```

**Quote the PEM argument.** `"Jwt__PrivateKeyPem=$JWT_PRIVATE_KEY_PEM"` in double
quotes preserves the newlines; unquoted, the shell splits the key into twenty-odd
arguments and `flyctl` takes the first line as the whole value. The service then boots
on a key it cannot parse.

`fly secrets import` is the wrong tool here: it reads `KEY=value` lines from stdin and
has no way to express a multi-line value.

Before any of that, fail fast on what is missing (§9):

```bash
for name in FLY_API_TOKEN POSTGRES_PASSWORD APIDB_PASSWORD AUTHDB_PASSWORD JWT_PRIVATE_KEY_PEM; do
  [ -n "${!name:-}" ] || { echo "::error::$name is not set in the dev environment"; exit 1; }
done
```

A missing signing key must stop the deploy, not degrade it.

---

## 5. Verifying, without reading anything back

Values are never readable back. Names and digests are:

```bash
flyctl secrets list -a ab-ovo-authservice-dev
```

A digest that did not change when you expected it to is the tell that a `--stage`
never landed.

The check that actually matters is the post-deploy assertion (§10), because
`--wait-timeout` covers "did it start", not "is it correct":

```bash
curl -fsS https://ab-ovo-authservice-dev.fly.dev/.well-known/jwks.json \
  | jq -e '.keys | length > 0' > /dev/null
```

An empty `keys` array is a green deployment in which every downstream service rejects
every token. That one request is the difference between finding out now and finding
out from a user.

---

## 6. Reaching the database by hand

Never over a public listener — there is not one, and there will not be one (§5).

```bash
fly proxy 15432:5432 --app ab-ovo-postgres
psql "host=localhost port=15432 dbname=apidb user=abovo_api"
```
