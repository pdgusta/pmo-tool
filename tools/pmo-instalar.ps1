<#
    pmo-instalar.ps1 - instala o PMO Tool a partir de uma release do GitHub.

    Este e o unico arquivo que a maquina nova baixa. Por isso o codigo de
    confianca daqui e deliberadamente pequeno: TLS, requisicao HTTPS,
    Get-FileHash e comparacao. Nada de validacao de ZIP, nada de materializacao
    de instalacao. Essas partes vem verificadas da propria release:

      1. baixa o manifesto e portable-common.ps1;
      2. confere os dois contra o digest SHA-256 que o GitHub publica;
      3. carrega o helper ja verificado, e so entao interpreta o manifesto;
      4. usa o helper para validar os dois pacotes;
      5. tira install-common.ps1 do bootstrap validado e materializa com ele.

    Assim quem le este arquivo antes de executa-lo precisa auditar poucas
    linhas, e todo o resto e codigo cujo hash foi conferido.

    Raiz de confianca: HTTPS do GitHub mais release imutavel. Nao ha assinatura
    de codigo; ver docs/context/build-release.md.

    Uso:
      .\pmo-instalar.ps1 -Repositorio OWNER/REPO
      .\pmo-instalar.ps1 -Repositorio OWNER/REPO -Versao 1.5.0
      .\pmo-instalar.ps1 -Repositorio OWNER/REPO -InstallDir D:\PMO-Tool
      .\pmo-instalar.ps1 -PacoteLocal .\artifacts -InstallDir C:\temp\PMO
