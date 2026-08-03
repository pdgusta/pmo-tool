<#
    gerar-templates.ps1 — cronogramas-modelo em MSPDI

    Gera os arquivos de templates/ que a ferramenta oferece ao criar um projeto.

    POR QUE MSPDI E NAO .mpp (G7):
    .mpp e um container OLE/CFB proprietario, com os streams de cronograma nao
    documentados. Nao existe writer em JavaScript nem em PowerShell puro. MSPDI
    (.xml) e o formato XML oficial do MS Project: ele abre nativamente com duplo
    clique e o proprio Project salva como .mpp depois. Mesma funcao, formato
    suportado — e sem prometer o que nao da para entregar.

    As tarefas usam <Work> (horas) como peso, e custo ZERO de proposito: o
    template define ESTRUTURA e duracao, nunca orcamento. O orcamento e do
    projeto real e nao deve ser contaminado pelo modelo.

    Datas partem de uma data-base; o app desloca tudo para o inicio do projeto
    ao aplicar o template.

    Uso:  .\tools\gerar-templates.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$raiz  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$saida = Join-Path $raiz 'templates'
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)
$BASE = Get-Date '2026-01-05'   # segunda-feira

if (-not (Test-Path $saida)) { New-Item -ItemType Directory -Force -Path $saida | Out-Null }

function XmlEsc([string]$s) {
    if ($null -eq $s) { return '' }
    return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}

function DataMspdi([datetime]$d, [string]$hora) {
    return $d.ToString('yyyy-MM-dd') + 'T' + $hora
}

function DuracaoIso([int]$horas) {
    return 'PT' + $horas + 'H0M0S'
}

<#
    Emite um MSPDI a partir de uma lista de tarefas.
    Cada tarefa: @{ n = nome; l = nivel; o = offset em dias; d = duracao em dias;
                    m = e marco?; w = horas de trabalho }
