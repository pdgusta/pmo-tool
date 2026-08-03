<# Testes isolados do journal de restore e da compensacao de ativacao. #>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $root 'tools\portable-common.ps1')

function Assert-True($Value,[string]$Message) { if (-not $Value) { throw $Message } }
function Assert-Throws([scriptblock]$Action,[string]$Pattern,[string]$Message) {
    try { & $Action; throw "Nao falhou: $Message" }
    catch {
        if ($_.Exception.Message -eq "Nao falhou: $Message") { throw }
        if ($_.Exception.Message -notmatch $Pattern) { throw "Falha inesperada em $Message`: $($_.Exception.Message)" }
    }
}
function New-Bundle([string]$Marker,[int]$Schema,[string]$Version) {
    return [ordered]@{
        meta=[ordered]@{ schemaVersion=$Schema; appVersion=$Version; salvoEm='2026-08-02T12:00:00Z'; marker=$Marker }
        settings=[ordered]@{ salvarEmDisco=$false; tema='auto' }
        pessoas=@(); programas=@(); projetos=@(); anexos=@(); auditLog=@(); imports=@(); visoesSalvas=@()
    }
}

function New-TestRuntime([string]$Install,[string]$Version,[int]$WriteSchema,[int]$ReadMin=1,[int]$ReadMax=$WriteSchema) {
    $runtime = Join-Path $Install ('versions\' + $Version)
    New-Item -ItemType Directory -Path $runtime,(Join-Path $runtime 'tools'),(Join-Path $runtime 'dist') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'serve.ps1') -Destination (Join-Path $runtime 'serve.ps1')
    Copy-Item -LiteralPath (Join-Path $root 'tools\portable-common.ps1') -Destination (Join-Path $runtime 'tools\portable-common.ps1')
    Copy-Item -LiteralPath (Join-Path $root 'tools\update-runtime.ps1') -Destination (Join-Path $runtime 'tools\update-runtime.ps1')
    [System.IO.File]::WriteAllText((Join-Path $runtime 'dist\pmo-tool.html'),'<!doctype html><title>fixture</title>',(New-Object System.Text.UTF8Encoding($false)))
    $files = @(Get-PmoDirectoryInventory $runtime)
    Write-PmoJsonAtomic (Join-Path $runtime 'release.json') ([ordered]@{
        formatVersion=1; product='PMO Tool'; version=$Version; channel='stable'; platform='windows'
        minBootstrapVersion='1.0.0'; minPowerShellVersion='5.1'; commit=('0' * 40); buildTimestamp='2026-08-02T12:00:00Z'
        schema=[ordered]@{ readMin=$ReadMin; readMax=$ReadMax; write=$WriteSchema }; files=$files
    })
    return $runtime
}

function New-SealedSnapshot([string]$Install,[string]$Id,$Bundle,[string]$Kind) {
    $dir = Join-Path $Install ('data\update-backups\' + $Id)
    New-Item -ItemType Directory -Path $dir,(Join-Path $dir 'attachments'),(Join-Path $dir 'user-templates') -Force | Out-Null
    Write-PmoJsonAtomic (Join-Path $dir 'portfolio.json') $Bundle
    Write-PmoJsonAtomic (Join-Path $dir 'raw-bundle.json') $Bundle
    $files = @(Get-PmoDirectoryInventory $dir)
    Write-PmoJsonAtomic (Join-Path $dir 'manifest.json') ([ordered]@{
        formatVersion=1; snapshotId=$Id; kind=$Kind; sealed=$true; createdAt='2026-08-02T12:00:00Z'
        sourceAppVersion=[string]$Bundle.meta.appVersion; sourceSchemaVersion=[int]$Bundle.meta.schemaVersion
        files=$files
    })
    return $dir
}

function New-TestInstall([string]$Name) {
    $base = Join-Path ([System.IO.Path]::GetTempPath()) ('pmo-updater-test-' + $Name + '-' + [Guid]::NewGuid().ToString('N'))
    foreach ($dir in @('tools','config','state','data','data\attachments','data\user-templates','data\update-backups','data\recovery','versions','staging','logs')) {
        New-Item -ItemType Directory -Path (Join-Path $base $dir) -Force | Out-Null
    }
    foreach ($file in @('atualizar.ps1','bootstrap.json')) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $base $file) }
    foreach ($file in @('portable-common.ps1','update-runtime.ps1')) { Copy-Item -LiteralPath (Join-Path (Join-Path $root 'tools') $file) -Destination (Join-Path (Join-Path $base 'tools') $file) }
    $runtime141 = New-TestRuntime $base '1.4.1' 4 1 4
    $runtime140 = New-TestRuntime $base '1.4.0' 3 1 3
    Write-PmoJsonAtomic (Join-Path $base 'config\install.json') ([ordered]@{
        formatVersion=1; repository=''; channel='stable'; port=8090; checkIntervalHours=24
        dataDir='data'; configDir='config'; stateDir='state'; retention=[ordered]@{versions=2;snapshots=3;portfolioBackups=30}
    })
    Write-PmoJsonAtomic (Join-Path $base 'state\active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion='1.4.1'; previousVersion='1.4.0'
        activeSchemaVersion=4; previousSchemaVersion=3; activatedAt='2026-08-02T12:00:00Z'; rollbackSnapshotId='old'
        bootstrapProtocolVersion=1
        activeReleaseManifestSha256=(Get-PmoSha256 (Join-Path $runtime141 'release.json'))
        previousReleaseManifestSha256=(Get-PmoSha256 (Join-Path $runtime140 'release.json'))
    })
    return $base
}

