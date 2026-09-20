# Infrastructure analysis

Topology, sizing and cost reasoning for ab-ovo on Fly.io (P7).
Answers the four questions FLY-IO-DEPLOYMENT §13 requires an analysis to answer.

Every claim here is either a number from a `fly.toml` in this directory or a decision
with its consequence attached. **"Could be optimised" is not an answer**; §13 asks for
decisions someone can take, so each option below carries what it actually costs.

---

## 0. Topology

Four Fly apps, one per service — a Fly app is a name, a config, a set of secrets and an
IP, and machines within one app all run the same container, so two services never share
one (§1).

```text
                    browser
                       │  https
                       ▼
            ┌──────────────────────┐
            │   ab-ovo-web-dev     │  Next.js standalone, :3000, min 0
            └──────────┬───────────┘
              server side │ https (public URL — the proxy wakes a stopped machine)
                 ┌────────┴─────────┐
                 ▼                  ▼
    ┌────────────────────┐  ┌──────────────────────────┐
    │   ab-ovo-api-dev   │  │ ab-ovo-authservice-dev   │
    │  .NET 10, :8080    │─▶│  :8080, min 1            │
    │  min 1             │  │  JWKS + discovery        │
    └─────────┬──────────┘  └────────────┬─────────────┘
              │ 6PN, .internal:5432       │ 6PN, .internal:5432
              ▼                           ▼
            ┌──────────────────────────────────┐
            │        ab-ovo-postgres           │  postgres:17-alpine, 1 machine,
            │  apidb (abovo_api)               │  3gb volume, NO public listener
            │  authdb (abovo_auth)             │
            └──────────────────────────────────┘
```

Two addressing rules, and they point in opposite directions on purpose (§6):

* **Service-to-service HTTP uses the public URL**, `https://<app>.fly.dev`. The Fly
  proxy starts a stopped machine; `.internal` does not. Point a caller at `.internal`
  and the callee scales to zero and the call fails instead of waking it. The hop stays
  inside Fly's network either way.
* **Postgres is addressed at `ab-ovo-postgres.internal:5432`**, always. It never scales
  to zero, so the auto-start argument does not apply, and a public listener would be
  pure risk. `.internal` resolves to AAAA records only; Npgsql is IPv6-capable.

---

## 1. What runs when nothing is happening?

| App                      | Machines when idle | Memory | Volume | Why that number |
| ------------------------ | ------------------ | ------ | ------ | --------------- |
| `ab-ovo-postgres`        | **1**              | 1 gb   | 3 gb   | Stateful. A volume is a local disk bound to one machine; it cannot stop and cannot be replicated (§8). |
| `ab-ovo-authservice-dev` | **1**              | 512 mb | —      | `min_machines_running = 1` — see §2. |
| `ab-ovo-api-dev`         | **1**              | 512 mb | —      | `min_machines_running = 1` — see §2. |
| `ab-ovo-web-dev`         | **0**              | 512 mb | —      | Entered only from a browser; a cold start is a slow first page, not a failed call (§7). |

**Three machines and one volume, always on. 2 gb of RAM and 3 gb of disk.**

At Fly's published list prices — *order of magnitude, confirm against
<https://fly.io/docs/about/pricing/> before anyone budgets on it* — that is roughly
**$12–13 a month**: about $5.70 for the 1 gb Postgres machine, about $3.19 for each
always-on 512 mb machine, and $0.15/gb/month for the volume. Bandwidth for a book with
a handful of readers is noise. A dedicated IPv4 would be $2/month; all four apps use
the shared one, which is free.

The figure that decides anything is **three machines**, not the dollars. Each option in
§3 is expressed in machines for that reason: the rate moves, the topology does not.

---

## 2. Which services pin a machine, and which synchronous call forces it?

§7's departure rule, applied mechanically: for every in-request call A→B, either **B
keeps a machine running**, or **A's timeout comfortably exceeds B's cold start**. The
first is preferred, because the second "is written down far more often than it is
actually configured".

So the list is of **calls**, not of services:

| # | Caller | Callee | When | Resolution |
| - | ------ | ------ | ---- | ---------- |
| 1 | browser | `ab-ovo-web-dev` | every page | Callee may be cold. **Accepted**: a slow first page. |
| 2 | `ab-ovo-web-dev` (server side) | `GET https://ab-ovo-api-dev.fly.dev/api/v1/…` | during a render, in-request | **api pinned to 1.** |
| 3 | `ab-ovo-api-dev` (JwtBearer) | `GET https://ab-ovo-authservice-dev.fly.dev/.well-known/openid-configuration` then `…/jwks.json` | first authenticated request **and every metadata-cache refresh** | **authservice pinned to 1.** |
| 4 | `ab-ovo-web-dev` (server side, `jose` `createRemoteJWKSet`) | `GET …/.well-known/jwks.json` | on JWKS cache miss, in-request | **authservice pinned to 1.** |
| 5 | `ab-ovo-api-dev` | `ab-ovo-postgres.internal:5432` | every request touching `apidb` | Callee never stops. `.internal` **cannot** wake it, which is exactly why it must not scale to zero. |
| 6 | `ab-ovo-authservice-dev` | `ab-ovo-postgres.internal:5432` | login, refresh, registration | Same. |