#>
function GerarTemplate($arquivo, $titulo, $descricao, $tarefas) {
    $sb = New-Object System.Text.StringBuilder

    $fimMax = 0
    foreach ($t in $tarefas) {
        $fim = $t.o + $t.d
        if ($fim -gt $fimMax) { $fimMax = $fim }
    }
    $inicioProj = $BASE
    $fimProj = $BASE.AddDays($fimMax)

    [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$sb.AppendLine('<Project xmlns="http://schemas.microsoft.com/project">')
    [void]$sb.AppendLine('  <SaveVersion>14</SaveVersion>')
    [void]$sb.AppendLine('  <Name>' + (XmlEsc $arquivo) + '</Name>')
    [void]$sb.AppendLine('  <Title>' + (XmlEsc $titulo) + '</Title>')
    [void]$sb.AppendLine('  <Subject>' + (XmlEsc $descricao) + '</Subject>')
    [void]$sb.AppendLine('  <Author>PMO Tool</Author>')
    [void]$sb.AppendLine('  <Company>Modelo de cronograma</Company>')
    [void]$sb.AppendLine('  <Keywords>template; cronograma-modelo; PMO Tool</Keywords>')
    [void]$sb.AppendLine('  <CreationDate>' + (DataMspdi $BASE '08:00:00') + '</CreationDate>')
    [void]$sb.AppendLine('  <StartDate>' + (DataMspdi $inicioProj '08:00:00') + '</StartDate>')
    [void]$sb.AppendLine('  <FinishDate>' + (DataMspdi $fimProj '17:00:00') + '</FinishDate>')
    [void]$sb.AppendLine('  <StatusDate>' + (DataMspdi $BASE '08:00:00') + '</StatusDate>')
    [void]$sb.AppendLine('  <CurrencyCode>BRL</CurrencyCode>')
    [void]$sb.AppendLine('  <CurrencySymbol>R$</CurrencySymbol>')
    [void]$sb.AppendLine('  <CurrencyDigits>2</CurrencyDigits>')
    [void]$sb.AppendLine('  <CalendarUID>1</CalendarUID>')
    [void]$sb.AppendLine('  <ScheduleFromStart>1</ScheduleFromStart>')
    [void]$sb.AppendLine('  <DefaultStartTime>08:00:00</DefaultStartTime>')
    [void]$sb.AppendLine('  <DefaultFinishTime>17:00:00</DefaultFinishTime>')
    [void]$sb.AppendLine('  <MinutesPerDay>480</MinutesPerDay>')
    [void]$sb.AppendLine('  <MinutesPerWeek>2400</MinutesPerWeek>')
    [void]$sb.AppendLine('  <DaysPerMonth>20</DaysPerMonth>')

    # calendario padrao: seg-sex, 08:00-12:00 e 13:00-17:00
    [void]$sb.AppendLine('  <Calendars>')
    [void]$sb.AppendLine('    <Calendar>')
    [void]$sb.AppendLine('      <UID>1</UID>')
    [void]$sb.AppendLine('      <Name>Padrao</Name>')
    [void]$sb.AppendLine('      <IsBaseCalendar>1</IsBaseCalendar>')
    [void]$sb.AppendLine('      <BaseCalendarUID>-1</BaseCalendarUID>')
    [void]$sb.AppendLine('      <WeekDays>')
    for ($dw = 1; $dw -le 7; $dw++) {
        $util = ($dw -ge 2 -and $dw -le 6)
        [void]$sb.AppendLine('        <WeekDay>')
        [void]$sb.AppendLine('          <DayType>' + $dw + '</DayType>')
        if ($util) {
            [void]$sb.AppendLine('          <DayWorking>1</DayWorking>')
            [void]$sb.AppendLine('          <WorkingTimes>')
            [void]$sb.AppendLine('            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>')
            [void]$sb.AppendLine('            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>')
            [void]$sb.AppendLine('          </WorkingTimes>')
        } else {
            [void]$sb.AppendLine('          <DayWorking>0</DayWorking>')
        }
        [void]$sb.AppendLine('        </WeekDay>')
    }
    [void]$sb.AppendLine('      </WeekDays>')
    [void]$sb.AppendLine('    </Calendar>')
    [void]$sb.AppendLine('  </Calendars>')

    [void]$sb.AppendLine('  <Tasks>')
    $uid = 1
    $contadorNivel = @{}
    $ultimoNivel = 0
    $trilha = @()

    foreach ($t in $tarefas) {
        $nivel = [int]$t.l
        # numeracao de outline coerente com a hierarquia
        if ($nivel -gt $ultimoNivel) {
            $trilha += 1
        } elseif ($nivel -eq $ultimoNivel) {
            $trilha[$trilha.Count - 1] = $trilha[$trilha.Count - 1] + 1
        } else {
            $trilha = $trilha[0..($nivel - 1)]
            $trilha[$trilha.Count - 1] = $trilha[$trilha.Count - 1] + 1
        }
        $ultimoNivel = $nivel
        $outline = ($trilha -join '.')

        $ini = $BASE.AddDays([int]$t.o)
        $dur = [int]$t.d
        $ehMarco = [bool]$t.m
        if ($ehMarco) { $dur = 0 }
        $fim = $ini.AddDays([Math]::Max(0, $dur))
        $ehResumo = 0
        if ($t.ContainsKey('r')) { if ($t.r) { $ehResumo = 1 } }
        $horas = 0
        if ($t.ContainsKey('w')) { $horas = [int]$t.w }

        [void]$sb.AppendLine('    <Task>')
        [void]$sb.AppendLine('      <UID>' + $uid + '</UID>')
        [void]$sb.AppendLine('      <ID>' + ($uid - 1) + '</ID>')
        [void]$sb.AppendLine('      <Name>' + (XmlEsc $t.n) + '</Name>')
        [void]$sb.AppendLine('      <Active>1</Active>')
        [void]$sb.AppendLine('      <Type>1</Type>')
        [void]$sb.AppendLine('      <IsNull>0</IsNull>')
        [void]$sb.AppendLine('      <OutlineLevel>' + $nivel + '</OutlineLevel>')
        [void]$sb.AppendLine('      <OutlineNumber>' + $outline + '</OutlineNumber>')
        [void]$sb.AppendLine('      <Priority>500</Priority>')
        [void]$sb.AppendLine('      <Start>' + (DataMspdi $ini '08:00:00') + '</Start>')
        [void]$sb.AppendLine('      <Finish>' + (DataMspdi $fim '17:00:00') + '</Finish>')
        if ($ehMarco) {
            [void]$sb.AppendLine('      <Duration>PT0H0M0S</Duration>')
        } else {
            [void]$sb.AppendLine('      <Duration>' + (DuracaoIso ($dur * 8)) + '</Duration>')
        }
        [void]$sb.AppendLine('      <DurationFormat>7</DurationFormat>')
        if ($horas -gt 0) {
            [void]$sb.AppendLine('      <Work>' + (DuracaoIso $horas) + '</Work>')
        }
        if ($ehMarco) {
            [void]$sb.AppendLine('      <Milestone>1</Milestone>')
        } else {
            [void]$sb.AppendLine('      <Milestone>0</Milestone>')
        }
        [void]$sb.AppendLine('      <Summary>' + $ehResumo + '</Summary>')
        [void]$sb.AppendLine('      <Critical>0</Critical>')
        [void]$sb.AppendLine('      <PercentComplete>0</PercentComplete>')
        [void]$sb.AppendLine('      <PercentWorkComplete>0</PercentWorkComplete>')
        # custo ZERO de proposito: template define estrutura, nao orcamento
        [void]$sb.AppendLine('      <FixedCost>0</FixedCost>')
        [void]$sb.AppendLine('      <FixedCostAccrual>3</FixedCostAccrual>')
        [void]$sb.AppendLine('      <Cost>0</Cost>')
        [void]$sb.AppendLine('      <Baseline>')
        [void]$sb.AppendLine('        <Number>0</Number>')
        [void]$sb.AppendLine('        <Start>' + (DataMspdi $ini '08:00:00') + '</Start>')
        [void]$sb.AppendLine('        <Finish>' + (DataMspdi $fim '17:00:00') + '</Finish>')
        if ($ehMarco) {
            [void]$sb.AppendLine('        <Duration>PT0H0M0S</Duration>')
        } else {
            [void]$sb.AppendLine('        <Duration>' + (DuracaoIso ($dur * 8)) + '</Duration>')
        }
        [void]$sb.AppendLine('        <DurationFormat>7</DurationFormat>')
        if ($horas -gt 0) {
            [void]$sb.AppendLine('        <Work>' + (DuracaoIso $horas) + '</Work>')
        }
        [void]$sb.AppendLine('        <Cost>0</Cost>')
        [void]$sb.AppendLine('      </Baseline>')
        [void]$sb.AppendLine('    </Task>')
        $uid++
    }
    [void]$sb.AppendLine('  </Tasks>')
    [void]$sb.AppendLine('</Project>')

    $caminho = Join-Path $saida $arquivo
    [System.IO.File]::WriteAllText($caminho, $sb.ToString(), $utf8SemBom)
    return @{ arquivo = $arquivo; tarefas = $tarefas.Count; caminho = $caminho }
}

# ============================================================== estruturas

$aplicacao = @(
    @{ n = 'Iniciacao';                                l = 1; o = 0;   d = 20;  r = $true }
    @{ n = 'Levantamento de requisitos de negocio';    l = 2; o = 0;   d = 15;  w = 240 }
    @{ n = 'Estudo de viabilidade tecnica';            l = 2; o = 10;  d = 10;  w = 120 }
    @{ n = 'G1 - Business case aprovado';              l = 2; o = 20;  d = 0;   m = $true }
    @{ n = 'Planejamento';                             l = 1; o = 20;  d = 25;  r = $true }
    @{ n = 'Arquitetura da solucao';                   l = 2; o = 20;  d = 15;  w = 200 }
    @{ n = 'Plano de projeto e baseline';              l = 2; o = 30;  d = 15;  w = 120 }
    @{ n = 'G2 - Baseline aprovada';                   l = 2; o = 45;  d = 0;   m = $true }
    @{ n = 'Execucao';                                 l = 1; o = 45;  d = 120; r = $true }
    @{ n = 'Preparacao de ambientes';                  l = 2; o = 45;  d = 15;  w = 160 }
    @{ n = 'Desenvolvimento - onda 1';                 l = 2; o = 55;  d = 45;  w = 1440 }
    @{ n = 'Desenvolvimento - onda 2';                 l = 2; o = 95;  d = 45;  w = 1440 }
    @{ n = 'Integracao com sistemas existentes';       l = 2; o = 110; d = 35;  w = 640 }
    @{ n = 'Testes integrados';                        l = 2; o = 140; d = 25;  w = 480 }
    @{ n = 'G3 - Autorizacao de execucao final';       l = 2; o = 165; d = 0;   m = $true }
    @{ n = 'Transicao';                                l = 1; o = 165; d = 40;  r = $true }
    @{ n = 'Teste de aceitacao do usuario';            l = 2; o = 165; d = 20;  w = 320 }
    @{ n = 'Plano de cutover e ensaio';                l = 2; o = 180; d = 10;  w = 160 }
    @{ n = 'G4 - Aprovacao de go-live';                l = 2; o = 195; d = 0;   m = $true }
    @{ n = 'Go-live em producao';                      l = 2; o = 195; d = 5;   w = 120 }
    @{ n = 'Encerramento';                             l = 1; o = 200; d = 25;  r = $true }
    @{ n = 'Estabilizacao pos-go-live';                l = 2; o = 200; d = 20;  w = 240 }
    @{ n = 'Transferencia para sustentacao';           l = 2; o = 215; d = 10;  w = 80 }
    @{ n = 'G5 - Encerramento formal';                 l = 2; o = 225; d = 0;   m = $true }
)

$infraestrutura = @(
    @{ n = 'Avaliacao';                                l = 1; o = 0;   d = 25;  r = $true }
    @{ n = 'Inventario do ambiente atual';             l = 2; o = 0;   d = 20;  w = 240 }
    @{ n = 'Analise de capacidade e dependencias';     l = 2; o = 15;  d = 10;  w = 120 }
    @{ n = 'G1 - Business case aprovado';              l = 2; o = 25;  d = 0;   m = $true }
    @{ n = 'Desenho';                                  l = 1; o = 25;  d = 30;  r = $true }
    @{ n = 'Arquitetura alvo e topologia';             l = 2; o = 25;  d = 20;  w = 280 }
    @{ n = 'Plano de migracao por ondas';              l = 2; o = 40;  d = 15;  w = 160 }
    @{ n = 'G2 - Baseline aprovada';                   l = 2; o = 55;  d = 0;   m = $true }
    @{ n = 'Implantacao';                              l = 1; o = 55;  d = 110; r = $true }
    @{ n = 'Provisionamento do ambiente alvo';         l = 2; o = 55;  d = 25;  w = 400 }
    @{ n = 'Migracao - onda piloto';                   l = 2; o = 75;  d = 30;  w = 560 }
    @{ n = 'Migracao - onda 1';                        l = 2; o = 100; d = 35;  w = 720 }
    @{ n = 'Migracao - onda 2';                        l = 2; o = 130; d = 35;  w = 720 }
    @{ n = 'Testes de desempenho e carga';             l = 2; o = 145; d = 20;  w = 240 }
    @{ n = 'G3 - Autorizacao de corte';                l = 2; o = 165; d = 0;   m = $true }
    @{ n = 'Corte e descomissionamento';               l = 1; o = 165; d = 45;  r = $true }
    @{ n = 'Janela de corte assistida';                l = 2; o = 165; d = 5;   w = 160 }
    @{ n = 'Monitoracao pos-corte';                    l = 2; o = 170; d = 20;  w = 200 }
    @{ n = 'G4 - Aprovacao de operacao';               l = 2; o = 190; d = 0;   m = $true }
    @{ n = 'Descomissionamento do ambiente antigo';    l = 2; o = 190; d = 20;  w = 240 }
    @{ n = 'G5 - Encerramento formal';                 l = 2; o = 210; d = 0;   m = $true }
)

$seguranca = @(
    @{ n = 'Diagnostico';                              l = 1; o = 0;   d = 30;  r = $true }
    @{ n = 'Avaliacao de postura e lacunas';           l = 2; o = 0;   d = 20;  w = 280 }
    @{ n = 'Analise de risco e priorizacao';           l = 2; o = 15;  d = 15;  w = 160 }
    @{ n = 'G1 - Business case aprovado';              l = 2; o = 30;  d = 0;   m = $true }
    @{ n = 'Desenho de controles';                     l = 1; o = 30;  d = 30;  r = $true }
    @{ n = 'Arquitetura de seguranca alvo';            l = 2; o = 30;  d = 20;  w = 280 }
    @{ n = 'Politicas e procedimentos';                l = 2; o = 45;  d = 15;  w = 160 }
    @{ n = 'G2 - Baseline aprovada';                   l = 2; o = 60;  d = 0;   m = $true }
    @{ n = 'Implantacao de controles';                 l = 1; o = 60;  d = 105; r = $true }
    @{ n = 'Piloto em ambiente controlado';            l = 2; o = 60;  d = 30;  w = 480 }
    @{ n = 'Rollout - onda 1';                         l = 2; o = 85;  d = 40;  w = 720 }
    @{ n = 'Rollout - onda 2';                         l = 2; o = 120; d = 45;  w = 720 }
    @{ n = 'Integracao com monitoracao e SIEM';        l = 2; o = 130; d = 30;  w = 400 }
    @{ n = 'G3 - Autorizacao de rollout completo';     l = 2; o = 165; d = 0;   m = $true }
    @{ n = 'Validacao';                                l = 1; o = 165; d = 50;  r = $true }
    @{ n = 'Teste de intrusao e validacao tecnica';    l = 2; o = 165; d = 20;  w = 280 }
    @{ n = 'Exercicio de resposta a incidente';        l = 2; o = 185; d = 10;  w = 120 }
    @{ n = 'Auditoria independente de conformidade';   l = 2; o = 195; d = 20;  w = 200 }
    @{ n = 'G4 - Aprovacao de operacao';               l = 2; o = 215; d = 0;   m = $true }
    @{ n = 'Transferencia para operacao continua';     l = 2; o = 215; d = 15;  w = 120 }
    @{ n = 'G5 - Encerramento formal';                 l = 2; o = 230; d = 0;   m = $true }
)

$dados = @(
    @{ n = 'Descoberta';                               l = 1; o = 0;   d = 30;  r = $true }
    @{ n = 'Mapeamento de fontes e dominios';          l = 2; o = 0;   d = 20;  w = 280 }
    @{ n = 'Avaliacao de qualidade das fontes';        l = 2; o = 15;  d = 15;  w = 200 }
    @{ n = 'G1 - Business case aprovado';              l = 2; o = 30;  d = 0;   m = $true }
    @{ n = 'Arquitetura de dados';                     l = 1; o = 30;  d = 30;  r = $true }
    @{ n = 'Modelo de dados e camadas';                l = 2; o = 30;  d = 20;  w = 320 }
    @{ n = 'Governanca, catalogo e linhagem';          l = 2; o = 45;  d = 15;  w = 200 }
    @{ n = 'G2 - Baseline aprovada';                   l = 2; o = 60;  d = 0;   m = $true }
    @{ n = 'Construcao';                               l = 1; o = 60;  d = 120; r = $true }
    @{ n = 'Plataforma e ingestao';                    l = 2; o = 60;  d = 35;  w = 640 }
    @{ n = 'Pipelines - dominio 1';                    l = 2; o = 90;  d = 40;  w = 720 }
    @{ n = 'Pipelines - dominio 2';                    l = 2; o = 125; d = 40;  w = 720 }
    @{ n = 'Camada semantica e indicadores';           l = 2; o = 150; d = 30;  w = 480 }
    @{ n = 'G3 - Autorizacao de publicacao';           l = 2; o = 180; d = 0;   m = $true }
    @{ n = 'Adocao';                                   l = 1; o = 180; d = 55;  r = $true }
    @{ n = 'Validacao com areas de negocio';           l = 2; o = 180; d = 25;  w = 320 }
    @{ n = 'Capacitacao dos usuarios';                 l = 2; o = 200; d = 15;  w = 160 }
    @{ n = 'G4 - Aprovacao de go-live';                l = 2; o = 215; d = 0;   m = $true }
    @{ n = 'Descontinuacao de relatorios legados';     l = 2; o = 215; d = 20;  w = 200 }
    @{ n = 'G5 - Encerramento formal';                 l = 2; o = 235; d = 0;   m = $true }
)

$compliance = @(
    @{ n = 'Enquadramento regulatorio';                l = 1; o = 0;   d = 25;  r = $true }
    @{ n = 'Leitura do normativo e interpretacao';     l = 2; o = 0;   d = 15;  w = 160 }
    @{ n = 'Analise de lacunas frente ao exigido';     l = 2; o = 10;  d = 15;  w = 200 }
    @{ n = 'G1 - Business case aprovado';              l = 2; o = 25;  d = 0;   m = $true }
    @{ n = 'Plano de adequacao';                       l = 1; o = 25;  d = 25;  r = $true }
    @{ n = 'Desenho dos controles exigidos';           l = 2; o = 25;  d = 15;  w = 200 }
    @{ n = 'Plano de acao com prazo regulatorio';      l = 2; o = 35;  d = 15;  w = 120 }
    @{ n = 'G2 - Baseline aprovada';                   l = 2; o = 50;  d = 0;   m = $true }
    @{ n = 'Implementacao';                            l = 1; o = 50;  d = 95;  r = $true }
    @{ n = 'Ajustes de processo';                      l = 2; o = 50;  d = 35;  w = 400 }
    @{ n = 'Ajustes de sistema';                       l = 2; o = 70;  d = 45;  w = 720 }
    @{ n = 'Trilha de auditoria e evidencias';         l = 2; o = 105; d = 40;  w = 320 }
    @{ n = 'G3 - Autorizacao de entrada em vigor';     l = 2; o = 145; d = 0;   m = $true }
    @{ n = 'Comprovacao';                              l = 1; o = 145; d = 60;  r = $true }
    @{ n = 'Teste de aderencia com Compliance';        l = 2; o = 145; d = 20;  w = 240 }
    @{ n = 'Validacao pela auditoria interna';         l = 2; o = 165; d = 20;  w = 200 }
    @{ n = 'G4 - Aprovacao para reporte ao regulador'; l = 2; o = 185; d = 0;   m = $true }
    @{ n = 'Reporte formal ao regulador';              l = 2; o = 185; d = 20;  w = 120 }
    @{ n = 'G5 - Encerramento formal';                 l = 2; o = 205; d = 0;   m = $true }
)

# =================================================================== geracao

Write-Host ''
Write-Host '=== PMO Tool :: gerar cronogramas-modelo ===' -ForegroundColor Cyan

$modelos = @(
    @{ a = 'modelo-aplicacao.xml';      t = 'Modelo - Desenvolvimento de aplicacao'; d = 'Cronograma-modelo para projetos de software: requisitos, arquitetura, ondas de desenvolvimento, testes e go-live.'; s = $aplicacao }
    @{ a = 'modelo-infraestrutura.xml'; t = 'Modelo - Projeto de infraestrutura';    d = 'Cronograma-modelo para infraestrutura: inventario, desenho da arquitetura alvo, migracao por ondas e descomissionamento.'; s = $infraestrutura }
    @{ a = 'modelo-seguranca.xml';      t = 'Modelo - Projeto de seguranca';         d = 'Cronograma-modelo para seguranca: diagnostico de postura, desenho de controles, rollout por ondas e validacao independente.'; s = $seguranca }
    @{ a = 'modelo-dados.xml';          t = 'Modelo - Projeto de dados e analytics'; d = 'Cronograma-modelo para dados: mapeamento de fontes, arquitetura, pipelines por dominio e adocao pelo negocio.'; s = $dados }
    @{ a = 'modelo-compliance.xml';     t = 'Modelo - Projeto regulatorio';          d = 'Cronograma-modelo para adequacao regulatoria: enquadramento, plano de acao, implementacao e comprovacao ao regulador.'; s = $compliance }
)

$total = 0
foreach ($m in $modelos) {
    $r = GerarTemplate $m.a $m.t $m.d $m.s
    $tam = (Get-Item $r.caminho).Length
    Write-Host ("  {0,-30} {1,3} tarefas  {2,6} bytes" -f $r.arquivo, $r.tarefas, $tam) -ForegroundColor Green
    $total++
}

Write-Host ''
Write-Host '=== validacao ===' -ForegroundColor Cyan
$falhas = 0
foreach ($f in (Get-ChildItem $saida -Filter *.xml)) {
    try {
        $x = [xml](Get-Content -Raw -Encoding UTF8 $f.FullName)
        $tasks = $x.GetElementsByTagName('Task').Count
        $marcos = 0
        foreach ($t in $x.GetElementsByTagName('Task')) {
            if ($t.Milestone -eq '1') { $marcos++ }
        }
        # UIDs unicos dentro de Tasks
        $uids = @()
        foreach ($t in $x.GetElementsByTagName('Task')) { $uids += $t.UID }
        $unicos = ($uids | Select-Object -Unique).Count -eq $uids.Count
        Write-Host ("  OK   {0,-30} {1,3} tarefas, {2} marcos, UIDs unicos: {3}" -f $f.Name, $tasks, $marcos, $unicos)
        if (-not $unicos) { $falhas++ }
    } catch {
        Write-Host ("  FALHA {0} :: {1}" -f $f.Name, $_.Exception.Message) -ForegroundColor Red
        $falhas++
    }
}

Write-Host ''
if ($falhas -gt 0) {
    Write-Host ("Concluido com {0} falha(s)." -f $falhas) -ForegroundColor Red
    exit 1
}
Write-Host ("Concluido. {0} template(s) em {1}" -f $total, $saida) -ForegroundColor Cyan
