# PMO Tool — Governança de Portfólio de TI

Aplicação de **governança de portfólio** para PMO Leads. Inspirada em Oracle Primavera P6 EPPM
(WBS, gates, EVM, dependências cross-project, baselines) e Monday.com (múltiplas views, edição
inline, board). **Não** é ferramenta de micro-gestão: o detalhe de cronograma vive nos arquivos
de projeto anexados (`.mpp`, `.xml`, `.xer`). A v1.4.1 acrescentou runtime portátil, releases
imutáveis por versão e atualização transacional sem misturar código com dados do usuário. A v1.5.0
acrescenta instalação direta pelo GitHub: a máquina nova baixa um único script e obtém uma
instalação idêntica à que o gerador local produz.

---

## GUARDRAILS — regras invioláveis

Estas regras existem porque o ambiente-alvo é restrito. Violar qualquer uma quebra a entrega.

### G1 — A interface entregue é UM único arquivo HTML
`dist/pmo-tool.html` deve ser 100% autocontido. O pacote portátil também contém servidor,
updater, templates, samples e manifestos, mas nunca outro recurso web necessário à interface.
Todo CSS e JS inline. Nenhum `<link>`,
`<script src>`, `@import`, `fetch` de origem externa, webfont remota, imagem remota.
Ícones = SVG inline ou glifos Unicode. Gráficos = SVG construído à mão.

**Vigência e revisão (D-05, ratificada em 27/09/2026; reancorada por D-35):** a regra acima vale
integralmente em toda a v1. Quando uma fase adotar o Vite para embutir dependência (hoje, a Fase
27), o HTML único passa a ser gerado por Vite + `vite-plugin-singlefile`, com paridade verificada
contra `build.ps1` no CI; as dependências de navegador entram embutidas no HTML pelo próprio
bundle, nunca por CDN ou `<script src>` externo (D-07).

**Gatilho de revisão:** no ADR corporativo (v2), quando o servidor corporativo vira fonte da
verdade, a G1 é reavaliada (HTML único vs. arquivos servidos pelo servidor). Até essa revisão,
nenhuma mudança pode produzir mais de um arquivo de interface.

### G2 — Dependências só pela lista aprovada; zero CDN
Node.js 24 LTS e npm são permitidos em desenvolvimento e CI, e `npm install` para desenvolvimento
é permitido (D-01, D-04). Só entram dependências que constam na lista aprovada em
`docs/context/avaliacao-evolucao.md`, seção "Dependências aprovadas (G2)". Dependência nova exige
proposta ao Maestro (regra 8 do time) e uma linha nessa lista — com versão, licença e motivo —
antes de qualquer `npm install` (D-06). O lockfile é commitado. A licença precisa ser compatível
com open source — MIT, Apache-2.0, BSD ou ISC — verificada item a item. Zero CDN e zero recurso
externo em runtime: nenhum script, folha de estilo, fonte, imagem ou pacote é buscado de origem
externa, e dependências de navegador entram embutidas no HTML pelo bundle, nunca por
`<script src>` externo (D-07). Isso não proíbe as duas chamadas operacionais autorizadas, feitas
por processos locais e nunca pelo HTML (G1): (1) API e assets do GitHub Releases do repositório
configurado, para consultar update (`serve.ps1`), consultar e baixar manifesto e ZIP do update
(`tools/update-runtime.ps1`) e instalar (`tools/pmo-instalar.ps1`), com tamanho e SHA-256 de cada
download conferidos contra o digest do GitHub; (2) login delegado da PMO na Microsoft e Microsoft
Graph, só pelo módulo conector, quando existir (hoje congelado, D-23) (G6, D-29). Qualquer outra
chamada a origem externa em runtime exige proposta aprovada. O build oficial continua `build.ps1`
até o Vite provar paridade no CI, na fase que adotar o Vite para embutir dependência (hoje, a Fase
27), quando `build.ps1` é removido; até lá os dois coexistem (D-08, D-35). O servidor da edição
local continua `serve.ps1` (`System.Net.HttpListener`) e não troca de runtime (G3, D-27).
Nenhum outro runtime (Python, .NET SDK) entra sem proposta aprovada.

