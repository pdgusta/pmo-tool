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

Esta fase primeiro mediu o protótipo v1.5.0 como ele é hoje, sem julgamento: os módulos maiores
(`10-model.js` com 2.723 linhas, `62-views-principais.js` com 2.059), um build de mediana 176 ms,
e uma cobertura de testes concentrada — só `10-model.js` tem teste de comportamento real, os
outros treze módulos de `src/js/` não têm. Depois disso vieram três spikes descartáveis, fora do
repositório, para provar cada decisão arriscada com evidência antes de ratificá-la (D-15): o
Spike A mostrou que o `node.exe` oficial roda isolado, sem instalação, com hash e assinatura
Authenticode conferidos; o Spike B mostrou que Vite com `vite-plugin-singlefile` gera um único
HTML autocontido, menor que o `build.ps1` de hoje; e o Spike C mostrou uma ponte stdio fina
repassando corretamente chamadas para um servidor MCP Streamable HTTP, com token e validação de
Host/Origin funcionando — e um achado importante: a proteção contra DNS rebinding do SDK vem
desligada por padrão, então a Fase 14 precisa de um middleware próprio. Com essa evidência em
mãos, o dono do projeto ratificou em 27/09/2026 (D-14, este L1 novo é o registro oficial) o Node
24 LTS como motor de desenvolvimento, CI e produção, e o transporte MCP (Streamable HTTP mais a
ponte stdio). As guardrails do CLAUDE.md foram reescritas de acordo: a G1 (HTML único) continua
valendo até a Fase 13, quando o servidor Node assume a fonte da verdade; a G2 passa de "zero
dependências" para uma lista permitida com licença verificada item a item; a G3 troca "sem Node"
por Node 24 LTS portátil dentro da release, com PowerShell 5.1 restrito aos três scripts de
entrada; e a G6 troca a antiga proibição de integração Microsoft por login delegado da PMO, sem
chave própria do app. As divergências conhecidas entre código e CLAUDE.md (D-17) foram corrigidas
já nesta fase quando o custo era baixo — o contrato real de `reconciliar()` e a lista completa de
rotas administrativas — e as demais (pino de Node do CI, o SKILL.md do app, a proibição de ESM, a
menção a `build.ps1` na Estrutura e a frase do README sobre runtime) ficaram registradas na tabela
abaixo com a fase certa para corrigi-las. Fica propositalmente para depois (D-16) a escolha do
framework de UI — a Fase 8 decide isso junto com a PMO, a partir dos candidatos e critérios listados
em `### Framework de UI`. Por fim, toda a reescrita de guardrails e as correções do D-17 aconteceram
na execução desta fase, na branch e via PR (D-18), não durante a conversa que produziu as decisões.

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

### Spike B — Vite + vite-plugin-singlefile (D-05, D-07, D-08)

**Objetivo:** provar que Vite + `vite-plugin-singlefile` gera um único HTML autocontido a partir
de uma cópia de `src/`, comparando tempo e tamanho com a mediana de `build.ps1` medida em
`## Medições do protótipo` (176 ms, 957,4 KB).

Todo o spike rodou em `%TEMP%\pmo-spikes-f1\vite-singlefile`, fora de qualquer árvore Git (mesma
confirmação `git -C ... rev-parse --show-toplevel` com exit 128 do Spike A).

**1. Instalação exata, com os flags aprovados no gate de legitimidade:**

```text
$ npm init -y
$ npm install --save-exact --ignore-scripts --no-audit --no-fund -D vite@8.3.1 vite-plugin-singlefile@2.3.3
added 22 packages in 7s

$ npm ls --depth=0
vite-singlefile@1.0.0 %TEMP%\pmo-spikes-f1\vite-singlefile
├── vite-plugin-singlefile@2.3.3
└── vite@8.3.1
```

Instalação limpa com versões exatas; nenhum binding nativo faltou sob `--ignore-scripts` — o
fallback `npm rebuild` não foi necessário.

**2-5. Cópia de `src/`, geração de `index.html`/`main.js`/`vite.config.mjs`:**

`src/shell.html`, `src/css/*.css` e `src/js/*.js` foram copiados (uso só-leitura do repositório)
para a pasta do spike. `<!--@inject:css-->` foi substituído por nada, `<!--@inject:js-->` por
`<script type="module" src="/main.js"></script>`, e `@@BUILD_VERSION@@` por `0.0.0-spike`.
`main.js` importa os 4 arquivos de `src/css/` e depois os 15 de `src/js/`, na mesma ordem por
prefixo numérico que `build.ps1` usa. `vite.config.mjs` usa `viteSingleFile()` como único plugin,
saída em `dist/`.

**6. Três builds cronometrados (`npx vite build`):**

```text
RUN1 exit=0 ms=6459
RUN2 exit=0 ms=1961
RUN3 exit=0 ms=2443

# tempo interno reportado pelo próprio Vite, por rodada:
✓ built in 1.45s   (RUN1)
✓ built in 363ms   (RUN2)
✓ built in 182ms   (RUN3)
```

| Build | Mediana (3 rodadas) | Tamanho da saída |
|---|---|---|
| `build.ps1` (Medições do protótipo) | **176 ms** | 957,4 KB |
| Vite + `vite-plugin-singlefile` (este spike) | **2.443 ms** (wall-clock, inclui start do processo `npx`/Node) | ~581 KB (594.978 bytes) |

Nenhuma rodada falhou por binding nativo ausente — `npm rebuild` não foi acionado. O tempo
interno do Vite (coluna "built in", medido pelo próprio bundler, sem o overhead de iniciar o
processo Node/`npx`) cai para 182 ms na terceira rodada, na mesma ordem de grandeza da mediana de
`build.ps1`; a maior parte da diferença de wall-clock vem do custo de processo, não da
transformação em si.

**7. Autocontenção do `dist/index.html` (23 módulos transformados):**

```text
$ grep -o '<script' dist/index.html | wc -l
1

$ grep -oE '(src|href)="(https?:)?//[^"]*"' dist/index.html | wc -l
0

$ grep -oE "@import\s+(url\()?['\"]?(https?:)?//" dist/index.html | wc -l
0

$ node --check inline.mjs
PARSE_OK
```

Um único `<script>`, zero referências externas `src=`/`href=` para `http(s)://`/`//`, zero
`@import` remoto — mesmo critério que `build.ps1` já aplica. O script inline extraído
(`inline.mjs`, 527.202 caracteres) passa `node --check` sem erro de parse.

**8. Sinal de modo estrito ESM para a Fase 4 (cada `src/js/*.js` como `.mjs`):**

```text
$ for f in src/js/*.js; do node --check "strict/$(basename "$f" .js).mjs"; done
TOTAL_FAILURES=0 of 15
```

Nenhum dos 15 arquivos de `src/js/` falhou `node --check` quando tratado como módulo ESM estrito
(0 é resultado válido) — sinal de que a conversão da Fase 4 não deve encontrar incompatibilidade
sintática de nível ESM nesses arquivos, embora isso não teste `import`/`export` real nem execução
em navegador.

**9. Limite explícito deste spike:** a equivalência de comportamento em runtime de navegador **não
é provada aqui** (não há navegador nesta execução) — isso é o gate de paridade da Fase 4 (MOD-01)
contra `build.ps1`, mais a suíte Playwright da Fase 3.

**Resultado:** aprovado — Vite + `vite-plugin-singlefile` gera um único HTML autocontido a partir
de uma cópia de `src/`, sem referência externa, menor que a saída de `build.ps1` (~581 KB vs 957,4
KB), com todos os módulos passando checagem sintática ESM.

**Implicação:** para D-05/D-08, a Fase 4 pode migrar para Vite mantendo o contrato de HTML único
sem regressão de autocontenção; o gate de paridade real (comportamento no navegador, não só
estrutura do HTML) fica para a Fase 4 (MOD-01) e a suíte Playwright da Fase 3 — este spike só
prova a mecânica de bundling e a saída estática. Para D-07, este spike só bundlou código próprio
de `src/`; não incluiu nenhuma dependência de terceiros no navegador (ex.: `@e965/xlsx`) — a
prova de que uma dependência npm real fica embutida no HTML pelo bundler (e não como CDN) ainda
precisa ser verificada quando essa dependência for de fato adicionada (Fase 7).

### Spike C — transporte MCP: Streamable HTTP + ponte stdio (D-10, D-11, D-12)

**Objetivo:** provar que um cliente MCP que só fala stdio lista e chama ferramentas de um
servidor Streamable HTTP por meio de uma ponte stdio que apenas repassa mensagens (D-10), com
autenticação por token local e validação de Host/Origin (D-12), subida automática do servidor
pela ponte (D-11) e erro bloqueante para porta ocupada (G4).

