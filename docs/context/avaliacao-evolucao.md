# L1 — Avaliação técnica e decisões de evolução

Este L1 registra a avaliação técnica medida do protótipo v1.5.0 (commit base `571d058`,
27/09/2026), os spikes de verificação descartáveis e as decisões ratificadas na Fase 1 (D-01 a
D-13). Usa os marcadores **Atual**, **Alvo**, **Invariante** e **Gate** definidos em
`docs/context/README.md`; tudo marcado como **Alvo** ainda não está implementado — só foi
aprovado como direção.

## Resumo

Registra o resultado consolidado da avaliação técnica: a recomendação de evolução por eixo
(tooling, dependências, arquitetura, framework de UI) e a lista das decisões ratificadas,
preenchida pelos planos seguintes desta fase.

## Medições do protótipo

Traz números medidos do protótipo nesta execução — tamanho e complexidade dos módulos, tempo de
build, inventário de testes e cobertura por módulo — cada um pareado com o comando exato que o
produziu.

**Base:** commit `571d058` (`git rev-parse --short HEAD`), medido em 27/09/2026.

### Tamanho dos módulos

Comando: `wc -l src/js/*.js src/css/*.css`

| Arquivo | Linhas |
|---|---|
| `src/js/10-model.js` | 2.723 |
| `src/js/62-views-principais.js` | 2.059 |
| `src/js/30-import.js` | 1.866 |
| `src/js/50-charts.js` | 1.661 |
| `src/js/42-export-relatorios.js` | 1.600 |
| `src/js/20-store.js` | 1.348 |
| `src/js/66-views-dados.js` | 1.232 |
| `src/js/90-app.js` | 1.165 |
| `src/js/64-views-governanca.js` | 1.069 |
| `src/js/40-export-dados.js` | 1.032 |
| `src/js/60-views-comuns.js` | 966 |
| `src/js/00-util.js` | 950 |
| `src/js/80-seed.js` | 757 |
| `src/js/70-views-config.js` | 510 |
| `src/js/68-editores.js` | 404 |
| `src/css/20-componentes.css` | 880 |
| `src/css/10-layout.css` | 515 |
| `src/css/00-theme.css` | 364 |
| `src/css/50-charts.css` | 265 |

Total `src/js/*.js`: **19.342 linhas** em 15 arquivos. Total `src/css/*.css`: **2.024 linhas** em
4 arquivos. Os cinco maiores arquivos de `src/js/` são `10-model.js` (2.723 linhas),
`62-views-principais.js` (2.059), `30-import.js` (1.866), `50-charts.js` (1.661) e
`42-export-relatorios.js` (1.600) — confirmam a observação de `.planning/PROJECT.md` sobre módulos
grandes.

Comando: `du -sh src/` → **1016K**.

### Proxy de complexidade

Comando: `grep -cE 'function\s*\(|function [a-zA-Z_]+\(|=>\s*\{|=\s*function' src/js/*.js` — proxy
grosseiro de contagem de declarações função-símile; não é uma ferramenta real de complexidade
ciclomática (nenhum linter de complexidade está instalado antes da Fase 2).

| Arquivo | Declarações função-símile (aprox.) |
|---|---|
| `src/js/62-views-principais.js` | 347 |
| `src/js/10-model.js` | 272 |
| `src/js/64-views-governanca.js` | 235 |
| `src/js/50-charts.js` | 214 |
| `src/js/66-views-dados.js` | 183 |

### Tempo de build

Comando (PowerShell 5.1, três execuções cronometradas com `Stopwatch`, argumentos fixos):

```powershell
$sw = [System.Diagnostics.Stopwatch]::StartNew()
.\build.ps1 -Version '1.5.0' -Commit '0000000000000000000000000000000000000000' `
  -BuildTimestamp '2026-09-27T00:00:00Z' -OutputPath 'dist\pmo-tool-medicao.html'
