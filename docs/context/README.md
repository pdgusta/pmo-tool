# Protocolo de contexto L0/L1/L2

Este diretório é o mapa de conhecimento técnico do PMO Tool. Ele adapta a ideia de
divulgação progressiva de contexto: primeiro descobrir **o que** é relevante, depois entender
**como** o domínio funciona e só então abrir o código que implementa o comportamento.

## Camadas

- **L0 — índice:** `index.json` contém um resumo curto, tags, criticidade e relações de cada
  domínio. É a primeira leitura para qualquer tarefa.
- **L1 — visão arquitetural:** os arquivos Markdown deste diretório descrevem invariantes,
  fluxos, contratos, riscos e critérios de validação. Eles não substituem o código.
- **L2 — fonte de verdade:** arquivos de implementação, contratos e testes listados em `l2`.
  Quando L1 e L2 divergirem, a implementação observada em L2 prevalece e L1 deve ser corrigido.

Os documentos usam marcadores explícitos:

- **Atual:** comportamento verificável na versão presente do repositório.
- **Alvo:** comportamento aprovado, mas que pode depender de uma etapa ainda não concluída.
- **Invariante:** regra que nenhuma implementação pode violar.
- **Gate:** condição que precisa passar antes de avançar ou publicar.

Essa distinção é obrigatória. Um item descrito como “Alvo” nunca pode ser presumido como
implementado sem confirmação no L2.

## Protocolo de leitura para agentes

1. Abra `docs/context/index.json` e filtre as entradas pelas tags da tarefa.
2. Inclua as entradas referenciadas em `dependsOn`.
3. Leia o L0 das entradas selecionadas e descarte as que não afetam a mudança.
4. Leia o L1 das entradas restantes, começando pelas dependências.
5. Abra somente os arquivos L2 necessários para confirmar contratos e localizar a alteração.
6. Antes de editar, verifique invariantes e gates dos domínios consumidores (`consumedBy`).
7. Após editar, atualize L1/L0 apenas se responsabilidade, contrato, dependência ou risco mudou.
8. Execute `tools/validar-contexto.ps1` antes de considerar a tarefa concluída.

`consumedBy` não é persistido no índice: o verificador o deriva de `dependsOn`, evitando duas
fontes de verdade para a mesma relação.

## Formato do índice

Cada entrada de `entries` contém:

| Campo | Contrato |
|---|---|
| `id` | Identificador único em `kebab-case`. |
| `title` | Nome humano do domínio ou runbook. |
| `kind` | `protocol`, `domain` ou `runbook`. |
| `l0` | Resumo dentro dos limites definidos em `constraints`. |
| `l1` | Caminho relativo para o documento de visão arquitetural. |
| `l2` | Um ou mais caminhos relativos para as fontes de verdade. |
| `tags` | Termos de descoberta em minúsculas e `kebab-case`. |
| `criticality` | `critical`, `high`, `medium` ou `low`. |
| `dependsOn` | IDs que devem ser entendidos antes desta entrada. |

`contracts` registra assinaturas mínimas que não podem desaparecer silenciosamente. Cada
contrato aponta para um arquivo e uma lista de expressões regulares obrigatórias. O verificador
confirma sua existência; ele não prova o comportamento em runtime.

## Manutenção

- Não coloque dados de usuário, anexos, caminhos pessoais, tokens ou segredos nos documentos.
- Prefira invariantes e fluxos a cópias extensas do código.
- Mantenha cada domínio com um único L1 responsável.
- Relações são dependências de entendimento, portanto devem formar um grafo acíclico.
- Uma mudança somente interna não exige alterar o índice.
- Uma mudança de API, schema, persistência, propriedade de diretórios ou recuperação exige
  revisar o L1 correspondente e seus consumidores.

## Validação

No Windows PowerShell 5.1, a partir da raiz:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\validar-contexto.ps1
```

Para exibir as relações inversas calculadas:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\validar-contexto.ps1 -Detalhado
```

O comando retorna código `0` quando o mapa é íntegro e `1` quando encontra erro bloqueante.
