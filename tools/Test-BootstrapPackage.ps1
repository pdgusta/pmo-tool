<#
    Valida o pacote de bootstrap antes de publica-lo ou instala-lo.

    O bootstrap carrega justamente os arquivos que o pacote de runtime nao pode
    conter: pmo.ps1, atualizar.ps1 e bootstrap.json ficam fora do runtime por
    construcao, e e isso que impede um update regular de substituir script de
    raiz (G12). Por isso ele tem allowlist propria, e nao uma extensao da do
    runtime.

    A validacao e fail-closed e independente da do runtime: um pacote integro
    aqui nao diz nada sobre o outro, e vice-versa.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $ZipPath,

    [string] $ManifestPath,

    [int] $MaxFileCount = 64,

    [long] $MaxEntryBytes = 4MB,

    [long] $MaxTotalBytes = 16MB,

    [long] $MaxCompressedEntryBytes = 4MB,

    [long] $MaxCompressedTotalBytes = 8MB,

    [long] $MaxArchiveBytes = 8MB,

    [double] $MaxCompressionRatio = 200,

    [switch] $PassThru
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# Allowlist do bootstrap. Nomes em minusculas: a comparacao e case-insensitive
# para que colisao de caixa seja detectada, nunca tolerada.
$arquivosObrigatorios = @(
    'pmo.ps1',
    'atualizar.ps1',
    'bootstrap.json',
    'license',
    'notice',
    'tools/portable-common.ps1',
    'tools/install-common.ps1'
)
# Hoje a allowlist e exatamente o conjunto obrigatorio; nada e opcional.
$arquivosPermitidos = $arquivosObrigatorios

function Obter-Sha256Entrada([System.IO.Compression.ZipArchiveEntry] $Entrada) {
    $stream = $Entrada.Open()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $sha.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
        $stream.Dispose()
    }
}

function Exigir-Propriedade($Objeto, [string] $Nome, [string] $Contexto) {
    if ($null -eq $Objeto -or -not ($Objeto.PSObject.Properties.Name -contains $Nome)) {
        throw "$Contexto sem propriedade obrigatoria '$Nome'."
    }
    return $Objeto.$Nome
}

