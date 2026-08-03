# PMO Tool — Governança de Portfólio de TI

Aplicação local de **governança de portfólio** para PMO Leads. A interface continua sendo um
único HTML autocontido, servido na origem fixa `http://localhost:8090`. Desde a v1.4.1, a
distribuição para Windows é portátil: código versionado e dados do usuário ficam fisicamente
separados, e releases estáveis podem ser instaladas sem substituir o portfólio local.

Não há dependências de runtime nem envio de dados para a nuvem. A rede é usada somente para a
consulta e o download opcional de releases públicas no GitHub.

Inspirada em **Oracle Primavera P6 EPPM** (WBS, gates, EVM, baselines, dependências
cross-project) e **Monday.com** (múltiplas visões, edição inline, kanban).

> **Não é ferramenta de micro-gestão.** O detalhe de cronograma continua vivendo nos
> arquivos de projeto — que você anexa aqui. Este app existe para a camada acima:
> decisão de comitê, gates, exceções, risco, valor e dinheiro.

---

## Como rodar

### Instalação portátil

Na pasta da instalação, use sempre o launcher estável:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pmo.ps1
```

Comandos operacionais:

```powershell
.\pmo.ps1 -Atualizar
.\pmo.ps1 -SemAtualizacao
.\pmo.ps1 -Diagnostico
.\pmo.ps1 -Rollback
.\pmo.ps1 -RestaurarSnapshot <id>
```

- `-Atualizar` força a consulta e abre o fluxo assistido; nenhum update é aplicado sem preflight
  e snapshot selado.
- `-SemAtualizacao` inicia sem consultar releases.
- `-Diagnostico` informa versão ativa, origem, diretórios persistentes e snapshots.
- `-Rollback` volta ao runtime anterior; quando o schema mudou, exige snapshot compatível.
- `-RestaurarSnapshot` restaura explicitamente um snapshot identificado pelo runbook.

Para habilitar updates, configure o repositório público no arquivo local
`config/install.json`, no formato `OWNER/REPOSITORY`:

```json
{
  "repository": "OWNER/pmo-tool"
}
```

O instalador portátil cria `config/install.json` com os defaults validados; o arquivo
`config/install.example.json` documenta esse contrato. Sem `repository`, o app continua
funcionando normalmente, mas a consulta de releases permanece desabilitada.

Para gerar uma nova instalação a partir da máquina de desenvolvimento:

```powershell
.\tools\New-PortableInstall.ps1 -Destination "C:\PMO-Tool" -Repository "OWNER/pmo-tool"
```

Use `-IncludeCurrentData` apenas quando quiser copiar expressamente os dados locais para a nova
instalação. Por padrão, nenhuma informação de usuário é transportada.

### Desenvolvimento local

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

O script compila e sobe o servidor em `http://localhost:8090`. Para só compilar:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Na primeira execução o app carrega um portfólio de demonstração com 20 projetos de uma
empresa fictícia. Use **Configurações → Limpar portfólio** para começar do zero.

### Requisitos

O uso da aplicação exige apenas Windows PowerShell 5.1; não há Node, npm, Python ou .NET SDK no
runtime distribuído. O servidor usa `System.Net.HttpListener`. O uso funcional é offline; somente
o updater precisa de acesso direto ao GitHub.

Para desenvolvimento e gates de release, Node.js 22.22.0 é uma dependência exclusiva de testes:
ele valida os migradores e analisa o JavaScript já combinado no HTML final. A pipeline fixa essa
versão e falha se esse gate não puder ser executado.

---

## O que ele faz

