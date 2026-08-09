<#
    Gera os artefatos publicaveis de uma release estavel do PMO Tool.

    Saidas:
      pmo-tool-<versao>-windows.zip
      pmo-tool-<versao>-manifest.json
      pmo-tool-<versao>-windows.zip.sha256

    O ZIP e produzido em ordem deterministica, com timestamps canonicos e
    apenas a allowlist de runtime. Compatibilidade: Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [string] $Version = $env:PMO_BUILD_VERSION,

    [string] $Commit = $env:PMO_BUILD_COMMIT,

    [string] $BuildTimestamp = $env:PMO_BUILD_TIMESTAMP,

    [string] $OutputDirectory,

    [string] $MinBootstrapVersion = '1.0.0'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $scriptDir
$modeloPath = Join-Path (Join-Path (Join-Path $raiz 'src') 'js') '10-model.js'
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)

function Ler-TextoUtf8([string] $Caminho) {
    return [System.IO.File]::ReadAllText($Caminho, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n").Replace("`r", "`n")
}

function Gravar-JsonDeterministico([string] $Caminho, $Objeto) {
    $json = ($Objeto | ConvertTo-Json -Depth 12).Replace("`r`n", "`n").Replace("`r", "`n") + "`n"
    [System.IO.File]::WriteAllText($Caminho, $json, $utf8SemBom)
}

function Obter-MetadadoModelo([string] $Nome, [string] $Conteudo) {
    $pattern = 'model\.' + [regex]::Escape($Nome) + '\s*=\s*[''"]?(?<value>[0-9]+(?:\.[0-9]+){0,2})[''"]?\s*;'
    $match = [regex]::Match($Conteudo, $pattern)
    if (-not $match.Success) {
        throw "Nao foi possivel localizar model.$Nome em $modeloPath"
    }
    return $match.Groups['value'].Value
}

function Caminho-Relativo([string] $Base, [string] $Caminho) {
    $baseUri = New-Object System.Uri(($Base.TrimEnd('\') + '\'))
    $pathUri = New-Object System.Uri($Caminho)
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

<#
    Grava um ZIP deterministico a partir de um diretorio: entradas em ordem
    canonica pelo caminho relativo e timestamp fixo. Usado pelo pacote de
    runtime e pelo de bootstrap, para que os dois sejam reproduziveis.
#>
function Criar-ZipDeterministico([string] $Origem, [string] $ZipPath, [DateTimeOffset] $DataZip) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipStream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $arquivoZip = $null
    try {
        $arquivoZip = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        foreach ($arquivo in @(Get-ChildItem -LiteralPath $Origem -File -Recurse | Sort-Object { Caminho-Relativo $Origem $_.FullName })) {
            $relativo = Caminho-Relativo $Origem $arquivo.FullName
            $entrada = $arquivoZip.CreateEntry($relativo, [System.IO.Compression.CompressionLevel]::Optimal)
            $entrada.LastWriteTime = $DataZip
            $origemStream = [System.IO.File]::OpenRead($arquivo.FullName)
            $destinoStream = $entrada.Open()
            try {
                $origemStream.CopyTo($destinoStream)
            }
            finally {
                $destinoStream.Dispose()
                $origemStream.Dispose()
            }
        }
    }
    finally {
        if ($null -ne $arquivoZip) {
            $arquivoZip.Dispose()
        }
        $zipStream.Dispose()
    }
}

function Copiar-Diretorio([string] $Origem, [string] $Destino) {
    if (-not (Test-Path -LiteralPath $Origem -PathType Container)) {
        throw "Diretorio obrigatorio ausente: $Origem"
    }
    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
    foreach ($arquivo in @(Get-ChildItem -LiteralPath $Origem -File -Recurse | Sort-Object FullName)) {
        $relativo = Caminho-Relativo $Origem $arquivo.FullName
        $alvo = Join-Path $Destino ($relativo.Replace('/', '\'))
        $pastaAlvo = Split-Path -Parent $alvo
        if (-not (Test-Path -LiteralPath $pastaAlvo -PathType Container)) {
            New-Item -ItemType Directory -Force -Path $pastaAlvo | Out-Null
        }
        Copy-Item -LiteralPath $arquivo.FullName -Destination $alvo
    }
}

$modelo = Ler-TextoUtf8 $modeloPath
$versaoFonte = Obter-MetadadoModelo 'APP_VERSION' $modelo
$schemaVersion = [int](Obter-MetadadoModelo 'SCHEMA_VERSION' $modelo)
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $versaoFonte
}
if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "Somente SemVer estavel X.Y.Z pode ser empacotado: $Version"
}
if ($Version -ne $versaoFonte) {
    throw "A versao solicitada ($Version) diverge de model.APP_VERSION ($versaoFonte)."
}
if ($MinBootstrapVersion -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "MinBootstrapVersion invalido: $MinBootstrapVersion"
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $raiz 'artifacts'
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $raiz $OutputDirectory
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$tempDir = Join-Path $tempBase ('pmo-release-' + [Guid]::NewGuid().ToString('N'))
$tempDir = [System.IO.Path]::GetFullPath($tempDir)
if (-not $tempDir.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Diretorio temporario calculado fora da pasta temporaria do sistema.'
}
$runtimeDir = Join-Path $tempDir 'runtime'
$bootstrapDir = Join-Path $tempDir 'bootstrap'

$zipNome = "pmo-tool-$Version-windows.zip"
$manifestoNome = "pmo-tool-$Version-manifest.json"
$bootstrapNome = "pmo-tool-$Version-bootstrap.zip"
# O helper viaja sem versao no nome: o instalador o descobre pelo manifesto,
# nao pelo nome, e precisa carrega-lo antes de saber validar qualquer ZIP.
$helperNome = 'portable-common.ps1'
$instaladorNome = 'pmo-instalar.ps1'
$zipPath = Join-Path $OutputDirectory $zipNome
$manifestoPath = Join-Path $OutputDirectory $manifestoNome
$bootstrapPath = Join-Path $OutputDirectory $bootstrapNome
$helperPath = Join-Path $OutputDirectory $helperNome
$instaladorPath = Join-Path $OutputDirectory $instaladorNome
$shaPath = $zipPath + '.sha256'

try {
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    $distDir = Join-Path $runtimeDir 'dist'
    New-Item -ItemType Directory -Force -Path $distDir | Out-Null

    $parametrosBuild = @{
        Version = $Version
        OutputPath = (Join-Path $distDir 'pmo-tool.html')
    }
    if (-not [string]::IsNullOrWhiteSpace($Commit)) {
        $parametrosBuild.Commit = $Commit
    }
    if (-not [string]::IsNullOrWhiteSpace($BuildTimestamp)) {
        $parametrosBuild.BuildTimestamp = $BuildTimestamp
    }
    & (Join-Path $raiz 'build.ps1') @parametrosBuild

    foreach ($nome in @('serve.ps1', 'LICENSE', 'NOTICE')) {
        $origem = Join-Path $raiz $nome
        if (-not (Test-Path -LiteralPath $origem -PathType Leaf)) {
            throw "Arquivo obrigatorio ausente: $origem"
        }
        Copy-Item -LiteralPath $origem -Destination (Join-Path $runtimeDir $nome)
    }
    $runtimeTools = Join-Path $runtimeDir 'tools'
    New-Item -ItemType Directory -Force -Path $runtimeTools | Out-Null
    foreach ($nome in @('portable-common.ps1', 'update-runtime.ps1')) {
        $origem = Join-Path (Join-Path $raiz 'tools') $nome
        if (-not (Test-Path -LiteralPath $origem -PathType Leaf)) {
            throw "Ferramenta obrigatoria do runtime ausente: $origem"
        }
        Copy-Item -LiteralPath $origem -Destination (Join-Path $runtimeTools $nome)
    }
    Copiar-Diretorio (Join-Path $raiz 'templates') (Join-Path (Join-Path $runtimeDir 'templates') 'factory')
    Copiar-Diretorio (Join-Path $raiz 'samples') (Join-Path $runtimeDir 'samples')

    $html = Ler-TextoUtf8 (Join-Path $distDir 'pmo-tool.html')
    $matchCommit = [regex]::Match($html, '<meta name="pmo-build-commit" content="(?<value>[^"]+)">')
    $matchTimestamp = [regex]::Match($html, '<meta name="pmo-build-timestamp" content="(?<value>[^"]+)">')
    if (-not $matchCommit.Success -or -not $matchTimestamp.Success) {
        throw 'O build nao contem metadados canonicos de commit e timestamp.'
    }
    $commitCanonico = $matchCommit.Groups['value'].Value
    $timestampCanonico = $matchTimestamp.Groups['value'].Value

    $arquivos = @()
    foreach ($arquivo in @(Get-ChildItem -LiteralPath $runtimeDir -File -Recurse | Sort-Object FullName)) {
        $relativo = Caminho-Relativo $runtimeDir $arquivo.FullName
        if ($relativo -eq 'release.json') {
            continue
        }
        $arquivos += [ordered]@{
            path = $relativo
            size = [long]$arquivo.Length
            sha256 = (Get-FileHash -LiteralPath $arquivo.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }

    $release = [ordered]@{
        formatVersion = 1
        product = 'PMO Tool'
        version = $Version
        channel = 'stable'
        platform = 'windows'
        architecture = 'any'
        minPowerShellVersion = '5.1'
        minBootstrapVersion = $MinBootstrapVersion
        commit = $commitCanonico
        buildTimestamp = $timestampCanonico
        schema = [ordered]@{
            readMin = 1
            readMax = $schemaVersion
            write = $schemaVersion
        }
        rights = 'Copyright (c) 2026. All rights reserved.'
        files = $arquivos
    }
    $releasePath = Join-Path $runtimeDir 'release.json'
    Gravar-JsonDeterministico $releasePath $release

    # Pacote de bootstrap: exatamente o que o ZIP de runtime nao pode conter.
    # Scripts de raiz ficam fora do runtime por construcao (G12), e por isso
    # precisam de um artefato proprio para chegar a uma instalacao nova.
    New-Item -ItemType Directory -Force -Path $bootstrapDir | Out-Null
    foreach ($nome in @('pmo.ps1', 'atualizar.ps1', 'bootstrap.json', 'LICENSE', 'NOTICE')) {
        $origem = Join-Path $raiz $nome
        if (-not (Test-Path -LiteralPath $origem -PathType Leaf)) {
            throw "Arquivo obrigatorio do bootstrap ausente: $origem"
        }
        Copy-Item -LiteralPath $origem -Destination (Join-Path $bootstrapDir $nome)
    }
    $bootstrapTools = Join-Path $bootstrapDir 'tools'
    New-Item -ItemType Directory -Force -Path $bootstrapTools | Out-Null
    foreach ($nome in @('portable-common.ps1', 'install-common.ps1')) {
        $origem = Join-Path (Join-Path $raiz 'tools') $nome
        if (-not (Test-Path -LiteralPath $origem -PathType Leaf)) {
            throw "Ferramenta obrigatoria do bootstrap ausente: $origem"
        }
        Copy-Item -LiteralPath $origem -Destination (Join-Path $bootstrapTools $nome)
    }

    foreach ($alvo in @($zipPath, $manifestoPath, $shaPath, $bootstrapPath, $helperPath, $instaladorPath)) {
        if (Test-Path -LiteralPath $alvo -PathType Leaf) {
            Remove-Item -LiteralPath $alvo -Force
        }
    }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $dataZip = [DateTimeOffset]::Parse($timestampCanonico, [Globalization.CultureInfo]::InvariantCulture)
    if ($dataZip.UtcDateTime -lt [DateTime]::SpecifyKind([DateTime]'1980-01-01', [DateTimeKind]::Utc)) {
        $dataZip = New-Object DateTimeOffset([DateTime]::SpecifyKind([DateTime]'1980-01-01', [DateTimeKind]::Utc))
    }
    if ($dataZip.UtcDateTime -gt [DateTime]::SpecifyKind([DateTime]'2107-12-31T23:59:58', [DateTimeKind]::Utc)) {
        throw 'BuildTimestamp excede o intervalo representavel pelo formato ZIP.'
    }

    Criar-ZipDeterministico $runtimeDir $zipPath $dataZip
    Criar-ZipDeterministico $bootstrapDir $bootstrapPath $dataZip
    Copy-Item -LiteralPath (Join-Path (Join-Path $raiz 'tools') 'portable-common.ps1') -Destination $helperPath
    # O instalador vai solto e sem versao no nome: e o unico arquivo que uma
    # maquina nova baixa, e a URL precisa ser previsivel. Ele nao entra no
    # manifesto de proposito - o manifesto vem do mesmo canal e nao serviria
    # para autentica-lo.
    Copy-Item -LiteralPath (Join-Path (Join-Path $raiz 'tools') 'pmo-instalar.ps1') -Destination $instaladorPath

    $hashZip = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $hashRelease = (Get-FileHash -LiteralPath $releasePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $hashBootstrap = (Get-FileHash -LiteralPath $bootstrapPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $hashHelper = (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant()
    # 'artifact' e 'runtimeManifest' nao mudam de nome nem de forma: o updater
    # da v1.4.1 compara os dois campo a campo. Os artefatos novos entram como
    # irmaos, e um updater antigo simplesmente os ignora.
    $manifesto = [ordered]@{
        formatVersion = 1
        product = 'PMO Tool'
        version = $Version
        channel = 'stable'
        commit = $commitCanonico
        buildTimestamp = $timestampCanonico
        artifact = [ordered]@{
            name = $zipNome
            size = [long](Get-Item -LiteralPath $zipPath).Length
            sha256 = $hashZip
        }
        runtimeManifest = [ordered]@{
            path = 'release.json'
            sha256 = $hashRelease
        }
        bootstrapArtifact = [ordered]@{
            name = $bootstrapNome
            size = [long](Get-Item -LiteralPath $bootstrapPath).Length
            sha256 = $hashBootstrap
        }
        helperArtifact = [ordered]@{
            name = $helperNome
            size = [long](Get-Item -LiteralPath $helperPath).Length
            sha256 = $hashHelper
        }
    }
    Gravar-JsonDeterministico $manifestoPath $manifesto
    [System.IO.File]::WriteAllText($shaPath, ($hashZip + '  ' + $zipNome + "`n"), $utf8SemBom)

    & (Join-Path $scriptDir 'Test-ReleasePackage.ps1') -ZipPath $zipPath -ManifestPath $manifestoPath
    & (Join-Path $scriptDir 'Test-BootstrapPackage.ps1') -ZipPath $bootstrapPath -ManifestPath $manifestoPath
    Write-Host "Artefatos de release gerados em $OutputDirectory" -ForegroundColor Green
    Write-Host "  $zipNome"
    Write-Host "  $manifestoNome"
    Write-Host "  $([System.IO.Path]::GetFileName($shaPath))"
    Write-Host "  $bootstrapNome"
    Write-Host "  $helperNome"
    Write-Host "  $instaladorNome"
}
finally {
    if (Test-Path -LiteralPath $tempDir -PathType Container) {
        $resolvido = [System.IO.Path]::GetFullPath($tempDir)
        if (-not $resolvido.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or -not ([System.IO.Path]::GetFileName($resolvido)).StartsWith('pmo-release-', [StringComparison]::Ordinal)) {
            throw "Recusa ao limpar diretorio temporario inesperado: $resolvido"
        }
        Remove-Item -LiteralPath $resolvido -Recurse -Force
    }
}