Todo o spike rodou em `%TEMP%\pmo-spikes-f1\mcp-transport`, fora de qualquer árvore Git (mesma
confirmação `git -C ... rev-parse --show-toplevel` com exit 128 dos Spikes A e B). O gate de
legitimidade de `zod@4.6.5` e `@modelcontextprotocol/sdk@1.30.1` já estava aprovado
(`"aprovado"`, plano 01-03) — este spike reaproveitou essa aprovação sem repetir o
`checkpoint:human-verify`.

**1. Instalação exata, com os flags já aprovados no gate de legitimidade:**

```text
$ npm init -y
$ (definir "type": "module" no package.json gerado)
$ npm install --save-exact --ignore-scripts --no-audit --no-fund @modelcontextprotocol/sdk@1.30.1 zod@4.6.5
added 94 packages in 9s

$ npm ls --depth=0
mcp-transport@1.0.0 %TEMP%\pmo-spikes-f1\mcp-transport
├── @modelcontextprotocol/sdk@1.30.1
└── zod@4.6.5
```

Instalação limpa com versões exatas; nenhum binding nativo faltou sob `--ignore-scripts`.

**2. Caminhos de módulo confirmados no `exports` e nas declarações de tipo do pacote instalado**
(o `package.json` do SDK expõe um catch-all `"./*"`, então cada subpath abaixo resolve para
`dist/esm/<subpath>.js`; nomes de classe confirmados via `grep 'declare class'` nos `.d.ts`
correspondentes):

| Módulo | Caminho de import | Classe/uso |
|---|---|---|
| Servidor MCP (tools) | `@modelcontextprotocol/sdk/server/mcp.js` | `McpServer` — `registerTool(nome, config, cb)` (`tool()` está `@deprecated`) |
| Servidor Streamable HTTP | `@modelcontextprotocol/sdk/server/streamableHttp.js` | `StreamableHTTPServerTransport` — wrapper Node.js (`IncomingMessage`/`ServerResponse`) sobre `WebStandardStreamableHTTPServerTransport`; usa `@hono/node-server` internamente |
| Servidor stdio | `@modelcontextprotocol/sdk/server/stdio.js` | `StdioServerTransport` |
| Cliente Streamable HTTP | `@modelcontextprotocol/sdk/client/streamableHttp.js` | `StreamableHTTPClientTransport(url, { requestInit })` — `requestInit.headers` carrega o `Authorization: Bearer <token>` |
| Cliente stdio | `@modelcontextprotocol/sdk/client/stdio.js` | `StdioClientTransport({ command, args, env?, cwd? })` — spawna o processo da ponte |
| Cliente | `@modelcontextprotocol/sdk/client/index.js` | `Client(clientInfo, options?)` — `connect()`, `listTools()`, `callTool()` |

Nenhum nome de classe ou caminho divergiu do que a pesquisa (ARCHITECTURE.md) previa; a única
observação nova é que `StreamableHTTPServerTransport` (Node) é hoje um wrapper fino sobre
`WebStandardStreamableHTTPServerTransport` (Web Standards `Request`/`Response`), não uma
implementação HTTP nativa separada — irrelevante para o contrato de `handleRequest(req, res,
parsedBody?)` que o servidor do produto vai chamar.

**3. Papel de cada arquivo (só comandos e papéis — nenhum código-fonte colado aqui):**

- `state/mcp-token.txt` — token de 32 bytes em hex (64 caracteres), gerado com `crypto.randomBytes(32)`, nunca impresso neste documento.
- `server.mjs` — `node:http` em `127.0.0.1:18090` (porta de teste; 8090 é do app, G4); `GET /health`; `/mcp` confere `Authorization: Bearer <token>` antes de qualquer coisa (401 se ausente/errado), depois cria um `McpServer` + `StreamableHTTPServerTransport` novos por requisição (modo stateless) e registra as ferramentas `ping` (sem argumento, retorna `pong`) e `eco` (schema zod `{ texto: string }`, retorna o texto).
- `bridge.mjs` — a ponte stdio fina do D-10: lê o token do arquivo, cria `StdioServerTransport` + `StreamableHTTPClientTransport` apontando para `http://127.0.0.1:18090/mcp` com o cabeçalho `Authorization`, inicia os dois, repassa toda mensagem de um para o outro nos dois sentidos e fecha ambos quando qualquer um fecha. Não importa nenhuma classe de hospedagem de ferramentas do lado servidor, não registra ferramenta nenhuma e não lê nenhum dado além do arquivo de token.
- `client.mjs` — `Client` do SDK com `StdioClientTransport` que spawna `node bridge.mjs` (via `process.execPath`), chama `listTools()`, `callTool` para `ping` e `callTool` para `eco` com `texto` = `olá`; imprime cada resultado como JSON.

**4. Execução do caminho feliz (servidor em background, depois `node client.mjs`):**

```text
$ node server.mjs &
SERVER_READY host=127.0.0.1 port=18090 dnsRebindingProtection=false

$ node client.mjs
TOOLS=["ping","eco"]
PING_RESULT={"content":[{"type":"text","text":"pong"}]}
ECO_RESULT={"content":[{"type":"text","text":"olá"}]}
```

O cliente que só fala stdio (spawnou `bridge.mjs` como subprocesso) listou as duas ferramentas
registradas no servidor Streamable HTTP e recebeu `pong` e `olá` de volta — a ponte relay-only
funcionou nos dois sentidos sem nenhuma lógica de ferramenta própria.

**5. Evidência de que a ponte é fina (`wc -l bridge.mjs`):**

```text
$ wc -l bridge.mjs
43 bridge.mjs

$ grep -c 'McpServer' bridge.mjs
0
```

43 linhas no total (imports, configuração de transporte, encaminhamento de mensagens nos dois
sentidos e fechamento conjunto) e zero ocorrências da classe de hospedagem de ferramentas do
servidor — a ponte não carrega lógica de ferramenta nem acesso a dados, só repassa.

### Spike C — negativos e ciclo de vida: token, Host/Origin, auto-start, porta ocupada, limpeza (D-11, D-12, G4)

Continuação do Spike C acima, com `server.mjs` rodando em `127.0.0.1:18090` (porta de teste; nunca
8090, G4). Uma observação de ferramenta, não de comportamento do servidor: o `fetch()` global do
Node (undici) trata `Host` como cabeçalho proibido e o sobrescreve silenciosamente — os testes de
cabeçalho forjado abaixo usam `node:http` diretamente (`probe.mjs`, script do spike, não citado
aqui em código-fonte) para garantir que o cabeçalho realmente chega ao servidor.

**Achado central para a Fase 14 (resolve a premissa A3 do RESEARCH):** o SDK `1.30.1` mantém
`enableDnsRebindingProtection` (e as listas `allowedHosts`/`allowedOrigins` que o acompanham) em
`WebStandardStreamableHTTPServerTransportOptions`, mas o **valor padrão é `false`** — a proteção
fica **desligada por padrão**, exatamente como a citação do GHSA-w48q-cv73-mx4w em
`.planning/research/PITFALLS.md` alertava; a Assumption A3 do RESEARCH (que sugeria proteção
ligada por padrão) está **reprovada** pela evidência direta do pacote instalado. Mais além: o
`.d.ts` do próprio pacote marca as três opções (`allowedHosts`, `allowedOrigins`,
`enableDnsRebindingProtection`) como `@deprecated`, com a nota "Use external middleware for
[host/origin validation / DNS rebinding protection] instead" — ou seja, o SDK não promete manter
esse mecanismo interno; a Fase 14 deve tratar a validação de Host/Origin como responsabilidade de
um middleware do próprio servidor Node do produto, não como algo que basta "ligar" no SDK.

| Cenário | Esperado | Obtido |
|---|---|---|
| (a) `/mcp` sem cabeçalho `Authorization` | `401` | `401` (`{"error":"unauthorized"}`) |
| (a) `/mcp` com token errado | `401` | `401` (`{"error":"unauthorized"}`) |
| (b) `Host: evil.example:18090`, opções padrão (proteção desligada) | aceito (proteção desligada por padrão) | `200` — requisição processada normalmente |
| (b) `Origin: http://evil.example`, opções padrão (proteção desligada) | aceito (proteção desligada por padrão) | `200` — requisição processada normalmente |
| (b) `Host: evil.example:18090`, com `allowedHosts`/`enableDnsRebindingProtection: true` | recusa 4xx | `403` (`"Invalid Host header: evil.example:18090"`) |
| (b) `Origin: http://evil.example`, com `allowedOrigins`/`enableDnsRebindingProtection: true` | recusa 4xx | `403` (`"Invalid Origin header: http://evil.example"`) |
| (b) controle positivo: `Host`/`Origin` corretos (`127.0.0.1:18090`), mesmas opções ligadas | aceito | `200` — requisição processada normalmente |
| (c) auto-start: servidor parado, `bridge.mjs` verifica `/health`, sobe `server.mjs`, espera o health | ponte sobe o servidor e a chamada completa | `BRIDGE_AUTOSTART_MS=527`; `listTools`/`ping`/`eco` completaram normalmente depois |
| (d) porta ocupada: outro processo Node escutando em 18090 respondendo `ocupado` em `/` | erro claro, saída não-zero, nenhum segundo servidor | mensagem "porta 18090 ocupada por outro processo (resposta inesperada em /health)" no stderr da ponte; `client.mjs` terminou com código de saída `1`; `GET /` continuou respondendo `ocupado` (nenhum segundo servidor subiu) |

