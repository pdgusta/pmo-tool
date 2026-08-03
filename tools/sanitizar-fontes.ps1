<#
    sanitizar-fontes.ps1 — guardrail de integridade dos fontes

    Problema que este script resolve:
    Ao escrever uma classe de regex como [\u0000-\u0008\u000B\u000C\u000E-\u001F]
    (necessaria para limpar caracteres de controle em XML e em ICS/RFC 5545), e
    facil acabar gravando os BYTES literais de controle no arquivo-fonte em vez
    das sequencias de escape. Um NUL literal dentro de um .js quebra o parser,
    corrompe o build e e praticamente invisivel numa revisao de codigo.

    O script varre src/ e:
      - troca bytes de controle literais pelas sequencias de escape equivalentes;
      - troca BOM literal no meio do arquivo por '\uFEFF';
      - troca marcas diacriticas combinantes literais (U+0300..U+036F) por escapes;
      - troca NBSP literal dentro de classe de regex por  ;
      - reporta o que restou de suspeito.

    Uso:  .\tools\sanitizar-fontes.ps1
          .\tools\sanitizar-fontes.ps1 -Verificar    (nao grava; so relata, exit 1 se sujo)
#>
[CmdletBinding()]
param([switch] $Verificar)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$src  = Join-Path $raiz 'src'
$claude = Join-Path $raiz '.claude'
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $src)) { throw "nao encontrei $src" }

# --- pares de substituicao: literal -> escape ------------------------------
$pares = @()

# classe completa de controle usada em XML 1.0 / ICS
$pares += @{
  de = "[" + [char]0 + "-" + [char]8 + [char]11 + [char]12 + [char]14 + "-" + [char]31 + "]"
  para = '[\u0000-\u0008\u000B\u000C\u000E-\u001F]'
  nome = 'classe de controle XML/ICS'
}
# variante sem VT/FF
$pares += @{
  de = "[" + [char]0 + "-" + [char]31 + "]"
  para = '[\u0000-\u001F]'
  nome = 'classe de controle simples'
}
# marcas diacriticas combinantes (normalize NFD)
$pares += @{
  de = "[" + [char]0x300 + "-" + [char]0x36F + "]"
  para = '[\u0300-\u036f]'
  nome = 'marcas diacriticas combinantes'
}
# NBSP dentro de classe de regex
$pares += @{ de = '\s' + [char]160 + ']'; para = '\s\u00A0]'; nome = 'NBSP em classe de regex' }

$arquivos = @(Get-ChildItem -Path $src -Recurse -Include *.js, *.css, *.html -File)
if (Test-Path -LiteralPath $claude) {
    $arquivos += @(Get-ChildItem -Path $claude -Recurse -Include *.md, *.json -File)
}
$totalTrocas = 0
$sujos = @()

foreach ($f in $arquivos) {
    $texto = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    $orig  = $texto
    $trocasArq = @()

    foreach ($par in $pares) {
        if ($texto.Contains($par.de)) {
            $n = ([regex]::Matches($texto, [regex]::Escape($par.de))).Count
            $texto = $texto.Replace($par.de, $par.para)
            $trocasArq += ("" + $n + "x " + $par.nome)
            $totalTrocas += $n
        }
    }

    # Qualquer controle restante vira escape visivel. Isso tambem protege
    # instrucoes Markdown usadas pelos agentes, nao apenas o JavaScript.
    foreach ($codigo in 0..31) {
        if ($codigo -in @(9,10,13)) { continue }
        $literal = [string][char]$codigo
        if ($texto.Contains($literal)) {
            $n = ([regex]::Matches($texto, [regex]::Escape($literal))).Count
            $texto = $texto.Replace($literal, ('\u{0:X4}' -f $codigo))
            $trocasArq += ("$n" + 'x controle U+' + ('{0:X4}' -f $codigo))
            $totalTrocas += $n
        }
    }

    # BOM literal fora da posicao 0
    if ($texto.Length -gt 1 -and $texto.Substring(1).Contains([char]0xFEFF)) {
        $cab = $texto.Substring(0, 1)
        $resto = $texto.Substring(1).Replace([string][char]0xFEFF, '\uFEFF')
        $texto = $cab + $resto
        $trocasArq += 'BOM literal no meio do arquivo'
        $totalTrocas += 1
    }

    # relatorio de residuo: qualquer controle fora de TAB/LF/CR
    $residuo = 0
    foreach ($c in $texto.ToCharArray()) {
        $i = [int]$c
        if ($i -lt 32 -and $i -ne 9 -and $i -ne 10 -and $i -ne 13) { $residuo += 1 }
    }

    $rel = $f.FullName.Substring($raiz.Length + 1)

    if ($trocasArq.Count -gt 0) {
        if ($Verificar) {
            Write-Host ("  SUJO  " + $rel + "  ->  " + ($trocasArq -join '; ')) -ForegroundColor Yellow
            $sujos += $rel
        } else {
            [System.IO.File]::WriteAllText($f.FullName, $texto, $utf8SemBom)
            Write-Host ("  CORRIGIDO  " + $rel + "  ->  " + ($trocasArq -join '; ')) -ForegroundColor Green
        }
    }

    if ($residuo -gt 0) {
        Write-Host ("  ATENCAO  " + $rel + " ainda tem " + $residuo + " caractere(s) de controle nao mapeado(s)") -ForegroundColor Red
        $sujos += $rel
    }
}

Write-Host ""
if ($Verificar) {
    if ($sujos.Count -gt 0) {
        Write-Host ("Verificacao FALHOU: " + ($sujos | Select-Object -Unique).Count + " arquivo(s) com problema.") -ForegroundColor Red
        exit 1
    }
    Write-Host "Verificacao OK: nenhum byte de controle literal nos fontes." -ForegroundColor Green
    exit 0
}
Write-Host ("Concluido. " + $arquivos.Count + " arquivo(s) varrido(s), " + $totalTrocas + " substituicao(oes).") -ForegroundColor Cyan
