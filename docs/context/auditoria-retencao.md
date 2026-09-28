# L1 — Auditoria e retenção

## Dados permanentes

`auditLog` e `imports` pertencem ao bundle do usuário e acompanham snapshots e restaurações.

Uma entrada de auditoria registra:

- ID, instante e ator;
- ação humana ou sistêmica;
- tipo e ID da entidade, quando aplicável;
- resumo e campos afetados, quando informados;
- opcionalmente `snapshotId` (snapshot de proteção da operação), `payload` (exclusão lógica
  versionada), `restauraDe` (id da entrada de exclusão restaurada) e `copia` (registro da cópia
  verificável) — presentes só quando a própria operação os produz; entradas antigas e as que não
  os usam mantêm o formato de hoje.

O histórico de imports registra a origem, o arquivo, o instante e o resultado da aplicação. Os
arquivos originais associados vivem no cofre, não dentro das entradas.

## Produção da trilha

Toda mutação funcional passa por `Store.mutate`, que cria auditoria depois de o draft ser aceito.
Importações aplicam o plano em uma transação lógica e produzem uma entrada coerente, evitando uma
linha desconectada para cada campo.

Desfazer/refazer é diferente de auditoria: as pilhas vivem apenas em memória, têm retenção curta e
somem ao encerrar. Elas não substituem backup, não são restauradas após update e não autorizam
apagar eventos persistidos.

**Achado A-2 (comportamento atual conhecido):** Ctrl+Z desfaz o estado inteiro, inclusive a
trilha, então a entrada de auditoria da própria ação desfeita também some. Anterior a esta fase e
fora do escopo de PROT-01..05; registrado aqui para o dono saber.

## Limpar, Substituir e a trilha

"Limpar portfólio" preserva `auditLog` e `imports` byte a byte — mesmos ids, mesma ordem, mesmo
conteúdo — e só acrescenta a entrada da própria limpeza, com o `snapshotId` do snapshot de
proteção (`model.bundleAposLimpeza`) — premissa P-02. "Substituir portfólio por bundle importado"
mescla as duas trilhas por id em vez de sobrescrever a local pela do arquivo: em id repetido, a
entrada local prevalece e a do arquivo é descartada e contada; a ordem final é por `em` crescente,
com empate resolvido pela posição original, sem depender de ordenação estável do motor JS
(`model.mesclarTrilha`) — premissa P-08.

Essa mescla vale só para `auditLog`/`imports` na operação Substituir. A regra "nunca mescla
auditorias por timestamp automaticamente", descrita acima para a restauração pós-update, continua
valendo sem mudança para aquele caso — os dois mecanismos não se sobrepõem.

## Exclusão lógica e lixeira

Excluir um projeto ou um registro nunca apaga fisicamente: a entrada de auditoria da exclusão
carrega um `payload` versionado (`versao: 1`) com tudo o que a exclusão mudou — o item removido, a
posição e os vínculos desfeitos (dependências de outros projetos, `entidadeRef` de anexos)
(`model.excluirProjeto`/`model.excluirRegistro`) — premissa P-01. `SCHEMA_VERSION` não sobe para
isso: a lixeira é derivada de `auditLog` por leitura pura (`model.lixeira`), sem coleção de topo
nova. A Fase 22 (migração v4→v5) precisa converter esses payloads ou a restauração passa a
normalizá-los — acoplamento registrado aqui para a próxima fase ler primeiro.

Restaurar (`model.restaurarDaLixeira`) só acrescenta uma entrada nova na trilha, com `restauraDe`
apontando para a exclusão original, que nunca é editada nem apagada — a trilha só cresce. A
restauração é recusada com motivo quando a entrada já foi restaurada, já existe entidade com o
mesmo id, o projeto-pai do registro não existe, ou o payload tem versão desconhecida; referências
perdidas nesse meio-tempo (programa, pessoa, projeto de destino de dependência ou anexo removido)
são limpas e avisadas, e não bloqueiam a restauração — premissa P-13. Exclusões feitas antes desta
versão, sem `payload` na entrada, não aparecem na lixeira, mas continuam visíveis na tela de
Auditoria — premissa P-24.

## Política de retenção

O contrato portátil proíbe limites destrutivos implícitos. Em particular, migração e registro de
novos eventos não podem manter somente as últimas 4.000 auditorias ou 400 importações.

Se volume exigir arquivamento futuro, a política deve:

1. ser configurada e documentada;
2. mover eventos antigos para arquivo persistente verificável, não descartá-los;
3. incluir arquivo e índice nos snapshots;
4. manter consulta e exportação disponíveis;
5. registrar a própria operação de arquivamento;
6. nunca executar como efeito colateral de update de código.

Até existir esse mecanismo, a retenção é integral.

## Update, snapshot e restauração

O preflight atual registra versão, schema, selo temporal, quantidade/inventário dos anexos e o
inventário completo de arquivos com tamanho e SHA-256. Contagens e hash canônico das demais
coleções ainda pertencem ao comparador pré/pós-update do gate de validação; não são campos já
persistidos no manifesto do snapshot.

A validação pré/pós-update deve comparar IDs, ordem e conteúdo; só metadados técnicos de
versão/schema e transformações explicitamente declaradas pelo migrador podem mudar.

Uma restauração motivada por schema preserva primeiro o estado pós-update, inclusive sua trilha.
Depois restaura bundle, anexos e demais dados do snapshot pareado. Nunca mescla auditorias por
timestamp automaticamente, pois isso pode quebrar causalidade ou duplicar eventos.

## Privacidade e diagnóstico

Logs operacionais fora do bundle registram fases, códigos e erros técnicos, sem copiar nomes de
projeto, conteúdo de anexos ou campos sensíveis. A auditoria funcional permanece local e nunca é
enviada ao GitHub durante consulta ou download de release.

O campo `payload` da entrada de exclusão lógica segue a mesma regra: nenhum gerador de relatório
(`PMO.exportar`) nem a exportação CSV de auditoria o lê — o payload existe só para a restauração.

## Gate de validação

Criar fixtures acima dos antigos limites, migrar, salvar, reiniciar e comparar todos os eventos.
Testar import, desfazer, update no mesmo schema, update com novo schema, rollback e restauração.
Qualquer redução não declarada de contagens ou IDs é falha bloqueante de release.
