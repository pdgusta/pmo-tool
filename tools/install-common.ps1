<#
    install-common.ps1 - materializacao compartilhada da instalacao portatil.

    Existe uma unica implementacao de "como uma instalacao e montada". Quem
    constroi os pacotes localmente (New-PortableInstall.ps1) e quem os baixa de
    uma release usam a mesma funcao, para que as duas instalacoes sejam
    indistinguiveis em layout, inventario e pins.

    Pre-requisito: portable-common.ps1 ja carregado (dot-source) pelo chamador.
    A ordem importa no caminho remoto: o helper e verificado por SHA-256 antes
    de ser carregado, e este arquivo nao repete nenhum controle de seguranca de
    ZIP - ele apenas consome os do helper.
#>

function Assert-PmoInstallCommonLoaded {
    foreach ($nome in @('Get-PmoNormalizedFullPath','Test-PmoSubPath','Test-PmoArchive',
                        'Expand-PmoArchiveSafe','Write-PmoJsonAtomic','Get-PmoSha256',
                        'Get-PmoDirectoryInventory','Test-PmoInventory','Remove-PmoManagedTree')) {
        if (-not (Get-Command $nome -CommandType Function -ErrorAction SilentlyContinue)) {
            throw "install-common.ps1 exige portable-common.ps1 carregado antes; funcao ausente: $nome."
        }
    }
}

<#
    Layout canonico do bootstrap. Sao exatamente os arquivos que o ZIP de
    runtime nao pode conter: pmo.ps1, atualizar.ps1 e bootstrap.json ficam fora
    dele por construcao, e e isso que garante o G12 - um update regular nunca
    substitui script de raiz.
#>
function Get-PmoBootstrapLayout {
    return [pscustomobject]@{
        Obrigatorios = @('pmo.ps1','atualizar.ps1','bootstrap.json','LICENSE','NOTICE','tools/portable-common.ps1')
        Opcionais    = @('tools/install-common.ps1')
    }
}

<#
    Allowlist do pacote de bootstrap, no formato aceito por Test-PmoArchive.
    Nao substitui a lista de prefixos bloqueados - essa e fixa no helper e vale
    para qualquer pacote.
#>
function Get-PmoBootstrapArchiveRules {
    $layout = Get-PmoBootstrapLayout
    return @{
        ArquivosPermitidos   = @($layout.Obrigatorios + $layout.Opcionais)
        PrefixosPermitidos   = @()
        DiretoriosPermitidos = @('tools')
    }
}

<#
    Valida o destino antes de qualquer trabalho caro e devolve os caminhos
    canonicos. Chamada tanto pelo gerador local (que precisa falhar antes de
    construir o pacote) quanto pela materializacao.