### G3 — Duas edições: a local não troca de runtime; Node 24 LTS em dev, CI e na corporativa
**Edição local** (a v1): o servidor é o `serve.ps1`, e o updater e os scripts de entrada
(`pmo.ps1`, `atualizar.ps1`, `tools/pmo-instalar.ps1`) ficam em Windows PowerShell 5.1 — a entrada
sem pré-requisito em qualquer Windows (D-03); a edição local não troca de runtime (D-27; ver D-27
em `docs/context/adr-v1-captura.md`). O updater transacional atual (journals, fail-closed)
permanece em PowerShell. **Node.js 24 LTS** vale no desenvolvimento, no CI e no servidor da
edição corporativa (v2) (D-01, D-27). O Node é permitido na máquina da PMO como `node.exe` oficial
portátil dentro de `versions/<semver>/` — versão e SHA-256 declarados no `release.json` e na
allowlist do ZIP, nada instalado globalmente, rollback troca o Node junto com o código (D-02) —,
mas só entra no pacote quando uma fase precisar e justificar o uso por proposta ao Maestro; até
lá, nenhum release leva `node.exe`. A edição local não tem servidor Node, fila offline local nem
ensaio de troca de runtime local; a migração é local → nuvem pelo bundle JSON (D-27, D-28). Todo
`.ps1` que existe no repositório roda em 5.1 e segue sua sintaxe:

Sem `&&`, sem `||`, sem `??`, sem `?.`, sem ternário `? :`, sem `ConvertFrom-Json -AsHashtable`.
Encadear com `;` ou `if ($?) { }`. Ao gravar arquivos que o browser vai ler, usar
`-Encoding utf8` explícito. Fechamento de here-string (`'@`) sempre na coluna 0.

### G4 — Porta 8090 na edição local
A G4 vale só para a edição local (D-28). Nela, o servidor usa **8090** e a origem canônica é
sempre `http://localhost:8090/`. Porta ocupada é erro bloqueante: nunca escolher outra porta nem
trocar `localhost` por IP/hostname, porque a origem identifica IndexedDB e `localStorage`. Na
edição corporativa (v2), a origem é a corporativa (HTTPS) e o dado mora no servidor; a migração
local → nuvem usa o bundle JSON com um ensaio no estilo FUND-02.

### G5 — Interface em português (pt-BR)
Todos os rótulos, menus, mensagens e relatórios em pt-BR. Preservar termos de PMO consagrados
em sua forma de mercado: EVM, PV, EV, AC, SPI, CPI, EAC, ETC, VAC, TCPI, BAC, RAG, gate,
stage-gate, kanban, CAPEX, OPEX, stakeholder, sponsor, steering committee, backlog, WBS.
Datas em `dd/mm/aaaa`. Moeda em `R$ 1.234.567` (pt-BR). Sem acentuação quebrada — UTF-8 sempre.

### G6 — Microsoft só com login delegado da PMO (decisão do usuário em 26/09/2026, ratificada como D-09 em 27/09/2026)
Integração com SharePoint/OneDrive é permitida **apenas** com o login delegado da própria PMO.
**Nunca** criar App Registration própria nem usar permissão de aplicação no Microsoft Graph.
Caminho candidato = client público de primeira parte da Microsoft com device code. Fallback
garantido = a pasta sincronizada pelo OneDrive, lida sem login. O token nunca fica em `data/`,
`config/` nem `versions/` (nem em snapshot ou no ZIP de release). O conector é validado primeiro,
com cautela, no tenant do dono do projeto, antes do tenant da PMO (SP-04, Fase 18). A
compatibilidade file-based continua: import/export de MSPDI, XER, PMXML, CSV, XLSX, ICS, e
campos de deep link (URLs coladas manualmente). **Atual:** não existe módulo conector no código
hoje — ele é criado nas Fases 17–18 e se torna o único ponto de extensão para chamadas
autenticadas à Microsoft; nenhuma chamada de rede autenticada existe fora dele. Ver D-09 e
`docs/context/avaliacao-evolucao.md` para a justificativa completa.

