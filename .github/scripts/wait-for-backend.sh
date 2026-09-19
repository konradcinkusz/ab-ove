#!/usr/bin/env bash
#
# wait-for-backend.sh — the gate that turns "the e2e job has a backend" from a hope into a
# measurement, and turns a missing one into a red job with a sentence rather than a suite
# that quietly tested nothing.
#
# E2E-ACCEPTANCE-TESTING.md §2 is about a TEST that cannot fail, and the same sentence is
# true one level up of a JOB: "skip if the backend isn't there" is indistinguishable from
# "skip if the backend broke". `.github/workflows/ci.yml`'s *Require the E2E suite* step
# already applies that rule to the suite's own files; this applies it to the two processes
# the suite now has behind it. Every branch below either proves something or exits 1 — none
# of them warns and continues.
#
# WHY IT IS A SCRIPT AND NOT AN INLINE `run:` BLOCK. A failure path nobody has watched is a
# comment. This one can be run on a laptop, pointed at a port nothing listens on, and
# watched printing the sentence it promises — which an inline block in a workflow cannot
# be. `ci.yml` also gates every other pull request in this repository, so the smaller the
# diff there, the better.
#
# ── What it reads, all of it from the environment (P5) ───────────────────────────────
#
#   E2E_BASE_URL          the web app's address; only its PORT is read, for check 6
#   E2E_API_BASE_URL      where AbOvo.Api is expected to answer
#   E2E_AUTH_BASE_URL     the identity fixture's address the API was pointed at
#   POSTGRES_CONTAINER    the service container's id (`job.services.postgres.id`)
#   API_LOG               the file the API's stdout and stderr were redirected to
#   API_PID_FILE          the file holding the API process's pid
#   BACKEND_WAIT_SECONDS  optional ceiling per wait, default 120
#
# ── What it proves, in the order the failures are cheapest to read ───────────────────
#
#   1. Postgres accepts connections.
#   2. The API process is still alive.
#   3. The API answers /health.
#   4. The API is on POSTGRES and not on the InMemory provider.
#   5. The schema was applied, read out of Postgres's own migrations table.
#   6. The API's authority is the address Playwright will start the fixture on.
#
# Check 4 is the one worth reading twice. `DatabaseProviderExtensions.Resolve` falls back to
# InMemory when the connection string is missing or unreadable — deliberately, because P8
# requires a fresh clone with zero credentials to produce a working system. That is right
# for a laptop and wrong here: a CI job that ran the API on an in-memory store would pass
# every other check on this list while reporting on a backend no deployment has, and
# nothing else in this repository would notice.

set -euo pipefail

WAIT_SECONDS="${BACKEND_WAIT_SECONDS:-120}"
POLL_SECONDS=2

# ── Reporting ────────────────────────────────────────────────────────────────────────
# One voice for every failure: the workflow-command form GitHub renders as an annotation,
# and the same sentence on stderr for anyone running this on a laptop.

fail() {
  printf '::error::%s\n' "$1"
  printf '\nwait-for-backend: %s\n' "$1" >&2
  exit 1
}

note() { printf '%s\n' "$1"; }

api_log_tail() {
  if [ -n "${API_LOG:-}" ] && [ -f "$API_LOG" ]; then
    printf '\n----- last 60 lines of %s -----\n' "$API_LOG" >&2
    tail -n 60 "$API_LOG" >&2 || true
    printf -- '----- end of log -----\n\n' >&2
  else
    printf '\n(no API log at %s — the process may never have been started)\n\n' \
      "${API_LOG:-<API_LOG unset>}" >&2
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    fail "$name is not set. This script is the e2e job's backend gate and reads every address from the environment; the header of .github/scripts/wait-for-backend.sh lists the whole set."
  fi
}

for var in E2E_BASE_URL E2E_API_BASE_URL E2E_AUTH_BASE_URL POSTGRES_CONTAINER API_LOG API_PID_FILE; do
  require_env "$var"
done

# ── 1. Postgres ──────────────────────────────────────────────────────────────────────
# `docker exec` into the service container rather than `pg_isready` on the runner: the
# image carries its own client, so this assumes nothing about what the runner image
# happens to have installed this month.

note "Waiting for Postgres in container ${POSTGRES_CONTAINER} (up to ${WAIT_SECONDS}s)…"

pg() { docker exec "$POSTGRES_CONTAINER" "$@"; }

