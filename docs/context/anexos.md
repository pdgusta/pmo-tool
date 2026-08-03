# L1 — Cofre de anexos

## Modelo de dados

Um anexo tem duas partes independentes:

- **metadados** no `bundle.anexos`, incluindo ID, nome, MIME, tamanho, projeto, descrição,
  categoria, timestamps e indicador de réplica;
- **blob** no object store `anexos` do IndexedDB e, quando disponível, em
  `data/attachments/<id>`.

Projetos guardam somente IDs em sua lista `anexos`. O ID é opaco e é o nome físico permitido no
servidor; o nome original é metadado e nunca compõe caminho de escrita.

## Adição, leitura e remoção

Ao adicionar, o Store calcula a identidade, tenta armazenar o blob em destinos válidos e só então
inclui os metadados por `Store.mutate`. Se nenhum destino confirmar a escrita, a operação falha sem
criar uma referência órfã.

Na leitura, IndexedDB é consultado primeiro e disco serve como fallback. A ausência em ambos é
erro de integridade, não anexo vazio. URLs criadas com `URL.createObjectURL` devem ser revogadas
pela view consumidora.

A remoção é **metadata-first**: o Store primeiro retira metadados e referências por
`Store.mutate`, depois força a persistência do bundle sem o anexo em cada réplica. O blob só é
apagado do destino que confirmou esse bundle. Se a limpeza física falhar, permanece um órfão
recuperável e sem referência, a falha é emitida e o retorno informa `orfaoRecuperavel`; nunca fica
um metadado apontando para conteúdo já apagado.

## Ressincronização

A ressincronização considera individualmente cada anexo sem réplica em disco:

1. lê o blob no IndexedDB;
2. confere tamanho e, quando disponível, SHA-256;
3. envia para arquivo temporário no servidor;
4. o servidor efetiva e devolve tamanho/hash;
5. apenas o ID confirmado recebe `emDisco=true`.

Um contador agregado não pode marcar todos os pendentes como gravados. IDs ausentes no IndexedDB,
falhas HTTP e divergências continuam pendentes e são apresentados ao usuário.

Quando o blob existe no IndexedDB, o Store calcula SHA-256 no navegador e o compara com o índice
físico; ausência ou divergência provoca nova materialização. O servidor recalcula o SHA-256 do
arquivo efetivado, e o preflight rejeita qualquer diferença entre inventário, bundle e disco. O
flag `emDisco` isolado nunca serve como prova.

Antes de listar ou ler o cofre em disco, o servidor usa `Repair-PmoAtomicBytes` para reconciliar
cada blob e seu eventual `.replace-backup` contra tamanho/hash conhecidos. Backups, temporários e
arquivos `.corrupt-*` permanecem resíduos de recuperação, nunca anexos canônicos nem entradas do
inventário funcional.

## Snapshot e update

Antes de update, cada metadado deve corresponder a exatamente um blob exportável. O snapshot
contém todos os blobs, inclusive aqueles que residem somente no navegador, e um manifesto com
`id`, caminho, tamanho e SHA-256.

O snapshot é selado apenas quando:

- não existem IDs duplicados;
- todas as referências de projeto apontam para metadados existentes;
- todos os metadados apontam para blob existente;
- tamanho e hash do arquivo copiado coincidem;
- uma segunda leitura do manifesto confirma o conjunto completo.

O pacote de runtime e a pasta `versions/` jamais contêm anexos. Rollback de código no mesmo schema
não toca nos blobs. Restauração de dados recupera bundle e blobs como um conjunto pareado.

## Arquivos importados e templates

Por padrão, o arquivo original usado numa importação é oferecido para armazenamento no cofre; a
decisão de não guardá-lo precisa ser explícita. O parser continua produzindo apenas candidatos e
não cria anexos fora do fluxo do Store.

Templates personalizados não são anexos: ficam em `data/user-templates/`, recebem as mesmas
garantias de snapshot e prevalecem sobre templates de fábrica sem modificar versões imutáveis.

## Gate de validação

Testar blob apenas no navegador, apenas no disco, ausente, corrompido, de zero bytes, grande,
duplicado, upload interrompido, disco cheio, remoção parcial, ressincronização mista e comparação
de todos os hashes antes/depois de update e restauração.
