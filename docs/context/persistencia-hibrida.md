# L1 — Persistência híbrida

## Responsabilidade e fontes

`PMO.store` mantém o bundle em memória e coordena duas persistências locais:

- **IndexedDB:** cópia primária do navegador, banco `pmo-tool`, object stores `kv` e `anexos`;
- **disco:** réplica servida pela API local, com `portfolio.json` e blobs em `attachments/`.

O modo `file://` continua funcional somente com IndexedDB, mas não é suficiente para executar uma
atualização portátil com garantias de recuperação. A máquina B suportada usa sempre a origem
`http://localhost:8090`.

## Inicialização

O Store abre IndexedDB, verifica `/api/health`, lê as duas cópias disponíveis e interpreta
`meta.salvoEm` com `Date.parse`. Se as cópias forem idênticas, a do navegador é usada; se os dois
instantes forem válidos e distintos, vence a cópia realmente mais recente.

Quando as réplicas divergem e não podem ser ordenadas com segurança — data ausente, inválida ou
instantes iguais com conteúdo diferente — o Store carrega a cópia do disco apenas para inspeção,
emite conflito visível e abre em modo somente leitura até reconciliação explícita. O bundle bruto
escolhido permanece separado do bundle migrado, e schema futuro também bloqueia gravações.

## Mutações e gravação

`Store.mutate(acao, fn, meta)` é a única porta de mutação funcional:

1. clona o estado anterior e o draft;
2. executa a função sobre o draft;
3. atualiza metadados e auditoria;
4. persiste no IndexedDB;
5. agenda a réplica em disco;
6. emite `change` ou erro visível.

`salvarAgora()` cancela o debounce e força os dois destinos. Desfazer/refazer conserva no máximo
25 estados em memória e não é mecanismo de backup.

No servidor, gravações persistentes usam arquivo temporário no mesmo volume e troca atômica. O
arquivo anterior só pode ser removido depois que o novo estiver íntegro. Uma falha em um destino
não pode marcar o outro como concluído nem apagar a última cópia válida.

`Write-PmoJsonAtomic` e `Write-PmoBytesAtomic` abrem um `FileStream` exclusivo, gravam o temporário,
executam `Flush(true)`, fecham o handle e só então usam `File.Replace` ou `File.Move`. O temporário
fica no mesmo diretório do destino, portanto a troca permanece no mesmo volume.

Snapshots, cópias de saúde e estágios de restauração usam `Copy-PmoFileDurable` e
`Copy-PmoDirectoryDurable`. Cada arquivo é copiado para um temporário, recebe `Flush(true)` antes da
troca e só passa a integrar um manifesto depois de tamanho e SHA-256 serem relidos. A cópia de uma
árvore rejeita reparse points e não considera um retorno de `Copy-Item` como prova de durabilidade.

`Repair-PmoAtomicBytes` reconcilia o alvo binário com seu `.replace-backup` depois de uma interrupção.
Quando há tamanho ou SHA-256 esperado, ele só promove o candidato que satisfaz o contrato; alvo
corrompido é preservado como `.corrupt-*` antes de recuperar o backup, e dois candidatos inválidos
causam falha fechada. O servidor aplica essa reparação aos anexos antes de inventariá-los ou
entregá-los; resíduos de recuperação não são tratados como blobs canônicos.

## Separação física portátil

Na arquitetura-alvo, o servidor recebe caminhos persistentes explícitos:

- `-DataDir`: bundle, anexos, backups e templates do usuário;
- `-ConfigDir`: configuração da instalação;
- `-StateDir`: ponteiro ativo, estado do update e lock.

Esses caminhos são resolvidos fora de `versions/<versão>` e validados antes de o listener abrir.
`data`, `config` e `state` devem ser distintos entre si e também não podem coincidir nem se aninhar
com `versions`, `staging` ou `logs`. A checagem ocorre sobre caminhos canônicos, inclui `config` e
recusa reparse points na raiz ou em ancestrais existentes. Código de runtime nunca infere `data/`
a partir da própria pasta versionada. O launcher mantém porta 8090; porta ocupada é erro bloqueante,
sem troca automática, pois origem diferente cria outro IndexedDB e outro `localStorage`.

## Preparação para update

`Store.prepararAtualizacao()` coordena o preflight pela versão atualmente ativa:

1. aguarda o Store ficar pronto e todas as mutações terminarem;
2. resolve a cópia canônica entre navegador e disco;
3. força persistência e materializa blobs necessários ao snapshot;
4. valida bundle, referências e hashes;
5. cria e sela snapshot completo;
6. entra em manutenção e rejeita novas mutações;
7. entrega ao updater um identificador de snapshot e um resumo verificável.

`salvarEmDisco=false` preserva seu significado operacional. O preflight pode exportar diretamente
do IndexedDB para o snapshot, sem mudar permanentemente a preferência.

## Snapshot de proteção (Limpar e Substituir)

Antes de "Limpar portfólio" ou "Substituir portfólio por bundle importado" mudarem qualquer coisa,
o Store roda uma sequência de proteção: salva forçado no IndexedDB e no disco, materializa e
confere o inventário de anexos, guarda o selo `meta.salvoEm`, pede ao servidor local `POST
/api/protecao/snapshot` e só segue depois que a resposta confirma um snapshot selado e verificado;
qualquer divergência de selo, versão, schema ou SHA-256 de anexo cancela a operação sem mudar nada.