**1-2. Token (a):**

```text
$ (sem Authorization) POST /mcp initialize
STATUS=401 BODY={"error":"unauthorized"}

$ (Authorization: Bearer <token-errado>) POST /mcp initialize
STATUS=401 BODY={"error":"unauthorized"}
```

**3-5. Host/Origin (b), primeiro com as opções padrão do `StreamableHTTPServerTransport`
(nenhuma passada — `enableDnsRebindingProtection` não especificado, portanto `false`):**

```text
$ (Host: evil.example:18090, token valido) POST /mcp initialize
HOST_FORJADO_OFF STATUS=200 BODY=event: message
data: {"result":{"protocolVersion":"2025-06-18",...}}

$ (Origin: http://evil.example, token valido) POST /mcp initialize
ORIGIN_FORJADO_OFF STATUS=200 BODY=event: message
data: {"result":{"protocolVersion":"2025-06-18",...}}
```

Depois, reiniciando o servidor com `allowedHosts: ['127.0.0.1:18090','localhost:18090']`,
`allowedOrigins: ['http://127.0.0.1:18090','http://localhost:18090']` e
`enableDnsRebindingProtection: true` passados ao construtor de `StreamableHTTPServerTransport`:

```text
$ (Host: evil.example:18090, token valido) POST /mcp initialize
HOST_FORJADO_ON STATUS=403 BODY={"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host header: evil.example:18090"},"id":null}

$ (Origin: http://evil.example, token valido) POST /mcp initialize
ORIGIN_FORJADO_ON STATUS=403 BODY={"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin header: http://evil.example"},"id":null}

$ (Host: 127.0.0.1:18090, Origin: http://127.0.0.1:18090, token valido — controle positivo)
CONTROLE_POSITIVO_ON STATUS=200 BODY=event: message
data: {"result":{"protocolVersion":"2025-06-18",...}}
```

O controle positivo confirma que a rejeição de `Host`/`Origin` forjados não é um efeito colateral
de outra coisa quebrada — a mesma configuração aceita a requisição legítima e só rejeita as
forjadas.

**6. Auto-start (c) — `bridge.mjs` estendido para checar `/health` antes de conectar:**

```text
$ (servidor parado, nenhum listener em 18090) node client.mjs
BRIDGE_AUTOSTART_MS=527
TOOLS=["ping","eco"]
PING_RESULT={"content":[{"type":"text","text":"pong"}]}
ECO_RESULT={"content":[{"type":"text","text":"olá"}]}
```

A ponte detectou que `/health` não respondia, subiu `server.mjs` (`spawn` detached, equivalente ao
`pmo.ps1` sem browser no produto), sondou `/health` a cada 250 ms e, 527 ms depois, seguiu com o
relay normalmente — o cliente recebeu os mesmos resultados do caminho feliz do Task 1.

**7. Porta ocupada (d) — `node:http` simples escutando em 18090 e respondendo `ocupado`:**

```text
$ node occupy.mjs &
OCCUPY_READY

$ node client.mjs
porta 18090 ocupada por outro processo (resposta inesperada em /health)
McpError: MCP error -32000: Connection closed
    at ... (encadeamento de erro do SDK ao ver o subprocesso da ponte fechar)
CLIENT_EXIT=1

$ curl-equivalente GET http://127.0.0.1:18090/   # depois da tentativa
BODY=ocupado
```

A ponte nunca chega a chamar `spawn` para um segundo `server.mjs` porque `isOurServer(body)` já
identifica pela primeira resposta de `/health` (que não é `{ok:true, app:'pmo-spike'}`) que a
porta pertence a outro processo — imprime o erro em pt-BR no stderr e sai com código `1` antes de
qualquer tentativa de subida. O stack trace do `McpError` que aparece depois vem do próprio SDK
cliente reagindo ao fechamento do subprocesso da ponte (efeito colateral esperado de `client.mjs`
não tratar esse caso graciosamente neste spike, não um segundo servidor). `GET /` continuou
respondendo `ocupado` depois da tentativa — confirma que nenhum segundo servidor assumiu a porta.

**8. `clientInfo` visto pelo servidor (D-13):**

```text
D13_CLIENT_INFO={"name":"pmo-spike-client","version":"0.0.0-spike"}
```

O servidor logou o `clientInfo.name`/`version` exatamente como o cliente os declarou na chamada
`initialize` — confirma que a autoria (`tipo=agente` + `clientInfo`) do D-13 é extraível
diretamente da mensagem JSON-RPC de handshake, sem instrumentação adicional no SDK.

**9. Limpeza:** todo processo Node do spike (`server.mjs` nas três configurações, `occupy.mjs`,
o subprocesso auto-iniciado da ponte) foi parado com `Stop-Process -Id <pid> -Force` usando o PID
real reportado por `netstat -ano`, não o PID do job do shell. Confirmação final:

```text
$ netstat -ano | grep -E ':(18090|18091) .*LISTENING'
(sem saída — nenhum listener)
```

Só restam entradas `TIME_WAIT` transitórias de sockets cliente já fechados (mesmo padrão inócuo
observado no Spike A) — nenhuma entrada `LISTENING` na porta 18090 ou 18091.

**Resultado:** aprovado — os quatro mecanismos (token, Host/Origin, auto-start, porta ocupada)
comportaram-se como o D-10/D-11/D-12/G4 exigem, com uma ressalva importante sobre o padrão do SDK
registrada como achado para a Fase 14.

**Implicação:**
- **D-10** (ponte relay-only): viável — a ponte de 43/111 linhas (Task 1/Task 2) nunca importou
  classe de hospedagem de ferramentas do servidor e relayou corretamente nos dois sentidos.
- **D-11** (custo do auto-start): ~527 ms nesta máquina para subir o processo e responder ao
  primeiro `/health` — nem instantâneo nem lento a ponto de preocupar uma PMO abrindo um cliente
  MCP; o produto deve orçar essa espera na UX da ponte real.
- **D-12** (token + Host/Origin): o token local funciona como projetado (401 sem ele/com ele
  errado); **a Fase 14 precisa habilitar Host/Origin explicitamente** — `allowedHosts`,
  `allowedOrigins` e `enableDnsRebindingProtection: true` no `StreamableHTTPServerTransport` — e,
  por essas três opções estarem marcadas `@deprecated` no SDK `1.30.1` a favor de "middleware
  externo", **a Fase 14 deve implementar a validação de Host/Origin como middleware do próprio
  servidor Node do produto** (checagem antes de repassar ao SDK), não confiar apenas nas opções
  internas do transporte, que podem ser removidas em versão futura do SDK.
- **D-13** (autoria): `clientInfo` do handshake MCP é suficiente para popular
  `autor.tipo='agente'` + `clientInfo` no audit log, sem trabalho extra de instrumentação.

## Decisões ratificadas

Lista as decisões D-01 a D-13 (Node 24 LTS, distribuição do runtime, transporte MCP, acesso
Microsoft delegado), cada uma com data, justificativa, efeito nas fases seguintes e
reversibilidade.

### D-01 — Node.js 24 LTS em dev/CI e no servidor corporativo

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** escolher o motor do carro antes de desenhar a carroceria: tudo o que
vem depois é montado em volta dele.

**Decisão:** Node.js 24 LTS é o runtime de **dev/CI e do servidor da edição corporativa (v2)**; a
edição local não troca de runtime (`serve.ps1` continua em PS 5.1, D-27). O MCP SDK oficial,
`@azure/msal-node` e o servidor autoritativo exigem Node e por isso vivem na v2 (conector
congelado até o ADR corporativo, D-23).

**Justificativa:** O MCP SDK oficial (`@modelcontextprotocol/sdk`) e `@azure/msal-node` (fluxo
device code, confirmado Node/desktop-only — não existe em `msal-browser`) só rodam em Node; o
servidor autoritativo (v2 corporativa) também é Node. As medições desta fase (seção `## Medições
do protótipo`) já mostram que `tests/Run-Tests.ps1` **exige** Node de desenvolvimento hoje
(linhas 22-28, lança erro sem `$NodePath`) — a premissa antiga da G2 ("não existe Node nesta
máquina") já era falsa antes desta ratificação.

**Efeito nas fases seguintes:** dev/CI usam Node 24 quando uma fase do v1.6 adotar tooling; o
servidor corporativo, o MCP e o conector são construídos sobre Node na v2 (congelado até o ADR
corporativo, D-23); nenhuma fase do v1.6 troca o runtime local (D-27).

**Reversibilidade:** one-way para a v2 corporativa — servidor, MCP e conector são planejados
sobre Node; desfazer exige reescrevê-los. Na edição local nada depende de Node em runtime (D-27).

**Alternativas descartadas:** Bun (mais rápido, single-binary por padrão, mas `@azure/msal-node`
e `@byteink/mppjs` têm binários nativos validados contra Node, não Bun — adicionaria risco de
compatibilidade a duas dependências já incertas ao mesmo tempo; revisitar quando a compatibilidade
com Bun for confirmada independentemente); .NET single-file executable em C# (empacotamento
single-exe igualmente bom e MSAL.NET maduro, mas perde totalmente o caminho de reuso de
`PMO.model`/`PMO.util` — são JS, não portáveis para C# sem reescrita — e não há SDK MCP oficial
para .NET tão maduro/central quanto o TypeScript; só reconsiderar se uma fase futura de "repensar
a UI" decidir abandonar o modelo de domínio JS por completo); "Node nunca fora de dev/CI" (travaria
o MCP e o conector Microsoft da v2).