### G7 — Honestidade sobre `.mpp`
`.mpp` é OLE/CFB binário proprietário. Não existe parser JS do conteúdo de cronograma.
O app lê **apenas** o property set OLE padrão (`SummaryInformation`): título, autor, empresa,
assunto, comentários, datas. O arquivo em si é guardado como anexo. **Nunca** afirmar na UI que
o app "lê o cronograma do .mpp". O rótulo correto é "metadados extraídos".

### G8 — Nenhuma perda de dado silenciosa
Toda mutação passa por `Store.mutate()` e gera entrada em `auditLog`. Import nunca sobrescreve
direto: sempre gera um **diff de reconciliação** que o usuário aprova campo a campo.
`Store` grava em IndexedDB e replica para disco; falha de disco degrada com aviso visível,
nunca em silêncio. Escritas em disco são atômicas; somente anexos fisicamente verificados podem
ser marcados como persistidos. Schema futuro abre em modo protegido e não pode ser gravado.

Update só pode começar depois de flush, materialização dos blobs, inventário e snapshot completo
selado. Falha em qualquer fase deve manter a versão ativa e os dados anteriores (`fail closed`).

### G9 — Funciona offline e com dados vazios
Abrir sem servidor (`file://`) deve funcionar em modo somente-IndexedDB com aviso, mas esse modo é
apenas fallback funcional: não oferece update, réplica em disco nem o contrato de recuperação da
instalação portátil. A operação suportada usa `pmo.ps1` e a origem fixa.
Toda view deve ter empty state útil. Nenhuma view pode lançar exceção com portfólio vazio.
Nenhuma divisão por zero em EVM (usar `safeDiv`).

### G10 — Nada de dado real de cliente nos samples
`samples/` contém apenas empresa fictícia. Não inventar nomes de clientes, fornecedores ou
pessoas reais.

### G11 — Runtime e dados nunca se misturam
`versions/<semver>/` pertence à release e é imutável. `data/`, `config/`, `state/`, `logs/` e
`staging/` pertencem à instalação e nunca entram no ZIP de runtime. Customizações ficam em
`data/user-templates/`, não dentro da versão. O servidor portátil exige `-DataDir`, `-ConfigDir`
e `-StateDir` explícitos e externos a `versions/`.

Git nunca versiona `data/`, anexos, snapshots, configuração local, estado, versões instaladas,
staging, logs ou builds. Não recomendar Git, OneDrive, SharePoint ou pasta de rede para
sincronizar dados de uma instalação.

### G12 — Update é instalação lado a lado, não sobrescrita
O bootstrap estável da raiz resolve `active.json`; updates regulares não substituem `pmo.ps1`,
`atualizar.ps1` nem arquivos persistentes. O updater valida release estável e imutável, bootstrap
mínimo, allowlist do ZIP e SHA-256 antes de criar `versions/<semver>/`. A ativação altera
`state/active.json` atomicamente somente após health check.

Rollback de mesmo schema troca apenas o runtime. Schema diferente exige snapshot pareado.
Restauração nunca apaga automaticamente trabalho já produzido na versão nova.

### G13 — Contexto arquitetural por divulgação progressiva
Antes de alterar um domínio, ler `docs/context/index.json` (L0), os documentos L1 selecionados e
somente então os arquivos L2 necessários. Mudança de contrato, schema, persistência, diretórios,
release ou recuperação exige atualizar o L1 correspondente e executar
`tools/validar-contexto.ps1`.

---

## Estrutura

```text
pmo-tool/
  CLAUDE.md                  <- este contrato
  README.md
  pmo.ps1                    <- bootstrap estável; resolve o runtime ativo
  atualizar.ps1              <- delega ao updater versionado
  build.ps1                  <- src/ -> dist/pmo-tool.html
  serve.ps1                  <- HttpListener :8090, persistência e preflight
  config/*.example.json      <- contratos versionados; install.json local é ignorado
  state/*.example.json       <- contratos versionados; estado real é ignorado
  docs/context/              <- L0, L1 e runbooks; validado por validar-contexto.ps1
  docs/guia/                 <- guias de uso final; NÃO entram no index.json
  tools/                     <- pacote, instalação, update e validações
    pmo-instalar.ps1         <- instala do GitHub; asset da release
    install-common.ps1       <- materialização única de uma instalação
    portable-common.ps1      <- helper compartilhado; asset da release
  src/
    shell.html               <- esqueleto com marcadores <!--@inject:...-->
    css/*.css                <- injetados em ordem alfabética
    js/*.js                  <- prefixo numérico define a ordem
  samples/                   <- arquivos fictícios para testar import
  templates/                 <- templates de fábrica
  data/                      <- estado local; NUNCA versionar
  versions/ staging/ logs/   <- estado de instalação; NUNCA versionar
  dist/pmo-tool.html         <- build local; não versionar
```

