/* =============================================================================
   80-seed.js — portfolio de demonstracao (empresa ficticia)
   Depende de: 00-util.js, 10-model.js

   Fonte de verdade dos dados: docs/fixture-portfolio.md
   Gerador DETERMINISTICO (PRNG semeado): recarregar a pagina produz sempre o
   mesmo portfolio, o que torna a demo confiavel e os prints comparaveis.

   G10: empresa, pessoas e projetos sao ficticios. Nenhum dado real.
   Pronomes de terceiros: they/them (nao inferir genero a partir de nome).
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const seed = {};

  const DATA_STATUS = '2026-07-31';

  /* ------------------------------------------------------------ PRNG estavel */

  function prng(semente) {
    let a = semente >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashTexto(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function escolher(r, lista) { return lista[Math.floor(r() * lista.length) % lista.length]; }
  function inteiro(r, min, max) { return min + Math.floor(r() * (max - min + 1)); }

  /* ------------------------------------------------------------------- gente */

  const PESSOAS = [
    ['p-01', 'Alex Marchetti', 'PMO Lead', 'bu-ti', 210],
    ['p-02', 'Rafa Quintela', 'Gerente de Projetos Sr.', 'bu-ti', 180],
    ['p-03', 'Nina Salgado', 'Gerente de Projetos Sr.', 'bu-ti', 180],
    ['p-04', 'Kito Ferrara', 'Gerente de Projetos', 'bu-ti', 150],
    ['p-05', 'Bruna Espírito', 'Gerente de Projetos', 'bu-ti', 150],
    ['p-06', 'Yuri Bencardino', 'Arquiteto de Soluções', 'bu-ti', 230],
    ['p-07', 'Dara Loureiro', 'Arquiteta de Dados', 'bu-ti', 220],
    ['p-08', 'Ivo Trancoso', 'Especialista em Segurança', 'bu-risco', 240],
    ['p-09', 'Sol Verissimo', 'Analista de Negócio Sr.', 'bu-varejo', 130],
    ['p-10', 'Emi Kobayashi', 'Líder de QA', 'bu-ti', 140],
    ['p-11', 'Théo Baladi', 'Diretor de TI', 'bu-ti', 400],
    ['p-12', 'Lis Andrade', 'Diretora de Risco', 'bu-risco', 400],
    ['p-13', 'Caio Mendonça', 'Diretor de Varejo', 'bu-varejo', 400],
    ['p-14', 'Vera Pontes', 'Gerente de Infraestrutura', 'bu-ti', 170],
    ['p-15', 'Otto Camargo', 'Gerente de Portfólio', 'bu-ti', 190]
  ];

  const UNIDADES = [
    { id: 'bu-ti', nome: 'Tecnologia da Informação', sigla: 'TI' },
    { id: 'bu-ops', nome: 'Operações', sigla: 'OPS' },
    { id: 'bu-risco', nome: 'Risco e Compliance', sigla: 'RSC' },
    { id: 'bu-varejo', nome: 'Banco de Varejo', sigla: 'VAR' },
    { id: 'bu-corp', nome: 'Banco Corporativo', sigla: 'CORP' },
    { id: 'bu-rh', nome: 'Pessoas', sigla: 'RH' }
  ];

  const PROGRAMAS = [
    ['prg-01', 'PRG-01', 'Modernização do Core Bancário', 'p-11', 'p-15', 'drv-eficiencia',
      'Substituir a plataforma central de contas e pagamentos, reduzindo custo por transação e tempo de lançamento de produto.'],
    ['prg-02', 'PRG-02', 'Segurança e Conformidade Regulatória', 'p-12', 'p-08', 'drv-conformidade',
      'Atender às exigências do regulador e reduzir a superfície de risco cibernético do banco.'],
    ['prg-03', 'PRG-03', 'Dados e Analytics', 'p-11', 'p-07', 'drv-dados',
      'Consolidar a plataforma analítica e habilitar decisão orientada a dados em crédito e varejo.'],
    ['prg-04', 'PRG-04', 'Experiência Digital do Cliente', 'p-13', 'p-09', 'drv-experiencia',
      'Elevar a conversão e a satisfação nos canais digitais próprios.'],
    ['prg-05', 'PRG-05', 'Infraestrutura e Nuvem', 'p-11', 'p-14', 'drv-resiliencia',
      'Migrar cargas críticas para nuvem, modernizar rede e elevar a resiliência operacional.']
  ];

  /* --------------------------------------------------------------- projetos
     Colunas:
     0 id | 1 codigo | 2 nome | 3 programa | 4 pm | 5 sponsor | 6 bu | 7 categoria
     8 tipo | 9 estagio | 10 gate | 11 baselineInicio | 12 baselineFim | 13 BAC
     14 spiAlvo | 15 cpiAlvo | 16 atrasoDias | 17 prioridade | 18 driver | 19 obrigatorio

     O farol NAO e digitado: ele emerge do motor de EVM. Aqui declaramos a
     INTENCAO de desempenho (SPI e CPI alvo) e o gerador deriva o avanco fisico
     e o custo real que produzem exatamente esses indices na data de status:
        pctFisico = pctPlanejado x spiAlvo        (pois SPI = EV/PV)
        AC        = EV / cpiAlvo                  (pois CPI = EV/AC)
     Isso evita o erro de calibrar percentuais "no olho" contra tempo linear
     quando a curva de valor planejado tem forma de S. */

  const PROJETOS = [
    ['prj-01', 'PRJ-0101', 'Substituição do Core de Contas', 'prg-01', 'p-02', 'p-11', 'bu-ti',
      'transform', 'app', 'execucao', 'g3', '2025-09-01', '2027-03-31', 28400000, 0.78, 0.82, 91, 1, 'drv-eficiencia', false],
    ['prj-02', 'PRJ-0102', 'Migração do Motor de Pagamentos Pix', 'prg-01', 'p-03', 'p-11', 'bu-ops',
      'transform', 'app', 'execucao', 'g3', '2026-01-12', '2026-12-18', 9750000, 0.95, 0.96, 16, 1, 'drv-eficiencia', true],
    ['prj-03', 'PRJ-0103', 'Descomissionamento do Mainframe Legado', 'prg-01', 'p-04', 'p-11', 'bu-ti',
      'run', 'infra', 'planejamento', 'g2', '2026-06-01', '2027-09-30', 6200000, 1.02, 1.00, 14, 3, 'drv-eficiencia', false],
    ['prj-04', 'PRJ-0201', 'Adequação LGPD — Fase 2', 'prg-02', 'p-05', 'p-12', 'bu-risco',
      'run', 'compliance', 'execucao', 'g3', '2026-02-02', '2026-11-27', 3480000, 1.00, 1.01, 0, 1, 'drv-conformidade', true],
    ['prj-05', 'PRJ-0202', 'Cofre de Segredos e Rotação de Credenciais', 'prg-02', 'p-08', 'p-12', 'bu-ti',
      'run', 'seguranca', 'execucao', 'g3', '2026-03-16', '2026-10-30', 1920000, 1.01, 1.02, 0, 2, 'drv-resiliencia', false],
    ['prj-06', 'PRJ-0203', 'Programa Zero Trust — Onda 1', 'prg-02', 'p-08', 'p-12', 'bu-risco',
      'transform', 'seguranca', 'execucao', 'g3', '2025-11-03', '2026-09-30', 7300000, 0.82, 0.85, 76, 1, 'drv-resiliencia', false],
    ['prj-07', 'PRJ-0204', 'Resiliência Cibernética e Plano de Resposta', 'prg-02', 'p-08', 'p-12', 'bu-risco',
      'run', 'seguranca', 'analise', 'g1', '2026-08-03', '2027-04-30', 2650000, 1.00, 1.00, 12, 2, 'drv-resiliencia', true],
    ['prj-08', 'PRJ-0301', 'Data Lakehouse Corporativo', 'prg-03', 'p-07', 'p-11', 'bu-ti',
      'transform', 'dados', 'execucao', 'g3', '2025-10-01', '2026-12-22', 12900000, 0.94, 0.96, 22, 2, 'drv-dados', false],
    ['prj-09', 'PRJ-0302', 'Governança de Dados e Catálogo', 'prg-03', 'p-07', 'p-11', 'bu-risco',
      'grow', 'dados', 'execucao', 'g3', '2026-04-01', '2027-01-29', 2240000, 1.00, 1.01, 0, 3, 'drv-dados', false],
    ['prj-10', 'PRJ-0303', 'Modelos de Crédito com IA', 'prg-03', 'p-09', 'p-13', 'bu-corp',
      'grow', 'dados', 'planejamento', 'g2', '2026-09-01', '2027-06-30', 4100000, 1.00, 1.00, 18, 2, 'drv-dados', false],
    ['prj-11', 'PRJ-0304', 'Descontinuação de Relatórios Manuais', 'prg-03', 'p-04', 'p-11', 'bu-ops',
      'run', 'processo', 'encerrado', 'g5', '2025-08-01', '2026-05-29', 890000, 1.00, 0.98, -8, 4, 'drv-eficiencia', false],
    ['prj-12', 'PRJ-0401', 'Novo App Mobile de Varejo', 'prg-04', 'p-02', 'p-13', 'bu-varejo',
      'grow', 'digital', 'execucao', 'g3', '2026-01-05', '2026-11-13', 8600000, 1.00, 1.02, 0, 1, 'drv-experiencia', false],
    ['prj-13', 'PRJ-0402', 'Onboarding Digital 100% Remoto', 'prg-04', 'p-05', 'p-13', 'bu-varejo',
      'grow', 'digital', 'transicao', 'g4', '2025-07-01', '2026-08-14', 5350000, 0.99, 1.00, 5, 2, 'drv-experiencia', false],
    ['prj-14', 'PRJ-0403', 'Motor de Ofertas Personalizadas', 'prg-04', 'p-09', 'p-13', 'bu-varejo',
      'grow', 'digital', 'ideacao', 'g0', '2026-10-01', '2027-08-31', 3750000, 0, 0, 0, 3, 'drv-receita', false],
    ['prj-15', 'PRJ-0404', 'Portal do Cliente Corporativo', 'prg-04', 'p-03', 'p-13', 'bu-corp',
      'grow', 'digital', 'execucao', 'g3', '2026-02-16', '2027-02-26', 6480000, 0.93, 0.95, 24, 2, 'drv-receita', false],
    ['prj-16', 'PRJ-0501', 'Migração para Nuvem — Onda 2', 'prg-05', 'p-14', 'p-11', 'bu-ti',
      'transform', 'infra', 'execucao', 'g3', '2026-01-19', '2027-05-28', 15200000, 0.95, 0.97, 27, 1, 'drv-resiliencia', false],
    ['prj-17', 'PRJ-0502', 'Renovação da Rede WAN/SD-WAN', 'prg-05', 'p-14', 'p-11', 'bu-ops',
      'run', 'infra', 'execucao', 'g3', '2026-03-02', '2026-12-11', 4320000, 1.00, 1.00, 0, 3, 'drv-eficiencia', false],
    ['prj-18', 'PRJ-0503', 'Observabilidade Unificada', 'prg-05', 'p-06', 'p-11', 'bu-ti',
      'grow', 'infra', 'planejamento', 'g2', '2026-08-17', '2027-03-31', 2780000, 1.00, 1.00, 0, 3, 'drv-resiliencia', false],
    ['prj-19', 'PRJ-0504', 'Consolidação de Data Centers', 'prg-05', 'p-14', 'p-11', 'bu-ti',
      'run', 'infra', 'cancelado', 'g1', '2025-06-02', '2026-06-30', 11400000, 0.60, 0.70, 0, 5, 'drv-eficiencia', false],
    ['prj-20', 'PRJ-0104', 'API Gateway Corporativo', 'prg-01', 'p-06', 'p-11', 'bu-ti',
      'transform', 'app', 'execucao', 'g3', '2026-04-13', '2027-01-29', 3960000, 0.99, 1.01, 0, 2, 'drv-eficiencia', false]
  ];

  /* --------------------------------------------------------- bancos de texto */

  const RISCOS_POR_TIPO = {
    app: [
      ['Divergência de saldo na migração de dados', 'tecnico', 'Reconciliação diária automatizada entre legado e nova base, com trava de corte.'],
      ['Indisponibilidade da janela de cutover', 'cronograma', 'Negociar janela alternativa com Operações e ensaiar rollback completo.'],
      ['Dependência de fornecedor único para o adaptador', 'fornecedor', 'Cláusula de escrow de código e PoC de adaptador alternativo.'],
      ['Regressão funcional em produtos legados', 'tecnico', 'Suíte de regressão automatizada com cobertura mínima de 80% dos fluxos críticos.']
    ],
    infra: [
      ['Estouro de custo de nuvem por falta de tagging', 'financeiro', 'Política de tagging obrigatório e orçamento com alerta em 70%.'],
      ['Latência acima do acordado após migração', 'tecnico', 'Teste de carga em ambiente espelho antes de cada onda.'],
      ['Atraso na entrega de circuitos pela operadora', 'fornecedor', 'Contrato com multa por atraso e circuito redundante de operadora distinta.'],
      ['Perda de conhecimento tácito do ambiente legado', 'recurso', 'Documentação assistida e job shadowing por 60 dias.']
    ],
    seguranca: [
      ['Resistência das áreas à revogação de acessos amplos', 'negocio', 'Campanha de comunicação com sponsor e piloto em área voluntária.'],
      ['Quebra de integração ao rotacionar credenciais', 'tecnico', 'Rotação em anel com janela de convivência de 48h.'],
      ['Achado de auditoria antes da conclusão da onda', 'regulatorio', 'Plano de ação formal registrado junto ao regulador.'],
      ['Falta de especialista certificado no mercado', 'recurso', 'Contrato de body shop com dois fornecedores homologados.']
    ],
    dados: [
      ['Qualidade insuficiente nas fontes de origem', 'tecnico', 'Régua de qualidade com bloqueio de carga e dono de dado nomeado.'],
      ['Custo de armazenamento acima do previsto', 'financeiro', 'Política de ciclo de vida e camada fria para dados frios.'],
      ['Viés não detectado no modelo de crédito', 'regulatorio', 'Validação independente e monitoramento de fairness em produção.'],
      ['Indefinição de propriedade de domínio de dados', 'negocio', 'Comitê de governança de dados com decisão em ata.']
    ],
    compliance: [
      ['Mudança de interpretação regulatória no meio do projeto', 'regulatorio', 'Acompanhamento quinzenal com Jurídico e Compliance.'],
      ['Volume de titulares acima do dimensionado', 'tecnico', 'Fila assíncrona e SLA escalonado para atendimento de requisições.'],
      ['Prazo legal inegociável', 'cronograma', 'Escopo mínimo viável aprovado no comitê como plano B.']
    ],
    digital: [
      ['Baixa adoção pelos clientes na primeira onda', 'negocio', 'Teste A/B e plano de incentivo com Marketing.'],
      ['Reprovação nas lojas de aplicativos', 'tecnico', 'Revisão prévia de diretrizes e submissão com folga de 3 semanas.'],
      ['Concorrente lança funcionalidade equivalente antes', 'negocio', 'Antecipar MVP das duas funcionalidades diferenciadoras.'],
      ['Acessibilidade abaixo do exigido em auditoria', 'regulatorio', 'Auditoria WCAG AA a cada incremento.']
    ],
    processo: [
      ['Área usuária mantém planilha paralela', 'negocio', 'Desligamento assistido com prazo em ata e sponsor responsável.'],
      ['Falta de dono para o processo redesenhado', 'recurso', 'Nomeação formal do dono de processo antes do go-live.']
    ]
  };

  const ISSUES_TEXTO = [
    ['Ambiente de homologação instável há 5 dias', 3],
    ['Pendência de aprovação de acesso privilegiado', 2],
    ['Fornecedor não entregou a documentação de arquitetura', 2],
    ['Teste de carga reprovado no cenário de pico', 4],
    ['Recurso-chave em férias sem substituto designado', 3],
    ['Divergência de escopo entre TI e área usuária', 3],
    ['Nota fiscal retida por divergência contratual', 2],
    ['Vulnerabilidade crítica encontrada em varredura', 4],
    ['Atraso na assinatura do contrato de licenciamento', 3],
    ['Perda de dados no ambiente de desenvolvimento', 2]
  ];

  const DECISOES_TEXTO = [
    ['Aprovar contratação de fornecedor adicional para acelerar frente crítica', 'ccb'],
    ['Definir se a onda 2 entra no orçamento deste exercício ou do próximo', 'comite-portfolio'],
    ['Autorizar uso de contingência para cobrir estouro de infraestrutura', 'comite-portfolio'],
    ['Escolher entre adiar o go-live ou reduzir escopo da primeira entrega', 'comite-executivo'],
    ['Aprovar exceção de arquitetura para manter integração legada', 'comite-arquitetura'],
    ['Confirmar desligamento do sistema legado na data planejada', 'comite-portfolio']
  ];

  const MUDANCAS_TEXTO = [
    ['Inclusão de trilha de auditoria não prevista no escopo original', 'escopo', 'Exigência levantada pelo regulador após o G2.'],
    ['Prorrogação de prazo por indisponibilidade de janela de cutover', 'prazo', 'Janela negociada com Operações foi realocada.'],
    ['Aumento de verba para licenças adicionais', 'custo', 'Volume de usuários revisado para cima pela área de negócio.'],
    ['Redução de escopo: relatórios avançados vão para a fase 2', 'escopo', 'Preservar a data de go-live do núcleo.'],
    ['Troca de fornecedor da frente de integração', 'contrato', 'Desempenho abaixo do acordado em dois marcos consecutivos.']
  ];

  const BENEFICIOS_POR_CATEGORIA = {
    transform: [['Redução de custo por transação', 'reducao-custo', 0.42], ['Menor tempo de lançamento de produto', 'produtividade', 0.18]],
    grow: [['Aumento de conversão em canais digitais', 'receita', 0.38], ['Ganho de produtividade operacional', 'produtividade', 0.15]],
    run: [['Custo evitado com sustentação legada', 'evitar-custo', 0.30], ['Redução de exposição a risco', 'reducao-risco', 0.12]]
  };

  const MARCOS_POR_ESTAGIO = [
    'Business case aprovado', 'Arquitetura de referência aprovada', 'Baseline de escopo e prazo congelada',
    'Ambiente de desenvolvimento pronto', 'Primeira entrega funcional', 'Integração ponta a ponta concluída',
    'Testes de aceitação aprovados', 'Plano de cutover aprovado', 'Go-live em produção',
    'Estabilização concluída', 'Transferência para sustentação', 'Encerramento contábil'
  ];

  /* =========================================================== gerador */

  function gerarMarcos(p, knobs, r) {
    const ini = p.dates.baselineInicio;
    const fim = p.dates.baselineFim;
    const totalDias = U.diffDays(ini, fim) || 300;
    const qtd = knobs.estagio === 'ideacao' ? 3 : (knobs.estagio === 'analise' ? 4 : inteiro(r, 6, 9));
    const marcos = [];
    const gates = [];
    const gateEm = { 1: 'g1', 2: 'g2', 4: 'g3', 8: 'g4', 11: 'g5' };

    for (let i = 0; i < qtd; i++) {
      const frac = (i + 1) / (qtd + 0.4);
      const baseData = U.addDays(ini, Math.round(totalDias * frac));
      const desliza = knobs.atrasoDias > 0 ? Math.round(knobs.atrasoDias * frac) : 0;
      const prevData = U.addDays(baseData, desliza);
      const concluido = U.clamp(frac * 100, 0, 100) <= knobs.pctFisico + 4;
      const nome = MARCOS_POR_ESTAGIO[Math.min(i, MARCOS_POR_ESTAGIO.length - 1)];
      const gateId = gateEm[i] || null;

      marcos.push(M.marcoVazio({
        id: p.id + '-m' + i,
        nome: nome,
        gateId: gateId,
        baselineData: baseData,
        previstoData: prevData,
        realData: concluido ? U.addDays(prevData, inteiro(r, -4, 9)) : null,
        critico: i === 0 || i === qtd - 1 || !!gateId,
        peso: gateId ? 3 : 1,
        responsavelId: p.pmId
      }));
    }

    // registros formais de gate (o que o comite decide)
    const ordemAtual = M.ordemGate(p.gateAtual);
    M.GATES.forEach(function (g) {
      if (g.ordem > ordemAtual + 1) { return; }
      const mk = marcos.find(function (m) { return m.gateId === g.id; });
      const prev = mk ? mk.previstoData : U.addDays(ini, Math.round(totalDias * (g.ordem / 5.5)));
      const passou = g.ordem < ordemAtual || (g.ordem === ordemAtual && knobs.estagio !== 'ideacao');
      let decisao = 'pendente';
      if (passou) { decisao = r() < 0.24 ? 'condicional' : 'aprovado'; }
      gates.push(M.gateVazio({
        id: p.id + '-' + g.id,
        gateId: g.id,
        previstoData: prev,
        realData: passou ? U.addDays(prev, inteiro(r, -3, 12)) : null,
        decisao: decisao,
        forum: g.ordem >= 3 ? 'comite-portfolio' : 'comite-executivo',
        aprovadorId: g.ordem >= 3 ? 'p-11' : 'p-15',
        condicoes: decisao === 'condicional'
          ? 'Aprovado com condição de reapresentar o plano de mitigação dos dois riscos altos em 30 dias.' : '',
        notas: passou ? 'Decisão registrada em ata do comitê.' : 'Aguardando pacote de evidências do gerente.'
      }));
    });

    return { marcos: marcos, gates: gates };
  }

  function gerarRiscos(p, knobs, r) {
    const banco = RISCOS_POR_TIPO[p.tipo] || RISCOS_POR_TIPO.app;
    const severidadeBase = knobs.atrasoDias > 60 ? 2 : (knobs.atrasoDias > 10 ? 1 : 0);
    const qtd = Math.min(banco.length, 2 + severidadeBase + (r() < 0.4 ? 1 : 0));
    const bac = M.bac(p);
    const out = [];
    for (let i = 0; i < qtd; i++) {
      const b = banco[i];
      // Projeto saudavel tem riscos — mas nao riscos ALTOS por construcao.
      // Somente projetos com desvio de prazo material carregam risco alto.
      const alto = i < severidadeBase;
      const prob = alto ? inteiro(r, 3, 5) : inteiro(r, 1, 3);
      const imp = alto ? inteiro(r, 4, 5) : inteiro(r, 2, 3);
      const encerrado = !alto && r() < 0.30;
      out.push(M.riscoVazio({
        id: p.id + '-r' + i,
        codigo: 'R-' + p.codigo.slice(-4) + '-' + (i + 1),
        titulo: b[0],
        categoria: b[1],
        descricao: b[0] + '. Identificado na revisão de riscos do programa.',
        probabilidade: prob,
        impacto: imp,
        exposicaoCusto: Math.round(bac * (0.015 + r() * 0.07)),
        impactoDias: inteiro(r, 5, 60),
        resposta: escolher(r, ['mitigar', 'mitigar', 'mitigar', 'transferir', 'aceitar']),
        mitigacao: b[2],
        contingencia: alto ? 'Acionar plano B aprovado no comitê e reavaliar baseline.' : '',
        donoId: escolher(r, [p.pmId, 'p-06', 'p-08', 'p-14', 'p-10']),
        prazo: U.addDays(DATA_STATUS, inteiro(r, -20, 90)),
        status: encerrado ? 'fechado' : (r() < 0.55 ? 'em-tratamento' : 'aberto'),
        abertoEm: U.addDays(p.dates.baselineInicio, inteiro(r, 10, 120)),
        fechadoEm: encerrado ? U.addDays(DATA_STATUS, -inteiro(r, 5, 60)) : null,
        revisadoEm: U.addDays(DATA_STATUS, -inteiro(r, 1, 25))
      }));
    }
    return out;
  }

  function gerarIssues(p, knobs, r) {
    if (!M.estagioAtivo(p.estagio)) { return []; }
    const extra = knobs.atrasoDias > 60 ? 2 : (knobs.atrasoDias > 10 ? 1 : 0);
    const qtd = inteiro(r, 1, 2) + extra;
    const out = [];
    const usados = {};
    for (let i = 0; i < qtd; i++) {
      let idx = inteiro(r, 0, ISSUES_TEXTO.length - 1);
      let guarda = 0;
      while (usados[idx] && guarda < 12) { idx = (idx + 1) % ISSUES_TEXTO.length; guarda += 1; }
      usados[idx] = true;
      const t = ISSUES_TEXTO[idx];
      // Issue critica (severidade 4) so em projeto com desvio material de prazo.
      let sev = t[1];
      if (extra >= 2 && i === 0) { sev = 4; } else { sev = Math.min(sev, 3); }
      const resolvida = r() < 0.34;
      const abertaEm = U.addDays(DATA_STATUS, -inteiro(r, 3, 95));
      out.push(M.issueVazia({
        id: p.id + '-i' + i,
        codigo: 'I-' + p.codigo.slice(-4) + '-' + (i + 1),
        titulo: t[0],
        descricao: t[0] + '. Registrada pelo gerente do projeto na reunião de acompanhamento.',
        severidade: sev,
        donoId: escolher(r, [p.pmId, 'p-06', 'p-10', 'p-14']),
        abertaEm: abertaEm,
        prazo: U.addDays(abertaEm, inteiro(r, 10, 40)),
        resolvidaEm: resolvida ? U.addDays(abertaEm, inteiro(r, 4, 30)) : null,
        status: resolvida ? 'resolvida' : (sev >= 4 ? 'escalada' : (r() < 0.5 ? 'em-tratamento' : 'aberta')),
        escalada: sev >= 4,
        resolucao: resolvida ? 'Tratada com o fornecedor e validada pelo QA.' : ''
      }));
    }
    return out;
  }

  function gerarDecisoesEMudancas(p, knobs, r) {
    const decisoes = [];
    const mudancas = [];
    if (!M.estagioAtivo(p.estagio)) { return { decisoes: decisoes, mudancas: mudancas }; }

    const qtdDec = knobs.atrasoDias > 20 ? inteiro(r, 1, 2) : (r() < 0.45 ? 1 : 0);
    for (let i = 0; i < qtdDec; i++) {
      const d = DECISOES_TEXTO[inteiro(r, 0, DECISOES_TEXTO.length - 1)];
      const pendente = r() < 0.6;
      const solicitada = U.addDays(DATA_STATUS, -inteiro(r, 5, 50));
      decisoes.push(M.decisaoVazia({
        id: p.id + '-d' + i,
        codigo: 'D-' + p.codigo.slice(-4) + '-' + (i + 1),
        titulo: d[0],
        contexto: 'Solicitado pelo gerente do projeto após revisão de desempenho do período.',
        forum: d[1],
        solicitadaEm: solicitada,
        prazoLimite: U.addDays(solicitada, inteiro(r, 10, 35)),
        decididaEm: pendente ? null : U.addDays(solicitada, inteiro(r, 5, 25)),
        status: pendente ? (r() < 0.25 ? 'diferida' : 'pendente') : (r() < 0.8 ? 'aprovada' : 'rejeitada'),
        decisao: pendente ? '' : 'Decisão registrada em ata, com acompanhamento na próxima reunião.',
        decisorId: d[1] === 'comite-executivo' ? 'p-11' : 'p-15',
        impacto: 'Impacta a data de go-live e o consumo de contingência.'
      }));
    }

    const qtdChg = knobs.atrasoDias > 20 ? inteiro(r, 1, 2) : (r() < 0.35 ? 1 : 0);
    const bac = M.bac(p);
    for (let i = 0; i < qtdChg; i++) {
      const c = MUDANCAS_TEXTO[inteiro(r, 0, MUDANCAS_TEXTO.length - 1)];
      const st = escolher(r, ['submetida', 'em-analise', 'aprovada', 'aprovada', 'rejeitada']);
      const solicitada = U.addDays(DATA_STATUS, -inteiro(r, 8, 70));
      const pendente = st === 'submetida' || st === 'em-analise';
      mudancas.push(M.mudancaVazia({
        id: p.id + '-c' + i,
        codigo: 'CR-' + p.codigo.slice(-4) + '-' + (i + 1),
        titulo: c[0],
        tipo: c[1],
        justificativa: c[2],
        solicitadaEm: solicitada,
        solicitanteId: p.pmId,
        impactoCusto: Math.round(bac * (0.008 + r() * 0.05)) * (c[1] === 'escopo' && /Redução/.test(c[0]) ? -1 : 1),
        impactoDias: c[1] === 'prazo' ? inteiro(r, 20, 70) : inteiro(r, 0, 25),
        impactoEscopo: c[1] === 'escopo' ? 'Altera o conteúdo da primeira entrega.' : 'Sem alteração de escopo.',
        status: st,
        decididaEm: pendente ? null : U.addDays(solicitada, inteiro(r, 6, 28)),
        aprovadorId: pendente ? null : 'p-15',
        forum: 'ccb',
        afetaBaseline: c[1] !== 'qualidade'
      }));
    }
    return { decisoes: decisoes, mudancas: mudancas };
  }

  function gerarBeneficios(p, knobs, r) {
    const banco = BENEFICIOS_POR_CATEGORIA[p.categoria] || BENEFICIOS_POR_CATEGORIA.grow;
    const bac = M.bac(p);
    return banco.map(function (b, i) {
      const esperado = Math.round(bac * (b[2] + (r() - 0.5) * 0.08));
      const maduro = p.estagio === 'encerrado' || p.estagio === 'transicao';
      const realizado = maduro ? Math.round(esperado * (0.55 + r() * 0.45)) : 0;
      return M.beneficioVazio({
        id: p.id + '-b' + i,
        nome: b[0],
        tipo: b[1],
        valorEsperado: esperado,
        valorRealizado: realizado,
        prazo: U.addDays(p.dates.baselineFim, inteiro(r, 60, 300)),
        status: p.estagio === 'encerrado' ? 'realizado' : (maduro ? 'em-realizacao' : 'previsto'),
        donoId: p.sponsorId,
        metodoMedicao: 'Medido pelo controle financeiro a partir do fechamento mensal.'
      });
    });
  }

  function gerarAlocacoes(p, knobs, r) {
    if (!M.estagioAtivo(p.estagio)) { return []; }
    const de = p.dates.previstoInicio;
    const ate = p.dates.previstoFim;
    const time = [
      [p.pmId, 'Gerente do projeto', p.categoria === 'transform' ? 60 : 40],
      [escolher(r, ['p-06', 'p-07']), 'Arquitetura', inteiro(r, 20, 45)],
      ['p-10', 'Qualidade', inteiro(r, 15, 35)]
    ];
    if (p.tipo === 'seguranca') { time.push(['p-08', 'Segurança', inteiro(r, 30, 60)]); }
    if (p.tipo === 'infra') { time.push(['p-14', 'Infraestrutura', inteiro(r, 25, 55)]); }
    if (p.tipo === 'dados') { time.push(['p-07', 'Engenharia de dados', inteiro(r, 30, 55)]); }
    if (p.categoria === 'grow') { time.push(['p-09', 'Análise de negócio', inteiro(r, 20, 40)]); }

    const vistos = {};
    return time.filter(function (t) {
      if (!t[0] || vistos[t[0]]) { return false; }
      vistos[t[0]] = true;
      return true;
    }).map(function (t, i) {
      return M.alocacaoVazia({
        id: p.id + '-a' + i, pessoaId: t[0], papel: t[1], alocacaoPct: t[2], de: de, ate: ate
      });
    });
  }

  function gerarStatusReports(p, knobs, r, saudeRag) {
    if (!M.estagioAtivo(p.estagio)) { return []; }
    const out = [];
    const n = inteiro(r, 2, 4);
    const ragEscala = ['verde', 'ambar', 'vermelho'];
    const idxBase = ragEscala.indexOf(saudeRag) >= 0 ? ragEscala.indexOf(saudeRag) : 0;

    for (let i = n - 1; i >= 0; i--) {
      // reportes mais antigos tendem a ser mais otimistas (deterioracao ao longo do tempo)
      const idx = U.clamp(idxBase - Math.round(i * 0.6), 0, 2);
      const reportado = U.addDays(DATA_STATUS, -(i * 28 + inteiro(r, 0, 6)));
      const ev = M.evm(p, reportado);
      out.push(M.statusReportVazio({
        id: p.id + '-sr' + i,
        periodo: U.periodoDe(reportado),
        reportadoEm: reportado,
        autorId: p.pmId,
        ragGeral: ragEscala[idx],
        ragEscopo: ragEscala[U.clamp(idx - 1, 0, 2)],
        ragPrazo: ragEscala[idx],
        ragCusto: ragEscala[U.clamp(idx - (knobs.fatorCustoReal > 0.65 ? 0 : 1), 0, 2)],
        ragQualidade: ragEscala[U.clamp(idx - 1, 0, 2)],
        ragRisco: ragEscala[U.clamp(idx, 0, 2)],
        destaques: idx === 0
          ? 'Entregas do período concluídas conforme o plano. Time estável e sem pendências de acesso.'
          : 'Frente principal avançou, porém abaixo do planejado no período.',
        pontosAtencao: idx === 0
          ? 'Nenhum ponto de atenção material no período.'
          : (idx === 1
            ? 'Produtividade da frente de integração abaixo do previsto; plano de recuperação em execução.'
            : 'Desvio de prazo e custo acima dos limiares de governança. Replanejamento em curso com o fornecedor.'),
        proximosPassos: 'Concluir a frente em andamento, fechar as pendências de homologação e preparar o pacote do próximo gate.',
        pedidosComite: idx === 2
          ? 'Autorização para uso de contingência e decisão sobre revisão de baseline.'
          : (idx === 1 ? 'Apoio do sponsor para liberar recurso especialista.' : ''),
        spiSnapshot: ev.SPI,
        cpiSnapshot: ev.CPI,
        pctFisicoSnapshot: ev.pctFisico
      }));
    }
    return out;
  }

  function sCurva(t) { const x = U.clamp(t, 0, 1); return x * x * (3 - 2 * x); }

  function periodosDoProjeto(p) {
    const ini = p.dates.baselineInicio;
    const fim = p.dates.previstoFim || p.dates.baselineFim;
    if (!ini || !fim) { return []; }
    return U.periodosEntre(ini, fim);
  }

  /** Curva de valor planejado. Independe de avanco/custo — gerada primeiro. */
  function gerarCurvaPlanejada(p) {
    const periodos = periodosDoProjeto(p);
    const bac = M.bac(p);
    if (!periodos.length || bac <= 0) { return []; }
    const out = [];
    let ant = 0;
    periodos.forEach(function (pe, i) {
      const f = sCurva((i + 1) / periodos.length);
      out.push({ periodo: pe, pv: Math.round(bac * (f - ant)) });
      ant = f;
    });
    return out;
  }

  /** Curva realizada, derivada do avanco fisico e do custo real ja definidos. */
  function gerarCurvaReal(p, r) {
    const periodos = periodosDoProjeto(p);
    const bac = M.bac(p);
    if (!periodos.length || bac <= 0) { return []; }
    const ddPer = U.periodoDe(DATA_STATUS);
    const decorridos = periodos.filter(function (pe) { return pe <= ddPer; });
    if (!decorridos.length) { return []; }

    const evTotal = bac * U.num(p.progress.pctFisico, 0) / 100;
    const acTotal = U.num(p.finance.custoReal, 0);
    const out = [];
    let ant = 0;
    let evAcum = 0, acAcum = 0;
    decorridos.forEach(function (pe, i) {
      const f = sCurva((i + 1) / decorridos.length);
      const ruido = 0.92 + r() * 0.16;
      const ev = Math.round(evTotal * (f - ant) * ruido);
      const ac = Math.round(acTotal * (f - ant) * (2 - ruido));
      ant = f;
      evAcum += ev; acAcum += ac;
      out.push({ periodo: pe, ev: ev, ac: ac });
    });
    // fecha a diferenca de arredondamento/ruido no ultimo periodo, para que a
    // soma da curva coincida com EV e AC informados (o comite confere isso)
    if (out.length) {
      const ult = out[out.length - 1];
      ult.ev = Math.max(0, ult.ev + Math.round(evTotal - evAcum));
      ult.ac = Math.max(0, ult.ac + Math.round(acTotal - acAcum));
    }
    return out;
  }

  function gerarDependencias(projetos, r) {
    // Dependencias cross-project no estilo Primavera. Grafo aciclico por construcao:
    // so aponta de indice menor para indice maior.
    const pares = [
      [0, 19, 'FS', 30, 'O gateway precisa estar publicado antes do corte do core.', 'alta'],
      [7, 9, 'FS', 15, 'Os modelos de crédito consomem o lakehouse.', 'alta'],
      [7, 8, 'SS', 0, 'Catálogo evolui junto com a ingestão do lakehouse.', 'media'],
      [15, 2, 'FS', 45, 'Descomissionar mainframe só após a onda 2 de nuvem.', 'alta'],
      [15, 17, 'SS', 20, 'Observabilidade acompanha a migração.', 'media'],
      [4, 5, 'FS', 0, 'Cofre de segredos é pré-requisito do Zero Trust.', 'alta'],
      [12, 11, 'FF', 0, 'App mobile e onboarding devem ir a produção na mesma janela.', 'media'],
      [16, 15, 'SS', 10, 'Rede precisa acompanhar a migração para nuvem.', 'alta'],
      [1, 0, 'FF', 0, 'Pix e core devem convergir na mesma plataforma de pagamentos.', 'alta'],
      [3, 8, 'SS', 0, 'LGPD e catálogo de dados compartilham o inventário de dados.', 'media']
    ];
    pares.forEach(function (par, i) {
      const de = projetos[par[0]];
      const para = projetos[par[1]];
      if (!de || !para) { return; }
      de.dependencias.push(M.dependenciaVazia({
        id: de.id + '-dep' + i,
        projetoDestinoId: para.id,
        tipo: par[2],
        lagDias: par[3],
        descricao: par[4],
        criticidade: par[5],
        status: 'ativa'
      }));
    });
  }

  /* =============================================================== montagem */

  seed.gerar = function () {
    const b = M.portfolioVazio();

    b.meta.orgName = 'Nortávia Serviços Financeiros S.A.';
    b.meta.moeda = 'BRL';
    b.meta.dataStatus = DATA_STATUS;
    b.meta.inicioAnoFiscal = 1;

    b.settings.unidadesNegocio = U.clonar(UNIDADES);
    b.settings.drivers = U.clonar(M.TAXONOMIA.driversPadrao);

    b.pessoas = PESSOAS.map(function (p) {
      return M.pessoaVazia({
        id: p[0], nome: p[1], papel: p[2], buId: p[3], custoHora: p[4],
        email: U.slug(p[1]) + '@nortavia.exemplo',
        capacidadeHorasMes: /Diretor/.test(p[2]) ? 40 : 160,
        ativo: true
      });
    });

    b.programas = PROGRAMAS.map(function (p) {
      return M.programaVazio({
        id: p[0], codigo: p[1], nome: p[2], sponsorId: p[3], donoId: p[4],
        driverIds: [p[5]], objetivo: p[6], status: 'ativo'
      });
    });

    b.projetos = PROJETOS.map(function (row) {
      const r = prng(hashTexto(row[1]));
      const spiAlvo = row[14];
      const cpiAlvo = row[15];
      // pctFisico e custoReal sao DERIVADOS mais abaixo, depois da curva de PV
      const knobs = { pctFisico: 0, fatorCustoReal: 0, atrasoDias: row[16], estagio: row[9] };

      const p = M.projetoVazio({
        id: row[0], codigo: row[1], nome: row[2], programaId: row[3],
        pmId: row[4], sponsorId: row[5], buId: row[6],
        categoria: row[7], tipo: row[8], estagio: row[9], gateAtual: row[10],
        prioridade: row[17], driverIds: [row[18]], obrigatorio: row[19],
        dates: {
          baselineInicio: row[11],
          baselineFim: row[12],
          previstoInicio: row[11],
          previstoFim: U.addDays(row[12], row[16]),
          dataStatus: DATA_STATUS
        },
        progress: { pctFisico: 0 },
        finance: {
          moeda: 'BRL',
          custoBaseline: row[13],
          orcamentoCapex: Math.round(row[13] * 0.72),
          orcamentoOpex: row[13] - Math.round(row[13] * 0.72),
          custoReal: 0,
          comprometido: 0,
          contingencia: Math.round(row[13] * 0.08)
        },
        objetivo: 'Contribuir para o objetivo do programa ' + row[3].toUpperCase() +
          ' com entrega mensurável dentro do ciclo orçamentário vigente.',
        descricao: row[2] + '. Projeto sob governança do PMO de TI, com baseline aprovada em comitê ' +
          'e acompanhamento mensal de desempenho por EVM.',
        tags: [row[7], row[8]].concat(row[19] ? ['obrigatorio'] : []),
        links: {
          sharepointSite: 'https://contoso.sharepoint.exemplo/sites/pmo-' + U.slug(row[2]).slice(0, 24),
          bibliotecaDocs: 'https://contoso.sharepoint.exemplo/sites/pmo-' + U.slug(row[2]).slice(0, 24) + '/Documentos',
          planoPlanner: 'https://tasks.office.exemplo/plano/' + row[1].toLowerCase(),
          arquivoProjeto: row[1] + '-cronograma.mpp',
          canalTeams: 'https://teams.exemplo/canal/' + row[1].toLowerCase(),
          wiki: ''
        }
      });

      // datas reais coerentes com o estagio
      if (row[9] !== 'ideacao') { p.dates.realInicio = U.addDays(row[11], inteiro(r, -5, 14)); }
      if (row[9] === 'encerrado') { p.dates.realFim = U.addDays(p.dates.previstoFim, row[16]); }
      if (row[9] === 'cancelado') { p.dates.realFim = '2026-02-27'; }

      /* ---- derivacao do desempenho a partir dos alvos de SPI e CPI ----
         Ordem obrigatoria: curva de PV -> pctPlanejado -> pctFisico -> AC. */
      p.finance.curvaPlanejada = gerarCurvaPlanejada(p);
      const bac = M.bac(p);
      const pctPlan = M.pctPlanejado(p, DATA_STATUS);

      let pctFisico;
      if (row[9] === 'encerrado') { pctFisico = 100; }
      else if (row[9] === 'ideacao') { pctFisico = 0; }
      else if (row[9] === 'cancelado') { pctFisico = U.arredondar(pctPlan * spiAlvo, 1); }
      else { pctFisico = U.clamp(U.arredondar(pctPlan * spiAlvo, 1), 0, 100); }
      p.progress.pctFisico = pctFisico;

      const ev = bac * pctFisico / 100;
      p.finance.custoReal = (ev > 0 && cpiAlvo > 0) ? Math.round(ev / cpiAlvo) : 0;
      p.finance.comprometido = Math.min(
        Math.round(bac * 0.98),
        p.finance.custoReal + Math.round(bac * (row[9] === 'ideacao' ? 0 : 0.09)));

      knobs.pctFisico = pctFisico;
      knobs.fatorCustoReal = U.safeDiv(p.finance.custoReal, bac);

      p.finance.curvaReal = gerarCurvaReal(p, r);

      const mg = gerarMarcos(p, knobs, r);
      p.marcos = mg.marcos;
      p.gates = mg.gates;
      p.riscos = gerarRiscos(p, knobs, r);
      p.issues = gerarIssues(p, knobs, r);
      const dm = gerarDecisoesEMudancas(p, knobs, r);
      p.decisoes = dm.decisoes;
      p.mudancas = dm.mudancas;
      p.beneficios = gerarBeneficios(p, knobs, r);
      p.alocacoes = gerarAlocacoes(p, knobs, r);

      // escores de priorizacao explicitos (alimentam o grafico de bolhas)
      p.scoreValor = U.clamp(Math.round((6 - row[17]) * 17 + (row[19] ? 12 : 0) + r() * 8), 5, 100);
      p.scoreComplexidade = U.clamp(Math.round(
        (row[7] === 'transform' ? 74 : row[7] === 'grow' ? 48 : 30) + r() * 20), 5, 100);

      // o status report precisa do RAG ja calculado
      const saude = M.saudeProjeto(p, b.settings.limiares, DATA_STATUS);
      p.statusReports = gerarStatusReports(p, knobs, r, saude.rag);

      // um caso deliberado de farol manual sobreposto (governanca real tem isso)
      if (row[0] === 'prj-15') {
        p.ragManual = 'vermelho';
        p.ragJustificativa = 'Farol elevado manualmente pelo PMO: o fornecedor da frente de integração ' +
          'entrou em recuperação judicial após o fechamento do período, risco ainda não refletido nos índices.';
      }

      p.criadoEm = U.addDays(row[11], -inteiro(r, 20, 90)) + 'T09:00:00.000Z';
      p.atualizadoEm = DATA_STATUS + 'T18:30:00.000Z';
      return M.normalizarProjeto(p);
    });

    gerarDependencias(b.projetos, prng(20260731));

    b.imports = [{
      id: U.uid('imp'), em: '2026-07-28T14:12:00.000Z', kind: 'mspdi',
      fileName: 'PRJ-0101-core-contas.xml',
      resumo: 'Exemplo histórico: 1 projeto atualizado, 6 campos aplicados'
    }];

    b.auditLog = [{
      id: U.uid('aud'), em: DATA_STATUS + 'T18:30:00.000Z', ator: 'PMO Lead',
      acao: 'Carregar portfólio de demonstração', entidade: 'bundle', entidadeId: null,
      resumo: b.projetos.length + ' projetos, ' + b.programas.length + ' programas',
      campos: null
    }];

    b.meta.geradoEm = U.agoraIso();
    b.meta.salvoEm = U.agoraIso();
    return b;
  };

  /** Resumo textual do que a semente contem — usado na tela de boas-vindas. */
  seed.resumo = function () {
    return {
      organizacao: 'Nortávia Serviços Financeiros S.A.',
      projetos: PROJETOS.length,
      programas: PROGRAMAS.length,
      pessoas: PESSOAS.length,
      dataStatus: DATA_STATUS
    };
  };

  PMO.seed = seed;
})(window.PMO = window.PMO || {});