| Tela | Para quê |
|---|---|
| **Painel executivo** | KPIs do portfólio, farol, curva S consolidada, matriz de risco, caixa de entrada de governança |
| **Portfólio** | Tabela estilo Monday (colunas configuráveis, ordenação, rodapé de totais) e kanban com arrastar entre estágios |
| **Roadmap** | Gantt de portfólio com swimlanes por programa, baseline vs previsto, marcos, gates e linha de hoje |
| **Cronograma (WBS)** | Aba no projeto: árvore de tarefas importada do arquivo, com baseline vs previsto e busca |
| **Gates e stage-gate** | Funil G0→G5, portões pendentes e atrasados, aprovações condicionais em aberto |
| **Riscos e issues** | Matriz 5×5, exposição financeira ponderada, registro consolidado editável, aging de issues |
| **Decisões e mudanças** | O que o comitê precisa decidir e a cascata de erosão da baseline por mudanças aprovadas |
| **Financeiro e EVM** | BAC/PV/EV/AC/EAC/VAC/SPI/CPI/TCPI por projeto e agregado, curva S, CAPEX vs OPEX |
| **Recursos** | Mapa de calor de alocação pessoa × mês, sobrealocação, carga por pessoa |
| **Benefícios** | Valor prometido no business case vs valor realizado |
| **Priorização** | Matriz valor × esforço com quadrantes e ranking |
| **Relatórios** | Pacote do Comitê e status report por projeto, em quatro versões conforme o público (interno, executivo, auditoria, externo), Markdown para Teams |
| **Cofre de anexos** | Business case, atas, contratos, evidências de gate e os arquivos de projeto |
| **Importar/Exportar** | Ver abaixo |
| **Configurações** | Limiares de governança, cadastros, qualidade dos dados |
| **Metadados do ambiente** | Taxonomias e modelo de stage-gate ajustáveis ao vocabulário da organização |
| **Auditoria** | Trilha completa de alterações |

---

## Compatibilidade com o ecossistema Microsoft e Primavera

Esta versão trabalha **por arquivo**, não por API. Não há login em tenant, nem chamada
autenticada a SharePoint, Planner ou Teams — decisão tomada em conjunto porque não há
como testar contra um Entra ID real. O ponto de extensão existe, mas está inerte.

### Importação

| Formato | O que é lido |
|---|---|
| **MSPDI** (`.xml` do MS Project) | Tarefas, hierarquia WBS, baseline (`<Baseline Number=0>`), marcos, custos, % completo, predecessores, recursos |
| **Primavera XER** | `PROJECT`, `TASK`, `PROJWBS`, `TASKPRED`, `TASKRSRC`, `RSRC` — tolerante a linhas com contagem de coluna divergente |
| **Primavera PMXML** | `<Project>`, `<WBS>`, `<Activity>`, `<Relationship>` |
| **CSV** | Mapeamento tolerante de colunas (dicionário de sinônimos em pt-BR e inglês), delimitador e BOM detectados |
| **XLSX** | Leitor ZIP + OOXML próprio, usando `DecompressionStream` nativo do navegador. Aba de projetos e aba de curva financeira mensal |
| **`.mpp`** | **Apenas metadados de documento** (property set OLE): título, autor, empresa, gerente, comentários, datas. Ver limitação abaixo |
| **Bundle `.json`** | Backup nativo completo, com mesclar ou substituir |

**O avanço físico agregado** é calculado por média ponderada pelo custo de baseline das
tarefas folha; sem custo, pondera por trabalho; sem trabalho, média simples. O critério
usado é sempre informado nos avisos da importação.

### Reconciliação — o ponto central

Importar **nunca** sobrescreve direto. O app casa o arquivo com o portfólio (por
identificador externo, depois por código, depois por similaridade de nome — e
similaridade só gera pedido de confirmação, jamais atualização automática) e apresenta um
**diff campo a campo**, com cada linha aprovável individualmente.

Duas travas importantes:

- **Cada formato declara o que forneceu.** Um `.mpp` só pode propor nome, descrição e
  link do arquivo — nunca orçamento, datas ou avanço. Uma planilha de atualização de
  status só toca as colunas que ela tem. Sem isso, os valores padrão do modelo seriam
  aplicados como se viessem do arquivo, regredindo projetos em execução para "Ideação".
- **Tolerância a ruído:** diferenças ≤ 0,5% em dinheiro e ≤ 0,1 ponto percentual são
  ignoradas, para o diff mostrar mudança real e não arredondamento.

Tudo é aplicado numa única transação, com uma entrada de auditoria por importação, e
pode ser desfeito com `Ctrl+Z`.

### Exportação

- **CSV** (BOM + `;`, abre limpo no Excel pt-BR) de projetos, EVM, riscos, issues,
  decisões, mudanças, marcos, gates, benefícios, alocações, curva mensal e auditoria
