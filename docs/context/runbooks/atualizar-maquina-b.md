# Runbook — Atualizar a máquina B

**Responsável:** operador local autorizado.
**Resultado:** nova release estável ativa, com dados e hashes equivalentes ao estado pré-update.
**Pré-requisito:** updater, snapshot e diagnóstico devem ter passado pelos gates de release.

## 1. Antes de aceitar

1. Abra sempre por `pmo.ps1`; não execute `serve.ps1` dentro de uma versão manualmente.
2. Aguarde o app concluir a carga e resolver eventual divergência entre navegador e disco.
3. Termine edições e importações. Confirme que não há gravação ou anexo pendente.
4. Execute:

```powershell
.\pmo.ps1 -Diagnostico
```

5. Exija `runtimeIntegrity=true` e registre versão, schema, contagens, resumo dos hashes e último
   snapshot selado válido.
6. Confirme espaço livre; o updater repetirá o cálculo antes do download e reservará ZIP,
   expansão, snapshot de compensação e margem operacional.

Adie o update se algum campo do diagnóstico estiver incoerente ou falso, se porta/origem
divergirem, ou se houver conflito de persistência, snapshot inválido ou bootstrap incompatível.

## 2. Autorizar

Use o aviso da aplicação ou execute:

```powershell
.\pmo.ps1 -Atualizar
```

Revise versão, notas, tamanho, schema e necessidade de reinício. Ao confirmar, não edite o app,
feche a janela nem manipule pastas até o resultado final. O preflight deve bloquear mutações,
selar o snapshot e somente então permitir o download/ativação.

## 3. Observar

Estados esperados: consulta, download, verificação, staging, snapshot selado, instalação,
ativação, validação e conclusão. Demora não é autorização para matar o processo. Se o fluxo falhar,
anote a fase e siga o runbook de incidente; não apague staging, journals ou `update.json`. Na
retomada, o bootstrap deve executar o updater identificado pelo próprio journal, não simplesmente
o arquivo da versão que aparenta estar ativa. Esse updater só pode ser executado depois de o wrapper
validar o pin de `release.json` e o inventário do runtime correspondente.

Se a retomada informar que o runtime está ocupado, feche a aplicação normalmente e tente de novo.
Não remova locks à mão: essa recusa ocorre antes de qualquer escrita de recovery e protege o servidor
que ainda possui o mutex da instalação.

## 4. Verificar sucesso

1. Reabra por `pmo.ps1` se solicitado.
2. Confirme versão, build, schema, origem `http://localhost:8090` e diretórios pelo diagnóstico.
3. Compare com o registro pré-update:
   - configurações e preferências;
   - IDs e contagens de entidades;
   - auditoria e histórico de imports;
   - metadados, tamanho e SHA-256 de todos os anexos;
   - templates personalizados.
4. Abra projetos representativos, um anexo e as telas de auditoria/importação.
5. Registre o resultado e mantenha a versão anterior e o snapshot.

Quando houver restauração automática de compensação, confirme também que `restoreId` e `snapshotId`
coincidem nos registros, que `restore-pending.json` desapareceu somente após o ACK do navegador e
que apenas a pasta `data/recovery/<restoreId>` correlacionada foi limpa.

Somente `appVersion`, `schemaVersion`, campos documentados pela migração e metadados técnicos de
update podem mudar.

## 5. Divergência

Pare novas edições. Não tente corrigir arquivos à mão. Execute diagnóstico, preserve logs e siga
`rollback-restauracao.md`. Divergência de dados é incidente bloqueante mesmo que a UI abra.
