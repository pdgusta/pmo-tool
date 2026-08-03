# Runbook — Publicar uma release estável

**Responsável:** mantenedor da máquina A.
**Resultado:** draft validado e publicado manualmente como release estável e imutável.
**Proibição:** nunca anexar ZIP criado manualmente fora da pipeline nem publicar source archive
como pacote da máquina B.

## 1. Preparação da mudança

1. Defina a versão SemVer e registre objetivo, riscos, schema lido/escrito e rollback.
2. Confirme que a versão no modelo coincide com a tag planejada.
3. Se o schema mudou, confira migradores, fixtures e snapshot compatível.
4. Confirme que samples, templates e testes não contêm dados reais.
5. Execute a validação completa local:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\validar-contexto.ps1 -Detalhado
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Run-Tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-UpdaterRecovery.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Invoke-ServerIntegration.ps1
```

   A máquina A deve usar Node.js `22.22.0`, igual ao pin do workflow. Ele é obrigatório somente
   para os testes/build: executa fixtures de migração e `validate-built-html.mjs`; não entra no
   pacote nem é instalado na máquina B. Ausência desse gate é bloqueante para uma release.

6. Confirme o restore drill e anexe as evidências ao registro da mudança.

Interrompa se houver teste pendente, dado real, mudança de schema sem rollback ou diferença de
versão.

## 2. Gerar o draft

1. Crie a tag assinada/atribuída ao commit aprovado no formato `vX.Y.Z`.
2. Envie a tag ao GitHub.
3. Aguarde o workflow de release concluir.
4. Confirme que a release permanece em **draft** e não é prerelease.

O workflow deve fornecer exatamente o ZIP Windows, manifesto JSON e checksum SHA-256 esperados.
Ausência, duplicidade ou nome diferente bloqueia a publicação.

## 3. Revisar os assets

Baixe os assets do draft em diretório temporário novo e execute o validador do pacote sobre o
arquivo efetivamente baixado. Confira:

- SHA-256 do ZIP igual ao `.sha256` e ao manifesto;
- versão, commit, timestamp, canal, plataforma, schema e bootstrap mínimo;
- somente caminhos da allowlist;
- nenhum `data/`, `config/`, `state/`, `logs/`, `staging/`, `.git` ou fonte;
- `NOTICE` e aviso de direitos reservados presentes;
- `release.json` cobre todos os arquivos verificáveis, sem extra ou ausência, com tamanho/hash;
- limites do ZIP, tamanhos comprimidos/expandidos e razão de compressão aprovados;
- nenhum link simbólico, junction ou reparse point no conteúdo materializado;
- hashes internos iguais ao conteúdo extraído pelo teste seguro.

Faça um smoke test em instalação descartável usando dados fictícios. Não use a instalação real da
máquina B para validar um draft.

## 4. Autorizar e publicar

1. Registre aprovação humana dos gates de build, segurança, persistência e restauração.
2. Preencha notas da release com mudanças, compatibilidade, migração e rollback.
3. Publique o draft como release estável.
4. Ative a imutabilidade da release/tag conforme a configuração do repositório.
5. Consulte a API de latest release e confirme que ela devolve a versão publicada.

## 5. Pós-publicação

- Preserve manifests, checksums e evidências no registro da mudança.
- Não force atualização na máquina B; a consulta diária e o consentimento continuam valendo.
- Monitore o piloto e registre incidentes. Se surgir risco de perda, interrompa novas instalações;
  não substitua assets de uma release publicada. Corrija em nova versão.
