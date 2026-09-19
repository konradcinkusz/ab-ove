<#
.SYNOPSIS
    ONE-COMMAND ONBOARDING for ab-ovo, on PowerShell.

.DESCRIPTION
    The same four numbered steps as scripts/setup.sh, which is the bash twin. Both exist
    on purpose: a generation instruction that only works on one platform fails at step one
    of onboarding, and this repository's own deployment notes record that PowerShell ships
    no openssl — so a Windows developer following a bash-only script stops at the exact
    step that generates the mandatory secret.

    REPO-BASELINE.md §3: "Provide exactly ONE interactive setup script per repo, structured
    as explicitly numbered steps."

        1. Check prerequisites, and fail with INSTALL POINTERS rather than a bare error.
        2. Initialise the LOCAL SECRET STORE - never files in the working tree.
        3. GENERATE the single mandatory secret rather than asking you to invent one.
        4. Offer each integration as a labelled OPTIONAL step, so skipping is informed.

    ==============================================================================
    THE SECRET'S JOURNEY - documented once, as one chain (REPO-BASELINE.md §3)

        local store  ->  AppHost parameter  ->  environment variable  ->  config key

        Step 3 writes          AppHost.cs reads         AppHost passes        authservice
        %APPDATA%\Microsoft\   builder.AddParameter(    .WithEnvironment(     reads
        UserSecrets\           "auth-signing-key",      "Jwt__PrivateKeyPem", configuration[
        ab-ovo-apphost\        secret: true)            authSigningKey)       "Jwt:PrivateKeyPem"]
        secrets.json
        key "Parameters:
        auth-signing-key"

    So "where does this value come from" has ONE answer, and each hop explains a name you
    will otherwise meet without context:

        Parameters:<name>   is the configuration key shape Aspire's AddParameter reads.
        Jwt__PrivateKeyPem  is DOUBLE-underscored because a colon is not legal in an
                            environment variable name everywhere; .NET maps __ to :.
                            A SINGLE underscore does not map, and the symptom is a
                            service that starts perfectly and behaves as if the setting
                            were absent.

    The store is OUTSIDE the working tree on purpose. A secret in the tree is one
    `git add -A` from being history, and that is the estate's sharpest recorded failure:
    live credentials committed in a tracked helper script, because inline literals were
    the path of least resistance and nothing said no.

    ==============================================================================
    TROUBLESHOOTING - keyed on the LITERAL text you will see

    Symptom-prose tables do not get found. These are keyed so that pasting the error into
    a search box lands here. Each row is: the text -> what it means -> what to do.

    -- Setup and build ---------------------------------------------------------------
    NETSDK1045 ... does not support targeting .NET 10.0
        Your SDK is older than the 10.0.100 pinned in global.json.
        -> install .NET 10: https://dotnet.microsoft.com/download/dotnet/10.0

    A compatible .NET SDK was not found ... global.json
        Same cause, reported by the muxer before the build starts.
        -> same fix. Do NOT "solve" it by deleting global.json: the pin is what stops the
           build compiling against something other than what CI and the image use.

    cannot be loaded because running scripts is disabled on this system
        PowerShell's execution policy, not this script.
        -> pwsh -ExecutionPolicy Bypass -File scripts/setup.ps1
           or: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

    ExportPkcs8PrivateKeyPem ... not found / Method invocation failed
        Windows PowerShell 5.1 runs on .NET Framework, which cannot export PKCS#8. This
        script falls back to the .NET SDK automatically, so you should not see it - if you
        do, the SDK is missing too.
        -> use PowerShell 7 (winget install Microsoft.PowerShell), or install .NET 10.

    MSB1011 ... more than one project
        A dotnet command ran in a directory with several projects.
        -> name the project: dotnet run --project src/AbOvo.AppHost

    -- Secrets and identity ----------------------------------------------------------
    IDX10703 ... key length is zero
        The signing key is EMPTY, not merely wrong.
        -> re-run this script, or check:
           dotnet user-secrets list --project src/AbOvo.AppHost

    IDX10500 ... Signature validation failed. No security keys were provided
        The JWKS the validator fetched has no keys in it. The usual cause is authservice
        running with Jwt__Algorithm unset: a missing key then silently infers HS256 and
        publishes an EMPTY jwks, so health checks are green and every token is rejected.
        -> Jwt__Algorithm=RS256 must be set EXPLICITLY. AppHost.cs already does.

    IDX10501 ... Unable to match key
        Keys exist but not the one that signed this token - usually a token minted before
        the signing key was regenerated.
        -> sign out and back in; the old token cannot be salvaged.

    IDX10205 ... Issuer validation failed
        The token's iss is not what the validator expects. Both sides must say "AbOvo";
        authservice's own DEFAULT is the bare string "AuthService", which is why this
        repository sets it explicitly on both sides - two products both on the default
        would accept each other's tokens.

    IDX10214 ... Audience validation failed
        Same shape for aud. Note authservice issues 2FA CHALLENGE tokens with audience
        "AbOvo:2fa", signed with the SAME key - so this error is doing its job if a
        half-authenticated token reached an endpoint expecting a session.

    Parameters:auth-signing-key
        Appearing in an AppHost startup error means the parameter has no value in the
        local store, and Aspire is refusing to invent one.
        -> pwsh -File scripts/setup.ps1

    -- Containers and database -------------------------------------------------------
    error during connect ... The system cannot find the file specified
    Cannot connect to the Docker daemon
        The engine is installed and not RUNNING. This is the single most common "setup is
        broken" report, and nothing in it mentions containers.
        -> start Docker Desktop.

    Npgsql.NpgsqlException ... Connection refused
        Postgres is not up, or the AppHost started without a container engine.
        -> the API degrades to in-memory by design - /health says so. For real
           persistence, start the engine and re-run the AppHost.

    -- Frontend ----------------------------------------------------------------------
    ERR_PNPM_NO_LOCKFILE  /  Cannot install with "frozen-lockfile"
        You are installing from the wrong directory. The ONE lockfile is at web/, not
        web/app/.
        -> cd web; pnpm install

    EBADENGINE / Unsupported engine
        web/.npmrc sets engine-strict, so a Node other than 22 is an install-time failure
        rather than a build-time mystery. That is deliberate.
        -> install Node 22: https://nodejs.org/en/download

