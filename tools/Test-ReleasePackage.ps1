<#
    Valida um pacote runtime antes de instala-lo ou publica-lo.

    A validacao e fail-closed: somente a allowlist conhecida e aceita, todos
    os hashes internos sao recalculados e, quando informado, o manifesto
    externo precisa ancorar exatamente o ZIP recebido.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $ZipPath,

    [string] $ManifestPath,

    [int] $MaxFileCount = 2048,

    [long] $MaxEntryBytes = 50MB,

    [long] $MaxTotalBytes = 256MB,

    [long] $MaxCompressedEntryBytes = 50MB,

    [long] $MaxCompressedTotalBytes = 128MB,

    [long] $MaxArchiveBytes = 132MB,

    [double] $MaxCompressionRatio = 200,

    [switch] $PassThru
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Obter-Sha256Stream([System.IO.Stream] $Stream) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $sha.ComputeHash($Stream)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Obter-Sha256Entrada([System.IO.Compression.ZipArchiveEntry] $Entrada) {
    $stream = $Entrada.Open()
    try {
        return Obter-Sha256Stream $stream
    }
    finally {
        $stream.Dispose()
    }
}

function Ler-EntradaUtf8([System.IO.Compression.ZipArchiveEntry] $Entrada) {
    if ($Entrada.Length -gt 1MB) {
        throw "Manifesto interno excede 1 MB: $($Entrada.FullName)"
    }
    $stream = $Entrada.Open()
    $memoria = New-Object System.IO.MemoryStream
    try {
        $stream.CopyTo($memoria)
        return [System.Text.Encoding]::UTF8.GetString($memoria.ToArray())
    }
    finally {
        $memoria.Dispose()
        $stream.Dispose()
    }
}

function Exigir-Propriedade($Objeto, [string] $Nome, [string] $Contexto) {
    if ($null -eq $Objeto -or -not ($Objeto.PSObject.Properties.Name -contains $Nome)) {
        throw "$Contexto sem propriedade obrigatoria '$Nome'."
    }
    return $Objeto.$Nome
}

function Testar-CaminhoPermitido([string] $Caminho) {
    $exatos = @(
        'serve.ps1',
        'release.json',
        'license',
        'notice',
        'dist/pmo-tool.html',
        'tools/portable-common.ps1',
        'tools/update-runtime.ps1'
    )
    $minusculo = $Caminho.ToLowerInvariant()
    if ($exatos -contains $minusculo) {
        return $true
    }
    foreach ($prefixo in @('templates/factory/', 'samples/')) {
        if ($minusculo.StartsWith($prefixo, [StringComparison]::Ordinal)) {
            return $true
        }
    }
    return $false
}

