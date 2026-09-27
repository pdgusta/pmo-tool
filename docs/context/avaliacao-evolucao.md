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

### Gate de legitimidade dos pacotes (antes de qualquer `npm install`)

Antes de qualquer instalação, `npm view <pkg>@<versão> name version license repository.url
dist.integrity time.created` foi executado (somente leitura) para os quatro pacotes que os spikes
B e o plano 01-04 usam:

```text
=== vite@8.3.1 ===
name = 'vite'
version = '8.3.1'
license = 'MIT'
repository.url = 'git+https://github.com/vitejs/vite.git'
time.created = '2020-04-21T05:05:15.476Z'

=== vite-plugin-singlefile@2.3.3 ===
name = 'vite-plugin-singlefile'
version = '2.3.3'
license = 'MIT'
repository.url = 'git+https://github.com/richardtallent/vite-plugin-singlefile.git'
time.created = '2021-01-09T16:27:10.709Z'

=== zod@4.6.5 ===
name = 'zod'
version = '4.6.5'
license = 'MIT'
repository.url = 'git+https://github.com/colinhacks/zod.git'
time.created = '2020-03-07T21:19:15.387Z'

=== @modelcontextprotocol/sdk@1.30.1 ===
name = '@modelcontextprotocol/sdk'
version = '1.30.1'
license = 'MIT'
repository.url = 'git+https://github.com/modelcontextprotocol/typescript-sdk.git'
time.created = '2024-11-11T15:53:15.703Z'
```

Um humano confirmou em npmjs.com que os quatro repositórios, versões e licenças acima coincidem
com o publicado, e aprovou o modo de instalação proposto (versões exatas via `--save-exact`,
`--ignore-scripts --no-audit --no-fund`, com `npm rebuild` como único fallback aprovado caso falte
binding nativo do Vite) com a resposta verbatim **"aprovado"**. **Resultado:** aprovado — os quatro
pacotes e o modo de instalação foram liberados antes de qualquer `npm install` nos spikes; nenhum
`node_modules` existia em `%TEMP%\pmo-spikes-f1` no momento do gate. **Implicação:** este gate
libera o Spike B (`vite`, `vite-plugin-singlefile`) nesta execução; `zod` e
`@modelcontextprotocol/sdk` seguem aprovados para instalação no plano 01-04 (Spike C, MCP), sem
precisar repetir o gate.

### Spike A — node.exe portátil em versions/<semver>/ (D-02, D-03)

**Objetivo:** provar que o `node.exe` oficial v24 LTS, com hash conferido contra o
`SHASUMS256.txt` de nodejs.org, roda a partir de um layout `versions/<semver>/runtime/` sem Node
global no `PATH` e sem instalação, incluindo um smoke test de loopback.

Todo o spike rodou em `%TEMP%\pmo-spikes-f1\node-portable`, fora de qualquer árvore Git:

```text
$ git -C %TEMP%\pmo-spikes-f1 rev-parse --show-toplevel
fatal: not a git repository (or any of the parent directories): .git
(exit 128 — confirma que a raiz do spike está fora de qualquer repositório)
```

**1. Release v24 mais nova (`nodejs.org/dist/index.json`):**

```text
v24.21.0 Krypton 2026-09-07
v24.20.0 Krypton 2026-08-26
v24.19.0 Krypton 2026-08-03
v24.18.1 Krypton 2026-07-28
v24.18.0 Krypton 2026-06-23
v24.17.0 Krypton 2026-06-17
```

v24.21.0 é confirmada como a mais nova (a mesma usada pela pesquisa da Fase 1) e todas as cinco
entradas mais recentes trazem `lts: 'Krypton'`.

**2-3. Download e verificação de SHA-256 contra SHASUMS256.txt:**

```text
$ curl -fsSL -o SHASUMS256.txt https://nodejs.org/dist/v24.21.0/SHASUMS256.txt
$ curl -fsSL -o node-v24.21.0-win-x64.zip https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip

$ grep 'node-v24.21.0-win-x64.zip' SHASUMS256.txt
158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541  node-v24.21.0-win-x64.zip

$ sha256sum node-v24.21.0-win-x64.zip
158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541 *node-v24.21.0-win-x64.zip
```