.PARAMETER Check
    Report what is missing and change NOTHING. Designed to run on a machine with nothing
    installed: every probe is guarded, so the report is the whole point.

.PARAMETER NonInteractive
    Run steps 1 to 3 and SKIP every optional step. It takes the safe answer, which is
    "skip" - an unattended run must not silently install a third party.

.EXAMPLE
    pwsh -File scripts/setup.ps1

.EXAMPLE
    pwsh -File scripts/setup.ps1 -Check
#>
[CmdletBinding()]
param(
    [switch] $Check,
    [switch] $NonInteractive
)

# This file is UTF-8 (no BOM) and deliberately contains non-ASCII: the section markers, and
# the em dash in the literal label form "(optional - needed for <feature>)" that
# REPO-BASELINE.md §3 step 4 prescribes verbatim. Do not "fix" the dash to a hyphen - the
# label is quoted text, and matching it is the point. Windows PowerShell 5.1 may render it
# oddly in a legacy console; that is cosmetic and affects no logic.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve the repository root from $PSScriptRoot, which PowerShell provides without any
# external command - the same constraint the bash twin has, where an external `dirname`
# silently produced a plausible WRONG answer on a machine with an empty PATH.
$RepoRoot       = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$AppHostProject = 'src/AbOvo.AppHost'
$ApiProject     = 'src/AbOvo.Api'

# Check the answer against something only this repository has, so a wrong root is an error
# rather than a confident report about the wrong directory.
if (-not (Test-Path (Join-Path $RepoRoot 'global.json')) -or
    -not (Test-Path (Join-Path $RepoRoot 'AbOvo.sln'))) {
    Write-Host "setup: resolved the repository root as '$RepoRoot', which is not an ab-ovo checkout." -ForegroundColor Red
    exit 2
}

$script:MissingRequired = 0
$script:MissingOptional = 0

