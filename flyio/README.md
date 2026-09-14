# `flyio/` — the deployed topology

Every Fly app ab-ovo runs, in one directory listing. The `fly.toml` files live here
rather than beside each service because the deploy workflow reads them as a set, and
because the whole topology should be visible at once (FLY-IO-DEPLOYMENT §3).

| File                          | App                        | Shape |
| ----------------------------- | -------------------------- | ----- |
| `postgres.fly.toml`           | `ab-ovo-postgres`          | Stateful. No public listener, ever. |
| `authservice.fly.toml`        | `ab-ovo-authservice-dev`   | Stateless HTTP, from an **external** published image. |
| `api.fly.toml`                | `ab-ovo-api-dev`           | Stateless HTTP, built from `src/AbOvo.Api/Dockerfile`. |
| `web.fly.toml`                | `ab-ovo-web-dev`           | Stateless HTTP, built from `web/app/Dockerfile`. |
| `SECRETS.md`                  | —                          | What is a secret, where it lives, how to set it, and the one-time human setup. |
| `INFRASTRUCTURE-ANALYSIS.md`  | —                          | Topology, sizing, and the four cost questions answered. |

App names are `<system>-<service>-<env>` because `app` is globally unique across all of
Fly, not just across one organisation (§4). `ab-ovo-postgres` carries no environment
suffix deliberately — see `INFRASTRUCTURE-ANALYSIS.md` §0.

Region `waw` everywhere (ADR-0002). Images to **GHCR** (ADR-0003) — the constitution's
§2 disagreement table settles the registry as GHCR, "portable and free at this scale".
The Fly guide's own pipeline is written against `registry.fly.io`; this repository takes
GHCR and deploys with `flyctl deploy --image ghcr.io/...`.

---

## Which address reaches what

The single most useful table in this directory (§6). Getting it wrong produces a
service-to-service call that works all day and fails after an idle period.

| Address | Reaches | Auto-starts a stopped machine | Use for |
| ------- | ------- | ----------------------------- | ------- |
| `https://<app>.fly.dev` | Public internet, via the Fly proxy | **yes** | Browsers, **and service→service HTTP** |
| `<app>.internal:<port>` | 6PN mesh, direct to machines (IPv6 / AAAA only) | **no** | Databases, and anything that never stops |
| `<app>.flycast:<port>` | 6PN, via the proxy | yes | Private service→service, once a private IPv6 is allocated |

So: **`ab-ovo-postgres.internal:5432`** for the database, **`https://ab-ovo-*.fly.dev`**
for every HTTP hop between services. The issuer URL is public regardless of anything
else, because it is stamped into `iss` and every validator fetches JWKS from it (§6, §14).

---

## Contracts this directory places on files it does not own

Each of these is depended on by a `fly.toml` here and lives somewhere else. A missing
one is a deploy failure, not a lint warning.

### `/.dockerignore` (repository root) — required by `api.fly.toml`

`src/AbOvo.Api/Dockerfile` builds with the **repository root** as context, so the
context is whatever the root `.dockerignore` leaves in. Minimum useful contents:

```gitignore
**/bin/
**/obj/
**/node_modules/
**/.next/
.git/
.github/
docs/
tests/
web/
content/
*.md
```

`**/bin/` and `**/obj/` are the load-bearing two. Without them the source `COPY` in the
Dockerfile overwrites the container's restore output with the host's
`obj/project.assets.json`, whose `packageFolders` point at a path that does not exist in
the image — and `dotnet publish --no-restore` then fails on packages it was just told
were restored (§3, §15).

### `web/app/Dockerfile` — required by `web.fly.toml`

`web.fly.toml` declares `context = "../web"`, the **pnpm workspace root**, not
`../web/app`. §4's rule of thumb — a Node Dockerfile takes the project directory as
context — assumes the project directory holds the lockfile, and here it does not:
`pnpm-lock.yaml` and `pnpm-workspace.yaml` live at `web/`. So:

* COPY paths are relative to `web/`: `COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./`,
  then `COPY app/package.json app/`, then `pnpm install --frozen-lockfile`, then the source.
* `web/.dockerignore` must exclude `**/node_modules` and `**/.next`.
* Next.js `output: "standalone"`, final stage runs `node server.js`.
* Non-root `USER nextjs`, `EXPOSE 3000`, and the process must bind `0.0.0.0` — a
  container bound to loopback is unreachable from the Fly proxy and the symptom is a
  deploy that hangs and then fails on health checks (§2, §14). `PORT` and `HOSTNAME`
  are set in `web.fly.toml`.