Hash local idêntico ao publicado — **Resultado do passo de integridade:** aprovado; o binário foi
liberado para extração.

**4. Layout `versions/<semver>/runtime/` (PowerShell 5.1 `Expand-Archive`):**

```text
$ powershell.exe -NoProfile -Command "Expand-Archive -Path '.\node-v24.21.0-win-x64.zip' -DestinationPath '.\extracted' -Force"
$ mkdir -p PMO-Tool/versions/9.9.9-spike/runtime
$ cp extracted/node-v24.21.0-win-x64/node.exe PMO-Tool/versions/9.9.9-spike/runtime/
```

Só `node.exe` foi copiado para `runtime/` — `npm`, `npx`, `corepack` e `node_modules` do próprio
Node ficam no zip extraído e não são necessários em runtime (confirma que o footprint mínimo do
D-02 é um único arquivo por versão).

**5. Execução isolada com `PATH` restrito a `C:\Windows\System32` (sem Node global):**

```text
$ powershell.exe -NoProfile -Command "$env:PATH = 'C:\Windows\System32'; & <runtime>\node.exe -p \"process.version + ' ' + process.arch\""
VERSION_OUTPUT=v24.21.0 x64
COLD_START_MS=5857
RUN1_MS=79
RUN2_MS=77
```

Saída `v24.21.0 x64` confirma D-02/D-03 — o runtime funciona isolado, sem instalação. A primeira
execução (5857 ms) foi muito mais lenta que as duas seguintes (~78 ms); é o padrão de um
antivírus/Windows Defender escaneando um executável recém-extraído na primeira execução, não um
custo de startup do próprio Node — relevante para o argumento de atrito com antivírus do D-02
contra SEA (single executable application), já que aqui o custo é um scan único, não repetido.

**6. Smoke test de loopback (servidor HTTP inline, `127.0.0.1:18091`):**

```text
$ curl -s http://127.0.0.1:18091/
ok

$ netstat -ano | grep 18091   # antes de parar
  TCP    127.0.0.1:18091        0.0.0.0:0              LISTENING       4420

$ powershell.exe -NoProfile -Command "Stop-Process -Id 4420 -Force"
$ netstat -ano | grep 18091   # depois de parar
  TCP    127.0.0.1:57949        127.0.0.1:18091        TIME_WAIT       0
```

`curl` retornou `ok` via loopback puro. Depois de parar o processo não há mais entrada
`LISTENING` na porta 18091 — só resta um `TIME_WAIT` transitório do socket cliente já fechado
(estado normal do TCP, não um servidor ainda escutando); a porta está livre para um novo bind.

**7. Tamanho e assinatura Authenticode:**

```text
$ du -h node-v24.21.0-win-x64.zip
36M

$ du -h PMO-Tool/versions/9.9.9-spike/runtime/node.exe
90M

$ powershell.exe -NoProfile -Command "Get-AuthenticodeSignature -FilePath '<runtime>\node.exe'"
STATUS=Valid
SIGNER=CN=OpenJS Foundation, O=OpenJS Foundation, L=San Francisco, S=California, C=US
```

**Resultado:** aprovado — hash conferido, execução isolada sem Node global, loopback funcional,
assinatura Authenticode válida (OpenJS Foundation).

**Implicação:** o release ZIP cresce ~36 MB por plataforma-alvo se `node.exe` for empacotado
comprimido na mesma taxa do zip oficial (~90 MB descomprimido, apenas o `node.exe`, sem
`npm`/`npx`); o mecanismo de verificação de hash é o mesmo padrão que
`Assert-PmoReleaseManifest` já aplica aos artefatos de release do próprio PMO Tool
(`tools/portable-common.ps1`) — o download futuro do `node.exe` no empacotamento de release deve
seguir esse padrão. A assinatura Authenticode é válida (OpenJS Foundation), mas isso não elimina o
scan único do antivírus na primeira execução; ainda assim é evidência a favor do D-02 (distribuição
portátil oficial) sobre um SEA sem assinatura reconhecida, que tende a sofrer mais atrito de
SmartScreen/antivírus por reputação, não menos.

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
