# Runbook — Rollback e restauração

**Resultado:** recuperar serviço sem apagar o único estado existente.
**Regra central:** voltar código e voltar dados são decisões diferentes.

## 1. Conter e preservar

1. Interrompa novas edições pelo modo de manutenção; não mate uma escrita ativa.
2. Execute `pmo.ps1 -Diagnostico` e registre versão, schema, fase, `restoreId` e `snapshotId`
   associados, quando presentes.
3. Preserve logs, `active.json`, `update.json`, manifestos e staging.
4. Se a versão nova recebeu qualquer trabalho do usuário, crie e verifique um snapshot adicional
   do estado pós-update antes de continuar.

Sem snapshot verificável, não execute restauração de dados.

## 2. Escolher a ação

### A — Mesma versão de schema escrita

Use rollback apenas de código quando a versão anterior consegue ler e escrever o schema atual e
não há evidência de corrupção:

```powershell
.\pmo.ps1 -Rollback
```

O launcher troca o ponteiro para a versão anterior e conserva os dados atuais.

### B — Schema alterado ou migração suspeita

Use rollback pareado: versão anterior mais snapshot criado antes daquele update. Confira
versão/schema e o ID antes de executar:

```powershell
.\pmo.ps1 -RestaurarSnapshot <id>
```

O launcher abre a versão atual, pede confirmação e cria primeiro outro snapshot híbrido do estado
presente. Cancele se IndexedDB, disco ou algum anexo não puder ser confirmado. Não escolha o
snapshot alvo apenas pela data; use o ID vinculado em `update.json`.

Antes da primeira troca, o updater deve confirmar que `sourceSchemaVersion` do snapshot está no
intervalo de leitura do runtime que o abrirá e que o `release.json` desse runtime coincide com o
pin e o inventário. Incompatibilidade de schema encerra a operação sem alterar dados ou ponteiro.

### C — Falha sem diagnóstico conclusivo

Mantenha o modo de manutenção e siga o runbook de incidente. Não experimente múltiplos snapshots
na instalação original.

## 3. Verificar

Após o updater encerrar, reabra por `pmo.ps1`. Quando houve restauração de dados, aguarde o Store
substituir e conferir o IndexedDB e o servidor persistir `restore-ack`; não considere concluído
enquanto `restore-pending` permanecer ativo.

O pending, o journal e o estado de update devem concordar no mesmo `restoreId` + `snapshotId`.
Journal `completed` de outra operação é stale e pode permanecer como evidência até a limpeza segura;
journal incompleto divergente é bloqueante. Não renomeie, complete nem apague qualquer um deles à
mão para forçar a retomada.

Depois confira:

- origem continua `http://localhost:8090`;
- versão/schema correspondem à combinação escolhida;
- bundle passa na validação sem escrita corretiva;
- contagens e IDs coincidem com o manifesto;
- todos os blobs conferem tamanho e SHA-256;
- configurações e templates do usuário estão presentes;
- update fica em estado terminal documentado, sem lock órfão;
- após o ACK, `data/recovery/<restoreId>` e o journal `completed` correlacionado foram removidos,
  enquanto qualquer recuperação não correlacionada permaneceu intacta.

Abra uma amostra de projetos e anexos somente depois dessas verificações.

## 4. Encerrar

Registre causa, ação, hashes e impacto. Preserve estado pós-update e snapshot pré-update até a
análise de problema concluir. Não publique novamente a release defeituosa com assets trocados;
produza nova versão.