- **`.ics`** de gates e comitês, importável no Outlook (RFC 5545, dobra de linha correta)
- **MSPDI `.xml`** de volta para o MS Project, com calendário, hierarquia e baseline
- **Pacote do Comitê** em HTML, pronto para virar PDF pela impressão. O número de páginas
  depende do público escolhido: nove na versão de auditoria, sete na interna, quatro na
  externa e um documento contínuo enxuto na executiva
- **Status report** por projeto, também em quatro versões — a executiva cabe em uma folha A4
- **Markdown** para colar no Teams ou no Word
- **CSV de esquema** para criar Listas do SharePoint com as mesmas colunas
- **Bundle JSON** — backup integral para guarda controlada fora do repositório de código

---

## Persistência

O runtime e o estado do usuário têm proprietários diferentes:

- **IndexedDB** guarda o portfólio e os blobs dos anexos. Funciona offline.
- **Disco** recebe uma réplica em `data/portfolio.json` e `data/attachments/`, gravada
  pelo servidor local com backup rotativo dos 30 últimos estados em `data/backups/`.
- **Templates do usuário** ficam em `data/user-templates/` e prevalecem sobre templates de
  fábrica com o mesmo nome.
- **Configuração da instalação** fica em `config/install.json`; estado operacional fica em
  `state/`. Nenhum desses diretórios pertence a uma release.

A instalação suportada usa pasta local gravável, preferencialmente NTFS. `data/` não deve ser
colocado em Git, OneDrive, SharePoint, pasta de rede ou outro mecanismo de sincronização: update
de código e sincronização de dados são responsabilidades deliberadamente separadas. Falha de
gravação em disco **nunca é silenciosa**: o chip de estado no topo mostra a situação e o painel
de persistência permite ressincronizar.

O `.gitignore` bloqueia dados, anexos, configuração local, estado, versões instaladas, staging,
logs e artefatos. Somente os exemplos `config/*.example.json` e `state/*.example.json` fazem
parte do repositório. Bundles e anexos reais nunca devem ser commitados.

## Atualização sem perda de dados

Uma release contém somente runtime (`serve.ps1`, HTML compilado, templates de fábrica, samples,
updater versionado e manifestos). Ela é extraída em `versions/<versão>/`; nunca escreve em
`data/`, `config/` ou nos templates do usuário.

Antes de ativar uma nova versão, a aplicação:

1. conclui o flush do IndexedDB e materializa anexos pendentes;
2. cria em `data/update-backups/<id>/` um snapshot de `portfolio.json`, anexos, templates do
   usuário e configuração local;
3. sela um manifesto com tamanhos e SHA-256 e relê todos os arquivos;
4. baixa e valida o ZIP em `staging/`, instala lado a lado e testa o novo runtime;
5. altera atomicamente `state/active.json` somente depois dessas validações.

Qualquer divergência interrompe o fluxo sem trocar a versão ativa (`fail closed`). O launcher
mantém a versão anterior para rollback e conserva, por padrão, três snapshots completos. Se o
schema não mudou, `-Rollback` troca apenas o runtime; se mudou, o retorno exige o snapshot
compatível. Uma restauração explícita nunca deve ser executada sem preservar trabalho feito
depois do update.

A origem `http://localhost:8090` é invariável. Se a porta estiver ocupada, a inicialização falha
em vez de escolher outra, pois mudar host ou porta criaria outro IndexedDB e faria os dados do
navegador parecerem ausentes.

---

## Limitações — o que este app não faz

São limites reais, não omissões:

1. **`.mpp` não tem o cronograma lido, e não é gerado.** É um formato binário proprietário
   (OLE/Compound File) com os streams de cronograma não documentados; não existe parser nem
   writer em JavaScript. O app lê o property set OLE do documento e guarda o arquivo como
   anexo. Para trazer o cronograma, use **Arquivo → Salvar como → XML** no MS Project — e os
   cronogramas-modelo saem em MSPDI (`.xml`) pelo mesmo motivo.
2. **Sem integração autenticada com Microsoft 365.** Os campos de link para SharePoint,
   Planner e Teams são URLs coladas manualmente e abrem no navegador.