Revista por D-27 em 27/09/2026.

### D-02 — node.exe oficial portátil: permitido, empacotado só quando uma fase justificar

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** a bateria portátil já foi testada e pode entrar na caixa, mas só entra
quando uma viagem específica precisar dela.

**Decisão:** o Node é permitido na máquina da PMO como o `node.exe` oficial portátil em
`versions/<semver>/`, com versão e SHA-256 declarados no `release.json` e na allowlist do ZIP,
nada instalado globalmente e rollback trocando o Node junto com o código (coerente com G11/G12);
mas só entra no pacote quando uma fase precisar e justificar o uso por proposta ao Maestro — até
lá, nenhum release leva `node.exe` (o empacotamento automático desta ratificação original não
está em vigor). SEA e Node instalado globalmente continuam descartados.

**Justificativa:** Spike A comprovou o mecanismo ponta a ponta: hash local do
`node-v24.21.0-win-x64.zip` idêntico ao `SHASUMS256.txt` publicado; `node.exe` copiado sozinho
para `versions/9.9.9-spike/runtime/` roda isolado com `PATH` restrito a `C:\Windows\System32`
(sem Node global no `PATH`), retornando `v24.21.0 x64`; assinatura Authenticode válida
(`CN=OpenJS Foundation`); smoke test de loopback (`127.0.0.1:18091`) respondeu `ok` e a porta
ficou livre depois do processo parar. O mecanismo de verificação de hash é o mesmo padrão que
`Assert-PmoReleaseManifest` já aplica aos artefatos de release do PMO Tool
(`tools/portable-common.ps1`).

**Efeito nas fases seguintes:** quando uma fase justificar `node.exe`, ela acrescenta o arquivo ao
`release.json` e à allowlist do ZIP, o rollback troca o Node junto com o código e o ZIP de release
cresce ~36 MB por plataforma-alvo (footprint mínimo: um único `node.exe`, sem
`npm`/`npx`/`corepack`); hoje a allowlist de runtime de `tools/portable-common.ps1` não tem
`node.exe`.

**Reversibilidade:** costly — muda o contrato do pacote e do manifesto de release quando for
adotado.

**Alternativas descartadas:** SEA / single executable application (build/assinatura mais caros,
mais atrito com antivírus/SmartScreen por reputação — o Spike A mostrou que mesmo o `node.exe`
assinado sofre um scan único do antivírus na primeira execução, e um SEA sem assinatura
reconhecida tende a sofrer mais, não menos); Node instalado globalmente (versão fora do controle
da release).

Revista por D-27 em 27/09/2026.

### D-03 — PowerShell 5.1 só no bootstrap e no instalador

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** a porta de entrada continua a mesma chave que já funciona em qualquer
Windows; só o que está lá dentro muda.

**Decisão:** Em PowerShell 5.1 ficam **apenas** o bootstrap e o instalador: `pmo.ps1`,
`atualizar.ps1`, `pmo-instalar.ps1` (entrada sem pré-requisito em qualquer Windows; bootstrap
estável pela G12). Na edição local, servidor e updater continuam em PowerShell 5.1 e não trocam de
runtime (D-27); a migração de servidor e updater para Node só existe na edição corporativa (v2) e,
se o updater transacional (journals, fail-closed) migrar, migra com os mesmos testes de falha
simulada.

**Justificativa:** G12 exige um bootstrap estável que resolve `active.json` sem pré-requisito —
manter `pmo.ps1`, `atualizar.ps1` e `tools/pmo-instalar.ps1` em PS 5.1 preserva essa garantia em
qualquer Windows sem instalar nada primeiro. O updater transacional já tem journals e testes de
falha simulada (`tests/Test-UpdaterRecovery.ps1`) provados em PowerShell; migrar sem repetir essa
cobertura arriscaria regressão silenciosa no G8/G12.

**Efeito nas fases seguintes:** na edição local, `serve.ps1` e o updater ficam em PowerShell 5.1
(D-27); a troca de runtime é da v2 corporativa e repete os mesmos testes de falha simulada que já
existem hoje.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

Reancorada por D-35 em 27/09/2026.

### D-04 — G3 deixa de valer para o repositório

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** a regra antiga vale só para a porta de entrada; o resto da casa pode
usar a ferramenta nova, mas ninguém se muda sem uma fase que justifique a mudança.

**Decisão:** A G3 ("PS 5.1, sem Node") **deixa de valer imediatamente** ao ratificar. Node passa
a ser permitido em qualquer parte do repositório. A G3 em vigor é a de duas edições (D-27): nenhuma
instalação real recebe o runtime Node enquanto nenhuma fase justificar o empacotamento do
`node.exe`, e a edição local não troca de runtime; a regra de PS 5.1 continua valendo para os três
scripts de D-03 e, na edição local, também para o servidor e o updater.

**Justificativa:** G12 (bootstrap estável) e os journals do updater exigem que a transição de
runtime seja testada antes de qualquer instalação real receber o Node — o mesmo rigor que hoje
protege trocas de versão de código.

**Efeito nas fases seguintes:** Node passa a ser permitido em qualquer parte do repositório a
partir de agora, mas a G3 em vigor é a de duas edições (D-27): nenhuma instalação real recebe o
runtime Node enquanto nenhuma fase justificar o empacotamento do `node.exe`, e a edição local não
troca de runtime; a regra de PS 5.1 continua valendo para `pmo.ps1`, `atualizar.ps1` e
`tools/pmo-instalar.ps1` e, na edição local, também para o servidor e o updater.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

Reancorada por D-35 em 27/09/2026.

### D-05 — G1: HTML único até a Fase 13

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** a casa continua com uma porta de entrada só até o dia em que o servidor
passar a morar dentro dela; aí a planta é revista.

**Decisão:** G1 reescrita: a interface continua **um único HTML autocontido até a Fase 13** (Vite
+ `vite-plugin-singlefile` na Fase 4, com paridade contra `build.ps1`); a G1 é **revisada na Fase
13**, quando o servidor Node vira fonte da verdade. Registrar isso explicitamente como gatilho de
revisão.

**Justificativa:** Spike B provou que Vite + `vite-plugin-singlefile` gera um único HTML
autocontido (1 `<script>`, zero referências externas `src=`/`href=` para `http(s)://`/`//`, zero
`@import` remoto) a partir de uma cópia de `src/`, menor que a saída de `build.ps1` (~581 KB vs
957,4 KB) — a migração de tooling da Fase 4 não perde a autocontenção do G1.

**Efeito nas fases seguintes:** Fase 4 (Vite + singlefile; o gate de paridade real de
comportamento no navegador, não só estrutura do HTML, fica para MOD-01 e a suíte Playwright da
Fase 3); Fase 13 (revisão explícita da G1 quando o servidor Node vira fonte da verdade).

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-06 — G2: dependências por lista permitida

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** nada entra pela porta dos fundos — toda peça nova passa pela portaria
(a lista aprovada) antes de entrar na casa.

**Decisão:** G2 reescrita — política de dependências por **lista permitida + regras**: só entram
dependências aprovadas na avaliação (lista no documento); dependência nova = proposta ao Maestro
(regra 8 do time); lockfile commitado; licença compatível com open source (MIT/Apache-2.0/BSD/ISC
— verificar cada item); zero CDN e zero fetch externo em runtime. A lista inicial sai da
avaliação (base: `.planning/research/STACK.md`).
**Esclarecimento (01-10):** a regra de runtime acima vale para recursos e dependências: nenhum
script, estilo, fonte, imagem ou pacote é buscado de fora em runtime. Ela não proíbe as duas
chamadas operacionais autorizadas (GitHub Releases no update e na instalação; Microsoft Graph só
pelo conector delegado, D-09), listadas nas **Regras** de `## Dependências aprovadas (G2)`.

**Justificativa:** o gate de legitimidade de pacotes já executado nesta fase (`npm view`
somente leitura para vite, vite-plugin-singlefile, zod e `@modelcontextprotocol/sdk`, com
aprovação humana verbatim "aprovado" antes de qualquer `npm install`) é o modelo operacional
desta regra: toda dependência nova passa pelo mesmo tipo de verificação antes de instalar.

