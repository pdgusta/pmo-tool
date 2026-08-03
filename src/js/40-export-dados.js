/* =============================================================================
   40-export-dados.js — exportacao de dados: CSV (Excel pt-BR), bundle JSON, ICS
   Depende de: 00-util.js, 10-model.js  (20-store.js e opcional: so como fonte)

   Compatibilidade Microsoft e FILE-BASED (G6): nada de Graph, nada de OAuth.
     - CSV  -> abre limpo no Excel pt-BR (BOM + ';' + CRLF + virgula decimal)
     - JSON -> backup integral do bundle
     - ICS  -> iCalendar RFC 5545, importavel no Outlook por arquivo

   Este modulo NUNCA muta PMO.store.state: le e clona.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const ex = PMO.exportar = PMO.exportar || {};

  /* =======================================================================
     Internos compartilhados com 41-export-mspdi.js e 42-export-relatorios.js.
     Publicados em ex._i porque o build injeta um arquivo por vez; a referencia
     acontece em tempo de CHAMADA, nunca em tempo de carga.
     ======================================================================= */

  const I = ex._i = ex._i || {};

  /** Bundle de leitura. Ordem: opts.bundle -> store -> portfolio vazio (G9). */
  I.bundle = function (opts) {
    const o = opts || {};
    if (o.bundle && typeof o.bundle === 'object') { return o.bundle; }
    if (PMO.store && PMO.store.state) { return PMO.store.state; }
    return M.portfolioVazio();
  };

  /** Subconjunto de projetos JA filtrado pela view, ou o portfolio inteiro. */
  I.projetos = function (opts, bundle) {
    const o = opts || {};
    if (Array.isArray(o.projetos)) { return o.projetos.filter(Boolean); }
    return ((bundle || {}).projetos || []).filter(Boolean);
  };

  I.dataStatus = function (bundle, opts) {
    const o = opts || {};
    return U.parseDate(o.dataStatus) ||
      U.parseDate(((bundle || {}).meta || {}).dataStatus) || U.hoje();
  };

  I.limiares = function (bundle, opts) {
    const o = opts || {};
    return U.mesclar(
      U.mesclar(U.clonar(M.LIMIARES_PADRAO), ((bundle || {}).settings || {}).limiares || {}),
      o.limiares || {});
  };

  I.org = function (bundle) {
    const n = ((bundle || {}).meta || {}).orgName;
    return n ? String(n) : 'Organização';
  };

  /** 'PRJ-0101-status-report-2026-07-31.html' */
  I.nomeArq = function (partes, ext) {
    const limpo = (partes || [])
      .filter(function (p) { return p !== null && p !== undefined && p !== ''; })
      .map(function (p) { return U.slug(String(p)); })
      .filter(Boolean)
      .join('-');
    return U.nomeArquivoSeguro((limpo || 'pmo-export') + '.' + (ext || 'txt'));
  };

  /** Codigo (ou nome) curto de um projeto, para nome de arquivo. */
  I.refProjeto = function (p) {
    if (!p) { return 'projeto'; }
    return p.codigo || U.truncar(p.nome, 24) || p.id || 'projeto';
  };

  I.MIME = {
    csv: 'text/csv;charset=utf-8',
    json: 'application/json;charset=utf-8',
    ics: 'text/calendar;charset=utf-8',
    xml: 'application/xml;charset=utf-8',
    html: 'text/html;charset=utf-8',
    md: 'text/markdown;charset=utf-8'
  };

  /* =========================================================== formatadores
     Numeros com VIRGULA decimal e SEM separador de milhar: e assim que o
     Excel pt-BR reconhece a celula como numero, nao como texto.
     ======================================================================= */

  function nmDec(v, dec) {
    if (!U.ehNum(v)) { return ''; }
    const d = dec === undefined ? 2 : dec;
    return U.arredondar(v, d).toFixed(d).replace('.', ',');
  }

  function nmInt(v) {
    if (!U.ehNum(v)) { return ''; }
    return String(Math.round(v));
  }

  /** Data ISO -> 'dd/mm/aaaa'. Vazio quando nao houver data (celula vazia). */
  function dt(iso) {
    const p = U.parseDate(iso);
    return p ? U.fmtDate(p) : '';
  }

  function txt(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v);
  }

  function sn(v) { return v ? 'Sim' : 'Não'; }

  /** 'YYYY-MM' -> '07/2026' (o Excel pt-BR entende como mes/ano). */
  function per(p) {
    const s = String(p || '');
    if (!/^\d{4}-\d{2}$/.test(s)) { return s; }
    return s.slice(5, 7) + '/' + s.slice(0, 4);
  }

  function pessoa(bundle, id) {
    if (!id) { return ''; }
    const n = M.nomePessoa(bundle, id);
    return n === '—' ? '' : n;
  }

  function programa(bundle, id) {
    if (!id) { return ''; }
    const n = M.nomePrograma(bundle, id);
    return n === 'Sem programa' ? '' : n;
  }

  function refProj(p) { return (p && (p.codigo || p.id)) || ''; }

  function nomeGate(gateId) {
    const g = M.gatePorId(gateId);
    return g ? g.codigo + ' — ' + g.nome : txt(gateId);
  }

  function codGate(gateId) {
    const g = M.gatePorId(gateId);
    return g ? g.codigo : txt(gateId);
  }

  /* ====================================================== definicao das tabelas
     Cada entidade devolve { colunas:[rotulos], linhas:[[celulas]] }.
     As MESMAS colunas alimentam ex.schemaSharepointCsv.
     ======================================================================= */

  function montarProjetos(ctx) {
    const colunas = ['Código', 'Nome', 'Programa', 'Categoria', 'Tipo', 'Estágio',
      'Gate atual', 'RAG', 'RAG definido manualmente', 'Score de saúde', 'Motivos do RAG',
      'Sponsor', 'Gerente do projeto', 'Unidade de negócio', 'Prioridade', 'Obrigatório',
      'Início baseline', 'Fim baseline', 'Início previsto', 'Fim previsto',
      'Início real', 'Fim real', 'Data de status',
      '% Físico', '% Planejado', 'BAC', 'PV', 'EV', 'AC', 'Comprometido',
      'EAC', 'ETC', 'VAC', 'SPI', 'CPI', 'Desvio (dias)', 'Desvio de custo (%)',
      'Orçamento CAPEX', 'Orçamento OPEX', 'Contingência',
      'Benefício esperado', 'Benefício realizado', 'Exposição de risco',
      'Riscos abertos', 'Riscos altos abertos', 'Issues abertas', 'Issues críticas',
      'Decisões pendentes', 'Mudanças pendentes', 'Marcos', 'Marcos atrasados',
      'Tags', 'Objetivo', 'Descrição', 'Site SharePoint', 'Arquivo de projeto',
      'Criado em', 'Atualizado em'];

    const linhas = ctx.projetos.map(function (p) {
      const e = M.evm(p, ctx.dd);
      const s = M.saudeProjeto(p, ctx.L, ctx.dd);
      const ra = M.riscosAbertos(p);
      const ia = M.issuesAbertas(p);
      const marcos = p.marcos || [];
      const atrasados = marcos.filter(function (m) {
        const alvo = m.previstoData || m.baselineData;
        return !m.realData && alvo && alvo < ctx.dd;
      }).length;
      const decPend = (p.decisoes || []).filter(function (d) {
        const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
        return def && def.pendente;
      }).length;
      const mudPend = (p.mudancas || []).filter(function (c) {
        const def = M.tax('statusMudanca').find(function (x) { return x.id === c.status; });
        return def && def.pendente;
      }).length;
      const f = p.finance || {};
      const d = p.dates || {};

      return [
        txt(p.codigo), txt(p.nome), programa(ctx.bundle, p.programaId),
        M.rotulo('categorias', p.categoria), M.rotulo('tipos', p.tipo),
        M.rotulo('estagios', p.estagio), nomeGate(p.gateAtual),
        M.rotuloRag(s.rag), sn(s.manual), nmInt(s.score),
        s.motivos.map(function (m) { return m.texto; }).join(' '),
        pessoa(ctx.bundle, p.sponsorId), pessoa(ctx.bundle, p.pmId),
        M.nomeBu(ctx.bundle, p.buId) === '—' ? '' : M.nomeBu(ctx.bundle, p.buId),
        nmInt(p.prioridade), sn(p.obrigatorio),
        dt(d.baselineInicio), dt(d.baselineFim), dt(d.previstoInicio), dt(d.previstoFim),
        dt(d.realInicio), dt(d.realFim), dt(d.dataStatus || ctx.dd),
        nmDec(e.pctFisico, 1), nmDec(e.pctPlanejado, 1),
        nmDec(e.BAC), nmDec(e.PV), nmDec(e.EV), nmDec(e.AC), nmDec(e.comprometido),
        nmDec(e.EAC), nmDec(e.ETC), nmDec(e.VAC),
        nmDec(e.SPI, 3), nmDec(e.CPI, 3),
        nmInt(e.desvioDias), nmDec(e.desvioCustoPct, 2),
        nmDec(f.orcamentoCapex), nmDec(f.orcamentoOpex), nmDec(f.contingencia),
        nmDec(M.beneficioLiquido(p)), nmDec(M.beneficioRealizado(p)),
        nmDec(M.exposicaoRisco(p)),
        nmInt(ra.length),
        nmInt(ra.filter(function (r) { return M.scoreRisco(r) >= ctx.L.scoreRiscoAlto; }).length),
        nmInt(ia.length), nmInt(ia.filter(function (i) { return i.severidade >= 4; }).length),
        nmInt(decPend), nmInt(mudPend), nmInt(marcos.length), nmInt(atrasados),
        (p.tags || []).join(', '), txt(p.objetivo), txt(p.descricao),
        txt((p.links || {}).sharepointSite), txt((p.links || {}).arquivoProjeto),
        dt(p.criadoEm), dt(p.atualizadoEm)
      ];
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarRiscos(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Código do risco', 'Título', 'Descrição',
      'Categoria', 'Probabilidade', 'Impacto', 'Score', 'Nível',
      'Exposição de custo', 'Impacto de prazo (dias)', 'Resposta',
      'Mitigação', 'Contingência', 'Dono', 'Prazo', 'Status',
      'Aberto em', 'Fechado em', 'Revisado em', 'Aging (dias)'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.riscos || []).forEach(function (r) {
        const score = M.scoreRisco(r);
        linhas.push([
          refProj(p), txt(p.nome), txt(r.codigo), txt(r.titulo), txt(r.descricao),
          M.rotulo('categoriasRisco', r.categoria),
          nmInt(r.probabilidade), nmInt(r.impacto), nmInt(score),
          M.nivelRisco(score).rotulo,
          nmDec(r.exposicaoCusto), nmDec(r.impactoDias, 1),
          M.rotulo('respostasRisco', r.resposta),
          txt(r.mitigacao), txt(r.contingencia), pessoa(ctx.bundle, r.donoId),
          dt(r.prazo), M.rotulo('statusRisco', r.status),
          dt(r.abertoEm), dt(r.fechadoEm), dt(r.revisadoEm),
          nmInt(M.aging(r.abertoEm, r.fechadoEm || ctx.dd))
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarIssues(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Código da issue', 'Título', 'Descrição',
      'Severidade', 'Nível de severidade', 'Dono', 'Aberta em', 'Prazo',
      'Resolvida em', 'Status', 'Escalada', 'Resolução', 'Aging (dias)'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.issues || []).forEach(function (i) {
        linhas.push([
          refProj(p), txt(p.nome), txt(i.codigo), txt(i.titulo), txt(i.descricao),
          nmInt(i.severidade), M.rotulo('severidades', i.severidade),
          pessoa(ctx.bundle, i.donoId), dt(i.abertaEm), dt(i.prazo),
          dt(i.resolvidaEm), M.rotulo('statusIssue', i.status), sn(i.escalada),
          txt(i.resolucao), nmInt(M.aging(i.abertaEm, i.resolvidaEm || ctx.dd))
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarDecisoes(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Código da decisão', 'Título', 'Contexto',
      'Fórum', 'Solicitada em', 'Prazo limite', 'Decidida em', 'Status',
      'Decisão', 'Decisor', 'Impacto', 'Vencida'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.decisoes || []).forEach(function (d) {
        const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
        const pendente = !!(def && def.pendente);
        linhas.push([
          refProj(p), txt(p.nome), txt(d.codigo), txt(d.titulo), txt(d.contexto),
          M.rotulo('foruns', d.forum), dt(d.solicitadaEm), dt(d.prazoLimite),
          dt(d.decididaEm), M.rotulo('statusDecisao', d.status),
          txt(d.decisao), pessoa(ctx.bundle, d.decisorId), txt(d.impacto),
          sn(pendente && d.prazoLimite && d.prazoLimite < ctx.dd)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarMudancas(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Código da mudança', 'Título', 'Tipo',
      'Justificativa', 'Solicitada em', 'Solicitante', 'Impacto de custo',
      'Impacto de prazo (dias)', 'Impacto de escopo', 'Status', 'Fórum',
      'Afeta baseline', 'Decidida em', 'Aprovador'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.mudancas || []).forEach(function (c) {
        linhas.push([
          refProj(p), txt(p.nome), txt(c.codigo), txt(c.titulo),
          M.rotulo('tiposMudanca', c.tipo), txt(c.justificativa),
          dt(c.solicitadaEm), pessoa(ctx.bundle, c.solicitanteId),
          nmDec(c.impactoCusto), nmInt(c.impactoDias), txt(c.impactoEscopo),
          M.rotulo('statusMudanca', c.status), M.rotulo('foruns', c.forum),
          sn(c.afetaBaseline), dt(c.decididaEm), pessoa(ctx.bundle, c.aprovadorId)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarMarcos(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Marco', 'Gate', 'Crítico', 'Peso',
      'Responsável', 'Data baseline', 'Data prevista', 'Data real',
      'Desvio (dias)', 'Situação', 'Observação'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.marcos || []).forEach(function (m) {
        const alvo = m.previstoData || m.baselineData;
        let situacao = 'Previsto';
        if (m.realData) { situacao = 'Concluído'; }
        else if (alvo && alvo < ctx.dd) { situacao = 'Atrasado'; }
        else if (!alvo) { situacao = 'Sem data'; }
        linhas.push([
          refProj(p), txt(p.nome), txt(m.nome),
          m.gateId ? codGate(m.gateId) : '', sn(m.critico), nmInt(m.peso),
          pessoa(ctx.bundle, m.responsavelId),
          dt(m.baselineData), dt(m.previstoData), dt(m.realData),
          nmInt(U.diffDays(m.baselineData, m.realData || m.previstoData)),
          situacao, txt(m.observacao)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarGates(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Gate', 'Nome do gate', 'Data prevista',
      'Data real', 'Decisão', 'Fórum', 'Aprovador', 'Atraso (dias)',
      'Condições', 'Notas'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.gates || []).forEach(function (g) {
        const gd = M.gatePorId(g.gateId);
        let atraso = null;
        if (g.decisao === 'pendente' && g.previstoData) {
          const dif = U.diffDays(g.previstoData, ctx.dd);
          atraso = dif !== null && dif > 0 ? dif : 0;
        }
        linhas.push([
          refProj(p), txt(p.nome), gd ? gd.codigo : txt(g.gateId), gd ? gd.nome : '',
          dt(g.previstoData), dt(g.realData),
          M.rotulo('decisoesGate', g.decisao), M.rotulo('foruns', g.forum),
          pessoa(ctx.bundle, g.aprovadorId), nmInt(atraso),
          txt(g.condicoes), txt(g.notas)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarBeneficios(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Benefício', 'Tipo', 'Financeiro',
      'Valor esperado', 'Valor realizado', '% Realizado', 'Unidade',
      'Prazo', 'Status', 'Dono', 'Método de medição'];
    const financeiros = M.tax('tiposBeneficio')
      .filter(function (t) { return t.financeiro; }).map(function (t) { return t.id; });
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.beneficios || []).forEach(function (b) {
        linhas.push([
          refProj(p), txt(p.nome), txt(b.nome), M.rotulo('tiposBeneficio', b.tipo),
          sn(financeiros.indexOf(b.tipo) >= 0),
          nmDec(b.valorEsperado), nmDec(b.valorRealizado),
          U.ehNum(b.valorEsperado) && b.valorEsperado > 0
            ? nmDec(U.safeDiv(b.valorRealizado, b.valorEsperado) * 100, 1) : '',
          txt(b.unidade), dt(b.prazo), M.rotulo('statusBeneficio', b.status),
          pessoa(ctx.bundle, b.donoId), txt(b.metodoMedicao)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarAlocacoes(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Pessoa', 'Papel', 'Alocação (%)',
      'De', 'Até', 'Meses', 'Horas estimadas', 'Custo estimado'];
    const idx = U.indexarPor((ctx.bundle || {}).pessoas || [], 'id');
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.alocacoes || []).forEach(function (a) {
        const de = a.de || (p.dates || {}).previstoInicio;
        const ate = a.ate || (p.dates || {}).previstoFim;
        const meses = de && ate ? U.periodosEntre(de, ate).length : 0;
        const ps = idx[a.pessoaId] || null;
        const cap = ps ? U.num(ps.capacidadeHorasMes, 160) : 160;
        const horas = meses * cap * U.num(a.alocacaoPct, 0) / 100;
        const custo = ps ? horas * U.num(ps.custoHora, 0) : 0;
        linhas.push([
          refProj(p), txt(p.nome), pessoa(ctx.bundle, a.pessoaId), txt(a.papel),
          nmDec(a.alocacaoPct, 1), dt(de), dt(ate), nmInt(meses),
          nmDec(horas, 1), nmDec(custo)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarDependencias(ctx) {
    const colunas = ['Projeto origem', 'Nome da origem', 'Projeto destino', 'Nome do destino',
      'Tipo', 'Descrição do tipo', 'Lag (dias)', 'Criticidade', 'Status', 'Descrição'];
    const idx = U.indexarPor((ctx.bundle || {}).projetos || [], 'id');
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.dependencias || []).forEach(function (dep) {
        const alvo = idx[dep.projetoDestinoId] || null;
        linhas.push([
          refProj(p), txt(p.nome),
          alvo ? refProj(alvo) : (dep.projetoDestinoId ? '(inexistente)' : ''),
          alvo ? txt(alvo.nome) : '',
          txt(dep.tipo), M.rotulo('tiposDependencia', dep.tipo),
          nmInt(dep.lagDias), M.rotulo('criticidades', dep.criticidade),
          txt(dep.status), txt(dep.descricao)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarStatusReports(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Período', 'Reportado em', 'Autor',
      'RAG geral', 'RAG escopo', 'RAG prazo', 'RAG custo', 'RAG qualidade', 'RAG risco',
      'SPI', 'CPI', '% Físico', 'Destaques', 'Pontos de atenção',
      'Próximos passos', 'Pedidos ao comitê'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      (p.statusReports || []).forEach(function (s) {
        linhas.push([
          refProj(p), txt(p.nome), per(s.periodo), dt(s.reportadoEm),
          pessoa(ctx.bundle, s.autorId),
          M.rotuloRag(s.ragGeral), M.rotuloRag(s.ragEscopo), M.rotuloRag(s.ragPrazo),
          M.rotuloRag(s.ragCusto), M.rotuloRag(s.ragQualidade), M.rotuloRag(s.ragRisco),
          nmDec(s.spiSnapshot, 3), nmDec(s.cpiSnapshot, 3), nmDec(s.pctFisicoSnapshot, 1),
          txt(s.destaques), txt(s.pontosAtencao), txt(s.proximosPassos), txt(s.pedidosComite)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarAnexos(ctx) {
    const colunas = ['Projeto', 'Nome do projeto', 'Nome do arquivo', 'Categoria', 'Descrição',
      'Tipo MIME', 'Tamanho (bytes)', 'Tamanho', 'Enviado em', 'Enviado por',
      'Replicado em disco', 'No navegador', 'Versão', 'Hash', 'Identificador'];
    const idx = U.indexarPor(ctx.projetos, 'id');
    const todos = ((ctx.bundle || {}).anexos || []);
    const linhas = [];
    todos.forEach(function (a) {
      const p = a.projetoId ? idx[a.projetoId] : null;
      if (a.projetoId && !p) { return; }   // fora do subconjunto exportado
      linhas.push([
        p ? refProj(p) : '', p ? txt(p.nome) : '(portfólio)',
        txt(a.nomeArquivo), M.rotulo('categoriasAnexo', a.categoria), txt(a.descricao),
        txt(a.mime), nmInt(a.tamanho), U.tamanhoHumano(a.tamanho),
        dt(a.enviadoEm), txt(a.enviadoPor),
        sn(a.emDisco), sn(a.emNavegador), nmInt(a.versao), txt(a.hash), txt(a.id)
      ]);
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarEvm(ctx) {
    const colunas = ['Código', 'Nome', 'BAC', 'PV', 'EV', 'AC', 'SV', 'CV',
      'SPI', 'CPI', 'EAC', 'ETC', 'VAC', 'TCPI',
      '% Físico', '% Planejado', 'Desvio (dias)', 'RAG'];
    const linhas = ctx.projetos.map(function (p) {
      const e = M.evm(p, ctx.dd);
      const s = M.saudeProjeto(p, ctx.L, ctx.dd);
      return [
        txt(p.codigo || p.id), txt(p.nome),
        nmDec(e.BAC), nmDec(e.PV), nmDec(e.EV), nmDec(e.AC),
        nmDec(e.SV), nmDec(e.CV),
        nmDec(e.SPI, 3), nmDec(e.CPI, 3),
        nmDec(e.EAC), nmDec(e.ETC), nmDec(e.VAC), nmDec(e.TCPI, 3),
        nmDec(e.pctFisico, 1), nmDec(e.pctPlanejado, 1),
        nmInt(e.desvioDias), M.rotuloRag(s.rag)
      ];
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarFinanceiroMensal(ctx) {
    const colunas = ['Código', 'Período', 'PV', 'EV', 'AC',
      'PV acumulado', 'EV acumulado', 'AC acumulado'];
    const linhas = [];
    ctx.projetos.forEach(function (p) {
      const curva = M.curvaS(p, ctx.dd) || [];
      curva.forEach(function (x) {
        linhas.push([
          txt(p.codigo || p.id), per(x.periodo),
          nmDec(x.pv), nmDec(x.ev), nmDec(x.ac),
          nmDec(x.pvAcum), nmDec(x.evAcum), nmDec(x.acAcum)
        ]);
      });
    });
    return { colunas: colunas, linhas: linhas };
  }

  function montarAuditoria(ctx) {
    const colunas = ['Data e hora', 'Ator', 'Ação', 'Entidade', 'Identificador da entidade',
      'Resumo', 'Campos alterados'];
    const linhas = ((ctx.bundle || {}).auditLog || []).map(function (a) {
      let campos = '';
      if (a.campos) {
        try { campos = typeof a.campos === 'string' ? a.campos : JSON.stringify(a.campos); }
        catch (e) { campos = ''; }
      }
      return [
        U.fmtDataHora(a.em) === '—' ? '' : U.fmtDataHora(a.em),
        txt(a.ator), txt(a.acao), txt(a.entidade), txt(a.entidadeId),
        txt(a.resumo), campos
      ];
    });
    return { colunas: colunas, linhas: linhas };
  }

  const ENTIDADES = {
    'projetos': { rotulo: 'Projetos', montar: montarProjetos, titulo: 'Nome' },
    'riscos': { rotulo: 'Riscos', montar: montarRiscos, titulo: 'Título' },
    'issues': { rotulo: 'Issues', montar: montarIssues, titulo: 'Título' },
    'decisoes': { rotulo: 'Decisões', montar: montarDecisoes, titulo: 'Título' },
    'mudancas': { rotulo: 'Mudanças', montar: montarMudancas, titulo: 'Título' },
    'marcos': { rotulo: 'Marcos', montar: montarMarcos, titulo: 'Marco' },
    'gates': { rotulo: 'Gates', montar: montarGates, titulo: 'Nome do gate' },
    'beneficios': { rotulo: 'Benefícios', montar: montarBeneficios, titulo: 'Benefício' },
    'alocacoes': { rotulo: 'Alocações', montar: montarAlocacoes, titulo: 'Pessoa' },
    'dependencias': { rotulo: 'Dependências', montar: montarDependencias, titulo: 'Projeto destino' },
    'statusReports': { rotulo: 'Status reports', montar: montarStatusReports, titulo: 'Período' },
    'anexos': { rotulo: 'Anexos', montar: montarAnexos, titulo: 'Nome do arquivo' },
    'evm': { rotulo: 'EVM por projeto', montar: montarEvm, titulo: 'Nome' },
    'financeiro-mensal': { rotulo: 'Financeiro mensal', montar: montarFinanceiroMensal, titulo: 'Período' },
    'auditoria': { rotulo: 'Trilha de auditoria', montar: montarAuditoria, titulo: 'Resumo' }
  };

  /** Lista para montar menus de exportacao na UI. */
  ex.entidadesCsv = function () {
    return Object.keys(ENTIDADES).map(function (id) {
      return { id: id, rotulo: ENTIDADES[id].rotulo };
    });
  };

  function contexto(opts) {
    const bundle = I.bundle(opts);
    return {
      bundle: bundle,
      projetos: I.projetos(opts, bundle),
      dd: I.dataStatus(bundle, opts),
      L: I.limiares(bundle, opts)
    };
  }

  /* ================================================================== CSV */

  /**
   * CSV pt-BR de uma entidade do portfolio.
   *   ex.csv('evm', { projetos: filtrados })
   * Sempre BOM + ';' + CRLF (Excel pt-BR abre sem assistente de importacao).
   * Celula vazia significa "nao aplicavel" (ex.: SPI sem PV) — assim a coluna
   * continua numerica no Excel.
   */
  ex.csv = function (entidade, opts) {
    const o = opts || {};
    const def = ENTIDADES[entidade];
    if (!def) {
      return U.paraCsv(['Aviso'],
        [['Entidade não suportada na exportação: ' + String(entidade)]], o.delim);
    }
    try {
      const t = def.montar(contexto(o));
      return U.paraCsv(t.colunas, t.linhas, o.delim);
    } catch (e) {
      if (window.console) { console.error('[PMO] falha ao gerar CSV de ' + entidade, e); }
      return U.paraCsv(['Aviso'],
        [['Não foi possível gerar o CSV de ' + def.rotulo + ': ' + (e.message || e)]], o.delim);
    }
  };

  ex.baixarCsv = function (entidade, opts) {
    const o = opts || {};
    const def = ENTIDADES[entidade] || { rotulo: entidade };
    const bundle = I.bundle(o);
    const projetos = I.projetos(o, bundle);
    const dd = I.dataStatus(bundle, o);
    const base = projetos.length === 1 ? I.refProjeto(projetos[0]) : 'portfolio';
    const nome = I.nomeArq([base, entidade, dd], 'csv');
    const ok = U.download(nome, ex.csv(entidade, o), I.MIME.csv);
    if (ok) {
      U.toast('CSV de ' + def.rotulo + ' exportado (' + nome + ').', 'ok');
    }
    return nome;
  };

  /* =========================================================== bundle JSON */

  /** Backup integral do portfolio, indentado. Nunca muta o estado do store. */
  ex.bundleJson = function (opts) {
    const o = opts || {};
    const b = U.clonar(I.bundle(o));
    if (!b.meta) { b.meta = {}; }
    b.meta.geradoEm = U.agoraIso();
    b.meta.appVersion = M.APP_VERSION;
    b.meta.schemaVersion = M.SCHEMA_VERSION;
    if (Array.isArray(o.projetos)) {
      const ids = {};
      o.projetos.forEach(function (p) { if (p && p.id) { ids[p.id] = true; } });
      b.projetos = (b.projetos || []).filter(function (p) { return ids[p.id]; });
      b.anexos = (b.anexos || []).filter(function (a) {
        return !a.projetoId || ids[a.projetoId];
      });
      b.meta.recorte = 'Subconjunto de ' + b.projetos.length + ' projeto(s).';
    }
    try {
      return JSON.stringify(b, null, 2);
    } catch (e) {
      if (window.console) { console.error('[PMO] falha ao serializar bundle', e); }
      return JSON.stringify({ erro: 'Não foi possível serializar o portfólio.',
        detalhe: String(e.message || e) }, null, 2);
    }
  };

  ex.baixarBundleJson = function (opts) {
    const o = opts || {};
    const bundle = I.bundle(o);
    const nome = I.nomeArq(['portfolio', 'bundle', I.dataStatus(bundle, o)], 'json');
    if (U.download(nome, ex.bundleJson(o), I.MIME.json)) {
      U.toast('Backup do portfólio exportado (' + nome + ').', 'ok');
    }
    return nome;
  };

  /* ================================================= schema para SharePoint */

  const ACRONIMOS = {
    bac: 'BAC', pv: 'PV', ev: 'EV', ac: 'AC', sv: 'SV', cv: 'CV', spi: 'SPI',
    cpi: 'CPI', eac: 'EAC', etc: 'ETC', vac: 'VAC', tcpi: 'TCPI', rag: 'RAG',
    capex: 'CAPEX', opex: 'OPEX', mime: 'MIME', id: 'Id', pct: 'Pct'
  };

  /** Nomes reservados/problematicos em Lista do SharePoint -> alternativa segura. */
  const RESERVADOS = {
    Id: 'Identificador', ID: 'Identificador', Created: 'CriadoEm',
    Modified: 'AtualizadoEm', Author: 'CriadoPor', Editor: 'AlteradoPor',
    Order: 'Ordem', GUID: 'Guid', Version: 'Versao', Attachments: 'Anexo',
    Title: 'Titulo'
  };

  function nomeSharepoint(rotulo) {
    const cru = String(rotulo || '').replace(/%/g, ' pct ');
    const palavras = U.normalizar(cru).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
    const nome = palavras.filter(Boolean).map(function (w) {
      if (ACRONIMOS[w]) { return ACRONIMOS[w]; }
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('');
    return nome || 'Campo';
  }

  /**
   * CSV de UMA linha (somente cabecalho) com nomes de coluna prontos para criar
   * uma Lista do SharePoint com o mesmo esquema desta entidade.
   *
   * Como usar (nao ha integracao — G6, o caminho e por arquivo):
   *   1. Baixe este arquivo e abra no Excel.
   *   2. Selecione o cabecalho e formate como Tabela (Ctrl+T).
   *   3. No site do SharePoint: Novo > Lista > Do Excel, aponte a tabela,
   *      confirme o tipo de cada coluna e crie a lista.
   *   4. Depois, exporte a mesma entidade com ex.csv(...) e cole os dados na
   *      lista em modo de grade — os cabecalhos coincidem coluna a coluna.
   * A primeira coluna sai como 'Title' porque a Lista do SharePoint sempre tem
   * a coluna Titulo e ela nao pode ser removida.
   */
  ex.schemaSharepointCsv = function (entidade) {
    const def = ENTIDADES[entidade];
    if (!def) {
      return U.paraCsv(['Aviso'], [['Entidade não suportada: ' + String(entidade)]]);
    }
    const vazio = { bundle: M.portfolioVazio(), projetos: [], dd: U.hoje(), L: M.LIMIARES_PADRAO };
    let colunas;
    try { colunas = def.montar(vazio).colunas; }
    catch (e) { return U.paraCsv(['Aviso'], [['Não foi possível ler o esquema.']]); }

    const idxTitulo = Math.max(0, colunas.indexOf(def.titulo));
    const vistos = {};
    const saida = colunas.map(function (rot, i) {
      let n = i === idxTitulo ? 'Title' : nomeSharepoint(rot);
      if (i !== idxTitulo && RESERVADOS[n]) { n = RESERVADOS[n]; }
      if (vistos[n]) { vistos[n] += 1; n = n + vistos[n]; } else { vistos[n] = 1; }
      return n;
    });
    return U.paraCsv(saida, []);
  };

  ex.baixarSchemaSharepointCsv = function (entidade) {
    const nome = I.nomeArq(['sharepoint', 'schema', entidade], 'csv');
    if (U.download(nome, ex.schemaSharepointCsv(entidade), I.MIME.csv)) {
      U.toast('Esquema de coluna para Lista do SharePoint exportado (' + nome + ').', 'ok');
    }
    return nome;
  };

  /* ================================================================== ICS
     iCalendar 2.0 (RFC 5545). Pontos que quebram na pratica e estao cobertos:
       - CRLF entre TODAS as linhas, inclusive a ultima
       - dobra de linha em 75 OCTETOS com continuacao por espaco (conta bytes
         UTF-8, nao caracteres, e nunca parte um par surrogate)
       - escape de \  ;  ,  e quebra de linha nos valores TEXT
       - DTSTART;VALUE=DATE para evento de dia inteiro; DTEND e EXCLUSIVO
       - UID estavel (reimportar atualiza o evento em vez de duplicar)
     ======================================================================= */

  const PRODID = '-//PMO Tool//Governanca de Portfolio ' + M.APP_VERSION + '//PT-BR';

  function octetos(ch) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) { return 1; }
    if (cp < 0x800) { return 2; }
    if (cp < 0x10000) { return 3; }
    return 4;
  }

  /** Dobra uma linha de conteudo em no maximo 75 octetos por linha fisica. */
  function dobrar(linha) {
    const partes = [];
    let atual = '';
    let bytes = 0;
    const chars = Array.from(String(linha));   // itera por code point
    for (let i = 0; i < chars.length; i++) {
      const t = octetos(chars[i]);
      if (bytes + t > 75) {
        partes.push(atual);
        atual = '';
        bytes = 1;              // o espaco da continuacao ocupa 1 octeto
      }
      atual += chars[i];
      bytes += t;
    }
    partes.push(atual);
    let out = partes[0];
    for (let k = 1; k < partes.length; k++) { out += '\r\n ' + partes[k]; }
    return out;
  }

  /** Escape de valor TEXT do RFC 5545. A barra invertida vem primeiro. */
  function escIcs(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function dataIcs(iso) {
    const p = U.parseDate(iso);
    return p ? p.replace(/-/g, '') : null;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function agoraUtcIcs(d) {
    const x = d instanceof Date ? d : new Date();
    return x.getUTCFullYear() + pad2(x.getUTCMonth() + 1) + pad2(x.getUTCDate()) + 'T' +
      pad2(x.getUTCHours()) + pad2(x.getUTCMinutes()) + pad2(x.getUTCSeconds()) + 'Z';
  }

  /** UID determinístico: reimportar atualiza, nao duplica. */
  function uidIcs(item, i) {
    if (item.uid) { return String(item.uid); }
    const chave = [item.tipo || 'item', item.chave || U.slug(item.titulo) || 'sem-titulo',
      U.parseDate(item.data) || 'sem-data', i].join('-');
    return chave.replace(/[^A-Za-z0-9._-]/g, '-') + '@pmo-tool.local';
  }

  const CAT_PADRAO = {
    gate: 'Gate de governança',
    marco: 'Marco crítico',
    decisao: 'Decisão de comitê',
    comite: 'Reunião de comitê',
    revisao: 'Revisão de portfólio'
  };

  /**
   * itens: [{ titulo, data, dataFim?, descricao?, local?, uid?, chave?, tipo,
   *           categorias?, alarme?, sequence?, status? }]
   * Itens sem data valida sao descartados (nunca geram VEVENT invalido).
   */
  ex.ics = function (itens, opts) {
    const o = opts || {};
    const dtstamp = o.dtstamp || agoraUtcIcs();
    const linhas = [];
    linhas.push('BEGIN:VCALENDAR');
    linhas.push('VERSION:2.0');
    linhas.push('PRODID:' + (o.prodid || PRODID));
    linhas.push('CALSCALE:GREGORIAN');
    linhas.push('METHOD:PUBLISH');
    linhas.push('X-WR-CALNAME:' + escIcs(o.nomeCalendario || 'PMO — Governança de Portfólio'));
    linhas.push('X-WR-TIMEZONE:America/Sao_Paulo');
    if (o.descricaoCalendario) {
      linhas.push('X-WR-CALDESC:' + escIcs(o.descricaoCalendario));
    }

    let n = 0;
    (itens || []).forEach(function (item, i) {
      if (!item) { return; }
      const ini = dataIcs(item.data);
      if (!ini) { return; }
      // DTEND de evento de dia inteiro e EXCLUSIVO: soma 1 dia ao ultimo dia.
      const fimBase = U.parseDate(item.dataFim) || U.parseDate(item.data);
      const fim = dataIcs(U.addDays(fimBase, 1));
      const tipo = item.tipo || 'item';

      linhas.push('BEGIN:VEVENT');
      linhas.push('UID:' + uidIcs(item, i));
      linhas.push('DTSTAMP:' + dtstamp);
      linhas.push('DTSTART;VALUE=DATE:' + ini);
      if (fim) { linhas.push('DTEND;VALUE=DATE:' + fim); }
      linhas.push('SUMMARY:' + escIcs(item.titulo || 'Item de governança'));
      if (item.descricao) { linhas.push('DESCRIPTION:' + escIcs(item.descricao)); }
      if (item.local) { linhas.push('LOCATION:' + escIcs(item.local)); }
      linhas.push('CATEGORIES:' + escIcs(item.categorias || CAT_PADRAO[tipo] || 'Governança'));
      linhas.push('STATUS:' + (item.status || 'CONFIRMED'));
      linhas.push('TRANSP:TRANSPARENT');
      linhas.push('SEQUENCE:' + (U.ehNum(item.sequence) ? Math.round(item.sequence) : 0));
      linhas.push('CLASS:PUBLIC');
      linhas.push('X-MICROSOFT-CDO-ALLDAYEVENT:TRUE');
      linhas.push('X-PMO-TIPO:' + escIcs(tipo));
      const querAlarme = item.alarme === undefined ? tipo === 'gate' : !!item.alarme;
      if (querAlarme) {
        linhas.push('BEGIN:VALARM');
        linhas.push('ACTION:DISPLAY');
        linhas.push('TRIGGER;RELATED=START:-P7D');
        linhas.push('DESCRIPTION:' + escIcs('Em 7 dias: ' + (item.titulo || 'gate de governança')));
        linhas.push('END:VALARM');
      }
      linhas.push('END:VEVENT');
      n += 1;
    });

    linhas.push('END:VCALENDAR');

    const corpo = linhas.map(dobrar).join('\r\n') + '\r\n';
    ex.ics.ultimoTotal = n;
    return corpo;
  };

  /** Quantos VEVENT o ultimo ex.ics() produziu (para a UI avisar quando 0). */
  ex.ics.ultimoTotal = 0;

  function descreveProjeto(p, bundle) {
    const partes = [];
    if (p.codigo) { partes.push('Projeto: ' + p.codigo + ' — ' + p.nome); }
    else if (p.nome) { partes.push('Projeto: ' + p.nome); }
    const prog = programa(bundle, p.programaId);
    if (prog) { partes.push('Programa: ' + prog); }
    const pm = pessoa(bundle, p.pmId);
    if (pm) { partes.push('Gerente: ' + pm); }
    const sp = pessoa(bundle, p.sponsorId);
    if (sp) { partes.push('Sponsor: ' + sp); }
    return partes;
  }

  /** Gates pendentes com data prevista + marcos criticos em aberto. */
  ex.icsGates = function (projetos, bundle) {
    const b = bundle || I.bundle();
    const lista = Array.isArray(projetos) ? projetos : ((b.projetos) || []);
    const dd = I.dataStatus(b, null);
    const L = I.limiares(b, null);
    const itens = [];

    lista.forEach(function (p) {
      if (!p) { return; }
      const saude = M.saudeProjeto(p, L, dd);
      const base = descreveProjeto(p, b);

      (p.gates || []).forEach(function (g) {
        if (g.decisao !== 'pendente' || !g.previstoData) { return; }
        const gd = M.gatePorId(g.gateId);
        const cod = gd ? gd.codigo : String(g.gateId || 'Gate');
        const desc = base.concat([
          'Gate: ' + (gd ? gd.codigo + ' — ' + gd.nome : cod),
          gd ? gd.descricao : '',
          'Fórum: ' + M.rotulo('foruns', g.forum),
          'RAG atual: ' + M.rotuloRag(saude.rag),
          g.condicoes ? 'Condições: ' + g.condicoes : '',
          'Gerado pelo PMO Tool — decisão de gate pendente.'
        ]).filter(Boolean);
        itens.push({
          tipo: 'gate',
          chave: p.id + '-' + (g.id || g.gateId),
          titulo: 'Gate ' + cod + ' — ' + (p.codigo || p.nome || 'projeto'),
          data: g.previstoData,
          descricao: desc.join('\n'),
          local: M.rotulo('foruns', g.forum),
          alarme: true
        });
      });

      (p.marcos || []).forEach(function (m) {
        const alvo = m.previstoData || m.baselineData;
        if (!m.critico || m.realData || !alvo) { return; }
        const desc = base.concat([
          'Marco crítico: ' + (m.nome || 'sem nome'),
          m.gateId ? 'Gate associado: ' + nomeGate(m.gateId) : '',
          m.baselineData ? 'Baseline: ' + U.fmtDate(m.baselineData) : '',
          m.observacao ? 'Observação: ' + m.observacao : '',
          'Gerado pelo PMO Tool — marco crítico em aberto.'
        ]).filter(Boolean);
        itens.push({
          tipo: 'marco',
          chave: p.id + '-' + (m.id || U.slug(m.nome)),
          titulo: 'Marco: ' + (m.nome || 'sem nome') + ' — ' + (p.codigo || p.nome || 'projeto'),
          data: alvo,
          descricao: desc.join('\n'),
          alarme: false
        });
      });
    });

    const ordenados = U.sortBy(itens, function (x) { return x.data; });
    return ex.ics(ordenados, {
      nomeCalendario: 'PMO — Gates e marcos críticos',
      descricaoCalendario: 'Gerado pelo PMO Tool em ' + U.fmtDate(U.hoje()) +
        '. Data de status do portfólio: ' + U.fmtDate(dd) + '.'
    });
  };

  /** Decisoes com prazo + reunioes de comite deduzidas dos gates agendados. */
  ex.icsComites = function (bundle) {
    const b = bundle || I.bundle();
    const lista = (b.projetos) || [];
    const dd = I.dataStatus(b, null);
    const itens = [];
    const reunioes = {};

    lista.forEach(function (p) {
      const base = descreveProjeto(p, b);

      (p.decisoes || []).forEach(function (d) {
        const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
        if (!def || !def.pendente || !d.prazoLimite) { return; }
        const desc = base.concat([
          'Decisão solicitada: ' + (d.titulo || 'sem título'),
          d.contexto ? 'Contexto: ' + d.contexto : '',
          d.impacto ? 'Impacto: ' + d.impacto : '',
          'Fórum: ' + M.rotulo('foruns', d.forum),
          'Status: ' + M.rotulo('statusDecisao', d.status),
          'Solicitada em ' + U.fmtDate(d.solicitadaEm) + '.',
          d.prazoLimite < dd ? 'ATENÇÃO: prazo já vencido.' : '',
          'Gerado pelo PMO Tool — decisão aguardando o comitê.'
        ]).filter(Boolean);
        itens.push({
          tipo: 'decisao',
          chave: p.id + '-' + (d.id || U.slug(d.titulo)),
          titulo: 'Decisão: ' + U.truncar(d.titulo || 'sem título', 60) +
            ' — ' + (p.codigo || p.nome || 'projeto'),
          data: d.prazoLimite,
          descricao: desc.join('\n'),
          local: M.rotulo('foruns', d.forum),
          alarme: true,
          status: d.prazoLimite < dd ? 'TENTATIVE' : 'CONFIRMED'
        });
      });

      // Reuniao de comite = data de gate pendente agrupada por forum.
      (p.gates || []).forEach(function (g) {
        if (g.decisao !== 'pendente' || !g.previstoData) { return; }
        const k = (g.forum || 'comite-portfolio') + '|' + g.previstoData;
        if (!reunioes[k]) {
          reunioes[k] = { forum: g.forum || 'comite-portfolio', data: g.previstoData, pautas: [] };
        }
        const gd = M.gatePorId(g.gateId);
        reunioes[k].pautas.push((gd ? gd.codigo : String(g.gateId)) + ' — ' +
          (p.codigo || p.nome || 'projeto'));
      });
    });

    Object.keys(reunioes).forEach(function (k) {
      const r = reunioes[k];
      const forum = M.rotulo('foruns', r.forum);
      itens.push({
        tipo: 'comite',
        chave: 'reuniao-' + r.forum + '-' + r.data,
        titulo: forum + ' — ' + r.pautas.length + ' ' +
          U.pluralizar(r.pautas.length, 'gate na pauta', 'gates na pauta'),
        data: r.data,
        descricao: ['Fórum: ' + forum, 'Pauta prevista:']
          .concat(r.pautas.map(function (x) { return '• ' + x; }))
          .concat(['Data derivada das datas previstas de gate. Gerado pelo PMO Tool.'])
          .join('\n'),
        local: forum,
        alarme: true
      });
    });

    const ordenados = U.sortBy(itens, function (x) { return x.data; });
    return ex.ics(ordenados, {
      nomeCalendario: 'PMO — Comitês e decisões',
      descricaoCalendario: 'Gerado pelo PMO Tool em ' + U.fmtDate(U.hoje()) +
        '. Data de status do portfólio: ' + U.fmtDate(dd) + '.'
    });
  };

  function baixarIcs(conteudo, nome, rotulo) {
    if (!ex.ics.ultimoTotal) {
      U.toast('Nada para exportar: nenhum ' + rotulo + ' com data no portfólio filtrado.', 'info');
      return null;
    }
    if (U.download(nome, conteudo, I.MIME.ics)) {
      U.toast(ex.ics.ultimoTotal + ' ' + U.pluralizar(ex.ics.ultimoTotal, 'evento', 'eventos') +
        ' exportados em ' + nome + '. Importe pelo Outlook: Arquivo > Abrir e Exportar > Importar.', 'ok');
    }
    return nome;
  }

  ex.baixarIcsGates = function (projetos, bundle) {
    const b = bundle || I.bundle();
    const conteudo = ex.icsGates(projetos, b);
    return baixarIcs(conteudo, I.nomeArq(['portfolio', 'gates', I.dataStatus(b, null)], 'ics'),
      'gate ou marco crítico');
  };

  ex.baixarIcsComites = function (bundle) {
    const b = bundle || I.bundle();
    const conteudo = ex.icsComites(b);
    return baixarIcs(conteudo, I.nomeArq(['portfolio', 'comites', I.dataStatus(b, null)], 'ics'),
      'comitê ou decisão com prazo');
  };

})(window.PMO = window.PMO || {});
