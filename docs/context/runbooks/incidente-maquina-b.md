# Runbook — Incidente na máquina B

## 1. Contenção segura

- Peça ao usuário para parar edições e importações.
- Se a aplicação responde, use o modo de manutenção; não finalize durante indicação de gravação.
- Não apague `data/`, `state/`, `staging/`, `versions/`, logs ou snapshots.
- Não mude porta, host, relógio ou diretórios para testar.
- Não reinstale por cima da pasta existente.

## 2. Coleta mínima

Execute, se possível:

```powershell
.\pmo.ps1 -Diagnostico
```

Registre sem conteúdo funcional:

- horário, ação anterior e mensagem exata;
- versão ativa/anterior, schema e bootstrap;
- fase de `update.json`, `activationId`, `restoreId` e `snapshotId`, quando presentes;
- estado do lock, processo e porta 8090;
- espaço livre e permissões dos diretórios persistentes;
- contagens e hashes agregados;
- caminho dos logs e manifests envolvidos.

Copie as evidências para uma pasta separada e somente leitura antes de qualquer recuperação. Não
envie portfolio ou anexos ao GitHub.

## 3. Classificar

| Sintoma | Ação inicial |
|---|---|
| Porta 8090 ocupada | Identificar o processo; não trocar a porta. Encerrar apenas se for instância obsoleta confirmada. |
| Runtime ausente/adulterado | Preservar manifestos e usar versão anterior íntegra; não reparar arquivos individualmente. |
| Update parado antes de ativar | Preservar staging e estado; versão anterior deve continuar ativa. |
| Falha após ativação | Verificar handshake e schema; avaliar rollback pareado. |
| Recovery informa runtime ocupado | Fechar o app normalmente e repetir; não apagar locks, pois nenhuma escrita de recovery deve ter ocorrido. |
| Journal de restore divergente | Preservar `update.json`, `restore.json` e `restore-pending.json`; não escolher IDs por data nem forçar limpeza. |
| Dados aparentam vazios | Confirmar origem e diretórios antes de qualquer salvamento. Não inicializar portfólio novo. |
| Anexo ausente/hash divergente | Bloquear update/restauração e preservar ambas as cópias. |
| Disco cheio ou sem permissão | Liberar espaço fora da instalação ou corrigir acesso; não apagar snapshots automaticamente. |

## 4. Recuperar

Use `rollback-restauracao.md`. Teste a recuperação primeiro sobre cópia dos dados quando a causa
for incerta. Um retorno visual da aplicação não encerra o incidente: valide bundle, contagens,
referências e hashes.

## 5. Encerramento e problema

Documente causa, intervalo afetado, dados preservados, comandos, versão e evidências. Atualize o
runbook se o diagnóstico foi insuficiente. Recorrência, corrupção ou causa desconhecida exige
análise de problema antes da próxima release estável.
