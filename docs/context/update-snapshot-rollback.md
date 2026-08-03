# L1 — Update, snapshot e rollback

## Princípio transacional

Update instala código novo sem modificar dados existentes. Instalação e ativação são etapas
diferentes; antes do `app-ready`, a troca de ponteiro é tentativa recuperável e a versão anterior
permanece registrada como alvo de compensação. Qualquer condição ambígua encerra o fluxo em
segurança (`fail closed`).

## Preflight e snapshot

A versão ativa prepara o update por endpoint administrativo autenticado por token efêmero de
sessão e restrito a loopback. O preflight:

1. aguarda persistência e bloqueia novas mutações;
2. escolhe o estado canônico e materializa `portfolio.json`;
3. exporta todos os blobs do IndexedDB ou disco;
4. inclui configuração, preferências e templates do usuário;
5. grava manifesto com versão, schema, caminhos, tamanhos e SHA-256;
6. relê e verifica o snapshot;
7. devolve seu ID somente após selá-lo.

O Store conserva separadamente a cópia escolhida no boot e o bundle canônico atual. O preflight
materializa o estado canônico da versão ativa e o snapshot guarda `portfolio.json` para restore e
`raw-bundle.json` como evidência byte a byte pré-ativação, antes de a nova versão executar sua
migração. Essa evidência não deve ser confundida com uma cópia histórica anterior a migrações que
a versão já ativa tenha realizado em boots passados.

O navegador calcula SHA-256 dos blobs no IndexedDB, o servidor recalcula os arquivos
materializados e o preflight exige correspondência exata com os metadados do bundle. O manifesto
então confere tamanho e SHA-256 de todos os arquivos copiados e é relido antes do selo. Bundle,
anexos, configuração e templates são copiados por primitivas duráveis: temporário no mesmo volume,
`Flush(true)`, troca e nova leitura. Uma cópia ainda em cache não pode tornar o snapshot selado.

O snapshot fica em `data/update-backups/<id>/`, nunca em staging. Mantêm-se os três últimos
snapshots válidos, mas a limpeza só ocorre após update concluído e nunca remove o único snapshot
compatível com a versão anterior.

## Estados recuperáveis

`state/update.json` registra, por escrita atômica, ID da operação quando aplicável, versões,
snapshot, fase, timestamps, último erro e a identidade do updater criador
(`updaterRuntimeVersion`, caminho relativo e SHA-256 do manifesto da release). O update normal usa:

```text
idle → prepared → downloading → verified → installed → activating → committed
```

Rollback e restauração começam com snapshots híbridos próprios:

```text
rollback-prepared → rolling-back → rolled-back                 (mesmo schema)
rollback-prepared → restoring → rolled-back                    (schema diferente)
restore-prepared  → restoring → restored
```

Cancelamento antes da mutação termina em `cancelled`; uma falha genérica só vira `failed` quando
nenhum ponteiro ou dado está parcialmente mutado. Fases `activating`, `rolling-back`, `restoring`
ou `recovering` permanecem recuperáveis, com `recoveryRequired`, e podem terminar com os sufixos
`-recovered`. O launcher também considera `pendingActivationId` e `restore.json`, não apenas a
fase. Nunca deduz sucesso somente pela existência de uma pasta.

Cada troca de dados recebe um `restoreId` novo. `update.json`, `restore.json` e
`restore-pending.json` devem concordar simultaneamente nesse `restoreId` e no `snapshotId`. Um
journal `completed` de outra operação é evidência obsoleta e pode ser ignorado; um journal
incompleto sem fase ou identificadores correlacionáveis é ambíguo e bloqueia a recuperação. Um
journal correlacionado só pode finalizar se o `restore-pending` correspondente existir e conferir.