**Efeito nas fases seguintes:** `## Dependências aprovadas (G2)` deste L1 passa a ser a
allow-list referenciada pela G2 reescrita; cada dependência nova é proposta ao Maestro (regra 8)
antes de instalar, com licença verificada (MIT/Apache-2.0/BSD/ISC).

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-07 — Dependências do navegador embutidas no bundle

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** as peças que a interface usa vêm coladas dentro da caixa, não pedidas
por telefone a outra loja toda vez que a casa abre.

**Decisão:** Dependências usadas no navegador (ex.: xlsx, eventual lib de componentes) entram
**embutidas no HTML pelo bundle**; nunca CDN, nunca `<script src>` externo (mesma regra da G1).

**Justificativa:** mesma disciplina de origem única do G1/G4 — nenhuma referência externa em
`src=`/`href=` nem `@import` remoto no HTML final.

**Efeito nas fases seguintes:** quando `@e965/xlsx` ou qualquer lib de componentes de fato for
adicionada (ex.: Fase 7), a prova de que o bundler embute a dependência no HTML (e não a serve
via CDN) precisa ser verificada nesse momento — Spike B só bundlou código próprio de `src/`, sem
nenhuma dependência de terceiros no navegador ainda.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-08 — build.ps1 sai depois da paridade do Vite

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** as duas ferramentas de montagem trabalham lado a lado até a nova provar
que faz o mesmo trabalho; só então a antiga se aposenta.

**Decisão:** `build.ps1` é **removido depois que o Vite provar paridade no CI** (Fase 4). Até lá
coexistem. A G2 reescrita deve dizer isso (e o CLAUDE.md deixa de proibir `npm install` para
desenvolvimento).

**Justificativa:** Spike B mediu que o tempo interno do Vite ("built in", sem o custo de iniciar
o processo `npx`/Node) cai para 182 ms na terceira rodada — mesma ordem de grandeza da mediana de
`build.ps1` (176 ms, seção `## Medições do protótipo`); a maior parte da diferença de wall-clock
(2.443 ms) vem do custo de processo, não da transformação em si. Isso dá confiança de que a Fase
4 pode alcançar paridade sem perder a autocontenção do G1 (D-05).

**Efeito nas fases seguintes:** Fase 4 mede paridade real de `build.ps1` vs Vite (tempo e
comportamento no navegador); só depois `build.ps1` é removido. A paridade condiciona apenas essa
remoção: `npm install` para desenvolvimento já é permitido desde a ratificação (G2, D-01, D-04),
restrito às dependências de `## Dependências aprovadas (G2)` (D-06); é por essa via que a Fase 2
instala `typescript`, `eslint` e `vitest`.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-09 — G6: Microsoft com login delegado

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** a PMO usa o próprio crachá para entrar no prédio da Microsoft; o app
nunca tem uma chave-mestra própria — e se o crachá não funcionar, ainda existe a porta dos
fundos (a pasta sincronizada do OneDrive).

**Decisão:** (já decidido no new-project, só aplicar) G6 reescrita: integração com
SharePoint/OneDrive **com login delegado da PMO**, sem App Registration própria nem permissão de
aplicação no Graph; caminho candidato = client público Microsoft com device code; fallback
garantido = pasta sincronizada pelo OneDrive. Token fora de `data/`, `config/` e `versions/`.
Ponto de extensão continua sendo o conector.
**Correção factual (01-09):** o texto original desta decisão dava um arquivo de conector como já
existente, mas esse arquivo nunca existiu no repositório (ver a tabela de divergências abaixo);
não existe módulo conector no código hoje — ele é criado nas Fases 17–18.

**Justificativa:** `@azure/msal-node` confirma que o fluxo device code é Node/desktop-only (não
existe em `msal-browser`) contra um client público de primeira parte da Microsoft (candidato:
"Microsoft Graph Command Line Tools"); o token do MSAL Node fica no cache persistente do próprio
sistema operacional (DPAPI, por usuário Windows), fora de `data/`, `config/`, `state/` ou
`versions/` — nenhuma dessas árvores entra em snapshot, update-backup ou ZIP de release com o
segredo dentro.
A decisão em si é do usuário, tomada em 26/09/2026 no new-project (substituindo a de
30/07/2026); esta fase a ratificou como D-09 em 27/09/2026, e o cabeçalho da G6 no CLAUDE.md
registra as duas datas.

**Efeito nas fases seguintes:** o conector é criado nas Fases 17–18; não existe código dele hoje.
Nome e local do arquivo do conector são definidos nessas fases; até lá, nenhuma chamada
autenticada à Microsoft existe no código.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

**Alternativas descartadas:** PnP PowerShell (exige App Registration própria desde 09/2024 — não
é mais uma opção delegada-sem-registro).

### D-10 — Transporte MCP: Streamable HTTP + ponte stdio

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** um balcão único de atendimento (o servidor) e um ramal telefônico (a
ponte stdio) que só transfere a ligação, sem atender ninguém por conta própria.

**Decisão:** Ratificado: **Streamable HTTP como endpoint principal** no servidor em
`http://localhost:8090/` (ex.: `/mcp`) **+ ponte stdio fina** que apenas repassa as chamadas ao
endpoint HTTP, sem acessar dados. Preserva a instância única e a fonte da verdade única;
compatível com clientes que só falam stdio. Descartados: só stdio (conflita com a instância
única) e só HTTP (exige adaptador de terceiros para clientes stdio).

**Justificativa:** Spike C provou o caminho feliz ponta a ponta — um cliente que só fala stdio
(spawna a ponte como subprocesso) listou as duas ferramentas registradas no servidor Streamable
HTTP e recebeu os resultados esperados (`pong`, `olá`). A ponte tem 43 linhas e zero ocorrências
da classe `McpServer` — não carrega lógica de ferramenta nem acesso a dados, só relay nos dois
sentidos. Isso resolve o bloqueador do STATE.md "Transporte MCP em aberto" e a divergência entre
STACK.md (recomendava stdio + HTTP como duas portas de entrada separadas) e ARCHITECTURE.md
(recomendava Streamable HTTP único, por causa do mutex de instância única do runtime) — D-10
assenta a divergência com a ponte relay-only: um único processo servidor (mutex preservado),
acessível por HTTP direto e por qualquer cliente stdio via ponte.

**Efeito nas fases seguintes:** Fase 11 (servidor Node hospeda `/mcp` no mesmo processo/porta
8090); Fases 14–15 (implementação real da ponte e das ferramentas MCP).

**Reversibilidade:** costly — clientes MCP configurados e a superfície de segurança dependem do
transporte.

**Alternativas descartadas:** só stdio (cada cliente MCP spawnaria seu próprio processo servidor
— N processos disputando o mesmo mutex de instância única do runtime,
`docs/context/runtime-portatil.md`, conflita com a instância única); só HTTP (exige adaptador de
terceiros para os clientes que só falam stdio, como Claude Desktop/Claude Code por padrão).

### D-11 — A ponte stdio sobe o servidor

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** se a loja estiver fechada quando o telefone tocar, o próprio ramal liga
as luzes e espera o balcão abrir antes de transferir a ligação.

**Decisão:** Se o servidor não estiver rodando, a **ponte stdio sobe o servidor** (via `pmo.ps1`
sem browser, aguardando o health). Porta 8090 ocupada por outro processo = erro claro e
bloqueante (G4).

**Justificativa:** Spike C estendeu a ponte para checar `/health` antes de conectar: com o
servidor parado, a ponte detectou a ausência de resposta, subiu o processo (`spawn` detached,
equivalente ao `pmo.ps1` sem browser) e sondou `/health` a cada 250 ms — 527 ms depois, o relay
seguiu normalmente. Com a porta ocupada por outro processo, a ponte identificou pela primeira
resposta de `/health` (corpo diferente do esperado) que a porta pertence a outro processo e saiu
com código 1 sem nunca tentar subir um segundo servidor.

**Efeito nas fases seguintes:** Fases 14–15 orçam ~527 ms de espera de auto-start na UX da ponte
real; o erro de porta ocupada segue o mesmo padrão bloqueante do G4.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-12 — Token local por instalação em state/

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** um crachá guardado na portaria da própria casa, que não viaja na
mudança nem na cópia de segurança.

**Decisão:** Autenticação do endpoint HTTP: **token local por instalação em `state/`** (fora de
`data/`, dos snapshots e do ZIP); a ponte stdio lê automaticamente; clientes HTTP diretos usam o
token na configuração. Host/Origin sempre validados (anti DNS rebinding).

