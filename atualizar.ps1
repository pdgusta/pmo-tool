<# Bootstrap estavel: delega a operacao ao updater versionado do runtime ativo. #>
[CmdletBinding()]
param(
    [string]$InstallRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path),
    [string]$PreparedSnapshot,
    [switch]$Rollback,
    [string]$RestoreSnapshot,
    [switch]$CheckOnly,
    [switch]$Recover
)
$ErrorActionPreference = 'Stop'
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$common = Join-Path $InstallRoot 'tools\portable-common.ps1'
if (-not (Test-Path -LiteralPath $common)) { throw "Componente ausente: $common" }
. $common
$null = Assert-PmoPathWithoutReparse $InstallRoot
$null = Assert-PmoPathWithoutReparse $common

function Read-PmoJsonStrictReadOnly {
    param([Parameter(Mandatory=$true)][string]$Path,$Default=$null)
    $null = Assert-PmoPathWithoutReparse $Path
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Default }
    $raw = [System.IO.File]::ReadAllText($Path,[System.Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    return ($raw | ConvertFrom-Json)
}

$activePath = Join-Path $InstallRoot 'state\active.json'
$active = if ($Recover) { Read-PmoJsonStrictReadOnly $activePath $null } else { Read-PmoJson $activePath $null }
$versionsDir = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot 'versions'))
$rootUpdater = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot 'tools\update-runtime.ps1'))

function Resolve-VersionedUpdater([string]$Version) {
    if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { return $null }
    $path = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $versionsDir $Version) 'tools\update-runtime.ps1'))
    if (-not (Test-PmoSubPath $versionsDir $path)) { throw 'Candidato de updater escapou de versions/.' }
    return $path
}

function Resolve-JournalUpdater($Journal) {
    if (-not $Journal -or -not ($Journal.PSObject.Properties.Name -contains 'updaterRuntimeVersion')) { return $null }
    $creator = [string]$Journal.updaterRuntimeVersion
    if ($creator -eq 'root') {
        $expectedRelative = 'tools/update-runtime.ps1'
        $path = $rootUpdater
    } else {
        $path = Resolve-VersionedUpdater $creator
        if (-not $path) { throw "Journal declara versao de updater invalida: $creator" }
        $expectedRelative = 'versions/' + $creator + '/tools/update-runtime.ps1'
    }
    if ($Journal.PSObject.Properties.Name -contains 'updaterRelativePath') {
        $declared = ([string]$Journal.updaterRelativePath).Replace('\','/')
        if ($declared -cne $expectedRelative) { throw 'Journal declara caminho de updater divergente do runtime criador.' }
    }
    return $path
}

function Test-RestoreJournalRelevant($UpdateJournal,$RestoreJournal) {
    if (-not $RestoreJournal) { return $false }
    $restorePhase = [string]$RestoreJournal.phase
    if (-not $UpdateJournal -or @('restoring','recovering') -notcontains [string]$UpdateJournal.phase) {
        if ($restorePhase -ne 'completed') { throw 'Journal de restore incompleto sem fase ativa correlacionavel.' }
        return $false
    }
    $sameSnapshot = (($UpdateJournal.PSObject.Properties.Name -contains 'snapshotId') -and
        [string]$UpdateJournal.snapshotId -eq [string]$RestoreJournal.snapshotId)
    $hasRestoreId = $UpdateJournal.PSObject.Properties.Name -contains 'restoreId'
    if ($hasRestoreId) {
        if ([string]$UpdateJournal.restoreId -notmatch '^[A-Za-z0-9_-]{1,100}$') {
            throw 'restoreId presente no update journal e invalido.'
        }
        if ([string]$UpdateJournal.restoreId -eq [string]$RestoreJournal.restoreId -and $sameSnapshot) { return $true }
        if ($restorePhase -ne 'completed') { throw 'Journal de restore incompleto pertence a outra operacao.' }
        return $false
    }
    # Legado fail-closed: somente journal ainda incompleto e do mesmo snapshot
    # participa da escolha. Um completed sem restoreId no update e ambiguo/stale.
    if ($restorePhase -ne 'completed' -and $sameSnapshot) { return $true }
    if ($restorePhase -ne 'completed') { throw 'Journal legado incompleto diverge do snapshot ativo.' }
    return $false
}

function Test-UpdaterCandidate([string]$Path,[string]$Version=$null,[string]$ExpectedManifestSha256=$null) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($Path,[ref]$tokens,[ref]$errors)
    if ($errors.Count -gt 0) { return $false }
    if (-not [string]::IsNullOrWhiteSpace($Version)) {
        $runtimeDir = Split-Path -Parent (Split-Path -Parent $Path)
        $releasePath = Join-Path $runtimeDir 'release.json'
        $manifest = if ($Recover) { Read-PmoJsonStrictReadOnly $releasePath $null } else { Read-PmoJson $releasePath $null }
        if (-not $manifest -or [string]$manifest.version -ne $Version -or -not ($manifest.PSObject.Properties.Name -contains 'files')) { return $false }
        $manifestSha = Get-PmoSha256 (Join-Path $runtimeDir 'release.json')
        if (-not [string]::IsNullOrWhiteSpace($ExpectedManifestSha256)) {
            if ($ExpectedManifestSha256 -notmatch '^[a-fA-F0-9]{64}$' -or $manifestSha -cne $ExpectedManifestSha256.ToLowerInvariant()) { return $false }
        }
        $inventoryErrors = @(Test-PmoInventory $runtimeDir $manifest.files @('release.json'))
        if ($inventoryErrors.Count -gt 0) { return $false }
    }
    return $true
}

