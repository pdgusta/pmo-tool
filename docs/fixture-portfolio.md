# Fixture canônico do portfólio de demonstração

**Fonte única de verdade** para os dados fictícios. `src/js/80-seed.js` (portfólio semente)
e `samples/` (arquivos externos para testar import) devem concordar com este documento.

Empresa fictícia: **Nortávia Serviços Financeiros S.A.** — PMO de TI corporativo.
Moeda: BRL. Ano fiscal: janeiro. **Data de status (data date) do portfólio: 2026-07-31.**

> G10: nada aqui referencia empresa, cliente, fornecedor ou pessoa real.

## Unidades de negócio (`bu`)

| id | nome | sigla |
|---|---|---|
| bu-ti | Tecnologia da Informação | TI |
| bu-ops | Operações | OPS |
| bu-risco | Risco e Compliance | RSC |
| bu-varejo | Banco de Varejo | VAR |
| bu-corp | Banco Corporativo | CORP |
| bu-rh | Pessoas | RH |

## Programas

| id | código | nome | sponsor | driver estratégico |
|---|---|---|---|---|
| prg-01 | PRG-01 | Modernização do Core Bancário | Diretoria de TI | Eficiência operacional |
| prg-02 | PRG-02 | Segurança e Conformidade Regulatória | Diretoria de Risco | Conformidade |
| prg-03 | PRG-03 | Dados e Analytics | Diretoria de TI | Decisão orientada a dados |
| prg-04 | PRG-04 | Experiência Digital do Cliente | Diretoria de Varejo | Crescimento de receita |
| prg-05 | PRG-05 | Infraestrutura e Nuvem | Diretoria de TI | Eficiência operacional |

## Pessoas (PMs, sponsors, donos de risco)

Nomes fictícios neutros. Pronomes: **they/them** em qualquer texto gerado sobre eles.

| id | nome | papel | capacidade h/mês | custo h |
|---|---|---|---|---|
| p-01 | Alex Marchetti | PMO Lead | 160 | 210 |
| p-02 | Rafa Quintela | Gerente de Projetos Sr. | 160 | 180 |
| p-03 | Nina Salgado | Gerente de Projetos Sr. | 160 | 180 |
| p-04 | Kito Ferrara | Gerente de Projetos | 160 | 150 |
| p-05 | Bruna Espírito | Gerente de Projetos | 160 | 150 |
| p-06 | Yuri Bencardino | Arquiteto de Soluções | 160 | 230 |
| p-07 | Dara Loureiro | Arquiteta de Dados | 160 | 220 |
| p-08 | Ivo Trancoso | Especialista em Segurança | 160 | 240 |
| p-09 | Sol Verissimo | Analista de Negócio Sr. | 160 | 130 |
| p-10 | Emi Kobayashi | Líder de QA | 160 | 140 |
| p-11 | Théo Baladi | Diretor de TI (sponsor) | 40 | 400 |
| p-12 | Lis Andrade | Diretora de Risco (sponsor) | 40 | 400 |
| p-13 | Caio Mendonça | Diretor de Varejo (sponsor) | 40 | 400 |
| p-14 | Vera Pontes | Gerente de Infraestrutura | 160 | 170 |
| p-15 | Otto Camargo | Gerente de Portfólio | 160 | 190 |

## Projetos — identidade canônica

`prj-NN` = id interno. `PRJ-0NNN` = código de negócio (usado nos arquivos de import).
Estágios: `ideacao`, `analise`, `planejamento`, `execucao`, `transicao`, `encerrado`, `cancelado`.
Categorias: `run` (manter), `grow` (crescer), `transform` (transformar).

