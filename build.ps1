<#
    build.ps1 - PMO Tool

    Compila src/ em um unico HTML autocontido. O resultado e reproduzivel:
    nenhum valor e obtido do relogio de parede. Metadados podem ser informados
    por parametros ou pelas variaveis PMO_BUILD_VERSION, PMO_BUILD_COMMIT e
    PMO_BUILD_TIMESTAMP.

    Compatibilidade: Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [Alias('Versao')]
    [string] $Version = $env:PMO_BUILD_VERSION,

    [string] $Commit = $env:PMO_BUILD_COMMIT,

    [string] $BuildTimestamp = $env:PMO_BUILD_TIMESTAMP,

    [string] $OutputPath,

    [switch] $Verboso
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $raiz 'src'
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)
$novaLinha = "`n"

function Escrever([string] $Texto, [string] $Cor) {
    if ($Cor) {
        Write-Host $Texto -ForegroundColor $Cor
    }
    else {
        Write-Host $Texto
    }
}

function Normalizar-Quebras([string] $Texto) {
    return $Texto.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Ler-TextoUtf8([string] $Caminho) {
    return Normalizar-Quebras ([System.IO.File]::ReadAllText($Caminho, [System.Text.Encoding]::UTF8))
}

function Escapar-AtributoHtml([string] $Valor) {
    return [System.Security.SecurityElement]::Escape($Valor)
}

function Obter-VersaoFonte([string] $CaminhoModelo) {
    $conteudo = Ler-TextoUtf8 $CaminhoModelo
    $match = [regex]::Match($conteudo, 'model\.APP_VERSION\s*=\s*[''"](?<version>[^''"]+)[''"]')
    if (-not $match.Success) {
        throw "Nao foi possivel localizar model.APP_VERSION em $CaminhoModelo"
    }
    return $match.Groups['version'].Value
}

function Normalizar-Timestamp([string] $Valor) {
    if ($Valor -match '^\d+$') {
        try {
            return [DateTimeOffset]::FromUnixTimeSeconds([long]$Valor).UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
        }
        catch {
            throw "SOURCE_DATE_EPOCH invalido: $Valor"
        }
    }

    try {
        $estilos = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
        $data = [DateTimeOffset]::Parse($Valor, [Globalization.CultureInfo]::InvariantCulture, $estilos)
        return $data.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    catch {
        throw "BuildTimestamp invalido. Use ISO 8601 ou SOURCE_DATE_EPOCH: $Valor"
    }
}

$shell = Join-Path $src 'shell.html'
$modelo = Join-Path (Join-Path $src 'js') '10-model.js'
if (-not (Test-Path -LiteralPath $shell -PathType Leaf)) {
    throw "Nao encontrei o esqueleto: $shell"
}
if (-not (Test-Path -LiteralPath $modelo -PathType Leaf)) {
    throw "Nao encontrei o modelo: $modelo"
}

$versaoFonte = Obter-VersaoFonte $modelo
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $versaoFonte
}
if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "Version deve ser SemVer estavel (X.Y.Z), sem prefixo v: $Version"
}
if ($Version -ne $versaoFonte) {
    throw "Version ($Version) diverge de model.APP_VERSION ($versaoFonte)."
}

if ([string]::IsNullOrWhiteSpace($Commit)) {
    if (Test-Path -LiteralPath (Join-Path $raiz '.git')) {
        $Commit = (& git -C $raiz rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -ne 0) {
            throw 'Falha ao obter o commit Git do build.'
        }
    }
    else {
        $Commit = 'local'
    }
}
$Commit = $Commit.Trim().ToLowerInvariant()
if ($Commit -notmatch '^(?:[0-9a-f]{7,64}|local)$') {
    throw "Commit invalido: $Commit"
}

if ([string]::IsNullOrWhiteSpace($BuildTimestamp)) {
    if (-not [string]::IsNullOrWhiteSpace($env:SOURCE_DATE_EPOCH)) {
        $BuildTimestamp = $env:SOURCE_DATE_EPOCH
    }
    elseif ($Commit -ne 'local' -and (Test-Path -LiteralPath (Join-Path $raiz '.git'))) {
        $BuildTimestamp = (& git -C $raiz show -s --format=%cI $Commit 2>$null)
        if ($LASTEXITCODE -ne 0) {
            throw 'Falha ao obter o timestamp do commit Git.'
        }
    }
    else {
        # Valor deliberadamente fixo para builds locais sem Git.
        $BuildTimestamp = '1970-01-01T00:00:00Z'
    }
}
$BuildTimestamp = Normalizar-Timestamp $BuildTimestamp.Trim()

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path (Join-Path $raiz 'dist') 'pmo-tool.html'
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $raiz $OutputPath
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$diretorioSaida = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $diretorioSaida -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $diretorioSaida | Out-Null
}

Escrever '' ''
Escrever '=== PMO Tool :: build reproduzivel ===' 'Cyan'

$cssDir = Join-Path $src 'css'
$cssArquivos = @()
if (Test-Path -LiteralPath $cssDir -PathType Container) {
    $cssArquivos = @(Get-ChildItem -LiteralPath $cssDir -Filter '*.css' -File | Sort-Object Name)
}
$secoesCss = @()
foreach ($arquivo in $cssArquivos) {
    if ($Verboso) {
        Escrever ("  css  " + $arquivo.Name) 'DarkGray'
    }
    $secoesCss += ("/* ==== " + $arquivo.Name + " ==== */" + $novaLinha + (Ler-TextoUtf8 $arquivo.FullName))
}

