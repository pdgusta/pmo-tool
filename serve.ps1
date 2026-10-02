<#
    serve.ps1 — PMO Tool
    Servidor HTTP local usando System.Net.HttpListener (nativo do Windows).
    Sem Node, sem Python, sem instalacao. Windows PowerShell 5.1.

    Porta padrao: 8090  (8080 esta ocupada por outro app do usuario)

    Uso:  .\serve.ps1
          .\serve.ps1 -Porta 8099
          .\serve.ps1 -SemBrowser
          .\serve.ps1 -SemBuild

    Endpoints da API de persistencia e operacao (somente loopback):
      GET    /api/health
      GET    /api/portfolio                 -> portfolio.json (204 se nao existe)
      PUT    /api/portfolio                 <- grava portfolio.json (+ backup rotativo)
      GET    /api/attachments               -> indice de anexos em disco
      GET    /api/attachments/<id>          -> binario do anexo
      PUT    /api/attachments/<id>          <- grava binario (cabecalho X-File-Name)
      DELETE /api/attachments/<id>
      GET    /api/samples                   -> lista de arquivos de exemplo
      GET    /samples/<arquivo>             -> arquivo de exemplo
      GET    /api/templates                 -> lista de cronogramas-modelo (MSPDI)
      GET    /templates/<arquivo>           -> cronograma-modelo
      POST   /api/protecao/snapshot         <- snapshot de protecao antes de Limpar/Substituir (token)
      POST   /api/copia-verificavel/exportar <- copia verificavel para pasta escolhida pela PMO (token)
      POST   /api/copia-verificavel/conferir <- confere copia ja exportada, somente leitura (token)
      GET    /api/copia-verificavel/sugestoes <- destinos sugeridos e ultimo destino usado (token)
    Ctrl+C encerra.
#>
[CmdletBinding()]
param(
    [int]    $Porta = 8090,
    [string] $DataDir,
    [string] $ConfigDir,
    [string] $StateDir,
    [string] $AdminToken,
    [string] $ActivationId,
    [string] $UrlInicial,
    [switch] $SemBrowser,
    [switch] $SemBuild,
    [switch] $HealthOnly
)

$ErrorActionPreference = 'Stop'
$raiz     = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$commonPs1 = Join-Path $raiz 'tools\portable-common.ps1'
if (-not (Test-Path -LiteralPath $commonPs1)) { throw "Contrato portatil ausente: $commonPs1" }
. $commonPs1
$null = Assert-PmoPathWithoutReparse $raiz
$null = Assert-PmoPathWithoutReparse $commonPs1

$emVersaoPortatil = $raiz -match '[\\/]versions[\\/][^\\/]+$'
if ([string]::IsNullOrWhiteSpace($DataDir)) {
    if ($emVersaoPortatil) { throw 'Runtime portatil exige -DataDir explicito.' }
    $DataDir = Join-Path $raiz 'data'
}
if ([string]::IsNullOrWhiteSpace($ConfigDir)) {
    if ($emVersaoPortatil) { throw 'Runtime portatil exige -ConfigDir explicito.' }
    $ConfigDir = Join-Path $raiz 'config'
}
if ([string]::IsNullOrWhiteSpace($StateDir)) {
    if ($emVersaoPortatil) { throw 'Runtime portatil exige -StateDir explicito.' }
    $StateDir = Join-Path $raiz 'state'
}

$dataDir  = [System.IO.Path]::GetFullPath($DataDir)
$configDir = [System.IO.Path]::GetFullPath($ConfigDir)
$stateDir = [System.IO.Path]::GetFullPath($StateDir)
$installRoot = if ($emVersaoPortatil) { Split-Path -Parent (Split-Path -Parent $raiz) } else { $raiz }
$versionsDir = Join-Path $installRoot 'versions'
$stagingDir = Join-Path $installRoot 'staging'
$logsDir = Join-Path $installRoot 'logs'
$null = Assert-PmoPathWithoutReparse $installRoot
foreach ($rootPath in @($dataDir,$configDir,$stateDir,$versionsDir,$stagingDir,$logsDir)) {
    $null = Assert-PmoPathWithoutReparse $rootPath
}
function Test-CaminhosIguaisOuAninhados([string]$A, [string]$B) {
    return (Test-PmoPathEqualOrSubPath $A $B) -or (Test-PmoPathEqualOrSubPath $B $A)
}
if ($emVersaoPortatil) {
    $runtimeFull = Get-PmoNormalizedFullPath $raiz
    foreach ($persistente in @($dataDir,$configDir,$stateDir)) {
        $persistenteFull = Get-PmoNormalizedFullPath $persistente
        if ($persistenteFull.Equals($runtimeFull, [StringComparison]::OrdinalIgnoreCase) -or
            (Test-PmoSubPath $runtimeFull $persistenteFull)) {
            throw 'Diretorios persistentes nao podem ficar dentro de versions/<versao>.'
        }
    }
}
$diretoriosPersistentes = @($dataDir,$configDir,$stateDir)
for ($iPersistente=0; $iPersistente -lt $diretoriosPersistentes.Count; $iPersistente++) {
    for ($jPersistente=$iPersistente+1; $jPersistente -lt $diretoriosPersistentes.Count; $jPersistente++) {
        if (Test-CaminhosIguaisOuAninhados $diretoriosPersistentes[$iPersistente] $diretoriosPersistentes[$jPersistente]) {
            throw 'DataDir, ConfigDir e StateDir devem ser diretorios distintos e nao aninhados.'
        }
    }
}
$operacionaisSempreBloqueados = @($versionsDir,$logsDir)
foreach ($persistente in $diretoriosPersistentes) {
    foreach ($operacional in $operacionaisSempreBloqueados) {
        if (Test-CaminhosIguaisOuAninhados $persistente $operacional) {
            throw 'Diretorios persistentes nao podem coincidir nem se sobrepor a versions/ ou logs/.'
        }
    }
}
if (-not $HealthOnly) {
    foreach ($persistente in $diretoriosPersistentes) {
        if (Test-CaminhosIguaisOuAninhados $persistente $stagingDir) {
            throw 'Diretorios persistentes nao podem coincidir nem se sobrepor a staging/.'
        }
    }
} else {
    $sobrepostosAoStaging = @($diretoriosPersistentes | Where-Object { Test-CaminhosIguaisOuAninhados $_ $stagingDir })
    if ($sobrepostosAoStaging.Count -gt 0) {
        $testRoot = Get-PmoNormalizedFullPath (Split-Path -Parent $dataDir)
        $sameParent = $true
        foreach ($persistente in $diretoriosPersistentes) {
            $parent = Get-PmoNormalizedFullPath (Split-Path -Parent $persistente)
            if (-not $parent.Equals($testRoot,[StringComparison]::OrdinalIgnoreCase)) { $sameParent = $false }
        }
        if ($sobrepostosAoStaging.Count -ne 3 -or -not $sameParent -or -not (Test-PmoSubPath $stagingDir $testRoot)) {
            throw 'HealthOnly so pode usar staging/ com DataDir, ConfigDir e StateDir como siblings sob o mesmo test root.'
        }
    }
}
$dist     = Join-Path $raiz 'dist'
$appHtml  = Join-Path $dist 'pmo-tool.html'
$anexoDir = Join-Path $dataDir 'attachments'
$bkpDir   = Join-Path $dataDir 'backups'
$updateBkpDir = Join-Path $dataDir 'update-backups'
$protecaoSnapDir = Join-Path $bkpDir 'snapshots'
$userTmplDir = Join-Path $dataDir 'user-templates'
$sampDir  = Join-Path $raiz 'samples'
$factoryTmplDir = if (Test-Path -LiteralPath (Join-Path $raiz 'templates\factory')) { Join-Path $raiz 'templates\factory' } else { Join-Path $raiz 'templates' }
$portJson = Join-Path $dataDir 'portfolio.json'
$installJson = Join-Path $configDir 'install.json'
$activeJson = Join-Path $stateDir 'active.json'
$updateJson = Join-Path $stateDir 'update.json'
$updateLock = Join-Path $stateDir 'update.lock'
$appReadyJson = Join-Path $stateDir 'app-ready.json'
$restorePendingJson = Join-Path $stateDir 'restore-pending.json'
$restoreAckJson = Join-Path $stateDir 'restore-ack.json'
$restoreJournalJson = Join-Path $stateDir 'restore.json'
$recoveryRoot = Join-Path $dataDir 'recovery'
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)
$script:maintenance = $false
$script:encerrarAposResposta = $false
$maxPortfolioBytes = [Int64]67108864
$maxAttachmentBytes = [Int64]268435456
$maxAdminJsonBytes = [Int64]4194304

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
    # O modo direto (serve.ps1) tambem precisa de protecao contra CSRF local.
    # O token gerado fica disponivel somente no HTML servido nesta sessao.
    $AdminToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
}
if (-not [string]::IsNullOrWhiteSpace($ActivationId) -and $ActivationId -notmatch '^[A-Za-z0-9_-]{16,128}$') {
    throw 'ActivationId invalido.'
}

$diretoriosCriaveis = @($dataDir, $anexoDir, $bkpDir, $updateBkpDir, $userTmplDir, $configDir, $stateDir)
if (-not $emVersaoPortatil) { $diretoriosCriaveis += @($sampDir, $factoryTmplDir, $dist) }
foreach ($d in $diretoriosCriaveis) {
    $null = Assert-PmoPathWithoutReparse $d
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    $null = Assert-PmoPathWithoutReparse $d
}
foreach ($highRiskPath in @($portJson,$installJson,$activeJson,$updateJson,$updateLock,$appReadyJson,$restorePendingJson,$restoreAckJson,$restoreJournalJson)) {
    $null = Assert-PmoPathWithoutReparse $highRiskPath
}

# --------------------------------------------------------------- build se preciso
if ($HealthOnly) { $SemBuild = $true; $SemBrowser = $true }
if (-not $SemBuild) {
    $buildPs1 = Join-Path $raiz 'build.ps1'
    if (Test-Path $buildPs1) {
        & $buildPs1
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "build.ps1 falhou" }
    }
}
if (-not (Test-Path $appHtml)) { throw "Nao encontrei $appHtml. Rode .\build.ps1 primeiro." }

$releaseInfo = Read-PmoJson (Join-Path $raiz 'release.json') $null
$activeInfo = Read-PmoJson $activeJson $null
# Em uma instalacao existe release.json. No modo de desenvolvimento nao existe,
# e a fonte da versao passa a ser o proprio modelo - um literal aqui envelhece
# a cada release e faz a tela de ajuda mentir.
$appVersion = if ($releaseInfo -and $releaseInfo.version) { [string]$releaseInfo.version } else {
    $modeloDev = Join-Path (Join-Path (Join-Path $raiz 'src') 'js') '10-model.js'
    $versaoDev = ''
    if (Test-Path -LiteralPath $modeloDev -PathType Leaf) {
        $achadoDev = [regex]::Match([System.IO.File]::ReadAllText($modeloDev, [System.Text.Encoding]::UTF8),
                                    'model\.APP_VERSION\s*=\s*[''"]([^''"]+)[''"]')
        if ($achadoDev.Success) { $versaoDev = $achadoDev.Groups[1].Value }
    }
    if ([string]::IsNullOrWhiteSpace($versaoDev)) { throw 'Nao foi possivel resolver a versao da aplicacao.' }
    $versaoDev
}
# release.json declara o schema em schema.write; schemaVersion e aceito por
# compatibilidade. Le pelas PSObject.Properties: sob Set-StrictMode 2.0 (herdado
# de portable-common.ps1) acessar propriedade inexistente lanca excecao.
$schemaVersion = 4
if ($releaseInfo) {
    $schemaVersionProp = $releaseInfo.PSObject.Properties['schemaVersion']
    $schemaProp = $releaseInfo.PSObject.Properties['schema']
    if ($null -ne $schemaVersionProp -and $schemaVersionProp.Value) {
        $schemaVersion = [int]$schemaVersionProp.Value
    } elseif ($null -ne $schemaProp -and $schemaProp.Value) {
        $writeProp = $schemaProp.Value.PSObject.Properties['write']
        if ($null -ne $writeProp -and $null -ne $writeProp.Value) { $schemaVersion = [int]$writeProp.Value }
    }
}
$buildId = if ($releaseInfo -and $releaseInfo.commit) { [string]$releaseInfo.commit } else { 'development' }

# ------------------------------------------------------------------------- MIME
$mime = @{
    '.html'='text/html; charset=utf-8';        '.htm' ='text/html; charset=utf-8'
    '.js'  ='text/javascript; charset=utf-8';  '.css' ='text/css; charset=utf-8'
    '.json'='application/json; charset=utf-8'; '.xml' ='application/xml; charset=utf-8'
    '.csv' ='text/csv; charset=utf-8';         '.txt' ='text/plain; charset=utf-8'
    '.md'  ='text/markdown; charset=utf-8';    '.ics' ='text/calendar; charset=utf-8'
    '.xer' ='text/plain; charset=utf-8';       '.pmxml'='application/xml; charset=utf-8'
    '.svg' ='image/svg+xml';                   '.png' ='image/png'
    '.jpg' ='image/jpeg';                      '.gif' ='image/gif'
    '.ico' ='image/x-icon';                    '.pdf' ='application/pdf'
    '.mpp' ='application/vnd.ms-project'
    '.xlsx'='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    '.docx'='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    '.pptx'='application/vnd.openxmlformats-officedocument.presentationml.presentation'
    '.zip' ='application/zip'
}
function TipoMime($caminho) {
    $ext = [System.IO.Path]::GetExtension($caminho).ToLowerInvariant()
    if ($mime.ContainsKey($ext)) { return $mime[$ext] }
    return 'application/octet-stream'
}

# -------------------------------------------------------------------- utilidades
function IdSeguro($bruto) {
    # Barra path traversal. Somente letras, digitos, ponto, hifen e underscore.
    if ([string]::IsNullOrWhiteSpace($bruto)) { return $null }
    $dec = [System.Uri]::UnescapeDataString($bruto)
    if ($dec -notmatch '^[A-Za-z0-9._-]{1,180}$') { return $null }
    if ($dec -eq '.' -or $dec -eq '..' -or $dec.Contains('..')) { return $null }
    return $dec
}

