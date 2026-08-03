<# Cria a instalacao inicial portatil. Dados atuais so sao copiados com -IncludeCurrentData. #>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Destination,
    [string]$Version = '1.4.1',
    [string]$Repository = '',
    [switch]$IncludeCurrentData,
    [string]$BuildTimestamp = '2026-08-02T00:00:00Z',
    [string]$Commit = 'local'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceRoot = Split-Path -Parent $scriptDir
$common = Join-Path $scriptDir 'portable-common.ps1'
. $common

$sourceRootFull = Get-PmoNormalizedFullPath $sourceRoot
$destinationFull = Get-PmoNormalizedFullPath $Destination
$destinationRoot = [System.IO.Path]::GetPathRoot($destinationFull)
if ($destinationFull.Equals((Get-PmoNormalizedFullPath $destinationRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'O destino deve ser uma pasta, nao a raiz de uma unidade.'
}
if ($destinationFull.Equals($sourceRootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
    (Test-PmoSubPath $sourceRootFull $destinationFull)) {
    throw 'O destino nao pode ficar dentro da raiz fonte.'
}

$destinationParent = [System.IO.Path]::GetDirectoryName($destinationFull)
if ([string]::IsNullOrWhiteSpace($destinationParent)) { throw 'Nao foi possivel resolver a pasta pai do destino.' }
if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) {
    New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
}
$destinationParent = Get-PmoNormalizedFullPath $destinationParent

$destinationExistedEmpty = $false
if (Test-Path -LiteralPath $destinationFull) {
    if (-not (Test-Path -LiteralPath $destinationFull -PathType Container)) { throw 'O destino existe e nao e uma pasta vazia.' }
    $destinationItem = Get-Item -LiteralPath $destinationFull -Force
    if (($destinationItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'O destino existente nao pode ser link ou junction.'
    }
    if (@(Get-ChildItem -LiteralPath $destinationFull -Force).Count -gt 0) { throw 'O destino existe e nao esta vazio.' }
    $destinationExistedEmpty = $true
}

# O staging e irmao do destino para que o commit final seja um rename no mesmo volume.
$stagingName = '.pmo-install-staging-' + [Guid]::NewGuid().ToString('N')
$stagingFull = [System.IO.Path]::GetFullPath((Join-Path $destinationParent $stagingName))
if (-not (Test-PmoSubPath $destinationParent $stagingFull) -or
    -not ((Get-PmoNormalizedFullPath ([System.IO.Path]::GetDirectoryName($stagingFull))).Equals($destinationParent, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw 'O staging calculado nao e irmao seguro do destino.'
}
New-Item -ItemType Directory -Path $stagingFull | Out-Null

$artifactDir = Join-Path $stagingFull '.bootstrap-artifacts'
New-Item -ItemType Directory -Path $artifactDir | Out-Null
$committed = $false
try {
    & (Join-Path $scriptDir 'New-ReleasePackage.ps1') -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp -OutputDirectory $artifactDir
    $zip = Join-Path $artifactDir ("pmo-tool-$Version-windows.zip")
    if (-not (Test-Path -LiteralPath $zip)) { throw 'Empacotador nao produziu o ZIP esperado.' }
    $check = Test-PmoArchive $zip
    if (-not $check.ok) { throw ('Runtime inicial rejeitado: ' + ($check.errors -join '; ')) }

    $runtimeDir = Join-Path (Join-Path $stagingFull 'versions') $Version
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Expand-PmoArchiveSafe $zip $runtimeDir
    $runtimeManifest = Read-PmoJson (Join-Path $runtimeDir 'release.json') $null
    if (-not $runtimeManifest -or -not $runtimeManifest.schema) { throw 'Runtime inicial sem contrato de schema.' }
    if ([string]$runtimeManifest.version -ne $Version) { throw 'Versao do runtime inicial diverge do destino solicitado.' }
    $runtimeManifestSha256 = Get-PmoSha256 (Join-Path $runtimeDir 'release.json')

    foreach ($name in @('pmo.ps1','atualizar.ps1','bootstrap.json','LICENSE','NOTICE')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $stagingFull $name)
    }
    $rootTools = Join-Path $stagingFull 'tools'
    New-Item -ItemType Directory -Path $rootTools -Force | Out-Null
    Copy-Item -LiteralPath $common -Destination (Join-Path $rootTools 'portable-common.ps1')

    foreach ($dir in @('config','state','data','data\attachments','data\backups','data\update-backups','data\user-templates','staging','logs')) {
        New-Item -ItemType Directory -Path (Join-Path $stagingFull $dir) -Force | Out-Null
    }
    $install = [ordered]@{
        formatVersion=1; repository=$Repository; channel='stable'; port=8090; checkIntervalHours=24
        dataDir='data'; configDir='config'; stateDir='state'
        retention=[ordered]@{ versions=2; snapshots=3; portfolioBackups=30 }
    }
    Write-PmoJsonAtomic (Join-Path $stagingFull 'config\install.json') $install
    Write-PmoJsonAtomic (Join-Path $stagingFull 'state\active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; bootstrapProtocolVersion=1
        activeVersion=$Version; previousVersion=$null
        activeSchemaVersion=[int]$runtimeManifest.schema.write; previousSchemaVersion=$null
        activeReleaseManifestSha256=$runtimeManifestSha256; previousReleaseManifestSha256=$null
        activatedAt=(Get-Date).ToUniversalTime().ToString('o')
    })
    Write-PmoJsonAtomic (Join-Path $stagingFull 'state\update.json') ([ordered]@{
        formatVersion=1; phase='idle'; updatedAt=(Get-Date).ToUniversalTime().ToString('o'); error=$null
    })

    if ($IncludeCurrentData) {
        $sourceData = Join-Path $sourceRoot 'data'
        foreach ($name in @('portfolio.json','attachments','user-templates')) {
            $src = Join-Path $sourceData $name
            $dst = Join-Path (Join-Path $stagingFull 'data') $name
            if (Test-Path -LiteralPath $src -PathType Leaf) { Copy-PmoFileDurable -Source $src -Destination $dst }
            elseif (Test-Path -LiteralPath $src -PathType Container) { Copy-PmoDirectoryDurable -Source $src -Destination $dst }
        }
    }

    if (-not (Test-PmoSubPath $stagingFull $artifactDir)) { throw 'Diretorio de artefatos escapou do staging.' }
    Remove-PmoManagedTree -Root $stagingFull -Path $artifactDir

    $inventory = @(Get-PmoDirectoryInventory $stagingFull)
    $installManifestPath = Join-Path $stagingFull 'portable-install-manifest.json'
    Write-PmoJsonAtomic $installManifestPath ([ordered]@{
        formatVersion=1; version=$Version; createdAt=(Get-Date).ToUniversalTime().ToString('o')
        includesCurrentData=[bool]$IncludeCurrentData; repositoryConfigured=(-not [string]::IsNullOrWhiteSpace($Repository)); files=$inventory
    })

    $inventoryErrors = Test-PmoInventory $stagingFull $inventory -AllowedExtra @('portable-install-manifest.json')
    if ($null -eq $inventoryErrors) { $inventoryErrors = @() }
    if ($inventoryErrors.Count -gt 0) { throw ('Instalacao em staging falhou na verificacao: ' + ($inventoryErrors -join '; ')) }

    # Revalida no instante do commit para nao apagar conteudo criado durante o build.
    if (Test-Path -LiteralPath $destinationFull) {
        if (-not $destinationExistedEmpty) { throw 'O destino foi criado durante a instalacao; commit recusado.' }
        $null = Assert-PmoPathWithoutReparse $destinationFull
        if (-not (Test-Path -LiteralPath $destinationFull -PathType Container) -or
            @(Get-ChildItem -LiteralPath $destinationFull -Force).Count -gt 0) {
            throw 'O destino deixou de estar vazio durante a instalacao; commit recusado.'
        }
        Remove-Item -LiteralPath $destinationFull -Force
    }
    [System.IO.Directory]::Move($stagingFull, $destinationFull)
    $committed = $true
    Write-Host "Instalacao portatil criada em $destinationFull" -ForegroundColor Green
} finally {
    if (-not $committed -and (Test-Path -LiteralPath $stagingFull -PathType Container)) {
        $safeStaging = (Test-PmoSubPath $destinationParent $stagingFull) -and
            ([System.IO.Path]::GetFileName($stagingFull).StartsWith('.pmo-install-staging-', [System.StringComparison]::Ordinal))
        if ($safeStaging) {
            try { Remove-PmoManagedTree -Root $destinationParent -Path $stagingFull } catch { }
        }
    }
}