function Write-Head { param([string]$Text) Write-Host ''; Write-Host $Text -ForegroundColor White }
function Write-Ok   { param([string]$Text) Write-Host '  [ok]   ' -ForegroundColor Green  -NoNewline; Write-Host $Text }
function Write-Warn { param([string]$Text) Write-Host '  [--]   ' -ForegroundColor Yellow -NoNewline; Write-Host $Text }
function Write-Bad  { param([string]$Text) Write-Host '  [MISSING] ' -ForegroundColor Red -NoNewline; Write-Host $Text }
function Write-Note { param([string]$Text) Write-Host "        $Text" -ForegroundColor DarkGray }

function Test-Tool { param([string]$Name) $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

function Invoke-InRepo {
    param([string[]] $Arguments)
    Push-Location $RepoRoot
    try { & dotnet @Arguments 2>&1 | Out-Null; return $LASTEXITCODE -eq 0 }
    finally { Pop-Location }
}

function Confirm-Step {
    param([string] $Question)
    if ($NonInteractive -or -not [Environment]::UserInteractive) {
        Write-Host "  $Question [skipped: non-interactive]"
        return $false
    }
    $reply = Read-Host "  $Question [y/N]"
    return $reply -match '^(y|yes)$'
}

# =====================================================================================
#  STEP 1 - Prerequisites
#
#  REPO-BASELINE.md §3 step 1: "check prerequisites - runtimes and the container engine -
#  and fail with install pointers, not a bare error."
# =====================================================================================
function Step1-Prerequisites {
    Write-Head '1. Prerequisites'

    # -- .NET SDK ---------------------------------------------------------------------
    if (Test-Tool 'dotnet') {
        # --list-sdks rather than --version: `dotnet --version` consults global.json and
        # FAILS when the pinned SDK is absent, so it cannot answer "is dotnet installed".
        $sdks = @(& dotnet --list-sdks 2>$null | ForEach-Object { ($_ -split ' ')[0] })
        if ($sdks | Where-Object { $_ -like '10.*' }) {
            Write-Ok ".NET SDK 10 present ($($sdks -join ', '))"
            Push-Location $RepoRoot
            try { & dotnet --version 2>&1 | Out-Null; $pinOk = ($LASTEXITCODE -eq 0) }
            finally { Pop-Location }
            if (-not $pinOk) {
                Write-Warn "installed, but global.json's pin is not satisfied"
                Write-Note 'global.json wants 10.0.100 (rollForward: latestFeature)'
                Write-Note 'https://dotnet.microsoft.com/download/dotnet/10.0'
                $script:MissingRequired++
            }
        }
        else {
            Write-Bad ".NET SDK 10  -  found: $(if ($sdks) { $sdks -join ', ' } else { 'none' })"
            Write-Note 'https://dotnet.microsoft.com/download/dotnet/10.0'
            Write-Note 'winget install Microsoft.DotNet.SDK.10'
            $script:MissingRequired++
        }
    }
    else {
        Write-Bad '.NET SDK 10  -  dotnet is not on PATH'
        Write-Note 'https://dotnet.microsoft.com/download/dotnet/10.0'
        Write-Note 'winget install Microsoft.DotNet.SDK.10'
        $script:MissingRequired++
    }

    # -- git --------------------------------------------------------------------------
    if (Test-Tool 'git') {
        Write-Ok "git ($((& git --version 2>$null) -replace 'git version ',''))"
    }
    else {
        Write-Bad 'git  -  needed to install the pre-commit secret-scanning hook'
        Write-Note 'https://git-scm.com/downloads     winget install Git.Git'
        $script:MissingRequired++
    }

    # -- A key generator for step 3 ---------------------------------------------------
    # PowerShell 7 can do it in-process, with no external tool at all. That is the point
    # of having this script: flyio/SECRETS.md records that PowerShell ships no openssl,
    # and that the openssl.exe bundled with some tooling has produced a key with CRLF
    # line endings - which is not a PEM.
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        Write-Ok 'PowerShell 7+  -  step 3 will generate the RSA key in-process, no openssl needed'
    }
    elseif (Test-Tool 'dotnet') {
        Write-Warn 'Windows PowerShell 5.1  -  step 3 will fall back to the .NET SDK, which is fine'
        Write-Note '.NET Framework cannot export PKCS#8; PowerShell 7 can. winget install Microsoft.PowerShell'
    }
    else {
        Write-Bad 'a key generator  -  neither PowerShell 7 nor the .NET SDK is available'
        $script:MissingRequired++
    }

    # -- Container engine -------------------------------------------------------------
    # Installed and RUNNING are two different questions and only the second one matters.
    $engine = @('docker','podman') | Where-Object { Test-Tool $_ } | Select-Object -First 1
    if ($engine) {
        & $engine info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "container engine: $engine, and the daemon is reachable"
        }
        else {
            Write-Warn "container engine: $engine is installed but the daemon is NOT running"
            Write-Note 'Start Docker Desktop.'
            Write-Note "Without it: 'dotnet run --project $AppHostProject' cannot start Postgres or"
            Write-Note "authservice. 'dotnet test' and 'dotnet run --project $ApiProject' still work -"
            Write-Note 'the API falls back to an in-memory database and /health reports the degradation.'
            $script:MissingOptional++
        }
    }
    else {
        Write-Warn 'container engine  -  neither docker nor podman is on PATH'
        Write-Note 'https://docs.docker.com/get-started/get-docker/'
        Write-Note 'Needed for the FULL local stack (Postgres + authservice), not for build or test.'
        $script:MissingOptional++
    }

    # -- Node 22 + pnpm ---------------------------------------------------------------
    if (Test-Tool 'node') {
        $nodeVersion = (& node -v 2>$null)
        $nodeMajor   = 0
        if ($nodeVersion -match '^v(\d+)') { $nodeMajor = [int]$Matches[1] }
        if ($nodeMajor -ge 22) { Write-Ok "Node $nodeVersion" }
        else {
            Write-Warn "Node $nodeVersion  -  the workspace requires 22 or newer"
            Write-Note 'web/.npmrc sets engine-strict, so this is an install-time failure (EBADENGINE)'
            Write-Note 'rather than a build-time mystery. https://nodejs.org/en/download'
            $script:MissingOptional++
        }
    }
    else {
        Write-Warn 'Node 22  -  needed for the web reader'
        Write-Note 'https://nodejs.org/en/download     winget install OpenJS.NodeJS.LTS'
        $script:MissingOptional++
    }

    if (Test-Tool 'pnpm') { Write-Ok "pnpm ($(& pnpm --version 2>$null))" }
    elseif (Test-Tool 'corepack') {
        Write-Warn 'pnpm  -  not on PATH, but corepack is: run  corepack enable'
        Write-Note 'web/package.json names the exact pnpm in packageManager; corepack activates it.'
        $script:MissingOptional++
    }
    else {
        Write-Warn 'pnpm  -  needed for the web reader'
        Write-Note 'corepack enable      (ships with Node)      or      npm install -g pnpm'
        $script:MissingOptional++
    }

    # -- gitleaks ---------------------------------------------------------------------
    if (Test-Tool 'gitleaks') {
        Write-Ok "gitleaks ($(& gitleaks version 2>$null))"
    }
    else {
        Write-Warn 'gitleaks  -  the pre-commit hook REFUSES to run without it'
        Write-Note 'winget install gitleaks    or    scoop install gitleaks'
        Write-Note 'https://github.com/gitleaks/gitleaks/releases  (one static binary)'
        Write-Note 'Refusing rather than waving commits through is deliberate: a hook that passes'
        Write-Note 'when the scanner is absent is indistinguishable from one that found nothing.'
        $script:MissingOptional++
    }

    # -- flyctl -----------------------------------------------------------------------
    if ((Test-Tool 'flyctl') -or (Test-Tool 'fly')) { Write-Ok 'flyctl' }
    else {
        Write-Warn 'flyctl  -  needed only to deploy or inspect the Fly.io apps'
        Write-Note 'https://fly.io/docs/flyctl/install/'
        Write-Note 'Nothing local needs it. CI deploys with its own token.'
        $script:MissingOptional++
    }
}

