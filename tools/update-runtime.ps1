<#
    Updater transacional versionado do PMO Tool.

    O script nunca altera data/ durante uma instalacao normal. Quando um
    rollback entre schemas exige restauracao, ele usa staging + journal e
    deixa restore-pending.json para que a aplicacao substitua tambem o
    IndexedDB antes de liberar novas gravacoes.

    Compativel com Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$InstallRoot,
    [string]$PreparedSnapshot,
    [switch]$Rollback,
    [string]$RestoreSnapshot,
    [switch]$CheckOnly,
    [switch]$Recover
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)

# O updater versionado usa primeiro o helper que veio no mesmo pacote. Isso
# evita validar uma release nova com regras antigas do bootstrap raiz.
$common = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'portable-common.ps1'
if (-not (Test-Path -LiteralPath $common -PathType Leaf)) {
    $common = Join-Path $InstallRoot 'tools\portable-common.ps1'
}
if (-not (Test-Path -LiteralPath $common -PathType Leaf)) { throw 'portable-common.ps1 nao encontrado.' }
. $common

$configPath = Join-Path $InstallRoot 'config\install.json'
$activePath = Join-Path $InstallRoot 'state\active.json'
$updatePath = Join-Path $InstallRoot 'state\update.json'
$updateLockPath = Join-Path $InstallRoot 'state\update.lock'
$readyPath = Join-Path $InstallRoot 'state\app-ready.json'
$restoreJournalPath = Join-Path $InstallRoot 'state\restore.json'
$restorePendingPath = Join-Path $InstallRoot 'state\restore-pending.json'
$bootstrapPath = Join-Path $InstallRoot 'bootstrap.json'

function Read-PmoJsonStrictReadOnly {
    param([Parameter(Mandatory=$true)][string]$Path,$Default=$null)
    $null = Assert-PmoPathWithoutReparse $Path
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Default }
    $raw = [System.IO.File]::ReadAllText($Path,[System.Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    return ($raw | ConvertFrom-Json)
}

# Recovery chamado enquanto o runtime ainda esta aberto precisa falhar sem
# reparar backups JSON nem criar diretorios antes de obter o mutex de runtime.
$config = if ($Recover) { Read-PmoJsonStrictReadOnly $configPath $null } else { Read-PmoJson $configPath $null }
$bootstrap = if ($Recover) { Read-PmoJsonStrictReadOnly $bootstrapPath $null } else { Read-PmoJson $bootstrapPath $null }
if (-not $config) { throw "Configuracao invalida: $configPath" }
if (-not $bootstrap -or [string]::IsNullOrWhiteSpace([string]$bootstrap.bootstrapVersion)) { throw 'bootstrap.json ausente ou invalido.' }
try { $bootstrapVersion = [version][string]$bootstrap.bootstrapVersion } catch { throw 'bootstrapVersion invalida.' }
if (-not ($bootstrap.PSObject.Properties.Name -contains 'protocolVersion') -or [int]$bootstrap.protocolVersion -lt 1) { throw 'protocolVersion invalida em bootstrap.json.' }
if ([string]$config.configDir -ne 'config' -or [string]$config.stateDir -ne 'state') { throw 'configDir e stateDir devem permanecer na raiz da instalacao.' }
if ([int]$config.port -ne 8090) { throw 'A instalacao portatil exige a porta 8090.' }

function Test-PmoPathsOverlap {
    param([Parameter(Mandatory=$true)][string]$First,[Parameter(Mandatory=$true)][string]$Second)
    $a = Get-PmoNormalizedFullPath $First
    $b = Get-PmoNormalizedFullPath $Second
    return ($a.Equals($b,[StringComparison]::OrdinalIgnoreCase) -or (Test-PmoSubPath $a $b) -or (Test-PmoSubPath $b $a))
}

function Assert-PmoDistinctRoots {
    param([Parameter(Mandatory=$true)][object[]]$Roots)
    for ($i=0; $i -lt $Roots.Count; $i++) {
        $null = Assert-PmoPathWithoutReparse ([string]$Roots[$i].path)
        for ($j=$i+1; $j -lt $Roots.Count; $j++) {
            if (Test-PmoPathsOverlap ([string]$Roots[$i].path) ([string]$Roots[$j].path)) {
                throw "Raizes persistentes devem ser distintas e nao sobrepostas: $($Roots[$i].name) e $($Roots[$j].name)."
            }
        }
    }
}

function Assert-PmoManagedPath {
    param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$Path)
    $rootFull = Get-PmoNormalizedFullPath $Root
    $pathFull = Get-PmoNormalizedFullPath $Path
    if (-not (Test-PmoSubPath $rootFull $pathFull)) { throw "Caminho gerenciado fora da raiz permitida: $pathFull" }
    $null = Assert-PmoPathWithoutReparse $rootFull
    $null = Assert-PmoPathWithoutReparse $pathFull
}

$dataDir = Resolve-PmoPath $InstallRoot ([string]$config.dataDir)
$configDir = Join-Path $InstallRoot 'config'
$stateDir = Join-Path $InstallRoot 'state'
$versionsDir = Join-Path $InstallRoot 'versions'
$stagingRoot = Join-Path $InstallRoot 'staging'
$snapshotRoot = Join-Path $dataDir 'update-backups'
$recoveryRoot = Join-Path $dataDir 'recovery'
$logDir = Join-Path $InstallRoot 'logs'
$persistentRoots = @(
    [pscustomobject]@{name='data';path=$dataDir},[pscustomobject]@{name='config';path=$configDir},[pscustomobject]@{name='state';path=$stateDir},
    [pscustomobject]@{name='versions';path=$versionsDir},[pscustomobject]@{name='staging';path=$stagingRoot},
    [pscustomobject]@{name='logs';path=$logDir}
)
Assert-PmoDistinctRoots $persistentRoots
foreach ($dir in @($dataDir,$configDir,$stateDir,$versionsDir,$stagingRoot,$snapshotRoot,$recoveryRoot,$logDir)) {
    $null = Assert-PmoPathWithoutReparse $dir
    if (-not (Test-Path -LiteralPath $dir)) {
        if ($Recover) { throw "Recovery exige diretorio operacional existente: $dir" }
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $null = Assert-PmoPathWithoutReparse $dir
}

$maxExternalManifestBytes = 1048576
$maxRuntimeZipBytes = 268435456
$maxArchiveEntryCompressedBytes = 67108864
$maxArchiveExpandedBytes = 536870912
$maxArchiveCompressionRatio = 200.0
$updateCapacityReserveBytes = 33554432

# Identifica de forma canonica qual runtime criou o journal. Em recovery, o
# bootstrap raiz usa estes campos para evitar delegar uma transacao antiga ao
# updater da versao que ficou apenas parcialmente ativada.
$script:updaterScriptPath = [System.IO.Path]::GetFullPath($MyInvocation.MyCommand.Path)
$rootUpdaterPath = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot 'tools\update-runtime.ps1'))
$versionsBase = Get-PmoNormalizedFullPath $versionsDir
$versionsPrefix = if ($versionsBase.EndsWith('\',[StringComparison]::Ordinal)) { $versionsBase } else { $versionsBase + '\' }
$script:updaterRuntimeVersion = 'root'
$script:updaterRelativePath = 'tools/update-runtime.ps1'
$script:updaterReleaseManifestSha256 = $null
if ($script:updaterScriptPath.StartsWith($versionsPrefix,[StringComparison]::OrdinalIgnoreCase)) {
    $relativeUpdater = $script:updaterScriptPath.Substring($versionsPrefix.Length).Replace('\','/')
    if ($relativeUpdater -notmatch '^(?<version>(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))/tools/update-runtime\.ps1$') {
        throw 'Updater versionado fora do layout versions/<SemVer>/tools/update-runtime.ps1.'
    }
    $script:updaterRuntimeVersion = $Matches['version']
    $script:updaterRelativePath = 'versions/' + $relativeUpdater
    $creatorReleasePath = Join-Path (Join-Path $versionsDir $script:updaterRuntimeVersion) 'release.json'
    if (-not (Test-Path -LiteralPath $creatorReleasePath -PathType Leaf)) { throw 'Updater versionado sem release.json para ancorar o journal.' }
    $script:updaterReleaseManifestSha256 = Get-PmoSha256 $creatorReleasePath
} elseif (-not $script:updaterScriptPath.Equals($rootUpdaterPath,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Updater executado fora da raiz ou de um runtime versionado da instalacao.'
}

$script:updateMutex = $null
$script:workDir = $null

function Write-UpdateLog {
    param([string]$Phase,[string]$Message=$null)
    try {
        $null = Assert-PmoPathWithoutReparse $logDir
        $safe = $null
        if (-not [string]::IsNullOrWhiteSpace($Message)) {
            $safe = (($Message -replace '[\r\n\t]+',' ') -replace '(?i)(token|authorization)\s*[:=]\s*\S+','$1=[redacted]')
            $safe = $safe.Substring(0,[Math]::Min(500,$safe.Length))
        }
        $line = ([ordered]@{ at=(Get-Date).ToUniversalTime().ToString('o'); phase=$Phase; message=$safe } | ConvertTo-Json -Compress) + [Environment]::NewLine
        $logPath = Join-Path $logDir 'update.log'
        if ((Test-Path -LiteralPath $logPath -PathType Leaf) -and [Int64](Get-Item -LiteralPath $logPath).Length -ge 2097152) {
            $oldest = $logPath + '.3'
            if (Test-Path -LiteralPath $oldest -PathType Leaf) { Remove-Item -LiteralPath $oldest -Force }
            for ($index=3; $index -ge 1; $index--) {
                $source = if ($index -eq 1) { $logPath } else { $logPath + '.' + ($index - 1) }
                $target = $logPath + '.' + $index
                if (Test-Path -LiteralPath $source -PathType Leaf) { Move-Item -LiteralPath $source -Destination $target -Force }
            }
        }
        [System.IO.File]::AppendAllText($logPath,$line,(New-Object System.Text.UTF8Encoding($false)))
    } catch { }
}

function Tem-Propriedade {
    param($Objeto,[string]$Nome)
    return ($null -ne $Objeto -and $Objeto.PSObject.Properties.Name -contains $Nome)
}

function Remove-PmoManagedTree {
    param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$Path)
    Assert-PmoManagedPath $Root $Path
    if (-not (Test-Path -LiteralPath $Path)) { return }
    foreach ($item in @(Get-ChildItem -LiteralPath $Path -Force -Recurse)) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Remocao recusada: arvore gerenciada contem reparse point em $($item.FullName)."
        }
    }
    Remove-Item -LiteralPath $Path -Recurse -Force
}

function Assert-ReleaseAssetBounds {
    param($Asset,$ManifestAsset)
    if (-not $Asset -or [Int64]$Asset.size -le 0 -or [Int64]$Asset.size -gt $maxRuntimeZipBytes) {
        throw "Artefato ZIP fora do limite permitido de $maxRuntimeZipBytes bytes."
    }
    if (-not $ManifestAsset -or [Int64]$ManifestAsset.size -le 0 -or [Int64]$ManifestAsset.size -gt $maxExternalManifestBytes) {
        throw "Manifesto externo fora do limite permitido de $maxExternalManifestBytes bytes."
    }
}

function Get-PmoFreeSpace {
    param([Parameter(Mandatory=$true)][string]$Path)
    $root = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($Path))
    if ([string]::IsNullOrWhiteSpace($root)) { throw "Nao foi possivel resolver o volume de $Path." }
    return [Int64](New-Object System.IO.DriveInfo($root)).AvailableFreeSpace
}

