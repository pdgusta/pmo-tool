<# Bootstrap estavel do PMO Tool. Updates regulares nao substituem este arquivo. #>
[CmdletBinding(DefaultParameterSetName='Run')]
param(
    [Parameter(ParameterSetName='Run')][switch]$Atualizar,
    [Parameter(ParameterSetName='Run')][switch]$SemAtualizacao,
    [Parameter(ParameterSetName='Rollback')][switch]$Rollback,
    [Parameter(ParameterSetName='Restore')][string]$RestaurarSnapshot,
    [Parameter(ParameterSetName='Diagnostic')][switch]$Diagnostico,
    [Parameter(ParameterSetName='Run',DontShow=$true)][string]$ActivationId
)

$ErrorActionPreference = 'Stop'
$installRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$common = Join-Path $installRoot 'tools\portable-common.ps1'
if (-not (Test-Path -LiteralPath $common)) { throw "Componente ausente: $common" }
. $common
$null = Assert-PmoPathWithoutReparse $installRoot
$null = Assert-PmoPathWithoutReparse $common

$configPath = Join-Path $installRoot 'config\install.json'
$activePath = Join-Path $installRoot 'state\active.json'
$updatePath = Join-Path $installRoot 'state\update.json'
$updater = Join-Path $installRoot 'atualizar.ps1'
$bootstrap = Read-PmoJson (Join-Path $installRoot 'bootstrap.json') $null
if (-not $bootstrap -or [string]::IsNullOrWhiteSpace([string]$bootstrap.bootstrapVersion)) { throw 'bootstrap.json ausente ou inválido.' }
try { $null = [version][string]$bootstrap.bootstrapVersion } catch { throw 'bootstrapVersion inválida em bootstrap.json.' }
$config = Read-PmoJson $configPath $null
if (-not $config) { throw "Configuracao ausente ou invalida: $configPath" }

$dataDir = Resolve-PmoPath $installRoot ([string]$config.dataDir)
$configDir = Join-Path $installRoot 'config'
$stateDir = Join-Path $installRoot 'state'
$logsDir = Join-Path $installRoot 'logs'
$stagingDir = Join-Path $installRoot 'staging'
$versionsDir = Join-Path $installRoot 'versions'
if ([string]$config.configDir -ne 'config' -or [string]$config.stateDir -ne 'state') { throw 'configDir e stateDir são fixos para preservar o protocolo portátil.' }
if ([int]$config.port -ne 8090) { throw 'A origem portátil é fixa em http://localhost:8090; outra porta não é permitida.' }

$isolatedDirectories = [ordered]@{
    data=$dataDir; config=$configDir; state=$stateDir; logs=$logsDir; staging=$stagingDir; versions=$versionsDir
}
foreach ($dir in @($isolatedDirectories.Values)) { $null = Assert-PmoPathWithoutReparse ([string]$dir) }
$isolatedNames = @($isolatedDirectories.Keys)
for ($i=0; $i -lt $isolatedNames.Count; $i++) {
    for ($j=$i+1; $j -lt $isolatedNames.Count; $j++) {
        $leftName = [string]$isolatedNames[$i]
        $rightName = [string]$isolatedNames[$j]
        $left = [string]$isolatedDirectories[$leftName]
        $right = [string]$isolatedDirectories[$rightName]
        if ((Test-PmoPathEqualOrSubPath $left $right) -or (Test-PmoPathEqualOrSubPath $right $left)) {
            throw "Diretorios operacionais devem ser distintos e nao aninhados: $leftName e $rightName."
        }
    }
}
foreach ($dir in @($isolatedDirectories.Values)) {
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

function Get-PmoInventoryDigest($Files) {
    $lines = @()
    foreach ($entry in @($Files)) {
        if ($null -eq $entry) { continue }
        $path = ([string]$entry.path).Replace('\','/')
        $size = ([Int64]$entry.size).ToString([Globalization.CultureInfo]::InvariantCulture)
        $sha = ([string]$entry.sha256).ToLowerInvariant()
        $lines += ($path + [char]0 + $size + [char]0 + $sha + "`n")
    }
    [Array]::Sort($lines, [StringComparer]::Ordinal)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join ''))
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try { return (-join ($sha256.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })) }
    finally { $sha256.Dispose() }
}