deadline=$(( SECONDS + WAIT_SECONDS ))
until pg pg_isready --username postgres --dbname apidb >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    printf '\n----- docker exec pg_isready, last attempt -----\n' >&2
    pg pg_isready --username postgres --dbname apidb >&2 2>&1 || true
    fail "POSTGRES DID NOT START. The service container '${POSTGRES_CONTAINER}' never accepted a connection to database 'apidb' within ${WAIT_SECONDS}s. Nothing downstream of this is worth running: AbOvo.Api would fall back to an in-memory store and the suite would report on a backend no deployment has."
  fi
  sleep "$POLL_SECONDS"
done

note "Postgres is accepting connections."

# ── 2. The API process ───────────────────────────────────────────────────────────────
# Checked before the HTTP wait so that a process which died on boot — a failed migration is
# the likely one, and a BackgroundService that throws stops the host by default — reads as
# "AbOvo.Api exited" rather than as a timeout that names nothing.

if [ ! -f "$API_PID_FILE" ]; then
  fail "ABOVO.API WAS NEVER STARTED: there is no pid file at ${API_PID_FILE}. The step that launches it did not run, or it failed before it could write one."
fi

api_pid="$(cat "$API_PID_FILE")"

api_is_running() { kill -0 "$api_pid" 2>/dev/null; }

if ! api_is_running; then
  api_log_tail
  fail "ABOVO.API IS NOT RUNNING. The process (pid ${api_pid}) exited before it could answer. A failed migration is the usual cause and stops the host by design — the log above says which."
fi

# ── 3. /health ───────────────────────────────────────────────────────────────────────

health_url="${E2E_API_BASE_URL%/}/health"
alive_url="${E2E_API_BASE_URL%/}/alive"
info_url="${E2E_API_BASE_URL%/}/api/v1/info"

note "Waiting for AbOvo.Api at ${health_url} (up to ${WAIT_SECONDS}s)…"

deadline=$(( SECONDS + WAIT_SECONDS ))
until curl --silent --show-error --fail --max-time 5 "$health_url" >/dev/null 2>&1; do
  if ! api_is_running; then
    api_log_tail
    fail "ABOVO.API EXITED while this gate was waiting for ${health_url}. The log above is the whole of what it said."
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    api_log_tail
    # /alive carries only the `live`-tagged checks and therefore does not touch the
    # database, so the two answers separate the two causes rather than leaving a reader to
    # guess between them.
    if curl --silent --fail --max-time 5 "$alive_url" >/dev/null 2>&1; then
      fail "ABOVO.API IS LISTENING BUT NOT READY. ${alive_url} answers and ${health_url} did not within ${WAIT_SECONDS}s, so the process is up and one of its readiness checks is failing — the database check is the one that can, and the log above says whether it reached Postgres."
    fi
    fail "ABOVO.API DID NOT ANSWER ${health_url} within ${WAIT_SECONDS}s, and ${alive_url} did not answer either, so it is not listening on this address at all. Compare ASPNETCORE_URLS in ci.yml's *Start AbOvo.Api* step with E2E_API_BASE_URL."
  fi
  sleep "$POLL_SECONDS"
done

note "AbOvo.Api answered ${health_url}."

# ── 4. Which provider it is actually on ──────────────────────────────────────────────
# The integration report is AbOvo.Api's own answer to "what am I wired to" (P8). The two
# detail strings matched here are written by `DatabaseProviderExtensions.AddDatabaseContext`,
# and the third branch exists so that a change to either of them fails loudly instead of
# quietly turning this into a check that cannot fail.

if ! info="$(curl --silent --show-error --fail --max-time 10 "$info_url")"; then
  api_log_tail
  fail "ABOVO.API ANSWERED /health BUT NOT ${info_url}. The integration report is how this gate tells a real database from the in-memory fallback, so there is nothing left to check with."
fi

if printf '%s' "$info" | grep -q 'InMemory'; then
  printf '\n%s\n\n' "$info" >&2
  fail "ABOVO.API IS ON THE IN-MEMORY PROVIDER, not on the job's Postgres — its own integration report says so (above). DatabaseProviderExtensions falls back to InMemory whenever the connection string is missing or unreadable, which is right on a laptop and wrong here: check DATABASE_PROVIDER and ConnectionStrings__apidb in ci.yml's *Start AbOvo.Api* step."
fi