#>
function Assert-PmoInstallDestination {
    param(
        [Parameter(Mandatory=$true)][string]$Destination,
        [string]$SourceRoot
    )
    Assert-PmoInstallCommonLoaded

    $destinationFull = Get-PmoNormalizedFullPath $Destination
    $destinationRoot = [System.IO.Path]::GetPathRoot($destinationFull)
    if ($destinationFull.Equals((Get-PmoNormalizedFullPath $destinationRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'O destino deve ser uma pasta, nao a raiz de uma unidade.'
    }
    if (-not [string]::IsNullOrWhiteSpace($SourceRoot)) {
        $sourceRootFull = Get-PmoNormalizedFullPath $SourceRoot
        if ($destinationFull.Equals($sourceRootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
            (Test-PmoSubPath $sourceRootFull $destinationFull)) {
            throw 'O destino nao pode ficar dentro da raiz fonte.'
        }
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

    return [pscustomobject]@{
        Full        = $destinationFull
        Parent      = $destinationParent
        ExistedEmpty = $destinationExistedEmpty
    }
}

<# Confere que a arvore de bootstrap tem o layout canonico e nada alem dele. #>
function Assert-PmoBootstrapTree {
    param([Parameter(Mandatory=$true)][string]$Root)
    Assert-PmoInstallCommonLoaded

    $rootFull = Get-PmoNormalizedFullPath $Root
    if (-not (Test-Path -LiteralPath $rootFull -PathType Container)) { throw 'Arvore de bootstrap inexistente.' }
    $null = Assert-PmoTreeWithoutReparse $rootFull

    $layout = Get-PmoBootstrapLayout
    $permitidos = @{}
    foreach ($nome in @($layout.Obrigatorios + $layout.Opcionais)) { $permitidos[$nome.ToLowerInvariant()] = $true }

    foreach ($atual in @(Get-PmoDirectoryInventory $rootFull)) {
        $chave = ([string]$atual.path).Replace('\','/').ToLowerInvariant()
        if (-not $permitidos.ContainsKey($chave)) { throw "Bootstrap contem arquivo fora do layout: $($atual.path)" }
    }
    foreach ($nome in $layout.Obrigatorios) {
        $caminho = Resolve-PmoPath $rootFull $nome
        if (-not (Test-Path -LiteralPath $caminho -PathType Leaf)) { throw "Bootstrap sem arquivo obrigatorio: $nome" }
    }
}

<#
    Monta a instalacao a partir dos dois pacotes e comita por rename.

    Sempre a partir dos artefatos, nunca de um diretorio solto: e o que
    garante que a instalacao local e a instalacao baixada de uma release
    partam exatamente do mesmo material e passem pelas mesmas validacoes.
#>
function Install-PmoPortableFromPackages {
    param(
        [Parameter(Mandatory=$true)][string]$RuntimeZip,
        [Parameter(Mandatory=$true)][string]$BootstrapZip,
        [Parameter(Mandatory=$true)][string]$Destination,
        [Parameter(Mandatory=$true)][string]$Versao,
        [string]$Repositorio = '',
        [string]$SourceRoot,
        [string]$IncluirDadosDe
    )
    Assert-PmoInstallCommonLoaded

    if (-not (Test-Path -LiteralPath $RuntimeZip -PathType Leaf)) { throw 'Pacote de runtime inexistente.' }
    if (-not (Test-Path -LiteralPath $BootstrapZip -PathType Leaf)) { throw 'Pacote de bootstrap inexistente.' }

    $destino = Assert-PmoInstallDestination -Destination $Destination -SourceRoot $SourceRoot
    $destinationFull = $destino.Full
    $destinationParent = $destino.Parent
    $destinationExistedEmpty = $destino.ExistedEmpty

    # O staging e irmao do destino para que o commit final seja um rename no mesmo volume.
    $stagingName = '.pmo-install-staging-' + [Guid]::NewGuid().ToString('N')
    $stagingFull = [System.IO.Path]::GetFullPath((Join-Path $destinationParent $stagingName))
    if (-not (Test-PmoSubPath $destinationParent $stagingFull) -or
        -not ((Get-PmoNormalizedFullPath ([System.IO.Path]::GetDirectoryName($stagingFull))).Equals($destinationParent, [System.StringComparison]::OrdinalIgnoreCase))) {
        throw 'O staging calculado nao e irmao seguro do destino.'
    }
    New-Item -ItemType Directory -Path $stagingFull | Out-Null

    $committed = $false
    try {
        $check = Test-PmoArchive $RuntimeZip
        if (-not $check.ok) { throw ('Runtime inicial rejeitado: ' + ($check.errors -join '; ')) }

        $runtimeDir = Join-Path (Join-Path $stagingFull 'versions') $Versao
        New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
        Expand-PmoArchiveSafe $RuntimeZip $runtimeDir
        $runtimeManifest = Read-PmoJson (Join-Path $runtimeDir 'release.json') $null
        if (-not $runtimeManifest -or -not $runtimeManifest.schema) { throw 'Runtime inicial sem contrato de schema.' }
        if ([string]$runtimeManifest.version -ne $Versao) { throw 'Versao do runtime inicial diverge do destino solicitado.' }
        $runtimeManifestSha256 = Get-PmoSha256 (Join-Path $runtimeDir 'release.json')

        # O bootstrap passa pela allowlist propria antes de qualquer extracao.
        $regras = Get-PmoBootstrapArchiveRules
        $checkBootstrap = Test-PmoArchive $BootstrapZip @regras
        if (-not $checkBootstrap.ok) { throw ('Bootstrap rejeitado: ' + ($checkBootstrap.errors -join '; ')) }
        $bootstrapTemp = Join-Path $stagingFull '.pmo-bootstrap-extract'
        Expand-PmoArchiveSafe $BootstrapZip $bootstrapTemp @regras
        $bootstrapRoot = $bootstrapTemp
        Assert-PmoBootstrapTree $bootstrapRoot

        $layout = Get-PmoBootstrapLayout
        foreach ($nome in $layout.Obrigatorios) {
            $origem = Resolve-PmoPath (Get-PmoNormalizedFullPath $bootstrapRoot) $nome
            $alvo = Resolve-PmoPath $stagingFull $nome
            $pai = [System.IO.Path]::GetDirectoryName($alvo)
            if (-not (Test-Path -LiteralPath $pai -PathType Container)) { New-Item -ItemType Directory -Path $pai -Force | Out-Null }
            Copy-PmoFileDurable -Source $origem -Destination $alvo
        }

        foreach ($dir in @('config','state','data','data\attachments','data\backups','data\update-backups','data\user-templates','staging','logs')) {
            New-Item -ItemType Directory -Path (Join-Path $stagingFull $dir) -Force | Out-Null
        }
        $install = [ordered]@{
            formatVersion=1; repository=$Repositorio; channel='stable'; port=8090; checkIntervalHours=24
            dataDir='data'; configDir='config'; stateDir='state'
            retention=[ordered]@{ versions=2; snapshots=3; portfolioBackups=30 }
        }
        Write-PmoJsonAtomic (Join-Path $stagingFull 'config\install.json') $install
        Write-PmoJsonAtomic (Join-Path $stagingFull 'state\active.json') ([ordered]@{
            formatVersion=1; bootstrapVersion='1.0.0'; bootstrapProtocolVersion=1
            activeVersion=$Versao; previousVersion=$null
            activeSchemaVersion=[int]$runtimeManifest.schema.write; previousSchemaVersion=$null
            activeReleaseManifestSha256=$runtimeManifestSha256; previousReleaseManifestSha256=$null
            activatedAt=(Get-Date).ToUniversalTime().ToString('o')
        })
        Write-PmoJsonAtomic (Join-Path $stagingFull 'state\update.json') ([ordered]@{
            formatVersion=1; phase='idle'; updatedAt=(Get-Date).ToUniversalTime().ToString('o'); error=$null
        })

        $incluiDados = -not [string]::IsNullOrWhiteSpace($IncluirDadosDe)
        if ($incluiDados -and -not (Test-Path -LiteralPath $IncluirDadosDe -PathType Container)) {
            # Instalacao vazia e resultado legitimo; o que nao pode e passar despercebido.
            Write-Warning "Origem de dados inexistente ($IncluirDadosDe); a instalacao nasce sem dados."
        }
        if ($incluiDados -and (Test-Path -LiteralPath $IncluirDadosDe -PathType Container)) {
            foreach ($nome in @('portfolio.json','attachments','user-templates')) {
                $src = Join-Path $IncluirDadosDe $nome
                $dst = Join-Path (Join-Path $stagingFull 'data') $nome
                if (Test-Path -LiteralPath $src -PathType Leaf) { Copy-PmoFileDurable -Source $src -Destination $dst }
                elseif (Test-Path -LiteralPath $src -PathType Container) { Copy-PmoDirectoryDurable -Source $src -Destination $dst }
            }
        }

        if (-not (Test-PmoSubPath $stagingFull $bootstrapTemp)) { throw 'Extracao do bootstrap escapou do staging.' }
        Remove-PmoManagedTree -Root $stagingFull -Path $bootstrapTemp

        $inventory = @(Get-PmoDirectoryInventory $stagingFull)
        $installManifestPath = Join-Path $stagingFull 'portable-install-manifest.json'
        Write-PmoJsonAtomic $installManifestPath ([ordered]@{
            formatVersion=1; version=$Versao; createdAt=(Get-Date).ToUniversalTime().ToString('o')
            includesCurrentData=[bool]$incluiDados; repositoryConfigured=(-not [string]::IsNullOrWhiteSpace($Repositorio)); files=$inventory
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
    } finally {
        if (-not $committed -and (Test-Path -LiteralPath $stagingFull -PathType Container)) {
            $safeStaging = (Test-PmoSubPath $destinationParent $stagingFull) -and
                ([System.IO.Path]::GetFileName($stagingFull).StartsWith('.pmo-install-staging-', [System.StringComparison]::Ordinal))
            if ($safeStaging) {
                try { Remove-PmoManagedTree -Root $destinationParent -Path $stagingFull } catch { }
            }
        }
    }

    return [pscustomobject]@{
        Destination = $destinationFull
        Version     = $Versao
        Manifest    = (Join-Path $destinationFull 'portable-install-manifest.json')
    }
}