`build.ps1` injeta por ordem de nome de arquivo. **O prefixo numérico é o mecanismo de ordenação
de dependência.** Não renomear sem checar dependências.

| Faixa | Responsabilidade |
|---|---|
| `00-09` | utilitários puros, i18n, formatação, DOM helpers |
| `10-19` | modelo: schema, taxonomias, cálculos EVM e KPIs |
| `20-29` | store: IndexedDB, sync disco, audit |
| `30-39` | import: parsers e reconciliação |
| `40-49` | export: geradores de artefato |
| `50-59` | biblioteca de gráficos SVG |
| `60-79` | views |
| `80-89` | seed / dados de demonstração |
| `90-99` | shell da aplicação, roteador, boot |

### Layout da instalação portátil

```text
PMO-Tool/
  pmo.ps1
  atualizar.ps1
  bootstrap.json
  portable-install-manifest.json
  tools/portable-common.ps1
  config/install.json
  state/active.json
  state/update.json
  state/update.lock             <- efêmero durante preflight/update
  versions/<semver>/
    serve.ps1
    dist/pmo-tool.html
    templates/factory/
    samples/
    tools/portable-common.ps1
    tools/update-runtime.ps1
    release.json
  data/
    portfolio.json
    attachments/
    backups/
    update-backups/<snapshot-id>/
    user-templates/
  staging/
  logs/
```

`config/install.json` é configuração local e contém `repository` em formato `OWNER/REPOSITORY`,
canal `stable`, porta 8090, intervalo de consulta, diretórios e retenção. Sem `repository`, a
aplicação funciona, mas não consulta releases. Nunca hardcodar owner/repo nos fontes nem incluir
o `install.json` real no Git.

`state/active.json` guarda versões ativa/anterior e schemas pareados. `state/update.json` registra
a fase durável do update. `release.json` declara versão, commit, build, contrato de schema,
`minBootstrapVersion` e hashes do runtime.

### Interfaces operacionais

```powershell
.\pmo-instalar.ps1 -Repositorio OWNER/REPOSITORY
.\pmo.ps1
.\pmo.ps1 -Atualizar
.\pmo.ps1 -SemAtualizacao
.\pmo.ps1 -Diagnostico
.\pmo.ps1 -Rollback
.\pmo.ps1 -RestaurarSnapshot <id>
```

`pmo-instalar.ps1` é o único arquivo que uma máquina nova baixa. Ele não valida ZIP nem monta
instalação por conta própria: baixa manifesto e `portable-common.ps1`, confere os dois contra o
digest do GitHub, carrega o helper verificado, tira `install-common.ps1` do bootstrap validado e
materializa com `Install-PmoPortableFromPackages` — a mesma função de `New-PortableInstall.ps1`.
Existem exatamente duas origens de instalação, e as duas passam por essa função.

O runtime portátil recebe `-DataDir`, `-ConfigDir`, `-StateDir`, `-Porta`, `-SemBuild`,
`-SemBrowser`, `-HealthOnly` e `-AdminToken`. Toda rota aceita somente requisição loopback com
cabeçalho `Host` igual a `localhost:<porta>`. Nas rotas operacionais abaixo, o token efêmero da
sessão (cabeçalho `X-PMO-Admin-Token`) é exigido assim:

- `GET /api/health`, `/api/update/check` e `/api/update/status`: somente loopback, sem token;
- `GET /api/restore-pending`: loopback e token;
- `POST /api/update/prepare`, `/api/update/apply`, `/api/update/cancel`, `/api/rollback/apply`,
  `/api/restore/apply`, `/api/restore-ack` e `/api/app-ready`: loopback e token.

O preflight materializa o estado do IndexedDB no disco, verifica todos os anexos, cria snapshot
com manifesto SHA-256 e entra em manutenção. O updater só então baixa para `staging/`, valida,
instala lado a lado, testa e troca o ponteiro ativo.

