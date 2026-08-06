/* =============================================================================
   50-charts.js — biblioteca de graficos SVG sem dependencias
   Depende de: 00-util.js  (usa CSS de 50-charts.css)

   Regras de dataviz aplicadas:
   - paleta categorica fixa --serie-1..8, atribuida por ENTIDADE (nunca por rank)
   - nunca eixo duplo; grade/eixo em hairline solido (tracejado so p/ previsao)
   - legenda sempre presente com >= 2 series; rotulo direto seletivo
   - vao de 2px na cor da superficie entre preenchimentos
   - tooltip + foco por teclado em toda marca; gemeo tabular em todo grafico
   - status (bom/aviso/serio/critico) e reservado: nunca vira serie
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util || {};
  const NS = 'http://www.w3.org/2000/svg';
  const cht = {};

  cht.MAX_SERIES = 8;
  cht.MAX_SERIES_TODOS_PARES = 3;

  /* ------------------------------------------------- fallbacks defensivos */
  const fmtNum = U.fmtNum || function (n, d) { return Number(n || 0).toFixed(d || 0); };
  const fmtPct = U.fmtPct || function (n, d) { return fmtNum(n, d) + '%'; };
  const fmtMoney = U.fmtMoney || function (n) { return 'R$ ' + fmtNum(n, 0); };
  const safeDiv = U.safeDiv || function (a, b, f) { return b ? a / b : (f || 0); };
  const clamp = U.clamp || function (n, a, z) { return n < a ? a : (n > z ? z : n); };
  const ehNum = U.ehNum || function (v) { return typeof v === 'number' && isFinite(v); };
  const truncar = U.truncar || function (s, n) { return String(s).slice(0, n); };

  function el(tag, attrs, filhos) {
    const n = document.createElement(tag);
    aplicar(n, attrs);
    anexar(n, filhos);
    return n;
  }
  function s(tag, attrs, filhos) {
    const n = document.createElementNS(NS, tag);
    aplicar(n, attrs, true);
    anexar(n, filhos);
    return n;
  }
  function aplicar(n, attrs, svg) {
    const a = attrs || {};
    Object.keys(a).forEach(function (k) {
      const v = a[k];
      if (v === null || v === undefined || v === false) { return; }
      if (k === 'text') { n.textContent = String(v); }
      else if (k === 'class') { if (svg) { n.setAttribute('class', v); } else { n.className = v; } }
      else if (k === 'on') { Object.keys(v).forEach(function (e) { n.addEventListener(e, v[e]); }); }
      else if (k === 'style' && typeof v === 'object') { Object.assign(n.style, v); }
      else if (v === true) { n.setAttribute(k, ''); }
      else { n.setAttribute(k, String(v)); }
    });
  }
  function anexar(pai, f) {
    if (f === null || f === undefined || f === false) { return; }
    if (Array.isArray(f)) { f.forEach(function (x) { anexar(pai, x); }); return; }
    if (f instanceof Node) { pai.appendChild(f); return; }
    pai.appendChild(document.createTextNode(String(f)));
  }
  function limpar(n) { while (n && n.firstChild) { n.removeChild(n.firstChild); } return n; }

  /* ============================================================== cores */

  cht.corSerie = function (i) {
    const idx = (ehNum(i) ? Math.floor(i) : 0);
    return 'var(--serie-' + (clamp(idx, 0, cht.MAX_SERIES - 1) + 1) + ')';
  };

  const MAPA_STATUS = {
    bom: 'var(--st-bom)', aviso: 'var(--st-aviso)', serio: 'var(--st-serio)',
    critico: 'var(--st-critico)', neutro: 'var(--st-neutro)'
  };
  cht.corStatus = function (chave) { return MAPA_STATUS[chave] || MAPA_STATUS.neutro; };

  const MAPA_RAG = {
    verde: 'var(--rag-verde)', ambar: 'var(--rag-ambar)', vermelho: 'var(--rag-vermelho)',
    azul: 'var(--rag-azul)', cinza: 'var(--rag-cinza)'
  };
  cht.corRag = function (rag) { return MAPA_RAG[rag] || MAPA_RAG.cinza; };

  // rampa sequencial: passos validados de 00-theme.css (um hue, claro -> escuro)
  const PASSOS_SEQ = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700];
  const IDX_ORD_MIN_CLARO = 3;   // --seq-250: piso ordinal no modo claro
  const IDX_ORD_MAX_ESCURO = 10; // --seq-600: piso ordinal no modo escuro

  function modoEscuro() {
    const carimbo = document.documentElement.getAttribute('data-tema');
    if (carimbo === 'escuro') { return true; }
    if (carimbo === 'claro') { return false; }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  cht.escalaSeq = function (t, ordinal) {
    const x = clamp(ehNum(t) ? t : 0, 0, 1);
    let lo = 0, hi = PASSOS_SEQ.length - 1;
    if (ordinal) {
      if (modoEscuro()) { hi = IDX_ORD_MAX_ESCURO; } else { lo = IDX_ORD_MIN_CLARO; }
    }
    const i = lo + Math.round(x * (hi - lo));
    return 'var(--seq-' + PASSOS_SEQ[clamp(i, 0, PASSOS_SEQ.length - 1)] + ')';
  };

  cht.escalaDiv = function (t) {
    const x = clamp(ehNum(t) ? t : 0, -1, 1);
    if (Math.abs(x) < 0.08) { return 'var(--div-neutro)'; }
    const polo = x < 0 ? 'var(--div-frio)' : 'var(--div-quente)';
    const forca = Math.round(clamp(Math.abs(x), 0, 1) * 100);
    return 'color-mix(in oklab, ' + polo + ' ' + forca + '%, var(--div-neutro))';
  };

  // calor semantico para matriz de risco (excecao documentada: exige legenda de escala)
  cht.escalaRisco = function (score) {
    const sc = clamp(ehNum(score) ? score : 0, 0, 25);
    if (sc >= 20) { return cht.corStatus('critico'); }
    if (sc >= 12) { return cht.corStatus('serio'); }
    if (sc >= 6) { return cht.corStatus('aviso'); }
    return 'var(--rag-verde-bg)';
  };

  /* ============================================================ tooltip */

  let _tip = null;
  function tip() {
    if (!_tip || !_tip.parentNode) {
      _tip = el('div', { class: 'pmo-cht-tip', hidden: true, attrs: {} });
      _tip.setAttribute('role', 'tooltip');
      document.body.appendChild(_tip);
    }
    return _tip;
  }
  cht._tooltip = tip;

  /** linhas: [{rotulo, valor, cor, forma, forte}] */
  function mostrarTip(ev, titulo, linhas, nota) {
    const t = tip();
    limpar(t);
    if (titulo) { t.appendChild(el('div', { class: 'pmo-cht-tip-t', text: titulo })); }
    (linhas || []).forEach(function (l) {
      const k = el('span', { class: 'pmo-cht-tip-k' + (l.forma ? ' e-' + l.forma : '') });
      if (l.cor) { k.style.setProperty('--k', l.cor); }
      t.appendChild(el('div', { class: 'pmo-cht-tip-l' + (l.forte ? ' e-forte' : '') }, [
        k,
        el('span', { class: 'pmo-cht-tip-n', text: l.rotulo === undefined ? '' : String(l.rotulo) }),
        el('span', { class: 'pmo-cht-tip-v', text: l.valor === undefined ? '' : String(l.valor) })
      ]));
    });
    if (nota) { t.appendChild(el('div', { class: 'pmo-cht-tip-nota', text: nota })); }
    t.hidden = false;
    posicionarTip(ev);
  }
  function posicionarTip(ev) {
    const t = tip();
    if (t.hidden) { return; }
    const r = t.getBoundingClientRect();
    let x = 14, y = 14;
    if (ev && ehNum(ev.clientX)) { x = ev.clientX + 14; y = ev.clientY + 14; }
    else if (ev && ev.target && ev.target.getBoundingClientRect) {
      const b = ev.target.getBoundingClientRect();
      x = b.left + b.width / 2; y = b.top - r.height - 8;
      if (y < 4) { y = b.bottom + 8; }
    }
    if (x + r.width > window.innerWidth - 8) { x = Math.max(8, window.innerWidth - r.width - 8); }
    if (y + r.height > window.innerHeight - 8) { y = Math.max(8, window.innerHeight - r.height - 8); }
    t.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }
  function esconderTip() { const t = tip(); t.hidden = true; }

  /** Liga tooltip a uma marca, no hover E no foco (a11y). */
  function ligarTip(no, titulo, linhas, nota) {
    no.addEventListener('mouseenter', function (e) { mostrarTip(e, titulo, linhas, nota); });
    no.addEventListener('mousemove', posicionarTip);
    no.addEventListener('mouseleave', esconderTip);
    no.addEventListener('focus', function (e) { mostrarTip({ target: no }, titulo, linhas, nota); });
    no.addEventListener('blur', esconderTip);
  }

  /* ========================================================== escalas */

  function ticksBonitos(min, max, alvo) {
    const n = alvo || 5;
    if (!ehNum(min) || !ehNum(max)) { return { min: 0, max: 1, passo: 1, ticks: [0, 1] }; }
    if (min === max) {
      if (min === 0) { return { min: 0, max: 1, passo: 0.5, ticks: [0, 0.5, 1] }; }
      const d = Math.abs(min) * 0.5;
      min -= d; max += d;
    }
    const bruto = (max - min) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)));
    const norm = bruto / mag;
    let passo;
    if (norm <= 1) { passo = 1; } else if (norm <= 2) { passo = 2; }
    else if (norm <= 2.5) { passo = 2.5; } else if (norm <= 5) { passo = 5; } else { passo = 10; }
    passo *= mag;
    const lo = Math.floor(min / passo) * passo;
    const hi = Math.ceil(max / passo) * passo;
    const ticks = [];
    for (let v = lo; v <= hi + passo * 0.001; v += passo) { ticks.push(U.arredondar ? U.arredondar(v, 6) : v); }
    return { min: lo, max: hi, passo: passo, ticks: ticks };
  }

  /* Caminho de barra com raio 4px SO na extremidade de dado (ancorada na base). */
  function caminhoBarra(x, y, w, h, r, orient) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    if (rr <= 0.5) { return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z'; }
    if (orient === 'cima') {
      return 'M' + x + ' ' + (y + h) + 'V' + (y + rr) +
        'a' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + (-rr) + 'h' + (w - 2 * rr) +
        'a' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + rr + 'V' + (y + h) + 'Z';
    }
    if (orient === 'baixo') {
      return 'M' + x + ' ' + y + 'V' + (y + h - rr) +
        'a' + rr + ' ' + rr + ' 0 0 0 ' + rr + ' ' + rr + 'h' + (w - 2 * rr) +
        'a' + rr + ' ' + rr + ' 0 0 0 ' + rr + ' ' + (-rr) + 'V' + y + 'Z';
    }
    if (orient === 'direita') {
      return 'M' + x + ' ' + y + 'h' + (w - rr) +
        'a' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + rr + 'v' + (h - 2 * rr) +
        'a' + rr + ' ' + rr + ' 0 0 1 ' + (-rr) + ' ' + rr + 'H' + x + 'Z';
    }
    return 'M' + (x + w) + ' ' + y + 'H' + (x + rr) +
      'a' + rr + ' ' + rr + ' 0 0 0 ' + (-rr) + ' ' + rr + 'v' + (h - 2 * rr) +
      'a' + rr + ' ' + rr + ' 0 0 0 ' + rr + ' ' + rr + 'H' + (x + w) + 'Z';
  }

  /* ====================================================== base comum */

  /**
   * Cria a moldura padrao. Devolve um "ctx" com o ciclo de vida pronto.
   * O desenho de cada grafico vive em `render(ctx, dados, opts)`.
   */
  function base(container, dados, opts, render, nomeGrafico) {
    if (!container) { return { atualizar: function () {}, destruir: function () {}, svg: null, dados: dados }; }
    limpar(container);

    const raiz = el('div', { class: 'pmo-cht' });
    const plot = el('div', { class: 'pmo-cht-plot' });
    const vazio = el('div', { class: 'pmo-cht-vazio', hidden: true });
    const rodape = el('div', { class: 'pmo-cht-rodape' });
    raiz.appendChild(plot);
    raiz.appendChild(vazio);
    raiz.appendChild(rodape);
    container.appendChild(raiz);

    const ctx = {
      raiz: raiz, plot: plot, rodape: rodape, vazio: vazio,
      largura: 0, dados: dados, opts: opts || {}, nome: nomeGrafico,
      destruido: false
    };

    function medir() {
      const w = plot.clientWidth || raiz.clientWidth || container.clientWidth || 0;
      ctx.largura = w > 0 ? w : 640;
      /* Largura da RAIZ. Ela nao muda quando o grafico troca o proprio layout
         interno, e por isso e a unica medida segura para DECIDIR layout.
         Decidir a partir de ctx.largura (a largura do plot) realimenta: o
         donut passava de 420px, virava lado a lado, o plot encolhia para 44%,
         caia abaixo de 420, voltava para coluna e recomecava — a cada frame. */
      const wr = raiz.clientWidth || container.clientWidth || 0;
      ctx.larguraRaiz = wr > 0 ? wr : ctx.largura;
      /* As views montam a arvore inteira e so a anexam ao documento depois,
         entao na construcao o container costuma estar solto e nao ha o que
         medir. Desenhar com a largura de reserva e aceitavel; DECIDIR layout
         com ela nao e — era assim que o donut nascia em modo largo e so entao
         se corrigia, dando o primeiro empurrao na oscilacao. */
      ctx.larguraMedida = w > 0;
      return ctx.largura;
    }

    function pintar() {
      if (ctx.destruido) { return; }
      medir();
      limpar(plot);
      limpar(rodape);
      try {
        const temDados = render(ctx, ctx.dados, ctx.opts);
        const semDados = temDados === false;
        vazio.hidden = !semDados;
        plot.hidden = semDados;
        if (semDados) {
          limpar(vazio);
          vazio.appendChild(document.createTextNode(
            (ctx.opts && ctx.opts.msgVazio) || 'Sem dados para exibir'));
        }
      } catch (e) {
        if (window.console) { console.error('[PMO.chart:' + nomeGrafico + ']', e); }
        limpar(plot);
        vazio.hidden = false;
        limpar(vazio);
        vazio.appendChild(document.createTextNode('Não foi possível desenhar este gráfico.'));
      }
    }

    let ro = null;
    let quadroResize = null;
    if (window.ResizeObserver) {
      let ultima = 0;
      ro = new ResizeObserver(function () {
        const w = plot.clientWidth || 0;
        if (Math.abs(w - ultima) > 6) {
          ultima = w;
          // Renderizar dentro do callback do observer pode alterar novamente o
          // layout no mesmo ciclo e disparar o erro "ResizeObserver loop".
          // O proximo frame separa medicao e pintura sem perder responsividade.
          if (quadroResize !== null) { cancelAnimationFrame(quadroResize); }
          quadroResize = requestAnimationFrame(function () {
            quadroResize = null;
            pintar();
          });
        }
      });
      try { ro.observe(raiz); } catch (e) { /* segue sem observer */ }
    }
    const onTema = function () { pintar(); };
    window.addEventListener('pmo:tema', onTema);

    pintar();

    return {
      svg: null,
      get dados() { return ctx.dados; },
      atualizar: function (novosDados, novasOpts) {
        if (ctx.destruido) { return; }
        if (novosDados !== undefined && novosDados !== null) { ctx.dados = novosDados; }
        if (novasOpts) { ctx.opts = Object.assign({}, ctx.opts, novasOpts); }
        plot.style.opacity = '0.55';
        pintar();
        requestAnimationFrame(function () { plot.style.opacity = ''; });
      },
      destruir: function () {
        if (ctx.destruido) { return; }
        ctx.destruido = true;
        if (ro) { try { ro.disconnect(); } catch (e) { /* ok */ } }
        if (quadroResize !== null) { cancelAnimationFrame(quadroResize); quadroResize = null; }
        window.removeEventListener('pmo:tema', onTema);
        esconderTip();
        limpar(container);
      }
    };
  }

  function svgRaiz(ctx, w, h, titulo, desc) {
    const sv = s('svg', {
      class: 'pmo-cht-svg', viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'xMidYMid meet', role: 'img',
      style: { maxHeight: h + 'px' }
    });
    sv.appendChild(s('title', { text: titulo || ctx.nome }));
    if (desc) { sv.appendChild(s('desc', { text: desc })); }
    ctx.plot.appendChild(sv);
    return sv;
  }

  function txt(x, y, texto, extra) {
    return s('text', Object.assign({
      x: x, y: y, 'font-size': 11, fill: 'var(--tinta-3)',
      'dominant-baseline': 'middle', text: texto
    }, extra || {}));
  }

  /* ======================================================== legenda */

  cht.legenda = function (container, dados) {
    const itens = (dados && dados.itens) || [];
    const ul = el('ul', { class: 'pmo-cht-leg' + (dados && dados.coluna ? ' e-coluna' : '') });
    itens.forEach(function (it) {
      const forma = it.forma || 'quadrado';
      let sw;
      if (forma === 'linha' || forma === 'tracejada') {
        sw = s('svg', { class: 'pmo-cht-sw', width: 16, height: 8, 'aria-hidden': 'true' }, [
          s('line', {
            x1: 0, y1: 4, x2: 16, y2: 4, stroke: it.cor, 'stroke-width': 2,
            'stroke-dasharray': forma === 'tracejada' ? '4 3' : null, 'stroke-linecap': 'round'
          })
        ]);
      } else if (forma === 'ponto') {
        sw = s('svg', { class: 'pmo-cht-sw', width: 10, height: 10, 'aria-hidden': 'true' }, [
          s('circle', { cx: 5, cy: 5, r: 4, fill: it.cor })
        ]);
      } else {
        sw = s('svg', { class: 'pmo-cht-sw', width: 10, height: 10, 'aria-hidden': 'true' }, [
          s('rect', { x: 0, y: 1, width: 10, height: 8, rx: 2, fill: it.cor })
        ]);
      }
      const li = el('li', {}, [sw, el('span', { class: 'pmo-cht-leg-r', text: it.rotulo })]);
      if (it.valor !== undefined && it.valor !== null) {
        li.appendChild(el('span', { class: 'pmo-cht-leg-v', text: String(it.valor) }));
      }
      ul.appendChild(li);
    });
    if (container) { container.appendChild(ul); }
    return ul;
  };

  /** Legenda de escala continua (obrigatoria em heatmap/sequencial). */
  function legendaEscala(container, cfg) {
    const passos = cfg.passos || 7;
    const barra = el('div', { class: 'pmo-cht-esc-barra' });
    for (let i = 0; i < passos; i++) {
      const t = passos === 1 ? 0.5 : i / (passos - 1);
      const cor = cfg.escala === 'divergente' ? cht.escalaDiv(t * 2 - 1) : cht.escalaSeq(t, cfg.ordinal);
      barra.appendChild(el('span', { style: { background: cor } }));
    }
    const linha = el('div', { class: 'pmo-cht-esc' }, [
      cfg.titulo ? el('span', { class: 'pmo-cht-esc-tit', text: cfg.titulo }) : null,
      el('span', { class: 'pmo-cht-esc-lim', text: cfg.minRotulo || '' }),
      barra,
      el('span', { class: 'pmo-cht-esc-lim', text: cfg.maxRotulo || '' })
    ]);
    if (container) { container.appendChild(linha); }
    return linha;
  }
  cht.legendaEscala = legendaEscala;

  /* ==================================================== gemeo tabular */

  cht.tabelaTwin = function (container, dados) {
    const cols = (dados && dados.colunas) || [];
    const linhas = (dados && dados.linhas) || [];
    const tab = el('table', { class: 'pmo-cht-tab' });
    if (dados && dados.legenda) { tab.appendChild(el('caption', { text: dados.legenda })); }
    const thead = el('thead');
    const trh = el('tr');
    cols.forEach(function (c, i) {
      trh.appendChild(el('th', { text: String(c), attrs: { scope: 'col' } }));
    });
    thead.appendChild(trh);
    tab.appendChild(thead);
    const tb = el('tbody');
    linhas.forEach(function (l) {
      const tr = el('tr');
      (l || []).forEach(function (v, i) {
        if (i === 0) { tr.appendChild(el('th', { text: v === null || v === undefined ? '' : String(v), attrs: { scope: 'row' } })); }
        else { tr.appendChild(el('td', { text: v === null || v === undefined ? '—' : String(v) })); }
      });
      tb.appendChild(tr);
    });
    tab.appendChild(tb);
    const rolo = el('div', { class: 'pmo-cht-tab-rolo' }, [tab]);
    if (container) { container.appendChild(rolo); }
    return rolo;
  };

  /** <details> com o gemeo tabular — usado no rodape de cada grafico. */
  function detalheTabela(ctx, colunas, linhas, legenda) {
    if (ctx.opts.semTabela) { return; }
    const det = el('details', { class: 'pmo-cht-det' }, [
      el('summary', { text: 'Ver dados em tabela' })
    ]);
    /* pintar() esvazia o rodape, entao toda repintura recriava este <details>
       fechado. Quem abrisse a tabela via ela piscar e sumir. O estado de
       abertura pertence ao grafico, nao ao no que acabou de ser descartado. */
    det.open = !!ctx.detalheAberto;
    det.addEventListener('toggle', function () { ctx.detalheAberto = det.open; });
    cht.tabelaTwin(det, { colunas: colunas, linhas: linhas, legenda: legenda });
    ctx.rodape.appendChild(det);
  }

  /* =============================================================== donut */

  cht.donut = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      let segs = ((d && d.segmentos) || []).filter(function (x) { return ehNum(x.valor) && x.valor > 0; });
      if (!segs.length) { return false; }

      const maxSeg = o.maxSegmentos || 6;
      if (segs.length > maxSeg) {
        segs = (U.sortBy ? U.sortBy(segs, function (x) { return x.valor; }, 'desc') : segs.slice());
        const cabeca = segs.slice(0, maxSeg - 1);
        const cauda = segs.slice(maxSeg - 1);
        cabeca.push({ rotulo: 'Outros', valor: cauda.reduce(function (a, b) { return a + b.valor; }, 0),
          cor: 'var(--tinta-3)', _agregado: cauda.length });
        segs = cabeca;
      }

      const total = segs.reduce(function (a, b) { return a + b.valor; }, 0);
      if (total <= 0) { return false; }

      const alt = o.altura || 220;
      /* Tanto a decisao de layout quanto a geometria saem da largura da RAIZ.
         Se qualquer uma delas usar a largura do plot, o desenho vira funcao do
         proprio resultado e o grafico oscila sem parar. */
      const lado = ctx.larguraMedida && ctx.larguraRaiz >= 420 && segs.length > 2;
      ctx.raiz.setAttribute('data-lado', lado ? 'lado' : 'coluna');
      const w = lado
        ? Math.min(alt, Math.max(150, ctx.larguraRaiz * 0.44))
        : Math.min(alt, ctx.larguraRaiz);
      const h = w;
      const sv = svgRaiz(ctx, w, h, o.titulo || 'Distribuição', 'Gráfico de rosca com ' + segs.length + ' segmentos.');

      const cx = w / 2, cy = h / 2;
      const esp = o.espessura || 26;
      const raio = Math.min(cx, cy) - 4;
      const rInt = Math.max(6, raio - esp);
      const fmt = o.formatar || function (v) { return fmtNum(v, 0); };
      const g = s('g', { class: 'pmo-cht-marcas' });

      // vao de 2px na superficie entre fatias: converte 2px de arco em angulo
      const vaoRad = segs.length > 1 ? Math.min(0.06, 2 / raio) : 0;
      let ang = -Math.PI / 2;

      segs.forEach(function (seg, i) {
        const frac = safeDiv(seg.valor, total);
        const varre = frac * Math.PI * 2;
        const a0 = ang + vaoRad / 2;
        const a1 = ang + varre - vaoRad / 2;
        ang += varre;
        if (a1 <= a0) { return; }
        const cor = seg.cor || cht.corSerie(i);
        const grande = (a1 - a0) > Math.PI ? 1 : 0;
        const p = 'M' + (cx + raio * Math.cos(a0)) + ' ' + (cy + raio * Math.sin(a0)) +
          'A' + raio + ' ' + raio + ' 0 ' + grande + ' 1 ' + (cx + raio * Math.cos(a1)) + ' ' + (cy + raio * Math.sin(a1)) +
          'L' + (cx + rInt * Math.cos(a1)) + ' ' + (cy + rInt * Math.sin(a1)) +
          'A' + rInt + ' ' + rInt + ' 0 ' + grande + ' 0 ' + (cx + rInt * Math.cos(a0)) + ' ' + (cy + rInt * Math.sin(a0)) + 'Z';

        const fatia = s('path', {
          d: p, fill: cor, tabindex: '0', role: 'listitem',
          class: o.onClick ? 'e-clicavel' : null,
          'aria-label': seg.rotulo + ': ' + fmt(seg.valor) + ' (' + fmtPct(frac * 100, 1) + ')'
        });
        ligarTip(fatia, seg.rotulo, [
          { rotulo: 'valor', valor: fmt(seg.valor), cor: cor, forma: 'quad', forte: true },
          { rotulo: 'participação', valor: fmtPct(frac * 100, 1), cor: cor, forma: 'quad' }
        ], seg._agregado ? seg._agregado + ' itens agregados' : null);
        if (o.onClick) {
          fatia.addEventListener('click', function () { o.onClick(seg); });
          fatia.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(seg); }
          });
        }
        g.appendChild(fatia);
      });
      sv.appendChild(g);

      const centro = (d && d.centro) || null;
      if (centro) {
        sv.appendChild(txt(cx, cy - 7, String(centro.valor), {
          'text-anchor': 'middle', 'font-size': Math.max(16, Math.round(w * 0.13)),
          'font-weight': 660, fill: 'var(--tinta-1)', class: 'e-figura'
        }));
        sv.appendChild(txt(cx, cy + 14, String(centro.rotulo), {
          'text-anchor': 'middle', 'font-size': 11, fill: 'var(--tinta-3)'
        }));
      }

      if (o.legenda !== false && segs.length >= 2) {
        cht.legenda(ctx.rodape, {
          coluna: lado,
          itens: segs.map(function (seg, i) {
            return { rotulo: seg.rotulo, cor: seg.cor || cht.corSerie(i), forma: 'quadrado',
              valor: fmt(seg.valor) };
          })
        });
      }
      detalheTabela(ctx, ['Categoria', 'Valor', 'Participação'],
        segs.map(function (seg) {
          return [seg.rotulo, fmt(seg.valor), fmtPct(safeDiv(seg.valor, total) * 100, 1)];
        }), o.titulo || 'Distribuição');
      return true;
    }, 'donut');
  };

  /* ============================================================= barras */

  cht.barras = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const cats = (d && d.categorias) || [];
      let series = (d && d.series) || [];
      if (!cats.length || !series.length) { return false; }

      if (series.length > cht.MAX_SERIES) {
        const cabeca = series.slice(0, cht.MAX_SERIES - 1);
        const cauda = series.slice(cht.MAX_SERIES - 1);
        cabeca.push({
          nome: 'Outros', cor: 'var(--tinta-3)',
          valores: cats.map(function (_, i) {
            return cauda.reduce(function (a, sr) { return a + (ehNum(sr.valores[i]) ? sr.valores[i] : 0); }, 0);
          })
        });
        series = cabeca;
      }

      const horiz = !!o.horizontal;
      const emp = !!o.empilhado;
      const norm = !!o.normalizado;
      const fmt = o.formatar || function (v) { return fmtNum(v, 0); };

      // dominio
      let vMin = 0, vMax = 0;
      if (emp) {
        cats.forEach(function (_, i) {
          let pos = 0, neg = 0;
          series.forEach(function (sr) {
            const v = ehNum(sr.valores[i]) ? sr.valores[i] : 0;
            if (v >= 0) { pos += v; } else { neg += v; }
          });
          vMax = Math.max(vMax, pos); vMin = Math.min(vMin, neg);
        });
      } else {
        series.forEach(function (sr) {
          (sr.valores || []).forEach(function (v) {
            if (!ehNum(v)) { return; }
            vMax = Math.max(vMax, v); vMin = Math.min(vMin, v);
          });
        });
      }
      if (norm) { vMin = 0; vMax = 100; }
      (o.referencias || []).forEach(function (rf) {
        if (ehNum(rf.valor)) { vMax = Math.max(vMax, rf.valor); vMin = Math.min(vMin, rf.valor); }
      });

      const esc = norm ? { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] } : ticksBonitos(vMin, vMax, 5);
      const alt = o.altura || 260;

      const rotMax = cats.reduce(function (a, c) { return Math.max(a, String(c).length); }, 0);
      const margE = horiz ? Math.min(170, Math.max(60, rotMax * 6.4)) : 56;
      const margB = horiz ? 26 : (rotMax > 8 ? 52 : 30);
      const margT = 10, margD = 12;

      const w = Math.max(220, ctx.largura);
      const h = alt;
      const pw = w - margE - margD;
      const ph = h - margT - margB;
      if (pw <= 10 || ph <= 10) { return false; }

      const sv = svgRaiz(ctx, w, h, o.titulo || 'Comparação',
        (emp ? 'Barras empilhadas' : 'Barras agrupadas') + ' com ' + series.length + ' série(s) e ' + cats.length + ' categoria(s).');

      function vx(v) { return margE + safeDiv(v - esc.min, esc.max - esc.min) * pw; }
      function vy(v) { return margT + ph - safeDiv(v - esc.min, esc.max - esc.min) * ph; }

      // grade + eixo de valor (hairline solido)
      esc.ticks.forEach(function (t) {
        if (horiz) {
          const x = vx(t);
          sv.appendChild(s('line', { x1: x, y1: margT, x2: x, y2: margT + ph, stroke: 'var(--grade)', 'stroke-width': 1 }));
          sv.appendChild(txt(x, margT + ph + 13, fmt(t), { 'text-anchor': 'middle', class: 'e-tab' }));
        } else {
          const y = vy(t);
          sv.appendChild(s('line', { x1: margE, y1: y, x2: margE + pw, y2: y, stroke: 'var(--grade)', 'stroke-width': 1 }));
          sv.appendChild(txt(margE - 7, y, fmt(t), { 'text-anchor': 'end', class: 'e-tab' }));
        }
      });
      const zero = ehNum(esc.min) && esc.min < 0 ? 0 : esc.min;
      if (horiz) {
        sv.appendChild(s('line', { x1: vx(zero), y1: margT, x2: vx(zero), y2: margT + ph, stroke: 'var(--eixo)', 'stroke-width': 1 }));
      } else {
        sv.appendChild(s('line', { x1: margE, y1: vy(zero), x2: margE + pw, y2: vy(zero), stroke: 'var(--eixo)', 'stroke-width': 1 }));
      }

      const banda = (horiz ? ph : pw) / cats.length;
      const usavel = banda * 0.72;
      const nSeries = emp ? 1 : series.length;
      const larg = Math.max(2, (usavel - (nSeries - 1) * 2) / nSeries);   // vao de 2px entre barras
      const g = s('g', { class: 'pmo-cht-marcas' });

      cats.forEach(function (cat, ci) {
        const inicioBanda = (horiz ? margT : margE) + ci * banda + (banda - usavel) / 2;
        let acumPos = zero, acumNeg = zero;
        let totalCat = 0;
        if (norm) {
          totalCat = series.reduce(function (a, sr) { return a + Math.abs(ehNum(sr.valores[ci]) ? sr.valores[ci] : 0); }, 0);
        }

        series.forEach(function (sr, si) {
          let v = ehNum(sr.valores[ci]) ? sr.valores[ci] : null;
          if (v === null) { return; }
          if (norm) { v = safeDiv(Math.abs(v), totalCat) * 100; }
          const cor = sr.cor || cht.corSerie(si);
          let x, y, bw, bh, orient;

          if (horiz) {
            const de = emp ? (v >= 0 ? acumPos : acumNeg) : zero;
            const ate = de + v;
            x = Math.min(vx(de), vx(ate));
            bw = Math.max(1, Math.abs(vx(ate) - vx(de)) - (emp ? 2 : 0));
            y = emp ? inicioBanda : inicioBanda + si * (larg + 2);
            bh = emp ? usavel : larg;
            orient = v >= 0 ? 'direita' : 'esquerda';
            if (emp) { if (v >= 0) { acumPos = ate; } else { acumNeg = ate; } }
          } else {
            const de = emp ? (v >= 0 ? acumPos : acumNeg) : zero;
            const ate = de + v;
            y = Math.min(vy(de), vy(ate));
            bh = Math.max(1, Math.abs(vy(ate) - vy(de)) - (emp ? 2 : 0));
            x = emp ? inicioBanda : inicioBanda + si * (larg + 2);
            bw = emp ? usavel : larg;
            orient = v >= 0 ? 'cima' : 'baixo';
            if (emp) { if (v >= 0) { acumPos = ate; } else { acumNeg = ate; } }
          }

          const marca = s('path', {
            d: caminhoBarra(x, y, bw, bh, 4, orient), fill: cor,
            tabindex: '0', class: o.onClick ? 'e-clicavel' : null,
            'aria-label': cat + ' — ' + sr.nome + ': ' + fmt(ehNum(sr.valores[ci]) ? sr.valores[ci] : 0)
          });
          ligarTip(marca, String(cat), series.map(function (s2, i2) {
            const v2 = ehNum(s2.valores[ci]) ? s2.valores[ci] : null;
            return { rotulo: s2.nome, valor: v2 === null ? '—' : fmt(v2),
              cor: s2.cor || cht.corSerie(i2), forma: 'quad', forte: i2 === si };
          }));
          if (o.onClick) {
            marca.addEventListener('click', function () { o.onClick({ categoria: cat, serie: sr, indice: ci }); });
            marca.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick({ categoria: cat, serie: sr, indice: ci }); }
            });
          }
          g.appendChild(marca);
        });

        // rotulo de categoria
        if (horiz) {
          sv.appendChild(txt(margE - 7, inicioBanda + usavel / 2, truncar(String(cat), Math.floor(margE / 6.2)),
            { 'text-anchor': 'end' }));
        } else {
          const cxx = inicioBanda + usavel / 2;
          const rot = truncar(String(cat), margB > 40 ? 16 : 10);
          const t = txt(cxx, margT + ph + 14, rot, { 'text-anchor': margB > 40 ? 'end' : 'middle' });
          if (margB > 40) { t.setAttribute('transform', 'rotate(-38 ' + cxx + ' ' + (margT + ph + 14) + ')'); }
          sv.appendChild(t);
        }
      });
      sv.appendChild(g);

      // linhas de referencia (limiar) — tracejado permitido: nao e grade
      (o.referencias || []).forEach(function (rf) {
        if (!ehNum(rf.valor)) { return; }
        const cor = rf.cor || 'var(--tinta-2)';
        if (horiz) {
          const x = vx(rf.valor);
          sv.appendChild(s('line', { x1: x, y1: margT, x2: x, y2: margT + ph, stroke: cor,
            'stroke-width': 2, 'stroke-dasharray': '5 4' }));
        } else {
          const y = vy(rf.valor);
          sv.appendChild(s('line', { x1: margE, y1: y, x2: margE + pw, y2: y, stroke: cor,
            'stroke-width': 2, 'stroke-dasharray': '5 4' }));
          sv.appendChild(txt(margE + pw - 3, y - 8, rf.rotulo || '', { 'text-anchor': 'end', fill: cor, 'font-weight': 600 }));
        }
      });

      if (series.length >= 2) {
        cht.legenda(ctx.rodape, {
          itens: series.map(function (sr, i) { return { rotulo: sr.nome, cor: sr.cor || cht.corSerie(i), forma: 'quadrado' }; })
        });
      }
      detalheTabela(ctx, ['Categoria'].concat(series.map(function (sr) { return sr.nome; })),
        cats.map(function (c, i) {
          return [c].concat(series.map(function (sr) {
            return ehNum(sr.valores[i]) ? fmt(sr.valores[i]) : '—';
          }));
        }), o.titulo || 'Dados do gráfico de barras');
      return true;
    }, 'barras');
  };

  /* ============================================================== linha */

  function desenharLinha(ctx, d, o, nomeAcess) {
    const rots = (d && d.rotulos) || [];
    const series = ((d && d.series) || []).filter(function (sr) { return sr && (sr.valores || []).length; });
    if (rots.length < 1 || !series.length) { return false; }

    const fmt = o.formatar || function (v) { return fmtNum(v, 0); };
    let vMin = Infinity, vMax = -Infinity;
    series.forEach(function (sr) {
      (sr.valores || []).forEach(function (v) {
        if (!ehNum(v)) { return; }
        if (v < vMin) { vMin = v; }
        if (v > vMax) { vMax = v; }
      });
    });
    (o.referencias || []).forEach(function (rf) {
      if (ehNum(rf.valor)) { vMin = Math.min(vMin, rf.valor); vMax = Math.max(vMax, rf.valor); }
    });
    if (!isFinite(vMin) || !isFinite(vMax)) { return false; }
    if (o.baseZero !== false && vMin > 0) { vMin = 0; }

    const esc = ticksBonitos(vMin, vMax, 5);
    const alt = o.altura || 260;
    const margE = 62, margD = 14, margT = 12;
    const margB = rots.length > 14 ? 44 : 30;
    const w = Math.max(240, ctx.largura);
    const h = alt;
    const pw = w - margE - margD;
    const ph = h - margT - margB;
    if (pw <= 10 || ph <= 10) { return false; }

    const sv = svgRaiz(ctx, w, h, o.titulo || nomeAcess,
      nomeAcess + ' com ' + series.length + ' série(s) ao longo de ' + rots.length + ' períodos.');

    const passoX = rots.length > 1 ? pw / (rots.length - 1) : 0;
    function px(i) { return margE + (rots.length > 1 ? i * passoX : pw / 2); }
    function py(v) { return margT + ph - safeDiv(v - esc.min, esc.max - esc.min) * ph; }

    esc.ticks.forEach(function (t) {
      const y = py(t);
      sv.appendChild(s('line', { x1: margE, y1: y, x2: margE + pw, y2: y, stroke: 'var(--grade)', 'stroke-width': 1 }));
      sv.appendChild(txt(margE - 7, y, fmt(t), { 'text-anchor': 'end', class: 'e-tab' }));
    });
    sv.appendChild(s('line', { x1: margE, y1: margT + ph, x2: margE + pw, y2: margT + ph, stroke: 'var(--eixo)', 'stroke-width': 1 }));

    const cadaN = Math.max(1, Math.ceil(rots.length / Math.max(3, Math.floor(pw / 58))));
    rots.forEach(function (r, i) {
      if (i % cadaN !== 0 && i !== rots.length - 1) { return; }
      const x = px(i);
      const t = txt(x, margT + ph + 14, String(r), { 'text-anchor': margB > 36 ? 'end' : 'middle' });
      if (margB > 36) { t.setAttribute('transform', 'rotate(-38 ' + x + ' ' + (margT + ph + 14) + ')'); }
      sv.appendChild(t);
    });

    const g = s('g', { class: 'pmo-cht-marcas' });

    // marco vertical (data de status / hoje)
    const marco = ehNum(o.marcoAtual) ? o.marcoAtual : (ehNum(d.idxDataDate) ? d.idxDataDate : null);
    if (marco !== null && marco >= 0 && marco < rots.length) {
      const x = px(marco);
      g.appendChild(s('line', { x1: x, y1: margT, x2: x, y2: margT + ph,
        stroke: 'var(--st-critico)', 'stroke-width': 2, opacity: 0.5 }));
      g.appendChild(txt(x, margT + 6, o.marcoRotulo || 'hoje', {
        'text-anchor': 'middle', fill: 'var(--st-critico)', 'font-weight': 700, 'font-size': 10
      }));
    }

    series.forEach(function (sr, si) {
      const cor = sr.cor || cht.corSerie(si);
      const pts = [];
      (sr.valores || []).forEach(function (v, i) {
        if (ehNum(v) && i < rots.length) { pts.push({ i: i, v: v, x: px(i), y: py(v) }); }
      });
      if (!pts.length) { return; }

      // segmentos: solido antes do marco, tracejado depois (previsao)
      const corteIdx = sr.tracejada ? -1 : (marco !== null ? marco : Infinity);
      function poli(lista) { return lista.map(function (p) { return p.x + ',' + p.y; }).join(' '); }
      const solidos = sr.tracejada ? [] : pts.filter(function (p) { return p.i <= corteIdx; });
      const futuros = sr.tracejada ? pts : pts.filter(function (p) { return p.i >= corteIdx; });

      if (o.area && solidos.length > 1) {
        g.appendChild(s('polygon', {
          points: poli(solidos) + ' ' + solidos[solidos.length - 1].x + ',' + py(esc.min) + ' ' + solidos[0].x + ',' + py(esc.min),
          fill: cor, opacity: 0.13
        }));
      }
      if (solidos.length > 1) {
        g.appendChild(s('polyline', { points: poli(solidos), fill: 'none', stroke: cor,
          'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      }
      if (futuros.length > 1) {
        g.appendChild(s('polyline', { points: poli(futuros), fill: 'none', stroke: cor,
          'stroke-width': 2, 'stroke-dasharray': '5 4', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      }
      if (solidos.length === 1 && futuros.length <= 1) {
        g.appendChild(s('circle', { cx: pts[0].x, cy: pts[0].y, r: 4, fill: cor }));
      }

      // rotulo direto seletivo: ultimo ponto
      if (o.rotuloDireto !== 'nenhum' && series.length <= 4 && pts.length) {
        const ult = pts[pts.length - 1];
        g.appendChild(txt(Math.min(w - 4, ult.x + 6), ult.y, fmt(ult.v), {
          'text-anchor': ult.x + 6 > w - 40 ? 'end' : 'start',
          fill: 'var(--tinta-2)', 'font-weight': 650, class: 'e-tab'
        }));
      }
    });

    // camada de crosshair + tooltip por indice (area de acerto >= 24px)
    const larguraAcerto = Math.max(24, passoX || pw);
    const crosshair = s('line', { x1: 0, y1: margT, x2: 0, y2: margT + ph,
      stroke: 'var(--tinta-3)', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
    g.appendChild(crosshair);

    rots.forEach(function (r, i) {
      const x = px(i);
      const zona = s('rect', {
        class: 'e-acerto', x: Math.max(margE, x - larguraAcerto / 2), y: margT,
        width: Math.min(larguraAcerto, pw), height: ph, tabindex: '0',
        'aria-label': String(r) + ': ' + series.map(function (sr) {
          const v = sr.valores[i];
          return sr.nome + ' ' + (ehNum(v) ? fmt(v) : 'sem dado');
        }).join('; ')
      });
      const linhasTip = series.map(function (sr, si) {
        const v = sr.valores[i];
        return { rotulo: sr.nome, valor: ehNum(v) ? fmt(v) : '—',
          cor: sr.cor || cht.corSerie(si), forma: sr.tracejada ? 'trac' : 'linha' };
      });
      const nota = (marco !== null && i > marco) ? 'período futuro — valores previstos' : null;
      function entrar(e) {
        crosshair.setAttribute('x1', x); crosshair.setAttribute('x2', x);
        crosshair.setAttribute('opacity', '0.7');
        mostrarTip(e, String(r), linhasTip, nota);
      }
      zona.addEventListener('mouseenter', entrar);
      zona.addEventListener('mousemove', function (e) { entrar(e); });
      zona.addEventListener('focus', function () { entrar({ target: zona }); });
      zona.addEventListener('mouseleave', function () { crosshair.setAttribute('opacity', '0'); esconderTip(); });
      zona.addEventListener('blur', function () { crosshair.setAttribute('opacity', '0'); esconderTip(); });
      g.appendChild(zona);
    });

    (o.referencias || []).forEach(function (rf) {
      if (!ehNum(rf.valor)) { return; }
      const y = py(rf.valor);
      const cor = rf.cor || 'var(--tinta-2)';
      g.appendChild(s('line', { x1: margE, y1: y, x2: margE + pw, y2: y, stroke: cor,
        'stroke-width': 2, 'stroke-dasharray': '5 4' }));
      if (rf.rotulo) {
        g.appendChild(txt(margE + pw - 3, y - 8, rf.rotulo, { 'text-anchor': 'end', fill: cor, 'font-weight': 600 }));
      }
    });

    sv.appendChild(g);

    if (series.length >= 2) {
      cht.legenda(ctx.rodape, {
        itens: series.map(function (sr, i) {
          return { rotulo: sr.nome + (sr.legendaTracejada ? ' (' + sr.legendaTracejada + ')' : ''),
            cor: sr.cor || cht.corSerie(i), forma: sr.tracejada ? 'tracejada' : 'linha' };
        }).concat(marco !== null ? [{ rotulo: 'após a data de status: previsão', cor: 'var(--tinta-3)', forma: 'tracejada' }] : [])
      });
    }
    detalheTabela(ctx, ['Período'].concat(series.map(function (sr) { return sr.nome; })),
      rots.map(function (r, i) {
        return [r].concat(series.map(function (sr) { return ehNum(sr.valores[i]) ? fmt(sr.valores[i]) : '—'; }));
      }), o.titulo || nomeAcess);
    return true;
  }

  cht.linha = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      return desenharLinha(ctx, d, o, 'Série temporal');
    }, 'linha');
  };

  cht.area = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      return desenharLinha(ctx, d, Object.assign({ area: true }, o), 'Série temporal');
    }, 'area');
  };

  /** Curva S de EVM: PV / EV / AC — todos em moeda, portanto UM eixo. */
  cht.curvaS = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const periodos = (d && d.periodos) || [];
      if (!periodos.length) { return false; }
      const acum = o.acumulado !== false;
      function serie(chave) {
        const bruto = (d && d[chave]) || [];
        if (!acum) { return bruto.slice(); }
        let a = 0;
        return bruto.map(function (v) {
          if (!ehNum(v)) { return null; }
          a += v; return a;
        });
      }
      const dd = ehNum(d.idxDataDate) ? d.idxDataDate : periodos.length - 1;
      const series = [
        { nome: 'Valor planejado (PV)', valores: serie('pv'), cor: 'var(--serie-1)' },
        { nome: 'Valor agregado (EV)', valores: serie('ev'), cor: 'var(--serie-3)' },
        { nome: 'Custo real (AC)', valores: serie('ac'), cor: 'var(--serie-2)' }
      ].filter(function (sr) { return (sr.valores || []).some(ehNum); });
      if (!series.length) { return false; }

      return desenharLinha(ctx, { rotulos: periodos, series: series, idxDataDate: dd },
        Object.assign({
          formatar: function (v) { return fmtMoney(v, { compact: true }); },
          altura: o.altura || 280, marcoRotulo: 'data de status'
        }, o, { area: false }), 'Curva S de EVM');
    }, 'curvaS');
  };

  /* ============================================================= bubble */

  cht.bubble = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const pts = ((d && d.pontos) || []).filter(function (p) { return ehNum(p.x) && ehNum(p.y); });
      if (!pts.length) { return false; }

      // teto de 3 slots categoricos em forma de todos-os-pares
      const grupos = [];
      pts.forEach(function (p) { if (p.grupo && grupos.indexOf(p.grupo) < 0) { grupos.push(p.grupo); } });
      const gruposUsados = grupos.slice(0, cht.MAX_SERIES_TODOS_PARES);
      function corDe(p, i) {
        if (p.cor) { return p.cor; }
        if (!p.grupo) { return cht.corSerie(0); }
        const gi = gruposUsados.indexOf(p.grupo);
        return gi >= 0 ? cht.corSerie(gi) : 'var(--tinta-3)';
      }

      const fx = o.formatarX || function (v) { return fmtNum(v, 0); };
      const fy = o.formatarY || function (v) { return fmtNum(v, 0); };
      const fr = o.formatarR || function (v) { return fmtNum(v, 0); };

      const xs = pts.map(function (p) { return p.x; });
      const ys = pts.map(function (p) { return p.y; });
      const escX = ticksBonitos(Math.min.apply(null, xs), Math.max.apply(null, xs), 5);
      const escY = ticksBonitos(Math.min.apply(null, ys), Math.max.apply(null, ys), 5);
      const rMax = pts.reduce(function (a, p) { return Math.max(a, ehNum(p.r) ? p.r : 0); }, 0) || 1;

      const alt = o.altura || 320;
      const margE = 60, margD = 18, margT = 18, margB = 44;
      const w = Math.max(260, ctx.largura), h = alt;
      const pw = w - margE - margD, ph = h - margT - margB;
      if (pw <= 20 || ph <= 20) { return false; }

      const sv = svgRaiz(ctx, w, h, o.titulo || 'Dispersão',
        'Gráfico de bolhas com ' + pts.length + ' itens.');

      function px(v) { return margE + safeDiv(v - escX.min, escX.max - escX.min) * pw; }
      function py(v) { return margT + ph - safeDiv(v - escY.min, escY.max - escY.min) * ph; }

      escY.ticks.forEach(function (t) {
        const y = py(t);
        sv.appendChild(s('line', { x1: margE, y1: y, x2: margE + pw, y2: y, stroke: 'var(--grade)', 'stroke-width': 1 }));
        sv.appendChild(txt(margE - 7, y, fy(t), { 'text-anchor': 'end', class: 'e-tab' }));
      });
      escX.ticks.forEach(function (t) {
        const x = px(t);
        sv.appendChild(s('line', { x1: x, y1: margT, x2: x, y2: margT + ph, stroke: 'var(--grade)', 'stroke-width': 1 }));
        sv.appendChild(txt(x, margT + ph + 14, fx(t), { 'text-anchor': 'middle', class: 'e-tab' }));
      });
      sv.appendChild(s('line', { x1: margE, y1: margT + ph, x2: margE + pw, y2: margT + ph, stroke: 'var(--eixo)', 'stroke-width': 1 }));
      sv.appendChild(s('line', { x1: margE, y1: margT, x2: margE, y2: margT + ph, stroke: 'var(--eixo)', 'stroke-width': 1 }));

      if (o.xRotulo) {
        sv.appendChild(txt(margE + pw / 2, h - 6, o.xRotulo, { 'text-anchor': 'middle', fill: 'var(--tinta-2)', 'font-weight': 600 }));
      }
      if (o.yRotulo) {
        const t = txt(0, 0, o.yRotulo, { 'text-anchor': 'middle', fill: 'var(--tinta-2)', 'font-weight': 600 });
        t.setAttribute('transform', 'translate(13,' + (margT + ph / 2) + ') rotate(-90)');
        sv.appendChild(t);
      }

      // quadrantes
      if (o.quadrantes) {
        const q = o.quadrantes;
        const xm = ehNum(q.xMeio) ? px(q.xMeio) : px((escX.min + escX.max) / 2);
        const ym = ehNum(q.yMeio) ? py(q.yMeio) : py((escY.min + escY.max) / 2);
        sv.appendChild(s('line', { x1: xm, y1: margT, x2: xm, y2: margT + ph, stroke: 'var(--eixo)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
        sv.appendChild(s('line', { x1: margE, y1: ym, x2: margE + pw, y2: ym, stroke: 'var(--eixo)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
        const rots = q.rotulos || [];
        const posQ = [
          [margE + 6, margT + 12, 'start'], [margE + pw - 6, margT + 12, 'end'],
          [margE + 6, margT + ph - 6, 'start'], [margE + pw - 6, margT + ph - 6, 'end']
        ];
        rots.forEach(function (r, i) {
          if (!r || !posQ[i]) { return; }
          sv.appendChild(txt(posQ[i][0], posQ[i][1], r, {
            'text-anchor': posQ[i][2], fill: 'var(--tinta-3)', 'font-size': 10, 'font-weight': 700
          }));
        });
      }

      const g = s('g', { class: 'pmo-cht-marcas' });
      const ordenados = pts.slice().sort(function (a, b) { return (b.r || 0) - (a.r || 0); });
      ordenados.forEach(function (p, i) {
        const raio = 5 + Math.sqrt(safeDiv(ehNum(p.r) ? p.r : 0, rMax)) * 20;
        const cor = corDe(p, i);
        const cxx = px(p.x), cyy = py(p.y);
        // anel de 2px na cor da superficie em marcas sobrepostas
        g.appendChild(s('circle', { cx: cxx, cy: cyy, r: raio, fill: cor, opacity: 0.72,
          stroke: 'var(--sup-1)', 'stroke-width': 2 }));
        const acerto = s('circle', {
          cx: cxx, cy: cyy, r: Math.max(12, raio), class: 'e-acerto' + (o.onClick ? ' e-clicavel' : ''),
          tabindex: '0',
          'aria-label': p.rotulo + ': ' + (o.xRotulo || 'x') + ' ' + fx(p.x) + ', ' +
            (o.yRotulo || 'y') + ' ' + fy(p.y) + (ehNum(p.r) ? ', ' + fr(p.r) : '')
        });
        ligarTip(acerto, p.rotulo, [
          { rotulo: o.xRotulo || 'x', valor: fx(p.x), cor: cor, forma: 'ponto' },
          { rotulo: o.yRotulo || 'y', valor: fy(p.y), cor: cor, forma: 'ponto' }
        ].concat(ehNum(p.r) ? [{ rotulo: o.rRotulo || 'tamanho', valor: fr(p.r), cor: cor, forma: 'ponto' }] : []),
          p.grupo && gruposUsados.indexOf(p.grupo) < 0 ? 'grupo agregado em "Outros"' : (p.grupo || null));
        if (o.onClick) {
          acerto.addEventListener('click', function () { o.onClick(p); });
          acerto.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(p); }
          });
        }
        g.appendChild(acerto);
      });
      sv.appendChild(g);

      if (gruposUsados.length >= 2) {
        cht.legenda(ctx.rodape, {
          itens: gruposUsados.map(function (gr, i) { return { rotulo: gr, cor: cht.corSerie(i), forma: 'ponto' }; })
            .concat(grupos.length > gruposUsados.length
              ? [{ rotulo: 'Outros (' + (grupos.length - gruposUsados.length) + ')', cor: 'var(--tinta-3)', forma: 'ponto' }] : [])
        });
      }
      detalheTabela(ctx, ['Item', o.xRotulo || 'X', o.yRotulo || 'Y', o.rRotulo || 'Tamanho'],
        pts.map(function (p) { return [p.rotulo, fx(p.x), fy(p.y), ehNum(p.r) ? fr(p.r) : '—']; }),
        o.titulo || 'Dados do gráfico de bolhas');
      return true;
    }, 'bubble');
  };

  /* ============================================================ heatmap */

  cht.heatmap = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const linhas = (d && d.linhas) || [];
      const colunas = (d && d.colunas) || [];
      const celulas = (d && d.celulas) || [];
      if (!linhas.length || !colunas.length) { return false; }

      const fmt = o.formatar || function (v) { return fmtNum(v, 0); };
      const vals = celulas.map(function (c) { return c.valor; }).filter(ehNum);
      const vMin = vals.length ? Math.min.apply(null, vals) : 0;
      const vMax = vals.length ? Math.max.apply(null, vals) : 1;
      const div = o.escala === 'divergente';
      const absMax = Math.max(Math.abs(vMin), Math.abs(vMax)) || 1;

      const margE = Math.min(190, Math.max(70, linhas.reduce(function (a, l) {
        return Math.max(a, String(l).length); }, 0) * 6.4));
      const margT = 34, margD = 8, margB = 8;
      const w = Math.max(260, ctx.largura);
      const cw = Math.max(24, (w - margE - margD) / colunas.length);
      const ch2 = o.alturaCelula || 26;
      const h = margT + linhas.length * ch2 + margB;

      const sv = svgRaiz(ctx, w, h, o.titulo || 'Mapa de calor',
        'Mapa de calor de ' + linhas.length + ' linhas por ' + colunas.length + ' colunas.');

      colunas.forEach(function (c, ci) {
        const x = margE + ci * cw + cw / 2;
        const t = txt(x, margT - 10, truncar(String(c), 9), { 'text-anchor': cw < 46 ? 'end' : 'middle', 'font-size': 10 });
        if (cw < 46) { t.setAttribute('transform', 'rotate(-42 ' + x + ' ' + (margT - 10) + ')'); }
        sv.appendChild(t);
      });

      const idx = {};
      celulas.forEach(function (c) { idx[c.l + ':' + c.c] = c; });
      const g = s('g', { class: 'pmo-cht-marcas' });

      linhas.forEach(function (l, li) {
        sv.appendChild(txt(margE - 7, margT + li * ch2 + ch2 / 2, truncar(String(l), Math.floor(margE / 6.2)),
          { 'text-anchor': 'end' }));
        colunas.forEach(function (c, ci) {
          const cel = idx[li + ':' + ci];
          const temValor = cel && ehNum(cel.valor);
          const t = temValor
            ? (div ? safeDiv(cel.valor, absMax) : safeDiv(cel.valor - vMin, vMax - vMin))
            : 0;
          const cor = !temValor ? 'var(--sup-2)' : (div ? cht.escalaDiv(t) : cht.escalaSeq(t));
          const rect = s('rect', {
            x: margE + ci * cw + 1, y: margT + li * ch2 + 1,
            width: Math.max(1, cw - 2), height: Math.max(1, ch2 - 2), rx: 3,
            fill: cor, tabindex: '0', class: o.onClick ? 'e-clicavel' : null,
            'aria-label': l + ' / ' + c + ': ' + (temValor ? fmt(cel.valor) : 'sem dado')
          });
          ligarTip(rect, String(l) + ' · ' + String(c), [
            { rotulo: cel && cel.rotulo ? cel.rotulo : 'valor',
              valor: temValor ? fmt(cel.valor) : 'sem dado', cor: cor, forma: 'quad', forte: true }
          ]);
          if (o.onClick && cel) {
            rect.addEventListener('click', function () { o.onClick(cel); });
            rect.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(cel); }
            });
          }
          g.appendChild(rect);
          // valor escrito na celula quando couber: nunca so cor
          if (temValor && cw >= 44 && ch2 >= 22) {
            g.appendChild(txt(margE + ci * cw + cw / 2, margT + li * ch2 + ch2 / 2,
              truncar(fmt(cel.valor), Math.floor(cw / 7)), {
                'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600,
                fill: 'var(--tinta-1)', class: 'e-tab', 'pointer-events': 'none'
              }));
          }
        });
      });
      sv.appendChild(g);

      legendaEscala(ctx.rodape, {
        escala: div ? 'divergente' : 'sequencial',
        titulo: o.tituloEscala || 'Escala',
        minRotulo: o.minRotulo || fmt(div ? -absMax : vMin),
        maxRotulo: o.maxRotulo || fmt(div ? absMax : vMax)
      });
      detalheTabela(ctx, [''].concat(colunas.map(String)),
        linhas.map(function (l, li) {
          return [l].concat(colunas.map(function (_, ci) {
            const cel = idx[li + ':' + ci];
            return cel && ehNum(cel.valor) ? fmt(cel.valor) : '—';
          }));
        }), o.titulo || 'Dados do mapa de calor');
      return true;
    }, 'heatmap');
  };

  /* ========================================================== matriz 5x5 */

  cht.matriz5x5 = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const celulas = (d && d.celulas) || [];
      const rotProb = o.rotulosProb || ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'];
      const rotImp = o.rotulosImpacto || ['Insignificante', 'Menor', 'Moderado', 'Maior', 'Severo'];

      const mapa = {};
      celulas.forEach(function (c) { mapa[c.prob + ':' + c.impacto] = c; });

      const margE = 96, margT = 12, margB = 52, margD = 10;
      const w = Math.max(280, ctx.largura);
      const cw = Math.max(40, (w - margE - margD) / 5);
      const chh = Math.max(40, Math.min(58, (o.altura || 340) - margT - margB) / 5);
      const h = margT + chh * 5 + margB;

      const sv = svgRaiz(ctx, w, h, 'Matriz de risco 5 por 5',
        'Matriz de probabilidade por impacto. Cada célula mostra a quantidade de riscos.');

      const g = s('g', { class: 'pmo-cht-marcas' });
      let totalItens = 0;

      for (let pi = 5; pi >= 1; pi--) {
        const li = 5 - pi;
        sv.appendChild(txt(margE - 8, margT + li * chh + chh / 2, rotProb[pi - 1],
          { 'text-anchor': 'end', 'font-size': 10 }));
        for (let ii = 1; ii <= 5; ii++) {
          const cel = mapa[pi + ':' + ii];
          const itens = (cel && cel.itens) || [];
          totalItens += itens.length;
          const score = pi * ii;
          const x = margE + (ii - 1) * cw;
          const y = margT + li * chh;
          const cor = cht.escalaRisco(score);
          const rect = s('rect', {
            x: x + 1.5, y: y + 1.5, width: cw - 3, height: chh - 3, rx: 4,
            fill: cor, stroke: 'var(--sup-1)', 'stroke-width': 2,
            tabindex: '0', class: itens.length && o.onClick ? 'e-clicavel' : null,
            'aria-label': 'Probabilidade ' + rotProb[pi - 1] + ', impacto ' + rotImp[ii - 1] +
              ', score ' + score + ': ' + itens.length + ' risco(s)'
          });
          ligarTip(rect, rotProb[pi - 1] + ' × ' + rotImp[ii - 1], [
            { rotulo: 'score', valor: String(score), cor: cor, forma: 'quad', forte: true },
            { rotulo: 'riscos', valor: String(itens.length), cor: cor, forma: 'quad' }
          ], itens.length ? itens.slice(0, 4).map(function (x2) { return '• ' + truncar(x2.rotulo, 44); }).join('\n') : null);
          if (o.onClick && itens.length) {
            rect.addEventListener('click', function () { o.onClick(cel); });
            rect.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(cel); }
            });
          }
          g.appendChild(rect);
          // quantidade escrita: a matriz nunca comunica so por cor
          g.appendChild(txt(x + cw / 2, y + chh / 2 - 4, itens.length ? String(itens.length) : '·', {
            'text-anchor': 'middle', 'font-size': itens.length ? 15 : 12, 'font-weight': 700,
            fill: 'var(--tinta-1)', 'pointer-events': 'none', class: 'e-tab'
          }));
          g.appendChild(txt(x + cw / 2, y + chh / 2 + 11, String(score), {
            'text-anchor': 'middle', 'font-size': 9, fill: 'var(--tinta-2)',
            'pointer-events': 'none', opacity: 0.8
          }));
        }
      }
      sv.appendChild(g);

      rotImp.forEach(function (r, i) {
        const x = margE + i * cw + cw / 2;
        const t = txt(x, margT + chh * 5 + 14, r, { 'text-anchor': cw < 74 ? 'end' : 'middle', 'font-size': 10 });
        if (cw < 74) { t.setAttribute('transform', 'rotate(-32 ' + x + ' ' + (margT + chh * 5 + 14) + ')'); }
        sv.appendChild(t);
      });
      sv.appendChild(txt(margE + cw * 2.5, h - 6, 'Impacto', { 'text-anchor': 'middle', fill: 'var(--tinta-2)', 'font-weight': 600 }));
      const ty = txt(0, 0, 'Probabilidade', { 'text-anchor': 'middle', fill: 'var(--tinta-2)', 'font-weight': 600 });
      ty.setAttribute('transform', 'translate(11,' + (margT + chh * 2.5) + ') rotate(-90)');
      sv.appendChild(ty);

      // legenda de escala (calor semantico exige legenda explicita)
      const barra = el('div', { class: 'pmo-cht-esc-barra' });
      [['Baixo', 'var(--rag-verde-bg)'], ['Moderado', cht.corStatus('aviso')],
        ['Alto', cht.corStatus('serio')], ['Crítico', cht.corStatus('critico')]].forEach(function (p) {
        barra.appendChild(el('span', { style: { background: p[1] }, attrs: { title: p[0] } }));
      });
      ctx.rodape.appendChild(el('div', { class: 'pmo-cht-esc' }, [
        el('span', { class: 'pmo-cht-esc-tit', text: 'Nível de risco (probabilidade × impacto)' }),
        el('span', { class: 'pmo-cht-esc-lim', text: 'baixo' }), barra,
        el('span', { class: 'pmo-cht-esc-lim', text: 'crítico' }),
        el('span', { class: 'pmo-cht-esc-lim', text: '· ' + totalItens + ' risco(s)' })
      ]));

      const linhasTab = [];
      for (let pi = 5; pi >= 1; pi--) {
        const row = [rotProb[pi - 1]];
        for (let ii = 1; ii <= 5; ii++) {
          const cel = mapa[pi + ':' + ii];
          row.push(String(((cel && cel.itens) || []).length));
        }
        linhasTab.push(row);
      }
      detalheTabela(ctx, ['Probabilidade \\ Impacto'].concat(rotImp), linhasTab,
        'Quantidade de riscos por célula da matriz');
      return true;
    }, 'matriz5x5');
  };

  /* ============================================================== funil */

  cht.funil = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const etapas = ((d && d.etapas) || []).filter(function (e) { return ehNum(e.valor); });
      if (!etapas.length) { return false; }
      const fmt = o.formatar || function (v) { return fmtNum(v, 0); };
      const maxV = etapas.reduce(function (a, e) { return Math.max(a, e.valor); }, 0) || 1;

      const margE = Math.min(200, Math.max(84, etapas.reduce(function (a, e) {
        return Math.max(a, String(e.rotulo).length); }, 0) * 6.2));
      const margD = 74, margT = 8, margB = 8;
      const alturaEtapa = Math.max(26, Math.min(44, ((o.altura || 260) - margT - margB) / etapas.length));
      const w = Math.max(260, ctx.largura);
      const h = margT + etapas.length * alturaEtapa + margB;
      const pw = w - margE - margD;

      const sv = svgRaiz(ctx, w, h, o.titulo || 'Funil',
        'Funil com ' + etapas.length + ' etapas ordenadas.');
      const g = s('g', { class: 'pmo-cht-marcas' });

      etapas.forEach(function (e, i) {
        const y = margT + i * alturaEtapa;
        const bw = Math.max(2, safeDiv(e.valor, maxV) * pw);
        // rampa ORDINAL (etapas sao ordenadas): respeita o piso de contraste
        const cor = cht.escalaSeq(safeDiv(i, Math.max(1, etapas.length - 1)), true);
        const rect = s('path', {
          d: caminhoBarra(margE, y + 2, bw, alturaEtapa - 4, 4, 'direita'),
          fill: cor, tabindex: '0', class: o.onClick ? 'e-clicavel' : null,
          'aria-label': e.rotulo + ': ' + fmt(e.valor)
        });
        const conv = i === 0 ? null : fmtPct(safeDiv(e.valor, etapas[i - 1].valor) * 100, 0);
        ligarTip(rect, e.rotulo, [
          { rotulo: 'quantidade', valor: fmt(e.valor), cor: cor, forma: 'quad', forte: true }
        ].concat(conv ? [{ rotulo: 'conversão da etapa anterior', valor: conv, cor: cor, forma: 'quad' }] : []));
        if (o.onClick) {
          rect.addEventListener('click', function () { o.onClick(e); });
          rect.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); o.onClick(e); }
          });
        }
        g.appendChild(rect);
        sv.appendChild(txt(margE - 7, y + alturaEtapa / 2, truncar(String(e.rotulo), Math.floor(margE / 6)),
          { 'text-anchor': 'end' }));
        // rotulo fora da ponta da barra: nunca cortado
        g.appendChild(txt(margE + bw + 6, y + alturaEtapa / 2, fmt(e.valor), {
          'text-anchor': 'start', fill: 'var(--tinta-1)', 'font-weight': 650, class: 'e-tab'
        }));
      });
      sv.appendChild(g);

      detalheTabela(ctx, ['Etapa', 'Quantidade', 'Conversão'],
        etapas.map(function (e, i) {
          return [e.rotulo, fmt(e.valor), i === 0 ? '—' : fmtPct(safeDiv(e.valor, etapas[i - 1].valor) * 100, 0)];
        }), o.titulo || 'Dados do funil');
      return true;
    }, 'funil');
  };

  /* ========================================================== waterfall */

  cht.waterfall = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const itens = ((d && d.itens) || []).filter(function (i) { return ehNum(i.valor); });
      if (!itens.length) { return false; }
      const fmt = o.formatar || function (v) { return fmtMoney(v, { compact: true }); };

      const calc = [];
      let acum = 0;
      itens.forEach(function (it) {
        if (it.tipo === 'inicio') { calc.push({ it: it, de: 0, ate: it.valor }); acum = it.valor; }
        else if (it.tipo === 'fim') { calc.push({ it: it, de: 0, ate: it.valor }); acum = it.valor; }
        else { calc.push({ it: it, de: acum, ate: acum + it.valor }); acum += it.valor; }
      });

      let vMin = 0, vMax = 0;
      calc.forEach(function (c) {
        vMin = Math.min(vMin, c.de, c.ate); vMax = Math.max(vMax, c.de, c.ate);
      });
      const esc = ticksBonitos(vMin, vMax, 5);

      const alt = o.altura || 280;
      const margE = 66, margD = 12, margT = 14;
      const rotMax = itens.reduce(function (a, i) { return Math.max(a, String(i.rotulo).length); }, 0);
      const margB = rotMax > 8 ? 56 : 30;
      const w = Math.max(260, ctx.largura), h = alt;
      const pw = w - margE - margD, ph = h - margT - margB;
      if (pw <= 20 || ph <= 20) { return false; }

      const sv = svgRaiz(ctx, w, h, o.titulo || 'Composição da variação',
        'Gráfico cascata com ' + itens.length + ' componentes.');
      function py(v) { return margT + ph - safeDiv(v - esc.min, esc.max - esc.min) * ph; }

      esc.ticks.forEach(function (t) {
        const y = py(t);
        sv.appendChild(s('line', { x1: margE, y1: y, x2: margE + pw, y2: y, stroke: 'var(--grade)', 'stroke-width': 1 }));
        sv.appendChild(txt(margE - 7, y, fmt(t), { 'text-anchor': 'end', class: 'e-tab' }));
      });
      sv.appendChild(s('line', { x1: margE, y1: py(0), x2: margE + pw, y2: py(0), stroke: 'var(--eixo)', 'stroke-width': 1 }));

      const banda = pw / calc.length;
      const bw = Math.max(3, banda * 0.62);
      const g = s('g', { class: 'pmo-cht-marcas' });

      calc.forEach(function (c, i) {
        const x = margE + i * banda + (banda - bw) / 2;
        const y0 = py(c.de), y1 = py(c.ate);
        const y = Math.min(y0, y1);
        const bh = Math.max(2, Math.abs(y1 - y0));
        const neutro = c.it.tipo === 'inicio' || c.it.tipo === 'fim';
        // deltas usam o divergente; inicio/fim ficam neutros
        const cor = neutro ? 'var(--tinta-3)'
          : (c.it.valor >= 0 ? 'var(--div-quente)' : 'var(--div-frio)');
        const marca = s('path', {
          d: caminhoBarra(x, y, bw, bh, 4, neutro ? 'cima' : (c.it.valor >= 0 ? 'cima' : 'baixo')),
          fill: cor, tabindex: '0',
          'aria-label': c.it.rotulo + ': ' + fmt(c.it.valor) + ' (acumulado ' + fmt(c.ate) + ')'
        });
        ligarTip(marca, c.it.rotulo, [
          { rotulo: neutro ? 'valor' : 'variação', valor: fmt(c.it.valor), cor: cor, forma: 'quad', forte: true },
          { rotulo: 'acumulado', valor: fmt(c.ate), cor: 'var(--tinta-3)', forma: 'quad' }
        ]);
        g.appendChild(marca);

        // conector
        if (i < calc.length - 1 && !neutro) {
          g.appendChild(s('line', {
            x1: x + bw, y1: py(c.ate), x2: margE + (i + 1) * banda + (banda - bw) / 2, y2: py(c.ate),
            stroke: 'var(--eixo)', 'stroke-width': 1
          }));
        }
        const cxx = margE + i * banda + banda / 2;
        const t = txt(cxx, margT + ph + 14, truncar(String(c.it.rotulo), margB > 40 ? 18 : 9),
          { 'text-anchor': margB > 40 ? 'end' : 'middle' });
        if (margB > 40) { t.setAttribute('transform', 'rotate(-38 ' + cxx + ' ' + (margT + ph + 14) + ')'); }
        sv.appendChild(t);
      });
      sv.appendChild(g);

      cht.legenda(ctx.rodape, {
        itens: [
          { rotulo: 'Aumento', cor: 'var(--div-quente)', forma: 'quadrado' },
          { rotulo: 'Redução', cor: 'var(--div-frio)', forma: 'quadrado' },
          { rotulo: 'Total', cor: 'var(--tinta-3)', forma: 'quadrado' }
        ]
      });
      detalheTabela(ctx, ['Componente', 'Variação', 'Acumulado'],
        calc.map(function (c) { return [c.it.rotulo, fmt(c.it.valor), fmt(c.ate)]; }),
        o.titulo || 'Dados da cascata');
      return true;
    }, 'waterfall');
  };

  /* ============================================================== gauge */

  cht.gauge = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const v = d ? d.valor : null;
      const min = ehNum(d && d.min) ? d.min : 0;
      const max = ehNum(d && d.max) ? d.max : 2;
      const alvo = ehNum(d && d.alvo) ? d.alvo : 1;
      const fmt = o.formatar || function (x) { return U.fmtRazao ? U.fmtRazao(x, 2) : fmtNum(x, 2); };

      const faixas = o.faixas || [
        { ate: 0.90, token: 'critico' }, { ate: 0.98, token: 'aviso' }, { ate: Infinity, token: 'bom' }
      ];
      function tokenDe(x) {
        for (let i = 0; i < faixas.length; i++) { if (x < faixas[i].ate) { return faixas[i].token; } }
        return faixas[faixas.length - 1].token;
      }

      const alt = o.altura || 160;
      const w = Math.max(160, Math.min(ctx.largura, 300));
      const h = alt;
      const sv = svgRaiz(ctx, w, h, (d && d.rotulo) || 'Indicador',
        'Medidor de ' + ((d && d.rotulo) || 'indicador') + '.');

      const cx = w / 2, cy = h * 0.72, raio = Math.min(cx - 12, cy - 12);
      const a0 = Math.PI, a1 = 0;
      function ang(x) { return a0 + safeDiv(clamp(x, min, max) - min, max - min) * (a1 - a0); }
      function arco(de, ate, r, cor, esp) {
        const A0 = ang(de), A1 = ang(ate);
        if (A1 === A0) { return null; }
        const grande = Math.abs(A1 - A0) > Math.PI ? 1 : 0;
        return s('path', {
          d: 'M' + (cx + r * Math.cos(A0)) + ' ' + (cy + r * Math.sin(A0)) +
            'A' + r + ' ' + r + ' 0 ' + grande + ' ' + (A1 > A0 ? 1 : 0) + ' ' +
            (cx + r * Math.cos(A1)) + ' ' + (cy + r * Math.sin(A1)),
          fill: 'none', stroke: cor, 'stroke-width': esp, 'stroke-linecap': 'butt'
        });
      }

      // trilha por faixas (com vao de 2px entre faixas)
      let de = min;
      faixas.forEach(function (f, i) {
        const ate = Math.min(f.ate === Infinity ? max : f.ate, max);
        if (ate <= de) { return; }
        const a = arco(de + (i ? 0.006 * (max - min) : 0), ate, raio, cht.corStatus(f.token), 12);
        if (a) { a.setAttribute('opacity', '0.30'); sv.appendChild(a); }
        de = ate;
      });

      if (ehNum(v)) {
        const tok = tokenDe(v);
        const a = arco(min, v, raio, cht.corStatus(tok), 12);
        if (a) { sv.appendChild(a); }
        const A = ang(v);
        sv.appendChild(s('circle', {
          cx: cx + raio * Math.cos(A), cy: cy + raio * Math.sin(A), r: 6,
          fill: cht.corStatus(tok), stroke: 'var(--sup-1)', 'stroke-width': 2
        }));
        sv.appendChild(txt(cx, cy - 16, fmt(v), {
          'text-anchor': 'middle', 'font-size': Math.round(w * 0.16), 'font-weight': 680,
          fill: 'var(--tinta-1)', class: 'e-figura'
        }));
      } else {
        sv.appendChild(txt(cx, cy - 16, 'n/a', {
          'text-anchor': 'middle', 'font-size': Math.round(w * 0.13), 'font-weight': 660, fill: 'var(--tinta-3)'
        }));
      }

      // marca de alvo
      if (ehNum(alvo)) {
        const A = ang(alvo);
        sv.appendChild(s('line', {
          x1: cx + (raio - 9) * Math.cos(A), y1: cy + (raio - 9) * Math.sin(A),
          x2: cx + (raio + 9) * Math.cos(A), y2: cy + (raio + 9) * Math.sin(A),
          stroke: 'var(--tinta-1)', 'stroke-width': 2, opacity: 0.7
        }));
      }

      sv.appendChild(txt(cx, cy + 12, (d && d.rotulo) || '', { 'text-anchor': 'middle', 'font-size': 11 }));
      if (d && d.subRotulo) {
        sv.appendChild(txt(cx, cy + 27, d.subRotulo, { 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--tinta-3)' }));
      }
      sv.appendChild(txt(cx - raio, cy + 14, fmt(min), { 'text-anchor': 'middle', 'font-size': 9 }));
      sv.appendChild(txt(cx + raio, cy + 14, fmt(max), { 'text-anchor': 'middle', 'font-size': 9 }));

      // status sempre com rotulo textual, nunca so cor
      if (ehNum(v)) {
        const tok = tokenDe(v);
        const rotTok = { bom: 'dentro do limiar', aviso: 'atenção', serio: 'atenção', critico: 'fora do limiar', neutro: '—' };
        ctx.rodape.appendChild(el('div', { class: 'pmo-cht-esc' }, [
          el('span', { class: 'pmo-cht-esc-tit', text: ((d && d.rotulo) || 'Indicador') + ': ' + rotTok[tok] }),
          el('span', { class: 'pmo-cht-esc-lim', text: 'alvo ' + fmt(alvo) })
        ]));
      }
      return true;
    }, 'gauge');
  };

  /* =========================================================== sparkline */

  cht.sparkline = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const vals = ((d && d.valores) || []).filter(ehNum);
      if (vals.length < 2) { return false; }
      const alt = o.altura || 36;
      const w = Math.max(40, ctx.largura), h = alt;
      const cor = o.cor || 'var(--serie-1)';
      const vMin = Math.min.apply(null, vals), vMax = Math.max.apply(null, vals);
      const sv = svgRaiz(ctx, w, h, o.titulo || 'Tendência',
        'Minigráfico de tendência com ' + vals.length + ' pontos, de ' + fmtNum(vMin, 1) + ' a ' + fmtNum(vMax, 1) + '.');
      const pad = 4;
      function px(i) { return pad + safeDiv(i, vals.length - 1) * (w - pad * 2); }
      function py(v) { return h - pad - safeDiv(v - vMin, vMax - vMin || 1) * (h - pad * 2); }
      const pontos = vals.map(function (v, i) { return px(i) + ',' + py(v); }).join(' ');
      sv.appendChild(s('polyline', { points: pontos, fill: 'none', stroke: cor,
        'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (o.mostrarUltimo !== false) {
        const i = vals.length - 1;
        sv.appendChild(s('circle', { cx: px(i), cy: py(vals[i]), r: 3, fill: cor,
          stroke: 'var(--sup-1)', 'stroke-width': 2 }));
      }
      ctx.opts.semTabela = true;
      return true;
    }, 'sparkline');
  };

  /* ======================================================= timeline gates */

  const ICONE_GATE = {
    aprovado: 'M20 6 9 17l-5-5', condicional: 'M12 8v5|M12 16.5v.5',
    reprovado: 'M18 6 6 18|M6 6l12 12', pendente: 'M12 7v5l3 2',
    atrasado: 'M12 8v5|M12 16.5v.5'
  };
  const TOKEN_GATE = {
    aprovado: 'bom', condicional: 'aviso', reprovado: 'critico',
    pendente: 'neutro', atrasado: 'critico'
  };
  const ROTULO_GATE = {
    aprovado: 'Aprovado', condicional: 'Com condições', reprovado: 'Reprovado',
    pendente: 'Pendente', atrasado: 'Atrasado'
  };

  cht.timelineGates = function (container, dados, opts) {
    return base(container, dados, opts, function (ctx, d, o) {
      const itens = ((d && d.itens) || []).filter(function (i) { return i && i.data; });
      if (!itens.length) { return false; }
      const ord = (U.sortBy ? U.sortBy(itens, function (i) { return i.data; }) : itens.slice());

      const alt = o.altura || 140;
      const w = Math.max(240, ctx.largura), h = alt;
      const margE = 24, margD = 24;
      const sv = svgRaiz(ctx, w, h, 'Linha do tempo de gates',
        'Linha do tempo com ' + ord.length + ' marcos de governança.');

      const y = h * 0.44;
      sv.appendChild(s('line', { x1: margE, y1: y, x2: w - margD, y2: y, stroke: 'var(--eixo)', 'stroke-width': 1 }));

      const passo = ord.length > 1 ? (w - margE - margD) / (ord.length - 1) : 0;
      const g = s('g', { class: 'pmo-cht-marcas' });

      ord.forEach(function (it, i) {
        const x = ord.length > 1 ? margE + i * passo : w / 2;
        const st = it.status || 'pendente';
        const cor = cht.corStatus(TOKEN_GATE[st] || 'neutro');
        const grupo = s('g', {
          tabindex: '0', class: o.onClick ? 'e-clicavel' : null,
          'aria-label': it.rotulo + ' — ' + (ROTULO_GATE[st] || st) + ' — ' + (U.fmtDate ? U.fmtDate(it.data) : it.data)
        });
        grupo.appendChild(s('circle', { cx: x, cy: y, r: 11, fill: 'var(--sup-1)', stroke: cor, 'stroke-width': 2 }));
        String(ICONE_GATE[st] || ICONE_GATE.pendente).split('|').forEach(function (p) {
          grupo.appendChild(s('path', {
            d: p, transform: 'translate(' + (x - 8) + ',' + (y - 8) + ') scale(0.667)',
            fill: 'none', stroke: cor, 'stroke-width': 2.6,
            'stroke-linecap': 'round', 'stroke-linejoin': 'round'
          }));
        });
        // acima: rotulo do gate; abaixo: data e status textual (nunca so cor)
        grupo.appendChild(txt(x, y - 24, truncar(String(it.rotulo), 14), {
          'text-anchor': 'middle', fill: 'var(--tinta-1)', 'font-weight': 650, 'font-size': 11
        }));
        grupo.appendChild(txt(x, y + 24, U.fmtDate ? U.fmtDate(it.data) : String(it.data), {
          'text-anchor': 'middle', 'font-size': 10, class: 'e-tab'
        }));
        grupo.appendChild(txt(x, y + 38, ROTULO_GATE[st] || st, {
          'text-anchor': 'middle', 'font-size': 9, fill: cor, 'font-weight': 650
        }));
        ligarTip(grupo, it.rotulo, [
          { rotulo: 'situação', valor: ROTULO_GATE[st] || st, cor: cor, forma: 'ponto', forte: true },
          { rotulo: 'data', valor: U.fmtDate ? U.fmtDate(it.data) : String(it.data), cor: cor, forma: 'ponto' }
        ], it.subRotulo || null);
        if (o.onClick) {
          grupo.addEventListener('click', function () { o.onClick(it); });
          grupo.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(it); }
          });
        }
        g.appendChild(grupo);
      });
      sv.appendChild(g);

      detalheTabela(ctx, ['Gate', 'Data', 'Situação'],
        ord.map(function (it) {
          return [it.rotulo, U.fmtDate ? U.fmtDate(it.data) : it.data, ROTULO_GATE[it.status] || it.status || '—'];
        }), 'Gates de governança');
      return true;
    }, 'timelineGates');
  };

  PMO.chart = cht;
})(window.PMO = window.PMO || {});
