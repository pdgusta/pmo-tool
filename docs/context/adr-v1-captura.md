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

### D-20 — As Listas do SharePoint da PMO são a fonte dos dados operacionais na v1

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-014.

**Em linguagem simples:** as Listas continuam sendo o caderno oficial de trabalho da PMO; o app é
só o bloco de notas dela por cima, sem escrever no caderno.

**Decisão:** as Listas do SharePoint da PMO continuam sendo a fonte dos dados operacionais (os GPs
continuam lançando dado lá; os relatórios e fluxos existentes continuam intactos); o app é fonte só
do que é dele — a captura (S1–S6), as decisões de handover, os incentivos, a classificação de
auditoria, os documentos gerados e os contratos de serviço enquanto não existir Lista para eles. O
app não escreve nas Listas na v1, então não há sincronização bidirecional.

**Justificativa:** evita a dupla digitação, o maior risco de abandono.

**Efeito nas fases seguintes:** a ponte (Fase 23) lê a pasta do export sem login; a sincronização
bidirecional continua fora do escopo (D-34).

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-21 — Escopo e ordem da v1: itens 1 a 10, reordenáveis a partir do item 5

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-015.

**Em linguagem simples:** uma lista de dez passos, com liberdade para trocar a ordem só a partir do
quinto.