function Get-PmoActiveRuntimeValidation($Active) {
    $errors = @()
    $runtime = $null
    $manifest = $null
    $mode = 'manifest-sha256'
    $versionText = if ($Active) { [string]$Active.activeVersion } else { '' }
    if ([string]::IsNullOrWhiteSpace($versionText)) {
        $errors += 'activeVersion ausente.'
    } elseif ($versionText -eq 'development') {
        $mode = 'development-structural'
        $runtime = $installRoot
        foreach ($required in @('serve.ps1','tools\portable-common.ps1')) {
            if (-not (Test-Path -LiteralPath (Join-Path $runtime $required) -PathType Leaf)) { $errors += "Runtime de desenvolvimento sem $required." }
        }
    } elseif ($versionText -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
        $errors += 'activeVersion deve ser development ou SemVer estavel X.Y.Z.'
    } else {
        $runtime = Get-PmoNormalizedFullPath (Join-Path $versionsDir $versionText)
        $runtimeParent = Get-PmoNormalizedFullPath (Split-Path -Parent $runtime)
        $versionsFull = Get-PmoNormalizedFullPath $versionsDir
        if (-not $runtimeParent.Equals($versionsFull,[StringComparison]::OrdinalIgnoreCase)) {
            $errors += 'Runtime ativo nao e filho direto de versions/.'
        } elseif (-not (Test-Path -LiteralPath $runtime -PathType Container)) {
            $errors += 'Diretorio do runtime ativo ausente.'
        } else {
            $runtimeItem = Get-Item -LiteralPath $runtime -Force
            if (($runtimeItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                $errors += 'Runtime ativo nao pode ser link ou junction.'
            }
            $reparse = @(Get-ChildItem -LiteralPath $runtime -Force -Recurse -ErrorAction SilentlyContinue | Where-Object {
                ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
            })
            if ($reparse.Count -gt 0) { $errors += 'Runtime ativo contem link ou junction.' }

            $releasePath = Join-Path $runtime 'release.json'
            if (-not (Test-Path -LiteralPath $releasePath -PathType Leaf)) {
                $errors += 'Runtime ativo sem release.json.'
            } else {
                try { $manifest = Read-PmoJson $releasePath $null } catch { $errors += 'release.json nao pode ser lido.' }
                if (-not $manifest) {
                    $errors += 'release.json ausente ou invalido.'
                } else {
                    if ([string]$manifest.version -cne $versionText) { $errors += 'Versao do release.json diverge de activeVersion.' }
                    if ([string]$manifest.channel -cne 'stable') { $errors += 'Canal do runtime ativo nao e stable.' }
                    if ([string]$manifest.platform -cne 'windows') { $errors += 'Plataforma do runtime ativo nao e windows.' }
                    if (-not ($manifest.PSObject.Properties.Name -contains 'schema') -or
                        -not ($manifest.schema.PSObject.Properties.Name -contains 'readMin') -or
                        -not ($manifest.schema.PSObject.Properties.Name -contains 'readMax') -or
                        -not ($manifest.schema.PSObject.Properties.Name -contains 'write')) {
                        $errors += 'Contrato de schema ausente no release.json.'
                    } else {
                        try {
                            $readMin = [int]$manifest.schema.readMin
                            $readMax = [int]$manifest.schema.readMax
                            $writeSchema = [int]$manifest.schema.write
                            if ($readMin -lt 1 -or $readMin -gt $readMax -or $writeSchema -lt $readMin -or $writeSchema -gt $readMax) {
                                $errors += 'Contrato de schema incoerente no release.json.'
                            }
                            if ([int]$Active.activeSchemaVersion -ne $writeSchema) { $errors += 'Schema ativo diverge do schema de escrita do runtime.' }
                        } catch { $errors += 'Contrato de schema invalido no release.json.' }
                    }

                    try {
                        $minimumBootstrap = [version][string]$manifest.minBootstrapVersion
                        if ([version][string]$bootstrap.bootstrapVersion -lt $minimumBootstrap) { $errors += 'Bootstrap instalado e inferior ao minimo do runtime.' }
                    } catch { $errors += 'minBootstrapVersion invalida no release.json.' }
                    if (-not ($Active.PSObject.Properties.Name -contains 'bootstrapProtocolVersion') -or
                        [int]$Active.bootstrapProtocolVersion -ne [int]$bootstrap.protocolVersion) {
                        $errors += 'Protocolo do bootstrap no ponteiro ativo diverge de bootstrap.json.'
                    }
                    try {
                        $minimumPowerShell = [version][string]$manifest.minPowerShellVersion
                        if ($PSVersionTable.PSVersion -lt $minimumPowerShell) { $errors += 'PowerShell instalado e inferior ao minimo do runtime.' }
                    } catch { $errors += 'minPowerShellVersion invalida no release.json.' }

                    $releasePin = if ($Active.PSObject.Properties.Name -contains 'activeReleaseManifestSha256') { ([string]$Active.activeReleaseManifestSha256).ToLowerInvariant() } else { '' }
                    if ($releasePin -notmatch '^[0-9a-f]{64}$') {
                        $errors += 'active.json nao possui activeReleaseManifestSha256 valido.'
                    } elseif ((Get-PmoSha256 $releasePath) -cne $releasePin) {
                        $errors += 'SHA-256 de release.json diverge do ponteiro ativo.'
                    }

                    if (-not ($manifest.PSObject.Properties.Name -contains 'files') -or @($manifest.files).Count -eq 0) {
                        $errors += 'release.json sem inventario de runtime.'
                    } else {
                        $inventoryErrors = @(Test-PmoInventory $runtime $manifest.files @('release.json'))
                        foreach ($inventoryError in $inventoryErrors) { $errors += [string]$inventoryError }
                    }
                }
            }
        }
    }
    return [pscustomobject]@{ ok=($errors.Count -eq 0); runtime=$runtime; manifest=$manifest; mode=$mode; errors=$errors }
}

function Test-PmoDirectoryWritable([string]$Directory) {
    $probe = Join-Path $Directory ('.diagnostic-write-' + [Guid]::NewGuid().ToString('N'))
    try {
        $stream = [System.IO.File]::Open($probe,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
        try { $stream.WriteByte(0); $stream.Flush($true) } finally { $stream.Dispose() }
        Remove-Item -LiteralPath $probe -Force
        return $true
    } catch { return $false }
    finally { if (Test-Path -LiteralPath $probe -PathType Leaf) { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue } }
}

function Get-PmoAttachmentDiagnostic {
    $attachmentDir = Join-Path $dataDir 'attachments'
    $entries = @()
    [Int64]$totalBytes = 0
    $recoveryResidues = 0
    foreach ($file in @(Get-ChildItem -LiteralPath $attachmentDir -File -Force -ErrorAction SilentlyContinue)) {
        $name = [string]$file.Name
        if ($name.EndsWith('.replace-backup',[StringComparison]::OrdinalIgnoreCase) -or
            $name.EndsWith('.previous',[StringComparison]::OrdinalIgnoreCase) -or
            $name -match '(?i)\.tmp-[0-9a-f]{32}$' -or
            $name -match '(?i)\.corrupt-[0-9]{14}-[0-9a-f]{8}$' -or
            $name -like '.write-test-*') {
            $recoveryResidues++
            continue
        }
        if ($name -notmatch '^[A-Za-z0-9._-]{1,180}$' -or $name -eq '.' -or $name -eq '..' -or $name.Contains('..')) { continue }
        $sha = Get-PmoSha256 $file.FullName
        $entries += [pscustomobject]@{ path=$name; size=[Int64]$file.Length; sha256=$sha }
        $totalBytes += [Int64]$file.Length
    }
    return [pscustomobject]@{
        count=$entries.Count; totalBytes=$totalBytes; aggregateSha256=(Get-PmoInventoryDigest $entries); recoveryResidues=$recoveryResidues
    }
}

function Get-PmoSnapshotDiagnostic {
    $snapshotRoot = Join-Path $dataDir 'update-backups'
    $latest = $null
    $lastValid = $null
    foreach ($directory in @(Get-ChildItem -LiteralPath $snapshotRoot -Directory -Force -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
        $manifest = $null
        try { $manifest = Read-PmoJson (Join-Path $directory.FullName 'manifest.json') $null } catch { }
        $sealed = $null -ne $manifest -and ($manifest.PSObject.Properties.Name -contains 'sealed') -and [bool]$manifest.sealed
        $valid = $false
        if ($sealed -and ($manifest.PSObject.Properties.Name -contains 'files') -and [string]$manifest.snapshotId -eq $directory.Name) {
            try { $valid = @(Test-PmoInventory $directory.FullName $manifest.files @('manifest.json')).Count -eq 0 } catch { $valid = $false }
        }
        $item = [ordered]@{
            id=$directory.Name; sealed=$sealed; valid=$valid
            kind=if ($manifest) { [string]$manifest.kind } else { $null }
            createdAt=if ($manifest) { [string]$manifest.createdAt } else { $null }
        }
        if ($null -eq $latest) { $latest = $item }
        if ($valid -and $null -eq $lastValid) { $lastValid = $item }
    }
    return [pscustomobject]@{ latest=$latest; lastSealedValid=$lastValid }
}

function Get-PmoUpdateLogDiagnostic {
    $path = Join-Path $logsDir 'update.log'
    $lastError = $null
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        foreach ($line in @((Get-Content -LiteralPath $path -Tail 200 -ErrorAction SilentlyContinue) | Select-Object -Reverse)) {
            if ([string]::IsNullOrWhiteSpace([string]$line)) { continue }
            try { $entry = $line | ConvertFrom-Json } catch { continue }
            if ([string]::IsNullOrWhiteSpace([string]$entry.message)) { continue }
            $safeMessage = [string]$entry.message
            $safeMessage = $safeMessage -replace [regex]::Escape($installRoot), '<install-root>'
            if (-not $dataDir.Equals($installRoot,[StringComparison]::OrdinalIgnoreCase)) {
                $safeMessage = $safeMessage -replace [regex]::Escape($dataDir), '<data-dir>'
            }
            $safeMessage = (($safeMessage -replace '[\r\n\t]+',' ') -replace '(?i)(token|authorization)\s*[:=]\s*\S+','$1=[redacted]')
            if ($safeMessage.Length -gt 500) { $safeMessage = $safeMessage.Substring(0,500) }
            $lastError = [ordered]@{ at=[string]$entry.at; phase=[string]$entry.phase; message=$safeMessage }
            break
        }
    }
    return [pscustomobject]@{ path=$path; exists=(Test-Path -LiteralPath $path -PathType Leaf); lastError=$lastError }
}

$active = Read-PmoJson $activePath $null
if (-not $active) { throw "Estado ativo ausente ou invalido: $activePath" }
$update = Read-PmoJson $updatePath ([pscustomobject]@{ phase='idle' })
$restoreJournal = Read-PmoJson (Join-Path $stateDir 'restore.json') $null
$activePhases = @('prepared','rollback-prepared','restore-prepared','rolling-back','downloading','verified','installed','activating','restoring','recovering')
$runtimeValidation = Get-PmoActiveRuntimeValidation $active
$runtime = $runtimeValidation.runtime

if ($Diagnostico) {
    $portfolio = Join-Path $dataDir 'portfolio.json'
    $dataWritable = Test-PmoDirectoryWritable $dataDir
    $attachmentDiagnostic = Get-PmoAttachmentDiagnostic
    $snapshotDiagnostic = Get-PmoSnapshotDiagnostic
    $updateLogDiagnostic = Get-PmoUpdateLogDiagnostic
    $result = [ordered]@{
        ok = ([bool]$runtimeValidation.ok -and $dataWritable)
        installRoot = $installRoot
        activeVersion = [string]$active.activeVersion
        runtimeExists = (-not [string]::IsNullOrWhiteSpace([string]$runtime) -and (Test-Path -LiteralPath $runtime -PathType Container))
        runtimeIntegrity = [bool]$runtimeValidation.ok
        runtimeIntegrityMode = [string]$runtimeValidation.mode
        runtimeIntegrityErrors = @($runtimeValidation.errors)
        dataDir = $dataDir
        dataWritable = $dataWritable
        portfolioExists = (Test-Path -LiteralPath $portfolio -PathType Leaf)
        portfolioSha256 = if (Test-Path -LiteralPath $portfolio -PathType Leaf) { Get-PmoSha256 $portfolio } else { $null }
        attachments = $attachmentDiagnostic
        repositoryConfigured = (-not [string]::IsNullOrWhiteSpace([string]$config.repository))
        fixedOrigin = 'http://localhost:8090/'
        updatePhase = [string]$update.phase
        updateLog = $updateLogDiagnostic
        restorePending = (Test-Path -LiteralPath (Join-Path $stateDir 'restore-pending.json'))
        restoreJournalPhase = if ($restoreJournal) { [string]$restoreJournal.phase } else { $null }
        pendingActivation = ($active.PSObject.Properties.Name -contains 'pendingActivationId')
        snapshots = @(Get-ChildItem -LiteralPath (Join-Path $dataDir 'update-backups') -Directory -ErrorAction SilentlyContinue).Count
        latestSnapshot = $snapshotDiagnostic.latest
        lastSealedValidSnapshot = $snapshotDiagnostic.lastSealedValid
    }
    $result | ConvertTo-Json -Depth 10
    exit 0
}

$restoreIncomplete = $restoreJournal -and [string]$restoreJournal.phase -ne 'completed'
$pendingActivation = $active.PSObject.Properties.Name -contains 'pendingActivationId'
if (($activePhases -contains [string]$update.phase) -or $restoreIncomplete -or $pendingActivation) {
    $activationAuthorized = $ActivationId -and $update.activationId -and ([string]$ActivationId -eq [string]$update.activationId) -and [string]$update.phase -eq 'activating' -and -not $restoreIncomplete
    if (-not $activationAuthorized) {
        $recoveryProbe = Enter-PmoMutex $installRoot 'runtime' 0
        if (-not $recoveryProbe) { throw 'Outra instancia ou uma atualizacao do PMO Tool ainda esta em execucao.' }
        Exit-PmoMutex $recoveryProbe
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -InstallRoot $installRoot -Recover
        if ($LASTEXITCODE -ne 0) { throw 'Existe uma atualização ativa; aguarde sua conclusão antes de abrir ou restaurar.' }
        $active = Read-PmoJson $activePath $null
        $update = Read-PmoJson $updatePath ([pscustomobject]@{ phase='idle' })
    }
}

if ($PSCmdlet.ParameterSetName -eq 'Restore' -and $RestaurarSnapshot -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'ID de snapshot invalido.' }

$runtimeValidation = Get-PmoActiveRuntimeValidation $active
if (-not $runtimeValidation.ok) { throw ('Runtime ativo rejeitado: ' + (@($runtimeValidation.errors) -join '; ')) }
$runtime = $runtimeValidation.runtime
$serve = Join-Path $runtime 'serve.ps1'
if (-not (Test-Path -LiteralPath $serve -PathType Leaf)) { throw "Runtime ativo incompleto: $serve" }
$null = Assert-PmoPathWithoutReparse $serve

$adminToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$url = '/'
if ($PSCmdlet.ParameterSetName -eq 'Restore') { $url = '/?prepareRestore=' + $RestaurarSnapshot }
elseif ($Rollback) { $url = '/?prepareRollback=1' }
elseif ($Atualizar) { $url = '/?forceUpdate=1' }
elseif ($SemAtualizacao) { $url = '/?skipUpdate=1' }
$serveArgs = @{
    Porta=8090; DataDir=$dataDir; ConfigDir=$configDir; StateDir=$stateDir
    AdminToken=$adminToken; UrlInicial=$url; SemBuild=$true
}
if (-not [string]::IsNullOrWhiteSpace($ActivationId)) { $serveArgs.ActivationId = $ActivationId }
& $serve @serveArgs
exit $LASTEXITCODE
