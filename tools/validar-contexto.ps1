<#
    validar-contexto.ps1 - valida o mapa L0/L1/L2 do PMO Tool.

    Compativel com Windows PowerShell 5.1 e sem dependencias externas.

    Uso:
      .\tools\validar-contexto.ps1
      .\tools\validar-contexto.ps1 -Detalhado
      .\tools\validar-contexto.ps1 -Raiz C:\caminho\pmo-tool
#>
[CmdletBinding()]
param(
    [string] $Raiz,
    [switch] $Detalhado
)

$ErrorActionPreference = 'Stop'
$utf8Console = New-Object System.Text.UTF8Encoding($false)
try { [Console]::OutputEncoding = $utf8Console } catch { }
$OutputEncoding = $utf8Console

if ([string]::IsNullOrWhiteSpace($Raiz)) {
    $Raiz = Split-Path -Parent $PSScriptRoot
}

$raizResolvida = [System.IO.Path]::GetFullPath($Raiz).TrimEnd('\', '/')
$indicePath = Join-Path $raizResolvida 'docs\context\index.json'
$utf8Estrito = New-Object System.Text.UTF8Encoding($false, $true)
$erros = New-Object System.Collections.ArrayList
$avisos = New-Object System.Collections.ArrayList

function Adicionar-Erro([string] $Mensagem) {
    [void]$erros.Add($Mensagem)
}

function Adicionar-Aviso([string] $Mensagem) {
    [void]$avisos.Add($Mensagem)
}

function Resolver-CaminhoContexto([string] $Relativo, [string] $Campo) {
    if ([string]::IsNullOrWhiteSpace($Relativo)) {
        Adicionar-Erro ($Campo + ': caminho vazio.')
        return $null
    }
    if ([System.IO.Path]::IsPathRooted($Relativo)) {
        Adicionar-Erro ($Campo + ': caminho deve ser relativo a raiz: ' + $Relativo)
        return $null
    }

    try {
        $completo = [System.IO.Path]::GetFullPath((Join-Path $raizResolvida $Relativo))
    }
    catch {
        Adicionar-Erro ($Campo + ': caminho invalido ' + $Relativo + ' (' + $_.Exception.Message + ').')
        return $null
    }

    $prefixo = $raizResolvida + [System.IO.Path]::DirectorySeparatorChar
    if (-not $completo.Equals($raizResolvida, [System.StringComparison]::OrdinalIgnoreCase) -and
        -not $completo.StartsWith($prefixo, [System.StringComparison]::OrdinalIgnoreCase)) {
        Adicionar-Erro ($Campo + ': caminho escapa da raiz: ' + $Relativo)
        return $null
    }
    return $completo
}

function Testar-TextoSeguro([string] $Caminho, [string] $Rotulo) {
    if (-not (Test-Path -LiteralPath $Caminho -PathType Leaf)) { return }
    try {
        $texto = [System.IO.File]::ReadAllText($Caminho, $utf8Estrito)
    }
    catch {
        Adicionar-Erro ($Rotulo + ': arquivo nao e UTF-8 valido (' + $_.Exception.Message + ').')
        return
    }

    for ($i = 0; $i -lt $texto.Length; $i++) {
        $codigo = [int][char]$texto[$i]
        if (($codigo -lt 32 -and $codigo -ne 9 -and $codigo -ne 10 -and $codigo -ne 13) -or
            $codigo -eq 127) {
            Adicionar-Erro ($Rotulo + ': caractere de controle U+' + $codigo.ToString('X4') +
                ' na posicao ' + $i + '.')
            return
        }
    }
}

Write-Host ''
Write-Host '=== PMO Tool :: contexto L0/L1/L2 ===' -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $indicePath -PathType Leaf)) {
    Write-Host ('FALHA: indice nao encontrado: ' + $indicePath) -ForegroundColor Red
    exit 1
}