**`ab-ovo-authservice-dev` — call 3 and call 4.** A JWKS issuer sits on the request
path of *every* service, not just on the first request, because validators re-fetch
when their metadata cache expires (§7). That is the whole justification and it is not
a cost trade: a cold start here does not produce a slow page, it produces a **401 for a
user holding a perfectly valid token**, and it produces it at an unpredictable moment
hours after the deploy, which is the hardest failure in this estate to diagnose.

**`ab-ovo-api-dev` — call 2.** The web app's server side calls the API while rendering.
Unlike authservice this one *is* a cost trade, and §3(a) names the condition under
which it flips.

**`ab-ovo-web-dev` — nothing calls it but a browser**, so it scales to zero. Call 1 is
the departure rule's second branch taken deliberately: a browser's timeout is tens of
seconds and a Next standalone cold start is a few, so the margin is comfortable and the
worst case is a visible delay rather than an error.

---

## 3. What is the cheaper option, and what does it actually cost?

### (a) Let `ab-ovo-api-dev` scale to zero — **≈ 1 machine, ≈ $3/month**

The cost is a **2–5 second stall on the first server-side render after an idle
period**, every time. Not a failure: call 2 goes through the public URL, so the proxy
starts the stopped machine rather than refusing the connection — which is the entire
reason §6 forbids `.internal` for service-to-service HTTP.

**Decision: keep it at 1 today, and flip it to 0 the moment Phase 1 ships.** The
condition is a product fact rather than a budget one. The reader loop is specified to
work with **no account and no backend** — Phase 1 is a Pyodide lab pane in the browser.
When that is true and the web app's server side makes no in-request call to the API,
call 2 disappears from the table above and `min_machines_running = 1` is pinning a
machine for nothing. `flyio/api.fly.toml` carries a comment pointing here so the
reviewer who notices has somewhere to check.

### (b) Let `ab-ovo-authservice-dev` scale to zero — **≈ 1 machine, ≈ $3/month**

**Decision: no**, and this one is not revisited on cost grounds. See §2, call 3: the
failure is a 401 on a valid token, it fires on cache expiry rather than on first use,
and it presents as "auth is flaky" rather than as "a machine was cold".

### (c) Do not deploy authservice at all until Phase 3 — **1 machine, ≈ $3/month**

Genuinely available: nothing before Phase 3 (progress and accounts) needs an identity
provider, and the API already degrades correctly without one — with no
`Jwt__Authority` it reports the degradation on `/health`, serves anonymous endpoints
and answers 401 on authenticated ones (P8), rather than refusing to start.

**Decision: deploy it now.** The cost of not doing so is not measured in months of
machine time: the `iss`-is-a-bare-string problem, the `Jwt__Algorithm` /empty-JWKS
problem and the `v0.1.0`-has-no-JWKS problem are all wiring that has to be got right
once, and discovering all three at Phase 3 under delivery pressure is worth more than
$3 a month. Reverse it by deleting the app from the deploy chain in `flyio.yml`; the
`fly.toml` stays in git either way.

### (d) Drop Postgres to 512 mb — **≈ $2.50/month**

**Decision: no.** 1 gb is §4's stated size for Postgres, and the headroom is spent on
autovacuum and on the first-boot `initdb` plus two schema builds running concurrently
(EF migrations for `apidb`, `EnsureCreated` for `authdb`). An OOM during first-boot
initialisation leaves a half-initialised data directory, and because
`docker-entrypoint-initdb.d` runs **only on an empty data directory** the recovery is
to destroy the volume and start again. That is a bad hour for $2.50.

### (e) Start the volume at 1 gb instead of 3 gb — **≈ $0.30/month**

**Decision: no.** Growing a volume is possible; **shrinking is not** (§8). $0.30 a
month does not buy an irreversible decision, and the databases hold reader progress and
accounts while the book's 47 programs ship in the repository — so the ceiling is WAL
and autovacuum bloat, not content.

### (f) Collapse the two databases into one — **$0**

**Off the table.** See §4.

### What the estate costs at rest, after (a)

**Two machines and one volume, ≈ $9–10/month.** That is the target once Phase 1 ships,
and it is the smallest this topology goes without giving up either P3 or the JWKS
pinning.

---

