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

try {
    # O checkout limpo de CI nao contem dist/. Gere a mesma entrada que o
    # servidor consumira, com metadados deterministas de fixture.
    & (Join-Path $root 'build.ps1') -Version '1.4.1' `
        -Commit '0123456789abcdef0123456789abcdef01234567' `
        -BuildTimestamp '2026-01-01T00:00:00Z' `
        -OutputPath (Join-Path $root 'dist\pmo-tool.html') | Out-Null
    New-Item -ItemType Directory -Path $data,$config,$state -Force | Out-Null
    $portfolio = [ordered]@{
        meta=[ordered]@{ schemaVersion=4; appVersion='1.4.1'; orgName='Teste'; salvoEm='2026-08-02T00:00:00Z' }
        settings=[ordered]@{ tema='auto'; salvarEmDisco=$true }
        pessoas=@(); programas=@(); projetos=@(); anexos=@(); auditLog=@(); imports=@(); visoesSalvas=@()
    }
    Write-PmoJsonAtomic (Join-Path $data 'portfolio.json') $portfolio
    Write-PmoJsonAtomic (Join-Path $config 'install.json') ([ordered]@{
        formatVersion=1; repository=''; channel='stable'; port=$Port; checkIntervalHours=24
        dataDir='data'; configDir='config'; stateDir='state'; retention=[ordered]@{versions=2;snapshots=3;portfolioBackups=30}
    })
    Write-PmoJsonAtomic (Join-Path $state 'active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion='1.4.1'; previousVersion='1.4.0'
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

    $health = $null
    $healthError = $null
    for ($i=0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        try { $health = (Invoke-LocalApi '/api/health').Content | ConvertFrom-Json; break }
        catch { $healthError = $_.Exception.Message; if ($process.HasExited) { break } }
    }
    if (-not $health -or -not $health.ok -or [int]$health.schemaVersion -ne 4) {
        $stderr = if ($process.HasExited) { $process.StandardError.ReadToEnd() } else { '' }
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

    $prepareInvalido = [ordered]@{ appVersion='1.4.1'; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm; anexos=@([ordered]@{
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
    $prepareBody = [ordered]@{ appVersion='1.4.1'; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm; anexos=@([ordered]@{
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
        portfolioSha256=$portfolioSha; sourceSchemaVersion=4; sourceAppVersion='1.4.1'
        attachments=@([ordered]@{ id=$attachmentId; size=[Int64]$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    }
    Write-PmoJsonAtomic (Join-Path $state 'restore-pending.json') $restorePending
    $pendingResponse = (Invoke-LocalApi '/api/restore-pending' 'GET' $null -Admin).Content | ConvertFrom-Json
    if (-not $pendingResponse.pending -or [string]$pendingResponse.restore.snapshotId -ne [string]$prepared.snapshotId) {
        throw 'Endpoint restore-pending nao retornou o journal esperado.'
    }
    $ackBody = [ordered]@{
        snapshotId=[string]$prepared.snapshotId; activationId=$activationId; portfolioSha256=$portfolioSha
        sourceSchemaVersion=4; sourceAppVersion='1.4.1'; indexedDbReady=$true
        attachments=@([ordered]@{ id=$attachmentId; size=[Int64]$attachmentBytes.Length; sha256=[string]$index.itens[0].sha256 })
    } | ConvertTo-Json -Depth 10
    $ack = (Invoke-LocalApi '/api/restore-ack' 'POST' $ackBody -Admin).Content | ConvertFrom-Json
    if (-not $ack.ok -or -not $ack.recoveryCleaned -or -not (Test-Path -LiteralPath (Join-Path $state 'restore-ack.json')) -or
        (Test-Path -LiteralPath (Join-Path $state 'restore-pending.json')) -or (Test-Path -LiteralPath $recoveryDir)) {
        throw 'Restore ACK nao foi selado ou o recovery confirmado nao foi limpo corretamente.'
    }

    Write-PmoJsonAtomic (Join-Path $state 'update.json') ([ordered]@{
        formatVersion=1; phase='activating'; activationId=$activationId; targetVersion='1.4.1'; snapshotId=[string]$prepared.snapshotId
    })
    Write-PmoJsonAtomic (Join-Path $state 'active.json') ([ordered]@{
        formatVersion=1; bootstrapVersion='1.0.0'; activeVersion='1.4.1'; previousVersion='1.4.0'
        activeSchemaVersion=4; previousSchemaVersion=3; activatedAt='2026-08-02T00:02:00Z'; pendingActivationId=$activationId
    })
    $readyBase = [ordered]@{
        activationId=$activationId; appVersion='1.4.1'; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
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
        operation='rollback'; appVersion='1.4.1'; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
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
        appVersion='1.4.1'; schemaVersion=4; salvoEm=$portfolio.meta.salvoEm
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

    Write-Host 'Integracao do servidor, auth, snapshot, restore, rollback e app-ready: OK' -ForegroundColor Green
} finally {
    if ($healthProcess -and -not $healthProcess.HasExited) { $healthProcess.Kill(); $healthProcess.WaitForExit(5000) | Out-Null }
    if ($secondProcess -and -not $secondProcess.HasExited) { $secondProcess.Kill(); $secondProcess.WaitForExit(5000) | Out-Null }
    if ($process -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit(5000) | Out-Null }
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
