<# Executa os testes JS puros da fase (contrato de migracao + protecao da
   captura). Compativel com Windows PowerShell 5.1. #>
[CmdletBinding()]
param([string] $NodePath)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$testDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$testPaths = @(
    (Join-Path $testDir 'model-migration.test.mjs'),
    (Join-Path $testDir 'protecao-captura.test.mjs')
)

if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
    if ($node) { $NodePath = $node.Source }
}
if ([string]::IsNullOrWhiteSpace($NodePath) -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw 'Node.js nao encontrado. Informe -NodePath com um runtime Node.js disponivel.'
}

foreach ($testPath in $testPaths) {
    & $NodePath $testPath
    if ($LASTEXITCODE -ne 0) { throw "Testes JS falharam em $testPath com codigo $LASTEXITCODE." }
}