# =====================================================================================
#  STEP 2 - The local secret store, and the hook that keeps secrets out of the tree
# =====================================================================================
function Step2-SecretStore {
    Write-Head '2. Local secret store'

    if (-not (Test-Tool 'dotnet')) { Write-Bad 'dotnet is not available; cannot initialise the secret store.'; return }

    # `user-secrets init` is idempotent: both projects already declare a UserSecretsId
    # (ab-ovo-apphost, ab-ovo-api), so this confirms rather than creates.
    foreach ($proj in @($AppHostProject, $ApiProject)) {
        if (Invoke-InRepo @('user-secrets','init','--project',$proj)) { Write-Ok "secret store ready for $proj" }
        else { Write-Warn "could not initialise the secret store for $proj" }
    }
    Write-Note 'Stored OUTSIDE the working tree: %APPDATA%\Microsoft\UserSecrets\<id>\secrets.json'
    Write-Note '(Linux and macOS: ~/.microsoft/usersecrets/<id>/secrets.json)'

    # -- The pre-commit hook ----------------------------------------------------------
    # core.hooksPath rather than copying into .git/hooks: a copy is a second version of
    # the file that nobody updates and no review ever sees.
    if (Test-Tool 'git') {
        Push-Location $RepoRoot
        try {
            & git rev-parse --git-dir 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                & git config core.hooksPath scripts/hooks
                Write-Ok 'pre-commit secret scanning installed (core.hooksPath=scripts/hooks)'
                Write-Note 'It scans the STAGED index before every commit. CI scans again on every PR and'
                Write-Note 'push - the hook is the only one that can stop a leak; CI is the only one that'
                Write-Note 'covers a machine you do not control.'
                Write-Note ''
                Write-Note 'On Windows the hook runs under the bash that ships with Git. If it does not fire,'
                Write-Note 'check that scripts/hooks/pre-commit has LF endings - .gitattributes enforces it,'
                Write-Note 'and a CRLF shebang fails as "bad interpreter: ...^M: No such file or directory".'
            }
            else { Write-Warn 'not a git repository: pre-commit hook NOT installed' }
        }
        finally { Pop-Location }
    }
    else { Write-Warn 'git is missing: pre-commit hook NOT installed' }
}