try {
    $indiceTexto = [System.IO.File]::ReadAllText($indicePath, $utf8Estrito)
    $indice = $indiceTexto | ConvertFrom-Json
}
catch {
    Write-Host ('FALHA: index.json invalido ou fora de UTF-8: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}

if ($indice.schemaVersion -ne 1) {
    Adicionar-Erro ('schemaVersion do indice deve ser 1; recebido: ' + [string]$indice.schemaVersion)
}

$maxCaracteres = [int]$indice.constraints.l0MaxCharacters
$maxPalavras = [int]$indice.constraints.l0MaxWords
if ($maxCaracteres -lt 80 -or $maxCaracteres -gt 1000) {
    Adicionar-Erro 'constraints.l0MaxCharacters deve estar entre 80 e 1000.'
}
if ($maxPalavras -lt 10 -or $maxPalavras -gt 200) {
    Adicionar-Erro 'constraints.l0MaxWords deve estar entre 10 e 200.'
}

$tiposPermitidos = @('protocol', 'domain', 'runbook')
$criticidadesPermitidas = @('critical', 'high', 'medium', 'low')
$entradas = @($indice.entries)
$porId = @{}
$l1PorCaminho = @{}
$arquivosTexto = @{}

if ($entradas.Count -eq 0) {
    Adicionar-Erro 'entries deve conter ao menos uma entrada.'
}

foreach ($entrada in $entradas) {
    $id = [string]$entrada.id
    if ($id -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
        Adicionar-Erro ('id invalido (use kebab-case): ' + $id)
    }
    elseif ($porId.ContainsKey($id)) {
        Adicionar-Erro ('id duplicado: ' + $id)
    }
    else {
        $porId[$id] = $entrada
    }

    if ([string]::IsNullOrWhiteSpace([string]$entrada.title)) {
        Adicionar-Erro ('entrada ' + $id + ': title vazio.')
    }
    if ($tiposPermitidos -notcontains [string]$entrada.kind) {
        Adicionar-Erro ('entrada ' + $id + ': kind invalido: ' + [string]$entrada.kind)
    }
    if ($criticidadesPermitidas -notcontains [string]$entrada.criticality) {
        Adicionar-Erro ('entrada ' + $id + ': criticality invalida: ' + [string]$entrada.criticality)
    }

    $l0 = [string]$entrada.l0
    $palavras = @([System.Text.RegularExpressions.Regex]::Matches($l0.Trim(), '\S+')).Count
    if ([string]::IsNullOrWhiteSpace($l0)) {
        Adicionar-Erro ('entrada ' + $id + ': L0 vazio.')
    }
    if ($l0.Length -gt $maxCaracteres) {
        Adicionar-Erro ('entrada ' + $id + ': L0 tem ' + $l0.Length +
            ' caracteres; limite ' + $maxCaracteres + '.')
    }
    if ($palavras -gt $maxPalavras) {
        Adicionar-Erro ('entrada ' + $id + ': L0 tem ' + $palavras +
            ' palavras; limite ' + $maxPalavras + '.')
    }

    $l1Relativo = [string]$entrada.l1
    $l1Completo = Resolver-CaminhoContexto $l1Relativo ('entrada ' + $id + '.l1')
    if ($l1Completo) {
        if (-not (Test-Path -LiteralPath $l1Completo -PathType Leaf)) {
            Adicionar-Erro ('entrada ' + $id + ': L1 nao existe: ' + $l1Relativo)
        }
        else {
            $chaveL1 = $l1Completo.ToLowerInvariant()
            if ($l1PorCaminho.ContainsKey($chaveL1)) {
                Adicionar-Erro ('L1 compartilhado por ' + $l1PorCaminho[$chaveL1] + ' e ' + $id +
                    ': ' + $l1Relativo)
            }
            else { $l1PorCaminho[$chaveL1] = $id }
            $arquivosTexto[$chaveL1] = @{ caminho = $l1Completo; rotulo = 'L1 ' + $id }
        }
    }

    $l2Itens = @($entrada.l2)
    if ($l2Itens.Count -eq 0) {
        Adicionar-Erro ('entrada ' + $id + ': l2 deve conter ao menos um caminho.')
    }
    $l2Vistos = @{}
    foreach ($l2Item in $l2Itens) {
        $l2Relativo = [string]$l2Item
        if ($l2Vistos.ContainsKey($l2Relativo.ToLowerInvariant())) {
            Adicionar-Erro ('entrada ' + $id + ': caminho L2 duplicado: ' + $l2Relativo)
            continue
        }
        $l2Vistos[$l2Relativo.ToLowerInvariant()] = $true
        $l2Completo = Resolver-CaminhoContexto $l2Relativo ('entrada ' + $id + '.l2')
        if ($l2Completo) {
            if (-not (Test-Path -LiteralPath $l2Completo -PathType Leaf)) {
                Adicionar-Erro ('entrada ' + $id + ': L2 nao existe: ' + $l2Relativo)
            }
            else {
                $arquivosTexto[$l2Completo.ToLowerInvariant()] = @{
                    caminho = $l2Completo; rotulo = 'L2 ' + $id
                }
            }
        }
    }

    $tags = @($entrada.tags)
    if ($tags.Count -eq 0) {
        Adicionar-Erro ('entrada ' + $id + ': tags vazio.')
    }
    $tagsVistas = @{}
    foreach ($tagItem in $tags) {
        $tag = [string]$tagItem
        if ($tag -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
            Adicionar-Erro ('entrada ' + $id + ': tag invalida: ' + $tag)
        }
        if ($tagsVistas.ContainsKey($tag)) {
            Adicionar-Erro ('entrada ' + $id + ': tag duplicada: ' + $tag)
        }
        else { $tagsVistas[$tag] = $true }
    }
}

# Relacoes e consumedBy derivado.
$consumidoPor = @{}
foreach ($id in $porId.Keys) { $consumidoPor[$id] = New-Object System.Collections.ArrayList }

foreach ($entrada in $entradas) {
    $id = [string]$entrada.id
    if (-not $porId.ContainsKey($id)) { continue }
    $depsVistas = @{}
    foreach ($depItem in @($entrada.dependsOn)) {
        $dep = [string]$depItem
        if ($depsVistas.ContainsKey($dep)) {
            Adicionar-Erro ('entrada ' + $id + ': dependencia duplicada: ' + $dep)
            continue
        }
        $depsVistas[$dep] = $true
        if ($dep -eq $id) {
            Adicionar-Erro ('entrada ' + $id + ': dependencia de si mesma.')
        }
        elseif (-not $porId.ContainsKey($dep)) {
            Adicionar-Erro ('entrada ' + $id + ': dependencia inexistente: ' + $dep)
        }
        else {
            [void]$consumidoPor[$dep].Add($id)
        }
    }
}

# Deteccao de ciclos por busca em profundidade.
$estadoVisita = @{}
$pilhaVisita = New-Object System.Collections.ArrayList
$ciclosVistos = @{}

function Visitar-Entrada([string] $Id) {
    if ($estadoVisita.ContainsKey($Id) -and $estadoVisita[$Id] -eq 2) { return }
    if ($estadoVisita.ContainsKey($Id) -and $estadoVisita[$Id] -eq 1) { return }

    $estadoVisita[$Id] = 1
    [void]$pilhaVisita.Add($Id)
    foreach ($depItem in @($porId[$Id].dependsOn)) {
        $dep = [string]$depItem
        if (-not $porId.ContainsKey($dep)) { continue }
        if ($estadoVisita.ContainsKey($dep) -and $estadoVisita[$dep] -eq 1) {
            $inicio = $pilhaVisita.IndexOf($dep)
            $partes = @()
            if ($inicio -ge 0) {
                for ($n = $inicio; $n -lt $pilhaVisita.Count; $n++) {
                    $partes += [string]$pilhaVisita[$n]
                }
            }
            $partes += $dep
            $ciclo = $partes -join ' -> '
            if (-not $ciclosVistos.ContainsKey($ciclo)) {
                $ciclosVistos[$ciclo] = $true
                Adicionar-Erro ('ciclo de dependencia: ' + $ciclo)
            }
        }
        elseif (-not $estadoVisita.ContainsKey($dep) -or $estadoVisita[$dep] -eq 0) {
            Visitar-Entrada $dep
        }
    }
    if ($pilhaVisita.Count -gt 0) { $pilhaVisita.RemoveAt($pilhaVisita.Count - 1) }
    $estadoVisita[$Id] = 2
}

foreach ($id in @($porId.Keys | Sort-Object)) { Visitar-Entrada $id }

# Contratos minimos observaveis em L2.
$contratos = @($indice.contracts)
$contratosPorId = @{}
foreach ($contrato in $contratos) {
    $idContrato = [string]$contrato.id
    if ($idContrato -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
        Adicionar-Erro ('contrato com id invalido: ' + $idContrato)
    }
    elseif ($contratosPorId.ContainsKey($idContrato)) {
        Adicionar-Erro ('contrato duplicado: ' + $idContrato)
    }
    else { $contratosPorId[$idContrato] = $true }

    $owner = [string]$contrato.ownerId
    if (-not $porId.ContainsKey($owner)) {
        Adicionar-Erro ('contrato ' + $idContrato + ': ownerId inexistente: ' + $owner)
    }

    $relativo = [string]$contrato.path
    $completo = Resolver-CaminhoContexto $relativo ('contrato ' + $idContrato + '.path')
    if (-not $completo) { continue }
    if (-not (Test-Path -LiteralPath $completo -PathType Leaf)) {
        Adicionar-Erro ('contrato ' + $idContrato + ': arquivo nao existe: ' + $relativo)
        continue
    }

    $arquivosTexto[$completo.ToLowerInvariant()] = @{
        caminho = $completo; rotulo = 'contrato ' + $idContrato
    }
    try { $conteudo = [System.IO.File]::ReadAllText($completo, $utf8Estrito) }
    catch {
        Adicionar-Erro ('contrato ' + $idContrato + ': arquivo nao e UTF-8 valido.')
        continue
    }

    $padroes = @($contrato.requiredPatterns)
    if ($padroes.Count -eq 0) {
        Adicionar-Erro ('contrato ' + $idContrato + ': requiredPatterns vazio.')
    }
    foreach ($padraoItem in $padroes) {
        $padrao = [string]$padraoItem
        try {
            $achou = [System.Text.RegularExpressions.Regex]::IsMatch(
                $conteudo,
                $padrao,
                [System.Text.RegularExpressions.RegexOptions]::Multiline
            )
            if (-not $achou) {
                Adicionar-Erro ('contrato ' + $idContrato + ': padrao ausente em ' +
                    $relativo + ': ' + $padrao)
            }
        }
        catch {
            Adicionar-Erro ('contrato ' + $idContrato + ': regex invalida ' + $padrao + '.')
        }
    }
}

# UTF-8 e caracteres de controle no indice e em todo arquivo referenciado.
Testar-TextoSeguro $indicePath 'index.json'
foreach ($item in $arquivosTexto.Values) {
    Testar-TextoSeguro $item.caminho $item.rotulo
}

if ($Detalhado) {
    Write-Host ''
    Write-Host 'Relacoes inversas (consumedBy):' -ForegroundColor DarkCyan
    foreach ($id in @($porId.Keys | Sort-Object)) {
        $consumidores = @($consumidoPor[$id] | Sort-Object)
        $textoConsumidores = if ($consumidores.Count) { $consumidores -join ', ' } else { '-' }
        Write-Host ('  ' + $id + ' <- ' + $textoConsumidores)
    }
}

Write-Host ''
Write-Host ('Entradas: {0}  Contratos: {1}  Arquivos verificados: {2}' -f
    $entradas.Count, $contratos.Count, ($arquivosTexto.Count + 1))

foreach ($aviso in $avisos) { Write-Host ('AVISO: ' + $aviso) -ForegroundColor Yellow }

if ($erros.Count -gt 0) {
    Write-Host ''
    foreach ($erro in $erros) { Write-Host ('FALHA: ' + $erro) -ForegroundColor Red }
    Write-Host ''
    Write-Host ('Contexto invalido: ' + $erros.Count + ' erro(s).') -ForegroundColor Red
    exit 1
}

Write-Host 'Contexto valido.' -ForegroundColor Green
exit 0
