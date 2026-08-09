<#
    Suite sem dependencias para build e release.
    Deve executar em Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [string] $Version,
    [string] $Commit = '0123456789abcdef0123456789abcdef01234567',
    [string] $BuildTimestamp = '2026-01-01T00:00:00Z',
    [string] $NodePath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$testDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $testDir
$modeloPath = Join-Path (Join-Path (Join-Path $raiz 'src') 'js') '10-model.js'
. (Join-Path (Join-Path $raiz 'tools') 'portable-common.ps1')
. (Join-Path (Join-Path $raiz 'tools') 'install-common.ps1')

if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue }
    if ($nodeCommand) { $NodePath = $nodeCommand.Source }
}
if ([string]::IsNullOrWhiteSpace($NodePath) -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw 'Node.js de desenvolvimento e obrigatorio para validar migracoes e o JavaScript do artefato.'
}

function Assert-Igual($Esperado, $Atual, [string] $Mensagem) {
    if ($Esperado -ne $Atual) {
        throw "$Mensagem`nEsperado: $Esperado`nAtual: $Atual"
    }
}

function Assert-Throws([scriptblock] $Acao, [string] $Padrao, [string] $Mensagem) {
    $falhou = $false
    try {
        & $Acao | Out-Null
    }
    catch {
        $falhou = $true
        if ($Padrao -and $_.Exception.Message -notmatch $Padrao) {
            throw "$Mensagem gerou erro inesperado: $($_.Exception.Message)"
        }
    }
    if (-not $falhou) {
        throw "$Mensagem deveria ter sido rejeitado."
    }
}

function Invoke-PmoExternal([string]$Root,[string[]]$Arguments) {
    $launcher = Join-Path $Root 'pmo.ps1'
    # Windows PowerShell promove stderr de um processo nativo a ErrorRecord.
    # Os casos negativos abaixo precisam capturar essa saída e o exit code sem
    # deixar que ErrorActionPreference=Stop encerre o próprio test harness.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $lines = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher @Arguments 2>&1 | ForEach-Object { [string]$_ })
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    return [pscustomobject]@{ ExitCode=$exitCode; Output=($lines -join [Environment]::NewLine) }
}

function Assert-PmoExternalFails([string]$Root,[string[]]$Arguments,[string]$Pattern,[string]$Message) {
    $result = Invoke-PmoExternal $Root $Arguments
    if ($result.ExitCode -eq 0) { throw "$Message deveria ter sido rejeitado." }
    if ($Pattern -and [string]$result.Output -notmatch $Pattern) {
        throw "$Message gerou erro inesperado: $($result.Output)"
    }
}

function Criar-ZipComEntrada([string] $Caminho, [string] $NomeEntrada, [byte[]] $Conteudo = $null) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [System.IO.File]::Open($Caminho, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $zip = $null
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        $entrada = $zip.CreateEntry($NomeEntrada)
        $destino = $entrada.Open()
        try {
            $bytes = if ($null -ne $Conteudo) { $Conteudo } else { [System.Text.Encoding]::UTF8.GetBytes('{}') }
            $destino.Write($bytes, 0, $bytes.Length)
        }
        finally {
            $destino.Dispose()
        }
    }
    finally {
        if ($null -ne $zip) {
            $zip.Dispose()
        }
        $stream.Dispose()
    }
}

<#
    Extrai do proprio update-runtime.ps1 as condicoes que interpretam o
    manifesto externo. Testar o predicado real, e nao uma transcricao dele,
    e o que torna a prova de retrocompatibilidade honesta: se o updater mudar,
    o teste passa a exercitar a versao nova.
#>
function Obter-CondicoesManifestoUpdater([string] $Caminho) {
    $tokens = $null
    $erros = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($Caminho, [ref]$tokens, [ref]$erros)
    if ($erros.Count -gt 0) { throw "update-runtime.ps1 nao pode ser analisado: $($erros[0])" }
    $condicoes = @()
    foreach ($no in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.IfStatementAst] }, $true))) {
        foreach ($clausula in $no.Clauses) {
            $texto = $clausula.Item1.Extent.Text
            # \b evita casar $externalManifestPath, que e o arquivo baixado e
            # nao o manifesto ja interpretado.
            if ($texto -match '\$externalManifest\b') { $condicoes += $texto }
        }
    }
    return $condicoes
}

# Empacota somente arquivos: entradas explicitas de diretorio sao recusadas
# pelos validadores, e o objetivo aqui e testar allowlist, nao esse detalhe.
function Criar-ZipDeDiretorio([string] $Origem, [string] $Destino) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $Destino) { Remove-Item -LiteralPath $Destino -Force }
    $raizOrigem = [System.IO.Path]::GetFullPath($Origem).TrimEnd('\') + '\'
    $stream = [System.IO.File]::Open($Destino, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $zip = $null
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        foreach ($arquivo in @(Get-ChildItem -LiteralPath $Origem -File -Recurse | Sort-Object FullName)) {
            $relativo = $arquivo.FullName.Substring($raizOrigem.Length).Replace('\','/')
            $entrada = $zip.CreateEntry($relativo, [System.IO.Compression.CompressionLevel]::Optimal)
            $origemStream = [System.IO.File]::OpenRead($arquivo.FullName)
            $destinoStream = $entrada.Open()
            try { $origemStream.CopyTo($destinoStream) } finally { $destinoStream.Dispose(); $origemStream.Dispose() }
        }
    }
    finally {
        if ($null -ne $zip) { $zip.Dispose() }
        $stream.Dispose()
    }
}

<#
    Importa uma funcao do instalador para o escopo do teste. O instalador nao e
    dot-sourceavel (ele executa ao ser carregado), entao vale o mesmo idioma que
    Test-UpdaterRecovery.ps1 ja usa com o updater.
#>
function Import-FuncaoInstalador([string] $Nome) {
    $tokens = $null
    $erros = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $raiz 'tools\pmo-instalar.ps1'), [ref]$tokens, [ref]$erros)
    if ($erros.Count -gt 0) { throw "Instalador com erro de parse: $($erros[0].Message)" }
    $definicao = @($ast.FindAll({ param($no) $no -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $no.Name -eq $Nome }, $true)) | Select-Object -First 1
    if (-not $definicao) { throw "Funcao $Nome nao encontrada no instalador." }
    $corpo = $definicao.Body.Extent.Text
    $corpo = $corpo.Substring(1, $corpo.Length - 2)
    Set-Item -Path ('Function:\script:' + $Nome) -Value ([scriptblock]::Create($corpo))
}

function Invoke-Instalador([string[]] $Arguments) {
    $script = Join-Path (Join-Path $raiz 'tools') 'pmo-instalar.ps1'
    $anterior = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $linhas = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script @Arguments 2>&1 | ForEach-Object { [string]$_ })
        $codigo = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $anterior }
    return [pscustomobject]@{ ExitCode = $codigo; Output = ($linhas -join [Environment]::NewLine) }
}

<#
    Servidor local que responde exatamente o status pedido no caminho. Serve
    para produzir WebException reais - com HttpWebResponse de verdade - sem
    depender de rede nem consumir o limite de taxa do GitHub. Nao usa a porta
    8090: nao e a aplicacao, e sim um stub de teste.
#>
function Start-ServidorDeStatus([int] $Porta, [int] $Requisicoes) {
    $job = Start-Job -ScriptBlock {
        param($p, $n)
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$p/")
        $listener.Start()
        try {
            for ($i = 0; $i -lt $n; $i++) {
                $ctx = $listener.GetContext()
                $rota = $ctx.Request.Url.AbsolutePath
                $corpo = [System.Text.Encoding]::UTF8.GetBytes('{"message":"stub"}')
                $ctx.Response.ContentType = 'application/json'
                if ($rota -eq '/403') { $ctx.Response.StatusCode = 403 }
                elseif ($rota -eq '/404') { $ctx.Response.StatusCode = 404 }
                else {
                    $ctx.Response.StatusCode = 200
                    $ctx.Response.ContentType = 'text/html'
                    $corpo = [System.Text.Encoding]::UTF8.GetBytes('<html>isto nao e json</html>')
                }
                $ctx.Response.OutputStream.Write($corpo, 0, $corpo.Length)
                $ctx.Response.Close()
            }
        }
        finally { $listener.Stop(); $listener.Close() }
    } -ArgumentList $Porta, $Requisicoes
    return $job
}

