# Importar e exportar

A compatibilidade do PMO Tool é baseada em **arquivos** e em **links colados por você**. Não existe
login em tenant nem integração autenticada com Microsoft 365, SharePoint, Planner ou Teams. Nada do
seu portfólio é enviado para fora da máquina.

## Formatos aceitos na importação

| Formato | O que é lido |
|---|---|
| **MSPDI/XML** | Cronograma do MS Project: WBS, tarefas, baseline, marcos, custos, progresso, predecessores e recursos presentes no arquivo. |
| **Primavera XER** | Projetos, WBS, atividades, relacionamentos e recursos presentes no arquivo. |
| **Primavera PMXML** | Projetos, WBS, atividades e relacionamentos presentes no XML. |
| **CSV** | Projetos e campos reconhecidos por mapeamento de colunas, em português ou inglês. |
| **XLSX** | Dados de projetos e curva financeira mensal nas abas reconhecidas. |
| **Bundle JSON** | Backup nativo completo, com opção de mesclar ou substituir. |
| **`.mpp`** | **Somente metadados do documento** — título, autor, empresa, assunto, comentários e datas. |

### Sobre o `.mpp`

`.mpp` é um formato binário proprietário. O PMO Tool **não lê o cronograma** de um `.mpp` e não
gera arquivos nesse formato. Ele extrai apenas o conjunto de propriedades do documento e guarda o
arquivo como anexo, para que a evidência não se perca.

Para trazer o cronograma completo de um projeto do MS Project, salve-o como **MSPDI/XML**.

## Nada é sobrescrito direto

Toda importação passa por correspondência e reconciliação. O aplicativo apresenta as mudanças
propostas **campo a campo** e você escolhe o que será aplicado. Um arquivo importado nunca
substitui o portfólio por conta própria.

Cada candidato declara quais campos aquele formato realmente forneceu, e a comparação se limita a
esses campos. Um CSV que não traz orçamento não zera o orçamento que já existe.

A estrutura analítica importada (`WBS`) é **somente leitura**: ela existe para exibir e reexportar
com fidelidade, não para editar cronograma. O detalhe de planejamento continua vivendo na
ferramenta de origem.

## Exportações

| Saída | Para quê |
|---|---|
| **CSV** | Análise no Excel: projetos, EVM, governança, recursos e auditoria. |
| **ICS** | Calendário de gates, comitês e marcos críticos, importável no Outlook. |
| **MSPDI/XML** | Uso no MS Project. |
| **Status report (HTML)** | Documento autocontido, pronto para impressão ou PDF. |
| **Pacote de comitê (HTML)** | Deck autocontido, formatado para impressão. |
| **Markdown** | Colar no Teams ou no Word. |
| **CSV de esquema** | Apoiar a criação de listas no SharePoint. |
| **Bundle JSON** | Backup controlado e transporte manual. |

Os dois documentos HTML são gerados em quatro variantes de público — veja
[Relatórios por público](../../README.md#relatórios-por-público) no README.

## Links do ecossistema

Campos de link para SharePoint, Planner, Teams e outras referências são **colados por você** e
abertos no navegador. Eles não representam uma conexão autenticada com esses serviços, e o PMO Tool
não valida nem acessa o conteúdo do outro lado.