$ZipPath = [System.IO.Path]::GetFullPath($ZipPath)
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
    throw "ZIP de bootstrap inexistente: $ZipPath"
}
if ((Get-Item -LiteralPath $ZipPath).Length -gt $MaxArchiveBytes) {
    throw "ZIP de bootstrap excede o limite comprimido de $MaxArchiveBytes bytes."
}
if ($ManifestPath) {
    $ManifestPath = [System.IO.Path]::GetFullPath($ManifestPath)
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        throw "Manifesto externo inexistente: $ManifestPath"
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$arquivo = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
$zip = $null
try {
    $zip = New-Object System.IO.Compression.ZipArchive($arquivo, [System.IO.Compression.ZipArchiveMode]::Read, $false)
    $entradas = @($zip.Entries)
    if ($entradas.Count -eq 0) {
        throw 'O ZIP de bootstrap esta vazio.'
    }
    if ($entradas.Count -gt $MaxFileCount) {
        throw "ZIP de bootstrap excede o limite de $MaxFileCount arquivos."
    }

    $mapa = @{}
    $total = [long]0
    $totalComprimido = [long]0
    foreach ($entrada in $entradas) {
        $caminho = $entrada.FullName
        if ([string]::IsNullOrWhiteSpace($caminho)) {
            throw 'ZIP de bootstrap contem entrada sem nome.'
        }
        if ($caminho.Contains('\')) {
            throw "Separador invertido nao permitido no bootstrap: $caminho"
        }
        if ($caminho.StartsWith('/') -or [System.IO.Path]::IsPathRooted($caminho)) {
            throw "Caminho absoluto nao permitido no bootstrap: $caminho"
        }
        if ($caminho -match ':' -or $caminho -match '[\x00-\x1f]' -or $caminho.Length -gt 240) {
            throw "Caminho inseguro no bootstrap: $caminho"
        }
        $segmentos = @($caminho.Split('/'))
        $segmentosInvalidos = @($segmentos | Where-Object { $_ -eq '' -or $_ -eq '.' -or $_ -eq '..' })
        if ($segmentos.Count -eq 0 -or $segmentosInvalidos.Count -gt 0) {
            throw "Traversal ou segmento vazio no bootstrap: $caminho"
        }
        if ($caminho.EndsWith('/')) {
            throw "Entradas de diretorio explicitas nao sao aceitas: $caminho"
        }
        $tipoUnix = (($entrada.ExternalAttributes -shr 16) -band 0xF000)
        if ($tipoUnix -eq 0xA000) {
            throw "Link simbolico nao permitido no bootstrap: $caminho"
        }
        $minusculo = $caminho.ToLowerInvariant()
        if ($arquivosPermitidos -notcontains $minusculo) {
            throw "Arquivo fora da allowlist de bootstrap: $caminho"
        }
        if ($entrada.Length -lt 0 -or $entrada.Length -gt $MaxEntryBytes) {
            throw "Entrada excede o limite individual: $caminho"
        }
        if ($entrada.CompressedLength -lt 0 -or $entrada.CompressedLength -gt $MaxCompressedEntryBytes) {
            throw "Entrada excede o limite comprimido individual: $caminho"
        }
        $totalComprimido += [long]$entrada.CompressedLength
        if ($totalComprimido -gt $MaxCompressedTotalBytes) {
            throw "ZIP de bootstrap excede o limite comprimido interno de $MaxCompressedTotalBytes bytes."
        }
        $denominador = [Math]::Max([double]1, [double]$entrada.CompressedLength)
        if ([double]$entrada.Length / $denominador -gt $MaxCompressionRatio) {
            throw "Razao de compressao excede $MaxCompressionRatio`:1: $caminho"
        }
        $total += [long]$entrada.Length
        if ($total -gt $MaxTotalBytes) {
            throw "ZIP de bootstrap excede o limite descompactado de $MaxTotalBytes bytes."
        }
        if ($mapa.ContainsKey($minusculo)) {
            throw "Caminho duplicado ou colisao por caixa no bootstrap: $caminho"
        }
        $mapa[$minusculo] = $entrada
    }

    foreach ($obrigatorio in $arquivosObrigatorios) {
        if (-not $mapa.ContainsKey($obrigatorio)) {
            throw "Arquivo obrigatorio ausente do bootstrap: $obrigatorio"
        }
    }

    $hashZip = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ManifestPath) {
        try {
            $manifestoExterno = ([System.IO.File]::ReadAllText($ManifestPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json
        }
        catch {
            throw "Manifesto externo invalido: $($_.Exception.Message)"
        }
        if ([int](Exigir-Propriedade $manifestoExterno 'formatVersion' 'manifesto externo') -ne 1 -or
            [string](Exigir-Propriedade $manifestoExterno 'product' 'manifesto externo') -ne 'PMO Tool' -or
            [string](Exigir-Propriedade $manifestoExterno 'channel' 'manifesto externo') -ne 'stable') {
            throw 'Contrato basico do manifesto externo invalido.'
        }
        $artefato = Exigir-Propriedade $manifestoExterno 'bootstrapArtifact' 'manifesto externo'
        $nomeDeclarado = [string](Exigir-Propriedade $artefato 'name' 'manifesto externo.bootstrapArtifact')
        $tamanhoDeclarado = [long](Exigir-Propriedade $artefato 'size' 'manifesto externo.bootstrapArtifact')
        $hashDeclarado = ([string](Exigir-Propriedade $artefato 'sha256' 'manifesto externo.bootstrapArtifact')).ToLowerInvariant()
        if ($nomeDeclarado -ne [System.IO.Path]::GetFileName($ZipPath)) {
            throw 'Nome do bootstrap diverge do manifesto externo.'
        }
        if ($tamanhoDeclarado -ne (Get-Item -LiteralPath $ZipPath).Length -or $hashDeclarado -ne $hashZip) {
            throw 'Tamanho ou SHA-256 do bootstrap diverge do manifesto externo.'
        }
        $versaoManifesto = [string](Exigir-Propriedade $manifestoExterno 'version' 'manifesto externo')
        if ($nomeDeclarado -ne "pmo-tool-$versaoManifesto-bootstrap.zip") {
            throw 'Nome do bootstrap nao corresponde a versao do manifesto.'
        }
    }

    $resultado = [pscustomobject]@{
        Valid = $true
        ZipPath = $ZipPath
        FileCount = $entradas.Count
        UncompressedBytes = $total
        CompressedBytes = $totalComprimido
        Sha256 = $hashZip
    }
    Write-Host ("Pacote bootstrap valido: {0} arquivos | SHA-256 {1}" -f $entradas.Count, $hashZip) -ForegroundColor Green
    if ($PassThru) {
        return $resultado
    }
}
finally {
    if ($null -ne $zip) {
        $zip.Dispose()
    }
    $arquivo.Dispose()
}
