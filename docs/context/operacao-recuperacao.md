# L1 — Operação e recuperação da máquina B

## Modelo operacional

A máquina B é consumidora de releases estáveis. Ela não contém checkout Git, não publica código e
não sincroniza dados com a máquina A. Consulta ao GitHub envia apenas metadados HTTP de release;
portfolio, anexos, configurações e auditoria permanecem locais.

O fluxo normal é iniciar por `pmo.ps1`, aguardar a carga completa e aceitar ou adiar o aviso de
update. Operação manual dentro de `versions/`, `state/` ou snapshots é proibida durante uso normal.

## Observabilidade local

`-Diagnostico` e `/api/health` devem informar sem conteúdo sensível:

- versão ativa/anterior, build, schema e bootstrap;
- origem e porta;
- diretórios resolvidos e capacidade de leitura/escrita;
- estado de IndexedDB, disco, lock e update;
- último snapshot válido e contagens/hashes agregados de anexos;
- último erro técnico e localização do log.

**Atual:** `-Diagnostico` valida pin e inventário do runtime, faz teste real de escrita em `data/`,
informa SHA-256 do `portfolio.json`, contagem/bytes/hash agregado dos anexos e resíduos de
recuperação, último snapshot selado válido, journals pendentes e o último erro sanitizado de
`update.log`. Integridade inválida ou diretório não gravável torna o resultado geral falso.

`logs/update.log` usa registros JSON locais, rotação por tamanho e mensagens curtas com token ou
authorization redigidos; o diagnóstico também mascara caminhos da instalação. O servidor ainda
usa console para sua operação corrente, e stdout/stderr do health check isolado são temporários.

## Prioridade em incidentes

1. interromper novas mutações sem matar processos durante escrita;
2. não apagar nem renomear dados, snapshots, staging ou estado;
3. preservar cópia dos arquivos de controle e logs;
4. registrar versão, fase, horário e ação que antecedeu a falha;
5. usar diagnóstico somente leitura;
6. escolher retomada, rollback ou restauração conforme schema e evidências.

Porta ocupada, runtime corrompido, update incompleto e falha de persistência são incidentes
diferentes. Mudar a porta para “fazer abrir” é especialmente proibido porque muda a origem do
armazenamento do navegador.

## Recuperação

O launcher interpreta `update.json`, `active.pendingActivationId` e `restore.json` antes de iniciar
o app. Fases anteriores à ativação descartam somente staging incompleto; ativação interrompida
finaliza o `app-ready` já válido somente depois de reler versão, schema, `activationId` e ponteiro,
ou compensa ponteiro e, quando necessário, dados. Restauração usa journal idempotente por componente
e só é liberada no navegador após `restore-ack`. A operação segue os runbooks e preserva evidência
de cada decisão.

O par `restoreId` + `snapshotId` identifica uma única transação em `update.json`, `restore.json` e
`restore-pending.json`. Journal `completed` sem relação com a operação ativa é stale e não deve ser
retomado. Journal incompleto divergente, identificador ausente/inválido ou `completed` correlacionado
sem seu pending são ambiguidades bloqueantes; não se escolhe o registro “mais recente” por heurística.

O recovery usa o mesmo mutex de runtime que pertence ao processo `serve.ps1`. Se ele estiver
ocupado, a tentativa encerra antes de qualquer reparo, criação de diretório ou arquivo de lock. Isso
permite repetir o comando depois que o servidor fechar sem introduzir uma segunda mutação concorrente.

Restauração é considerada comprovada apenas quando bundle valida, contagens de entidades
coincidem, todos os blobs conferem tamanho/hash e a aplicação inicia na origem esperada. Abrir a UI
sem exceção não é prova suficiente.

## Retenção e limpeza

Após update confirmado, conservar versão ativa, anterior e três snapshots válidos. A limpeza só
roda depois do estado `committed`, nunca durante a ativação, e não deve remover evidência de
incidente aberto. Backups rotativos comuns e snapshots de update têm finalidades distintas.

As cópias intermediárias em `data/recovery/` preservam o estado físico anterior durante uma troca
por componentes. Elas permanecem enquanto `restore-pending.json` aguarda o navegador. Somente um
`restore-ack` com bundle e anexos confirmados pode remover o diretório cujo `restoreId`, journal,
raiz e snapshot correspondam exatamente; qualquer divergência preserva a recuperação. Após o ACK,
o servidor remove apenas `data/recovery/<restoreId>`, registra se a limpeza ocorreu, apaga o pending
e só então elimina o journal `completed` ainda correlacionado. Um journal stale deixado por queda
nesse intervalo é ignorado na próxima operação.

O updater só apaga árvores temporárias, versões retidas e snapshots excedentes por uma rotina de
remoção gerenciada: o alvo precisa ser descendente estrito da raiz autorizada e toda a árvore deve
estar livre de reparse points. Retenção nunca transforma um caminho informado por estado em alvo de
remoção sem essa validação.

## Gestão ITIL

- Cada release possui registro de mudança, evidências dos gates e instrução de rollback.
- Falha operacional gera incidente; recorrência ou causa desconhecida gera análise de problema.
- Configuração da instalação, versões, manifests e snapshots formam os itens de configuração.
- Aprendizados atualizam runbooks e L1 antes da próxima release.

## Critério de serviço estável

Durante o piloto de cinco dias úteis: zero perda, zero hash divergente, nenhuma troca de origem,
nenhum update fora do consentimento, logs suficientes para diagnóstico e um exercício completo de
rollback/restauração aprovado.
