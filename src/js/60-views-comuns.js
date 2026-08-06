/* =============================================================================
   60-views-comuns.js — helpers compartilhados por todas as views
   Depende de: 00-util.js, 10-model.js, 20-store.js, 50-charts.js
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const S = PMO.store;
  const C = PMO.chart;
  const vw = {};

  PMO.views = PMO.views || {};

  /* ================================================================ icones */

  vw.IC = {
    painel: 'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z',
    tabela: 'M3 5h18v14H3zM3 10h18M9 10v9',
    kanban: 'M4 4h4v16H4zM10 4h4v11h-4zM16 4h4v7h-4z',
    calendario: 'M3 6h18v15H3zM3 10h18M8 3v4M16 3v4',
    gate: 'M6 21V4h12v17M6 9h12M6 15h12',
    risco: 'M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z|M12 9v4|M12 17h.01',
    dinheiro: 'M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3',
    pessoas: 'circle:9,8,3.2|M2.5 20a6.5 6.5 0 0 1 13 0|M17 11a3 3 0 1 0 0-6|M18 20a6 6 0 0 0-2-4.5',
    beneficio: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    alvo: 'circle:12,12,9|circle:12,12,5|circle:12,12,1.4',
    relatorio: 'M6 2h9l4 4v16H6zM15 2v5h4M9 12h7M9 16h7',
    anexo: 'M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7',
    importar: 'M12 3v11m0 0 4-4m-4 4-4-4M4 17v3h16v-3',
    config: 'circle:12,12,3|M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.4A1.7 1.7 0 0 0 3 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3V3a2 2 0 1 1 4 0v.4A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9',
    auditoria: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4',
    alerta: 'circle:12,12,9|M12 8v4|M12 16h.01',
    ok: 'M20 6 9 17l-5-5',
    x: 'M18 6 6 18|M6 6l12 12',
    mais: 'M12 5v14M5 12h14',
    lupa: 'circle:11,11,7|M20 20l-4.3-4.3',
    baixar: 'M12 3v12m0 0 4-4m-4 4-4-4M4 19h16',
    filtro: 'M3 5h18l-7 8v6l-4 2v-8z',
    seta: 'M9 6l6 6-6 6',
    setaBaixo: 'M6 9l6 6 6-6',
    desfazer: 'M9 14 4 9l5-5|M4 9h11a5 5 0 0 1 0 10h-4',
    refazer: 'M15 14l5-5-5-5|M20 9H9a5 5 0 0 0 0 10h4',
    lua: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
    ajuda: 'circle:12,12,9|M9.2 9.5a2.8 2.8 0 0 1 5.5.8c0 1.9-2.7 2.2-2.7 4M12 17.5h.01',
    menu: 'M4 6h16M4 12h16M4 18h16',
    editar: 'M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    lixeira: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
    externo: 'M14 4h6v6|M20 4l-9 9|M18 14v5H5V6h5',
    arquivo: 'M6 2h9l4 4v16H6zM15 2v5h4',
    olho: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z|circle:12,12,3',
    balanca: 'M12 3v18M7 7l-4 8h8zM17 7l-4 8h8zM6 7h12',
    ligacao: 'M9 15l6-6|M13 6l1.5-1.5a4 4 0 0 1 5.7 5.7L18 12|M11 18l-1.5 1.5a4 4 0 0 1-5.7-5.7L6 12',
    relogio: 'circle:12,12,9|M12 7v5l3.5 2'
  };

  vw.icone = function (nome, opts) {
    return U.icone(vw.IC[nome] || vw.IC.alerta, opts);
  };

  /* ================================================================= farol */

  vw.farol = function (rag, opts) {
    const o = opts || {};
    const def = (M.tax('rag').find(function (r) { return r.id === rag; })) || { rotulo: '—' };
    const n = U.el('span', {
      class: 'farol' + (o.ponto ? ' farol--ponto' : ''),
      data: { rag: rag || 'cinza' },
      attrs: { title: def.descricao || def.rotulo }
    }, [
      U.el('span', { class: 'farol__ic' }, [U.icone(M.ICONES_RAG[rag] || M.ICONES_RAG.cinza, { tam: 12, peso: 2.2 })]),
      U.el('span', { class: 'farol__txt', text: o.texto || def.rotulo })
    ]);
    return n;
  };

  vw.pontoRag = function (rag, titulo) {
    return U.el('span', { class: 'ponto-rag', data: { rag: rag || 'cinza' },
      attrs: { title: titulo || M.rotuloRag(rag), 'aria-label': titulo || M.rotuloRag(rag), role: 'img' } });
  };

  /* =================================================================== KPI */

  /**
   * kpi({ rot, valor, nota, delta:{valor,tom,texto}, tom, dica, spark:[nums] })
   * `valor` recebe figuras proporcionais (numero grande isolado), nunca tabular.
   */
  vw.kpi = function (cfg) {
    const c = cfg || {};
    const filhos = [
      U.el('div', { class: 'kpi__rot' }, [
        U.el('span', { text: c.rot || '' }),
        c.dica ? U.el('span', { class: 'dica', text: '?', attrs: { title: c.dica } }) : null
      ]),
      U.el('div', { class: 'kpi__valor' + (c.valorPeq ? ' kpi__valor--peq' : ''), text: c.valor === undefined ? '—' : String(c.valor) })
    ];
    if (c.delta) {
      filhos.push(U.el('div', { class: 'kpi__delta', data: { tom: c.delta.tom || 'neutro' } }, [
        U.el('span', { text: c.delta.texto || '' })
      ]));
    }
    if (c.nota) { filhos.push(U.el('div', { class: 'kpi__nota', text: c.nota })); }
    const n = U.el('div', { class: 'kpi' + (c.tom ? ' kpi--' + c.tom : '') }, filhos);
    if (c.spark && c.spark.length > 1) {
      const host = U.el('div', { class: 'kpi__spark' });
      n.appendChild(host);
      vw.grafico(c.view, C.sparkline, host, { valores: c.spark }, { altura: 30, cor: c.sparkCor });
    }
    if (c.onClick) {
      n.classList.add('cartao--clicavel');
      n.setAttribute('role', 'button');
      n.setAttribute('tabindex', '0');
      n.addEventListener('click', c.onClick);
      n.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.onClick(e); }
      });
    }
    return n;
  };

  /* ================================================================ cartao */

  vw.cartao = function (cfg) {
    const c = cfg || {};
    const topo = (c.titulo || c.acoes || c.sub) ? U.el('div', { class: 'cartao__topo' }, [
      U.el('div', {}, [
        U.el('h2', { class: 'cartao__titulo' }, [
          c.icone ? vw.icone(c.icone, { tam: 15 }) : null,
          U.el('span', { text: c.titulo || '' })
        ]),
        c.sub ? U.el('div', { class: 'cartao__sub', text: c.sub }) : null
      ]),
      c.acoes ? U.el('div', { class: 'cartao__acoes' }, c.acoes) : null
    ]) : null;

    return U.el('div', { class: 'cartao' + (c.classe ? ' ' + c.classe : '') }, [
      topo,
      U.el('div', { class: 'cartao__corpo' }, c.corpo),
      c.pe ? U.el('div', { class: 'cartao__pe' }, c.pe) : null
    ]);
  };

  vw.vazio = function (cfg) {
    const c = cfg || {};
    return U.el('div', { class: 'vazio' }, [
      U.el('div', { class: 'vazio__ic' }, [vw.icone(c.icone || 'painel', { tam: 38, peso: 1.3 })]),
      U.el('div', { class: 'vazio__titulo', text: c.titulo || 'Nada por aqui' }),
      c.txt ? U.el('p', { class: 'vazio__txt', text: c.txt }) : null,
      c.acoes ? U.el('div', { class: 'vazio__acoes' }, c.acoes) : null
    ]);
  };

  vw.aviso = function (tom, titulo, texto, acoes) {
    const ics = { info: 'alerta', aviso: 'risco', erro: 'alerta', ok: 'ok' };
    return U.el('div', { class: 'aviso-caixa', data: { tom: tom } }, [
      U.el('span', { class: 'aviso-caixa__ic' }, [vw.icone(ics[tom] || 'alerta', { tam: 16 })]),
      U.el('div', { class: 'aviso-caixa__corpo' }, [
        titulo ? U.el('div', { class: 'aviso-caixa__titulo', text: titulo }) : null,
        texto ? U.el('div', { text: texto }) : null,
        acoes ? U.el('div', { class: 'linha mt-2' }, acoes) : null
      ])
    ]);
  };

  vw.botao = function (rotulo, opts) {
    const o = opts || {};
    return U.el('button', {
      class: 'botao' + (o.variante ? ' botao--' + o.variante : '') + (o.peq ? ' botao--peq' : ''),
      type: 'button', disabled: !!o.desabilitado,
      attrs: { title: o.titulo || null },
      on: o.onClick ? { click: o.onClick } : null
    }, [
      o.icone ? vw.icone(o.icone, { tam: o.peq ? 13 : 14 }) : null,
      U.el('span', { text: rotulo })
    ]);
  };

  vw.botaoIcone = function (icone, titulo, onClick, opts) {
    const o = opts || {};
    return U.el('button', {
      class: 'botao-icone', type: 'button',
      attrs: { title: titulo, 'aria-label': titulo, 'aria-pressed': o.pressionado === undefined ? null : String(!!o.pressionado) },
      disabled: !!o.desabilitado,
      on: { click: onClick }
    }, [vw.icone(icone, { tam: o.tam || 16 })]);
  };

  vw.chip = function (texto, variante, opts) {
    const o = opts || {};
    return U.el('span', { class: 'chip' + (variante ? ' chip--' + variante : ''), attrs: { title: o.titulo || null } }, [
      o.icone ? vw.icone(o.icone, { tam: 11 }) : null,
      U.el('span', { text: texto })
    ]);
  };

  vw.pessoa = function (bundle, id, opts) {
    const o = opts || {};
    if (!id) { return U.el('span', { class: 'txt-3', text: '—' }); }
    const nome = M.nomePessoa(bundle, id);
    return U.el('span', { class: 'pessoa', attrs: { title: nome } }, [
      U.el('span', { class: 'avatar' + (o.peq ? ' avatar--peq' : ''), text: U.iniciais(nome), attrs: { 'aria-hidden': 'true' } }),
      o.semNome ? null : U.el('span', { class: 'pessoa__nome', text: o.curto ? nome.split(' ')[0] : nome })
    ]);
  };

  /** Barra de progresso com marca do planejado. Nunca comunica só por cor. */
  vw.progresso = function (pct, pctAlvo, opts) {
    const o = opts || {};
    const p = U.clamp(U.num(pct, 0), 0, 100);
    const alvo = U.ehNum(pctAlvo) ? U.clamp(pctAlvo, 0, 100) : null;
    let tom = null;
    if (alvo !== null) {
      const d = p - alvo;
      tom = d >= -2 ? 'bom' : (d >= -10 ? 'aviso' : 'critico');
    }
    const titulo = 'Avanço físico ' + U.fmtPct(p, 0) +
      (alvo !== null ? ' · planejado ' + U.fmtPct(alvo, 0) : '');
    const barra = U.el('div', { class: 'barra-prog', attrs: { title: titulo, role: 'img', 'aria-label': titulo } }, [
      U.el('div', { class: 'barra-prog__fill', data: { tom: tom }, style: { width: p + '%' } }),
      alvo !== null ? U.el('div', { class: 'barra-prog__alvo', style: { left: alvo + '%' } }) : null
    ]);
    if (o.semTexto) { return barra; }
    return U.el('div', { class: 'prog-linha' }, [
      barra, U.el('span', { class: 'prog-linha__txt', text: U.fmtPct(p, 0) })
    ]);
  };

  vw.metrica = function (rot, val, opts) {
    const o = opts || {};
    return U.el('div', { class: 'metrica-linha' }, [
      U.el('span', { class: 'metrica-linha__rot' }, [
        U.el('span', { text: rot }),
        o.dica ? U.el('span', { class: 'dica', text: '?', attrs: { title: o.dica } }) : null
      ]),
      U.el('span', { class: 'metrica-linha__val' + (o.tom === 'bom' ? ' txt-bom' : (o.tom === 'ruim' ? ' txt-ruim' : '')),
        text: val === null || val === undefined ? '—' : String(val) })
    ]);
  };

  /* ============================================== ciclo de vida de graficos */

  /** Registra a instancia no contexto da view para destruir no desmontar(). */
  vw.grafico = function (viewCtx, fn, container, dados, opts) {
    if (!container) { return null; }
    const inst = fn(container, dados, opts);
    if (viewCtx && viewCtx._charts) { viewCtx._charts.push(inst); }
    return inst;
  };

  vw.novoCtx = function () {
    return { _charts: [], _off: [] };
  };

  vw.limparCtx = function (ctx) {
    if (!ctx) { return; }
    (ctx._charts || []).forEach(function (c) { try { c.destruir(); } catch (e) { /* ok */ } });
    ctx._charts = [];
    (ctx._off || []).forEach(function (f) { try { f(); } catch (e) { /* ok */ } });
    ctx._off = [];
  };

  /* ================================================================ tabela */

  /**
   * tabela({ colunas:[{id,rot,tipo,largura,num,cent,fix,render(l),valor(l),ord}],
   *          linhas:[obj], chave(l), onLinha(l), agrupar(l), rodape:[celulas],
   *          ordenacao:{col,dir}, onOrdenar(col,dir), legenda, compacta, faixas })
   */
  vw.tabela = function (cfg) {
    const c = cfg || {};
    const cols = (c.colunas || []).filter(function (x) { return x && x.visivel !== false; });
    const tab = U.el('table', { class: 'tabela' + (c.compacta ? ' tabela--compacta' : '') + (c.faixas ? ' tabela--faixas' : '') });
    tab.appendChild(U.el('caption', { class: c.legendaVisivel ? '' : 'sr-only', text: c.legenda || 'Tabela de dados' }));

    const trh = U.el('tr');
    cols.forEach(function (col) {
      const podeOrd = col.ord !== false && !!c.onOrdenar;
      const ordAtual = c.ordenacao && c.ordenacao.col === col.id ? c.ordenacao.dir : null;
      const th = U.el('th', {
        class: (col.num ? 'num' : '') + (col.cent ? ' cent' : '') + (col.fix ? ' fix' : '') + (podeOrd ? ' ord' : ''),
        attrs: {
          scope: 'col',
          'aria-sort': ordAtual ? (ordAtual === 'asc' ? 'ascending' : 'descending') : null,
          title: col.dica || col.rot,
          style: col.largura ? 'min-width:' + col.largura : null
        }
      }, [
        U.el('span', { text: col.rot }),
        podeOrd ? U.el('span', { class: 'ord__seta' }, [
          U.icone(ordAtual === 'asc' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6', { tam: 11, peso: 2.4 })
        ]) : null
      ]);
      if (podeOrd) {
        th.setAttribute('tabindex', '0');
        const acionar = function () {
          const dir = ordAtual === 'asc' ? 'desc' : 'asc';
          c.onOrdenar(col.id, dir);
        };
        th.addEventListener('click', acionar);
        th.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acionar(); }
        });
      }
      trh.appendChild(th);
    });
    tab.appendChild(U.el('thead', {}, [trh]));

    const tb = U.el('tbody');
    let grupoAtual = null;
    (c.linhas || []).forEach(function (l) {
      if (c.agrupar) {
        const g = c.agrupar(l);
        if (g !== grupoAtual) {
          grupoAtual = g;
          tb.appendChild(U.el('tr', { class: 'tabela__grupo' }, [
            U.el('td', { attrs: { colspan: String(cols.length) }, text: g })
          ]));
        }
      }
      const tr = U.el('tr', { data: c.chave ? { id: c.chave(l) } : null });
      cols.forEach(function (col) {
        const td = U.el('td', {
          class: (col.num ? 'num' : '') + (col.cent ? ' cent' : '') + (col.fix ? ' fix' : ''),
          // Em tela estreita a linha vira cartão e cada célula precisa dizer
          // de que coluna veio: o cabeçalho não acompanha a reempilhagem.
          data: { rot: col.rot || '' }
        });
        const conteudo = col.render ? col.render(l) : (col.valor ? col.valor(l) : l[col.id]);
        if (conteudo instanceof Node) { td.appendChild(conteudo); }
        else { td.textContent = conteudo === null || conteudo === undefined || conteudo === '' ? '—' : String(conteudo); }
        tr.appendChild(td);
      });
      if (c.onLinha) {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function (e) {
          if (e.target.closest('button, a, input, select, textarea')) { return; }
          c.onLinha(l);
        });
      }
      tb.appendChild(tr);
    });
    tab.appendChild(tb);

    if (c.rodape && c.rodape.length) {
      const trf = U.el('tr', { class: 'tabela__total' });
      c.rodape.forEach(function (cel, i) {
        const col = cols[i] || {};
        const td = U.el('td', { class: (col.num ? 'num' : '') + (col.cent ? ' cent' : '') + (col.fix ? ' fix' : '') });
        if (cel instanceof Node) { td.appendChild(cel); } else { td.textContent = cel === null || cel === undefined ? '' : String(cel); }
        trf.appendChild(td);
      });
      tab.appendChild(U.el('tfoot', {}, [trf]));
    }

    /* O `thead` e sticky, mas o scrollport dele e o proprio .tabela-host
       (overflow:auto). Sem altura maxima o host nunca rola na vertical, e o
       sticky jamais engata: o cabecalho some junto com a pagina. Acima de um
       punhado de linhas o host vira o scrollport de verdade — o que tambem
       traz a barra horizontal para dentro do viewport, em vez de deixa-la no
       rodape de um cartao de milhares de pixels. */
    const host = U.el('div', { class: 'tabela-host' }, [tab]);
    const limite = c.alturaLimite === undefined ? 14 : c.alturaLimite;
    if (limite && (c.linhas || []).length > limite) {
      host.classList.add('tabela-host--rolagem');
    }
    return host;
  };

  /* ================================================= seletor de variante */

  /**
   * Seletor de público do relatório. Le as variantes declaradas em
   * 42-export-relatorios.js — a política vive lá, aqui só a escolha.
   * Devolve o wrapper com `.valor()` para o chamador ler no clique do botão.
   */
  vw.seletorVariante = function (valor, opts) {
    const o = opts || {};
    const lista = (PMO.exportar && PMO.exportar.variantes) ? PMO.exportar.variantes() : [];
    const padrao = (PMO.exportar && PMO.exportar.VARIANTE_PADRAO) || 'interno';
    const inicial = lista.some(function (v) { return v.id === valor; }) ? valor : padrao;
    const id = U.uid('varsel');

    const sel = U.el('select', { class: 'campo', attrs: { id: id } }, lista.map(function (v) {
      return U.el('option', { value: v.id, text: v.rotulo + ' — ' + v.publico });
    }));
    sel.value = inicial;

    const ajuda = U.el('p', { class: 'campo-grupo__ajuda' });
    function pintar() {
      const v = lista.find(function (x) { return x.id === sel.value; });
      ajuda.textContent = v ? v.descricao : 'Nenhuma variante disponível nesta compilação.';
    }
    pintar();
    sel.addEventListener('change', function () {
      pintar();
      if (o.onMudar) { o.onMudar(sel.value); }
    });

    const wrap = U.el('div', { class: 'campo-grupo' + (o.classe ? ' ' + o.classe : '') }, [
      U.el('label', { class: 'campo-grupo__rot', text: o.rotulo || 'Público do documento',
        attrs: { for: id } }),
      sel, ajuda
    ]);
    wrap.valor = function () { return sel.value || padrao; };
    return wrap;
  };

  /* ========================================================= barra filtros */

  vw.FILTRO_PADRAO = function () {
    return { busca: '', programaId: [], estagio: [], categoria: [], tipo: [], rag: [],
      gateAtual: [], pmId: [], sponsorId: [], buId: [], tags: [], somenteAtivos: false, somenteRisco: false };
  };

  /** Multi-select em popover simples, com contagem. */
  function seletorMulti(rotulo, opcoes, selecionados, onMudar) {
    const sel = (selecionados || []).slice();
    const btn = U.el('button', {
      class: 'chip-botao', type: 'button',
      data: { ativo: sel.length ? '1' : '0' },
      attrs: { 'aria-haspopup': 'true', 'aria-expanded': 'false' }
    }, [
      U.el('span', { text: rotulo }),
      sel.length ? U.el('span', { class: 'chip-botao__cont', text: String(sel.length) }) : null,
      vw.icone('setaBaixo', { tam: 12 })
    ]);

    let pop = null;
    function fechar() {
      if (pop && pop.parentNode) { pop.parentNode.removeChild(pop); }
      pop = null;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', foraClick, true);
      document.removeEventListener('keydown', onEsc, true);
    }
    function foraClick(e) { if (pop && !pop.contains(e.target) && e.target !== btn) { fechar(); } }
    function onEsc(e) { if (e.key === 'Escape') { fechar(); btn.focus(); } }

    btn.addEventListener('click', function () {
      if (pop) { fechar(); return; }
      pop = U.el('div', { class: 'paleta', style: { position: 'fixed', minWidth: '230px', maxHeight: '54vh' } });
      opcoes.forEach(function (op) {
        const marcado = sel.indexOf(op.id) >= 0;
        const linha = U.el('label', { class: 'paleta__item' }, [
          U.el('input', { type: 'checkbox', checked: marcado, style: { accentColor: 'var(--acento)' },
            on: { change: function (e) {
              const i = sel.indexOf(op.id);
              if (e.target.checked && i < 0) { sel.push(op.id); }
              else if (!e.target.checked && i >= 0) { sel.splice(i, 1); }
              btn.dataset.ativo = sel.length ? '1' : '0';
              onMudar(sel.slice());
            } } }),
          U.el('span', { class: 'paleta__item-txt' }, [
            U.el('span', { class: 'paleta__item-nome', text: op.rotulo }),
            op.sub ? U.el('span', { class: 'paleta__item-sub', text: op.sub }) : null
          ])
        ]);
        pop.appendChild(linha);
      });
      if (sel.length) {
        pop.appendChild(U.el('button', {
          class: 'paleta__item', type: 'button',
          on: { click: function () { sel.length = 0; onMudar([]); fechar(); } }
        }, [U.el('span', { class: 'paleta__item-nome txt-3', text: 'Limpar seleção' })]));
      }
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      pop.style.top = Math.min(window.innerHeight - 40, r.bottom + 6) + 'px';
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 248, r.left)) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      setTimeout(function () {
        document.addEventListener('click', foraClick, true);
        document.addEventListener('keydown', onEsc, true);
      }, 0);
    });
    return btn;
  }
  vw.seletorMulti = seletorMulti;

  /**
   * Uma única linha de filtros acima de tudo que ela escopa.
   * campos: lista de ids de PMO.model.CAMPOS_FILTRO a exibir.
   */
  vw.barraFiltros = function (host, bundle, filtro, onMudar, cfg) {
    const c = cfg || {};
    U.limpar(host);
    host.hidden = false;

    const campos = c.campos || ['busca', 'programaId', 'estagio', 'rag', 'categoria', 'pmId'];

    if (campos.indexOf('busca') >= 0) {
      const inp = U.el('input', {
        type: 'search', class: 'campo', value: filtro.busca || '',
        placeholder: 'Filtrar por código, nome ou tag…',
        style: { maxWidth: '260px' },
        attrs: { 'aria-label': 'Filtrar projetos' },
        on: { input: U.debounce(function (e) { filtro.busca = e.target.value; onMudar(filtro); }, 220) }
      });
      host.appendChild(inp);
    }

    function opcoesTaxonomia(colecao) {
      return M.tax(colecao, bundle).map(function (x) {
        return { id: x.id, rotulo: x.rotulo, sub: x.descricao };
      });
    }

    const construtores = {
      programaId: function () {
        return seletorMulti('Programa', (bundle.programas || []).map(function (p) {
          return { id: p.id, rotulo: p.nome, sub: p.codigo };
        }), filtro.programaId, function (v) { filtro.programaId = v; onMudar(filtro); });
      },
      estagio: function () {
        return seletorMulti('Estágio', opcoesTaxonomia('estagios'), filtro.estagio,
          function (v) { filtro.estagio = v; onMudar(filtro); });
      },
      categoria: function () {
        return seletorMulti('Categoria', opcoesTaxonomia('categorias'), filtro.categoria,
          function (v) { filtro.categoria = v; onMudar(filtro); });
      },
      tipo: function () {
        return seletorMulti('Tipo', opcoesTaxonomia('tipos'), filtro.tipo,
          function (v) { filtro.tipo = v; onMudar(filtro); });
      },
      rag: function () {
        return seletorMulti('Farol', opcoesTaxonomia('rag'), filtro.rag,
          function (v) { filtro.rag = v; onMudar(filtro); });
      },
      gateAtual: function () {
        return seletorMulti('Gate', M.gates().map(function (g) {
          return { id: g.id, rotulo: g.codigo + ' — ' + g.nome, sub: g.descricao };
        }), filtro.gateAtual, function (v) { filtro.gateAtual = v; onMudar(filtro); });
      },
      pmId: function () {
        const ids = {};
        (bundle.projetos || []).forEach(function (p) { if (p.pmId) { ids[p.pmId] = true; } });
        return seletorMulti('Gerente', (bundle.pessoas || []).filter(function (p) { return ids[p.id]; })
          .map(function (p) { return { id: p.id, rotulo: p.nome, sub: p.papel }; }),
          filtro.pmId, function (v) { filtro.pmId = v; onMudar(filtro); });
      },
      sponsorId: function () {
        const ids = {};
        (bundle.projetos || []).forEach(function (p) { if (p.sponsorId) { ids[p.sponsorId] = true; } });
        return seletorMulti('Sponsor', (bundle.pessoas || []).filter(function (p) { return ids[p.id]; })
          .map(function (p) { return { id: p.id, rotulo: p.nome, sub: p.papel }; }),
          filtro.sponsorId, function (v) { filtro.sponsorId = v; onMudar(filtro); });
      },
      buId: function () {
        return seletorMulti('Unidade', ((bundle.settings || {}).unidadesNegocio || [])
          .map(function (b) { return { id: b.id, rotulo: b.nome, sub: b.sigla }; }),
          filtro.buId, function (v) { filtro.buId = v; onMudar(filtro); });
      }
    };

    campos.forEach(function (id) {
      if (id === 'busca') { return; }
      if (construtores[id]) { host.appendChild(construtores[id]()); }
    });

    host.appendChild(U.el('div', { class: 'barra-filtros__sep' }));

    const btnAtivos = U.el('button', {
      class: 'chip-botao', type: 'button', data: { ativo: filtro.somenteAtivos ? '1' : '0' },
      attrs: { 'aria-pressed': String(!!filtro.somenteAtivos) },
      on: { click: function () { filtro.somenteAtivos = !filtro.somenteAtivos; onMudar(filtro); } }
    }, [U.el('span', { text: 'Só ativos' })]);
    host.appendChild(btnAtivos);

    const btnRisco = U.el('button', {
      class: 'chip-botao', type: 'button', data: { ativo: filtro.somenteRisco ? '1' : '0' },
      attrs: { 'aria-pressed': String(!!filtro.somenteRisco) },
      on: { click: function () { filtro.somenteRisco = !filtro.somenteRisco; onMudar(filtro); } }
    }, [vw.icone('risco', { tam: 12 }), U.el('span', { text: 'Em atenção' })]);
    host.appendChild(btnRisco);

    const dir = U.el('div', { class: 'barra-filtros__dir' });
    if (c.resumo) { dir.appendChild(U.el('span', { class: 'barra-filtros__resumo', text: c.resumo })); }
    if (vw.filtroAtivo(filtro)) {
      dir.appendChild(U.el('button', {
        class: 'botao botao--fantasma botao--peq', type: 'button',
        on: { click: function () {
          const z = vw.FILTRO_PADRAO();
          Object.keys(z).forEach(function (k) { filtro[k] = z[k]; });
          onMudar(filtro);
        } }
      }, [vw.icone('x', { tam: 12 }), U.el('span', { text: 'Limpar filtros' })]));
    }
    if (c.acoes) { c.acoes.forEach(function (a) { dir.appendChild(a); }); }
    host.appendChild(dir);

    /* Tela estreita: a barra inteira ocupava 157px, 19% da altura visível.
       Os mesmos controles vão para um modal e sobra um gatilho com a
       contagem. Nada é removido — só deixa de ficar permanentemente aberto. */
    if (window.innerWidth <= 720) {
      const filhos = Array.prototype.slice.call(host.childNodes);
      U.limpar(host);
      const caixa = U.el('div', { class: 'pilha pilha--3 filtros-modal' }, filhos);
      const n = vw.contarFiltros(filtro);
      host.appendChild(U.el('button', {
        class: 'chip-botao', type: 'button', data: { ativo: n ? '1' : '0' },
        attrs: { 'aria-label': n ? n + ' filtro(s) ativo(s). Abrir filtros.' : 'Abrir filtros' },
        on: { click: function () {
          PMO.app.abrirModal('Filtros', caixa, {
            acoes: [vw.botao('Concluído', { variante: 'primario', onClick: PMO.app.fecharModal })]
          });
        } }
      }, [
        vw.icone('filtro', { tam: 13 }),
        U.el('span', { text: n ? 'Filtros (' + n + ')' : 'Filtros' })
      ]));
      if (c.resumo) {
        host.appendChild(U.el('span', { class: 'barra-filtros__resumo', text: c.resumo }));
      }
    }
  };

  /** Quantos critérios o filtro tem ativos. Alimenta o gatilho compacto. */
  vw.contarFiltros = function (f) {
    if (!f) { return 0; }
    let n = 0;
    if (f.busca) { n += 1; }
    if (f.somenteAtivos) { n += 1; }
    if (f.somenteRisco) { n += 1; }
    ['programaId', 'estagio', 'categoria', 'tipo', 'rag', 'gateAtual', 'pmId', 'sponsorId', 'buId', 'tags']
      .forEach(function (k) { n += (f[k] || []).length; });
    return n;
  };

  vw.filtroAtivo = function (f) {
    if (!f) { return false; }
    if (f.busca) { return true; }
    if (f.somenteAtivos || f.somenteRisco) { return true; }
    return ['programaId', 'estagio', 'categoria', 'tipo', 'rag', 'gateAtual', 'pmId', 'sponsorId', 'buId', 'tags']
      .some(function (k) { return (f[k] || []).length > 0; });
  };

  /* ================================================== contexto do portfolio */

  /** Conveniencias derivadas do bundle, calculadas uma vez por render. */
  vw.contexto = function (filtro) {
    const b = S.state;
    const lim = (b.settings || {}).limiares || M.LIMIARES_PADRAO;
    const dd = U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const todos = b.projetos || [];
    const projetos = filtro ? M.filtrar(todos, filtro, { limiares: lim, dataStatus: dd }) : todos;
    return {
      bundle: b, limiares: lim, dataStatus: dd,
      todos: todos, projetos: projetos,
      saude: function (p) { return M.saudeProjeto(p, lim, dd); },
      evm: function (p) { return M.evm(p, dd); },
      kpis: function (lista) { return M.kpisPortfolio(lista || projetos, { limiares: lim, dataStatus: dd }); }
    };
  };

  /* ========================================================= formatadores */

  vw.fmtDesvioDias = function (n) {
    if (!U.ehNum(n)) { return '—'; }
    if (n === 0) { return 'no prazo'; }
    return (n > 0 ? '+' : '') + U.fmtNum(n, 0) + ' d';
  };

  vw.tomDesvio = function (n, limiar) {
    const L = limiar || M.LIMIARES_PADRAO.desvioDias;
    if (!U.ehNum(n) || n <= 0) { return 'bom'; }
    if (n >= L.vermelho) { return 'ruim'; }
    if (n >= L.ambar) { return 'neutro'; }
    return 'neutro';
  };

  vw.tomIndice = function (v, limiar) {
    const L = limiar || M.LIMIARES_PADRAO.spi;
    if (!U.ehNum(v)) { return 'neutro'; }
    if (v < L.vermelho) { return 'ruim'; }
    if (v < L.ambar) { return 'neutro'; }
    return 'bom';
  };

  vw.celulaIndice = function (v, limiar) {
    if (!U.ehNum(v)) {
      return U.el('span', { class: 'txt-3', text: 'n/a', attrs: { title: 'Sem valor planejado ou custo real suficiente para calcular o índice.' } });
    }
    const tom = vw.tomIndice(v, limiar);
    return U.el('span', {
      class: tom === 'bom' ? 'txt-bom txt-forte' : (tom === 'ruim' ? 'txt-ruim txt-forte' : 'txt-forte'),
      text: U.fmtRazao(v, 2)
    });
  };

  /* ============================================== formulário genérico
     Dirigido por especificação (ver PMO.model.CAMPOS_EDICAO). É a peça
     compartilhada entre a edição de projeto e o editor de registros — quem
     precisar de um formulário novo declara os campos, não escreve interface.

       const f = vw.formulario(campos, dados, { bundle });
       modal.appendChild(f.form);
       const r = f.validar();  ->  { ok, erros: [{campo, msg}] }
       const novo = f.obter(); ->  objeto com os valores aplicados
     ============================================================== */

  const ESCALA5 = [
    { id: 1, rotulo: '1 — Muito baixa' }, { id: 2, rotulo: '2 — Baixa' },
    { id: 3, rotulo: '3 — Média' }, { id: 4, rotulo: '4 — Alta' },
    { id: 5, rotulo: '5 — Muito alta' }
  ];

  vw.formulario = function (campos, dados, opts) {
    const o = opts || {};
    const b = o.bundle || (S ? S.state : M.portfolioVazio());
    const estado = U.clonar(dados || {});
    const form = U.el('div', { class: 'form-grade' + (o.duasColunas ? ' form-grade--2' : '') });
    const registros = [];

    function opcoesDe(def) {
      const vazio = [{ id: '', rotulo: def.obrigatorio ? '— selecione —' : '—' }];
      if (def.tipo === 'taxonomia') {
        const lista = M.tax(def.colecao, b).map(function (x) {
          return { id: x.id, rotulo: x.rotulo, sub: x.descricao };
        });
        return def.obrigatorio ? vazio.concat(lista) : vazio.concat(lista);
      }
      if (def.tipo === 'pessoa') {
        return vazio.concat(U.sortBy(b.pessoas || [], function (p) { return p.nome; })
          .map(function (p) { return { id: p.id, rotulo: p.nome, sub: p.papel }; }));
      }
      if (def.tipo === 'projeto') {
        return vazio.concat(U.sortBy((b.projetos || []).filter(function (p) {
          return p.id !== o.excluirProjetoId;
        }), function (p) { return p.codigo || p.nome; }).map(function (p) {
          return { id: p.id, rotulo: (p.codigo ? p.codigo + ' · ' : '') + p.nome };
        }));
      }
      if (def.tipo === 'gate') {
        return vazio.concat(M.gates().map(function (g) {
          return { id: g.id, rotulo: g.codigo + ' — ' + g.nome, sub: g.descricao };
        }));
      }
      if (def.tipo === 'escala5') { return ESCALA5.slice(); }
      return vazio;
    }

    campos.forEach(function (def) {
      const valorAtual = U.campo(estado, def.campo);
      let entrada;

      if (def.tipo === 'booleano') {
        const chk = U.el('input', { type: 'checkbox', checked: !!valorAtual,
          style: { accentColor: 'var(--acento)' } });
        chk.addEventListener('change', function () { U.setCampo(estado, def.campo, chk.checked); });
        form.appendChild(U.el('div', { class: 'campo-grupo' + (def.largo ? ' form-largo' : '') }, [
          U.el('label', { class: 'marcador' }, [chk, U.el('span', { text: def.rotulo })]),
          def.ajuda ? U.el('span', { class: 'campo-grupo__ajuda', text: def.ajuda }) : null
        ]));
        registros.push({ def: def, ler: function () { return chk.checked; }, no: chk });
        return;
      }

      if (def.tipo === 'textarea') {
        entrada = U.el('textarea', { class: 'campo', value: valorAtual === null || valorAtual === undefined ? '' : String(valorAtual) });
        entrada.addEventListener('input', function () { U.setCampo(estado, def.campo, entrada.value); });
      } else if (['taxonomia', 'pessoa', 'projeto', 'gate', 'escala5'].indexOf(def.tipo) >= 0) {
        const ops = opcoesDe(def);
        entrada = U.el('select', { class: 'campo' }, ops.map(function (op) {
          return U.el('option', {
            value: String(op.id),
            text: op.rotulo,
            selected: String(op.id) === String(valorAtual === null || valorAtual === undefined ? '' : valorAtual),
            attrs: { title: op.sub || null }
          });
        }));
        entrada.addEventListener('change', function () {
          const v = entrada.value;
          if (v === '') { U.setCampo(estado, def.campo, null); return; }
          U.setCampo(estado, def.campo, (def.numerico || def.tipo === 'escala5') ? U.num(v, 0) : v);
        });
      } else if (def.tipo === 'data') {
        entrada = U.el('input', { class: 'campo', type: 'date', value: U.parseDate(valorAtual) || '' });
        entrada.addEventListener('input', function () {
          U.setCampo(estado, def.campo, entrada.value ? U.parseDate(entrada.value) : null);
        });
      } else if (def.tipo === 'moeda' || def.tipo === 'numero' || def.tipo === 'pct') {
        entrada = U.el('input', {
          class: 'campo campo--num', type: 'number',
          step: def.tipo === 'moeda' ? '1000' : (def.tipo === 'pct' ? '1' : 'any'),
          min: def.tipo === 'pct' ? '0' : null, max: def.tipo === 'pct' ? '100' : null,
          value: U.ehNum(valorAtual) ? String(valorAtual) : (valorAtual ? String(valorAtual) : '0')
        });
        entrada.addEventListener('input', function () {
          let v = U.num(entrada.value, 0);
          if (def.tipo === 'pct') { v = U.clamp(v, 0, 100); }
          U.setCampo(estado, def.campo, v);
        });
      } else {
        entrada = U.el('input', { class: 'campo', type: 'text',
          value: valorAtual === null || valorAtual === undefined ? '' : String(valorAtual) });
        entrada.addEventListener('input', function () { U.setCampo(estado, def.campo, entrada.value); });
      }

      const erroEl = U.el('span', { class: 'campo-grupo__erro', hidden: true });
      form.appendChild(U.el('div', { class: 'campo-grupo' + (def.largo ? ' form-largo' : '') }, [
        U.el('label', { class: 'campo-grupo__rot' + (def.obrigatorio ? ' campo-obrigatorio' : ''), text: def.rotulo }),
        entrada,
        def.ajuda ? U.el('span', { class: 'campo-grupo__ajuda', text: def.ajuda }) : null,
        erroEl
      ]));
      registros.push({ def: def, no: entrada, erroEl: erroEl });
    });

    return {
      form: form,
      obter: function () { return U.clonar(estado); },
      validar: function () {
        const erros = [];
        registros.forEach(function (r) {
          if (r.erroEl) { r.erroEl.hidden = true; r.no.removeAttribute('aria-invalid'); }
          if (!r.def.obrigatorio) { return; }
          const v = U.campo(estado, r.def.campo);
          const vazio = v === null || v === undefined || String(v).trim() === '';
          if (vazio) {
            erros.push({ campo: r.def.campo, msg: r.def.rotulo + ' é obrigatório.' });
            if (r.erroEl) {
              r.erroEl.textContent = 'Campo obrigatório.';
              r.erroEl.hidden = false;
              r.no.setAttribute('aria-invalid', 'true');
            }
          }
        });
        if (erros.length && registros.length) {
          const primeiro = registros.find(function (r) { return r.def.campo === erros[0].campo; });
          if (primeiro && primeiro.no.focus) { primeiro.no.focus(); }
        }
        return { ok: erros.length === 0, erros: erros };
      }
    };
  };

  PMO.vw = vw;
})(window.PMO = window.PMO || {});