function Invoke-Updater([string]$Install,[string[]]$Arguments) {
    $all = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Install 'atualizar.ps1'),'-InstallRoot',$Install) + $Arguments
    & powershell.exe @all
    if ($LASTEXITCODE -ne 0) { throw "Updater de teste falhou com exit code $LASTEXITCODE." }
}

function Invoke-UpdaterFailure([string]$Install,[string[]]$Arguments,[string]$Pattern) {
    $all = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Install 'atualizar.ps1'),'-InstallRoot',$Install) + $Arguments
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        # Converta cada ErrorRecord antes que o formatter do host possa
        # intercalar metadados NativeCommandError em mensagens longas.
        $output = ((& powershell.exe @all 2>&1 | ForEach-Object { $_.ToString() }) -join "`n")
    } finally { $ErrorActionPreference = $previousPreference }
    if ($LASTEXITCODE -eq 0) { throw 'Updater deveria ter falhado.' }
    # PowerShell pode inserir quebras de linha de apresentacao em ErrorRecord
    # conforme a largura do console. Normalize apenas para a assercao; preserve
    # a saida original no diagnostico caso o motivo realmente seja inesperado.
    $outputParaComparacao = ($output -replace '\s+', ' ').Trim()
    if ($outputParaComparacao -notmatch $Pattern) { throw "Updater falhou por motivo inesperado: $output" }
}

function Import-UpdaterFunction([string]$Name) {
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'tools\update-runtime.ps1'),[ref]$tokens,[ref]$errors)
    if ($errors.Count -gt 0) { throw "Updater com erro de parse: $($errors[0].Message)" }
    $definition = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name },$true)) | Select-Object -First 1
    if (-not $definition) { throw "Funcao $Name nao encontrada no updater." }
    $bodyText = $definition.Body.Extent.Text
    $bodyText = $bodyText.Substring(1,$bodyText.Length - 2)
    Set-Item -Path ('Function:\script:' + $Name) -Value ([scriptblock]::Create($bodyText))
}