3. **Sem multiusuário simultâneo.** É uma ferramenta de um PMO Lead. Duas abas ao mesmo
   tempo detectam o conflito e carregam a versão mais recente, mas não há merge.
4. **`.mpp`, `.xlsx` e `.docx` de exemplo foram gerados por este projeto** e validados
   contra as especificações dos formatos. O caminho do `.mpp` ainda não foi exercitado
   contra um arquivo salvo por uma instalação real do MS Project.
5. **Sem autenticação de usuário ou multiusuário no servidor local.** Ele atende somente em
   `localhost` e presume máquina de uso pessoal. As rotas administrativas de update usam um
   token efêmero por sessão, mas isso não transforma o produto em um serviço compartilhado.

---

## Novidades por versão

A versão em uso aparece no rodapé da navegação e na tela de Ajuda.

### v1.4.1 — Runtime portátil e atualização protegida

- **Código separado dos dados.** Releases vivem em `versions/<semver>/`; portfólio, anexos,
  configurações e templates do usuário sobrevivem fora do runtime.
- **Launcher estável.** `pmo.ps1` mantém a origem, impede duas instâncias e oferece diagnóstico,
  update, rollback e restauração de snapshot.
- **Update transacional.** Pacotes e hashes são verificados antes da instalação, e a ativação
  ocorre por troca atômica do ponteiro da versão ativa.
- **Snapshot completo.** O preflight materializa o estado híbrido e sela portfolio, anexos,
  configuração e customizações antes de permitir a atualização.
- **Schema explícito.** Migrações 1→2→3→4 são encadeadas, preservam campos desconhecidos e
  recusam escrita em schema futuro.
- **Build reproduzível.** O pacote de release possui versão, commit, timestamp, contrato de
  schema, bootstrap mínimo e SHA-256 de cada arquivo.

### v1.4 — Um report para cada público

O que mudou: **o mesmo dado vira quatro documentos diferentes.** Até aqui o pacote do comitê
e o status report saíam sempre iguais, com tudo dentro — e mandar isso para um cliente ou
para o sponsor significava editar o PDF à mão, ou não mandar.

- **Quatro versões, uma escolha.** Antes de gerar, você escolhe o público:
  - **Interno** — tudo que se aplica, inclusive os itens marcados como restritos.
  - **Executivo** — farol, indicadores essenciais, pedidos ao comitê e próximo gate.
    O status report cabe em uma folha A4; o pacote vira um documento enxuto.
  - **Auditoria** — trilha de decisões, gates com data e aprovador, mudanças e o
    comparativo de baseline. Sem narrativa subjetiva: só o que é verificável no registro.
  - **Externo** — escopo, marcos e avanço. Sem riscos, sem exposição financeira e sem
    conflito interno. Nenhum valor em reais aparece.
- **Restrito agora restringe de verdade.** Riscos, issues e decisões marcados como restritos
  não aparecem em título, detalhe ou tabela nas versões externa e executiva. Nas versões
  interna e de auditoria continuam visíveis, com uma etiqueta "restrito" ao lado.
- **O documento declara o que omitiu.** Quando algo restrito fica de fora, o próprio arquivo
  diz quantos itens não constam daquela versão — quem recebe sabe que existe mais, sem saber
  o quê. Se não houver nada omitido, nenhum aviso aparece.
- **Seleção onde você já estava.** O seletor de público está na tela de Relatórios, para o
  pacote e para o status report, e no botão de gerar report dentro do painel do projeto.
  A escolha vale igualmente para a impressão e para o download, e o nome do arquivo baixado
  carrega a versão.
- Cada documento traz um selo com a versão gerada, no cabeçalho e no rodapé de cada página.

### v1.3 — Cronogramas de verdade

O que mudou: **a ferramenta passou a guardar o cronograma que você importa.** Até aqui ela lia
o arquivo, calculava os agregados e jogava as tarefas fora — o que significava que exportar de
volta para o MS Project devolvia só um resumo por gate, perdendo a WBS.

- **WBS persistida.** Importar MSPDI, XER ou PMXML agora guarda a estrutura completa de tarefas:
  hierarquia, datas previstas e de baseline, custos, trabalho, percentuais e predecessoras.
