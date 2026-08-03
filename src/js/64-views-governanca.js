/* =============================================================================
   64-views-governanca.js — Gates, Riscos e issues, Decisões e mudanças,
                            Financeiro, Recursos, Benefícios, Priorização
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const S = PMO.store;
  const C = PMO.chart;
  const vw = PMO.vw;

  function irProjeto(p, aba) {
    return U.el('button', {
      class: 'celula-link', type: 'button', text: p.codigo || p.nome,
      attrs: { title: p.nome },
      on: { click: function () { PMO.views.abrirProjeto(p.id, aba); } }
    });
  }

  /** Achata itens de todos os projetos filtrados numa lista com o projeto anexo. */
  function achatar(projetos, campo) {
    const out = [];
    (projetos || []).forEach(function (p) {
      (p[campo] || []).forEach(function (it) { out.push({ p: p, it: it }); });
    });
    return out;
  }

  /**
   * Coluna de ações para as tabelas consolidadas do portfólio, onde cada linha
   * é { p, it } — o projeto dono e o registro. Edita direto daqui, sem precisar
   * abrir o projeto antes.
   */
  function acoesConsolidadas(tipo) {
    return {
      id: '_acoes', rot: 'Ações', cent: true, ord: false, largura: '104px',
      render: function (x) { return PMO.editor.acoesLinha(tipo, x.p.id, x.it); }
    };
  }

  /* =========================================================================
     GATES E STAGE-GATE
     ========================================================================= */

  PMO.views['gates'] = {
    titulo: 'Gates e stage-gate',
    icone: 'gate',
    grupo: 'Governança',
    sub: 'Portões de decisão do portfólio: o que já passou, o que está pendente e o que atrasou.',
    filtros: ['busca', 'programaId', 'estagio', 'rag', 'gateAtual'],

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      if (!c.projetos.length) {
        host.appendChild(vw.vazio({ icone: 'gate', titulo: 'Nenhum projeto no filtro' }));
        return;
      }

      const registros = [];
      c.projetos.forEach(function (p) {
        const rg = M.resumoGate(p, c.dataStatus);
        (rg.registros || []).forEach(function (gt) {
          const def = M.gatePorId(gt.gateId);
          let situacao = gt.decisao;
          let atraso = null;
          if (gt.decisao === 'pendente' && gt.previstoData) {
            const d = U.diffDays(gt.previstoData, c.dataStatus);
            if (d > 0) { situacao = 'atrasado'; atraso = d; }
          }
          registros.push({ p: p, gt: gt, def: def, situacao: situacao, atraso: atraso });
        });
      });

      const pendentes = registros.filter(function (r) { return r.situacao === 'pendente' || r.situacao === 'atrasado'; });
      const atrasados = registros.filter(function (r) { return r.situacao === 'atrasado'; });
      const condicionais = registros.filter(function (r) { return r.gt.decisao === 'condicional'; });
      const aprovados = registros.filter(function (r) { return r.gt.decisao === 'aprovado'; });

      // KPIs
      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Gates pendentes', valor: String(pendentes.length),
          nota: atrasados.length + ' fora do prazo', tom: atrasados.length ? 'critico' : null }),
        vw.kpi({ rot: 'Aprovados com condições', valor: String(condicionais.length),
          nota: 'exigem reapresentação', tom: condicionais.length ? 'aviso' : null,
          dica: 'Aprovação condicional é dívida de governança: precisa de acompanhamento formal.' }),
        vw.kpi({ rot: 'Gates aprovados', valor: String(aprovados.length) }),
        vw.kpi({ rot: 'Taxa de aprovação sem ressalva',
          valor: U.fmtPct(U.safeDiv(aprovados.length, aprovados.length + condicionais.length +
            registros.filter(function (r) { return r.gt.decisao === 'reprovado'; }).length) * 100, 0) })
      ]));

      const g12 = U.el('div', { class: 'grade grade--12' });

      // funil do stage-gate
      const hostFun = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Funil de gates', icone: 'gate',
        sub: 'Projetos que já passaram por cada portão',
        corpo: [hostFun]
      })]));
      vw.grafico(ctxView, C.funil, hostFun, {
        etapas: M.gates().map(function (g) {
          return {
            id: g.id, rotulo: g.codigo + ' — ' + g.nome,
            valor: c.projetos.filter(function (p) {
              return (p.gates || []).some(function (gt) {
                return gt.gateId === g.id && gt.realData &&
                  (gt.decisao === 'aprovado' || gt.decisao === 'condicional');
              });
            }).length
          };
        })
      }, { altura: 270 });

      // distribuição de projetos por gate atual
      const hostBar = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Onde o portfólio está parado', icone: 'balanca',
        sub: 'Projetos e investimento por gate atual',
        corpo: [hostBar]
      })]));
      vw.grafico(ctxView, C.barras, hostBar, {
        categorias: M.gates().map(function (g) { return g.codigo; }),
        series: [{
          nome: 'Orçamento no gate',
          valores: M.gates().map(function (g) {
            return U.sum(c.projetos.filter(function (p) { return p.gateAtual === g.id; }),
              function (p) { return M.bac(p); });
          }),
          cor: 'var(--serie-1)'
        }]
      }, { altura: 270, formatar: function (v) { return U.fmtMoney(v, { compact: true }); } });

      host.appendChild(g12);

      // decisões de gate pendentes — o que o comitê precisa decidir
      host.appendChild(vw.cartao({
        titulo: 'Decisões de gate aguardando o comitê', icone: 'alerta', classe: 'mt-4',
        sub: pendentes.length + ' portão(ões) pendente(s)',
        corpo: [pendentes.length ? vw.tabela({
          legenda: 'Gates pendentes de decisão',
          faixas: true,
          ordenacao: { col: 'atraso', dir: 'desc' },
          colunas: [
            { id: 'proj', rot: 'Projeto', render: function (r) { return irProjeto(r.p, 'cronograma'); } },
            { id: 'nome', rot: 'Nome', valor: function (r) { return U.truncar(r.p.nome, 40); } },
            { id: 'gate', rot: 'Gate', render: function (r) {
              return vw.chip(r.def ? r.def.codigo : r.gt.gateId, 'contorno',
                { titulo: r.def ? r.def.nome + ' — ' + r.def.descricao : '' });
            } },
            { id: 'prev', rot: 'Previsto', num: true, valor: function (r) { return U.fmtDate(r.gt.previstoData); } },
            { id: 'atraso', rot: 'Atraso', num: true, render: function (r) {
              if (!r.atraso) { return U.el('span', { class: 'txt-3', text: 'no prazo' }); }
              return U.el('span', { class: 'txt-num txt-ruim txt-forte', text: r.atraso + ' d' });
            }, valor: function (r) { return r.atraso || 0; } },
            { id: 'forum', rot: 'Fórum', valor: function (r) { return M.rotulo('foruns', r.gt.forum); } },
            { id: 'farol', rot: 'Farol', cent: true, render: function (r) { return vw.farol(c.saude(r.p).rag); } },
            { id: 'bac', rot: 'BAC', num: true, valor: function (r) { return U.fmtMoney(M.bac(r.p), { compact: true }); } }
          ],
          linhas: U.sortBy(pendentes, function (r) { return r.atraso || 0; }, 'desc')
        }) : vw.vazio({ icone: 'ok', titulo: 'Nenhum gate pendente', txt: 'Todos os portões do filtro atual já foram decididos.' })]
      }));

      if (condicionais.length) {
        host.appendChild(vw.cartao({
          titulo: 'Aprovações condicionais em aberto', icone: 'risco', classe: 'mt-4',
          sub: 'Condições assumidas no comitê que precisam ser cumpridas',
          corpo: [vw.tabela({
            compacta: true, legenda: 'Aprovações condicionais',
            colunas: [
              { id: 'proj', rot: 'Projeto', render: function (r) { return irProjeto(r.p, 'cronograma'); } },
              { id: 'gate', rot: 'Gate', valor: function (r) { return r.def ? r.def.codigo : r.gt.gateId; } },
              { id: 'em', rot: 'Aprovado em', num: true, valor: function (r) { return U.fmtDate(r.gt.realData); } },
              { id: 'cond', rot: 'Condição registrada', valor: function (r) { return r.gt.condicoes || r.gt.notas; } }
            ],
            linhas: condicionais
          })]
        }));
      }
    }
  };

  /* =========================================================================
     RISCOS E ISSUES
     ========================================================================= */

  PMO.views['riscos'] = {
    titulo: 'Riscos e issues',
    icone: 'risco',
    grupo: 'Governança',
    sub: 'Registro consolidado do portfólio, com matriz 5×5 e exposição financeira ponderada.',
    filtros: ['busca', 'programaId', 'rag', 'categoria', 'pmId'],

    acoes: function () {
      return [vw.botao('Exportar riscos (CSV)', { peq: true, icone: 'baixar', onClick: function () {
        if (!PMO.exportar || !PMO.exportar.csv) { U.toast('Módulo de exportação não disponível.', 'warn'); return; }
        const c = vw.contexto(PMO.app.filtro);
        U.download('portfolio-riscos-' + c.dataStatus + '.csv',
          PMO.exportar.csv('riscos', { projetos: c.projetos, bundle: c.bundle }), 'text/csv;charset=utf-8');
      } })];
    },

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      if (!c.projetos.length) {
        host.appendChild(vw.vazio({ icone: 'risco', titulo: 'Nenhum projeto no filtro' }));
        return;
      }
      const k = c.kpis();
      const riscos = achatar(c.projetos, 'riscos');
      const abertos = riscos.filter(function (x) { return !M.riscoEncerrado(x.it); });
      const issues = achatar(c.projetos, 'issues');
      const issAbertas = issues.filter(function (x) { return !M.issueEncerrada(x.it); });

      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Riscos abertos', valor: String(abertos.length),
          nota: k.riscosAltos + ' com score ≥ ' + c.limiares.scoreRiscoAlto,
          tom: k.riscosAltos ? 'aviso' : null }),
        vw.kpi({ rot: 'Exposição ponderada', valor: U.fmtMoney(k.exposicaoRisco, { compact: true }),
          nota: U.fmtPct(k.exposicaoPctBac, 1) + ' do BAC do portfólio',
          tom: k.exposicaoPctBac > 8 ? 'critico' : (k.exposicaoPctBac > 4 ? 'aviso' : null),
          dica: 'Σ (probabilidade × impacto ÷ 25) × exposição financeira de cada risco aberto.' }),
        vw.kpi({ rot: 'Issues abertas', valor: String(issAbertas.length),
          nota: k.issuesCriticas + ' críticas', tom: k.issuesCriticas ? 'critico' : null }),
        vw.kpi({ rot: 'Idade média das issues', valor: U.fmtNum(k.agingMedioIssues, 0) + ' d',
          nota: 'p90: ' + U.fmtNum(k.agingP90Issues, 0) + ' dias',
          dica: 'Issue que envelhece sem resolução é sintoma de falta de dono ou de decisão travada.' }),
        vw.kpi({ rot: 'Riscos sem dono',
          valor: String(abertos.filter(function (x) { return !x.it.donoId; }).length),
          tom: abertos.filter(function (x) { return !x.it.donoId; }).length ? 'aviso' : null })
      ]));

      const g12 = U.el('div', { class: 'grade grade--12' });

      // matriz 5x5
      const hostMx = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Matriz de risco 5×5', icone: 'risco',
        sub: 'Riscos abertos por probabilidade × impacto. Clique numa célula para ver a lista.',
        corpo: [hostMx]
      })]));
      const celulas = {};
      abertos.forEach(function (x) {
        const kk = x.it.probabilidade + ':' + x.it.impacto;
        if (!celulas[kk]) { celulas[kk] = { prob: x.it.probabilidade, impacto: x.it.impacto, itens: [] }; }
        celulas[kk].itens.push({ id: x.it.id, rotulo: (x.p.codigo || x.p.nome) + ' — ' + x.it.titulo });
      });
      vw.grafico(ctxView, C.matriz5x5, hostMx, {
        celulas: Object.keys(celulas).map(function (kk) { return celulas[kk]; })
      }, {
        altura: 340,
        onClick: function (cel) {
          PMO.app.abrirModal('Riscos — probabilidade ' + cel.prob + ' × impacto ' + cel.impacto +
            ' (score ' + (cel.prob * cel.impacto) + ')',
            U.el('div', { class: 'lista-itens' }, cel.itens.map(function (it) {
              return U.el('div', { class: 'item-reg' }, [
                U.el('span', { class: 'item-reg__corpo' }, [
                  U.el('span', { class: 'item-reg__titulo', text: it.rotulo })
                ])
              ]);
            })));
        }
      });

      // exposição por categoria de risco
      const hostCat = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Exposição por categoria de risco', icone: 'dinheiro',
        sub: 'Onde está concentrado o risco financeiro do portfólio',
        corpo: [hostCat]
      })]));
      const porCat = U.groupBy(abertos, function (x) { return x.it.categoria; });
      const catsOrd = U.sortBy(Object.keys(porCat), function (kk) {
        return U.sum(porCat[kk], function (x) { return (M.scoreRisco(x.it) / 25) * U.num(x.it.exposicaoCusto, 0); });
      }, 'desc');
      vw.grafico(ctxView, C.barras, hostCat, {
        categorias: catsOrd.map(function (kk) { return M.rotulo('categoriasRisco', kk); }),
        series: [{
          nome: 'Exposição ponderada',
          valores: catsOrd.map(function (kk) {
            return U.arredondar(U.sum(porCat[kk], function (x) {
              return (M.scoreRisco(x.it) / 25) * U.num(x.it.exposicaoCusto, 0);
            }), 2);
          }),
          cor: 'var(--serie-1)'
        }]
      }, { altura: 340, horizontal: true, formatar: function (v) { return U.fmtMoney(v, { compact: true }); } });

      host.appendChild(g12);

      // registro de riscos
      host.appendChild(vw.cartao({
        titulo: 'Registro de riscos do portfólio', icone: 'risco', classe: 'mt-4',
        sub: riscos.length + ' risco(s) · ' + abertos.length + ' aberto(s)',
        corpo: [vw.tabela({
          legenda: 'Registro consolidado de riscos', faixas: true,
          colunas: [
            { id: 'proj', rot: 'Projeto', fix: true, render: function (x) { return irProjeto(x.p, 'riscos'); } },
            { id: 'cod', rot: 'Cód.', valor: function (x) { return x.it.codigo; } },
            { id: 'tit', rot: 'Risco', largura: '260px', render: function (x) {
              return U.el('span', { attrs: { title: x.it.mitigacao || '' }, text: x.it.titulo });
            } },
            { id: 'cat', rot: 'Categoria', valor: function (x) { return M.rotulo('categoriasRisco', x.it.categoria); } },
            { id: 'score', rot: 'P×I', cent: true, render: function (x) {
              const sc = M.scoreRisco(x.it);
              const n = M.nivelRisco(sc);
              return vw.chip(x.it.probabilidade + '×' + x.it.impacto + '=' + sc, n.token, { titulo: n.rotulo });
            }, valor: function (x) { return M.scoreRisco(x.it); } },
            { id: 'exp', rot: 'Exposição', num: true,
              valor: function (x) { return U.fmtMoney(x.it.exposicaoCusto, { compact: true }); } },
            { id: 'dias', rot: 'Impacto', num: true,
              valor: function (x) { return x.it.impactoDias ? x.it.impactoDias + ' d' : '—'; } },
            { id: 'resp', rot: 'Resposta', valor: function (x) { return M.rotulo('respostasRisco', x.it.resposta); } },
            { id: 'dono', rot: 'Dono', render: function (x) {
              if (!x.it.donoId) { return vw.chip('sem dono', 'critico', { icone: 'alerta' }); }
              return vw.pessoa(c.bundle, x.it.donoId, { peq: true, curto: true });
            } },
            { id: 'prazo', rot: 'Prazo', num: true, render: function (x) {
              const venc = x.it.prazo && x.it.prazo < c.dataStatus && !M.riscoEncerrado(x.it);
              return U.el('span', { class: 'txt-num' + (venc ? ' txt-ruim' : ''), text: U.fmtDate(x.it.prazo) });
            }, valor: function (x) { return x.it.prazo || ''; } },
            { id: 'st', rot: 'Situação', render: function (x) {
              const enc = M.riscoEncerrado(x.it);
              return vw.chip(M.rotulo('statusRisco', x.it.status),
                enc ? 'neutro' : (M.scoreRisco(x.it) >= c.limiares.scoreRiscoAlto ? 'critico' : 'aviso'));
            } },
            acoesConsolidadas('risco')
          ],
          linhas: U.sortBy(riscos, function (x) {
            return (M.riscoEncerrado(x.it) ? -1000 : 0) + M.scoreRisco(x.it);
          }, 'desc'),
          onOrdenar: null
        })]
      }));

      // issues
      host.appendChild(vw.cartao({
        titulo: 'Issues do portfólio', icone: 'alerta', classe: 'mt-4',
        sub: issues.length + ' issue(s) · ' + issAbertas.length + ' aberta(s)',
        corpo: [issues.length ? vw.tabela({
          legenda: 'Registro consolidado de issues', faixas: true,
          colunas: [
            { id: 'proj', rot: 'Projeto', fix: true, render: function (x) { return irProjeto(x.p, 'riscos'); } },
            { id: 'cod', rot: 'Cód.', valor: function (x) { return x.it.codigo; } },
            { id: 'tit', rot: 'Issue', largura: '280px', valor: function (x) { return x.it.titulo; } },
            { id: 'sev', rot: 'Severidade', cent: true, render: function (x) {
              const def = M.tax('severidades').find(function (s) { return s.id === x.it.severidade; });
              return vw.chip(def ? def.rotulo : String(x.it.severidade), def ? def.token : 'neutro');
            }, valor: function (x) { return x.it.severidade; } },
            { id: 'dono', rot: 'Dono', render: function (x) { return vw.pessoa(c.bundle, x.it.donoId, { peq: true, curto: true }); } },
            { id: 'idade', rot: 'Idade', num: true, render: function (x) {
              const a = M.aging(x.it.abertaEm, x.it.resolvidaEm || c.dataStatus);
              return U.el('span', { class: 'txt-num' + (!x.it.resolvidaEm && a > 30 ? ' txt-ruim txt-forte' : ''),
                text: a + ' d' });
            }, valor: function (x) { return M.aging(x.it.abertaEm, x.it.resolvidaEm || c.dataStatus); } },
            { id: 'prazo', rot: 'Prazo', num: true, valor: function (x) { return U.fmtDate(x.it.prazo); } },
            { id: 'st', rot: 'Situação', render: function (x) {
              return vw.chip(M.rotulo('statusIssue', x.it.status),
                M.issueEncerrada(x.it) ? 'neutro' : (x.it.escalada ? 'critico' : 'aviso'));
            } },
            acoesConsolidadas('issue')
          ],
          linhas: U.sortBy(issues, function (x) {
            return (M.issueEncerrada(x.it) ? -100 : 0) + x.it.severidade * 10 +
              U.safeDiv(M.aging(x.it.abertaEm, c.dataStatus), 100);
          }, 'desc')
        }) : vw.vazio({ icone: 'ok', titulo: 'Nenhuma issue registrada' })]
      }));
    }
  };

  /* =========================================================================
     DECISÕES E MUDANÇAS
     ========================================================================= */

  PMO.views['decisoes'] = {
    titulo: 'Decisões e mudanças',
    icone: 'balanca',
    grupo: 'Governança',
    sub: 'O que o comitê precisa decidir, e o impacto acumulado das mudanças já aprovadas na baseline.',
    filtros: ['busca', 'programaId', 'rag', 'pmId'],

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      if (!c.projetos.length) {
        host.appendChild(vw.vazio({ icone: 'balanca', titulo: 'Nenhum projeto no filtro' }));
        return;
      }
      const k = c.kpis();
      const decisoes = achatar(c.projetos, 'decisoes');
      const mudancas = achatar(c.projetos, 'mudancas');

      const decPend = decisoes.filter(function (x) {
        const def = M.tax('statusDecisao').find(function (s) { return s.id === x.it.status; });
        return def && def.pendente;
      });
      const decVenc = decPend.filter(function (x) {
        return x.it.prazoLimite && x.it.prazoLimite < c.dataStatus;
      });
      const chgPend = mudancas.filter(function (x) {
        const def = M.tax('statusMudanca').find(function (s) { return s.id === x.it.status; });
        return def && def.pendente;
      });
      const chgAprov = mudancas.filter(function (x) { return x.it.status === 'aprovada'; });

      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Decisões pendentes', valor: String(decPend.length),
          nota: decVenc.length + ' fora do prazo', tom: decVenc.length ? 'critico' : null }),
        vw.kpi({ rot: 'Mudanças aguardando', valor: String(chgPend.length),
          nota: U.fmtMoney(U.sum(chgPend, function (x) { return x.it.impactoCusto; }), { compact: true }) + ' em jogo',
          tom: chgPend.length ? 'aviso' : null }),
        vw.kpi({ rot: 'Impacto já aprovado em custo', valor: U.fmtMoney(k.mudancasAprovadasCusto, { compact: true }),
          nota: chgAprov.length + ' mudança(s) aprovada(s)',
          tom: k.mudancasAprovadasCusto > 0 ? 'aviso' : null,
          dica: 'Soma do impacto de custo das mudanças já aprovadas — é o que corroeu a baseline original.' }),
        vw.kpi({ rot: 'Impacto já aprovado em prazo', valor: U.fmtNum(k.mudancasAprovadasDias, 0) + ' d',
          nota: 'somado entre os projetos' }),
        vw.kpi({ rot: 'Tempo médio de decisão',
          valor: (function () {
            const fechadas = decisoes.filter(function (x) { return x.it.decididaEm; });
            if (!fechadas.length) { return '—'; }
            return U.fmtNum(U.media(fechadas, function (x) {
              return U.diffDays(x.it.solicitadaEm, x.it.decididaEm) || 0;
            }), 0) + ' d';
          })(),
          dica: 'Da solicitação até a decisão registrada em ata.' })
      ]));

      // impacto acumulado das mudanças aprovadas, em cascata
      if (chgAprov.length) {
        const hostWf = U.el('div');
        host.appendChild(vw.cartao({
          titulo: 'Erosão da baseline por mudanças aprovadas', icone: 'dinheiro', classe: 'mb-4',
          sub: 'Do orçamento original até o orçamento vigente, mudança por tipo',
          corpo: [hostWf]
        }));
        const porTipo = U.groupBy(chgAprov, function (x) { return x.it.tipo; });
        const bacOriginal = k.bac - U.sum(chgAprov, function (x) { return x.it.impactoCusto; });
        const itens = [{ rotulo: 'Baseline original', valor: bacOriginal, tipo: 'inicio' }];
        Object.keys(porTipo).forEach(function (t) {
          itens.push({
            rotulo: M.rotulo('tiposMudanca', t),
            valor: U.arredondar(U.sum(porTipo[t], function (x) { return x.it.impactoCusto; }), 2),
            tipo: 'delta'
          });
        });
        itens.push({ rotulo: 'Orçamento vigente', valor: k.bac, tipo: 'fim' });
        vw.grafico(ctxView, C.waterfall, hostWf, { itens: itens },
          { altura: 300, formatar: function (v) { return U.fmtMoney(v, { compact: true }); } });
      }

      host.appendChild(vw.cartao({
        titulo: 'Decisões solicitadas ao comitê', icone: 'balanca',
        sub: decPend.length + ' pendente(s) de ' + decisoes.length + ' registrada(s)',
        corpo: [decisoes.length ? vw.tabela({
          legenda: 'Log de decisões do portfólio', faixas: true,
          colunas: [
            { id: 'proj', rot: 'Projeto', fix: true, render: function (x) { return irProjeto(x.p, 'governanca'); } },
            { id: 'cod', rot: 'Cód.', valor: function (x) { return x.it.codigo; } },
            { id: 'tit', rot: 'Decisão', largura: '300px', render: function (x) {
              return U.el('span', { attrs: { title: x.it.contexto || '' }, text: x.it.titulo });
            } },
            { id: 'forum', rot: 'Fórum', valor: function (x) { return M.rotulo('foruns', x.it.forum); } },
            { id: 'sol', rot: 'Solicitada', num: true, valor: function (x) { return U.fmtDate(x.it.solicitadaEm); } },
            { id: 'lim', rot: 'Prazo', num: true, render: function (x) {
              const def = M.tax('statusDecisao').find(function (s) { return s.id === x.it.status; });
              const venc = def && def.pendente && x.it.prazoLimite && x.it.prazoLimite < c.dataStatus;
              return U.el('span', { class: 'txt-num' + (venc ? ' txt-ruim txt-forte' : ''),
                text: U.fmtDate(x.it.prazoLimite) +
                  (venc ? ' (−' + U.diffDays(x.it.prazoLimite, c.dataStatus) + 'd)' : '') });
            }, valor: function (x) { return x.it.prazoLimite || ''; } },
            { id: 'idade', rot: 'Em aberto há', num: true, render: function (x) {
              const def = M.tax('statusDecisao').find(function (s) { return s.id === x.it.status; });
              if (!def || !def.pendente) { return U.el('span', { class: 'txt-3', text: '—' }); }
              return U.el('span', { class: 'txt-num', text: M.aging(x.it.solicitadaEm, c.dataStatus) + ' d' });
            } },
            { id: 'st', rot: 'Situação', render: function (x) {
              const def = M.tax('statusDecisao').find(function (s) { return s.id === x.it.status; });
              const venc = def && def.pendente && x.it.prazoLimite && x.it.prazoLimite < c.dataStatus;
              return vw.chip(M.rotulo('statusDecisao', x.it.status) + (venc ? ' · vencida' : ''),
                venc ? 'critico' : (def && def.pendente ? 'aviso' : 'bom'));
            } },
            acoesConsolidadas('decisao')
          ],
          linhas: U.sortBy(decisoes, function (x) {
            const def = M.tax('statusDecisao').find(function (s) { return s.id === x.it.status; });
            const pend = def && def.pendente ? 1000 : 0;
            const venc = x.it.prazoLimite && x.it.prazoLimite < c.dataStatus ? 500 : 0;
            return pend + venc + (M.aging(x.it.solicitadaEm, c.dataStatus) || 0);
          }, 'desc')
        }) : vw.vazio({ icone: 'balanca', titulo: 'Nenhuma decisão registrada' })]
      }));

      host.appendChild(vw.cartao({
        titulo: 'Controle de mudanças', icone: 'ligacao', classe: 'mt-4',
        sub: chgPend.length + ' aguardando decisão de ' + mudancas.length + ' registrada(s)',
        corpo: [mudancas.length ? vw.tabela({
          legenda: 'Solicitações de mudança do portfólio', faixas: true,
          colunas: [
            { id: 'proj', rot: 'Projeto', fix: true, render: function (x) { return irProjeto(x.p, 'governanca'); } },
            { id: 'cod', rot: 'Cód.', valor: function (x) { return x.it.codigo; } },
            { id: 'tit', rot: 'Mudança', largura: '280px', render: function (x) {
              return U.el('span', { attrs: { title: x.it.justificativa || '' }, text: x.it.titulo });
            } },
            { id: 'tipo', rot: 'Tipo', valor: function (x) { return M.rotulo('tiposMudanca', x.it.tipo); } },
            { id: 'custo', rot: 'Impacto custo', num: true, render: function (x) {
              return U.el('span', { class: 'txt-num ' + (x.it.impactoCusto > 0 ? 'txt-ruim' : 'txt-bom'),
                text: U.fmtDelta(x.it.impactoCusto, function (v) { return U.fmtMoney(v, { compact: true }); }) });
            }, valor: function (x) { return x.it.impactoCusto; } },
            { id: 'dias', rot: 'Impacto prazo', num: true, render: function (x) {
              return U.el('span', { class: 'txt-num' + (x.it.impactoDias > 0 ? ' txt-ruim' : ''),
                text: x.it.impactoDias ? '+' + x.it.impactoDias + ' d' : '—' });
            }, valor: function (x) { return x.it.impactoDias; } },
            { id: 'base', rot: 'Baseline', cent: true, render: function (x) {
              return x.it.afetaBaseline ? vw.chip('replanejar', 'aviso') : vw.chip('não afeta', 'neutro');
            } },
            { id: 'sol', rot: 'Solicitada', num: true, valor: function (x) { return U.fmtDate(x.it.solicitadaEm); } },
            { id: 'st', rot: 'Situação', render: function (x) {
              const def = M.tax('statusMudanca').find(function (s) { return s.id === x.it.status; });
              return vw.chip(M.rotulo('statusMudanca', x.it.status),
                def && def.pendente ? 'aviso' : (x.it.status === 'aprovada' ? 'bom' : 'neutro'));
            } },
            acoesConsolidadas('mudanca')
          ],
          linhas: U.sortBy(mudancas, function (x) {
            const def = M.tax('statusMudanca').find(function (s) { return s.id === x.it.status; });
            return (def && def.pendente ? 1000 : 0) + Math.abs(x.it.impactoCusto) / 1000;
          }, 'desc'),
          rodape: ['', '', 'Total aprovado', '',
            U.fmtMoney(k.mudancasAprovadasCusto, { compact: true }),
            '+' + U.fmtNum(k.mudancasAprovadasDias, 0) + ' d', '', '', '', '']
        }) : vw.vazio({ icone: 'ligacao', titulo: 'Nenhuma solicitação de mudança' })]
      }));
    }
  };

  /* =========================================================================
     FINANCEIRO
     ========================================================================= */

  PMO.views['financeiro'] = {
    titulo: 'Financeiro e EVM',
    icone: 'dinheiro',
    grupo: 'Recursos e valor',
    sub: 'Orçamento, realizado e projeção do portfólio. Índices por projeto e curva S consolidada.',
    filtros: ['busca', 'programaId', 'estagio', 'categoria', 'rag'],

    acoes: function () {
      return [vw.botao('Exportar EVM (CSV)', { peq: true, icone: 'baixar', onClick: function () {
        if (!PMO.exportar || !PMO.exportar.csv) { U.toast('Módulo de exportação não disponível.', 'warn'); return; }
        const c = vw.contexto(PMO.app.filtro);
        U.download('portfolio-evm-' + c.dataStatus + '.csv',
          PMO.exportar.csv('evm', { projetos: c.projetos, bundle: c.bundle }), 'text/csv;charset=utf-8');
      } })];
    },

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      if (!c.projetos.length) {
        host.appendChild(vw.vazio({ icone: 'dinheiro', titulo: 'Nenhum projeto no filtro' }));
        return;
      }
      const k = c.kpis();

      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Orçamento (BAC)', valor: U.fmtMoney(k.bac, { compact: true }), tom: 'destaque' }),
        vw.kpi({ rot: 'Comprometido', valor: U.fmtMoney(k.comprometido, { compact: true }),
          nota: U.fmtPct(U.safeDiv(k.comprometido, k.bac) * 100, 0) + ' do BAC' }),
        vw.kpi({ rot: 'Custo real (AC)', valor: U.fmtMoney(k.ac, { compact: true }),
          nota: U.fmtPct(k.burnPct, 0) + ' consumido vs ' + U.fmtPct(k.pctFisicoMedio, 0) + ' entregue',
          tom: k.burnPct > k.pctFisicoMedio + 6 ? 'aviso' : null }),
        vw.kpi({ rot: 'Valor agregado (EV)', valor: U.fmtMoney(k.ev, { compact: true }) }),
        vw.kpi({ rot: 'Projeção (EAC)', valor: U.fmtMoney(k.eac, { compact: true }),
          tom: k.vac < 0 ? 'critico' : 'bom' }),
        vw.kpi({ rot: 'Variação final (VAC)', valor: U.fmtMoney(k.vac, { compact: true }),
          delta: { tom: k.vac < 0 ? 'ruim' : 'bom', texto: k.vac < 0 ? 'estouro projetado' : 'folga' } }),
        vw.kpi({ rot: 'Falta gastar (ETC)', valor: U.fmtMoney(k.etc, { compact: true }) }),
        vw.kpi({ rot: 'ROI esperado', valor: U.fmtPct(k.roiEsperado, 0),
          nota: 'benefício ' + U.fmtMoney(k.beneficioEsperado, { compact: true }),
          dica: '(benefício esperado − BAC) ÷ BAC. Indicativo: não substitui o business case.' })
      ]));

      const g12 = U.el('div', { class: 'grade grade--12' });

      const hostS = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-8' }, [vw.cartao({
        titulo: 'Curva S consolidada', icone: 'dinheiro',
        sub: 'PV, EV e AC acumulados. A partir da data de status, PV é previsão.',
        corpo: [hostS]
      })]));
      const curva = M.curvaS(c.projetos, c.dataStatus);
      if (curva.length) {
        const idxDd = curva.reduce(function (a, x, i) { return x.futuro ? a : i; }, 0);
        vw.grafico(ctxView, C.curvaS, hostS, {
          periodos: curva.map(function (x) { return U.fmtPeriodo(x.periodo); }),
          pv: curva.map(function (x) { return x.pv; }),
          ev: curva.map(function (x) { return x.ev; }),
          ac: curva.map(function (x) { return x.ac; }),
          idxDataDate: idxDd
        }, { altura: 320 });
      }

      // CAPEX vs OPEX
      const hostCo = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-4' }, [vw.cartao({
        titulo: 'CAPEX vs OPEX', icone: 'balanca',
        sub: 'Composição do orçamento do portfólio',
        corpo: [hostCo]
      })]));
      vw.grafico(ctxView, C.donut, hostCo, {
        segmentos: [
          { rotulo: 'CAPEX', valor: U.sum(c.projetos, function (p) { return p.finance.orcamentoCapex; }), cor: 'var(--serie-1)' },
          { rotulo: 'OPEX', valor: U.sum(c.projetos, function (p) { return p.finance.orcamentoOpex; }), cor: 'var(--serie-2)' }
        ]
      }, { altura: 250, formatar: function (v) { return U.fmtMoney(v, { compact: true }); } });

      // orçamento por programa
      const hostProg = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Orçamento e realizado por programa', icone: 'dinheiro',
        sub: 'Barras agrupadas — mesma escala em R$',
        corpo: [hostProg]
      })]));
      const porProg = U.groupBy(c.projetos, function (p) { return p.programaId || '_sem'; });
      const progIds = Object.keys(porProg);
      vw.grafico(ctxView, C.barras, hostProg, {
        categorias: progIds.map(function (id) {
          return id === '_sem' ? 'Sem programa' : U.truncar(M.nomePrograma(c.bundle, id), 22);
        }),
        series: [
          { nome: 'Orçamento (BAC)', cor: 'var(--serie-1)',
            valores: progIds.map(function (id) { return U.sum(porProg[id], function (p) { return M.bac(p); }); }) },
          { nome: 'Custo real (AC)', cor: 'var(--serie-2)',
            valores: progIds.map(function (id) { return U.sum(porProg[id], function (p) { return p.finance.custoReal; }); }) },
          { nome: 'Projeção (EAC)', cor: 'var(--serie-3)',
            valores: progIds.map(function (id) { return U.sum(porProg[id], function (p) { return c.evm(p).EAC; }); }) }
        ]
      }, { altura: 320, horizontal: true, formatar: function (v) { return U.fmtMoney(v, { compact: true }); } });

      // variação por projeto (divergente)
      const hostVar = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Variação na conclusão por projeto (VAC)', icone: 'alvo',
        sub: 'Negativo = estouro projetado. Só projetos com EAC derivado de desempenho medido.',
        corpo: [hostVar]
      })]));
      const comVac = U.sortBy(c.projetos.filter(function (p) {
        const e = c.evm(p);
        return e.metodoEac === 'cpi' || e.metodoEac === 'manual';
      }), function (p) { return c.evm(p).VAC; }).slice(0, 14);
      if (comVac.length) {
        vw.grafico(ctxView, C.barras, hostVar, {
          categorias: comVac.map(function (p) { return p.codigo || U.truncar(p.nome, 14); }),
          series: [{ nome: 'VAC', cor: 'var(--serie-1)', valores: comVac.map(function (p) { return c.evm(p).VAC; }) }]
        }, { altura: 320, horizontal: true, formatar: function (v) { return U.fmtMoney(v, { compact: true }); } });
      } else {
        hostVar.appendChild(U.el('p', { class: 'txt-peq txt-3',
          text: 'Nenhum projeto tem desempenho de custo suficiente para projetar EAC pelo CPI.' }));
      }

      host.appendChild(g12);

      // tabela EVM
      host.appendChild(vw.cartao({
        titulo: 'Indicadores de EVM por projeto', icone: 'tabela', classe: 'mt-4',
        sub: 'Índices marcados com “n/s” ainda não são significativos na data de status',
        corpo: [vw.tabela({
          legenda: 'EVM por projeto', faixas: true,
          colunas: [
            { id: 'cod', rot: 'Projeto', fix: true, render: function (p) { return irProjeto(p, 'financeiro'); } },
            { id: 'nome', rot: 'Nome', largura: '200px', valor: function (p) { return U.truncar(p.nome, 34); } },
            { id: 'rag', rot: 'Farol', cent: true, render: function (p) { return vw.farol(c.saude(p).rag); } },
            { id: 'bac', rot: 'BAC', num: true, valor: function (p) { return U.fmtMoney(c.evm(p).BAC, { compact: true }); } },
            { id: 'pv', rot: 'PV', num: true, valor: function (p) { return U.fmtMoney(c.evm(p).PV, { compact: true }); } },
            { id: 'ev', rot: 'EV', num: true, valor: function (p) { return U.fmtMoney(c.evm(p).EV, { compact: true }); } },
            { id: 'ac', rot: 'AC', num: true, valor: function (p) { return U.fmtMoney(c.evm(p).AC, { compact: true }); } },
            { id: 'sv', rot: 'SV', num: true, render: function (p) {
              const e = c.evm(p);
              return U.el('span', { class: 'txt-num ' + (e.SV < 0 ? 'txt-ruim' : 'txt-bom'),
                text: U.fmtMoney(e.SV, { compact: true }) });
            } },
            { id: 'cv', rot: 'CV', num: true, render: function (p) {
              const e = c.evm(p);
              return U.el('span', { class: 'txt-num ' + (e.CV < 0 ? 'txt-ruim' : 'txt-bom'),
                text: U.fmtMoney(e.CV, { compact: true }) });
            } },
            { id: 'spi', rot: 'SPI', num: true, render: function (p) {
              const e = c.evm(p);
              if (e.SPI !== null && !e.spiSignificativo) {
                return U.el('span', { class: 'txt-3 txt-num',
                  text: U.fmtRazao(e.SPI, 2) + ' n/s',
                  attrs: { title: 'Índice ainda não significativo: apenas ' +
                    U.fmtPct(e.pctPlanejado, 1) + ' do valor planejado decorreu.' } });
              }
              return vw.celulaIndice(e.SPI, c.limiares.spi);
            } },
            { id: 'cpi', rot: 'CPI', num: true, render: function (p) {
              const e = c.evm(p);
              if (e.CPI !== null && !e.cpiSignificativo) {
                return U.el('span', { class: 'txt-3 txt-num',
                  text: U.fmtRazao(e.CPI, 2) + ' n/s',
                  attrs: { title: 'Índice ainda não significativo: custo incorrido de apenas ' +
                    U.fmtPct(U.safeDiv(e.AC, e.BAC) * 100, 1) + ' do BAC.' } });
              }
              return vw.celulaIndice(e.CPI, c.limiares.cpi);
            } },
            { id: 'eac', rot: 'EAC', num: true, render: function (p) {
              const e = c.evm(p);
              const rotMet = { cpi: 'extrapolado pelo CPI medido', manual: 'informado manualmente',
                'restante-no-plano': 'restante ao ritmo planejado (CPI ainda não significativo)',
                baseline: 'igual à baseline (sem custo incorrido)' };
              return U.el('span', { class: 'txt-num' + (e.EAC > e.BAC * 1.05 ? ' txt-ruim' : ''),
                text: U.fmtMoney(e.EAC, { compact: true }),
                attrs: { title: 'Método: ' + (rotMet[e.metodoEac] || e.metodoEac) } });
            } },
            { id: 'vac', rot: 'VAC', num: true, render: function (p) {
              const e = c.evm(p);
              return U.el('span', { class: 'txt-num ' + (e.VAC < 0 ? 'txt-ruim txt-forte' : 'txt-bom'),
                text: U.fmtMoney(e.VAC, { compact: true }) });
            } },
            { id: 'tcpi', rot: 'TCPI', num: true, render: function (p) {
              const e = c.evm(p);
              return U.el('span', { class: 'txt-num', text: e.TCPI === null ? 'n/a' : U.fmtRazao(e.TCPI, 2),
                attrs: { title: 'Eficiência de custo necessária no trabalho restante para fechar no BAC.' } });
            } }
          ],
          linhas: U.sortBy(c.projetos, function (p) { return c.evm(p).BAC; }, 'desc'),
          rodape: ['', 'Total', '', U.fmtMoney(k.bac, { compact: true }),
            U.fmtMoney(k.pv, { compact: true }), U.fmtMoney(k.ev, { compact: true }),
            U.fmtMoney(k.ac, { compact: true }),
            U.fmtMoney(k.ev - k.pv, { compact: true }), U.fmtMoney(k.ev - k.ac, { compact: true }),
            k.spi === null ? 'n/a' : U.fmtRazao(k.spi, 2),
            k.cpi === null ? 'n/a' : U.fmtRazao(k.cpi, 2),
            U.fmtMoney(k.eac, { compact: true }), U.fmtMoney(k.vac, { compact: true }), '']
        })]
      }));
    }
  };

  /* =========================================================================
     RECURSOS E CAPACIDADE
     ========================================================================= */

  PMO.views['recursos'] = {
    titulo: 'Recursos e capacidade',
    icone: 'pessoas',
    grupo: 'Recursos e valor',
    sub: 'Alocação por pessoa e mês. Sobrealocação é a causa silenciosa de atraso no portfólio.',
    filtros: ['busca', 'programaId', 'estagio'],

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      const cap = M.capacidade(c.bundle, { meses: 12, de: c.dataStatus });

      if (!cap.pessoas.length) {
        host.appendChild(vw.vazio({
          icone: 'pessoas', titulo: 'Nenhuma pessoa alocada',
          txt: 'Cadastre pessoas e crie alocações nos projetos para acompanhar a capacidade do portfólio.'
        }));
        return;
      }

      const sobre = cap.pessoas.filter(function (p) { return p.mesesEmOver > 0; });
      const criticos = cap.pessoas.filter(function (p) { return p.picoPct >= c.limiares.alocacaoPessoaPct.vermelho; });

      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Pessoas alocadas', valor: String(cap.pessoas.filter(function (p) { return p.picoPct > 0; }).length),
          nota: 'de ' + cap.pessoas.length + ' cadastradas' }),
        vw.kpi({ rot: 'Com sobrealocação', valor: String(sobre.length),
          nota: 'em algum mês dos próximos 12', tom: sobre.length ? 'aviso' : null }),
        vw.kpi({ rot: 'Acima do limiar crítico', valor: String(criticos.length),
          nota: '≥ ' + c.limiares.alocacaoPessoaPct.vermelho + '% de alocação',
          tom: criticos.length ? 'critico' : null }),
        vw.kpi({ rot: 'Alocação média', valor: U.fmtPct(U.media(cap.pessoas, function (p) { return p.mediaPct; }), 0),
          nota: 'média dos próximos 12 meses' })
      ]));

      // heatmap pessoa x mes
      const hostHm = U.el('div');
      host.appendChild(vw.cartao({
        titulo: 'Mapa de calor de alocação', icone: 'pessoas', classe: 'mb-4',
        sub: 'Percentual de alocação por pessoa e mês. Valores acima de 100% indicam sobrealocação.',
        corpo: [hostHm]
      }));
      const comAloc = cap.pessoas.filter(function (p) { return p.picoPct > 0; });
      vw.grafico(ctxView, C.heatmap, hostHm, {
        linhas: comAloc.map(function (p) { return p.nome; }),
        colunas: cap.periodos.map(function (pe) { return U.fmtPeriodo(pe); }),
        celulas: (function () {
          const out = [];
          comAloc.forEach(function (p, li) {
            p.meses.forEach(function (m, ci) {
              out.push({ l: li, c: ci, valor: m.alocPct,
                rotulo: m.projetos.length + ' projeto(s)' });
            });
          });
          return out;
        })()
      }, {
        alturaCelula: 26,
        formatar: function (v) { return U.fmtNum(v, 0) + '%'; },
        tituloEscala: 'Alocação (%)',
        onClick: function (cel) {
          const p = comAloc[cel.l];
          const m = p.meses[cel.c];
          PMO.app.abrirModal(p.nome + ' — ' + U.fmtPeriodo(m.periodo),
            U.el('div', {}, [
              vw.metrica('Alocação total', U.fmtPct(m.alocPct, 0),
                { tom: m.alocPct > 100 ? 'ruim' : 'bom' }),
              vw.metrica('Horas comprometidas', U.fmtNum(m.horas, 0) + ' h de ' + p.capacidadeHorasMes + ' h'),
              U.el('div', { class: 'divisor' }),
              m.projetos.length ? vw.tabela({
                compacta: true, legenda: 'Projetos que consomem esta pessoa no mês',
                colunas: [
                  { id: 'cod', rot: 'Projeto', valor: function (x) { return x.codigo || x.nome; } },
                  { id: 'papel', rot: 'Papel', valor: function (x) { return x.papel; } },
                  { id: 'pct', rot: 'Alocação', num: true, valor: function (x) { return U.fmtPct(x.pct, 0); } }
                ],
                linhas: m.projetos
              }) : U.el('p', { class: 'txt-peq txt-3', text: 'Sem alocação neste mês.' })
            ]));
        }
      });

      host.appendChild(vw.cartao({
        titulo: 'Carga por pessoa', icone: 'tabela',
        corpo: [vw.tabela({
          legenda: 'Alocação consolidada por pessoa', faixas: true,
          colunas: [
            { id: 'nome', rot: 'Pessoa', fix: true, render: function (p) {
              return vw.pessoa(c.bundle, p.pessoaId, { peq: true });
            } },
            { id: 'papel', rot: 'Papel', valor: function (p) { return p.papel; } },
            { id: 'cap', rot: 'Capacidade', num: true, valor: function (p) { return p.capacidadeHorasMes + ' h/mês'; } },
            { id: 'media', rot: 'Alocação média', num: true, render: function (p) {
              return vw.progresso(Math.min(100, p.mediaPct), 100, { semTexto: false });
            }, valor: function (p) { return p.mediaPct; } },
            { id: 'pico', rot: 'Pico', num: true, render: function (p) {
              const crit = p.picoPct >= c.limiares.alocacaoPessoaPct.vermelho;
              const av = p.picoPct > c.limiares.alocacaoPessoaPct.ambar;
              return U.el('span', { class: 'txt-num' + (crit ? ' txt-ruim txt-forte' : (av ? ' txt-forte' : '')),
                text: U.fmtPct(p.picoPct, 0) });
            }, valor: function (p) { return p.picoPct; } },
            { id: 'over', rot: 'Meses em sobrecarga', num: true, render: function (p) {
              return U.el('span', { class: 'txt-num' + (p.mesesEmOver ? ' txt-ruim' : ''), text: String(p.mesesEmOver) });
            }, valor: function (p) { return p.mesesEmOver; } },
            { id: 'projs', rot: 'Projetos', num: true, valor: function (p) {
              const ids = {};
              p.meses.forEach(function (m) { m.projetos.forEach(function (x) { ids[x.id] = true; }); });
              return Object.keys(ids).length;
            } }
          ],
          linhas: cap.pessoas
        })]
      }));
    }
  };

  /* =========================================================================
     BENEFÍCIOS
     ========================================================================= */

  PMO.views['beneficios'] = {
    titulo: 'Benefícios',
    icone: 'beneficio',
    grupo: 'Recursos e valor',
    sub: 'Valor prometido no business case versus valor efetivamente realizado. É aqui que a governança fecha o ciclo.',
    filtros: ['busca', 'programaId', 'categoria', 'estagio'],

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      const bens = achatar(c.projetos, 'beneficios');
      if (!bens.length) {
        host.appendChild(vw.vazio({
          icone: 'beneficio', titulo: 'Nenhum benefício registrado',
          txt: 'Registre os benefícios esperados de cada projeto para acompanhar a realização de valor.'
        }));
        return;
      }
      const k = c.kpis();

      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Benefício esperado', valor: U.fmtMoney(k.beneficioEsperado, { compact: true }),
          nota: bens.length + ' benefício(s) registrado(s)', tom: 'destaque' }),
        vw.kpi({ rot: 'Benefício realizado', valor: U.fmtMoney(k.beneficioRealizado, { compact: true }),
          nota: U.fmtPct(k.pctBeneficioRealizado, 0) + ' do esperado' }),
        vw.kpi({ rot: 'Investimento (BAC)', valor: U.fmtMoney(k.bac, { compact: true }) }),
        vw.kpi({ rot: 'ROI esperado', valor: U.fmtPct(k.roiEsperado, 0),
          tom: k.roiEsperado < 0 ? 'critico' : 'bom',
          dica: '(benefício esperado − investimento) ÷ investimento.' }),
        vw.kpi({ rot: 'Benefícios não realizados',
          valor: String(bens.filter(function (x) { return x.it.status === 'nao-realizado'; }).length),
          tom: bens.filter(function (x) { return x.it.status === 'nao-realizado'; }).length ? 'critico' : null })
      ]));

      const g12 = U.el('div', { class: 'grade grade--12' });

      // esperado vs realizado por tipo
      const hostTipo = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Esperado vs realizado por tipo', icone: 'beneficio',
        sub: 'Mesma escala em R$ — barras agrupadas',
        corpo: [hostTipo]
      })]));
      const porTipo = U.groupBy(bens, function (x) { return x.it.tipo; });
      const tipos = Object.keys(porTipo);
      vw.grafico(ctxView, C.barras, hostTipo, {
        categorias: tipos.map(function (t) { return M.rotulo('tiposBeneficio', t); }),
        series: [
          { nome: 'Esperado', cor: 'var(--serie-1)',
            valores: tipos.map(function (t) { return U.sum(porTipo[t], function (x) { return x.it.valorEsperado; }); }) },
          { nome: 'Realizado', cor: 'var(--serie-3)',
            valores: tipos.map(function (t) { return U.sum(porTipo[t], function (x) { return x.it.valorRealizado; }); }) }
        ]
      }, { altura: 300, horizontal: true, formatar: function (v) { return U.fmtMoney(v, { compact: true }); } });

      // situação dos benefícios
      const hostSt = U.el('div');
      g12.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Situação da realização', icone: 'alvo',
        corpo: [hostSt]
      })]));
      const porSt = U.contarPor(bens, function (x) { return x.it.status; });
      vw.grafico(ctxView, C.donut, hostSt, {
        segmentos: M.tax('statusBeneficio').map(function (s, i) {
          return { rotulo: s.rotulo, valor: porSt[s.id] || 0, cor: C.corSerie(i) };
        }).filter(function (x) { return x.valor > 0; })
      }, { altura: 280, formatar: function (v) { return U.fmtNum(v, 0); } });

      host.appendChild(g12);

      host.appendChild(vw.cartao({
        titulo: 'Registro de benefícios', icone: 'tabela', classe: 'mt-4',
        corpo: [vw.tabela({
          legenda: 'Benefícios do portfólio', faixas: true,
          colunas: [
            { id: 'proj', rot: 'Projeto', fix: true, render: function (x) { return irProjeto(x.p, 'resumo'); } },
            { id: 'nome', rot: 'Benefício', largura: '250px', valor: function (x) { return x.it.nome; } },
            { id: 'tipo', rot: 'Tipo', valor: function (x) { return M.rotulo('tiposBeneficio', x.it.tipo); } },
            { id: 'esp', rot: 'Esperado', num: true, valor: function (x) { return U.fmtMoney(x.it.valorEsperado, { compact: true }); } },
            { id: 'real', rot: 'Realizado', num: true, valor: function (x) { return U.fmtMoney(x.it.valorRealizado, { compact: true }); } },
            { id: 'pct', rot: 'Realização', num: true, render: function (x) {
              const pct = U.safeDiv(x.it.valorRealizado, x.it.valorEsperado) * 100;
              return vw.progresso(U.clamp(pct, 0, 100), 100);
            }, valor: function (x) { return U.safeDiv(x.it.valorRealizado, x.it.valorEsperado); } },
            { id: 'dono', rot: 'Dono', render: function (x) { return vw.pessoa(c.bundle, x.it.donoId, { peq: true, curto: true }); } },
            { id: 'prazo', rot: 'Prazo', num: true, valor: function (x) { return U.fmtDate(x.it.prazo); } },
            { id: 'st', rot: 'Situação', render: function (x) {
              const tom = x.it.status === 'realizado' ? 'bom'
                : (x.it.status === 'nao-realizado' ? 'critico'
                  : (x.it.status === 'em-realizacao' ? 'aviso' : 'neutro'));
              return vw.chip(M.rotulo('statusBeneficio', x.it.status), tom);
            } }
          ],
          linhas: U.sortBy(bens, function (x) { return x.it.valorEsperado; }, 'desc'),
          rodape: ['', 'Total', '', U.fmtMoney(k.beneficioEsperado, { compact: true }),
            U.fmtMoney(k.beneficioRealizado, { compact: true }),
            U.fmtPct(k.pctBeneficioRealizado, 0), '', '', '']
        })]
      }));
    }
  };

  /* =========================================================================
     PRIORIZAÇÃO
     ========================================================================= */

  PMO.views['priorizacao'] = {
    titulo: 'Priorização',
    icone: 'alvo',
    grupo: 'Recursos e valor',
    sub: 'Valor versus esforço. Serve para decidir o que entra, o que espera e o que sai do portfólio.',
    filtros: ['busca', 'programaId', 'categoria', 'estagio'],

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      if (!c.projetos.length) {
        host.appendChild(vw.vazio({ icone: 'alvo', titulo: 'Nenhum projeto no filtro' }));
        return;
      }
      const pesos = (c.bundle.settings || {}).pesosPriorizacao || M.PESOS_PRIORIZACAO_PADRAO;
      const rank = M.priorizar(c.projetos, pesos);

      host.appendChild(vw.aviso('info', 'Como ler este quadro',
        'O eixo horizontal é o esforço/risco relativo; o vertical é o valor relativo. O tamanho da bolha ' +
        'é o orçamento. Projetos no canto superior esquerdo entregam mais valor por unidade de esforço. ' +
        'Os pesos do cálculo ficam em Configurações.'));

      const hostBub = U.el('div');
      host.appendChild(vw.cartao({
        titulo: 'Matriz valor × esforço', icone: 'alvo', classe: 'mt-4 mb-4',
        sub: rank.length + ' projeto(s) pontuado(s)',
        corpo: [hostBub]
      }));
      // teto de 3 grupos categoricos em forma de todos-os-pares
      vw.grafico(ctxView, C.bubble, hostBub, {
        pontos: rank.map(function (x) {
          return {
            x: x.scoreEsforco, y: x.scoreValor, r: x.bac,
            rotulo: (x.projeto.codigo ? x.projeto.codigo + ' · ' : '') + x.projeto.nome,
            grupo: M.rotulo('categorias', x.projeto.categoria).replace(/ \(.*\)/, ''),
            id: x.projeto.id
          };
        })
      }, {
        altura: 400,
        xRotulo: 'Esforço e risco', yRotulo: 'Valor',
        rRotulo: 'Orçamento',
        formatarX: function (v) { return U.fmtNum(v, 0); },
        formatarY: function (v) { return U.fmtNum(v, 0); },
        formatarR: function (v) { return U.fmtMoney(v, { compact: true }); },
        quadrantes: { xMeio: 50, yMeio: 50,
          rotulos: ['ganho rápido', 'aposta estratégica', 'baixa prioridade', 'reavaliar'] },
        onClick: function (pt) { PMO.views.abrirProjeto(pt.id); }
      });

      host.appendChild(vw.cartao({
        titulo: 'Ranking de priorização', icone: 'tabela',
        sub: 'Ordenado pelo índice valor ÷ esforço',
        corpo: [vw.tabela({
          legenda: 'Ranking de priorização do portfólio', faixas: true,
          colunas: [
            { id: 'rank', rot: '#', num: true, largura: '44px', valor: function (x) { return x.ranking; } },
            { id: 'proj', rot: 'Projeto', fix: true, render: function (x) { return irProjeto(x.projeto, 'resumo'); } },
            { id: 'nome', rot: 'Nome', largura: '220px', valor: function (x) { return U.truncar(x.projeto.nome, 36); } },
            { id: 'cat', rot: 'Categoria', valor: function (x) {
              return M.rotulo('categorias', x.projeto.categoria).replace(/ \(.*\)/, '');
            } },
            { id: 'est', rot: 'Estágio', valor: function (x) { return M.rotulo('estagios', x.projeto.estagio); } },
            { id: 'valor', rot: 'Valor', num: true, render: function (x) {
              return vw.progresso(x.scoreValor, null, { semTexto: false });
            }, valor: function (x) { return x.scoreValor; } },
            { id: 'esforco', rot: 'Esforço', num: true, render: function (x) {
              return vw.progresso(x.scoreEsforco, null, { semTexto: false });
            }, valor: function (x) { return x.scoreEsforco; } },
            { id: 'indice', rot: 'Valor ÷ esforço', num: true, render: function (x) {
              return U.el('span', { class: 'txt-num txt-forte', text: U.fmtRazao(x.indiceValorEsforco, 2) });
            }, valor: function (x) { return x.indiceValorEsforco; } },
            { id: 'bac', rot: 'BAC', num: true, valor: function (x) { return U.fmtMoney(x.bac, { compact: true }); } },
            { id: 'ben', rot: 'Benefício', num: true, valor: function (x) { return U.fmtMoney(x.beneficioLiquido, { compact: true }); } },
            { id: 'risco', rot: 'Exposição', num: true, valor: function (x) { return U.fmtMoney(x.exposicaoRisco, { compact: true }); } },
            { id: 'obrig', rot: 'Obrigatório', cent: true, render: function (x) {
              return x.projeto.obrigatorio || x.projeto.tipo === 'compliance'
                ? vw.chip('sim', 'aviso', { titulo: 'Projeto obrigatório: prioridade não é discricionária.' })
                : U.el('span', { class: 'txt-3', text: '—' });
            } }
          ],
          linhas: rank
        })]
      }));
    }
  };
})(window.PMO = window.PMO || {});