$sw.Stop(); Write-Host ('ELAPSED_MS=' + $sw.ElapsedMilliseconds)
```

Saída real desta execução (três rodadas consecutivas):
- ELAPSED_MS=486
- ELAPSED_MS=176
- ELAPSED_MS=157

Mediana: **176 ms**. Resumo do build (idêntico nas três rodadas): `css: 4 arquivo(s)  js: 15
arquivo(s)  versao: 1.5.0  linhas: 21576  tamanho: 957.4 KB  sha256:
ce6e42999759168a34b5d412a7c5c68c79e9ad839b5746085747fe01acd7932e  guardrails: OK`. O arquivo
`dist/pmo-tool-medicao.html` foi apagado logo após a medição — não é artefato desta fase. Esta
mediana (176 ms) é a referência que o spike do Vite (plano 01-03) deve comparar.

### Inventário de testes

Comando: `wc -l tests/*.ps1 tests/*.mjs`

| Arquivo | Linhas | Framework |
|---|---|---|
| `tests/Run-Tests.ps1` | 920 | PowerShell 5.1, helpers `Assert-*` próprios, sem framework declarativo |
| `tests/Test-UpdaterRecovery.ps1` | 445 | PowerShell 5.1, mesmo estilo |
| `tests/Invoke-ServerIntegration.ps1` | 362 | PowerShell 5.1, mesmo estilo |
| `tests/model-migration.test.mjs` | 167 | Node `assert/strict`, sem framework |
| `tests/validate-built-html.mjs` | 34 | Node, sem framework |
| `tests/Invoke-ModelMigrationTests.ps1` | 20 | PowerShell 5.1, wrapper que chama o `.mjs` |

Total: 1.948 linhas em 6 arquivos, nenhum usando runner declarativo (`describe`/`it`). Comando:
`find tests/fixtures -type f | wc -l` → **5** arquivos (4 fixtures de migração em
`tests/fixtures/migrations/` mais 1 manifesto em `tests/fixtures/manifests/`).

### Mapa de cobertura por módulo

Para cada arquivo em `src/js/*.js`, busca por nome de arquivo em `tests/*.ps1 tests/*.mjs`
(`grep -l <nome-do-arquivo>`):

| Módulo | Referenciado por |
|---|---|
| `00-util.js` | `model-migration.test.mjs` (importado só como dependência de `10-model.js`) |
| `10-model.js` | `Invoke-ServerIntegration.ps1`, `Run-Tests.ps1`, `model-migration.test.mjs` |
| `20-store.js`, `30-import.js`, `40-export-dados.js`, `42-export-relatorios.js`, `50-charts.js`, `60-views-comuns.js`, `62-views-principais.js`, `64-views-governanca.js`, `66-views-dados.js`, `68-editores.js`, `70-views-config.js`, `80-seed.js`, `90-app.js` | nenhum arquivo de teste referencia pelo nome |

`Run-Tests.ps1` compila o HTML completo (chama `build.ps1`) e `validate-built-html.mjs` faz o
parse do único `<script>` inline resultante — isso dá cobertura sintática de todos os módulos (o
build falha se algum arquivo tiver erro de sintaxe), mas só `10-model.js` tem teste comportamental
real (`model-migration.test.mjs`, que também importa `00-util.js` como dependência, sem testá-lo
diretamente). Os outros 13 módulos de `src/js/` — de `20-store.js` a `90-app.js` na tabela acima —
estão **sem teste comportamental**.

### Fatos de runtime

Comando: `grep -n "node-version" .github/workflows/release.yml` → linha 66: `node-version:
'22.22.0'`. O CI ainda está fixado no Node 22, não no Node 24 (D-01); bumpar esse pino é escopo da
Fase 2 (junto com o contrato `workflow-gates-release` em `index.json`), não desta fase.

`tests/Run-Tests.ps1` (linhas 22-28) já resolve e **exige** um Node.js de desenvolvimento —
`throw 'Node.js de desenvolvimento e obrigatorio para validar migracoes e o JavaScript do
artefato.'` quando nenhum `$NodePath` é encontrado. Isso é evidência de que a premissa antiga da
G2 ("não existe Node... nesta máquina") já era falsa antes desta ratificação: os próprios testes
do protótipo dependem de Node para rodar.

## Spikes de verificação

Registra o resultado e a evidência (comandos e saída, nunca o código) dos spikes descartáveis que
validam as decisões D-01/D-02/D-10 (`node.exe` portátil, Vite + singlefile, MCP SDK com Streamable
HTTP e ponte stdio), executados fora do repositório.

## Decisões ratificadas

Lista as decisões D-01 a D-13 (Node 24 LTS, distribuição do runtime, transporte MCP, acesso
Microsoft delegado), cada uma com data, justificativa, efeito nas fases seguintes e
reversibilidade.

## Avaliação por eixo

Avalia tooling, dependências, arquitetura e framework de UI, com as alternativas descartadas e o
motivo de cada descarte.

## Dependências aprovadas (G2)

Registra a lista inicial de dependências aprovadas pela avaliação (nome, versão, licença, motivo)
que a G2 reescrita do CLAUDE.md referencia como allow-list.

## Divergências código × documentação

Registra as divergências corrigidas nesta fase entre o código e o CLAUDE.md: o contrato de
`PMO.importar.reconciliar()` e a lista de rotas administrativas de `serve.ps1`.

## Adiado para fases seguintes

Registra o que foi propositalmente deixado para depois: revisão da G1 (Fase 13), escolha do
framework de UI (Fase 8), formato do token MCP (Fase 14) e migração do updater para Node
(Fase 13).

## Gate de validação

O gate mecânico desta fase é `tools/validar-contexto.ps1`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/validar-contexto.ps1 -Detalhado
```

Resultado esperado depois desta entrada: `Entradas: 16  Contratos: 30` e, na última linha,
`Contexto valido.` — código de saída `0`.

Todo spike de verificação (D-15) roda exclusivamente em `%TEMP%\pmo-spikes-f1`, fora da árvore do
repositório; `git status --short` nunca pode listar artefato de spike — se listar, é falha
bloqueante antes do commit.

Como esta fase não altera código de produto, o gate do item 1 de "Antes de dizer pronto" do
CLAUDE.md que cobre `tests/Run-Tests.ps1` permanece verde sem qualquer ação desta fase: nenhuma
mudança em `src/js/`, `serve.ps1` ou `build.ps1` foi feita para produzir este documento.