# =====================================================================================
#  STEP 3 - Generate the single mandatory secret
#
#  REPO-BASELINE.md §3 step 3: "GENERATE the single mandatory secret rather than asking
#  the developer to invent one." An invented secret is a weak secret or an empty one.
# =====================================================================================
function New-RsaPkcs8Pem {
    # PKCS#8 ("BEGIN PRIVATE KEY"), RSA 2048 - what authservice wants.
    #
    # PowerShell 7 runs on .NET 7+, where ExportPkcs8PrivateKeyPem exists. No openssl and
    # no temporary file: the key is a string in memory that goes straight into the store,
    # so there is never a .pem on disk for anyone to forget to delete - and never a chance
    # for a Windows text write to turn its LF endings into CRLF, which would stop it being
    # a PEM at all.
    try {
        $rsa = [System.Security.Cryptography.RSA]::Create(2048)
        try { return ($rsa.ExportPkcs8PrivateKeyPem() -replace "`r`n", "`n") }
        finally { $rsa.Dispose() }
    }
    catch {
        # Windows PowerShell 5.1 on .NET Framework has no PKCS#8 export. Fall back to the
        # .NET SDK, which is already a prerequisite. .NET 10 runs a single .cs file directly.
        if (-not (Test-Tool 'dotnet')) { return $null }
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("abovo-genkey-" + [guid]::NewGuid())
        New-Item -ItemType Directory -Path $tmp -Force | Out-Null
        try {
            $cs = "using System.Security.Cryptography;`nConsole.Write(RSA.Create(2048).ExportPkcs8PrivateKeyPem());"
            Set-Content -Path (Join-Path $tmp 'genkey.cs') -Value $cs -NoNewline -Encoding utf8
            Push-Location $tmp
            try { return ((& dotnet run genkey.cs 2>$null) -join "`n") }
            finally { Pop-Location }
        }
        finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
    }
}