**Justificativa:** Spike C confirmou o token: `/mcp` sem `Authorization` ou com token errado
retorna `401`. Achado importante para a Fase 14: o SDK `@modelcontextprotocol/sdk@1.30.1` mantém
`enableDnsRebindingProtection` (e `allowedHosts`/`allowedOrigins`) em
`WebStandardStreamableHTTPServerTransportOptions`, mas **o valor padrão é `false`** — a proteção
contra DNS rebinding fica **desligada por padrão** (confirma o alerta do GHSA-w48q-cv73-mx4w
citado em `.planning/research/PITFALLS.md`; a Assumption A3 do RESEARCH, que supunha proteção
ligada por padrão, está **reprovada** pela evidência direta do pacote instalado). Além disso, o
`.d.ts` do próprio pacote marca as três opções como `@deprecated`, recomendando "middleware
externo" para validação de Host/Origin/DNS rebinding. Com as opções explicitamente ligadas
(`allowedHosts`, `allowedOrigins`, `enableDnsRebindingProtection: true`), `Host`/`Origin`
forjados foram recusados com `403`, e um controle positivo com `Host`/`Origin` corretos confirmou
que a rejeição não é efeito colateral de outra coisa quebrada.

**Efeito nas fases seguintes:** a Fase 14 precisa habilitar Host/Origin explicitamente no
`StreamableHTTPServerTransport` **e**, por essas opções estarem `@deprecated` no SDK `1.30.1`,
implementar a validação de Host/Origin como middleware do próprio servidor Node do produto
(checagem antes de repassar ao SDK) — não confiar apenas nas opções internas do transporte, que
podem ser removidas em versão futura do SDK; a Fase 14 deve reverificar esse comportamento contra
a versão do SDK de fato fixada no momento da implementação.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-13 — Autoria de agente no audit log

**Status:** Ratificada em 27/09/2026

**Em linguagem simples:** o livro de ocorrências passa a anotar se quem mexeu foi uma pessoa ou
um assistente, e qual assistente.

**Decisão:** Autoria no audit log: `tipo=agente` + `clientInfo` do MCP (ex.: "Claude Desktop") +
rótulo opcional configurado pelo usuário.

**Justificativa:** Spike C confirmou que o servidor recebe `clientInfo.name`/`version`
exatamente como o cliente os declara na chamada `initialize` do handshake MCP (observado
`{"name":"pmo-spike-client","version":"0.0.0-spike"}`) — a autoria é extraível diretamente da
mensagem JSON-RPC de handshake, sem instrumentação adicional no SDK. Este achado é consistente
com ARCHITECTURE.md: "came via MCP" é o fato confiável (qual token local chamou), e o nome de
cliente fornecido é tratado como anotação, não como fronteira de segurança.

**Efeito nas fases seguintes:** Fase 11 (autoria no audit log, SRV-04) e Fase 15 (MCP-04).

**Reversibilidade:** não classificada na discussão; tratada como reversível.

## Avaliação por eixo

Avalia tooling, dependências, arquitetura e framework de UI, com as alternativas descartadas e o
motivo de cada descarte.

### Tooling