- **Nova aba "Cronograma (WBS)"** no painel do projeto, com árvore indentada, busca e a
  comparação baseline versus previsto tarefa a tarefa. Somente leitura por desenho — editar
  cronograma é o que o MS Project faz bem, e ter duas versões da verdade seria pior que não ter
  nenhuma.
- **Exportação MSPDI fiel.** O arquivo devolvido contém as tarefas reais. Um ciclo completo
  (importar → exportar → reimportar) agora preserva avanço físico, BAC, datas reais e descrição.
  Antes, reimportar um arquivo exportado propunha substituir o avanço real pela razão de marcos
  concluídos.
- **Cronogramas-modelo** em `templates/`: cinco modelos (aplicação, infraestrutura, segurança,
  dados e regulatório) com fases, marcos e gates. Ao criar um projeto você escolhe o modelo e
  todas as datas são deslocadas para a sua data de início. O modelo traz estrutura, nunca
  orçamento nem avanço. São arquivos **MSPDI (`.xml`)** — o MS Project abre nativamente e salva
  como `.mpp`.
- **Correção:** os andaimes da importação (`_bruto`, `_origem`, `_campos`) estavam sendo gravados
  dentro de cada projeto importado e inflando o arquivo de dados. Agora são descartados.

### v1.2 — O ambiente é seu

O que mudou: **a ferramenta deixa de impor o vocabulário e o processo dela.** Categorias,
tipos, situações, fóruns e o próprio modelo de stage-gate passam a ser configuráveis, e a
primeira abertura vira uma tela de três escolhas em vez de um portfólio fictício surgindo
sem explicação.

- **Metadados do ambiente** (nova tela): 19 listas editáveis — categorias de projeto, tipos,
  categorias de risco, tipos de mudança e de benefício, categorias de anexo, fóruns e mais.
  Renomear "Âmbar" para "Atenção" muda o app inteiro na hora.
- **Modelo de stage-gate configurável.** Modelos prontos de 4, 5, 6 ou 7 portões, e cada
  portão com código, nome e descrição próprios. Trocar de modelo **remapeia os projetos
  existentes** — nada fica órfão. A sugestão de destino sempre dobra para o portão anterior,
  nunca alegando um avanço que o projeto não teve.
- **Trava semântica.** Listas que o motor usa como lógica (farol, situações de risco e
  mudança, escala de severidade) aceitam renomear e redescrever, mas não remover: apagar um
  desses valores deixaria registros órfãos e o cálculo de EVM sem referência. As listas
  puramente de negócio são livres.
- **Remoção segura.** Excluir um valor em uso exige escolher para onde vão os registros que
  o usam. O app conta quantos são antes de deixar você prosseguir.
- **Primeira execução** (nova tela): nome da organização, número de portões e três caminhos —
  importar seus projetos, explorar a demonstração ou começar do zero. A demonstração deixou
  de ser carregada automaticamente; agora é uma escolha.

### v1.1 — Editar sem sair do app

O que mudou: **riscos, issues, marcos, gates, mudanças, decisões, benefícios, dependências,
alocações e status reports agora são editáveis dentro da ferramenta.** Até aqui eles só podiam
entrar por importação — registrar um risco levantado na reunião exigia editar planilha e
reimportar.

- Botões de **adicionar, editar e excluir** em todas as tabelas de registro, tanto no painel
  do projeto quanto nos registros consolidados do portfólio. Dá para editar um risco direto
  da tela de Riscos, sem abrir o projeto antes.
- **Anexo vinculado ao registro, não só ao projeto.** O contrato fica preso à mudança que o
  originou; a evidência, ao gate que a exigiu; a ata, à decisão. O cofre de anexos mostra o
  vínculo, e excluir o registro preserva o arquivo — só desfaz a ligação.
- **Marcação de restrito** em riscos, issues e decisões. Na v1.1 ela apenas sinalizava o
  item; desde a v1.4 esses itens somem dos relatórios externos e executivos.
- Novas seções no painel do projeto para **equipe alocada** e **dependências**, que antes só
  existiam nas telas de portfólio.
- Tudo passa pela trilha de auditoria e é reversível com `Ctrl+Z`.

### v1.0 — Primeira versão