function Test-SecretSet {
    param([string] $Project, [string] $Key)
    Push-Location $RepoRoot
    try {
        $listed = & dotnet user-secrets list --project $Project 2>$null
        if (-not $listed) { return $false }
        $line = @($listed) | Where-Object { $_ -like "$Key = *" } | Select-Object -First 1
        return ($null -ne $line) -and ($line -ne "$Key = ")
    }
    finally { Pop-Location }
}

function Set-Secret {
    param([string] $Project, [string] $Key, [string] $Value)
    # Piped as JSON on stdin rather than passed as an argument. A PKCS#8 PEM is MULTI-LINE,
    # and native-command argument passing with embedded newlines is not reliable across
    # PowerShell versions - the failure mode is a stored value truncated to its first line,
    # after which the service starts anyway on a key it cannot parse. `dotnet user-secrets
    # set` reads a JSON object from stdin, which has no quoting to get wrong.
    $json = (@{ $Key = $Value } | ConvertTo-Json -Compress -Depth 3)
    Push-Location $RepoRoot
    try { $json | & dotnet user-secrets set --project $Project | Out-Null; return $LASTEXITCODE -eq 0 }
    finally { Pop-Location }
}

function Step3-GenerateSecret {
    Write-Head '3. The mandatory secret - generated, never invented'

    if (-not (Test-Tool 'dotnet')) { Write-Bad 'dotnet is not available; cannot store the generated key.'; return }

    # -- 3a. The RSA signing keypair --------------------------------------------------
    if (Test-SecretSet $AppHostProject 'Parameters:auth-signing-key') {
        Write-Ok 'Parameters:auth-signing-key is already set - leaving it alone'
        Write-Note 'Regenerating invalidates every token already issued locally. To do it anyway:'
        Write-Note "  dotnet user-secrets remove ""Parameters:auth-signing-key"" --project $AppHostProject"
    }
    else {
        Write-Host '  generating an RSA 2048 PKCS#8 keypair...'
        $pem = New-RsaPkcs8Pem
        # The prefix below stops one character short of a complete PEM header, and that
        # is not cosmetic. A complete header literal -- BEGIN, the key type, and the
        # closing dashes -- starts gitleaks' default private-key match, whose regex is
        # greedy and MULTI-LINE: it runs from that point to the last '...KEY----' anywhere
        # below it. Anything that allowlists the resulting giant span then hides EVERY
        # key inside it, so a real one pasted further down this file scans clean.
        #
        # Measured in this repository, both ways round: with the full literal here, a real
        # PEM appended to this file was NOT reported; with it trimmed, it is. A
        # `gitleaks:allow` comment does not fix it and makes it worse, because the
        # suppression then covers the whole span rather than one line.
        #
        # The check is no weaker for the trim: a PKCS#1 key says BEGIN RSA PRIVATE KEY and
        # is still rejected by this same prefix.
        if ([string]::IsNullOrWhiteSpace($pem) -or -not $pem.StartsWith('-----BEGIN PRIVATE KEY')) {
            Write-Bad 'key generation failed, or produced something that is not a PKCS#8 PEM.'
            Write-Note 'Expected a first line to begin: -----BEGIN PRIVATE KEY'
            Write-Note 'If it says BEGIN RSA PRIVATE KEY, that is PKCS#1 and the wrong container.'
            return
        }
        if (Set-Secret $AppHostProject 'Parameters:auth-signing-key' $pem) {
            Write-Ok 'Parameters:auth-signing-key generated and stored (RSA 2048, PKCS#8)'
            Write-Note 'It never touched the working tree. There is no .pem file to delete.'
        }
        else { Write-Bad 'could not write the key to the secret store.' }
    }

    # -- 3b. The local database password ----------------------------------------------
    # Hex, not base64: the output is [0-9a-f] only, so it needs no escaping inside a
    # connection string, inside a SQL literal, or inside a shell argument. A base64
    # password containing + or / is legal everywhere and looks fine right up until
    # something quotes it differently.
    if (Test-SecretSet $AppHostProject 'Parameters:auth-db-password') {
        Write-Ok 'Parameters:auth-db-password is already set - leaving it alone'
    }
    else {
        $bytes = [byte[]]::new(32)
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
        $pw = -join ($bytes | ForEach-Object { $_.ToString('x2') })
        if (Set-Secret $AppHostProject 'Parameters:auth-db-password' $pw) {
            Write-Ok 'Parameters:auth-db-password generated and stored (32 bytes, hex)'
        }
        else { Write-Bad 'could not write the database password to the secret store.' }
    }

    Write-Note ''
    Write-Note 'Journey:  local store -> AppHost parameter -> environment variable -> config key'
    Write-Note '          Parameters:auth-signing-key -> AddParameter("auth-signing-key")'
    Write-Note '          -> Jwt__PrivateKeyPem -> configuration["Jwt:PrivateKeyPem"]'
}

