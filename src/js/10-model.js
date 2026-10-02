/* =============================================================================
   10-model.js — schema do portfolio, taxonomias, EVM e indicadores
   Depende de: 00-util.js
   Funcoes puras. Nao toca em DOM, nao toca em storage.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const model = {};

  model.SCHEMA_VERSION = 4;
  model.APP_VERSION = '1.5.1';

  /* ========================================================== stage-gate */

  model.GATES = [
    { id: 'g0', codigo: 'G0', nome: 'Ideação', ordem: 0,
      descricao: 'Demanda registrada e triada. Ainda sem investimento aprovado.' },
    { id: 'g1', codigo: 'G1', nome: 'Business case', ordem: 1,
      descricao: 'Caso de negócio aprovado: valor, custo e risco quantificados.' },
    { id: 'g2', codigo: 'G2', nome: 'Baseline aprovada', ordem: 2,
      descricao: 'Escopo, cronograma e orçamento congelados como linha de base.' },
    { id: 'g3', codigo: 'G3', nome: 'Autorização de execução', ordem: 3,
      descricao: 'Liberação de verba e início formal da execução.' },
    { id: 'g4', codigo: 'G4', nome: 'Aprovação de go-live', ordem: 4,
      descricao: 'Aceite de qualidade e autorização para entrar em produção.' },
    { id: 'g5', codigo: 'G5', nome: 'Encerramento', ordem: 5,
      descricao: 'Benefícios transferidos, lições aprendidas e encerramento contábil.' }
  ];

  /* Modelo de gates configurável.

     Organizações usam modelos diferentes de stage-gate — algumas têm quatro
     portões, outras sete. `settings.gates` substitui o padrão; `M.gates()` é o
     único ponto de leitura, para não existirem dois modelos em vigor ao mesmo
     tempo. GATES continua exportado como o padrão de fábrica. */

  function bundleAtual() {
    return (PMO.store && PMO.store.state) || null;
  }

  model.gates = function (bundle) {
    const b = bundle || bundleAtual();
    const cfg = b && b.settings ? b.settings.gates : null;
    if (Array.isArray(cfg) && cfg.length) { return cfg; }
    return model.GATES;
  };

  model.gatePorId = function (id, bundle) {
    if (id === null || id === undefined || id === '') { return null; }
    const lista = model.gates(bundle);
    const alvo = String(id);
    const alvoMai = alvo.toUpperCase();
    for (let i = 0; i < lista.length; i++) {
      if (String(lista[i].id) === alvo || String(lista[i].codigo).toUpperCase() === alvoMai) {
        return lista[i];
      }
    }
    return null;
  };

  model.ordemGate = function (id, bundle) {
    const g = model.gatePorId(id, bundle);
    return g ? g.ordem : -1;
  };

  /** Primeiro e último gate do modelo vigente — usado em migrações e remapeamentos. */
  model.primeiroGate = function (bundle) {
    const lista = U.sortBy(model.gates(bundle), function (g) { return g.ordem; });
    return lista[0] || model.GATES[0];
  };

  /* ========================================================== taxonomias */

  model.TAXONOMIA = {
    categorias: [
      { id: 'run', rotulo: 'Manter (Run)', descricao: 'Sustentação, obrigatoriedade, dívida técnica.' },
      { id: 'grow', rotulo: 'Crescer (Grow)', descricao: 'Expansão incremental do negócio atual.' },
      { id: 'transform', rotulo: 'Transformar (Transform)', descricao: 'Mudança estrutural de plataforma ou modelo.' }
    ],
    tipos: [
      { id: 'app', rotulo: 'Aplicações' },
      { id: 'infra', rotulo: 'Infraestrutura' },
      { id: 'seguranca', rotulo: 'Segurança' },
      { id: 'dados', rotulo: 'Dados e Analytics' },
      { id: 'compliance', rotulo: 'Regulatório' },
      { id: 'digital', rotulo: 'Canais digitais' },
      { id: 'processo', rotulo: 'Processos' }
    ],
    estagios: [
      { id: 'ideacao', rotulo: 'Ideação', gate: 'g0', ativo: false },
      { id: 'analise', rotulo: 'Análise', gate: 'g1', ativo: true },
      { id: 'planejamento', rotulo: 'Planejamento', gate: 'g2', ativo: true },
      { id: 'execucao', rotulo: 'Execução', gate: 'g3', ativo: true },
      { id: 'transicao', rotulo: 'Transição', gate: 'g4', ativo: true },
      { id: 'encerrado', rotulo: 'Encerrado', gate: 'g5', ativo: false },
      { id: 'cancelado', rotulo: 'Cancelado', gate: null, ativo: false },
      { id: 'suspenso', rotulo: 'Suspenso', gate: null, ativo: false }
    ],
    rag: [
      { id: 'verde', rotulo: 'Verde', descricao: 'Dentro do plano.', icone: 'ok' },
      { id: 'ambar', rotulo: 'Âmbar', descricao: 'Desvio sob gestão, sem escalonamento.', icone: 'alerta' },
      { id: 'vermelho', rotulo: 'Vermelho', descricao: 'Desvio crítico. Requer decisão do comitê.', icone: 'critico' },
      { id: 'azul', rotulo: 'Concluído', descricao: 'Entregue e encerrado.', icone: 'concluido' },
      { id: 'cinza', rotulo: 'Suspenso', descricao: 'Fora de execução: hold, cancelado ou não iniciado.', icone: 'pausa' }
    ],
    respostasRisco: [
      { id: 'mitigar', rotulo: 'Mitigar' },
      { id: 'aceitar', rotulo: 'Aceitar' },
      { id: 'transferir', rotulo: 'Transferir' },
      { id: 'evitar', rotulo: 'Evitar' },
      { id: 'explorar', rotulo: 'Explorar (oportunidade)' }
    ],
    statusRisco: [
      { id: 'aberto', rotulo: 'Aberto', encerrado: false },
      { id: 'em-tratamento', rotulo: 'Em tratamento', encerrado: false },
      { id: 'fechado', rotulo: 'Fechado', encerrado: true },
      { id: 'materializado', rotulo: 'Materializado', encerrado: true }
    ],
    categoriasRisco: [
      { id: 'tecnico', rotulo: 'Técnico' },
      { id: 'fornecedor', rotulo: 'Fornecedor' },
      { id: 'recurso', rotulo: 'Recursos e pessoas' },
      { id: 'regulatorio', rotulo: 'Regulatório' },
      { id: 'financeiro', rotulo: 'Financeiro' },
      { id: 'seguranca', rotulo: 'Segurança' },
      { id: 'negocio', rotulo: 'Negócio' },
      { id: 'cronograma', rotulo: 'Cronograma' }
    ],
    severidades: [
      { id: 1, rotulo: 'Baixa', token: 'neutro' },
      { id: 2, rotulo: 'Média', token: 'aviso' },
      { id: 3, rotulo: 'Alta', token: 'serio' },
      { id: 4, rotulo: 'Crítica', token: 'critico' }
    ],
    statusIssue: [
      { id: 'aberta', rotulo: 'Aberta', encerrado: false },
      { id: 'em-tratamento', rotulo: 'Em tratamento', encerrado: false },
      { id: 'escalada', rotulo: 'Escalada', encerrado: false },
      { id: 'resolvida', rotulo: 'Resolvida', encerrado: true },
      { id: 'cancelada', rotulo: 'Cancelada', encerrado: true }
    ],
    tiposMudanca: [
      { id: 'escopo', rotulo: 'Escopo' },
      { id: 'prazo', rotulo: 'Prazo' },
      { id: 'custo', rotulo: 'Custo' },
      { id: 'qualidade', rotulo: 'Qualidade' },
      { id: 'contrato', rotulo: 'Contrato' }
    ],
    statusMudanca: [
      { id: 'submetida', rotulo: 'Submetida', pendente: true },
      { id: 'em-analise', rotulo: 'Em análise', pendente: true },
      { id: 'aprovada', rotulo: 'Aprovada', pendente: false },
      { id: 'rejeitada', rotulo: 'Rejeitada', pendente: false },
      { id: 'retirada', rotulo: 'Retirada', pendente: false }
    ],
    statusDecisao: [
      { id: 'pendente', rotulo: 'Pendente', pendente: true },
      { id: 'aprovada', rotulo: 'Aprovada', pendente: false },
      { id: 'rejeitada', rotulo: 'Rejeitada', pendente: false },
      { id: 'diferida', rotulo: 'Diferida', pendente: true }
    ],
    decisoesGate: [
      { id: 'pendente', rotulo: 'Pendente', token: 'neutro' },
      { id: 'aprovado', rotulo: 'Aprovado', token: 'bom' },
      { id: 'condicional', rotulo: 'Aprovado com condições', token: 'aviso' },
      { id: 'reprovado', rotulo: 'Reprovado', token: 'critico' }
    ],
    tiposBeneficio: [
      { id: 'reducao-custo', rotulo: 'Redução de custo', financeiro: true },
      { id: 'receita', rotulo: 'Geração de receita', financeiro: true },
      { id: 'evitar-custo', rotulo: 'Custo evitado', financeiro: true },
      { id: 'reducao-risco', rotulo: 'Redução de risco', financeiro: false },
      { id: 'compliance', rotulo: 'Conformidade', financeiro: false },
      { id: 'experiencia', rotulo: 'Experiência do cliente', financeiro: false },
      { id: 'produtividade', rotulo: 'Produtividade', financeiro: true }
    ],
    statusBeneficio: [
      { id: 'previsto', rotulo: 'Previsto' },
      { id: 'em-realizacao', rotulo: 'Em realização' },
      { id: 'realizado', rotulo: 'Realizado' },
      { id: 'nao-realizado', rotulo: 'Não realizado' }
    ],
    tiposDependencia: [
      { id: 'FS', rotulo: 'Término → Início (FS)' },
      { id: 'SS', rotulo: 'Início → Início (SS)' },
      { id: 'FF', rotulo: 'Término → Término (FF)' },
      { id: 'SF', rotulo: 'Início → Término (SF)' }
    ],
    criticidades: [
      { id: 'alta', rotulo: 'Alta', token: 'critico' },
      { id: 'media', rotulo: 'Média', token: 'aviso' },
      { id: 'baixa', rotulo: 'Baixa', token: 'neutro' }
    ],
    categoriasAnexo: [
      { id: 'project-file', rotulo: 'Arquivo de projeto (.mpp/.xml/.xer)' },
      { id: 'business-case', rotulo: 'Business case' },
      { id: 'ata', rotulo: 'Ata de comitê' },
      { id: 'contrato', rotulo: 'Contrato / proposta' },
      { id: 'evidencia', rotulo: 'Evidência de gate' },
      { id: 'status-report', rotulo: 'Status report' },
      { id: 'arquitetura', rotulo: 'Documento de arquitetura' },
      { id: 'outro', rotulo: 'Outro' }
    ],
    driversPadrao: [
      { id: 'drv-eficiencia', rotulo: 'Eficiência operacional' },
      { id: 'drv-conformidade', rotulo: 'Conformidade regulatória' },
      { id: 'drv-receita', rotulo: 'Crescimento de receita' },
      { id: 'drv-dados', rotulo: 'Decisão orientada a dados' },
      { id: 'drv-experiencia', rotulo: 'Experiência do cliente' },
      { id: 'drv-resiliencia', rotulo: 'Resiliência e segurança' }
    ],
    foruns: [
      { id: 'comite-portfolio', rotulo: 'Comitê de Portfólio' },
      { id: 'comite-executivo', rotulo: 'Comitê Executivo' },
      { id: 'ccb', rotulo: 'Comitê de Controle de Mudanças (CCB)' },
      { id: 'comite-arquitetura', rotulo: 'Comitê de Arquitetura' },
      { id: 'pmo', rotulo: 'PMO' }
    ]
  };

  /* ============================== taxonomias configuráveis ==============
     TAXONOMIA é o padrão de fábrica. `settings.taxonomias[colecao]` pode
     substituí-lo por completo. `M.tax()` é o ÚNICO ponto de leitura — ler
     TAXONOMIA direto significaria ignorar a configuração do usuário.
     ===================================================================== */

  model.tax = function (colecao, bundle) {
    const b = bundle || bundleAtual();
    const ov = b && b.settings && b.settings.taxonomias ? b.settings.taxonomias[colecao] : null;
    if (Array.isArray(ov) && ov.length) { return ov; }
    return model.TAXONOMIA[colecao] || [];
  };

  model.taxItem = function (colecao, id, bundle) {
    const lista = model.tax(colecao, bundle);
    for (let i = 0; i < lista.length; i++) {
      if (String(lista[i].id) === String(id)) { return lista[i]; }
    }
    return null;
  };

  /** Busca o rotulo de um item de taxonomia. Devolve o id se nao achar. */
  model.rotulo = function (colecao, id, bundle) {
    const it = model.taxItem(colecao, id, bundle);
    if (it) { return it.rotulo; }
    return id === null || id === undefined || id === '' ? '—' : String(id);
  };

  model.estagioAtivo = function (estagio, bundle) {
    const it = model.taxItem('estagios', estagio, bundle);
    return it ? !!it.ativo : false;
  };

  /* ----------------------------------------------- trava semântica
     Coleções cujos `id` são LÓGICA do motor: o cálculo de farol, os flags de
     encerrado/pendente e a escala de severidade dependem deles. O usuário pode
     renomear e recolorir à vontade; remover ou renumerar quebraria o EVM e
     deixaria registros órfãos. Por isso o editor bloqueia exclusão aqui. */

  model.COLECOES_MOTOR = ['rag', 'estagios', 'statusRisco', 'statusIssue',
    'statusMudanca', 'statusDecisao', 'decisoesGate', 'severidades',
    'statusBeneficio', 'tiposDependencia', 'criticidades'];

  /** Ids específicos protegidos dentro de coleções por outro modo editáveis. */
  model.IDS_PROTEGIDOS = { categorias: ['run', 'grow', 'transform'] };

  model.ehItemProtegido = function (colecao, id) {
    if (model.COLECOES_MOTOR.indexOf(colecao) >= 0) { return true; }
    const lista = model.IDS_PROTEGIDOS[colecao];
    return !!(lista && lista.indexOf(String(id)) >= 0);
  };

  model.COLECOES_CONFIGURAVEIS = [
    { id: 'categorias', rotulo: 'Categorias de projeto',
      desc: 'Divide o portfólio entre manter, crescer e transformar. Alimenta o equilíbrio de investimento.' },
    { id: 'tipos', rotulo: 'Tipos de projeto', desc: 'Natureza técnica do trabalho.' },
    { id: 'estagios', rotulo: 'Estágios do ciclo de vida',
      desc: 'O flag "ativo" define quais estágios entram nas contagens de portfólio ativo.' },
    { id: 'rag', rotulo: 'Farol (RAG)',
      desc: 'Estados de saúde. O motor calcula qual se aplica; aqui você define como cada um se chama.' },
    { id: 'categoriasRisco', rotulo: 'Categorias de risco' },
    { id: 'respostasRisco', rotulo: 'Estratégias de resposta a risco' },
    { id: 'statusRisco', rotulo: 'Situações de risco',
      desc: 'O flag "encerrado" define o que sai da contagem de riscos abertos.' },
    { id: 'severidades', rotulo: 'Severidades de issue', desc: 'Escala de 1 a 4 usada no farol.' },
    { id: 'statusIssue', rotulo: 'Situações de issue' },
    { id: 'tiposMudanca', rotulo: 'Tipos de mudança' },
    { id: 'statusMudanca', rotulo: 'Situações de mudança',
      desc: 'O flag "pendente" define o que aparece como aguardando o comitê.' },
    { id: 'statusDecisao', rotulo: 'Situações de decisão' },
    { id: 'decisoesGate', rotulo: 'Decisões de gate' },
    { id: 'tiposBeneficio', rotulo: 'Tipos de benefício',
      desc: 'O flag "financeiro" define quais entram no cálculo de ROI.' },
    { id: 'statusBeneficio', rotulo: 'Situações de benefício' },
    { id: 'tiposDependencia', rotulo: 'Tipos de dependência' },
    { id: 'criticidades', rotulo: 'Criticidades de dependência' },
    { id: 'categoriasAnexo', rotulo: 'Categorias de anexo' },
    { id: 'foruns', rotulo: 'Fóruns de decisão' }
  ];

  /* --------------------------------------------------- onde cada valor é usado
     escopo 'projeto': campo direto no projeto
     escopo 'colecao': campo nos itens de projeto[colecao]
     escopo 'anexo'  : campo em bundle.anexos                                  */

  model.USO_TAXONOMIA = {
    categorias: [{ escopo: 'projeto', campo: 'categoria' }],
    tipos: [{ escopo: 'projeto', campo: 'tipo' }],
    estagios: [{ escopo: 'projeto', campo: 'estagio' }],
    rag: [
      { escopo: 'projeto', campo: 'ragManual' },
      { escopo: 'colecao', colecao: 'statusReports', campo: 'ragGeral' },
      { escopo: 'colecao', colecao: 'statusReports', campo: 'ragEscopo' },
      { escopo: 'colecao', colecao: 'statusReports', campo: 'ragPrazo' },
      { escopo: 'colecao', colecao: 'statusReports', campo: 'ragCusto' },
      { escopo: 'colecao', colecao: 'statusReports', campo: 'ragQualidade' },
      { escopo: 'colecao', colecao: 'statusReports', campo: 'ragRisco' }
    ],
    categoriasRisco: [{ escopo: 'colecao', colecao: 'riscos', campo: 'categoria' }],
    respostasRisco: [{ escopo: 'colecao', colecao: 'riscos', campo: 'resposta' }],
    statusRisco: [{ escopo: 'colecao', colecao: 'riscos', campo: 'status' }],
    severidades: [{ escopo: 'colecao', colecao: 'issues', campo: 'severidade' }],
    statusIssue: [{ escopo: 'colecao', colecao: 'issues', campo: 'status' }],
    tiposMudanca: [{ escopo: 'colecao', colecao: 'mudancas', campo: 'tipo' }],
    statusMudanca: [{ escopo: 'colecao', colecao: 'mudancas', campo: 'status' }],
    statusDecisao: [{ escopo: 'colecao', colecao: 'decisoes', campo: 'status' }],
    decisoesGate: [{ escopo: 'colecao', colecao: 'gates', campo: 'decisao' }],
    tiposBeneficio: [{ escopo: 'colecao', colecao: 'beneficios', campo: 'tipo' }],
    statusBeneficio: [{ escopo: 'colecao', colecao: 'beneficios', campo: 'status' }],
    tiposDependencia: [{ escopo: 'colecao', colecao: 'dependencias', campo: 'tipo' }],
    criticidades: [{ escopo: 'colecao', colecao: 'dependencias', campo: 'criticidade' }],
    categoriasAnexo: [{ escopo: 'anexo', campo: 'categoria' }],
    foruns: [
      { escopo: 'colecao', colecao: 'decisoes', campo: 'forum' },
      { escopo: 'colecao', colecao: 'mudancas', campo: 'forum' },
      { escopo: 'colecao', colecao: 'gates', campo: 'forum' }
    ]
  };

  /** Quantos registros usam este valor. Zero significa que dá para excluir. */
  model.contarUso = function (bundle, colecao, id) {
    const b = bundle || bundleAtual();
    if (!b) { return 0; }
    const regras = model.USO_TAXONOMIA[colecao] || [];
    const alvo = String(id);
    let n = 0;
    regras.forEach(function (regra) {
      if (regra.escopo === 'anexo') {
        (b.anexos || []).forEach(function (a) { if (String(a[regra.campo]) === alvo) { n += 1; } });
        return;
      }
      (b.projetos || []).forEach(function (p) {
        if (regra.escopo === 'projeto') {
          if (String(p[regra.campo]) === alvo) { n += 1; }
          return;
        }
        (p[regra.colecao] || []).forEach(function (it) {
          if (String(it[regra.campo]) === alvo) { n += 1; }
        });
      });
    });
    return n;
  };

  /** Troca todas as ocorrências de um valor por outro. Muta o draft recebido. */
  model.remapearTaxonomia = function (draft, colecao, de, para) {
    const regras = model.USO_TAXONOMIA[colecao] || [];
    const alvo = String(de);
    let n = 0;
    regras.forEach(function (regra) {
      if (regra.escopo === 'anexo') {
        (draft.anexos || []).forEach(function (a) {
          if (String(a[regra.campo]) === alvo) { a[regra.campo] = para; n += 1; }
        });
        return;
      }
      (draft.projetos || []).forEach(function (p) {
        if (regra.escopo === 'projeto') {
          if (String(p[regra.campo]) === alvo) { p[regra.campo] = para; n += 1; }
          return;
        }
        (p[regra.colecao] || []).forEach(function (it) {
          if (String(it[regra.campo]) === alvo) { it[regra.campo] = para; n += 1; }
        });
      });
    });
    return n;
  };

  /** Quantos projetos apontam para um gate. Usado ao reduzir o modelo de gates. */
  model.contarUsoGate = function (bundle, gateId) {
    const b = bundle || bundleAtual();
    if (!b) { return 0; }
    let n = 0;
    (b.projetos || []).forEach(function (p) {
      if (p.gateAtual === gateId) { n += 1; }
      (p.gates || []).forEach(function (g) { if (g.gateId === gateId) { n += 1; } });
      (p.marcos || []).forEach(function (m) { if (m.gateId === gateId) { n += 1; } });
    });
    return n;
  };

  /**
   * Ao trocar o modelo de stage-gate, decide para onde vai cada portão que
   * deixou de existir. Regra: dobra para TRÁS — o portão sobrevivente de maior
   * ordem que não ultrapasse a do removido. Nunca alega progresso que o projeto
   * não teve; no pior caso subestima, o que é o erro seguro em governança.
   */
  model.mapearGatesRemovidos = function (antigos, novos) {
    const idsNovos = (novos || []).map(function (g) { return g.id; });
    const sobreviventes = (antigos || []).filter(function (g) { return idsNovos.indexOf(g.id) >= 0; });
    const ordenados = U.sortBy(sobreviventes, function (g) { return g.ordem; });
    return (antigos || []).filter(function (g) { return idsNovos.indexOf(g.id) < 0; })
      .map(function (g) {
        let destino = null;
        ordenados.forEach(function (s) { if (s.ordem <= g.ordem) { destino = s; } });
        if (!destino) { destino = ordenados[0]; }
        return { de: g.id, para: destino ? destino.id : (idsNovos[0] || null) };
      })
      .filter(function (par) { return par.para; });
  };

  model.remapearGate = function (draft, de, para) {
    let n = 0;
    (draft.projetos || []).forEach(function (p) {
      if (p.gateAtual === de) { p.gateAtual = para; n += 1; }
      (p.gates || []).forEach(function (g) { if (g.gateId === de) { g.gateId = para; n += 1; } });
      (p.marcos || []).forEach(function (m) { if (m.gateId === de) { m.gateId = para; n += 1; } });
    });
    return n;
  };

  /* ================================================= limiares de governanca */

  model.LIMIARES_PADRAO = {
    spi: { vermelho: 0.90, ambar: 0.97 },
    cpi: { vermelho: 0.90, ambar: 0.97 },
    desvioDias: { vermelho: 30, ambar: 10 },
    estouroCustoPct: { vermelho: 10, ambar: 5 },
    riscosAltosAbertos: { vermelho: 3, ambar: 1 },
    issuesCriticasAbertas: { vermelho: 2, ambar: 1 },
    gateAtrasadoDias: { vermelho: 30, ambar: 10 },
    statusReportAtrasoDias: { vermelho: 21, ambar: 10 },
    alocacaoPessoaPct: { vermelho: 110, ambar: 100 },
    scoreRiscoAlto: 15,

    /* Significância dos índices de EVM.
       SPI e CPI são instáveis no início do ciclo: com pouco valor planejado ou
       pouco custo incorrido, uma variação irrelevante em valor absoluto produz
       um índice catastrófico. Projetar EAC = BAC ÷ CPI nessa fase gera alarme
       falso. Abaixo destes pisos o índice continua sendo CALCULADO e exibido,
       mas não alimenta o farol nem a projeção de custo. */
    evmSignificancia: {
      pctPlanejadoMinimo: 8,   // PV precisa valer >= 8% do BAC para o SPI contar
      acPctBacMinimo: 5,       // AC precisa valer >= 5% do BAC para o CPI contar
      evPctBacMinimo: 3        // e algum valor precisa ter sido agregado
    }
  };

  model.PESOS_PRIORIZACAO_PADRAO = {
    valorEstrategico: 30,
    beneficioFinanceiro: 25,
    urgencia: 15,
    obrigatoriedade: 30,
    complexidade: 40,
    custo: 35,
    risco: 25
  };

  /* ================================================ construtores de entidade */

  model.projetoVazio = function (over) {
    const p = {
      id: U.uid('prj'),
      codigo: '',
      nome: '',
      programaId: null,
      descricao: '',
      objetivo: '',

      sponsorId: null,
      pmId: null,
      buId: null,

      categoria: 'grow',
      tipo: 'app',
      driverIds: [],

      prioridade: 3,
      scoreValor: null,
      scoreComplexidade: null,
      obrigatorio: false,

      estagio: 'ideacao',
      gateAtual: 'g0',
      ragManual: null,
      ragJustificativa: '',

      dates: {
        baselineInicio: null,
        baselineFim: null,
        previstoInicio: null,
        previstoFim: null,
        realInicio: null,
        realFim: null,
        dataStatus: null
      },

      progress: {
        pctFisico: 0,
        pctPlanejado: null,
        pctCronograma: null
      },

      finance: {
        moeda: 'BRL',
        orcamentoCapex: 0,
        orcamentoOpex: 0,
        custoBaseline: 0,
        comprometido: 0,
        custoReal: 0,
        eacManual: null,
        contingencia: 0,
        curvaPlanejada: [],
        curvaReal: []
      },

      beneficios: [],
      tarefas: [],
      marcos: [],
      gates: [],
      riscos: [],
      issues: [],
      decisoes: [],
      mudancas: [],
      dependencias: [],
      alocacoes: [],
      statusReports: [],
      anexos: [],

      links: {
        sharepointSite: '',
        bibliotecaDocs: '',
        planoPlanner: '',
        arquivoProjeto: '',
        canalTeams: '',
        wiki: ''
      },

      tags: [],
      importSource: null,
      criadoEm: U.agoraIso(),
      atualizadoEm: U.agoraIso()
    };
    return over ? U.mesclar(p, over) : p;
  };

  model.riscoVazio = function (over) {
    return U.mesclar({
      id: U.uid('rsk'), codigo: '', titulo: '', descricao: '',
      categoria: 'tecnico', probabilidade: 3, impacto: 3,
      exposicaoCusto: 0, impactoDias: 0,
      resposta: 'mitigar', mitigacao: '', contingencia: '',
      donoId: null, prazo: null, status: 'aberto',
      abertoEm: U.hoje(), fechadoEm: null, revisadoEm: null,
      restrito: false
    }, over || {});
  };

  model.issueVazia = function (over) {
    return U.mesclar({
      id: U.uid('iss'), codigo: '', titulo: '', descricao: '',
      severidade: 2, donoId: null, abertaEm: U.hoje(), prazo: null,
      resolvidaEm: null, status: 'aberta', escalada: false, resolucao: '',
      restrito: false
    }, over || {});
  };

  model.decisaoVazia = function (over) {
    return U.mesclar({
      id: U.uid('dec'), codigo: '', titulo: '', contexto: '',
      forum: 'comite-portfolio', solicitadaEm: U.hoje(), decididaEm: null,
      prazoLimite: null, status: 'pendente', decisao: '',
      decisorId: null, impacto: '', anexos: [],
      restrito: false
    }, over || {});
  };

  model.mudancaVazia = function (over) {
    return U.mesclar({
      id: U.uid('chg'), codigo: '', titulo: '', justificativa: '',
      tipo: 'escopo', solicitadaEm: U.hoje(), solicitanteId: null,
      impactoCusto: 0, impactoDias: 0, impactoEscopo: '',
      status: 'submetida', decididaEm: null, aprovadorId: null,
      forum: 'ccb', afetaBaseline: true
    }, over || {});
  };

  model.marcoVazio = function (over) {
    return U.mesclar({
      id: U.uid('mrc'), nome: '', gateId: null,
      baselineData: null, previstoData: null, realData: null,
      critico: false, peso: 1, responsavelId: null, observacao: ''
    }, over || {});
  };

  /**
   * Tarefa do cronograma importado.
   *
   * A ferramenta NÃO edita cronograma — isso continua no MS Project. O que ela
   * faz é GUARDAR a WBS que veio do arquivo, para exibir, reexportar com
   * fidelidade e permitir que a reconciliação compare cronogramas entre
   * importações. Sem persistir, cada reimportação recalculava agregados a
   * partir do nada e o MSPDI exportado perdia o detalhe.
   */
  model.tarefaVazia = function (over) {
    return U.mesclar({
      id: U.uid('tsk'),
      uid: null,            // identificador de origem (UID do MSPDI, task_id do XER)
      nome: '',
      nivel: 1,
      outline: '',
      resumo: false,        // tarefa de agrupamento (não entra nos agregados)
      marco: false,
      critico: false,
      inicio: null, fim: null,
      realInicio: null, realFim: null,
      baselineInicio: null, baselineFim: null,
      custoBaseline: 0, custo: 0, custoReal: 0,
      trabalho: 0, duracaoHoras: 0,
      pct: 0,
      predecessores: []
    }, over || {});
  };

  model.gateVazio = function (over) {
    return U.mesclar({
      id: U.uid('gt'), gateId: 'g0', previstoData: null, realData: null,
      decisao: 'pendente', forum: 'comite-portfolio', aprovadorId: null,
      condicoes: '', notas: ''
    }, over || {});
  };

  model.beneficioVazio = function (over) {
    return U.mesclar({
      id: U.uid('ben'), nome: '', tipo: 'reducao-custo',
      valorEsperado: 0, valorRealizado: 0, unidade: 'BRL',
      prazo: null, status: 'previsto', donoId: null, metodoMedicao: ''
    }, over || {});
  };

  model.dependenciaVazia = function (over) {
    return U.mesclar({
      id: U.uid('dep'), projetoDestinoId: null, tipo: 'FS', lagDias: 0,
      descricao: '', criticidade: 'media', status: 'ativa'
    }, over || {});
  };

  model.alocacaoVazia = function (over) {
    return U.mesclar({
      id: U.uid('alc'), pessoaId: null, papel: '', alocacaoPct: 50,
      de: null, ate: null
    }, over || {});
  };

  model.statusReportVazio = function (over) {
    return U.mesclar({
      id: U.uid('sr'), periodo: U.periodoDe(U.hoje()), reportadoEm: U.hoje(),
      autorId: null,
      ragGeral: 'verde', ragEscopo: 'verde', ragPrazo: 'verde',
      ragCusto: 'verde', ragQualidade: 'verde', ragRisco: 'verde',
      destaques: '', pontosAtencao: '', proximosPassos: '', pedidosComite: '',
      spiSnapshot: null, cpiSnapshot: null, pctFisicoSnapshot: null
    }, over || {});
  };

  model.pessoaVazia = function (over) {
    return U.mesclar({
      id: U.uid('p'), nome: '', email: '', papel: '',
      buId: null, capacidadeHorasMes: 160, custoHora: 0, ativo: true
    }, over || {});
  };

  model.programaVazio = function (over) {
    return U.mesclar({
      id: U.uid('prg'), codigo: '', nome: '', objetivo: '',
      sponsorId: null, donoId: null, driverIds: [], status: 'ativo'
    }, over || {});
  };

  model.portfolioVazio = function () {
    return {
      meta: {
        schemaVersion: model.SCHEMA_VERSION,
        appVersion: model.APP_VERSION,
        orgName: 'Minha organização',
        moeda: 'BRL',
        inicioAnoFiscal: 1,
        dataStatus: U.hoje(),
        geradoEm: U.agoraIso(),
        salvoEm: null
      },
      settings: {
        limiares: U.clonar(model.LIMIARES_PADRAO),
        pesosPriorizacao: U.clonar(model.PESOS_PRIORIZACAO_PADRAO),
        unidadesNegocio: [],
        drivers: U.clonar(model.TAXONOMIA.driversPadrao),
        // modelo de stage-gate da organização; começa igual ao padrão de fábrica
        gates: U.clonar(model.GATES),
        // sobreposições por coleção; vazio = usa o padrão de fábrica
        taxonomias: {},
        tema: 'auto',
        densidade: 'padrao',
        salvarEmDisco: true
      },
      pessoas: [],
      programas: [],
      projetos: [],
      anexos: [],
      auditLog: [],
      imports: [],
      visoesSalvas: []
    };
  };

  /* ==================================================== campos editáveis
     Descreve, por tipo de registro, o que o editor genérico deve renderizar.
     É a única fonte de verdade do formulário: acrescentar um campo aqui o faz
     aparecer na interface, no rótulo certo e com o tipo certo de entrada.

     tipo: texto | textarea | numero | moeda | pct | data | booleano
         | taxonomia (exige `colecao`) | pessoa | gate | escala5 | projeto
     ==================================================================== */

  model.CAMPOS_EDICAO = {
    risco: {
      colecao: 'riscos', fabrica: 'riscoVazio', icone: 'risco',
      rotulo: 'Risco', rotuloPlural: 'Riscos', prefixoCodigo: 'R',
      campoTitulo: 'titulo',
      campos: [
        { campo: 'codigo', rotulo: 'Código', tipo: 'texto' },
        { campo: 'titulo', rotulo: 'Título do risco', tipo: 'texto', obrigatorio: true, largo: true },
        { campo: 'descricao', rotulo: 'Descrição', tipo: 'textarea', largo: true },
        { campo: 'categoria', rotulo: 'Categoria', tipo: 'taxonomia', colecao: 'categoriasRisco' },
        { campo: 'probabilidade', rotulo: 'Probabilidade', tipo: 'escala5',
          ajuda: '1 = muito baixa, 5 = muito alta' },
        { campo: 'impacto', rotulo: 'Impacto', tipo: 'escala5',
          ajuda: '1 = insignificante, 5 = severo' },
        { campo: 'exposicaoCusto', rotulo: 'Exposição financeira', tipo: 'moeda',
          ajuda: 'Perda estimada caso o risco se materialize.' },
        { campo: 'impactoDias', rotulo: 'Impacto no prazo (dias)', tipo: 'numero' },
        { campo: 'resposta', rotulo: 'Estratégia de resposta', tipo: 'taxonomia', colecao: 'respostasRisco' },
        { campo: 'mitigacao', rotulo: 'Ação de mitigação', tipo: 'textarea', largo: true },
        { campo: 'contingencia', rotulo: 'Plano de contingência', tipo: 'textarea', largo: true },
        { campo: 'donoId', rotulo: 'Dono do risco', tipo: 'pessoa' },
        { campo: 'prazo', rotulo: 'Prazo da ação', tipo: 'data' },
        { campo: 'status', rotulo: 'Situação', tipo: 'taxonomia', colecao: 'statusRisco' },
        { campo: 'abertoEm', rotulo: 'Aberto em', tipo: 'data' },
        { campo: 'fechadoEm', rotulo: 'Fechado em', tipo: 'data' },
        { campo: 'revisadoEm', rotulo: 'Revisado em', tipo: 'data' },
        { campo: 'restrito', rotulo: 'Risco restrito', tipo: 'booleano', largo: true,
          ajuda: 'Marca o risco como não compartilhável: ele fica de fora dos relatórios ' +
            'nas versões externa e executiva, que declaram quantos itens foram omitidos.' }
      ]
    },

    issue: {
      colecao: 'issues', fabrica: 'issueVazia', icone: 'alerta',
      rotulo: 'Issue', rotuloPlural: 'Issues', prefixoCodigo: 'I',
      campoTitulo: 'titulo',
      campos: [
        { campo: 'codigo', rotulo: 'Código', tipo: 'texto' },
        { campo: 'titulo', rotulo: 'Título da issue', tipo: 'texto', obrigatorio: true, largo: true },
        { campo: 'descricao', rotulo: 'Descrição', tipo: 'textarea', largo: true },
        { campo: 'severidade', rotulo: 'Severidade', tipo: 'taxonomia', colecao: 'severidades', numerico: true },
        { campo: 'donoId', rotulo: 'Dono', tipo: 'pessoa' },
        { campo: 'abertaEm', rotulo: 'Aberta em', tipo: 'data' },
        { campo: 'prazo', rotulo: 'Prazo de resolução', tipo: 'data' },
        { campo: 'status', rotulo: 'Situação', tipo: 'taxonomia', colecao: 'statusIssue' },
        { campo: 'escalada', rotulo: 'Escalada ao comitê', tipo: 'booleano' },
        { campo: 'resolvidaEm', rotulo: 'Resolvida em', tipo: 'data' },
        { campo: 'resolucao', rotulo: 'Como foi resolvida', tipo: 'textarea', largo: true },
        { campo: 'restrito', rotulo: 'Issue restrita', tipo: 'booleano', largo: true,
          ajuda: 'Marca a issue como não compartilhável: ela fica de fora dos relatórios ' +
            'nas versões externa e executiva, que declaram quantos itens foram omitidos.' }
      ]
    },

    marco: {
      colecao: 'marcos', fabrica: 'marcoVazio', icone: 'calendario',
      rotulo: 'Marco', rotuloPlural: 'Marcos', prefixoCodigo: null,
      campoTitulo: 'nome',
      campos: [
        { campo: 'nome', rotulo: 'Nome do marco', tipo: 'texto', obrigatorio: true, largo: true },
        { campo: 'gateId', rotulo: 'Gate associado', tipo: 'gate',
          ajuda: 'Marcos ligados a um gate viram portões de decisão no roadmap.' },
        { campo: 'baselineData', rotulo: 'Data da baseline', tipo: 'data' },
        { campo: 'previstoData', rotulo: 'Data prevista', tipo: 'data' },
        { campo: 'realData', rotulo: 'Data real', tipo: 'data',
          ajuda: 'Preencher conclui o marco.' },
        { campo: 'critico', rotulo: 'Marco crítico', tipo: 'booleano' },
        { campo: 'peso', rotulo: 'Peso', tipo: 'numero' },
        { campo: 'responsavelId', rotulo: 'Responsável', tipo: 'pessoa' },
        { campo: 'observacao', rotulo: 'Observação', tipo: 'textarea', largo: true }
      ]
    },

    gate: {
      colecao: 'gates', fabrica: 'gateVazio', icone: 'gate',
      rotulo: 'Registro de gate', rotuloPlural: 'Gates', prefixoCodigo: null,
      campoTitulo: 'gateId',
      campos: [
        { campo: 'gateId', rotulo: 'Gate', tipo: 'gate', obrigatorio: true },
        { campo: 'previstoData', rotulo: 'Data prevista', tipo: 'data' },
        { campo: 'realData', rotulo: 'Data da decisão', tipo: 'data' },
        { campo: 'decisao', rotulo: 'Decisão', tipo: 'taxonomia', colecao: 'decisoesGate' },
        { campo: 'forum', rotulo: 'Fórum', tipo: 'taxonomia', colecao: 'foruns' },
        { campo: 'aprovadorId', rotulo: 'Aprovador', tipo: 'pessoa' },
        { campo: 'condicoes', rotulo: 'Condições da aprovação', tipo: 'textarea', largo: true,
          ajuda: 'Aprovação condicional é dívida de governança: registre o que ficou pendente.' },
        { campo: 'notas', rotulo: 'Notas da ata', tipo: 'textarea', largo: true }
      ]
    },

    mudanca: {
      colecao: 'mudancas', fabrica: 'mudancaVazia', icone: 'ligacao',
      rotulo: 'Solicitação de mudança', rotuloPlural: 'Mudanças', prefixoCodigo: 'CR',
      campoTitulo: 'titulo',
      campos: [
        { campo: 'codigo', rotulo: 'Código', tipo: 'texto' },
        { campo: 'titulo', rotulo: 'Título da mudança', tipo: 'texto', obrigatorio: true, largo: true },
        { campo: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', largo: true },
        { campo: 'tipo', rotulo: 'Tipo', tipo: 'taxonomia', colecao: 'tiposMudanca' },
        { campo: 'impactoCusto', rotulo: 'Impacto no custo', tipo: 'moeda',
          ajuda: 'Positivo aumenta o orçamento; negativo devolve verba.' },
        { campo: 'impactoDias', rotulo: 'Impacto no prazo (dias)', tipo: 'numero' },
        { campo: 'impactoEscopo', rotulo: 'Impacto no escopo', tipo: 'textarea', largo: true },
        { campo: 'afetaBaseline', rotulo: 'Exige replanejar a baseline', tipo: 'booleano' },
        { campo: 'solicitanteId', rotulo: 'Solicitante', tipo: 'pessoa' },
        { campo: 'solicitadaEm', rotulo: 'Solicitada em', tipo: 'data' },
        { campo: 'forum', rotulo: 'Fórum de decisão', tipo: 'taxonomia', colecao: 'foruns' },
        { campo: 'status', rotulo: 'Situação', tipo: 'taxonomia', colecao: 'statusMudanca' },
        { campo: 'decididaEm', rotulo: 'Decidida em', tipo: 'data' },
        { campo: 'aprovadorId', rotulo: 'Aprovador', tipo: 'pessoa' }
      ]
    },

    decisao: {
      colecao: 'decisoes', fabrica: 'decisaoVazia', icone: 'balanca',
      rotulo: 'Decisão', rotuloPlural: 'Decisões', prefixoCodigo: 'D',
      campoTitulo: 'titulo',
      campos: [
        { campo: 'codigo', rotulo: 'Código', tipo: 'texto' },
        { campo: 'titulo', rotulo: 'Decisão solicitada', tipo: 'texto', obrigatorio: true, largo: true },
        { campo: 'contexto', rotulo: 'Contexto', tipo: 'textarea', largo: true },
        { campo: 'forum', rotulo: 'Fórum', tipo: 'taxonomia', colecao: 'foruns' },
        { campo: 'solicitadaEm', rotulo: 'Solicitada em', tipo: 'data' },
        { campo: 'prazoLimite', rotulo: 'Prazo limite', tipo: 'data',
          ajuda: 'Passado o prazo sem decisão, o item entra na caixa de alertas do PMO.' },
        { campo: 'status', rotulo: 'Situação', tipo: 'taxonomia', colecao: 'statusDecisao' },
        { campo: 'decididaEm', rotulo: 'Decidida em', tipo: 'data' },
        { campo: 'decisorId', rotulo: 'Quem decidiu', tipo: 'pessoa' },
        { campo: 'decisao', rotulo: 'Decisão registrada', tipo: 'textarea', largo: true },
        { campo: 'impacto', rotulo: 'Impacto da decisão', tipo: 'textarea', largo: true },
        { campo: 'restrito', rotulo: 'Decisão restrita', tipo: 'booleano', largo: true,
          ajuda: 'Marca a decisão como não compartilhável: ela fica de fora dos relatórios ' +
            'nas versões externa e executiva, que declaram quantos itens foram omitidos.' }
      ]
    },

    beneficio: {
      colecao: 'beneficios', fabrica: 'beneficioVazio', icone: 'beneficio',
      rotulo: 'Benefício', rotuloPlural: 'Benefícios', prefixoCodigo: null,
      campoTitulo: 'nome',
      campos: [
        { campo: 'nome', rotulo: 'Benefício', tipo: 'texto', obrigatorio: true, largo: true },
        { campo: 'tipo', rotulo: 'Tipo', tipo: 'taxonomia', colecao: 'tiposBeneficio' },
        { campo: 'valorEsperado', rotulo: 'Valor esperado', tipo: 'moeda' },
        { campo: 'valorRealizado', rotulo: 'Valor realizado', tipo: 'moeda' },
        { campo: 'prazo', rotulo: 'Prazo de realização', tipo: 'data' },
        { campo: 'status', rotulo: 'Situação', tipo: 'taxonomia', colecao: 'statusBeneficio' },
        { campo: 'donoId', rotulo: 'Dono do benefício', tipo: 'pessoa' },
        { campo: 'metodoMedicao', rotulo: 'Como será medido', tipo: 'textarea', largo: true,
          ajuda: 'Benefício sem método de medição não se comprova no encerramento.' }
      ]
    },

    dependencia: {
      colecao: 'dependencias', fabrica: 'dependenciaVazia', icone: 'ligacao',
      rotulo: 'Dependência', rotuloPlural: 'Dependências', prefixoCodigo: null,
      campoTitulo: 'descricao',
      campos: [
        { campo: 'projetoDestinoId', rotulo: 'Projeto sucessor', tipo: 'projeto', obrigatorio: true },
        { campo: 'tipo', rotulo: 'Tipo de ligação', tipo: 'taxonomia', colecao: 'tiposDependencia' },
        { campo: 'lagDias', rotulo: 'Defasagem (dias)', tipo: 'numero' },
        { campo: 'criticidade', rotulo: 'Criticidade', tipo: 'taxonomia', colecao: 'criticidades' },
        { campo: 'descricao', rotulo: 'Descrição', tipo: 'textarea', largo: true }
      ]
    },

    alocacao: {
      colecao: 'alocacoes', fabrica: 'alocacaoVazia', icone: 'pessoas',
      rotulo: 'Alocação', rotuloPlural: 'Alocações', prefixoCodigo: null,
      campoTitulo: 'papel',
      campos: [
        { campo: 'pessoaId', rotulo: 'Pessoa', tipo: 'pessoa', obrigatorio: true },
        { campo: 'papel', rotulo: 'Papel no projeto', tipo: 'texto', largo: true },
        { campo: 'alocacaoPct', rotulo: 'Alocação (%)', tipo: 'pct' },
        { campo: 'de', rotulo: 'De', tipo: 'data' },
        { campo: 'ate', rotulo: 'Até', tipo: 'data' }
      ]
    },

    statusReport: {
      colecao: 'statusReports', fabrica: 'statusReportVazio', icone: 'relatorio',
      rotulo: 'Status report', rotuloPlural: 'Status reports', prefixoCodigo: null,
      campoTitulo: 'periodo',
      campos: [
        { campo: 'periodo', rotulo: 'Período (AAAA-MM)', tipo: 'texto', obrigatorio: true },
        { campo: 'reportadoEm', rotulo: 'Reportado em', tipo: 'data' },
        { campo: 'autorId', rotulo: 'Autor', tipo: 'pessoa' },
        { campo: 'ragGeral', rotulo: 'Farol geral', tipo: 'taxonomia', colecao: 'rag' },
        { campo: 'ragEscopo', rotulo: 'Farol de escopo', tipo: 'taxonomia', colecao: 'rag' },
        { campo: 'ragPrazo', rotulo: 'Farol de prazo', tipo: 'taxonomia', colecao: 'rag' },
        { campo: 'ragCusto', rotulo: 'Farol de custo', tipo: 'taxonomia', colecao: 'rag' },
        { campo: 'ragQualidade', rotulo: 'Farol de qualidade', tipo: 'taxonomia', colecao: 'rag' },
        { campo: 'ragRisco', rotulo: 'Farol de risco', tipo: 'taxonomia', colecao: 'rag' },
        { campo: 'destaques', rotulo: 'Destaques do período', tipo: 'textarea', largo: true },
        { campo: 'pontosAtencao', rotulo: 'Pontos de atenção', tipo: 'textarea', largo: true },
        { campo: 'proximosPassos', rotulo: 'Próximos passos', tipo: 'textarea', largo: true },
        { campo: 'pedidosComite', rotulo: 'Pedidos ao comitê', tipo: 'textarea', largo: true }
      ]
    }
  };

  /** Próximo código sequencial de um registro dentro do projeto (ex.: R-0101-3). */
  model.proximoCodigoRegistro = function (projeto, tipo) {
    const def = model.CAMPOS_EDICAO[tipo];
    if (!def || !def.prefixoCodigo) { return ''; }
    const sufixo = String((projeto && projeto.codigo) || '').slice(-4) || '0000';
    const lista = (projeto && projeto[def.colecao]) || [];
    let maior = 0;
    lista.forEach(function (x) {
      const m = new RegExp('^' + def.prefixoCodigo + '-' + sufixo + '-(\\d+)$').exec(x.codigo || '');
      if (m) { maior = Math.max(maior, +m[1]); }
    });
    return def.prefixoCodigo + '-' + sufixo + '-' + (maior + 1);
  };

  /* ============================================================= migracao */

  /**
   * O schema ausente dos primeiros bundles equivale a v1. A leitura é
   * deliberadamente conservadora: uma versão futura nunca é rebaixada nem
   * normalizada pela aplicação antiga.
   */
  model.versaoSchema = function (bundle) {
    const bruto = bundle && bundle.meta ? Number(bundle.meta.schemaVersion) : 1;
    if (!Number.isFinite(bruto) || bruto < 1) { return 1; }
    return Math.floor(bruto);
  };

  function garantirObjeto(pai, campo, alteracoes) {
    if (!pai[campo] || typeof pai[campo] !== 'object' || Array.isArray(pai[campo])) {
      pai[campo] = {};
      alteracoes.push('criado ' + campo);
    }
    return pai[campo];
  }

  function garantirArray(pai, campo, alteracoes) {
    if (!Array.isArray(pai[campo])) {
      pai[campo] = [];
      alteracoes.push('criado ' + campo + '[]');
    }
    return pai[campo];
  }

  const COLECOES_TOPO_CRITICAS = [
    'pessoas', 'programas', 'projetos', 'anexos', 'auditLog', 'imports', 'visoesSalvas'
  ];
  const COLECOES_PROJETO_CRITICAS = [
    'beneficios', 'tarefas', 'marcos', 'gates', 'riscos', 'issues', 'decisoes',
    'mudancas', 'dependencias', 'alocacoes', 'statusReports', 'anexos'
  ];
  const COLECOES_TOPO_COM_ID = [
    'pessoas', 'programas', 'projetos', 'anexos', 'auditLog', 'imports', 'visoesSalvas'
  ];
  const COLECOES_PROJETO_COM_ID = [
    'beneficios', 'tarefas', 'marcos', 'gates', 'riscos', 'issues', 'decisoes',
    'mudancas', 'dependencias', 'alocacoes', 'statusReports'
  ];

  function erroContratoMigracao(erros) {
    const lista = Array.isArray(erros) ? erros : [String(erros)];
    const e = new Error('Migracao bloqueada: ' + lista.join('; '));
    e.code = 'MIGRACAO_INVALIDA';
    e.detalhes = lista;
    return e;
  }

  function idValido(id) {
    return typeof id === 'string' && id.trim().length > 0;
  }

  function arrayOuVazio(pai, campo, caminho, erros) {
    if (pai[campo] === undefined || pai[campo] === null) { return []; }
    if (!Array.isArray(pai[campo])) {
      erros.push(caminho + ' deve ser array');
      return [];
    }
    return pai[campo];
  }

  function validarIds(lista, caminho, erros, aceitarNumero) {
    const vistos = Object.create(null);
    (lista || []).forEach(function (item, i) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        erros.push(caminho + '[' + i + '] nao e objeto');
        return;
      }
      const numeroValido = aceitarNumero && typeof item.id === 'number' && Number.isFinite(item.id);
      if (!idValido(item.id) && !numeroValido) {
        erros.push(caminho + '[' + i + '] sem id valido');
        return;
      }
      const id = numeroValido ? 'numero:' + item.id : 'texto:' + item.id.trim();
      if (vistos[id]) { erros.push(caminho + ' contem id duplicado: ' + String(item.id)); }
      vistos[id] = true;
    });
  }

  function indiceSeguro(lista) {
    const out = Object.create(null);
    (lista || []).forEach(function (item) {
      if (item && idValido(item.id)) { out[item.id] = item; }
    });
    return out;
  }

  /**
   * Valida somente invariantes que uma migracao jamais pode "consertar" por
   * descarte ou por geracao de novos ids. Defaults de apresentacao continuam a
   * cargo da normalizacao final.
   */
  function validarIntegridadeMigracao(bundle, fase) {
    const erros = [];
    const prefixo = fase ? fase + ': ' : '';
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
      throw erroContratoMigracao(prefixo + 'bundle ausente ou invalido');
    }
    ['meta', 'settings'].forEach(function (campo) {
      if (bundle[campo] !== undefined && bundle[campo] !== null &&
          (typeof bundle[campo] !== 'object' || Array.isArray(bundle[campo]))) {
        erros.push(campo + ' deve ser objeto');
      }
    });

    const colecoes = {};
    COLECOES_TOPO_CRITICAS.forEach(function (campo) {
      colecoes[campo] = arrayOuVazio(bundle, campo, campo, erros);
    });
    COLECOES_TOPO_COM_ID.forEach(function (campo) {
      validarIds(colecoes[campo], campo, erros);
    });

    const programas = indiceSeguro(colecoes.programas);
    const projetos = indiceSeguro(colecoes.projetos);
    const anexos = indiceSeguro(colecoes.anexos);

    colecoes.projetos.forEach(function (projeto, pi) {
      if (!projeto || typeof projeto !== 'object' || Array.isArray(projeto)) { return; }
      const caminho = 'projetos[' + pi + ']';
      if (projeto.programaId !== null && projeto.programaId !== undefined && projeto.programaId !== '' &&
          !programas[projeto.programaId]) {
        erros.push(caminho + '.programaId aponta para programa inexistente: ' + projeto.programaId);
      }
      const internas = {};
      COLECOES_PROJETO_CRITICAS.forEach(function (campo) {
        internas[campo] = arrayOuVazio(projeto, campo, caminho + '.' + campo, erros);
      });
      COLECOES_PROJETO_COM_ID.forEach(function (campo) {
        validarIds(internas[campo], caminho + '.' + campo, erros);
      });
      internas.dependencias.forEach(function (dep, di) {
        if (dep && dep.projetoDestinoId !== null && dep.projetoDestinoId !== undefined &&
            dep.projetoDestinoId !== '' && !projetos[dep.projetoDestinoId]) {
          erros.push(caminho + '.dependencias[' + di + '] aponta para projeto inexistente: ' +
            dep.projetoDestinoId);
        }
      });
      const refsAnexo = Object.create(null);
      internas.anexos.forEach(function (anexoId, ai) {
        if (!idValido(anexoId)) {
          erros.push(caminho + '.anexos[' + ai + '] sem id valido');
          return;
        }
        if (refsAnexo[anexoId]) { erros.push(caminho + '.anexos contem id duplicado: ' + anexoId); }
        refsAnexo[anexoId] = true;
        if (!anexos[anexoId]) {
          erros.push(caminho + '.anexos aponta para anexo inexistente: ' + anexoId);
        } else if (anexos[anexoId].projetoId !== projeto.id) {
          erros.push(caminho + '.anexos aponta para anexo de outro projeto: ' + anexoId);
        }
      });
    });

    colecoes.anexos.forEach(function (anexo, ai) {
      if (!anexo || typeof anexo !== 'object' || Array.isArray(anexo)) { return; }
      const caminho = 'anexos[' + ai + ']';
      const projeto = anexo.projetoId ? projetos[anexo.projetoId] : null;
      if (anexo.projetoId && !projeto) {
        erros.push(caminho + '.projetoId aponta para projeto inexistente: ' + anexo.projetoId);
      }
      if (anexo.substitui) {
        if (anexo.substitui === anexo.id) { erros.push(caminho + '.substitui referencia o proprio anexo'); }
        else if (!anexos[anexo.substitui]) {
          erros.push(caminho + '.substitui aponta para anexo inexistente: ' + anexo.substitui);
        }
      }
      if (anexo.entidadeRef) {
        const ref = anexo.entidadeRef;
        const def = ref && model.CAMPOS_EDICAO[ref.tipo];
        if (!projeto) { erros.push(caminho + '.entidadeRef exige projetoId valido'); }
        if (!ref || typeof ref !== 'object' || !def || !idValido(ref.id)) {
          erros.push(caminho + '.entidadeRef invalida');
        } else if (projeto) {
          const alvo = (Array.isArray(projeto[def.colecao]) ? projeto[def.colecao] : [])
            .some(function (item) { return item && item.id === ref.id; });
          if (!alvo) {
            erros.push(caminho + '.entidadeRef aponta para registro inexistente: ' + ref.tipo + '/' + ref.id);
          }
        }
      }
    });

    if (erros.length) { throw erroContratoMigracao(erros.map(function (x) { return prefixo + x; })); }
  }

  function contagensCriticas(bundle) {
    const out = Object.create(null);
    COLECOES_TOPO_CRITICAS.forEach(function (campo) {
      out['bundle.' + campo] = Array.isArray(bundle[campo]) ? bundle[campo].length : 0;
    });
    (Array.isArray(bundle.projetos) ? bundle.projetos : []).forEach(function (projeto) {
      if (!projeto || !idValido(projeto.id)) { return; }
      COLECOES_PROJETO_CRITICAS.forEach(function (campo) {
        const chave = 'projeto[' + projeto.id + '].' + campo;
        out[chave] = Array.isArray(projeto[campo]) ? projeto[campo].length : 0;
      });
    });
    return out;
  }

  function resumoContagensMigracao(bundle) {
    const topo = {};
    const itensProjeto = {};
    COLECOES_TOPO_CRITICAS.forEach(function (campo) {
      topo[campo] = Array.isArray(bundle && bundle[campo]) ? bundle[campo].length : 0;
    });
    COLECOES_PROJETO_CRITICAS.forEach(function (campo) { itensProjeto[campo] = 0; });
    (Array.isArray(bundle && bundle.projetos) ? bundle.projetos : []).forEach(function (projeto) {
      COLECOES_PROJETO_CRITICAS.forEach(function (campo) {
        itensProjeto[campo] += Array.isArray(projeto && projeto[campo]) ? projeto[campo].length : 0;
      });
    });
    return { topo: topo, itensProjeto: itensProjeto };
  }

  function garantirContagensNaoDiminuiram(antes, depois, fase) {
    const a = contagensCriticas(antes);
    const d = contagensCriticas(depois);
    const erros = [];
    Object.keys(a).forEach(function (campo) {
      const atual = Object.prototype.hasOwnProperty.call(d, campo) ? d[campo] : 0;
      if (atual < a[campo]) {
        erros.push(fase + ': ' + campo + ' diminuiu de ' + a[campo] + ' para ' + atual);
      }
    });
    if (erros.length) { throw erroContratoMigracao(erros); }
  }

  function migradorEmCopia(transformar) {
    return function (origem) {
      const copia = U.clonar(origem);
      const alteracoes = [];
      transformar(copia, alteracoes);
      return { bundle: copia, alteracoes: alteracoes };
    };
  }

  const MIGRADORES = {
    1: migradorEmCopia(function (bundle, alteracoes) {
      const settings = garantirObjeto(bundle, 'settings', alteracoes);
      if (!Array.isArray(settings.gates) || !settings.gates.length) {
        settings.gates = U.clonar(model.GATES);
        alteracoes.push('adicionado modelo de stage-gate');
      }
      if (!settings.taxonomias || typeof settings.taxonomias !== 'object' || Array.isArray(settings.taxonomias)) {
        settings.taxonomias = {};
        alteracoes.push('adicionadas taxonomias configuráveis');
      }
      garantirObjeto(bundle, 'meta', alteracoes).schemaVersion = 2;
    }),
    2: migradorEmCopia(function (bundle, alteracoes) {
      const settings = garantirObjeto(bundle, 'settings', alteracoes);
      if (typeof settings.salvarEmDisco !== 'boolean') {
        settings.salvarEmDisco = true;
        alteracoes.push('definida preferência de réplica em disco');
      }
      garantirArray(bundle, 'anexos', alteracoes);
      garantirArray(bundle, 'auditLog', alteracoes);
      garantirArray(bundle, 'imports', alteracoes);
      garantirArray(bundle, 'visoesSalvas', alteracoes);
      garantirObjeto(bundle, 'meta', alteracoes).schemaVersion = 3;
    }),
    3: migradorEmCopia(function (bundle, alteracoes) {
      const settings = garantirObjeto(bundle, 'settings', alteracoes);
      if (['auto', 'claro', 'escuro'].indexOf(settings.tema) < 0) {
        settings.tema = 'auto';
        alteracoes.push('canonizado tema no bundle');
      }
      // v4 elimina qualquer retenção destrutiva: as coleções são preservadas
      // integralmente e a interface pode paginar sem cortar o histórico.
      garantirArray(bundle, 'auditLog', alteracoes);
      garantirArray(bundle, 'imports', alteracoes);
      garantirObjeto(bundle, 'meta', alteracoes).schemaVersion = 4;
    })
  };
  model.MIGRADORES = MIGRADORES;

  function erroSchemaFuturo(versao) {
    const e = new Error('Este portfólio usa o schema v' + versao +
      ', mas esta versão do PMO Tool suporta somente até v' + model.SCHEMA_VERSION + '.');
    e.code = 'SCHEMA_FUTURO';
    e.schemaVersion = versao;
    e.schemaSuportado = model.SCHEMA_VERSION;
    return e;
  }

  /** Completa defaults do schema corrente sem descartar chaves desconhecidas. */
  function normalizarBundle(bundle) {
    const base = model.portfolioVazio();
    const b = U.clonar(bundle || {});
    // Começar pelo default e mesclar o original preserva também extensões no
    // topo, em meta/settings e dentro das entidades.
    const out = U.mesclar(U.clonar(base), b);

    out.meta = U.mesclar(U.clonar(base.meta), b.meta || {});
    out.meta.schemaVersion = model.SCHEMA_VERSION;
    out.meta.appVersion = model.APP_VERSION;
    if (!U.parseDate(out.meta.dataStatus)) { out.meta.dataStatus = U.hoje(); }

    out.settings = U.mesclar(U.clonar(base.settings), b.settings || {});
    out.settings.limiares = U.mesclar(U.clonar(model.LIMIARES_PADRAO), (b.settings || {}).limiares || {});
    out.settings.pesosPriorizacao = U.mesclar(
      U.clonar(model.PESOS_PRIORIZACAO_PADRAO), (b.settings || {}).pesosPriorizacao || {});
    if (!out.settings.drivers || !out.settings.drivers.length) {
      out.settings.drivers = U.clonar(model.TAXONOMIA.driversPadrao);
    }
    const gatesCfg = (b.settings || {}).gates;
    out.settings.gates = (Array.isArray(gatesCfg) && gatesCfg.length)
      ? gatesCfg.map(function (g, i) {
        return U.mesclar({ id: g.id, codigo: g.codigo, nome: g.nome,
          ordem: U.ehNum(g.ordem) ? g.ordem : i, descricao: g.descricao || '' }, g);
      })
      : U.clonar(model.GATES);
    out.settings.taxonomias = (b.settings || {}).taxonomias || {};
    if (['auto', 'claro', 'escuro'].indexOf(out.settings.tema) < 0) { out.settings.tema = 'auto'; }
    if (['compacta', 'padrao', 'confortavel'].indexOf(out.settings.densidade) < 0) {
      out.settings.densidade = 'padrao';
    }

    out.pessoas = (b.pessoas || []).map(function (x) { return model.pessoaVazia(x); });
    out.programas = (b.programas || []).map(function (x) { return model.programaVazio(x); });
    out.projetos = (b.projetos || []).map(function (x) { return model.normalizarProjeto(x); });
    out.anexos = Array.isArray(b.anexos) ? b.anexos.slice() : [];
    out.auditLog = Array.isArray(b.auditLog) ? b.auditLog.slice() : [];
    out.imports = Array.isArray(b.imports) ? b.imports.slice() : [];
    out.visoesSalvas = Array.isArray(b.visoesSalvas) ? b.visoesSalvas.slice() : [];
    return out;
  }

  function validarConfiguracaoFinal(bundle) {
    const erros = [];
    const meta = bundle && bundle.meta;
    const settings = bundle && bundle.settings;
    function validarNumeros(esperado, atual, caminho) {
      Object.keys(esperado).forEach(function (campo) {
        const valorEsperado = esperado[campo];
        const valorAtual = atual && atual[campo];
        if (typeof valorEsperado === 'number') {
          if (!Number.isFinite(valorAtual)) { erros.push(caminho + '.' + campo + ' deve ser numero finito'); }
        } else if (valorEsperado && typeof valorEsperado === 'object') {
          if (!valorAtual || typeof valorAtual !== 'object' || Array.isArray(valorAtual)) {
            erros.push(caminho + '.' + campo + ' deve ser objeto');
          } else {
            validarNumeros(valorEsperado, valorAtual, caminho + '.' + campo);
          }
        }
      });
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta) ||
        meta.schemaVersion !== model.SCHEMA_VERSION) {
      erros.push('meta.schemaVersion final deve ser ' + model.SCHEMA_VERSION);
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      erros.push('settings final ausente ou invalido');
    } else {
      if (['auto', 'claro', 'escuro'].indexOf(settings.tema) < 0) {
        erros.push('settings.tema invalido');
      }
      if (typeof settings.salvarEmDisco !== 'boolean') {
        erros.push('settings.salvarEmDisco deve ser booleano');
      }
      ['limiares', 'pesosPriorizacao', 'taxonomias'].forEach(function (campo) {
        if (!settings[campo] || typeof settings[campo] !== 'object' || Array.isArray(settings[campo])) {
          erros.push('settings.' + campo + ' deve ser objeto');
        }
      });
      validarNumeros(model.LIMIARES_PADRAO, settings.limiares, 'settings.limiares');
      validarNumeros(model.PESOS_PRIORIZACAO_PADRAO,
        settings.pesosPriorizacao, 'settings.pesosPriorizacao');
      ['gates', 'drivers', 'unidadesNegocio'].forEach(function (campo) {
        if (!Array.isArray(settings[campo])) { erros.push('settings.' + campo + ' deve ser array'); }
      });
      if (Array.isArray(settings.gates)) {
        if (!settings.gates.length) { erros.push('settings.gates nao pode ser vazio'); }
        validarIds(settings.gates, 'settings.gates', erros);
        const codigos = Object.create(null);
        const ordens = Object.create(null);
        settings.gates.forEach(function (gate, i) {
          if (!gate || typeof gate !== 'object') { return; }
          const codigo = typeof gate.codigo === 'string' ? gate.codigo.trim().toUpperCase() : '';
          if (!codigo) { erros.push('settings.gates[' + i + '] sem codigo'); }
          else if (codigos[codigo]) { erros.push('settings.gates contem codigo duplicado: ' + codigo); }
          codigos[codigo] = true;
          if (typeof gate.nome !== 'string' || !gate.nome.trim()) {
            erros.push('settings.gates[' + i + '] sem nome');
          }
          if (!Number.isFinite(gate.ordem)) { erros.push('settings.gates[' + i + '].ordem invalida'); }
          else if (ordens[String(gate.ordem)]) { erros.push('settings.gates contem ordem duplicada: ' + gate.ordem); }
          else { ordens[String(gate.ordem)] = true; }
        });
      }
      if (Array.isArray(settings.drivers)) { validarIds(settings.drivers, 'settings.drivers', erros); }
      if (Array.isArray(settings.unidadesNegocio)) {
        validarIds(settings.unidadesNegocio, 'settings.unidadesNegocio', erros);
      }
      if (settings.taxonomias && typeof settings.taxonomias === 'object' && !Array.isArray(settings.taxonomias)) {
        Object.keys(settings.taxonomias).forEach(function (campo) {
          if (!Array.isArray(settings.taxonomias[campo])) {
            erros.push('settings.taxonomias.' + campo + ' deve ser array');
          } else {
            validarIds(settings.taxonomias[campo], 'settings.taxonomias.' + campo, erros, true);
          }
        });
      }
    }
    COLECOES_TOPO_CRITICAS.forEach(function (campo) {
      if (!Array.isArray(bundle[campo])) { erros.push(campo + ' final deve ser array'); }
    });
    if (erros.length) { throw erroContratoMigracao(erros); }
  }

  /**
   * Migra uma cópia e devolve evidência de cada salto. Nenhum migrador recebe o
   * objeto original e nenhum salto implícito é permitido.
   */
  model.migrarComRelatorio = function (bundle) {
    if (!bundle || typeof bundle !== 'object') {
      const vazio = model.portfolioVazio();
      return { bundle: vazio, relatorio: {
        de: null, para: model.SCHEMA_VERSION, passos: [],
        normalizacao: { antes: resumoContagensMigracao(vazio), depois: resumoContagensMigracao(vazio) },
        validacoes: { integridadeFinal: true, configuracaoFinal: true, modelValidar: true, idempotente: true },
        avisos: ['bundle de origem ausente; criado portfolio vazio']
      } };
    }
    if (bundle.meta && Object.prototype.hasOwnProperty.call(bundle.meta, 'schemaVersion')) {
      const declarado = Number(bundle.meta.schemaVersion);
      if (!Number.isFinite(declarado) || declarado < 1 || Math.floor(declarado) !== declarado) {
        throw erroContratoMigracao('meta.schemaVersion de origem invalido');
      }
    }
    const de = model.versaoSchema(bundle);
    if (de > model.SCHEMA_VERSION) { throw erroSchemaFuturo(de); }
    validarIntegridadeMigracao(bundle, 'schema v' + de + ' de origem');
    let trabalho = U.clonar(bundle);
    const passos = [];
    let versao = de;
    while (versao < model.SCHEMA_VERSION) {
      const migrador = MIGRADORES[versao];
      if (!migrador) { throw new Error('Não existe migrador explícito de schema v' + versao + '.'); }
      const origemPasso = trabalho;
      const resultado = migrador(origemPasso);
      if (!resultado || !resultado.bundle || resultado.bundle === origemPasso) {
        throw erroContratoMigracao('migrador v' + versao + ' nao devolveu uma nova copia');
      }
      if (model.versaoSchema(resultado.bundle) !== versao + 1) {
        throw erroContratoMigracao('migrador v' + versao + ' nao produziu schema v' + (versao + 1));
      }
      validarIntegridadeMigracao(resultado.bundle, 'salto v' + versao + ' para v' + (versao + 1));
      garantirContagensNaoDiminuiram(origemPasso, resultado.bundle,
        'salto v' + versao + ' para v' + (versao + 1));
      trabalho = resultado.bundle;
      passos.push({
        de: versao,
        para: versao + 1,
        alteracoes: resultado.alteracoes || [],
        contagens: { antes: resumoContagensMigracao(origemPasso), depois: resumoContagensMigracao(resultado.bundle) },
        invariantes: { integridade: true, contagensNaoDiminuiram: true },
        avisos: []
      });
      versao += 1;
    }
    const contagensAntesNormalizacao = resumoContagensMigracao(trabalho);
    const final = normalizarBundle(trabalho);
    validarIntegridadeMigracao(final, 'schema final');
    garantirContagensNaoDiminuiram(trabalho, final, 'normalizacao final');
    validarConfiguracaoFinal(final);
    const validacao = model.validar(final);
    if (!validacao || !validacao.ok) {
      const mensagens = validacao && Array.isArray(validacao.erros)
        ? validacao.erros.map(function (x) { return x.msg || String(x); })
        : ['model.validar nao confirmou o bundle final'];
      throw erroContratoMigracao(mensagens);
    }
    const segundaNormalizacao = normalizarBundle(final);
    if (JSON.stringify(segundaNormalizacao) !== JSON.stringify(final)) {
      throw erroContratoMigracao('normalizacao final nao e idempotente');
    }
    return {
      bundle: final,
      relatorio: {
        de: de,
        para: model.SCHEMA_VERSION,
        passos: passos,
        normalizacao: { antes: contagensAntesNormalizacao, depois: resumoContagensMigracao(final) },
        validacoes: { integridadeFinal: true, configuracaoFinal: true, modelValidar: true, idempotente: true },
        avisos: []
      }
    };
  };

  model.migrar = function (bundle) {
    return model.migrarComRelatorio(bundle).bundle;
  };

  /**
   * Visão compatível para inspeção de schema futuro. O Store mantém também o
   * bundle bruto e bloqueia toda escrita; aqui só completamos estruturas que a
   * interface atual precisa para conseguir abrir e exportar um backup.
   */
  model.prepararSomenteLeitura = function (bundle) {
    const base = model.portfolioVazio();
    const b = U.clonar(bundle || {});
    const out = U.mesclar(U.clonar(base), b);
    out.meta = U.mesclar(U.clonar(base.meta), b.meta || {});
    out.settings = U.mesclar(U.clonar(base.settings), b.settings || {});
    ['pessoas', 'programas', 'projetos', 'anexos', 'auditLog', 'imports', 'visoesSalvas']
      .forEach(function (k) { if (!Array.isArray(out[k])) { out[k] = []; } });
    return out;
  };

  /** Garante que um projeto tem todos os campos e tipos corretos. Idempotente. */
  model.normalizarProjeto = function (bruto) {
    const p = model.projetoVazio();
    const b = bruto || {};
    const out = U.mesclar(p, b);

    if (!out.id) { out.id = U.uid('prj'); }
    out.codigo = String(out.codigo || '').trim();
    out.nome = String(out.nome || '').trim();

    ['baselineInicio', 'baselineFim', 'previstoInicio', 'previstoFim', 'realInicio', 'realFim', 'dataStatus']
      .forEach(function (k) { out.dates[k] = U.parseDate(out.dates[k]); });

    // previsto cai na baseline quando ausente, e vice-versa
    if (!out.dates.previstoInicio) { out.dates.previstoInicio = out.dates.baselineInicio; }
    if (!out.dates.previstoFim) { out.dates.previstoFim = out.dates.baselineFim; }
    if (!out.dates.baselineInicio) { out.dates.baselineInicio = out.dates.previstoInicio; }
    if (!out.dates.baselineFim) { out.dates.baselineFim = out.dates.previstoFim; }

    out.progress.pctFisico = U.clamp(U.num(out.progress.pctFisico, 0), 0, 100);
    if (out.progress.pctPlanejado !== null) {
      out.progress.pctPlanejado = U.clamp(U.num(out.progress.pctPlanejado, 0), 0, 100);
    }

    const f = out.finance;
    f.orcamentoCapex = U.num(f.orcamentoCapex, 0);
    f.orcamentoOpex = U.num(f.orcamentoOpex, 0);
    f.comprometido = U.num(f.comprometido, 0);
    f.custoReal = U.num(f.custoReal, 0);
    f.contingencia = U.num(f.contingencia, 0);
    f.custoBaseline = U.num(f.custoBaseline, 0);
    if (!f.custoBaseline) { f.custoBaseline = f.orcamentoCapex + f.orcamentoOpex; }
    if (f.eacManual !== null && f.eacManual !== undefined && f.eacManual !== '') {
      f.eacManual = U.num(f.eacManual, 0);
    } else { f.eacManual = null; }
    f.curvaPlanejada = (f.curvaPlanejada || []).map(function (x) {
      return U.mesclar(U.mesclar({}, x), {
        periodo: String(x.periodo || ''), pv: U.num(x.pv, 0)
      });
    }).filter(function (x) { return x.periodo; });
    f.curvaReal = (f.curvaReal || []).map(function (x) {
      return U.mesclar(U.mesclar({}, x), {
        periodo: String(x.periodo || ''), ev: U.num(x.ev, 0), ac: U.num(x.ac, 0)
      });
    }).filter(function (x) { return x.periodo; });

    out.tarefas = (out.tarefas || []).map(function (x) {
      const t = model.tarefaVazia(x);
      ['inicio', 'fim', 'realInicio', 'realFim', 'baselineInicio', 'baselineFim']
        .forEach(function (k) { t[k] = U.parseDate(t[k]); });
      t.nivel = U.clamp(Math.round(U.num(t.nivel, 1)), 1, 20);
      t.pct = U.clamp(U.num(t.pct, 0), 0, 100);
      ['custoBaseline', 'custo', 'custoReal', 'trabalho', 'duracaoHoras']
        .forEach(function (k) { t[k] = U.num(t[k], 0); });
      t.resumo = !!t.resumo;
      t.marco = !!t.marco;
      t.critico = !!t.critico;
      t.predecessores = Array.isArray(t.predecessores) ? t.predecessores : [];
      return t;
    });

    out.marcos = (out.marcos || []).map(function (x) {
      const m = model.marcoVazio(x);
      m.baselineData = U.parseDate(m.baselineData);
      m.previstoData = U.parseDate(m.previstoData) || m.baselineData;
      m.realData = U.parseDate(m.realData);
      return m;
    });
    out.gates = (out.gates || []).map(function (x) {
      const g = model.gateVazio(x);
      g.previstoData = U.parseDate(g.previstoData);
      g.realData = U.parseDate(g.realData);
      return g;
    });
    out.riscos = (out.riscos || []).map(function (x) {
      const r = model.riscoVazio(x);
      r.probabilidade = U.clamp(Math.round(U.num(r.probabilidade, 3)), 1, 5);
      r.impacto = U.clamp(Math.round(U.num(r.impacto, 3)), 1, 5);
      r.exposicaoCusto = U.num(r.exposicaoCusto, 0);
      r.impactoDias = U.num(r.impactoDias, 0);
      r.prazo = U.parseDate(r.prazo);
      r.abertoEm = U.parseDate(r.abertoEm) || U.hoje();
      r.fechadoEm = U.parseDate(r.fechadoEm);
      r.revisadoEm = U.parseDate(r.revisadoEm);
      r.restrito = !!r.restrito;
      return r;
    });
    out.issues = (out.issues || []).map(function (x) {
      const i = model.issueVazia(x);
      i.severidade = U.clamp(Math.round(U.num(i.severidade, 2)), 1, 4);
      i.abertaEm = U.parseDate(i.abertaEm) || U.hoje();
      i.prazo = U.parseDate(i.prazo);
      i.resolvidaEm = U.parseDate(i.resolvidaEm);
      i.escalada = !!i.escalada;
      i.restrito = !!i.restrito;
      return i;
    });
    out.decisoes = (out.decisoes || []).map(function (x) {
      const d = model.decisaoVazia(x);
      d.solicitadaEm = U.parseDate(d.solicitadaEm) || U.hoje();
      d.decididaEm = U.parseDate(d.decididaEm);
      d.prazoLimite = U.parseDate(d.prazoLimite);
      d.restrito = !!d.restrito;
      return d;
    });
    out.mudancas = (out.mudancas || []).map(function (x) {
      const c = model.mudancaVazia(x);
      c.impactoCusto = U.num(c.impactoCusto, 0);
      c.impactoDias = U.num(c.impactoDias, 0);
      c.solicitadaEm = U.parseDate(c.solicitadaEm) || U.hoje();
      c.decididaEm = U.parseDate(c.decididaEm);
      return c;
    });
    out.beneficios = (out.beneficios || []).map(function (x) {
      const bn = model.beneficioVazio(x);
      bn.valorEsperado = U.num(bn.valorEsperado, 0);
      bn.valorRealizado = U.num(bn.valorRealizado, 0);
      bn.prazo = U.parseDate(bn.prazo);
      return bn;
    });
    out.dependencias = (out.dependencias || []).map(function (x) { return model.dependenciaVazia(x); });
    out.alocacoes = (out.alocacoes || []).map(function (x) {
      const a = model.alocacaoVazia(x);
      a.alocacaoPct = U.clamp(U.num(a.alocacaoPct, 0), 0, 200);
      a.de = U.parseDate(a.de);
      a.ate = U.parseDate(a.ate);
      return a;
    });
    out.statusReports = (out.statusReports || []).map(function (x) {
      const s = model.statusReportVazio(x);
      s.reportadoEm = U.parseDate(s.reportadoEm) || U.hoje();
      return s;
    });
    out.anexos = (out.anexos || []).slice();
    out.tags = (out.tags || []).slice();
    out.driverIds = (out.driverIds || []).slice();
    out.prioridade = U.clamp(Math.round(U.num(out.prioridade, 3)), 1, 5);

    if (!model.gatePorId(out.gateAtual)) {
      const est = model.tax('estagios').find(function (e) { return e.id === out.estagio; });
      const doEstagio = est && est.gate ? model.gatePorId(est.gate) : null;
      // com gates configuráveis, 'g0' pode não existir no modelo vigente
      const primeiro = model.primeiroGate();
      out.gateAtual = doEstagio ? doEstagio.id : (primeiro ? primeiro.id : null);
    }

    /* Descarta a bagagem da importação. `_origem`, `_bruto`, `_campos` e
       `_confianca` são andaimes do diff, não dados do projeto — e U.mesclar
       copia toda chave da origem, então sem esta limpeza eles seriam gravados
       dentro do projeto e inflariam o bundle a cada importação. */
    ['_origem', '_bruto', '_campos', '_confianca'].forEach(function (k) { delete out[k]; });

    return out;
  };

  /* ============================================================ validacao */

  model.validar = function (bundle) {
    const erros = [];
    const avisos = [];
    if (!bundle || typeof bundle !== 'object') {
      return { ok: false, erros: [{ msg: 'Bundle ausente ou inválido.' }], avisos: [] };
    }
    const schema = model.versaoSchema(bundle);
    if (schema > model.SCHEMA_VERSION) {
      erros.push({ msg: 'Schema futuro v' + schema + ': abra em uma versão compatível. Escrita bloqueada.' });
    } else if (schema < model.SCHEMA_VERSION) {
      avisos.push({ msg: 'Schema legado v' + schema + ': será migrado explicitamente para v' + model.SCHEMA_VERSION + '.' });
    }
    const projetos = bundle.projetos || [];
    const pessoasIdx = U.indexarPor(bundle.pessoas || [], 'id');
    const progIdx = U.indexarPor(bundle.programas || [], 'id');
    const projIdx = U.indexarPor(projetos, 'id');
    const codigos = {};

    projetos.forEach(function (p) {
      const ref = p.codigo || p.id;
      if (!p.nome) { erros.push({ projetoId: p.id, msg: 'Projeto ' + ref + ' sem nome.' }); }
      if (!p.codigo) { avisos.push({ projetoId: p.id, msg: 'Projeto "' + (p.nome || p.id) + '" sem código de negócio.' }); }
      if (p.codigo) {
        if (codigos[p.codigo]) {
          erros.push({ projetoId: p.id, msg: 'Código duplicado: ' + p.codigo + '.' });
        }
        codigos[p.codigo] = true;
      }
      if (p.programaId && !progIdx[p.programaId]) {
        avisos.push({ projetoId: p.id, msg: ref + ': programa "' + p.programaId + '" não existe.' });
      }
      if (p.pmId && !pessoasIdx[p.pmId]) {
        avisos.push({ projetoId: p.id, msg: ref + ': gerente "' + p.pmId + '" não existe no cadastro.' });
      }
      if (p.sponsorId && !pessoasIdx[p.sponsorId]) {
        avisos.push({ projetoId: p.id, msg: ref + ': sponsor "' + p.sponsorId + '" não existe no cadastro.' });
      }
      const d = p.dates || {};
      if (d.baselineInicio && d.baselineFim && d.baselineFim < d.baselineInicio) {
        erros.push({ projetoId: p.id, msg: ref + ': fim da baseline anterior ao início.' });
      }
      if (d.previstoInicio && d.previstoFim && d.previstoFim < d.previstoInicio) {
        erros.push({ projetoId: p.id, msg: ref + ': fim previsto anterior ao início previsto.' });
      }
      if (!d.baselineFim && model.estagioAtivo(p.estagio)) {
        avisos.push({ projetoId: p.id, msg: ref + ': projeto ativo sem data de término.' });
      }
      const bac = model.bac(p);
      if (bac <= 0 && model.estagioAtivo(p.estagio)) {
        avisos.push({ projetoId: p.id, msg: ref + ': projeto ativo sem orçamento (BAC = 0).' });
      }
      if ((p.finance || {}).custoReal > bac * 1.5 && bac > 0) {
        avisos.push({ projetoId: p.id, msg: ref + ': custo real acima de 150% do BAC — confirmar dado.' });
      }
      if (model.ordemGate(p.gateAtual) < 2 && (p.finance || {}).custoReal > 0) {
        avisos.push({ projetoId: p.id, msg: ref + ': há custo realizado antes da aprovação de baseline (G2).' });
      }
      (p.dependencias || []).forEach(function (dep) {
        if (dep.projetoDestinoId && !projIdx[dep.projetoDestinoId]) {
          avisos.push({ projetoId: p.id, msg: ref + ': dependência aponta para projeto inexistente.' });
        }
        if (dep.projetoDestinoId === p.id) {
          erros.push({ projetoId: p.id, msg: ref + ': dependência circular consigo mesmo.' });
        }
      });
      (p.riscos || []).forEach(function (r) {
        if (r.donoId && !pessoasIdx[r.donoId]) {
          avisos.push({ projetoId: p.id, msg: ref + ': risco "' + U.truncar(r.titulo, 30) + '" com dono inexistente.' });
        }
        if (!model.riscoEncerrado(r) && !r.donoId) {
          avisos.push({ projetoId: p.id, msg: ref + ': risco aberto sem dono designado.' });
        }
      });
      (p.alocacoes || []).forEach(function (a) {
        if (a.pessoaId && !pessoasIdx[a.pessoaId]) {
          avisos.push({ projetoId: p.id, msg: ref + ': alocação de pessoa inexistente.' });
        }
      });
    });

    // ciclos de dependencia entre projetos
    const ciclos = model.detectarCiclos(projetos);
    ciclos.forEach(function (c) {
      erros.push({ msg: 'Ciclo de dependência entre projetos: ' + c.join(' → ') + '.' });
    });

    return { ok: erros.length === 0, erros: erros, avisos: avisos };
  };

  /** Detecta ciclos no grafo de dependencias entre projetos (DFS). */
  model.detectarCiclos = function (projetos) {
    const adj = {};
    (projetos || []).forEach(function (p) {
      adj[p.id] = (p.dependencias || [])
        .map(function (d) { return d.projetoDestinoId; })
        .filter(function (x) { return x; });
    });
    const cor = {};
    const pilha = [];
    const ciclos = [];
    const nomes = {};
    (projetos || []).forEach(function (p) { nomes[p.id] = p.codigo || p.nome || p.id; });

    function dfs(n) {
      cor[n] = 1;
      pilha.push(n);
      (adj[n] || []).forEach(function (m) {
        if (!adj[m]) { return; }
        if (cor[m] === 1) {
          const i = pilha.indexOf(m);
          ciclos.push(pilha.slice(i).concat([m]).map(function (x) { return nomes[x] || x; }));
        } else if (!cor[m]) { dfs(m); }
      });
      pilha.pop();
      cor[n] = 2;
    }
    Object.keys(adj).forEach(function (n) { if (!cor[n]) { dfs(n); } });
    return ciclos;
  };

  /* ================================================================== EVM */

  model.bac = function (projeto) {
    const f = (projeto || {}).finance || {};
    const cb = U.num(f.custoBaseline, 0);
    if (cb > 0) { return cb; }
    return U.num(f.orcamentoCapex, 0) + U.num(f.orcamentoOpex, 0);
  };

  /**
   * Percentual planejado na data de status.
   * Preferencia: curva planejada -> proporcao de calendario da baseline.
   */
  model.pctPlanejado = function (projeto, dataStatus) {
    const p = projeto || {};
    if (p.progress && U.ehNum(p.progress.pctPlanejado)) { return p.progress.pctPlanejado; }

    const dd = U.parseDate(dataStatus) || U.parseDate((p.dates || {}).dataStatus) || U.hoje();
    const f = p.finance || {};
    const bac = model.bac(p);

    if (f.curvaPlanejada && f.curvaPlanejada.length && bac > 0) {
      const lim = U.periodoDe(dd);
      let acum = 0;
      f.curvaPlanejada.forEach(function (x) { if (x.periodo <= lim) { acum += x.pv; } });
      return U.clamp(U.safeDiv(acum, bac) * 100, 0, 100);
    }

    const d = p.dates || {};
    const ini = d.baselineInicio, fim = d.baselineFim;
    if (!ini || !fim) { return 0; }
    if (dd <= ini) { return 0; }
    if (dd >= fim) { return 100; }
    const total = U.diffDays(ini, fim);
    const corrido = U.diffDays(ini, dd);
    return U.clamp(U.safeDiv(corrido, total) * 100, 0, 100);
  };

  /**
   * EVM completo. Nunca lanca, nunca devolve NaN.
   * Retorno: { BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI,
   *            pctPlanejado, pctFisico, desvioDias, desvioCustoPct, dataStatus,
   *            temDados }
   */
  model.evm = function (projeto, dataStatus) {
    const p = projeto || {};
    const d = p.dates || {};
    const f = p.finance || {};
    const dd = U.parseDate(dataStatus) || U.parseDate(d.dataStatus) || U.hoje();

    const BAC = model.bac(p);
    const pctFis = U.clamp(U.num((p.progress || {}).pctFisico, 0), 0, 100);
    const pctPl = model.pctPlanejado(p, dd);

    const PV = U.arredondar(BAC * pctPl / 100, 2);
    const EV = U.arredondar(BAC * pctFis / 100, 2);
    const AC = U.num(f.custoReal, 0);

    const SV = U.arredondar(EV - PV, 2);
    const CV = U.arredondar(EV - AC, 2);

    // Sem PV/AC nao ha indice: devolve null em vez de fingir 1,00.
    const SPI = PV > 0 ? U.arredondar(EV / PV, 4) : null;
    const CPI = AC > 0 ? U.arredondar(EV / AC, 4) : null;

    // Significancia: no inicio do ciclo os indices sao ruido, nao sinal.
    const sig = model.LIMIARES_PADRAO.evmSignificancia;
    const spiSignificativo = SPI !== null && BAC > 0 && pctPl >= sig.pctPlanejadoMinimo;
    const cpiSignificativo = CPI !== null && BAC > 0 &&
      AC >= BAC * sig.acPctBacMinimo / 100 &&
      EV >= BAC * sig.evPctBacMinimo / 100;

    let EAC;
    let metodoEac;
    if (U.ehNum(f.eacManual) && f.eacManual > 0) {
      EAC = f.eacManual;
      metodoEac = 'manual';
    } else if (cpiSignificativo && CPI > 0) {
      // desempenho de custo ja e representativo: extrapola pelo CPI
      EAC = U.arredondar(U.safeDiv(BAC, CPI, BAC), 2);
      metodoEac = 'cpi';
    } else if (AC > 0) {
      // cedo demais para extrapolar: assume o restante ao ritmo planejado
      EAC = U.arredondar(Math.max(BAC, AC + Math.max(0, BAC - EV)), 2);
      metodoEac = 'restante-no-plano';
    } else {
      EAC = BAC;
      metodoEac = 'baseline';
    }
    const ETC = U.arredondar(Math.max(0, EAC - AC), 2);
    const VAC = U.arredondar(BAC - EAC, 2);
    const TCPI = (BAC - AC) !== 0 ? U.arredondar(U.safeDiv(BAC - EV, BAC - AC, 0), 4) : null;

    const desvioDias = U.diffDays(d.baselineFim, d.previstoFim);
    const desvioCustoPct = BAC > 0 ? U.arredondar(U.safeDiv(EAC - BAC, BAC) * 100, 2) : 0;

    return {
      BAC: BAC, PV: PV, EV: EV, AC: AC, SV: SV, CV: CV,
      SPI: SPI, CPI: CPI, EAC: EAC, ETC: ETC, VAC: VAC, TCPI: TCPI,
      comprometido: U.num(f.comprometido, 0),
      pctPlanejado: U.arredondar(pctPl, 1),
      pctFisico: U.arredondar(pctFis, 1),
      desvioDias: desvioDias,
      desvioCustoPct: desvioCustoPct,
      dataStatus: dd,
      temDados: BAC > 0,
      spiSignificativo: spiSignificativo,
      cpiSignificativo: cpiSignificativo,
      metodoEac: metodoEac
    };
  };

  /* ========================================================= risco / issue */

  model.scoreRisco = function (r) {
    if (!r) { return 0; }
    return U.clamp(Math.round(U.num(r.probabilidade, 0)), 0, 5) *
           U.clamp(Math.round(U.num(r.impacto, 0)), 0, 5);
  };

  model.nivelRisco = function (score) {
    if (score >= 20) { return { id: 'critico', rotulo: 'Crítico', token: 'critico' }; }
    if (score >= 12) { return { id: 'alto', rotulo: 'Alto', token: 'serio' }; }
    if (score >= 6) { return { id: 'moderado', rotulo: 'Moderado', token: 'aviso' }; }
    return { id: 'baixo', rotulo: 'Baixo', token: 'neutro' };
  };

  model.riscoEncerrado = function (r) {
    const lista = model.tax('statusRisco');
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].id === (r || {}).status) { return !!lista[i].encerrado; }
    }
    return false;
  };

  model.issueEncerrada = function (i) {
    const lista = model.tax('statusIssue');
    for (let k = 0; k < lista.length; k++) {
      if (lista[k].id === (i || {}).status) { return !!lista[k].encerrado; }
    }
    return false;
  };

  model.riscosAbertos = function (projeto) {
    return ((projeto || {}).riscos || []).filter(function (r) { return !model.riscoEncerrado(r); });
  };

  model.issuesAbertas = function (projeto) {
    return ((projeto || {}).issues || []).filter(function (i) { return !model.issueEncerrada(i); });
  };

  /** Exposicao financeira ponderada dos riscos abertos. */
  model.exposicaoRisco = function (projeto) {
    return U.arredondar(U.sum(model.riscosAbertos(projeto), function (r) {
      return (model.scoreRisco(r) / 25) * U.num(r.exposicaoCusto, 0);
    }), 2);
  };

  /** Impacto de prazo ponderado dos riscos abertos, em dias. */
  model.exposicaoPrazo = function (projeto) {
    return U.arredondar(U.sum(model.riscosAbertos(projeto), function (r) {
      return (model.scoreRisco(r) / 25) * U.num(r.impactoDias, 0);
    }), 1);
  };

  model.aging = function (dataAbertura, ref) {
    const d = U.diffDays(dataAbertura, U.parseDate(ref) || U.hoje());
    return d === null ? null : Math.max(0, d);
  };

  /* ============================================================ gates */

  /** Gate corrente + proximo gate previsto + atraso do proximo. */
  model.resumoGate = function (projeto, dataStatus) {
    const p = projeto || {};
    const dd = U.parseDate(dataStatus) || U.hoje();
    const registros = (p.gates || []).slice().sort(function (a, b) {
      return model.ordemGate(a.gateId) - model.ordemGate(b.gateId);
    });
    let ultimoAprovado = null;
    let proximo = null;
    registros.forEach(function (g) {
      const aprovado = g.decisao === 'aprovado' || g.decisao === 'condicional';
      if (aprovado && g.realData) { ultimoAprovado = g; }
      else if (!proximo && g.decisao === 'pendente') { proximo = g; }
    });
    let atrasoDias = null;
    if (proximo && proximo.previstoData) {
      const dif = U.diffDays(proximo.previstoData, dd);
      atrasoDias = dif !== null && dif > 0 ? dif : 0;
    }
    const gateAtualDef = model.gatePorId(p.gateAtual);
    return {
      gateAtual: gateAtualDef,
      ultimoAprovado: ultimoAprovado,
      proximo: proximo,
      proximoDef: proximo ? model.gatePorId(proximo.gateId) : null,
      atrasoDias: atrasoDias,
      totalAprovados: registros.filter(function (g) {
        return g.realData && (g.decisao === 'aprovado' || g.decisao === 'condicional');
      }).length,
      registros: registros
    };
  };

  /* ============================================================== saude */

  function faixa(valor, limiar, invertido) {
    // invertido = valores MAIORES sao piores (ex.: desvio de dias)
    if (!U.ehNum(valor) || !limiar) { return null; }
    if (invertido) {
      if (valor >= limiar.vermelho) { return 'vermelho'; }
      if (valor >= limiar.ambar) { return 'ambar'; }
      return 'verde';
    }
    if (valor <= limiar.vermelho) { return 'vermelho'; }
    if (valor <= limiar.ambar) { return 'ambar'; }
    return 'verde';
  }

  const PESO_RAG = { verde: 0, ambar: 1, vermelho: 2 };

  /**
   * Saude do projeto: RAG calculado a partir de sinais objetivos, com os
   * motivos explicitos (rastreabilidade para o comite).
   * Retorno: { rag, ragCalculado, manual, score, motivos:[{sinal,rag,texto}] }
   */
  model.saudeProjeto = function (projeto, limiares, dataStatus) {
    const p = projeto || {};
    const L = U.mesclar(U.clonar(model.LIMIARES_PADRAO), limiares || {});
    const dd = U.parseDate(dataStatus) || U.hoje();
    const motivos = [];

    // Estados terminais nao entram no calculo de desempenho.
    if (p.estagio === 'encerrado') {
      return { rag: 'azul', ragCalculado: 'azul', manual: false, score: 100,
        motivos: [{ sinal: 'estagio', rag: 'azul', texto: 'Projeto encerrado.' }] };
    }
    if (p.estagio === 'cancelado') {
      return { rag: 'cinza', ragCalculado: 'cinza', manual: false, score: 0,
        motivos: [{ sinal: 'estagio', rag: 'cinza', texto: 'Projeto cancelado.' }] };
    }
    if (p.estagio === 'suspenso') {
      return { rag: 'cinza', ragCalculado: 'cinza', manual: false, score: 50,
        motivos: [{ sinal: 'estagio', rag: 'cinza', texto: 'Projeto suspenso (hold).' }] };
    }
    if (p.estagio === 'ideacao') {
      return { rag: 'cinza', ragCalculado: 'cinza', manual: false, score: 50,
        motivos: [{ sinal: 'estagio', rag: 'cinza', texto: 'Em ideação — sem baseline para medir.' }] };
    }

    const e = model.evm(p, dd);
    let pior = 'verde';
    function registrar(sinal, rag, texto) {
      if (!rag) { return; }
      motivos.push({ sinal: sinal, rag: rag, texto: texto });
      if (PESO_RAG[rag] > PESO_RAG[pior]) { pior = rag; }
    }

    // Indices so entram no farol quando ja sao representativos (ver
    // LIMIARES_PADRAO.evmSignificancia). Antes disso viram nota informativa.
    if (e.SPI !== null && e.spiSignificativo) {
      const r = faixa(e.SPI, L.spi, false);
      if (r !== 'verde') { registrar('spi', r, 'SPI ' + U.fmtRazao(e.SPI) + ' abaixo do limiar.'); }
    } else if (e.SPI !== null) {
      motivos.push({ sinal: 'spi', rag: 'verde',
        texto: 'SPI ' + U.fmtRazao(e.SPI) + ' ainda não é significativo (apenas ' +
          U.fmtPct(e.pctPlanejado, 1) + ' do valor planejado decorrido).' });
    }
    if (e.CPI !== null && e.cpiSignificativo) {
      const r = faixa(e.CPI, L.cpi, false);
      if (r !== 'verde') { registrar('cpi', r, 'CPI ' + U.fmtRazao(e.CPI) + ' abaixo do limiar.'); }
    } else if (e.CPI !== null) {
      motivos.push({ sinal: 'cpi', rag: 'verde',
        texto: 'CPI ' + U.fmtRazao(e.CPI) + ' ainda não é significativo (custo incorrido de apenas ' +
          U.fmtPct(U.safeDiv(e.AC, e.BAC) * 100, 1) + ' do BAC).' });
    }
    if (U.ehNum(e.desvioDias) && e.desvioDias > 0) {
      const r = faixa(e.desvioDias, L.desvioDias, true);
      if (r !== 'verde') {
        registrar('prazo', r, 'Término previsto ' + e.desvioDias + ' dias após a baseline.');
      }
    }
    // Estouro projetado só conta quando o EAC vem de desempenho real medido.
    if (e.desvioCustoPct > 0 && (e.metodoEac === 'cpi' || e.metodoEac === 'manual')) {
      const r = faixa(e.desvioCustoPct, L.estouroCustoPct, true);
      if (r !== 'verde') {
        registrar('custo', r, 'EAC projeta estouro de ' + U.fmtPct(e.desvioCustoPct, 1) + ' sobre o BAC' +
          (e.metodoEac === 'manual' ? ' (EAC informado manualmente).' : ' com base no CPI medido.'));
      }
    }
    const riscosAltos = model.riscosAbertos(p).filter(function (rr) {
      return model.scoreRisco(rr) >= L.scoreRiscoAlto;
    }).length;
    if (riscosAltos > 0) {
      const r = faixa(riscosAltos, L.riscosAltosAbertos, true);
      if (r !== 'verde') {
        registrar('risco', r, riscosAltos + ' ' + U.pluralizar(riscosAltos, 'risco alto aberto', 'riscos altos abertos') + '.');
      }
    }
    const issuesCrit = model.issuesAbertas(p).filter(function (ii) { return ii.severidade >= 4; }).length;
    if (issuesCrit > 0) {
      const r = faixa(issuesCrit, L.issuesCriticasAbertas, true);
      if (r !== 'verde') {
        registrar('issue', r, issuesCrit + ' ' + U.pluralizar(issuesCrit, 'issue crítica aberta', 'issues críticas abertas') + '.');
      }
    }
    const rg = model.resumoGate(p, dd);
    if (rg.atrasoDias && rg.atrasoDias > 0) {
      const r = faixa(rg.atrasoDias, L.gateAtrasadoDias, true);
      if (r !== 'verde') {
        const nomeGate = rg.proximoDef ? rg.proximoDef.codigo : 'próximo gate';
        registrar('gate', r, 'Gate ' + nomeGate + ' atrasado em ' + rg.atrasoDias + ' dias.');
      }
    }
    const ultimoSr = (p.statusReports || []).slice().sort(function (a, b) {
      return String(b.reportadoEm).localeCompare(String(a.reportadoEm));
    })[0];
    const atrasoSr = ultimoSr ? U.diffDays(ultimoSr.reportadoEm, dd) : null;
    if (atrasoSr !== null) {
      const r = faixa(atrasoSr, L.statusReportAtrasoDias, true);
      if (r !== 'verde') {
        registrar('reporte', r, 'Último status report há ' + atrasoSr + ' dias.');
      }
    } else if (model.estagioAtivo(p.estagio)) {
      registrar('reporte', 'ambar', 'Nenhum status report registrado.');
    }

    if (!motivos.length) {
      motivos.push({ sinal: 'geral', rag: 'verde', texto: 'Todos os indicadores dentro dos limiares.' });
    }

    // score 0..100: penaliza por sinal, ponderado pela gravidade
    let penal = 0;
    motivos.forEach(function (m) {
      if (m.rag === 'vermelho') { penal += 22; }
      else if (m.rag === 'ambar') { penal += 9; }
    });
    const score = U.clamp(100 - penal, 0, 100);

    const manual = !!p.ragManual && p.ragManual !== pior;
    return {
      rag: p.ragManual || pior,
      ragCalculado: pior,
      manual: manual,
      score: score,
      motivos: motivos
    };
  };

  /* ================================================== curva S / cronograma */

  /** Distribuicao acumulada em S (smoothstep): 0 -> 0, 1 -> 1. */
  function sCurva(t) {
    const x = U.clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  /**
   * Curva S de um projeto (ou agregada de vários).
   * Retorno: [{ periodo, pv, ev, ac, pvAcum, evAcum, acAcum, futuro }]
   * PV/EV/AC vem das curvas armazenadas quando existirem; senao sao
   * sintetizados a partir de BAC, datas e percentuais.
   */
  model.curvaS = function (entrada, dataStatus) {
    const projetos = Array.isArray(entrada) ? entrada : [entrada];
    const dd = U.parseDate(dataStatus) || U.hoje();
    const acumPeriodo = {};
    let pIni = null, pFim = null;

    projetos.forEach(function (p) {
      if (!p) { return; }
      const d = p.dates || {};
      const ini = d.baselineInicio || d.previstoInicio;
      const fim = d.previstoFim || d.baselineFim;
      if (!ini || !fim) { return; }
      const pi = U.periodoDe(ini), pf = U.periodoDe(fim);
      if (!pIni || pi < pIni) { pIni = pi; }
      if (!pFim || pf > pFim) { pFim = pf; }
    });
    if (!pIni || !pFim) { return []; }

    const periodos = U.periodosEntre(pIni + '-01', pFim + '-01');
    if (!periodos.length) { return []; }
    periodos.forEach(function (pe) { acumPeriodo[pe] = { pv: 0, ev: 0, ac: 0 }; });

    projetos.forEach(function (p) {
      if (!p) { return; }
      const d = p.dates || {};
      const f = p.finance || {};
      const BAC = model.bac(p);
      const ini = d.baselineInicio || d.previstoInicio;
      const fim = d.previstoFim || d.baselineFim;
      if (!ini || !fim || BAC <= 0) { return; }
      const meus = U.periodosEntre(ini, fim);
      if (!meus.length) { return; }

      // ---- PV
      if (f.curvaPlanejada && f.curvaPlanejada.length) {
        f.curvaPlanejada.forEach(function (x) {
          if (acumPeriodo[x.periodo]) { acumPeriodo[x.periodo].pv += x.pv; }
        });
      } else {
        let ant = 0;
        meus.forEach(function (pe, i) {
          const frac = sCurva((i + 1) / meus.length);
          const inc = BAC * (frac - ant);
          ant = frac;
          if (acumPeriodo[pe]) { acumPeriodo[pe].pv += inc; }
        });
      }

      // ---- EV / AC
      if (f.curvaReal && f.curvaReal.length) {
        f.curvaReal.forEach(function (x) {
          if (acumPeriodo[x.periodo]) {
            acumPeriodo[x.periodo].ev += x.ev;
            acumPeriodo[x.periodo].ac += x.ac;
          }
        });
      } else {
        const evTotal = BAC * U.clamp(U.num((p.progress || {}).pctFisico, 0), 0, 100) / 100;
        const acTotal = U.num(f.custoReal, 0);
        const decorridos = meus.filter(function (pe) { return pe <= U.periodoDe(dd); });
        const n = decorridos.length || 1;
        let ant = 0;
        decorridos.forEach(function (pe, i) {
          const frac = sCurva((i + 1) / n);
          const fEv = evTotal * (frac - ant);
          const fAc = acTotal * (frac - ant);
          ant = frac;
          if (acumPeriodo[pe]) { acumPeriodo[pe].ev += fEv; acumPeriodo[pe].ac += fAc; }
        });
      }
    });

    const ddPer = U.periodoDe(dd);
    let pvA = 0, evA = 0, acA = 0;
    return periodos.map(function (pe) {
      const x = acumPeriodo[pe];
      pvA += x.pv; evA += x.ev; acA += x.ac;
      const futuro = pe > ddPer;
      return {
        periodo: pe,
        pv: U.arredondar(x.pv, 2),
        ev: futuro ? null : U.arredondar(x.ev, 2),
        ac: futuro ? null : U.arredondar(x.ac, 2),
        pvAcum: U.arredondar(pvA, 2),
        evAcum: futuro ? null : U.arredondar(evA, 2),
        acAcum: futuro ? null : U.arredondar(acA, 2),
        futuro: futuro
      };
    });
  };

  /* ========================================================== capacidade */

  /**
   * Alocacao por pessoa e mes.
   * Retorno: { pessoas:[{pessoaId,nome,meses:[{periodo,alocPct,horas,projetos:[],over}]}],
   *            periodos:[...] }
   */
  model.capacidade = function (bundle, opts) {
    const o = opts || {};
    const b = bundle || {};
    const L = U.mesclar(U.clonar(model.LIMIARES_PADRAO), (b.settings || {}).limiares || {});
    const pessoas = (b.pessoas || []).filter(function (p) { return p.ativo !== false; });
    const projetos = (b.projetos || []).filter(function (p) {
      return o.incluirInativos ? true : model.estagioAtivo(p.estagio);
    });

    const dd = U.parseDate(o.de) || U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const inicio = U.periodoDe(dd);
    const meses = o.meses === undefined ? 12 : o.meses;
    const periodos = [];
    let cur = inicio + '-01';
    for (let i = 0; i < meses; i++) {
      periodos.push(U.periodoDe(cur));
      cur = U.addMeses(cur, 1);
    }

    const mapa = {};
    pessoas.forEach(function (p) {
      mapa[p.id] = { pessoaId: p.id, nome: p.nome, papel: p.papel,
        capacidadeHorasMes: U.num(p.capacidadeHorasMes, 160), meses: {} };
      periodos.forEach(function (pe) {
        mapa[p.id].meses[pe] = { periodo: pe, alocPct: 0, horas: 0, projetos: [] };
      });
    });

    projetos.forEach(function (proj) {
      (proj.alocacoes || []).forEach(function (a) {
        const alvo = mapa[a.pessoaId];
        if (!alvo) { return; }
        const de = a.de || (proj.dates || {}).previstoInicio;
        const ate = a.ate || (proj.dates || {}).previstoFim;
        if (!de || !ate) { return; }
        periodos.forEach(function (pe) {
          const pIni = pe + '-01';
          const pFim = U.addDays(U.addMeses(pIni, 1), -1);
          if (!U.sobrepoe(de, ate, pIni, pFim)) { return; }
          const m = alvo.meses[pe];
          m.alocPct += U.num(a.alocacaoPct, 0);
          m.horas += alvo.capacidadeHorasMes * U.num(a.alocacaoPct, 0) / 100;
          m.projetos.push({ id: proj.id, codigo: proj.codigo, nome: proj.nome,
            pct: U.num(a.alocacaoPct, 0), papel: a.papel });
        });
      });
    });

    const saida = Object.keys(mapa).map(function (k) {
      const p = mapa[k];
      const lista = periodos.map(function (pe) {
        const m = p.meses[pe];
        return {
          periodo: pe,
          alocPct: U.arredondar(m.alocPct, 1),
          horas: U.arredondar(m.horas, 1),
          projetos: m.projetos,
          over: m.alocPct > L.alocacaoPessoaPct.ambar,
          critico: m.alocPct >= L.alocacaoPessoaPct.vermelho
        };
      });
      return {
        pessoaId: p.pessoaId, nome: p.nome, papel: p.papel,
        capacidadeHorasMes: p.capacidadeHorasMes,
        meses: lista,
        mediaPct: U.arredondar(U.media(lista, function (x) { return x.alocPct; }), 1),
        picoPct: U.arredondar(U.max(lista, function (x) { return x.alocPct; }) || 0, 1),
        mesesEmOver: lista.filter(function (x) { return x.over; }).length
      };
    });

    return { pessoas: U.sortBy(saida, function (x) { return x.picoPct; }, 'desc'), periodos: periodos };
  };

  /* ========================================================= priorizacao */

  /**
   * Pontua valor x esforco para o grafico de bolhas e a matriz de priorizacao.
   * Escalas normalizadas 0..100 dentro do conjunto informado.
   */
  model.priorizar = function (projetos, pesos) {
    const W = U.mesclar(U.clonar(model.PESOS_PRIORIZACAO_PADRAO), pesos || {});
    const lista = (projetos || []).slice();
    if (!lista.length) { return []; }

    const benef = lista.map(function (p) { return model.beneficioLiquido(p); });
    const custos = lista.map(function (p) { return model.bac(p); });
    const maxBen = U.max(benef) || 1;
    const maxCusto = U.max(custos) || 1;

    const bruto = lista.map(function (p, i) {
      const e = model.evm(p);
      const exposicao = model.exposicaoRisco(p);
      const durDias = U.diffDays((p.dates || {}).previstoInicio, (p.dates || {}).previstoFim) || 0;

      const vEstrategico = U.ehNum(p.scoreValor)
        ? U.clamp(p.scoreValor, 0, 100)
        : (6 - U.clamp(U.num(p.prioridade, 3), 1, 5)) * 20;
      const vBeneficio = U.clamp(U.safeDiv(benef[i], maxBen) * 100, 0, 100);
      const vUrgencia = U.clamp(100 - U.safeDiv(durDias, 900) * 100, 0, 100);
      const vObrigatorio = p.obrigatorio || p.tipo === 'compliance' ? 100 : 0;

      const cComplexidade = U.ehNum(p.scoreComplexidade)
        ? U.clamp(p.scoreComplexidade, 0, 100)
        : (p.categoria === 'transform' ? 80 : (p.categoria === 'grow' ? 50 : 30));
      const cCusto = U.clamp(U.safeDiv(custos[i], maxCusto) * 100, 0, 100);
      const cRisco = U.clamp(U.safeDiv(exposicao, Math.max(1, model.bac(p))) * 100 * 2, 0, 100);

      const scoreValor = U.safeDiv(
        vEstrategico * W.valorEstrategico + vBeneficio * W.beneficioFinanceiro +
        vUrgencia * W.urgencia + vObrigatorio * W.obrigatoriedade,
        W.valorEstrategico + W.beneficioFinanceiro + W.urgencia + W.obrigatoriedade);

      const scoreEsforco = U.safeDiv(
        cComplexidade * W.complexidade + cCusto * W.custo + cRisco * W.risco,
        W.complexidade + W.custo + W.risco);

      return {
        projeto: p,
        scoreValor: U.arredondar(scoreValor, 1),
        scoreEsforco: U.arredondar(scoreEsforco, 1),
        indiceValorEsforco: U.arredondar(U.safeDiv(scoreValor, Math.max(1, scoreEsforco)), 2),
        beneficioLiquido: benef[i],
        bac: custos[i],
        exposicaoRisco: exposicao,
        evm: e
      };
    });

    const ordenado = U.sortBy(bruto, function (x) { return x.indiceValorEsforco; }, 'desc');
    ordenado.forEach(function (x, i) { x.ranking = i + 1; });
    return ordenado;
  };

  model.beneficioLiquido = function (projeto) {
    const bs = (projeto || {}).beneficios || [];
    const financeiros = model.tax('tiposBeneficio')
      .filter(function (t) { return t.financeiro; }).map(function (t) { return t.id; });
    return U.arredondar(U.sum(bs, function (b) {
      return financeiros.indexOf(b.tipo) >= 0 ? U.num(b.valorEsperado, 0) : 0;
    }), 2);
  };

  model.beneficioRealizado = function (projeto) {
    return U.arredondar(U.sum((projeto || {}).beneficios || [], function (b) {
      return U.num(b.valorRealizado, 0);
    }), 2);
  };

  /* ====================================================== KPIs do portfolio */

  /**
   * Indicadores agregados do portfolio. Recebe a lista de projetos JA filtrada.
   * Nunca lanca com lista vazia.
   */
  model.kpisPortfolio = function (projetos, opts) {
    const o = opts || {};
    const L = U.mesclar(U.clonar(model.LIMIARES_PADRAO), o.limiares || {});
    const dd = U.parseDate(o.dataStatus) || U.hoje();
    const lista = (projetos || []);

    const ativos = lista.filter(function (p) { return model.estagioAtivo(p.estagio); });
    const evms = lista.map(function (p) { return model.evm(p, dd); });
    const saudes = lista.map(function (p) { return model.saudeProjeto(p, L, dd); });

    const somaBac = U.sum(evms, function (e) { return e.BAC; });
    const somaPv = U.sum(evms, function (e) { return e.PV; });
    const somaEv = U.sum(evms, function (e) { return e.EV; });
    const somaAc = U.sum(evms, function (e) { return e.AC; });
    const somaEac = U.sum(evms, function (e) { return e.EAC; });
    const somaComp = U.sum(evms, function (e) { return e.comprometido; });

    const distRag = { verde: 0, ambar: 0, vermelho: 0, azul: 0, cinza: 0 };
    saudes.forEach(function (s) { distRag[s.rag] = (distRag[s.rag] || 0) + 1; });

    const distCategoria = {};
    model.tax('categorias').forEach(function (c) { distCategoria[c.id] = { qtd: 0, bac: 0 }; });
    lista.forEach(function (p, i) {
      const c = distCategoria[p.categoria] || (distCategoria[p.categoria] = { qtd: 0, bac: 0 });
      c.qtd += 1;
      c.bac += evms[i].BAC;
    });

    const distEstagio = {};
    model.tax('estagios').forEach(function (e) { distEstagio[e.id] = 0; });
    lista.forEach(function (p) { distEstagio[p.estagio] = (distEstagio[p.estagio] || 0) + 1; });

    // riscos e issues
    let riscosAbertos = 0, riscosAltos = 0, exposicao = 0;
    let issuesAbertas = 0, issuesCriticas = 0, agingIssues = [];
    let decisoesPendentes = 0, decisoesVencidas = 0;
    let mudancasPendentes = 0, mudancasAprovadasCusto = 0, mudancasAprovadasDias = 0;
    let gatesAtrasados = 0, gatesProximos30 = 0;
    let benefEsperado = 0, benefRealizado = 0;
    let semReporte = 0;

    lista.forEach(function (p) {
      const ra = model.riscosAbertos(p);
      riscosAbertos += ra.length;
      riscosAltos += ra.filter(function (r) { return model.scoreRisco(r) >= L.scoreRiscoAlto; }).length;
      exposicao += model.exposicaoRisco(p);

      const ia = model.issuesAbertas(p);
      issuesAbertas += ia.length;
      issuesCriticas += ia.filter(function (i) { return i.severidade >= 4; }).length;
      ia.forEach(function (i) {
        const a = model.aging(i.abertaEm, dd);
        if (a !== null) { agingIssues.push(a); }
      });

      (p.decisoes || []).forEach(function (d) {
        const def = model.tax('statusDecisao').find(function (s) { return s.id === d.status; });
        if (def && def.pendente) {
          decisoesPendentes += 1;
          if (d.prazoLimite && d.prazoLimite < dd) { decisoesVencidas += 1; }
        }
      });
      (p.mudancas || []).forEach(function (c) {
        const def = model.tax('statusMudanca').find(function (s) { return s.id === c.status; });
        if (def && def.pendente) { mudancasPendentes += 1; }
        if (c.status === 'aprovada') {
          mudancasAprovadasCusto += U.num(c.impactoCusto, 0);
          mudancasAprovadasDias += U.num(c.impactoDias, 0);
        }
      });

      const rg = model.resumoGate(p, dd);
      if (rg.atrasoDias && rg.atrasoDias > 0) { gatesAtrasados += 1; }
      if (rg.proximo && rg.proximo.previstoData) {
        const dif = U.diffDays(dd, rg.proximo.previstoData);
        if (dif !== null && dif >= 0 && dif <= 30) { gatesProximos30 += 1; }
      }

      benefEsperado += U.sum(p.beneficios || [], function (b) { return U.num(b.valorEsperado, 0); });
      benefRealizado += U.sum(p.beneficios || [], function (b) { return U.num(b.valorRealizado, 0); });

      if (model.estagioAtivo(p.estagio) && !(p.statusReports || []).length) { semReporte += 1; }
    });

    // entrega no prazo entre os encerrados
    const encerrados = lista.filter(function (p) { return p.estagio === 'encerrado'; });
    const noPrazo = encerrados.filter(function (p) {
      const d = p.dates || {};
      if (!d.realFim || !d.baselineFim) { return false; }
      return d.realFim <= d.baselineFim;
    }).length;

    // marcos criticos atrasados
    let marcosAtrasados = 0, marcosTotal = 0;
    lista.forEach(function (p) {
      (p.marcos || []).forEach(function (m) {
        marcosTotal += 1;
        const alvo = m.previstoData || m.baselineData;
        if (!m.realData && alvo && alvo < dd) { marcosAtrasados += 1; }
      });
    });

    const spiPort = somaPv > 0 ? U.arredondar(U.safeDiv(somaEv, somaPv), 4) : null;
    const cpiPort = somaAc > 0 ? U.arredondar(U.safeDiv(somaEv, somaAc), 4) : null;

    return {
      dataStatus: dd,
      total: lista.length,
      ativos: ativos.length,
      distRag: distRag,
      distCategoria: distCategoria,
      distEstagio: distEstagio,
      emRisco: distRag.vermelho + distRag.ambar,
      pctVerde: U.arredondar(U.safeDiv(distRag.verde, lista.length) * 100, 1),

      bac: U.arredondar(somaBac, 2),
      pv: U.arredondar(somaPv, 2),
      ev: U.arredondar(somaEv, 2),
      ac: U.arredondar(somaAc, 2),
      eac: U.arredondar(somaEac, 2),
      comprometido: U.arredondar(somaComp, 2),
      vac: U.arredondar(somaBac - somaEac, 2),
      etc: U.arredondar(Math.max(0, somaEac - somaAc), 2),
      spi: spiPort,
      cpi: cpiPort,
      burnPct: U.arredondar(U.safeDiv(somaAc, somaBac) * 100, 1),
      pctFisicoMedio: U.arredondar(U.safeDiv(somaEv, somaBac) * 100, 1),

      riscosAbertos: riscosAbertos,
      riscosAltos: riscosAltos,
      exposicaoRisco: U.arredondar(exposicao, 2),
      exposicaoPctBac: U.arredondar(U.safeDiv(exposicao, somaBac) * 100, 1),
      issuesAbertas: issuesAbertas,
      issuesCriticas: issuesCriticas,
      agingMedioIssues: U.arredondar(U.media(agingIssues), 0),
      agingP90Issues: U.arredondar(U.percentil(agingIssues, 90), 0),

      decisoesPendentes: decisoesPendentes,
      decisoesVencidas: decisoesVencidas,
      mudancasPendentes: mudancasPendentes,
      mudancasAprovadasCusto: U.arredondar(mudancasAprovadasCusto, 2),
      mudancasAprovadasDias: U.arredondar(mudancasAprovadasDias, 0),

      gatesAtrasados: gatesAtrasados,
      gatesProximos30: gatesProximos30,
      marcosAtrasados: marcosAtrasados,
      marcosTotal: marcosTotal,

      beneficioEsperado: U.arredondar(benefEsperado, 2),
      beneficioRealizado: U.arredondar(benefRealizado, 2),
      pctBeneficioRealizado: U.arredondar(U.safeDiv(benefRealizado, benefEsperado) * 100, 1),
      roiEsperado: U.arredondar(U.safeDiv(benefEsperado - somaBac, somaBac) * 100, 1),

      encerrados: encerrados.length,
      entregaNoPrazoPct: encerrados.length
        ? U.arredondar(U.safeDiv(noPrazo, encerrados.length) * 100, 1) : null,
      semReporte: semReporte
    };
  };

  /* ================================================= filtros e ordenacao */

  model.CAMPOS_FILTRO = [
    { id: 'busca', rotulo: 'Busca livre', tipo: 'texto' },
    { id: 'programaId', rotulo: 'Programa', tipo: 'ref', ref: 'programas' },
    { id: 'estagio', rotulo: 'Estágio', tipo: 'taxonomia', colecao: 'estagios' },
    { id: 'categoria', rotulo: 'Categoria', tipo: 'taxonomia', colecao: 'categorias' },
    { id: 'tipo', rotulo: 'Tipo', tipo: 'taxonomia', colecao: 'tipos' },
    { id: 'rag', rotulo: 'RAG', tipo: 'taxonomia', colecao: 'rag' },
    { id: 'gateAtual', rotulo: 'Gate', tipo: 'gate' },
    { id: 'pmId', rotulo: 'Gerente', tipo: 'ref', ref: 'pessoas' },
    { id: 'sponsorId', rotulo: 'Sponsor', tipo: 'ref', ref: 'pessoas' },
    { id: 'buId', rotulo: 'Unidade', tipo: 'bu' },
    { id: 'tags', rotulo: 'Tag', tipo: 'tags' }
  ];

  /**
   * Aplica filtro ao conjunto de projetos.
   * filtro = { busca, programaId:[], estagio:[], categoria:[], tipo:[], rag:[],
   *            gateAtual:[], pmId:[], sponsorId:[], buId:[], tags:[],
   *            somenteAtivos, somenteRisco, de, ate }
   */
  model.filtrar = function (projetos, filtro, ctx) {
    const f = filtro || {};
    const c = ctx || {};
    const L = c.limiares || model.LIMIARES_PADRAO;
    const dd = c.dataStatus || U.hoje();

    function temAlgum(campo, valor) {
      const sel = f[campo];
      if (!sel || !sel.length) { return true; }
      return sel.indexOf(valor) >= 0;
    }

    return (projetos || []).filter(function (p) {
      if (f.somenteAtivos && !model.estagioAtivo(p.estagio)) { return false; }
      if (!temAlgum('programaId', p.programaId)) { return false; }
      if (!temAlgum('estagio', p.estagio)) { return false; }
      if (!temAlgum('categoria', p.categoria)) { return false; }
      if (!temAlgum('tipo', p.tipo)) { return false; }
      if (!temAlgum('gateAtual', p.gateAtual)) { return false; }
      if (!temAlgum('pmId', p.pmId)) { return false; }
      if (!temAlgum('sponsorId', p.sponsorId)) { return false; }
      if (!temAlgum('buId', p.buId)) { return false; }

      if (f.rag && f.rag.length) {
        const s = model.saudeProjeto(p, L, dd);
        if (f.rag.indexOf(s.rag) < 0) { return false; }
      }
      if (f.somenteRisco) {
        const s = model.saudeProjeto(p, L, dd);
        if (s.rag !== 'vermelho' && s.rag !== 'ambar') { return false; }
      }
      if (f.tags && f.tags.length) {
        const tags = p.tags || [];
        if (!f.tags.some(function (t) { return tags.indexOf(t) >= 0; })) { return false; }
      }
      if (f.de || f.ate) {
        const ini = (p.dates || {}).previstoInicio;
        const fim = (p.dates || {}).previstoFim;
        if (!U.sobrepoe(ini, fim, f.de || '0000-01-01', f.ate || '9999-12-31')) { return false; }
      }
      if (f.busca) {
        const alvo = [p.codigo, p.nome, p.descricao, p.objetivo, (p.tags || []).join(' ')].join(' ');
        if (!U.contemTexto(alvo, f.busca)) { return false; }
      }
      return true;
    });
  };

  /* ============================================================ auxiliares */

  model.rotuloRag = function (rag) { return model.rotulo('rag', rag); };

  model.ICONES_RAG = {
    verde: 'M20 6 9 17l-5-5',
    ambar: 'M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z|M12 9v4|M12 17h.01',
    vermelho: 'circle:12,12,9|M12 7v6|M12 16.5v.5',
    azul: 'circle:12,12,9|M8.5 12.5l2.5 2.5 4.5-5',
    cinza: 'M10 8v8|M14 8v8|circle:12,12,9'
  };

  model.nomePessoa = function (bundle, id) {
    if (!id) { return '—'; }
    const p = ((bundle || {}).pessoas || []).find(function (x) { return x.id === id; });
    return p ? p.nome : String(id);
  };

  model.nomePrograma = function (bundle, id) {
    if (!id) { return 'Sem programa'; }
    const p = ((bundle || {}).programas || []).find(function (x) { return x.id === id; });
    return p ? p.nome : String(id);
  };

  model.nomeBu = function (bundle, id) {
    if (!id) { return '—'; }
    const lista = ((bundle || {}).settings || {}).unidadesNegocio || [];
    const b = lista.find(function (x) { return x.id === id; });
    return b ? b.nome : String(id);
  };

  model.nomeDriver = function (bundle, id) {
    const lista = ((bundle || {}).settings || {}).drivers || model.TAXONOMIA.driversPadrao;
    const d = lista.find(function (x) { return x.id === id; });
    return d ? d.rotulo : String(id);
  };

  model.projetoPorId = function (bundle, id) {
    return ((bundle || {}).projetos || []).find(function (p) { return p.id === id; }) || null;
  };

  model.projetoPorCodigo = function (bundle, codigo) {
    const cod = U.normalizar(codigo);
    if (!cod) { return null; }
    return ((bundle || {}).projetos || []).find(function (p) {
      return U.normalizar(p.codigo) === cod;
    }) || null;
  };

  /** Proximo codigo sequencial disponivel para um prefixo (ex.: 'PRJ-'). */
  model.proximoCodigo = function (bundle, prefixo) {
    const pre = prefixo || 'PRJ-';
    let maior = 0;
    ((bundle || {}).projetos || []).forEach(function (p) {
      const m = new RegExp('^' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$').exec(p.codigo || '');
      if (m) { maior = Math.max(maior, +m[1]); }
    });
    return pre + String(maior + 1).padStart(4, '0');
  };

  /** Contagem de itens que exigem atencao do PMO Lead — alimenta a caixa de entrada. */
  model.alertas = function (bundle) {
    const b = bundle || {};
    const L = U.mesclar(U.clonar(model.LIMIARES_PADRAO), (b.settings || {}).limiares || {});
    const dd = U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const out = [];

    (b.projetos || []).forEach(function (p) {
      const s = model.saudeProjeto(p, L, dd);
      if (s.rag === 'vermelho') {
        out.push({ tipo: 'projeto-vermelho', gravidade: 'critico', projetoId: p.id,
          titulo: (p.codigo || p.nome) + ' em vermelho',
          detalhe: s.motivos.filter(function (m) { return m.rag === 'vermelho'; })
            .map(function (m) { return m.texto; }).join(' ') });
      }
      const rg = model.resumoGate(p, dd);
      if (rg.atrasoDias && rg.atrasoDias >= L.gateAtrasadoDias.ambar) {
        out.push({ tipo: 'gate-atrasado', gravidade: rg.atrasoDias >= L.gateAtrasadoDias.vermelho ? 'critico' : 'aviso',
          projetoId: p.id,
          titulo: 'Gate ' + (rg.proximoDef ? rg.proximoDef.codigo : '') + ' atrasado — ' + (p.codigo || p.nome),
          detalhe: rg.atrasoDias + ' dias de atraso na decisão de gate.' });
      }
      (p.decisoes || []).forEach(function (d) {
        const def = model.tax('statusDecisao').find(function (x) { return x.id === d.status; });
        if (def && def.pendente && d.prazoLimite && d.prazoLimite < dd) {
          out.push({ tipo: 'decisao-vencida', gravidade: 'critico', projetoId: p.id,
            titulo: 'Decisão vencida: ' + U.truncar(d.titulo, 50),
            detalhe: 'Prazo era ' + U.fmtDate(d.prazoLimite) + '.' });
        }
      });
      (p.mudancas || []).forEach(function (c) {
        const def = model.tax('statusMudanca').find(function (x) { return x.id === c.status; });
        if (def && def.pendente) {
          out.push({ tipo: 'mudanca-pendente', gravidade: 'aviso', projetoId: p.id,
            titulo: 'Mudança aguardando decisão: ' + U.truncar(c.titulo, 50),
            detalhe: U.fmtMoney(c.impactoCusto, { compact: true }) + ' e ' + c.impactoDias + ' dias de impacto.' });
        }
      });
      model.issuesAbertas(p).forEach(function (i) {
        if (i.severidade >= 4) {
          out.push({ tipo: 'issue-critica', gravidade: 'critico', projetoId: p.id,
            titulo: 'Issue crítica: ' + U.truncar(i.titulo, 50),
            detalhe: 'Aberta há ' + model.aging(i.abertaEm, dd) + ' dias.' });
        }
      });
      model.riscosAbertos(p).forEach(function (r) {
        if (model.scoreRisco(r) >= 20) {
          out.push({ tipo: 'risco-critico', gravidade: 'aviso', projetoId: p.id,
            titulo: 'Risco crítico: ' + U.truncar(r.titulo, 50),
            detalhe: 'Score ' + model.scoreRisco(r) + '. Exposição ' +
              U.fmtMoney(r.exposicaoCusto, { compact: true }) + '.' });
        }
      });
      if (model.estagioAtivo(p.estagio)) {
        const ultimo = (p.statusReports || []).slice().sort(function (a, b) {
          return String(b.reportadoEm).localeCompare(String(a.reportadoEm));
        })[0];
        const atraso = ultimo ? U.diffDays(ultimo.reportadoEm, dd) : null;
        if (atraso === null || atraso >= L.statusReportAtrasoDias.vermelho) {
          out.push({ tipo: 'reporte-atrasado', gravidade: 'aviso', projetoId: p.id,
            titulo: 'Status report em atraso — ' + (p.codigo || p.nome),
            detalhe: atraso === null ? 'Nenhum reporte registrado.' : 'Último reporte há ' + atraso + ' dias.' });
        }
      }
    });

    const ordem = { critico: 0, aviso: 1, info: 2 };
    return out.sort(function (a, b) { return (ordem[a.gravidade] || 9) - (ordem[b.gravidade] || 9); });
  };

  PMO.model = model;
})(window.PMO = window.PMO || {});