Governança de portfólio ponta a ponta: 15 telas, motor de EVM com faróis calculados a partir
de sinais objetivos, importação de MSPDI, Primavera (XER e PMXML), CSV, XLSX e metadados de
`.mpp`, reconciliação com aprovação campo a campo, cofre de anexos, pacote de comitê e status
report em HTML, exportação em CSV, ICS e MSPDI.

---

## Estrutura

### Repositório de desenvolvimento

```text
pmo-tool/
  CLAUDE.md                  guardrails do projeto (leia antes de mexer)
  pmo.ps1                    bootstrap estável da instalação
  atualizar.ps1              delega ao updater do runtime ativo
  build.ps1                  compila src/ -> dist/pmo-tool.html
  serve.ps1                  HttpListener :8090, persistência e preflight
  config/*.example.json      contrato de configuração versionado
  state/*.example.json       contrato de estado versionado
  docs/context/              índice L0, visões L1 e runbooks
  tools/                     build de release, instalação, update e validações
  src/css/                   tema, layout, componentes e gráficos
  src/js/                    00 util · 10 modelo/EVM · 20 store · 30 import ·
                             40-42 export · 50 gráficos · 60-66 views ·
                             68 editor · 70 config · 80 seed · 90 app
  samples/                   arquivos fictícios nos formatos suportados
  templates/                 cronogramas de fábrica em MSPDI
  data/                      persistência local, sempre ignorada pelo Git
  dist/pmo-tool.html         build local, sempre ignorado pelo Git
```

### Instalação portátil gerada

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
  state/update.lock             criado somente durante preflight/update
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
    update-backups/
    user-templates/
  staging/
  logs/
```

`versions/<semver>/` é imutável. `data/`, `config/`, `state/` e `logs/` pertencem à
instalação e não ao pacote de release. Scripts da raiz também não são substituídos por updates
regulares; `release.json` pode exigir um bootstrap mínimo e bloquear uma versão incompatível.

O prefixo numérico dos arquivos em `src/js/` **é** o mecanismo de ordenação de
dependência do build. Não renomeie sem checar.

## Contexto técnico e runbooks

O mapa em [`docs/context/index.json`](docs/context/index.json) adota divulgação progressiva:

- **L0:** resumo, tags, criticidade e relações para descobrir o domínio relevante;
- **L1:** invariantes, fluxos, riscos e contratos em `docs/context/*.md`;
- **L2:** código, contratos e testes que constituem a fonte de verdade.

Antes de alterar arquitetura ou persistência, leia o L0, os L1 selecionados e somente então os
arquivos L2 necessários. Valide o mapa com:

```powershell
.\tools\validar-contexto.ps1
```

Procedimentos operacionais:

- [Publicar uma release](docs/context/runbooks/publicar-release.md)
- [Atualizar a máquina B](docs/context/runbooks/atualizar-maquina-b.md)
- [Rollback e restauração](docs/context/runbooks/rollback-restauracao.md)
- [Tratar incidente na máquina B](docs/context/runbooks/incidente-maquina-b.md)

---

## Notas de método

- **O farol nunca é digitado.** Ele emerge de sinais objetivos (SPI, CPI, desvio de
  prazo, estouro projetado, riscos altos, issues críticas, gate atrasado, reporte em
  atraso) contra limiares configuráveis. Todo projeto mostra **por que** está naquela
  cor — é a rastreabilidade que o comitê cobra. Um farol pode ser sobreposto
  manualmente, mas exige justificativa e fica marcado como manual.
- **SPI e CPI têm piso de significância.** No início do ciclo esses índices são ruído:
  com pouco valor planejado decorrido ou pouco custo incorrido, uma variação irrelevante
  em valor absoluto produz um índice catastrófico, e `EAC = BAC ÷ CPI` projeta estouros
  fantasma. Abaixo do piso o índice continua sendo exibido, marcado como **n/s**, mas não
  alimenta o farol, e o EAC assume o restante ao ritmo planejado.
- **Gráficos** seguem uma paleta categórica validada para daltonismo, nunca usam eixo
  duplo, e todo gráfico tem um gêmeo tabular acessível.
- **Nenhum estado é comunicado só por cor** — todo farol carrega cor, ícone e rótulo,
  inclusive nos relatórios impressos em preto e branco.