| id | código | nome | prog | PM | cat | estágio | gate | RAG | início base | fim base | BAC (R$) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| prj-01 | PRJ-0101 | Substituição do Core de Contas | prg-01 | p-02 | transform | execucao | G3 | vermelho | 2025-09-01 | 2027-03-31 | 28.400.000 |
| prj-02 | PRJ-0102 | Migração do Motor de Pagamentos Pix | prg-01 | p-03 | transform | execucao | G3 | ambar | 2026-01-12 | 2026-12-18 | 9.750.000 |
| prj-03 | PRJ-0103 | Descomissionamento do Mainframe Legado | prg-01 | p-04 | run | planejamento | G2 | ambar | 2026-06-01 | 2027-09-30 | 6.200.000 |
| prj-04 | PRJ-0201 | Adequação LGPD — Fase 2 | prg-02 | p-05 | run | execucao | G3 | verde | 2026-02-02 | 2026-11-27 | 3.480.000 |
| prj-05 | PRJ-0202 | Cofre de Segredos e Rotação de Credenciais | prg-02 | p-08 | run | execucao | G3 | verde | 2026-03-16 | 2026-10-30 | 1.920.000 |
| prj-06 | PRJ-0203 | Programa Zero Trust — Onda 1 | prg-02 | p-08 | transform | execucao | G3 | vermelho | 2025-11-03 | 2026-09-30 | 7.300.000 |
| prj-07 | PRJ-0204 | Resiliência Cibernética e Plano de Resposta | prg-02 | p-08 | run | analise | G1 | ambar | 2026-08-03 | 2027-04-30 | 2.650.000 |
| prj-08 | PRJ-0301 | Data Lakehouse Corporativo | prg-03 | p-07 | transform | execucao | G3 | ambar | 2025-10-01 | 2026-12-22 | 12.900.000 |
| prj-09 | PRJ-0302 | Governança de Dados e Catálogo | prg-03 | p-07 | grow | execucao | G3 | verde | 2026-04-01 | 2027-01-29 | 2.240.000 |
| prj-10 | PRJ-0303 | Modelos de Crédito com IA | prg-03 | p-09 | grow | planejamento | G2 | ambar | 2026-09-01 | 2027-06-30 | 4.100.000 |
| prj-11 | PRJ-0304 | Descontinuação de Relatórios Manuais | prg-03 | p-04 | run | encerrado | G5 | azul | 2025-08-01 | 2026-05-29 | 890.000 |
| prj-12 | PRJ-0401 | Novo App Mobile de Varejo | prg-04 | p-02 | grow | execucao | G3 | verde | 2026-01-05 | 2026-11-13 | 8.600.000 |
| prj-13 | PRJ-0402 | Onboarding Digital 100% Remoto | prg-04 | p-05 | grow | transicao | G4 | verde | 2025-07-01 | 2026-08-14 | 5.350.000 |
| prj-14 | PRJ-0403 | Motor de Ofertas Personalizadas | prg-04 | p-09 | grow | ideacao | G0 | cinza | 2026-10-01 | 2027-08-31 | 3.750.000 |
| prj-15 | PRJ-0404 | Portal do Cliente Corporativo | prg-04 | p-03 | grow | execucao | G3 | ambar | 2026-02-16 | 2027-02-26 | 6.480.000 |
| prj-16 | PRJ-0501 | Migração para Nuvem — Onda 2 | prg-05 | p-14 | transform | execucao | G3 | ambar | 2026-01-19 | 2027-05-28 | 15.200.000 |
| prj-17 | PRJ-0502 | Renovação da Rede WAN/SD-WAN | prg-05 | p-14 | run | execucao | G3 | verde | 2026-03-02 | 2026-12-11 | 4.320.000 |
| prj-18 | PRJ-0503 | Observabilidade Unificada | prg-05 | p-06 | grow | planejamento | G2 | verde | 2026-08-17 | 2027-03-31 | 2.780.000 |
| prj-19 | PRJ-0504 | Consolidação de Data Centers | prg-05 | p-14 | run | cancelado | G1 | cinza | 2025-06-02 | 2026-06-30 | 11.400.000 |
| prj-20 | PRJ-0104 | API Gateway Corporativo | prg-01 | p-06 | transform | execucao | G3 | verde | 2026-04-13 | 2027-01-29 | 3.960.000 |

## Gates (stage-gate de governança)

| id | código | nome | ordem |
|---|---|---|---|
| g0 | G0 | Ideação — registro da demanda | 0 |
| g1 | G1 | Business case aprovado | 1 |
| g2 | G2 | Planejamento e baseline aprovados | 2 |
| g3 | G3 | Autorização de execução | 3 |
| g4 | G4 | Aprovação de go-live | 4 |
| g5 | G5 | Encerramento e lições aprendidas | 5 |

## Arquivos em `samples/` — o que cada um exercita

| arquivo | formato | cobre |
|---|---|---|
| `PRJ-0101-core-contas.xml` | MSPDI (MS Project XML) | projeto **existente** com desvios → testa reconciliação com diff |
| `PRJ-0102-pix.xml` | MSPDI | projeto existente, baseline vs previsto, marcos |
| `PRJ-0601-open-finance.xml` | MSPDI | projeto **novo** (código inexistente) → testa criação |
| `PRJ-0501-nuvem-onda2.xer` | Primavera XER | tabelas PROJECT/PROJWBS/TASK/TASKPRED/PROJCOST |
| `PRJ-0203-zero-trust.pmxml` | Primavera PMXML | XML P6, atividades + WBS + custos |
| `portfolio-intake-q3.csv` | CSV | intake em lote: 4 demandas novas |
| `atualizacao-status-julho.csv` | CSV | atualização em massa de % e custo real |
| `financeiro-2026.xlsx` | XLSX | leitura nativa via DecompressionStream |
| `PRJ-0101-cronograma.mpp` | MPP (OLE/CFB) | extração de metadados OLE (G7) |
| `business-case-PRJ-0601.docx` | DOCX | anexo binário puro (sem parsing) |
| `ata-comite-2026-07.pdf` | PDF | anexo binário puro |
| `portfolio-bundle-exemplo.json` | bundle nativo | import/restauração completa |