function Assert-UpdateCapacity {
    param($Asset,$ManifestAsset,$Snapshot)
    [Int64]$snapshotBytes = 0
    foreach ($entry in @($Snapshot.manifest.files)) {
        if ($null -ne $entry -and (Tem-Propriedade $entry 'size')) { $snapshotBytes += [Int64]$entry.size }
    }
    [Int64]$stagingRequired = [Int64]$Asset.size + [Int64]$ManifestAsset.size +
        $maxArchiveExpandedBytes + $updateCapacityReserveBytes
    [Int64]$snapshotRequired = $snapshotBytes + $updateCapacityReserveBytes
    $stagingVolume = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($stagingRoot))
    $snapshotVolume = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($snapshotRoot))
    if ($stagingVolume.Equals($snapshotVolume,[StringComparison]::OrdinalIgnoreCase)) {
        [Int64]$required = $stagingRequired + $snapshotBytes
        [Int64]$available = Get-PmoFreeSpace $stagingRoot
        if ($available -lt $required) { throw "Espaco livre insuficiente para ZIP, staging e snapshot de compensacao: requer $required bytes; disponivel $available." }
        return
    }
    [Int64]$stagingAvailable = Get-PmoFreeSpace $stagingRoot
    if ($stagingAvailable -lt $stagingRequired) { throw "Espaco livre insuficiente no volume de staging: requer $stagingRequired bytes; disponivel $stagingAvailable." }
    [Int64]$snapshotAvailable = Get-PmoFreeSpace $snapshotRoot
    if ($snapshotAvailable -lt $snapshotRequired) { throw "Espaco livre insuficiente no volume de snapshots: requer $snapshotRequired bytes; disponivel $snapshotAvailable." }
}

function Test-PmoArchiveCompression {
    param([Parameter(Mandatory=$true)][string]$Path)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [System.IO.File]::Open($Path,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
    $archive = $null
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($stream,[System.IO.Compression.ZipArchiveMode]::Read,$false)
        [Int64]$totalCompressed = 0
        foreach ($entry in @($archive.Entries)) {
            [Int64]$compressed = $entry.CompressedLength
            [Int64]$expanded = $entry.Length
            if ($compressed -lt 0 -or $compressed -gt $maxArchiveEntryCompressedBytes) {
                throw "Entrada comprimida excede o limite: $($entry.FullName)"
            }
            $totalCompressed += $compressed
            if ($totalCompressed -gt $maxRuntimeZipBytes) { throw 'Conteudo comprimido do ZIP excede o limite total.' }
            if ($expanded -gt 0) {
                if ($compressed -le 0) { throw "Entrada nao vazia sem tamanho comprimido valido: $($entry.FullName)" }
                [double]$ratio = [double]$expanded / [double]$compressed
                if ($ratio -gt $maxArchiveCompressionRatio) {
                    throw "Razao de compressao excessiva em $($entry.FullName): $([Math]::Round($ratio,2))."
                }
            }
        }
        return [pscustomobject]@{ ok=$true; compressedBytes=$totalCompressed }
    } finally {
        if ($archive) { $archive.Dispose() }
        $stream.Dispose()
    }
}

function Set-UpdateState {
    param([string]$Phase,[string]$ErrorMessage=$null,$Extra=$null)
    $current = Read-PmoJson $updatePath ([pscustomobject]@{})
    $state = [ordered]@{}
    if ($current) { foreach ($p in $current.PSObject.Properties) { $state[$p.Name] = $p.Value } }
    $state.formatVersion = 1
    $state.phase = $Phase
    $state.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $state.error = $ErrorMessage
    if (-not $state.Contains('updaterRuntimeVersion')) { $state.updaterRuntimeVersion = $script:updaterRuntimeVersion }
    if (-not $state.Contains('updaterRelativePath')) { $state.updaterRelativePath = $script:updaterRelativePath }
    if (-not $state.Contains('updaterReleaseManifestSha256') -and $script:updaterReleaseManifestSha256) { $state.updaterReleaseManifestSha256 = $script:updaterReleaseManifestSha256 }
    if ($Extra) { foreach ($key in $Extra.Keys) { $state[$key] = $Extra[$key] } }
    Write-PmoJsonAtomic $updatePath $state
    Write-UpdateLog $Phase $ErrorMessage
    return [pscustomobject]$state
}

function Remove-UpdateMarker {
    $null = Assert-PmoPathWithoutReparse $stateDir
    $null = Assert-PmoPathWithoutReparse $updateLockPath
    if (Test-Path -LiteralPath $updateLockPath -PathType Leaf) { Remove-Item -LiteralPath $updateLockPath -Force -ErrorAction SilentlyContinue }
}

function Get-Snapshot {
    param([Parameter(Mandatory=$true)][string]$Id)
    if ($Id -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'ID de snapshot invalido.' }
    $dir = [System.IO.Path]::GetFullPath((Join-Path $snapshotRoot $Id))
    if (-not (Test-PmoSubPath $snapshotRoot $dir)) { throw 'Snapshot fora da raiz permitida.' }
    Assert-PmoManagedPath $snapshotRoot $dir
    $manifest = Read-PmoJson (Join-Path $dir 'manifest.json') $null
    if (-not $manifest -or -not (Tem-Propriedade $manifest 'sealed') -or -not [bool]$manifest.sealed) { throw "Snapshot nao selado: $Id" }
    if (-not (Tem-Propriedade $manifest 'files')) { throw "Snapshot sem inventario: $Id" }
    $errors = @(Test-PmoInventory $dir $manifest.files @('manifest.json'))
    if ($errors.Count -gt 0) { throw ('Snapshot corrompido: ' + ($errors -join '; ')) }
    if (-not (Test-Path -LiteralPath (Join-Path $dir 'portfolio.json') -PathType Leaf)) { throw 'Snapshot sem portfolio.json.' }
    return [pscustomobject]@{ id=$Id; dir=$dir; manifest=$manifest }
}

function New-EmergencySnapshot {
    param([Parameter(Mandatory=$true)][string]$Kind)
    $id = $Kind + '-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
    $dir = Join-Path $snapshotRoot $id
    Assert-PmoManagedPath $snapshotRoot $dir
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    try {
        $portfolio = Join-Path $dataDir 'portfolio.json'
        if (-not (Test-Path -LiteralPath $portfolio -PathType Leaf)) { throw 'Nao ha portfolio.json para o snapshot de emergencia.' }
        Copy-PmoFileDurable $portfolio (Join-Path $dir 'portfolio.json')
        Copy-PmoFileDurable $portfolio (Join-Path $dir 'raw-bundle.json')
        New-Item -ItemType Directory -Path (Join-Path $dir 'attachments'),(Join-Path $dir 'user-templates') -Force | Out-Null
        Copy-PmoDirectoryDurable (Join-Path $dataDir 'attachments') (Join-Path $dir 'attachments')
        Copy-PmoDirectoryDurable (Join-Path $dataDir 'user-templates') (Join-Path $dir 'user-templates')
        if (Test-Path -LiteralPath $configPath -PathType Leaf) {
            New-Item -ItemType Directory -Path (Join-Path $dir 'config') -Force | Out-Null
            Copy-PmoFileDurable $configPath (Join-Path $dir 'config\install.json')
        }
        $bundle = Read-PmoJson $portfolio $null
        $files = @(Get-PmoDirectoryInventory $dir)
        $manifest = [ordered]@{
            formatVersion=1; snapshotId=$id; kind=$Kind; sealed=$true
            createdAt=(Get-Date).ToUniversalTime().ToString('o')
            sourceAppVersion=if($bundle -and $bundle.meta -and $bundle.meta.appVersion){[string]$bundle.meta.appVersion}else{$null}
            sourceSchemaVersion=if($bundle -and $bundle.meta -and $bundle.meta.schemaVersion){[int]$bundle.meta.schemaVersion}else{$null}
            files=$files
        }
        Write-PmoJsonAtomic (Join-Path $dir 'manifest.json') $manifest
        $null = Get-Snapshot $id
        return $id
    } catch {
        if (Test-Path -LiteralPath $dir) { try { Remove-PmoManagedTree $snapshotRoot $dir } catch { } }
        throw
    }
}

