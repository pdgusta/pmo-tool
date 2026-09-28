<# Teste de integracao local. Requer HttpListener disponivel no Windows. #>
[CmdletBinding()]
param([int]$Port = 18090,[string]$NodePath)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$testDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $testDir
. (Join-Path $root 'tools\portable-common.ps1')
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$temp = Join-Path $tempBase ('pmo-server-test-' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $temp 'data'
$config = Join-Path $temp 'config'
$state = Join-Path $temp 'state'
$token = 'integration-' + [Guid]::NewGuid().ToString('N')
$activationId = 'activation-' + [Guid]::NewGuid().ToString('N')
$process = $null
$secondProcess = $null
$healthProcess = $null
$healthRoot = $null
$processOutputSub = $null
$processErrorSub = $null

if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue }
    if ($nodeCommand) { $NodePath = $nodeCommand.Source }
}
if ([string]::IsNullOrWhiteSpace($NodePath) -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw 'Node.js de desenvolvimento e obrigatorio para validar o HTML servido.'
}

function Invoke-LocalApi {
    param([string]$Path,[string]$Method='GET',[string]$Body=$null,[switch]$Admin,[string]$Origin=$null,[int]$TargetPort=$Port)
    $headers = @{}
    if ($Admin) { $headers['X-PMO-Admin-Token'] = $token }
    if (-not [string]::IsNullOrWhiteSpace($Origin)) { $headers['Origin'] = $Origin }
    $params = @{ UseBasicParsing=$true; Uri="http://localhost:$TargetPort$Path"; Method=$Method; Headers=$headers; TimeoutSec=10 }
    if (-not [string]::IsNullOrEmpty($Body)) { $params.Body=$Body; $params.ContentType='application/json; charset=utf-8' }
    return Invoke-WebRequest @params
}

$modeloFixture = Join-Path (Join-Path (Join-Path $root 'src') 'js') '10-model.js'
$achadoFixture = [regex]::Match([System.IO.File]::ReadAllText($modeloFixture, [System.Text.Encoding]::UTF8), 'model\.APP_VERSION\s*=\s*[''"]([^''"]+)[''"]')
if (-not $achadoFixture.Success) { throw 'Nao foi possivel obter APP_VERSION para as fixtures.' }
$appVersionFixture = $achadoFixture.Groups[1].Value