* **A route handler at `/healthz`** returning 200 only when the server can render, and
  503 otherwise. The Fly check points there and not at `/`, because a frontend serving
  a broken bundle still returns 200 for its index page (§2).
* API and issuer addresses are read **server-side at runtime** from `AbOvo__*`. Never
  `NEXT_PUBLIC_*`: those are inlined into the client bundle at build time, which gives
  one image per environment (§5, §14).

### `.github/workflows/` — three files, and no more (§3, §12)

* `flyio.yml` — tag-driven (`v*`) `test → detect-changes → build (matrix) → deploy (ordered)`.
* `flyio-scale.yml` — manual scale up/down, **excluding `ab-ovo-postgres`**.
* `flyio-destroy.yml` — manual teardown behind a typed confirmation, defaulting to
  keeping the volume, destroying in reverse dependency order.

What this directory assumes of them:

* **App and volume creation are idempotent and live in the workflow**, never in
  `fly launch` from a laptop — `fly launch` writes a config nobody reviewed and creates
  an app whose settings exist nowhere in git (§11).
* **A service whose Fly app does not exist is always selected** by change detection.
  That one rule is what lets a cold estate come up from a single tag, and what rescues
  you after a `flyio-destroy` run (§10).
* **Postgres is gated separately** from the services — redeploying it restarts it (§10).
* **Every deploy gate accepts `success || skipped`** from its upstream, or an unchanged
  service in the middle of the chain blocks everything behind it (§10).
* **Build once**, push to `ghcr.io/konradcinkusz/ab-ovo-<service>:<tag>`, and deploy with
  `flyctl deploy --image`. Never build inside a deploy step.
* **At least one post-deploy assertion the health check cannot make** — for ab-ovo that
  is `GET /.well-known/jwks.json | jq -e '.keys | length > 0'`. `--wait-timeout` covers
  "did it start", not "is it correct" (§10). See `SECRETS.md` §5.
* Secrets set with `--stage`, from the pipeline, never by hand (§9).

---

## Deploying by hand, when you must

The pipeline is the supported path. These are the exact equivalents, for the day
something is wedged.

```bash
# State first, and --ha=false: a second machine gets a second EMPTY volume, not a replica.
flyctl deploy --config flyio/postgres.fly.toml --ha=false

# Identity, from its pinned external image.
flyctl deploy --config flyio/authservice.fly.toml \
  --image ghcr.io/konradcinkusz/authservice:v0.3.1

# API and web, from an image the build stage already pushed.
flyctl deploy --config flyio/api.fly.toml --image ghcr.io/konradcinkusz/ab-ovo-api:$TAG
flyctl deploy --config flyio/web.fly.toml --image ghcr.io/konradcinkusz/ab-ovo-web:$TAG
```

Order is `state → auth → domain services → frontends` (§10), and the reasoning is in
`INFRASTRUCTURE-ANALYSIS.md` §6.

```bash
# The database, from a laptop. There is no public listener and there will not be one.
fly proxy 15432:5432 --app ab-ovo-postgres
```

---

## The four things most likely to bite

Collected from §14 because each one presents as something other than its cause.

1. **Deploy hangs, then fails on health checks** → the process bound `localhost`, or
   `internal_port` ≠ the port it binds. Check the toml against the Dockerfile's
   `ASPNETCORE_URLS` / `PORT`.
2. **`initdb: directory not empty`** → `PGDATA` at the mount root, where `lost+found`
   lives. It is a subdirectory in `postgres.fly.toml` for exactly this reason, and the
   failure "is silent-looking and costs an hour the first time" (§8).
3. **Every token rejected after a deploy that looked healthy** → `Jwt__Authority` on
   the API is not the URL the issuer publishes itself at, or `Jwt__Algorithm` was unset
   and an empty JWKS was published. One `curl` of `/.well-known/jwks.json` settles it.
4. **Build works locally, breaks in CI** → `[build] context` not declared, so the build
   depended on where `flyctl` happened to be invoked. Every toml here declares it;
   `postgres.fly.toml` and `authservice.fly.toml` declare `image` instead and build
   nothing, which is the one case where its absence is correct.
