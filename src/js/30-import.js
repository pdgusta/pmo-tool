/* =============================================================================
   30-import.js — engine de importacao e reconciliacao
   Depende de: 00-util.js, 10-model.js, 20-store.js

   Formatos: MSPDI (.xml do MS Project), Primavera XER, Primavera PMXML,
             CSV, XLSX (via DecompressionStream nativo), .mpp (SO metadados OLE),
             bundle nativo (.json)

   G7: .mpp e binario proprietario. Le-se APENAS o property set OLE do documento.
   G8: importar nunca sobrescreve direto — sempre gera diff aprovavel campo a campo.
   G9: nenhum parser lanca para fora; erros viram avisos e o resultado segue util.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const imp = PMO.importar = PMO.importar || {};

  imp.TOLERANCIA = { moedaPct: 0.5, pontosPct: 0.1 };

  /* =========================================================== deteccao */

  function bytesComecamCom(bytes, assinatura) {
    if (!bytes || bytes.length < assinatura.length) { return false; }
    for (let i = 0; i < assinatura.length; i++) {
      if (bytes[i] !== assinatura[i]) { return false; }
    }
    return true;
  }

  const SIG_ZIP = [0x50, 0x4B, 0x03, 0x04];
  const SIG_CFB = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

  imp.detectar = function (nomeArquivo, amostraTexto, bytes) {
    const ext = U.extensao(nomeArquivo);
    const t = String(amostraTexto || '').slice(0, 4000);

    if (bytes && bytesComecamCom(bytes, SIG_CFB)) { return 'mpp'; }
    if (bytes && bytesComecamCom(bytes, SIG_ZIP)) {
      // OOXML: xlsx e o unico que importamos como dado
      return ext === 'xlsx' || ext === 'xlsm' ? 'xlsx' : null;
    }
    if (/^\s*ERMHDR\t/.test(t)) { return 'xer'; }
    if (/APIBusinessObjects/.test(t) || /xmlns.oracle.com\/Primavera/i.test(t)) { return 'pmxml'; }
    if (/schemas\.microsoft\.com\/project/i.test(t)) { return 'mspdi'; }
    if (/^\s*<\?xml/.test(t) || /^\s*</.test(t)) {
      if (/<Project[\s>]/.test(t)) { return 'mspdi'; }
      if (ext === 'pmxml') { return 'pmxml'; }
      return 'mspdi';
    }
    if (/^\s*[{[]/.test(t)) {
      try {
        const j = JSON.parse(t.length > 3500 ? String(amostraTexto) : t);
        if (j && j.meta && j.projetos) { return 'bundle'; }
      } catch (e) { /* nao e json completo na amostra */ }
      if (ext === 'json') { return 'bundle'; }
    }
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') { return 'csv'; }
    if (ext === 'xer') { return 'xer'; }
    if (ext === 'mpp' || ext === 'mpx') { return 'mpp'; }
    if (t.indexOf(';') >= 0 || t.indexOf(',') >= 0) { return 'csv'; }
    return null;
  };

  /* ================================================== helpers de agregacao */

  /**
   * Percentual fisico agregado a partir de tarefas folha.
   * Prioridade de ponderacao: custo de baseline -> trabalho -> media simples.
   * Devolve { pct, criterio }.
   */
  function pctAgregado(folhas) {
    if (!folhas.length) { return { pct: 0, criterio: 'sem tarefas' }; }
    const somaCusto = U.sum(folhas, function (t) { return t.custoBaseline || 0; });
    if (somaCusto > 0) {
      return {
        pct: U.clamp(U.safeDiv(U.sum(folhas, function (t) {
          return (t.custoBaseline || 0) * U.num(t.pct, 0) / 100;
        }), somaCusto) * 100, 0, 100),
        criterio: 'ponderado por custo de baseline'
      };
    }
    const somaTrab = U.sum(folhas, function (t) { return t.trabalho || 0; });
    if (somaTrab > 0) {
      return {
        pct: U.clamp(U.safeDiv(U.sum(folhas, function (t) {
          return (t.trabalho || 0) * U.num(t.pct, 0) / 100;
        }), somaTrab) * 100, 0, 100),
        criterio: 'ponderado por trabalho (horas)'
      };
    }
    return {
      pct: U.clamp(U.media(folhas, function (t) { return U.num(t.pct, 0); }), 0, 100),
      criterio: 'média simples (sem custo nem trabalho nas tarefas)'
    };
  }

  const RE_GATE = /\bG([0-5])\b/i;

  /** Detecta se um marco representa um gate de governanca. */
  function gateDoMarco(nome) {
    const n = String(nome || '');
    const m = RE_GATE.exec(n);
    if (m) { return 'g' + m[1]; }
    if (/\bgate\b/i.test(n) || /\bport(ã|a)o\b/i.test(n)) { return null; }
    return null;
  }

  /** Extrai codigo tipo PRJ-0000 de um texto. */
  function extrairCodigo(txt) {
    const m = /\b([A-Z]{2,5}[-_]?\d{3,6})\b/.exec(String(txt || '').toUpperCase());
    return m ? m[1].replace('_', '-') : null;
  }

  function curvasDeTarefas(folhas) {
    const pv = {}, ev = {}, ac = {};
    folhas.forEach(function (t) {
      const perBase = U.periodoDe(t.baselineInicio || t.inicio);
      if (perBase && t.custoBaseline) { pv[perBase] = (pv[perBase] || 0) + t.custoBaseline; }
      const perIni = U.periodoDe(t.inicio);
      if (perIni && t.custoBaseline) {
        ev[perIni] = (ev[perIni] || 0) + t.custoBaseline * U.num(t.pct, 0) / 100;
      }
      const perReal = U.periodoDe(t.realInicio || t.inicio);
      if (perReal && t.custoReal) { ac[perReal] = (ac[perReal] || 0) + t.custoReal; }
    });
    const curvaPlanejada = Object.keys(pv).sort().map(function (k) {
      return { periodo: k, pv: U.arredondar(pv[k], 2) };
    });
    const periodosReal = U.uniq(Object.keys(ev).concat(Object.keys(ac))).sort();
    const curvaReal = periodosReal.map(function (k) {
      return { periodo: k, ev: U.arredondar(ev[k] || 0, 2), ac: U.arredondar(ac[k] || 0, 2) };
    });
    return { curvaPlanejada: curvaPlanejada, curvaReal: curvaReal };
  }

  /**
   * Monta um ProjetoCandidato a partir de tarefas normalizadas.
   * tarefas: [{uid, nome, nivel, resumo, marco, critico, inicio, fim,
   *            baselineInicio, baselineFim, custoBaseline, custoReal, trabalho,
   *            pct, realInicio, realFim, predecessores:[]}]
   */
  function candidatoDeTarefas(cfg) {
    const avisos = cfg.avisos || [];
    const tarefas = cfg.tarefas || [];
    const folhas = tarefas.filter(function (t) { return !t.resumo; });
    const base = folhas.length ? folhas : tarefas;

    const agreg = pctAgregado(base);
    avisos.push('Avanço físico agregado por ' + agreg.criterio + ' sobre ' + base.length + ' tarefa(s).');

    function minData(campo) {
      const vals = base.map(function (t) { return t[campo]; }).filter(Boolean).sort();
      return vals.length ? vals[0] : null;
    }
    function maxData(campo) {
      const vals = base.map(function (t) { return t[campo]; }).filter(Boolean).sort();
      return vals.length ? vals[vals.length - 1] : null;
    }

    const custoBase = U.sum(base, function (t) { return t.custoBaseline || 0; });
    const custoTotal = U.sum(base, function (t) { return t.custo || 0; });
    const custoReal = U.sum(base, function (t) { return t.custoReal || 0; });

    const bac = custoBase > 0 ? custoBase : custoTotal;
    if (custoBase <= 0 && custoTotal > 0) {
      avisos.push('Nenhuma tarefa tem custo de baseline; o BAC foi obtido do custo total previsto.');
    }

    const marcos = [];
    const gatesMap = {};
    tarefas.filter(function (t) { return t.marco; }).forEach(function (t, i) {
      const gid = gateDoMarco(t.nome);
      marcos.push(M.marcoVazio({
        id: U.uid('mrc'),
        nome: t.nome,
        gateId: gid,
        baselineData: t.baselineFim || t.baselineInicio || null,
        previstoData: t.fim || t.inicio || null,
        realData: t.realFim || null,
        critico: !!t.critico || !!gid,
        peso: gid ? 3 : 1
      }));
      if (gid && !gatesMap[gid]) {
        gatesMap[gid] = M.gateVazio({
          id: U.uid('gt'), gateId: gid,
          previstoData: t.fim || t.baselineFim || null,
          realData: t.realFim || null,
          decisao: t.realFim ? 'aprovado' : 'pendente',
          notas: 'Derivado do marco "' + t.nome + '" do arquivo importado.'
        });
      }
    });

    const curvas = curvasDeTarefas(base);

    const p = M.projetoVazio({
      codigo: cfg.codigo || '',
      nome: cfg.nome || '',
      descricao: cfg.descricao || '',
      dates: {
        previstoInicio: cfg.inicioProjeto || minData('inicio'),
        previstoFim: cfg.fimProjeto || maxData('fim'),
        baselineInicio: minData('baselineInicio'),
        baselineFim: maxData('baselineFim'),
        realInicio: minData('realInicio'),
        realFim: base.every(function (t) { return t.realFim; }) ? maxData('realFim') : null,
        dataStatus: cfg.dataStatus || null
      },
      progress: { pctFisico: U.arredondar(agreg.pct, 1) },
      finance: {
        custoBaseline: U.arredondar(bac, 2),
        custoReal: U.arredondar(custoReal, 2),
        curvaPlanejada: curvas.curvaPlanejada,
        curvaReal: curvas.curvaReal
      },
      marcos: marcos,
      gates: Object.keys(gatesMap).map(function (k) { return gatesMap[k]; }),
      // WBS completa preservada: é o que permite reexportar MSPDI com fidelidade
      tarefas: tarefas.map(function (t) {
        return M.tarefaVazia({
          uid: t.uid, nome: t.nome, nivel: t.nivel, outline: t.outline,
          resumo: !!t.resumo, marco: !!t.marco, critico: !!t.critico,
          inicio: t.inicio, fim: t.fim,
          realInicio: t.realInicio, realFim: t.realFim,
          baselineInicio: t.baselineInicio, baselineFim: t.baselineFim,
          custoBaseline: t.custoBaseline, custo: t.custo, custoReal: t.custoReal,
          trabalho: t.trabalho, duracaoHoras: t.duracaoHoras, pct: t.pct,
          predecessores: t.predecessores || []
        });
      })
    });

    if (!p.dates.baselineInicio && !p.dates.baselineFim) {
      avisos.push('O arquivo não contém linha de base (baseline). As datas de baseline ficaram vazias — ' +
        'não foram inventadas a partir do previsto.');
    }

    p._origem = {
      kind: cfg.kind, fileName: cfg.fileName,
      externalId: cfg.externalId || null, importadoEm: U.agoraIso()
    };
    p._confianca = cfg.confianca === undefined ? 0.85 : cfg.confianca;

    /* _campos declara EXATAMENTE o que este formato forneceu. A reconciliacao
       só compara estes caminhos. Sem isso, os valores default de projetoVazio()
       (estagio 'ideacao', gate 'g0', custos 0) seriam propostos como se tivessem
       vindo do arquivo — regredindo projetos em execucao para ideacao. */
    const forneceu = ['nome'];
    ['previstoInicio', 'previstoFim', 'baselineInicio', 'baselineFim', 'realInicio', 'realFim', 'dataStatus']
      .forEach(function (k) { if (p.dates[k]) { forneceu.push('dates.' + k); } });
    forneceu.push('progress.pctFisico');
    if (p.finance.custoBaseline > 0) { forneceu.push('finance.custoBaseline'); }
    if (p.finance.custoReal > 0) { forneceu.push('finance.custoReal'); }
    if (p.tarefas.length) { forneceu.push('tarefas'); }
    if (marcos.length) { forneceu.push('marcos'); }
    if (p.gates.length) { forneceu.push('gates'); }
    if (p.finance.curvaPlanejada.length) { forneceu.push('finance.curvaPlanejada'); }
    if (p.finance.curvaReal.length) { forneceu.push('finance.curvaReal'); }
    if (cfg.descricao) { forneceu.push('descricao'); }
    p._campos = forneceu;
    p._bruto = {
      totalTarefas: tarefas.length,
      tarefasFolha: folhas.length,
      marcos: marcos.length,
      recursos: cfg.recursos || 0,
      criterioPct: agreg.criterio,
      amostraTarefas: tarefas.slice(0, 60).map(function (t) {
        return {
          uid: t.uid, nome: t.nome, nivel: t.nivel, resumo: !!t.resumo, marco: !!t.marco,
          inicio: t.inicio, fim: t.fim, pct: t.pct,
          custoBaseline: t.custoBaseline, custoReal: t.custoReal
        };
      })
    };
    return p;
  }

  /* ============================================================== MSPDI */

  imp.lerMspdi = function (texto, fileName) {
    const avisos = [];
    const erros = [];
    const r = U.parseXml(texto);
    if (!r.doc) {
      erros.push('XML inválido: ' + r.erro);
      return { projetosCandidatos: [], avisos: avisos, erros: erros, meta: {} };
    }
    const raiz = r.doc.documentElement;

    const nomeProj = U.xmlTexto(raiz, 'Name');
    const titulo = U.xmlTexto(raiz, 'Title');
    const autor = U.xmlTexto(raiz, 'Author');
    const gerente = U.xmlTexto(raiz, 'Manager');
    const empresa = U.xmlTexto(raiz, 'Company');
    const palavras = U.xmlTexto(raiz, 'Keywords');
    const assunto = U.xmlTexto(raiz, 'Subject');

    const codigo = extrairCodigo(fileName) || extrairCodigo(titulo) || extrairCodigo(nomeProj) ||
      extrairCodigo(palavras) || extrairCodigo(assunto);
    let confianca = 0.9;
    if (!codigo) {
      confianca = 0.55;
      avisos.push('Não encontrei um código de projeto (padrão tipo PRJ-0000) no nome do arquivo nem ' +
        'nos metadados. O projeto será tratado como novo — confira antes de aplicar.');
    }

    const tarefas = [];
    U.xmlTodos(raiz, 'Task').forEach(function (no) {
      const uid = U.xmlTexto(no, 'UID');
      const nome = U.xmlTexto(no, 'Name');
      if (!nome && !uid) { return; }
      if (uid === '0') { return; }  // tarefa raiz do projeto

      let bIni = null, bFim = null, bCusto = 0, bTrab = 0;
      U.xmlFilhos(no, 'Baseline').forEach(function (b) {
        const num = U.xmlTexto(b, 'Number');
        if (num !== '' && num !== '0') { return; }
        bIni = U.parseDate(U.xmlTexto(b, 'Start')) || bIni;
        bFim = U.parseDate(U.xmlTexto(b, 'Finish')) || bFim;
        const cst = U.num(U.xmlTexto(b, 'Cost'), 0);
        if (cst) { bCusto = cst; }
        const trb = U.duracaoIsoParaHoras(U.xmlTexto(b, 'Work'));
        if (trb) { bTrab = trb; }
      });

      const preds = [];
      U.xmlFilhos(no, 'PredecessorLink').forEach(function (pl) {
        preds.push({
          uid: U.xmlTexto(pl, 'PredecessorUID'),
          tipo: U.xmlTexto(pl, 'Type'),
          lag: U.num(U.xmlTexto(pl, 'LinkLag'), 0)
        });
      });

      tarefas.push({
        uid: uid,
        nome: nome,
        nivel: U.num(U.xmlTexto(no, 'OutlineLevel'), 1),
        outline: U.xmlTexto(no, 'OutlineNumber'),
        resumo: U.xmlTexto(no, 'Summary') === '1',
        marco: U.xmlTexto(no, 'Milestone') === '1',
        critico: U.xmlTexto(no, 'Critical') === '1',
        inicio: U.parseDate(U.xmlTexto(no, 'Start')),
        fim: U.parseDate(U.xmlTexto(no, 'Finish')),
        realInicio: U.parseDate(U.xmlTexto(no, 'ActualStart')),
        realFim: U.parseDate(U.xmlTexto(no, 'ActualFinish')),
        baselineInicio: bIni,
        baselineFim: bFim,
        custoBaseline: bCusto,
        custo: U.num(U.xmlTexto(no, 'Cost'), 0) || U.num(U.xmlTexto(no, 'FixedCost'), 0),
        custoReal: U.num(U.xmlTexto(no, 'ActualCost'), 0),
        trabalho: U.duracaoIsoParaHoras(U.xmlTexto(no, 'Work')) || bTrab,
        duracaoHoras: U.duracaoIsoParaHoras(U.xmlTexto(no, 'Duration')),
        pct: U.num(U.xmlTexto(no, 'PercentComplete'), 0) ||
          U.num(U.xmlTexto(no, 'PercentWorkComplete'), 0),
        predecessores: preds
      });
    });

    if (!tarefas.length) {
      erros.push('Nenhuma tarefa encontrada no arquivo MSPDI.');
      return { projetosCandidatos: [], avisos: avisos, erros: erros, meta: {} };
    }

    const recursos = U.xmlTodos(raiz, 'Resource').filter(function (n) {
      return U.xmlTexto(n, 'Name');
    }).length;

    const cand = candidatoDeTarefas({
      kind: 'mspdi', fileName: fileName,
      codigo: codigo,
      nome: titulo || nomeProj || String(fileName || '').replace(/\.[^.]+$/, ''),
      descricao: assunto || '',
      inicioProjeto: U.parseDate(U.xmlTexto(raiz, 'StartDate')),
      fimProjeto: U.parseDate(U.xmlTexto(raiz, 'FinishDate')),
      dataStatus: U.parseDate(U.xmlTexto(raiz, 'StatusDate')),
      externalId: U.xmlTexto(raiz, 'UID') || nomeProj || null,
      recursos: recursos,
      confianca: confianca,
      tarefas: tarefas,
      avisos: avisos
    });
    cand._bruto.cabecalho = { nomeProj: nomeProj, titulo: titulo, autor: autor,
      gerente: gerente, empresa: empresa, moeda: U.xmlTexto(raiz, 'CurrencyCode') };

    return { projetosCandidatos: [cand], avisos: avisos, erros: erros,
      meta: { autor: autor, empresa: empresa, gerente: gerente } };
  };

  /* ================================================================ XER */

  /** Parser generico de XER. Tolerante a linhas com contagem de coluna divergente. */
  imp.parseXer = function (texto) {
    const avisos = [];
    const tabelas = {};
    let atual = null;
    const linhas = String(texto || '').split(/\r?\n/);

    linhas.forEach(function (linha, idx) {
      if (!linha) { return; }
      const c = linha.split('\t');
      const tag = c[0];
      if (tag === 'ERMHDR') {
        tabelas.__cabecalho = c.slice(1);
        return;
      }
      if (tag === '%T') {
        atual = { nome: c[1], campos: [], linhas: [] };
        tabelas[c[1]] = atual;
        return;
      }
      if (tag === '%F') {
        if (!atual) { return; }
        atual.campos = c.slice(1).map(function (x) { return String(x).trim(); });
        return;
      }
      if (tag === '%R') {
        if (!atual || !atual.campos.length) { return; }
        const vals = c.slice(1);
        if (vals.length !== atual.campos.length) {
          avisos.push('XER linha ' + (idx + 1) + ' da tabela ' + atual.nome + ': ' + vals.length +
            ' valores para ' + atual.campos.length + ' colunas — ajustado.');
        }
        const o = {};
        atual.campos.forEach(function (nome, i) { o[nome] = vals[i] === undefined ? '' : vals[i]; });
        atual.linhas.push(o);
        return;
      }
      if (tag === '%E') { atual = null; }
    });
    return { tabelas: tabelas, avisos: avisos };
  };

  imp.lerXer = function (texto, fileName) {
    const avisos = [];
    const erros = [];
    const res = imp.parseXer(texto);
    avisos.push.apply(avisos, res.avisos.slice(0, 12));
    const T = res.tabelas;

    if (!T.PROJECT || !T.PROJECT.linhas.length) {
      erros.push('XER sem tabela PROJECT — não consigo identificar o projeto.');
      return { projetosCandidatos: [], avisos: avisos, erros: erros, meta: {} };
    }

    const tarefasPorProj = U.groupBy((T.TASK && T.TASK.linhas) || [], function (t) { return t.proj_id; });
    const candidatos = [];

    T.PROJECT.linhas.forEach(function (proj) {
      const brutas = tarefasPorProj[proj.proj_id] || [];
      if (!brutas.length) {
        avisos.push('Projeto ' + (proj.proj_short_name || proj.proj_id) + ' sem atividades — ignorado.');
        return;
      }
      const tarefas = brutas.map(function (t) {
        const tipo = String(t.task_type || '');
        const st = String(t.status_code || '');
        const pct = U.num(t.phys_complete_pct, 0);
        return {
          uid: t.task_id,
          nome: t.task_name || t.task_code,
          nivel: 1,
          resumo: false,
          marco: /Mile/i.test(tipo),
          critico: String(t.driving_path_flag || '').toUpperCase() === 'Y',
          inicio: U.parseDate(t.act_start_date || t.target_start_date || t.early_start_date),
          fim: U.parseDate(t.act_end_date || t.target_end_date || t.early_end_date),
          realInicio: U.parseDate(t.act_start_date),
          realFim: U.parseDate(t.act_end_date),
          baselineInicio: U.parseDate(t.target_start_date),
          baselineFim: U.parseDate(t.target_end_date),
          custoBaseline: U.num(t.target_cost, 0),
          custo: U.num(t.target_cost, 0),
          custoReal: U.num(t.act_reg_cost, 0) + U.num(t.act_ot_cost, 0),
          trabalho: U.num(t.target_drtn_hr_cnt, 0),
          duracaoHoras: U.num(t.target_drtn_hr_cnt, 0),
          pct: st === 'TK_Complete' ? 100 : (st === 'TK_NotStart' ? 0 : pct),
          predecessores: []
        };
      });

      // custos podem vir em TASKRSRC quando TASK.target_cost esta zerado
      const semCusto = tarefas.every(function (t) { return !t.custoBaseline; });
      if (semCusto && T.TASKRSRC && T.TASKRSRC.linhas.length) {
        const porTarefa = U.groupBy(T.TASKRSRC.linhas, function (x) { return x.task_id; });
        tarefas.forEach(function (t) {
          const rs = porTarefa[t.uid] || [];
          t.custoBaseline = U.sum(rs, function (x) { return U.num(x.target_cost, 0); });
          t.custo = t.custoBaseline;
          t.custoReal = U.sum(rs, function (x) { return U.num(x.act_reg_cost, 0); });
        });
        avisos.push('Custos obtidos da tabela TASKRSRC (atribuições de recurso), pois TASK.target_cost estava vazio.');
      }

      if (T.TASKPRED && T.TASKPRED.linhas.length) {
        const idx = U.indexarPor(tarefas, 'uid');
        T.TASKPRED.linhas.forEach(function (rel) {
          const suc = idx[rel.task_id];
          if (suc) {
            suc.predecessores.push({ uid: rel.pred_task_id, tipo: rel.pred_type,
              lag: U.num(rel.lag_hr_cnt, 0) / 8 });
          }
        });
      }

      const codigo = extrairCodigo(proj.proj_short_name) || extrairCodigo(fileName) ||
        (proj.proj_short_name || null);
      const nome = (T.PROJWBS && (T.PROJWBS.linhas.find(function (w) {
        return w.proj_id === proj.proj_id && (!w.parent_wbs_id || w.parent_wbs_id === '');
      }) || {}).wbs_name) || proj.proj_short_name || 'Projeto importado do XER';

      const cand = candidatoDeTarefas({
        kind: 'xer', fileName: fileName,
        codigo: codigo, nome: nome,
        inicioProjeto: U.parseDate(proj.plan_start_date),
        fimProjeto: U.parseDate(proj.scd_end_date || proj.plan_end_date),
        dataStatus: U.parseDate(proj.last_recalc_date),
        externalId: proj.proj_id,
        recursos: (T.RSRC && T.RSRC.linhas.length) || 0,
        confianca: codigo ? 0.86 : 0.5,
        tarefas: tarefas,
        avisos: avisos
      });
      cand._bruto.wbs = ((T.PROJWBS && T.PROJWBS.linhas) || [])
        .filter(function (w) { return w.proj_id === proj.proj_id; })
        .map(function (w) { return { id: w.wbs_id, pai: w.parent_wbs_id, nome: w.wbs_name }; });
      cand._bruto.tabelas = Object.keys(T).filter(function (k) { return k.indexOf('__') !== 0; })
        .map(function (k) { return k + ':' + T[k].linhas.length; });
      candidatos.push(cand);
    });

    return { projetosCandidatos: candidatos, avisos: avisos, erros: erros,
      meta: { tabelas: Object.keys(T) } };
  };

  /* ============================================================== PMXML */

  imp.lerPmxml = function (texto, fileName) {
    const avisos = [];
    const erros = [];
    const r = U.parseXml(texto);
    if (!r.doc) {
      erros.push('XML inválido: ' + r.erro);
      return { projetosCandidatos: [], avisos: avisos, erros: erros, meta: {} };
    }
    const projetos = U.xmlTodos(r.doc.documentElement, 'Project');
    if (!projetos.length) {
      erros.push('PMXML sem elemento <Project>.');
      return { projetosCandidatos: [], avisos: avisos, erros: erros, meta: {} };
    }
    const candidatos = [];

    projetos.forEach(function (proj) {
      const ativs = U.xmlTodos(proj, 'Activity');
      if (!ativs.length) {
        avisos.push('Projeto PMXML sem atividades — ignorado.');
        return;
      }
      const tarefas = ativs.map(function (a) {
        const tipo = U.xmlTexto(a, 'Type');
        const st = U.xmlTexto(a, 'Status');
        return {
          uid: U.xmlTexto(a, 'ObjectId') || U.xmlTexto(a, 'Id'),
          nome: U.xmlTexto(a, 'Name') || U.xmlTexto(a, 'Id'),
          nivel: 1,
          resumo: false,
          marco: /Milestone/i.test(tipo),
          critico: U.xmlTexto(a, 'CriticalPath') === 'true',
          inicio: U.parseDate(U.xmlTexto(a, 'ActualStartDate') || U.xmlTexto(a, 'PlannedStartDate')),
          fim: U.parseDate(U.xmlTexto(a, 'ActualFinishDate') || U.xmlTexto(a, 'PlannedFinishDate')),
          realInicio: U.parseDate(U.xmlTexto(a, 'ActualStartDate')),
          realFim: U.parseDate(U.xmlTexto(a, 'ActualFinishDate')),
          baselineInicio: U.parseDate(U.xmlTexto(a, 'PlannedStartDate')),
          baselineFim: U.parseDate(U.xmlTexto(a, 'PlannedFinishDate')),
          custoBaseline: U.num(U.xmlTexto(a, 'AtCompletionCost'), 0) ||
            U.num(U.xmlTexto(a, 'PlannedTotalCost'), 0),
          custo: U.num(U.xmlTexto(a, 'AtCompletionCost'), 0),
          custoReal: U.num(U.xmlTexto(a, 'ActualCost'), 0) ||
            U.num(U.xmlTexto(a, 'ActualTotalCost'), 0),
          trabalho: U.num(U.xmlTexto(a, 'PlannedDuration'), 0),
          duracaoHoras: U.num(U.xmlTexto(a, 'PlannedDuration'), 0),
          pct: /Completed/i.test(st) ? 100
            : (/NotStarted/i.test(st) ? 0 : U.num(U.xmlTexto(a, 'PercentComplete'), 0)),
          predecessores: []
        };
      });

      const id = U.xmlTexto(proj, 'Id');
      const codigo = extrairCodigo(id) || extrairCodigo(fileName) || id || null;
      const cand = candidatoDeTarefas({
        kind: 'pmxml', fileName: fileName,
        codigo: codigo,
        nome: U.xmlTexto(proj, 'Name') || id || 'Projeto importado do PMXML',
        inicioProjeto: U.parseDate(U.xmlTexto(proj, 'PlannedStartDate')),
        fimProjeto: U.parseDate(U.xmlTexto(proj, 'MustFinishByDate') ||
          U.xmlTexto(proj, 'ScheduledFinishDate')),
        dataStatus: U.parseDate(U.xmlTexto(proj, 'DataDate')),
        externalId: U.xmlTexto(proj, 'ObjectId') || id,
        confianca: codigo ? 0.84 : 0.5,
        tarefas: tarefas,
        avisos: avisos
      });
      cand._bruto.wbs = U.xmlTodos(proj, 'WBS').map(function (w) {
        return { id: U.xmlTexto(w, 'ObjectId'), nome: U.xmlTexto(w, 'Name'), codigo: U.xmlTexto(w, 'Code') };
      });
      candidatos.push(cand);
    });

    return { projetosCandidatos: candidatos, avisos: avisos, erros: erros, meta: {} };
  };

  /* ====================================================== CSV / tabular */

  imp.SINONIMOS_COLUNA = {
    codigo: ['codigo', 'cod', 'id', 'projectid', 'idprojeto', 'wbs', 'taskcode', 'chave'],
    nome: ['nome', 'name', 'titulo', 'projeto', 'nomeprojeto', 'descricaoprojeto'],
    programaNome: ['programa', 'program', 'portfolio', 'programaid'],
    pmNome: ['gerente', 'gerenteprojeto', 'pm', 'responsavel', 'projectmanager', 'owner', 'gp'],
    sponsorNome: ['sponsor', 'patrocinador', 'executivo'],
    buNome: ['unidade', 'unidadenegocio', 'bu', 'area', 'departamento', 'diretoria'],
    categoria: ['categoria', 'category', 'classe'],
    tipo: ['tipo', 'type', 'natureza'],
    estagio: ['estagio', 'fase', 'stage', 'phase', 'situacao', 'status'],
    gateAtual: ['gate', 'portao', 'gateatual'],
    prioridade: ['prioridade', 'priority', 'prio'],
    'dates.previstoInicio': ['inicioprevisto', 'inicio', 'datainicio', 'start', 'startdate', 'previstoinicio'],
    'dates.previstoFim': ['fimprevisto', 'fim', 'datafim', 'termino', 'finish', 'finishdate',
      'previstotermino', 'previsaotermino', 'previsaodetermino', 'datatermino'],
    'dates.baselineInicio': ['iniciobaseline', 'baselinestart', 'iniciolinhabase'],
    'dates.baselineFim': ['fimbaseline', 'baselinefinish', 'terminobaseline', 'fimlinhabase'],
    'dates.realInicio': ['inicioreal', 'actualstart', 'iniciorealizado'],
    'dates.realFim': ['fimreal', 'actualfinish', 'terminoreal'],
    'dates.dataStatus': ['datastatus', 'datadedados', 'datadate', 'statusdate', 'dataposicao'],
    'progress.pctFisico': ['percentualfisico', 'pctfisico', 'percfisico', 'avancofisico',
      'percentcomplete', 'avanco', 'progresso', 'percentual', 'concluido',
      'percentualconcluido', 'perccompleto', 'avancoreal'],
    'finance.orcamentoCapex': ['capex', 'orcamentocapex', 'investimento'],
    'finance.orcamentoOpex': ['opex', 'orcamentoopex', 'custeio'],
    'finance.custoBaseline': ['bac', 'orcamento', 'orcamentototal', 'budget', 'custobaseline', 'valortotal'],
    'finance.custoReal': ['custoreal', 'realizado', 'custorealizado', 'ac', 'actualcost',
      'custorealacumulado', 'gastoacumulado'],
    'finance.comprometido': ['comprometido', 'empenhado', 'committed', 'custocomprometido'],
    ragManual: ['rag', 'saude', 'farol', 'semaforo', 'statusrag'],
    descricao: ['descricao', 'objetivo', 'escopo', 'observacao', 'obs', 'comentario'],
    beneficioEsperado: ['beneficio', 'beneficioesperado', 'valoresperado', 'benefit'],
    driverNome: ['driver', 'driverestrategico', 'direcionador', 'objetivoestrategico'],
    // colunas de curva financeira mensal
    periodo: ['periodo', 'mes', 'competencia', 'anomes', 'period'],
    pv: ['pv', 'valorplanejado', 'planejado', 'plannedvalue'],
    ev: ['ev', 'valoragregado', 'agregado', 'earnedvalue'],
    ac: ['ac', 'custoreal', 'realizado', 'actualcost']
  };

  function normCab(h) {
    return U.normalizar(h).replace(/[^a-z0-9]/g, '');
  }

  /** Mapeia cabecalho -> campo do modelo. Devolve { mapa, naoMapeadas }. */
  imp.mapearColunas = function (cabecalho, dicionario) {
    const dic = dicionario || imp.SINONIMOS_COLUNA;
    const mapa = {};
    const naoMapeadas = [];
    const usados = {};
    (cabecalho || []).forEach(function (h, i) {
      const n = normCab(h);
      if (!n) { return; }
      let achou = null;
      Object.keys(dic).forEach(function (campo) {
        if (achou || usados[campo]) { return; }
        if (dic[campo].indexOf(n) >= 0) { achou = campo; }
      });
      if (achou) { mapa[i] = achou; usados[achou] = true; }
      else { naoMapeadas.push(h); }
    });
    return { mapa: mapa, naoMapeadas: naoMapeadas };
  };

  /* Dicionario restrito da aba de curva financeira mensal.
     Precisa ser separado porque "AC" e "Realizado" tambem sao sinonimos de
     finance.custoReal no dicionario geral — numa aba de curva eles significam
     o custo real DO PERIODO, nao o acumulado do projeto. */
  const DICT_CURVA = {
    codigo: imp.SINONIMOS_COLUNA.codigo,
    periodo: imp.SINONIMOS_COLUNA.periodo,
    pv: ['pv', 'valorplanejado', 'planejado', 'plannedvalue'],
    ev: ['ev', 'valoragregado', 'agregado', 'earnedvalue'],
    ac: ['ac', 'custoreal', 'realizado', 'actualcost', 'custorealizado']
  };

  const MAPA_RAG = {
    verde: 'verde', green: 'verde', g: 'verde', ok: 'verde', bom: 'verde',
    ambar: 'ambar', amber: 'ambar', amarelo: 'ambar', y: 'ambar', atencao: 'ambar', alerta: 'ambar',
    vermelho: 'vermelho', red: 'vermelho', r: 'vermelho', critico: 'vermelho',
    azul: 'azul', blue: 'azul', concluido: 'azul', encerrado: 'azul',
    cinza: 'cinza', grey: 'cinza', gray: 'cinza', hold: 'cinza', suspenso: 'cinza'
  };
  const MAPA_CATEGORIA = {
    run: 'run', manter: 'run', sustentacao: 'run', obrigatorio: 'run',
    grow: 'grow', crescer: 'grow', crescimento: 'grow', evoluir: 'grow',
    transform: 'transform', transformar: 'transform', transformacao: 'transform'
  };

  function acharPorNome(lista, texto, campoNome) {
    const alvo = U.normalizar(texto);
    if (!alvo) { return null; }
    const achado = (lista || []).find(function (x) {
      return U.normalizar(x[campoNome || 'nome']) === alvo;
    });
    return achado ? achado.id : null;
  }

  /**
   * Converte uma matriz tabular em candidatos.
   * Reconhece dois formatos: linhas de PROJETO, ou linhas de CURVA (codigo+periodo+pv/ev/ac).
   */
  imp.lerMatriz = function (matriz, fileName, kind, nomeAba) {
    const avisos = [];
    const erros = [];
    if (!matriz || matriz.length < 2) {
      erros.push('Tabela sem linhas de dados' + (nomeAba ? ' na aba "' + nomeAba + '"' : '') + '.');
      return { projetosCandidatos: [], curvas: {}, avisos: avisos, erros: erros };
    }
    const cab = matriz[0].map(function (x) { return String(x === null || x === undefined ? '' : x); });

    // Duas passadas: a aba de curva mensal tem prioridade e dicionario proprio.
    const mmCurva = imp.mapearColunas(cab, DICT_CURVA);
    const camposCurva = Object.keys(mmCurva.mapa).map(function (k) { return mmCurva.mapa[k]; });
    const ehCurva = camposCurva.indexOf('periodo') >= 0 && camposCurva.indexOf('codigo') >= 0 &&
      (camposCurva.indexOf('pv') >= 0 || camposCurva.indexOf('ev') >= 0 || camposCurva.indexOf('ac') >= 0);

    const mm = ehCurva ? mmCurva : imp.mapearColunas(cab);
    const mapa = mm.mapa;
    const campos = Object.keys(mapa).map(function (k) { return mapa[k]; });

    if (mm.naoMapeadas.length) {
      avisos.push('Colunas ignoradas' + (nomeAba ? ' em "' + nomeAba + '"' : '') + ': ' +
        mm.naoMapeadas.slice(0, 10).join(', ') + (mm.naoMapeadas.length > 10 ? '…' : '') + '.');
    }
    if (campos.indexOf('codigo') < 0 && campos.indexOf('nome') < 0) {
      erros.push('Não encontrei coluna de código nem de nome' + (nomeAba ? ' em "' + nomeAba + '"' : '') +
        '. Colunas lidas: ' + cab.slice(0, 12).join(', ') + '.');
      return { projetosCandidatos: [], curvas: {}, avisos: avisos, erros: erros };
    }

    const b = PMO.store ? PMO.store.state : M.portfolioVazio();
    const candidatos = [];
    const curvas = {};

    for (let li = 1; li < matriz.length; li++) {
      const linha = matriz[li];
      if (!linha || !linha.some(function (v) { return String(v === null || v === undefined ? '' : v).trim(); })) { continue; }

      const vals = {};
      Object.keys(mapa).forEach(function (ci) {
        vals[mapa[ci]] = linha[ci] === undefined || linha[ci] === null ? '' : linha[ci];
      });

      if (ehCurva) {
        const cod = String(vals.codigo || '').trim();
        const per = U.periodoDe(U.parseDate(vals.periodo)) ||
          (/^\d{4}-\d{2}$/.test(String(vals.periodo).trim()) ? String(vals.periodo).trim() : null);
        if (!cod || !per) { continue; }
        if (!curvas[cod]) { curvas[cod] = { planejada: [], real: [] }; }
        if (vals.pv !== undefined && vals.pv !== '') {
          curvas[cod].planejada.push({ periodo: per, pv: U.num(vals.pv, 0) });
        }
        if ((vals.ev !== undefined && vals.ev !== '') || (vals.ac !== undefined && vals.ac !== '')) {
          curvas[cod].real.push({ periodo: per, ev: U.num(vals.ev, 0), ac: U.num(vals.ac, 0) });
        }
        continue;
      }

      const cod = String(vals.codigo || '').trim();
      const nome = String(vals.nome || '').trim();
      if (!cod && !nome) {
        avisos.push('Linha ' + (li + 1) + ' descartada: sem código e sem nome.');
        continue;
      }

      const p = M.projetoVazio({ codigo: cod, nome: nome || cod });
      if (vals.descricao) { p.descricao = String(vals.descricao); }
      if (vals.prioridade !== undefined && vals.prioridade !== '') {
        p.prioridade = U.clamp(Math.round(U.num(vals.prioridade, 3)), 1, 5);
      }
      if (vals.categoria) {
        p.categoria = MAPA_CATEGORIA[U.normalizar(vals.categoria).replace(/[^a-z]/g, '')] || p.categoria;
      }
      if (vals.tipo) {
        const t = U.normalizar(vals.tipo);
        const achado = M.tax('tipos').find(function (x) {
          return U.normalizar(x.rotulo).indexOf(t) >= 0 || x.id === t;
        });
        if (achado) { p.tipo = achado.id; }
      }
      if (vals.estagio) {
        const t = U.normalizar(vals.estagio);
        const achado = M.tax('estagios').find(function (x) {
          return x.id === t || U.normalizar(x.rotulo) === t;
        });
        if (achado) {
          p.estagio = achado.id;
          if (achado.gate) { p.gateAtual = achado.gate; }
        }
      }
      if (vals.gateAtual) {
        const g = M.gatePorId(String(vals.gateAtual).trim().toUpperCase());
        if (g) { p.gateAtual = g.id; }
      }
      if (vals.ragManual) {
        const rr = MAPA_RAG[U.normalizar(vals.ragManual).replace(/[^a-z]/g, '')];
        if (rr) {
          p.ragManual = rr;
          p.ragJustificativa = 'Farol informado na planilha importada (' + fileName + ').';
        }
      }
      ['dates.previstoInicio', 'dates.previstoFim', 'dates.baselineInicio', 'dates.baselineFim',
        'dates.realInicio', 'dates.realFim', 'dates.dataStatus'].forEach(function (ch) {
        if (vals[ch] !== undefined && vals[ch] !== '') {
          const d = U.parseDate(vals[ch]);
          if (d) { U.setCampo(p, ch, d); }
          else { avisos.push('Linha ' + (li + 1) + ': data inválida em ' + ch + ' ("' + vals[ch] + '") — ignorada.'); }
        }
      });
      if (vals['progress.pctFisico'] !== undefined && vals['progress.pctFisico'] !== '') {
        let pct = U.num(vals['progress.pctFisico'], 0);
        if (pct > 0 && pct <= 1) { pct = pct * 100; }   // planilha em fracao
        p.progress.pctFisico = U.clamp(pct, 0, 100);
      }
      ['finance.orcamentoCapex', 'finance.orcamentoOpex', 'finance.custoBaseline',
        'finance.custoReal', 'finance.comprometido'].forEach(function (ch) {
        if (vals[ch] !== undefined && vals[ch] !== '') { U.setCampo(p, ch, U.num(vals[ch], 0)); }
      });
      if (!p.finance.custoBaseline) {
        p.finance.custoBaseline = p.finance.orcamentoCapex + p.finance.orcamentoOpex;
      }
      if (vals.programaNome) {
        const pid = acharPorNome(b.programas, vals.programaNome) ||
          acharPorNome(b.programas, vals.programaNome, 'codigo');
        if (pid) { p.programaId = pid; }
        else { avisos.push('Linha ' + (li + 1) + ': programa "' + vals.programaNome + '" não existe no cadastro — projeto ficou sem programa.'); }
      }
      if (vals.pmNome) {
        const id = acharPorNome(b.pessoas, vals.pmNome);
        if (id) { p.pmId = id; }
        else { avisos.push('Linha ' + (li + 1) + ': gerente "' + vals.pmNome + '" não está cadastrado.'); }
      }
      if (vals.sponsorNome) {
        const id = acharPorNome(b.pessoas, vals.sponsorNome);
        if (id) { p.sponsorId = id; }
      }
      if (vals.buNome) {
        const lista = (b.settings || {}).unidadesNegocio || [];
        const id = acharPorNome(lista, vals.buNome) || acharPorNome(lista, vals.buNome, 'sigla');
        if (id) { p.buId = id; }
      }
      if (vals.beneficioEsperado !== undefined && vals.beneficioEsperado !== '') {
        const v = U.num(vals.beneficioEsperado, 0);
        if (v) {
          p.beneficios = [M.beneficioVazio({
            nome: 'Benefício informado na importação', tipo: 'reducao-custo', valorEsperado: v
          })];
        }
      }

      p._origem = { kind: kind, fileName: fileName, externalId: cod || null, importadoEm: U.agoraIso() };
      p._confianca = cod ? 0.8 : 0.45;
      p._bruto = { linha: li + 1, aba: nomeAba || null, valores: vals };

      /* _campos: somente as colunas que existiam NESTA linha com valor.
         Uma planilha de atualização de status não deve regredir estágio, gate
         ou orçamento só porque não trouxe essas colunas. */
      const ALVO_MODELO = {
        nome: 'nome', descricao: 'descricao', prioridade: 'prioridade',
        categoria: 'categoria', tipo: 'tipo', estagio: 'estagio', gateAtual: 'gateAtual',
        ragManual: 'ragManual', programaNome: 'programaId', pmNome: 'pmId',
        sponsorNome: 'sponsorId', buNome: 'buId'
      };
      const forneceu = [];
      Object.keys(vals).forEach(function (chave) {
        const v = vals[chave];
        if (v === '' || v === null || v === undefined) { return; }
        const alvo = ALVO_MODELO[chave] || (chave.indexOf('.') >= 0 ? chave : null);
        if (alvo && forneceu.indexOf(alvo) < 0) { forneceu.push(alvo); }
      });
      // BAC derivado de CAPEX+OPEX conta como fornecido
      if (forneceu.indexOf('finance.custoBaseline') < 0 &&
          (forneceu.indexOf('finance.orcamentoCapex') >= 0 || forneceu.indexOf('finance.orcamentoOpex') >= 0)) {
        forneceu.push('finance.custoBaseline');
      }
      p._campos = forneceu;
      candidatos.push(p);
    }

    return { projetosCandidatos: candidatos, curvas: curvas, avisos: avisos, erros: erros };
  };

  imp.lerCsv = function (texto, fileName) {
    const delim = U.detectarDelim(texto);
    const matriz = U.csvParse(texto, delim);
    const r = imp.lerMatriz(matriz, fileName, 'csv', null);
    r.avisos.unshift('CSV lido com delimitador "' + (delim === '\t' ? 'TAB' : delim) + '" e ' +
      Math.max(0, matriz.length - 1) + ' linha(s) de dados.');
    r.meta = { delimitador: delim, linhas: matriz.length };
    return r;
  };

  /* =============================================== XLSX (ZIP + OOXML) */

  function leUint16(b, o) { return b[o] | (b[o + 1] << 8); }
  function leUint32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216;
  }

  /** Le o diretorio central de um ZIP. Devolve [{nome, metodo, offset, tamComp, tamOrig}]. */
  function lerDiretorioZip(b) {
    const limite = Math.max(0, b.length - 66000);
    let eocd = -1;
    for (let i = b.length - 22; i >= limite; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) { throw new Error('não encontrei o fim do diretório central (o arquivo não é um ZIP válido)'); }
    const total = leUint16(b, eocd + 10);
    let off = leUint32(b, eocd + 16);
    const entradas = [];
    for (let n = 0; n < total; n++) {
      if (off + 46 > b.length) { break; }
      if (!(b[off] === 0x50 && b[off + 1] === 0x4B && b[off + 2] === 0x01 && b[off + 3] === 0x02)) { break; }
      const metodo = leUint16(b, off + 10);
      const tamComp = leUint32(b, off + 20);
      const tamOrig = leUint32(b, off + 24);
      const nLen = leUint16(b, off + 28);
      const eLen = leUint16(b, off + 30);
      const cLen = leUint16(b, off + 32);
      const localOff = leUint32(b, off + 42);
      const nome = new TextDecoder('utf-8').decode(b.subarray(off + 46, off + 46 + nLen));
      entradas.push({ nome: nome, metodo: metodo, tamComp: tamComp, tamOrig: tamOrig, localOff: localOff });
      off += 46 + nLen + eLen + cLen;
    }
    return entradas;
  }

  async function extrairEntrada(b, ent) {
    const o = ent.localOff;
    if (!(b[o] === 0x50 && b[o + 1] === 0x4B && b[o + 2] === 0x03 && b[o + 3] === 0x04)) {
      throw new Error('cabeçalho local inválido para ' + ent.nome);
    }
    const nLen = leUint16(b, o + 26);
    const eLen = leUint16(b, o + 28);
    const inicio = o + 30 + nLen + eLen;
    const dados = b.subarray(inicio, inicio + ent.tamComp);
    if (ent.metodo === 0) { return new TextDecoder('utf-8').decode(dados); }
    if (ent.metodo !== 8) { throw new Error('método de compressão ' + ent.metodo + ' não suportado'); }
    if (typeof DecompressionStream !== 'function') {
      throw new Error('este navegador não suporta descompactação nativa (DecompressionStream). ' +
        'Exporte a planilha como CSV.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([dados]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new TextDecoder('utf-8').decode(buf);
  }

  function refParaColuna(ref) {
    const m = /^([A-Z]+)/.exec(String(ref || '').toUpperCase());
    if (!m) { return 0; }
    let n = 0;
    for (let i = 0; i < m[1].length; i++) { n = n * 26 + (m[1].charCodeAt(i) - 64); }
    return n - 1;
  }
  function refParaLinha(ref) {
    const m = /(\d+)$/.exec(String(ref || ''));
    return m ? parseInt(m[1], 10) - 1 : 0;
  }

  /** Serial de data do Excel -> ISO. Epoch 1899-12-30. */
  function serialParaIso(n) {
    const dias = Math.floor(U.num(n, 0));
    if (dias < 20000 || dias > 80000) { return null; }
    const ms = Date.UTC(1899, 11, 30) + dias * 86400000;
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }
  imp.serialExcelParaIso = serialParaIso;

  imp.lerXlsx = async function (bytes, fileName) {
    const avisos = [];
    const erros = [];
    let entradas;
    try { entradas = lerDiretorioZip(bytes); }
    catch (e) {
      erros.push('Não consegui abrir a planilha: ' + (e.message || e));
      return { projetosCandidatos: [], curvas: {}, avisos: avisos, erros: erros, meta: {} };
    }

    const porNome = {};
    entradas.forEach(function (e) { porNome[e.nome] = e; });

    async function texto(nome) {
      const e = porNome[nome];
      if (!e) { return null; }
      try { return await extrairEntrada(bytes, e); }
      catch (err) { avisos.push('Falha ao ler "' + nome + '": ' + (err.message || err)); return null; }
    }

    const wbXml = await texto('xl/workbook.xml');
    if (!wbXml) {
      erros.push('A planilha não contém xl/workbook.xml — não é um XLSX válido.');
      return { projetosCandidatos: [], curvas: {}, avisos: avisos, erros: erros, meta: {} };
    }
    const wb = U.parseXml(wbXml);
    const relsXml = await texto('xl/_rels/workbook.xml.rels');
    const rels = relsXml ? U.parseXml(relsXml) : { doc: null };

    const alvoPorId = {};
    if (rels.doc) {
      U.xmlTodos(rels.doc.documentElement, 'Relationship').forEach(function (n) {
        alvoPorId[n.getAttribute('Id')] = n.getAttribute('Target');
      });
    }

    // sharedStrings
    const ssXml = await texto('xl/sharedStrings.xml');
    const compartilhadas = [];
    if (ssXml) {
      const ss = U.parseXml(ssXml);
      if (ss.doc) {
        U.xmlTodos(ss.doc.documentElement, 'si').forEach(function (si) {
          let s = '';
          U.xmlTodos(si, 't').forEach(function (t) { s += t.textContent || ''; });
          compartilhadas.push(s);
        });
      }
    }

    const abas = [];
    if (wb.doc) {
      U.xmlTodos(wb.doc.documentElement, 'sheet').forEach(function (sh, idx) {
        const nome = sh.getAttribute('name') || ('Planilha' + (idx + 1));
        const rid = sh.getAttribute('r:id') ||
          sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        let alvo = alvoPorId[rid];
        if (!alvo) { alvo = 'worksheets/sheet' + (idx + 1) + '.xml'; }
        abas.push({ nome: nome, caminho: 'xl/' + String(alvo).replace(/^\/?xl\//, '').replace(/^\//, '') });
      });
    }
    if (!abas.length) { abas.push({ nome: 'Planilha1', caminho: 'xl/worksheets/sheet1.xml' }); }

    const resultado = [];
    for (let i = 0; i < abas.length; i++) {
      const aba = abas[i];
      const xml = await texto(aba.caminho);
      if (!xml) { avisos.push('Aba "' + aba.nome + '" não encontrada no pacote.'); continue; }
      const doc = U.parseXml(xml);
      if (!doc.doc) { avisos.push('Aba "' + aba.nome + '" com XML inválido.'); continue; }

      const linhas = [];
      let maxCol = 0;
      U.xmlTodos(doc.doc.documentElement, 'row').forEach(function (row) {
        const ri = U.num(row.getAttribute('r'), 0) - 1;
        const idx = ri >= 0 ? ri : linhas.length;
        const arr = linhas[idx] || (linhas[idx] = []);
        U.xmlFilhos(row, 'c').forEach(function (c, ordem) {
          const ref = c.getAttribute('r');
          const ci = ref ? refParaColuna(ref) : ordem;
          const tipo = c.getAttribute('t');
          let v = '';
          if (tipo === 's') {
            const iSt = parseInt(U.xmlTexto(c, 'v') || '-1', 10);
            v = compartilhadas[iSt] === undefined ? '' : compartilhadas[iSt];
          } else if (tipo === 'inlineStr') {
            const is = U.xmlFilhos(c, 'is')[0];
            v = is ? (U.xmlTexto(is, 't') || is.textContent || '') : '';
          } else if (tipo === 'b') {
            v = U.xmlTexto(c, 'v') === '1' ? 'VERDADEIRO' : 'FALSO';
          } else if (tipo === 'e') {
            v = '';
          } else {
            const raw = U.xmlTexto(c, 'v');
            v = raw === '' ? '' : U.num(raw, 0);
          }
          arr[ci] = v;
          if (ci + 1 > maxCol) { maxCol = ci + 1; }
        });
      });

      // torna retangular (celulas ausentes deixam buraco)
      const matriz = [];
      for (let li = 0; li < linhas.length; li++) {
        const l = linhas[li] || [];
        const nova = [];
        for (let ci = 0; ci < maxCol; ci++) { nova.push(l[ci] === undefined ? '' : l[ci]); }
        matriz.push(nova);
      }
      const compactada = matriz.filter(function (l) {
        return l.some(function (v) { return String(v).trim() !== ''; });
      });
      if (compactada.length < 2) { avisos.push('Aba "' + aba.nome + '" sem dados úteis.'); continue; }

      const r = imp.lerMatriz(compactada, fileName, 'xlsx', aba.nome);
      resultado.push(r);
      avisos.push.apply(avisos, r.avisos);
      erros.push.apply(erros, r.erros.map(function (e) { return '[' + aba.nome + '] ' + e; }));
    }

    // mescla abas: projetos + curvas
    const candidatos = [];
    const curvas = {};
    resultado.forEach(function (r) {
      candidatos.push.apply(candidatos, r.projetosCandidatos);
      Object.keys(r.curvas || {}).forEach(function (cod) {
        if (!curvas[cod]) { curvas[cod] = { planejada: [], real: [] }; }
        curvas[cod].planejada.push.apply(curvas[cod].planejada, r.curvas[cod].planejada);
        curvas[cod].real.push.apply(curvas[cod].real, r.curvas[cod].real);
      });
    });

    // aplica curvas nos candidatos correspondentes
    candidatos.forEach(function (p) {
      const cv = curvas[p.codigo];
      if (cv) {
        if (cv.planejada.length) { p.finance.curvaPlanejada = U.sortBy(cv.planejada, function (x) { return x.periodo; }); }
        if (cv.real.length) { p.finance.curvaReal = U.sortBy(cv.real, function (x) { return x.periodo; }); }
      }
    });

    const codsSoCurva = Object.keys(curvas).filter(function (cod) {
      return !candidatos.some(function (p) { return p.codigo === cod; });
    });
    if (codsSoCurva.length) {
      avisos.push(codsSoCurva.length + ' código(s) presentes apenas nas abas de curva financeira: ' +
        codsSoCurva.slice(0, 8).join(', ') + '. Serão aplicados a projetos existentes na reconciliação.');
    }

    return { projetosCandidatos: candidatos, curvas: curvas, avisos: avisos, erros: erros,
      meta: { abas: abas.map(function (a) { return a.nome; }), entradasZip: entradas.length } };
  };

  /* ==================================================== CFB / OLE (.mpp) */

  const FMTID_SUMMARY = 'F29F85E04FF91068AB9108002B27B3D9';
  const FMTID_DOCSUMMARY = 'D5CDD5022E9C101B939708002B2CF9AE';

  function hexClsid(b, o) {
    // CLSID: 3 campos little-endian + 8 bytes
    const p2 = function (n) { return ('0' + n.toString(16).toUpperCase()).slice(-2); };
    let s = '';
    [3, 2, 1, 0, 5, 4, 7, 6].forEach(function (i) { s += p2(b[o + i]); });
    for (let i = 8; i < 16; i++) { s += p2(b[o + i]); }
    return s;
  }

  const CP1252_EXTRA = {
    128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†',
    135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ',
    142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•',
    150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›',
    156: 'œ', 158: 'ž', 159: 'Ÿ'
  };

  function decodificaAnsi(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c === 0) { break; }
      if (c < 128) { s += String.fromCharCode(c); }
      else if (CP1252_EXTRA[c]) { s += CP1252_EXTRA[c]; }
      else { s += String.fromCharCode(c); }
    }
    return s;
  }

  function decodificaUtf8(bytes) {
    let fim = bytes.length;
    for (let i = 0; i < bytes.length; i++) { if (bytes[i] === 0) { fim = i; break; } }
    try { return new TextDecoder('utf-8').decode(bytes.subarray(0, fim)); }
    catch (e) { return decodificaAnsi(bytes.subarray(0, fim)); }
  }

  function filetimeParaIso(lo, hi) {
    // 100ns desde 1601-01-01. Divide antes de somar para nao estourar 53 bits.
    const total = hi * 4294967296 + lo;
    if (!total) { return null; }
    const ms = Math.floor(total / 10000) - 11644473600000;
    if (!isFinite(ms) || ms < -2208988800000 || ms > 4102444800000) { return null; }
    return new Date(ms).toISOString();
  }

  /** Le um property set OLE. Devolve { props: {pid: valor}, codepage }. */
  function lerPropertySet(bytes) {
    if (bytes.length < 48) { return { props: {}, codepage: 1252 }; }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numSecoes = dv.getUint32(24, true);
    if (!numSecoes) { return { props: {}, codepage: 1252 }; }
    const secOff = dv.getUint32(44, true);
    if (secOff + 8 > bytes.length) { return { props: {}, codepage: 1252 }; }

    const numProps = dv.getUint32(secOff + 4, true);
    const pares = [];
    for (let i = 0; i < numProps && secOff + 8 + i * 8 + 8 <= bytes.length; i++) {
      pares.push({
        pid: dv.getUint32(secOff + 8 + i * 8, true),
        off: dv.getUint32(secOff + 8 + i * 8 + 4, true)
      });
    }

    let codepage = 1252;
    const cpPar = pares.find(function (p) { return p.pid === 1; });
    if (cpPar) {
      const o = secOff + cpPar.off;
      if (o + 6 <= bytes.length && dv.getUint32(o, true) === 2) {
        const v = dv.getInt16(o + 4, true);
        codepage = v < 0 ? v + 65536 : v;
      }
    }

    const props = {};
    pares.forEach(function (par) {
      const o = secOff + par.off;
      if (o + 4 > bytes.length) { return; }
      const tipo = dv.getUint32(o, true);
      try {
        if (tipo === 2) { props[par.pid] = dv.getInt16(o + 4, true); }
        else if (tipo === 3) { props[par.pid] = dv.getInt32(o + 4, true); }
        else if (tipo === 11) { props[par.pid] = dv.getInt16(o + 4, true) !== 0; }
        else if (tipo === 30) {
          const len = dv.getUint32(o + 4, true);
          if (len > 0 && o + 8 + len <= bytes.length) {
            const sub = bytes.subarray(o + 8, o + 8 + len);
            props[par.pid] = codepage === 65001 ? decodificaUtf8(sub) : decodificaAnsi(sub);
          }
        } else if (tipo === 31) {
          const nch = dv.getUint32(o + 4, true);
          if (nch > 0 && o + 8 + nch * 2 <= bytes.length) {
            let s = '';
            for (let i = 0; i < nch; i++) {
              const cc = dv.getUint16(o + 8 + i * 2, true);
              if (!cc) { break; }
              s += String.fromCharCode(cc);
            }
            props[par.pid] = s;
          }
        } else if (tipo === 64) {
          props[par.pid] = filetimeParaIso(dv.getUint32(o + 4, true), dv.getUint32(o + 8, true));
        }
      } catch (e) { /* propriedade ilegivel: ignora */ }
    });
    return { props: props, codepage: codepage };
  }

  /** Leitor CFB minimo: monta FAT/MiniFAT e extrai streams por nome. */
  function lerCfb(bytes) {
    if (!bytesComecamCom(bytes, SIG_CFB)) { return null; }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const secShift = dv.getUint16(30, true);
    const miniShift = dv.getUint16(32, true);
    const tamSec = 1 << secShift;
    const tamMini = 1 << miniShift;
    const primDir = dv.getUint32(48, true);
    const corteMini = dv.getUint32(56, true);
    const primMiniFat = dv.getUint32(60, true);
    const numMiniFat = dv.getUint32(64, true);
    const primDifat = dv.getUint32(68, true);
    const numDifat = dv.getUint32(72, true);

    function offsetSetor(s) { return (s + 1) * tamSec; }

    // DIFAT -> setores da FAT
    const setoresFat = [];
    for (let i = 0; i < 109; i++) {
      const v = dv.getUint32(76 + i * 4, true);
      if (v === 0xFFFFFFFF) { break; }
      setoresFat.push(v);
    }
    let dif = primDifat;
    let guardaD = 0;
    while (dif !== 0xFFFFFFFF && dif !== 0xFFFFFFFE && guardaD < numDifat + 8 && guardaD < 2048) {
      const base = offsetSetor(dif);
      if (base + tamSec > bytes.length) { break; }
      const qtd = (tamSec / 4) - 1;
      for (let i = 0; i < qtd; i++) {
        const v = dv.getUint32(base + i * 4, true);
        if (v !== 0xFFFFFFFF) { setoresFat.push(v); }
      }
      dif = dv.getUint32(base + tamSec - 4, true);
      guardaD += 1;
    }

    const fat = [];
    setoresFat.forEach(function (s) {
      const base = offsetSetor(s);
      if (base + tamSec > bytes.length) { return; }
      for (let i = 0; i < tamSec / 4; i++) { fat.push(dv.getUint32(base + i * 4, true)); }
    });

    function cadeia(inicio, tabela) {
      const out = [];
      let s = inicio;
      let guarda = 0;
      while (s !== 0xFFFFFFFE && s !== 0xFFFFFFFF && s < tabela.length && guarda < 200000) {
        out.push(s);
        s = tabela[s];
        guarda += 1;
      }
      return out;
    }

    function lerCadeiaSetores(inicio, tamanho) {
      const setores = cadeia(inicio, fat);
      const out = new Uint8Array(setores.length * tamSec);
      setores.forEach(function (s, i) {
        const base = offsetSetor(s);
        if (base + tamSec <= bytes.length) { out.set(bytes.subarray(base, base + tamSec), i * tamSec); }
      });
      return tamanho ? out.subarray(0, tamanho) : out;
    }

    // diretorio
    const dirBytes = lerCadeiaSetores(primDir, 0);
    const entradas = [];
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const tipo = dirBytes[o + 66];
      if (tipo === 0) { continue; }
      const tamNome = (dirBytes[o + 64] | (dirBytes[o + 65] << 8));
      let nome = '';
      for (let i = 0; i + 1 < Math.min(64, tamNome); i += 2) {
        const cc = dirBytes[o + i] | (dirBytes[o + i + 1] << 8);
        if (!cc) { break; }
        nome += String.fromCharCode(cc);
      }
      const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset + o, 128);
      entradas.push({
        nome: nome, tipo: tipo,
        setorInicial: ddv.getUint32(116, true),
        tamanho: ddv.getUint32(120, true) + ddv.getUint32(124, true) * 4294967296
      });
    }

    // mini-stream
    const raiz = entradas.find(function (e) { return e.tipo === 5; });
    let miniFat = [];
    let miniStream = null;
    if (numMiniFat && primMiniFat !== 0xFFFFFFFE) {
      const mf = lerCadeiaSetores(primMiniFat, 0);
      const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
      for (let i = 0; i < mf.length / 4; i++) { miniFat.push(mdv.getUint32(i * 4, true)); }
    }
    if (raiz && raiz.tamanho > 0) { miniStream = lerCadeiaSetores(raiz.setorInicial, raiz.tamanho); }

    function lerStream(ent) {
      if (!ent || !ent.tamanho) { return new Uint8Array(0); }
      if (ent.tamanho < corteMini && miniStream) {
        const minis = cadeia(ent.setorInicial, miniFat);
        const out = new Uint8Array(minis.length * tamMini);
        minis.forEach(function (mi, i) {
          const base = mi * tamMini;
          if (base + tamMini <= miniStream.length) {
            out.set(miniStream.subarray(base, base + tamMini), i * tamMini);
          }
        });
        return out.subarray(0, ent.tamanho);
      }
      return lerCadeiaSetores(ent.setorInicial, ent.tamanho);
    }

    return {
      entradas: entradas,
      lerPorNome: function (nome) {
        const e = entradas.find(function (x) { return x.nome === nome; });
        return e ? lerStream(e) : null;
      }
    };
  }

  const PID_SUM = { 2: 'titulo', 3: 'assunto', 4: 'autor', 5: 'palavrasChave', 6: 'comentarios',
    8: 'ultimoAutor', 9: 'revisao', 12: 'criadoEm', 13: 'salvoEm', 14: 'paginas' };
  const PID_DOC = { 14: 'gerente', 15: 'empresa', 2: 'categoria' };

  imp.lerOleMeta = function (bytes) {
    const avisos = [];
    const saida = { ok: false, ehCfb: false, streams: [], avisos: avisos };
    let cfb;
    try { cfb = lerCfb(bytes); }
    catch (e) {
      avisos.push('Falha ao percorrer a estrutura CFB: ' + (e.message || e));
      return saida;
    }
    if (!cfb) {
      avisos.push('O arquivo não está no formato OLE/Compound File — não parece um .mpp válido.');
      return saida;
    }
    saida.ehCfb = true;
    saida.streams = cfb.entradas
      .filter(function (e) { return e.tipo === 2; })
      .map(function (e) { return { nome: e.nome.replace(/^\u0005/, '(5)'), tamanho: e.tamanho }; });

    function aplicar(nomeStream, mapa, fmtidEsperado) {
      const b = cfb.lerPorNome(nomeStream);
      if (!b || b.length < 48) { return; }
      if (fmtidEsperado) {
        const fm = hexClsid(b, 28);
        if (fm !== fmtidEsperado) {
          avisos.push('Stream ' + nomeStream.replace(/^\u0005/, '(5)') + ' com FMTID inesperado (' + fm + ').');
        }
      }
      const ps = lerPropertySet(b);
      Object.keys(mapa).forEach(function (pid) {
        const v = ps.props[pid];
        if (v !== undefined && v !== null && v !== '') { saida[mapa[pid]] = v; }
      });
    }

    aplicar('\u0005SummaryInformation', PID_SUM, FMTID_SUMMARY);
    aplicar('\u0005DocumentSummaryInformation', PID_DOC, FMTID_DOCSUMMARY);

    saida.ok = !!(saida.titulo || saida.autor || saida.empresa || saida.assunto);
    if (!saida.ok) {
      avisos.push('O arquivo é um CFB válido, porém sem property set de documento legível.');
    }
    return saida;
  };

  imp.lerMpp = function (bytes, fileName) {
    const avisos = [];
    const erros = [];
    const meta = imp.lerOleMeta(bytes);
    avisos.push.apply(avisos, meta.avisos);

    // G7: honestidade sobre o que foi lido.
    avisos.unshift('Arquivos .mpp são binários proprietários: apenas os metadados do documento foram ' +
      'lidos, não o cronograma. Para importar tarefas, marcos e custos, abra no MS Project e use ' +
      'Arquivo → Salvar como → XML (formato MSPDI).');

    if (!meta.ehCfb) {
      erros.push('Não reconheci o arquivo como .mpp (estrutura OLE ausente).');
      return { projetosCandidatos: [], avisos: avisos, erros: erros, meta: meta };
    }

    const codigo = extrairCodigo(fileName) || extrairCodigo(meta.titulo) ||
      extrairCodigo(meta.palavrasChave) || extrairCodigo(meta.assunto);
    const p = M.projetoVazio({
      codigo: codigo || '',
      nome: meta.titulo || String(fileName || '').replace(/\.[^.]+$/, ''),
      descricao: [meta.assunto, meta.comentarios].filter(Boolean).join(' — ')
    });
    p.links.arquivoProjeto = fileName;
    p._origem = { kind: 'mpp', fileName: fileName, externalId: codigo || null, importadoEm: U.agoraIso() };
    p._confianca = 0.35;
    p._bruto = { metadadosOle: meta, somenteMetadados: true };
    // G7: de um .mpp só vêm metadados de documento. NUNCA datas, custos ou avanço.
    p._campos = ['links.arquivoProjeto'];
    if (meta.titulo) { p._campos.push('nome'); }
    if (p.descricao) { p._campos.push('descricao'); }

    return { projetosCandidatos: [p], avisos: avisos, erros: erros, meta: meta };
  };

  /* ========================================================== orquestracao */

  imp.lerArquivo = async function (file) {
    const nome = file && file.name ? file.name : 'arquivo';
    const saidaVazia = function (erro) {
      return { kind: null, fileName: nome, tamanho: file ? file.size : 0,
        arquivoOriginal: file || null,
        projetosCandidatos: [], avisos: [], erros: [erro], meta: {}, resumo: erro };
    };
    if (!file) { return saidaVazia('Nenhum arquivo informado.'); }
    if (file.size === 0) { return saidaVazia('O arquivo está vazio.'); }

    let bytes, amostra = '';
    try {
      bytes = await U.lerBytes(file);
      const cabeca = bytes.subarray(0, Math.min(bytes.length, 8000));
      try { amostra = new TextDecoder('utf-8', { fatal: false }).decode(cabeca); }
      catch (e) { amostra = ''; }
    } catch (e) {
      return saidaVazia('Não consegui ler o arquivo: ' + (e.message || e));
    }

    const kind = imp.detectar(nome, amostra, bytes);
    if (!kind) {
      return saidaVazia('Formato não reconhecido. Aceito: .xml (MS Project MSPDI), .xer e .pmxml ' +
        '(Primavera), .csv, .xlsx, .mpp (metadados) e .json (bundle do próprio app).');
    }

    let r;
    try {
      if (kind === 'xlsx') {
        r = await imp.lerXlsx(bytes, nome);
      } else if (kind === 'mpp') {
        r = imp.lerMpp(bytes, nome);
      } else {
        const texto = await U.lerTexto(file);
        if (kind === 'mspdi') { r = imp.lerMspdi(texto, nome); }
        else if (kind === 'xer') { r = imp.lerXer(texto, nome); }
        else if (kind === 'pmxml') { r = imp.lerPmxml(texto, nome); }
        else if (kind === 'csv') { r = imp.lerCsv(texto, nome); }
        else if (kind === 'bundle') {
          try {
            const j = JSON.parse(texto);
            r = { projetosCandidatos: [], avisos: [], erros: [], meta: {}, bundle: j };
          } catch (e) {
            r = { projetosCandidatos: [], avisos: [], erros: ['JSON inválido: ' + (e.message || e)], meta: {} };
          }
        } else {
          r = { projetosCandidatos: [], avisos: [], erros: ['Formato "' + kind + '" sem parser.'], meta: {} };
        }
      }
    } catch (e) {
      if (window.console) { console.error('[PMO.importar]', e); }
      return saidaVazia('Falha inesperada ao interpretar o arquivo: ' + (e.message || e));
    }

    const cands = r.projetosCandidatos || [];
    const resumo = r.bundle
      ? 'Bundle nativo com ' + ((r.bundle.projetos || []).length) + ' projeto(s).'
      : (cands.length
        ? cands.length + ' projeto(s) identificado(s) no arquivo ' + String(kind).toUpperCase() + '.'
        : 'Nenhum projeto identificado.');

    return {
      kind: kind, fileName: nome, tamanho: file.size,
      // Referência efêmera: permite guardar o original no cofre depois que o
      // usuário aprovar o diff. Nunca entra no bundle nem nos candidatos.
      arquivoOriginal: file,
      projetosCandidatos: cands,
      curvas: r.curvas || {},
      bundle: r.bundle || null,
      avisos: r.avisos || [],
      erros: r.erros || [],
      meta: r.meta || {},
      resumo: resumo
    };
  };

  /* ========================================================= reconciliacao */

  /** Similaridade de Dice sobre bigramas. Sem dependencia externa. */
  function similaridade(a, b) {
    const x = U.normalizar(a).replace(/\s+/g, ' ');
    const y = U.normalizar(b).replace(/\s+/g, ' ');
    if (!x || !y) { return 0; }
    if (x === y) { return 1; }
    if (x.length < 2 || y.length < 2) { return x === y ? 1 : 0; }
    const bg = function (s) {
      const m = {};
      for (let i = 0; i < s.length - 1; i++) {
        const g = s.slice(i, i + 2);
        m[g] = (m[g] || 0) + 1;
      }
      return m;
    };
    const ma = bg(x), mb = bg(y);
    let inter = 0, ta = 0, tb = 0;
    Object.keys(ma).forEach(function (g) { ta += ma[g]; if (mb[g]) { inter += Math.min(ma[g], mb[g]); } });
    Object.keys(mb).forEach(function (g) { tb += mb[g]; });
    return U.safeDiv(2 * inter, ta + tb);
  }
  imp.similaridade = similaridade;

  const CAMPOS_DIFF = [
    { campo: 'nome', rotulo: 'Nome do projeto', fmt: 'texto', relev: 'media' },
    { campo: 'dates.previstoFim', rotulo: 'Término previsto', fmt: 'data', relev: 'alta' },
    { campo: 'dates.previstoInicio', rotulo: 'Início previsto', fmt: 'data', relev: 'media' },
    { campo: 'dates.baselineFim', rotulo: 'Término da baseline', fmt: 'data', relev: 'alta' },
    { campo: 'dates.baselineInicio', rotulo: 'Início da baseline', fmt: 'data', relev: 'media' },
    { campo: 'dates.realInicio', rotulo: 'Início real', fmt: 'data', relev: 'media' },
    { campo: 'dates.realFim', rotulo: 'Término real', fmt: 'data', relev: 'alta' },
    { campo: 'dates.dataStatus', rotulo: 'Data de status', fmt: 'data', relev: 'media' },
    { campo: 'progress.pctFisico', rotulo: 'Avanço físico', fmt: 'pct', relev: 'alta' },
    { campo: 'finance.custoBaseline', rotulo: 'Orçamento (BAC)', fmt: 'moeda', relev: 'alta' },
    { campo: 'finance.custoReal', rotulo: 'Custo real (AC)', fmt: 'moeda', relev: 'alta' },
    { campo: 'finance.comprometido', rotulo: 'Comprometido', fmt: 'moeda', relev: 'media' },
    { campo: 'finance.orcamentoCapex', rotulo: 'Orçamento CAPEX', fmt: 'moeda', relev: 'media' },
    { campo: 'finance.orcamentoOpex', rotulo: 'Orçamento OPEX', fmt: 'moeda', relev: 'media' },
    { campo: 'estagio', rotulo: 'Estágio', fmt: 'estagio', relev: 'alta' },
    { campo: 'gateAtual', rotulo: 'Gate atual', fmt: 'gate', relev: 'alta' },
    { campo: 'ragManual', rotulo: 'Farol manual', fmt: 'rag', relev: 'media' },
    { campo: 'categoria', rotulo: 'Categoria', fmt: 'categoria', relev: 'media' },
    { campo: 'tipo', rotulo: 'Tipo', fmt: 'tipo', relev: 'media' },
    { campo: 'prioridade', rotulo: 'Prioridade', fmt: 'numero', relev: 'media' },
    { campo: 'programaId', rotulo: 'Programa', fmt: 'programa', relev: 'media' },
    { campo: 'pmId', rotulo: 'Gerente', fmt: 'pessoa', relev: 'media' },
    { campo: 'sponsorId', rotulo: 'Sponsor', fmt: 'pessoa', relev: 'media' },
    { campo: 'descricao', rotulo: 'Descrição', fmt: 'texto', relev: 'baixa' }
  ];

  const COLECOES_DIFF = [
    { campo: 'tarefas', rotulo: 'Tarefas do cronograma (WBS)' },
    { campo: 'marcos', rotulo: 'Marcos do cronograma' },
    { campo: 'gates', rotulo: 'Registros de gate' },
    { campo: 'finance.curvaPlanejada', rotulo: 'Curva de valor planejado' },
    { campo: 'finance.curvaReal', rotulo: 'Curva de valor agregado e custo real' }
  ];

  function vazio(v) {
    return v === null || v === undefined || v === '' ||
      (Array.isArray(v) && v.length === 0);
  }

  function iguais(fmt, a, b) {
    if (vazio(a) && vazio(b)) { return true; }
    if (fmt === 'data') { return (U.parseDate(a) || '') === (U.parseDate(b) || ''); }
    if (fmt === 'moeda') {
      const na = U.num(a, 0), nb = U.num(b, 0);
      if (na === nb) { return true; }
      const base = Math.max(Math.abs(na), Math.abs(nb));
      if (base === 0) { return true; }
      return Math.abs(na - nb) / base * 100 <= imp.TOLERANCIA.moedaPct;
    }
    if (fmt === 'pct') { return Math.abs(U.num(a, 0) - U.num(b, 0)) <= imp.TOLERANCIA.pontosPct; }
    if (fmt === 'numero') { return U.num(a, 0) === U.num(b, 0); }
    return String(a === null || a === undefined ? '' : a).trim() ===
      String(b === null || b === undefined ? '' : b).trim();
  }

  imp.formatarValor = function (fmt, v, bundle) {
    if (vazio(v)) { return '—'; }
    const b = bundle || (PMO.store ? PMO.store.state : null);
    if (fmt === 'data') { return U.fmtDate(v); }
    if (fmt === 'moeda') { return U.fmtMoney(U.num(v, 0), { compact: true }); }
    if (fmt === 'pct') { return U.fmtPct(U.num(v, 0), 1); }
    if (fmt === 'numero') { return U.fmtNum(U.num(v, 0), 0); }
    if (fmt === 'estagio') { return M.rotulo('estagios', v); }
    if (fmt === 'categoria') { return M.rotulo('categorias', v); }
    if (fmt === 'tipo') { return M.rotulo('tipos', v); }
    if (fmt === 'rag') { return M.rotuloRag(v); }
    if (fmt === 'gate') { const g = M.gatePorId(v); return g ? g.codigo : String(v); }
    if (fmt === 'pessoa') { return M.nomePessoa(b, v); }
    if (fmt === 'programa') { return M.nomePrograma(b, v); }
    return U.truncar(String(v), 70);
  };

  imp.reconciliar = function (candidatos, bundleAtual) {
    const b = bundleAtual || (PMO.store ? PMO.store.state : M.portfolioVazio());
    const novos = [];
    const atualizacoes = [];
    const conflitos = [];
    let camposAlterados = 0;
    let semMudanca = 0;

    (candidatos || []).forEach(function (cand) {
      let alvo = null;
      let motivoMatch = null;

      // 1) identificador externo da mesma origem
      if (cand._origem && cand._origem.externalId) {
        alvo = (b.projetos || []).find(function (p) {
          return p.importSource && p.importSource.externalId === cand._origem.externalId &&
            p.importSource.kind === cand._origem.kind;
        }) || null;
        if (alvo) { motivoMatch = 'identificador externo da importação anterior'; }
      }
      // 2) codigo de negocio
      if (!alvo && cand.codigo) {
        alvo = M.projetoPorCodigo(b, cand.codigo);
        if (alvo) { motivoMatch = 'código de negócio'; }
      }
      // 3) similaridade de nome -> nunca atualiza automaticamente
      if (!alvo && cand.nome) {
        let melhor = null, melhorS = 0;
        (b.projetos || []).forEach(function (p) {
          const s = similaridade(p.nome, cand.nome);
          if (s > melhorS) { melhorS = s; melhor = p; }
        });
        if (melhor && melhorS >= 0.88) {
          conflitos.push({
            candidato: cand, projetoId: melhor.id,
            motivo: 'Casamento por similaridade de nome (' + Math.round(melhorS * 100) + '%) com "' +
              (melhor.codigo || melhor.nome) + '". Confirme manualmente — não atualizo por semelhança.'
          });
          return;
        }
      }

      if (!alvo) {
        novos.push({
          candidato: cand,
          motivo: cand.codigo
            ? 'Código ' + cand.codigo + ' não existe no portfólio.'
            : 'Sem código de negócio identificado no arquivo.'
        });
        return;
      }

      const campos = [];
      /* Só comparamos os caminhos que o formato de origem DECLAROU ter fornecido.
         Sem esta trava, os defaults de projetoVazio() (estágio 'ideacao', gate
         'g0', custos zerados) seriam propostos como se viessem do arquivo. */
      const fornecidos = Array.isArray(cand._campos) ? cand._campos : null;

      CAMPOS_DIFF.forEach(function (def) {
        if (fornecidos && fornecidos.indexOf(def.campo) < 0) { return; }
        const novo = U.campo(cand, def.campo);
        // a origem nao fornece este campo: nao zera o que ja existe
        if (vazio(novo)) { return; }
        const atualV = U.campo(alvo, def.campo);
        if (iguais(def.fmt, atualV, novo)) { return; }

        const preencheLacuna = vazio(atualV);
        const relev = preencheLacuna ? 'media' : def.relev;
        campos.push({
          campo: def.campo,
          rotulo: def.rotulo,
          formatador: def.fmt,
          de: atualV,
          para: novo,
          deTexto: imp.formatarValor(def.fmt, atualV, b),
          paraTexto: imp.formatarValor(def.fmt, novo, b),
          relevancia: relev,
          escolhido: preencheLacuna ? true : (def.relev !== 'baixa')
        });
      });

      COLECOES_DIFF.forEach(function (def) {
        if (fornecidos && fornecidos.indexOf(def.campo) < 0) { return; }
        const novo = U.campo(cand, def.campo);
        if (!Array.isArray(novo) || !novo.length) { return; }
        const atualV = U.campo(alvo, def.campo);
        const nAtual = Array.isArray(atualV) ? atualV.length : 0;
        if (nAtual === novo.length && nAtual > 0) { return; }
        campos.push({
          campo: def.campo,
          rotulo: def.rotulo,
          formatador: 'colecao',
          de: nAtual,
          para: novo.length,
          deTexto: nAtual + ' item(ns)',
          paraTexto: novo.length + ' item(ns) do arquivo',
          relevancia: nAtual === 0 ? 'media' : 'alta',
          escolhido: true,
          substituiColecao: true
        });
      });

      if (!campos.length) { semMudanca += 1; return; }
      camposAlterados += campos.length;
      atualizacoes.push({
        projetoId: alvo.id,
        codigo: alvo.codigo,
        nome: alvo.nome,
        candidato: cand,
        motivoMatch: motivoMatch,
        campos: U.sortBy(campos, function (c) {
          return c.relevancia === 'alta' ? 0 : (c.relevancia === 'media' ? 1 : 2);
        })
      });
    });

    return {
      novos: novos,
      atualizacoes: atualizacoes,
      conflitos: conflitos,
      resumo: {
        novos: novos.length,
        atualizados: atualizacoes.length,
        camposAlterados: camposAlterados,
        semMudanca: semMudanca,
        conflitos: conflitos.length
      }
    };
  };

  /* =============================================================== aplicar */

  /**
   * Aplica o plano em UMA unica mutacao (uma entrada de auditoria por importacao).
   * Respeita `escolhido: false` — campo desmarcado nao e aplicado.
   */
  imp.aplicar = async function (plano, opts) {
    const o = opts || {};
    const erros = [];
    const avisos = [];
    let criados = 0, atualizados = 0, camposAplicados = 0;
    const projetosAfetados = [];
    const importId = U.uid('imp');

    const novosSel = (plano.novos || []).filter(function (n) { return n.escolhido !== false; });
    const atuSel = (plano.atualizacoes || []).filter(function (a) { return a.escolhido !== false; });

    if (!novosSel.length && !atuSel.length) {
      return { criados: 0, atualizados: 0, camposAplicados: 0,
        erros: ['Nada selecionado para aplicar.'], avisos: [] };
    }

    const r = await PMO.store.mutate('Importar arquivo de projeto', function (d) {
      novosSel.forEach(function (n) {
        const cand = n.candidato;
        const limpo = M.normalizarProjeto(cand);
        limpo.id = U.uid('prj');
        if (!limpo.codigo) {
          limpo.codigo = M.proximoCodigo(d, 'PRJ-');
        }
        limpo.importSource = {
          kind: cand._origem.kind, fileName: cand._origem.fileName,
          externalId: cand._origem.externalId, importadoEm: U.agoraIso()
        };
        limpo.criadoEm = U.agoraIso();
        limpo.atualizadoEm = U.agoraIso();
        d.projetos.push(limpo);
        projetosAfetados.push(limpo.id);
        criados += 1;
      });

      atuSel.forEach(function (a) {
        const alvo = d.projetos.find(function (p) { return p.id === a.projetoId; });
        if (!alvo) { erros.push('Projeto ' + (a.codigo || a.projetoId) + ' não encontrado ao aplicar.'); return; }
        let mudou = 0;
        (a.campos || []).forEach(function (c) {
          if (!c.escolhido) { return; }
          U.setCampo(alvo, c.campo, c.substituiColecao ? U.campo(a.candidato, c.campo) : c.para);
          mudou += 1;
        });
        if (mudou) {
          alvo.atualizadoEm = U.agoraIso();
          alvo.importSource = {
            kind: a.candidato._origem.kind, fileName: a.candidato._origem.fileName,
            externalId: a.candidato._origem.externalId, importadoEm: U.agoraIso()
          };
          projetosAfetados.push(alvo.id);
          atualizados += 1;
          camposAplicados += mudou;
        }
      });

      d.imports.push({
        id: importId, em: U.agoraIso(),
        kind: o.kind || (plano.kind || 'desconhecido'),
        fileName: o.fileName || plano.fileName || '—',
        resumo: criados + ' novo(s), ' + atualizados + ' atualizado(s), ' +
          camposAplicados + ' campo(s) aplicado(s)'
      });
    }, {
      entidade: 'import',
      resumo: (o.fileName || plano.fileName || 'arquivo') + ': ' + criados + ' novo(s), ' +
        atualizados + ' atualizado(s), ' + camposAplicados + ' campo(s)'
    });

    if (!r.ok) { erros.push(r.erro || 'falha ao gravar'); }
    let anexoOriginal = null;
    if (r.ok && o.guardarOriginal !== false && o.arquivoOriginal) {
      const ids = U.uniq(projetosAfetados);
      try {
        anexoOriginal = await PMO.store.anexoAdicionar(o.arquivoOriginal, {
          projetoId: ids.length === 1 ? ids[0] : null,
          categoria: 'project-file',
          descricao: 'Arquivo original preservado automaticamente na importação.',
          metaExtra: {
            origemImportacao: true,
            importId: importId,
            kind: o.kind || plano.kind || 'desconhecido'
          },
          agruparComAnterior: true
        });
      } catch (e) {
        avisos.push('A importação foi aplicada, mas o arquivo original não pôde ser guardado no cofre: ' +
          (e.message || e));
      }
    }
    return { criados: criados, atualizados: atualizados, camposAplicados: camposAplicados,
      erros: erros, avisos: avisos, anexoOriginal: anexoOriginal };
  };
})(window.PMO = window.PMO || {});
