# L1 — ADR D-19+: a v1 como roupa de captura e as guardrails da v1

Este L1 registra as decisões de 27/09/2026 que transformam as decisões do dono do projeto em
regra do repositório — o papel da v1 como roupa de captura e `pode(papel, ação, recurso, vínculo)`
como regra única de acesso, entre outras. Continua a série única de decisões do projeto depois da
D-18 (`docs/context/avaliacao-evolucao.md`, Fase 1); o PR #12 (Fase 1, merge `d9ad0a7`) não é
reaberto e permanece como o registro das decisões daquela fase. D-01, D-02, D-09 e D-10..D-12 desse
L1 são reescritas no lugar e terminam com a linha "Revista por D-xx em 27/09/2026". Usa os
marcadores **Atual**, **Alvo**, **Invariante** e **Gate** definidos em `docs/context/README.md`.

## Resumo

A v1 é a roupa de captura: o instrumento usado pela PMO no dia a dia, avaliado pela régua uso ×
captura — (1) faz a PMO voltar ao app amanhã? (2) capta algo que a v2 precisa saber? — enquanto a
v2 é o app corporativo, opção D, híbrida no Azure da empresa, desenhada a partir do que a captura
mostra (D-19). `pode(papel, ação, recurso, vínculo)`, no núcleo, é a regra única de acesso:
simulada localmente na v1 (sem autenticação) e aplicada no servidor da v2 com a identidade do
Entra (D-22). As Listas do SharePoint da PMO continuam a fonte dos dados operacionais; o app é
fonte só do que é dele e não escreve nelas (D-20). Ficam congeladas até o ADR corporativo as
antigas Fases 9, 11–15 e 17–18, a fila offline local e o servidor Node local, com o `node.exe`
portátil saindo do congelamento como permitido, não usado (D-23). G3 e G4 passam a valer só para a
edição local; G6, D-01/D-02 e D-10..D-12 são reescritas para duas edições (local e corporativa) e o
"fora do escopo" ganha os novos itens (D-27 a D-31, D-34). A G8 é reforçada com mínimos
verificáveis de proteção de dado, e nasce a G14 para o registro de uso local (D-32, D-33). D-04,
D-05 e D-08 são reancoradas como consequência da D-23, sem mudar de sentido (D-35).

## Origem das decisões

D-19 a D-26 são as decisões do dono ratificadas em 27/09/2026, registradas no log local de
planejamento (fora do Git) como D-013 a D-020; D-27 a D-35 foram decididas pelo dono na discussão
da Fase 19, no mesmo dia. A partir daqui, o repositório versionado usa só a série D-19+.

| ADR | Origem | Decisão |
|-----|--------|---------|
| D-19 | D-013 | v1 = roupa de captura (uso diário; régua uso × captura); v2 = app corporativo (opção D, híbrida no Azure) |
| D-20 | D-014 | Listas do SharePoint da PMO como fonte dos dados operacionais; o app é fonte só do que é dele e não escreve nelas |
| D-21 | D-015 | Escopo e ordem da v1 = itens 1–10, reordenáveis a partir do item 5 |
| D-22 | D-016 | `pode(papel, ação, recurso, vínculo)` como regra única de acesso, simulada na v1 e aplicada na v2 |
| D-23 | D-017 | Congelamento das antigas fases de runtime/conector até o ADR corporativo |
| D-24 | D-018 | Reabertura por ADR novo de G3, G4, G6, D-01, D-02, D-10..D-12 e o fora do escopo, sem reabrir o PR #12 |
| D-25 | D-019 | Trilha 0 fora do código; formato do export agendado (CSV por lista, pasta datada) como entrada da ponte |
| D-26 | D-020 | O que depende de resposta da PMO ou da TI entra como pendência, não como requisito fechado |

## Decisões do dono (D-19 a D-26)

### D-19 — A v1 é a roupa de captura; a v2 é o app corporativo

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-013.

**Em linguagem simples:** a v1 é a roupa de trabalho usada todo dia; a v2 é o traje sob medida,
cortado a partir do que a roupa mostrou que serve.

**Decisão:** a edição local (v1) é usada pela PMO no dia a dia e é o instrumento que capta o que a
v2 precisa saber, por seis sensores locais — S1 matriz de papéis editável, S2 "ver como", S3 diário
de decisões, S4 "queria fazer isso e não dá", S5 registro de uso local, S6 configuração como
especificação — exportados no pacote de captura (JSON mais um relatório legível). Toda feature da
v1 passa pela régua uso × captura: (1) faz a PMO voltar ao app amanhã? (2) capta algo que a v2
precisa saber? Acabamento visual pode esperar, confiança não. A v2 é o app corporativo, opção D
(híbrida no Azure da empresa), desenhada a partir do que a captura mostra.

**Justificativa:** o app só tem valor se a PMO usar todo dia, e esse uso diário é o que ensina o
desenho da v2; a v1 não é o produto final.

**Efeito nas fases seguintes:** cada fase da v1.6 (Fases 19–29) entra no nível que a régua pede; o
pacote de captura (Fase 25) alimenta os requisitos da v2.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-22 — pode(papel, ação, recurso, vínculo) é a regra única de acesso

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-016.

**Em linguagem simples:** uma única régua de permissão, usada primeiro como maquete e depois como
parede real.

**Decisão:** uma função pura do núcleo, `pode(papel, ação, recurso, vínculo)`, consultada por cada
ação nomeada, é a única fonte da regra de acesso; na v1 ela é simulada localmente, sem
autenticação — uma ferramenta de desenho, não um limite de segurança, e a tela diz isso ("simulação
de desenho"). Na v2, a mesma função roda no servidor com a identidade do Entra (aplicada), então a
simulação não é jogada fora; as variantes de relatório por público (interno, executivo, auditoria,
externo) passam a usar a mesma regra, sem política duplicada.

**Justificativa:** as variantes de relatório de `42-export-relatorios.js` já são o embrião (já
filtram por público, mas só na exportação); uma regra em duas edições evita reescrever a
autorização na v2.

**Efeito nas fases seguintes:** **Alvo**: a Fase 24 implementa a matriz de papéis editável com
escopo, `pode()` como função pura testada, "ver como <papel>" e os relatórios pela mesma regra;
**Atual**: nenhum `pode()` existe no código hoje.

**Reversibilidade:** não classificada na discussão; tratada como reversível.