$ZipPath = [System.IO.Path]::GetFullPath($ZipPath)
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
    throw "ZIP inexistente: $ZipPath"
}
if ((Get-Item -LiteralPath $ZipPath).Length -gt $MaxArchiveBytes) {
    throw "ZIP excede o limite comprimido de $MaxArchiveBytes bytes."
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
        throw 'O ZIP esta vazio.'
    }
    if ($entradas.Count -gt $MaxFileCount) {
        throw "ZIP excede o limite de $MaxFileCount arquivos."
    }

    $mapa = @{}
    $total = [long]0
    $totalComprimido = [long]0
    foreach ($entrada in $entradas) {
        $caminho = $entrada.FullName
        if ([string]::IsNullOrWhiteSpace($caminho)) {
            throw 'ZIP contem entrada sem nome.'
        }
        if ($caminho.Contains('\')) {
            throw "Separador invertido nao permitido no ZIP: $caminho"
        }
        if ($caminho.StartsWith('/') -or $caminho.StartsWith('//') -or [System.IO.Path]::IsPathRooted($caminho)) {
            throw "Caminho absoluto nao permitido no ZIP: $caminho"
        }
        if ($caminho -match ':' -or $caminho -match '[\x00-\x1f]' -or $caminho.Length -gt 240) {
            throw "Caminho inseguro no ZIP: $caminho"
        }
        $segmentos = @($caminho.Split('/'))
        $segmentosInvalidos = @($segmentos | Where-Object { $_ -eq '' -or $_ -eq '.' -or $_ -eq '..' })
        if ($segmentos.Count -eq 0 -or $segmentosInvalidos.Count -gt 0) {
            throw "Traversal ou segmento vazio no ZIP: $caminho"
        }
        if ($caminho.EndsWith('/')) {
            throw "Entradas de diretorio explicitas nao sao aceitas: $caminho"
        }
        $tipoUnix = (($entrada.ExternalAttributes -shr 16) -band 0xF000)
        if ($tipoUnix -eq 0xA000) {
            throw "Link simbolico nao permitido no ZIP: $caminho"
        }
        if (-not (Testar-CaminhoPermitido $caminho)) {
            throw "Arquivo fora da allowlist de runtime: $caminho"
        }
        if ($entrada.Length -lt 0 -or $entrada.Length -gt $MaxEntryBytes) {
            throw "Entrada excede o limite individual: $caminho"
        }
        if ($entrada.CompressedLength -lt 0 -or $entrada.CompressedLength -gt $MaxCompressedEntryBytes) {
            throw "Entrada excede o limite comprimido individual: $caminho"
        }
        $totalComprimido += [long]$entrada.CompressedLength
        if ($totalComprimido -gt $MaxCompressedTotalBytes) {
            throw "ZIP excede o limite comprimido interno de $MaxCompressedTotalBytes bytes."
        }
        $denominador = [Math]::Max([double]1, [double]$entrada.CompressedLength)
        if ([double]$entrada.Length / $denominador -gt $MaxCompressionRatio) {
            throw "Razao de compressao excede $MaxCompressionRatio`:1: $caminho"
        }
        $total += [long]$entrada.Length
        if ($total -gt $MaxTotalBytes) {
            throw "ZIP excede o limite descompactado de $MaxTotalBytes bytes."
        }
        $chave = $caminho.ToLowerInvariant()
        if ($mapa.ContainsKey($chave)) {
            throw "Caminho duplicado ou colisao por caixa no ZIP: $caminho"
        }
        $mapa[$chave] = $entrada
    }

    foreach ($obrigatorio in @(
        'serve.ps1',
        'release.json',
        'license',
        'notice',
        'dist/pmo-tool.html',
        'tools/portable-common.ps1',
        'tools/update-runtime.ps1'
    )) {
        if (-not $mapa.ContainsKey($obrigatorio)) {
            throw "Arquivo obrigatorio ausente do runtime: $obrigatorio"
        }
    }

    $entradaRelease = $mapa['release.json']
    try {
        $release = (Ler-EntradaUtf8 $entradaRelease) | ConvertFrom-Json
    }
    catch {
        throw "release.json invalido: $($_.Exception.Message)"
    }

    $formatVersion = Exigir-Propriedade $release 'formatVersion' 'release.json'
    if ([int]$formatVersion -ne 1) {
        throw "formatVersion nao suportado: $formatVersion"
    }
    $version = [string](Exigir-Propriedade $release 'version' 'release.json')
    if ($version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
        throw "Versao estavel invalida em release.json: $version"
    }
    if ([string](Exigir-Propriedade $release 'channel' 'release.json') -ne 'stable') {
        throw 'Somente o canal stable e aceito.'
    }
    if ([string](Exigir-Propriedade $release 'product' 'release.json') -ne 'PMO Tool') { throw 'Produto invalido em release.json.' }
    if ([string](Exigir-Propriedade $release 'platform' 'release.json') -ne 'windows') { throw 'Plataforma invalida em release.json.' }
    if ([string](Exigir-Propriedade $release 'architecture' 'release.json') -ne 'any') { throw 'Arquitetura invalida em release.json.' }
    $minPowerShell = [string](Exigir-Propriedade $release 'minPowerShellVersion' 'release.json')
    $minBootstrap = [string](Exigir-Propriedade $release 'minBootstrapVersion' 'release.json')
    try { $null = [version]$minPowerShell } catch { throw 'minPowerShellVersion invalida em release.json.' }
    try { $null = [version]$minBootstrap } catch { throw 'minBootstrapVersion invalida em release.json.' }
    if ($minBootstrap -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'minBootstrapVersion deve ser SemVer estavel.' }
    $commit = ([string](Exigir-Propriedade $release 'commit' 'release.json')).ToLowerInvariant()
    if ($commit -notmatch '^(?:[0-9a-f]{7,64}|local)$') { throw 'Commit invalido em release.json.' }
    $buildTimestamp = [string](Exigir-Propriedade $release 'buildTimestamp' 'release.json')
    [DateTimeOffset]$timestampParsed = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse($buildTimestamp,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal,[ref]$timestampParsed)) {
        throw 'buildTimestamp invalido em release.json.'
    }
    $schema = Exigir-Propriedade $release 'schema' 'release.json'
    $readMin = [int](Exigir-Propriedade $schema 'readMin' 'release.json.schema')
    $readMax = [int](Exigir-Propriedade $schema 'readMax' 'release.json.schema')
    $writeSchema = [int](Exigir-Propriedade $schema 'write' 'release.json.schema')
    if ($readMin -lt 1 -or $readMin -gt $writeSchema -or $writeSchema -gt $readMax) {
        throw 'Intervalo de schema invalido em release.json.'
    }
    if ([string]::IsNullOrWhiteSpace([string](Exigir-Propriedade $release 'rights' 'release.json'))) { throw 'Direitos ausentes em release.json.' }
    $arquivosManifestados = @(Exigir-Propriedade $release 'files' 'release.json')

    $esperados = @($entradas | Where-Object { $_.FullName.ToLowerInvariant() -ne 'release.json' })
    if ($arquivosManifestados.Count -ne $esperados.Count) {
        throw "release.json declara $($arquivosManifestados.Count) arquivos; ZIP contem $($esperados.Count) arquivos verificaveis."
    }

    $declarados = @{}
    foreach ($item in $arquivosManifestados) {
        $path = [string](Exigir-Propriedade $item 'path' 'release.files[]')
        $size = [long](Exigir-Propriedade $item 'size' 'release.files[]')
        $sha256 = ([string](Exigir-Propriedade $item 'sha256' 'release.files[]')).ToLowerInvariant()
        $chave = $path.ToLowerInvariant()
        if ($declarados.ContainsKey($chave)) {
            throw "Arquivo duplicado em release.json: $path"
        }
        if (-not $mapa.ContainsKey($chave) -or $chave -eq 'release.json') {
            throw "Arquivo manifestado nao encontrado no ZIP: $path"
        }
        if ($sha256 -notmatch '^[0-9a-f]{64}$') {
            throw "SHA-256 invalido para $path"
        }
        $entrada = $mapa[$chave]
        if ([long]$entrada.Length -ne $size) {
            throw "Tamanho divergente para $path"
        }
        $hashReal = Obter-Sha256Entrada $entrada
        if ($hashReal -ne $sha256) {
            throw "SHA-256 divergente para $path"
        }
        $declarados[$chave] = $true
    }

    foreach ($entrada in $esperados) {
        if (-not $declarados.ContainsKey($entrada.FullName.ToLowerInvariant())) {
            throw "Arquivo sem hash no release.json: $($entrada.FullName)"
        }
    }

    $hashZip = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $hashRelease = Obter-Sha256Entrada $entradaRelease
    if ($ManifestPath) {
        try {
            $manifestoExterno = ([System.IO.File]::ReadAllText($ManifestPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json
        }
        catch {
            throw "Manifesto externo invalido: $($_.Exception.Message)"
        }
        $artefato = Exigir-Propriedade $manifestoExterno 'artifact' 'manifesto externo'
        if ([int](Exigir-Propriedade $manifestoExterno 'formatVersion' 'manifesto externo') -ne 1 -or
            [string](Exigir-Propriedade $manifestoExterno 'product' 'manifesto externo') -ne 'PMO Tool' -or
            [string](Exigir-Propriedade $manifestoExterno 'channel' 'manifesto externo') -ne 'stable') {
            throw 'Contrato basico do manifesto externo invalido.'
        }
        $nomeDeclarado = [string](Exigir-Propriedade $artefato 'name' 'manifesto externo.artifact')
        $tamanhoDeclarado = [long](Exigir-Propriedade $artefato 'size' 'manifesto externo.artifact')
        $hashDeclarado = ([string](Exigir-Propriedade $artefato 'sha256' 'manifesto externo.artifact')).ToLowerInvariant()
        if ($nomeDeclarado -ne [System.IO.Path]::GetFileName($ZipPath)) {
            throw 'Nome do artefato diverge do manifesto externo.'
        }
        if ($tamanhoDeclarado -ne (Get-Item -LiteralPath $ZipPath).Length -or $hashDeclarado -ne $hashZip) {
            throw 'Tamanho ou SHA-256 do ZIP diverge do manifesto externo.'
        }
        $manifestoRuntime = Exigir-Propriedade $manifestoExterno 'runtimeManifest' 'manifesto externo'
        $hashReleaseDeclarado = ([string](Exigir-Propriedade $manifestoRuntime 'sha256' 'manifesto externo.runtimeManifest')).ToLowerInvariant()
        if ($hashReleaseDeclarado -ne $hashRelease) {
            throw 'SHA-256 do release.json interno diverge do manifesto externo.'
        }
        if ([string](Exigir-Propriedade $manifestoExterno 'version' 'manifesto externo') -ne $version) {
            throw 'Versao do manifesto externo diverge do release.json.'
        }
        if ([string](Exigir-Propriedade $manifestoExterno 'commit' 'manifesto externo') -ne $commit -or
            [string](Exigir-Propriedade $manifestoExterno 'buildTimestamp' 'manifesto externo') -ne $buildTimestamp) {
            throw 'Commit ou timestamp do manifesto externo diverge do release.json.'
        }
        if ([string](Exigir-Propriedade $manifestoRuntime 'path' 'manifesto externo.runtimeManifest') -ne 'release.json') {
            throw 'Caminho do manifesto de runtime externo invalido.'
        }
    }

    $resultado = [pscustomobject]@{
        Valid = $true
        Version = $version
        ZipPath = $ZipPath
        FileCount = $entradas.Count
        UncompressedBytes = $total
        CompressedBytes = $totalComprimido
        Sha256 = $hashZip
    }
    Write-Host ("Pacote runtime valido: v{0} | {1} arquivos | SHA-256 {2}" -f $version, $entradas.Count, $hashZip) -ForegroundColor Green
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