**Decisão:** o escopo e a ordem da v1 são dez itens: 1 fechar a Fase 1 (feito: PR #12); 2 proteção
da captura (Fases 19 e 20); 3 núcleo protegido (Fase 21); 4 domínio v5 e ponte das Listas com cofre
(Fases 22 e 23); 5 autorização e "ver como" (Fase 24); 6 sensores leves e pacote de captura (Fase
25); 7 fila da manhã e gate de handover (Fase 26); 8 documentos e e-mails (Fase 27); 9 serviços
recorrentes, mínimo (Fase 28); 10 parceiro Microsoft, mínimo (Fase 29). A partir do item 5, as
sessões de captura podem reordenar o que vem depois, respeitando as dependências técnicas. O item 4
é citado só como "ponte das Listas" — nunca com a sigla do sistema de origem.

**Justificativa:** dá um caminho fixo para o que ainda não tem uso real para aprender (itens 1–4) e
liberdade para o que já depende do que a captura ensinar (itens 5–10).

**Efeito nas fases seguintes:** Fases 19–23 em ordem fixa; Fases 24–29 em ordem inicial, reordenável
pelas sessões de captura.

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

### D-23 — Congelado até o ADR corporativo

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-017.

**Em linguagem simples:** um freezer: o que está guardado aí só volta à mesa quando o ADR
corporativo decidir descongelar.

**Decisão:** ficam congeladas até o ADR corporativo as antigas Fases 9, 11–15 e 17–18 (design
system; servidor Node autoritativo local e migração de runtime; MCP; conector Microsoft), a fila
offline local e o servidor Node local. O `node.exe` portátil sai do congelamento como "permitido,
não usado" por decisão do dono na discussão da Fase 19 (ver D-27).

**Justificativa:** nenhum desses itens passa hoje pela régua uso × captura, e a PMO usa a edição
local sem eles.

**Efeito nas fases seguintes:** as demais antigas Fases (2–8, 10 e 16) são substituídas pelo roteiro
do v1.6 (Fases 19–29); o que os itens congelados se tornam é decidido no ADR corporativo (portão
v1→v2).

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-24 — Reabertura por ADR novo, sem reabrir o PR #12

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-018.

**Em linguagem simples:** o contrato antigo (PR #12) fica arquivado como está; o que muda vira um
contrato novo, não uma emenda ao antigo.

**Decisão:** G3, G4, G6, D-01, D-02, D-10..D-12 e o "fora do escopo" são reabertos por este ADR; o
PR #12 (Fase 1, merge `d9ad0a7`) não é reaberto e permanece como o registro das decisões de
27/09/2026.

**Justificativa:** separa o que já foi ratificado e mesclado (Fase 1) do que está sendo decidido
agora, sem reescrever histórico já publicado.

**Efeito nas fases seguintes:** em `docs/context/avaliacao-evolucao.md`, D-01, D-02, D-09 e
D-10..D-12 são reescritas no lugar para dizer só o que vale hoje, cada uma terminando com "Revista
por D-xx em 27/09/2026" (D-27, D-29, D-31); D-03, D-04, D-05 e D-08 são reancoradas (D-35); CLAUDE.md
e este L1 dizem o mesmo que este ADR.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-25 — Trilha 0 fica fora do código

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-019.

**Em linguagem simples:** a proteção da fonte de dados é uma obra fora do código, conduzida com a
PMO, não uma feature do app.

**Decisão:** a Trilha 0 (proteção nativa das Listas — restringir quem pode excluir, versionamento,
lixeira — e um export agendado das Listas pelo Power Automate para uma pasta sincronizada) é
conduzida pelo dono do projeto com a PMO, fora do código; o formato desse export agendado (CSV por
lista, pasta datada) é a entrada da ponte (Fase 23).

**Justificativa:** a proteção nativa da plataforma de origem é mais rápida e mais confiável do que
qualquer mitigação que o app poderia construir por fora.

**Efeito nas fases seguintes:** a ponte (Fase 23) é desenhada para ler exatamente esse formato de
export; nenhum preço, custo de produto ou tamanho é registrado aqui.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-26 — O que depende da PMO ou da TI entra como pendência

**Status:** Ratificada em 27/09/2026

**Origem:** decisão do dono D-020.

**Em linguagem simples:** o que ainda não tem resposta vira uma nota na porta, não uma regra
gravada na parede.

**Decisão:** o que depende de uma resposta da PMO ou da TI entra como pendência, não como requisito
fechado; até a resposta, é construído sobre fixture fictícia (G10) e parâmetros configuráveis.

**Justificativa:** evita travar a v1.6 esperando decisão de terceiros e evita fechar um requisito
que pode mudar quando a resposta chegar.

**Efeito nas fases seguintes:** as pendências que tocam este ADR são listadas em `## Pendências
(D-26)` (plano 19-02).

**Reversibilidade:** não classificada na discussão; tratada como reversível.

## Decisões da Fase 19 (D-27 a D-35)

Estas decisões foram tomadas pelo dono do projeto na discussão da Fase 19, em 27/09/2026, e
implementam a reabertura da D-24.

### D-27 — Duas edições: a edição local não troca de runtime

**Status:** Ratificada em 27/09/2026

**Origem:** discussão da Fase 19 com o dono (27/09/2026).

**Em linguagem simples:** a roupa de captura não troca o motor por baixo; o motor novo só entra
quando um traje futuro precisar dele.

**Decisão:** a G3 passa a falar de duas edições. Edição local: o servidor continua sendo o
`serve.ps1` (Windows PowerShell 5.1), e o updater e os scripts de entrada (`pmo.ps1`,
`atualizar.ps1`, `tools/pmo-instalar.ps1`) também ficam em PS 5.1; a edição local não troca de
runtime. O Node 24 LTS vale em dev, no CI e no servidor corporativo (v2). O Node é permitido na
máquina da PMO como `node.exe` oficial portátil em `versions/<semver>/` (versão e SHA-256
declarados no `release.json` e na allowlist do ZIP, nada instalado globalmente, rollback troca o
Node junto com o código), mas só entra no pacote quando uma fase precisar e justificar o uso por
proposta ao Maestro; até lá, nenhum release leva `node.exe`. Caem da D-01/D-02: o servidor Node
local, a fila offline local e o ensaio de troca de runtime local (FUND-02 na forma local). A
migração vira "local → nuvem" pelo bundle JSON. Isso emenda a D-23 no ponto do `node.exe`. Revê:
G3, D-01, D-02; D-03 e D-04 são reancoradas em consequência (D-35). O texto antigo do roadmap
"caem node.exe portátil" fica assim resolvido, em duas frases sem contradição: o pacote de hoje
cai o `node.exe` (o empacotamento automático da D-02 original não está em vigor); a decisão não o
proíbe — ele continua permitido quando uma fase justificar.

**Justificativa:** a edição local é o instrumento de captura; trocar o runtime dela acrescenta
risco ao dado da PMO sem ensinar nada à v2; a evidência do Spike A do L1 da Fase 1 continua válida
para quando uma fase precisar.

**Efeito nas fases seguintes:** nenhuma fase do v1.6 troca o runtime local; em
`docs/context/avaliacao-evolucao.md`, D-01 e D-02 terminam com "Revista por D-27 em 27/09/2026";
**Atual**: a allowlist de runtime em `tools/portable-common.ps1` não tem `node.exe`.

**Reversibilidade:** costly — reabrir a troca de runtime local exigiria novo ADR e reativar o
FUND-02, os journals e os testes de falha simulada do updater.

**Alternativas descartadas:** Node só em ferramental de dev (proibiria um uso futuro justificado);
já colocar o `node.exe` no próximo release (custo de pacote sem nenhuma fase usando).

### D-28 — A G4 vale só para a edição local

**Status:** Ratificada em 27/09/2026

**Origem:** discussão da Fase 19 com o dono (27/09/2026).

**Em linguagem simples:** o endereço fixo só importa enquanto o dado mora na própria máquina.

**Decisão:** a G4 (porta 8090, origem `http://localhost:8090/`, porta ocupada é erro bloqueante)
vale só para a edição local; na v2 a origem é a corporativa (HTTPS) e a migração local → nuvem usa
o bundle JSON com um ensaio no estilo FUND-02. Revê: G4.

**Justificativa:** a origem só identifica IndexedDB e `localStorage` na edição local.

**Efeito nas fases seguintes:** nada muda em `serve.ps1` ou `pmo.ps1` (**Atual**); o ensaio é parte
da v2.

**Reversibilidade:** não classificada na discussão; tratada como reversível.

### D-29 — G6: Microsoft só com acesso delegado, nas duas edições

**Status:** Ratificada em 27/09/2026

**Origem:** discussão da Fase 19 com o dono (27/09/2026).

**Em linguagem simples:** o app nunca tem crachá próprio da empresa toda; usa o crachá de quem
está logado, e quando não há login, ainda existe a porta dos fundos.

**Decisão:**
1. Nunca uma permissão de aplicação no Microsoft Graph, nem App Registration fora do tenant da
   empresa.
2. Edição local: o login delegado é opcional e permitido, com o client público de primeira parte
   da Microsoft (nenhum App Registration próprio na v1); fluxo = login interativo com PKCE; o
   device code só como fallback, se o tenant permitir; a alternativa garantida continua sendo a
   pasta sincronizada mais o export do Power Automate, lidos sem login.
3. Edição corporativa (v2): um registro Entra no tenant da empresa, criado e governado pela TI,
   com permissões delegadas mínimas e app roles; login interativo com PKCE, device code como
   fallback se a TI permitir; o device code deixa de ser o caminho principal (a Microsoft
   recomenda bloqueá-lo).
4. Nenhuma fase do v1.6 implementa o login local — ele é só permitido; o conector continua
   congelado (D-23) e a ponte das Listas (Fase 23) lê só a pasta; o conector é o módulo conector,
   quando existir (hoje congelado, D-23), e a exceção (2) da G2 passa a apontar para ele em vez de
   fases retiradas.
5. A validação no tenant do dono antes do tenant da PMO (SP-04) vira item do portão v1→v2.
6. O D-09 do L1 da Fase 1 é reescrito no lugar com o mesmo conteúdo.

Revê: G6, exceção (2) da G2, D-09.

**Justificativa:** device code é o fluxo que a Microsoft recomenda bloquear; PKCE é o fluxo
interativo recomendado; um client público de primeira parte não exige registro pela PMO.
**Atual**: não existe módulo conector e nenhuma chamada de rede autenticada existe no código hoje.

**Efeito nas fases seguintes:** o plano 19-03 reescreve a G6 e a exceção (2) da G2 no CLAUDE.md;
D-09 termina com "Revista por D-29 em 27/09/2026".

**Reversibilidade:** não classificada na discussão; tratada como reversível.

**Alternativas descartadas:** edição local só com arquivos (rejeitada pelo dono: o login continua
permitido); device code como caminho principal.

### D-30 — Nenhum token persistido junto com dados

**Status:** Ratificada em 27/09/2026

**Origem:** discussão da Fase 19 com o dono (27/09/2026).

**Em linguagem simples:** a chave nunca viaja dentro da mala; se a mala for copiada ou restaurada,
a chave não vai junto.

**Decisão:** regra genérica para a v1 e a v2 — nenhum token é persistido junto com dados,
configuração, versões, snapshots, pacotes de release ou pacotes de captura.

**Justificativa:** cada uma dessas árvores é copiada, restaurada ou exportada (snapshots, backups
de update, ZIP, pacote de captura); um token dentro delas viajaria com elas.

**Efeito nas fases seguintes:** a G6 carrega a regra (plano 19-03); D-09 e D-12 do L1 da Fase 1 a
citam.

**Reversibilidade:** não classificada na discussão; tratada como reversível.