### Contexto e operação

O protocolo obrigatório está em `docs/context/README.md`: L0 descobre relevância no
`index.json`, L1 descreve arquitetura e L2 é a implementação/testes. Runbooks canônicos:

- `docs/context/runbooks/publicar-release.md`;
- `docs/context/runbooks/instalar-maquina-nova.md`;
- `docs/context/runbooks/atualizar-maquina-b.md`;
- `docs/context/runbooks/rollback-restauracao.md`;
- `docs/context/runbooks/incidente-maquina-b.md`.

---

## Contrato de APIs entre módulos

Tudo pendurado no namespace global `PMO`. Sem módulos ES, sem bundler.
Cada arquivo começa com `(function (PMO) { ... })(window.PMO = window.PMO || {});`

### `PMO.util` (00)
```js
uid(prefix)                        -> string id estável
fmtDate(iso)                       -> "30/07/2026"      (vazio -> "—")
fmtDateShort(iso)                  -> "30/jul"
parseDate(any)                     -> ISO "YYYY-MM-DD" | null
addDays(iso, n) / diffDays(a, b)   -> iso / número inteiro
fmtMoney(n, {compact})             -> "R$ 1,2 mi" | "R$ 1.234.567"
fmtNum(n, dec) / fmtPct(n, dec)    -> "1.234,5" / "87,5%"
safeDiv(a, b, fallback=0)          -> nunca NaN/Infinity
clamp(n, min, max)
el(tag, attrs, children)           -> HTMLElement  (attrs: class, text, html, on:{}, data:{})
h(html)                            -> DocumentFragment
qs(sel, root) / qsa(sel, root)
debounce(fn, ms) / groupBy(arr, fn) / sum(arr, fn) / uniq(arr)
sortBy(arr, fn, dir)               -> nova array
csvEscape(s) / csvParse(text, delim?) -> string / array de arrays
download(filename, content, mime)  -> dispara download no browser
toast(msg, kind)                   -> kind: 'ok'|'warn'|'erro'|'info'
confirmar({titulo, texto, ok, cancelar}) -> Promise<boolean>
```

### `PMO.model` (10)
```js
APP_VERSION                        -> SemVer do runtime
SCHEMA_VERSION                     -> number
GATES                              -> [{id,codigo,nome,ordem,descricao}]  G0..G5
TAXONOMIA                          -> {categorias, tipos, status, estagios, driversPadrao,
                                       respostasRisco, severidades, tiposMudanca, ...}
projetoVazio()                     -> objeto projeto com todos os campos default
portfolioVazio()                   -> bundle vazio válido
migrarComRelatorio(bundle)         -> {bundle, relatorio:{de,para,passos}}
migrar(bundle)                     -> atalho idempotente; nunca muta o argumento
prepararSomenteLeitura(bundle)     -> visão inspecionável sem rebaixar schema futuro
validar(bundle)                    -> {ok, erros:[], avisos:[]}

evm(projeto, dataDate?)            -> {BAC,PV,EV,AC,SV,CV,SPI,CPI,EAC,ETC,VAC,TCPI,
                                       pctPlanejado,pctFisico,desvioDias}
saudeProjeto(projeto)              -> {rag, score, motivos:[]}   rag: verde|ambar|vermelho|azul|cinza
kpisPortfolio(projetos, opts)      -> objeto com todos os indicadores agregados
exposicaoRisco(projeto)            -> número (Σ prob*impacto/25 * exposicaoCusto)
curvaS(projeto|projetos)           -> [{periodo,pv,ev,ac,pvAcum,evAcum,acAcum}]
capacidade(bundle)                 -> [{pessoaId, meses:[{periodo,alocPct,horas,over}]}]
priorizar(projetos, pesos)         -> projetos com {scoreValor, scoreEsforco, ranking}
```