`atualizar.ps1` escolhe o código de recuperação pelo journal antes de considerar fallbacks. Ele
exige concordância entre journals de update e restore, valida caminho, sintaxe, pin de
`release.json` e inventário do runtime criador e só então o executa. Fora de recuperação, tenta o
updater da versão ativa, depois o da anterior e por último o bootstrap raiz; assim uma nova versão
não assume uma máquina de estados criada por código incompatível.

Os candidatos ativo e anterior também carregam, respectivamente,
`activeReleaseManifestSha256` e `previousReleaseManifestSha256`. O wrapper verifica o pin e o
inventário antes de invocar qualquer updater; um script adulterado não ganha execução apenas por
ter seu `release.json` interno recalculado.

Recovery adquire primeiro o mutex de runtime pertencente ao servidor. Antes dele, configuração e
bootstrap são lidos em modo estritamente somente leitura e o mutex de update não materializa arquivo
de lock. Se a aplicação ainda estiver aberta, o recovery termina sem reparar JSON, criar diretórios
ou alterar arquivos persistentes.

Restauração manual e rollback exigem o snapshot atual de segurança. Somente a compensação automática
de uma ativação interrompida pode tratar a criação de um snapshot de emergência como best-effort:
se essa cópia adicional falhar, registra o evento e restaura o snapshot pré-update já selado. Essa
exceção não relaxa preflight, restore solicitado pelo usuário nem rollback normal.

## Download e instalação

`/api/update/check` consulta somente a última release publicada e estável, mantém cache pelo
intervalo configurado (24 horas por padrão) e revalida com ETag. Depois do consentimento, o updater
resolve novamente a release imutável que fornecerá os assets e então:

1. antes da rede, limita o asset informado pelo GitHub a 256 MiB e o manifesto externo a 1 MiB e
   reserva capacidade para ambos, até 512 MiB expandidos, snapshot de compensação e 32 MiB de
   margem no volume correspondente;
2. baixa manifesto e ZIP para diretório exclusivo em `staging/` e confere tamanho e digest GitHub;
3. limita cada entrada comprimida a 64 MiB, o total comprimido ao limite do ZIP e a razão a
   `200:1`, além dos limites de quantidade e tamanho expandido;
4. rejeita caminho absoluto, `..`, ADS, links, duplicidade, colisão por caixa e qualquer item fora
   da allowlist;
5. extrai em staging e verifica manifesto externo, inventário completo e hashes internos;
6. move o runtime validado para `versions/<versão>` sem sobrescrever pasta existente;
7. executa health check do servidor isolado com cópia do snapshot.

Todas as raízes operacionais — inclusive `config` — são comparadas par a par depois da resolução
canônica e precisam estar livres de reparse points. Exclusões recursivas do updater passam por uma
raiz gerenciada explícita, exigem que o alvo seja seu descendente estrito e varrem toda a árvore
novamente para recusar links, junctions ou qualquer reparse point em qualquer descendente antes de
remover. Se um único item falhar, a árvore gerenciada não é apagada nem o alvo externo é atravessado.

Somente depois disso grava `active.json`, inicia a nova versão na origem fixa e aguarda
`POST /api/app-ready`. O handshake correlaciona um `activationId` com `update.json`, `active.json`
e a instância iniciada; valida versão, schema, modo de leitura, origem da carga, selo e SHA-256 do
portfolio, confirmação de IndexedDB/disco e inventário completo dos anexos. Timeout ou divergência
impede o commit e aciona compensação. A migração entregue ao handshake já traz relatório de
contagens e invariantes, além da validação semântica descrita no L1 de modelo/schema.

Cada candidato do polling é relido e passa por `Test-AppReady`. Na borda entre o último intervalo,
timeout e recovery, `Complete-ActivationIfReady` relê tanto `app-ready.json` quanto `active.json` e
revalida `appVersion`, `schemaVersion`, `activationId`, versão/schema do ponteiro e
`pendingActivationId` antes de converter uma tentativa em commit. Um ACK válido de outra ativação
é recusado em vez de inferido como sucesso.

## Endpoints administrativos

