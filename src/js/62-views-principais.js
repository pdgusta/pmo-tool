/* =============================================================================
   62-views-principais.js — Dashboard executivo, Portfólio (tabela/kanban),
                            Roadmap (Gantt) e o painel de detalhe do projeto
   Depende de: 00-util.js, 10-model.js, 20-store.js, 50-charts.js, 60-views-comuns.js
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const S = PMO.store;
  const C = PMO.chart;
  const vw = PMO.vw;

  /* =========================================================================
     DASHBOARD EXECUTIVO
     ========================================================================= */

  PMO.views['painel'] = {
    titulo: 'Painel executivo',
    icone: 'painel',
    grupo: 'Visão geral',
    sub: 'Situação do portfólio na data de status, com os indicadores que sustentam a decisão do comitê.',
    filtros: ['busca', 'programaId', 'estagio', 'rag', 'categoria'],

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      const k = c.kpis();
      const lista = c.projetos;

      if (!c.todos.length) {
        host.appendChild(vw.vazio({
          icone: 'painel',
          titulo: 'Nenhum projeto no portfólio',
          txt: 'Importe um arquivo de projeto, carregue o portfólio de demonstração ou cadastre um projeto manualmente.',
          acoes: [
            vw.botao('Carregar demonstração', { variante: 'primario', icone: 'mais', onClick: PMO.app.carregarDemo }),
            vw.botao('Importar arquivo', { icone: 'importar', onClick: function () { PMO.app.navegar('importar'); } })
          ]
        }));
        return;
      }

      /* ---------------------------------------------------------- linha KPI */
      const grade = U.el('div', { class: 'grade grade--kpi mb-4' });
      grade.appendChild(vw.kpi({
        rot: 'Projetos ativos', valor: U.fmtNum(k.ativos, 0),
        nota: k.total + ' no portfólio · ' + k.encerrados + ' encerrados', tom: 'destaque'
      }));
      grade.appendChild(vw.kpi({
        rot: 'Orçamento (BAC)', valor: U.fmtMoney(k.bac, { compact: true }),
        nota: 'comprometido ' + U.fmtMoney(k.comprometido, { compact: true })
      }));
      grade.appendChild(vw.kpi({
        rot: 'Custo real (AC)', valor: U.fmtMoney(k.ac, { compact: true }),
        nota: U.fmtPct(k.burnPct, 0) + ' do orçamento consumido',
        delta: { tom: k.burnPct > k.pctFisicoMedio + 6 ? 'ruim' : 'neutro',
          texto: 'avanço físico ' + U.fmtPct(k.pctFisicoMedio, 0) }
      }));
      grade.appendChild(vw.kpi({
        rot: 'Projeção final (EAC)', valor: U.fmtMoney(k.eac, { compact: true }),
        delta: { tom: k.vac < 0 ? 'ruim' : 'bom',
          texto: (k.vac < 0 ? 'estouro de ' : 'folga de ') + U.fmtMoney(Math.abs(k.vac), { compact: true }) },
        nota: 'VAC = BAC − EAC', tom: k.vac < 0 ? 'critico' : 'bom'
      }));
      grade.appendChild(vw.kpi({
        rot: 'SPI do portfólio', valor: k.spi === null ? 'n/a' : U.fmtRazao(k.spi, 2),
        nota: 'EV ÷ PV agregados', dica: 'Índice de desempenho de prazo. 1,00 = no plano.',
        tom: k.spi === null ? null : (k.spi < 0.9 ? 'critico' : (k.spi < 0.97 ? 'aviso' : 'bom'))
      }));
      grade.appendChild(vw.kpi({
        rot: 'CPI do portfólio', valor: k.cpi === null ? 'n/a' : U.fmtRazao(k.cpi, 2),
        nota: 'EV ÷ AC agregados', dica: 'Índice de desempenho de custo. 1,00 = no orçamento.',
        tom: k.cpi === null ? null : (k.cpi < 0.9 ? 'critico' : (k.cpi < 0.97 ? 'aviso' : 'bom'))
      }));
      grade.appendChild(vw.kpi({
        rot: 'Exposição a risco', valor: U.fmtMoney(k.exposicaoRisco, { compact: true }),
        nota: k.riscosAltos + ' riscos altos · ' + U.fmtPct(k.exposicaoPctBac, 1) + ' do BAC',
        tom: k.exposicaoPctBac > 8 ? 'critico' : (k.exposicaoPctBac > 4 ? 'aviso' : null)
      }));
      grade.appendChild(vw.kpi({
        rot: 'Decisões pendentes', valor: U.fmtNum(k.decisoesPendentes, 0),
        nota: k.decisoesVencidas + ' fora do prazo · ' + k.mudancasPendentes + ' mudanças',
        tom: k.decisoesVencidas > 0 ? 'critico' : null,
        onClick: function () { PMO.app.navegar('decisoes'); }
      }));
      host.appendChild(grade);

      /* ------------------------------------------------------ blocos visuais
         Duas dobras. A primeira responde "como está e o que exige ação"; a
         caixa de entrada do PMO vivia abaixo da linha d'água, que é o pior
         lugar possível para a única lista acionável da tela. A segunda dobra
         é composição — importante, mas consulta, não decisão. */
      const gTopo = U.el('div', { class: 'grade grade--12 mb-4' });
      const gComp = U.el('div', { class: 'grade grade--12' });

      // farol do portfólio
      const hostDonut = U.el('div');
      gComp.appendChild(U.el('div', { class: 'col-4' }, [vw.cartao({
        titulo: 'Farol do portfólio', icone: 'alvo',
        sub: 'Distribuição dos ' + lista.length + ' projetos filtrados',
        corpo: [hostDonut]
      })]));
      const segsRag = M.tax('rag').map(function (r) {
        return { rotulo: r.rotulo, valor: k.distRag[r.id] || 0, cor: C.corRag(r.id), id: r.id };
      }).filter(function (x) { return x.valor > 0; });
      vw.grafico(ctxView, C.donut, hostDonut, {
        segmentos: segsRag,
        centro: { valor: U.fmtPct(k.pctVerde, 0), rotulo: 'em verde' }
      }, {
        altura: 210, formatar: function (v) { return U.fmtNum(v, 0) + ' proj.'; },
        titulo: 'Farol do portfólio',
        onClick: function (seg) {
          PMO.app.filtro.rag = [seg.id];
          PMO.app.navegar('portfolio');
        }
      });

      // investimento por categoria
      const hostCat = U.el('div');
      gComp.appendChild(U.el('div', { class: 'col-4' }, [vw.cartao({
        titulo: 'Investimento por categoria', icone: 'balanca',
        sub: 'Equilíbrio manter / crescer / transformar',
        corpo: [hostCat]
      })]));
      const cats = M.tax('categorias');
      vw.grafico(ctxView, C.barras, hostCat, {
        categorias: cats.map(function (x) { return x.rotulo.replace(/ \(.*\)/, ''); }),
        series: [{ nome: 'Orçamento (BAC)',
          valores: cats.map(function (x) { return (k.distCategoria[x.id] || {}).bac || 0; }),
          cor: 'var(--serie-1)' }]
      }, {
        altura: 210, horizontal: true,
        formatar: function (v) { return U.fmtMoney(v, { compact: true }); },
        titulo: 'Investimento por categoria'
      });

      // índices SPI/CPI (dois medidores, nunca eixo duplo)
      const hostSpi = U.el('div');
      const hostCpi = U.el('div');
      gComp.appendChild(U.el('div', { class: 'col-4' }, [vw.cartao({
        titulo: 'Desempenho agregado', icone: 'alvo',
        sub: 'Índices consolidados do portfólio',
        corpo: [U.el('div', { class: 'grade grade--2' }, [hostSpi, hostCpi])]
      })]));
      vw.grafico(ctxView, C.gauge, hostSpi, {
        valor: k.spi, min: 0.6, max: 1.3, alvo: 1, rotulo: 'SPI', subRotulo: 'prazo'
      }, { altura: 150 });
      vw.grafico(ctxView, C.gauge, hostCpi, {
        valor: k.cpi, min: 0.6, max: 1.3, alvo: 1, rotulo: 'CPI', subRotulo: 'custo'
      }, { altura: 150 });

      // curva S agregada
      const hostS = U.el('div');
      gTopo.appendChild(U.el('div', { class: 'col-8' }, [vw.cartao({
        titulo: 'Curva S do portfólio', icone: 'dinheiro',
        sub: 'Valor planejado, valor agregado e custo real acumulados (todos em R$ — um único eixo)',
        corpo: [hostS]
      })]));
      const curva = M.curvaS(lista, c.dataStatus);
      const idxDd = curva.reduce(function (acc, x, i) { return x.futuro ? acc : i; }, 0);
      vw.grafico(ctxView, C.curvaS, hostS, {
        periodos: curva.map(function (x) { return U.fmtPeriodo(x.periodo); }),
        pv: curva.map(function (x) { return x.pv; }),
        ev: curva.map(function (x) { return x.ev; }),
        ac: curva.map(function (x) { return x.ac; }),
        idxDataDate: idxDd
      // Em monitor largo a curva ficava com proporção 3,4:1 e a inflexão
      // sumia. Altura maior devolve o ângulo que faz a curva ser lida.
      }, { altura: 360 });

      // caixa de entrada de governança
      const alertas = M.alertas(c.bundle).slice(0, 12);
      const hostAl = U.el('div', { class: 'lista-itens' });
      if (!alertas.length) {
        hostAl.appendChild(vw.vazio({ icone: 'ok', titulo: 'Nada exigindo ação', txt: 'Nenhum alerta de governança aberto nesta data de status.' }));
      } else {
        alertas.forEach(function (a) {
          hostAl.appendChild(U.el('button', {
            class: 'item-reg', type: 'button',
            on: { click: function () { if (a.projetoId) { PMO.views.abrirProjeto(a.projetoId); } } }
          }, [
            U.el('span', { class: 'item-reg__marca' }, [
              vw.pontoRag(a.gravidade === 'critico' ? 'vermelho' : 'ambar',
                a.gravidade === 'critico' ? 'Crítico' : 'Atenção')
            ]),
            U.el('span', { class: 'item-reg__corpo' }, [
              U.el('span', { class: 'item-reg__titulo', text: a.titulo }),
              U.el('span', { class: 'item-reg__meta' }, [U.el('span', { text: a.detalhe })])
            ])
          ]));
        });
      }
      gTopo.appendChild(U.el('div', { class: 'col-4' }, [vw.cartao({
        titulo: 'Exige ação do PMO', icone: 'alerta',
        classe: 'cartao--destaque',
        sub: M.alertas(c.bundle).length + ' item(ns) na caixa de entrada',
        corpo: [hostAl]
      })]));

      // matriz de risco do portfólio
      const hostMx = U.el('div');
      gComp.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Matriz de risco do portfólio', icone: 'risco',
        sub: 'Riscos abertos por probabilidade e impacto',
        acoes: [vw.botao('Registro completo', { peq: true, variante: 'fantasma', onClick: function () { PMO.app.navegar('riscos'); } })],
        corpo: [hostMx]
      })]));
      const celulas = {};
      lista.forEach(function (p) {
        M.riscosAbertos(p).forEach(function (r) {
          const kk = r.probabilidade + ':' + r.impacto;
          if (!celulas[kk]) { celulas[kk] = { prob: r.probabilidade, impacto: r.impacto, itens: [] }; }
          celulas[kk].itens.push({ id: r.id, rotulo: (p.codigo || p.nome) + ' — ' + r.titulo });
        });
      });
      vw.grafico(ctxView, C.matriz5x5, hostMx, {
        celulas: Object.keys(celulas).map(function (kk) { return celulas[kk]; })
      }, {
        altura: 320,
        onClick: function (cel) {
          PMO.app.abrirModal('Riscos em probabilidade ' + cel.prob + ' × impacto ' + cel.impacto,
            U.el('div', { class: 'lista-itens' }, cel.itens.map(function (it) {
              return U.el('div', { class: 'item-reg' }, [
                U.el('span', { class: 'item-reg__corpo' }, [U.el('span', { class: 'item-reg__titulo', text: it.rotulo })])
              ]);
            })));
        }
      });

      // funil de estágios
      const hostFun = U.el('div');
      gComp.appendChild(U.el('div', { class: 'col-6' }, [vw.cartao({
        titulo: 'Funil de estágios', icone: 'gate',
        sub: 'Quantidade de projetos por estágio do stage-gate',
        corpo: [hostFun]
      })]));
      const ordemEst = ['ideacao', 'analise', 'planejamento', 'execucao', 'transicao', 'encerrado'];
      vw.grafico(ctxView, C.funil, hostFun, {
        etapas: ordemEst.map(function (id) {
          return { id: id, rotulo: M.rotulo('estagios', id), valor: k.distEstagio[id] || 0 };
        }).filter(function (x) { return x.valor > 0; })
      }, { altura: 250, formatar: function (v) { return U.fmtNum(v, 0); } });

      host.appendChild(gTopo);
      host.appendChild(vw.secao({
        titulo: 'Composição do portfólio',
        sub: 'Distribuição, desempenho agregado e concentração de risco.',
        corpo: [gComp]
      }));
    }
  };

  /* =========================================================================
     PORTFÓLIO — tabela estilo Monday + kanban
     ========================================================================= */

  const COLUNAS_DISPONIVEIS = [
    'codigo', 'nome', 'rag', 'estagio', 'gate', 'programa', 'pm', 'sponsor', 'categoria',
    'prioridade', 'inicio', 'fim', 'desvio', 'progresso', 'bac', 'ac', 'eac', 'vac',
    'spi', 'cpi', 'riscos', 'issues'
  ];
  let colunasVisiveis = ['codigo', 'nome', 'rag', 'estagio', 'gate', 'pm', 'fim', 'desvio',
    'progresso', 'bac', 'eac', 'spi', 'cpi', 'riscos'];
  let modoPortfolio = 'tabela';
  let ordenacao = { col: 'codigo', dir: 'asc' };

  function colunasProjeto(c) {
    const b = c.bundle;
    const defs = {
      codigo: { id: 'codigo', rot: 'Código', fix: true, largura: '92px',
        render: function (p) {
          return U.el('button', {
            class: 'celula-link txt-mono', type: 'text' === 'x' ? null : 'button',
            text: p.codigo || '—',
            on: { click: function () { PMO.views.abrirProjeto(p.id); } }
          });
        },
        valor: function (p) { return p.codigo; } },
      nome: { id: 'nome', rot: 'Projeto', largura: '230px',
        render: function (p) {
          return U.el('button', {
            class: 'celula-link', type: 'button', text: p.nome,
            attrs: { title: p.nome },
            on: { click: function () { PMO.views.abrirProjeto(p.id); } }
          });
        },
        valor: function (p) { return p.nome; } },
      rag: { id: 'rag', rot: 'Farol', cent: true, largura: '104px',
        render: function (p) {
          const s = c.saude(p);
          const n = vw.farol(s.rag);
          n.setAttribute('title', s.motivos.map(function (m) { return m.texto; }).join(' ') +
            (s.manual ? ' [farol definido manualmente]' : ''));
          if (s.manual) { n.appendChild(U.el('span', { text: '*', attrs: { title: 'Farol definido manualmente pelo PMO' } })); }
          return n;
        },
        valor: function (p) { return c.saude(p).rag; } },
      estagio: { id: 'estagio', rot: 'Estágio', largura: '112px',
        valor: function (p) { return M.rotulo('estagios', p.estagio); } },
      gate: { id: 'gate', rot: 'Gate', cent: true, largura: '64px',
        render: function (p) {
          const g = M.gatePorId(p.gateAtual);
          return vw.chip(g ? g.codigo : '—', 'contorno', { titulo: g ? g.nome + ' — ' + g.descricao : '' });
        },
        valor: function (p) { return M.ordemGate(p.gateAtual); } },
      programa: { id: 'programa', rot: 'Programa', largura: '170px',
        valor: function (p) { return M.nomePrograma(b, p.programaId); } },
      pm: { id: 'pm', rot: 'Gerente', largura: '150px',
        render: function (p) { return vw.pessoa(b, p.pmId, { peq: true }); },
        valor: function (p) { return M.nomePessoa(b, p.pmId); } },
      sponsor: { id: 'sponsor', rot: 'Sponsor', largura: '150px',
        render: function (p) { return vw.pessoa(b, p.sponsorId, { peq: true }); },
        valor: function (p) { return M.nomePessoa(b, p.sponsorId); } },
      categoria: { id: 'categoria', rot: 'Categoria', largura: '116px',
        valor: function (p) { return M.rotulo('categorias', p.categoria).replace(/ \(.*\)/, ''); } },
      prioridade: { id: 'prioridade', rot: 'Prio.', num: true, largura: '56px',
        valor: function (p) { return p.prioridade; } },
      inicio: { id: 'inicio', rot: 'Início', num: true, largura: '92px',
        valor: function (p) { return U.fmtDate(p.dates.previstoInicio); } },
      fim: { id: 'fim', rot: 'Término', num: true, largura: '92px',
        render: function (p) {
          const base = p.dates.baselineFim;
          const prev = p.dates.previstoFim;
          const atrasado = base && prev && prev > base;
          return U.el('span', {
            class: atrasado ? 'txt-ruim txt-num' : 'txt-num',
            text: U.fmtDate(prev),
            attrs: { title: base ? 'Baseline: ' + U.fmtDate(base) : 'Sem baseline' }
          });
        },
        valor: function (p) { return p.dates.previstoFim || ''; } },
      desvio: { id: 'desvio', rot: 'Desvio', num: true, largura: '78px',
        dica: 'Dias entre o término previsto e o término da baseline.',
        render: function (p) {
          const e = c.evm(p);
          const tom = vw.tomDesvio(e.desvioDias, c.limiares.desvioDias);
          return U.el('span', {
            class: 'txt-num ' + (tom === 'ruim' ? 'txt-ruim txt-forte' : (tom === 'bom' ? 'txt-3' : '')),
            text: vw.fmtDesvioDias(e.desvioDias)
          });
        },
        valor: function (p) { return c.evm(p).desvioDias; } },
      progresso: { id: 'progresso', rot: 'Avanço', largura: '128px',
        dica: 'Barra: avanço físico. Marca vertical: avanço planejado na data de status.',
        render: function (p) {
          const e = c.evm(p);
          return vw.progresso(e.pctFisico, e.pctPlanejado);
        },
        valor: function (p) { return p.progress.pctFisico; } },
      bac: { id: 'bac', rot: 'BAC', num: true, largura: '104px',
        render: function (p) { return U.el('span', { class: 'txt-num', text: U.fmtMoney(c.evm(p).BAC, { compact: true }) }); },
        valor: function (p) { return c.evm(p).BAC; } },
      ac: { id: 'ac', rot: 'AC', num: true, largura: '104px',
        render: function (p) { return U.el('span', { class: 'txt-num', text: U.fmtMoney(c.evm(p).AC, { compact: true }) }); },
        valor: function (p) { return c.evm(p).AC; } },
      eac: { id: 'eac', rot: 'EAC', num: true, largura: '104px',
        dica: 'Estimativa de custo na conclusão: BAC ÷ CPI, ou valor informado manualmente.',
        render: function (p) {
          const e = c.evm(p);
          return U.el('span', {
            class: 'txt-num' + (e.EAC > e.BAC * 1.05 ? ' txt-ruim' : ''),
            text: U.fmtMoney(e.EAC, { compact: true })
          });
        },
        valor: function (p) { return c.evm(p).EAC; } },
      vac: { id: 'vac', rot: 'VAC', num: true, largura: '104px',
        dica: 'Variação na conclusão: BAC − EAC. Negativo indica estouro projetado.',
        render: function (p) {
          const e = c.evm(p);
          return U.el('span', { class: 'txt-num ' + (e.VAC < 0 ? 'txt-ruim' : 'txt-bom'),
            text: U.fmtMoney(e.VAC, { compact: true }) });
        },
        valor: function (p) { return c.evm(p).VAC; } },
      spi: { id: 'spi', rot: 'SPI', num: true, largura: '62px',
        render: function (p) { return vw.celulaIndice(c.evm(p).SPI, c.limiares.spi); },
        valor: function (p) { return c.evm(p).SPI; } },
      cpi: { id: 'cpi', rot: 'CPI', num: true, largura: '62px',
        render: function (p) { return vw.celulaIndice(c.evm(p).CPI, c.limiares.cpi); },
        valor: function (p) { return c.evm(p).CPI; } },
      riscos: { id: 'riscos', rot: 'Riscos', num: true, largura: '70px',
        dica: 'Riscos abertos (altos entre parênteses).',
        render: function (p) {
          const ab = M.riscosAbertos(p);
          const altos = ab.filter(function (r) { return M.scoreRisco(r) >= c.limiares.scoreRiscoAlto; }).length;
          return U.el('span', { class: 'txt-num' + (altos ? ' txt-ruim txt-forte' : ''),
            text: ab.length + (altos ? ' (' + altos + ')' : '') });
        },
        valor: function (p) { return M.riscosAbertos(p).length; } },
      issues: { id: 'issues', rot: 'Issues', num: true, largura: '68px',
        render: function (p) {
          const ab = M.issuesAbertas(p);
          const crit = ab.filter(function (i) { return i.severidade >= 4; }).length;
          return U.el('span', { class: 'txt-num' + (crit ? ' txt-ruim txt-forte' : ''),
            text: ab.length + (crit ? ' (' + crit + ')' : '') });
        },
        valor: function (p) { return M.issuesAbertas(p).length; } }
    };
    return colunasVisiveis.map(function (id) { return defs[id]; }).filter(Boolean);
  }

  function seletorColunas() {
    const btn = vw.botao('Colunas', { peq: true, icone: 'tabela' });
    btn.addEventListener('click', function () {
      const corpo = U.el('div', { class: 'pilha pilha--2' });
      COLUNAS_DISPONIVEIS.forEach(function (id) {
        const marcado = colunasVisiveis.indexOf(id) >= 0;
        corpo.appendChild(U.el('label', { class: 'marcador' }, [
          U.el('input', { type: 'checkbox', checked: marcado,
            on: { change: function (e) {
              const i = colunasVisiveis.indexOf(id);
              if (e.target.checked && i < 0) {
                // preserva a ordem canonica
                colunasVisiveis = COLUNAS_DISPONIVEIS.filter(function (x) {
                  return x === id || colunasVisiveis.indexOf(x) >= 0;
                });
              } else if (!e.target.checked && i >= 0) { colunasVisiveis.splice(i, 1); }
            } } }),
          U.el('span', { text: id === 'codigo' ? 'Código' : id === 'nome' ? 'Projeto' : id.toUpperCase() })
        ]));
      });
      PMO.app.abrirModal('Colunas visíveis', corpo, {
        estreito: true,
        acoes: [vw.botao('Aplicar', { variante: 'primario', onClick: function () {
          PMO.app.fecharModal(); PMO.app.recarregarView();
        } })]
      });
    });
    return btn;
  }

  PMO.views['portfolio'] = {
    titulo: 'Portfólio',
    icone: 'tabela',
    grupo: 'Visão geral',
    sub: 'Todos os projetos sob governança. Clique em um projeto para abrir o painel de detalhe.',
    filtros: ['busca', 'programaId', 'estagio', 'rag', 'categoria', 'tipo', 'pmId', 'sponsorId', 'gateAtual'],

    acoes: function () {
      return [
        U.el('div', { class: 'grupo-botoes' }, [
          U.el('button', { class: 'botao botao--peq', type: 'button',
            attrs: { 'aria-pressed': String(modoPortfolio === 'tabela') },
            on: { click: function () { modoPortfolio = 'tabela'; PMO.app.recarregarView(); } } },
            [vw.icone('tabela', { tam: 13 }), U.el('span', { text: 'Tabela' })]),
          U.el('button', { class: 'botao botao--peq', type: 'button',
            attrs: { 'aria-pressed': String(modoPortfolio === 'kanban') },
            on: { click: function () { modoPortfolio = 'kanban'; PMO.app.recarregarView(); } } },
            [vw.icone('kanban', { tam: 13 }), U.el('span', { text: 'Kanban' })])
        ]),
        seletorColunas(),
        vw.botao('Novo projeto', { peq: true, variante: 'primario', icone: 'mais',
          onClick: function () { PMO.views.novoProjeto(); } })
      ];
    },

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      if (!c.todos.length) {
        host.appendChild(vw.vazio({
          icone: 'tabela', titulo: 'Portfólio vazio',
          txt: 'Cadastre um projeto, importe um arquivo do MS Project/Primavera ou carregue a demonstração.',
          acoes: [
            vw.botao('Carregar demonstração', { variante: 'primario', onClick: PMO.app.carregarDemo }),
            vw.botao('Novo projeto', { onClick: function () { PMO.views.novoProjeto(); } })
          ]
        }));
        return;
      }
      if (!c.projetos.length) {
        host.appendChild(vw.vazio({
          icone: 'filtro', titulo: 'Nenhum projeto atende ao filtro',
          txt: 'Ajuste ou limpe os filtros na barra acima para ver os projetos novamente.'
        }));
        return;
      }

      if (modoPortfolio === 'kanban') { montarKanban(host, c); return; }

      const cols = colunasProjeto(c);
      const colDef = cols.find(function (x) { return x.id === ordenacao.col; }) || cols[0];
      const ordenados = U.sortBy(c.projetos, function (p) {
        return colDef.valor ? colDef.valor(p) : p[colDef.id];
      }, ordenacao.dir);

      const kk = c.kpis(c.projetos);
      const rodape = cols.map(function (col) {
        if (col.id === 'codigo') { return String(ordenados.length) + ' proj.'; }
        if (col.id === 'nome') { return 'Total filtrado'; }
        if (col.id === 'bac') { return U.fmtMoney(kk.bac, { compact: true }); }
        if (col.id === 'ac') { return U.fmtMoney(kk.ac, { compact: true }); }
        if (col.id === 'eac') { return U.fmtMoney(kk.eac, { compact: true }); }
        if (col.id === 'vac') { return U.fmtMoney(kk.vac, { compact: true }); }
        if (col.id === 'spi') { return kk.spi === null ? 'n/a' : U.fmtRazao(kk.spi, 2); }
        if (col.id === 'cpi') { return kk.cpi === null ? 'n/a' : U.fmtRazao(kk.cpi, 2); }
        if (col.id === 'riscos') { return String(kk.riscosAbertos); }
        if (col.id === 'issues') { return String(kk.issuesAbertas); }
        return '';
      });

      host.appendChild(vw.tabela({
        colunas: cols,
        linhas: ordenados,
        chave: function (p) { return p.id; },
        legenda: 'Portfólio de projetos: ' + ordenados.length + ' projetos, ordenados por ' + colDef.rot,
        ordenacao: ordenacao,
        onOrdenar: function (col, dir) { ordenacao = { col: col, dir: dir }; PMO.app.recarregarView(); },
        onLinha: function (p) { PMO.views.abrirProjeto(p.id); },
        rodape: rodape,
        faixas: true
      }));
    }
  };

  function montarKanban(host, c) {
    const colunas = M.tax('estagios').filter(function (e) { return e.id !== 'suspenso'; });
    const porEstagio = U.groupBy(c.projetos, function (p) { return p.estagio; });
    const kb = U.el('div', { class: 'kanban' });

    colunas.forEach(function (est) {
      const itens = porEstagio[est.id] || [];
      const corpo = U.el('div', { class: 'kanban__col-corpo' });
      const col = U.el('div', { class: 'kanban__col', data: { estagio: est.id } }, [
        U.el('div', { class: 'kanban__col-topo' }, [
          U.el('span', { class: 'kanban__col-nome', text: est.rotulo }),
          U.el('span', { class: 'kanban__col-cont',
            text: itens.length + ' · ' + U.fmtMoney(U.sum(itens, function (p) { return M.bac(p); }), { compact: true }) })
        ]),
        corpo
      ]);

      itens.forEach(function (p) {
        const s = c.saude(p);
        const e = c.evm(p);
        const cartao = U.el('button', {
          class: 'kanban__cartao', type: 'button', draggable: 'true', data: { id: p.id },
          on: {
            click: function () { PMO.views.abrirProjeto(p.id); },
            dragstart: function (ev) {
              ev.dataTransfer.setData('text/plain', p.id);
              cartao.dataset.arrastando = '1';
            },
            dragend: function () { delete cartao.dataset.arrastando; }
          }
        }, [
          U.el('div', { class: 'kanban__cartao-topo' }, [
            U.el('span', { class: 'kanban__cartao-cod', text: p.codigo || '—' }),
            vw.farol(s.rag, { ponto: false })
          ]),
          U.el('div', { class: 'kanban__cartao-nome', text: p.nome }),
          vw.progresso(e.pctFisico, e.pctPlanejado),
          U.el('div', { class: 'kanban__cartao-meta' }, [
            vw.pessoa(c.bundle, p.pmId, { peq: true, curto: true, semNome: false }),
            U.el('span', { text: U.fmtMoney(e.BAC, { compact: true }) }),
            U.el('span', { text: U.fmtDate(p.dates.previstoFim) })
          ])
        ]);
        corpo.appendChild(cartao);
      });

      col.addEventListener('dragover', function (ev) { ev.preventDefault(); col.dataset.alvo = '1'; });
      col.addEventListener('dragleave', function () { delete col.dataset.alvo; });
      col.addEventListener('drop', function (ev) {
        ev.preventDefault();
        delete col.dataset.alvo;
        const id = ev.dataTransfer.getData('text/plain');
        const proj = M.projetoPorId(S.state, id);
        if (!proj || proj.estagio === est.id) { return; }
        const de = M.rotulo('estagios', proj.estagio);
        S.mutate('Mover estágio do projeto', function (d) {
          const alvo = d.projetos.find(function (x) { return x.id === id; });
          if (!alvo) { throw new Error('projeto não encontrado'); }
          alvo.estagio = est.id;
          const def = M.tax('estagios').find(function (x) { return x.id === est.id; });
          if (def && def.gate) { alvo.gateAtual = def.gate; }
          alvo.atualizadoEm = U.agoraIso();
        }, { entidade: 'projeto', entidadeId: id,
          resumo: (proj.codigo || proj.nome) + ': estágio ' + de + ' → ' + est.rotulo }).then(function () {
          U.toast((proj.codigo || proj.nome) + ' movido para ' + est.rotulo + '.', 'ok');
        });
      });

      if (!itens.length) {
        corpo.appendChild(U.el('div', { class: 'txt-mic txt-3', style: { padding: '12px', textAlign: 'center' },
          text: 'Arraste um projeto para cá' }));
      }
      kb.appendChild(col);
    });
    host.appendChild(kb);
  }

  /* =========================================================================
     ROADMAP — Gantt de portfólio em HTML (swimlanes por programa)
     ========================================================================= */

  let zoomRoadmap = 'mes';

  PMO.views['roadmap'] = {
    titulo: 'Roadmap',
    icone: 'calendario',
    grupo: 'Visão geral',
    sub: 'Linha do tempo do portfólio: barra do previsto, linha da baseline, marcos e gates. Dependências entre projetos em destaque.',
    filtros: ['busca', 'programaId', 'estagio', 'rag', 'categoria'],

    acoes: function () {
      return [U.el('div', { class: 'grupo-botoes' }, ['mes', 'trimestre', 'ano'].map(function (z) {
        return U.el('button', {
          class: 'botao botao--peq', type: 'button',
          attrs: { 'aria-pressed': String(zoomRoadmap === z) },
          on: { click: function () { zoomRoadmap = z; PMO.app.recarregarView(); } }
        }, [U.el('span', { text: z === 'mes' ? 'Mês' : (z === 'trimestre' ? 'Trimestre' : 'Ano') })]);
      }))];
    },

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      const lista = c.projetos.filter(function (p) { return p.dates.previstoInicio && p.dates.previstoFim; });
      if (!lista.length) {
        host.appendChild(vw.vazio({
          icone: 'calendario', titulo: 'Nenhum projeto com datas',
          txt: 'Projetos precisam de data de início e término previstos para aparecer no roadmap.'
        }));
        return;
      }

      let min = null, max = null;
      lista.forEach(function (p) {
        [p.dates.previstoInicio, p.dates.baselineInicio].forEach(function (d) {
          if (d && (!min || d < min)) { min = d; }
        });
        [p.dates.previstoFim, p.dates.baselineFim].forEach(function (d) {
          if (d && (!max || d > max)) { max = d; }
        });
      });
      min = U.addDays(U.periodoDe(min) + '-01', -8);
      max = U.addDays(max, 24);
      const totalDias = Math.max(30, U.diffDays(min, max));

      const larguraDia = zoomRoadmap === 'mes' ? 3.1 : (zoomRoadmap === 'trimestre' ? 1.25 : 0.5);
      const larguraTrilha = Math.max(560, Math.round(totalDias * larguraDia));

      function xDe(iso) {
        const d = U.diffDays(min, iso);
        return U.clamp(safe(d) * larguraDia, 0, larguraTrilha);
      }
      function safe(n) { return U.ehNum(n) ? n : 0; }

      const grade = U.el('div', { class: 'gantt__grade', style: { gridTemplateColumns: '260px ' + larguraTrilha + 'px' } });

      /* cabeçalho de períodos */
      const cabDir = U.el('div', { class: 'gantt__cab', style: { position: 'relative', height: '32px' } });
      const periodos = U.periodosEntre(min, max);
      periodos.forEach(function (pe, i) {
        const ini = pe + '-01';
        const x = xDe(ini);
        const mostrar = zoomRoadmap === 'mes' ? true
          : (zoomRoadmap === 'trimestre' ? (i % 3 === 0) : (pe.slice(5) === '01'));
        if (!mostrar) { return; }
        cabDir.appendChild(U.el('div', {
          class: 'gantt__periodo', style: { left: x + 'px' },
          text: zoomRoadmap === 'ano' ? pe.slice(0, 4)
            : (zoomRoadmap === 'trimestre' ? U.trimestreDe(ini).replace('-', ' ') : U.fmtPeriodo(pe))
        }));
      });
      grade.appendChild(U.el('div', { class: 'gantt__cab gantt__cab-esq', text: 'Projeto' }));
      grade.appendChild(cabDir);

      const xHoje = xDe(c.dataStatus);

      /* swimlanes por programa */
      const porPrograma = U.groupBy(lista, function (p) { return p.programaId || '_sem'; });
      const ordemProg = (c.bundle.programas || []).map(function (p) { return p.id; }).concat(['_sem']);
      const posLinha = {};
      let linhaIdx = 0;

      ordemProg.forEach(function (progId) {
        const itens = porPrograma[progId];
        if (!itens || !itens.length) { return; }
        const nomeProg = progId === '_sem' ? 'Sem programa' : M.nomePrograma(c.bundle, progId);
        const bacProg = U.sum(itens, function (p) { return M.bac(p); });
        grade.appendChild(U.el('div', { class: 'gantt__swim',
          text: nomeProg + '  ·  ' + itens.length + ' projeto(s)  ·  ' + U.fmtMoney(bacProg, { compact: true }) }));
        linhaIdx += 1;

        U.sortBy(itens, function (p) { return p.dates.previstoInicio; }).forEach(function (p) {
          const s = c.saude(p);
          const e = c.evm(p);
          posLinha[p.id] = linhaIdx;
          linhaIdx += 1;

          const rot = U.el('div', { class: 'gantt__rot' }, [
            vw.pontoRag(s.rag, M.rotuloRag(s.rag)),
            U.el('button', {
              class: 'celula-link gantt__rot-txt', type: 'button',
              text: (p.codigo ? p.codigo + ' ' : '') + p.nome,
              attrs: { title: p.nome },
              on: { click: function () { PMO.views.abrirProjeto(p.id); } }
            })
          ]);

          const faixa = U.el('div', { class: 'gantt__faixa', data: { id: p.id } });

          // baseline (referência histórica)
          if (p.dates.baselineInicio && p.dates.baselineFim) {
            const x0 = xDe(p.dates.baselineInicio), x1 = xDe(p.dates.baselineFim);
            faixa.appendChild(U.el('div', {
              class: 'gantt__baseline',
              style: { left: x0 + 'px', width: Math.max(3, x1 - x0) + 'px' },
              attrs: { title: 'Baseline: ' + U.fmtDate(p.dates.baselineInicio) + ' a ' + U.fmtDate(p.dates.baselineFim) }
            }));
          }

          // barra do previsto, com avanço físico embutido
          const bx0 = xDe(p.dates.previstoInicio), bx1 = xDe(p.dates.previstoFim);
          const barra = U.el('div', {
            class: 'gantt__barra', data: { rag: s.rag },
            style: { left: bx0 + 'px', width: Math.max(3, bx1 - bx0) + 'px' },
            attrs: {
              title: p.nome + '\n' + U.fmtDate(p.dates.previstoInicio) + ' a ' + U.fmtDate(p.dates.previstoFim) +
                '\nAvanço físico ' + U.fmtPct(e.pctFisico, 0) + ' (planejado ' + U.fmtPct(e.pctPlanejado, 0) + ')' +
                '\nFarol: ' + M.rotuloRag(s.rag),
              role: 'button', tabindex: '0'
            },
            on: {
              click: function () { PMO.views.abrirProjeto(p.id); },
              keydown: function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); PMO.views.abrirProjeto(p.id); }
              }
            }
          }, [
            U.el('div', { class: 'gantt__barra-ev', style: { width: U.clamp(e.pctFisico, 0, 100) + '%' } })
          ]);
          faixa.appendChild(barra);

          // marcos e gates
          (p.marcos || []).forEach(function (m) {
            const data = m.realData || m.previstoData || m.baselineData;
            if (!data) { return; }
            const x = xDe(data);
            const atrasado = !m.realData && data < c.dataStatus;
            if (m.gateId) {
              const g = M.gatePorId(m.gateId);
              faixa.appendChild(U.el('div', {
                class: 'gantt__gate', style: { left: (x - 9) + 'px' },
                text: g ? g.codigo : 'G',
                attrs: { title: (g ? g.codigo + ' — ' + g.nome : 'Gate') + '\n' + m.nome + '\n' +
                  (m.realData ? 'Concluído em ' + U.fmtDate(m.realData) : 'Previsto para ' + U.fmtDate(data)) }
              }));
            } else {
              faixa.appendChild(U.el('div', {
                class: 'gantt__marco', style: { left: (x - 5) + 'px' },
                data: { atrasado: atrasado ? '1' : null, feito: m.realData ? '1' : null },
                attrs: { title: m.nome + '\n' + (m.realData ? 'Concluído em ' + U.fmtDate(m.realData)
                  : 'Previsto para ' + U.fmtDate(data)) + (atrasado ? '\nATRASADO' : '') }
              }));
            }
          });

          grade.appendChild(rot);
          grade.appendChild(faixa);
        });
      });

      const hostGantt = U.el('div', { class: 'gantt__host' }, [grade]);
      const wrap = U.el('div', { class: 'gantt' }, [hostGantt]);

      // linha de hoje sobreposta na área de trilhas
      const marcaHoje = U.el('div', {
        class: 'gantt__hoje',
        style: { left: (260 + xHoje) + 'px' },
        attrs: { 'aria-hidden': 'true' }
      });
      grade.style.position = 'relative';
      grade.appendChild(marcaHoje);
      grade.appendChild(U.el('div', {
        class: 'gantt__hoje-rot', style: { left: (260 + xHoje) + 'px' },
        text: U.fmtDate(c.dataStatus)
      }));

      host.appendChild(vw.cartao({
        titulo: 'Roadmap do portfólio',
        sub: lista.length + ' projetos · ' + U.fmtDate(min) + ' a ' + U.fmtDate(max),
        acoes: [C.legenda(null, { itens: [
          { rotulo: 'Previsto', cor: 'var(--serie-1)', forma: 'quadrado' },
          { rotulo: 'Baseline', cor: 'var(--tinta-3)', forma: 'linha' },
          { rotulo: 'Data de status', cor: 'var(--st-critico)', forma: 'linha' }
        ] })],
        corpo: [wrap]
      }));

      // dependências cross-project: listadas em texto (o Gantt já está denso)
      const deps = [];
      lista.forEach(function (p) {
        (p.dependencias || []).forEach(function (d) {
          const alvo = M.projetoPorId(c.bundle, d.projetoDestinoId);
          if (alvo) { deps.push({ de: p, para: alvo, dep: d }); }
        });
      });
      if (deps.length) {
        host.appendChild(vw.cartao({
          titulo: 'Dependências entre projetos', icone: 'ligacao',
          sub: deps.length + ' ligação(ões) — atrasos se propagam ao longo destas setas',
          classe: 'mt-4',
          corpo: [vw.tabela({
            compacta: true,
            legenda: 'Dependências entre projetos do portfólio',
            colunas: [
              { id: 'de', rot: 'Predecessor', render: function (l) {
                return U.el('button', { class: 'celula-link', type: 'button', text: (l.de.codigo || l.de.nome),
                  on: { click: function () { PMO.views.abrirProjeto(l.de.id); } } });
              } },
              { id: 'tipo', rot: 'Tipo', cent: true, valor: function (l) { return l.dep.tipo; } },
              { id: 'lag', rot: 'Lag', num: true, valor: function (l) { return l.dep.lagDias + ' d'; } },
              { id: 'para', rot: 'Sucessor', render: function (l) {
                return U.el('button', { class: 'celula-link', type: 'button', text: (l.para.codigo || l.para.nome),
                  on: { click: function () { PMO.views.abrirProjeto(l.para.id); } } });
              } },
              { id: 'crit', rot: 'Criticidade', cent: true, render: function (l) {
                const def = M.tax('criticidades').find(function (x) { return x.id === l.dep.criticidade; });
                return vw.chip(def ? def.rotulo : l.dep.criticidade, def ? def.token : 'neutro');
              } },
              { id: 'desc', rot: 'Descrição', valor: function (l) { return l.dep.descricao; } }
            ],
            linhas: deps
          })]
        }));
      }
    }
  };

  PMO.views.zoomRoadmap = function (z) { zoomRoadmap = z; };

  /* =========================================================================
     PAINEL DE DETALHE DO PROJETO
     ========================================================================= */

  let abaProjeto = 'resumo';

  PMO.views.abrirProjeto = function (id, aba) {
    if (aba) { abaProjeto = aba; }
    const p = M.projetoPorId(S.state, id);
    if (!p) { U.toast('Projeto não encontrado.', 'erro'); return; }
    const c = vw.contexto(null);
    const s = c.saude(p);
    const e = c.evm(p);

    const corpo = U.el('div');
    const abas = U.el('div', { class: 'abas abas--grudada', attrs: { role: 'tablist' } });
    const conteudo = U.el('div');

    /* Faixa de contexto que NÃO troca com a aba. Antes, sair do Resumo levava
       junto farol, avanço e desvio — os quatro números que dão sentido a tudo
       que as outras abas mostram. */
    const faixa = U.el('div', { class: 'drawer-contexto' }, [
      U.el('div', { class: 'drawer-contexto__farol' }, [
        vw.farol(s.rag),
        s.manual ? U.el('span', { class: 'farol-manual', text: 'manual' }) : null
      ]),
      U.el('dl', { class: 'drawer-contexto__pares' }, [
        U.el('div', {}, [U.el('dt', { text: 'Estágio' }),
          U.el('dd', { text: M.rotulo('estagios', p.estagio) })]),
        U.el('div', {}, [U.el('dt', { text: 'Avanço' }),
          U.el('dd', { text: U.fmtPct(e.pctFisico, 0) + ' de ' + U.fmtPct(e.pctPlanejado, 0) })]),
        U.el('div', {}, [U.el('dt', { text: 'Término' }),
          U.el('dd', { text: U.fmtDate(p.dates.previstoFim) })]),
        U.el('div', {}, [U.el('dt', { text: 'Desvio' }),
          U.el('dd', {
            class: U.ehNum(e.desvioDias) && e.desvioDias > 0 ? 'txt-ruim' : '',
            text: vw.fmtDesvioDias(e.desvioDias)
          })]),
        U.el('div', {}, [U.el('dt', { text: 'EAC' }),
          U.el('dd', { class: e.VAC < 0 ? 'txt-ruim' : '', text: U.fmtMoney(e.EAC, { compact: true }) })])
      ])
    ]);

    const paginas = [
      ['resumo', 'Resumo', function () { return paginaResumo(p, c, s, e); }],
      ['cronograma', 'Marcos e gates', function () { return paginaCronograma(p, c); }],
      ['wbs', 'Cronograma (WBS)', function () { return paginaWbs(p, c); }],
      ['financeiro', 'Financeiro', function () { return paginaFinanceiro(p, c, e); }],
      ['riscos', 'Riscos e issues', function () { return paginaRiscos(p, c); }],
      ['governanca', 'Decisões e mudanças', function () { return paginaGovernanca(p, c); }],
      ['reportes', 'Status reports', function () { return paginaReportes(p, c); }],
      ['anexos', 'Anexos', function () { return paginaAnexos(p, c); }],
      ['dados', 'Dados e links', function () { return paginaDados(p, c); }]
    ];

    function pintar() {
      U.limpar(abas);
      U.limpar(conteudo);
      paginas.forEach(function (pg) {
        const cont = pg[0] === 'riscos'
          ? (M.riscosAbertos(p).length + M.issuesAbertas(p).length)
          : (pg[0] === 'anexos' ? (p.anexos || []).length
            : (pg[0] === 'wbs' ? (p.tarefas || []).length
              : (pg[0] === 'governanca' ? ((p.decisoes || []).length + (p.mudancas || []).length) : null)));
        abas.appendChild(U.el('button', {
          class: 'abas__item', type: 'button',
          attrs: { role: 'tab', 'aria-selected': String(abaProjeto === pg[0]) },
          on: { click: function () { abaProjeto = pg[0]; pintar(); } }
        }, [
          U.el('span', { text: pg[1] }),
          cont ? U.el('span', { class: 'abas__cont', text: String(cont) }) : null
        ]));
      });
      const atual = paginas.find(function (pg) { return pg[0] === abaProjeto; }) || paginas[0];
      conteudo.appendChild(atual[2]());
    }
    pintar();
    corpo.appendChild(faixa);
    corpo.appendChild(abas);
    corpo.appendChild(conteudo);

    PMO.app.abrirDrawer((p.codigo ? p.codigo + ' · ' : '') + p.nome, corpo, {
      acoes: [
        vw.botaoIcone('relatorio', 'Gerar status report', function () { gerarStatusReport(p); }),
        vw.botaoIcone('editar', 'Editar dados do projeto', function () { PMO.views.editarProjeto(p.id); })
      ]
    });
  };

  /* Público escolhido da última vez no drawer — lembra dentro da sessão. */
  let varianteDrawer = null;

  /**
   * Gera o status report do projeto perguntando antes para qual público.
   * A mesma escolha vale para a impressão e para o download.
   */
  function gerarStatusReport(p) {
    const ex = PMO.exportar;
    if (!ex || !ex.statusReportHtml) {
      U.toast('Módulo de relatórios não disponível nesta compilação.', 'warn');
      return;
    }
    const dd = U.parseDate((S.state.meta || {}).dataStatus) || U.hoje();
    const sel = vw.seletorVariante(varianteDrawer, {
      onMudar: function (v) { varianteDrawer = v; }
    });
    function opcoes() {
      return { bundle: S.state, dataStatus: dd, variante: sel.valor() };
    }
    PMO.app.abrirModal('Status report — ' + (p.codigo || p.nome),
      U.el('div', { class: 'pilha pilha--3' }, [
        U.el('p', { class: 'txt-peq txt-2',
          text: 'O público define quais seções entram no documento e o que fica de fora. ' +
            'Itens restritos não aparecem nas versões externa e executiva.' }),
        sel
      ]), {
        acoes: [
          vw.botao('Cancelar', { onClick: PMO.app.fecharModal }),
          vw.botao('Baixar HTML', { icone: 'baixar', onClick: function () {
            try {
              ex.baixarStatusReport(p, opcoes());
              PMO.app.fecharModal();
            } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
          } }),
          vw.botao('Abrir para impressão', { variante: 'primario', icone: 'relatorio',
            onClick: function () {
              try {
                const html = ex.statusReportHtml(p, opcoes());
                PMO.app.fecharModal();
                if (ex.abrirParaImpressao) { ex.abrirParaImpressao(html); }
                else { U.download((p.codigo || 'projeto') + '-status-report.html', html, 'text/html;charset=utf-8'); }
              } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
            } })
        ]
      });
  }

  function bloco(titulo, filhos, icone, acoes) {
    return vw.cartao({ titulo: titulo, icone: icone, corpo: filhos, classe: 'mb-4', acoes: acoes });
  }

  /** Atalho: botão de adicionar registro do tipo, para o cabeçalho do bloco. */
  function addBtn(tipo, projetoId) {
    return PMO.editor ? [PMO.editor.botaoAdicionar(tipo, projetoId)] : null;
  }

  function paginaResumo(p, c, s, e) {
    const wrap = U.el('div');

    // motivos do farol: a rastreabilidade que o comitê exige
    const motivos = U.el('div', { class: 'pilha pilha--2' }, s.motivos.map(function (m) {
      return U.el('div', { class: 'linha' }, [
        vw.pontoRag(m.rag, M.rotuloRag(m.rag)),
        U.el('span', { class: 'txt-peq', text: m.texto })
      ]);
    }));
    wrap.appendChild(vw.cartao({
      titulo: 'Farol e justificativa', icone: 'alvo', classe: 'mb-4',
      acoes: [vw.farol(s.rag)],
      corpo: [
        s.manual ? vw.aviso('aviso', 'Farol definido manualmente',
          'O cálculo automático indicaria ' + M.rotuloRag(s.ragCalculado) + '. ' +
          (p.ragJustificativa || 'Sem justificativa registrada.')) : null,
        motivos,
        U.el('div', { class: 'divisor' }),
        U.el('div', { class: 'grade grade--kpi' }, [
          vw.kpi({ rot: 'Score de saúde', valor: U.fmtNum(s.score, 0) + '/100', valorPeq: true }),
          vw.kpi({ rot: 'Avanço físico', valor: U.fmtPct(e.pctFisico, 0), valorPeq: true,
            nota: 'planejado ' + U.fmtPct(e.pctPlanejado, 0) }),
          vw.kpi({ rot: 'SPI', valor: e.SPI === null ? 'n/a' : U.fmtRazao(e.SPI, 2), valorPeq: true }),
          vw.kpi({ rot: 'CPI', valor: e.CPI === null ? 'n/a' : U.fmtRazao(e.CPI, 2), valorPeq: true })
        ])
      ]
    }));

    const dl = U.el('dl', { class: 'pares' });
    function par(r, v) {
      dl.appendChild(U.el('dt', { text: r }));
      const dd = U.el('dd');
      if (v instanceof Node) { dd.appendChild(v); } else { dd.textContent = v === null || v === undefined || v === '' ? '—' : String(v); }
      dl.appendChild(dd);
    }
    par('Programa', M.nomePrograma(c.bundle, p.programaId));
    par('Gerente', vw.pessoa(c.bundle, p.pmId, { peq: true }));
    par('Sponsor', vw.pessoa(c.bundle, p.sponsorId, { peq: true }));
    par('Unidade', M.nomeBu(c.bundle, p.buId));
    par('Categoria', M.rotulo('categorias', p.categoria));
    par('Tipo', M.rotulo('tipos', p.tipo));
    par('Estágio', M.rotulo('estagios', p.estagio));
    const g = M.gatePorId(p.gateAtual);
    par('Gate atual', g ? g.codigo + ' — ' + g.nome : '—');
    par('Prioridade', String(p.prioridade));
    par('Direcionadores', (p.driverIds || []).map(function (d) { return M.nomeDriver(c.bundle, d); }).join(', '));
    par('Baseline', U.fmtDate(p.dates.baselineInicio) + ' → ' + U.fmtDate(p.dates.baselineFim));
    par('Previsto', U.fmtDate(p.dates.previstoInicio) + ' → ' + U.fmtDate(p.dates.previstoFim));
    par('Realizado', U.fmtDate(p.dates.realInicio) + ' → ' + U.fmtDate(p.dates.realFim));
    par('Desvio de prazo', vw.fmtDesvioDias(e.desvioDias));
    par('Tags', (p.tags || []).join(', '));
    wrap.appendChild(bloco('Identificação', [dl], 'arquivo'));

    if (p.objetivo || p.descricao) {
      wrap.appendChild(bloco('Objetivo e escopo', [
        p.objetivo ? U.el('p', { class: 'txt-peq mb-2', text: p.objetivo }) : null,
        p.descricao ? U.el('p', { class: 'txt-peq txt-2', text: p.descricao }) : null
      ], 'relatorio'));
    }

    // benefícios
    wrap.appendChild(bloco('Benefícios esperados', (p.beneficios || []).length ? [vw.tabela({
      compacta: true, legenda: 'Benefícios do projeto',
      colunas: [
        { id: 'nome', rot: 'Benefício', valor: function (b) { return b.nome; } },
        { id: 'tipo', rot: 'Tipo', valor: function (b) { return M.rotulo('tiposBeneficio', b.tipo); } },
        { id: 'esp', rot: 'Esperado', num: true, valor: function (b) { return U.fmtMoney(b.valorEsperado, { compact: true }); } },
        { id: 'real', rot: 'Realizado', num: true, valor: function (b) { return U.fmtMoney(b.valorRealizado, { compact: true }); } },
        { id: 'st', rot: 'Situação', valor: function (b) { return M.rotulo('statusBeneficio', b.status); } },
        { id: 'prazo', rot: 'Prazo', num: true, valor: function (b) { return U.fmtDate(b.prazo); } },
        PMO.editor.colunaAcoes('beneficio', p.id, { semAnexo: true })
      ],
      linhas: p.beneficios
    })] : [PMO.editor.vazio('beneficio', p.id,
      'Sem benefício declarado, o encerramento do projeto não tem contra o que ser medido.')],
      'beneficio', addBtn('beneficio', p.id)));

    // equipe alocada
    wrap.appendChild(bloco('Equipe alocada', (p.alocacoes || []).length ? [vw.tabela({
      compacta: true, legenda: 'Alocações do projeto',
      colunas: [
        { id: 'pessoa', rot: 'Pessoa', render: function (a) { return vw.pessoa(c.bundle, a.pessoaId, { peq: true }); } },
        { id: 'papel', rot: 'Papel', valor: function (a) { return a.papel; } },
        { id: 'pct', rot: 'Alocação', num: true, valor: function (a) { return U.fmtPct(a.alocacaoPct, 0); } },
        { id: 'de', rot: 'De', num: true, valor: function (a) { return U.fmtDate(a.de); } },
        { id: 'ate', rot: 'Até', num: true, valor: function (a) { return U.fmtDate(a.ate); } },
        PMO.editor.colunaAcoes('alocacao', p.id, { semAnexo: true })
      ],
      linhas: p.alocacoes
    })] : [PMO.editor.vazio('alocacao', p.id,
      'As alocações alimentam o mapa de capacidade e a detecção de sobrecarga.')],
      'pessoas', addBtn('alocacao', p.id)));

    // dependências entre projetos
    wrap.appendChild(bloco('Dependências para outros projetos', (p.dependencias || []).length ? [vw.tabela({
      compacta: true, legenda: 'Dependências do projeto',
      colunas: [
        { id: 'alvo', rot: 'Projeto sucessor', render: function (dp) {
          const alvo = M.projetoPorId(c.bundle, dp.projetoDestinoId);
          if (!alvo) { return U.el('span', { class: 'txt-3', text: 'projeto inexistente' }); }
          return U.el('button', { class: 'celula-link', type: 'button', text: alvo.codigo || alvo.nome,
            on: { click: function () { PMO.views.abrirProjeto(alvo.id); } } });
        } },
        { id: 'tipo', rot: 'Tipo', cent: true, valor: function (dp) { return dp.tipo; } },
        { id: 'lag', rot: 'Defasagem', num: true, valor: function (dp) { return dp.lagDias + ' d'; } },
        { id: 'crit', rot: 'Criticidade', render: function (dp) {
          const cd = M.tax('criticidades').find(function (x) { return x.id === dp.criticidade; });
          return vw.chip(cd ? cd.rotulo : dp.criticidade, cd ? cd.token : 'neutro');
        } },
        { id: 'desc', rot: 'Descrição', valor: function (dp) { return dp.descricao; } },
        PMO.editor.colunaAcoes('dependencia', p.id, { semAnexo: true })
      ],
      linhas: p.dependencias
    })] : [PMO.editor.vazio('dependencia', p.id,
      'Atrasos se propagam por estas ligações — é o que o roadmap mostra em cascata.')],
      'ligacao', addBtn('dependencia', p.id)));

    return wrap;
  }

  function paginaCronograma(p, c) {
    const wrap = U.el('div');
    const rg = M.resumoGate(p, c.dataStatus);

    const hostTl = U.el('div');
    wrap.appendChild(vw.cartao({
      titulo: 'Gates de governança', icone: 'gate', classe: 'mb-4',
      sub: rg.totalAprovados + ' de ' + M.gates().length + ' gates aprovados' +
        (rg.atrasoDias ? ' · próximo gate atrasado em ' + rg.atrasoDias + ' dias' : ''),
      corpo: [hostTl]
    }));
    const itensTl = (p.gates || []).map(function (gt) {
      const g = M.gatePorId(gt.gateId);
      let st = gt.decisao;
      if (st === 'pendente' && gt.previstoData && gt.previstoData < c.dataStatus) { st = 'atrasado'; }
      return { rotulo: g ? g.codigo : gt.gateId, data: gt.realData || gt.previstoData,
        status: st, subRotulo: g ? g.nome : '' };
    }).filter(function (x) { return x.data; });
    if (itensTl.length) {
      vw.grafico(null, C.timelineGates, hostTl, { itens: itensTl }, { altura: 150 });
    } else {
      hostTl.appendChild(U.el('p', { class: 'txt-peq txt-3', text: 'Nenhum gate registrado.' }));
    }

    if ((p.gates || []).length) {
      wrap.appendChild(bloco('Registro de decisões de gate', [vw.tabela({
        compacta: true, legenda: 'Decisões de gate',
        colunas: [
          { id: 'gate', rot: 'Gate', render: function (gt) {
            const g = M.gatePorId(gt.gateId);
            return U.el('span', { class: 'txt-forte', text: g ? g.codigo + ' ' + g.nome : gt.gateId });
          } },
          { id: 'prev', rot: 'Previsto', num: true, valor: function (gt) { return U.fmtDate(gt.previstoData); } },
          { id: 'real', rot: 'Realizado', num: true, valor: function (gt) { return U.fmtDate(gt.realData); } },
          { id: 'dec', rot: 'Decisão', render: function (gt) {
            const def = M.tax('decisoesGate').find(function (x) { return x.id === gt.decisao; });
            let st = gt.decisao, tom = def ? def.token : 'neutro';
            if (gt.decisao === 'pendente' && gt.previstoData && gt.previstoData < c.dataStatus) {
              st = 'atrasado'; tom = 'critico';
            }
            return vw.chip(st === 'atrasado' ? 'Atrasado' : (def ? def.rotulo : gt.decisao), tom,
              { icone: tom === 'bom' ? 'ok' : (tom === 'critico' ? 'alerta' : null) });
          } },
          { id: 'forum', rot: 'Fórum', valor: function (gt) { return M.rotulo('foruns', gt.forum); } },
          { id: 'cond', rot: 'Condições / notas', valor: function (gt) { return gt.condicoes || gt.notas; } },
          PMO.editor.colunaAcoes('gate', p.id)
        ],
        linhas: rg.registros
      })], 'gate', addBtn('gate', p.id)));
    } else {
      wrap.appendChild(bloco('Registro de decisões de gate',
        [PMO.editor.vazio('gate', p.id,
          'Registre aqui a decisão de cada portão: data, fórum, aprovador e as condições assumidas.')],
        'gate'));
    }

    const marcos = U.sortBy(p.marcos || [], function (m) { return m.previstoData || m.baselineData || ''; });
    wrap.appendChild(bloco('Marcos', marcos.length ? [vw.tabela({
      compacta: true, legenda: 'Marcos do projeto',
      colunas: [
        { id: 'nome', rot: 'Marco', render: function (m) {
          return U.el('span', {}, [
            m.critico ? vw.chip('crítico', 'critico') : null,
            U.el('span', { text: ' ' + m.nome })
          ]);
        } },
        { id: 'base', rot: 'Baseline', num: true, valor: function (m) { return U.fmtDate(m.baselineData); } },
        { id: 'prev', rot: 'Previsto', num: true, render: function (m) {
          const desliz = U.diffDays(m.baselineData, m.previstoData);
          return U.el('span', { class: 'txt-num' + (desliz > 0 ? ' txt-ruim' : ''),
            text: U.fmtDate(m.previstoData) + (desliz > 0 ? ' (+' + desliz + 'd)' : '') });
        } },
        { id: 'real', rot: 'Realizado', num: true, valor: function (m) { return U.fmtDate(m.realData); } },
        { id: 'sit', rot: 'Situação', render: function (m) {
          if (m.realData) { return vw.chip('Concluído', 'bom', { icone: 'ok' }); }
          const alvo = m.previstoData || m.baselineData;
          if (alvo && alvo < c.dataStatus) {
            return vw.chip('Atrasado ' + U.diffDays(alvo, c.dataStatus) + 'd', 'critico', { icone: 'alerta' });
          }
          return vw.chip('Pendente', 'neutro');
        } },
        PMO.editor.colunaAcoes('marco', p.id)
      ],
      linhas: marcos
    })] : [PMO.editor.vazio('marco', p.id,
      'Adicione marcos manualmente ou importe o arquivo de projeto para trazer os marcos do cronograma.')],
      'calendario', addBtn('marco', p.id)));

    return wrap;
  }

  /**
   * WBS importada do arquivo de projeto. Somente leitura por desenho: editar
   * cronograma é o que o MS Project faz bem, e duplicar isso aqui criaria duas
   * versões da verdade. O que a ferramenta garante é guardar, exibir e devolver
   * o cronograma sem perder informação.
   */
  function paginaWbs(p, c) {
    const wrap = U.el('div');
    const tarefas = p.tarefas || [];

    if (!tarefas.length) {
      wrap.appendChild(vw.vazio({
        icone: 'calendario',
        titulo: 'Nenhum cronograma importado',
        txt: 'Importe o arquivo de projeto (.xml do MS Project, .xer ou .pmxml do Primavera) para ' +
          'trazer a WBS. A ferramenta guarda as tarefas para exibir e reexportar com fidelidade — ' +
          'a edição continua no MS Project.',
        acoes: [vw.botao('Ir para importação', { variante: 'primario', icone: 'importar',
          onClick: function () { PMO.app.fecharDrawer(); PMO.app.navegar('importar'); } })]
      }));
      return wrap;
    }

    const folhas = tarefas.filter(function (t) { return !t.resumo; });
    const marcos = tarefas.filter(function (t) { return t.marco; });
    const concluidas = folhas.filter(function (t) { return t.pct >= 100; });
    const origem = p.importSource || {};

    wrap.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
      vw.kpi({ rot: 'Tarefas', valor: String(tarefas.length), valorPeq: true,
        nota: folhas.length + ' folhas · ' + (tarefas.length - folhas.length) + ' resumos' }),
      vw.kpi({ rot: 'Marcos', valor: String(marcos.length), valorPeq: true }),
      vw.kpi({ rot: 'Folhas concluídas', valor: String(concluidas.length), valorPeq: true,
        nota: U.fmtPct(U.safeDiv(concluidas.length, folhas.length) * 100, 0) + ' das folhas' }),
      vw.kpi({ rot: 'Origem', valor: String(origem.kind || '—').toUpperCase(), valorPeq: true,
        nota: origem.importadoEm ? U.fmtDate(origem.importadoEm) : 'sem registro' })
    ]));

    const busca = U.el('input', {
      class: 'campo', type: 'search', placeholder: 'Filtrar tarefas por nome…',
      style: { maxWidth: '320px' }
    });
    const hostTab = U.el('div');

    const LIMITE = 400;

    function pintar() {
      U.limpar(hostTab);
      const termo = busca.value.trim();
      const lista = termo
        ? tarefas.filter(function (t) { return U.contemTexto(t.nome, termo); })
        : tarefas;

      if (!lista.length) {
        hostTab.appendChild(U.el('p', { class: 'txt-peq txt-3', text: 'Nenhuma tarefa corresponde ao filtro.' }));
        return;
      }
      const exibidas = lista.slice(0, LIMITE);
      if (lista.length > LIMITE) {
        hostTab.appendChild(vw.aviso('info', null,
          'Exibindo as ' + LIMITE + ' primeiras de ' + lista.length + ' tarefas. Use o filtro para chegar ao trecho que interessa.'));
      }

      hostTab.appendChild(vw.tabela({
        compacta: true, faixas: true,
        legenda: 'Estrutura analítica do projeto importada do arquivo de cronograma',
        colunas: [
          { id: 'nome', rot: 'Tarefa', largura: '300px', render: function (t) {
            return U.el('span', {
              class: 'celula-nome',
              style: { paddingLeft: ((t.nivel || 1) - 1) * 14 + 'px' }
            }, [
              t.marco
                ? U.el('span', { text: '◆', attrs: { title: 'Marco' }, style: { color: 'var(--acento)' } })
                : null,
              U.el('span', {
                class: 'celula-nome__txt' + (t.resumo ? ' txt-forte' : ''),
                text: t.nome, attrs: { title: t.nome }
              }),
              t.critico ? vw.chip('crítico', 'critico') : null
            ]);
          } },
          { id: 'wbs', rot: 'WBS', valor: function (t) { return t.outline || '—'; } },
          { id: 'base', rot: 'Baseline', num: true, render: function (t) {
            if (!t.baselineInicio && !t.baselineFim) { return U.el('span', { class: 'txt-3', text: '—' }); }
            return U.el('span', { class: 'txt-num txt-mic',
              text: U.fmtDateShort(t.baselineInicio) + ' → ' + U.fmtDateShort(t.baselineFim) });
          } },
          { id: 'prev', rot: 'Previsto', num: true, render: function (t) {
            const desliz = U.diffDays(t.baselineFim, t.fim);
            return U.el('span', {
              class: 'txt-num txt-mic' + (desliz > 0 ? ' txt-ruim' : ''),
              text: U.fmtDateShort(t.inicio) + ' → ' + U.fmtDateShort(t.fim) +
                (desliz > 0 ? ' (+' + desliz + 'd)' : '')
            });
          } },
          { id: 'real', rot: 'Real', num: true, render: function (t) {
            if (!t.realInicio && !t.realFim) { return U.el('span', { class: 'txt-3', text: '—' }); }
            return U.el('span', { class: 'txt-num txt-mic',
              text: U.fmtDateShort(t.realInicio) + ' → ' + U.fmtDateShort(t.realFim) });
          } },
          { id: 'pct', rot: 'Avanço', num: true, render: function (t) {
            return t.resumo
              ? U.el('span', { class: 'txt-num txt-3', text: U.fmtPct(t.pct, 0) })
              : vw.progresso(t.pct, null);
          } },
          { id: 'cb', rot: 'Custo baseline', num: true, render: function (t) {
            return U.el('span', { class: 'txt-num' + (t.resumo ? ' txt-3' : ''),
              text: t.custoBaseline ? U.fmtMoney(t.custoBaseline, { compact: true }) : '—' });
          } },
          { id: 'cr', rot: 'Custo real', num: true, render: function (t) {
            return U.el('span', { class: 'txt-num' + (t.resumo ? ' txt-3' : ''),
              text: t.custoReal ? U.fmtMoney(t.custoReal, { compact: true }) : '—' });
          } }
        ],
        linhas: exibidas
      }));
    }

    busca.addEventListener('input', U.debounce(pintar, 180));
    pintar();

    wrap.appendChild(vw.cartao({
      titulo: 'Estrutura analítica (WBS)', icone: 'calendario',
      sub: 'Somente leitura. A edição de cronograma continua no MS Project — aqui o arquivo é ' +
        'guardado, exibido e devolvido sem perda.',
      acoes: [
        busca,
        vw.botao('Exportar MSPDI', { peq: true, icone: 'baixar', onClick: function () {
          if (!PMO.exportar || !PMO.exportar.mspdi) { U.toast('Módulo de exportação indisponível.', 'warn'); return; }
          U.download((p.codigo || 'projeto') + '.xml', PMO.exportar.mspdi(p, c.bundle),
            'application/xml;charset=utf-8');
        } })
      ],
      corpo: [hostTab]
    }));

    return wrap;
  }

  function paginaFinanceiro(p, c, e) {
    const wrap = U.el('div');

    wrap.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
      vw.kpi({ rot: 'BAC — orçamento', valor: U.fmtMoney(e.BAC, { compact: true }), valorPeq: true }),
      vw.kpi({ rot: 'AC — custo real', valor: U.fmtMoney(e.AC, { compact: true }), valorPeq: true,
        nota: U.fmtPct(U.safeDiv(e.AC, e.BAC) * 100, 0) + ' do orçamento' }),
      vw.kpi({ rot: 'EV — valor agregado', valor: U.fmtMoney(e.EV, { compact: true }), valorPeq: true }),
      vw.kpi({ rot: 'PV — valor planejado', valor: U.fmtMoney(e.PV, { compact: true }), valorPeq: true }),
      vw.kpi({ rot: 'EAC — projeção', valor: U.fmtMoney(e.EAC, { compact: true }), valorPeq: true,
        tom: e.EAC > e.BAC * 1.05 ? 'critico' : null }),
      vw.kpi({ rot: 'VAC — variação final', valor: U.fmtMoney(e.VAC, { compact: true }), valorPeq: true,
        delta: { tom: e.VAC < 0 ? 'ruim' : 'bom', texto: e.VAC < 0 ? 'estouro projetado' : 'dentro do orçamento' } })
    ]));

    const hostS = U.el('div');
    wrap.appendChild(vw.cartao({
      titulo: 'Curva S do projeto', icone: 'dinheiro', classe: 'mb-4',
      sub: 'PV, EV e AC acumulados — todos em R$, um único eixo',
      corpo: [hostS]
    }));
    const curva = M.curvaS(p, c.dataStatus);
    if (curva.length) {
      const idxDd = curva.reduce(function (a, x, i) { return x.futuro ? a : i; }, 0);
      vw.grafico(null, C.curvaS, hostS, {
        periodos: curva.map(function (x) { return U.fmtPeriodo(x.periodo); }),
        pv: curva.map(function (x) { return x.pv; }),
        ev: curva.map(function (x) { return x.ev; }),
        ac: curva.map(function (x) { return x.ac; }),
        idxDataDate: idxDd
      }, { altura: 280 });
    } else {
      hostS.appendChild(U.el('p', { class: 'txt-peq txt-3', text: 'Sem datas ou orçamento suficientes para montar a curva.' }));
    }

    const met = U.el('div');
    met.appendChild(vw.metrica('CAPEX', U.fmtMoney(p.finance.orcamentoCapex)));
    met.appendChild(vw.metrica('OPEX', U.fmtMoney(p.finance.orcamentoOpex)));
    met.appendChild(vw.metrica('Contingência', U.fmtMoney(p.finance.contingencia)));
    met.appendChild(vw.metrica('Comprometido', U.fmtMoney(e.comprometido)));
    met.appendChild(vw.metrica('SV — variação de prazo', U.fmtMoney(e.SV), { tom: e.SV < 0 ? 'ruim' : 'bom',
      dica: 'EV − PV. Negativo indica atraso em valor.' }));
    met.appendChild(vw.metrica('CV — variação de custo', U.fmtMoney(e.CV), { tom: e.CV < 0 ? 'ruim' : 'bom',
      dica: 'EV − AC. Negativo indica gasto acima do valor entregue.' }));
    met.appendChild(vw.metrica('ETC — falta gastar', U.fmtMoney(e.ETC)));
    met.appendChild(vw.metrica('TCPI', e.TCPI === null ? 'n/a' : U.fmtRazao(e.TCPI, 2),
      { dica: 'Eficiência de custo necessária no trabalho restante para fechar no BAC.' }));
    wrap.appendChild(bloco('Indicadores de EVM', [met], 'dinheiro'));

    return wrap;
  }

  function paginaRiscos(p, c) {
    const wrap = U.el('div');
    const riscos = U.sortBy(p.riscos || [], function (r) { return M.scoreRisco(r); }, 'desc');
    const issues = U.sortBy(p.issues || [], function (i) { return i.severidade; }, 'desc');

    wrap.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
      vw.kpi({ rot: 'Riscos abertos', valor: String(M.riscosAbertos(p).length), valorPeq: true }),
      vw.kpi({ rot: 'Exposição ponderada', valor: U.fmtMoney(M.exposicaoRisco(p), { compact: true }), valorPeq: true,
        dica: 'Soma de (probabilidade × impacto ÷ 25) × exposição financeira dos riscos abertos.' }),
      vw.kpi({ rot: 'Impacto de prazo', valor: U.fmtNum(M.exposicaoPrazo(p), 0) + ' d', valorPeq: true }),
      vw.kpi({ rot: 'Issues abertas', valor: String(M.issuesAbertas(p).length), valorPeq: true })
    ]));

    wrap.appendChild(bloco('Registro de riscos', riscos.length ? [vw.tabela({
      compacta: true, legenda: 'Riscos do projeto',
      colunas: [
        { id: 'cod', rot: 'Cód.', largura: '86px', valor: function (r) { return r.codigo; } },
        { id: 'tit', rot: 'Risco', render: function (r) {
          return U.el('span', { class: 'linha', style: { gap: '4px' } }, [
            U.el('span', { attrs: { title: r.mitigacao ? 'Mitigação: ' + r.mitigacao : '' }, text: r.titulo }),
            r.restrito ? vw.chip('restrito', 'neutro',
              { icone: 'olho', titulo: 'Não compartilhável: fica de fora dos relatórios externo e executivo.' }) : null
          ]);
        } },
        { id: 'cat', rot: 'Categoria', valor: function (r) { return M.rotulo('categoriasRisco', r.categoria); } },
        { id: 'pi', rot: 'P×I', cent: true, render: function (r) {
          const sc = M.scoreRisco(r);
          const n = M.nivelRisco(sc);
          return vw.chip(r.probabilidade + '×' + r.impacto + ' = ' + sc, n.token, { titulo: n.rotulo });
        }, valor: function (r) { return M.scoreRisco(r); } },
        { id: 'exp', rot: 'Exposição', num: true, valor: function (r) { return U.fmtMoney(r.exposicaoCusto, { compact: true }); } },
        { id: 'resp', rot: 'Resposta', valor: function (r) { return M.rotulo('respostasRisco', r.resposta); } },
        { id: 'dono', rot: 'Dono', render: function (r) { return vw.pessoa(c.bundle, r.donoId, { peq: true, curto: true }); } },
        { id: 'prazo', rot: 'Prazo', num: true, valor: function (r) { return U.fmtDate(r.prazo); } },
        { id: 'st', rot: 'Situação', render: function (r) {
          const enc = M.riscoEncerrado(r);
          return vw.chip(M.rotulo('statusRisco', r.status), enc ? 'neutro' : (M.scoreRisco(r) >= 15 ? 'critico' : 'aviso'));
        } },
        PMO.editor.colunaAcoes('risco', p.id)
      ],
      linhas: riscos
    })] : [PMO.editor.vazio('risco', p.id,
      'O registro de riscos é o que sustenta a conversa de exceção no comitê.')],
      'risco', addBtn('risco', p.id)));

    wrap.appendChild(bloco('Issues', issues.length ? [vw.tabela({
      compacta: true, legenda: 'Issues do projeto',
      colunas: [
        { id: 'cod', rot: 'Cód.', largura: '86px', valor: function (i) { return i.codigo; } },
        { id: 'tit', rot: 'Issue', valor: function (i) { return i.titulo; } },
        { id: 'sev', rot: 'Severidade', cent: true, render: function (i) {
          const def = M.tax('severidades').find(function (x) { return x.id === i.severidade; });
          return vw.chip(def ? def.rotulo : String(i.severidade), def ? def.token : 'neutro');
        }, valor: function (i) { return i.severidade; } },
        { id: 'dono', rot: 'Dono', render: function (i) { return vw.pessoa(c.bundle, i.donoId, { peq: true, curto: true }); } },
        { id: 'idade', rot: 'Idade', num: true, render: function (i) {
          const a = M.aging(i.abertaEm, i.resolvidaEm || c.dataStatus);
          return U.el('span', { class: 'txt-num' + (!i.resolvidaEm && a > 30 ? ' txt-ruim' : ''), text: a + ' d' });
        }, valor: function (i) { return M.aging(i.abertaEm, i.resolvidaEm || c.dataStatus); } },
        { id: 'prazo', rot: 'Prazo', num: true, valor: function (i) { return U.fmtDate(i.prazo); } },
        { id: 'st', rot: 'Situação', render: function (i) {
          return vw.chip(M.rotulo('statusIssue', i.status), M.issueEncerrada(i) ? 'neutro' : (i.escalada ? 'critico' : 'aviso'));
        } },
        PMO.editor.colunaAcoes('issue', p.id)
      ],
      linhas: issues
    })] : [PMO.editor.vazio('issue', p.id)], 'alerta', addBtn('issue', p.id)));

    return wrap;
  }

  function paginaGovernanca(p, c) {
    const wrap = U.el('div');

    wrap.appendChild(bloco('Decisões solicitadas', (p.decisoes || []).length ? [vw.tabela({
      compacta: true, legenda: 'Log de decisões',
      colunas: [
        { id: 'cod', rot: 'Cód.', largura: '86px', valor: function (d) { return d.codigo; } },
        { id: 'tit', rot: 'Decisão', valor: function (d) { return d.titulo; } },
        { id: 'forum', rot: 'Fórum', valor: function (d) { return M.rotulo('foruns', d.forum); } },
        { id: 'sol', rot: 'Solicitada', num: true, valor: function (d) { return U.fmtDate(d.solicitadaEm); } },
        { id: 'lim', rot: 'Prazo', num: true, render: function (d) {
          const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
          const vencida = def && def.pendente && d.prazoLimite && d.prazoLimite < c.dataStatus;
          return U.el('span', { class: 'txt-num' + (vencida ? ' txt-ruim txt-forte' : ''), text: U.fmtDate(d.prazoLimite) });
        } },
        { id: 'st', rot: 'Situação', render: function (d) {
          const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
          const vencida = def && def.pendente && d.prazoLimite && d.prazoLimite < c.dataStatus;
          return vw.chip(M.rotulo('statusDecisao', d.status) + (vencida ? ' (vencida)' : ''),
            vencida ? 'critico' : (def && def.pendente ? 'aviso' : 'bom'));
        } },
        PMO.editor.colunaAcoes('decisao', p.id)
      ],
      linhas: U.sortBy(p.decisoes, function (d) { return d.solicitadaEm; }, 'desc')
    })] : [PMO.editor.vazio('decisao', p.id,
      'Decisão pedida ao comitê e não registrada aqui é decisão que ninguém cobra.')],
      'balanca', addBtn('decisao', p.id)));

    wrap.appendChild(bloco('Solicitações de mudança', (p.mudancas || []).length ? [vw.tabela({
      compacta: true, legenda: 'Controle de mudanças',
      colunas: [
        { id: 'cod', rot: 'Cód.', largura: '92px', valor: function (m) { return m.codigo; } },
        { id: 'tit', rot: 'Mudança', render: function (m) {
          return U.el('span', { attrs: { title: m.justificativa }, text: m.titulo });
        } },
        { id: 'tipo', rot: 'Tipo', valor: function (m) { return M.rotulo('tiposMudanca', m.tipo); } },
        { id: 'custo', rot: 'Impacto custo', num: true, render: function (m) {
          return U.el('span', { class: 'txt-num ' + (m.impactoCusto > 0 ? 'txt-ruim' : 'txt-bom'),
            text: U.fmtDelta(m.impactoCusto, function (v) { return U.fmtMoney(v, { compact: true }); }) });
        } },
        { id: 'dias', rot: 'Impacto prazo', num: true, render: function (m) {
          return U.el('span', { class: 'txt-num' + (m.impactoDias > 0 ? ' txt-ruim' : ''),
            text: m.impactoDias ? '+' + m.impactoDias + ' d' : '—' });
        } },
        { id: 'base', rot: 'Baseline', cent: true, render: function (m) {
          return m.afetaBaseline ? vw.chip('replanejar', 'aviso') : vw.chip('não afeta', 'neutro');
        } },
        { id: 'st', rot: 'Situação', render: function (m) {
          const def = M.tax('statusMudanca').find(function (x) { return x.id === m.status; });
          return vw.chip(M.rotulo('statusMudanca', m.status),
            def && def.pendente ? 'aviso' : (m.status === 'aprovada' ? 'bom' : 'neutro'));
        } },
        PMO.editor.colunaAcoes('mudanca', p.id)
      ],
      linhas: U.sortBy(p.mudancas, function (m) { return m.solicitadaEm; }, 'desc')
    })] : [PMO.editor.vazio('mudanca', p.id,
      'Anexe o contrato ou a proposta diretamente na mudança que o originou.')],
      'ligacao', addBtn('mudanca', p.id)));

    return wrap;
  }

  function paginaReportes(p, c) {
    const wrap = U.el('div');
    const srs = U.sortBy(p.statusReports || [], function (s) { return s.reportadoEm; }, 'desc');

    wrap.appendChild(U.el('div', { class: 'linha linha--fim mb-3' }, [
      PMO.editor.botaoAdicionar('statusReport', p.id, { rotulo: 'Novo status report', variante: 'primario' })
    ]));

    if (!srs.length) {
      wrap.appendChild(vw.vazio({ icone: 'relatorio', titulo: 'Nenhum status report',
        txt: 'Registre o primeiro reporte para acompanhar a evolução do farol ao longo do tempo. ' +
          'A narrativa entra nos relatórios gerados; sem ela, o documento sai marcado como incompleto.' }));
      return wrap;
    }

    // tendência do farol: histórico é o que revela deterioração
    const hostTend = U.el('div');
    wrap.appendChild(vw.cartao({
      titulo: 'Tendência dos índices', icone: 'alvo', classe: 'mb-4',
      sub: 'SPI e CPI reportados a cada período (ambos são razões — mesmo eixo)',
      corpo: [hostTend]
    }));
    const cron = srs.slice().reverse();
    vw.grafico(null, C.linha, hostTend, {
      rotulos: cron.map(function (s) { return U.fmtDate(s.reportadoEm); }),
      series: [
        { nome: 'SPI', valores: cron.map(function (s) { return s.spiSnapshot; }), cor: 'var(--serie-1)' },
        { nome: 'CPI', valores: cron.map(function (s) { return s.cpiSnapshot; }), cor: 'var(--serie-2)' }
      ]
    }, {
      altura: 220, baseZero: false,
      formatar: function (v) { return U.fmtRazao(v, 2); },
      referencias: [{ valor: 1, rotulo: 'no plano (1,00)', cor: 'var(--tinta-2)' }]
    });

    srs.forEach(function (sr) {
      const sub = [
        ['Escopo', sr.ragEscopo], ['Prazo', sr.ragPrazo], ['Custo', sr.ragCusto],
        ['Qualidade', sr.ragQualidade], ['Risco', sr.ragRisco]
      ];
      wrap.appendChild(vw.cartao({
        titulo: 'Reporte de ' + U.fmtPeriodo(sr.periodo),
        sub: 'Registrado em ' + U.fmtDate(sr.reportadoEm) + ' por ' + M.nomePessoa(c.bundle, sr.autorId),
        acoes: [vw.farol(sr.ragGeral), PMO.editor.acoesLinha('statusReport', p.id, sr)],
        classe: 'mb-4',
        corpo: [
          U.el('div', { class: 'linha mb-3' }, sub.map(function (x) {
            return U.el('span', { class: 'linha', style: { gap: '4px' } }, [
              U.el('span', { class: 'txt-mic txt-3', text: x[0] }),
              vw.farol(x[1], { ponto: false })
            ]);
          })),
          sr.destaques ? U.el('div', { class: 'mb-2' }, [
            U.el('div', { class: 'txt-mic txt-3', text: 'Destaques' }),
            U.el('div', { class: 'txt-peq', text: sr.destaques })
          ]) : null,
          sr.pontosAtencao ? U.el('div', { class: 'mb-2' }, [
            U.el('div', { class: 'txt-mic txt-3', text: 'Pontos de atenção' }),
            U.el('div', { class: 'txt-peq', text: sr.pontosAtencao })
          ]) : null,
          sr.proximosPassos ? U.el('div', { class: 'mb-2' }, [
            U.el('div', { class: 'txt-mic txt-3', text: 'Próximos passos' }),
            U.el('div', { class: 'txt-peq', text: sr.proximosPassos })
          ]) : null,
          sr.pedidosComite ? vw.aviso('aviso', 'Pedido ao comitê', sr.pedidosComite) : null
        ]
      }));
    });
    return wrap;
  }

  function paginaAnexos(p, c) {
    const wrap = U.el('div');
    const anexos = S.anexosDoProjeto(p.id);

    const zona = U.el('div', { class: 'dropzona mb-4', attrs: { role: 'button', tabindex: '0' } }, [
      vw.icone('anexo', { tam: 26 }),
      U.el('div', { class: 'dropzona__titulo', text: 'Anexar arquivo a este projeto' }),
      U.el('div', { class: 'dropzona__txt',
        text: 'Arraste aqui ou clique para escolher. Arquivos de projeto (.mpp, .xml, .xer), business case, atas, contratos e evidências de gate.' })
    ]);
    const input = U.el('input', { type: 'file', multiple: true, style: { display: 'none' },
      on: { change: function (e) { enviarAnexos(e.target.files, p.id); } } });
    zona.appendChild(input);
    zona.addEventListener('click', function () { input.click(); });
    zona.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.dataset.ativo = '1'; });
    zona.addEventListener('dragleave', function () { delete zona.dataset.ativo; });
    zona.addEventListener('drop', function (e) {
      e.preventDefault(); delete zona.dataset.ativo;
      enviarAnexos(e.dataTransfer.files, p.id);
    });
    wrap.appendChild(zona);

    if (!anexos.length) {
      wrap.appendChild(U.el('p', { class: 'txt-peq txt-3', text: 'Nenhum anexo neste projeto.' }));
    } else {
      wrap.appendChild(U.el('div', { class: 'pilha pilha--2' }, anexos.map(function (a) {
        return U.el('div', { class: 'arquivo-item' }, [
          U.el('span', { class: 'arquivo-item__ic' }, [vw.icone('arquivo', { tam: 18 })]),
          U.el('div', { class: 'arquivo-item__corpo' }, [
            U.el('div', { class: 'arquivo-item__nome', text: a.nomeArquivo }),
            U.el('div', { class: 'arquivo-item__meta' }, [
              U.el('span', { text: M.rotulo('categoriasAnexo', a.categoria) }),
              U.el('span', { text: U.tamanhoHumano(a.tamanho) }),
              U.el('span', { text: U.fmtDataHora(a.enviadoEm) }),
              U.el('span', { text: a.emDisco ? 'em disco + navegador' : 'apenas no navegador',
                attrs: { title: a.emDisco ? 'Replicado em data/attachments/' : 'Ainda não replicado em disco' } }),
              a.entidadeRef ? vw.chip(
                (M.CAMPOS_EDICAO[a.entidadeRef.tipo] || {}).rotulo + ': ' +
                  U.truncar(a.entidadeRef.rotulo || '—', 34), 'acento',
                { icone: 'ligacao', titulo: 'Vinculado a um registro específico do projeto' }) : null
            ])
          ]),
          U.el('div', { class: 'arquivo-item__acoes' }, [
            vw.botaoIcone('baixar', 'Baixar anexo', function () {
              S.anexoBaixar(a.id).catch(function (err) { U.toast(err.message || String(err), 'erro'); });
            }),
            vw.botaoIcone('lixeira', 'Remover anexo', function () {
              PMO.app.confirmar('Remover anexo', 'Remover "' + a.nomeArquivo + '" do projeto? O arquivo sai do navegador e do disco.')
                .then(function (ok) {
                  if (!ok) { return; }
                  S.anexoRemover(a.id).then(function () {
                    U.toast('Anexo removido.', 'ok');
                    PMO.views.abrirProjeto(p.id, 'anexos');
                  });
                });
            })
          ])
        ]);
      })));
    }
    return wrap;
  }

  function enviarAnexos(files, projetoId) {
    const lista = Array.prototype.slice.call(files || []);
    if (!lista.length) { return; }
    let feitos = 0;
    const total = lista.length;
    (function proximo() {
      if (!lista.length) {
        U.toast(feitos + ' de ' + total + ' arquivo(s) anexado(s).', feitos === total ? 'ok' : 'warn');
        PMO.views.abrirProjeto(projetoId, 'anexos');
        return;
      }
      const f = lista.shift();
      const ext = U.extensao(f.name);
      const cat = ['mpp', 'xml', 'xer', 'pmxml', 'mpx'].indexOf(ext) >= 0 ? 'project-file'
        : (ext === 'pdf' ? 'ata' : (['xlsx', 'xls', 'csv'].indexOf(ext) >= 0 ? 'outro' : 'business-case'));
      S.anexoAdicionar(f, { projetoId: projetoId, categoria: cat })
        .then(function () { feitos += 1; })
        .catch(function (err) { U.toast('Falha em "' + f.name + '": ' + (err.message || err), 'erro'); })
        .then(proximo);
    })();
  }
  PMO.views.enviarAnexos = enviarAnexos;

  function paginaDados(p, c) {
    const wrap = U.el('div');

    const links = [
      ['sharepointSite', 'Site do SharePoint'], ['bibliotecaDocs', 'Biblioteca de documentos'],
      ['planoPlanner', 'Plano no Planner'], ['arquivoProjeto', 'Arquivo de projeto'],
      ['canalTeams', 'Canal do Teams'], ['wiki', 'Wiki / página de referência']
    ];
    const dl = U.el('dl', { class: 'pares' });
    links.forEach(function (l) {
      const v = (p.links || {})[l[0]];
      dl.appendChild(U.el('dt', { text: l[1] }));
      const dd = U.el('dd');
      if (v && /^https?:\/\//i.test(v)) {
        dd.appendChild(U.el('a', { href: v, text: U.truncar(v, 54), attrs: { target: '_blank', rel: 'noopener noreferrer' } }));
        dd.appendChild(U.el('span', { text: ' ' }));
        dd.appendChild(vw.icone('externo', { tam: 11 }));
      } else {
        dd.textContent = v || '—';
      }
      dl.appendChild(dd);
    });
    wrap.appendChild(vw.cartao({
      titulo: 'Links do ecossistema', icone: 'externo', classe: 'mb-4',
      sub: 'Endereços colados manualmente. Esta compilação não faz chamadas autenticadas a serviços Microsoft.',
      corpo: [dl]
    }));

    if (p.importSource) {
      const isrc = p.importSource;
      wrap.appendChild(bloco('Origem da importação', [
        vw.metrica('Formato', String(isrc.kind || '—').toUpperCase()),
        vw.metrica('Arquivo', isrc.fileName || '—'),
        vw.metrica('Importado em', U.fmtDataHora(isrc.importadoEm)),
        vw.metrica('Identificador externo', isrc.externalId || '—')
      ], 'importar'));
    }

    wrap.appendChild(bloco('Auditoria deste projeto', [(function () {
      const eventos = (c.bundle.auditLog || []).filter(function (a) { return a.entidadeId === p.id; }).slice(-40).reverse();
      if (!eventos.length) { return U.el('p', { class: 'txt-peq txt-3', text: 'Nenhuma alteração registrada para este projeto.' }); }
      return vw.tabela({
        compacta: true, legenda: 'Trilha de auditoria do projeto',
        colunas: [
          { id: 'em', rot: 'Quando', num: true, valor: function (a) { return U.fmtDataHora(a.em); } },
          { id: 'ator', rot: 'Quem', valor: function (a) { return a.ator; } },
          { id: 'acao', rot: 'Ação', valor: function (a) { return a.acao; } },
          { id: 'res', rot: 'Detalhe', valor: function (a) { return a.resumo; } }
        ],
        linhas: eventos
      });
    })()], 'auditoria'));

    return wrap;
  }

  /* ================================================= criar / editar projeto */

  function formProjeto(p, aoSalvar) {
    const b = S.state;
    const dados = U.clonar(p);
    const form = U.el('div', { class: 'form-grade' });

    function campo(rot, chave, cfg) {
      const c = cfg || {};
      const val = U.campo(dados, chave);
      let entrada;
      if (c.opcoes) {
        entrada = U.el('select', { class: 'campo' }, c.opcoes.map(function (o) {
          return U.el('option', { value: String(o.id), text: o.rotulo, selected: String(o.id) === String(val) });
        }));
        entrada.addEventListener('change', function () { U.setCampo(dados, chave, entrada.value); });
      } else if (c.tipo === 'textarea') {
        entrada = U.el('textarea', { class: 'campo', value: val || '' });
        entrada.addEventListener('input', function () { U.setCampo(dados, chave, entrada.value); });
      } else {
        entrada = U.el('input', {
          class: 'campo' + (c.tipo === 'number' ? ' campo--num' : ''),
          type: c.tipo || 'text',
          value: c.tipo === 'date' ? (U.parseDate(val) || '') : (val === null || val === undefined ? '' : String(val))
        });
        entrada.addEventListener('input', function () {
          U.setCampo(dados, chave, c.tipo === 'number' ? U.num(entrada.value, 0) : entrada.value);
        });
      }
      const g = U.el('div', { class: 'campo-grupo' + (c.largo ? ' form-largo' : '') }, [
        U.el('label', { class: 'campo-grupo__rot' + (c.obrigatorio ? ' campo-obrigatorio' : ''), text: rot }),
        entrada,
        c.ajuda ? U.el('span', { class: 'campo-grupo__ajuda', text: c.ajuda }) : null
      ]);
      form.appendChild(g);
      return entrada;
    }

    campo('Código', 'codigo', { obrigatorio: true, ajuda: 'Identificador de negócio, ex.: PRJ-0101' });
    campo('Nome do projeto', 'nome', { obrigatorio: true, largo: true });
    campo('Programa', 'programaId', { opcoes: [{ id: '', rotulo: '— sem programa —' }]
      .concat((b.programas || []).map(function (x) { return { id: x.id, rotulo: x.nome }; })) });
    campo('Gerente do projeto', 'pmId', { opcoes: [{ id: '', rotulo: '—' }]
      .concat((b.pessoas || []).map(function (x) { return { id: x.id, rotulo: x.nome }; })) });
    campo('Sponsor', 'sponsorId', { opcoes: [{ id: '', rotulo: '—' }]
      .concat((b.pessoas || []).map(function (x) { return { id: x.id, rotulo: x.nome }; })) });
    campo('Unidade de negócio', 'buId', { opcoes: [{ id: '', rotulo: '—' }]
      .concat(((b.settings || {}).unidadesNegocio || []).map(function (x) { return { id: x.id, rotulo: x.nome }; })) });
    campo('Categoria', 'categoria', { opcoes: M.tax('categorias') });
    campo('Tipo', 'tipo', { opcoes: M.tax('tipos') });
    campo('Estágio', 'estagio', { opcoes: M.tax('estagios') });
    campo('Gate atual', 'gateAtual', { opcoes: M.gates().map(function (g) { return { id: g.id, rotulo: g.codigo + ' — ' + g.nome }; }) });
    campo('Prioridade (1 = maior)', 'prioridade', { tipo: 'number' });
    campo('Farol manual', 'ragManual', { opcoes: [{ id: '', rotulo: '— calcular automaticamente —' }]
      .concat(M.tax('rag').map(function (r) { return { id: r.id, rotulo: r.rotulo }; })),
      ajuda: 'Sobrepõe o cálculo. Exige justificativa.' });
    campo('Justificativa do farol manual', 'ragJustificativa', { tipo: 'textarea', largo: true });
    campo('Início da baseline', 'dates.baselineInicio', { tipo: 'date' });
    campo('Término da baseline', 'dates.baselineFim', { tipo: 'date' });
    campo('Início previsto', 'dates.previstoInicio', { tipo: 'date' });
    campo('Término previsto', 'dates.previstoFim', { tipo: 'date' });
    campo('Início real', 'dates.realInicio', { tipo: 'date' });
    campo('Término real', 'dates.realFim', { tipo: 'date' });
    campo('Avanço físico (%)', 'progress.pctFisico', { tipo: 'number' });
    campo('Orçamento CAPEX', 'finance.orcamentoCapex', { tipo: 'number' });
    campo('Orçamento OPEX', 'finance.orcamentoOpex', { tipo: 'number' });
    campo('Custo de baseline (BAC)', 'finance.custoBaseline', { tipo: 'number',
      ajuda: 'Se ficar em zero, o BAC é a soma de CAPEX + OPEX.' });
    campo('Custo real (AC)', 'finance.custoReal', { tipo: 'number' });
    campo('Comprometido', 'finance.comprometido', { tipo: 'number' });
    campo('Contingência', 'finance.contingencia', { tipo: 'number' });
    campo('EAC manual', 'finance.eacManual', { tipo: 'number', ajuda: 'Zero ou vazio = calcular por BAC ÷ CPI.' });
    campo('Objetivo', 'objetivo', { tipo: 'textarea', largo: true });
    campo('Descrição / escopo', 'descricao', { tipo: 'textarea', largo: true });
    campo('Site do SharePoint', 'links.sharepointSite', { largo: true });
    campo('Biblioteca de documentos', 'links.bibliotecaDocs', { largo: true });
    campo('Plano no Planner', 'links.planoPlanner', { largo: true });
    campo('Arquivo de projeto', 'links.arquivoProjeto', { largo: true });

    return { form: form, obter: function () { return dados; } };
  }

  /**
   * Aplica um cronograma-modelo ao projeto novo, deslocando todas as datas para
   * a data de início escolhida. O modelo traz ESTRUTURA (tarefas, marcos e
   * gates) — nunca orçamento nem avanço, que são do projeto real.
   */
  async function aplicarTemplate(proj, nomeTemplate) {
    const file = await S.obterTemplate(nomeTemplate);
    const L = await PMO.importar.lerArquivo(file);
    const cand = L.projetosCandidatos[0];
    if (!cand || !(cand.tarefas || []).length) {
      throw new Error('o template não trouxe tarefas legíveis');
    }
    const origem = cand.dates.previstoInicio || cand.dates.baselineInicio;
    const destino = proj.dates.previstoInicio || proj.dates.baselineInicio || U.hoje();
    const delta = U.diffDays(origem, destino) || 0;
    function mv(d) { return d ? U.addDays(d, delta) : null; }

    proj.tarefas = (cand.tarefas || []).map(function (t) {
      const c = U.clonar(t);
      c.id = U.uid('tsk');
      ['inicio', 'fim', 'realInicio', 'realFim', 'baselineInicio', 'baselineFim']
        .forEach(function (k) { c[k] = mv(c[k]); });
      c.pct = 0; c.custo = 0; c.custoBaseline = 0; c.custoReal = 0;
      return c;
    });
    proj.marcos = (cand.marcos || []).map(function (m) {
      const c = U.clonar(m);
      c.id = U.uid('mrc');
      c.baselineData = mv(c.baselineData);
      c.previstoData = mv(c.previstoData);
      c.realData = null;                       // projeto novo: nada concluído
      return c;
    });
    proj.gates = (cand.gates || []).map(function (g) {
      const c = U.clonar(g);
      c.id = U.uid('gt');
      c.previstoData = mv(c.previstoData);
      c.realData = null;
      c.decisao = 'pendente';
      return c;
    });

    const fins = proj.tarefas.map(function (t) { return t.fim; }).filter(Boolean).sort();
    if (fins.length) {
      proj.dates.previstoFim = fins[fins.length - 1];
      if (!proj.dates.baselineFim) { proj.dates.baselineFim = proj.dates.previstoFim; }
    }
    return proj;
  }

  PMO.views.novoProjeto = function () {
    const novo = M.projetoVazio({
      codigo: M.proximoCodigo(S.state, 'PRJ-'),
      dates: {
        baselineInicio: U.hoje(), baselineFim: U.addDays(U.hoje(), 180),
        previstoInicio: U.hoje(), previstoFim: U.addDays(U.hoje(), 180)
      }
    });
    const f = formProjeto(novo);

    const selTemplate = U.el('select', { class: 'campo' }, [
      U.el('option', { value: '', text: '— sem cronograma-modelo —' })
    ]);
    const notaTemplate = U.el('span', { class: 'campo-grupo__ajuda',
      text: 'Consultando modelos disponíveis…' });

    S.listarTemplates().then(function (itens) {
      if (!itens.length) {
        notaTemplate.textContent = 'Nenhum modelo disponível. Rode tools\\gerar-templates.ps1 ' +
          'para criar a pasta templates/.';
        return;
      }
      itens.forEach(function (it) {
        const rot = it.nome.replace(/^modelo-/, '').replace(/\.xml$/, '');
        selTemplate.appendChild(U.el('option', { value: it.nome,
          text: rot.charAt(0).toUpperCase() + rot.slice(1) }));
      });
      notaTemplate.textContent = 'Traz a estrutura de fases, marcos e gates já posicionada a ' +
        'partir da data de início. Orçamento e avanço continuam seus. Os modelos são MSPDI (.xml), ' +
        'que o MS Project abre e salva como .mpp.';
    });

    const corpo = U.el('div', {}, [
      U.el('div', { class: 'campo-grupo mb-4' }, [
        U.el('label', { class: 'campo-grupo__rot', text: 'Cronograma-modelo (opcional)' }),
        selTemplate, notaTemplate
      ]),
      U.el('div', { class: 'divisor' }),
      f.form
    ]);

    PMO.app.abrirModal('Novo projeto', corpo, {
      largo: true,
      acoes: [
        vw.botao('Cancelar', { onClick: PMO.app.fecharModal }),
        vw.botao('Criar projeto', { variante: 'primario', onClick: function () {
          const d = f.obter();
          if (!d.nome || !d.codigo) { U.toast('Código e nome são obrigatórios.', 'erro'); return; }
          if (M.projetoPorCodigo(S.state, d.codigo)) {
            U.toast('Já existe um projeto com o código ' + d.codigo + '.', 'erro');
            return;
          }
          const projeto = M.normalizarProjeto(d);
          const tmpl = selTemplate.value;

          const preparar = tmpl
            ? aplicarTemplate(projeto, tmpl).catch(function (e) {
              U.toast('Não consegui aplicar o modelo: ' + (e.message || e) +
                '. O projeto será criado sem cronograma.', 'warn');
              return projeto;
            })
            : Promise.resolve(projeto);

          preparar.then(function (pronto) {
            return S.mutate('Criar projeto', function (bb) {
              bb.projetos.push(M.normalizarProjeto(pronto));
            }, { entidade: 'projeto', entidadeId: pronto.id,
              resumo: pronto.codigo + ' ' + pronto.nome +
                (tmpl ? ' (modelo: ' + tmpl + ')' : '') }).then(function () {
              PMO.app.fecharModal();
              U.toast('Projeto ' + pronto.codigo + ' criado' +
                (tmpl ? ' com ' + (pronto.tarefas || []).length + ' tarefas do modelo.' : '.'), 'ok');
              PMO.views.abrirProjeto(pronto.id, tmpl ? 'wbs' : 'resumo');
            });
          });
        } })
      ]
    });
  };

  PMO.views.editarProjeto = function (id) {
    const p = M.projetoPorId(S.state, id);
    if (!p) { return; }
    const f = formProjeto(p);
    PMO.app.abrirModal('Editar ' + (p.codigo || p.nome), f.form, {
      largo: true,
      acoes: [
        vw.botao('Excluir projeto', { variante: 'perigo', onClick: function () {
          PMO.app.confirmar('Excluir projeto',
            'Excluir "' + (p.codigo || p.nome) + '" do portfólio? Os anexos permanecem no cofre. Esta ação pode ser desfeita com Ctrl+Z.')
            .then(function (ok) {
              if (!ok) { return; }
              S.mutate('Excluir projeto', function (bb) {
                bb.projetos = bb.projetos.filter(function (x) { return x.id !== id; });
                bb.projetos.forEach(function (x) {
                  x.dependencias = (x.dependencias || []).filter(function (dp) { return dp.projetoDestinoId !== id; });
                });
              }, { entidade: 'projeto', entidadeId: id, resumo: (p.codigo || p.nome) + ' excluído' }).then(function () {
                PMO.app.fecharModal();
                PMO.app.fecharDrawer();
                U.toast('Projeto excluído.', 'ok', { acao: 'Desfazer', onAcao: function () { S.desfazer(); } });
              });
            });
        } }),
        vw.botao('Cancelar', { onClick: PMO.app.fecharModal }),
        vw.botao('Salvar', { variante: 'primario', onClick: function () {
          const d = f.obter();
          if (!d.nome || !d.codigo) { U.toast('Código e nome são obrigatórios.', 'erro'); return; }
          if (d.ragManual && !d.ragJustificativa) {
            U.toast('Farol manual exige justificativa — é o que sustenta a decisão no comitê.', 'erro');
            return;
          }
          S.mutate('Atualizar projeto', function (bb) {
            const alvo = bb.projetos.find(function (x) { return x.id === id; });
            if (!alvo) { throw new Error('projeto não encontrado'); }
            const norm = M.normalizarProjeto(d);
            norm.id = id;
            norm.atualizadoEm = U.agoraIso();
            Object.keys(norm).forEach(function (kk) { alvo[kk] = norm[kk]; });
          }, { entidade: 'projeto', entidadeId: id, resumo: (d.codigo || d.nome) + ' atualizado' }).then(function () {
            PMO.app.fecharModal();
            U.toast('Projeto salvo.', 'ok');
            PMO.views.abrirProjeto(id, abaProjeto);
          });
        } })
      ]
    });
  };
})(window.PMO = window.PMO || {});
