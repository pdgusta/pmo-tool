<#
    Cria a instalacao inicial portatil a partir do checkout local.
    Dados atuais so sao copiados com -IncludeCurrentData.

    Este script constroi os pacotes; quem monta a instalacao e
    Install-PmoPortableFromPackages (tools/install-common.ps1), a mesma funcao
    usada pelo caminho que baixa os pacotes de uma release.
#>
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
. (Join-Path $scriptDir 'install-common.ps1')

# Valida o destino antes de construir qualquer artefato: um destino recusado
# nao pode custar um build inteiro nem deixar rastro no disco.
$destino = Assert-PmoInstallDestination -Destination $Destination -SourceRoot $sourceRoot

# Area de trabalho irma do destino, no mesmo volume e com prefixo proprio para
# que uma sobra seja distinguivel do staging da materializacao.
$workName = '.pmo-install-build-' + [Guid]::NewGuid().ToString('N')
$workFull = [System.IO.Path]::GetFullPath((Join-Path $destino.Parent $workName))
if (-not (Test-PmoSubPath $destino.Parent $workFull) -or
    -not ((Get-PmoNormalizedFullPath ([System.IO.Path]::GetDirectoryName($workFull))).Equals($destino.Parent, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw 'A area de trabalho calculada nao e irma segura do destino.'
}
New-Item -ItemType Directory -Path $workFull | Out-Null

try {
    $artifactDir = Join-Path $workFull 'artifacts'
    New-Item -ItemType Directory -Path $artifactDir | Out-Null
    & (Join-Path $scriptDir 'New-ReleasePackage.ps1') -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp -OutputDirectory $artifactDir
    $zip = Join-Path $artifactDir ("pmo-tool-$Version-windows.zip")
    if (-not (Test-Path -LiteralPath $zip)) { throw 'Empacotador nao produziu o ZIP esperado.' }

    # Bootstrap montado a partir do checkout, no mesmo layout que o pacote de
    # bootstrap de uma release tera.
    $bootstrapDir = Join-Path $workFull 'bootstrap'
    $bootstrapTools = Join-Path $bootstrapDir 'tools'
    New-Item -ItemType Directory -Path $bootstrapTools -Force | Out-Null
    foreach ($name in @('pmo.ps1','atualizar.ps1','bootstrap.json','LICENSE','NOTICE')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $bootstrapDir $name)
    }
    Copy-Item -LiteralPath $common -Destination (Join-Path $bootstrapTools 'portable-common.ps1')

    $dadosDe = ''
    if ($IncludeCurrentData) { $dadosDe = Join-Path $sourceRoot 'data' }

    $resultado = Install-PmoPortableFromPackages `
        -RuntimeZip $zip -BootstrapDir $bootstrapDir -Destination $Destination `
        -Versao $Version -Repositorio $Repository -SourceRoot $sourceRoot -IncluirDadosDe $dadosDe

    Write-Host "Instalacao portatil criada em $($resultado.Destination)" -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $workFull -PathType Container) {
        $safeWork = (Test-PmoSubPath $destino.Parent $workFull) -and
            ([System.IO.Path]::GetFileName($workFull).StartsWith('.pmo-install-build-', [System.StringComparison]::Ordinal))
        if ($safeWork) {
            try { Remove-PmoManagedTree -Root $destino.Parent -Path $workFull } catch { }
        }
    }
}