function Get-PortaLivre {
    $tcp = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    $tcp.Start()
    $porta = $tcp.LocalEndpoint.Port
    $tcp.Stop()
    return $porta
}

function Alterar-ReleaseNoZip([string]$Origem,[string]$Destino,[string]$Padrao,[string]$Substituicao) {
    Copy-Item -LiteralPath $Origem -Destination $Destino
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [System.IO.File]::Open($Destino,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
    $zip = $null
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($stream,[System.IO.Compression.ZipArchiveMode]::Update,$false)
        $entry = @($zip.Entries | Where-Object { $_.FullName -eq 'release.json' })
        if ($entry.Count -ne 1) { throw 'Fixture sem release.json unico.' }
        $reader = New-Object System.IO.StreamReader($entry[0].Open(),[System.Text.Encoding]::UTF8)
        try { $raw = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $regexAlteracao = [regex]$Padrao
        $alterado = $regexAlteracao.Replace($raw,$Substituicao,1)
        if ($alterado -eq $raw) { throw 'Padrao de adulteracao nao encontrado em release.json.' }
        $entry[0].Delete()
        $nova = $zip.CreateEntry('release.json',[System.IO.Compression.CompressionLevel]::Optimal)
        $dest = $nova.Open()
        try {
            $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($alterado)
            $dest.Write($bytes,0,$bytes.Length)
        } finally { $dest.Dispose() }
    } finally {
        if ($null -ne $zip) { $zip.Dispose() }
        $stream.Dispose()
    }
}

$modelo = [System.IO.File]::ReadAllText($modeloPath, [System.Text.Encoding]::UTF8)
$matchVersao = [regex]::Match($modelo, 'model\.APP_VERSION\s*=\s*[''"](?<version>[^''"]+)[''"]')
if (-not $matchVersao.Success) {
    throw 'Nao foi possivel obter APP_VERSION para os testes.'
}
$versaoFonte = $matchVersao.Groups['version'].Value
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $versaoFonte
}
Assert-Igual $versaoFonte $Version 'A versao de teste deve coincidir com APP_VERSION.'

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$tempDir = [System.IO.Path]::GetFullPath((Join-Path $tempBase ('pmo-tests-' + [Guid]::NewGuid().ToString('N'))))
if (-not $tempDir.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Pasta de testes calculada fora do TEMP.'
}