$candidateRecords = @()
if ($Recover) {
    $updateJournal = Read-PmoJsonStrictReadOnly (Join-Path $InstallRoot 'state\update.json') $null
    $restoreJournal = Read-PmoJsonStrictReadOnly (Join-Path $InstallRoot 'state\restore.json') $null
    $creatorFromUpdate = Resolve-JournalUpdater $updateJournal
    $restoreRelevant = Test-RestoreJournalRelevant $updateJournal $restoreJournal
    $creatorFromRestore = if ($restoreRelevant) { Resolve-JournalUpdater $restoreJournal } else { $null }
    if ($creatorFromUpdate -and $creatorFromRestore -and -not $creatorFromUpdate.Equals($creatorFromRestore,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Journals de update e restore divergem sobre o updater criador.'
    }
    $updateCreatorSha = if ($updateJournal -and ($updateJournal.PSObject.Properties.Name -contains 'updaterReleaseManifestSha256')) { [string]$updateJournal.updaterReleaseManifestSha256 } else { $null }
    $restoreCreatorSha = if ($restoreRelevant -and $restoreJournal -and ($restoreJournal.PSObject.Properties.Name -contains 'updaterReleaseManifestSha256')) { [string]$restoreJournal.updaterReleaseManifestSha256 } else { $null }
    if ($updateCreatorSha -and $restoreCreatorSha -and $updateCreatorSha -cne $restoreCreatorSha) { throw 'Journals divergem sobre o hash do manifesto do updater criador.' }
    $creator = if ($creatorFromRestore) { $creatorFromRestore } else { $creatorFromUpdate }
    if ($creator) {
        $creatorVersion = if (($restoreJournal -and $creatorFromRestore)) { [string]$restoreJournal.updaterRuntimeVersion } else { [string]$updateJournal.updaterRuntimeVersion }
        $creatorSha = if ($restoreCreatorSha) { $restoreCreatorSha } else { $updateCreatorSha }
        $candidateRecords += [pscustomobject]@{ path=$creator; version=if($creatorVersion -eq 'root'){$null}else{$creatorVersion}; manifestSha=$creatorSha }
    }
    $candidateRecords += [pscustomobject]@{ path=$rootUpdater; version=$null; manifestSha=$null }
    if ($active -and $active.previousVersion -and [string]$active.previousVersion -ne 'development') {
        $previousUpdater = Resolve-VersionedUpdater ([string]$active.previousVersion)
        $previousSha = if ($active.PSObject.Properties.Name -contains 'previousReleaseManifestSha256') { [string]$active.previousReleaseManifestSha256 } else { $null }
        if ($previousUpdater) { $candidateRecords += [pscustomobject]@{ path=$previousUpdater; version=[string]$active.previousVersion; manifestSha=$previousSha } }
    }
} else {
    $normalVersions = @(
        [pscustomobject]@{version=[string]$active.activeVersion; manifestSha=if($active.PSObject.Properties.Name -contains 'activeReleaseManifestSha256'){[string]$active.activeReleaseManifestSha256}else{$null}},
        [pscustomobject]@{version=[string]$active.previousVersion; manifestSha=if($active.PSObject.Properties.Name -contains 'previousReleaseManifestSha256'){[string]$active.previousReleaseManifestSha256}else{$null}}
    )
    foreach ($record in $normalVersions) {
        $version = [string]$record.version
        if ([string]::IsNullOrWhiteSpace($version) -or $version -eq 'development') { continue }
        $versionedUpdater = Resolve-VersionedUpdater $version
        if ($versionedUpdater) { $candidateRecords += [pscustomobject]@{ path=$versionedUpdater; version=$version; manifestSha=[string]$record.manifestSha } }
    }
    $candidateRecords += [pscustomobject]@{ path=$rootUpdater; version=$null; manifestSha=$null }
}
$runtimeUpdater = $null
foreach ($candidate in @($candidateRecords)) {
    if ($runtimeUpdater) { break }
    if (Test-UpdaterCandidate ([string]$candidate.path) ([string]$candidate.version) ([string]$candidate.manifestSha)) { $runtimeUpdater = [string]$candidate.path }
}
if (-not $runtimeUpdater) { throw 'Nenhum updater versionado valido foi encontrado.' }
$invoke = @{ InstallRoot=$InstallRoot; Rollback=$Rollback; CheckOnly=$CheckOnly; Recover=$Recover }
if (-not [string]::IsNullOrWhiteSpace($PreparedSnapshot)) { $invoke.PreparedSnapshot = $PreparedSnapshot }
if (-not [string]::IsNullOrWhiteSpace($RestoreSnapshot)) { $invoke.RestoreSnapshot = $RestoreSnapshot }
& $runtimeUpdater @invoke
exit $LASTEXITCODE