$installs = @()
try {
    # Restauracao manual: o snapshot hibrido atual e obrigatorio e a configuracao
    # local nao pode ser substituida pelo snapshot alvo.
    $install = New-TestInstall 'manual'
    $installs += $install
    $current = New-Bundle 'current' 4 '1.4.1'
    $old = New-Bundle 'old' 3 '1.4.0'
    Write-PmoJsonAtomic (Join-Path $install 'data\portfolio.json') $current
    $null = New-SealedSnapshot $install 'safety' $current 'pre-restore'
    $null = New-SealedSnapshot $install 'old' $old 'pre-update'
    Write-PmoJsonAtomic (Join-Path $install 'state\update.json') ([ordered]@{
        formatVersion=1; phase='restore-prepared'; operation='restore'; snapshotId='safety'; targetSnapshotId='old'
    })
    Write-PmoJsonAtomic (Join-Path $install 'state\update.lock') ([ordered]@{ snapshotId='safety' })
    $configHash = Get-PmoSha256 (Join-Path $install 'config\install.json')
    Invoke-Updater $install @('-RestoreSnapshot','old','-PreparedSnapshot','safety')
    $restored = Read-PmoJson (Join-Path $install 'data\portfolio.json') $null
    Assert-True ([string]$restored.meta.marker -eq 'old') 'Restore manual nao instalou o bundle alvo.'
    Assert-True ((Get-PmoSha256 (Join-Path $install 'config\install.json')) -eq $configHash) 'Restore alterou install.json.'
    Assert-True (Test-Path -LiteralPath (Join-Path $install 'state\restore-pending.json')) 'Restore nao deixou sincronizacao de IndexedDB pendente.'
    Assert-True ([string](Read-PmoJson (Join-Path $install 'state\update.json') $null).phase -eq 'restored') 'Restore nao atingiu estado terminal.'
    Assert-True (Test-Path -LiteralPath (Join-Path $install 'data\update-backups\safety\manifest.json')) 'Snapshot de seguranca atual foi perdido.'
    $manualJournal = Read-PmoJson (Join-Path $install 'state\restore.json') $null
    Assert-True ([string]$manualJournal.updaterRuntimeVersion -eq '1.4.1') 'Journal nao registrou o runtime criador.'
    Assert-True ([string]$manualJournal.updaterRelativePath -eq 'versions/1.4.1/tools/update-runtime.ps1') 'Journal nao registrou o updater criador canonico.'
    Assert-True ([string]$manualJournal.updaterReleaseManifestSha256 -eq (Get-PmoSha256 (Join-Path $install 'versions\1.4.1\release.json'))) 'Journal nao ancorou o manifesto do updater criador.'

    # Queda depois da troca do ponteiro durante ativacao: -Recover precisa
    # restaurar o snapshot antigo mesmo que active.json ja volte a apontar para
    # a versao anterior em uma tentativa parcial.
    $install2 = New-TestInstall 'activation'
    $installs += $install2
    $old2 = New-Bundle 'before-update' 3 '1.4.0'
    $migrated = New-Bundle 'after-migration' 4 '1.4.1'
    Write-PmoJsonAtomic (Join-Path $install2 'data\portfolio.json') $migrated
    $null = New-SealedSnapshot $install2 'before' $old2 'pre-update'
    $previousActive = [ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion='1.4.0'; previousVersion=$null
        activeSchemaVersion=3; previousSchemaVersion=$null; activatedAt='2026-08-02T12:00:00Z'
        bootstrapProtocolVersion=1
        activeReleaseManifestSha256=(Get-PmoSha256 (Join-Path $install2 'versions\1.4.0\release.json'))
    }
    Write-PmoJsonAtomic (Join-Path $install2 'state\active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion='1.4.1'; previousVersion='1.4.0'
        activeSchemaVersion=4; previousSchemaVersion=3; rollbackSnapshotId='before'
        pendingActivationId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; activatedAt='2026-08-02T12:05:00Z'
        bootstrapProtocolVersion=1
        activeReleaseManifestSha256=(Get-PmoSha256 (Join-Path $install2 'versions\1.4.1\release.json'))
        previousReleaseManifestSha256=(Get-PmoSha256 (Join-Path $install2 'versions\1.4.0\release.json'))
    })
    Write-PmoJsonAtomic (Join-Path $install2 'state\update.json') ([ordered]@{
        formatVersion=1; phase='activating'; snapshotId='before'; targetVersion='1.4.1'; targetSchemaVersion=4
        activationId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; previousActive=$previousActive; pointerSwitched=$true
        updaterRuntimeVersion='1.4.0'; updaterRelativePath='versions/1.4.0/tools/update-runtime.ps1'
    })
    Write-PmoJsonAtomic (Join-Path $install2 'state\update.lock') ([ordered]@{ snapshotId='before' })
    # O runtime parcialmente ativado esta adulterado e o portfolio atual
    # desapareceu: recovery deve usar o updater criador e tratar o snapshot
    # emergencial apenas como best-effort.
    [System.IO.File]::WriteAllText((Join-Path $install2 'versions\1.4.1\tools\update-runtime.ps1'),'conteudo adulterado',(New-Object System.Text.UTF8Encoding($false)))
    Remove-Item -LiteralPath (Join-Path $install2 'data\portfolio.json') -Force
    Invoke-Updater $install2 @('-Recover')
    $activeRecovered = Read-PmoJson (Join-Path $install2 'state\active.json') $null
    $dataRecovered = Read-PmoJson (Join-Path $install2 'data\portfolio.json') $null
    Assert-True ([string]$activeRecovered.activeVersion -eq '1.4.0') 'Recover nao restaurou o ponteiro anterior.'
    Assert-True ([int]$activeRecovered.bootstrapProtocolVersion -eq 1) 'Recover perdeu a versao do protocolo do bootstrap.'
    Assert-True ([string]$activeRecovered.activeReleaseManifestSha256 -eq (Get-PmoSha256 (Join-Path $install2 'versions\1.4.0\release.json'))) 'Recover perdeu a ancora do manifesto anterior.'
    Assert-True ([string]$dataRecovered.meta.marker -eq 'before-update') 'Recover deixou dados migrados sob runtime antigo.'
    Assert-True ([string](Read-PmoJson (Join-Path $install2 'state\update.json') $null).phase -eq 'activation-failed-recovered') 'Recover nao registrou compensacao terminal.'
    Assert-True (Test-Path -LiteralPath (Join-Path $install2 'state\restore-pending.json')) 'Recover nao exigiu sincronizacao posterior do IndexedDB.'
    $activationJournal = Read-PmoJson (Join-Path $install2 'state\restore.json') $null
    Assert-True ([string]$activationJournal.updaterRuntimeVersion -eq '1.4.0') 'Recovery nao preservou o updater criador no journal de restore.'
    Assert-True ([string]$activationJournal.updaterReleaseManifestSha256 -eq (Get-PmoSha256 (Join-Path $install2 'versions\1.4.0\release.json'))) 'Recovery nao ancorou o manifesto do updater criador.'
    Assert-True (-not $activationJournal.emergencySnapshotId) 'Falha do snapshot emergencial nao deveria impedir nem substituir o snapshot pre-update.'

    # Restore manual precisa ser recusado antes de qualquer mutacao quando o
    # schema do snapshot esta fora do intervalo de leitura do runtime ativo.
    $install3 = New-TestInstall 'schema-incompativel'
    $installs += $install3
    $current3 = New-Bundle 'current-schema' 4 '1.4.1'
    $future3 = New-Bundle 'future-schema' 5 '1.5.0'
    Write-PmoJsonAtomic (Join-Path $install3 'data\portfolio.json') $current3
    $null = New-SealedSnapshot $install3 'safety-schema' $current3 'pre-restore'
    $null = New-SealedSnapshot $install3 'future' $future3 'manual'
    Write-PmoJsonAtomic (Join-Path $install3 'state\update.json') ([ordered]@{
        formatVersion=1; phase='restore-prepared'; operation='restore'; snapshotId='safety-schema'; targetSnapshotId='future'
    })
    Write-PmoJsonAtomic (Join-Path $install3 'state\update.lock') ([ordered]@{ snapshotId='safety-schema' })
    Invoke-UpdaterFailure $install3 @('-RestoreSnapshot','future','-PreparedSnapshot','safety-schema') 'nao pode ler o schema 5'
    Assert-True ([string](Read-PmoJson (Join-Path $install3 'data\portfolio.json') $null).meta.marker -eq 'current-schema') 'Restore incompativel alterou os dados antes de falhar.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $install3 'state\restore.json'))) 'Restore incompativel criou journal de mutacao.'

    # O manifesto do runtime ativo e ancorado em active.json. Mesmo que o
    # bootstrap encontre um updater anterior valido, o restore nao pode usar um
    # runtime cujo conteudo foi adulterado.
    $install4 = New-TestInstall 'runtime-adulterado'
    $installs += $install4
    $current4 = New-Bundle 'current-runtime' 4 '1.4.1'
    $old4 = New-Bundle 'old-runtime' 3 '1.4.0'
    Write-PmoJsonAtomic (Join-Path $install4 'data\portfolio.json') $current4
    $null = New-SealedSnapshot $install4 'safety-runtime' $current4 'pre-restore'
    $null = New-SealedSnapshot $install4 'old-runtime' $old4 'manual'
    Write-PmoJsonAtomic (Join-Path $install4 'state\update.json') ([ordered]@{
        formatVersion=1; phase='restore-prepared'; operation='restore'; snapshotId='safety-runtime'; targetSnapshotId='old-runtime'
    })
    Write-PmoJsonAtomic (Join-Path $install4 'state\update.lock') ([ordered]@{ snapshotId='safety-runtime' })
    # Adulteracao coerente: o atacante altera o proprio updater e recompõe o
    # inventario interno. O pin de release.json em active.json precisa barrar
    # a execucao antes que a linha-marcador seja avaliada.
    $runtime4 = Join-Path $install4 'versions\1.4.1'
    $updater4 = Join-Path $runtime4 'tools\update-runtime.ps1'
    $marker4 = Join-Path $install4 'tampered-updater-executed.txt'
    $updater4Raw = [System.IO.File]::ReadAllText($updater4,[System.Text.Encoding]::UTF8)
    $marker4Escaped = $marker4.Replace("'","''")
    [System.IO.File]::WriteAllText($updater4,("[System.IO.File]::WriteAllText('$marker4Escaped','executed')`r`n" + $updater4Raw),(New-Object System.Text.UTF8Encoding($false)))
    $release4Path = Join-Path $runtime4 'release.json'
    $release4 = Read-PmoJson $release4Path $null
    $release4.files = @(Get-PmoDirectoryInventory $runtime4 | Where-Object { [string]$_.path -ne 'release.json' })
    Write-PmoJsonAtomic $release4Path $release4
    Invoke-UpdaterFailure $install4 @('-RestoreSnapshot','old-runtime','-PreparedSnapshot','safety-runtime') 'diverge|corrompido'
    Assert-True ([string](Read-PmoJson (Join-Path $install4 'data\portfolio.json') $null).meta.marker -eq 'current-runtime') 'Runtime adulterado permitiu mutacao de dados.'
    Assert-True (-not (Test-Path -LiteralPath $marker4)) 'Updater adulterado foi executado antes de validar o pin do manifesto.'

    # Journal parcial: portfolio ja trocado, diretorios ainda em staging. A
    # retomada deve ser idempotente e concluir o mesmo snapshot.
    $install5 = New-TestInstall 'journal-parcial'
    $installs += $install5
    $current5 = New-Bundle 'current-partial' 4 '1.4.1'
    $old5 = New-Bundle 'old-partial' 3 '1.4.0'
    Write-PmoJsonAtomic (Join-Path $install5 'data\portfolio.json') $current5
    $targetDir5 = New-SealedSnapshot $install5 'partial-target' $old5 'pre-update'
    $restoreId5 = 'restore-partial-fixture'
    $restoreRoot5 = Join-Path $install5 ('data\recovery\' + $restoreId5)
    $stage5 = Join-Path $restoreRoot5 'stage'
    $previous5 = Join-Path $restoreRoot5 'previous'
    New-Item -ItemType Directory -Path $stage5,$previous5,(Join-Path $stage5 'attachments'),(Join-Path $stage5 'user-templates') -Force | Out-Null
    Move-Item -LiteralPath (Join-Path $install5 'data\portfolio.json') -Destination (Join-Path $previous5 'portfolio.json')
    Copy-Item -LiteralPath (Join-Path $targetDir5 'portfolio.json') -Destination (Join-Path $install5 'data\portfolio.json')
    Write-PmoJsonAtomic (Join-Path $install5 'state\restore.json') ([ordered]@{
        formatVersion=1; restoreId=$restoreId5; phase='swapping'; snapshotId='partial-target'; emergencySnapshotId=$null
        root=$restoreRoot5; stage=$stage5; previous=$previous5; completedComponents=@('portfolio.json')
        updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
        createdAt='2026-08-02T12:00:00Z'; updatedAt='2026-08-02T12:00:00Z'; completedAt=$null
    })
    Write-PmoJsonAtomic (Join-Path $install5 'state\update.json') ([ordered]@{
        formatVersion=1; phase='restoring'; snapshotId='partial-target'; restoreOperation='manual'
        updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
    })
    Write-PmoJsonAtomic (Join-Path $install5 'state\update.lock') ([ordered]@{ snapshotId='partial-target' })
    Invoke-Updater $install5 @('-Recover')
    Assert-True ([string](Read-PmoJson (Join-Path $install5 'data\portfolio.json') $null).meta.marker -eq 'old-partial') 'Recovery do journal parcial nao preservou o alvo.'
    Assert-True ([string](Read-PmoJson (Join-Path $install5 'state\restore.json') $null).phase -eq 'completed') 'Journal parcial nao foi concluido.'
    Assert-True ([string](Read-PmoJson (Join-Path $install5 'state\update.json') $null).phase -eq 'restored-recovered') 'Journal parcial nao atingiu estado terminal recuperado.'

    # Queda depois de persistir restoring/restoreId, mas antes de criar o novo
    # journal. Um completed antigo, ainda que declare outro updater criador,
    # deve ser ignorado e jamais substituir a transacao corrente.
    $install6 = New-TestInstall 'restore-correlacionado'
    $installs += $install6
    $old6 = New-Bundle 'old-correlated' 3 '1.4.0'
    $new6 = New-Bundle 'new-correlated' 4 '1.4.1'
    Write-PmoJsonAtomic (Join-Path $install6 'data\portfolio.json') $new6
    $null = New-SealedSnapshot $install6 'target-correlated' $old6 'pre-update'
    $previousActive6 = [ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion='1.4.0'; previousVersion=$null
        activeSchemaVersion=3; previousSchemaVersion=$null; activatedAt='2026-08-02T12:00:00Z'
        bootstrapProtocolVersion=1
        activeReleaseManifestSha256=(Get-PmoSha256 (Join-Path $install6 'versions\1.4.0\release.json'))
    }
    Write-PmoJsonAtomic (Join-Path $install6 'state\active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion='1.4.1'; previousVersion='1.4.0'
        activeSchemaVersion=4; previousSchemaVersion=3; pendingActivationId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        activatedAt='2026-08-02T12:05:00Z'; bootstrapProtocolVersion=1
        activeReleaseManifestSha256=(Get-PmoSha256 (Join-Path $install6 'versions\1.4.1\release.json'))
        previousReleaseManifestSha256=(Get-PmoSha256 (Join-Path $install6 'versions\1.4.0\release.json'))
    })
    Write-PmoJsonAtomic (Join-Path $install6 'state\restore.json') ([ordered]@{
        formatVersion=1; restoreId='restore-stale-completed'; phase='completed'; snapshotId='stale-target'
        emergencySnapshotId=$null; updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
    })
    $restoreId6 = 'restore-current-window'
    Write-PmoJsonAtomic (Join-Path $install6 'state\update.json') ([ordered]@{
        formatVersion=1; phase='restoring'; restoreId=$restoreId6; snapshotId='target-correlated'
        restoreOperation='activation'; previousActive=$previousActive6
        activationId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; targetVersion='1.4.1'; targetSchemaVersion=4
        updaterRuntimeVersion='1.4.0'; updaterRelativePath='versions/1.4.0/tools/update-runtime.ps1'
    })
    Write-PmoJsonAtomic (Join-Path $install6 'state\update.lock') ([ordered]@{ snapshotId='target-correlated' })
    Invoke-Updater $install6 @('-Recover')
    Assert-True ([string](Read-PmoJson (Join-Path $install6 'data\portfolio.json') $null).meta.marker -eq 'old-correlated') 'Recovery pre-journal nao restaurou o snapshot corrente.'
    Assert-True ([string](Read-PmoJson (Join-Path $install6 'state\active.json') $null).activeVersion -eq '1.4.0') 'Recovery pre-journal nao restaurou o ponteiro anterior.'
    Assert-True ([string](Read-PmoJson (Join-Path $install6 'state\restore.json') $null).restoreId -eq $restoreId6) 'Journal stale foi confundido com a transacao atual.'

    # Propriedade restoreId presente, mas vazia, representa corrupcao; nao e
    # elegivel ao fallback de compatibilidade para journals legados.
    $install7 = New-TestInstall 'restore-id-invalido'
    $installs += $install7
    $current7 = New-Bundle 'current-invalid-id' 4 '1.4.1'
    $old7 = New-Bundle 'old-invalid-id' 3 '1.4.0'
    Write-PmoJsonAtomic (Join-Path $install7 'data\portfolio.json') $current7
    $target7 = New-SealedSnapshot $install7 'invalid-id-target' $old7 'pre-update'
    $root7 = Join-Path $install7 'data\recovery\restore-legacy-looking'
    Write-PmoJsonAtomic (Join-Path $install7 'state\restore.json') ([ordered]@{
        formatVersion=1; restoreId='restore-legacy-looking'; phase='prepared'; snapshotId='invalid-id-target'
        root=$root7; stage=(Join-Path $root7 'stage'); previous=(Join-Path $root7 'previous')
        updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
    })
    Write-PmoJsonAtomic (Join-Path $install7 'state\update.json') ([ordered]@{
        formatVersion=1; phase='restoring'; restoreId=''; snapshotId='invalid-id-target'; restoreOperation='manual'
        updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
    })
    Invoke-UpdaterFailure $install7 @('-Recover') 'restoreId.*invalido'
    Assert-True ([string](Read-PmoJson (Join-Path $install7 'data\portfolio.json') $null).meta.marker -eq 'current-invalid-id') 'restoreId invalido permitiu mutacao.'

    # Um completed so e finalizavel se a barreira de sincronizacao do
    # IndexedDB existir e estiver correlacionada ao mesmo restore/snapshot.
    $install8 = New-TestInstall 'pending-ausente'
    $installs += $install8
    $target8Bundle = New-Bundle 'completed-without-pending' 4 '1.4.1'
    Write-PmoJsonAtomic (Join-Path $install8 'data\portfolio.json') $target8Bundle
    $null = New-SealedSnapshot $install8 'completed-target' $target8Bundle 'pre-update'
    Write-PmoJsonAtomic (Join-Path $install8 'state\restore.json') ([ordered]@{
        formatVersion=1; restoreId='restore-completed-no-pending'; phase='completed'; snapshotId='completed-target'
        emergencySnapshotId=$null; updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
    })
    Write-PmoJsonAtomic (Join-Path $install8 'state\update.json') ([ordered]@{
        formatVersion=1; phase='restoring'; restoreId='restore-completed-no-pending'; snapshotId='completed-target'
        restoreOperation='manual'; updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
    })
    Invoke-UpdaterFailure $install8 @('-Recover') 'restore-pending correlacionado'
    Assert-True (@('restoring','recovering') -contains [string](Read-PmoJson (Join-Path $install8 'state\update.json') $null).phase) 'Pending ausente foi convertido em sucesso terminal.'

    # app-ready valido nao autoriza remover um pendingActivationId de outra
    # sessao, mesmo quando versao e schema coincidem.
    $install9 = New-TestInstall 'activation-id-divergente'
    $installs += $install9
    $bundle9 = New-Bundle 'activation-mismatch' 4 '1.4.1'
    Write-PmoJsonAtomic (Join-Path $install9 'data\portfolio.json') $bundle9
    $null = New-SealedSnapshot $install9 'activation-mismatch-snapshot' $bundle9 'pre-update'
    $previousActive9 = Read-PmoJson (Join-Path $install9 'state\active.json') $null
    $previousActive9.activeVersion = '1.4.0'; $previousActive9.activeSchemaVersion = 3
    $active9 = Read-PmoJson (Join-Path $install9 'state\active.json') $null
    $active9 | Add-Member -NotePropertyName pendingActivationId -NotePropertyValue 'dddddddddddddddddddddddddddddddd' -Force
    Write-PmoJsonAtomic (Join-Path $install9 'state\active.json') $active9
    Write-PmoJsonAtomic (Join-Path $install9 'state\update.json') ([ordered]@{
        formatVersion=1; phase='activating'; snapshotId='activation-mismatch-snapshot'; targetVersion='1.4.1'; targetSchemaVersion=4
        activationId='cccccccccccccccccccccccccccccccc'; previousActive=$previousActive9; pointerSwitched=$true
        updaterRuntimeVersion='1.4.1'; updaterRelativePath='versions/1.4.1/tools/update-runtime.ps1'
    })
    Write-PmoJsonAtomic (Join-Path $install9 'state\app-ready.json') ([ordered]@{
        ok=$true; activationId='cccccccccccccccccccccccccccccccc'; appVersion='1.4.1'; schemaVersion=4; activeVersion='1.4.1'
        diskConfirmed=$true; indexedDbConfirmed=$true; attachmentInventoryConfirmed=$true; readOnly=$false
    })
    Invoke-UpdaterFailure $install9 @('-Recover') 'outra activationId'
    Assert-True ([string](Read-PmoJson (Join-Path $install9 'state\active.json') $null).pendingActivationId -eq 'dddddddddddddddddddddddddddddddd') 'Recovery removeu pendingActivationId de outra sessao.'

    # Se o runtime estiver em uso, -Recover nao repara JSON, cria lock de
    # update nem altera os journals antes de falhar.
    $install10 = New-TestInstall 'runtime-ocupado'
    $installs += $install10
    Write-PmoJsonAtomic (Join-Path $install10 'state\update.json') ([ordered]@{ formatVersion=1; phase='idle' })
    $active10Hash = Get-PmoSha256 (Join-Path $install10 'state\active.json')
    $update10Hash = Get-PmoSha256 (Join-Path $install10 'state\update.json')
    $heldRuntime10 = Enter-PmoMutex $install10 'runtime' 0
    if (-not $heldRuntime10) { throw 'Fixture nao conseguiu adquirir runtime mutex.' }
    try {
        Invoke-UpdaterFailure $install10 @('-Recover') 'Runtime em uso'
        Assert-True ((Get-PmoSha256 (Join-Path $install10 'state\active.json')) -eq $active10Hash) 'Recover ocupado alterou active.json.'
        Assert-True ((Get-PmoSha256 (Join-Path $install10 'state\update.json')) -eq $update10Hash) 'Recover ocupado alterou update.json.'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $install10 'state\update.process.lock'))) 'Recover ocupado criou update.process.lock.'
    } finally { Exit-PmoMutex $heldRuntime10 }

    # Funcoes puras de pre-download/ZIP sao exercitadas sem rede.
    Import-UpdaterFunction 'Assert-ReleaseAssetBounds'
    Import-UpdaterFunction 'Assert-UpdateCapacity'
    Import-UpdaterFunction 'Tem-Propriedade'
    Import-UpdaterFunction 'Test-PmoArchiveCompression'
    $script:maxExternalManifestBytes = 1048576
    $script:maxRuntimeZipBytes = 268435456
    $script:maxArchiveEntryCompressedBytes = 67108864
    $script:maxArchiveExpandedBytes = 536870912
    $script:maxArchiveCompressionRatio = 200.0
    $script:updateCapacityReserveBytes = 33554432
    Assert-Throws { Assert-ReleaseAssetBounds ([pscustomobject]@{size=($script:maxRuntimeZipBytes + 1)}) ([pscustomobject]@{size=1024}) } 'fora do limite' 'ZIP maior que o limite antes do download'
    Assert-Throws { Assert-ReleaseAssetBounds ([pscustomobject]@{size=1024}) ([pscustomobject]@{size=($script:maxExternalManifestBytes + 1)}) } 'fora do limite' 'manifesto maior que o limite antes do download'
    $script:stagingRoot = Join-Path $install5 'staging'
    $script:snapshotRoot = Join-Path $install5 'data\update-backups'
    function script:Get-PmoFreeSpace { return [Int64]1 }
    Assert-Throws {
        Assert-UpdateCapacity ([pscustomobject]@{size=1024}) ([pscustomobject]@{size=1024}) ([pscustomobject]@{
            manifest=[pscustomobject]@{ files=@([pscustomobject]@{size=4096}) }
        })
    } 'Espaco livre insuficiente' 'capacidade para ZIP, staging e snapshot antes do download'

    $zipBomb = Join-Path $install5 'staging\ratio.zip'
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipStream = [System.IO.File]::Open($zipBomb,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
    $zipArchive = New-Object System.IO.Compression.ZipArchive($zipStream,[System.IO.Compression.ZipArchiveMode]::Create,$false)
    try {
        $entry = $zipArchive.CreateEntry('dist/pmo-tool.html',[System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        try {
            $zeros = New-Object byte[] 1048576
            $entryStream.Write($zeros,0,$zeros.Length)
        } finally { $entryStream.Dispose() }
    } finally { $zipArchive.Dispose(); $zipStream.Dispose() }
    Assert-Throws { $null = Test-PmoArchiveCompression $zipBomb } 'Razao de compressao excessiva' 'ZIP com razao de compressao abusiva'

    Import-UpdaterFunction 'Write-UpdateLog'
    $script:logDir = Join-Path $install5 'logs'
    [System.IO.File]::WriteAllBytes((Join-Path $script:logDir 'update.log'),(New-Object byte[] 2097152))
    Write-UpdateLog 'fixture' 'token=segredo'
    Assert-True (Test-Path -LiteralPath (Join-Path $script:logDir 'update.log.1')) 'Log de update nao foi rotacionado por tamanho.'
    $newLog = [System.IO.File]::ReadAllText((Join-Path $script:logDir 'update.log'),[System.Text.Encoding]::UTF8)
    Assert-True ($newLog -match 'token=\[redacted\]' -and $newLog -notmatch 'segredo') 'Rotacao perdeu a sanitizacao do log.'

    Write-Host 'Testes transacionais do updater passaram.' -ForegroundColor Green
} finally {
    foreach ($install in $installs) {
        if ((Test-Path -LiteralPath $install) -and ([System.IO.Path]::GetFileName($install)).StartsWith('pmo-updater-test-',[StringComparison]::Ordinal)) {
            Remove-Item -LiteralPath $install -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