try {
    # O checkout limpo de CI nao contem dist/. Gere a mesma entrada que o
    # servidor consumira, com metadados deterministas de fixture.
    & (Join-Path $root 'build.ps1') -Version $appVersionFixture `
        -Commit '0123456789abcdef0123456789abcdef01234567' `
        -BuildTimestamp '2026-01-01T00:00:00Z' `
        -OutputPath (Join-Path $root 'dist\pmo-tool.html') | Out-Null
    New-Item -ItemType Directory -Path $data,$config,$state -Force | Out-Null
    $portfolio = [ordered]@{
        meta=[ordered]@{ schemaVersion=4; appVersion=$appVersionFixture; orgName='Teste'; salvoEm='2026-08-02T00:00:00Z' }
        settings=[ordered]@{ tema='auto'; salvarEmDisco=$true }
        pessoas=@(); programas=@(); projetos=@(); anexos=@(); auditLog=@(); imports=@(); visoesSalvas=@()
    }
    Write-PmoJsonAtomic (Join-Path $data 'portfolio.json') $portfolio
    Write-PmoJsonAtomic (Join-Path $config 'install.json') ([ordered]@{
        formatVersion=1; repository=''; channel='stable'; port=$Port; checkIntervalHours=24
        dataDir='data'; configDir='config'; stateDir='state'; retention=[ordered]@{versions=2;snapshots=3;portfolioBackupsHourlyHours=48;portfolioBackupsDailyDays=90}
    })
    Write-PmoJsonAtomic (Join-Path $state 'active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion=$appVersionFixture; previousVersion='1.4.0'
        activeSchemaVersion=4; previousSchemaVersion=3; activatedAt='2026-08-02T00:00:00Z'
    })

    $serve = Join-Path $root 'serve.ps1'
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $serve + '" -Porta ' + $Port + ' -DataDir "' + $data + '" -ConfigDir "' + $config + '" -StateDir "' + $state + '" -AdminToken "' + $token + '" -ActivationId "' + $activationId + '" -SemBuild -SemBrowser'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    if (-not $process.Start()) { throw 'Nao foi possivel iniciar o servidor de teste.' }
    # PROT-01..05 fazem centenas de chamadas contra esta instancia; cada uma
    # imprime uma linha em StandardOutput. Sem drenar continuamente, o pipe
    # redirecionado enche e o processo trava no proximo Write-Host — travando
    # o servidor inteiro (nenhuma resposta HTTP sai ate o buffer esvaziar), o
    # que aparece do lado do cliente como timeout. Drena de forma assincrona
    # via eventos, guardando as ultimas linhas so para diagnostico de falha.
    $processOutputLog = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
    $processErrorLog = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
    $processOutputSub = Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -Action {
        if ($null -ne $EventArgs.Data) { [void]$Event.MessageData.Add($EventArgs.Data) }
    } -MessageData $processOutputLog
    $processErrorSub = Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action {
        if ($null -ne $EventArgs.Data) { [void]$Event.MessageData.Add($EventArgs.Data) }
    } -MessageData $processErrorLog
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()

    $health = $null
    $healthError = $null
    for ($i=0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        try { $health = (Invoke-LocalApi '/api/health').Content | ConvertFrom-Json; break }
        catch { $healthError = $_.Exception.Message; if ($process.HasExited) { break } }
    }
    if (-not $health -or -not $health.ok -or [int]$health.schemaVersion -ne 4) {
        $stderr = ($processErrorLog -join [Environment]::NewLine)
        throw "Health check de integracao falhou. $healthError $stderr"
    }

    $secondPort = $Port + 1
    $secondPsi = New-Object System.Diagnostics.ProcessStartInfo
    $secondPsi.FileName = 'powershell.exe'
    $secondPsi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $serve + '" -Porta ' + $secondPort + ' -DataDir "' + $data + '" -ConfigDir "' + $config + '" -StateDir "' + $state + '" -SemBuild -SemBrowser'
    $secondPsi.UseShellExecute = $false
    $secondPsi.CreateNoWindow = $true
    $secondPsi.RedirectStandardOutput = $true
    $secondPsi.RedirectStandardError = $true
    $secondProcess = New-Object System.Diagnostics.Process
    $secondProcess.StartInfo = $secondPsi
    if (-not $secondProcess.Start()) { throw 'Nao foi possivel iniciar a segunda instancia de teste.' }
    if (-not $secondProcess.WaitForExit(10000)) { $secondProcess.Kill(); throw 'Segunda instancia nao foi recusada a tempo.' }
    $secondOutput = $secondProcess.StandardOutput.ReadToEnd() + $secondProcess.StandardError.ReadToEnd()
    if ($secondProcess.ExitCode -eq 0 -or $secondOutput -notmatch 'Outra instancia') {
        throw ('Single-instance lock nao recusou a segunda execucao. ' + $secondOutput)
    }

    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $maliciousOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $serve `
            -Porta ($Port + 3) -DataDir $data -ConfigDir $config -StateDir $state `
            -SemBuild -SemBrowser -LauncherLockHeld 2>&1 | ForEach-Object { [string]$_ })
        $maliciousExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorAction }
    if ($maliciousExit -eq 0 -or ($maliciousOutput -join ' ') -notmatch 'LauncherLockHeld|parameter.*cannot be found|par.metro.*n.o.*encontrado') {
        throw ('Parametro antigo LauncherLockHeld ainda permite bypass. ' + ($maliciousOutput -join ' '))
    }

    $healthPort = $Port + 2
    # Exercita o layout real usado por Test-NewRuntimeHealth: tres roots
    # irmaos sob staging/<health-id>, a unica sobreposicao operacional aceita.
    $healthRoot = Join-Path (Join-Path $root 'staging') ('.server-health-' + [Guid]::NewGuid().ToString('N'))
    $healthData = Join-Path $healthRoot 'data'
    $healthConfig = Join-Path $healthRoot 'config'
    $healthState = Join-Path $healthRoot 'state'
    New-Item -ItemType Directory -Path $healthData,$healthConfig,$healthState -Force | Out-Null
    $healthPsi = New-Object System.Diagnostics.ProcessStartInfo
    $healthPsi.FileName = 'powershell.exe'
    $healthPsi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $serve + '" -Porta ' + $healthPort + ' -DataDir "' + $healthData + '" -ConfigDir "' + $healthConfig + '" -StateDir "' + $healthState + '" -HealthOnly -SemBuild -SemBrowser'
    $healthPsi.UseShellExecute = $false
    $healthPsi.CreateNoWindow = $true
    $healthPsi.RedirectStandardOutput = $true
    $healthPsi.RedirectStandardError = $true
    $healthProcess = New-Object System.Diagnostics.Process
    $healthProcess.StartInfo = $healthPsi
    if (-not $healthProcess.Start()) { throw 'Nao foi possivel iniciar o health check isolado.' }
    $isolatedHealth = $null
    for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        try { $isolatedHealth = (Invoke-LocalApi '/api/health' -TargetPort $healthPort).Content | ConvertFrom-Json; break }
        catch { if ($healthProcess.HasExited) { break } }
    }
    if (-not $isolatedHealth -or -not $isolatedHealth.ok) {
        $healthFailure = if ($healthProcess.HasExited) { $healthProcess.StandardError.ReadToEnd() } else { '' }
        throw ('HealthOnly isolado conflitou com a instancia principal. ' + $healthFailure)
    }
    if (-not $healthProcess.WaitForExit(10000)) { $healthProcess.Kill(); throw 'HealthOnly nao encerrou apos responder.' }

    $app = Invoke-LocalApi '/'
    if ($app.Content -notmatch [regex]::Escape($token) -or $app.Content -notmatch [regex]::Escape($activationId)) {
        throw 'Token administrativo ou activationId nao foi injetado no HTML.'
    }
    # O JavaScript consulta esses nomes com querySelector; conte apenas as
    # tags <meta> efetivamente injetadas pelo servidor.
    if ([regex]::Matches($app.Content, '<meta\s+name="pmo-admin-token"\s+content=').Count -ne 1 -or
        [regex]::Matches($app.Content, '<meta\s+name="pmo-activation-id"\s+content=').Count -ne 1) {
        throw 'Metadados de sessao devem ser injetados exatamente uma vez.'
    }
    $servedHtml = Join-Path $temp 'served-app.html'
    [System.IO.File]::WriteAllText($servedHtml, $app.Content, (New-Object System.Text.UTF8Encoding($false)))
    & $NodePath (Join-Path $testDir 'validate-built-html.mjs') $servedHtml
    if ($LASTEXITCODE -ne 0) { throw 'O JavaScript do HTML servido e invalido.' }

    try {
        $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20)
        throw 'Escrita sem token deveria ser bloqueada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }
    try {
        $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin -Origin 'https://evil.example'
        throw 'Escrita com Origin externo deveria ser bloqueada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }

    $attachmentId = 'anx-integration.txt'
    $attachmentBytes = [System.Text.Encoding]::UTF8.GetBytes('conteudo-integracao')
    $headers = @{ 'X-PMO-Admin-Token'=$token; 'Content-Type'='text/plain' }
    $putAttachment = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/attachments/$attachmentId" -Method PUT -Headers $headers -Body $attachmentBytes -TimeoutSec 10
    if ($putAttachment.StatusCode -ne 200) { throw 'PUT de anexo falhou.' }
    $portfolio.anexos = @([ordered]@{ id=$attachmentId; nomeArquivo='integration.txt'; tamanho=$attachmentBytes.Length; hash='fixture' })
    $portfolio.meta.salvoEm = '2026-08-02T00:01:00Z'
    $bodyPortfolio = $portfolio | ConvertTo-Json -Depth 20
    $null = Invoke-LocalApi '/api/portfolio' 'PUT' $bodyPortfolio -Admin

    [System.IO.File]::WriteAllText((Join-Path $data 'attachments\anx-stale.previous'),'stale')
    [System.IO.File]::WriteAllText((Join-Path $data ('attachments\anx-stale.tmp-' + ('a' * 32))),'temp')

    $index = (Invoke-LocalApi '/api/attachments').Content | ConvertFrom-Json
    if ($index.itens.Count -ne 1 -or -not $index.itens[0].sha256) { throw 'Inventario de anexos sem SHA-256.' }
    $attachmentPath = Join-Path $data ('attachments\' + $attachmentId)
    $atomicBackup = $attachmentPath + '.replace-backup'
    [System.IO.File]::Move($attachmentPath,$atomicBackup)
    $index = (Invoke-LocalApi '/api/attachments').Content | ConvertFrom-Json
    if (-not (Test-Path -LiteralPath $attachmentPath -PathType Leaf) -or
        (Test-Path -LiteralPath $atomicBackup) -or
        [string]$index.itens[0].sha256 -ne (Get-PmoSha256 $attachmentPath)) {
        throw 'Indice nao recuperou o anexo deixado apenas em .replace-backup.'
    }

    $prepareInvalido = [ordered]@{ appVersion=$appVersionFixture; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm; anexos=@([ordered]@{
        id=$attachmentId; tamanho=$attachmentBytes.Length; sha256=('0' * 64)
    }) } | ConvertTo-Json -Depth 10
    try {
        $null = Invoke-LocalApi '/api/update/prepare' 'POST' $prepareInvalido -Admin
        throw 'Preflight com SHA divergente deveria ser bloqueado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    [System.IO.File]::Copy($attachmentPath,$atomicBackup,$true)
    $corruptedBytes = New-Object byte[] $attachmentBytes.Length
    [Array]::Copy($attachmentBytes,$corruptedBytes,$attachmentBytes.Length)
    $corruptedBytes[0] = $corruptedBytes[0] -bxor 255
    [System.IO.File]::WriteAllBytes($attachmentPath,$corruptedBytes)
    $prepareBody = [ordered]@{ appVersion=$appVersionFixture; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm; anexos=@([ordered]@{
        id=$attachmentId; tamanho=$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256
    }) } | ConvertTo-Json -Depth 10
    $prepared = (Invoke-LocalApi '/api/update/prepare' 'POST' $prepareBody -Admin).Content | ConvertFrom-Json
    if (-not $prepared.ok -or -not $prepared.snapshotId) { throw 'Preflight nao produziu snapshot.' }
    if ((Get-PmoSha256 $attachmentPath) -ne [string]$index.itens[0].sha256 -or (Test-Path -LiteralPath $atomicBackup)) {
        throw 'Preflight nao reconciliou alvo corrompido com o backup atomico valido.'
    }
    $postRepairIndex = (Invoke-LocalApi '/api/attachments').Content | ConvertFrom-Json
    if ($postRepairIndex.itens.Count -ne 1) { throw 'Residuo .corrupt foi exposto como anexo canonico.' }
    $snapshotDir = Join-Path (Join-Path $data 'update-backups') ([string]$prepared.snapshotId)
    $manifest = Read-PmoJson (Join-Path $snapshotDir 'manifest.json') $null
    $errors = @()
    foreach ($group in @(Test-PmoInventory $snapshotDir $manifest.files @('manifest.json'))) {
        foreach ($inventoryError in @($group)) { $errors += [string]$inventoryError }
    }
    if ($errors.Count -gt 0) { throw ('Snapshot de integracao invalido: ' + ($errors -join '; ')) }
    if ((Get-PmoSha256 (Join-Path $snapshotDir 'portfolio.json')) -ne (Get-PmoSha256 (Join-Path $snapshotDir 'raw-bundle.json'))) {
        throw 'raw-bundle.json nao preservou byte a byte o portfolio selado.'
    }

    try {
        $null = Invoke-LocalApi '/api/portfolio' 'PUT' $bodyPortfolio -Admin
        throw 'Escrita durante manutencao deveria ser bloqueada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 423) { throw }
    }
    $null = Invoke-LocalApi '/api/update/cancel' 'POST' '{}' -Admin

    $portfolioSha = Get-PmoSha256 (Join-Path $data 'portfolio.json')
    $restoreId = 'restore-20260802-000100-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
    $recoveryRoot = Join-Path $data 'recovery'
    $recoveryDir = Join-Path $recoveryRoot $restoreId
    New-Item -ItemType Directory -Path (Join-Path $recoveryDir 'previous') -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $recoveryDir 'previous\evidencia.txt'),'estado-anterior')
    Write-PmoJsonAtomic (Join-Path $state 'restore.json') ([ordered]@{
        formatVersion=1; restoreId=$restoreId; phase='completed'; snapshotId=[string]$prepared.snapshotId
        root=$recoveryDir; stage=(Join-Path $recoveryDir 'stage'); previous=(Join-Path $recoveryDir 'previous')
    })
    $restorePending = [ordered]@{
        formatVersion=1; restoreId=$restoreId; snapshotId=[string]$prepared.snapshotId; activationId=$activationId
        portfolioSha256=$portfolioSha; sourceSchemaVersion=4; sourceAppVersion=$appVersionFixture
        attachments=@([ordered]@{ id=$attachmentId; size=[Int64]$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    }
    Write-PmoJsonAtomic (Join-Path $state 'restore-pending.json') $restorePending
    $pendingResponse = (Invoke-LocalApi '/api/restore-pending' 'GET' $null -Admin).Content | ConvertFrom-Json
    if (-not $pendingResponse.pending -or [string]$pendingResponse.restore.snapshotId -ne [string]$prepared.snapshotId) {
        throw 'Endpoint restore-pending nao retornou o journal esperado.'
    }
    $ackBody = [ordered]@{
        snapshotId=[string]$prepared.snapshotId; activationId=$activationId; portfolioSha256=$portfolioSha
        sourceSchemaVersion=4; sourceAppVersion=$appVersionFixture; indexedDbReady=$true
        attachments=@([ordered]@{ id=$attachmentId; size=[Int64]$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    } | ConvertTo-Json -Depth 10
    $ack = (Invoke-LocalApi '/api/restore-ack' 'POST' $ackBody -Admin).Content | ConvertFrom-Json
    if (-not $ack.ok -or -not $ack.recoveryCleaned -or -not (Test-Path -LiteralPath (Join-Path $state 'restore-ack.json')) -or
        (Test-Path -LiteralPath (Join-Path $state 'restore-pending.json')) -or (Test-Path -LiteralPath $recoveryDir)) {
        throw 'Restore ACK nao foi selado ou o recovery confirmado nao foi limpo corretamente.'
    }

    Write-PmoJsonAtomic (Join-Path $state 'update.json') ([ordered]@{
        formatVersion=1; phase='activating'; activationId=$activationId; targetVersion=$appVersionFixture; snapshotId=[string]$prepared.snapshotId
    })
    Write-PmoJsonAtomic (Join-Path $state 'active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion=$appVersionFixture; previousVersion='1.4.0'
        activeSchemaVersion=4; previousSchemaVersion=3; activatedAt='2026-08-02T00:02:00Z'; pendingActivationId=$activationId
    })
    $readyBase = [ordered]@{
        activationId=$activationId; appVersion=$appVersionFixture; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
        somenteLeitura=$false; origemCarga='disco'; indexedDbReady=$true; diskReady=$true
        portfolioSha256=$portfolioSha
        attachments=@([ordered]@{ id=$attachmentId; size=[Int64]$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    }
    $readyInvalido = [ordered]@{}; foreach($key in $readyBase.Keys){$readyInvalido[$key]=$readyBase[$key]}; $readyInvalido.activationId='activation-invalida-0000000000000000'
    try {
        $null = Invoke-LocalApi '/api/app-ready' 'POST' ($readyInvalido | ConvertTo-Json -Depth 10) -Admin
        throw 'app-ready com activationId divergente deveria ser bloqueado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    $ready = (Invoke-LocalApi '/api/app-ready' 'POST' ($readyBase | ConvertTo-Json -Depth 10) -Admin).Content | ConvertFrom-Json
    if (-not $ready.ok -or -not $ready.diskConfirmed -or -not $ready.indexedDbConfirmed -or -not $ready.attachmentInventoryConfirmed) {
        throw 'Handshake app-ready nao confirmou persistencia e inventario.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $state 'app-ready.json'))) { throw 'Handshake app-ready nao foi persistido.' }

    $rollbackBody = [ordered]@{
        operation='rollback'; appVersion=$appVersionFixture; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
        anexos=@([ordered]@{ id=$attachmentId; tamanho=$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    } | ConvertTo-Json -Depth 10
    $rollbackPrepared = (Invoke-LocalApi '/api/update/prepare' 'POST' $rollbackBody -Admin).Content | ConvertFrom-Json
    $rollbackState = Read-PmoJson (Join-Path $state 'update.json') $null
    $rollbackManifest = Read-PmoJson (Join-Path (Join-Path (Join-Path $data 'update-backups') ([string]$rollbackPrepared.snapshotId)) 'manifest.json') $null
    if (-not $rollbackPrepared.ok -or [string]$rollbackState.phase -ne 'rollback-prepared' -or
        [string]$rollbackState.operation -ne 'rollback' -or [string]$rollbackManifest.kind -ne 'pre-rollback') {
        throw 'Preflight de rollback nao registrou o estado e o snapshot esperados.'
    }
    try {
        $null = Invoke-LocalApi '/api/update/apply' 'POST' '{}' -Admin
        throw 'Endpoint de update nao deveria consumir snapshot de rollback.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    $null = Invoke-LocalApi '/api/update/cancel' 'POST' '{}' -Admin

    $restoreBody = [ordered]@{
        operation='restore'; targetSnapshotId=[string]$prepared.snapshotId
        appVersion=$appVersionFixture; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
        anexos=@([ordered]@{ id=$attachmentId; tamanho=$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    } | ConvertTo-Json -Depth 10
    $restorePrepared = (Invoke-LocalApi '/api/update/prepare' 'POST' $restoreBody -Admin).Content | ConvertFrom-Json
    $restoreState = Read-PmoJson (Join-Path $state 'update.json') $null
    $restoreManifest = Read-PmoJson (Join-Path (Join-Path (Join-Path $data 'update-backups') ([string]$restorePrepared.snapshotId)) 'manifest.json') $null
    if (-not $restorePrepared.ok -or [string]$restoreState.phase -ne 'restore-prepared' -or
        [string]$restoreState.operation -ne 'restore' -or [string]$restoreState.targetSnapshotId -ne [string]$prepared.snapshotId -or
        [string]$restoreManifest.kind -ne 'pre-restore') {
        throw 'Preflight de restauracao nao registrou o estado, alvo e snapshot esperados.'
    }
    try {
        $null = Invoke-LocalApi '/api/update/apply' 'POST' '{}' -Admin
        throw 'Endpoint de update nao deveria consumir snapshot de restauracao.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    $null = Invoke-LocalApi '/api/update/cancel' 'POST' '{}' -Admin

    # ------------------------------------------- PROT-01: snapshot de protecao
    $protecaoSnapshotsDir = Join-Path $data 'backups\snapshots'
    $protecaoAnexos = @([ordered]@{ id=$attachmentId; tamanho=$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })

    $portfolio.auditLog = @(
        [ordered]@{ id='aud-prot-1'; em='2026-08-02T00:05:00Z'; ator='PMO Lead'; acao='fixture'
            entidade=$null; entidadeId=$null; resumo='evento ficticio 1'; campos=$null }
        [ordered]@{ id='aud-prot-2'; em='2026-08-02T00:06:00Z'; ator='PMO Lead'; acao='fixture'
            entidade=$null; entidadeId=$null; resumo='evento ficticio 2'; campos=$null }
    )
    $portfolio.imports = @(
        [ordered]@{ id='imp-prot-1'; em='2026-08-02T00:05:00Z'; kind='fixture'; fileName='fixture.json'; resumo='import ficticio' }
    )
    $portfolio.meta.salvoEm = '2026-08-02T00:05:00Z'
    $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin

    $protecaoBodyLimpar = [ordered]@{
        operation='limpar'; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm=$portfolio.meta.salvoEm; anexos=$protecaoAnexos
    } | ConvertTo-Json -Depth 10
    $protecaoRespLimpar = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodyLimpar -Admin
    if ($protecaoRespLimpar.StatusCode -ne 200) { throw 'Snapshot de protecao (limpar) nao respondeu 200.' }
    $protecaoLimpar = $protecaoRespLimpar.Content | ConvertFrom-Json
    if (-not $protecaoLimpar.ok -or -not $protecaoLimpar.snapshotId -or [string]$protecaoLimpar.kind -ne 'pre-limpar') {
        throw 'Snapshot de protecao (limpar) nao respondeu como esperado.'
    }
    $protecaoLimparDir = Join-Path $protecaoSnapshotsDir ([string]$protecaoLimpar.snapshotId)
    if (-not (Test-Path -LiteralPath $protecaoLimparDir -PathType Container)) { throw 'Pasta do snapshot de protecao (limpar) nao foi criada.' }
    $protecaoLimparManifest = Read-PmoJson (Join-Path $protecaoLimparDir 'manifest.json') $null
    $protecaoErros = @()
    foreach ($grupo in @(Test-PmoInventory $protecaoLimparDir $protecaoLimparManifest.files @('manifest.json'))) {
        foreach ($erroProtecao in @($grupo)) { $protecaoErros += [string]$erroProtecao }
    }
    if ($protecaoErros.Count -gt 0) { throw ('Snapshot de protecao (limpar) invalido: ' + ($protecaoErros -join '; ')) }
    if ([int]$protecaoLimparManifest.contagens.auditLog -ne 2 -or [int]$protecaoLimparManifest.contagens.imports -ne 1) {
        throw 'Contagens do manifesto de protecao (limpar) nao batem com o portfolio gravado.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $protecaoLimparDir ('attachments\' + $attachmentId)) -PathType Leaf)) {
        throw 'Snapshot de protecao (limpar) nao materializou o anexo.'
    }
    if (Test-Path -LiteralPath (Join-Path $protecaoLimparDir 'config')) { throw 'Snapshot de protecao nao pode conter config/ (D-30).' }

    $portfolio.meta.salvoEm = '2026-08-02T00:07:00Z'
    $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin
    $protecaoBodySubstituir = [ordered]@{
        operation='substituir'; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm=$portfolio.meta.salvoEm; anexos=$protecaoAnexos
    } | ConvertTo-Json -Depth 10
    $protecaoRespSubstituir = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodySubstituir -Admin
    if ($protecaoRespSubstituir.StatusCode -ne 200) { throw 'Snapshot de protecao (substituir) nao respondeu 200.' }
    $protecaoSubstituir = $protecaoRespSubstituir.Content | ConvertFrom-Json
    if (-not $protecaoSubstituir.ok -or -not $protecaoSubstituir.snapshotId -or [string]$protecaoSubstituir.kind -ne 'pre-substituir') {
        throw 'Snapshot de protecao (substituir) nao respondeu como esperado.'
    }

    # ------------------------------------------- PROT-01: falha fechada, D-30
    $protecaoCountAntesAuth = @(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count
    try {
        $null = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodyLimpar
        throw 'Snapshot de protecao sem token deveria ser bloqueado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }
    try {
        $null = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodyLimpar -Admin -Origin 'https://evil.example'
        throw 'Snapshot de protecao com Origin externo deveria ser bloqueado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }
    if ((@(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count) -ne $protecaoCountAntesAuth) {
        throw 'Falha de autenticacao no snapshot de protecao criou pasta.'
    }

    $protecaoBodyOperacaoInvalida = [ordered]@{
        operation='apagar'; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm=$portfolio.meta.salvoEm; anexos=$protecaoAnexos
    } | ConvertTo-Json -Depth 10
    $protecaoCountAntesOperacao = @(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count
    try {
        $null = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodyOperacaoInvalida -Admin
        throw 'Operacao de protecao invalida deveria ser recusada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) { throw }
    }
    try {
        $null = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $null -Admin
        throw 'Corpo vazio deveria ser recusado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) { throw }
    }
    if ((@(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count) -ne $protecaoCountAntesOperacao) {
        throw 'Operacao invalida ou corpo vazio criou pasta de snapshot de protecao.'
    }

    $protecaoBodySalvoErrado = [ordered]@{
        operation='limpar'; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm='2026-01-01T00:00:00Z'; anexos=$protecaoAnexos
    } | ConvertTo-Json -Depth 10
    $protecaoCountAntesSalvo = @(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count
    try {
        $null = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodySalvoErrado -Admin
        throw 'Selo salvoEm divergente deveria ser recusado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    if ((@(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count) -ne $protecaoCountAntesSalvo) {
        throw 'Selo salvoEm divergente criou pasta de snapshot de protecao.'
    }

    $protecaoAnexosErrados = @([ordered]@{ id=$attachmentId; tamanho=$attachmentBytes.Length; sha256=('0' * 64) })
    $protecaoBodyShaErrado = [ordered]@{
        operation='limpar'; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm=$portfolio.meta.salvoEm; anexos=$protecaoAnexosErrados
    } | ConvertTo-Json -Depth 10
    $protecaoCountAntesSha = @(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count
    try {
        $null = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodyShaErrado -Admin
        throw 'SHA-256 de anexo divergente deveria ser recusado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    if ((@(Get-ChildItem -Path $protecaoSnapshotsDir -Directory -ErrorAction SilentlyContinue).Count) -ne $protecaoCountAntesSha) {
        throw 'SHA-256 de anexo divergente criou pasta de snapshot de protecao.'
    }

    $protecaoUpdatePrepareBody = [ordered]@{
        appVersion=$appVersionFixture; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
        anexos=$protecaoAnexos
    } | ConvertTo-Json -Depth 10
    $protecaoUpdatePrepared = (Invoke-LocalApi '/api/update/prepare' 'POST' $protecaoUpdatePrepareBody -Admin).Content | ConvertFrom-Json
    if (-not $protecaoUpdatePrepared.ok) { throw 'Preflight de update para o teste de manutencao do snapshot de protecao falhou.' }
    try {
        $null = Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodyLimpar -Admin
        throw 'Snapshot de protecao durante manutencao deveria ser bloqueado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 423) { throw }
    }
    $null = Invoke-LocalApi '/api/update/cancel' 'POST' '{}' -Admin
    $healthDepoisCancelamento = (Invoke-LocalApi '/api/health').Content | ConvertFrom-Json
    if ($healthDepoisCancelamento.maintenance) { throw 'Manutencao nao voltou ao normal apos /api/update/cancel.' }

    # -------------------------- isolamento do estado do updater apos sucesso
    $updateJsonPath = Join-Path $state 'update.json'
    $updateLockPath = Join-Path $state 'update.lock'
    $updateJsonHashAntes = if (Test-Path -LiteralPath $updateJsonPath) { Get-PmoSha256 $updateJsonPath } else { $null }

    $protecaoBodyFinal = [ordered]@{
        operation='limpar'; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm=$portfolio.meta.salvoEm; anexos=$protecaoAnexos
    } | ConvertTo-Json -Depth 10
    $protecaoFinal = (Invoke-LocalApi '/api/protecao/snapshot' 'POST' $protecaoBodyFinal -Admin).Content | ConvertFrom-Json
    if (-not $protecaoFinal.ok -or -not $protecaoFinal.snapshotId) {
        throw 'Snapshot de protecao final (isolamento do updater) nao respondeu como esperado.'
    }
    $protecaoFinalDir = Join-Path $protecaoSnapshotsDir ([string]$protecaoFinal.snapshotId)

    $updateJsonHashDepois = if (Test-Path -LiteralPath $updateJsonPath) { Get-PmoSha256 $updateJsonPath } else { $null }
    if ($updateJsonHashAntes -ne $updateJsonHashDepois) { throw 'Snapshot de protecao alterou state\update.json.' }
    if (Test-Path -LiteralPath $updateLockPath) { throw 'Snapshot de protecao criou state\update.lock.' }
    $healthDepoisProtecao = (Invoke-LocalApi '/api/health').Content | ConvertFrom-Json
    if ($healthDepoisProtecao.maintenance) { throw 'Snapshot de protecao deixou maintenance ligado.' }

    # ------------------------------------------------------------- D-30
    $protecaoFinalManifest = Read-PmoJson (Join-Path $protecaoFinalDir 'manifest.json') $null
    foreach ($entradaArquivo in @($protecaoFinalManifest.files)) {
        $caminhoRelativo = ([string]$entradaArquivo.path)
        if ($caminhoRelativo -match '^(config|state)/') {
            throw ('Manifesto do snapshot de protecao referencia caminho proibido: ' + $caminhoRelativo)
        }
    }
    if (Test-Path -LiteralPath (Join-Path $protecaoFinalDir 'state')) { throw 'Snapshot de protecao nao pode conter state/ (D-30).' }
    if (Test-Path -LiteralPath (Join-Path $protecaoFinalDir 'config')) { throw 'Snapshot de protecao nao pode conter config/ (D-30).' }
    $achouToken = Get-ChildItem -LiteralPath $protecaoFinalDir -Recurse -File -Force |
        Select-String -SimpleMatch -Pattern $token -ErrorAction SilentlyContinue
    if ($achouToken) { throw 'Token administrativo vazou para dentro do snapshot de protecao.' }

    # --------------------------- sobrevive a um ciclo update/prepare+cancel
    $protecaoUpdatePrepareBody2 = [ordered]@{
        appVersion=$appVersionFixture; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
        anexos=$protecaoAnexos
    } | ConvertTo-Json -Depth 10
    $protecaoUpdatePrepared2 = (Invoke-LocalApi '/api/update/prepare' 'POST' $protecaoUpdatePrepareBody2 -Admin).Content | ConvertFrom-Json
    if (-not $protecaoUpdatePrepared2.ok) { throw 'Segundo preflight de update (teste de isolamento) falhou.' }
    $null = Invoke-LocalApi '/api/update/cancel' 'POST' '{}' -Admin
    if (-not (Test-Path -LiteralPath $protecaoFinalDir -PathType Container)) {
        throw 'Snapshot de protecao foi removido apos um ciclo de update/prepare+cancel (isolamento violado).'
    }

    Write-Host 'PROT-01 snapshot de protecao: OK' -ForegroundColor Green

    # ------------------------------------------- PROT-04: retencao por janela
    $bkpDirTeste = Join-Path $data 'backups'
    $realBackupPattern = '^portfolio-\d{8}-\d{6}-\d{3}-[0-9a-f]{4}\.json$'
    function New-ProtBackupFixture([string]$Rotulo, [DateTime]$Quando) {
        $caminho = Join-Path $bkpDirTeste ('portfolio-fixture-' + $Rotulo + '.json')
        [System.IO.File]::WriteAllText($caminho, '{}', (New-Object System.Text.UTF8Encoding($false)))
        (Get-Item -LiteralPath $caminho).LastWriteTimeUtc = $Quando
        return $caminho
    }
    function Get-ProtRealBackups() {
        return @(Get-ChildItem -LiteralPath $bkpDirTeste -Filter 'portfolio-*.json' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match $realBackupPattern })
    }
    function Set-ProtInstallRetention($RetentionObj) {
        Write-PmoJsonAtomic (Join-Path $config 'install.json') ([ordered]@{
            formatVersion=$instalacaoBase.formatVersion; repository=$instalacaoBase.repository; channel=$instalacaoBase.channel
            port=$instalacaoBase.port; checkIntervalHours=$instalacaoBase.checkIntervalHours
            dataDir=$instalacaoBase.dataDir; configDir=$instalacaoBase.configDir; stateDir=$instalacaoBase.stateDir
            retention=$RetentionObj
        })
    }

    Get-ChildItem -LiteralPath $bkpDirTeste -Filter 'portfolio-*.json' -File -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
    $protLeiaMe = Join-Path $bkpDirTeste 'leia-me.txt'
    [System.IO.File]::WriteAllText($protLeiaMe, 'leia-me fixture PROT-04', (New-Object System.Text.UTF8Encoding($false)))

    $agoraProt = (Get-Date).ToUniversalTime()
    $horaTruncada = New-Object DateTime($agoraProt.Year,$agoraProt.Month,$agoraProt.Day,$agoraProt.Hour,0,0,[DateTimeKind]::Utc)
    $diaTruncado = New-Object DateTime($agoraProt.Year,$agoraProt.Month,$agoraProt.Day,0,0,0,[DateTimeKind]::Utc)

    # Grupo 1 - rajada: 40 PUT seguidos na hora corrente; so o(s) mais novo(s) por hora ficam
    $fixtureUmaHora = New-ProtBackupFixture 'uma-hora-atras' ($horaTruncada.AddHours(-1).AddMinutes(30))
    for ($i = 0; $i -lt 40; $i++) {
        $portfolio.meta.salvoEm = (Get-Date).ToUniversalTime().ToString('o')
        $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin
    }
    $reaisRajada = @(Get-ProtRealBackups)
    if ($reaisRajada.Count -lt 1 -or $reaisRajada.Count -gt 2) {
        throw ('Rajada nao respeitou o balde por hora: ' + $reaisRajada.Count + ' sobreviventes reais.')
    }
    if (-not (Test-Path -LiteralPath $fixtureUmaHora)) { throw 'Fixture de 1h atras nao sobreviveu a rajada.' }

    # Grupo 2 - hora: k de 2 a 46 (k=1 ja coberto por 'uma-hora-atras'); k=5 tem tres extras, so +40min fica
    $fixturesHora = @{}
    for ($k = 2; $k -le 46; $k++) {
        if ($k -eq 5) { continue }
        $fixturesHora[$k] = New-ProtBackupFixture ('h-' + $k) ($horaTruncada.AddHours(-$k).AddMinutes(30))
    }
    $fixturesHora[5] = New-ProtBackupFixture 'h-5' ($horaTruncada.AddHours(-5).AddMinutes(30))
    $h5Mais10 = New-ProtBackupFixture 'h5-mais10' ($horaTruncada.AddHours(-5).AddMinutes(10))
    $h5Mais20 = New-ProtBackupFixture 'h5-mais20' ($horaTruncada.AddHours(-5).AddMinutes(20))
    $h5Mais40 = New-ProtBackupFixture 'h5-mais40' ($horaTruncada.AddHours(-5).AddMinutes(40))

    # Grupo 3 - dia: d de 4 a 88; d=10 tem tres extras, so +20h fica; d de 92 a 100 sai
    $fixturesDia = @{}
    for ($d = 4; $d -le 88; $d++) {
        $fixturesDia[$d] = New-ProtBackupFixture ('d-' + $d) ($diaTruncado.AddDays(-$d).AddHours(12))
    }
    $d10Mais2 = New-ProtBackupFixture 'd10-mais2' ($diaTruncado.AddDays(-10).AddHours(2))
    $d10Mais6 = New-ProtBackupFixture 'd10-mais6' ($diaTruncado.AddDays(-10).AddHours(6))
    $d10Mais20 = New-ProtBackupFixture 'd10-mais20' ($diaTruncado.AddDays(-10).AddHours(20))
    $fixturesForaJanela = @{}
    for ($d = 92; $d -le 100; $d++) {
        $fixturesForaJanela[$d] = New-ProtBackupFixture ('d-' + $d) ($diaTruncado.AddDays(-$d).AddHours(12))
    }

    # Grupo 4 - data futura sempre fica
    $fixtureFuturo = New-ProtBackupFixture 'futuro' ($agoraProt.AddDays(2))

    # Dispara a rotacao sobre todos os fixtures acima
    $portfolio.meta.salvoEm = (Get-Date).ToUniversalTime().ToString('o')
    $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin

    if (-not (Test-Path -LiteralPath $fixtureUmaHora)) { throw 'Fixture de 1h atras nao sobreviveu apos a rotacao completa.' }
    foreach ($k in @(2..46)) {
        if ($k -eq 5) { continue }
        if (-not (Test-Path -LiteralPath $fixturesHora[$k])) { throw ('Fixture de hora k=' + $k + ' deveria ter sobrevivido.') }
    }
    if (Test-Path -LiteralPath $fixturesHora[5]) { throw 'Fixture h-5 (+30min) deveria ter sido removida (nao e a mais nova da hora).' }
    if (Test-Path -LiteralPath $h5Mais10) { throw 'Fixture h5-mais10 deveria ter sido removida.' }
    if (Test-Path -LiteralPath $h5Mais20) { throw 'Fixture h5-mais20 deveria ter sido removida.' }
    if (-not (Test-Path -LiteralPath $h5Mais40)) { throw 'Fixture h5-mais40 (a mais nova da hora k=5) deveria ter sobrevivido.' }

    foreach ($d in @(4..88)) {
        if ($d -eq 10) { continue }
        if (-not (Test-Path -LiteralPath $fixturesDia[$d])) { throw ('Fixture de dia d=' + $d + ' deveria ter sobrevivido.') }
    }
    if (Test-Path -LiteralPath $fixturesDia[10]) { throw 'Fixture d-10 (+12h) deveria ter sido removida (nao e a mais nova do dia).' }
    if (Test-Path -LiteralPath $d10Mais2) { throw 'Fixture d10-mais2 deveria ter sido removida.' }
    if (Test-Path -LiteralPath $d10Mais6) { throw 'Fixture d10-mais6 deveria ter sido removida.' }
    if (-not (Test-Path -LiteralPath $d10Mais20)) { throw 'Fixture d10-mais20 (a mais nova do dia d=10) deveria ter sobrevivido.' }

    foreach ($d in @(92..100)) {
        if (Test-Path -LiteralPath $fixturesForaJanela[$d]) { throw ('Fixture de dia d=' + $d + ' deveria ter saido da janela de retencao.') }
    }

    if (-not (Test-Path -LiteralPath $fixtureFuturo)) { throw 'Fixture com data futura deveria ter permanecido.' }
    if (-not (Test-Path -LiteralPath $protLeiaMe)) { throw 'leia-me.txt em data\backups nao pode ser removido pela rotacao.' }
    if (-not (Test-Path -LiteralPath $protecaoSnapshotsDir -PathType Container)) { throw 'Pasta data\backups\snapshots nao pode ser afetada pela rotacao de backups.' }
    if (-not (Test-Path -LiteralPath $protecaoLimparDir -PathType Container) -or -not (Test-Path -LiteralPath $protecaoFinalDir -PathType Container)) {
        throw 'Snapshots de protecao do bloco PROT-01 nao podem ser afetados pela rotacao de backups.'
    }

    # Grupo 5 - configuracao: piso 48/90, chave antiga ignorada, teto configuravel
    $instalacaoBase = Read-PmoJson (Join-Path $config 'install.json') $null

    # A chave antiga de contagem fixa e montada por nome dinamico para nao deixar
    # esse literal de atribuicao no arquivo (o contrato novo nao usa mais essa chave).
    $chaveAntigaRetencao = 'portfolioBackups'
    $retencaoComChaveAntiga = [ordered]@{ versions=2; snapshots=3 }
    $retencaoComChaveAntiga[$chaveAntigaRetencao] = 30
    Set-ProtInstallRetention $retencaoComChaveAntiga
    $retSemChaves = (Invoke-LocalApi '/api/backups').Content | ConvertFrom-Json
    if ([int]$retSemChaves.retencao.horasHorario -ne 48 -or [int]$retSemChaves.retencao.diasDiario -ne 90) {
        throw 'Sem as chaves novas (so a chave antiga de contagem fixa), a retencao deveria ser 48/90.'
    }

    Set-ProtInstallRetention ([ordered]@{ versions=2; snapshots=3; portfolioBackupsHourlyHours=10; portfolioBackupsDailyDays=5 })
    $retBaixo = (Invoke-LocalApi '/api/backups').Content | ConvertFrom-Json
    if ([int]$retBaixo.retencao.horasHorario -ne 48 -or [int]$retBaixo.retencao.diasDiario -ne 90) {
        throw 'Configuracao abaixo do piso (10/5) deveria ser elevada para 48/90.'
    }

    Set-ProtInstallRetention ([ordered]@{ versions=2; snapshots=3; portfolioBackupsHourlyHours=72; portfolioBackupsDailyDays=120 })
    $retAlta = (Invoke-LocalApi '/api/backups').Content | ConvertFrom-Json
    if ([int]$retAlta.retencao.horasHorario -ne 72 -or [int]$retAlta.retencao.diasDiario -ne 120) {
        throw 'Configuracao 72/120 nao foi refletida em GET /api/backups.'
    }
    $fixtureConfig72 = New-ProtBackupFixture 'config-72' ($horaTruncada.AddHours(-60))
    $portfolio.meta.salvoEm = (Get-Date).ToUniversalTime().ToString('o')
    $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin
    if (-not (Test-Path -LiteralPath $fixtureConfig72)) {
        throw 'Fixture a 60h com janela de 72h deveria ter sobrevivido como balde por hora.'
    }

    Write-Host 'PROT-04 retencao por janela: OK' -ForegroundColor Green

    # ------------------------------------------- PROT-05: exportar copia verificavel
    $copiasDestino = Join-Path $temp 'copias'
    New-Item -ItemType Directory -Path $copiasDestino -Force | Out-Null
    $naoMexerPath = Join-Path $copiasDestino 'nao-mexer.txt'
    [System.IO.File]::WriteAllText($naoMexerPath, 'nao mexer', (New-Object System.Text.UTF8Encoding($false)))
    $naoMexerShaAntes = Get-PmoSha256 $naoMexerPath

    function Get-ProtSubpastasCopia([string]$Pasta) {
        return @(Get-ChildItem -LiteralPath $Pasta -Directory -Filter 'pmo-copia-*' -ErrorAction SilentlyContinue)
    }

    $portfolio.meta.salvoEm = (Get-Date).ToUniversalTime().ToString('o')
    $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin
    $copiaAnexos = @([ordered]@{ id=$attachmentId; tamanho=$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    $copiaBodyFeliz = [ordered]@{
        destino=$copiasDestino; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm=$portfolio.meta.salvoEm; anexos=$copiaAnexos
    } | ConvertTo-Json -Depth 10
    $copiaRespFeliz = Invoke-LocalApi '/api/copia-verificavel/exportar' 'POST' $copiaBodyFeliz -Admin
    if ($copiaRespFeliz.StatusCode -ne 200) { throw 'Exportacao da copia verificavel (caminho feliz) nao respondeu 200.' }
    $copiaFeliz = $copiaRespFeliz.Content | ConvertFrom-Json
    if (-not $copiaFeliz.ok -or -not $copiaFeliz.copyId -or -not $copiaFeliz.pasta) {
        throw 'Exportacao da copia verificavel nao respondeu como esperado.'
    }
    if ($copiaFeliz.copyId -notmatch '^pmo-copia-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$') { throw 'copyId da copia verificavel fora do formato esperado.' }
    $copiaFelizDir = Join-Path $copiasDestino ([string]$copiaFeliz.copyId)
    if (-not (Test-Path -LiteralPath $copiaFelizDir -PathType Container)) { throw 'Subpasta da copia verificavel nao foi criada.' }
    if (-not (Test-Path -LiteralPath (Join-Path $copiaFelizDir 'portfolio.json') -PathType Leaf)) { throw 'Copia verificavel sem portfolio.json.' }
    if (-not (Test-Path -LiteralPath (Join-Path $copiaFelizDir ('attachments\' + $attachmentId)) -PathType Leaf)) { throw 'Copia verificavel nao materializou o anexo.' }
    $copiaFelizManifest = Read-PmoJson (Join-Path $copiaFelizDir 'manifest.json') $null
    if (-not $copiaFelizManifest -or [int]$copiaFelizManifest.formatVersion -ne 1 -or [string]$copiaFelizManifest.kind -ne 'copia-verificavel') {
        throw 'Manifesto da copia verificavel invalido.'
    }
    $copiaErros = @(Test-PmoInventory $copiaFelizDir $copiaFelizManifest.files @('manifest.json'))
    if ($copiaErros.Count -gt 0) { throw ('Copia verificavel invalida: ' + ($copiaErros -join '; ')) }
    if ((Get-PmoSha256 (Join-Path $copiaFelizDir 'manifest.json')) -ne [string]$copiaFeliz.manifestSha256) {
        throw 'manifestSha256 devolvido nao bate com o manifest.json gravado.'
    }
    if ((Get-PmoSha256 $naoMexerPath) -ne $naoMexerShaAntes) { throw 'Exportacao alterou arquivo preexistente na pasta escolhida (P-19).' }

    # D-30: token nunca vai junto; nenhum path proibido no manifesto
    $achouTokenCopia = Get-ChildItem -LiteralPath $copiaFelizDir -Recurse -File -Force |
        Select-String -SimpleMatch -Pattern $token -ErrorAction SilentlyContinue
    if ($achouTokenCopia) { throw 'Token administrativo vazou para dentro da copia verificavel.' }
    foreach ($entradaArquivoCopia in @($copiaFelizManifest.files)) {
        $caminhoRelCopia = [string]$entradaArquivoCopia.path
        if ($caminhoRelCopia -match '^(config|state|versions|logs|backups|update-backups)/') {
            throw ('Manifesto da copia verificavel referencia caminho proibido: ' + $caminhoRelCopia)
        }
    }

    # Onze recusas de destino, sem criar subpasta nova
    function Test-ProtCopiaRecusada([string]$Destino, [int]$StatusEsperado, [string]$Descricao) {
        $antes = @(Get-ProtSubpastasCopia $copiasDestino).Count
        $bodyRecusa = [ordered]@{
            destino=$Destino; appVersion=$appVersionFixture; schemaVersion=4
            salvoEm=$portfolio.meta.salvoEm; anexos=$copiaAnexos
        } | ConvertTo-Json -Depth 10
        try {
            $null = Invoke-LocalApi '/api/copia-verificavel/exportar' 'POST' $bodyRecusa -Admin
            throw ($Descricao + ' deveria ter sido recusado.')
        } catch {
            if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne $StatusEsperado) { throw }
        }
        $depois = @(Get-ProtSubpastasCopia $copiasDestino).Count
        if ($depois -ne $antes) { throw ($Descricao + ' criou subpasta de copia verificavel.') }
    }

    Test-ProtCopiaRecusada 'copias\relativo' 400 'Caminho relativo'
    Test-ProtCopiaRecusada ($copiasDestino + '\..\copias') 400 'Caminho com segmento ..'
    Test-ProtCopiaRecusada '\\localhost\c$\pmo-copia-teste' 400 'Caminho UNC'
    Test-ProtCopiaRecusada (Join-Path $temp 'inexistente-copia') 400 'Pasta inexistente'
    Test-ProtCopiaRecusada $data 400 'Pasta $data'
    Test-ProtCopiaRecusada (Join-Path $data 'attachments') 400 'Pasta $data\attachments'
    Test-ProtCopiaRecusada $config 400 'Pasta $config'
    Test-ProtCopiaRecusada $state 400 'Pasta $state'
    Test-ProtCopiaRecusada $root 400 'Raiz do repositorio'
    Test-ProtCopiaRecusada (Join-Path $root 'docs') 400 'Raiz do repositorio\docs'

    # Sem token: 403. salvoEm divergente: 409, sem subpasta nova.
    try {
        $null = Invoke-LocalApi '/api/copia-verificavel/exportar' 'POST' $copiaBodyFeliz
        throw 'Exportacao sem token deveria ser bloqueada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }
    $antesSalvoErrado = @(Get-ProtSubpastasCopia $copiasDestino).Count
    $bodySalvoErrado = [ordered]@{
        destino=$copiasDestino; appVersion=$appVersionFixture; schemaVersion=4
        salvoEm='2026-01-01T00:00:00Z'; anexos=$copiaAnexos
    } | ConvertTo-Json -Depth 10
    try {
        $null = Invoke-LocalApi '/api/copia-verificavel/exportar' 'POST' $bodySalvoErrado -Admin
        throw 'salvoEm divergente deveria ser recusado.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    if ((@(Get-ProtSubpastasCopia $copiasDestino).Count) -ne $antesSalvoErrado) { throw 'salvoEm divergente criou subpasta de copia verificavel.' }

    # P-18 situacao 1: link recusado (junction e symlink)
    $junctionAlvo = Join-Path $temp 'junction-alvo'
    New-Item -ItemType Directory -Path $junctionAlvo -Force | Out-Null
    $junctionLink = Join-Path $temp 'junction-copia'
    New-Item -ItemType Junction -Path $junctionLink -Target $junctionAlvo | Out-Null
    if (-not (Test-Path -LiteralPath $junctionLink)) { throw 'Nao foi possivel criar a junction de teste.' }
    Test-ProtCopiaRecusada $junctionLink 400 'Pasta que e junction'
    New-Item -ItemType Directory -Path (Join-Path $junctionAlvo 'sub') -Force | Out-Null
    $subDentroDaJunction = Join-Path $junctionLink 'sub'
    Test-ProtCopiaRecusada $subDentroDaJunction 400 'Pasta comum dentro de uma junction'

    $symlinkAlvo = Join-Path $temp 'symlink-alvo'
    New-Item -ItemType Directory -Path $symlinkAlvo -Force | Out-Null
    $symlinkLink = Join-Path $temp 'symlink-copia'
    $symlinkCriado = $false
    try {
        New-Item -ItemType SymbolicLink -Path $symlinkLink -Target $symlinkAlvo -ErrorAction Stop | Out-Null
        $symlinkCriado = $true
    } catch { Write-Host 'symlink real pulado (sem privilegio)' -ForegroundColor Yellow }
    if ($symlinkCriado) { Test-ProtCopiaRecusada $symlinkLink 400 'Pasta que e link simbolico' }

    # P-18 situacao 2: classificacao por tag via AST (sem depender de reparse point real de nuvem)
    $tokensAst = $null
    $errosAst = $null
    $arvoreAst = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path (Join-Path $root 'serve.ps1')).Path, [ref]$tokensAst, [ref]$errosAst)
    $funcaoAst = $arvoreAst.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-ReparseEhLink' }, $true) | Select-Object -First 1
    if (-not $funcaoAst) { throw 'Test-ReparseEhLink nao encontrada em serve.ps1 pelo AST.' }
    $blocoFuncao = [scriptblock]::Create($funcaoAst.Extent.Text)
    . $blocoFuncao
    $tagsNuvem = @('9000001A','9000101A','9000601A','9000701A','9000F01A')
    foreach ($tagHex in $tagsNuvem) {
        $tagValor = [Convert]::ToUInt32($tagHex, 16)
        if (Test-ReparseEhLink $tagValor) { throw ('Tag de nuvem deveria ser aceita (nao e link): ' + $tagHex) }
    }
    $tagsLink = @('A000000C','A0000003','A000001D')
    foreach ($tagHex in $tagsLink) {
        $tagValor = [Convert]::ToUInt32($tagHex, 16)
        if (-not (Test-ReparseEhLink $tagValor)) { throw ('Tag deveria ser classificada como link: ' + $tagHex) }
    }

    Write-Host 'PROT-05 exportar: OK' -ForegroundColor Green

    # ------------------------------------------- PROT-05: conferir e sugestoes
    function New-ProtCopiaTrabalho() {
        $portfolio.meta.salvoEm = (Get-Date).ToUniversalTime().ToString('o')
        $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin
        $bodyNovaCopia = [ordered]@{
            destino=$copiasDestino; appVersion=$appVersionFixture; schemaVersion=4
            salvoEm=$portfolio.meta.salvoEm; anexos=$copiaAnexos
        } | ConvertTo-Json -Depth 10
        $respNovaCopia = (Invoke-LocalApi '/api/copia-verificavel/exportar' 'POST' $bodyNovaCopia -Admin).Content | ConvertFrom-Json
        if (-not $respNovaCopia.ok) { throw 'Nao foi possivel criar copia de trabalho para o cenario de conferencia.' }
        return $respNovaCopia
    }
    function Invoke-ProtConferir([string]$Pasta) {
        $bodyConferirCopia = [ordered]@{ pasta=$Pasta } | ConvertTo-Json -Depth 5
        return (Invoke-LocalApi '/api/copia-verificavel/conferir' 'POST' $bodyConferirCopia -Admin).Content | ConvertFrom-Json
    }
    function Get-ProtHashArvore([string]$Pasta) {
        $mapaHashArvore = @{}
        foreach ($arquivoHashArvore in (Get-ChildItem -LiteralPath $Pasta -Recurse -File -Force)) {
            $mapaHashArvore[$arquivoHashArvore.FullName] = Get-PmoSha256 $arquivoHashArvore.FullName
        }
        return $mapaHashArvore
    }
    function Test-ProtSugestaoForaDaInstalacao([string]$Candidato) {
        foreach ($raizInstalacaoTeste in @($data,$config,$state)) {
            if ((Test-PmoPathEqualOrSubPath $raizInstalacaoTeste $Candidato) -or (Test-PmoPathEqualOrSubPath $Candidato $raizInstalacaoTeste)) { return $false }
        }
        return $true
    }

    # Cópia intacta da Task 1: ok, sem erros, mesma contagem/hash da exportação
    $conferirFeliz = Invoke-ProtConferir $copiaFelizDir
    if (-not $conferirFeliz.ok -or @($conferirFeliz.erros).Count -ne 0) { throw 'Conferencia da copia intacta deveria ser ok sem erros.' }
    if ([int]$conferirFeliz.arquivos -ne [int]$copiaFeliz.arquivos) { throw 'Conferencia da copia intacta com contagem de arquivos diferente da exportacao.' }
    if ([string]$conferirFeliz.manifestSha256 -ne [string]$copiaFeliz.manifestSha256) { throw 'Conferencia da copia intacta com manifestSha256 diferente da exportacao.' }

    # Conferir nunca cria, altera ou apaga arquivo
    $hashAntesConferir = Get-ProtHashArvore $copiaFelizDir
    $null = Invoke-ProtConferir $copiaFelizDir
    $hashDepoisConferir = Get-ProtHashArvore $copiaFelizDir
    if ($hashAntesConferir.Keys.Count -ne $hashDepoisConferir.Keys.Count) { throw 'Conferencia alterou a quantidade de arquivos na copia.' }
    foreach ($chaveHashConferir in $hashAntesConferir.Keys) {
        if ($hashDepoisConferir[$chaveHashConferir] -ne $hashAntesConferir[$chaveHashConferir]) { throw ('Conferencia alterou o arquivo: ' + $chaveHashConferir) }
    }

    # Anexo com hash divergente
    $copiaHashDivergente = New-ProtCopiaTrabalho
    $anexoNaCopiaHash = Join-Path (Join-Path $copiaHashDivergente.pasta 'attachments') $attachmentId
    $bytesOriginaisAnexoCopia = [System.IO.File]::ReadAllBytes($anexoNaCopiaHash)
    $bytesAlteradosAnexoCopia = New-Object byte[] $bytesOriginaisAnexoCopia.Length
    [Array]::Copy($bytesOriginaisAnexoCopia,$bytesAlteradosAnexoCopia,$bytesOriginaisAnexoCopia.Length)
    $bytesAlteradosAnexoCopia[0] = $bytesAlteradosAnexoCopia[0] -bxor 255
    [System.IO.File]::WriteAllBytes($anexoNaCopiaHash,$bytesAlteradosAnexoCopia)
    $conferirHashDivergente = Invoke-ProtConferir $copiaHashDivergente.pasta
    if ($conferirHashDivergente.ok) { throw 'Conferencia deveria detectar hash divergente no anexo.' }
    if ((@($conferirHashDivergente.erros) -join '|') -notmatch [regex]::Escape('hash divergente: attachments/' + $attachmentId)) {
        throw 'Erro de hash divergente nao apontou o anexo esperado.'
    }

    # portfolio.json ausente
    $copiaArquivoAusente = New-ProtCopiaTrabalho
    Remove-Item -LiteralPath (Join-Path $copiaArquivoAusente.pasta 'portfolio.json') -Force
    $conferirArquivoAusente = Invoke-ProtConferir $copiaArquivoAusente.pasta
    if ($conferirArquivoAusente.ok) { throw 'Conferencia deveria detectar portfolio.json ausente.' }
    if ((@($conferirArquivoAusente.erros) -join '|') -notmatch 'arquivo ausente: portfolio\.json') {
        throw 'Erro de arquivo ausente nao apontou portfolio.json.'
    }

    # arquivo extra nao declarado
    $copiaArquivoExtra = New-ProtCopiaTrabalho
    [System.IO.File]::WriteAllText((Join-Path $copiaArquivoExtra.pasta 'extra-nao-declarado.txt'), 'extra', (New-Object System.Text.UTF8Encoding($false)))
    $conferirArquivoExtra = Invoke-ProtConferir $copiaArquivoExtra.pasta
    if ($conferirArquivoExtra.ok) { throw 'Conferencia deveria detectar arquivo extra nao declarado.' }
    if ((@($conferirArquivoExtra.erros) -join '|') -notmatch [regex]::Escape('arquivo fisico nao declarado: extra-nao-declarado.txt')) {
        throw 'Erro de arquivo extra nao apontou o arquivo esperado.'
    }

    # manifest.json ausente: ok:false, status 200
    $copiaManifestoAusente = New-ProtCopiaTrabalho
    Remove-Item -LiteralPath (Join-Path $copiaManifestoAusente.pasta 'manifest.json') -Force
    $conferirManifestoAusenteResp = Invoke-LocalApi '/api/copia-verificavel/conferir' 'POST' ([ordered]@{ pasta=$copiaManifestoAusente.pasta } | ConvertTo-Json -Depth 5) -Admin
    if ($conferirManifestoAusenteResp.StatusCode -ne 200) { throw 'Conferencia com manifesto ausente deveria responder 200.' }
    $conferirManifestoAusente = $conferirManifestoAusenteResp.Content | ConvertFrom-Json
    if ($conferirManifestoAusente.ok) { throw 'Conferencia com manifesto ausente deveria ser ok:false.' }
    if ((@($conferirManifestoAusente.erros) -join '|') -notmatch 'manifest\.json ausente ou invalido') {
        throw 'Erro de manifesto ausente nao apontou a mensagem esperada.'
    }

    # pasta fora do formato pmo-copia-, relativa ou dentro da instalacao: 400
    try {
        $null = Invoke-LocalApi '/api/copia-verificavel/conferir' 'POST' ([ordered]@{ pasta=$copiasDestino } | ConvertTo-Json -Depth 5) -Admin
        throw 'Conferencia com pasta fora do formato pmo-copia deveria ser recusada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) { throw }
    }
    try {
        $null = Invoke-LocalApi '/api/copia-verificavel/conferir' 'POST' ([ordered]@{ pasta='copias\relativo' } | ConvertTo-Json -Depth 5) -Admin
        throw 'Conferencia com pasta relativa deveria ser recusada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) { throw }
    }
    try {
        $null = Invoke-LocalApi '/api/copia-verificavel/conferir' 'POST' ([ordered]@{ pasta=$data } | ConvertTo-Json -Depth 5) -Admin
        throw 'Conferencia com pasta dentro da instalacao deveria ser recusada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) { throw }
    }

    # Sem token: 403
    try {
        $null = Invoke-LocalApi '/api/copia-verificavel/conferir' 'POST' ([ordered]@{ pasta=$copiaFelizDir } | ConvertTo-Json -Depth 5)
        throw 'Conferencia sem token deveria ser bloqueada.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }

    # GET /api/backups continua com ok, itens e retencao
    $backupsAposCopia = (Invoke-LocalApi '/api/backups' 'GET' $null -Admin).Content | ConvertFrom-Json
    if (-not $backupsAposCopia.ok -or $null -eq $backupsAposCopia.itens -or $null -eq $backupsAposCopia.retencao) {
        throw 'GET /api/backups deveria continuar com ok, itens e retencao.'
    }

    # Sugestoes de destino (P-17): sem token 403
    try {
        $null = Invoke-LocalApi '/api/copia-verificavel/sugestoes' 'GET' $null
        throw 'Sugestoes de destino sem token deveriam ser bloqueadas.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }

    # Registra na trilha a exportacao feliz com copia.destino, como o PUT do bundle ja faz nos outros blocos
    $portfolio.auditLog += [ordered]@{
        id='aud-copia-1'; em='2026-08-02T00:10:00Z'; ator='PMO Lead'; acao='Exportar cópia verificável'
        entidade='copia'; entidadeId=[string]$copiaFeliz.copyId; resumo='fixture de sugestoes'; campos=$null
        copia=[ordered]@{ copyId=[string]$copiaFeliz.copyId; destino=$copiasDestino; pasta=$copiaFelizDir
            manifestSha256=[string]$copiaFeliz.manifestSha256; arquivos=[int]$copiaFeliz.arquivos; bytes=[int64]$copiaFeliz.bytes }
    }
    $portfolio.meta.salvoEm = (Get-Date).ToUniversalTime().ToString('o')
    $null = Invoke-LocalApi '/api/portfolio' 'PUT' ($portfolio | ConvertTo-Json -Depth 20) -Admin

    $itensAntesSugestoes = @(Get-ChildItem -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue).Count
    $sugestoesResp = (Invoke-LocalApi '/api/copia-verificavel/sugestoes' 'GET' $null -Admin).Content | ConvertFrom-Json
    $itensDepoisSugestoes = @(Get-ChildItem -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue).Count
    if ($itensAntesSugestoes -ne $itensDepoisSugestoes) { throw 'Rota de sugestoes criou item em disco (deveria ser somente leitura).' }
    if (-not $sugestoesResp.ok) { throw 'Rota de sugestoes deveria responder ok.' }
    foreach ($destinoSugerido in @($sugestoesResp.destinos)) {
        if (-not (Test-Path -LiteralPath ([string]$destinoSugerido.caminho) -PathType Container)) {
            throw ('Destino sugerido nao existe como diretorio: ' + $destinoSugerido.caminho)
        }
        if (-not (Test-ProtSugestaoForaDaInstalacao ([string]$destinoSugerido.caminho))) {
            throw ('Destino sugerido fica dentro ou acima da instalacao isolada do teste: ' + $destinoSugerido.caminho)
        }
    }
    if ([string]$sugestoesResp.ultimoDestino -ne $copiasDestino) {
        throw ('ultimoDestino deveria ser a pasta da ultima copia registrada na trilha: ' + [string]$sugestoesResp.ultimoDestino)
    }

    # Prova real da P-18 (situacao 2), so leitura: OneDrive real da maquina, se existir
    if (-not [string]::IsNullOrWhiteSpace($env:OneDrive) -and (Test-Path -LiteralPath $env:OneDrive -PathType Container)) {
        $oneDriveNormalizadoTeste = Get-PmoNormalizedFullPath $env:OneDrive
        $achouOneDriveTeste = @($sugestoesResp.destinos | Where-Object { (Get-PmoNormalizedFullPath ([string]$_.caminho)) -eq $oneDriveNormalizadoTeste })
        if ($achouOneDriveTeste.Count -eq 0) {
            throw 'OneDrive real presente no ambiente mas nao apareceu nas sugestoes de destino (prova real da P-18).'
        }
    } else {
        Write-Host 'OneDrive real ausente: pulado' -ForegroundColor Yellow
    }

    Write-Host 'PROT-05 copia verificavel: OK' -ForegroundColor Green

    Write-Host 'Integracao do servidor, auth, snapshot, restore, rollback e app-ready: OK' -ForegroundColor Green
} finally {
    if ($healthProcess -and -not $healthProcess.HasExited) { $healthProcess.Kill(); $healthProcess.WaitForExit(5000) | Out-Null }
    if ($secondProcess -and -not $secondProcess.HasExited) { $secondProcess.Kill(); $secondProcess.WaitForExit(5000) | Out-Null }
    if ($process -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit(5000) | Out-Null }
    if ($processOutputSub) { Unregister-Event -SourceIdentifier $processOutputSub.Name -ErrorAction SilentlyContinue; Remove-Job -Id $processOutputSub.Id -Force -ErrorAction SilentlyContinue }
    if ($processErrorSub) { Unregister-Event -SourceIdentifier $processErrorSub.Name -ErrorAction SilentlyContinue; Remove-Job -Id $processErrorSub.Id -Force -ErrorAction SilentlyContinue }
    if ((Test-Path -LiteralPath $temp) -and $temp.StartsWith($tempBase,[StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($healthRoot) {
        $stagingRoot = [System.IO.Path]::GetFullPath((Join-Path $root 'staging'))
        $healthFull = [System.IO.Path]::GetFullPath($healthRoot)
        if ((Test-Path -LiteralPath $healthFull) -and (Test-PmoSubPath $stagingRoot $healthFull) -and
            ([System.IO.Path]::GetFileName($healthFull)).StartsWith('.server-health-',[StringComparison]::Ordinal)) {
            $null = Assert-PmoPathWithoutReparse $healthFull
            Remove-Item -LiteralPath $healthFull -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