#>
[CmdletBinding()]
param(
    # OWNER/REPOSITORY. Nunca embutido no fonte: o instalador e publico e o
    # repositorio de origem e configuracao local.
    [string]$Repositorio = '',

    [string]$InstallDir = '',

    # SemVer estavel; ausente usa a ultima release estavel.
    [string]$Versao = '',

    # Diretorio com os artefatos ja em disco. Ferramenta de CI e
    # desenvolvimento: NAO oferece autenticidade de canal.
    [string]$PacoteLocal = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$limiteManifesto = 1MB
$limiteHelper = 1MB
$limiteBootstrap = 8MB
$limiteRuntime = 256MB

# ---------------------------------------------------------------- log ------
# Log sanitizado desde a primeira linha, em %TEMP%. So no fim, com a instalacao
# comitada, ele se muda para logs/ dentro dela.
$logPath = Join-Path ([System.IO.Path]::GetTempPath()) ('pmo-instalar-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.log')
function Escrever-Log {
    param([string]$Evento, [string]$Detalhe = '')
    $linha = '{0} {1}{2}' -f (Get-Date).ToUniversalTime().ToString('o'), $Evento, $(if ([string]::IsNullOrWhiteSpace($Detalhe)) { '' } else { ' ' + $Detalhe })
    try { Add-Content -LiteralPath $logPath -Value $linha -Encoding utf8 } catch { }
}
function Informar {
    param([string]$Texto, [string]$Cor = 'Gray')
    Write-Host $Texto -ForegroundColor $Cor
    Escrever-Log 'info' $Texto
}

# ------------------------------------------------------------- preflight ----
function Assert-Preflight {
    param([string]$Destino)

    $ps = $PSVersionTable.PSVersion
    if ($ps.Major -lt 5 -or ($ps.Major -eq 5 -and $ps.Minor -lt 1)) {
        throw "Windows PowerShell 5.1 ou superior e obrigatorio; esta sessao usa $ps."
    }

    # Caminho longo: o arquivo mais fundo da instalacao fica em
    # versions/<semver>/samples/<nome>. 120 caracteres cobrem com folga.
    if ($Destino.Length -gt 140) {
        throw "Caminho de instalacao longo demais ($($Destino.Length) caracteres); use algo mais curto."
    }

    $raizVolume = [System.IO.Path]::GetPathRoot($Destino)
    if ([string]::IsNullOrWhiteSpace($raizVolume) -or $Destino.StartsWith('\\')) {
        throw 'A instalacao precisa ficar em um volume local; caminho de rede nao e suportado.'
    }
    $volume = New-Object System.IO.DriveInfo($raizVolume)
    if ($volume.DriveType -ne [System.IO.DriveType]::Fixed) {
        throw "O volume $raizVolume nao e um disco local fixo ($($volume.DriveType)); nao e suportado."
    }
    if ($volume.DriveFormat -ne 'NTFS') {
        throw "O volume $raizVolume nao e NTFS ($($volume.DriveFormat)); o primeiro suporte assume NTFS local."
    }

    foreach ($nomeVar in @('OneDrive', 'OneDriveCommercial', 'OneDriveConsumer')) {
        $pastaSync = [Environment]::GetEnvironmentVariable($nomeVar)
        if (-not [string]::IsNullOrWhiteSpace($pastaSync)) {
            $pastaSyncFull = [System.IO.Path]::GetFullPath($pastaSync).TrimEnd('\') + '\'
            if ($Destino.StartsWith($pastaSyncFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw 'A instalacao nao pode ficar dentro de uma pasta sincronizada pelo OneDrive.'
            }
        }
    }
    if ($Destino -match '(?i)\\OneDrive([ -][^\\]*)?\\') {
        throw 'A instalacao nao pode ficar dentro de uma pasta sincronizada pelo OneDrive.'
    }
}

<#
    Reexecucao sobre uma instalacao existente e somente leitura: o instalador
    nao repara, nao sobrescreve e nao atualiza. Quem atualiza e o pmo.ps1.
#>
function Test-InstalacaoExistente {
    param([string]$Destino)
    if (-not (Test-Path -LiteralPath $Destino -PathType Container)) { return $false }
    if (@(Get-ChildItem -LiteralPath $Destino -Force).Count -eq 0) { return $false }
    $temLauncher = Test-Path -LiteralPath (Join-Path $Destino 'pmo.ps1') -PathType Leaf
    $temEstado = Test-Path -LiteralPath (Join-Path $Destino 'state\active.json') -PathType Leaf
    if ($temLauncher -and $temEstado) { return $true }
    throw "O destino $Destino nao esta vazio e nao parece uma instalacao do PMO Tool; nada foi alterado."
}

# ----------------------------------------------------------------- rede -----
function Get-CabecalhosGitHub {
    return @{ 'User-Agent' = 'PMO-Tool-Installer'; 'Accept' = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2026-03-10' }
}

<# Traduz a falha de rede em algo acionavel antes de propaga-la. #>
function Converter-FalhaDeRede {
    param([System.Management.Automation.ErrorRecord]$Erro, [string]$Contexto)
    $excecao = $Erro.Exception
    $status = $null
    if ($excecao -is [System.Net.WebException] -and $null -ne $excecao.Response) {
        try { $status = [int]$excecao.Response.StatusCode } catch { }
    }
    if ($null -eq $status -and ($excecao.PSObject.Properties.Name -contains 'Response') -and $null -ne $excecao.Response) {
        try { $status = [int]$excecao.Response.StatusCode } catch { }
    }
    if ($status -eq 403 -or $status -eq 429) {
        return "GitHub recusou a consulta ($status). Sem autenticacao o limite e por endereco IP e costuma ser isso; espere alguns minutos e tente de novo. $Contexto"
    }
    if ($status -eq 404) {
        return "Nao encontrado ($status): confira -Repositorio e -Versao. $Contexto"
    }
    if ($status -eq 401) {
        return "Acesso negado ($status): o repositorio pode ser privado. $Contexto"
    }
    if ($excecao -is [System.Net.WebException] -and $excecao.Status -eq [System.Net.WebExceptionStatus]::Timeout) {
        return "A conexao expirou. Verifique rede ou proxy e tente de novo. $Contexto"
    }
    if ($excecao -is [System.Net.WebException] -and $excecao.Status -eq [System.Net.WebExceptionStatus]::NameResolutionFailure) {
        return "Nao foi possivel resolver api.github.com. Verifique a conexao. $Contexto"
    }
    return "Falha de rede: $($excecao.Message) $Contexto"
}

function Assert-UrlGitHub {
    param([string]$Url)
    $uri = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) { throw "URL de download invalida: $Url" }
    if ($uri.Scheme -ne 'https') { throw 'Download recusado: somente HTTPS e aceito.' }
    # $host e variavel automatica do PowerShell; nunca reutilizar o nome.
    $servidor = $uri.Host.ToLowerInvariant()
    if (-not ($servidor -eq 'github.com' -or $servidor.EndsWith('.github.com') -or $servidor.EndsWith('.githubusercontent.com'))) {
        throw "Download recusado: host inesperado ($servidor)."
    }
    return $uri
}

function Get-Release {
    param([string]$Repo, [string]$VersaoPinada)
    if ($Repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw "Repositorio invalido: $Repo (use OWNER/REPOSITORY)." }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $uri = if ([string]::IsNullOrWhiteSpace($VersaoPinada)) {
        "https://api.github.com/repos/$Repo/releases/latest"
    } else {
        "https://api.github.com/repos/$Repo/releases/tags/v$VersaoPinada"
    }
    Escrever-Log 'descoberta' $uri
    try {
        $release = Invoke-RestMethod -UseBasicParsing -Uri $uri -Headers (Get-CabecalhosGitHub) -TimeoutSec 30
    }
    catch {
        throw (Converter-FalhaDeRede $_ "Consulta: $uri")
    }
    return Assert-ReleaseEstavel $release
}

<#
    Separado de Get-Release de proposito: e logica pura sobre a resposta, sem
    rede, e portanto testavel sem depender do GitHub. Uma resposta 200 que nao
    seja uma release nao levanta excecao de rede - cai aqui.
#>
function Assert-ReleaseEstavel {
    param($Release)
    if ($null -eq $Release) { throw 'GitHub respondeu vazio para a consulta de release.' }
    foreach ($campo in @('tag_name', 'assets')) {
        if (-not ($Release.PSObject.Properties.Name -contains $campo)) { throw "Resposta do GitHub sem '$campo'; nao e uma release valida." }
    }
    if (($Release.PSObject.Properties.Name -contains 'draft') -and [bool]$Release.draft) { throw 'A release encontrada e um draft; drafts nunca sao instalados.' }
    if (($Release.PSObject.Properties.Name -contains 'prerelease') -and [bool]$Release.prerelease) { throw 'A release encontrada e prerelease; somente o canal stable e instalado.' }
    if (-not ($Release.PSObject.Properties.Name -contains 'immutable') -or -not [bool]$Release.immutable) {
        throw 'A release precisa estar imutavel; uma release mutavel pode trocar de conteudo depois da verificacao.'
    }
    # [regex]::Match em vez de -notmatch + $Matches: o preenchimento de
    # $Matches pelo operador negado nao e obvio nem estavel de ler.
    $tag = [regex]::Match([string]$Release.tag_name, '^v((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$')
    if (-not $tag.Success) { throw "Tag fora do padrao vX.Y.Z: $($Release.tag_name)" }
    return [pscustomobject]@{ Versao = $tag.Groups[1].Value; Assets = @($Release.assets) }
}

function Find-Asset {
    param($Assets, [string]$Nome, [Int64]$LimiteBytes)
    $achado = @($Assets | Where-Object { [string]$_.name -ceq $Nome })
    if ($achado.Count -ne 1) { throw "A release nao traz exatamente um asset chamado '$Nome'." }
    $asset = $achado[0]
    if (-not ($asset.PSObject.Properties.Name -contains 'digest')) {
        throw "O asset '$Nome' nao traz digest SHA-256 do GitHub; download recusado."
    }
    $md = [regex]::Match([string]$asset.digest, '^sha256:([a-fA-F0-9]{64})$')
    if (-not $md.Success) { throw "O asset '$Nome' tem digest em formato inesperado; download recusado." }
    $digest = $md.Groups[1].Value.ToLowerInvariant()
    $tamanho = [Int64]$asset.size
    if ($tamanho -le 0 -or $tamanho -gt $LimiteBytes) { throw "O asset '$Nome' esta fora do limite de $LimiteBytes bytes (tem $tamanho)." }
    return [pscustomobject]@{
        Name = $Nome; Size = $tamanho; Digest = $digest
        Url = [string]$asset.browser_download_url
    }
}

function Get-Sha256Arquivo {
    param([string]$Caminho)
    return (Get-FileHash -LiteralPath $Caminho -Algorithm SHA256).Hash.ToLowerInvariant()
}

<#
    Nucleo de confianca: baixa e so devolve o arquivo se tamanho e SHA-256
    baterem com o que o GitHub publicou. Qualquer divergencia apaga o arquivo.
#>
function Receber-Asset {
    param($Asset, [string]$Destino, [int]$TimeoutSec = 300)
    $uri = Assert-UrlGitHub $Asset.Url
    Escrever-Log 'download' ("{0} de {1}{2}" -f $Asset.Name, $uri.Host, $uri.AbsolutePath)
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $uri.AbsoluteUri -OutFile $Destino -Headers (Get-CabecalhosGitHub) -TimeoutSec $TimeoutSec
    }
    catch {
        if (Test-Path -LiteralPath $Destino) { Remove-Item -LiteralPath $Destino -Force -ErrorAction SilentlyContinue }
        throw (Converter-FalhaDeRede $_ "Artefato: $($Asset.Name)")
    }
    if (-not (Test-Path -LiteralPath $Destino -PathType Leaf)) { throw "Download de $($Asset.Name) nao produziu arquivo." }
    $tamanhoReal = (Get-Item -LiteralPath $Destino).Length
    $hashReal = Get-Sha256Arquivo $Destino
    if ($tamanhoReal -ne $Asset.Size -or $hashReal -cne $Asset.Digest) {
        Remove-Item -LiteralPath $Destino -Force -ErrorAction SilentlyContinue
        throw "Integridade de $($Asset.Name) reprovada: o conteudo recebido nao corresponde ao digest publicado pelo GitHub."
    }
    Escrever-Log 'verificado' ("{0} sha256={1}" -f $Asset.Name, $hashReal)
    return $Destino
}

function Assert-EspacoLivre {
    param([string]$Caminho, [Int64]$BytesNecessarios)
    $raiz = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($Caminho))
    $livre = [Int64](New-Object System.IO.DriveInfo($raiz)).AvailableFreeSpace
    if ($livre -lt $BytesNecessarios) {
        throw "Espaco insuficiente em $raiz`: $livre bytes livres, sao necessarios ao menos $BytesNecessarios."
    }
}

# ------------------------------------------------------------------ main ----
$trabalho = $null
$sucesso = $false
$comitado = $false
$destino = ''
try {
    if ([string]::IsNullOrWhiteSpace($InstallDir)) {
        $baseLocal = [System.Environment]::GetFolderPath('LocalApplicationData')
        if ([string]::IsNullOrWhiteSpace($baseLocal)) { throw 'Nao foi possivel resolver %LOCALAPPDATA%; informe -InstallDir.' }
        $InstallDir = Join-Path $baseLocal 'PMO-Tool'
    }
    $destino = [System.IO.Path]::GetFullPath($InstallDir)
    $canonico = $null
    $baseCanonica = [System.Environment]::GetFolderPath('LocalApplicationData')
    if (-not [string]::IsNullOrWhiteSpace($baseCanonica)) { $canonico = [System.IO.Path]::GetFullPath((Join-Path $baseCanonica 'PMO-Tool')) }

    Escrever-Log 'inicio' "destino=$destino versaoSolicitada=$(if ($Versao) { $Versao } else { '(ultima estavel)' })"
    Informar "PMO Tool - instalacao" 'Cyan'
    Informar "Log desta execucao: $logPath"

    Assert-Preflight $destino
    if ($null -ne $canonico -and -not $destino.Equals($canonico, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Warning "Destino fora do local canonico ($canonico). Uma instalacao por usuario e o unico cenario suportado: duas instalacoes compartilham o mesmo armazenamento do navegador em http://localhost:8090 e a segunda trava em somente leitura."
        Escrever-Log 'aviso' 'destino fora do canonico'
    }
    if (Test-InstalacaoExistente $destino) {
        Informar ''
        Informar "Ja existe uma instalacao do PMO Tool em $destino." 'Yellow'
        Informar 'Este instalador nao atualiza nem repara. Para atualizar, use:' 'Yellow'
        Informar "    $destino\pmo.ps1 -Atualizar" 'Yellow'
        Escrever-Log 'fim' 'instalacao existente; nada alterado'
        exit 0
    }

    $usarLocal = -not [string]::IsNullOrWhiteSpace($PacoteLocal)
    if (-not $usarLocal -and [string]::IsNullOrWhiteSpace($Repositorio)) {
        throw 'Informe -Repositorio OWNER/REPOSITORY (ou -PacoteLocal para instalar de artefatos ja em disco).'
    }
    if (-not [string]::IsNullOrWhiteSpace($Versao) -and $Versao -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
        throw "Versao invalida: $Versao (use SemVer estavel X.Y.Z)."
    }

    $trabalho = Join-Path ([System.IO.Path]::GetTempPath()) ('pmo-instalar-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $trabalho | Out-Null

    if ($usarLocal) {
        Write-Warning 'Instalacao a partir de -PacoteLocal: os hashes sao conferidos contra o manifesto local, mas nao ha autenticidade de canal. Use somente em CI ou desenvolvimento.'
        Escrever-Log 'modo' 'pacote local'
        $origemLocal = [System.IO.Path]::GetFullPath($PacoteLocal)
        if (-not (Test-Path -LiteralPath $origemLocal -PathType Container)) { throw "Diretorio de pacote local inexistente: $origemLocal" }
        $manifestoLocal = @(Get-ChildItem -LiteralPath $origemLocal -File -Filter 'pmo-tool-*-manifest.json')
        if ($manifestoLocal.Count -ne 1) { throw 'O diretorio local precisa conter exatamente um manifesto pmo-tool-<versao>-manifest.json.' }
        $manifestoPath = Join-Path $trabalho $manifestoLocal[0].Name
        Copy-Item -LiteralPath $manifestoLocal[0].FullName -Destination $manifestoPath
        $helperPath = Join-Path $trabalho 'portable-common.ps1'
        Copy-Item -LiteralPath (Join-Path $origemLocal 'portable-common.ps1') -Destination $helperPath
    }
    else {
        Informar "Consultando releases de $Repositorio..."
        $release = Get-Release $Repositorio $Versao
        Informar "Release estavel e imutavel encontrada: v$($release.Versao)" 'Green'

        $assetManifesto = Find-Asset $release.Assets ("pmo-tool-$($release.Versao)-manifest.json") $limiteManifesto
        $assetHelper = Find-Asset $release.Assets 'portable-common.ps1' $limiteHelper
        $manifestoPath = Receber-Asset $assetManifesto (Join-Path $trabalho $assetManifesto.Name) 60
        $helperPath = Receber-Asset $assetHelper (Join-Path $trabalho $assetHelper.Name) 60
    }

    # A partir daqui o helper ja foi verificado: pode ser carregado, e e ele
    # quem sabe validar manifesto e pacotes.
    . $helperPath
    if (-not (Get-Command Assert-PmoReleaseManifest -CommandType Function -ErrorAction SilentlyContinue)) {
        throw 'O helper baixado nao expoe Assert-PmoReleaseManifest; release incompativel com este instalador.'
    }

    $manifesto = [System.IO.File]::ReadAllText($manifestoPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $versaoAlvo = if ($usarLocal) { '' } else { $release.Versao }
    $contrato = Assert-PmoReleaseManifest $manifesto $versaoAlvo
    $versaoAlvo = $contrato.Version
    Informar "Manifesto valido para a versao $versaoAlvo."

    if ((Get-Sha256Arquivo $helperPath) -cne $contrato.Helper.Sha256) {
        throw 'O helper nao corresponde ao hash declarado no manifesto.'
    }

    # Espaco medido pelo tamanho real declarado, nao pelos limites maximos:
    # download, extracao e a copia final convivem por um instante.
    $bytesPacotes = [Int64]$contrato.Runtime.Size + [Int64]$contrato.Bootstrap.Size
    Assert-EspacoLivre $trabalho ($bytesPacotes * 3)
    Assert-EspacoLivre ([System.IO.Path]::GetPathRoot($destino)) ($bytesPacotes * 4 + 16MB)

    if ($usarLocal) {
        $runtimeZip = Join-Path $trabalho $contrato.Runtime.Name
        $bootstrapZip = Join-Path $trabalho $contrato.Bootstrap.Name
        Copy-Item -LiteralPath (Join-Path $origemLocal $contrato.Runtime.Name) -Destination $runtimeZip
        Copy-Item -LiteralPath (Join-Path $origemLocal $contrato.Bootstrap.Name) -Destination $bootstrapZip
    }
    else {
        $assetRuntime = Find-Asset $release.Assets $contrato.Runtime.Name $limiteRuntime
        $assetBootstrap = Find-Asset $release.Assets $contrato.Bootstrap.Name $limiteBootstrap
        # O manifesto e o metadado do GitHub precisam concordar antes do download.
        if ($assetRuntime.Size -ne $contrato.Runtime.Size -or $assetRuntime.Digest -cne $contrato.Runtime.Sha256) {
            throw 'O manifesto diverge dos metadados do artefato de runtime no GitHub.'
        }
        if ($assetBootstrap.Size -ne $contrato.Bootstrap.Size -or $assetBootstrap.Digest -cne $contrato.Bootstrap.Sha256) {
            throw 'O manifesto diverge dos metadados do artefato de bootstrap no GitHub.'
        }
        $runtimeZip = Receber-Asset $assetRuntime (Join-Path $trabalho $assetRuntime.Name) 300
        $bootstrapZip = Receber-Asset $assetBootstrap (Join-Path $trabalho $assetBootstrap.Name) 120
    }

    foreach ($par in @(@{ p = $runtimeZip; c = $contrato.Runtime }, @{ p = $bootstrapZip; c = $contrato.Bootstrap })) {
        if ((Get-Item -LiteralPath $par.p).Length -ne $par.c.Size -or (Get-Sha256Arquivo $par.p) -cne $par.c.Sha256) {
            throw "Integridade de $($par.c.Name) reprovada contra o manifesto."
        }
    }
    Informar 'Pacotes recebidos e conferidos.' 'Green'

    # Validacao de conteudo com o helper: cada pacote pela sua allowlist.
    $checkRuntime = Test-PmoArchive $runtimeZip
    if (-not $checkRuntime.ok) { throw ('Pacote de runtime rejeitado: ' + ($checkRuntime.errors -join '; ')) }

    # install-common.ps1 sai do bootstrap ja validado; e o unico jeito de
    # obte-lo sem repetir aqui a logica de materializacao.
    $extracaoBootstrap = Join-Path $trabalho 'bootstrap'
    $regrasBootstrap = @{
        ArquivosPermitidos   = @('pmo.ps1', 'atualizar.ps1', 'bootstrap.json', 'LICENSE', 'NOTICE', 'tools/portable-common.ps1', 'tools/install-common.ps1')
        PrefixosPermitidos   = @()
        DiretoriosPermitidos = @('tools')
    }
    $checkBootstrap = Test-PmoArchive $bootstrapZip @regrasBootstrap
    if (-not $checkBootstrap.ok) { throw ('Pacote de bootstrap rejeitado: ' + ($checkBootstrap.errors -join '; ')) }
    Expand-PmoArchiveSafe $bootstrapZip $extracaoBootstrap @regrasBootstrap

    $installCommon = Join-Path $extracaoBootstrap 'tools\install-common.ps1'
    if (-not (Test-Path -LiteralPath $installCommon -PathType Leaf)) { throw 'O pacote de bootstrap nao traz tools/install-common.ps1.' }
    . $installCommon
    if (-not (Get-Command Install-PmoPortableFromPackages -CommandType Function -ErrorAction SilentlyContinue)) {
        throw 'O bootstrap baixado nao expoe Install-PmoPortableFromPackages; release incompativel.'
    }
    # A allowlist usada acima tem de ser a mesma que o proprio bootstrap declara.
    $allowlistDeclarada = (@((Get-PmoBootstrapArchiveRules).ArquivosPermitidos) | Sort-Object) -join '|'
    $allowlistUsada = (@($regrasBootstrap.ArquivosPermitidos) | Sort-Object) -join '|'
    if ($allowlistDeclarada -cne $allowlistUsada) {
        throw 'A allowlist de bootstrap deste instalador diverge da declarada pela release.'
    }

    Informar "Instalando em $destino ..."
    $resultado = Install-PmoPortableFromPackages `
        -RuntimeZip $runtimeZip -BootstrapZip $bootstrapZip -Destination $destino `
        -Versao $versaoAlvo -Repositorio $Repositorio
    $comitado = $true
    Escrever-Log 'materializado' ([string]$resultado.Destination)

    # Diagnostico obrigatorio: e o que prova que a instalacao comitada abre,
    # com pin, inventario e escrita reais.
    Informar 'Verificando a instalacao...'
    $anteriorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $saida = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destino 'pmo.ps1') -Diagnostico 2>&1 | ForEach-Object { [string]$_ })
        $codigo = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $anteriorPreference }
    $textoDiag = ($saida -join [Environment]::NewLine)
    if ($codigo -ne 0) { throw "Diagnostico da instalacao falhou (codigo $codigo):`n$textoDiag" }
    $diagnostico = $null
    try { $diagnostico = $textoDiag | ConvertFrom-Json } catch { throw "Diagnostico nao retornou JSON valido:`n$textoDiag" }
    if (-not $diagnostico.ok -or -not $diagnostico.runtimeIntegrity -or -not $diagnostico.dataWritable) {
        throw "Diagnostico nao confirmou integridade e escrita:`n$textoDiag"
    }
    Escrever-Log 'diagnostico' 'ok'

    $sucesso = $true
    Informar ''
    Informar "PMO Tool $versaoAlvo instalado em $destino" 'Green'
    Informar 'Para abrir:' 'Green'
    Informar "    $destino\pmo.ps1" 'Green'
    Informar 'Para atualizar depois:' 'Green'
    Informar "    $destino\pmo.ps1 -Atualizar" 'Green'
}
catch {
    Escrever-Log 'erro' $_.Exception.Message
    Write-Host ''
    Write-Host "Instalacao interrompida: $($_.Exception.Message)" -ForegroundColor Red
    if ($comitado) {
        # A arvore ja existe: nao se apaga evidencia de falha automaticamente.
        # Nao ha dado de usuario aqui, entao remove-la e seguro e e decisao de
        # quem opera, depois de olhar.
        Write-Host "A instalacao em $destino foi criada mas nao passou na verificacao final." -ForegroundColor Red
        Write-Host 'Ela foi preservada para inspecao; remova a pasta antes de tentar de novo.' -ForegroundColor Red
    }
    else {
        Write-Host 'Nada foi gravado no destino.' -ForegroundColor Red
    }
    Write-Host "Log: $logPath" -ForegroundColor Red
    exit 1
}
finally {
    if ($null -ne $trabalho -and (Test-Path -LiteralPath $trabalho -PathType Container)) {
        $nomeTrabalho = [System.IO.Path]::GetFileName($trabalho)
        if ($nomeTrabalho.StartsWith('pmo-instalar-', [System.StringComparison]::Ordinal)) {
            try { Remove-Item -LiteralPath $trabalho -Recurse -Force } catch { }
        }
    }
    if ($sucesso) {
        # O log so entra na instalacao depois que ela existe de fato.
        try {
            $logDestino = Join-Path $destino 'logs'
            if (Test-Path -LiteralPath $logDestino -PathType Container) {
                Move-Item -LiteralPath $logPath -Destination (Join-Path $logDestino ([System.IO.Path]::GetFileName($logPath))) -Force
            }
        }
        catch { }
    }
}