if ! printf '%s' "$info" | grep -q 'PostgreSQL'; then
  printf '\n%s\n\n' "$info" >&2
  fail "ABOVO.API'S INTEGRATION REPORT NAMES NEITHER PostgreSQL NOR InMemory (above), so this gate cannot tell which provider it is on. Either the report's shape moved or the detail strings in src/AbOvo.ServiceDefaults/DatabaseProviderExtensions.cs did. Do not relax this check — it is the only thing between this job and a suite reporting on a backend no deployment has."
fi

note "AbOvo.Api reports PostgreSQL."

# ── 5. The schema ────────────────────────────────────────────────────────────────────
# Migrations run in a hosted service AFTER Kestrel starts (P4), so /health answering is not
# evidence that the schema is there. EF's own history table is.

note "Waiting for the schema (up to ${WAIT_SECONDS}s)…"

applied=""
deadline=$(( SECONDS + WAIT_SECONDS ))
while :; do
  applied="$(pg psql --username postgres --dbname apidb --tuples-only --no-align \
    --command 'select count(*) from "__EFMigrationsHistory"' 2>/dev/null || true)"
  applied="$(printf '%s' "$applied" | tr -d '[:space:]')"

  case "$applied" in
    ''|*[!0-9]*) ;;
    *) if [ "$applied" -gt 0 ]; then break; fi ;;
  esac

  if ! api_is_running; then
    api_log_tail
    fail "ABOVO.API EXITED while its migrations were being applied. The schema is not there, and the log above says why."
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    api_log_tail
    fail "THE SCHEMA WAS NOT APPLIED. Postgres is up and AbOvo.Api is answering, but \"__EFMigrationsHistory\" in database 'apidb' is absent or empty after ${WAIT_SECONDS}s. Migrations run in a hosted service after Kestrel starts (P4), so a healthy API is not evidence that they finished — the log above is."
  fi
  sleep "$POLL_SECONDS"
done

note "Schema applied: ${applied} migration(s) recorded."

# ── 6. The address the API was told the identity fixture is at ───────────────────────
# `tests/e2e/playwright.config.ts` derives the fixture's port as the web app's + 200, and
# `tests/e2e/fixtures/authservice-stub.mts` defaults to the same number. The API is started
# by the JOB, before Playwright runs, so the job has to name that address up front — which
# is a second place for one rule. This is the check that stops the two drifting. It does
# not prove the fixture answers there (nothing has started it yet); the spec issue #180
# asks for is what proves that.

base_port="${E2E_BASE_URL##*:}"
base_port="${base_port%%/*}"
auth_port="${E2E_AUTH_BASE_URL##*:}"
auth_port="${auth_port%%/*}"

case "$base_port$auth_port" in
  ''|*[!0-9]*)
    fail "E2E_BASE_URL ('${E2E_BASE_URL}') and E2E_AUTH_BASE_URL ('${E2E_AUTH_BASE_URL}') must both carry an explicit port, because the fixture's port is derived from the web app's."
    ;;
esac

expected_auth_port=$(( base_port + 200 ))
if [ "$auth_port" -ne "$expected_auth_port" ]; then
  fail "THE API IS POINTED AT THE WRONG IDENTITY FIXTURE. tests/e2e/playwright.config.ts will start it on port ${expected_auth_port} (the web app's ${base_port}, plus 200) and ci.yml told AbOvo.Api it is on ${auth_port}. Every token the suite mints would fail verification, and the failure would read as a session that did not rehydrate rather than as a wrong address."
fi

note "AbOvo.Api's authority (${E2E_AUTH_BASE_URL}) is where Playwright will start the fixture."

# ── The summary, for whoever reads the run rather than the log ───────────────────────

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### The e2e job's backend"
    echo
    echo "| What | Where | State |"
    echo "| --- | --- | --- |"
    echo "| Postgres | container \`${POSTGRES_CONTAINER}\`, database \`apidb\` | accepting connections |"
    echo "| Schema | \`__EFMigrationsHistory\` | ${applied} migration(s) applied |"
    echo "| AbOvo.Api | ${E2E_API_BASE_URL} | answering \`/health\`, reporting PostgreSQL |"
    echo "| Identity fixture | ${E2E_AUTH_BASE_URL} | the address the API will validate against |"
    echo
    echo "\`auth\` being configured is a claim about this deployment's settings, not evidence"
    echo "that the fixture answers. Playwright starts it, and the spec issue #180 asks for is"
    echo "what proves the two ends agree."
  } >> "$GITHUB_STEP_SUMMARY"
fi

note "The backend is up."