### `PMO.store` (20)
```js
await init()                       -> abre IndexedDB, carrega disco se disponível
state                             -> bundle em memória (LEITURA apenas)
await mutate(acao, fn)             -> fn(draft); persiste; grava audit; emite 'change'
await salvarAgora(opts?)           -> flush; {forcarDisco:true} não muda a preferência
await importarBundle(bundle, modo) -> modo: 'substituir'|'mesclar'
await anexoAdicionar(File, meta)   -> {id,...}   grava blob em IDB (+ disco se online)
await anexoObter(id)               -> {meta, blob}
await anexoRemover(id)
await anexoUrl(id)                 -> objectURL (revogar depois)
await inventariarAnexos(opts?)      -> materializa/verifica tamanho e SHA-256
await prepararAtualizacao()         -> preflight + snapshot + modo manutenção
await consultarAtualizacao()        -> release estável configurada
await aplicarAtualizacao()          -> handoff do snapshot selado ao updater
await sairModoManutencao()
on(evento, fn) / off(evento, fn)   -> eventos: 'change','status','erro'
statusDisco                        -> {online:bool, ultimoSalvo, erro}
```

### `PMO.importar` (30-39)
```js
detectar(fileName, texto|bytes)    -> 'mspdi'|'xer'|'pmxml'|'csv'|'xlsx'|'mpp'|'bundle'|null
await lerArquivo(File)             -> {kind, fileName, projetosCandidatos:[ProjetoCandidato],
                                       avisos:[], meta:{}}
reconciliar(candidatos, bundleAtual) -> {novos:[{candidato, motivo}],
                                       atualizacoes:[{projetoId, codigo, nome, candidato,
                                       motivoMatch, campos:[{campo, rotulo, formatador, de, para,
                                       deTexto, paraTexto, relevancia, escolhido,
                                       substituiColecao?}]}],
                                       conflitos:[{candidato, projetoId, motivo}],
                                       resumo:{novos, atualizados, camposAlterados, semMudanca, conflitos}}
await aplicar(plano)               -> grava via Store.mutate
```
`ProjetoCandidato` = objeto no formato de `PMO.model.projetoVazio()` mais
`_origem:{kind,fileName,externalId}` e `_bruto:{...}` (dados crus para inspeção).
Em `reconciliar()`: `novos` traz os candidatos sem correspondência (com `motivo`); `conflitos`
traz casamentos por similaridade de nome, que nunca atualizam por conta própria e exigem
confirmação manual; `resumo` traz as contagens exibidas no diff de reconciliação.

### `PMO.exportar` (40-49)
```js
csv(entidade, filtro)              -> string
bundleJson()                       -> string
mspdi(projeto)                     -> string XML  (MSPDI válido, tarefas = marcos + gates)
ics(itens)                         -> string ICS  (gates, comitês, marcos críticos)
statusReportHtml(projeto, opts)    -> string HTML autocontido
pacoteComiteHtml(projetos, bundle, opts) -> string HTML autocontido (deck, print-friendly)
baixarStatusReport(projeto, opts) / baixarPacoteComite(projetos, bundle, opts)
markdown(projeto)                  -> string MD (colável em Teams/Word)
variantes()                        -> [{id, rotulo, publico, descricao}]
VARIANTE_PADRAO                    -> 'interno'  (padrão dos dois geradores)
```
`opts` dos dois geradores HTML: `{ bundle, dataStatus, variante }`.
`variante` ∈ `interno | executivo | auditoria | externo`; valor ausente ou desconhecido cai
no padrão. A política de cada público (quais seções entram, se mostra dinheiro, se oculta
itens `restrito`) vive num único registro declarativo em `42-export-relatorios.js`,
compartilhado pelos dois relatórios — nunca duplique a regra no chamador.

**Privacidade:** nas variantes `externo` e `executivo`, riscos, issues e decisões com
`restrito: true` não podem aparecer em nenhum lugar do documento, e o próprio documento
declara quantos itens ficaram de fora. `interno` e `auditoria` mostram tudo.

### `PMO.chart` (50)
Toda função recebe `(container, dados, opts)` e retorna `{atualizar(dados), destruir()}`.
Toda função usa `var(--cor-*)` do tema — nunca cor hardcoded.
```js
donut, barras, linha, area, curvaS, bubble, heatmap, matriz5x5,
funil, waterfall, gauge, sparkline, gantt, timelineGates
```

