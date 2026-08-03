# L1 — Importação e reconciliação

## Pipeline

`PMO.importar` separa leitura de arquivo e mutação do portfólio:

1. `detectar` identifica o formato por extensão, conteúdo e bytes;
2. `lerArquivo` executa o parser e devolve candidatos, avisos e metadados;
3. `reconciliar` encontra correspondências e gera um diff campo a campo;
4. a interface permite ao usuário escolher campos;
5. `aplicar` grava o plano aprovado por uma única chamada ao Store.

Parsers retornam `ProjetoCandidato`, baseado no projeto vazio, com `_origem` para rastreabilidade,
`_bruto` para inspeção e uma declaração dos campos realmente fornecidos. Esses andaimes não devem
ser persistidos como campos de projeto.

## Formatos e limites

- MSPDI: tarefas, WBS, baseline, marcos, custos, progresso, relações e recursos disponíveis.
- XER e PMXML: estruturas do Primavera suportadas pelos parsers tolerantes.
- CSV e XLSX: colunas detectadas e mapeadas; ausência de coluna significa “não fornecido”.
- Bundle JSON: backup nativo, validado antes de mesclar ou substituir.
- MPP: somente metadados OLE padrão; o cronograma binário não é interpretado.

Erros de parser são acumulados em `avisos` sempre que for seguro continuar. Conteúdo ilegível ou
estrutura inválida pode bloquear aquele arquivo, mas não altera o estado atual.

## Correspondência e diff

A busca por projeto existente segue identificador externo, código e, por último, similaridade de
nome. Similaridade nunca autoriza atualização automática; ela exige confirmação. O diff compara
somente campos declarados pelo parser, evitando que defaults do candidato apaguem valores reais.

Cada atualização contém `de`, `para` e escolha do usuário. Tolerâncias numéricas eliminam ruído de
arredondamento sem ocultar mudança material. Itens novos e atualizações são aplicados de modo
atômico; se qualquer validação bloqueante falhar, o plano não é parcialmente aplicado.

## Persistência e auditoria

`aplicar` usa `Store.mutate`, registra origem no projeto e adiciona uma entrada ao histórico de
imports com formato, arquivo, data e contagens. O histórico é dado permanente e não pode ser
truncado durante migração, importação ou update.

O arquivo original é guardado no cofre por padrão após confirmação do usuário, salvo opção
explícita de não guardar. Se a gravação do original falha depois da aplicação dos dados, a
interface mantém a importação e exibe aviso explícito; não descreve o arquivo como preservado.

## Invariantes

- Parser não chama API de persistência nem modifica `Store.state` diretamente.
- Import nunca sobrescreve sem diff aprovado.
- Um formato só propõe campos que realmente leu.
- `_origem`, `_bruto` e marcadores de confiança não vazam para o objeto persistido.
- O arquivo MPP nunca é descrito como cronograma importado.
- Aplicação gera auditoria e pode participar do desfazer enquanto a sessão estiver aberta.
- Um update não reexecuta imports nem depende dos arquivos originais para preservar o bundle.

## Gate de validação

Executar todos os arquivos sanitizados de `samples/`, conferir detecção, avisos, campos fornecidos,
matching e diff. Cobrir arquivo vazio, encoding diferente, colunas ausentes, ID externo duplicado,
similaridade ambígua, cancelamento, falha de validação e preservação do histórico após reinício.
