---
name: pmo-app
description: Compilar, servir e verificar o PMO Tool (app de governança de portfólio, single-file HTML na porta 8090). Use ao rodar/subir/abrir o app, depois de mexer em qualquer arquivo de src/, ao investigar defeito na interface, ao testar importação de MSPDI/XER/PMXML/CSV/XLSX/MPP, ou antes de declarar qualquer trabalho concluído neste projeto.
---

# PMO Tool — compilar, servir e verificar

App de governança de portfólio entregue como **um único arquivo HTML autocontido**,
servido em `http://localhost:8090`. Sem Node, sem npm, sem dependências.

**Leia `CLAUDE.md` na raiz antes de editar qualquer coisa.** Os guardrails de lá são
invioláveis (single-file, zero CDN, PowerShell 5.1, pt-BR, porta 8090).

## Ciclo de trabalho

Sempre nesta ordem. Pular o sanitizador é a causa mais comum de build quebrado.

```bash
powershell -ExecutionPolicy Bypass -File .\tools\sanitizar-fontes.ps1
```

```bash
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

```bash
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -SemBuild -SemBrowser
```

`serve.ps1` sozinho já compila e abre o navegador; use `-SemBuild -SemBrowser` quando for
dirigir o navegador por ferramenta.

## Armadilha recorrente: bytes de controle literais

Escrever uma classe de regex como `[\u0000-\u0008...]` ou o nome de stream OLE
`\u0005SummaryInformation` frequentemente grava o **byte de controle literal** no arquivo,
não a sequência de escape. Um NUL literal dentro de um `.js` quebra o parser e é invisível
numa revisão de código.

`tools\sanitizar-fontes.ps1` converte esses bytes para escapes preservando a semântica.
Rode sempre antes do build; `-Verificar` só relata (exit 1 se sujo) e serve para CI.

Se precisar gravar um escape à mão via PowerShell, monte a barra por código para não ser
normalizada: `$BS = [string][char]92; $texto = $BS + 'u0005'`.

## Verificação antes de declarar pronto

Não existe runner de testes. A verificação é dirigir o app no navegador e inspecionar o
DOM — mais confiável que screenshot, que falha quando o painel não está visível.

1. **Console limpo e todas as views montam** — navegue por `Object.keys(PMO.views)` e
   confirme zero `console.error`.
2. **Portfólio vazio não quebra nada** (guardrail G9) — `await PMO.store.limparTudo()`,
   navegue por todas as views, depois restaure com `PMO.store.importarBundle(backup, 'substituir')`.
3. **Importação ponta a ponta** — para cada arquivo de `samples/`:
   `PMO.store.obterSample(nome)` → `PMO.importar.lerArquivo(f)` → `PMO.importar.reconciliar(...)`.
   Confira que o diff **não** propõe regressão de estágio/gate nem zera financeiro.
4. **Aplicar e desfazer** — `PMO.importar.aplicar(plano)` e depois `PMO.store.desfazer()`
   precisa restaurar o valor exato de antes.
5. **Persistência** — `PMO.store.salvarAgora()` e conferir `fetch('/api/portfolio')`.
6. **Exports** — gerar e parsear: HTML dos relatórios com `DOMParser` (zero recurso
   externo), MSPDI como `application/xml` (UIDs únicos *dentro de* Tasks — Task, Resource
   e Calendar têm namespaces de UID separados, não confunda), ICS com linhas ≤ 75 octetos.

Ao terminar, deixe o portfólio no estado limpo de demonstração:
`PMO.store.importarBundle(PMO.seed.gerar(), 'substituir')`.

## Onde mexer

O prefixo numérico em `src/js/` **é** a ordem de dependência do build.

| Arquivo | Responsabilidade |
|---|---|
| `00-util.js` | formatação pt-BR, datas, CSV, XML, DOM, toast |
| `10-model.js` | schema, taxonomias, EVM, saúde/farol, KPIs, capacidade, priorização |
| `20-store.js` | IndexedDB + réplica em disco, mutate/undo, anexos |
| `30-import.js` | detecção de formato, parsers, reconciliação |
| `40-42-export-*.js` | CSV/ICS, relatórios HTML, Markdown, MSPDI |
| `50-charts.js` | biblioteca SVG (usa as classes de `src/css/50-charts.css`) |
| `60-66-views-*.js` | as 15 telas |
| `68-editores.js` | editor genérico de registros, dirigido por `M.CAMPOS_EDICAO` |
| `70-views-config.js` | metadados do ambiente e tela de primeira execução |
| `80-seed.js` | portfólio de demonstração determinístico |
| `90-app.js` | boot, roteador, drawer, modal, atalhos |

## Regras de domínio que não podem ser quebradas

- **O farol nunca é digitado.** Ele emerge de `PMO.model.saudeProjeto()`, que devolve os
  motivos. Se alterar limiares, o farol muda — é o comportamento correto.
- **SPI/CPI têm piso de significância** (`LIMIARES_PADRAO.evmSignificancia`). Abaixo dele
  o índice é exibido marcado como `n/s` e **não** alimenta o farol nem o EAC.
- **Importar nunca sobrescreve direto.** Todo candidato declara `_campos` com o que aquele
  formato realmente forneceu; a reconciliação só compara esses caminhos.
- **`.mpp` só rende metadados de documento.** Nunca afirme na interface que o cronograma
  foi lido, nem que a ferramenta gera `.mpp` — templates e exportações saem em MSPDI (`.xml`).
- **A WBS importada é somente leitura.** `projeto.tarefas[]` existe para exibir e reexportar
  com fidelidade, não para editar cronograma. Antes de mexer no export MSPDI, valide o ciclo
  importar → exportar → reimportar: ele precisa preservar avanço físico, BAC e datas.
- **Template não carrega orçamento.** Os modelos em `templates/` definem estrutura e duração
  (peso por `Work`, custo zero). Contaminar o BAC do projeto real com número de modelo seria
  pior que não ter template.
- **Toda mutação passa por `PMO.store.mutate()`** — nunca escreva em `PMO.store.state`
  direto, ou a auditoria e o desfazer ficam furados.
- **Formulário novo não se escreve à mão.** Declare os campos em `M.CAMPOS_EDICAO`
  (`10-model.js`) e use `vw.formulario()` / `PMO.editor` — há uma única implementação de
  formulário, e ela já trata data, moeda, percentual, taxonomia, pessoa, gate e escala 1–5.
- **Anexo pode pertencer a um registro**, não só ao projeto: `entidadeRef: { tipo, id, rotulo }`.
  Excluir o registro limpa o vínculo mas preserva o arquivo no cofre.
- **Nunca leia `M.TAXONOMIA` nem `M.GATES` direto** fora de `10-model.js`. Use `M.tax(colecao)`
  e `M.gates()`, que respeitam a configuração do usuário em `settings`. Ler o padrão de
  fábrica ignora silenciosamente o que o PMO configurou.
- **Carga de dados sobrescreve `settings`.** `importarBundle(..., 'substituir')` troca `meta` e
  `settings` inteiros. Qualquer preferência escolhida pelo usuário precisa ser aplicada
  DEPOIS da carga, ou é descartada sem aviso.
- **Remover valor de taxonomia ou portão exige remapear** quem o usava
  (`M.contarUso`, `M.remapearTaxonomia`, `M.contarUsoGate`, `M.remapearGate`).
  `M.mapearGatesRemovidos` sugere o destino dobrando para trás.

## Nota sobre testar com o painel do navegador oculto

Quando o painel não está visível, o Chromium estrangula `setTimeout` para ~1 s. Um teste com
muitos `await esperar(50)` sequenciais estoura o limite de 30 s da ferramenta e parece
travamento. Montagem de modal e navegação entre views são **síncronas** — teste-as sem espera
e reserve `await` para o que é de fato assíncrono (`store.mutate`, `anexoAdicionar`, `fetch`).