## 4. What is off the table

Written down so nobody re-proposes them (§13).

* **Turning off `force_https`.** Every `[http_service]` in this directory sets
  `force_https = true` and it stays.
* **Sharing one database across services.** `apidb` is owned by `AbOvo.Api` and
  `authdb` by authservice (P3). They are *physically* co-located in one Postgres app —
  that is the cost decision, and it is reversible — but the logical boundary is not
  crossed, so splitting into two instances later is a configuration change rather than
  a code change. `postgres.fly.toml` enforces it in SQL: two roles, and `CONNECT`
  revoked from `PUBLIC`, so neither service holds a credential that can read the
  other's data.
* **Giving the database a public IP.** `postgres.fly.toml` has no `[http_service]` and
  no `[[services]]`, deliberately and permanently. "A database with a public listener
  is a database waiting to be scanned" (§1). Reach it with
  `fly proxy 15432:5432 --app ab-ovo-postgres`.
* **Fly's managed `postgres-flex`.** It expects `fly postgres create`-style
  bootstrapping — cluster credentials, multi-machine setup — not a bare deploy, and
  the symptom is a database that never initialises with no useful error (§5, §14). A
  vanilla `postgres:17-alpine` pinned to a major is what a plain `flyctl deploy`
  actually knows how to initialise.
* **Scaling `ab-ovo-postgres` past one machine.** `flyctl scale count 2` on an app with
  a volume creates a second **empty** database, not a replica (§8, §12). The app is
  deployed `--ha=false` and excluded from `flyio-scale.yml`. Real Postgres HA is a
  different design, not a bigger number.
* **`NEXT_PUBLIC_*` for API addresses.** Inlined into the client bundle at build time,
  which gives one image per environment and is the "frontend serves the previous
  environment's API addresses" failure by construction (§5, §14). Server-side reads
  only.
* **A shared symmetric signing secret.** P5: a symmetric secret shared between services
  means verify = mint. RS256, one private key on the issuer, JWKS for everyone else —
  which is also why `authservice` is pinned to `v0.3.1` and not to the `v0.1.0` every
  upstream example shows.
* **Scaling a stateless app to *zero machines* as a way of saving money.** That is not
  the same as `min_machines_running = 0`: the latter lets the proxy start a stopped
  machine, the former leaves nothing to start (§12).

---

## 5. Sizing, in one place

| App | VM | Memory | Health check | Grace | Concurrency (soft/hard) |
| --- | -- | ------ | ------------ | ----- | ----------------------- |
| `ab-ovo-postgres`        | `shared-cpu-1x` | 1 gb   | none — no public listener, so no proxy smoke check (§5) | — | — |
| `ab-ovo-authservice-dev` | `shared-cpu-1x` | 512 mb | `/health/ready` | 90s | 200 / 250 |
| `ab-ovo-api-dev`         | `shared-cpu-1x` | 512 mb | `/health`       | 60s | 200 / 250 |
| `ab-ovo-web-dev`         | `shared-cpu-1x` | 512 mb | `/healthz`      | 20s | 200 / 250 |

Three health-check paths, three different reasons, none of them the default copied over:

* **api → `/health`**, not `/alive`. `/alive` carries only the `live`-tagged self check
  and would pass with the database unreachable; `/health` runs every check and reports
  the state of each optional integration. 60s covers .NET cold start plus the first
  migration, which runs in a `BackgroundService` *after* Kestrel binds so probes answer
  while the schema catches up (§2).
* **authservice → `/health/ready`**, not `/health`. Upstream's `/health` and `/alive`
  are both **liveness** — 200 as soon as Kestrel binds — while schema initialisation
  runs after the listener is up. `/health` would call the deploy a success with the
  schema half-created. 90s because on a cold estate that schema build runs against a
  Postgres machine that has only just initialised its own data directory.
* **web → `/healthz`**, not `/`. A frontend serving a broken bundle still returns 200
  for its index page, so a check on `/` passes on a white screen (§2). 20s because a
  Next standalone server has no first-boot schema work to wait for.

---

## 6. Deploy order, and what depends on it

`state → auth → domain services → frontends` (§10):

```text
ab-ovo-postgres  →  ab-ovo-authservice-dev  →  ab-ovo-api-dev  →  ab-ovo-web-dev
```

Postgres first because both services connect to it on boot. authservice before the API
because the API fetches its discovery document on the first authenticated request — and
because the post-deploy assertion that JWKS returns keys should fail before anything
downstream is running on a broken issuer, not after.

Postgres is gated **separately** from the services: redeploying it restarts it, so it
runs when its own config changed or the app is missing, not on every tag (§10). Every
gate downstream accepts `success || skipped`, or an unchanged service in the middle of
the chain blocks everything behind it (§10).