try {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    Write-Host '1/7 Sintaxe Windows PowerShell 5.1 e contratos JSON' -ForegroundColor Cyan
    foreach ($script in @(
        (Join-Path $raiz 'build.ps1'),
        (Join-Path $raiz 'serve.ps1'),
        (Join-Path $raiz 'pmo.ps1'),
        (Join-Path $raiz 'atualizar.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'portable-common.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'update-runtime.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'install-common.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'New-PortableInstall.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'New-ReleasePackage.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'Test-ReleasePackage.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'Test-BootstrapPackage.ps1'),
        (Join-Path (Join-Path $raiz 'tools') 'pmo-instalar.ps1'),
        (Join-Path $testDir 'Invoke-ModelMigrationTests.ps1'),
        $MyInvocation.MyCommand.Path
    )) {
        $tokens = $null
        $erros = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$erros)
        if ($erros.Count -gt 0) {
            throw "Erro de sintaxe em $script`: $($erros[0])"
        }
    }
    foreach ($json in @(
        (Join-Path $raiz 'config\install.example.json'),
        (Join-Path $raiz 'state\active.example.json'),
        (Join-Path $raiz 'state\update.example.json'),
        (Join-Path $raiz 'docs\context\index.json')
    )) {
        $null = [System.IO.File]::ReadAllText($json, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    }
    & (Join-Path $testDir 'Invoke-ModelMigrationTests.ps1') -NodePath $NodePath

    $atomicDir = Join-Path $tempDir 'atomic-bytes'
    New-Item -ItemType Directory -Path $atomicDir | Out-Null
    $atomicPath = Join-Path $atomicDir 'anexo.bin'
    $atomicBackup = $atomicPath + '.replace-backup'
    $expectedBytes = [System.Text.Encoding]::UTF8.GetBytes('conteudo-valido')
    [System.IO.File]::WriteAllBytes($atomicBackup,$expectedBytes)
    $expectedHash = (Get-FileHash -LiteralPath $atomicBackup -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Igual $true (Repair-PmoAtomicBytes -Path $atomicPath -ExpectedSize $expectedBytes.Length -ExpectedSha256 $expectedHash) 'Backup atomico ausente deve ser restaurado.'
    Assert-Igual 'conteudo-valido' ([System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($atomicPath))) 'Bytes restaurados do backup atomico.'
    [System.IO.File]::WriteAllBytes($atomicPath,[System.Text.Encoding]::UTF8.GetBytes('corrompido'))
    [System.IO.File]::WriteAllBytes($atomicBackup,$expectedBytes)
    Assert-Igual $true (Repair-PmoAtomicBytes -Path $atomicPath -ExpectedSize $expectedBytes.Length -ExpectedSha256 $expectedHash) 'Backup atomico valido deve substituir alvo corrompido.'
    Assert-Igual 'conteudo-valido' ([System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($atomicPath))) 'Recuperacao atomica deve preservar o blob valido.'

    $durableSource = Join-Path $atomicDir 'durable-source.bin'
    $durableDestination = Join-Path $atomicDir 'durable-destination.bin'
    [System.IO.File]::WriteAllBytes($durableSource,$expectedBytes)
    Copy-PmoFileDurable -Source $durableSource -Destination $durableDestination
    Assert-Igual $expectedHash (Get-PmoSha256 $durableDestination) 'Copia duravel de arquivo deve preservar SHA-256.'
    $durableTreeSource = Join-Path $atomicDir 'tree-source'
    $durableTreeDestination = Join-Path $atomicDir 'tree-destination'
    New-Item -ItemType Directory -Path (Join-Path $durableTreeSource 'nested') -Force | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $durableTreeSource 'nested\payload.bin'),$expectedBytes)
    Copy-PmoDirectoryDurable -Source $durableTreeSource -Destination $durableTreeDestination
    Assert-Igual $expectedHash (Get-PmoSha256 (Join-Path $durableTreeDestination 'nested\payload.bin')) 'Copia duravel de diretorio deve preservar SHA-256.'

    $volumeRoot = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($tempDir))
    Assert-Igual $volumeRoot (Get-PmoNormalizedFullPath $volumeRoot) 'Normalizacao deve preservar a raiz do volume.'
    Assert-Igual $true (Test-PmoPathEqualOrSubPath $volumeRoot $tempDir) 'Raiz do volume deve conter o diretorio temporario.'
    Assert-Igual $volumeRoot (Assert-PmoPathWithoutReparse $volumeRoot) 'Guard de reparse deve preservar a raiz absoluta.'

    Write-Host '2/7 Build reproduzivel' -ForegroundColor Cyan
    $buildA = Join-Path $tempDir 'build-a.html'
    $buildB = Join-Path $tempDir 'build-b.html'
    & (Join-Path $raiz 'build.ps1') -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp -OutputPath $buildA
    & (Join-Path $raiz 'build.ps1') -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp -OutputPath $buildB
    & $NodePath (Join-Path $testDir 'validate-built-html.mjs') $buildA
    if ($LASTEXITCODE -ne 0) { throw 'O JavaScript do HTML compilado e invalido.' }
    $hashBuildA = (Get-FileHash -LiteralPath $buildA -Algorithm SHA256).Hash
    $hashBuildB = (Get-FileHash -LiteralPath $buildB -Algorithm SHA256).Hash
    Assert-Igual $hashBuildA $hashBuildB 'Dois builds com as mesmas entradas devem ser identicos.'

    Write-Host '3/7 Pacote deterministico e manifesto' -ForegroundColor Cyan
    $releaseA = Join-Path $tempDir 'release-a'
    $releaseB = Join-Path $tempDir 'release-b'
    & (Join-Path (Join-Path $raiz 'tools') 'New-ReleasePackage.ps1') -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp -OutputDirectory $releaseA
    & (Join-Path (Join-Path $raiz 'tools') 'New-ReleasePackage.ps1') -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp -OutputDirectory $releaseB
    $zipNome = "pmo-tool-$Version-windows.zip"
    $manifestoNome = "pmo-tool-$Version-manifest.json"
    $zipA = Join-Path $releaseA $zipNome
    $zipB = Join-Path $releaseB $zipNome
    $manifestoA = Join-Path $releaseA $manifestoNome
    $manifestoB = Join-Path $releaseB $manifestoNome
    Assert-Igual (Get-FileHash -LiteralPath $zipA -Algorithm SHA256).Hash (Get-FileHash -LiteralPath $zipB -Algorithm SHA256).Hash 'ZIPs devem ser reproduziveis.'
    Assert-Igual (Get-FileHash -LiteralPath $manifestoA -Algorithm SHA256).Hash (Get-FileHash -LiteralPath $manifestoB -Algorithm SHA256).Hash 'Manifestos devem ser reproduziveis.'
    & (Join-Path (Join-Path $raiz 'tools') 'Test-ReleasePackage.ps1') -ZipPath $zipA -ManifestPath $manifestoA
    $linhaSha = ([System.IO.File]::ReadAllText(($zipA + '.sha256'), [System.Text.Encoding]::UTF8)).Trim()
    $hashZip = (Get-FileHash -LiteralPath $zipA -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Igual ($hashZip + '  ' + $zipNome) $linhaSha 'Arquivo .sha256 deve ancorar o ZIP.'

    # Artefatos novos: bootstrap e helper. Os tres antigos ficam inalterados em
    # nome e contrato; estes sao acrescimo.
    $bootstrapNome = "pmo-tool-$Version-bootstrap.zip"
    $helperNome = 'portable-common.ps1'
    $bootstrapA = Join-Path $releaseA $bootstrapNome
    $bootstrapB = Join-Path $releaseB $bootstrapNome
    $helperA = Join-Path $releaseA $helperNome
    Assert-Igual (Get-FileHash -LiteralPath $bootstrapA -Algorithm SHA256).Hash (Get-FileHash -LiteralPath $bootstrapB -Algorithm SHA256).Hash 'Pacote de bootstrap deve ser reproduzivel.'
    Assert-Igual (Get-FileHash -LiteralPath (Join-Path (Join-Path $raiz 'tools') 'portable-common.ps1') -Algorithm SHA256).Hash `
                 (Get-FileHash -LiteralPath $helperA -Algorithm SHA256).Hash 'Helper publicado deve ser o proprio portable-common.ps1.'
    $artefatosEsperados = @($zipNome, "$zipNome.sha256", $manifestoNome, $bootstrapNome, $helperNome, 'pmo-instalar.ps1') | Sort-Object
    $artefatosGerados = @(Get-ChildItem -LiteralPath $releaseA -File | ForEach-Object { $_.Name }) | Sort-Object
    Assert-Igual ($artefatosEsperados -join '|') ($artefatosGerados -join '|') 'A release deve produzir exatamente os artefatos nomeados.'
    Assert-Igual (Get-FileHash -LiteralPath (Join-Path (Join-Path $raiz 'tools') 'pmo-instalar.ps1') -Algorithm SHA256).Hash `
                 (Get-FileHash -LiteralPath (Join-Path $releaseA 'pmo-instalar.ps1') -Algorithm SHA256).Hash 'Instalador publicado deve ser o proprio pmo-instalar.ps1.'
    & (Join-Path (Join-Path $raiz 'tools') 'Test-BootstrapPackage.ps1') -ZipPath $bootstrapA -ManifestPath $manifestoA

    # Contrato do manifesto estendido, do ponto de vista do instalador.
    $manifestoNovo = [System.IO.File]::ReadAllText($manifestoA, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $contrato = Assert-PmoReleaseManifest $manifestoNovo $Version
    Assert-Igual $zipNome ([string]$contrato.Runtime.Name) 'Contrato deve resolver o artefato de runtime.'
    Assert-Igual $bootstrapNome ([string]$contrato.Bootstrap.Name) 'Contrato deve resolver o artefato de bootstrap.'
    Assert-Igual $helperNome ([string]$contrato.Helper.Name) 'Contrato deve resolver o helper.'
    Assert-Igual ((Get-Item -LiteralPath $bootstrapA).Length) ([Int64]$contrato.Bootstrap.Size) 'Tamanho do bootstrap no manifesto.'

    # Um manifesto no formato antigo tem de ser recusado pelo caminho novo.
    $fixturePublicado = Join-Path (Join-Path $testDir 'fixtures') 'manifests\v1.4.1-publicado.json'
    $manifestoAntigo = [System.IO.File]::ReadAllText($fixturePublicado, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Assert-Throws { Assert-PmoReleaseManifest $manifestoAntigo } 'bootstrapArtifact' 'Manifesto sem os campos novos'

    # ... e o manifesto novo tem de conter tudo o que o publicado tinha, com a
    # mesma forma. Retrocompatibilidade e acrescimo, nunca renomeacao.
    foreach ($prop in $manifestoAntigo.PSObject.Properties) {
        if (-not ($manifestoNovo.PSObject.Properties.Name -contains $prop.Name)) {
            throw "Manifesto novo perdeu a propriedade publicada '$($prop.Name)'."
        }
        if ($prop.Value -is [System.Management.Automation.PSCustomObject]) {
            foreach ($sub in $prop.Value.PSObject.Properties) {
                if (-not ($manifestoNovo.$($prop.Name).PSObject.Properties.Name -contains $sub.Name)) {
                    throw "Manifesto novo perdeu '$($prop.Name).$($sub.Name)'."
                }
            }
        }
    }

    # Retrocompatibilidade com o updater da v1.4.1: as condicoes reais que ele
    # aplica ao manifesto externo, extraidas do proprio script, avaliadas
    # contra o manifesto novo. Nenhuma pode disparar.
    $extractCompat = Join-Path $tempDir 'compat-runtime'
    Expand-PmoArchiveSafe $zipA $extractCompat
    $condicoesUpdater = @(Obter-CondicoesManifestoUpdater (Join-Path (Join-Path $raiz 'tools') 'update-runtime.ps1'))
    if ($condicoesUpdater.Count -lt 3) { throw "Esperava ao menos tres condicoes de manifesto no updater; achei $($condicoesUpdater.Count)." }
    $externalManifest = $manifestoNovo
    $extract = $extractCompat
    $versionText = $Version
    $expectedSha = $hashZip
    $asset = [pscustomobject]@{ name = $zipNome; size = [Int64](Get-Item -LiteralPath $zipA).Length }
    foreach ($condicao in $condicoesUpdater) {
        $resultado = & ([scriptblock]::Create($condicao))
        if ($resultado) { throw "O updater da v1.4.1 recusaria o manifesto estendido: $condicao" }
    }

    Write-Host '4/7 Rejeicoes de seguranca' -ForegroundColor Cyan
    $zipData = Join-Path $tempDir 'forbidden-data.zip'
    Criar-ZipComEntrada $zipData 'data/portfolio.json'
    Assert-Throws { & (Join-Path (Join-Path $raiz 'tools') 'Test-ReleasePackage.ps1') -ZipPath $zipData } 'allowlist' 'ZIP contendo data/'

    $zipTraversal = Join-Path $tempDir 'traversal.zip'
    Criar-ZipComEntrada $zipTraversal '../portfolio.json'
    Assert-Throws { & (Join-Path (Join-Path $raiz 'tools') 'Test-ReleasePackage.ps1') -ZipPath $zipTraversal } 'Traversal|inseguro' 'ZIP com path traversal'

    $manifestoAdulterado = Join-Path $tempDir 'tampered-manifest.json'
    $textoManifesto = [System.IO.File]::ReadAllText($manifestoA, [System.Text.Encoding]::UTF8)
    # O 4o argumento de [regex]::Replace estatico e RegexOptions, nao contagem:
    # usar a instancia para adulterar somente o sha256 de 'artifact'.
    $regexSha = New-Object System.Text.RegularExpressions.Regex('("sha256"\s*:\s*")[0-9a-f]{64}', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $textoManifesto = $regexSha.Replace($textoManifesto, ('${1}' + ('0' * 64)), 1)
    [System.IO.File]::WriteAllText($manifestoAdulterado, $textoManifesto, (New-Object System.Text.UTF8Encoding($false)))
    Assert-Throws { & (Join-Path (Join-Path $raiz 'tools') 'Test-ReleasePackage.ps1') -ZipPath $zipA -ManifestPath $manifestoAdulterado } 'diverge' 'Manifesto externo adulterado'

    $zipContratoInvalido = Join-Path $tempDir 'invalid-runtime-contract.zip'
    Alterar-ReleaseNoZip $zipA $zipContratoInvalido '("platform"\s*:\s*")windows(")' '${1}linux${2}'
    Assert-Throws { & (Join-Path (Join-Path $raiz 'tools') 'Test-ReleasePackage.ps1') -ZipPath $zipContratoInvalido } 'Plataforma invalida' 'release.json com plataforma divergente'

    $zipBomb = Join-Path $tempDir 'compression-ratio.zip'
    $zeros = New-Object byte[] (2MB)
    Criar-ZipComEntrada $zipBomb 'samples/bomb.bin' $zeros
    Assert-Throws { & (Join-Path (Join-Path $raiz 'tools') 'Test-ReleasePackage.ps1') -ZipPath $zipBomb -MaxCompressionRatio 10 } 'Razao de compressao' 'ZIP com razao de compressao abusiva'

    # A allowlist virou parametro; o bloqueio de diretorios persistentes nao.
    # Nenhum chamador pode liberar data/, config/, state/, logs/, staging/ ou
    # versions/ passando a propria lista (G11).
    $zipDataLiberado = Join-Path $tempDir 'allowlist-data-liberado.zip'
    Criar-ZipComEntrada $zipDataLiberado 'data/portfolio.json'
    $checkDataLiberado = Test-PmoArchive $zipDataLiberado -ArquivosPermitidos @('data/portfolio.json')
    if ($checkDataLiberado.ok) { throw 'Prefixo bloqueado nao pode ser liberado pela allowlist do chamador.' }

    # Prefixo informado sem barra final nao pode liberar um diretorio irmao de
    # mesmo comeco; a normalizacao acrescenta a barra.
    $zipIrmao = Join-Path $tempDir 'allowlist-prefixo-irmao.zip'
    Criar-ZipComEntrada $zipIrmao 'samplesX/a.json'
    $checkIrmao = Test-PmoArchive $zipIrmao -PrefixosPermitidos @('samples')
    if ($checkIrmao.ok) { throw 'Prefixo sem barra nao pode liberar diretorio irmao.' }
    $checkPrefixoProprio = Test-PmoArchive $zipIrmao -PrefixosPermitidos @('samplesX')
    if (-not $checkPrefixoProprio.ok) { throw ('Prefixo informado deveria aceitar o proprio diretorio: ' + ($checkPrefixoProprio.errors -join '; ')) }

    # Os dois validadores sao independentes: cada um recusa o pacote do outro.
    $ferramentas = Join-Path $raiz 'tools'
    Assert-Throws { & (Join-Path $ferramentas 'Test-BootstrapPackage.ps1') -ZipPath $zipA } 'allowlist de bootstrap' 'Runtime submetido ao validador de bootstrap'
    Assert-Throws { & (Join-Path $ferramentas 'Test-ReleasePackage.ps1') -ZipPath $bootstrapA } 'allowlist de runtime' 'Bootstrap submetido ao validador de runtime'

    $regrasBootstrap = Get-PmoBootstrapArchiveRules
    $bootstrapSujoDir = Join-Path $tempDir 'bootstrap-sujo'
    Expand-PmoArchiveSafe $bootstrapA $bootstrapSujoDir @regrasBootstrap
    [System.IO.File]::WriteAllText((Join-Path $bootstrapSujoDir 'extra.txt'), 'x', (New-Object System.Text.UTF8Encoding($false)))
    $bootstrapSujoZip = Join-Path $tempDir 'bootstrap-sujo.zip'
    Criar-ZipDeDiretorio $bootstrapSujoDir $bootstrapSujoZip
    Assert-Throws { & (Join-Path $ferramentas 'Test-BootstrapPackage.ps1') -ZipPath $bootstrapSujoZip } 'allowlist de bootstrap' 'Bootstrap com arquivo extra'

    Remove-Item -LiteralPath (Join-Path $bootstrapSujoDir 'extra.txt') -Force
    Remove-Item -LiteralPath (Join-Path $bootstrapSujoDir 'tools\install-common.ps1') -Force
    $bootstrapFaltaZip = Join-Path $tempDir 'bootstrap-sem-install-common.zip'
    Criar-ZipDeDiretorio $bootstrapSujoDir $bootstrapFaltaZip
    Assert-Throws { & (Join-Path $ferramentas 'Test-BootstrapPackage.ps1') -ZipPath $bootstrapFaltaZip } 'obrigatorio ausente' 'Bootstrap sem install-common.ps1'

    # Adulterar o hash de um artefato nao pode contaminar a validacao do outro:
    # bootstrap integro com runtime corrompido no manifesto continua valido, e
    # vice-versa.
    $textoManifestoNovo = [System.IO.File]::ReadAllText($manifestoA, [System.Text.Encoding]::UTF8)
    $manifestoBootstrapRuim = Join-Path $tempDir 'manifesto-bootstrap-adulterado.json'
    [System.IO.File]::WriteAllText($manifestoBootstrapRuim,
        [regex]::Replace($textoManifestoNovo, '(?s)("bootstrapArtifact".*?"sha256"\s*:\s*")[0-9a-f]{64}', ('${1}' + ('0' * 64))),
        (New-Object System.Text.UTF8Encoding($false)))
    Assert-Throws { & (Join-Path $ferramentas 'Test-BootstrapPackage.ps1') -ZipPath $bootstrapA -ManifestPath $manifestoBootstrapRuim } 'diverge' 'Manifesto com bootstrap adulterado'
    & (Join-Path $ferramentas 'Test-ReleasePackage.ps1') -ZipPath $zipA -ManifestPath $manifestoBootstrapRuim | Out-Null
    & (Join-Path $ferramentas 'Test-BootstrapPackage.ps1') -ZipPath $bootstrapA -ManifestPath $manifestoAdulterado | Out-Null

    # Nenhum artefato pode conter diretorio persistente nem dado de instalacao.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    foreach ($pacote in @($zipA, $bootstrapA)) {
        $inspecao = [System.IO.Compression.ZipFile]::OpenRead($pacote)
        try {
            foreach ($entrada in $inspecao.Entries) {
                $nomeEntrada = ([string]$entrada.FullName).Replace('\','/').ToLowerInvariant()
                foreach ($proibido in @('data/','config/','state/','logs/','staging/','versions/')) {
                    if ($nomeEntrada.StartsWith($proibido)) { throw "Artefato $([System.IO.Path]::GetFileName($pacote)) contem caminho persistente: $nomeEntrada" }
                }
                foreach ($proibido in @('install.json','active.json','update.json','portfolio.json','portable-install-manifest.json')) {
                    if ($nomeEntrada.EndsWith($proibido)) { throw "Artefato $([System.IO.Path]::GetFileName($pacote)) contem dado de instalacao: $nomeEntrada" }
                }
            }
        } finally { $inspecao.Dispose() }
    }

    Write-Host '5/7 Atomicidade e limites do instalador portatil' -ForegroundColor Cyan
    $insideSource = Join-Path $raiz ('.portable-install-forbidden-' + [Guid]::NewGuid().ToString('N'))
    Assert-Throws {
        & (Join-Path (Join-Path $raiz 'tools') 'New-PortableInstall.ps1') -Destination $insideSource -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp
    } 'raiz fonte' 'Destino dentro da raiz fonte'
    if (Test-Path -LiteralPath $insideSource) { throw 'O instalador criou conteudo dentro da raiz fonte antes de rejeitar o destino.' }

    $nonEmpty = Join-Path $tempDir 'portable-non-empty'
    New-Item -ItemType Directory -Path $nonEmpty | Out-Null
    $sentinel = Join-Path $nonEmpty 'sentinel.txt'
    [System.IO.File]::WriteAllText($sentinel, 'preservar', (New-Object System.Text.UTF8Encoding($false)))
    Assert-Throws {
        & (Join-Path (Join-Path $raiz 'tools') 'New-PortableInstall.ps1') -Destination $nonEmpty -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp
    } 'nao esta vazio' 'Destino existente nao vazio'
    Assert-Igual 'preservar' ([System.IO.File]::ReadAllText($sentinel, [System.Text.Encoding]::UTF8)) 'Destino recusado deve permanecer intacto.'
    Assert-Igual 1 @(Get-ChildItem -LiteralPath $nonEmpty -Force).Count 'Instalador nao pode acrescentar arquivos ao destino recusado.'

    $failedDestination = Join-Path $tempDir 'portable-failed-build'
    Assert-Throws {
        & (Join-Path (Join-Path $raiz 'tools') 'New-PortableInstall.ps1') -Destination $failedDestination -Version '0.0.0' -Commit $Commit -BuildTimestamp $BuildTimestamp
    } 'diverge' 'Falha de build no staging'
    if (Test-Path -LiteralPath $failedDestination) { throw 'Falha anterior ao commit deixou destino parcial visivel.' }
    $leftoverStaging = @(Get-ChildItem -LiteralPath $tempDir -Directory -Filter '.pmo-install-staging-*' -ErrorAction SilentlyContinue)
    Assert-Igual 0 $leftoverStaging.Count 'Falha de instalacao deve limpar o staging irmao.'
    $leftoverBuild = @(Get-ChildItem -LiteralPath $tempDir -Directory -Filter '.pmo-install-build-*' -ErrorAction SilentlyContinue)
    Assert-Igual 0 $leftoverBuild.Count 'Falha de instalacao deve limpar a area de build irma.'

    Write-Host '6/7 Instalacao portatil inicial sem dados' -ForegroundColor Cyan
    $portable = Join-Path $tempDir 'portable-install'
    New-Item -ItemType Directory -Path $portable | Out-Null
    & (Join-Path (Join-Path $raiz 'tools') 'New-PortableInstall.ps1') -Destination $portable -Version $Version -Commit $Commit -BuildTimestamp $BuildTimestamp
    foreach ($required in @(
        'pmo.ps1','atualizar.ps1','bootstrap.json','config\install.json','state\active.json',
        ("versions\$Version\serve.ps1"),("versions\$Version\release.json"),
        ("versions\$Version\tools\portable-common.ps1"),("versions\$Version\tools\update-runtime.ps1")
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $portable $required) -PathType Leaf)) { throw "Instalacao portatil sem $required" }
    }
    if (Test-Path -LiteralPath (Join-Path $portable '.bootstrap-artifacts')) { throw 'Artefatos intermediarios nao podem aparecer no destino final.' }
    $leftoverStaging = @(Get-ChildItem -LiteralPath $tempDir -Directory -Filter '.pmo-install-staging-*' -ErrorAction SilentlyContinue)
    Assert-Igual 0 $leftoverStaging.Count 'Commit concluido nao deve deixar staging irmao.'
    $leftoverBuild = @(Get-ChildItem -LiteralPath $tempDir -Directory -Filter '.pmo-install-build-*' -ErrorAction SilentlyContinue)
    Assert-Igual 0 $leftoverBuild.Count 'Commit concluido nao deve deixar area de build irma.'
    if (Test-Path -LiteralPath (Join-Path $portable 'data\portfolio.json')) { throw 'Instalacao inicial nao pode copiar portfolio sem -IncludeCurrentData.' }
    $activePortable = [System.IO.File]::ReadAllText((Join-Path $portable 'state\active.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Assert-Igual $Version ([string]$activePortable.activeVersion) 'Versao ativa da instalacao portatil.'
    $installManifest = Read-PmoJson (Join-Path $portable 'portable-install-manifest.json') $null
    if (-not $installManifest -or -not $installManifest.files) { throw 'Instalacao portatil sem inventario final.' }
    $installErrors = Test-PmoInventory $portable $installManifest.files -AllowedExtra @('portable-install-manifest.json')
    if ($null -eq $installErrors) { $installErrors = @() }
    if ($installErrors.Count -gt 0) { throw ('Inventario da instalacao final diverge: ' + ($installErrors -join '; ')) }
    $runtimeZipCheck = Test-PmoArchive $zipA
    if (-not $runtimeZipCheck.ok) { throw ('portable-common rejeitou o ZIP valido: ' + ($runtimeZipCheck.errors -join '; ')) }

    # Materializacao compartilhada a partir do pacote de bootstrap real da
    # release - o mesmo artefato que uma maquina nova baixaria do GitHub.
    $bootstrapZip = $bootstrapA
    $bootstrapSrc = Join-Path $tempDir 'bootstrap-real'
    $regrasBootstrap = Get-PmoBootstrapArchiveRules
    Expand-PmoArchiveSafe $bootstrapZip $bootstrapSrc @regrasBootstrap

    # As duas allowlists precisam se recusar mutuamente: e exatamente por isso
    # que o validador teve de aceitar parametro em vez de ganhar entradas.
    $bootstrapSobRuntime = Test-PmoArchive $bootstrapZip
    if ($bootstrapSobRuntime.ok) { throw 'Allowlist de runtime nao pode aceitar o pacote de bootstrap.' }
    $bootstrapCheck = Test-PmoArchive $bootstrapZip @regrasBootstrap
    if (-not $bootstrapCheck.ok) { throw ('Allowlist de bootstrap rejeitou o proprio pacote: ' + ($bootstrapCheck.errors -join '; ')) }
    $runtimeSobBootstrap = Test-PmoArchive $zipA @regrasBootstrap
    if ($runtimeSobBootstrap.ok) { throw 'Allowlist de bootstrap nao pode aceitar o pacote de runtime.' }

    $portableZip = Join-Path $tempDir 'portable-install-zip'
    $resultadoZip = Install-PmoPortableFromPackages -RuntimeZip $zipA -BootstrapZip $bootstrapZip `
        -Destination $portableZip -Versao $Version -Repositorio ''
    Assert-Igual (Get-PmoNormalizedFullPath $portableZip) ([string]$resultadoZip.Destination) 'Materializacao deve devolver o destino canonico.'
    if (Test-Path -LiteralPath (Join-Path $portableZip '.pmo-bootstrap-extract')) { throw 'Extracao do bootstrap nao pode sobreviver ao commit.' }

    $layoutLocal = @(Get-PmoDirectoryInventory $portable | ForEach-Object { [string]$_.path }) | Sort-Object
    $layoutZip = @(Get-PmoDirectoryInventory $portableZip | ForEach-Object { [string]$_.path }) | Sort-Object
    Assert-Igual ($layoutLocal -join '|') ($layoutZip -join '|') 'Instalacao por pacote de bootstrap deve ter o mesmo layout da local.'

    $manifestZip = Read-PmoJson (Join-Path $portableZip 'portable-install-manifest.json') $null
    if (-not $manifestZip -or -not $manifestZip.files) { throw 'Instalacao por pacote sem inventario final.' }
    $errosZip = Test-PmoInventory $portableZip $manifestZip.files -AllowedExtra @('portable-install-manifest.json')
    if ($null -eq $errosZip) { $errosZip = @() }
    if ($errosZip.Count -gt 0) { throw ('Inventario da instalacao por pacote diverge: ' + ($errosZip -join '; ')) }
    $activeZip = [System.IO.File]::ReadAllText((Join-Path $portableZip 'state\active.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Assert-Igual ([string]$activePortable.activeReleaseManifestSha256) ([string]$activeZip.activeReleaseManifestSha256) 'Pin do runtime deve ser identico nas duas instalacoes.'
    Assert-Igual ([string]$activePortable.activeSchemaVersion) ([string]$activeZip.activeSchemaVersion) 'Schema ativo deve ser identico nas duas instalacoes.'

    $bootstrapExtra = Join-Path $tempDir 'bootstrap-extra'
    Copy-PmoDirectoryDurable -Source $bootstrapSrc -Destination $bootstrapExtra
    [System.IO.File]::WriteAllText((Join-Path $bootstrapExtra 'extra.txt'), 'x', (New-Object System.Text.UTF8Encoding($false)))
    $bootstrapExtraZip = Join-Path $tempDir 'bootstrap-extra.zip'
    Criar-ZipDeDiretorio $bootstrapExtra $bootstrapExtraZip
    $destinoExtra = Join-Path $tempDir 'portable-extra'
    Assert-Throws {
        Install-PmoPortableFromPackages -RuntimeZip $zipA -BootstrapZip $bootstrapExtraZip -Destination $destinoExtra -Versao $Version
    } 'Bootstrap rejeitado' 'Bootstrap com arquivo fora do layout'
    if (Test-Path -LiteralPath $destinoExtra) { throw 'Bootstrap recusado nao pode deixar destino parcial.' }

    $bootstrapFalta = Join-Path $tempDir 'bootstrap-falta'
    Copy-PmoDirectoryDurable -Source $bootstrapSrc -Destination $bootstrapFalta
    Remove-Item -LiteralPath (Join-Path $bootstrapFalta 'atualizar.ps1') -Force
    $bootstrapFaltaZip = Join-Path $tempDir 'bootstrap-falta.zip'
    Criar-ZipDeDiretorio $bootstrapFalta $bootstrapFaltaZip
    $destinoFalta = Join-Path $tempDir 'portable-falta'
    Assert-Throws {
        Install-PmoPortableFromPackages -RuntimeZip $zipA -BootstrapZip $bootstrapFaltaZip -Destination $destinoFalta -Versao $Version
    } 'arquivo obrigatorio' 'Bootstrap sem script de raiz obrigatorio'
    if (Test-Path -LiteralPath $destinoFalta) { throw 'Bootstrap incompleto nao pode deixar destino parcial.' }

    $leftoverStaging = @(Get-ChildItem -LiteralPath $tempDir -Directory -Filter '.pmo-install-staging-*' -ErrorAction SilentlyContinue)
    Assert-Igual 0 $leftoverStaging.Count 'Materializacao recusada deve limpar o staging irmao.'

    # Sem -Version explicito, a instalacao tem de nascer na versao do modelo.
    # Um default fixo no script envelheceria em silencio a cada release.
    $portableAuto = Join-Path $tempDir 'portable-auto'
    & (Join-Path (Join-Path $raiz 'tools') 'New-PortableInstall.ps1') -Destination $portableAuto -Commit $Commit -BuildTimestamp $BuildTimestamp
    $activeAuto = [System.IO.File]::ReadAllText((Join-Path $portableAuto 'state\active.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Assert-Igual $versaoFonte ([string]$activeAuto.activeVersion) 'Sem -Version, a instalacao deve usar APP_VERSION.'

    $diagnosticResult = Invoke-PmoExternal $portable @('-Diagnostico')
    if ($diagnosticResult.ExitCode -ne 0) { throw ('Diagnostico da instalacao portatil falhou: ' + $diagnosticResult.Output) }
    $diagnostic = $diagnosticResult.Output | ConvertFrom-Json
    if (-not $diagnostic.ok -or -not $diagnostic.runtimeIntegrity -or -not $diagnostic.dataWritable -or
        $null -eq $diagnostic.attachments.aggregateSha256 -or $diagnostic.updateLog.path -notmatch 'update\.log$') {
        throw 'Diagnostico portatil nao confirmou integridade, escrita real e inventario agregado.'
    }

    $installPath = Join-Path $portable 'config\install.json'
    $installBytes = [System.IO.File]::ReadAllBytes($installPath)
    try {
        $installFixture = Read-PmoJson $installPath $null
        $installFixture.dataDir = 'versions'
        Write-PmoJsonAtomic $installPath $installFixture
        Assert-PmoExternalFails $portable @('-Diagnostico') 'distintos|aninhados' 'dataDir igual a versions/'

        $installFixture.dataDir = 'versions\..\versions\nested'
        Write-PmoJsonAtomic $installPath $installFixture
        Assert-PmoExternalFails $portable @('-Diagnostico') 'distintos|aninhados' 'dataDir com traversal para versions/'

        $installFixture.dataDir = '.'
        Write-PmoJsonAtomic $installPath $installFixture
        Assert-PmoExternalFails $portable @('-Diagnostico') 'distintos|aninhados' 'dataDir ancestral de roots operacionais'

        $installFixture.dataDir = $volumeRoot
        Write-PmoJsonAtomic $installPath $installFixture
        $previousLocation = Get-Location
        try {
            Set-Location -LiteralPath $raiz
            Assert-PmoExternalFails $portable @('-Diagnostico') 'distintos|aninhados' 'dataDir igual a raiz do volume com cwd externo'
        } finally { Set-Location -LiteralPath $previousLocation.Path }
    } finally {
        [System.IO.File]::WriteAllBytes($installPath,$installBytes)
        $installBackup = $installPath + '.replace-backup'
        if (Test-Path -LiteralPath $installBackup) { Remove-Item -LiteralPath $installBackup -Force }
    }

    $junctionTarget = Join-Path $tempDir 'junction-target'
    $junctionPath = Join-Path $portable 'linked-data'
    New-Item -ItemType Directory -Path $junctionTarget -Force | Out-Null
    try {
        $null = New-Item -ItemType Junction -Path $junctionPath -Target $junctionTarget
        Assert-Throws { Assert-PmoPathWithoutReparse $junctionPath } 'reparse point' 'Helper de reparse no proprio path'
        $installFixture = Read-PmoJson $installPath $null
        $installFixture.dataDir = 'linked-data'
        Write-PmoJsonAtomic $installPath $installFixture
        Assert-PmoExternalFails $portable @('-Diagnostico') 'reparse point' 'dataDir junction'
    } finally {
        [System.IO.File]::WriteAllBytes($installPath,$installBytes)
        $installBackup = $installPath + '.replace-backup'
        if (Test-Path -LiteralPath $installBackup) { Remove-Item -LiteralPath $installBackup -Force }
        if (Test-Path -LiteralPath $junctionPath) { Remove-Item -LiteralPath $junctionPath -Force }
    }

    $managedDeleteRoot = Join-Path $tempDir 'managed-delete-root'
    $managedDeleteTree = Join-Path $managedDeleteRoot 'candidate'
    $managedOutside = Join-Path $tempDir 'managed-delete-outside'
    $managedNestedJunction = Join-Path $managedDeleteTree 'nested-link'
    New-Item -ItemType Directory -Path $managedDeleteTree,$managedOutside -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $managedOutside 'sentinel.txt'),'preservar',(New-Object System.Text.UTF8Encoding($false)))
    try {
        $null = New-Item -ItemType Junction -Path $managedNestedJunction -Target $managedOutside
        Assert-Throws { Remove-PmoManagedTree -Root $managedDeleteRoot -Path $managedDeleteTree } 'reparse point' 'Delete gerenciado com junction descendente'
        if (-not (Test-Path -LiteralPath (Join-Path $managedOutside 'sentinel.txt') -PathType Leaf)) {
            throw 'Delete recusado atravessou a junction e removeu o alvo externo.'
        }
    } finally {
        if (Test-Path -LiteralPath $managedNestedJunction) { [System.IO.Directory]::Delete($managedNestedJunction,$false) }
        if (Test-Path -LiteralPath $managedDeleteTree) { Remove-PmoManagedTree -Root $managedDeleteRoot -Path $managedDeleteTree }
    }

    $activePath = Join-Path $portable 'state\active.json'
    $activeBytes = [System.IO.File]::ReadAllBytes($activePath)
    try {
        $activeFixture = Read-PmoJson $activePath $null
        $activeFixture.activeVersion = '..\data'
        Write-PmoJsonAtomic $activePath $activeFixture
        Assert-PmoExternalFails $portable @('-SemAtualizacao') 'SemVer estavel' 'activeVersion com traversal'
    } finally {
        [System.IO.File]::WriteAllBytes($activePath,$activeBytes)
        $activeBackup = $activePath + '.replace-backup'
        if (Test-Path -LiteralPath $activeBackup) { Remove-Item -LiteralPath $activeBackup -Force }
    }

    $releasePath = Join-Path $portable ("versions\$Version\release.json")
    $releaseBytes = [System.IO.File]::ReadAllBytes($releasePath)
    try {
        [System.IO.File]::AppendAllText($releasePath,"`n ",(New-Object System.Text.UTF8Encoding($false)))
        Assert-PmoExternalFails $portable @('-SemAtualizacao') 'release.json diverge' 'release.json adulterado'
    } finally { [System.IO.File]::WriteAllBytes($releasePath,$releaseBytes) }

    $runtimeServePath = Join-Path $portable ("versions\$Version\serve.ps1")
    $runtimeServeBytes = [System.IO.File]::ReadAllBytes($runtimeServePath)
    try {
        [System.IO.File]::AppendAllText($runtimeServePath,"`n# tamper-test`n",(New-Object System.Text.UTF8Encoding($false)))
        Assert-PmoExternalFails $portable @('-SemAtualizacao') 'tamanho divergente|hash divergente' 'arquivo do runtime adulterado'
    } finally { [System.IO.File]::WriteAllBytes($runtimeServePath,$runtimeServeBytes) }

    Write-Host '7/7 Instalador pelo GitHub' -ForegroundColor Cyan
    # A suite roda offline. Os erros de rede sao produzidos por um stub local
    # que devolve status reais, para nao depender do GitHub nem gastar o limite
    # de taxa dele.
    Import-FuncaoInstalador 'Assert-UrlGitHub'
    Import-FuncaoInstalador 'Converter-FalhaDeRede'
    Import-FuncaoInstalador 'Find-Asset'
    Import-FuncaoInstalador 'Assert-ReleaseEstavel'

    # Resposta 200 que nao e uma release estavel: nao gera erro de rede, entao
    # a recusa tem de vir da validacao de forma.
    $releaseBoa = [pscustomobject]@{ tag_name = 'v1.5.0'; assets = @(); draft = $false; prerelease = $false; immutable = $true }
    Assert-Igual '1.5.0' ([string](Assert-ReleaseEstavel $releaseBoa).Versao) 'Release estavel valida deve resolver a versao.'
    Assert-Throws { Assert-ReleaseEstavel $null } 'vazio' 'Resposta vazia'
    Assert-Throws { Assert-ReleaseEstavel ([pscustomobject]@{ mensagem = 'nao sou release' }) } "sem 'tag_name'" 'Resposta sem forma de release'
    Assert-Throws { Assert-ReleaseEstavel ([pscustomobject]@{ tag_name = 'v1.5.0'; assets = @(); draft = $true; immutable = $true }) } 'draft' 'Release em draft'
    Assert-Throws { Assert-ReleaseEstavel ([pscustomobject]@{ tag_name = 'v1.5.0'; assets = @(); prerelease = $true; immutable = $true }) } 'prerelease' 'Release em prerelease'
    Assert-Throws { Assert-ReleaseEstavel ([pscustomobject]@{ tag_name = 'v1.5.0'; assets = @() }) } 'imutavel' 'Release sem marca de imutabilidade'
    Assert-Throws { Assert-ReleaseEstavel ([pscustomobject]@{ tag_name = 'v1.5.0'; assets = @(); immutable = $false }) } 'imutavel' 'Release mutavel'
    Assert-Throws { Assert-ReleaseEstavel ([pscustomobject]@{ tag_name = '1.5.0'; assets = @(); immutable = $true }) } 'padrao vX.Y.Z' 'Tag sem prefixo v'

    foreach ($urlBoa in @('https://github.com/owner/repo/releases/download/v1/a.zip',
                          'https://objects.githubusercontent.com/x/y')) {
        $null = Assert-UrlGitHub $urlBoa
    }
    Assert-Throws { Assert-UrlGitHub 'http://github.com/a' } 'somente HTTPS' 'Download por HTTP'
    Assert-Throws { Assert-UrlGitHub 'https://githubb.com/a' } 'host inesperado' 'Download de host parecido'
    Assert-Throws { Assert-UrlGitHub 'https://github.com.exemplo.net/a' } 'host inesperado' 'Download de host com sufixo forjado'
    Assert-Throws { Assert-UrlGitHub 'nao-e-url' } 'invalida' 'URL malformada'

    $portaStub = Get-PortaLivre
    $jobStub = Start-ServidorDeStatus $portaStub 2
    try {
        $pronto = $false
        foreach ($tentativa in 1..40) {
            try {
                $sonda = New-Object System.Net.Sockets.TcpClient
                $sonda.Connect('127.0.0.1', $portaStub)
                $sonda.Close()
                $pronto = $true
                break
            } catch { Start-Sleep -Milliseconds 250 }
        }
        if (-not $pronto) { throw 'O stub HTTP de teste nao subiu.' }

        $capturar = {
            param($rota)
            $erro = $null
            try { Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:$portaStub/$rota" -TimeoutSec 10 | Out-Null }
            catch { $erro = $_ }
            if ($null -eq $erro) { throw "A rota $rota deveria ter falhado." }
            return $erro
        }
        $msg403 = Converter-FalhaDeRede (& $capturar '403') 'ctx'
        if ($msg403 -notmatch 'limite' -or $msg403 -notmatch '403') { throw "403 nao virou mensagem de limite de taxa: $msg403" }
        $msg404 = Converter-FalhaDeRede (& $capturar '404') 'ctx'
        if ($msg404 -notmatch 'Nao encontrado' -or $msg404 -notmatch 'Repositorio') { throw "404 nao virou mensagem acionavel: $msg404" }
    }
    finally {
        Stop-Job -Job $jobStub -ErrorAction SilentlyContinue
        Remove-Job -Job $jobStub -Force -ErrorAction SilentlyContinue
    }

    # Timeout e DNS: WebException real, construida com o status correspondente.
    $erroTimeout = New-Object System.Management.Automation.ErrorRecord(
        (New-Object System.Net.WebException('t', $null, [System.Net.WebExceptionStatus]::Timeout, $null)), 'x', 'NotSpecified', $null)
    if ((Converter-FalhaDeRede $erroTimeout 'ctx') -notmatch 'expirou') { throw 'Timeout nao virou mensagem propria.' }
    $erroDns = New-Object System.Management.Automation.ErrorRecord(
        (New-Object System.Net.WebException('d', $null, [System.Net.WebExceptionStatus]::NameResolutionFailure, $null)), 'x', 'NotSpecified', $null)
    if ((Converter-FalhaDeRede $erroDns 'ctx') -notmatch 'resolver') { throw 'Falha de DNS nao virou mensagem propria.' }

    $assetsFalsos = @(
        [pscustomobject]@{ name = 'bom.zip'; size = 10; digest = ('sha256:' + ('a' * 64)); browser_download_url = 'https://github.com/x' },
        [pscustomobject]@{ name = 'sem-digest.zip'; size = 10; browser_download_url = 'https://github.com/x' },
        [pscustomobject]@{ name = 'digest-torto.zip'; size = 10; digest = 'md5:abc'; browser_download_url = 'https://github.com/x' }
    )
    $null = Find-Asset $assetsFalsos 'bom.zip' 1MB
    Assert-Throws { Find-Asset $assetsFalsos 'inexistente.zip' 1MB } 'exatamente um asset' 'Asset ausente'
    Assert-Throws { Find-Asset $assetsFalsos 'sem-digest.zip' 1MB } 'digest SHA-256' 'Asset sem digest'
    Assert-Throws { Find-Asset $assetsFalsos 'digest-torto.zip' 1MB } 'formato inesperado' 'Asset com digest invalido'
    Assert-Throws { Find-Asset $assetsFalsos 'bom.zip' 5 } 'fora do limite' 'Asset maior que o limite'

    # Instalacao real a partir dos artefatos ja construidos nesta suite.
    $pacoteLocal = Join-Path $tempDir 'pacote-local'
    New-Item -ItemType Directory -Path $pacoteLocal | Out-Null
    foreach ($artefato in @(Get-ChildItem -LiteralPath $releaseA -File)) {
        Copy-Item -LiteralPath $artefato.FullName -Destination (Join-Path $pacoteLocal $artefato.Name)
    }

    $destinoInstalador = Join-Path $tempDir 'instalado'
    $resInstalar = Invoke-Instalador @('-PacoteLocal', $pacoteLocal, '-InstallDir', $destinoInstalador, '-Repositorio', 'exemplo/pmo-tool')
    if ($resInstalar.ExitCode -ne 0) { throw ('Instalador falhou: ' + $resInstalar.Output) }

    # A instalacao produzida tem de ser indistinguivel da do gerador local,
    # exceto pelo log que o proprio instalador deposita em logs/.
    $semLogs = { param($r) @(Get-PmoDirectoryInventory $r | Where-Object { -not ([string]$_.path).StartsWith('logs/') }) }
    $invLocal = & $semLogs $portable
    $invInstalado = & $semLogs $destinoInstalador
    $caminhosLocal = @($invLocal | ForEach-Object { [string]$_.path }) | Sort-Object
    $caminhosInstalado = @($invInstalado | ForEach-Object { [string]$_.path }) | Sort-Object
    Assert-Igual ($caminhosLocal -join '|') ($caminhosInstalado -join '|') 'Instalacao pelo instalador deve ter o mesmo layout da local.'
    $activeInstalado = [System.IO.File]::ReadAllText((Join-Path $destinoInstalador 'state\active.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Assert-Igual ([string]$activePortable.activeReleaseManifestSha256) ([string]$activeInstalado.activeReleaseManifestSha256) 'Pin do runtime deve coincidir com a instalacao local.'
    $installInstalado = Read-PmoJson (Join-Path $destinoInstalador 'config\install.json') $null
    Assert-Igual 'exemplo/pmo-tool' ([string]$installInstalado.repository) 'Repositorio informado deve chegar ao install.json.'
    $logsInstalados = @(Get-ChildItem -LiteralPath (Join-Path $destinoInstalador 'logs') -File -Filter 'pmo-instalar-*.log')
    Assert-Igual 1 $logsInstalados.Count 'O log da instalacao deve migrar do TEMP para logs/.'
    $conteudoLog = [System.IO.File]::ReadAllText($logsInstalados[0].FullName, [System.Text.Encoding]::UTF8)
    if ($conteudoLog -notmatch 'diagnostico ok') { throw 'O log nao registra o diagnostico obrigatorio.' }

    # Reexecucao sobre instalacao valida: somente leitura, orienta -Atualizar.
    $inventarioAntes = @(Get-PmoDirectoryInventory $destinoInstalador | ForEach-Object { "$($_.path)|$($_.sha256)" }) | Sort-Object
    $resRepetir = Invoke-Instalador @('-PacoteLocal', $pacoteLocal, '-InstallDir', $destinoInstalador, '-Repositorio', 'exemplo/pmo-tool')
    Assert-Igual 0 $resRepetir.ExitCode 'Reexecucao sobre instalacao valida nao e erro.'
    if ($resRepetir.Output -notmatch '-Atualizar') { throw 'Reexecucao deveria orientar o uso de -Atualizar.' }
    $inventarioDepois = @(Get-PmoDirectoryInventory $destinoInstalador | ForEach-Object { "$($_.path)|$($_.sha256)" }) | Sort-Object
    Assert-Igual ($inventarioAntes -join "`n") ($inventarioDepois -join "`n") 'Reexecucao deve ser estritamente somente leitura.'

    # Destino ocupado por conteudo alheio permanece byte a byte intacto.
    $destinoOcupado = Join-Path $tempDir 'destino-ocupado'
    New-Item -ItemType Directory -Path $destinoOcupado | Out-Null
    $sentinelaInstalador = Join-Path $destinoOcupado 'nao-toque.txt'
    [System.IO.File]::WriteAllText($sentinelaInstalador, 'preservar', (New-Object System.Text.UTF8Encoding($false)))
    $hashSentinela = (Get-FileHash -LiteralPath $sentinelaInstalador -Algorithm SHA256).Hash
    $resOcupado = Invoke-Instalador @('-PacoteLocal', $pacoteLocal, '-InstallDir', $destinoOcupado)
    if ($resOcupado.ExitCode -eq 0) { throw 'Destino ocupado por conteudo alheio deveria ser recusado.' }
    Assert-Igual $hashSentinela (Get-FileHash -LiteralPath $sentinelaInstalador -Algorithm SHA256).Hash 'Destino recusado deve permanecer byte a byte intacto.'
    Assert-Igual 1 @(Get-ChildItem -LiteralPath $destinoOcupado -Force).Count 'Destino recusado nao pode ganhar arquivos.'

    # Pacote adulterado e pacote truncado: os dois reprovam contra o manifesto.
    foreach ($caso in @(
        @{ nome = 'adulterado'; acao = { param($p) $b = [System.IO.File]::ReadAllBytes($p); $b[$b.Length - 1] = [byte](($b[$b.Length - 1] + 1) % 256); [System.IO.File]::WriteAllBytes($p, $b) } },
        @{ nome = 'truncado';   acao = { param($p) $b = [System.IO.File]::ReadAllBytes($p); [System.IO.File]::WriteAllBytes($p, [byte[]]($b[0..($b.Length - 64)])) } }
    )) {
        $pacoteRuim = Join-Path $tempDir ('pacote-' + $caso.nome)
        New-Item -ItemType Directory -Path $pacoteRuim | Out-Null
        foreach ($artefato in @(Get-ChildItem -LiteralPath $pacoteLocal -File)) {
            Copy-Item -LiteralPath $artefato.FullName -Destination (Join-Path $pacoteRuim $artefato.Name)
        }
        & $caso.acao (Join-Path $pacoteRuim $zipNome)
        $destinoRuim = Join-Path $tempDir ('destino-' + $caso.nome)
        $resRuim = Invoke-Instalador @('-PacoteLocal', $pacoteRuim, '-InstallDir', $destinoRuim)
        if ($resRuim.ExitCode -eq 0) { throw "Pacote $($caso.nome) deveria ter sido recusado." }
        if ($resRuim.Output -notmatch 'Integridade') { throw "Pacote $($caso.nome) recusado por motivo inesperado: $($resRuim.Output)" }
        if (Test-Path -LiteralPath $destinoRuim) { throw "Pacote $($caso.nome) deixou destino parcial." }
    }

    # Manifesto sem os campos novos - o formato da v1.4.1 - tem de ser recusado
    # pelo instalador, nao so pela funcao de contrato.
    $pacoteAntigo = Join-Path $tempDir 'pacote-manifesto-antigo'
    New-Item -ItemType Directory -Path $pacoteAntigo | Out-Null
    foreach ($artefato in @(Get-ChildItem -LiteralPath $pacoteLocal -File)) {
        Copy-Item -LiteralPath $artefato.FullName -Destination (Join-Path $pacoteAntigo $artefato.Name)
    }
    $manifestoReduzido = [System.IO.File]::ReadAllText($manifestoA, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $reduzido = [ordered]@{}
    foreach ($campo in @('formatVersion', 'product', 'version', 'channel', 'commit', 'buildTimestamp', 'artifact', 'runtimeManifest')) {
        $reduzido[$campo] = $manifestoReduzido.$campo
    }
    [System.IO.File]::WriteAllText((Join-Path $pacoteAntigo $manifestoNome), (($reduzido | ConvertTo-Json -Depth 12) + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    $resAntigo = Invoke-Instalador @('-PacoteLocal', $pacoteAntigo, '-InstallDir', (Join-Path $tempDir 'destino-antigo'))
    if ($resAntigo.ExitCode -eq 0) { throw 'Manifesto no formato antigo deveria ser recusado pelo instalador.' }
    if ($resAntigo.Output -notmatch 'bootstrapArtifact') { throw "Recusa do manifesto antigo com motivo inesperado: $($resAntigo.Output)" }

    $sobrasInstalador = @(Get-ChildItem -LiteralPath $tempBase -Directory -Filter 'pmo-instalar-*' -ErrorAction SilentlyContinue)
    Assert-Igual 0 $sobrasInstalador.Count 'O instalador nao pode deixar area de trabalho em TEMP.'

    Write-Host "Todos os testes de build, release e portabilidade passaram para v$Version." -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $tempDir -PathType Container) {
        $resolvido = [System.IO.Path]::GetFullPath($tempDir)
        if (-not $resolvido.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or -not ([System.IO.Path]::GetFileName($resolvido)).StartsWith('pmo-tests-', [StringComparison]::Ordinal)) {
            throw "Recusa ao remover pasta de teste inesperada: $resolvido"
        }
        Remove-Item -LiteralPath $resolvido -Recurse -Force
    }
}

# Casos negativos executam processos que devem retornar codigo diferente de
# zero. Quando este script e invocado pelo passo do GitHub Actions, o wrapper
# do runner pode propagar esse LASTEXITCODE mesmo depois de todos os gates
# passarem. Somente o caminho de sucesso alcanca esta linha; throws reais
# continuam bloqueantes.
$global:LASTEXITCODE = 0