O snapshot fica em `data/backups/snapshots/<snapshotId>/`, com o mesmo layout do snapshot de
update (`portfolio.json`, `raw-bundle.json`, `attachments/`, `user-templates/`, `manifest.json`),
mas sem `config/` nem `state/` — premissa P-02, D-30. A rotina nunca lê nem escreve
`state/update.json`, `state/update.lock` nem a flag de manutenção do updater. O manifesto tem
`formatVersion 1`, `kind` `pre-limpar` ou `pre-substituir` e as contagens de cada coleção.

Falha em qualquer etapa é fechada (G8): a pasta incompleta é removida e nada é limpo ou
substituído. Snapshots de proteção ficam guardados sem prazo nesta fase — nenhuma rotina os apaga
— e o espaço livre é conferido antes de criar cada um (premissa P-03). Sem servidor (`file://`) e
sem dado a proteger (nenhum projeto, programa, pessoa, anexo ou visão salva), a operação roda sem
snapshot; com dado a proteger e sem servidor, é recusada com motivo (premissa P-05).

## Retenção dos backups rotativos

Os backups automáticos de `portfolio.json` (`data/backups/portfolio-*.json`, um a cada gravação)
seguem retenção por janela de tempo, não só por contagem (premissa P-14, revista pelo dono). Os
30 backups mais recentes ficam sempre (piso). Fora do piso, os arquivos caem em baldes de uma hora
nas últimas 48 horas e de um dia até 90 dias, em UTC, e cada balde guarda **o mais antigo e o mais
novo**: o mais antigo preserva o estado de antes de uma rajada de gravações na mesma hora, que de
outro modo seria apagado. Arquivo com data futura nunca é apagado; arquivo com mais de 90 dias sai,
exceto se estiver no piso. As janelas são configuráveis
só para cima em `config/install.json`, pelas chaves `retention.portfolioBackupsHourlyHours` e
`retention.portfolioBackupsDailyDays`; um valor abaixo do piso 48/90 é elevado ao padrão e a chave
antiga `retention.portfolioBackups` (contagem fixa) é ignorada sem erro.

Os snapshots de update (`retention.snapshots`) e as versões instaladas continuam com retenção por
contagem, sem mudança nesta fase; o mínimo "nunca só por contagem" (G8) se aplica aos backups
rotativos do portfólio. Estender a mesma regra de janela aos snapshots de update é uma decisão do
dono ainda em aberto — premissa P-16, marcado **Alvo**.

## Cópia verificável

A PMO exporta uma cópia verificável (manifesto SHA-256) do que o app protege — `portfolio.json`,
os anexos referenciados e `user-templates/` — para uma pasta fora da instalação que ela escolhe;
nunca `config/`, `state/`, `versions/`, `logs/`, backups nem snapshots (D-30, G11, premissa P-19).
Cada exportação cria uma subpasta nova `pmo-copia-<data>-<id>/`; nada que já existia na pasta
escolhida é tocado.

O destino é validado pelo servidor: caminho absoluto de pasta local já existente, com letra de
unidade — sem `..`, sem UNC, fora das raízes da instalação. Link simbólico e junção são recusados;
pasta do OneDrive (reparse point de nuvem, OneDrive Files On-Demand) é aceita — premissa P-18,
decisão do dono T-024. Para a PMO não precisar digitar, uma rota só de leitura
(`GET /api/copia-verificavel/sugestoes`, nunca cria nada) devolve a pasta Documentos, as pastas do
OneDrive do usuário quando existem e passam na validação, e o último destino usado, lido da trilha
— premissa P-17.

Cada exportação registra no `auditLog` o `copyId`, a pasta, o SHA-256 do manifesto, a contagem de
arquivos e de bytes; "conferir" é somente leitura, não gera entrada de audit, e compara o SHA-256
do manifesto atual com o registrado, apontando arquivo alterado, faltando ou a mais — premissa
P-20. A cópia verificável é um artefato de backup, não sincronização da instalação (G11): o app
nunca recomenda OneDrive, SharePoint ou pasta de rede como réplica contínua da própria instalação.

## Invariantes e falhas

- Falhas em IndexedDB, disco ou servidor aparecem na UI e em status diagnóstico.
- `statusDisco.pendente` só é limpo após confirmação real do servidor.
- Nenhum update começa enquanto houver gravação, conflito ou blob não verificável.
- Preferências importantes, inclusive tema, possuem fonte canônica no bundle; `localStorage` é
  apenas cache descartável.
- Apenas uma instância usa a instalação; o servidor possui o mutex de runtime e o updater/recovery
  precisa adquirir esse mesmo mutex antes de qualquer mutação.
- Um update regular nunca edita `portfolio.json`, anexos ou configurações. Uma restauração explícita
  só os troca pelo journal transacional e pela cópia durável já verificada.

## Gate de validação

Testar: somente IndexedDB mais novo; somente disco mais novo; réplicas idênticas; timestamps iguais
com conteúdo divergente; timestamp ausente ou inválido; disco indisponível;
`salvarEmDisco=false`; queda durante arquivo temporário; schema futuro; tentativa de update com
mutação pendente; cópia durável de arquivo e diretório; raiz ancestral, `config` sobreposto e
junction; raiz de volume com `cwd` externo; delete gerenciado contendo junction em um descendente;
reinício após cada fase persistida; falhas do snapshot de proteção (selo divergente, SHA-256 de
anexo divergente, corpo inválido, manutenção ativa, espaço insuficiente) sem deixar pasta
incompleta; rajada de escritas cobrindo os baldes de hora e de dia da retenção de backups; e a
conferência da cópia verificável apontando arquivo alterado, faltando, a mais ou manifesto
trocado.