# =====================================================================================
#  STEP 4 - Optional integrations
#
#  REPO-BASELINE.md §3 step 4: each is offered as a clearly labelled OPTIONAL step, "so
#  skipping is informed - the developer learns exactly which feature degrades (P8)".
#
#  AND: a fresh clone with EVERY one of these skipped still runs. That is a property of
#  this scaffold, not an aspiration.
# =====================================================================================
function Step4-Optional {
    Write-Head '4. Optional integrations'
    Write-Host '  Each may be skipped. What you lose is named, so skipping is a decision.'

    Write-Host ''
    Write-Host '  (optional — needed for the web reader)' -ForegroundColor White
    Write-Note 'Installs the pnpm workspace at web/. Without it the .NET side is unaffected and'
    Write-Note 'the reader does not run locally at all.'
    if (Test-Tool 'pnpm') {
        if (Confirm-Step "Run 'pnpm install' in web/ now?") {
            Push-Location (Join-Path $RepoRoot 'web')
            try {
                & pnpm install --frozen-lockfile
                if ($LASTEXITCODE -eq 0) { Write-Ok 'web workspace installed' }
                else { Write-Warn 'pnpm install failed - see the ERR_PNPM_NO_LOCKFILE row in the header' }
            }
            finally { Pop-Location }
        }
        else { Write-Note 'skipped. Later:  cd web; pnpm install' }
    }
    else { Write-Warn 'pnpm is not installed; skipping. Later:  corepack enable; cd web; pnpm install' }

    Write-Host ''
    Write-Host '  (optional — needed for the full local stack: Postgres and authservice)' -ForegroundColor White
    Write-Note "A container engine. Without it, 'dotnet run --project $AppHostProject' cannot"
    Write-Note 'start the containers; the API alone still runs on an in-memory database and'
    Write-Note '/health reports the degradation rather than refusing to boot.'
    $engine = @('docker','podman') | Where-Object { Test-Tool $_ } | Select-Object -First 1
    if ($engine) {
        & $engine info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Ok "$engine is running - nothing to do" }
        else { Write-Warn "$engine is installed but not running. Start it before the AppHost." }
    }
    else { Write-Warn 'no container engine found. https://docs.docker.com/get-started/get-docker/' }

    Write-Host ''
    Write-Host '  (optional — needed for traces and metrics leaving the process)' -ForegroundColor White
    Write-Note 'OTEL_EXPORTER_OTLP_ENDPOINT. The Aspire dashboard injects it for you when you run'
    Write-Note 'the AppHost, so there is usually nothing to set. Without it, instrumentation still'
    Write-Note 'RUNS and still records; nothing is EXPORTED. Nothing fails - which is exactly why'
    Write-Note 'it goes unnoticed. The only symptom is a dashboard that stays empty.'

    Write-Host ''
    Write-Host '  (optional — needed for scanning history before you push)' -ForegroundColor White
    Write-Note 'gitleaks. Without it the pre-commit hook REFUSES to run, so every commit is'
    Write-Note 'blocked until it is installed or ABOVO_SKIP_SECRET_SCAN=1 is set. CI scans'
    Write-Note 'regardless, so nothing reaches main unscanned either way.'
    if (Test-Tool 'gitleaks') { Write-Ok 'gitleaks is installed' }
    else { Write-Warn 'not installed. winget install gitleaks  /  scoop install gitleaks' }

    Write-Host ''
    Write-Host '  (optional — needed for deploying to Fly.io by hand)' -ForegroundColor White
    Write-Note "flyctl. Deployment normally runs in CI with its own token, so this is for"
    Write-Note "inspecting a running app - 'fly logs', 'fly secrets list', 'fly proxy'. Without it,"
    Write-Note 'nothing local changes. flyio/SECRETS.md covers the one-time human setup.'
    if ((Test-Tool 'flyctl') -or (Test-Tool 'fly')) { Write-Ok 'flyctl is installed' }
    else { Write-Warn 'not installed. https://fly.io/docs/flyctl/install/' }
}

