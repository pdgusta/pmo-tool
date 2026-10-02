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

### D — Restaurar um snapshot de proteção (Limpar/Substituir)

O snapshot de proteção (Fase 20, premissa P-04) não é o snapshot de update: fica em
`data/backups/snapshots/<snapshotId>/`, criado antes de "Limpar portfólio" ou "Substituir
portfólio por bundle importado". Contenha e preserve como na seção 1.

Os comandos abaixo usam `C:\Exemplo\PMO-Tool` como pasta da instalação; troque pelo caminho real.
Tudo roda **dentro da pasta da instalação**, nunca na pasta do repositório: o checkout de
desenvolvimento tem outros dados, outro id de instalação e, na mesma origem, abriria o navegador
contra a instalação errada.

1. **Pare todo servidor do PMO Tool.** Feche cada janela do PowerShell que roda `pmo.ps1` ou
   `serve.ps1` com Ctrl+C — inclusive um servidor do checkout de desenvolvimento — e feche todas as
   abas do PMO Tool no navegador.
2. **Confirme a porta 8090 livre.** O comando abaixo não deve listar nada; se listar, ainda há um
   servidor ativo, e a restauração não começa:

   ```powershell
   Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue
   ```

3. **Localize o `snapshotId`** na entrada de audit da própria operação ("Limpar portfólio" ou
   "Substituir portfólio por bundle importado" registram o campo `snapshotId`).
4. **Confira e copie o snapshot** para `data\update-backups\<snapshotId>\`. O restaurador atual só
   lê snapshots de `data\update-backups\`; o caminho é manual nesta fase. Use caminhos absolutos:

   ```powershell
   cd C:\Exemplo\PMO-Tool
   . .\tools\portable-common.ps1
   $id = '<snapshotId>'
   $origem = Join-Path (Get-Location).Path "data\backups\snapshots\$id"
   $destino = Join-Path (Get-Location).Path "data\update-backups\$id"
   $manifesto = Read-PmoJson (Join-Path $origem 'manifest.json') $null
   Test-PmoInventory $origem $manifesto.files @('manifest.json')   # nao deve listar erro
   Copy-PmoDirectoryDurable -Source $origem -Destination $destino
   ```

5. **Peça a restauração, ainda dentro da pasta da instalação:**

   ```powershell
   .\pmo.ps1 -RestaurarSnapshot <snapshotId>
   ```

6. Na aba que abrir, clique em **"Proteger estado atual e restaurar"**. O app protege o estado
   atual num snapshot novo e entrega a restauração ao atualizador.
7. **Espere o servidor parar e a aba avisar que é preciso reabrir.** O servidor encerra sozinho
   para o atualizador trabalhar; a aba fica somente leitura com o aviso de fechar as abas e
   reabrir com `.\pmo.ps1`. Não dê F5 nessa aba: feche-a.
8. **Reabra com `.\pmo.ps1` (sem parâmetros), em uma única aba.** Na abertura, o Store substitui e
   confere o IndexedDB e o servidor registra `restore-ack`.
9. **Confira o diagnóstico:**

   ```powershell
   .\pmo.ps1 -Diagnostico
   ```

   `restorePending` precisa ser `false`. Se continuar `true`, a abertura não concluiu a
   sincronização: não edite nada e siga o runbook de incidente.
10. **Compare com o manifesto do snapshot alvo:** `snapshotId`, contagens
    (`manifest.json.contagens`) e SHA-256 de cada arquivo (`manifest.json.files`) contra o que a
    restauração produziu — os mesmos critérios da seção 3.

### E — Recuperar item excluído (lixeira)

Pela tela da lixeira quando ela existir (Fase 20, wave de UI). Até lá, pelo console do navegador
com a instalação aberta:

```js
PMO.store.lixeira()
PMO.store.restaurarDaLixeira('<auditId>')
```

`lixeira()` lista os itens (projeto ou registro), já marcando quais são restauráveis e o motivo
quando não forem. `restaurarDaLixeira` acrescenta uma entrada nova na trilha (`restauraDe`) sem
tocar na exclusão original.

### F — Conferir uma cópia verificável

A cópia verificável fica na pasta que a PMO escolheu, em `pmo-copia-<data>-<id>/` — é um artefato
de backup, não sincronização da instalação (G11); não a use para "restaurar" a instalação em uso.
Até a tela existir (Fase 20, wave de UI), pelo console:

```js
PMO.store.conferirCopiaVerificavel('<pasta pmo-copia-...>')
```

Interpretação das mensagens: `ok: true` com `erros` vazio é cópia intacta; `hash divergente:
<arquivo>` é arquivo alterado desde a exportação; `arquivo ausente: <arquivo>` é arquivo faltando
na cópia; `arquivo fisico nao declarado: <arquivo>` é arquivo a mais que o manifesto não previa;
"manifesto diferente do registrado..." é o `manifest.json` da pasta divergindo do SHA-256 gravado
no `auditLog` na exportação.

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