**Estado atual (medido):** sem type check e sem lint; 1.948 linhas de teste sem framework
declarativo, distribuídas em 6 arquivos, nenhum usando `describe`/`it` (`## Medições do
protótipo` → "Inventário de testes"); só `10-model.js` tem teste comportamental real
(`model-migration.test.mjs`) — os outros 13 módulos de `src/js/` estão sem cobertura
comportamental (mesma seção → "Mapa de cobertura por módulo"). `build.ps1` tem mediana de 176 ms
(três rodadas: 486/176/157 ms) para o build completo (`## Medições do protótipo` → "Tempo de
build").

**Recomendação:** JSDoc + `checkJs` do TypeScript como checador de tipo (sem reescrever a sintaxe
de `src/js/`), ESLint em flat config com ambientes separados de navegador e Node, Vitest
reaproveitando o pipeline de transformação do Vite (primeiro alvo de porte:
`tests/model-migration.test.mjs`), e Playwright contra o servidor real para automatizar a
checklist "Antes de dizer pronto" do CLAUDE.md. As suítes PowerShell 5.1 (`Run-Tests.ps1`,
`Test-UpdaterRecovery.ps1`, `Invoke-ServerIntegration.ps1`) continuam rodando em paralelo — nada
disso é substituído nesta fase. Faseamento sugerido: Fase 2 (scaffold), Fase 3 (testes de
caracterização antes de qualquer divisão de arquivo).

**Alternativas descartadas:**

| Alternativa | Motivo |
|---|---|
| Reescrever `src/js/` em sintaxe TypeScript | Contradiz o mandato "evoluir, não reescrever" do PROJECT.md; `checkJs` já dá o benefício de tipo sem tocar a sintaxe existente |
| esbuild direto, sem Vite | Falta servidor de desenvolvimento com HMR e o ecossistema de plugins que Playwright/Vitest compartilham via config do Vite; o Vite 8 já usa esbuild internamente (via Oxc/Rolldown), então a velocidade não é perdida |
| Jest | Pipeline de transformação separado do Vite; Vitest reaproveita a mesma config e é a escolha natural já que a Fase 4 adota Vite |

### Dependências

**Estado atual (medido):** zero dependências npm; build por concatenação de string em
`build.ps1`, servidor `serve.ps1` (`HttpListener`). `tests/Run-Tests.ps1` (linhas 22-28) já
**exige** um Node.js de desenvolvimento hoje (lança erro sem `$NodePath`) — a premissa antiga da
G2 ("não existe Node... nesta máquina") já era falsa antes desta ratificação (`## Medições do
protótipo` → "Fatos de runtime").

**Recomendação:** a política de lista permitida do D-06/D-07 — ver `## Dependências aprovadas
(G2)` abaixo para a lista concreta e as regras que a G2 reescrita do CLAUDE.md referencia.

**Alternativas descartadas:**

| Alternativa | Motivo |
|---|---|
| Manter "zero dependências" | Bloquearia o MCP SDK oficial, `@azure/msal-node` e o Vite — nenhum tem alternativa viável sem Node (D-01) |
| Entrega via CDN | Viola G1 (HTML autocontido) e o modo offline do G9; toda dependência de navegador precisa vir embutida no bundle (D-07) |
| Pacote `xlsx` puro (não `@e965/xlsx`) | Última publicação em 2022-03-24 — mais obsoleto ainda que `@e965/xlsx` (parado desde 2024-07-19), que ao menos é um mirror mantido do SheetJS Community Edition atual |

### Arquitetura

**Estado atual (medido):** um único HTML autocontido (957,4 KB, 21.576 linhas injetadas — `##
Medições do protótipo`) servido por `serve.ps1` (`HttpListener`); o navegador (`Store`) é a fonte
da verdade, com IndexedDB + réplica em disco. `10-model.js` (2.723 linhas) já é puro e sem efeito
colateral — candidato natural à extração ESM.

**Recomendação:** evoluir, não reescrever. Ordem de dependência: núcleo ESM compartilhado
(`10-model.js` extraído primeiro, Fase 4), catálogo de ações nomeadas substituindo os closures ad
hoc de `20-store.js` (Fase 6), servidor Node autoritativo em `localhost:8090` (Fases 11–13)
hospedando `/api/*` e o endpoint MCP no mesmo processo (D-10), conector Microsoft dentro desse
mesmo processo Node para o token nunca alcançar o navegador (D-09/D-12), `node.exe` portátil
dentro da release (D-02). `GET /api/eventos` via SSE (não WebSocket) para notificar mudanças a
qualquer aba aberta — não há necessidade de push bidirecional de baixa latência nesta ferramenta.

**Alternativas descartadas:**

| Alternativa | Motivo |
|---|---|
| Reescrever do zero | Fora do escopo do REQUIREMENTS ("evoluir, não reescrever"); perderia o reaproveitamento de `PMO.model`/`PMO.util` |
| Electron | 100+ MB por release, traz auto-update próprio que competiria com o updater transacional já funcional (G11/G12) |
| Node SEA (single executable application) | Build/assinatura mais caros e mais atrito de antivírus/SmartScreen por reputação — o Spike A mostrou que mesmo o `node.exe` oficial assinado sofre um scan único; um SEA sem assinatura reconhecida tende a sofrer mais, não menos (D-02) |
| Bun | `@azure/msal-node` e `@byteink/mppjs` têm binários nativos validados contra Node, não Bun — risco de compatibilidade em duas dependências já incertas ao mesmo tempo |
| .NET single-file executable (C#) | Perde o reaproveitamento de `PMO.model`/`PMO.util` (são JS); não há SDK MCP oficial para .NET tão maduro quanto o TypeScript |
| Fastify / Koa / NestJS | Servidor single-user, single-machine, só-localhost — nenhuma vantagem de throughput (Fastify) ou DI/módulos para times grandes (NestJS) se aplica aqui; `express` (ou até `node:http` puro) basta |
| Processo MCP separado por cliente (stdio-only) | Cada cliente spawnaria seu próprio servidor — N processos disputando o mesmo mutex de instância única do runtime, o que quebra a garantia de instância única (D-10) |
| WebSocket para notificação de mudança | SSE já basta para push unidirecional servidor→navegador; nada nesta ferramenta precisa de push bidirecional de baixa latência ou colaboração em tempo real |

### Framework de UI

Per D-16, esta fase só aponta candidatos e critérios — nenhuma escolha é feita aqui.

**Estado atual (medido):** DOM imperativo via `PMO.util.el()`, sem framework de componentes; as
views mais complexas somam centenas de "declarações função-símile" (`62-views-principais.js`
~347, `64-views-governanca.js` ~235 — `## Medições do protótipo` → "Proxy de complexidade").

**Candidatos:** vanilla + Web Components com Lit (adoção incremental componente a componente,
dentro do contrato `montar()`/`desmontar()` de view já existente); Preact (modelo de virtual DOM,
mais familiar a quem já usa React, mas é uma mudança conceitual maior em relação ao `el()`
imperativo atual).

**Alternativas descartadas:**

| Alternativa | Motivo |
|---|---|
| Svelte | O passo de compilação quer possuir a árvore de componentes inteira — serve melhor uma reescrita completa do que uma adoção cirúrgica, componente por componente, dentro de uma app vanilla de 15 mil+ linhas |
| SolidJS | Mesmo motivo do Svelte: compilador orientado a possuir toda a árvore, mau encaixe para adoção incremental dentro do contrato `montar()`/`desmontar()` existente |

**Critérios:**

| Critério | O que avaliar |
|---|---|
| Adoção incremental | Encaixa dentro do contrato `montar()`/`desmontar()` de view existente, sem exigir migração de tudo de uma vez |
| Peso no HTML único | Custo em KB embutido no bundle, enquanto G1 exige HTML autocontido (até a Fase 13) |
| Acessibilidade e RAG | Mantém AA e RAG com cor + rótulo/ícone (convenção do CLAUDE.md), sem regressão |
| Encaixe com `el()` | Coexiste ou substitui o DOM helper imperativo atual sem exigir reescrever tudo de uma vez |
| Curva de aprendizado | Custo de manutenção para quem só conhece o padrão vanilla atual |
| Licença | Termos compatíveis com a lista permitida do D-06 (MIT/Apache-2.0/BSD/ISC) |

Nenhum framework é escolhido nesta fase: a decisão é da Fase 8, com a PMO (UI-01).

## Dependências aprovadas (G2)

Registra a lista inicial de dependências aprovadas pela avaliação (nome, versão, licença, motivo)
que a G2 reescrita do CLAUDE.md referencia como allow-list.

**Verificação:** cada pacote abaixo foi reconferido contra o registro npm nesta execução
(`npm view <pkg> version license repository.url time.modified`, somente leitura, sem
`npm install`) em 27/09/2026; o Node.js 24 LTS foi reconferido contra
`https://nodejs.org/dist/index.json`. Os números coincidem com os já registrados em
`.planning/phases/01-avalia-o-t-cnica-e-decis-es-de-evolu-o/01-RESEARCH.md` (nenhuma divergência
de licença ou repositório encontrada).

| Pacote | Versão verificada | Licença | Uso | Ambiente | Fase de adoção | Situação |
|---|---|---|---|---|---|---|
| Node.js | 24.21.0 (LTS Krypton) | MIT | Runtime de dev/CI e produção | runtime (node.exe portátil na release, D-02) | Fase 2 (dev/CI); Fase 11–13 (servidor de produção) | aprovada |
| `typescript` | 7.0.2 | Apache-2.0 | Checagem de tipo via JSDoc + `checkJs`, sem reescrever `src/js/` | dev/CI | Fase 2 | aprovada |
| `vite` | 8.3.1 | MIT | Servidor de desenvolvimento (HMR) e bundler de produção | dev/CI | Fase 4 | aprovada |
| `vite-plugin-singlefile` | 2.3.3 | MIT | Injeta JS/CSS construído em um único HTML (substitui a concatenação do `build.ps1`) | dev/CI | Fase 4 | aprovada |
| `eslint` | 10.11.0 | MIT | Lint em flat config com ambientes separados de navegador e Node | dev/CI | Fase 2 | aprovada |
| `vitest` | 5.0.2 | MIT | Testes unitários reaproveitando o pipeline de transformação do Vite | dev/CI | Fase 2 | aprovada |
| `@playwright/test` | 1.63.0 | Apache-2.0 | Testes end-to-end contra `localhost:8090`, automatiza a checklist "Antes de dizer pronto" | dev/CI | Fase 3 | aprovada |
| `@modelcontextprotocol/sdk` | 1.30.1 | MIT | SDK oficial do servidor MCP (Streamable HTTP + ponte stdio) | Node (servidor) | Fase 14–15 | aprovada |
| `zod` | 4.6.5 | MIT | Validação de schema dos argumentos das ferramentas MCP | Node (servidor) | Fase 14–15 | aprovada |
| `express` | 5.2.1 | MIT | Servidor HTTP hospedando `/`, `/api/*` e `/mcp` no mesmo processo | Node (servidor) | Fase 11+ | aprovada |
| `@azure/msal-node` | 7.0.0 | MIT | Fluxo device code, autenticação delegada da PMO com a Microsoft | Node (servidor) | Fase 17–18 | aprovada |
| `@microsoft/microsoft-graph-client` | 3.0.7 | MIT | Chamadas típadas ao Microsoft Graph (SharePoint/OneDrive) | Node (servidor) | Fase 17–18 | aprovada |
| `@e965/xlsx` | 0.20.3 | Apache-2.0 | Leitura/escrita de `.xlsx` (mirror mantido do SheetJS Community Edition) | navegador (embutido no bundle, D-07) | Fase 7 | aprovada com ressalva — sem publicação desde 19/07/2024 (mais de 2 anos); reverificar atualidade na Fase 7 antes de instalar |
| `@byteink/mppjs` | 0.1.8 | MIT (wrapper) / **LGPL-2.1-or-later** (binário nativo, embute o MPXJ compilado) | Conversão `.mpp` → MSPDI XML, sem JVM | Node (servidor) | Fase 17 | condicionada — não aprovada — flag `[SUS]` no audit de legitimidade (~4,5 meses, 5 versões publicadas); a licença do binário fica fora da lista MIT/Apache-2.0/BSD/ISC do D-06, então a adoção exige decisão explícita mais o spike com arquivos `.mpp` reais e o gate de legitimidade bloqueante da Fase 17 |
| `lit` | 3.3.3 | BSD-3-Clause | Candidato de framework de UI (Web Components), avaliação D-16 | navegador (embutido no bundle, D-07) | Fase 8 | candidata — não aprovada — a escolha do framework de UI é da Fase 8, com a PMO |

**Regras:**

- Esta lista governa dependências diretas; dependências transitivas são fixadas pelo lockfile
  commitado (`package-lock.json` a partir da Fase 2) — não precisam de linha própria aqui.
- Dependência nova = proposta ao Maestro (regra 8 do time) antes de qualquer `npm install`; só
  depois disso ela ganha uma linha nesta lista.
- Licença verificada item a item: só entram como `aprovada` pacotes com MIT, Apache-2.0, BSD ou
  ISC confirmados no registro nesta ou em verificação futura equivalente.
- Pacote marcado `[ASSUMED]`/`[SUS]` no audit de legitimidade exige um `checkpoint:human-verify`
  bloqueante (`gate="blocking-human"`) antes de qualquer `npm install` — é o caso de
  `@byteink/mppjs` na Fase 17.
- Dependências usadas no navegador entram embutidas no HTML único pelo bundle (D-07); nunca CDN,
  nunca `<script src>` externo — mesma regra do G1.
- Zero CDN e zero recurso externo em runtime, em qualquer ambiente (navegador ou servidor Node):
  nenhum script, folha de estilo, fonte, imagem ou pacote é buscado de origem externa. A regra não
  proíbe as duas chamadas operacionais autorizadas, feitas por processos locais e nunca pelo HTML
  (G1); qualquer outra chamada a origem externa em runtime exige proposta aprovada e uma linha
  nesta regra:
  - **Atual:** API e assets do GitHub Releases do repositório configurado (`repository` em
    `config/install.json`; `-Repositorio` na instalação): consulta de update em `serve.ps1`
    (`ConsultarAtualizacao`), consulta da release e download de manifesto e ZIP em
    `tools/update-runtime.ps1` (`Get-LatestRelease` e `Invoke-UpdateOperation`) e instalação em
    `tools/pmo-instalar.ps1` (`Get-Release` e `Receber-Asset`); todo download é conferido por
    tamanho e SHA-256 contra o digest publicado pelo GitHub.
  - **Alvo:** login delegado da PMO na Microsoft e Microsoft Graph, só pelo módulo conector das
    Fases 17–18 (G6, D-09); nenhuma chamada autenticada à Microsoft existe no código hoje.
- `build.ps1` e Vite coexistem até o Vite provar paridade no CI (Fase 4); só então `build.ps1` é
  removido (D-08).

## Divergências código × documentação

Registra as divergências corrigidas nesta fase entre o código e o CLAUDE.md: o contrato de
`PMO.importar.reconciliar()` e a lista de rotas administrativas de `serve.ps1`. Por D-17, cada
divergência conhecida está listada abaixo como **Corrigida** (com o plano que corrigiu) ou
**Registrada** (com a fase que vai corrigi-la).

| Divergência | Onde | Situação | Fase | Evidência |
| --- | --- | --- | --- | --- |
| Contrato de `reconciliar()` citava `semCorrespondencia:[]`; o retorno real é `{novos, atualizacoes, conflitos, resumo}` | CLAUDE.md, `PMO.importar` | Corrigida (plano 01-02) | Fase 1 | `grep -c 'semCorrespondencia' CLAUDE.md` agora imprime `0` |
| Lista de rotas administrativas do CLAUDE.md tinha 4 rotas; `serve.ps1` expõe 11 (faltavam rollback/restore) | CLAUDE.md, "Interfaces operacionais" | Corrigida (01-02) | Fase 1 | `grep -oE '/api/(rollback/apply\|restore/apply\|restore-pending\|restore-ack)' CLAUDE.md \| sort -u \| wc -l` = 4, confirmado contra as rotas reais de `serve.ps1` |
| L1 de importação não nomeava os campos de retorno de `reconciliar()` | `docs/context/importacao-reconciliacao.md` | Corrigida (01-02) | Fase 1 | parágrafo **Atual** em "Correspondência e diff" nomeia os oito campos |
| G6 citava `js/38-connectors.js` como caminho real do conector, mas o arquivo nunca existiu | CLAUDE.md, G6 | Corrigida (01-07) | Fase 1 | `git ls-files \| grep -i connector` sem resultado, registrado em 01-07-SUMMARY.md |
| G2/G3 afirmavam "não existe Node... nesta máquina" enquanto `tests/Run-Tests.ps1` já exigia Node de desenvolvimento | CLAUDE.md, G2/G3 | Corrigida (01-07) | Fase 1 | `grep -c 'Não existe Node' CLAUDE.md` = 0; `tests/Run-Tests.ps1` linhas 22-28 já lançavam erro sem `$NodePath` |
| A subseção D-09 deste L1 repetia, no presente, o caminho do conector inexistente da G6 antiga como se o arquivo existisse hoje | `docs/context/avaliacao-evolucao.md`, D-09 | Corrigida (01-09) | Fase 1 | a subseção D-09 não cita mais nenhum arquivo de conector e diz que não existe módulo conector no código hoje; a busca por nome de arquivo de conector entre os arquivos versionados continua sem resultado |
| "Interfaces operacionais" dizia que `GET /api/health`, `/api/update/check` e `/api/update/status` exigiam o token efêmero da sessão; em `serve.ps1` só `GET /api/restore-pending` e as rotas `POST` listadas chamam `ExigirAdministracao` | CLAUDE.md, "Interfaces operacionais" | Corrigida (01-09) | Fase 1 | as três consultas aparecem como "somente loopback, sem token"; a divergência é anterior à Fase 1 (já existia em `main`) |
| A G2 do CLAUDE.md e as Regras de `## Dependências aprovadas (G2)` deste L1 proibiam qualquer busca externa em runtime, "em qualquer ambiente (navegador ou servidor Node)", mas `serve.ps1`, `tools/update-runtime.ps1` e `tools/pmo-instalar.ps1` já consultam e baixam do GitHub Releases, e a D-09 autoriza o Microsoft Graph pelo conector delegado | CLAUDE.md, G2; `docs/context/avaliacao-evolucao.md`, D-06 e Regras da G2 | Corrigida (01-10) | Fase 1 | a proibição vale para recursos e dependências buscados em runtime; a G2 e as Regras listam as duas chamadas autorizadas; a D-06 manteve o texto ratificado e ganhou um Esclarecimento (01-10); `Invoke-WebRequest` e `Invoke-RestMethod` aparecem só em `serve.ps1` (1), `tools/update-runtime.ps1` (4, uma delas o health em `localhost`) e `tools/pmo-instalar.ps1` (2) |
| A D-08 deste L1 ("Efeito nas fases seguintes") só liberava `npm install` para desenvolvimento depois da paridade do Vite (Fase 4), contra a G2 do CLAUDE.md (`npm install` para desenvolvimento é permitido, D-01, D-04) e a própria Decisão da D-08, que tira a proibição já na reescrita da G2 | `docs/context/avaliacao-evolucao.md`, D-08 | Corrigida (01-10) | Fase 1 | a paridade condiciona só a remoção do `build.ps1`; o Efeito da D-08 diz que `npm install` para desenvolvimento já é permitido, restrito à lista aprovada (G2, D-06); Decisão e Status da D-08 ficaram intactos |
| `.claude/skills/pmo-app/SKILL.md` diz "Sem Node, sem npm, sem dependências" | `.claude/skills/pmo-app/SKILL.md` (linha 12) | Registrada — **Alvo** | Fase 2 | atualizar o SKILL.md na mesma PR que introduz `package.json` |
| CI fixa `node-version: '22.22.0'` e o contrato `workflow-gates-release` de `docs/context/index.json` exige esse valor exato | `.github/workflows/release.yml` (linha 66) | Registrada — **Alvo** | Fase 2 | bumpar o workflow para Node 24 e o `requiredPatterns` do contrato na mesma PR, ou `validar-contexto.ps1` falha por descompasso |
| "Convenções de código" do CLAUDE.md proíbe módulos ES ("nada de módulos ES") | CLAUDE.md, "Convenções de código" | Registrada — **Alvo** | Fase 4 (MOD-02) | revisar junto com a extração ESM real de `10-model.js` |
| "Estrutura" e a descrição de build do CLAUDE.md citam `build.ps1` como o build único | CLAUDE.md, "Estrutura" | Registrada — **Alvo** | Fase 4 (D-08: removido depois da paridade do Vite) | `build.ps1` sai do CLAUDE.md quando a Fase 4 provar paridade no CI |
| README.md diz "Nenhum runtime adicional — sem Node, npm, Python ou .NET SDK" | `README.md` (linha 49) | Registrada — **Alvo** | Fase 13 | continua verdadeiro para quem instala hoje (o `node.exe` viaja dentro do pacote), mas o texto precisa mencionar o runtime embutido quando a Fase 13 trocar o runtime do servidor |

## Adiado para fases seguintes

Registra o que foi propositalmente deixado para depois: revisão da G1 (Fase 13), escolha do
framework de UI (Fase 8), formato do token MCP (Fase 14) e migração do updater para Node
(Fase 13).

- **Revisão da G1** (HTML único vs. arquivos servidos pelo Node) — Fase 13, quando o servidor
  Node vira fonte da verdade (D-05).
- **Escolha do framework de UI** — Fase 8, com a PMO, entre os candidatos e critérios listados em
  `### Framework de UI` acima (D-16).
- **Formato do token MCP, nome da rota e UX de configuração do cliente** — Fase 14; `/mcp`
  sugerido como nome de rota (D-12, Claude's Discretion do CONTEXT).
- **Migração do updater para Node** — Fase 13, junto com a troca de runtime do servidor; o
  updater transacional atual (journals, fail-closed) permanece em PowerShell até lá e só migra
  repetindo os mesmos testes de falha simulada (D-03).
- **Pino de Node do CI (`.github/workflows/release.yml`, hoje `22.22.0`) e o contrato
  `workflow-gates-release`** — Fase 2, na mesma PR (bump para 24 e atualização do regex do
  contrato em `index.json`, ou `validar-contexto.ps1` falha por descompasso).
- **Reverificação do default de `enableDnsRebindingProtection` contra a versão do SDK MCP
  efetivamente fixada** — Fase 14; o Spike C encontrou `false` como padrão e as três opções
  (`allowedHosts`, `allowedOrigins`, `enableDnsRebindingProtection`) marcadas `@deprecated` no
  `1.30.1` — a Fase 14 precisa de middleware próprio de Host/Origin, não só das opções internas
  do transporte (D-12).
- **Validação de `@byteink/mppjs` com arquivos `.mpp` reais e gate de legitimidade** — Fase 17
  (IMP-04); pacote `[SUS]`, com binário nativo LGPL-2.1-or-later fora da lista de licenças do
  D-06 — ver linha `condicionada — não aprovada` em `## Dependências aprovadas (G2)`.
- **Reverificação de atualidade de `@e965/xlsx`** — Fase 7, no momento da adoção; sem publicação
  desde 19/07/2024 (mais de dois anos), conforme a linha `aprovada com ressalva` em `##
  Dependências aprovadas (G2)`.
- **Proibição de ESM em "Convenções de código" do CLAUDE.md** — Fase 4, quando `10-model.js` for
  extraído para ESM real (MOD-02); a proibição atual ("nada de módulos ES") precisa ser revista
  junto com essa extração, não antes.

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