# =====================================================================================
#  Run
# =====================================================================================
Write-Host 'ab-ovo - setup' -ForegroundColor White
Write-Host "repository: $RepoRoot" -ForegroundColor DarkGray

if ($Check) {
    Step1-Prerequisites
    Write-Head 'Summary'
    if ($script:MissingRequired -eq 0) { Write-Ok 'every REQUIRED prerequisite is present' }
    else { Write-Bad "$($script:MissingRequired) required prerequisite(s) missing - named above, with install pointers" }
    if ($script:MissingOptional -gt 0) {
        Write-Warn "$($script:MissingOptional) optional prerequisite(s) missing - each one's cost is named above"
    }
    Write-Host ''
    Write-Host "  -Check changes nothing. Run 'pwsh -File scripts/setup.ps1' to do the work."
    if ($script:MissingRequired -gt 0) { exit 1 }
    exit 0
}

Step1-Prerequisites
if ($script:MissingRequired -gt 0) {
    Write-Head 'Stopping'
    Write-Bad "$($script:MissingRequired) required prerequisite(s) missing. Install them and re-run."
    Write-Host '  Every one is named above with a pointer. Nothing has been changed.'
    exit 1
}

Step2-SecretStore
Step3-GenerateSecret
Step4-Optional

Write-Head 'Done'
# THE NEXT COMMAND IS NOT IN THIS SCRIPT, and this is the screen that has to say so. The
# bash twin's epilogue carries the identical block, for the identical reason.
#
# web/content/book/ is not tracked here - ADR-0008 makes the book's lab engine a versioned
# artefact fetched at a pinned revision - so on a fresh clone the AppHost's web resource
# stops in its predev, and `dotnet test` throws on the missing figures file. Both name
# scripts/fetch-book-content.sh. Measured from a clone into an empty directory (#75): until
# then this block handed the reader two commands that could not work yet.
#
# It is NAMED here rather than RUN here. REPO-BASELINE.md §3 puts one setup script per
# repository and requires it to work on both platforms, so performing the fetch would mean
# a second implementation - this file - of a step ADR-0008 expects a released bundle to
# replace. Naming it costs one line in each and cannot drift in behaviour.
#
# A bash script, on Windows, deliberately: this epilogue already sends the reader to
# `bash scripts/scan-secrets.sh`, and step 2 above states the same assumption in as many
# words - on Windows the hook runs under the bash that ships with Git.
Write-Host "  Fetch the book's lab engine (once per clone, pinned and digest-verified):"
Write-Host '      bash scripts/fetch-book-content.sh'
Write-Host ''
Write-Host '  Run the whole system (needs a container engine, and the fetch above):'
Write-Host "      dotnet run --project $AppHostProject"
Write-Host ''
Write-Host '  Run only the API (no containers, in-memory database, /health reports it):'
Write-Host "      dotnet run --project $ApiProject"
Write-Host ''
Write-Host '  Tests (need the fetch):  dotnet test'
Write-Host '  Scan history:            bash scripts/scan-secrets.sh'
Write-Host '  What every variable is, and what degrades without it:   secrets.env.example'
Write-Host '  Variables by tier, and the operational recipes:          scripts/README.md'
