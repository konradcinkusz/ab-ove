#!/usr/bin/env bash
#
# setup.sh — ONE-COMMAND ONBOARDING for ab-ovo.  (scripts/setup.ps1 is the same thing on
# PowerShell; a generation instruction that only works on one platform fails at step one.)
#
#     bash scripts/setup.sh                    run it
#     bash scripts/setup.sh --check            report what is missing and change nothing
#     bash scripts/setup.sh --non-interactive  run it, and SKIP every optional step
#     bash scripts/setup.sh --help             this header
#
# Note what --non-interactive does: it takes the SAFE answer, which is "skip", for every
# optional integration. An unattended run must not silently install a third party. The
# mandatory steps 1 to 3 run normally, which is the point — a fresh clone with every
# optional step skipped still runs.
#
# REPO-BASELINE.md §3: "Provide exactly ONE interactive setup script per repo, structured
# as explicitly numbered steps." A fresh clone has a single entry point, and these are it:
#
#     1. Check prerequisites, and fail with INSTALL POINTERS rather than a bare error.
#     2. Initialise the LOCAL SECRET STORE — never files in the working tree.
#     3. GENERATE the single mandatory secret rather than asking you to invent one.
#     4. Offer each integration as a labelled OPTIONAL step, so skipping is informed.
#
# ═════════════════════════════════════════════════════════════════════════════════════
# THE SECRET'S JOURNEY — documented once, as one chain (REPO-BASELINE.md §3)
#
#   local store  ->  AppHost parameter  ->  environment variable  ->  config key
#
#   Step 3 writes             AppHost.cs reads           AppHost passes         authservice
#   ~/.microsoft/             builder.AddParameter(      .WithEnvironment(      reads
#   usersecrets/              "auth-signing-key",        "Jwt__PrivateKeyPem",  configuration[
#   ab-ovo-apphost/           secret: true)              authSigningKey)        "Jwt:PrivateKeyPem"]
#   secrets.json
#   key "Parameters:
#   auth-signing-key"
#
# So "where does this value come from" has ONE answer, and each hop explains a name you
# will otherwise meet without context:
#
#   `Parameters:<name>`  is the configuration key shape Aspire's AddParameter reads.
#   `Jwt__PrivateKeyPem` is DOUBLE-underscored because a colon is not legal in an
#                        environment variable name everywhere; .NET maps `__` to `:`.
#                        A SINGLE underscore does not map, and the symptom is a service
#                        that starts perfectly and behaves as if the setting were absent.
#
# The store is OUTSIDE the working tree on purpose — Linux and macOS
# ~/.microsoft/usersecrets/<id>/secrets.json, Windows %APPDATA%\Microsoft\UserSecrets\<id>.
# A secret in the tree is one `git add -A` from being history, and that is the estate's
# sharpest recorded failure: live credentials committed in a tracked helper script,
# because inline literals were the path of least resistance and nothing said no.
#
# ═════════════════════════════════════════════════════════════════════════════════════
# TROUBLESHOOTING — keyed on the LITERAL text you will see
#
# Symptom-prose tables do not get found. These are keyed so that pasting the error into a
# search box lands here. Each row is: the text -> what it means -> what to do.
#
# ── Setup and build ────────────────────────────────────────────────────────────────
# NETSDK1045 ... does not support targeting .NET 10.0
#     Your SDK is older than the 10.0.100 pinned in global.json.
#     -> install .NET 10: https://dotnet.microsoft.com/download/dotnet/10.0
#
# A compatible .NET SDK was not found ... global.json
#     Same cause, reported by the muxer before the build starts.
#     -> same fix. Do NOT "solve" it by deleting global.json: the pin is what stops the
#        build compiling against something other than what CI and the image use.
#
# bad interpreter: /usr/bin/env bash^M: No such file or directory
#     This file has CRLF line endings. It is checked out LF by .gitattributes, so this
#     means it was edited or copied through something that rewrote them.
#     -> git config core.autocrlf false && git checkout -- scripts/
#
# MSB1011 ... more than one project
#     You ran a dotnet command in a directory with several projects.
#     -> name the project: dotnet run --project src/AbOvo.AppHost
#
# ── Secrets and identity ───────────────────────────────────────────────────────────
# IDX10703 ... key length is zero
#     The signing key is EMPTY, not merely wrong.
#     -> re-run this script, or check: dotnet user-secrets list --project src/AbOvo.AppHost
#
# IDX10500 ... Signature validation failed. No security keys were provided
#     The JWKS the validator fetched has no keys in it. The usual cause is authservice
#     running with Jwt__Algorithm unset: a missing key then silently infers HS256 and
#     publishes an EMPTY jwks, so health checks are green and every token is rejected.
#     -> curl -fsS <authority>/.well-known/jwks.json | jq '.keys | length'   (0 confirms it)
#     -> Jwt__Algorithm=RS256 must be set EXPLICITLY. AppHost.cs already does.
#
# IDX10501 ... Unable to match key
#     Keys exist but not the one that signed this token. Usually a token minted before the
#     signing key was rotated or regenerated.
#     -> sign out and back in; the old token cannot be salvaged.
#
# IDX10205 ... Issuer validation failed
#     The token's `iss` is not what the validator expects. Both sides must say `AbOvo`;
#     authservice's own DEFAULT is the bare string "AuthService", which is why this
#     repository sets it explicitly on both sides — two products both on the default would
#     accept each other's tokens.
#
# IDX10214 ... Audience validation failed
#     Same shape for `aud`. Note authservice issues 2FA CHALLENGE tokens with audience
#     "AbOvo:2fa", signed with the SAME key — so this error is doing its job if a
#     half-authenticated token reached an endpoint expecting a session.
#
# Parameters:auth-signing-key
#     Appearing in an AppHost startup error means the parameter has no value in the local
#     store, and Aspire is refusing to invent one.
#     -> bash scripts/setup.sh
#
# ── Containers and database ────────────────────────────────────────────────────────
# Cannot connect to the Docker daemon at unix:///var/run/docker.sock
#     The engine is installed and not RUNNING. This is the single most common "setup is
#     broken" report, and nothing in it mentions containers.
#     -> start Docker Desktop, or: sudo systemctl start docker
#
# Npgsql.NpgsqlException ... Connection refused
#     Postgres is not up yet, or the AppHost was started without a container engine.
#     -> the API degrades to in-memory by design (P8) — /health says so. For real
#        persistence, start the engine and re-run the AppHost.
#
# ── Frontend ───────────────────────────────────────────────────────────────────────
# ERR_PNPM_NO_LOCKFILE  /  Cannot install with "frozen-lockfile"
#     You are installing from the wrong directory. The ONE lockfile is at web/, not
#     web/app/.
#     -> cd web && pnpm install
#
# EBADENGINE / Unsupported engine
#     web/.npmrc sets engine-strict, so a Node other than 22 is an install-time failure
#     rather than a build-time mystery. That is deliberate.
#     -> install Node 22: https://nodejs.org/en/download
#
# ═════════════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Resolve the repository root using BASH BUILTINS ONLY.
#
# `--check` has to work on a machine with nothing installed, and "nothing" is stricter than
# it looks: the first draft of this used `dirname`, which is an EXTERNAL command. With an
# empty PATH it failed, `cd --` with no argument went to $HOME, `pwd` succeeded, and the
# script reported `repository: /home/user` and carried on. Not an error — a plausible wrong
# answer, which is the worst kind. `cd`, `pwd` and parameter expansion are builtins and
# cannot do that.
_self="${BASH_SOURCE[0]}"
case "$_self" in
  */*) _selfdir="${_self%/*}" ;;
  *)   _selfdir="." ;;
esac
SCRIPT_DIR="$(cd -- "$_selfdir" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

# And then CHECK the answer against something only this repository has, so a wrong root is
# an error rather than a confident report about the wrong directory.
if [ ! -f "$REPO_ROOT/global.json" ] || [ ! -f "$REPO_ROOT/AbOvo.sln" ]; then
  printf 'setup: resolved the repository root as "%s", which is not an ab-ovo checkout.\n' "$REPO_ROOT" >&2
  printf '       Run it as:  bash scripts/setup.sh   from anywhere inside the clone.\n' >&2
  exit 2
fi

APPHOST_PROJECT="src/AbOvo.AppHost"
API_PROJECT="src/AbOvo.Api"

MODE="setup"
NON_INTERACTIVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --check)                  MODE="check" ;;
    -n|--non-interactive)     NON_INTERACTIVE=1 ;;
    -h|--help)
      # Builtins only, for the same reason as the path resolution above: --help is exactly
      # what somebody runs on a machine that has nothing.
      _n=0
      while IFS= read -r _line; do
        _n=$((_n + 1)); [ "$_n" -lt 2 ] && continue; [ "$_n" -gt 140 ] && break
        case "$_line" in '# '*) printf '%s\n' "${_line#\# }" ;; '#') printf '\n' ;; *) printf '%s\n' "$_line" ;; esac
      done < "$0"
      exit 0 ;;
    *) printf 'setup: unknown argument %s (try --help)\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

# ── Output helpers ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; OK=$'\033[32m'; WARN=$'\033[33m'; BAD=$'\033[31m'; R=$'\033[0m'
else
  B=''; DIM=''; OK=''; WARN=''; BAD=''; R=''
fi

say()   { printf '%s\n' "$*"; }
head1() { printf '\n%s%s%s\n' "$B" "$*" "$R"; }
good()  { printf '  %s[ok]%s   %s\n'   "$OK"   "$R" "$*"; }
warn()  { printf '  %s[--]%s   %s\n'   "$WARN" "$R" "$*"; }
bad()   { printf '  %s[MISSING]%s %s\n' "$BAD" "$R" "$*"; }
note()  { printf '        %s%s%s\n' "$DIM" "$*" "$R"; }

ask() {
  # ask "question" -> 0 for yes, 1 for no. Non-interactive or --yes takes the default (no),
  # because an unattended run must not silently install a third-party integration.
  local q="$1"
  if [ "$NON_INTERACTIVE" = "1" ] || [ ! -t 0 ]; then
    printf '  %s [skipped: non-interactive]\n' "$q"
    return 1
  fi
  local reply
  read -r -p "  $q [y/N] " reply </dev/tty || return 1
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

MISSING_REQUIRED=0
MISSING_OPTIONAL=0

# =====================================================================================
#  STEP 1 — Prerequisites
#
#  REPO-BASELINE.md §3 step 1: "check prerequisites — runtimes and the container engine —
#  and fail with install pointers, not a bare error."
#
#  Everything here is probed with `command -v` first, so this step is the one part of the
#  script that runs correctly on a machine with NOTHING installed. That is what --check is
#  for, and it is the only report worth having at that moment.
# =====================================================================================
step1_prerequisites() {
  head1 "1. Prerequisites"

  # ── .NET SDK — required for everything ─────────────────────────────────────────────
  if command -v dotnet >/dev/null 2>&1; then
    # --list-sdks rather than --version: `dotnet --version` consults global.json and FAILS
    # when the pinned SDK is absent, so it cannot answer "is dotnet installed at all".
    local sdks; sdks="$(dotnet --list-sdks 2>/dev/null | awk '{print $1}' | tr '\n' ' ')"
    sdks="${sdks% }"   # builtin strip; no second external command for a trailing space
    if printf '%s' "$sdks" | grep -qE '(^| )10\.'; then
      good ".NET SDK 10 present ($sdks)"
      # Now the pin itself, which is a different question: global.json wants 10.0.100 with
      # rollForward=latestFeature, and an SDK that does not satisfy it fails the BUILD
      # rather than this check.
      if ! (cd "$REPO_ROOT" && dotnet --version >/dev/null 2>&1); then
        warn "installed, but global.json's pin is not satisfied"
        note "global.json wants 10.0.100 (rollForward: latestFeature)"
        note "https://dotnet.microsoft.com/download/dotnet/10.0"
        MISSING_REQUIRED=$((MISSING_REQUIRED + 1))
      fi
    else
      bad ".NET SDK 10  —  found: ${sdks:-none}"
      note "https://dotnet.microsoft.com/download/dotnet/10.0"
      note "The repo pins 10.0.100 in global.json; the runtime images are major 10 to match."
      MISSING_REQUIRED=$((MISSING_REQUIRED + 1))
    fi
  else
    bad ".NET SDK 10  —  dotnet is not on PATH"
    note "https://dotnet.microsoft.com/download/dotnet/10.0"
    note "macOS: brew install --cask dotnet-sdk     Windows: winget install Microsoft.DotNet.SDK.10"
    MISSING_REQUIRED=$((MISSING_REQUIRED + 1))
  fi

  # ── git — required, and the reason is the hook ─────────────────────────────────────
  if command -v git >/dev/null 2>&1; then
    good "git ($(git --version 2>/dev/null | awk '{print $3}'))"
  else
    bad "git  —  needed to install the pre-commit secret-scanning hook"
    note "https://git-scm.com/downloads"
    MISSING_REQUIRED=$((MISSING_REQUIRED + 1))
  fi

  # ── A key generator for step 3 ─────────────────────────────────────────────────────
  # openssl is the documented tool. .NET 10 can do it too, from a single-file app, and
  # that fallback is here because it is the one Windows and minimal containers actually
  # need — flyio/SECRETS.md records that PowerShell ships no openssl and that the
  # openssl.exe bundled with some tooling has produced a key with CRLF line endings,
  # which is not a PEM.
  if command -v openssl >/dev/null 2>&1; then
    good "openssl  —  step 3 will generate the RSA signing key with it"
  elif command -v dotnet >/dev/null 2>&1; then
    warn "openssl not found  —  step 3 will fall back to the .NET SDK, which is fine"
    note "https://www.openssl.org/  (macOS: brew install openssl   Windows: use Git Bash or WSL)"
  else
    bad "a key generator  —  neither openssl nor the .NET SDK is available"
    note "Step 3 cannot generate the mandatory signing key without one of them."
    MISSING_REQUIRED=$((MISSING_REQUIRED + 1))
  fi

  # ── Container engine — the full local stack, not the build ─────────────────────────
  # Installed and RUNNING are two different questions and only the second one matters.
  # An engine that is installed but not started is the most common "setup is broken"
  # report there is, and nothing in its error message mentions containers.
  local engine=""
  for candidate in docker podman; do
    if command -v "$candidate" >/dev/null 2>&1; then engine="$candidate"; break; fi
  done
  if [ -n "$engine" ]; then
    if "$engine" info >/dev/null 2>&1; then
      good "container engine: $engine, and the daemon is reachable"
    else
      warn "container engine: $engine is installed but the daemon is NOT running"
      note "Start Docker Desktop, or: sudo systemctl start docker"
      note "Without it: 'dotnet run --project $APPHOST_PROJECT' cannot start Postgres or"
      note "authservice. 'dotnet test' and 'dotnet run --project $API_PROJECT' still work —"
      note "the API falls back to an in-memory database and /health reports the degradation."
      MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
    fi
  else
    warn "container engine  —  neither docker nor podman is on PATH"
    note "https://docs.docker.com/get-started/get-docker/"
    note "Needed for the FULL local stack (Postgres + authservice), not for build or test."
    MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
  fi

  # ── Node 22 + pnpm — the web reader ────────────────────────────────────────────────
  if command -v node >/dev/null 2>&1; then
    local nodemajor; nodemajor="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    if [ "${nodemajor:-0}" -ge 22 ] 2>/dev/null; then
      good "Node $(node -v)"
    else
      warn "Node $(node -v)  —  the workspace requires 22 or newer"
      note "web/.npmrc sets engine-strict, so this is an install-time failure (EBADENGINE)"
      note "rather than a build-time mystery. https://nodejs.org/en/download"
      MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
    fi
  else
    warn "Node 22  —  needed for the web reader"
    note "https://nodejs.org/en/download"
    MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
  fi

  if command -v pnpm >/dev/null 2>&1; then
    good "pnpm ($(pnpm --version 2>/dev/null))"
  elif command -v corepack >/dev/null 2>&1; then
    warn "pnpm  —  not on PATH, but corepack is: run  corepack enable"
    note "web/package.json names the exact pnpm in packageManager; corepack activates it."
    MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
  else
    warn "pnpm  —  needed for the web reader"
    note "corepack enable      (ships with Node)      or      npm install -g pnpm"
    MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
  fi

  # ── gitleaks — the hook fails CLOSED without it ────────────────────────────────────
  if command -v gitleaks >/dev/null 2>&1; then
    good "gitleaks ($(gitleaks version 2>/dev/null | tr -d '\n'))"
  else
    warn "gitleaks  —  the pre-commit hook REFUSES to run without it"
    note "macOS: brew install gitleaks   Windows: winget install gitleaks"
    note "Linux: https://github.com/gitleaks/gitleaks/releases  (one static binary)"
    note "Refusing rather than waving commits through is deliberate: a hook that passes"
    note "when the scanner is absent is indistinguishable from one that found nothing."
    MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
  fi

  # ── flyctl — deployment only ───────────────────────────────────────────────────────
  if command -v flyctl >/dev/null 2>&1 || command -v fly >/dev/null 2>&1; then
    good "flyctl"
  else
    warn "flyctl  —  needed only to deploy or inspect the Fly.io apps"
    note "https://fly.io/docs/flyctl/install/"
    note "Nothing local needs it. CI deploys with its own token."
    MISSING_OPTIONAL=$((MISSING_OPTIONAL + 1))
  fi
}

# =====================================================================================
#  STEP 2 — The local secret store, and the hook that keeps secrets out of the tree
#
#  REPO-BASELINE.md §3 step 2: "Initialize the LOCAL SECRET STORE (dotnet user-secrets or
#  equivalent) — never files in the working tree."
# =====================================================================================
step2_secret_store() {
  head1 "2. Local secret store"

  if ! command -v dotnet >/dev/null 2>&1; then
    bad "dotnet is not available; cannot initialise the secret store."
    return 1
  fi

  # `user-secrets init` is idempotent: both projects already declare a UserSecretsId
  # (ab-ovo-apphost, ab-ovo-api), so this confirms rather than creates. Running it anyway
  # means the script works on a tree where somebody removed one.
  for proj in "$APPHOST_PROJECT" "$API_PROJECT"; do
    if (cd "$REPO_ROOT" && dotnet user-secrets init --project "$proj" >/dev/null 2>&1); then
      good "secret store ready for $proj"
    else
      warn "could not initialise the secret store for $proj"
    fi
  done
  note "Stored OUTSIDE the working tree: ~/.microsoft/usersecrets/<id>/secrets.json"
  note "(Windows: %APPDATA%\\Microsoft\\UserSecrets\\<id>\\secrets.json)"

  # ── The pre-commit hook ────────────────────────────────────────────────────────────
  # core.hooksPath rather than copying into .git/hooks: a copy is a second version of the
  # file that nobody updates and no review ever sees.
  if command -v git >/dev/null 2>&1 && (cd "$REPO_ROOT" && git rev-parse --git-dir >/dev/null 2>&1); then
    local current; current="$(cd "$REPO_ROOT" && git config --get core.hooksPath 2>/dev/null || true)"
    if [ "$current" = "scripts/hooks" ]; then
      good "pre-commit secret scanning already installed (core.hooksPath=scripts/hooks)"
    else
      (cd "$REPO_ROOT" && git config core.hooksPath scripts/hooks)
      good "pre-commit secret scanning installed (core.hooksPath=scripts/hooks)"
    fi
    chmod +x "$REPO_ROOT/scripts/hooks/pre-commit" 2>/dev/null || true
    note "It scans the STAGED index before every commit. CI scans again on every PR and"
    note "push — the hook is the only one that can stop a leak; CI is the only one that"
    note "covers a machine you do not control."
  else
    warn "not a git repository (or git is missing): pre-commit hook NOT installed"
    note "Later: git config core.hooksPath scripts/hooks"
  fi
}

# =====================================================================================
#  STEP 3 — Generate the single mandatory secret
#
#  REPO-BASELINE.md §3 step 3: "GENERATE the single mandatory secret rather than asking
#  the developer to invent one." An invented secret is a weak secret or an empty one.
#
#  Here that is the RSA SIGNING KEYPAIR for the local authservice container — the one key
#  that signs every token in this system.
# =====================================================================================
generate_rsa_pkcs8_pem() {
  # PKCS#8 ("BEGIN PRIVATE KEY"), RSA 2048. authservice wants PKCS#8.
  #
  # `genpkey`, NOT `genrsa`: genrsa emits PKCS#1 ("BEGIN RSA PRIVATE KEY"), which is the
  # wrong container — and the header line alone tells you which one you have.
  if command -v openssl >/dev/null 2>&1; then
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null
    return
  fi
  # Fallback with no openssl: the .NET SDK, which is already a prerequisite. .NET 10 runs
  # a single .cs file directly. ExportPkcs8PrivateKeyPem emits exactly the same container
  # and the same LF line endings.
  local tmp
  if command -v mktemp >/dev/null 2>&1; then
    tmp="$(mktemp -d)"
  else
    tmp="${TMPDIR:-/tmp}/abovo-genkey.$$"
    mkdir -p "$tmp" || return 1
  fi
  cat > "$tmp/genkey.cs" <<'CSHARP'
using System.Security.Cryptography;
Console.Write(RSA.Create(2048).ExportPkcs8PrivateKeyPem());
CSHARP
  ( cd "$tmp" && dotnet run genkey.cs 2>/dev/null )
  rm -rf "$tmp"
}

secret_is_set() {
  # $1 = project, $2 = key. Absent or empty both count as unset.
  local out
  out="$(cd "$REPO_ROOT" && dotnet user-secrets list --project "$1" 2>/dev/null | grep -F "$2 = " || true)"
  [ -n "$out" ] && [ "$out" != "$2 = " ]
}

step3_generate_secret() {
  head1 "3. The mandatory secret — generated, never invented"

  if ! command -v dotnet >/dev/null 2>&1; then
    bad "dotnet is not available; cannot store the generated key."
    return 1
  fi

  # ── 3a. The RSA signing keypair ────────────────────────────────────────────────────
  if secret_is_set "$APPHOST_PROJECT" "Parameters:auth-signing-key"; then
    good "Parameters:auth-signing-key is already set — leaving it alone"
    note "Regenerating invalidates every token already issued locally. To do it anyway:"
    note "  dotnet user-secrets remove \"Parameters:auth-signing-key\" --project $APPHOST_PROJECT"
  else
    say "  generating an RSA 2048 PKCS#8 keypair..."
    local pem; pem="$(generate_rsa_pkcs8_pem || true)"
    if [ -z "$pem" ] || ! printf '%s' "$pem" | head -1 | grep -q 'BEGIN PRIVATE KEY'; then
      bad "key generation failed, or produced something that is not a PKCS#8 PEM."
      # The expected header is described rather than written out in full. A complete
      # PEM header literal anywhere in a file starts gitleaks' greedy, MULTI-LINE
      # private-key match, which then runs to the last "...KEY----" below it -- and a
      # real key pasted anywhere further down that file disappears inside the same span.
      # Measured, in this repository, on this script's PowerShell twin.
      note "Expected a first line beginning: -----BEGIN PRIVATE KEY  (plus its dashes)"
      note "If it says BEGIN RSA PRIVATE KEY, that is PKCS#1 and the wrong container."
      return 1
    fi
    # Quoted, so the newlines survive. Unquoted, the shell splits the key into twenty-odd
    # arguments and only the first line is stored — and the service then starts anyway,
    # on a key it cannot parse.
    (cd "$REPO_ROOT" && dotnet user-secrets set "Parameters:auth-signing-key" "$pem" --project "$APPHOST_PROJECT" >/dev/null)
    good "Parameters:auth-signing-key generated and stored (RSA 2048, PKCS#8)"
    note "It never touched the working tree. There is no .pem file to delete."
  fi

  # ── 3b. The local database password ────────────────────────────────────────────────
  # Also generated rather than asked for, for the same reason. -hex, not -base64: the
  # output is [0-9a-f] only, so it needs no escaping inside a connection string, inside a
  # SQL literal, or inside a shell argument. A base64 password containing + or / is legal
  # everywhere and looks fine right up until something quotes it differently.
  if secret_is_set "$APPHOST_PROJECT" "Parameters:auth-db-password"; then
    good "Parameters:auth-db-password is already set — leaving it alone"
  else
    local pw=""
    if command -v openssl >/dev/null 2>&1; then
      pw="$(openssl rand -hex 32)"
    elif [ -r /dev/urandom ] && command -v tr >/dev/null 2>&1; then
      pw="$(LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 64)"
    fi
    if [ -z "$pw" ]; then
      bad "could not generate a database password (no openssl, no /dev/urandom)."
      return 1
    fi
    (cd "$REPO_ROOT" && dotnet user-secrets set "Parameters:auth-db-password" "$pw" --project "$APPHOST_PROJECT" >/dev/null)
    good "Parameters:auth-db-password generated and stored (32 bytes, hex)"
  fi

  note ""
  note "Journey:  local store -> AppHost parameter -> environment variable -> config key"
  note "          Parameters:auth-signing-key -> AddParameter(\"auth-signing-key\")"
  note "          -> Jwt__PrivateKeyPem -> configuration[\"Jwt:PrivateKeyPem\"]"
}

# =====================================================================================
#  STEP 4 — Optional integrations
#
#  REPO-BASELINE.md §3 step 4: each one is offered as a clearly labelled OPTIONAL step,
#  using the literal label form, "so skipping is informed — the developer learns exactly
#  which feature degrades (P8)".
#
#  AND: a fresh clone with EVERY one of these skipped still runs. That is a property of
#  this scaffold, not an aspiration. Skip all four and
#  `dotnet run --project src/AbOvo.Api` serves /health and /api/v1/info on an in-memory
#  database, with /health reporting each degradation by name.
# =====================================================================================
step4_optional() {
  head1 "4. Optional integrations"
  say "  Each may be skipped. What you lose is named, so skipping is a decision."

  # ── (optional — needed for the web reader) ─────────────────────────────────────────
  printf '\n  %s(optional — needed for the web reader)%s\n' "$B" "$R"
  note "Installs the pnpm workspace at web/. Without it the .NET side is unaffected and"
  note "the reader does not run locally at all."
  if command -v pnpm >/dev/null 2>&1; then
    if ask "Run 'pnpm install' in web/ now?"; then
      (cd "$REPO_ROOT/web" && pnpm install --frozen-lockfile) \
        && good "web workspace installed" \
        || warn "pnpm install failed — see the ERR_PNPM_NO_LOCKFILE row in the header"
    else
      note "skipped. Later:  cd web && pnpm install"
    fi
  else
    warn "pnpm is not installed; skipping. Later:  corepack enable && cd web && pnpm install"
  fi

  # ── (optional — needed for the full local stack) ───────────────────────────────────
  printf '\n  %s(optional — needed for the full local stack: Postgres and authservice)%s\n' "$B" "$R"
  note "A container engine. Without it, 'dotnet run --project $APPHOST_PROJECT' cannot"
  note "start the containers; the API alone still runs on an in-memory database and"
  note "/health reports the degradation rather than refusing to boot."
  local engine=""
  for candidate in docker podman; do command -v "$candidate" >/dev/null 2>&1 && { engine="$candidate"; break; }; done
  if [ -n "$engine" ] && "$engine" info >/dev/null 2>&1; then
    good "$engine is running — nothing to do"
  elif [ -n "$engine" ]; then
    warn "$engine is installed but not running. Start it before the AppHost."
  else
    warn "no container engine found. https://docs.docker.com/get-started/get-docker/"
  fi

  # ── (optional — needed for traces and metrics leaving the process) ─────────────────
  printf '\n  %s(optional — needed for traces and metrics leaving the process)%s\n' "$B" "$R"
  note "OTEL_EXPORTER_OTLP_ENDPOINT. The Aspire dashboard injects it for you when you run"
  note "the AppHost, so there is usually nothing to set. Without it, instrumentation still"
  note "RUNS and still records; nothing is EXPORTED. Nothing fails — which is exactly why"
  note "it goes unnoticed. The only symptom is a dashboard that stays empty."

  # ── (optional — needed for scanning history before you push) ───────────────────────
  printf '\n  %s(optional — needed for scanning history before you push)%s\n' "$B" "$R"
  note "gitleaks. Without it the pre-commit hook REFUSES to run, so every commit is"
  note "blocked until it is installed or ABOVO_SKIP_SECRET_SCAN=1 is set. CI scans"
  note "regardless, so nothing reaches main unscanned either way."
  if command -v gitleaks >/dev/null 2>&1; then
    good "gitleaks is installed"
  else
    warn "not installed. brew install gitleaks  /  winget install gitleaks  /  releases page"
  fi

  # ── (optional — needed for deploying to Fly.io) ────────────────────────────────────
  printf '\n  %s(optional — needed for deploying to Fly.io by hand)%s\n' "$B" "$R"
  note "flyctl. Deployment normally runs in CI with its own token, so this is for"
  note "inspecting a running app — 'fly logs', 'fly secrets list', 'fly proxy'. Without it,"
  note "nothing local changes. flyio/SECRETS.md covers the one-time human setup."
  if command -v flyctl >/dev/null 2>&1 || command -v fly >/dev/null 2>&1; then
    good "flyctl is installed"
  else
    warn "not installed. https://fly.io/docs/flyctl/install/"
  fi
}

# =====================================================================================
#  Run
# =====================================================================================
printf '%s\n' "${B}ab-ovo — setup${R}"
printf '%s\n' "${DIM}repository: $REPO_ROOT${R}"

if [ "$MODE" = "check" ]; then
  step1_prerequisites
  head1 "Summary"
  if [ "$MISSING_REQUIRED" -eq 0 ]; then
    good "every REQUIRED prerequisite is present"
  else
    bad "$MISSING_REQUIRED required prerequisite(s) missing — named above, with install pointers"
  fi
  if [ "$MISSING_OPTIONAL" -gt 0 ]; then
    warn "$MISSING_OPTIONAL optional prerequisite(s) missing — each one's cost is named above"
  fi
  say ""
  say "  --check changes nothing. Run 'bash scripts/setup.sh' to do the work."
  [ "$MISSING_REQUIRED" -eq 0 ] || exit 1
  exit 0
fi

step1_prerequisites
if [ "$MISSING_REQUIRED" -gt 0 ]; then
  head1 "Stopping"
  bad "$MISSING_REQUIRED required prerequisite(s) missing. Install them and re-run."
  say "  Every one is named above with a pointer. Nothing has been changed."
  exit 1
fi

step2_secret_store
step3_generate_secret
step4_optional

head1 "Done"
# THE NEXT COMMAND IS NOT IN THIS SCRIPT, and this is the screen that has to say so.
# web/content/book/ is not tracked here — ADR-0008 makes the book's lab engine a versioned
# artefact fetched at a pinned revision — so on a fresh clone the AppHost's web resource
# stops in its predev, and `dotnet test` throws on the missing figures file. Both name
# scripts/fetch-book-content.sh. Measured from a clone into an empty directory (#75): until
# then this block handed the reader two commands that could not work yet.
#
# NAMED here rather than RUN here, and that is the recorded trade. REPO-BASELINE.md §3 puts
# one setup script per repository and requires it to work on both platforms, so performing
# the fetch would mean writing it twice — in this file and in scripts/setup.ps1 — for a step
# ADR-0008 expects a released bundle to replace. A line of text costs neither, and
# scripts/setup.ps1 carries the same one.
say "  Fetch the book's lab engine (once per clone, pinned and digest-verified):"
say "      bash scripts/fetch-book-content.sh"
say ""
say "  Run the whole system (needs a container engine, and the fetch above):"
say "      dotnet run --project $APPHOST_PROJECT"
say ""
say "  Run only the API (no containers, in-memory database, /health reports it):"
say "      dotnet run --project $API_PROJECT"
say ""
say "  Tests (need the fetch):  dotnet test"
say "  Scan history:            bash scripts/scan-secrets.sh"
say "  What every variable is, and what degrades without it:   secrets.env.example"
say "  Variables by tier, and the operational recipes:          scripts/README.md"