function JsonEscapar($s) {
    if ($null -eq $s) { return '' }
    $s = $s.Replace('\', '\\').Replace('"', '\"')
    $s = $s.Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t')
    return $s
}

$script:contadorReq = 0

function Responder($resp, $status, $corpoBytes, $tipo, $extras) {
    $resp.StatusCode  = $status
    if ($tipo) { $resp.ContentType = $tipo }
    $resp.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    $resp.Headers['X-Content-Type-Options'] = 'nosniff'
    if ($extras) { foreach ($k in $extras.Keys) { $resp.Headers[$k] = [string]$extras[$k] } }
    if ($null -ne $corpoBytes -and $corpoBytes.Length -gt 0) {
        $resp.ContentLength64 = $corpoBytes.Length
        $resp.OutputStream.Write($corpoBytes, 0, $corpoBytes.Length)
    } else {
        $resp.ContentLength64 = 0
    }
    $resp.OutputStream.Close()
}
function ResponderTexto($resp, $status, $texto, $tipo) {
    Responder $resp $status ($utf8SemBom.GetBytes([string]$texto)) $tipo $null
}
function ResponderJson($resp, $status, $json) {
    ResponderTexto $resp $status $json 'application/json; charset=utf-8'
}
function ResponderErro($resp, $status, $msg) {
    ResponderJson $resp $status ('{"ok":false,"erro":"' + (JsonEscapar $msg) + '"}')
}
function ResponderArquivo($resp, $caminho) {
    if (-not (Test-Path -LiteralPath $caminho -PathType Leaf)) { ResponderErro $resp 404 'arquivo nao encontrado'; return }
    $arquivo = Get-Item -LiteralPath $caminho
    $resp.StatusCode = 200
    $resp.ContentType = TipoMime $caminho
    $resp.ContentLength64 = [Int64]$arquivo.Length
    $resp.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    $resp.Headers['X-Content-Type-Options'] = 'nosniff'
    $resp.Headers['X-File-Name'] = [System.IO.Path]::GetFileName($caminho)
    $stream = [System.IO.File]::Open($caminho, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try { $stream.CopyTo($resp.OutputStream) }
    finally { $stream.Dispose(); $resp.OutputStream.Close() }
}
function ResponderApp($resp) {
    if (-not (Test-Path -LiteralPath $appHtml -PathType Leaf)) { ResponderErro $resp 404 'aplicacao nao encontrada'; return }
    $html = [System.IO.File]::ReadAllText($appHtml, [System.Text.Encoding]::UTF8)
    $metas = @('<meta name="pmo-admin-token" content="' + [System.Net.WebUtility]::HtmlEncode($AdminToken) + '">')
    if (-not [string]::IsNullOrWhiteSpace($ActivationId)) {
        $metas += '<meta name="pmo-activation-id" content="' + [System.Net.WebUtility]::HtmlEncode($ActivationId) + '">'
    }
    $fechamentoHead = [regex]'(?i)</head>'
    if (-not $fechamentoHead.IsMatch($html)) { ResponderErro $resp 500 'artefato sem fechamento de head'; return }
    # Injeta somente no fechamento real. String.Replace alteraria tambem os
    # literais "</head>" usados pelos exportadores dentro do script inline.
    $html = $fechamentoHead.Replace($html, (($metas -join [Environment]::NewLine) + [Environment]::NewLine + '</head>'), 1)
    ResponderTexto $resp 200 $html 'text/html; charset=utf-8'
}
function NovaExcecaoHttp($status, $mensagem) {
    $e = New-Object System.IO.InvalidDataException([string]$mensagem)
    $e.Data['HttpStatus'] = [int]$status
    return $e
}
function LerCorpoBytes($req, [Int64]$limite = 4194304) {
    if ($limite -le 0) { throw (NovaExcecaoHttp 500 'limite de corpo invalido') }
    if ($req.ContentLength64 -gt $limite) { throw (NovaExcecaoHttp 413 "corpo excede $limite bytes") }
    $ms = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 81920
    [Int64]$total = 0
    try {
        while (($lidos = $req.InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $total += [Int64]$lidos
            if ($total -gt $limite) { throw (NovaExcecaoHttp 413 "corpo excede $limite bytes") }
            $ms.Write($buffer, 0, $lidos)
        }
        # O operador unario ',' evita que o PowerShell "explode" um byte[] vazio
        # no pipeline e o achate para $null na atribuicao do chamador (corpo
        # vazio, ex.: POST sem body); com conteudo, preserva o array intacto.
        return ,$ms.ToArray()
    } finally { $ms.Dispose() }
}

function RequisicaoLoopback($req) {
    if ($null -eq $req.RemoteEndPoint) { return $false }
    return [System.Net.IPAddress]::IsLoopback($req.RemoteEndPoint.Address)
}

function HostLocalValido($req) {
    $hostRecebido = [string]$req.Headers['Host']
    $hostEsperado = 'localhost:' + $Porta
    return $hostRecebido.Equals($hostEsperado, [System.StringComparison]::OrdinalIgnoreCase)
}

function OrigemMutacaoValida($req) {
    $origem = [string]$req.Headers['Origin']
    if (-not [string]::IsNullOrWhiteSpace($origem)) {
        $esperada = 'http://localhost:' + $Porta
        if (-not $origem.TrimEnd('/').Equals($esperada, [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
    }
    $referer = [string]$req.Headers['Referer']
    if (-not [string]::IsNullOrWhiteSpace($referer)) {
        $prefixoReferer = 'http://localhost:' + $Porta + '/'
        if (-not $referer.StartsWith($prefixoReferer, [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
    }
    return $true
}

function TokenAdministrativoValido($req) {
    if (-not (RequisicaoLoopback $req)) { return $false }
    if (-not (HostLocalValido $req)) { return $false }
    if (-not (OrigemMutacaoValida $req)) { return $false }
    if ([string]::IsNullOrWhiteSpace($AdminToken)) { return $false }
    $recebido = [string]$req.Headers['X-PMO-Admin-Token']
    if ($recebido.Length -ne $AdminToken.Length) { return $false }
    [int]$diff = 0
    for ($i = 0; $i -lt $recebido.Length; $i++) { $diff = $diff -bor ([int][char]$recebido[$i] -bxor [int][char]$AdminToken[$i]) }
    return $diff -eq 0
}

function ExigirAdministracao($req, $resp) {
    if (TokenAdministrativoValido $req) { return $true }
    ResponderErro $resp 403 'operacao administrativa nao autorizada'
    return $false
}

function PodeEscreverDiretorio($dir) {
    $teste = Join-Path $dir ('.write-test-' + [Guid]::NewGuid().ToString('N'))
    try {
        [System.IO.File]::WriteAllText($teste, 'ok', $utf8SemBom)
        return $true
    } catch { return $false }
    finally { if (Test-Path -LiteralPath $teste) { Remove-Item -LiteralPath $teste -Force -ErrorAction SilentlyContinue } }
}
function LerCorpoTexto($req, [Int64]$limite = 4194304) {
    $b = LerCorpoBytes $req $limite
    if ($b.Length -eq 0) { return '' }
    return [System.Text.Encoding]::UTF8.GetString($b)
}

function Get-RetencaoBackups() {
    $cfg = Read-PmoJson $installJson $null
    $horas = 48
    $dias = 90
    if ($cfg) {
        $retencaoProp = $cfg.PSObject.Properties['retention']
        if ($null -ne $retencaoProp -and $retencaoProp.Value) {
            $retencao = $retencaoProp.Value
            $horasProp = $retencao.PSObject.Properties['portfolioBackupsHourlyHours']
            if ($null -ne $horasProp) {
                $horasInt = 0
                if ([int]::TryParse([string]$horasProp.Value, [ref]$horasInt)) {
                    $horas = [Math]::Max(48, $horasInt)
                }
            }
            $diasProp = $retencao.PSObject.Properties['portfolioBackupsDailyDays']
            if ($null -ne $diasProp) {
                $diasInt = 0
                if ([int]::TryParse([string]$diasProp.Value, [ref]$diasInt)) {
                    $dias = [Math]::Max(90, $diasInt)
                }
            }
        }
    }
    return [pscustomobject]@{ horasHorario = $horas; diasDiario = $dias }
}

# Retencao por janela de tempo (D-32 item 3, PROT-04): um backup por hora nas
# ultimas N horas e um por dia ate M dias, sempre mantendo o mais recente e
# qualquer arquivo com data futura. So considera portfolio-*.json direto em
# $bkpDir (nunca data/backups/snapshots/ nem outro arquivo).
function LimparBackupsPorJanela() {
    $retencao = Get-RetencaoBackups
    $agora = (Get-Date).ToUniversalTime()
    $arquivos = @(Get-ChildItem -LiteralPath $bkpDir -Filter 'portfolio-*.json' -File -ErrorAction SilentlyContinue |
        Sort-Object -Property @{Expression='LastWriteTimeUtc';Descending=$true}, @{Expression='Name';Descending=$true})
    if ($arquivos.Count -eq 0) { return }
    $manter = New-Object 'System.Collections.Generic.HashSet[string]'
    $null = $manter.Add($arquivos[0].FullName)
    $baldes = @{}
    foreach ($arquivo in $arquivos) {
        $modificado = $arquivo.LastWriteTimeUtc
        if ($modificado -gt $agora) {
            $null = $manter.Add($arquivo.FullName)
            continue
        }
        $idade = $agora - $modificado
        if ($idade.TotalHours -lt $retencao.horasHorario) {
            $chave = 'H' + $modificado.ToString('yyyyMMddHH')
        } elseif ($idade.TotalDays -lt $retencao.diasDiario) {
            $chave = 'D' + $modificado.ToString('yyyyMMdd')
        } else {
            continue
        }
        if (-not $baldes.ContainsKey($chave)) {
            $baldes[$chave] = $arquivo
            $null = $manter.Add($arquivo.FullName)
        }
    }
    foreach ($arquivo in $arquivos) {
        if ($manter.Contains($arquivo.FullName)) { continue }
        if (Test-PmoSubPath $bkpDir $arquivo.FullName) {
            Remove-Item -LiteralPath $arquivo.FullName -Force -ErrorAction SilentlyContinue
        }
    }
}

function RotacionarBackup() {
    if (-not (Test-Path -LiteralPath $portJson)) { return }
    $agora = (Get-Date).ToUniversalTime()
    $nome = 'portfolio-' + $agora.ToString('yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,4) + '.json'
    Copy-PmoFileDurable -Source $portJson -Destination (Join-Path $bkpDir $nome)
    LimparBackupsPorJanela
}

function EspacoLivre($path) {
    $root = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($path))
    $drive = New-Object System.IO.DriveInfo($root)
    return [Int64]$drive.AvailableFreeSpace
}

function NovaIdSnapshot() {
    return (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
}

function Test-AnexoCanonico($arquivo) {
    if ($null -eq $arquivo -or [bool]$arquivo.PSIsContainer) { return $false }
    $nome = [string]$arquivo.Name
    if ($nome.EndsWith('.previous', [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
    if ($nome.EndsWith('.replace-backup', [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
    if ($nome -match '(?i)\.tmp-[0-9a-f]{32}$' -or
        $nome -match '(?i)\.corrupt-[0-9]{14}-[0-9a-f]{8}$' -or
        $nome -like '.write-test-*') { return $false }
    $seguro = IdSeguro $nome
    return (-not [string]::IsNullOrWhiteSpace($seguro) -and $seguro -eq $nome)
}

function Repair-AnexoAtomico([string]$Id, $Bundle=$null, $ExpectedSize=$null, [string]$ExpectedSha256='') {
    $seguro = IdSeguro $Id
    if (-not $seguro -or $seguro -ne $Id) { return $false }
    $params = @{ Path=(Join-Path $anexoDir $seguro) }
    if ($null -ne $ExpectedSize) {
        $params.ExpectedSize = [Int64]$ExpectedSize
    } elseif ($Bundle) {
        foreach ($meta in @($Bundle.anexos)) {
            if ([string]$meta.id -ne $seguro) { continue }
            if ($null -ne $meta.tamanho) { $params.ExpectedSize = [Int64]$meta.tamanho }
            if (($meta.PSObject.Properties.Name -contains 'sha256') -and [string]$meta.sha256 -match '^[0-9A-Fa-f]{64}$') {
                $params.ExpectedSha256 = ([string]$meta.sha256).ToLowerInvariant()
            }
            break
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSha256)) { $params.ExpectedSha256 = $ExpectedSha256.ToLowerInvariant() }
    try { return [bool](Repair-PmoAtomicBytes @params) }
    catch { throw (NovaExcecaoHttp 409 "recuperacao atomica falhou para o anexo $seguro") }
}

function Repair-AnexosAtomicosDoBundle {
    $bundle = $null
    if (Test-Path -LiteralPath $portJson -PathType Leaf) {
        try { $bundle = Read-PmoJson $portJson $null } catch { throw (NovaExcecaoHttp 409 'portfolio.json invalido durante reconciliacao de anexos') }
    }
    $ids = @{}
    if ($bundle) {
        foreach ($meta in @($bundle.anexos)) {
            $id = IdSeguro ([string]$meta.id)
            if ($id) { $ids[$id] = $true }
        }
    }
    foreach ($backup in @(Get-ChildItem -LiteralPath $anexoDir -File -Force -Filter '*.replace-backup' -ErrorAction SilentlyContinue)) {
        $id = $backup.Name.Substring(0,$backup.Name.Length - '.replace-backup'.Length)
        $seguro = IdSeguro $id
        if ($seguro -and $seguro -eq $id) { $ids[$id] = $true }
    }
    foreach ($id in @($ids.Keys | Sort-Object)) { $null = Repair-AnexoAtomico $id $bundle }
}

function Get-AnexosCanonicos() {
    $resultado = @()
    if (-not (Test-Path -LiteralPath $anexoDir -PathType Container)) { return $resultado }
    Repair-AnexosAtomicosDoBundle
    foreach ($arquivo in (Get-ChildItem -LiteralPath $anexoDir -File -Force -ErrorAction SilentlyContinue | Sort-Object Name)) {
        if (Test-AnexoCanonico $arquivo) { $resultado += $arquivo }
    }
    return $resultado
}

function Get-MapaAnexosBundle($bundle) {
    $mapa = @{}
    foreach ($meta in @($bundle.anexos)) {
        $id = IdSeguro ([string]$meta.id)
        if (-not $id) { throw (NovaExcecaoHttp 409 'bundle contem ID de anexo invalido') }
        if ($mapa.ContainsKey($id)) { throw (NovaExcecaoHttp 409 "bundle contem ID de anexo duplicado: $id") }
        if ($null -eq $meta.tamanho -or [Int64]$meta.tamanho -lt 0) { throw (NovaExcecaoHttp 409 "bundle contem tamanho invalido para $id") }
        $mapa[$id] = $meta
    }
    return $mapa
}

function Get-EntradaInventarioNormalizada($entrada) {
    $id = [string]$entrada.id
    if ([string]::IsNullOrWhiteSpace($id) -and $entrada.path) {
        $path = ([string]$entrada.path).Replace('\','/')
        if ($path.StartsWith('attachments/', [System.StringComparison]::OrdinalIgnoreCase)) { $id = $path.Substring(12) }
    }
    $id = IdSeguro $id
    if (-not $id) { throw (NovaExcecaoHttp 409 'inventario contem ID de anexo invalido') }
    $nomes = @($entrada.PSObject.Properties.Name)
    $tamanho = if ($nomes -contains 'size') { [Int64]$entrada.size } else { [Int64]$entrada.tamanho }
    $sha = ([string]$entrada.sha256).ToLowerInvariant()
    if ($tamanho -lt 0 -or $sha -notmatch '^[0-9a-f]{64}$') { throw (NovaExcecaoHttp 409 "inventario invalido para o anexo $id") }
    return [pscustomobject]@{ id=$id; size=$tamanho; sha256=$sha }
}

function ValidarInventarioAnexos($bundle, $entradas) {
    $referencias = Get-MapaAnexosBundle $bundle
    $informados = @{}
    foreach ($bruta in @($entradas)) {
        if ($null -eq $bruta) { continue }
        $entrada = Get-EntradaInventarioNormalizada $bruta
        if ($informados.ContainsKey($entrada.id)) { throw (NovaExcecaoHttp 409 "inventario repete o anexo $($entrada.id)") }
        if (-not $referencias.ContainsKey($entrada.id)) { throw (NovaExcecaoHttp 409 "inventario contem anexo nao referenciado: $($entrada.id)") }
        $meta = $referencias[$entrada.id]
        if ([Int64]$meta.tamanho -ne [Int64]$entrada.size) { throw (NovaExcecaoHttp 409 "tamanho do bundle diverge para $($entrada.id)") }
        $informados[$entrada.id] = $entrada
    }
    if ($informados.Count -ne $referencias.Count) { throw (NovaExcecaoHttp 409 'inventario nao corresponde exatamente aos anexos do bundle') }

    $confirmados = @()
    foreach ($id in @($referencias.Keys | Sort-Object)) {
        $entrada = $informados[$id]
        $caminho = Join-Path $anexoDir $id
        $null = Repair-AnexoAtomico $id $bundle ([Int64]$entrada.size) ([string]$entrada.sha256)
        if (-not (Test-Path -LiteralPath $caminho -PathType Leaf)) { throw (NovaExcecaoHttp 409 "anexo nao materializado em disco: $id") }
        $arquivo = Get-Item -LiteralPath $caminho
        if (-not (Test-AnexoCanonico $arquivo)) { throw (NovaExcecaoHttp 409 "anexo nao canonico: $id") }
        if ([Int64]$arquivo.Length -ne [Int64]$entrada.size) { throw (NovaExcecaoHttp 409 "tamanho fisico divergente no anexo $id") }
        $shaReal = Get-PmoSha256 $caminho
        if ($shaReal -ne $entrada.sha256) { throw (NovaExcecaoHttp 409 "SHA-256 divergente no anexo $id") }
        $confirmados += [ordered]@{ id=$id; size=[Int64]$arquivo.Length; sha256=$shaReal }
    }
    return $confirmados
}

function Get-InventarioRestore($pending) {
    if ($pending.PSObject.Properties.Name -contains 'attachments') { return @($pending.attachments) }
    if ($pending.PSObject.Properties.Name -contains 'attachmentInventory') { return @($pending.attachmentInventory) }
    return @()
}

function ValidarRestorePendente($pending) {
    if (-not $pending -or [string]::IsNullOrWhiteSpace([string]$pending.snapshotId)) { throw (NovaExcecaoHttp 409 'restore-pending invalido') }
    $shaEsperado = ([string]$pending.portfolioSha256).ToLowerInvariant()
    if ($shaEsperado -notmatch '^[0-9a-f]{64}$') { throw (NovaExcecaoHttp 409 'restore-pending sem SHA-256 do portfolio') }
    if (-not (Test-Path -LiteralPath $portJson -PathType Leaf)) { throw (NovaExcecaoHttp 409 'portfolio restaurado ausente') }
    if ((Get-PmoSha256 $portJson) -ne $shaEsperado) { throw (NovaExcecaoHttp 409 'portfolio restaurado diverge do restore-pending') }
    $bundle = Read-PmoJson $portJson $null
    if (-not $bundle -or -not $bundle.meta) { throw (NovaExcecaoHttp 409 'portfolio restaurado invalido') }
    if ([int]$bundle.meta.schemaVersion -ne [int]$pending.sourceSchemaVersion) { throw (NovaExcecaoHttp 409 'schema do portfolio restaurado diverge do restore-pending') }
    if ([string]$bundle.meta.appVersion -ne [string]$pending.sourceAppVersion) { throw (NovaExcecaoHttp 409 'versao do portfolio restaurado diverge do restore-pending') }
    $inventario = @(ValidarInventarioAnexos $bundle (Get-InventarioRestore $pending))
    return [pscustomobject]@{ pending=$pending; bundle=$bundle; attachments=$inventario; portfolioSha256=$shaEsperado }
}

function CriarSnapshotAtualizacao($preflight) {
    if (-not (Test-Path -LiteralPath $portJson -PathType Leaf)) { throw 'portfolio.json nao foi materializado em disco' }
    $bundleRaw = [System.IO.File]::ReadAllText($portJson, [System.Text.Encoding]::UTF8)
    try { $bundle = $bundleRaw | ConvertFrom-Json } catch { throw 'portfolio.json invalido: JSON nao pode ser lido' }
    if (-not $preflight) { throw (NovaExcecaoHttp 400 'preflight obrigatorio') }
    $operationProp = $preflight.PSObject.Properties['operation']
    $operation = if ($null -ne $operationProp) { ([string]$operationProp.Value).ToLowerInvariant() } else { '' }
    if ([string]::IsNullOrWhiteSpace($operation)) { $operation = 'update' }
    if (@('update','rollback','restore') -notcontains $operation) { throw (NovaExcecaoHttp 400 'operacao de preflight invalida') }
    $snapshotKind = if ($operation -eq 'rollback') { 'pre-rollback' } elseif ($operation -eq 'restore') { 'pre-restore' } else { 'pre-update' }
    $preparedPhase = if ($operation -eq 'rollback') { 'rollback-prepared' } elseif ($operation -eq 'restore') { 'restore-prepared' } else { 'prepared' }
    $targetSnapshotId = $null
    if ($operation -eq 'restore') {
        $targetProp = $preflight.PSObject.Properties['targetSnapshotId']
        $targetSnapshotId = if ($null -ne $targetProp) { [string]$targetProp.Value } else { '' }
        if ($targetSnapshotId -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw (NovaExcecaoHttp 400 'targetSnapshotId invalido') }
        $targetDir = Join-Path $updateBkpDir $targetSnapshotId
        if (-not (Test-PmoSubPath $updateBkpDir $targetDir)) { throw (NovaExcecaoHttp 400 'snapshot alvo fora da raiz permitida') }
        $targetManifest = Read-PmoJson (Join-Path $targetDir 'manifest.json') $null
        if (-not $targetManifest -or -not $targetManifest.sealed) { throw (NovaExcecaoHttp 409 'snapshot alvo nao existe ou nao esta selado') }
        $targetErrors = @()
        foreach ($grupoTarget in @(Test-PmoInventory $targetDir $targetManifest.files @('manifest.json'))) {
            foreach ($erroTarget in @($grupoTarget)) { $targetErrors += [string]$erroTarget }
        }
        if ($targetErrors.Count -gt 0) { throw (NovaExcecaoHttp 409 ('snapshot alvo corrompido: ' + ($targetErrors -join '; '))) }
    }
    if ([string]$preflight.appVersion -ne $appVersion -or [int]$preflight.schemaVersion -ne $schemaVersion) {
        throw (NovaExcecaoHttp 409 'versao ou schema do preflight diverge do runtime atual')
    }
    if ([string]$preflight.salvoEm -ne [string]$bundle.meta.salvoEm) {
        throw (NovaExcecaoHttp 409 'selo temporal do preflight diverge do bundle em disco')
    }
    if (-not ($preflight.PSObject.Properties.Name -contains 'anexos')) { throw (NovaExcecaoHttp 400 'preflight sem inventario de anexos') }
    $anexosConfirmados = @(ValidarInventarioAnexos $bundle @($preflight.anexos))

    [Int64]$bytesNecessarios = (Get-Item -LiteralPath $portJson).Length
    foreach ($f in (Get-AnexosCanonicos)) { $bytesNecessarios += $f.Length }
    $bytesNecessarios = [Math]::Max(10485760, [Int64]($bytesNecessarios * 1.25))
    if ((EspacoLivre $updateBkpDir) -lt $bytesNecessarios) { throw 'espaco livre insuficiente para snapshot verificavel' }

    $snapshotId = NovaIdSnapshot
    $snapshotDir = Join-Path $updateBkpDir $snapshotId
    if (-not (Test-PmoSubPath $updateBkpDir $snapshotDir)) { throw 'destino de snapshot invalido' }
    $null = Assert-PmoPathWithoutReparse $snapshotDir
    New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
    $null = Assert-PmoPathWithoutReparse $snapshotDir
    try {
        Copy-PmoFileDurable -Source $portJson -Destination (Join-Path $snapshotDir 'portfolio.json')
        # Evidencia byte a byte do bundle escolhido antes que a nova versao
        # execute qualquer migracao. portfolio.json continua sendo o alvo de restore.
        Copy-PmoFileDurable -Source $portJson -Destination (Join-Path $snapshotDir 'raw-bundle.json')
        $snapshotAnexos = Join-Path $snapshotDir 'attachments'
        New-Item -ItemType Directory -Path $snapshotAnexos -Force | Out-Null
        $null = Assert-PmoPathWithoutReparse $snapshotAnexos
        foreach ($entrada in $anexosConfirmados) {
            Copy-PmoFileDurable -Source (Join-Path $anexoDir ([string]$entrada.id)) -Destination (Join-Path $snapshotAnexos ([string]$entrada.id))
        }
        Copy-PmoDirectoryDurable -Source $userTmplDir -Destination (Join-Path $snapshotDir 'user-templates')
        if (Test-Path -LiteralPath $installJson -PathType Leaf) {
            New-Item -ItemType Directory -Path (Join-Path $snapshotDir 'config') -Force | Out-Null
            Copy-PmoFileDurable -Source $installJson -Destination (Join-Path $snapshotDir 'config\install.json')
        }
        $files = @(Get-PmoDirectoryInventory $snapshotDir)
        $manifest = [ordered]@{
            formatVersion = 1
            snapshotId = $snapshotId
            kind = $snapshotKind
            sealed = $true
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
            sourceAppVersion = if ($bundle.meta.appVersion) { [string]$bundle.meta.appVersion } else { $appVersion }
            sourceSchemaVersion = if ($bundle.meta.schemaVersion) { [int]$bundle.meta.schemaVersion } else { $schemaVersion }
            sourceSavedAt = if ($bundle.meta.salvoEm) { [string]$bundle.meta.salvoEm } else { $null }
            attachmentCount = $anexosConfirmados.Count
            attachments = $anexosConfirmados
            files = $files
        }
        Write-PmoJsonAtomic (Join-Path $snapshotDir 'manifest.json') $manifest
        $manifestReload = Read-PmoJson (Join-Path $snapshotDir 'manifest.json') $null
        $erros = @()
        foreach ($grupo in @(Test-PmoInventory $snapshotDir $manifestReload.files @('manifest.json'))) {
            foreach ($erroInventario in @($grupo)) { $erros += [string]$erroInventario }
        }
        if ($erros.Count -gt 0) { throw ('snapshot nao passou na verificacao: ' + ($erros -join '; ')) }

        $state = [ordered]@{
            formatVersion = 1
            phase = $preparedPhase
            operation = $operation
            snapshotId = $snapshotId
            targetSnapshotId = $targetSnapshotId
            currentVersion = $appVersion
            currentSchemaVersion = $schemaVersion
            requestedVersion = if ($preflight -and $null -ne $preflight.PSObject.Properties['targetVersion']) {
                [string]$preflight.PSObject.Properties['targetVersion'].Value
            } else { $null }
            updatedAt = (Get-Date).ToUniversalTime().ToString('o')
            error = $null
        }
        Write-PmoJsonAtomic $updateJson $state
        Write-PmoJsonAtomic $updateLock ([ordered]@{ snapshotId=$snapshotId; createdAt=(Get-Date).ToUniversalTime().ToString('o'); pid=$PID })
        $script:maintenance = $true
        return [pscustomobject]@{ snapshotId=$snapshotId; manifest=$manifest }
    } catch {
        if (Test-Path -LiteralPath $snapshotDir) { Remove-Item -LiteralPath $snapshotDir -Recurse -Force -ErrorAction SilentlyContinue }
        throw
    }
}

function LimparSnapshotsAntigos() {
    $cfg = Read-PmoJson $installJson $null
    $keep = 3
    if ($cfg -and $cfg.retention -and $cfg.retention.snapshots) { $keep = [Math]::Max(1,[int]$cfg.retention.snapshots) }
    $validos = @()
    foreach ($d in (Get-ChildItem -LiteralPath $updateBkpDir -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
        $m = Read-PmoJson (Join-Path $d.FullName 'manifest.json') $null
        if ($m -and $m.kind -eq 'pre-update' -and $m.sealed) { $validos += $d }
    }
    foreach ($d in ($validos | Select-Object -Skip $keep)) {
        if (Test-PmoSubPath $updateBkpDir $d.FullName) { Remove-Item -LiteralPath $d.FullName -Recurse -Force }
    }
}

function ContarColecao($valor) {
    if ($null -eq $valor) { return 0 }
    return @($valor).Count
}

# Snapshot de protecao (D-32 item 2, PROT-01/02): arvore propria em
# data/backups/snapshots/<id>/, isolada do fluxo do updater (update.json,
# update.lock, $script:maintenance nunca sao lidos ou escritos aqui).
function CriarSnapshotProtecao($pedido) {
    if (-not (Test-Path -LiteralPath $portJson -PathType Leaf)) { throw 'portfolio.json nao foi materializado em disco' }
    $bundleRaw = [System.IO.File]::ReadAllText($portJson, [System.Text.Encoding]::UTF8)
    try { $bundle = $bundleRaw | ConvertFrom-Json } catch { throw 'portfolio.json invalido: JSON nao pode ser lido' }
    if (-not $pedido) { throw (NovaExcecaoHttp 400 'pedido de snapshot obrigatorio') }
    $operationProp = $pedido.PSObject.Properties['operation']
    $operation = if ($null -ne $operationProp) { ([string]$operationProp.Value).ToLowerInvariant() } else { '' }
    if (@('limpar','substituir') -notcontains $operation) { throw (NovaExcecaoHttp 400 'operacao de protecao invalida') }
    $snapshotKind = if ($operation -eq 'substituir') { 'pre-substituir' } else { 'pre-limpar' }

    if ([string]$pedido.appVersion -ne $appVersion -or [int]$pedido.schemaVersion -ne $schemaVersion) {
        throw (NovaExcecaoHttp 409 'versao ou schema do pedido diverge do runtime atual')
    }
    if ([string]$pedido.salvoEm -ne [string]$bundle.meta.salvoEm) {
        throw (NovaExcecaoHttp 409 'selo temporal do pedido diverge do bundle em disco')
    }
    if (-not ($pedido.PSObject.Properties.Name -contains 'anexos')) { throw (NovaExcecaoHttp 400 'pedido sem inventario de anexos') }
    $anexosConfirmados = @(ValidarInventarioAnexos $bundle @($pedido.anexos))

    [Int64]$bytesNecessarios = (Get-Item -LiteralPath $portJson).Length
    foreach ($f in (Get-AnexosCanonicos)) { $bytesNecessarios += $f.Length }
    $bytesNecessarios = [Math]::Max(10485760, [Int64]($bytesNecessarios * 1.25))
    if ((EspacoLivre $bkpDir) -lt $bytesNecessarios) { throw (NovaExcecaoHttp 507 'espaco livre insuficiente para snapshot de protecao') }

    $null = Assert-PmoPathWithoutReparse $protecaoSnapDir
    if (-not (Test-Path -LiteralPath $protecaoSnapDir)) { New-Item -ItemType Directory -Path $protecaoSnapDir -Force | Out-Null }
    $null = Assert-PmoPathWithoutReparse $protecaoSnapDir

    $snapshotId = NovaIdSnapshot
    $snapshotDir = Join-Path $protecaoSnapDir $snapshotId
    if (-not (Test-PmoSubPath $protecaoSnapDir $snapshotDir)) { throw 'destino de snapshot de protecao invalido' }
    $null = Assert-PmoPathWithoutReparse $snapshotDir
    New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
    $null = Assert-PmoPathWithoutReparse $snapshotDir
    try {
        Copy-PmoFileDurable -Source $portJson -Destination (Join-Path $snapshotDir 'portfolio.json')
        # Evidencia byte a byte do bundle escolhido antes da limpeza/substituicao.
        Copy-PmoFileDurable -Source $portJson -Destination (Join-Path $snapshotDir 'raw-bundle.json')
        $snapshotAnexos = Join-Path $snapshotDir 'attachments'
        New-Item -ItemType Directory -Path $snapshotAnexos -Force | Out-Null
        $null = Assert-PmoPathWithoutReparse $snapshotAnexos
        foreach ($entrada in $anexosConfirmados) {
            Copy-PmoFileDurable -Source (Join-Path $anexoDir ([string]$entrada.id)) -Destination (Join-Path $snapshotAnexos ([string]$entrada.id))
        }
        Copy-PmoDirectoryDurable -Source $userTmplDir -Destination (Join-Path $snapshotDir 'user-templates')
        # D-30: nunca copiar config/ nem state/ para o snapshot de protecao.
        $files = @(Get-PmoDirectoryInventory $snapshotDir)
        $manifest = [ordered]@{
            formatVersion = 1
            snapshotId = $snapshotId
            kind = $snapshotKind
            operation = $operation
            sealed = $true
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
            sourceAppVersion = if ($bundle.meta.appVersion) { [string]$bundle.meta.appVersion } else { $appVersion }
            sourceSchemaVersion = if ($bundle.meta.schemaVersion) { [int]$bundle.meta.schemaVersion } else { $schemaVersion }
            sourceSavedAt = if ($bundle.meta.salvoEm) { [string]$bundle.meta.salvoEm } else { $null }
            attachmentCount = $anexosConfirmados.Count
            attachments = $anexosConfirmados
            contagens = [ordered]@{
                projetos = ContarColecao $bundle.projetos
                programas = ContarColecao $bundle.programas
                pessoas = ContarColecao $bundle.pessoas
                anexos = ContarColecao $bundle.anexos
                auditLog = ContarColecao $bundle.auditLog
                imports = ContarColecao $bundle.imports
                visoesSalvas = ContarColecao $bundle.visoesSalvas
            }
            files = $files
        }
        Write-PmoJsonAtomic (Join-Path $snapshotDir 'manifest.json') $manifest
        $manifestReload = Read-PmoJson (Join-Path $snapshotDir 'manifest.json') $null
        $erros = @()
        foreach ($grupo in @(Test-PmoInventory $snapshotDir $manifestReload.files @('manifest.json'))) {
            foreach ($erroInventario in @($grupo)) { $erros += [string]$erroInventario }
        }
        if ($erros.Count -gt 0) { throw ('snapshot de protecao nao passou na verificacao: ' + ($erros -join '; ')) }
        return [pscustomobject]@{ snapshotId=$snapshotId; kind=$snapshotKind; manifest=$manifest }
    } catch {
        Remove-PmoManagedTree $protecaoSnapDir $snapshotDir
        throw
    }
}

# -------------------------------------------------- copia verificavel (PROT-05)
# Regra de link da P-18 (decisao do dono, T-024): so o caminho externo (destino
# da copia verificavel, escolhido pela PMO) aceita reparse point de nuvem do
# OneDrive Files On-Demand. Recusa apenas reparse point de redirecionamento
# (symlink, junction/mount point e outros name-surrogate). tools/portable-common.ps1
# nao muda: continua com a regra estrita (recusa qualquer reparse point) para
# tudo o que e da instalacao.

# Funcao pura, sem acesso a disco: devolve $true quando a tag de reparse tem o
# bit name-surrogate (0x20000000) ligado — cobre symlink (0xA000000C), juncao/
# mount point (0xA0000003) e outros redirecionamentos (ex.: 0xA000001D). Tags
# de nuvem do OneDrive (0x9000001A e variantes) nao tem esse bit ligado.
function Test-ReparseEhLink([uint32]$Tag) {
    $bitNomeSurrogado = [Convert]::ToUInt32('20000000', 16)
    return (($Tag -band $bitNomeSurrogado) -ne 0)
}

$script:pmoReparseTagTypeCarregado = $false
function Get-TagReparse([string]$Caminho) {
    if (-not $script:pmoReparseTagTypeCarregado) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class PmoReparseTagReader {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct WIN32_FIND_DATAW {
        public uint dwFileAttributes;
        public uint ftCreationTime_dwLowDateTime;
        public uint ftCreationTime_dwHighDateTime;
        public uint ftLastAccessTime_dwLowDateTime;
        public uint ftLastAccessTime_dwHighDateTime;
        public uint ftLastWriteTime_dwLowDateTime;
        public uint ftLastWriteTime_dwHighDateTime;
        public uint nFileSizeHigh;
        public uint nFileSizeLow;
        public uint dwReserved0;
        public uint dwReserved1;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string cFileName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)]
        public string cAlternateFileName;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindFirstFileW(string lpFileName, out WIN32_FIND_DATAW lpFindFileData);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool FindClose(IntPtr hFindFile);
}
'@
        $script:pmoReparseTagTypeCarregado = $true
    }
    $dadosReparse = New-Object PmoReparseTagReader+WIN32_FIND_DATAW
    $alcaReparse = [PmoReparseTagReader]::FindFirstFileW($Caminho, [ref]$dadosReparse)
    $alcaInvalida = New-Object IntPtr(-1)
    if ($alcaReparse.ToInt64() -eq $alcaInvalida.ToInt64()) {
        throw "nao foi possivel ler a tag de reparse point: $Caminho"
    }
    try { return [uint32]$dadosReparse.dwReserved0 }
    finally { [void][PmoReparseTagReader]::FindClose($alcaReparse) }
}

# Mesma caminhada de Assert-PmoPathWithoutReparse (o proprio caminho e todos os
# ancestrais existentes), mas so recusa reparse point de redirecionamento
# (Test-ReparseEhLink). Tag ilegivel recusa (falha fechada).
function Assert-CaminhoExternoSemLink([string]$Caminho) {
    $resolvido = Get-PmoNormalizedFullPath $Caminho
    $atual = $resolvido
    while (-not [string]::IsNullOrWhiteSpace($atual)) {
        if (Test-Path -LiteralPath $atual) {
            $item = Get-Item -LiteralPath $atual -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                $tagAtual = $null
                try { $tagAtual = Get-TagReparse $atual }
                catch { throw (NovaExcecaoHttp 400 'a pasta escolhida contem link simbolico ou juncao') }
                if (Test-ReparseEhLink $tagAtual) {
                    throw (NovaExcecaoHttp 400 'a pasta escolhida contem link simbolico ou juncao')
                }
            }
        }
        $pai = [System.IO.Path]::GetDirectoryName($atual)
        if ([string]::IsNullOrWhiteSpace($pai) -or $pai.Equals($atual,[StringComparison]::OrdinalIgnoreCase)) { break }
        $atual = Get-PmoNormalizedFullPath $pai
    }
    return $resolvido
}

# Cópia durável por arquivo temporário + Flush + Move, sem sobrescrever — igual
# a Copy-PmoFileDurable, mas o destino (pasta externa escolhida pela PMO) usa a
# regra de link da P-18 em vez da checagem estrita. A fonte continua sendo da
# instalacao e usa a checagem estrita (Assert-PmoPathWithoutReparse).
function Copy-ArquivoCopiaExterna([string]$Source, [string]$Destination) {
    $sourceFull = Assert-PmoPathWithoutReparse $Source
    if (-not (Test-Path -LiteralPath $sourceFull -PathType Leaf)) { throw "Arquivo fonte ausente: $Source" }
    $destinationFull = [System.IO.Path]::GetFullPath($Destination)
    $destinationDir = Split-Path -Parent $destinationFull
    $null = Assert-CaminhoExternoSemLink $destinationDir
    if (-not (Test-Path -LiteralPath $destinationDir -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
        $null = Assert-CaminhoExternoSemLink $destinationDir
    }
    if (Test-Path -LiteralPath $destinationFull) { throw "Destino de copia externa ja existe: $Destination" }
    $tmp = Join-Path $destinationDir ('.durable-copy-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $entradaCopia = New-Object System.IO.FileStream($sourceFull,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
        try {
            $saidaCopia = New-Object System.IO.FileStream($tmp,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
            try { $entradaCopia.CopyTo($saidaCopia); $saidaCopia.Flush($true) } finally { $saidaCopia.Dispose() }
        } finally { $entradaCopia.Dispose() }
        [System.IO.File]::Move($tmp,$destinationFull)
        $null = Assert-CaminhoExternoSemLink $destinationFull
    } finally {
        if (Test-Path -LiteralPath $tmp -PathType Leaf) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

# Igual a Copy-PmoDirectoryDurable, mas o destino usa a regra de link da P-18.
# A fonte (user-templates, sempre da instalacao) continua conferida pela
# checagem estrita.
function Copy-DiretorioCopiaExterna([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source)) { return }
    $sourceFull = Assert-PmoPathWithoutReparse $Source
    if (-not (Test-Path -LiteralPath $sourceFull -PathType Container)) { throw "Fonte nao e diretorio: $Source" }
    $destinationFull = [System.IO.Path]::GetFullPath($Destination)
    $null = Assert-CaminhoExternoSemLink $destinationFull
    if (-not (Test-Path -LiteralPath $destinationFull -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationFull -Force | Out-Null
        $null = Assert-CaminhoExternoSemLink $destinationFull
    }
    $itensCopiaExterna = @(Get-ChildItem -LiteralPath $sourceFull -Force -Recurse)
    foreach ($itemCopiaExterna in $itensCopiaExterna) {
        if (($itemCopiaExterna.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Diretorio fonte contem link, junction ou reparse point: $($itemCopiaExterna.FullName)"
        }
    }
    foreach ($diretorioCopiaExterna in @($itensCopiaExterna | Where-Object { $_.PSIsContainer } | Sort-Object FullName)) {
        $relativoCopiaExterna = $diretorioCopiaExterna.FullName.Substring($sourceFull.Length).TrimStart('\')
        $alvoDiretorioCopiaExterna = Join-Path $destinationFull $relativoCopiaExterna
        if (-not (Test-Path -LiteralPath $alvoDiretorioCopiaExterna -PathType Container)) { New-Item -ItemType Directory -Path $alvoDiretorioCopiaExterna | Out-Null }
        $null = Assert-CaminhoExternoSemLink $alvoDiretorioCopiaExterna
    }
    foreach ($arquivoCopiaExterna in @($itensCopiaExterna | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName)) {
        $relativoArquivoCopiaExterna = $arquivoCopiaExterna.FullName.Substring($sourceFull.Length).TrimStart('\')
        Copy-ArquivoCopiaExterna -Source $arquivoCopiaExterna.FullName -Destination (Join-Path $destinationFull $relativoArquivoCopiaExterna)
    }
}

# Grava o manifest.json da copia externa por temporario + Flush + Move. A
# subpasta e sempre nova (nao sobrescreve).
function Write-JsonCopiaExterna([string]$Path, $Value) {
    $dirJsonExterno = Split-Path -Parent $Path
    $null = Assert-CaminhoExternoSemLink $dirJsonExterno
    if (-not (Test-Path -LiteralPath $dirJsonExterno)) { New-Item -ItemType Directory -Path $dirJsonExterno -Force | Out-Null }
    $null = Assert-CaminhoExternoSemLink $dirJsonExterno
    if (Test-Path -LiteralPath $Path) { throw "Destino do manifesto da copia externa ja existe: $Path" }
    $tmpJsonExterno = $Path + '.tmp-' + [Guid]::NewGuid().ToString('N')
    $utf8JsonExterno = New-Object System.Text.UTF8Encoding($false)
    try {
        $jsonExterno = $Value | ConvertTo-Json -Depth 100
        $bytesJsonExterno = $utf8JsonExterno.GetBytes($jsonExterno)
        $streamJsonExterno = New-Object System.IO.FileStream($tmpJsonExterno,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
        try { $streamJsonExterno.Write($bytesJsonExterno,0,$bytesJsonExterno.Length); $streamJsonExterno.Flush($true) } finally { $streamJsonExterno.Dispose() }
        [System.IO.File]::Move($tmpJsonExterno, $Path)
    } finally {
        if (Test-Path -LiteralPath $tmpJsonExterno) { Remove-Item -LiteralPath $tmpJsonExterno -Force -ErrorAction SilentlyContinue }
    }
}

# Igual a Get-PmoDirectoryInventory, mas recusa so link (reparse de nuvem passa).
function Get-InventarioCopiaExterna([string]$Root) {
    $rootFullCopiaExterna = Get-PmoNormalizedFullPath $Root
    $itensInventarioExterno = @()
    if (-not (Test-Path -LiteralPath $rootFullCopiaExterna)) { return @() }
    $null = Assert-CaminhoExternoSemLink $rootFullCopiaExterna
    $todosItensCopiaExterna = @(Get-ChildItem -LiteralPath $rootFullCopiaExterna -Recurse -Force)
    foreach ($itemInventarioExterno in $todosItensCopiaExterna) {
        if (($itemInventarioExterno.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            $tagInventarioExterno = $null
            try { $tagInventarioExterno = Get-TagReparse $itemInventarioExterno.FullName }
            catch { throw (NovaExcecaoHttp 400 'a pasta escolhida contem link simbolico ou juncao') }
            if (Test-ReparseEhLink $tagInventarioExterno) {
                throw (NovaExcecaoHttp 400 'a pasta escolhida contem link simbolico ou juncao')
            }
        }
    }
    foreach ($arquivoInventarioExterno in @($todosItensCopiaExterna | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName)) {
        $relativoInventarioExterno = $arquivoInventarioExterno.FullName.Substring($rootFullCopiaExterna.Length).TrimStart('\').Replace('\','/')
        $itensInventarioExterno += [ordered]@{
            path = $relativoInventarioExterno
            size = [Int64]$arquivoInventarioExterno.Length
            sha256 = Get-PmoSha256 $arquivoInventarioExterno.FullName
        }
    }
    return $itensInventarioExterno
}

# Mesmas quatro mensagens de Test-PmoInventory, usando Get-InventarioCopiaExterna
# para os arquivos a mais (assim a pasta do OneDrive pode ser conferida mesmo
# com os arquivos ja como placeholders de nuvem).
function Test-InventarioCopiaExterna([string]$Root, $Files, [string[]]$AllowedExtra=@()) {
    $errosInventarioExterno = @()
    $esperadoInventarioExterno = @{}
    foreach ($entradaInventarioExterno in $Files) {
        $chaveInventarioExterno = ([string]$entradaInventarioExterno.path).Replace('\','/').ToLowerInvariant()
        if ($esperadoInventarioExterno.ContainsKey($chaveInventarioExterno)) { $errosInventarioExterno += "entrada duplicada no inventario: $($entradaInventarioExterno.path)"; continue }
        $esperadoInventarioExterno[$chaveInventarioExterno] = $true
        $caminhoInventarioExterno = Resolve-PmoPath $Root ([string]$entradaInventarioExterno.path)
        if (-not (Test-PmoSubPath $Root $caminhoInventarioExterno)) { $errosInventarioExterno += "caminho fora da raiz: $($entradaInventarioExterno.path)"; continue }
        if (-not (Test-Path -LiteralPath $caminhoInventarioExterno -PathType Leaf)) { $errosInventarioExterno += "arquivo ausente: $($entradaInventarioExterno.path)"; continue }
        $itemInventarioExternoAtual = Get-Item -LiteralPath $caminhoInventarioExterno
        if ([Int64]$itemInventarioExternoAtual.Length -ne [Int64]$entradaInventarioExterno.size) { $errosInventarioExterno += "tamanho divergente: $($entradaInventarioExterno.path)"; continue }
        if ((Get-PmoSha256 $caminhoInventarioExterno) -ne ([string]$entradaInventarioExterno.sha256).ToLowerInvariant()) { $errosInventarioExterno += "hash divergente: $($entradaInventarioExterno.path)" }
    }
    $permitidoInventarioExterno = @{}
    foreach ($extraInventarioExterno in $AllowedExtra) { $permitidoInventarioExterno[$extraInventarioExterno.Replace('\','/').ToLowerInvariant()] = $true }
    foreach ($atualInventarioExterno in @(Get-InventarioCopiaExterna $Root)) {
        $chaveAtualInventarioExterno = ([string]$atualInventarioExterno.path).ToLowerInvariant()
        if (-not $esperadoInventarioExterno.ContainsKey($chaveAtualInventarioExterno) -and -not $permitidoInventarioExterno.ContainsKey($chaveAtualInventarioExterno)) { $errosInventarioExterno += "arquivo fisico nao declarado: $($atualInventarioExterno.path)" }
    }
    return $errosInventarioExterno
}

# Remove so a subpasta criada por uma exportacao com falha; exige que ela fique
# dentro do destino escolhido e que a arvore nao tenha link em nenhum ponto.
function Remove-SubpastaCopiaExterna([string]$Destino, [string]$Subpasta) {
    $destinoRemocaoExterna = Assert-CaminhoExternoSemLink $Destino
    $subpastaRemocaoExterna = Assert-CaminhoExternoSemLink $Subpasta
    if (-not (Test-PmoSubPath $destinoRemocaoExterna $subpastaRemocaoExterna)) { throw "Recusa ao remover pasta fora do destino escolhido: $subpastaRemocaoExterna" }
    if (Test-Path -LiteralPath $subpastaRemocaoExterna) {
        foreach ($itemRemocaoExterna in @(Get-ChildItem -LiteralPath $subpastaRemocaoExterna -Recurse -Force -ErrorAction SilentlyContinue)) {
            if (($itemRemocaoExterna.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                $tagRemocaoExterna = $null
                try { $tagRemocaoExterna = Get-TagReparse $itemRemocaoExterna.FullName }
                catch { throw (NovaExcecaoHttp 400 'a pasta escolhida contem link simbolico ou juncao') }
                if (Test-ReparseEhLink $tagRemocaoExterna) {
                    throw (NovaExcecaoHttp 400 'a pasta escolhida contem link simbolico ou juncao')
                }
            }
        }
        Remove-Item -LiteralPath $subpastaRemocaoExterna -Recurse -Force
    }
}

# Valida o destino escolhido pela PMO (pasta externa a instalacao) para a copia
# verificavel: caminho absoluto de unidade local existente, sem '..'/'.',
# sem reparse point de redirecionamento (P-18) e fora das raizes da instalacao.
function Test-PastaExternaPermitida([string]$Caminho) {
    $brutoPastaExterna = [string]$Caminho
    if ([string]::IsNullOrWhiteSpace($brutoPastaExterna) -or $brutoPastaExterna.Length -gt 200) {
        throw (NovaExcecaoHttp 400 'a pasta escolhida e invalida')
    }
    if ($brutoPastaExterna -notmatch '^[A-Za-z]:\\') {
        throw (NovaExcecaoHttp 400 'a pasta escolhida precisa ser um caminho absoluto de unidade local (letra:\)')
    }
    foreach ($segmentoPastaExterna in $brutoPastaExterna.Split([char[]]@('\','/'))) {
        if ($segmentoPastaExterna -eq '..' -or $segmentoPastaExterna -eq '.') {
            throw (NovaExcecaoHttp 400 'o caminho da pasta escolhida nao pode conter . ou ..')
        }
    }
    $invalidosPastaExterna = [System.IO.Path]::GetInvalidPathChars()
    foreach ($caractere in $brutoPastaExterna.ToCharArray()) {
        if ($invalidosPastaExterna -contains $caractere) { throw (NovaExcecaoHttp 400 'o caminho da pasta escolhida contem caractere invalido') }
    }
    $normalizadoPastaExterna = $null
    try { $normalizadoPastaExterna = Get-PmoNormalizedFullPath $brutoPastaExterna }
    catch { throw (NovaExcecaoHttp 400 'a pasta escolhida e invalida') }
    if (-not (Test-Path -LiteralPath $normalizadoPastaExterna -PathType Container)) {
        throw (NovaExcecaoHttp 400 'a pasta escolhida nao existe')
    }
    $null = Assert-CaminhoExternoSemLink $normalizadoPastaExterna
    foreach ($raizProibidaPastaExterna in @($installRoot,$raiz,$dataDir,$configDir,$stateDir,$versionsDir,$stagingDir,$logsDir)) {
        if (Test-CaminhosIguaisOuAninhados $raizProibidaPastaExterna $normalizadoPastaExterna) {
            throw (NovaExcecaoHttp 400 'a copia nao pode ficar dentro da instalacao (G11)')
        }
    }
    return $normalizadoPastaExterna
}

# Exportar copia verificavel (PROT-05, D-32 item 4): so portfolio.json, os
# anexos referenciados e user-templates/ (D-30, P-19). Cada exportacao cria uma
# subpasta nova; em falha, so ela e removida.
function ExportarCopiaVerificavel($pedido) {
    if (-not (Test-Path -LiteralPath $portJson -PathType Leaf)) { throw 'portfolio.json nao foi materializado em disco' }
    $bundleRaw = [System.IO.File]::ReadAllText($portJson, [System.Text.Encoding]::UTF8)
    try { $bundle = $bundleRaw | ConvertFrom-Json } catch { throw 'portfolio.json invalido: JSON nao pode ser lido' }
    if (-not $pedido) { throw (NovaExcecaoHttp 400 'pedido de copia verificavel obrigatorio') }
    $destino = Test-PastaExternaPermitida ([string]$pedido.destino)

    if ([string]$pedido.appVersion -ne $appVersion -or [int]$pedido.schemaVersion -ne $schemaVersion) {
        throw (NovaExcecaoHttp 409 'versao ou schema do pedido diverge do runtime atual')
    }
    if ([string]$pedido.salvoEm -ne [string]$bundle.meta.salvoEm) {
        throw (NovaExcecaoHttp 409 'selo temporal do pedido diverge do bundle em disco')
    }
    if (-not ($pedido.PSObject.Properties.Name -contains 'anexos')) { throw (NovaExcecaoHttp 400 'pedido sem inventario de anexos') }
    $anexosConfirmadosCopia = @(ValidarInventarioAnexos $bundle @($pedido.anexos))

    [Int64]$bytesNecessariosCopia = (Get-Item -LiteralPath $portJson).Length
    foreach ($fCopia in (Get-AnexosCanonicos)) { $bytesNecessariosCopia += $fCopia.Length }
    $bytesNecessariosCopia = [Math]::Max(10485760, [Int64]($bytesNecessariosCopia * 1.25))
    if ((EspacoLivre $destino) -lt $bytesNecessariosCopia) { throw (NovaExcecaoHttp 507 'espaco livre insuficiente na pasta escolhida') }

    $copyId = 'pmo-copia-' + (NovaIdSnapshot)
    $subpastaCopia = Join-Path $destino $copyId
    if (Test-Path -LiteralPath $subpastaCopia) { throw (NovaExcecaoHttp 409 'a subpasta da copia ja existe') }
    New-Item -ItemType Directory -Path $subpastaCopia -Force | Out-Null
    $null = Assert-CaminhoExternoSemLink $subpastaCopia
    try {
        Copy-ArquivoCopiaExterna -Source $portJson -Destination (Join-Path $subpastaCopia 'portfolio.json')
        $subpastaAnexosCopia = Join-Path $subpastaCopia 'attachments'
        New-Item -ItemType Directory -Path $subpastaAnexosCopia -Force | Out-Null
        $null = Assert-CaminhoExternoSemLink $subpastaAnexosCopia
        foreach ($entradaAnexoCopia in $anexosConfirmadosCopia) {
            Copy-ArquivoCopiaExterna -Source (Join-Path $anexoDir ([string]$entradaAnexoCopia.id)) -Destination (Join-Path $subpastaAnexosCopia ([string]$entradaAnexoCopia.id))
        }
        Copy-DiretorioCopiaExterna -Source $userTmplDir -Destination (Join-Path $subpastaCopia 'user-templates')
        # D-30: nunca copiar config/, state/, versions/, logs/, backups nem snapshots.
        $arquivosCopia = @(Get-InventarioCopiaExterna $subpastaCopia)
        $manifestoCopia = [ordered]@{
            formatVersion = 1
            kind = 'copia-verificavel'
            copyId = $copyId
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
            sourceAppVersion = if ($bundle.meta.appVersion) { [string]$bundle.meta.appVersion } else { $appVersion }
            sourceSchemaVersion = if ($bundle.meta.schemaVersion) { [int]$bundle.meta.schemaVersion } else { $schemaVersion }
            sourceSavedAt = if ($bundle.meta.salvoEm) { [string]$bundle.meta.salvoEm } else { $null }
            attachmentCount = $anexosConfirmadosCopia.Count
            contagens = [ordered]@{
                projetos = ContarColecao $bundle.projetos
                programas = ContarColecao $bundle.programas
                pessoas = ContarColecao $bundle.pessoas
                anexos = ContarColecao $bundle.anexos
                auditLog = ContarColecao $bundle.auditLog
                imports = ContarColecao $bundle.imports
                visoesSalvas = ContarColecao $bundle.visoesSalvas
            }
            files = $arquivosCopia
        }
        Write-JsonCopiaExterna (Join-Path $subpastaCopia 'manifest.json') $manifestoCopia
        $manifestoCopiaRelido = Read-PmoJson (Join-Path $subpastaCopia 'manifest.json') $null
        $errosCopia = @(Test-InventarioCopiaExterna $subpastaCopia $manifestoCopiaRelido.files @('manifest.json'))
        if ($errosCopia.Count -gt 0) { throw ('copia verificavel nao passou na verificacao: ' + ($errosCopia -join '; ')) }
        [Int64]$bytesTotalCopia = 0
        foreach ($entradaArquivoCopia in $arquivosCopia) { $bytesTotalCopia += [Int64]$entradaArquivoCopia.size }
        $manifestSha256Copia = Get-PmoSha256 (Join-Path $subpastaCopia 'manifest.json')
        return [pscustomobject]@{
            copyId = $copyId; pasta = $subpastaCopia; arquivos = $arquivosCopia.Count
            bytes = $bytesTotalCopia; manifestSha256 = $manifestSha256Copia
        }
    } catch {
        Remove-SubpastaCopiaExterna $destino $subpastaCopia
        throw
    }
}

# Confere uma copia verificavel ja exportada, apontando arquivo alterado,
# faltando ou a mais, sem nunca escrever na pasta (P-20, somente leitura).
# Usa Test-InventarioCopiaExterna (nao Test-PmoInventory) para a pasta do
# OneDrive poder ser conferida mesmo com os arquivos ja como placeholders de
# nuvem (P-18).
function ConferirCopiaVerificavel($pedido) {
    if (-not $pedido) { throw (NovaExcecaoHttp 400 'pedido de conferencia obrigatorio') }
    $pastaConferir = Test-PastaExternaPermitida ([string]$pedido.pasta)
    $nomeFinalConferir = Split-Path -Leaf $pastaConferir
    if ($nomeFinalConferir -notmatch '^pmo-copia-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$') {
        throw (NovaExcecaoHttp 400 'a pasta informada nao tem o formato de uma copia verificavel')
    }
    $manifestPathConferir = Join-Path $pastaConferir 'manifest.json'
    $manifestoConferir = $null
    try { $manifestoConferir = Read-PmoJson $manifestPathConferir $null } catch { $manifestoConferir = $null }
    if (-not $manifestoConferir -or [int]$manifestoConferir.formatVersion -ne 1 -or [string]$manifestoConferir.kind -ne 'copia-verificavel') {
        return [pscustomobject]@{
            ok = $false; copyId = $nomeFinalConferir; pasta = $pastaConferir
            conferidoEm = (Get-Date).ToUniversalTime().ToString('o')
            arquivos = 0; manifestSha256 = $null
            erros = @('manifest.json ausente ou invalido')
        }
    }
    $errosConferir = @(Test-InventarioCopiaExterna $pastaConferir $manifestoConferir.files @('manifest.json'))
    $manifestSha256Conferir = $null
    if (Test-Path -LiteralPath $manifestPathConferir -PathType Leaf) { $manifestSha256Conferir = Get-PmoSha256 $manifestPathConferir }
    return [pscustomobject]@{
        ok = ($errosConferir.Count -eq 0); copyId = [string]$manifestoConferir.copyId; pasta = $pastaConferir
        conferidoEm = (Get-Date).ToUniversalTime().ToString('o')
        arquivos = @($manifestoConferir.files).Count; manifestSha256 = $manifestSha256Conferir
        erros = $errosConferir
    }
}

# Destinos sugeridos para a copia verificavel (P-17), so leitura, nunca cria
# nada: pasta Documentos e pastas do OneDrive do usuario (quando existem e
# passam na mesma validacao do destino), mais o ultimo destino usado, lido da
# trilha em disco.
function SugerirDestinosCopia() {
    $candidatosDestino = @(
        [pscustomobject]@{ id='documentos'; rotulo='Documentos'; caminho=[Environment]::GetFolderPath('MyDocuments') }
        [pscustomobject]@{ id='onedrive'; rotulo='OneDrive'; caminho=[string]$env:OneDrive }
        [pscustomobject]@{ id='onedrive-empresa'; rotulo='OneDrive (empresa)'; caminho=[string]$env:OneDriveCommercial }
        [pscustomobject]@{ id='onedrive-pessoal'; rotulo='OneDrive (pessoal)'; caminho=[string]$env:OneDriveConsumer }
    )
    $destinosSugeridos = @()
    $vistosDestinoSugerido = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($candidatoDestino in $candidatosDestino) {
        $brutoCandidatoDestino = [string]$candidatoDestino.caminho
        if ([string]::IsNullOrWhiteSpace($brutoCandidatoDestino)) { continue }
        $normalizadoCandidatoDestino = $null
        try { $normalizadoCandidatoDestino = Test-PastaExternaPermitida $brutoCandidatoDestino }
        catch { continue }
        if ($vistosDestinoSugerido.Contains($normalizadoCandidatoDestino)) { continue }
        $null = $vistosDestinoSugerido.Add($normalizadoCandidatoDestino)
        $destinosSugeridos += [ordered]@{ id=$candidatoDestino.id; rotulo=$candidatoDestino.rotulo; caminho=$normalizadoCandidatoDestino }
    }
    $ultimoDestinoSugerido = $null
    $bundleAtualSugestoes = Read-PmoJson $portJson $null
    if ($bundleAtualSugestoes -and $bundleAtualSugestoes.auditLog) {
        $entradasAuditSugestoes = @($bundleAtualSugestoes.auditLog)
        for ($iSugestao = $entradasAuditSugestoes.Count - 1; $iSugestao -ge 0; $iSugestao--) {
            $entradaAuditSugestao = $entradasAuditSugestoes[$iSugestao]
            $copiaPropSugestao = $entradaAuditSugestao.PSObject.Properties['copia']
            if ($null -eq $copiaPropSugestao -or -not $copiaPropSugestao.Value) { continue }
            $destinoPropSugestao = $copiaPropSugestao.Value.PSObject.Properties['destino']
            if ($null -eq $destinoPropSugestao -or [string]::IsNullOrWhiteSpace([string]$destinoPropSugestao.Value)) { continue }
            try { $ultimoDestinoSugerido = Test-PastaExternaPermitida ([string]$destinoPropSugestao.Value) }
            catch { $ultimoDestinoSugerido = $null }
            break
        }
    }
    return [pscustomobject]@{ destinos = $destinosSugeridos; ultimoDestino = $ultimoDestinoSugerido }
}

function ConsultarAtualizacao() {
    $cfg = Read-PmoJson $installJson $null
    if (-not $cfg -or [string]::IsNullOrWhiteSpace([string]$cfg.repository)) {
        return [ordered]@{ ok=$true; configured=$false; currentVersion=$appVersion; message='repository nao configurado em config/install.json' }
    }
    $repo = [string]$cfg.repository
    if ($repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'repository invalido em install.json' }
    $cachePath = Join-Path $stateDir 'update-check.json'
    $cache = Read-PmoJson $cachePath $null
    $hours = 24
    if ($cfg.checkIntervalHours) { $hours = [Math]::Max(1,[int]$cfg.checkIntervalHours) }
    if ($cache -and $cache.checkedAt) {
        $age = (Get-Date).ToUniversalTime() - [DateTime]::Parse([string]$cache.checkedAt).ToUniversalTime()
        if ($age.TotalHours -lt $hours -and $cache.result) { return $cache.result }
    }
    $headers = @{ 'User-Agent'='PMO-Tool-Updater'; 'Accept'='application/vnd.github+json'; 'X-GitHub-Api-Version'='2026-03-10' }
    if ($cache -and $cache.etag) { $headers['If-None-Match'] = [string]$cache.etag }
    $uri = "https://api.github.com/repos/$repo/releases/latest"
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $headers -TimeoutSec 20
        $release = $response.Content | ConvertFrom-Json
        if ($release.draft -or $release.prerelease) { throw 'GitHub retornou uma release nao estavel' }
        if (-not ($release.PSObject.Properties.Name -contains 'immutable') -or -not [bool]$release.immutable) { throw 'A release mais recente nao esta marcada como imutavel' }
        $tagRaw = [string]$release.tag_name
        if ($tagRaw -notmatch '^v(?<versao>(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$') {
            throw 'Tag da release deve seguir estritamente vX.Y.Z'
        }
        $tag = [string]$Matches['versao']
        $result = [ordered]@{
            ok=$true; configured=$true; currentVersion=$appVersion; latestVersion=$tag
            updateAvailable=([version]$tag -gt [version]$appVersion); releaseUrl=[string]$release.html_url
            publishedAt=[string]$release.published_at; assets=@($release.assets | ForEach-Object { [ordered]@{ name=$_.name; size=$_.size; digest=$_.digest; url=$_.browser_download_url } })
        }
        Write-PmoJsonAtomic $cachePath ([ordered]@{ checkedAt=(Get-Date).ToUniversalTime().ToString('o'); etag=[string]$response.Headers['ETag']; result=$result })
        return $result
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 304 -and $cache.result) { return $cache.result }
        if ($cache -and $cache.result) {
            $fallback = $cache.result
            $fallback | Add-Member -NotePropertyName stale -NotePropertyValue $true -Force
            $fallback | Add-Member -NotePropertyName warning -NotePropertyValue $_.Exception.Message -Force
            return $fallback
        }
        throw
    }
}

function IndiceAnexos() {
    $itens = @()
    foreach ($f in (Get-AnexosCanonicos)) {
        $itens += ('{"id":"' + (JsonEscapar $f.Name) + '","tamanho":' + $f.Length +
                   ',"sha256":"' + (Get-PmoSha256 $f.FullName) +
                   '","modificadoEm":"' + $f.LastWriteTimeUtc.ToString('o') + '"}')
    }
    return '{"ok":true,"itens":[' + ($itens -join ',') + ']}'
}

# Indice generico de uma pasta servida como somente-leitura (samples, templates)
function IndiceDeDiretorio($dir, $rotaBase) {
    $itens = @()
    if (Test-Path $dir) {
        foreach ($f in (Get-ChildItem -Path $dir -File | Sort-Object Name)) {
            $itens += ('{"nome":"' + (JsonEscapar $f.Name) + '","tamanho":' + $f.Length +
                       ',"url":"' + $rotaBase + [System.Uri]::EscapeDataString($f.Name) + '"}')
        }
    }
    return '{"ok":true,"itens":[' + ($itens -join ',') + ']}'
}

function IndiceSamples()   { return IndiceDeDiretorio $sampDir '/samples/' }
function IndiceTemplates() {
    $porNome = @{}
    foreach ($dir in @($factoryTmplDir, $userTmplDir)) {
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        foreach ($f in (Get-ChildItem -LiteralPath $dir -File)) { $porNome[$f.Name.ToLowerInvariant()] = $f }
    }
    $itens = @()
    foreach ($f in ($porNome.Values | Sort-Object Name)) {
        $origem = if (Test-PmoSubPath $userTmplDir $f.FullName) { 'usuario' } else { 'fabrica' }
        $itens += ('{"nome":"' + (JsonEscapar $f.Name) + '","tamanho":' + $f.Length + ',"origem":"' + $origem + '","url":"/templates/' + [System.Uri]::EscapeDataString($f.Name) + '"}')
    }
    return '{"ok":true,"itens":[' + ($itens -join ',') + ']}'
}

function ConfirmarRestoreAck($reported) {
    $pending = Read-PmoJson $restorePendingJson $null
    $validado = ValidarRestorePendente $pending
    if ([string]$reported.snapshotId -ne [string]$pending.snapshotId) { throw (NovaExcecaoHttp 409 'snapshotId do restore-ack diverge') }
    if (-not [bool]$reported.indexedDbReady) { throw (NovaExcecaoHttp 409 'IndexedDB nao foi confirmado pelo restore-ack') }
    if ([string]$reported.portfolioSha256 -ne [string]$validado.portfolioSha256) { throw (NovaExcecaoHttp 409 'SHA-256 do portfolio diverge no restore-ack') }
    if ([int]$reported.sourceSchemaVersion -ne [int]$pending.sourceSchemaVersion) { throw (NovaExcecaoHttp 409 'schema diverge no restore-ack') }
    if ([string]$reported.sourceAppVersion -ne [string]$pending.sourceAppVersion) { throw (NovaExcecaoHttp 409 'versao diverge no restore-ack') }
    $pendingActivationProp = $pending.PSObject.Properties['activationId']
    $pendingActivation = if ($null -ne $pendingActivationProp) { [string]$pendingActivationProp.Value } else { '' }
    if ($pendingActivation -and [string]$reported.activationId -ne $pendingActivation) { throw (NovaExcecaoHttp 409 'activationId diverge no restore-ack') }
    if (-not ($reported.PSObject.Properties.Name -contains 'attachments')) { throw (NovaExcecaoHttp 400 'restore-ack sem inventario de anexos') }
    $confirmados = @(ValidarInventarioAnexos $validado.bundle @($reported.attachments))
    # O updater mantem a copia anterior em data/recovery ate o navegador
    # confirmar o IndexedDB. Somente o recovery exatamente associado a este
    # restore pode ser removido; o snapshot de emergencia continua selado.
    $recoveryParaLimpar = $null
    $journalParaLimpar = $false
    $restoreIdProp = $pending.PSObject.Properties['restoreId']
    $restoreId = if ($null -ne $restoreIdProp) { [string]$restoreIdProp.Value } else { '' }
    if (-not [string]::IsNullOrWhiteSpace($restoreId)) {
        if ($restoreId -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw (NovaExcecaoHttp 409 'restoreId pendente invalido') }
        $journal = Read-PmoJson $restoreJournalJson $null
        if (-not $journal -or [string]$journal.phase -ne 'completed') { throw (NovaExcecaoHttp 409 'journal de restauracao nao esta concluido') }
        if ([string]$journal.restoreId -ne $restoreId) { throw (NovaExcecaoHttp 409 'restoreId diverge entre pending e journal') }
        if ([string]$journal.snapshotId -ne [string]$pending.snapshotId) { throw (NovaExcecaoHttp 409 'snapshot diverge entre pending e journal') }
        try {
            $rootInformado = [System.IO.Path]::GetFullPath([string]$journal.root)
            $rootEsperado = [System.IO.Path]::GetFullPath((Join-Path $recoveryRoot $restoreId))
        } catch { throw (NovaExcecaoHttp 409 'recovery root invalido no journal') }
        if (-not (Test-PmoSubPath $recoveryRoot $rootInformado) -or
            -not $rootInformado.Equals($rootEsperado, [StringComparison]::OrdinalIgnoreCase)) {
            throw (NovaExcecaoHttp 409 'recovery root do journal nao corresponde ao restoreId')
        }
        $null = Assert-PmoPathWithoutReparse $recoveryRoot
        $null = Assert-PmoPathWithoutReparse $rootInformado
        $recoveryParaLimpar = $rootInformado
        $journalParaLimpar = $true
    }
    $ack = [ordered]@{
        ok=$true; snapshotId=[string]$pending.snapshotId; activationId=if($pendingActivation){$pendingActivation}else{$null}
        portfolioSha256=$validado.portfolioSha256; sourceSchemaVersion=[int]$pending.sourceSchemaVersion
        sourceAppVersion=[string]$pending.sourceAppVersion; attachmentCount=$confirmados.Count
        indexedDbReady=$true; restoreId=if($restoreId){$restoreId}else{$null}
        recoveryCleaned=$false; acknowledgedAt=(Get-Date).ToUniversalTime().ToString('o')
    }
    Write-PmoJsonAtomic $restoreAckJson $ack
    if ($recoveryParaLimpar -and (Test-Path -LiteralPath $recoveryParaLimpar)) {
        Remove-PmoManagedTree -Root $recoveryRoot -Path $recoveryParaLimpar
    }
    $ack.recoveryCleaned = if ($recoveryParaLimpar) { -not (Test-Path -LiteralPath $recoveryParaLimpar) } else { $null }
    Write-PmoJsonAtomic $restoreAckJson $ack
    Remove-Item -LiteralPath $restorePendingJson -Force
    # O pending e a barreira que impede nova operacao enquanto o navegador nao
    # confirmou o IndexedDB. So depois de remove-lo apagamos o journal completed
    # exatamente correlacionado. Se houver queda entre as etapas, sobra apenas
    # um journal stale seguro, que o bootstrap ignora por restoreId/snapshotId.
    if ($journalParaLimpar) {
        $journalAtual = Read-PmoJson $restoreJournalJson $null
        if ($journalAtual -and [string]$journalAtual.phase -eq 'completed' -and
            [string]$journalAtual.restoreId -eq $restoreId -and
            [string]$journalAtual.snapshotId -eq [string]$pending.snapshotId) {
            Remove-Item -LiteralPath $restoreJournalJson -Force
        }
    }
    return $ack
}

function ConfirmarAppReady($reported) {
    if ([string]::IsNullOrWhiteSpace($ActivationId)) { throw (NovaExcecaoHttp 409 'nenhuma ativacao foi solicitada para esta instancia') }
    if (Test-Path -LiteralPath $restorePendingJson -PathType Leaf) { throw (NovaExcecaoHttp 409 'restauracao do IndexedDB ainda esta pendente') }
    $update = Read-PmoJson $updateJson $null
    $active = Read-PmoJson $activeJson $null
    if (-not $update -or [string]$update.phase -ne 'activating') { throw (NovaExcecaoHttp 409 'update.json nao esta na fase activating') }
    if ([string]$update.activationId -ne $ActivationId -or [string]$reported.activationId -ne $ActivationId) { throw (NovaExcecaoHttp 409 'activationId nao corresponde ao journal de atualizacao') }
    if ([string]$update.targetVersion -ne $appVersion) { throw (NovaExcecaoHttp 409 'versao alvo diverge do runtime iniciado') }
    if (-not $active -or [string]$active.activeVersion -ne $appVersion -or [int]$active.activeSchemaVersion -ne $schemaVersion) {
        throw (NovaExcecaoHttp 409 'active.json diverge do runtime iniciado')
    }
    $activeActivationProp = $active.PSObject.Properties['pendingActivationId']
    if ($null -eq $activeActivationProp -or [string]$activeActivationProp.Value -ne $ActivationId) {
        throw (NovaExcecaoHttp 409 'activationId nao corresponde ao ponteiro ativo pendente')
    }
    if ([string]$reported.appVersion -ne $appVersion -or [int]$reported.schemaVersion -ne $schemaVersion) { throw (NovaExcecaoHttp 409 'versao ou schema reportado diverge') }
    if (-not ($reported.PSObject.Properties.Name -contains 'somenteLeitura') -or [bool]$reported.somenteLeitura) { throw (NovaExcecaoHttp 409 'aplicacao iniciou em modo somente leitura') }
    if (-not [bool]$reported.indexedDbReady -or -not [bool]$reported.diskReady) { throw (NovaExcecaoHttp 409 'persistencia hibrida nao foi confirmada') }
    if (@('disco','navegador') -notcontains [string]$reported.origemCarga) { throw (NovaExcecaoHttp 409 'origem de carga nao confirmada') }
    if (-not (Test-Path -LiteralPath $portJson -PathType Leaf)) { throw (NovaExcecaoHttp 409 'portfolio nao foi persistido em disco') }
    $bundle = Read-PmoJson $portJson $null
    if (-not $bundle -or -not $bundle.meta) { throw (NovaExcecaoHttp 409 'portfolio persistido e invalido') }
    if ([int]$bundle.meta.schemaVersion -ne $schemaVersion -or [string]$bundle.meta.appVersion -ne $appVersion) { throw (NovaExcecaoHttp 409 'portfolio persistido nao corresponde ao runtime') }
    if ([string]$bundle.meta.salvoEm -ne [string]$reported.salvoEm) { throw (NovaExcecaoHttp 409 'selo do portfolio reportado diverge do disco') }
    $portfolioSha = Get-PmoSha256 $portJson
    if ([string]$reported.portfolioSha256 -ne $portfolioSha) { throw (NovaExcecaoHttp 409 'SHA-256 do portfolio reportado diverge do disco') }
    if (-not ($reported.PSObject.Properties.Name -contains 'attachments')) { throw (NovaExcecaoHttp 400 'app-ready sem inventario de anexos') }
    $confirmados = @(ValidarInventarioAnexos $bundle @($reported.attachments))
    $ready = [ordered]@{
        ok=$true; activationId=$ActivationId; appVersion=$appVersion; schemaVersion=$schemaVersion
        activeVersion=[string]$active.activeVersion; portfolioSha256=$portfolioSha; attachmentCount=$confirmados.Count
        diskConfirmed=$true; indexedDbConfirmed=$true; attachmentInventoryConfirmed=$true; readOnly=$false
        inventoryValidated=$true; indexedDbReady=$true; diskReady=$true; origemCarga=[string]$reported.origemCarga
        salvoEm=[string]$reported.salvoEm; at=(Get-Date).ToUniversalTime().ToString('o')
    }
    Write-PmoJsonAtomic $appReadyJson $ready
    return $ready
}

# ---------------------------------------------------------------------- listener
$serveRuntimeMutex = $null
if (-not $HealthOnly) {
    $serveRuntimeMutex = Enter-PmoMutex $installRoot 'runtime' 0
    if (-not $serveRuntimeMutex) { throw 'Outra instancia do PMO Tool ja esta em execucao.' }
}
$listener = New-Object System.Net.HttpListener
$prefixo  = "http://localhost:$Porta/"
$listener.Prefixes.Add($prefixo)

try { $listener.Start() }
catch {
    Write-Host ""
    Write-Host "Nao consegui abrir a porta $Porta." -ForegroundColor Red
    Write-Host ("Detalhe: " + $_.Exception.Message) -ForegroundColor DarkGray
    Write-Host "A origem e fixa por seguranca. Encerre o processo que usa a porta $Porta e tente novamente." -ForegroundColor Yellow
    Exit-PmoMutex $serveRuntimeMutex
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  PMO Tool  ::  Governanca de Portfolio de TI" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ("  Servindo em : " + $prefixo) -ForegroundColor Green
Write-Host ("  App         : " + $appHtml)
Write-Host ("  Dados       : " + $portJson)
Write-Host ("  Anexos      : " + $anexoDir)
Write-Host ("  Exemplos    : " + $sampDir)
Write-Host ("  Templates   : " + $factoryTmplDir + " + " + $userTmplDir)
Write-Host "  Ctrl+C para encerrar." -ForegroundColor DarkGray
Write-Host ""

if (-not $SemBrowser) {
    $abrir = $prefixo
    if (-not [string]::IsNullOrWhiteSpace($UrlInicial)) {
        if (-not $UrlInicial.StartsWith('/')) { $UrlInicial = '/' + $UrlInicial }
        $abrir = $prefixo.TrimEnd('/') + $UrlInicial
    }
    try { Start-Process $abrir | Out-Null }
    catch {
        if ($listener.IsListening) { $listener.Stop() }
        $listener.Close()
        Exit-PmoMutex $serveRuntimeMutex
        throw
    }
}

try {
    while ($listener.IsListening) {
        # A espera bloqueante do HttpListener prende a thread dentro do .NET e o
        # Windows PowerShell 5.1 so processa Ctrl+C entre instrucoes. Aceitar de
        # forma assincrona e esperar em fatias curtas devolve o controle ao
        # PowerShell a cada 250 ms; Ctrl+C interrompe o loop e o finally fecha
        # listener e mutex.
        $aceite = $listener.BeginGetContext($null, $null)
        while (-not $aceite.AsyncWaitHandle.WaitOne(250)) { }
        $ctx  = $listener.EndGetContext($aceite)
        $req  = $ctx.Request
        $resp = $ctx.Response
        $script:contadorReq++
        $rota   = $req.Url.AbsolutePath
        $metodo = $req.HttpMethod

        try {
            # ------------------------------------------------------------ app
            if (-not (RequisicaoLoopback $req)) {
                ResponderErro $resp 403 'somente requisicoes loopback sao aceitas'
            }
            elseif (-not (HostLocalValido $req)) {
                ResponderErro $resp 400 'cabecalho Host invalido'
            }
            elseif (($rota -eq '/' -or $rota -eq '/index.html' -or $rota -eq '/pmo-tool.html') -and $metodo -eq 'GET') {
                ResponderApp $resp
            }
            elseif ($rota -eq '/favicon.ico') {
                Responder $resp 204 $null $null $null
            }
            # --------------------------------------------------------- health
            elseif ($rota -eq '/api/health' -and $metodo -eq 'GET') {
                $temDados = (Test-Path -LiteralPath $portJson)
                $ativo = Read-PmoJson $activeJson $null
                $versaoAtiva = if ($ativo -and $ativo.activeVersion) { [string]$ativo.activeVersion } else { $appVersion }
                ResponderJson $resp 200 ('{"ok":true,"app":"pmo-tool","porta":' + $Porta +
                    ',"appVersion":"' + (JsonEscapar $appVersion) + '"' +
                    ',"build":"' + (JsonEscapar $buildId) + '"' +
                    ',"schemaVersion":' + $schemaVersion +
                    ',"activeVersion":"' + (JsonEscapar $versaoAtiva) + '"' +
                    ',"temPortfolio":' + $temDados.ToString().ToLower() +
                    ',"dataReadable":' + (Test-Path -LiteralPath $dataDir).ToString().ToLower() +
                    ',"dataWritable":' + (PodeEscreverDiretorio $dataDir).ToString().ToLower() +
                    ',"maintenance":' + $script:maintenance.ToString().ToLower() +
                    ',"requisicoes":' + $script:contadorReq +
                    ',"agora":"' + (Get-Date).ToUniversalTime().ToString('o') + '"}')
                if ($HealthOnly) { $script:encerrarAposResposta = $true }
            }
            # --------------------------------------------------------- update
            elseif ($rota -eq '/api/update/check' -and $metodo -eq 'GET') {
                try { ResponderJson $resp 200 ((ConsultarAtualizacao) | ConvertTo-Json -Depth 10 -Compress) }
                catch { ResponderErro $resp 503 $_.Exception.Message }
            }
            elseif ($rota -eq '/api/update/status' -and $metodo -eq 'GET') {
                $status = Read-PmoJson $updateJson ([ordered]@{ formatVersion=1; phase='idle'; updatedAt=$null })
                ResponderJson $resp 200 ($status | ConvertTo-Json -Depth 20 -Compress)
            }
            elseif ($rota -eq '/api/update/prepare' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    if ($script:maintenance) { ResponderErro $resp 409 'atualizacao ja preparada' }
                    else {
                        $txt = LerCorpoTexto $req $maxAdminJsonBytes
                        $preflight = if ([string]::IsNullOrWhiteSpace($txt)) { $null } else { $txt | ConvertFrom-Json }
                        $snapshot = CriarSnapshotAtualizacao $preflight
                        ResponderJson $resp 200 ([ordered]@{ ok=$true; snapshotId=$snapshot.snapshotId; manifest=$snapshot.manifest } | ConvertTo-Json -Depth 100 -Compress)
                    }
                }
            }
            elseif ($rota -eq '/api/update/apply' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    $status = Read-PmoJson $updateJson $null
                    if (-not $status -or $status.phase -ne 'prepared' -or -not $status.snapshotId) { ResponderErro $resp 409 'nenhum snapshot preparado' }
                    else {
                        $updater = Join-Path $installRoot 'atualizar.ps1'
                        if (-not (Test-Path -LiteralPath $updater)) { ResponderErro $resp 500 'atualizar.ps1 nao encontrado' }
                        else {
                            $arg = '-NoProfile -ExecutionPolicy Bypass -File "' + $updater + '" -InstallRoot "' + $installRoot + '" -PreparedSnapshot "' + ([string]$status.snapshotId) + '"'
                            Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -WindowStyle Hidden | Out-Null
                            $script:encerrarAposResposta = $true
                            ResponderJson $resp 202 ('{"ok":true,"snapshotId":"' + (JsonEscapar ([string]$status.snapshotId)) + '","phase":"handoff"}')
                        }
                    }
                }
            }
            elseif ($rota -eq '/api/rollback/apply' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    $status = Read-PmoJson $updateJson $null
                    if (-not $status -or $status.phase -ne 'rollback-prepared' -or -not $status.snapshotId) {
                        ResponderErro $resp 409 'rollback exige snapshot hibrido preparado'
                    } else {
                        $updater = Join-Path $installRoot 'atualizar.ps1'
                        if (-not (Test-Path -LiteralPath $updater -PathType Leaf)) { ResponderErro $resp 500 'atualizar.ps1 nao encontrado' }
                        else {
                            $arg = '-NoProfile -ExecutionPolicy Bypass -File "' + $updater + '" -InstallRoot "' + $installRoot + '" -Rollback -PreparedSnapshot "' + ([string]$status.snapshotId) + '"'
                            Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -WindowStyle Hidden | Out-Null
                            $script:encerrarAposResposta = $true
                            ResponderJson $resp 202 ('{"ok":true,"snapshotId":"' + (JsonEscapar ([string]$status.snapshotId)) + '","phase":"rollback-handoff"}')
                        }
                    }
                }
            }
            elseif ($rota -eq '/api/restore/apply' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    $status = Read-PmoJson $updateJson $null
                    $targetSnapshotId = if ($status) { [string]$status.targetSnapshotId } else { '' }
                    if (-not $status -or $status.phase -ne 'restore-prepared' -or -not $status.snapshotId -or $targetSnapshotId -notmatch '^[A-Za-z0-9_-]{1,100}$') {
                        ResponderErro $resp 409 'restauracao exige snapshot atual e alvo validos'
                    } else {
                        $updater = Join-Path $installRoot 'atualizar.ps1'
                        if (-not (Test-Path -LiteralPath $updater -PathType Leaf)) { ResponderErro $resp 500 'atualizar.ps1 nao encontrado' }
                        else {
                            $arg = '-NoProfile -ExecutionPolicy Bypass -File "' + $updater + '" -InstallRoot "' + $installRoot + '" -RestoreSnapshot "' + $targetSnapshotId + '" -PreparedSnapshot "' + ([string]$status.snapshotId) + '"'
                            Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -WindowStyle Hidden | Out-Null
                            $script:encerrarAposResposta = $true
                            ResponderJson $resp 202 ('{"ok":true,"snapshotId":"' + (JsonEscapar ([string]$status.snapshotId)) + '","targetSnapshotId":"' + (JsonEscapar $targetSnapshotId) + '","phase":"restore-handoff"}')
                        }
                    }
                }
            }
            elseif ($rota -eq '/api/update/cancel' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    $script:maintenance = $false
                    if (Test-Path -LiteralPath $updateLock) { Remove-Item -LiteralPath $updateLock -Force }
                    Write-PmoJsonAtomic $updateJson ([ordered]@{ formatVersion=1; phase='cancelled'; updatedAt=(Get-Date).ToUniversalTime().ToString('o') })
                    ResponderJson $resp 200 '{"ok":true}'
                }
            }
            elseif ($rota -eq '/api/protecao/snapshot' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                    else {
                        $txt = LerCorpoTexto $req $maxAdminJsonBytes
                        if ([string]::IsNullOrWhiteSpace($txt)) { throw (NovaExcecaoHttp 400 'pedido de snapshot de protecao vazio') }
                        try { $pedido = $txt | ConvertFrom-Json } catch { throw (NovaExcecaoHttp 400 'pedido de snapshot de protecao invalido: JSON nao pode ser lido') }
                        $snapshot = CriarSnapshotProtecao $pedido
                        ResponderJson $resp 200 ([ordered]@{ ok=$true; snapshotId=$snapshot.snapshotId; kind=$snapshot.kind; manifest=$snapshot.manifest } | ConvertTo-Json -Depth 100 -Compress)
                    }
                }
            }
            # ------------------------------------------ copia verificavel (PROT-05)
            elseif ($rota -eq '/api/copia-verificavel/exportar' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                    else {
                        $txt = LerCorpoTexto $req $maxAdminJsonBytes
                        if ([string]::IsNullOrWhiteSpace($txt)) { throw (NovaExcecaoHttp 400 'pedido de copia verificavel vazio') }
                        try { $pedido = $txt | ConvertFrom-Json } catch { throw (NovaExcecaoHttp 400 'pedido de copia verificavel invalido: JSON nao pode ser lido') }
                        $copia = ExportarCopiaVerificavel $pedido
                        ResponderJson $resp 200 ([ordered]@{ ok=$true; copyId=$copia.copyId; pasta=$copia.pasta; arquivos=$copia.arquivos; bytes=$copia.bytes; manifestSha256=$copia.manifestSha256 } | ConvertTo-Json -Depth 20 -Compress)
                    }
                }
            }
            elseif ($rota -eq '/api/copia-verificavel/conferir' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                    else {
                        $txt = LerCorpoTexto $req $maxAdminJsonBytes
                        if ([string]::IsNullOrWhiteSpace($txt)) { throw (NovaExcecaoHttp 400 'pedido de conferencia vazio') }
                        try { $pedido = $txt | ConvertFrom-Json } catch { throw (NovaExcecaoHttp 400 'pedido de conferencia invalido: JSON nao pode ser lido') }
                        $resultadoConferir = ConferirCopiaVerificavel $pedido
                        ResponderJson $resp 200 ($resultadoConferir | ConvertTo-Json -Depth 20 -Compress)
                    }
                }
            }
            elseif ($rota -eq '/api/copia-verificavel/sugestoes' -and $metodo -eq 'GET') {
                if (ExigirAdministracao $req $resp) {
                    if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                    else {
                        $sugestoesDestino = SugerirDestinosCopia
                        ResponderJson $resp 200 ([ordered]@{ ok=$true; destinos=$sugestoesDestino.destinos; ultimoDestino=$sugestoesDestino.ultimoDestino } | ConvertTo-Json -Depth 20 -Compress)
                    }
                }
            }
            elseif ($rota -eq '/api/restore-pending' -and $metodo -eq 'GET') {
                if (ExigirAdministracao $req $resp) {
                    $pending = Read-PmoJson $restorePendingJson $null
                    if (-not $pending) { ResponderJson $resp 200 '{"ok":true,"pending":false}' }
                    else {
                        $validado = ValidarRestorePendente $pending
                        ResponderJson $resp 200 ([ordered]@{
                            ok=$true; pending=$true; restore=$pending; attachmentCount=$validado.attachments.Count
                        } | ConvertTo-Json -Depth 100 -Compress)
                    }
                }
            }
            elseif ($rota -eq '/api/restore-ack' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    $txt = LerCorpoTexto $req $maxAdminJsonBytes
                    if ([string]::IsNullOrWhiteSpace($txt)) { throw (NovaExcecaoHttp 400 'restore-ack vazio') }
                    $reported = $txt | ConvertFrom-Json
                    $ack = ConfirmarRestoreAck $reported
                    ResponderJson $resp 200 ($ack | ConvertTo-Json -Depth 20 -Compress)
                }
            }
            elseif ($rota -eq '/api/app-ready' -and $metodo -eq 'POST') {
                if (ExigirAdministracao $req $resp) {
                    $txt = LerCorpoTexto $req $maxAdminJsonBytes
                    if ([string]::IsNullOrWhiteSpace($txt)) { throw (NovaExcecaoHttp 400 'app-ready vazio') }
                    $reported = $txt | ConvertFrom-Json
                    $ready = ConfirmarAppReady $reported
                    ResponderJson $resp 200 ($ready | ConvertTo-Json -Depth 20 -Compress)
                }
            }
            # ------------------------------------------------------ portfolio
            elseif ($rota -eq '/api/portfolio' -and $metodo -eq 'GET') {
                if (Test-Path -LiteralPath $portJson) {
                    ResponderArquivo $resp $portJson
                } else {
                    Responder $resp 204 $null $null $null
                }
            }
            elseif ($rota -eq '/api/portfolio' -and ($metodo -eq 'PUT' -or $metodo -eq 'POST')) {
                if (ExigirAdministracao $req $resp) {
                    if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                    else {
                        $corpo = LerCorpoTexto $req $maxPortfolioBytes
                        if ([string]::IsNullOrWhiteSpace($corpo)) { ResponderErro $resp 400 'corpo vazio' }
                        else {
                            try { $null = $corpo | ConvertFrom-Json } catch { throw (NovaExcecaoHttp 400 'JSON invalido') }
                            RotacionarBackup
                            Write-PmoBytesAtomic $portJson ($utf8SemBom.GetBytes($corpo))
                            ResponderJson $resp 200 ('{"ok":true,"bytes":' + $corpo.Length +
                                ',"sha256":"' + (Get-PmoSha256 $portJson) +
                                '","salvoEm":"' + (Get-Date).ToUniversalTime().ToString('o') + '"}')
                        }
                    }
                }
            }
            elseif ($rota -eq '/api/portfolio' -and $metodo -eq 'DELETE') {
                if (ExigirAdministracao $req $resp) {
                    if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                    else {
                        RotacionarBackup
                        if (Test-Path -LiteralPath $portJson) { Remove-Item -LiteralPath $portJson -Force }
                        ResponderJson $resp 200 '{"ok":true}'
                    }
                }
            }
            # -------------------------------------------------------- backups
            elseif ($rota -eq '/api/backups' -and $metodo -eq 'GET') {
                $itens = @()
                foreach ($f in (Get-ChildItem -Path $bkpDir -Filter 'portfolio-*.json' -File | Sort-Object LastWriteTime -Descending)) {
                    $itens += ('{"nome":"' + (JsonEscapar $f.Name) + '","tamanho":' + $f.Length +
                               ',"em":"' + $f.LastWriteTimeUtc.ToString('o') + '"}')
                }
                $retencaoBackups = Get-RetencaoBackups
                ResponderJson $resp 200 ('{"ok":true,"itens":[' + ($itens -join ',') + '],"retencao":{"horasHorario":' +
                    $retencaoBackups.horasHorario + ',"diasDiario":' + $retencaoBackups.diasDiario + '}}')
            }
            # -------------------------------------------------------- anexos
            elseif ($rota -eq '/api/attachments' -and $metodo -eq 'GET') {
                ResponderJson $resp 200 (IndiceAnexos)
            }
            elseif ($rota -like '/api/attachments/*') {
                $id = IdSeguro ($rota.Substring('/api/attachments/'.Length))
                if (-not $id) { ResponderErro $resp 400 'id de anexo invalido' }
                else {
                    $caminho = Join-Path $anexoDir $id
                    if ($metodo -eq 'GET') {
                        $bundleAtual = if (Test-Path -LiteralPath $portJson -PathType Leaf) { Read-PmoJson $portJson $null } else { $null }
                        $null = Repair-AnexoAtomico $id $bundleAtual
                        ResponderArquivo $resp $caminho
                    }
                    elseif ($metodo -eq 'PUT' -or $metodo -eq 'POST') {
                        if (ExigirAdministracao $req $resp) {
                            if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                            else {
                                $bytes = LerCorpoBytes $req $maxAttachmentBytes
                                Write-PmoBytesAtomic $caminho $bytes
                                $anterior = $caminho + '.previous'
                                if (Test-Path -LiteralPath $anterior -PathType Leaf) { Remove-Item -LiteralPath $anterior -Force -ErrorAction SilentlyContinue }
                                ResponderJson $resp 200 ('{"ok":true,"id":"' + (JsonEscapar $id) + '","tamanho":' + $bytes.Length + ',"sha256":"' + (Get-PmoSha256 $caminho) + '"}')
                            }
                        }
                    }
                    elseif ($metodo -eq 'DELETE') {
                        if (ExigirAdministracao $req $resp) {
                            if ($script:maintenance) { ResponderErro $resp 423 'persistencia bloqueada durante atualizacao' }
                            else {
                                if (Test-Path -LiteralPath $caminho) { Remove-Item -LiteralPath $caminho -Force }
                                $anterior = $caminho + '.previous'
                                if (Test-Path -LiteralPath $anterior) { Remove-Item -LiteralPath $anterior -Force -ErrorAction SilentlyContinue }
                                $replaceBackup = $caminho + '.replace-backup'
                                if (Test-Path -LiteralPath $replaceBackup) { Remove-Item -LiteralPath $replaceBackup -Force -ErrorAction SilentlyContinue }
                                ResponderJson $resp 200 '{"ok":true}'
                            }
                        }
                    }
                    else { ResponderErro $resp 405 'metodo nao permitido' }
                }
            }
            # ------------------------------------------------------- exemplos
            elseif ($rota -eq '/api/samples' -and $metodo -eq 'GET') {
                ResponderJson $resp 200 (IndiceSamples)
            }
            elseif ($rota -like '/samples/*' -and $metodo -eq 'GET') {
                $nome = IdSeguro ($rota.Substring('/samples/'.Length))
                if (-not $nome) { ResponderErro $resp 400 'nome de arquivo invalido' }
                else { ResponderArquivo $resp (Join-Path $sampDir $nome) }
            }
            # ------------------------------------------------------ templates
            elseif ($rota -eq '/api/templates' -and $metodo -eq 'GET') {
                ResponderJson $resp 200 (IndiceTemplates)
            }
            elseif ($rota -like '/templates/*' -and $metodo -eq 'GET') {
                $nome = IdSeguro ($rota.Substring('/templates/'.Length))
                if (-not $nome) { ResponderErro $resp 400 'nome de arquivo invalido' }
                else {
                    $userPath = Join-Path $userTmplDir $nome
                    $factoryPath = Join-Path $factoryTmplDir $nome
                    if (Test-Path -LiteralPath $userPath -PathType Leaf) { ResponderArquivo $resp $userPath }
                    else { ResponderArquivo $resp $factoryPath }
                }
            }
            # ----------------------------------------------------------- 404
            else {
                ResponderErro $resp 404 ('rota nao encontrada: ' + $metodo + ' ' + $rota)
            }

            if ($rota -notlike '/api/health*') {
                Write-Host ("  " + $resp.StatusCode.ToString() + "  " + $metodo.PadRight(6) + " " + $rota) -ForegroundColor DarkGray
            }
            if ($script:encerrarAposResposta) { break }
        }
        catch {
            $msg = $_.Exception.Message
            $statusErro = 500
            if ($_.Exception.Data -and $_.Exception.Data.Contains('HttpStatus')) { $statusErro = [int]$_.Exception.Data['HttpStatus'] }
            Write-Host ("  " + $statusErro + "  " + $metodo + " " + $rota + "  ->  " + $msg) -ForegroundColor Red
            try { ResponderErro $resp $statusErro $msg } catch { }
        }
    }
}
finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
    Exit-PmoMutex $serveRuntimeMutex
    Write-Host ""
    Write-Host "Servidor encerrado." -ForegroundColor Yellow
}
