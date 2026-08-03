# L1 — Auditoria e retenção

## Dados permanentes

`auditLog` e `imports` pertencem ao bundle do usuário e acompanham snapshots e restaurações.

Uma entrada de auditoria registra:

- ID, instante e ator;
- ação humana ou sistêmica;
- tipo e ID da entidade, quando aplicável;
- resumo e campos afetados, quando informados.

O histórico de imports registra a origem, o arquivo, o instante e o resultado da aplicação. Os
arquivos originais associados vivem no cofre, não dentro das entradas.

## Produção da trilha

Toda mutação funcional passa por `Store.mutate`, que cria auditoria depois de o draft ser aceito.
Importações aplicam o plano em uma transação lógica e produzem uma entrada coerente, evitando uma
linha desconectada para cada campo.

Desfazer/refazer é diferente de auditoria: as pilhas vivem apenas em memória, têm retenção curta e
somem ao encerrar. Elas não substituem backup, não são restauradas após update e não autorizam
apagar eventos persistidos.

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

## Gate de validação

Criar fixtures acima dos antigos limites, migrar, salvar, reiniciar e comparar todos os eventos.
Testar import, desfazer, update no mesmo schema, update com novo schema, rollback e restauração.
Qualquer redução não declarada de contagens ou IDs é falha bloqueante de release.