function Get-SnapshotDataEntries {
    param($Snapshot)
    $entries = @()
    foreach ($entry in @($Snapshot.manifest.files)) {
        $path = ([string]$entry.path).Replace('\','/')
        if ($path -eq 'portfolio.json' -or $path.StartsWith('attachments/',[StringComparison]::OrdinalIgnoreCase) -or $path.StartsWith('user-templates/',[StringComparison]::OrdinalIgnoreCase)) {
            $entries += $entry
        }
    }
    return $entries
}

function Test-RestoredData {
    param($Snapshot)
    $errors = @()
    $portfolioEntry = @($Snapshot.manifest.files | Where-Object { ([string]$_.path).Replace('\','/') -eq 'portfolio.json' }) | Select-Object -First 1
    $portfolio = Join-Path $dataDir 'portfolio.json'
    $null = Assert-PmoPathWithoutReparse $portfolio
    if (-not $portfolioEntry -or -not (Test-Path -LiteralPath $portfolio -PathType Leaf)) { $errors += 'portfolio.json ausente' }
    elseif ([Int64](Get-Item -LiteralPath $portfolio).Length -ne [Int64]$portfolioEntry.size -or (Get-PmoSha256 $portfolio) -ne ([string]$portfolioEntry.sha256).ToLowerInvariant()) { $errors += 'portfolio.json divergente' }
    foreach ($name in @('attachments','user-templates')) {
        $componentRoot = Join-Path $dataDir $name
        $null = Assert-PmoPathWithoutReparse $componentRoot
        $prefix = $name + '/'
        $expected = @()
        foreach ($entry in @($Snapshot.manifest.files)) {
            $path = ([string]$entry.path).Replace('\','/')
            if ($path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) {
                $expected += [pscustomobject]@{ path=$path.Substring($prefix.Length); size=[Int64]$entry.size; sha256=[string]$entry.sha256 }
            }
        }
        $errors += @(Test-PmoInventory $componentRoot $expected)
    }
    return $errors
}

function New-RestoreOperationId {
    return 'restore-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
}

function New-RestoreJournal {
    param($Snapshot,[string]$EmergencySnapshotId,[Parameter(Mandatory=$true)][string]$RestoreId)
    if ($RestoreId -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'restoreId invalido ao criar journal.' }
    $restoreId = $RestoreId
    $root = Join-Path $recoveryRoot $restoreId
    $stage = Join-Path $root 'stage'
    $previous = Join-Path $root 'previous'
    Assert-PmoManagedPath $recoveryRoot $root
    if (Test-Path -LiteralPath $root) { Remove-PmoManagedTree $recoveryRoot $root }
    Assert-PmoManagedPath $recoveryRoot $stage
    Assert-PmoManagedPath $recoveryRoot $previous
    Assert-PmoManagedPath $recoveryRoot (Join-Path $stage 'attachments')
    Assert-PmoManagedPath $recoveryRoot (Join-Path $stage 'user-templates')
    New-Item -ItemType Directory -Path $stage,$previous,(Join-Path $stage 'attachments'),(Join-Path $stage 'user-templates') -Force | Out-Null
    Copy-PmoFileDurable (Join-Path $Snapshot.dir 'portfolio.json') (Join-Path $stage 'portfolio.json')
    Copy-PmoDirectoryDurable (Join-Path $Snapshot.dir 'attachments') (Join-Path $stage 'attachments')
    Copy-PmoDirectoryDurable (Join-Path $Snapshot.dir 'user-templates') (Join-Path $stage 'user-templates')
    $dataEntries = @(Get-SnapshotDataEntries $Snapshot)
    $stageErrors = @(Test-PmoInventory $stage $dataEntries)
    if ($stageErrors.Count -gt 0) { throw ('Staging de restauracao invalido: ' + ($stageErrors -join '; ')) }
    $updateState = Read-PmoJson $updatePath $null
    $journalUpdaterVersion = if ($updateState -and (Tem-Propriedade $updateState 'updaterRuntimeVersion')) { [string]$updateState.updaterRuntimeVersion } else { $script:updaterRuntimeVersion }
    $journalUpdaterPath = if ($updateState -and (Tem-Propriedade $updateState 'updaterRelativePath')) { [string]$updateState.updaterRelativePath } else { $script:updaterRelativePath }
    $journalUpdaterManifestSha = if ($updateState -and (Tem-Propriedade $updateState 'updaterReleaseManifestSha256')) { [string]$updateState.updaterReleaseManifestSha256 } else { $script:updaterReleaseManifestSha256 }
    $journal = [ordered]@{
        formatVersion=1; restoreId=$restoreId; phase='prepared'; snapshotId=$Snapshot.id
        emergencySnapshotId=$EmergencySnapshotId; root=$root; stage=$stage; previous=$previous
        updaterRuntimeVersion=$journalUpdaterVersion; updaterRelativePath=$journalUpdaterPath
        createdAt=(Get-Date).ToUniversalTime().ToString('o'); updatedAt=(Get-Date).ToUniversalTime().ToString('o')
        completedAt=$null; completedComponents=@()
    }
    if (-not [string]::IsNullOrWhiteSpace($journalUpdaterManifestSha)) { $journal.updaterReleaseManifestSha256 = $journalUpdaterManifestSha.ToLowerInvariant() }
    Write-PmoJsonAtomic $restoreJournalPath $journal
    return [pscustomobject]$journal
}

function Write-RestorePending {
    param($Snapshot,[string]$EmergencySnapshotId,[Parameter(Mandatory=$true)][string]$RestoreId)
    $attachments = @()
    foreach ($entry in @($Snapshot.manifest.files)) {
        $path = ([string]$entry.path).Replace('\','/')
        if ($path.StartsWith('attachments/',[StringComparison]::OrdinalIgnoreCase)) {
            $id = $path.Substring('attachments/'.Length)
            if ($id -and -not $id.Contains('/')) {
                $attachments += [ordered]@{ id=$id; path=$path; size=[Int64]$entry.size; sha256=([string]$entry.sha256).ToLowerInvariant() }
            }
        }
    }
    $portfolioEntry = @($Snapshot.manifest.files | Where-Object { ([string]$_.path).Replace('\','/') -eq 'portfolio.json' }) | Select-Object -First 1
    $journal = Read-PmoJson $restoreJournalPath $null
    if (-not $journal -or [string]$journal.restoreId -ne $RestoreId -or [string]$journal.snapshotId -ne [string]$Snapshot.id) { throw 'Journal divergiu antes de gravar restore-pending.' }
    $pending = [ordered]@{
        formatVersion=1; status='pending-browser-sync'; restoreId=$RestoreId
        snapshotId=$Snapshot.id; emergencySnapshotId=$EmergencySnapshotId
        sourceAppVersion=if(Tem-Propriedade $Snapshot.manifest 'sourceAppVersion'){[string]$Snapshot.manifest.sourceAppVersion}else{$null}
        sourceSchemaVersion=if(Tem-Propriedade $Snapshot.manifest 'sourceSchemaVersion'){[int]$Snapshot.manifest.sourceSchemaVersion}else{$null}
        portfolioSha256=([string]$portfolioEntry.sha256).ToLowerInvariant(); attachments=$attachments
        createdAt=(Get-Date).ToUniversalTime().ToString('o')
    }
    Write-PmoJsonAtomic $restorePendingPath $pending
}

function Assert-RestorePendingCorrelation {
    param(
        [Parameter(Mandatory=$true)][string]$RestoreId,
        [Parameter(Mandatory=$true)][string]$SnapshotId
    )
    if ($RestoreId -notmatch '^[A-Za-z0-9_-]{1,100}$' -or $SnapshotId -notmatch '^[A-Za-z0-9_-]{1,100}$') {
        throw 'Identificadores invalidos ao validar restore-pending.'
    }
    $null = Assert-PmoPathWithoutReparse $restorePendingPath
    $pending = Read-PmoJson $restorePendingPath $null
    if (-not $pending -or [string]$pending.status -ne 'pending-browser-sync' -or
        [string]$pending.restoreId -ne $RestoreId -or [string]$pending.snapshotId -ne $SnapshotId) {
        throw 'Journal completed sem restore-pending correlacionado; recovery bloqueado.'
    }
    return $pending
}

function Complete-RestoreJournal {
    param([Parameter(Mandatory=$true)][string]$ExpectedRestoreId,[Parameter(Mandatory=$true)][string]$ExpectedSnapshotId)
    $journal = Read-PmoJson $restoreJournalPath $null
    if (-not $journal) { throw 'Journal de restauracao ausente.' }
    if ($ExpectedRestoreId -notmatch '^[A-Za-z0-9_-]{1,100}$' -or [string]$journal.restoreId -ne $ExpectedRestoreId) { throw 'restoreId do journal diverge da operacao ativa.' }
    if ([string]$journal.snapshotId -ne $ExpectedSnapshotId) { throw 'snapshotId do journal diverge da operacao ativa.' }
    $root = [System.IO.Path]::GetFullPath([string]$journal.root)
    $stage = [System.IO.Path]::GetFullPath([string]$journal.stage)
    $previous = [System.IO.Path]::GetFullPath([string]$journal.previous)
    $expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $recoveryRoot $ExpectedRestoreId))
    if (-not $root.Equals($expectedRoot,[StringComparison]::OrdinalIgnoreCase) -or
        -not $stage.Equals((Join-Path $expectedRoot 'stage'),[StringComparison]::OrdinalIgnoreCase) -or
        -not $previous.Equals((Join-Path $expectedRoot 'previous'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Journal de restauracao aponta para layout inesperado em recovery/.' }
    Assert-PmoManagedPath $recoveryRoot $root
    Assert-PmoManagedPath $recoveryRoot $stage
    Assert-PmoManagedPath $recoveryRoot $previous
    if (Test-PmoPathsOverlap $stage $previous) { throw 'Stage e previous do restore devem ser distintos.' }
    $snapshot = Get-Snapshot ([string]$journal.snapshotId)
    $components = @(
        [pscustomobject]@{ name='portfolio.json'; directory=$false },
        [pscustomobject]@{ name='attachments'; directory=$true },
        [pscustomobject]@{ name='user-templates'; directory=$true }
    )
    foreach ($component in $components) {
        $current = Join-Path $dataDir $component.name
        $staged = Join-Path $stage $component.name
        $backup = Join-Path $previous $component.name
        Assert-PmoManagedPath $dataDir $current
        Assert-PmoManagedPath $recoveryRoot $staged
        Assert-PmoManagedPath $recoveryRoot $backup
        $hasCurrent = Test-Path -LiteralPath $current
        $hasStaged = Test-Path -LiteralPath $staged
        $hasBackup = Test-Path -LiteralPath $backup
        if ($hasCurrent -and $hasStaged) {
            if ($hasBackup) { throw "Estado ambiguo ao restaurar $($component.name)." }
            Move-Item -LiteralPath $current -Destination $backup
            $hasCurrent = $false
        }
        if (-not $hasCurrent) {
            if (-not (Test-Path -LiteralPath $staged)) { throw "Staging ausente para $($component.name)." }
            Move-Item -LiteralPath $staged -Destination $current
        }
        $journal.phase = 'swapping'
        $journal.completedComponents = @($journal.completedComponents) + @($component.name)
        $journal.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        Write-PmoJsonAtomic $restoreJournalPath $journal
    }
    $errors = @(Test-RestoredData $snapshot)
    if ($errors.Count -gt 0) { throw ('Restauracao fisica divergiu: ' + ($errors -join '; ')) }
    Write-RestorePending $snapshot ([string]$journal.emergencySnapshotId) $ExpectedRestoreId
    $journal.phase = 'completed'
    $journal.completedAt = (Get-Date).ToUniversalTime().ToString('o')
    Write-PmoJsonAtomic $restoreJournalPath $journal
    return [pscustomobject]@{ restoreId=$ExpectedRestoreId; snapshotId=$snapshot.id; emergencySnapshotId=[string]$journal.emergencySnapshotId }
}

function Restore-SnapshotData {
    param($Snapshot,[Parameter(Mandatory=$true)][string]$RestoreId,[switch]$SkipEmergency,[switch]$EmergencyBestEffort)
    if ($RestoreId -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'restoreId ausente ou invalido.' }
    $existing = Read-PmoJson $restoreJournalPath $null
    if ($existing) {
        $same = ([string]$existing.restoreId -eq $RestoreId -and [string]$existing.snapshotId -eq [string]$Snapshot.id)
        if ([string]$existing.phase -ne 'completed' -and -not $same) { throw 'Existe journal incompleto de outra restauracao; recovery bloqueado.' }
        if ([string]$existing.phase -ne 'completed' -and $same) { return Complete-RestoreJournal $RestoreId ([string]$Snapshot.id) }
        if ([string]$existing.phase -eq 'completed' -and $same) {
            $null = Assert-RestorePendingCorrelation $RestoreId ([string]$Snapshot.id)
            $errors = @(Test-RestoredData $Snapshot)
            if ($errors.Count -gt 0) { throw ('Journal concluido correlacionado, mas os dados divergem: ' + ($errors -join '; ')) }
            return [pscustomobject]@{ restoreId=$RestoreId; snapshotId=[string]$Snapshot.id; emergencySnapshotId=[string]$existing.emergencySnapshotId }
        }
    }
    $pending = Read-PmoJson $restorePendingPath $null
    if ($pending -and ([string]$pending.restoreId -ne $RestoreId -or [string]$pending.snapshotId -ne [string]$Snapshot.id)) {
        throw 'Existe restore-pending de outra restauracao; sincronize o navegador antes de continuar.'
    }
    $emergency = $null
    if (-not $SkipEmergency) {
        try { $emergency = New-EmergencySnapshot 'pre-restore' }
        catch {
            if (-not $EmergencyBestEffort) { throw }
            Write-UpdateLog 'emergency-snapshot-skipped' $_.Exception.Message
        }
    }
    $null = New-RestoreJournal $Snapshot $emergency $RestoreId
    return Complete-RestoreJournal $RestoreId ([string]$Snapshot.id)
}

function Get-GitHubHeaders {
    return @{ 'User-Agent'='PMO-Tool-Updater'; 'Accept'='application/vnd.github+json'; 'X-GitHub-Api-Version'='2026-03-10' }
}

function Get-LatestRelease {
    if ([string]::IsNullOrWhiteSpace([string]$config.repository)) { throw 'Configure repository em config/install.json antes de atualizar.' }
    $repo = [string]$config.repository
    if ($repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'repository invalido em install.json.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = Invoke-RestMethod -UseBasicParsing -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers (Get-GitHubHeaders) -TimeoutSec 30
    if ($release.draft -or $release.prerelease) { throw 'GitHub retornou uma release nao estavel.' }
    if (-not (Tem-Propriedade $release 'immutable') -or -not [bool]$release.immutable) { throw 'A release precisa estar imutavel antes do update.' }
    return $release
}

function Find-RuntimeAsset {
    param($Release,[string]$Version)
    $expected = "pmo-tool-$Version-windows.zip"
    return @($Release.assets | Where-Object { [string]$_.name -ceq $expected }) | Select-Object -First 1
}

function Find-ManifestAsset {
    param($Release,[string]$Version)
    $expected = "pmo-tool-$Version-manifest.json"
    return @($Release.assets | Where-Object { [string]$_.name -ceq $expected }) | Select-Object -First 1
}

function Get-AssetExpectedHash {
    param($Asset)
    if (-not (Tem-Propriedade $Asset 'digest') -or [string]$Asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { throw 'O artefato da release nao possui digest SHA-256 informado pelo GitHub.' }
    return $Matches[1].ToLowerInvariant()
}

function Test-ReleaseDirectory {
    param([string]$RuntimeDir,[string]$ExpectedVersion)
    $manifest = Read-PmoJson (Join-Path $RuntimeDir 'release.json') $null
    if (-not $manifest) { throw 'release.json ausente ou invalido.' }
    if ([string]$manifest.version -ne $ExpectedVersion) { throw "Versao do manifesto diverge: $($manifest.version)" }
    if ([version][string]$manifest.minBootstrapVersion -gt $bootstrapVersion) { throw "Release exige bootstrap $($manifest.minBootstrapVersion); atualize-o manualmente." }
    if ([string]$manifest.channel -ne 'stable' -or [string]$manifest.platform -ne 'windows') { throw 'release.json nao pertence ao canal stable para Windows.' }
    if (-not (Tem-Propriedade $manifest 'minPowerShellVersion')) { throw 'release.json sem minPowerShellVersion.' }
    if ([version][string]$manifest.minPowerShellVersion -gt $PSVersionTable.PSVersion) { throw "Release exige PowerShell $($manifest.minPowerShellVersion)." }
    if (-not $manifest.schema -or -not (Tem-Propriedade $manifest.schema 'readMin') -or -not (Tem-Propriedade $manifest.schema 'readMax') -or -not (Tem-Propriedade $manifest.schema 'write')) { throw 'release.json sem contrato completo de schema.' }
    if ([int]$manifest.schema.readMin -lt 1 -or [int]$manifest.schema.readMax -lt [int]$manifest.schema.readMin -or [int]$manifest.schema.write -lt [int]$manifest.schema.readMin -or [int]$manifest.schema.write -gt [int]$manifest.schema.readMax) { throw 'Intervalo de schema invalido em release.json.' }
    $errors = @(Test-PmoInventory $RuntimeDir $manifest.files @('release.json'))
    if ($errors.Count -gt 0) { throw ('Runtime corrompido: ' + ($errors -join '; ')) }
    foreach ($required in @('serve.ps1','dist\pmo-tool.html','tools\portable-common.ps1','tools\update-runtime.ps1')) {
        if (-not (Test-Path -LiteralPath (Join-Path $RuntimeDir $required) -PathType Leaf)) { throw "Runtime sem $required" }
    }
    return $manifest
}

function Test-RuntimeEquivalent {
    param([string]$First,[string]$Second)
    $a = @(Get-PmoDirectoryInventory $First) | ConvertTo-Json -Depth 10 -Compress
    $b = @(Get-PmoDirectoryInventory $Second) | ConvertTo-Json -Depth 10 -Compress
    if ($a -cne $b) { throw 'A pasta versions/ existente diverge byte a byte do artefato baixado.' }
}

function Start-HiddenPowerShell {
    param([string]$Arguments)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = $Arguments
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    return [System.Diagnostics.Process]::Start($psi)
}

function Test-NewRuntimeHealth {
    param([string]$RuntimeDir,$Snapshot)
    $port = Get-Random -Minimum 19000 -Maximum 19999
    $testRoot = Join-Path $stagingRoot ('health-' + [Guid]::NewGuid().ToString('N'))
    $testData = Join-Path $testRoot 'data'
    $testConfig = Join-Path $testRoot 'config'
    $testState = Join-Path $testRoot 'state'
    Assert-PmoManagedPath $stagingRoot $testRoot
    New-Item -ItemType Directory -Path $testData,$testConfig,$testState,(Join-Path $testData 'attachments'),(Join-Path $testData 'user-templates') -Force | Out-Null
    Copy-PmoFileDurable (Join-Path $Snapshot.dir 'portfolio.json') (Join-Path $testData 'portfolio.json')
    Copy-PmoDirectoryDurable (Join-Path $Snapshot.dir 'attachments') (Join-Path $testData 'attachments')
    Copy-PmoDirectoryDurable (Join-Path $Snapshot.dir 'user-templates') (Join-Path $testData 'user-templates')
    $serve = Join-Path $RuntimeDir 'serve.ps1'
    $args = '-NoProfile -ExecutionPolicy Bypass -File "' + $serve + '" -Porta ' + $port + ' -DataDir "' + $testData + '" -ConfigDir "' + $testConfig + '" -StateDir "' + $testState + '" -AdminToken health-check -SemBuild -SemBrowser -HealthOnly'
    $process = Start-HiddenPowerShell $args
    try {
        $health = $null
        for ($i=0; $i -lt 60; $i++) {
            Start-Sleep -Milliseconds 250
            try { $health = Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:$port/api/health" -TimeoutSec 2; break } catch { if ($process.HasExited) { break } }
        }
        if (-not $health -or -not $health.ok -or -not $health.dataReadable -or -not $health.dataWritable -or [string]$health.appVersion -ne [string](Read-PmoJson (Join-Path $RuntimeDir 'release.json') $null).version) { throw 'Health check isolado da nova versao falhou.' }
        return $health
    } finally {
        if ($process -and -not $process.HasExited) { try { $process.Kill() } catch { } }
        if ($process) { $process.Dispose() }
        if (Test-Path -LiteralPath $testRoot) {
            try { Remove-PmoManagedTree $stagingRoot $testRoot }
            catch { Write-UpdateLog 'health-cleanup-refused' $_.Exception.Message }
        }
    }
}

function New-ActiveStateValue {
    param([string]$ActiveVersion,$PreviousVersion,[int]$ActiveSchema,$PreviousSchema,$RollbackSnapshotId,$PendingActivationId,$ActiveReleaseManifestSha256=$null,$PreviousReleaseManifestSha256=$null)
    $value = [ordered]@{
        formatVersion=1; bootstrapVersion=[string]$bootstrap.bootstrapVersion; bootstrapProtocolVersion=[int]$bootstrap.protocolVersion
        activeVersion=$ActiveVersion; previousVersion=$PreviousVersion
        activeSchemaVersion=$ActiveSchema; previousSchemaVersion=$PreviousSchema
        rollbackSnapshotId=$RollbackSnapshotId; activatedAt=(Get-Date).ToUniversalTime().ToString('o')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$PendingActivationId)) { $value.pendingActivationId = $PendingActivationId }
    if (-not [string]::IsNullOrWhiteSpace([string]$ActiveReleaseManifestSha256)) { $value.activeReleaseManifestSha256 = ([string]$ActiveReleaseManifestSha256).ToLowerInvariant() }
    if (-not [string]::IsNullOrWhiteSpace([string]$PreviousReleaseManifestSha256)) { $value.previousReleaseManifestSha256 = ([string]$PreviousReleaseManifestSha256).ToLowerInvariant() }
    return [pscustomobject]$value
}

function Write-ActiveState {
    param([string]$ActiveVersion,$PreviousVersion,[int]$ActiveSchema,$PreviousSchema,$RollbackSnapshotId,$PendingActivationId,$ActiveReleaseManifestSha256=$null,$PreviousReleaseManifestSha256=$null)
    $value = New-ActiveStateValue $ActiveVersion $PreviousVersion $ActiveSchema $PreviousSchema $RollbackSnapshotId $PendingActivationId $ActiveReleaseManifestSha256 $PreviousReleaseManifestSha256
    Write-PmoJsonAtomic $activePath $value
    return $value
}

function Test-AppReady {
    param($Ready,[string]$ActivationId,[string]$Version,[int]$Schema)
    if (-not $Ready) { return $false }
    foreach ($name in @('ok','activationId','appVersion','schemaVersion','activeVersion','diskConfirmed','indexedDbConfirmed','attachmentInventoryConfirmed','readOnly')) {
        if (-not (Tem-Propriedade $Ready $name)) { return $false }
    }
    return ([bool]$Ready.ok -and [string]$Ready.activationId -ceq $ActivationId -and
        [string]$Ready.appVersion -ceq $Version -and [string]$Ready.activeVersion -ceq $Version -and
        [int]$Ready.schemaVersion -eq $Schema -and [bool]$Ready.diskConfirmed -and
        [bool]$Ready.indexedDbConfirmed -and [bool]$Ready.attachmentInventoryConfirmed -and -not [bool]$Ready.readOnly)
}

function Start-PmoLauncher {
    param([string]$ActivationId)
    $launcher = Join-Path $InstallRoot 'pmo.ps1'
    $args = '-NoProfile -ExecutionPolicy Bypass -File "' + $launcher + '" -SemAtualizacao'
    if (-not [string]::IsNullOrWhiteSpace($ActivationId)) { $args += ' -ActivationId "' + $ActivationId + '"' }
    return Start-HiddenPowerShell $args
}

function Remove-RecordedWork {
    param($State)
    if ($State -and (Tem-Propriedade $State 'workDir') -and -not [string]::IsNullOrWhiteSpace([string]$State.workDir)) {
        $path = [System.IO.Path]::GetFullPath([string]$State.workDir)
        if (Test-Path -LiteralPath $path) { Remove-PmoManagedTree $stagingRoot $path }
    }
}

function Cleanup-AfterSuccess {
    param($Active)
    $keepVersions = 2
    if ($config.retention -and $config.retention.versions) { $keepVersions = [Math]::Max(2,[int]$config.retention.versions) }
    $protectedVersions = @(@([string]$Active.activeVersion,[string]$Active.previousVersion) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    $kept = 0
    foreach ($dir in @(Get-ChildItem -LiteralPath $versionsDir -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
        if ($protectedVersions -contains $dir.Name) { continue }
        if ($kept -lt ($keepVersions - $protectedVersions.Count)) { $kept++; continue }
        Remove-PmoManagedTree $versionsDir $dir.FullName
    }
    $keepSnapshots = 3
    if ($config.retention -and $config.retention.snapshots) { $keepSnapshots = [Math]::Max(3,[int]$config.retention.snapshots) }
    $protectedSnapshots = @()
    if ((Tem-Propriedade $Active 'rollbackSnapshotId') -and -not [string]::IsNullOrWhiteSpace([string]$Active.rollbackSnapshotId)) {
        $protectedSnapshots += [string]$Active.rollbackSnapshotId
    }
    $pending = Read-PmoJson $restorePendingPath $null
    if ($pending -and (Tem-Propriedade $pending 'snapshotId') -and -not [string]::IsNullOrWhiteSpace([string]$pending.snapshotId)) {
        $protectedSnapshots += [string]$pending.snapshotId
    }
    $protectedSnapshots = @($protectedSnapshots | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    $keptSnapshots = 0
    foreach ($dir in @(Get-ChildItem -LiteralPath $snapshotRoot -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
        if ($protectedSnapshots -contains $dir.Name) { continue }
        if ($keptSnapshots -lt ($keepSnapshots - $protectedSnapshots.Count)) { $keptSnapshots++; continue }
        $manifest = Read-PmoJson (Join-Path $dir.FullName 'manifest.json') $null
        if ($manifest -and $manifest.sealed) { Remove-PmoManagedTree $snapshotRoot $dir.FullName }
    }
}

function Get-RuntimeReleaseManifestSha256 {
    param([string]$Version)
    if ([string]$Version -eq 'development') { return $null }
    if ([string]$Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw "Versao de runtime invalida: $Version" }
    $runtimeDir = [System.IO.Path]::GetFullPath((Join-Path $versionsDir $Version))
    if (-not (Test-PmoSubPath $versionsDir $runtimeDir)) { throw 'Runtime calculado fora de versions/.' }
    $releasePath = Join-Path $runtimeDir 'release.json'
    if (-not (Test-Path -LiteralPath $releasePath -PathType Leaf)) { throw "Runtime $Version sem release.json." }
    return Get-PmoSha256 $releasePath
}

function Assert-RuntimeExists {
    param([string]$Version,$RequiredSchema=$null,$ExpectedManifestSha256=$null)
    if ([string]$Version -eq 'development') {
        if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot 'serve.ps1') -PathType Leaf)) { throw 'Runtime de desenvolvimento ausente.' }
        return
    }
    $dir = Join-Path $versionsDir $Version
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { throw "Versao instalada ausente: $Version" }
    $manifestSha = Get-RuntimeReleaseManifestSha256 $Version
    if (-not [string]::IsNullOrWhiteSpace([string]$ExpectedManifestSha256) -and
        $manifestSha -cne ([string]$ExpectedManifestSha256).ToLowerInvariant()) {
        throw "release.json do runtime $Version diverge do hash ancorado em active.json."
    }
    $runtimeManifest = Test-ReleaseDirectory $dir $Version
    if ($null -ne $RequiredSchema -and ([int]$RequiredSchema -lt [int]$runtimeManifest.schema.readMin -or [int]$RequiredSchema -gt [int]$runtimeManifest.schema.readMax)) {
        throw "A versao $Version nao pode ler o schema $RequiredSchema exigido pelo rollback."
    }
}

function Assert-SnapshotReadableByActiveRuntime {
    param($Snapshot,$Active)
    if (-not (Tem-Propriedade $Snapshot.manifest 'sourceSchemaVersion')) { throw 'Snapshot sem sourceSchemaVersion; restauracao manual recusada.' }
    [int]$sourceSchema = [int]$Snapshot.manifest.sourceSchemaVersion
    if ($sourceSchema -lt 1) { throw 'Snapshot declara sourceSchemaVersion invalido.' }
    if ([string]$Active.activeVersion -eq 'development') {
        # O checkout de desenvolvimento nao possui release.json. Seu contrato
        # conservador e o intervalo historico ate o schema que ele declara ativo.
        [int]$readMin = 1
        [int]$readMax = [int]$Active.activeSchemaVersion
    } else {
        if ([string]$Active.activeVersion -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'Versao ativa invalida ao validar snapshot.' }
        $runtimeDir = Join-Path $versionsDir ([string]$Active.activeVersion)
        $expectedManifestSha = if (Tem-Propriedade $Active 'activeReleaseManifestSha256') { [string]$Active.activeReleaseManifestSha256 } else { $null }
        Assert-RuntimeExists ([string]$Active.activeVersion) ([int]$Active.activeSchemaVersion) $expectedManifestSha
        $runtimeManifest = Test-ReleaseDirectory $runtimeDir ([string]$Active.activeVersion)
        [int]$readMin = [int]$runtimeManifest.schema.readMin
        [int]$readMax = [int]$runtimeManifest.schema.readMax
    }
    if ($sourceSchema -lt $readMin -or $sourceSchema -gt $readMax) {
        throw "Runtime ativo $($Active.activeVersion) nao pode ler o schema $sourceSchema do snapshot; intervalo suportado: $readMin..$readMax."
    }
}

function Get-PreparedSafetySnapshot {
    param([string]$ExpectedPhase,$Active,[string]$TargetSnapshotId=$null)
    if ([string]::IsNullOrWhiteSpace($PreparedSnapshot)) { throw 'A operacao exige um snapshot de seguranca preparado pelo navegador.' }
    $state = Read-PmoJson $updatePath $null
    $marker = Read-PmoJson $updateLockPath $null
    if (-not $state -or [string]$state.phase -ne $ExpectedPhase -or [string]$state.snapshotId -ne $PreparedSnapshot) { throw "Preflight nao corresponde a fase $ExpectedPhase." }
    if (-not $marker -or [string]$marker.snapshotId -ne $PreparedSnapshot) { throw 'Marcador do preflight ausente ou divergente.' }
    if ($TargetSnapshotId -and ((-not (Tem-Propriedade $state 'targetSnapshotId')) -or [string]$state.targetSnapshotId -ne $TargetSnapshotId)) { throw 'Snapshot alvo diverge do preflight confirmado no navegador.' }
    $safety = Get-Snapshot $PreparedSnapshot
    if ((Tem-Propriedade $safety.manifest 'sourceSchemaVersion') -and [int]$safety.manifest.sourceSchemaVersion -ne [int]$Active.activeSchemaVersion) { throw 'Snapshot de seguranca nao corresponde ao schema ativo.' }
    if ((Tem-Propriedade $safety.manifest 'sourceAppVersion') -and [string]$Active.activeVersion -ne 'development' -and [string]$safety.manifest.sourceAppVersion -ne [string]$Active.activeVersion) { throw 'Snapshot de seguranca nao corresponde a versao ativa.' }
    return $safety
}

function Invoke-RestoreOperation {
    param([string]$SnapshotId)
    $runtimeMutex = Enter-PmoMutex $InstallRoot 'runtime' 30000
    if (-not $runtimeMutex) { throw 'A aplicacao nao encerrou a tempo; a restauracao nao foi iniciada.' }
    try {
        $active = Read-PmoJson $activePath $null
        if (-not $active) { throw 'active.json ausente ou invalido.' }
        $safety = Get-PreparedSafetySnapshot 'restore-prepared' $active $SnapshotId
        $snapshot = Get-Snapshot $SnapshotId
        Assert-SnapshotReadableByActiveRuntime $snapshot $active
        $restoreId = New-RestoreOperationId
        $null = Set-UpdateState 'restoring' $null @{ restoreId=$restoreId; snapshotId=$SnapshotId; safetySnapshotId=$safety.id; restoreOperation='manual' }
        $result = Restore-SnapshotData $snapshot $restoreId -SkipEmergency
        $null = Set-UpdateState 'restored' $null @{ snapshotId=$SnapshotId; safetySnapshotId=$safety.id; emergencySnapshotId=$result.emergencySnapshotId }
        Remove-UpdateMarker
        Cleanup-AfterSuccess $active
        Write-Host "Snapshot restaurado em disco; o IndexedDB sera sincronizado na proxima abertura: $SnapshotId" -ForegroundColor Green
        return 0
    } finally { Exit-PmoMutex $runtimeMutex }
}

function Invoke-RollbackOperation {
    $runtimeMutex = Enter-PmoMutex $InstallRoot 'runtime' 30000
    if (-not $runtimeMutex) { throw 'A aplicacao nao encerrou a tempo; o rollback nao foi iniciado.' }
    try {
        $active = Read-PmoJson $activePath $null
        if (-not $active -or -not $active.previousVersion) { throw 'Nao ha versao anterior para rollback.' }
        $safety = Get-PreparedSafetySnapshot 'rollback-prepared' $active
        $expectedPreviousManifestSha = if (Tem-Propriedade $active 'previousReleaseManifestSha256') { [string]$active.previousReleaseManifestSha256 } else { $null }
        $expectedCurrentManifestSha = if (Tem-Propriedade $active 'activeReleaseManifestSha256') { [string]$active.activeReleaseManifestSha256 } else { $null }
        Assert-RuntimeExists ([string]$active.previousVersion) ([int]$active.previousSchemaVersion) $expectedPreviousManifestSha
        if ([string]$active.activeVersion -ne 'development') { Assert-RuntimeExists ([string]$active.activeVersion) ([int]$active.activeSchemaVersion) $expectedCurrentManifestSha }
        $targetManifestSha = Get-RuntimeReleaseManifestSha256 ([string]$active.previousVersion)
        $currentManifestSha = Get-RuntimeReleaseManifestSha256 ([string]$active.activeVersion)
        $targetActive = New-ActiveStateValue ([string]$active.previousVersion) ([string]$active.activeVersion) ([int]$active.previousSchemaVersion) ([int]$active.activeSchemaVersion) $safety.id $null $targetManifestSha $currentManifestSha
        if ([int]$active.activeSchemaVersion -ne [int]$active.previousSchemaVersion) {
            if (-not (Tem-Propriedade $active 'rollbackSnapshotId') -or [string]::IsNullOrWhiteSpace([string]$active.rollbackSnapshotId)) { throw 'Rollback entre schemas exige o snapshot vinculado a ativacao.' }
            $snapshot = Get-Snapshot ([string]$active.rollbackSnapshotId)
            if ([int]$snapshot.manifest.sourceSchemaVersion -ne [int]$active.previousSchemaVersion) { throw 'O snapshot vinculado nao corresponde ao schema da versao anterior.' }
            $restoreId = New-RestoreOperationId
            $null = Set-UpdateState 'restoring' $null @{ restoreId=$restoreId; snapshotId=$snapshot.id; safetySnapshotId=$safety.id; rollbackFrom=[string]$active.activeVersion; restoreOperation='rollback'; rollbackTargetActive=$targetActive }
            $null = Restore-SnapshotData $snapshot $restoreId -SkipEmergency
        } else {
            $null = Set-UpdateState 'rolling-back' $null @{ safetySnapshotId=$safety.id; rollbackFrom=[string]$active.activeVersion; rollbackTargetActive=$targetActive }
        }
        Write-PmoJsonAtomic $activePath $targetActive
        $null = Set-UpdateState 'rolled-back' $null @{ activeVersion=$targetActive.activeVersion; rollbackSnapshotId=$safety.id }
        Remove-UpdateMarker
        Cleanup-AfterSuccess $targetActive
        Write-Host "Rollback concluido para $($targetActive.activeVersion)." -ForegroundColor Green
        return 0
    } finally { Exit-PmoMutex $runtimeMutex }
}

function Finalize-RestoreRecovery {
    param($State,$RestoreResult)
    if (-not (Tem-Propriedade $State 'restoreId') -or [string]$State.restoreId -notmatch '^[A-Za-z0-9_-]{1,100}$' -or
        [string]$State.restoreId -ne [string]$RestoreResult.restoreId -or
        -not (Tem-Propriedade $State 'snapshotId') -or [string]$State.snapshotId -ne [string]$RestoreResult.snapshotId) {
        throw 'Resultado de restore diverge da transacao registrada; finalizacao bloqueada.'
    }
    if (-not $State -or -not $RestoreResult -or -not (Tem-Propriedade $State 'restoreId') -or -not (Tem-Propriedade $State 'snapshotId') -or
        [string]$State.restoreId -ne [string]$RestoreResult.restoreId -or [string]$State.snapshotId -ne [string]$RestoreResult.snapshotId) {
        throw 'Resultado de restore diverge do restoreId/snapshotId persistido; finalizacao recusada.'
    }
    $operation = if (Tem-Propriedade $State 'restoreOperation') { [string]$State.restoreOperation } else { 'manual' }
    if ($operation -eq 'rollback') {
        if (-not (Tem-Propriedade $State 'rollbackTargetActive')) { throw 'Recuperacao de rollback sem ponteiro alvo.' }
        Write-PmoJsonAtomic $activePath $State.rollbackTargetActive
        Remove-UpdateMarker
        $null = Set-UpdateState 'rolled-back-recovered' $null @{ activeVersion=[string]$State.rollbackTargetActive.activeVersion; snapshotId=$RestoreResult.snapshotId }
        Cleanup-AfterSuccess $State.rollbackTargetActive
        return 0
    }
    if ($operation -eq 'activation') {
        if (-not (Tem-Propriedade $State 'previousActive')) { throw 'Recuperacao de ativacao sem ponteiro anterior.' }
        Write-PmoJsonAtomic $activePath $State.previousActive
        Remove-UpdateMarker
        $null = Set-UpdateState 'activation-failed-recovered' 'Ativacao incompleta foi revertida.' @{ activeVersion=[string]$State.previousActive.activeVersion; snapshotId=$RestoreResult.snapshotId }
        Cleanup-AfterSuccess $State.previousActive
        return 0
    }
    Remove-UpdateMarker
    $null = Set-UpdateState 'restored-recovered' $null @{ snapshotId=$RestoreResult.snapshotId; emergencySnapshotId=$RestoreResult.emergencySnapshotId }
    $currentActive = Read-PmoJson $activePath $null
    if ($currentActive) { Cleanup-AfterSuccess $currentActive }
    return 0
}

function Complete-ActivationIfReady {
    param($State,[string]$TerminalPhase)
    $ready = Read-PmoJson $readyPath $null
    if (-not (Test-AppReady $ready ([string]$State.activationId) ([string]$State.targetVersion) ([int]$State.targetSchemaVersion))) { return $false }
    $active = Read-PmoJson $activePath $null
    if (-not $active -or [string]$active.activeVersion -ne [string]$State.targetVersion -or
        [int]$active.activeSchemaVersion -ne [int]$State.targetSchemaVersion) {
        throw 'app-ready valido ja foi selado, mas o ponteiro ativo diverge; restauracao automatica recusada.'
    }
    if (Tem-Propriedade $active 'pendingActivationId') {
        if ([string]$active.pendingActivationId -ne [string]$State.activationId) {
            throw 'app-ready valido pertence a outra activationId; restauracao automatica recusada.'
        }
        $active.PSObject.Properties.Remove('pendingActivationId')
    } elseif (-not (Tem-Propriedade $State 'pointerSwitched') -or -not [bool]$State.pointerSwitched) {
        # Ausencia do pending so e idempotentemente aceitavel se a troca do
        # ponteiro ja havia sido registrada antes da queda.
        throw 'active.json sem pendingActivationId e sem troca de ponteiro confirmada.'
    }
    Write-PmoJsonAtomic $activePath $active
    Remove-UpdateMarker
    $null = Set-UpdateState $TerminalPhase $null @{ activeVersion=[string]$State.targetVersion; activationId=$null; pointerSwitched=$true }
    Cleanup-AfterSuccess $active
    return $true
}

function Recover-InterruptedUpdateLocked {
    $state = Read-PmoJson $updatePath ([pscustomobject]@{ phase='idle' })
    $phase = [string]$state.phase
    $activeNow = Read-PmoJson $activePath $null
    if ($activeNow -and (Tem-Propriedade $activeNow 'pendingActivationId') -and
        $phase -ne 'activating' -and @('restoring','recovering') -notcontains $phase) {
        if (-not (Tem-Propriedade $state 'activationId') -or -not (Tem-Propriedade $state 'previousActive')) { throw 'Ponteiro de ativacao pendente sem journal recuperavel.' }
        $state = Set-UpdateState 'activating' 'Fase de ativacao reconstruida a partir de active.json.' @{ recoveredFrom=$phase }
        $phase = 'activating'
    }
    $restoreJournal = Read-PmoJson $restoreJournalPath $null
    if ($restoreJournal -and [string]$restoreJournal.phase -ne 'completed' -and @('restoring','recovering') -notcontains $phase) {
        throw 'Journal de restauracao incompleto sem fase de restore correlacionavel.'
    }
    if (@('restoring','recovering') -contains $phase) {
        if (-not (Tem-Propriedade $state 'snapshotId')) { throw 'Restauracao ativa sem snapshotId.' }
        $stateSnapshotId = [string]$state.snapshotId
        $hasStateRestoreId = Tem-Propriedade $state 'restoreId'
        $stateRestoreId = if ($hasStateRestoreId) { [string]$state.restoreId } else { '' }
        if ($hasStateRestoreId -and $stateRestoreId -notmatch '^[A-Za-z0-9_-]{1,100}$') {
            throw 'restoreId presente no update journal e invalido; recovery bloqueado.'
        }
        $journalCorrelated = $false
        if ($restoreJournal) {
            $sameSnapshot = ([string]$restoreJournal.snapshotId -eq $stateSnapshotId)
            if ($hasStateRestoreId) {
                $journalCorrelated = ([string]$restoreJournal.restoreId -eq $stateRestoreId -and $sameSnapshot)
            } elseif ([string]$restoreJournal.phase -ne 'completed' -and $sameSnapshot -and [string]$restoreJournal.restoreId -match '^[A-Za-z0-9_-]{1,100}$') {
                # Compatibilidade com journal legado: somente um journal ainda
                # incompleto e do mesmo snapshot pode fornecer o ID ausente.
                $stateRestoreId = [string]$restoreJournal.restoreId
                $journalCorrelated = $true
            }
            if (-not $journalCorrelated -and [string]$restoreJournal.phase -ne 'completed') {
                throw 'Journal incompleto pertence a outra restauracao; recovery bloqueado.'
            }
        }
        if ([string]::IsNullOrWhiteSpace($stateRestoreId)) { $stateRestoreId = New-RestoreOperationId }
        $operation = if (Tem-Propriedade $state 'restoreOperation') { [string]$state.restoreOperation } else { 'manual' }
        $snapshot = Get-Snapshot $stateSnapshotId
        $null = Set-UpdateState 'recovering' $null @{ recoveryFrom=$phase; restoreId=$stateRestoreId; snapshotId=$stateSnapshotId }
        if ($journalCorrelated -and [string]$restoreJournal.phase -eq 'completed') {
            $null = Assert-RestorePendingCorrelation $stateRestoreId $stateSnapshotId
            $errors = @(Test-RestoredData $snapshot)
            if ($errors.Count -gt 0) { throw ('Journal correlacionado concluido diverge dos dados: ' + ($errors -join '; ')) }
            $result = [pscustomobject]@{ restoreId=$stateRestoreId; snapshotId=$stateSnapshotId; emergencySnapshotId=[string]$restoreJournal.emergencySnapshotId }
        } elseif ($journalCorrelated) {
            $result = Complete-RestoreJournal $stateRestoreId $stateSnapshotId
        } else {
            # Nenhum journal correlacionado: cobre a queda depois de persistir
            # restoring/restoreId e antes de New-RestoreJournal. Um journal
            # completed alheio e deliberadamente ignorado.
            $result = if (@('manual','rollback') -contains $operation) { Restore-SnapshotData $snapshot $stateRestoreId -SkipEmergency } else { Restore-SnapshotData $snapshot $stateRestoreId -EmergencyBestEffort }
        }
        $state = Read-PmoJson $updatePath $state
        return Finalize-RestoreRecovery $state $result
    }
    if (@('prepared','rollback-prepared','restore-prepared','downloading','verified','installed') -contains $phase) {
        Remove-RecordedWork $state
        Remove-UpdateMarker
        $null = Set-UpdateState 'cancelled-recovered' $null @{ recoveredFrom=$phase }
        return 0
    }
    if ($phase -eq 'rolling-back') {
        if (-not (Tem-Propriedade $state 'rollbackTargetActive')) { throw 'Journal de rollback incompleto.' }
        $active = Read-PmoJson $activePath $null
        if ($active -and [string]$active.activeVersion -eq [string]$state.rollbackTargetActive.activeVersion) {
            Remove-UpdateMarker
            $null = Set-UpdateState 'rolled-back-recovered' $null @{ activeVersion=[string]$active.activeVersion }
        } else {
            Remove-UpdateMarker
            $null = Set-UpdateState 'cancelled-recovered' $null @{ recoveredFrom='rolling-back' }
        }
        return 0
    }
    if ($phase -ne 'activating') { return 0 }
    if (-not (Tem-Propriedade $state 'activationId') -or -not (Tem-Propriedade $state 'targetVersion') -or -not (Tem-Propriedade $state 'previousActive')) { throw 'Journal de ativacao incompleto.' }
    $targetSchema = [int]$state.targetSchemaVersion
    if (Complete-ActivationIfReady $state 'committed-recovered') { return 0 }
    $current = Read-PmoJson $activePath $null
    $switched = ($current -and [string]$current.activeVersion -eq [string]$state.targetVersion)
    if ($switched -and [int]$state.targetSchemaVersion -ne [int]$state.previousActive.activeSchemaVersion) {
        $snapshot = Get-Snapshot ([string]$state.snapshotId)
        $restoreId = New-RestoreOperationId
        $null = Set-UpdateState 'restoring' $null @{ restoreId=$restoreId; snapshotId=[string]$snapshot.id; recoveryFrom='activating'; restoreOperation='activation'; previousActive=$state.previousActive }
        Write-PmoJsonAtomic $activePath $state.previousActive
        $null = Restore-SnapshotData $snapshot $restoreId -EmergencyBestEffort
    } else {
        Write-PmoJsonAtomic $activePath $state.previousActive
    }
    Remove-RecordedWork $state
    Remove-UpdateMarker
    $null = Set-UpdateState 'activation-failed-recovered' 'Ativacao incompleta foi revertida.' @{ activeVersion=[string]$state.previousActive.activeVersion }
    return 0
}

function Recover-InterruptedUpdate {
    $runtimeMutex = Enter-PmoMutex $InstallRoot 'runtime' 0
    if (-not $runtimeMutex) { throw 'Runtime em uso; recovery nao iniciou nenhuma mutacao.' }
    try { return Recover-InterruptedUpdateLocked }
    finally { Exit-PmoMutex $runtimeMutex }
}

function Invoke-UpdateOperation {
    $active = Read-PmoJson $activePath $null
    if (-not $active) { throw 'active.json ausente ou invalido.' }
    $release = Get-LatestRelease
    if ([string]$release.tag_name -notmatch '^v(?<version>(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$') { throw 'Tag da release nao segue vX.Y.Z.' }
    $versionText = $Matches['version']
    try {
        $latestVersion = [version]$versionText
        $currentVersion = if ([string]$active.activeVersion -eq 'development') { [version]'1.4.1' } else { [version][string]$active.activeVersion }
    } catch { throw 'Tag da release nao segue SemVer.' }
    if ($latestVersion -le $currentVersion) { Write-Host 'Nenhuma atualizacao estavel disponivel.' -ForegroundColor Green; return 0 }
    if ([string]::IsNullOrWhiteSpace($PreparedSnapshot)) { throw 'Update exige preflight e snapshot preparado pela versao atual.' }
    $preparedState = Read-PmoJson $updatePath $null
    $preparedMarker = Read-PmoJson $updateLockPath $null
    if (-not $preparedState -or [string]$preparedState.phase -ne 'prepared' -or [string]$preparedState.snapshotId -ne $PreparedSnapshot) { throw 'Estado de preflight nao corresponde ao snapshot solicitado.' }
    if (-not $preparedMarker -or [string]$preparedMarker.snapshotId -ne $PreparedSnapshot) { throw 'Marcador de preflight ausente ou divergente.' }
    if ((Tem-Propriedade $preparedState 'currentVersion') -and [string]$preparedState.currentVersion -ne [string]$active.activeVersion) { throw 'A versao ativa mudou depois do preflight.' }
    $snapshot = Get-Snapshot $PreparedSnapshot
    $asset = Find-RuntimeAsset $release $versionText
    if (-not $asset) { throw "Release $versionText sem o artefato pmo-tool-$versionText-windows.zip." }
    $manifestAsset = Find-ManifestAsset $release $versionText
    if (-not $manifestAsset) { throw "Release $versionText sem o manifesto externo esperado." }
    Assert-ReleaseAssetBounds $asset $manifestAsset
    Assert-UpdateCapacity $asset $manifestAsset $snapshot
    $expectedSha = Get-AssetExpectedHash $asset
    $expectedExternalManifestSha = Get-AssetExpectedHash $manifestAsset
    $work = Join-Path $stagingRoot ('update-' + $versionText + '-' + [Guid]::NewGuid().ToString('N'))
    $script:workDir = $work
    $extract = Join-Path $work 'extracted'
    Assert-PmoManagedPath $stagingRoot $work
    Assert-PmoManagedPath $stagingRoot $extract
    New-Item -ItemType Directory -Path $extract -Force | Out-Null
    $zip = Join-Path $work ([string]$asset.name)
    $externalManifestPath = Join-Path $work ([string]$manifestAsset.name)
    $null = Set-UpdateState 'downloading' $null @{ snapshotId=$PreparedSnapshot; targetVersion=$versionText; workDir=$work; previousActive=$active }
    Invoke-WebRequest -UseBasicParsing -Uri ([string]$manifestAsset.browser_download_url) -OutFile $externalManifestPath -TimeoutSec 60
    if ((Get-Item -LiteralPath $externalManifestPath).Length -ne [Int64]$manifestAsset.size) { throw 'Tamanho do manifesto externo diverge do metadado informado pelo GitHub.' }
    if ((Get-PmoSha256 $externalManifestPath) -cne $expectedExternalManifestSha) { throw 'SHA-256 do manifesto externo diverge do digest informado pelo GitHub.' }
    $externalManifest = Read-PmoJson $externalManifestPath $null
    if (-not $externalManifest -or [string]$externalManifest.version -ne $versionText -or [string]$externalManifest.channel -ne 'stable') { throw 'Manifesto externo invalido para a release solicitada.' }
    if (-not $externalManifest.artifact -or [string]$externalManifest.artifact.name -cne [string]$asset.name -or ([string]$externalManifest.artifact.sha256).ToLowerInvariant() -cne $expectedSha -or [Int64]$externalManifest.artifact.size -ne [Int64]$asset.size) { throw 'Manifesto externo diverge dos metadados do artefato no GitHub.' }
    Invoke-WebRequest -UseBasicParsing -Uri ([string]$asset.browser_download_url) -OutFile $zip -TimeoutSec 300
    if ((Get-PmoSha256 $zip) -cne $expectedSha) { throw 'SHA-256 do ZIP diverge do digest informado pelo GitHub.' }
    if ((Get-Item -LiteralPath $zip).Length -ne [Int64]$asset.size) { throw 'Tamanho do ZIP diverge do metadado informado pelo GitHub.' }
    $null = Test-PmoArchiveCompression $zip
    $archiveCheck = Test-PmoArchive $zip
    if (-not $archiveCheck.ok) { throw ('ZIP rejeitado: ' + ($archiveCheck.errors -join '; ')) }
    $null = Set-UpdateState 'verified' $null @{ targetVersion=$versionText; assetSha256=$expectedSha; externalManifestSha256=$expectedExternalManifestSha }
    Expand-PmoArchiveSafe $zip $extract
    $manifest = Test-ReleaseDirectory $extract $versionText
    if (-not $externalManifest.runtimeManifest -or ([string]$externalManifest.runtimeManifest.sha256).ToLowerInvariant() -cne (Get-PmoSha256 (Join-Path $extract 'release.json'))) { throw 'release.json interno diverge do manifesto externo.' }
    $sourceSchema = if (Tem-Propriedade $snapshot.manifest 'sourceSchemaVersion') { [int]$snapshot.manifest.sourceSchemaVersion } else { [int]$active.activeSchemaVersion }
    if ($sourceSchema -lt [int]$manifest.schema.readMin -or $sourceSchema -gt [int]$manifest.schema.readMax) { throw "A nova versao nao pode ler o schema $sourceSchema do snapshot preparado." }
    $target = Join-Path $versionsDir $versionText
    Assert-PmoManagedPath $stagingRoot $extract
    Assert-PmoManagedPath $versionsDir $target
    if (Test-Path -LiteralPath $target) {
        $null = Test-ReleaseDirectory $target $versionText
        Test-RuntimeEquivalent $extract $target
    } else {
        Move-Item -LiteralPath $extract -Destination $target
    }
    $null = Set-UpdateState 'installed' $null @{ targetVersion=$versionText; targetSchemaVersion=[int]$manifest.schema.write; assetSha256=$expectedSha }
    $null = Test-NewRuntimeHealth $target $snapshot

    $runtimeMutex = Enter-PmoMutex $InstallRoot 'runtime' 30000
    if (-not $runtimeMutex) { throw 'A instancia anterior nao encerrou dentro do prazo; o ponteiro nao foi alterado.' }
    $activationId = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $targetSchema = [int]$manifest.schema.write
    $targetManifestSha = Get-RuntimeReleaseManifestSha256 $versionText
    $currentManifestSha = Get-RuntimeReleaseManifestSha256 ([string]$active.activeVersion)
    if ((Tem-Propriedade $active 'activeReleaseManifestSha256') -and
        -not [string]::IsNullOrWhiteSpace([string]$active.activeReleaseManifestSha256) -and
        $currentManifestSha -cne ([string]$active.activeReleaseManifestSha256).ToLowerInvariant()) {
        Exit-PmoMutex $runtimeMutex
        $runtimeMutex = $null
        throw 'release.json do runtime ativo diverge do hash ancorado; ativacao recusada.'
    }
    try {
        $null = Assert-PmoPathWithoutReparse $stateDir
        $null = Assert-PmoPathWithoutReparse $readyPath
        if (Test-Path -LiteralPath $readyPath) { Remove-Item -LiteralPath $readyPath -Force }
        $null = Set-UpdateState 'activating' $null @{
            targetVersion=$versionText; targetSchemaVersion=$targetSchema; snapshotId=$PreparedSnapshot
            activationId=$activationId; previousActive=$active; pointerSwitched=$false
        }
        $newActive = Write-ActiveState $versionText ([string]$active.activeVersion) $targetSchema ([int]$active.activeSchemaVersion) $PreparedSnapshot $activationId $targetManifestSha $currentManifestSha
        $null = Set-UpdateState 'activating' $null @{ pointerSwitched=$true }
    } finally { Exit-PmoMutex $runtimeMutex }

    $launcherProcess = Start-PmoLauncher $activationId
    $ready = $null
    for ($i=0; $i -lt 360; $i++) {
        Start-Sleep -Milliseconds 250
        $candidate = Read-PmoJson $readyPath $null
        if (Test-AppReady $candidate $activationId $versionText $targetSchema) { $ready=$candidate; break }
        if ($launcherProcess.HasExited) { break }
    }
    if (-not $ready) {
        if ($launcherProcess -and -not $launcherProcess.HasExited) { try { $launcherProcess.Kill(); $launcherProcess.WaitForExit(10000) | Out-Null } catch { } }
        if ($launcherProcess) { $launcherProcess.Dispose() }
        $compensationMutex = Enter-PmoMutex $InstallRoot 'runtime' 30000
        if (-not $compensationMutex) { throw 'Nova versao nao confirmou app-ready e ainda mantem o runtime aberto; recuperacao sera tentada na proxima inicializacao.' }
        try {
            $lateState = Read-PmoJson $updatePath $null
            if ($lateState -and (Complete-ActivationIfReady $lateState 'committed')) {
                Write-Host "PMO Tool atualizado para $versionText; app-ready foi confirmado no ultimo intervalo." -ForegroundColor Green
                return 0
            }
            if ($targetSchema -ne [int]$active.activeSchemaVersion) {
                $restoreId = New-RestoreOperationId
                $null = Set-UpdateState 'restoring' $null @{ restoreId=$restoreId; snapshotId=[string]$snapshot.id; recoveryFrom='activation-timeout'; restoreOperation='activation'; previousActive=$active }
                Write-PmoJsonAtomic $activePath $active
                $null = Restore-SnapshotData $snapshot $restoreId -EmergencyBestEffort
            } else {
                Write-PmoJsonAtomic $activePath $active
            }
            Remove-UpdateMarker
            $null = Set-UpdateState 'activation-failed' 'Nova versao nao confirmou app-ready; ponteiro e dados foram revertidos.' @{ activeVersion=[string]$active.activeVersion }
        } finally { Exit-PmoMutex $compensationMutex }
        $null = Start-PmoLauncher $null
        throw 'Nova versao nao confirmou app-ready; ativacao revertida.'
    }
    if ($launcherProcess) { $launcherProcess.Dispose() }
    $finalActive = Read-PmoJson $activePath $newActive
    if (Tem-Propriedade $finalActive 'pendingActivationId') { $finalActive.PSObject.Properties.Remove('pendingActivationId') }
    Write-PmoJsonAtomic $activePath $finalActive
    Remove-UpdateMarker
    $null = Set-UpdateState 'committed' $null @{ activeVersion=$versionText; snapshotId=$PreparedSnapshot; activationId=$null; pointerSwitched=$true }
    Cleanup-AfterSuccess $finalActive
    Write-Host "PMO Tool atualizado para $versionText." -ForegroundColor Green
    return 0
}

function Invoke-UpdaterMain {
    if ($CheckOnly) {
        $active = Read-PmoJson $activePath $null
        if (-not $active) { throw 'active.json ausente ou invalido.' }
        $release = Get-LatestRelease
        if ([string]$release.tag_name -notmatch '^v(?<version>(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$') { throw 'Tag da release nao segue vX.Y.Z.' }
        $latest = $Matches['version']
        try {
            $latestVersion = [version]$latest
            $currentVersion = if ([string]$active.activeVersion -eq 'development') { [version]'1.4.1' } else { [version][string]$active.activeVersion }
        } catch { throw 'Versao ativa ou tag nao segue SemVer.' }
        [ordered]@{ current=[string]$active.activeVersion; latest=$latest; updateAvailable=($latestVersion -gt $currentVersion); releaseUrl=[string]$release.html_url } | ConvertTo-Json
        return 0
    }
    if ($Recover) { return Recover-InterruptedUpdate }
    if (-not [string]::IsNullOrWhiteSpace($RestoreSnapshot)) { return Invoke-RestoreOperation $RestoreSnapshot }
    if ($Rollback) { return Invoke-RollbackOperation }
    return Invoke-UpdateOperation
}

$exitCode = 1
try {
    if (-not $CheckOnly) {
        $script:updateMutex = Enter-PmoMutex $InstallRoot 'update' 0 -NoFile:$Recover
        if (-not $script:updateMutex) { throw 'Outra operacao de update, rollback ou restauracao ja esta em execucao.' }
    }
    $exitCode = [int](Invoke-UpdaterMain)
} catch {
    $message = $_.Exception.Message
    if (-not $CheckOnly -and -not $Recover -and $script:updateMutex) {
        try {
            $currentState = Read-PmoJson $updatePath $null
            $currentPhase = if ($currentState) { [string]$currentState.phase } else { 'idle' }
            if (@('activating','restoring','recovering','rolling-back') -contains $currentPhase) {
                # Nunca esconda uma transacao parcialmente mutante sob o estado
                # generico failed: o launcher precisa reencontrar a fase e
                # concluir a compensacao idempotente na proxima abertura.
                $null = Set-UpdateState $currentPhase $message @{ recoveryRequired=$true }
            } elseif ($currentPhase -notin @('activation-failed','rolled-back','restored','committed')) {
                $null = Set-UpdateState 'failed' $message @{ recoveryRequired=$false }
                Remove-UpdateMarker
            }
        } catch { }
    }
    Write-Error $message
    $exitCode = 1
} finally {
    if ($script:workDir -and (Test-Path -LiteralPath $script:workDir)) {
        try { Remove-PmoManagedTree $stagingRoot $script:workDir }
        catch { Write-UpdateLog 'work-cleanup-refused' $_.Exception.Message }
    }
    Exit-PmoMutex $script:updateMutex
}
exit $exitCode