- `GET /api/health`: versão, build, schema, versão ativa e estado dos diretórios.
- `GET /api/update/check`: resultado cacheado da consulta de release.
- `POST /api/update/prepare`: preflight, snapshot e manutenção.
- `GET /api/update/status`: fase e resultado sem conteúdo funcional.
- `POST /api/update/apply`: entrega o snapshot preparado ao updater e encerra o servidor atual.
- `POST /api/rollback/apply`: entrega ao updater o snapshot híbrido do estado pós-update antes de
  trocar a versão ou restaurar dados.
- `POST /api/restore/apply`: correlaciona o snapshot atual de segurança com o snapshot alvo antes
  de iniciar a restauração.
- `POST /api/update/cancel`: sai da manutenção e cancela o snapshot preparado.
- `GET /api/restore-pending`: entrega ao Store o conjunto restaurado que ainda precisa substituir
  o IndexedDB.
- `POST /api/restore-ack`: confirma no navegador bundle e anexos restaurados, com hashes.
- `POST /api/app-ready`: confirmação da versão recém-ativada.

Rotas de mutação e as consultas sensíveis de restauração exigem `AdminToken`, origem loopback e
método correto. O token não é salvo em logs nem em arquivos permanentes. O `restore-ack` só remove
a cópia intermediária em `data/recovery/<restoreId>/` depois de correlacionar `restoreId`,
`snapshotId`, journal, raiz e inventário. O servidor sela primeiro o ACK, remove somente essa raiz,
registra `recoveryCleaned`, apaga `restore-pending.json` e por último remove o journal `completed`
ainda correlacionado. Uma queda antes do último passo deixa apenas um journal stale seguro, jamais
autoriza a retomada de outra restauração.

## Rollback

- **Mesmo schema escrito:** trocar `active.json` para a versão anterior, validar e reabrir; dados
  permanecem como estão.
- **Schema diferente ou dados migrados:** preservar primeiro o estado pós-update, voltar a versão
  e restaurar o snapshot pareado.
- **Usuário já trabalhou na versão nova:** nunca restaurar automaticamente; apresentar impacto,
  exigir confirmação e conservar ambas as cópias.

Os comandos raiz de rollback e restauração abrem a versão atual com um pedido explícito. O Store
confirma IndexedDB e disco, materializa anexos e sela um snapshot `pre-rollback` ou `pre-restore`;
o updater exige seu ID e o marcador correspondente antes de qualquer troca.

Antes de restaurar, o updater exige `sourceSchemaVersion` no snapshot e comprova que ele pertence ao
intervalo `schema.readMin..readMax` do runtime que abrirá os dados. Também valida o pin e o
inventário desse runtime. No rollback, a versão anterior precisa conseguir ler o schema alvo; uma
incompatibilidade falha antes de alterar ponteiro ou dados.

Falha durante rollback mantém o modo de manutenção e orienta o runbook; não tenta sucessivas
reescritas destrutivas.

## Gates

Testar interrupção e reinício em cada fase, rede ausente, rate limit, checksum divergente, ZIP
malicioso, disco cheio, versão existente, runtime adulterado, health check falho, migração falha,
timeout de `app-ready`, bootstrap incompatível e restauração integral. Todos devem preservar a
versão ativa e os hashes dos dados anteriores quando a ativação não conclui. Os gates incluem ainda:

- `Test-UpdaterRecovery.ps1`: pin antes de execução, restore correlacionado, journal stale/incompleto,
  `app-ready` de outra ativação e recovery sem escrita com runtime ocupado;
- `Run-Tests.ps1`: cópias duráveis, raiz de volume independente do `cwd`, raízes
  ancestrais/traversal e recusa de delete com junction em descendente;
- `Invoke-ServerIntegration.ps1`: propriedade do mutex pelo servidor, rejeição do parâmetro antigo,
  limpeza pós-ACK e divergência de `activationId`.
