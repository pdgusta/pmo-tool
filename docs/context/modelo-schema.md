# L1 — Modelo e evolução de schema

## Responsabilidade

`PMO.model` define a forma canônica dos dados persistidos, as fábricas de entidades, as
taxonomias, os cálculos de portfólio e a fronteira de compatibilidade entre versões. Os valores
de `APP_VERSION` e `SCHEMA_VERSION` no código são a autoridade; documentação e manifestos de
release devem coincidir com eles.

**Atual:** a primeira versão portátil é app `1.4.1`, schema `4`. O registro `MIGRADORES` contém os
saltos explícitos `1 → 2`, `2 → 3` e `3 → 4`; `migrarComRelatorio` aplica a cadeia sobre uma cópia,
e `prepararSomenteLeitura` permite inspecionar/exportar schema futuro sem gravá-lo.

Antes de entregar o bundle ao Store, a cadeia valida invariantes na origem, depois de cada salto e
no resultado final; impede redução silenciosa de coleções críticas; valida configurações; executa
`model.validar(final)`; e repete a normalização para comprovar idempotência. Qualquer falha bloqueia
o commit da cópia migrada.

## Bundle canônico

O objeto raiz possui estas coleções estáveis:

- `meta`: versão de schema e app, organização, moeda, data de status e timestamps de geração e
  salvamento;
- `settings`: limiares, pesos de priorização, unidades de negócio, drivers, gates,
  taxonomias, tema e preferência de réplica em disco;
- `pessoas`, `programas` e `projetos`: registros de governança;
- `anexos`: apenas metadados e referências; os blobs vivem fora do bundle;
- `auditLog` e `imports`: trilhas permanentes do usuário;
- `visoesSalvas`: preferências funcionais persistentes.

Projetos concentram dados de datas, progresso, finanças, curva mensal, riscos, issues, gates,
marcos, mudanças, decisões, benefícios, dependências, alocações, tarefas importadas, status
reports, referências de anexos e origem de importação. IDs são strings opacas; datas persistidas
são strings ISO `YYYY-MM-DD`; dinheiro é número em reais; percentuais usam a escala `0..100`.

## Invariantes

- Um bundle gravado sempre informa `meta.schemaVersion` e `meta.appVersion`.
- Campos desconhecidos devem sobreviver a uma migração; eles podem pertencer a uma versão mais
  nova ou a uma extensão ainda não compreendida pela versão atual.
- Uma versão que encontra schema maior que o máximo suportado não pode normalizar nem gravar o
  bundle. Ela entra em modo protegido/somente leitura.
- Migração nunca opera sobre a única cópia do usuário.
- IDs existentes não são regenerados e referências não são corrigidas silenciosamente.
- Ausência de um campo conhecido pode receber o default da fábrica; valor conhecido não pode ser
  substituído por default apenas por ser falso, zero ou vazio válido.
- Auditoria, imports e anexos não sofrem truncamento como efeito colateral de migração.

## Evolução de schema

O registro explícito e sequencial de migradores (`1 → 2`, `2 → 3`, `3 → 4`, ...) segue o fluxo:

1. clonar e preservar o bundle bruto escolhido pela persistência;
2. verificar se o schema de origem é suportado;
3. aplicar cada passo necessário, em ordem, sobre a cópia;
4. validar o resultado após cada passo e novamente ao final;
5. produzir relatório com versões, alterações, avisos, contagens antes/depois e invariantes de
   integridade e não redução para cada salto;
6. somente entregar a cópia migrada para commit depois da validação completa.

Cada migrador deve ser idempotente para sua entrada, preservar propriedades que não administra e
nunca consultar relógio, rede ou DOM. `model.validar(bundle)` continua responsável por erros e
avisos sem modificar o objeto recebido.

Uma normalização estrutural pode complementar migradores, mas não pode servir como atalho para
reescrever qualquer schema desconhecido na versão corrente.

Fixtures versionadas dos schemas 1 a 4 exercitam a cadeia completa. A suíte comprova que a origem
permanece imutável, os saltos são explícitos, campos desconhecidos sobrevivem, contagens críticas
não diminuem, IDs e referências inválidos são rejeitados, `model.validar` aprova o resultado e uma
segunda execução não produz mudança adicional.

O relatório final registra também contagens antes/depois da normalização e confirma explicitamente
`integridadeFinal`, `configuracaoFinal`, `modelValidar` e `idempotente`. Esses campos são evidência
do gate executado, não substitutos para a validação; se uma invariante falhar, não há relatório de
sucesso nem bundle entregável.

## Compatibilidade com update e rollback

O manifesto da release declara o intervalo de schema lido e escrito. Antes de ativar uma versão,
o updater verifica esse contrato contra o bundle do snapshot.

- Se versão antiga e nova escrevem o mesmo schema, rollback pode trocar somente a versão ativa.
- Se a versão nova já gravou schema diferente, rollback exige restaurar a versão e o snapshot
  correspondente.
- Se houve trabalho do usuário após o update, o launcher reabre primeiro a versão atual, pede
  confirmação e o Store sela um novo snapshot híbrido antes de entregar rollback ou restauração
  ao updater. O updater recusa a operação sem esse snapshot de segurança correlacionado.

## Gate de mudança

Qualquer incremento de `SCHEMA_VERSION` exige migrador, fixture de cada versão suportada, teste de
idempotência, teste de campos desconhecidos, teste de schema futuro e instrução de rollback na
release. `tests/Invoke-ModelMigrationTests.ps1` executa a suíte JavaScript com Node.js como
dependência exclusiva de desenvolvimento; a pipeline de release não pode omitir esse gate.
Alterar apenas `APP_VERSION` não autoriza transformar a estrutura persistida.