$jsDir = Join-Path $src 'js'
$jsArquivos = @()
if (Test-Path -LiteralPath $jsDir -PathType Container) {
    $jsArquivos = @(Get-ChildItem -LiteralPath $jsDir -Filter '*.js' -File | Sort-Object Name)
}
if ($jsArquivos.Count -eq 0) {
    throw "Nenhum arquivo .js em $jsDir"
}

$secoesJs = @()
$problemas = @()
foreach ($arquivo in $jsArquivos) {
    if ($Verboso) {
        Escrever ("  js   " + $arquivo.Name) 'DarkGray'
    }
    $conteudo = Ler-TextoUtf8 $arquivo.FullName
    if ($conteudo -match '(?i)</script') {
        $problemas += ("[" + $arquivo.Name + "] contem '</script' literal")
    }
    $secoesJs += ("/* ======================= " + $arquivo.Name + " ======================= */" + $novaLinha + $conteudo)
}
if ($problemas.Count -gt 0) {
    throw ("Violacoes de guardrail:`n  - " + ($problemas -join "`n  - "))
}

$html = Ler-TextoUtf8 $shell
if ($html -notmatch '<!--@inject:css-->') {
    throw 'shell.html sem marcador <!--@inject:css-->'
}
if ($html -notmatch '<!--@inject:js-->') {
    throw 'shell.html sem marcador <!--@inject:js-->'
}
if ($html -notmatch '@@BUILD_VERSION@@') {
    throw 'shell.html sem marcador @@BUILD_VERSION@@'
}

$blocoCss = '<style>' + $novaLinha + ($secoesCss -join ($novaLinha + $novaLinha)) + $novaLinha + '</style>'
$blocoJs = '<script>' + $novaLinha + ($secoesJs -join ($novaLinha + $novaLinha)) + $novaLinha + '<' + '/script>'
$metadados = @(
    '<meta name="pmo-app-version" content="' + (Escapar-AtributoHtml $Version) + '">',
    '<meta name="pmo-build-commit" content="' + (Escapar-AtributoHtml $Commit) + '">',
    '<meta name="pmo-build-timestamp" content="' + (Escapar-AtributoHtml $BuildTimestamp) + '">'
) -join $novaLinha

$html = $html.Replace('<!--@inject:css-->', $blocoCss)
$html = $html.Replace('<!--@inject:js-->', $blocoJs)
$html = $html.Replace('@@BUILD_VERSION@@', $Version)
$fechamentoHead = [regex]'(?i)</head>'
if (-not $fechamentoHead.IsMatch($html)) {
    throw 'shell.html sem elemento </head> para metadados de build.'
}
# A sobrecarga estatica Regex.Replace(..., 1) interpreta o quarto argumento
# como RegexOptions.IgnoreCase e substituiria *todas* as ocorrencias, inclusive
# literais "</head>" dentro do JavaScript injetado. A instancia oferece o
# contrato inequívoco de substituir somente o primeiro fechamento real.
$html = $fechamentoHead.Replace($html, ($metadados + $novaLinha + '</head>'), 1)
$html = Normalizar-Quebras $html

$violacoes = @()
$recursos = [regex]::Matches($html, '(?i)(?:src|href)\s*=\s*["'']\s*(https?:)?//[^"'']+')
foreach ($recurso in $recursos) {
    $violacoes += ("recurso externo: " + $recurso.Value)
}
$imports = [regex]::Matches($html, '(?i)@import\s+(?:url\()?["'']?\s*(https?:)?//')
foreach ($import in $imports) {
    $violacoes += ("@import externo: " + $import.Value)
}
$chamadas = [regex]::Matches($html, '(?i)(?:fetch|XMLHttpRequest[^;]{0,80}open)\s*\(\s*["'']https?://')
foreach ($chamada in $chamadas) {
    $violacoes += ("chamada de rede externa: " + $chamada.Value)
}
if ($violacoes.Count -gt 0) {
    throw ("Build nao autocontido:`n  - " + (($violacoes | Select-Object -Unique) -join "`n  - "))
}

[System.IO.File]::WriteAllText($OutputPath, $html, $utf8SemBom)
$hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
$tamanhoKb = [math]::Round((Get-Item -LiteralPath $OutputPath).Length / 1KB, 1)
$linhas = ($html -split "`n").Count

Escrever ("  css           : " + $cssArquivos.Count + " arquivo(s)") ''
Escrever ("  js            : " + $jsArquivos.Count + " arquivo(s)") ''
Escrever ("  versao        : " + $Version) ''
Escrever ("  commit        : " + $Commit) ''
Escrever ("  timestamp     : " + $BuildTimestamp) ''
Escrever ("  linhas        : " + $linhas) ''
Escrever ("  tamanho       : " + $tamanhoKb + " KB") ''
Escrever ("  sha256        : " + $hash) ''
Escrever ("  saida         : " + $OutputPath) 'Green'
Escrever '  guardrails    : OK' 'Green'
Escrever '' ''