### `PMO.views` (60-79)
```js
PMO.views['<rota>'] = {
  titulo: 'Rótulo no menu',
  icone: '<svg .../>',
  grupo: 'Governança',
  montar(container, params) -> void,   // renderiza; assina Store 'change' via ctx
  desmontar()               -> void    // limpa listeners/timers
}
```

### `PMO.app` (90)
```js
navegar(rota, params) / rotaAtual / registrarAtalho(k, fn) / tema(nome)
abrirPainel(titulo, conteudo, opts)  -> painel lateral (drawer)
abrirModal(titulo, conteudo, opts)   -> Promise
```

---

## Convenções de código

- **`var` e `function`** — nada de `let`/`const`/arrow/template literals? **Não**: ES2020 é
  permitido (Chromium moderno). Use `const`/`let`, arrow, template literals, optional chaining,
  `??`. **Proibido**: módulos ES (`import`/`export`), decorators, top-level await.
- **Nenhum `innerHTML` com dado do usuário.** Usar `el()` / `textContent`. Exceção: strings de
  SVG estáticas definidas no código.
- **IDs de entidade** são strings opacas. Nunca assumir formato.
- **Datas** trafegam como ISO `YYYY-MM-DD` string. Nunca `Date` no bundle persistido.
- **Dinheiro** em unidades inteiras da moeda (reais), `number`. Nunca string.
- **Percentuais** em 0..100, `number`. `SPI`/`CPI` em razão (1.0 = no plano).
- Erros de parser nunca lançam para fora: acumular em `avisos[]` e seguir.
- Todo `<table>` de dados precisa de `<caption>` (sr-only), `<th scope>` e ser navegável por teclado.
- Contraste mínimo AA. Nenhum estado comunicado só por cor: RAG sempre tem cor **e** rótulo/ícone.

## Antes de dizer "pronto"

1. `.\tools\validar-contexto.ps1` e `.\tests\Run-Tests.ps1` sem erro.
2. `.\build.ps1` sem erro e `dist/pmo-tool.html` sem recurso externo em `src=`/`href=`.
3. `.\serve.ps1` sobe exatamente em 8090; app carrega sem erro no console.
4. Navegar **todas** as views com portfólio semeado E com portfólio vazio.
5. Importar cada arquivo de `samples/` e conferir o diff de reconciliação.
6. Anexar arquivo, recarregar a página, confirmar IndexedDB e réplica em disco.
7. Exportar cada formato e reabrir/reimportar o que for reimportável.
8. Em mudança de release: gerar e validar o pacote; confirmar que nenhum caminho persistente
   entrou no ZIP e que versão, schema, commit, timestamp e hashes coincidem.
9. Em mudança de persistência/update: executar preflight, snapshot, falhas simuladas, diagnóstico,
   rollback e restore drill conforme os runbooks; comparar IDs, contagens e SHA-256 pré/pós.
10. Confirmar que `git status` não inclui dado real, configuração local, estado, logs ou artefatos.

### Sessão na nuvem (`CLAUDE_CODE_REMOTE=true`)

A VM da nuvem é Ubuntu, sem Windows PowerShell 5.1 e sem navegador. Nela:

- Não execute `build.ps1`, `serve.ps1`, `pmo.ps1` nem os scripts de `tests/` e `tools/`.
  Não instale PowerShell 7 nem porte scripts para bash: os testes chamam `powershell.exe`
  e o alvo é o 5.1 (G2, G3).
- Quem verifica é o CI do PR (`.github/workflows/release.yml`, Windows, PS 5.1). Todo trabalho
  termina em branch + PR; só declare pronto com o CI verde.
- Pode rodar: `node tests/model-migration.test.mjs` (Node 22 vem instalado), `git` e `gh`.
- Não rode comandos `/gsd-*` nem crie ou edite `.planning/`: o planejamento GSD é mantido só na
  máquina local.
- Dos itens de "Antes de dizer pronto", o CI cobre 1, 2 e 8. O item 9 é coberto só em parte
  (`Test-UpdaterRecovery.ps1` e `Invoke-ServerIntegration.ps1` exercitam journals, preflight e
  API em porta de teste, sem o restore drill dos runbooks). O item 10 roda na própria VM com
  `git status`. Os itens 3 a 7 e 9 ficam para a máquina local: liste no corpo do PR o que
  precisa ser conferido no navegador.
