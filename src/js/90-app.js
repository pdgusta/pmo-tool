/* =============================================================================
   90-app.js — shell da aplicacao: boot, roteador, navegacao, drawer, modal
   Depende de todos os modulos anteriores. Ultimo a carregar.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const S = PMO.store;
  const vw = PMO.vw;

  const app = {};
  app.filtro = vw.FILTRO_PADRAO();
  app.rotaAtual = null;

  const GRUPOS = ['Visão geral', 'Governança', 'Recursos e valor', 'Dados e configuração'];

  let ctxView = null;
  let viewCorrente = null;
  /* Posição de rolagem por rota, só desta sessão: é conforto de leitura, não
     dado de portfólio, então não vai para settings nem para o disco. */
  const rolagemPorRota = {};
  let soltarFocoModal = null;
  // Modal bloqueante (aviso de entrega ao updater): sem Fechar, sem Escape.
  let modalBloqueante = false;
  let soltarFocoDrawer = null;

  function q(id) { return document.getElementById(id); }

  /* ============================================================ navegacao */

  function montarNav() {
    const host = q('nav-itens');
    if (!host) { return; }
    U.limpar(host);

    const rotas = Object.keys(PMO.views).filter(function (k) {
      const v = PMO.views[k];
      if (!v || typeof v.montar !== 'function') { return false; }
      // uma view pode se esconder do menu conforme o estado (ex.: boas-vindas)
      if (typeof v.ocultarNaNav === 'function') {
        try { if (v.ocultarNaNav()) { return false; } } catch (e) { /* mostra em caso de dúvida */ }
      }
      return true;
    });
    const porGrupo = U.groupBy(rotas, function (r) { return PMO.views[r].grupo || 'Outros'; });
    const ordem = GRUPOS.concat(Object.keys(porGrupo).filter(function (g) { return GRUPOS.indexOf(g) < 0; }));

    const alertas = M.alertas(S.state);
    const criticos = alertas.filter(function (a) { return a.gravidade === 'critico'; }).length;
    const c = vw.contexto(null);
    const k = c.todos.length ? c.kpis(c.todos) : null;

    const badges = {
      painel: criticos ? { n: criticos, tom: 'critico' } : null,
      portfolio: c.todos.length ? { n: c.todos.length, tom: null } : null,
      riscos: k && k.riscosAltos ? { n: k.riscosAltos, tom: 'critico' } : null,
      decisoes: k && (k.decisoesPendentes + k.mudancasPendentes)
        ? { n: k.decisoesPendentes + k.mudancasPendentes, tom: k.decisoesVencidas ? 'critico' : 'aviso' } : null,
      gates: k && k.gatesAtrasados ? { n: k.gatesAtrasados, tom: 'critico' } : null,
      anexos: (S.state.anexos || []).length ? { n: (S.state.anexos || []).length, tom: null } : null
    };

    ordem.forEach(function (g) {
      const itens = porGrupo[g];
      if (!itens || !itens.length) { return; }
      const bloco = U.el('div', { class: 'nav__grupo' }, [
        U.el('div', { class: 'nav__grupo-rot', text: g })
      ]);
      itens.forEach(function (rota) {
        const v = PMO.views[rota];
        const bd = badges[rota];
        bloco.appendChild(U.el('button', {
          class: 'nav__item', type: 'button',
          attrs: {
            'aria-current': app.rotaAtual === rota ? 'page' : null,
            title: v.sub || v.titulo,
            // No modo trilho o rótulo some da tela; o nome acessível não pode
            // depender de um texto que o CSS escondeu.
            'aria-label': v.titulo + (bd ? ' (' + bd.n + ')' : '')
          },
          on: { click: function () { app.navegar(rota); } }
        }, [
          U.el('span', { class: 'nav__item-ic' }, [vw.icone(v.icone || 'painel', { tam: 17 })]),
          U.el('span', { class: 'nav__item-txt', text: v.titulo }),
          bd ? U.el('span', { class: 'nav__item-badge', data: { tom: bd.tom }, text: String(bd.n) }) : null
        ]));
      });
      host.appendChild(bloco);
    });

    const cont = q('nav-contagem');
    if (cont) {
      cont.textContent = c.todos.length
        ? c.todos.length + ' projetos · ' + U.fmtMoney(k.bac, { compact: true })
        : 'portfólio vazio';
    }
  }

  app.navegar = function (rota, params) {
    const v = PMO.views[rota];
    if (!v || typeof v.montar !== 'function') {
      U.toast('A tela "' + rota + '" não está disponível nesta compilação.', 'warn');
      return;
    }

    /* Memória de rolagem por rota. Antes toda navegação zerava o topo — e como
       mudar um filtro remonta a view, ajustar o filtro no fim de uma tabela
       longa jogava o leitor de volta ao começo. A leitura tem de acontecer
       aqui: assim que o host é esvaziado, a altura colapsa e scrollTop vira 0. */
    const conteudo = q('conteudo');
    const mesmaRota = app.rotaAtual === rota;
    const rolagemAntes = conteudo ? conteudo.scrollTop : 0;
    if (app.rotaAtual && !mesmaRota) { rolagemPorRota[app.rotaAtual] = rolagemAntes; }
    if (viewCorrente && typeof viewCorrente.desmontar === 'function') {
      try { viewCorrente.desmontar(); } catch (e) { /* ok */ }
    }
    vw.limparCtx(ctxView);
    ctxView = vw.novoCtx();
    viewCorrente = v;
    app.rotaAtual = rota;
    app.params = params || {};

    if (location.hash !== '#' + rota) {
      try { history.replaceState(null, '', '#' + rota); } catch (e) { location.hash = rota; }
    }

    q('view-titulo').textContent = v.titulo;
    q('view-sub').textContent = v.sub || '';

    const acoes = q('view-acoes');
    U.limpar(acoes);
    if (typeof v.acoes === 'function') {
      (v.acoes() || []).forEach(function (a) { if (a) { acoes.appendChild(a); } });
    }

    const barra = q('barra-filtros');
    let resumoEscopo = null;
    if (v.filtros && v.filtros.length) {
      const c = vw.contexto(app.filtro);
      resumoEscopo = c.projetos.length === c.todos.length
        ? c.todos.length + ' projetos'
        : c.projetos.length + ' de ' + c.todos.length + ' projetos';
      vw.barraFiltros(barra, S.state, app.filtro, function () { app.recarregarView(); }, {
        campos: v.filtros,
        resumo: resumoEscopo
      });
    } else {
      barra.hidden = true;
      U.limpar(barra);
    }

    const host = q('view-host');
    U.limpar(host);
    // Reinicia a animação de entrada: sem o reflow a classe já está lá e o
    // navegador não toca a animação de novo.
    host.classList.remove('view--entrando');
    void host.offsetWidth;
    host.classList.add('view--entrando');
    try {
      v.montar(host, app.params, ctxView);
    } catch (e) {
      if (window.console) { console.error('[PMO] falha ao montar a view "' + rota + '"', e); }
      U.limpar(host);
      host.appendChild(vw.aviso('erro', 'Não consegui desenhar esta tela',
        (e && e.message) || String(e), [
          vw.botao('Tentar de novo', { onClick: function () { app.recarregarView(); } }),
          vw.botao('Ir para o painel', { onClick: function () { app.navegar('painel'); } })
        ]));
    }

    montarNav();

    /* Anúncio da troca de tela em uma frase. Trocar a mesma string não gera
       novo anúncio em alguns leitores, então só escreve quando muda de fato —
       um recarregarView por mudança de filtro deve anunciar a nova contagem. */
    const anuncio = q('anuncio-view');
    if (anuncio) {
      const texto = v.titulo + (resumoEscopo ? ', ' + resumoEscopo : '');
      if (anuncio.textContent !== texto) { anuncio.textContent = texto; }
    }

    if (conteudo) {
      const alvo = mesmaRota ? rolagemAntes : (rolagemPorRota[rota] || 0);
      conteudo.scrollTo({ top: alvo, behavior: 'instant' });
    }
    if (window.innerWidth <= 1000) { document.getElementById('app').dataset.nav = 'oculta'; }
  };

  app.recarregarView = function () {
    if (app.rotaAtual) { app.navegar(app.rotaAtual, app.params); }
  };

  /* =============================================================== drawer */

  app.abrirDrawer = function (titulo, conteudo, opts) {
    const o = opts || {};
    const d = q('drawer');
    const fundo = q('drawer-fundo');
    q('drawer-titulo').textContent = titulo;
    const corpo = q('drawer-corpo');
    U.limpar(corpo);
    U.anexar(corpo, conteudo);
    const acoes = q('drawer-acoes');
    U.limpar(acoes);
    (o.acoes || []).forEach(function (a) { if (a) { acoes.appendChild(a); } });
    d.hidden = false;
    fundo.hidden = false;
    corpo.scrollTop = 0;
    if (soltarFocoDrawer) { soltarFocoDrawer(); }
    soltarFocoDrawer = U.prenderFoco(d, app.fecharDrawer);
  };

  app.fecharDrawer = function () {
    q('drawer').hidden = true;
    q('drawer-fundo').hidden = true;
    U.limpar(q('drawer-corpo'));
    if (soltarFocoDrawer) { soltarFocoDrawer(); soltarFocoDrawer = null; }
  };

  /* ================================================================ modal */

  app.abrirModal = function (titulo, conteudo, opts) {
    const o = opts || {};
    const fundo = q('modal-fundo');
    const m = q('modal');
    m.className = 'modal' + (o.largo ? ' modal--largo' : '') + (o.estreito ? ' modal--estreito' : '');
    q('modal-titulo').textContent = titulo;
    const corpo = q('modal-corpo');
    U.limpar(corpo);
    U.anexar(corpo, conteudo);
    const pe = q('modal-pe');
    U.limpar(pe);
    if (o.rodapeEsq) { pe.appendChild(U.el('div', { class: 'modal__pe-esq' }, o.rodapeEsq)); }
    if (o.acoes && o.acoes.length) {
      o.acoes.forEach(function (a) { if (a) { pe.appendChild(a); } });
    } else if (!o.semFechar && !o.bloqueante) {
      pe.appendChild(vw.botao('Fechar', { onClick: app.fecharModal }));
    }
    modalBloqueante = !!o.bloqueante;
    fundo.hidden = false;
    if (soltarFocoModal) { soltarFocoModal(); }
    soltarFocoModal = U.prenderFoco(m, modalBloqueante ? null : app.fecharModal);
    return m;
  };

  app.fecharModal = function () {
    if (modalBloqueante) { return; }
    q('modal-fundo').hidden = true;
    U.limpar(q('modal-corpo'));
    U.limpar(q('modal-pe'));
    if (soltarFocoModal) { soltarFocoModal(); soltarFocoModal = null; }
  };

  app.confirmar = function (titulo, texto, opts) {
    const o = opts || {};
    return new Promise(function (res) {
      let decidido = false;
      function fechar(v) {
        if (decidido) { return; }
        decidido = true;
        app.fecharModal();
        res(v);
      }
      app.abrirModal(titulo, U.el('p', { class: 'txt-peq', text: texto }), {
        estreito: true,
        acoes: [
          vw.botao(o.cancelar || 'Cancelar', { onClick: function () { fechar(false); } }),
          vw.botao(o.ok || 'Confirmar', {
            variante: o.perigo ? 'perigo' : 'primario',
            onClick: function () { fechar(true); }
          })
        ]
      });
      const fundo = q('modal-fundo');
      fundo.addEventListener('click', function ao(e) {
        if (e.target === fundo) { fundo.removeEventListener('click', ao); fechar(false); }
      });
    });
  };

  /* ================================================================= tema */

  const TEMAS_VALIDOS = ['auto', 'claro', 'escuro'];
  let temaAplicado = null;

  function temaValido(nome) {
    return TEMAS_VALIDOS.indexOf(nome) >= 0 ? nome : 'auto';
  }

  app.tema = function (nome, opts) {
    const o = opts || {};
    const tema = temaValido(nome);
    const raiz = document.documentElement;
    if (tema === 'auto') { raiz.removeAttribute('data-tema'); }
    else { raiz.setAttribute('data-tema', tema); }
    // localStorage é só cache para pintar antes do IndexedDB carregar. Depois
    // do boot, settings.tema é sempre a fonte canônica.
    try { localStorage.setItem('pmo-tema', tema); } catch (e) { /* cache opcional */ }
    if (temaAplicado !== tema) {
      temaAplicado = tema;
      window.dispatchEvent(new CustomEvent('pmo:tema', { detail: { tema: tema } }));
    }
    atualizarBotaoTema(tema);
    if (o.persistir !== false && S.pronto && !S.somenteLeitura &&
        temaValido((S.state.settings || {}).tema) !== tema) {
      return S.mutate('Alterar tema da interface', function (d) {
        d.settings.tema = tema;
      }, { entidade: 'settings', resumo: 'tema → ' + tema });
    }
    return Promise.resolve({ ok: true });
  };

  function temaAtual() {
    if (S.pronto && S.state && S.state.settings) {
      return temaValido(S.state.settings.tema);
    }
    let t = null;
    try { t = localStorage.getItem('pmo-tema'); } catch (e) { /* ok */ }
    return temaValido(t);
  }

  /* ============================================================ densidade
     Mesmo contrato do tema: settings é a fonte canônica, localStorage é só
     cache para pintar antes do IndexedDB carregar. */

  const DENSIDADES_VALIDAS = ['compacta', 'padrao', 'confortavel'];
  let densidadeAplicada = null;

  function densidadeValida(nome) {
    return DENSIDADES_VALIDAS.indexOf(nome) >= 0 ? nome : 'padrao';
  }

  app.densidade = function (nome, opts) {
    const o = opts || {};
    const d = densidadeValida(nome);
    const raiz = document.documentElement;
    // 'padrao' é a ausência de atributo: os tokens base de 00-theme.css valem.
    if (d === 'padrao') { raiz.removeAttribute('data-densidade'); }
    else { raiz.setAttribute('data-densidade', d); }
    try { localStorage.setItem('pmo-densidade', d); } catch (e) { /* cache opcional */ }
    densidadeAplicada = d;
    if (o.persistir !== false && S.pronto && !S.somenteLeitura &&
        densidadeValida((S.state.settings || {}).densidade) !== d) {
      return S.mutate('Alterar densidade da interface', function (draft) {
        draft.settings.densidade = d;
      }, { entidade: 'settings', resumo: 'densidade → ' + d });
    }
    return Promise.resolve({ ok: true });
  };

  function densidadeAtual() {
    if (S.pronto && S.state && S.state.settings) {
      return densidadeValida(S.state.settings.densidade);
    }
    let d = null;
    try { d = localStorage.getItem('pmo-densidade'); } catch (e) { /* ok */ }
    return densidadeValida(d);
  }
  app.densidadeAtual = densidadeAtual;

  app.temaEmUso = temaAtual;

  function atualizarBotaoTema(tema) {
    const b = q('btn-tema');
    if (!b) { return; }
    U.limpar(b);
    const t = temaValido(tema || temaAtual());
    b.appendChild(vw.icone(t === 'escuro' ? 'lua' : (t === 'claro' ? 'alvo' : 'lua'), { tam: 16 }));
    b.setAttribute('title', 'Tema: ' + (t === 'auto' ? 'automático (segue o sistema)' : t) + ' — clique para alternar');
  }

  /* ========================================================= persistencia */

  function atualizarChipPersistencia() {
    const chip = q('btn-persistencia');
    const txt = q('persist-txt');
    if (!chip || !txt) { return; }
    const sd = S.statusDisco;
    const si = S.statusIdb;
    let estado = 'ok';
    let rotulo = 'salvo';
    let titulo = '';

    if (sd.salvando) {
      estado = 'salvando'; rotulo = 'salvando…';
      titulo = 'Gravando em data/portfolio.json';
    } else if (sd.online && sd.ultimoSalvo) {
      estado = 'ok'; rotulo = 'salvo em disco';
      titulo = 'Navegador + disco. Último gravado em ' + U.fmtDataHora(sd.ultimoSalvo);
    } else if (sd.online) {
      estado = 'ok'; rotulo = 'servidor ativo';
      titulo = 'Servidor local respondendo. Nada pendente de gravação.';
    } else if (si.online) {
      estado = 'local'; rotulo = 'só no navegador';
      titulo = (sd.erro || 'Sem servidor local.') + ' Os dados estão no IndexedDB deste navegador.';
    } else {
      estado = 'erro'; rotulo = 'sem persistência';
      titulo = (si.erro || 'IndexedDB indisponível.') + ' As alterações serão perdidas ao fechar.';
    }
    if (sd.pendente && !sd.salvando) { rotulo = 'pendente'; estado = 'salvando'; }

    chip.dataset.estado = estado;
    chip.setAttribute('title', titulo);
    txt.textContent = rotulo;
  }

  function painelPersistencia() {
    const sd = S.statusDisco;
    const si = S.statusIdb;
    const corpo = U.el('div', { class: 'pilha pilha--3' }, [
      vw.metrica('Servidor local', sd.online ? 'ativo' : 'indisponível', { tom: sd.online ? 'bom' : 'ruim' }),
      vw.metrica('IndexedDB (navegador)', si.online ? 'ativo' : 'indisponível', { tom: si.online ? 'bom' : 'ruim' }),
      vw.metrica('Último salvamento em disco', sd.ultimoSalvo ? U.fmtDataHora(sd.ultimoSalvo) : 'nunca'),
      vw.metrica('Gravação pendente', sd.pendente ? 'sim' : 'não', { tom: sd.pendente ? 'ruim' : 'bom' }),
      vw.metrica('Origem da carga', S.origemCarga || '—'),
      vw.metrica('Anexos registrados', String((S.state.anexos || []).length)),
      vw.metrica('Anexos só no navegador',
        String((S.state.anexos || []).filter(function (a) { return !a.emDisco; }).length)),
      sd.erro ? vw.aviso('aviso', 'Aviso de disco', sd.erro) : null,
      si.erro ? vw.aviso('erro', 'Aviso do navegador', si.erro) : null,
      U.el('div', { class: 'linha mt-3' }, [
        vw.botao('Salvar agora', { variante: 'primario', icone: 'ok', onClick: function () {
          S.salvarAgora().then(function (r) {
            U.toast('IndexedDB: ' + (r.indexeddb ? 'ok' : 'falhou') + ' · disco: ' + (r.disco ? 'ok' : 'não gravado'),
              r.indexeddb && r.disco ? 'ok' : 'warn');
            app.fecharModal();
          });
        } }),
        vw.botao('Ressincronizar anexos', { icone: 'anexo', onClick: function () {
          S.ressincronizarAnexos().then(function (r) {
            U.toast(r.ok + ' anexo(s) replicado(s), ' + r.falhas + ' falha(s).', r.falhas ? 'warn' : 'ok');
          });
        } }),
        vw.botao('Recarregar do disco', { icone: 'importar', onClick: function () {
          app.confirmar('Recarregar do disco',
            'Descartar o estado atual do navegador e recarregar data/portfolio.json?').then(function (ok) {
            if (!ok) { return; }
            S.recarregarDoDisco().then(function () {
              U.toast('Portfólio recarregado do disco.', 'ok');
              app.fecharModal();
              app.recarregarView();
            }).catch(function (e) { U.toast(e.message || String(e), 'erro'); });
          });
        } })
      ])
    ]);
    app.abrirModal('Estado da persistência', corpo);
  }

  /* ====================================================== paleta de comandos

     A paleta ja achava entidades. O que faltava era o outro metade do trabalho
     de quem usa teclado: chegar numa tela e disparar uma acao sem procurar o
     botao. Rotas e comandos entram no mesmo indice da busca. */

  /** Teclas g+letra ja existentes, para a paleta poder ensina-las. */
  const ATALHO_ROTA = { painel: 'g p', portfolio: 'g f', roadmap: 'g r', gates: 'g g',
    decisoes: 'g d', riscos: 'g s', financeiro: 'g $', importar: 'g i', config: 'g c' };

  function comandosDisponiveis() {
    return [
      { nome: 'Alternar tema', sub: 'claro, escuro ou automático',
        ir: function () {
          const t = temaAtual();
          app.tema(t === 'auto' ? 'escuro' : (t === 'escuro' ? 'claro' : 'auto'));
        } },
      { nome: 'Densidade compacta', sub: 'mais linhas por tela',
        ir: function () { app.densidade('compacta'); app.recarregarView(); } },
      { nome: 'Densidade padrão', sub: 'equilíbrio entre respiro e informação',
        ir: function () { app.densidade('padrao'); app.recarregarView(); } },
      { nome: 'Densidade confortável', sub: 'alvos maiores e mais espaço',
        ir: function () { app.densidade('confortavel'); app.recarregarView(); } },
      { nome: 'Salvar agora', sub: 'força a réplica em disco  ·  Ctrl+S',
        ir: function () {
          S.salvarAgora().then(function (r) {
            U.toast(r.disco ? 'Salvo em disco.' : 'Salvo no navegador (disco indisponível).',
              r.disco ? 'ok' : 'warn');
          });
        } },
      { nome: 'Desfazer', sub: 'última alteração  ·  Ctrl+Z', ir: function () { S.desfazer(); } },
      { nome: 'Refazer', sub: 'Ctrl+Shift+Z', ir: function () { S.refazer(); } },
      { nome: 'Atalhos de teclado', sub: 'abre a ajuda  ·  ?', ir: mostrarAjuda }
    ];
  }

  function montarBusca() {
    const inp = q('busca-global');
    const paleta = q('paleta-busca');
    if (!inp || !paleta) { return; }

    function fechar() { paleta.hidden = true; U.limpar(paleta); }

    function pintarGrupo(rotulo, itens, totalReal) {
      if (!itens.length) { return; }
      paleta.appendChild(U.el('div', { class: 'paleta__grupo',
        text: rotulo + ' (' + (totalReal === undefined ? itens.length : totalReal) + ')' }));
      itens.forEach(function (it) {
        paleta.appendChild(U.el('button', {
          class: 'paleta__item', type: 'button', attrs: { role: 'option' },
          on: { click: function () { fechar(); inp.value = ''; it.ir(); } }
        }, [
          U.el('span', { class: 'paleta__item-txt' }, [
            U.el('span', { class: 'paleta__item-nome', text: it.nome }),
            it.sub ? U.el('span', { class: 'paleta__item-sub', text: it.sub }) : null
          ]),
          it.tecla ? U.el('kbd', { class: 'tecla', text: it.tecla }) : null
        ]));
      });
    }

    /** Rotas e comandos que casam com o termo. Termo vazio devolve tudo. */
    function navegaveis(termo) {
      const rotas = Object.keys(PMO.views)
        .filter(function (k) {
          const v = PMO.views[k];
          if (!v || typeof v.montar !== 'function') { return false; }
          if (typeof v.ocultarNaNav === 'function') {
            try { if (v.ocultarNaNav()) { return false; } } catch (e) { /* mostra */ }
          }
          return !termo || U.contemTexto(v.titulo + ' ' + (v.grupo || ''), termo);
        })
        .map(function (k) {
          const v = PMO.views[k];
          return { nome: v.titulo, sub: v.grupo || '', tecla: ATALHO_ROTA[k] || null,
            ir: function () { app.navegar(k); } };
        });
      const cmds = comandosDisponiveis().filter(function (cm) {
        return !termo || U.contemTexto(cm.nome + ' ' + (cm.sub || ''), termo);
      });
      return { rotas: rotas, cmds: cmds };
    }

    /** Campo vazio: a paleta vira menu de navegação, não fica em branco. */
    function sugerir() {
      U.limpar(paleta);
      const n = navegaveis('');
      pintarGrupo('Ir para', n.rotas.slice(0, 8), n.rotas.length);
      pintarGrupo('Ações', n.cmds.slice(0, 5), n.cmds.length);
      paleta.hidden = false;
    }

    function buscar() {
      const termo = inp.value.trim();
      if (!termo) { sugerir(); return; }
      if (termo.length < 2) { fechar(); return; }
      U.limpar(paleta);
      const b = S.state;
      const res = { Projetos: [], Riscos: [], Issues: [], Decisões: [], Anexos: [] };

      (b.projetos || []).forEach(function (p) {
        if (U.contemTexto([p.codigo, p.nome, p.descricao, (p.tags || []).join(' ')].join(' '), termo)) {
          res.Projetos.push({ nome: (p.codigo ? p.codigo + ' · ' : '') + p.nome,
            sub: M.nomePrograma(b, p.programaId), ir: function () { PMO.views.abrirProjeto(p.id); } });
        }
        (p.riscos || []).forEach(function (r) {
          if (U.contemTexto(r.titulo + ' ' + r.codigo, termo)) {
            res.Riscos.push({ nome: r.titulo, sub: (p.codigo || p.nome) + ' · score ' + M.scoreRisco(r),
              ir: function () { PMO.views.abrirProjeto(p.id, 'riscos'); } });
          }
        });
        (p.issues || []).forEach(function (i) {
          if (U.contemTexto(i.titulo + ' ' + i.codigo, termo)) {
            res.Issues.push({ nome: i.titulo, sub: p.codigo || p.nome,
              ir: function () { PMO.views.abrirProjeto(p.id, 'riscos'); } });
          }
        });
        (p.decisoes || []).forEach(function (dd) {
          if (U.contemTexto(dd.titulo + ' ' + dd.codigo, termo)) {
            res['Decisões'].push({ nome: dd.titulo, sub: p.codigo || p.nome,
              ir: function () { PMO.views.abrirProjeto(p.id, 'governanca'); } });
          }
        });
      });
      (b.anexos || []).forEach(function (a) {
        if (U.contemTexto(a.nomeArquivo, termo)) {
          const p = a.projetoId ? M.projetoPorId(b, a.projetoId) : null;
          res.Anexos.push({ nome: a.nomeArquivo, sub: p ? (p.codigo || p.nome) : 'sem projeto',
            ir: function () { if (p) { PMO.views.abrirProjeto(p.id, 'anexos'); } else { app.navegar('anexos'); } } });
        }
      });

      let total = 0;
      // Rotas e ações primeiro: são resposta imediata, entidade exige leitura.
      const nav = navegaveis(termo);
      total += nav.rotas.length + nav.cmds.length;
      pintarGrupo('Ir para', nav.rotas.slice(0, 5), nav.rotas.length);
      pintarGrupo('Ações', nav.cmds.slice(0, 4), nav.cmds.length);

      Object.keys(res).forEach(function (g) {
        const itens = res[g].slice(0, 6);
        if (!itens.length) { return; }
        total += itens.length;
        pintarGrupo(g, itens, res[g].length);
      });
      if (!total) {
        paleta.appendChild(U.el('div', { class: 'paleta__vazio', text: 'Nada encontrado para "' + termo + '".' }));
      }
      paleta.hidden = false;
    }

    inp.addEventListener('input', U.debounce(buscar, 180));
    inp.addEventListener('focus', function () { if (!inp.value.trim()) { sugerir(); } });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { fechar(); inp.blur(); }
      if (e.key === 'Enter') {
        const primeiro = paleta.querySelector('.paleta__item');
        if (primeiro) { primeiro.click(); }
      }
      // Setas percorrem os resultados sem tirar a mão do teclado.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const itens = Array.from(paleta.querySelectorAll('.paleta__item'));
        if (!itens.length) { return; }
        e.preventDefault();
        const i = itens.indexOf(document.activeElement);
        const prox = e.key === 'ArrowDown'
          ? (i < 0 ? 0 : Math.min(i + 1, itens.length - 1))
          : (i <= 0 ? -1 : i - 1);
        if (prox < 0) { inp.focus(); } else { itens[prox].focus(); }
      }
    });
    paleta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { fechar(); inp.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const itens = Array.from(paleta.querySelectorAll('.paleta__item'));
        const i = itens.indexOf(document.activeElement);
        e.preventDefault();
        if (e.key === 'ArrowDown' && i < itens.length - 1) { itens[i + 1].focus(); }
        else if (e.key === 'ArrowUp') { if (i > 0) { itens[i - 1].focus(); } else { inp.focus(); } }
      }
    });
    document.addEventListener('click', function (e) {
      if (!paleta.contains(e.target) && e.target !== inp) { fechar(); }
    });
  }

  /* ======================================================= dropzona global */

  /**
   * Sobreposição de arrastar-e-soltar global.
   *
   * Esta camada cobre a tela inteira: se ficar presa, o app inteiro trava. Por
   * isso ela tem várias saídas independentes, e nenhuma delas depende do
   * navegador emitir o evento "certo":
   *   - contador simétrico de dragenter/dragleave (só conta quando há arquivos);
   *   - saída pela borda da janela zera o contador de uma vez;
   *   - mousemove: um arrasto nativo NÃO emite mousemove, então se ele chegou o
   *     arrasto acabou (é a rede que pega o caso do arquivo solto fora da aba);
   *   - Esc, clique na sobreposição e botão de fechar visível;
   *   - blur da janela, troca de aba e um timeout de segurança.
   */
  function montarDropzonaGlobal() {
    const zona = q('dropzona-global');
    if (!zona) { return; }

    let profundidade = 0;
    let visivel = false;
    let mostradaEm = 0;
    let timerSeguranca = null;

    function temArquivos(e) {
      const tipos = (e.dataTransfer && e.dataTransfer.types) || [];
      return Array.prototype.indexOf.call(tipos, 'Files') >= 0;
    }

    function mostrar() {
      if (visivel) { return; }
      visivel = true;
      mostradaEm = Date.now();
      zona.hidden = false;
      zona.setAttribute('aria-hidden', 'false');
      if (timerSeguranca) { clearTimeout(timerSeguranca); }
      timerSeguranca = setTimeout(esconder, 15000);
    }

    function esconder() {
      profundidade = 0;
      visivel = false;
      zona.hidden = true;
      zona.setAttribute('aria-hidden', 'true');
      if (timerSeguranca) { clearTimeout(timerSeguranca); timerSeguranca = null; }
    }

    // começa sempre oculta, independentemente do estado do HTML
    esconder();
    app.fecharDropzona = esconder;

    // botão de fechar explícito, para o caso de tudo o mais falhar
    const cartao = zona.querySelector('.dropzona-global__cartao');
    if (cartao) {
      const btn = U.el('button', {
        class: 'botao-icone dropzona-global__x', type: 'button',
        attrs: { 'aria-label': 'Fechar' },
        on: { click: function (e) { e.stopPropagation(); esconder(); } }
      }, [vw.icone('x', { tam: 16 })]);
      cartao.appendChild(btn);
    }

    window.addEventListener('dragenter', function (e) {
      if (!temArquivos(e)) { return; }
      profundidade += 1;
      mostrar();
    });

    window.addEventListener('dragleave', function (e) {
      if (!visivel) { return; }
      profundidade -= 1;
      const saiuPelaBorda = e.clientX <= 0 || e.clientY <= 0 ||
        e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
      if (profundidade <= 0 || saiuPelaBorda) { esconder(); }
    });

    window.addEventListener('dragover', function (e) {
      if (temArquivos(e)) { e.preventDefault(); }
    });

    window.addEventListener('dragend', esconder);
    window.addEventListener('blur', esconder);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { esconder(); }
    });

    // Durante um arrasto nativo o navegador não emite mousemove. Se ele chegou,
    // o arrasto terminou em algum lugar que não nos avisou.
    window.addEventListener('mousemove', function () {
      if (visivel && Date.now() - mostradaEm > 250) { esconder(); }
    });
    window.addEventListener('pointerdown', function () { if (visivel) { esconder(); } });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && visivel) { e.stopPropagation(); esconder(); }
    }, true);

    zona.addEventListener('click', esconder);

    window.addEventListener('drop', function (e) {
      e.preventDefault();
      esconder();
      const files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) { return; }
      // arquivo de dados vai para a engine de import; o resto vira anexo
      const importaveis = ['xml', 'xer', 'pmxml', 'csv', 'xlsx', 'json', 'mpp', 'mpx'];
      const paraImportar = files.filter(function (f) { return importaveis.indexOf(U.extensao(f.name)) >= 0; });
      if (paraImportar.length && PMO.importar && PMO.importar.lerArquivo) {
        app.navegar('importar', { arquivos: paraImportar });
      } else if (PMO.views.escolherProjetoParaAnexo) {
        PMO.views.escolherProjetoParaAnexo(files);
      } else {
        U.toast('Abra um projeto e use a aba Anexos para anexar estes arquivos.', 'info');
      }
    });
  }

  /* ============================================================== atalhos */

  const ATALHOS = [
    ['/  ou  Ctrl+K', 'Abrir a paleta: telas, ações e busca'],
    ['↑ ↓ e Enter', 'Percorrer e abrir o resultado da paleta'],
    ['g depois p', 'Ir para o Painel executivo'],
    ['g depois f', 'Ir para o Portfólio'],
    ['g depois r', 'Ir para o Roadmap'],
    ['Ctrl+Z', 'Desfazer a última alteração'],
    ['Ctrl+Shift+Z', 'Refazer'],
    ['Ctrl+S', 'Salvar agora em disco'],
    ['Esc', 'Fechar painel, modal ou busca'],
    ['?', 'Mostrar esta ajuda']
  ];

  function montarAtalhos() {
    let prefixoG = false;
    let timerG = null;

    document.addEventListener('keydown', function (e) {
      const alvo = e.target;
      const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' ||
        alvo.tagName === 'SELECT' || alvo.isContentEditable);

      if (e.key === 'Escape') {
        if (!q('modal-fundo').hidden) { if (!modalBloqueante) { app.fecharModal(); } return; }
        if (!q('drawer').hidden) { app.fecharDrawer(); return; }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) { S.refazer(); } else { S.desfazer(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        S.salvarAgora().then(function (r) {
          U.toast(r.disco ? 'Salvo em disco.' : 'Salvo no navegador (disco indisponível).', r.disco ? 'ok' : 'warn');
        });
        return;
      }
      // Ctrl+K é o gesto que todo mundo já traz de outra ferramenta; ele
      // precisa valer inclusive com o cursor dentro de um campo.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const busca = q('busca-global');
        busca.focus();
        busca.select();
        return;
      }
      if (digitando) { return; }

      if (e.key === '/') { e.preventDefault(); q('busca-global').focus(); return; }
      if (e.key === '?') { e.preventDefault(); mostrarAjuda(); return; }

      if (e.key === 'g' || e.key === 'G') {
        prefixoG = true;
        if (timerG) { clearTimeout(timerG); }
        timerG = setTimeout(function () { prefixoG = false; }, 1400);
        return;
      }
      if (prefixoG) {
        prefixoG = false;
        const mapa = { p: 'painel', f: 'portfolio', r: 'roadmap', g: 'gates',
          d: 'decisoes', s: 'riscos', $: 'financeiro', i: 'importar', c: 'config' };
        const alvoRota = mapa[String(e.key).toLowerCase()];
        if (alvoRota && PMO.views[alvoRota]) { e.preventDefault(); app.navegar(alvoRota); }
      }
    });
  }

  function mostrarAjuda() {
    const corpo = U.el('div');
    corpo.appendChild(U.el('p', { class: 'txt-peq txt-2 mb-3',
      text: 'Aplicação local e autocontida. Nenhum dado sai da sua máquina: o portfólio vive no ' +
        'IndexedDB deste navegador e é replicado em data/portfolio.json pelo servidor local.' }));
    corpo.appendChild(vw.tabela({
      compacta: true, legenda: 'Atalhos de teclado',
      colunas: [
        { id: 'k', rot: 'Atalho', render: function (l) { return U.el('kbd', { class: 'txt-mono txt-peq', text: l[0] }); } },
        { id: 'd', rot: 'Ação', valor: function (l) { return l[1]; } }
      ],
      linhas: ATALHOS
    }));
    corpo.appendChild(U.el('div', { class: 'divisor' }));
    corpo.appendChild(U.el('div', { class: 'pilha pilha--2' }, [
      vw.metrica('Versão do app', M.APP_VERSION),
      vw.metrica('Versão do schema', String(M.SCHEMA_VERSION)),
      vw.metrica('Data de status do portfólio', U.fmtDate((S.state.meta || {}).dataStatus)),
      vw.metrica('Organização', (S.state.meta || {}).orgName || '—')
    ]));
    corpo.appendChild(vw.aviso('info', 'Compatibilidade com o ecossistema Microsoft',
      'Esta compilação trabalha por arquivo, não por API: importa MSPDI (.xml do MS Project), ' +
      'Primavera (.xer e .pmxml), planilhas (.csv e .xlsx) e lê os metadados de documento de .mpp. ' +
      'Não há login em tenant nem chamada autenticada a SharePoint, Planner ou Teams.'));
    app.abrirModal('Ajuda e atalhos', corpo);
  }
  app.mostrarAjuda = mostrarAjuda;

  /* ============================================================= topo */

  /**
   * Marca a barra de filtros quando ela encosta no topo. Uma sentinela de 1px
   * logo antes dela é o único jeito barato de saber que um `position: sticky`
   * engatou — não existe seletor de estado grudado em CSS.
   */
  function montarSentinelaGrude() {
    const conteudo = q('conteudo');
    const barra = q('barra-filtros');
    if (!conteudo || !barra || typeof IntersectionObserver !== 'function') { return; }
    const sent = U.el('div', { class: 'sentinela-grude', attrs: { 'aria-hidden': 'true' } });
    conteudo.insertBefore(sent, barra);
    new IntersectionObserver(function (entradas) {
      barra.dataset.grudada = entradas[0].isIntersecting ? '0' : '1';
    }, { root: conteudo, threshold: 0 }).observe(sent);
  }

  const NAVS_VALIDAS = ['visivel', 'trilho', 'oculta'];

  function navValida(nome) {
    return NAVS_VALIDAS.indexOf(nome) >= 0 ? nome : 'visivel';
  }

  /** Reflete o estado no botão e guarda a escolha. Não depende do Store. */
  function refletirBotaoNav() {
    const raiz = q('app');
    const estado = navValida(raiz.dataset.nav);
    raiz.dataset.nav = estado;
    const btn = q('btn-menu');
    if (btn) {
      btn.setAttribute('aria-expanded', String(estado !== 'oculta'));
      btn.setAttribute('title', estado === 'visivel'
        ? 'Navegação completa — clique para recolher em ícones'
        : (estado === 'trilho' ? 'Navegação em ícones — clique para ocultar'
          : 'Navegação oculta — clique para mostrar'));
    }
    // Preferência de interface: cache local basta, não é dado de portfólio.
    try { localStorage.setItem('pmo-nav', estado); } catch (e) { /* opcional */ }
  }

  /** Reflete e redesenha. Só pode ser chamada depois que o Store está pronto. */
  function aplicarEstadoNav() {
    refletirBotaoNav();
    montarNav();
  }

  function montarTopo() {
    const raiz = q('app');

    // Restaura a escolha da sessão anterior. Em tela estreita a nav é gaveta:
    // começa fechada, senão cobre o conteúdo ao abrir o app.
    let salvo = null;
    try { salvo = localStorage.getItem('pmo-nav'); } catch (e) { /* ok */ }
    raiz.dataset.nav = window.innerWidth <= 1000 ? 'oculta' : navValida(salvo);

    q('btn-menu').appendChild(vw.icone('menu', { tam: 18 }));
    refletirBotaoNav();
    q('btn-menu').addEventListener('click', function () {
      /* Em tela larga o botão cicla três estados: completa -> trilho de
         ícones -> oculta. Em tela estreita a navegação é uma gaveta, então
         só faz sentido abrir e fechar. */
      const atual = raiz.dataset.nav || 'visivel';
      if (window.innerWidth <= 1000) {
        raiz.dataset.nav = atual === 'visivel' ? 'oculta' : 'visivel';
      } else {
        const ciclo = { visivel: 'trilho', trilho: 'oculta', oculta: 'visivel' };
        raiz.dataset.nav = ciclo[atual] || 'visivel';
      }
      aplicarEstadoNav();
    });

    q('topo__busca-ic') || (function () {
      const ic = document.querySelector('.topo__busca-ic');
      if (ic) { ic.appendChild(vw.icone('lupa', { tam: 15 })); }
    })();

    const bd = q('btn-desfazer');
    bd.appendChild(vw.icone('desfazer', { tam: 16 }));
    bd.addEventListener('click', function () { S.desfazer(); });
    const br = q('btn-refazer');
    br.appendChild(vw.icone('refazer', { tam: 16 }));
    br.addEventListener('click', function () { S.refazer(); });

    q('btn-persistencia').addEventListener('click', painelPersistencia);

    atualizarBotaoTema();
    q('btn-tema').addEventListener('click', function () {
      const t = temaAtual();
      app.tema(t === 'auto' ? 'escuro' : (t === 'escuro' ? 'claro' : 'auto'));
    });

    q('btn-ajuda').appendChild(vw.icone('ajuda', { tam: 16 }));
    q('btn-ajuda').addEventListener('click', mostrarAjuda);

    q('drawer-fechar').appendChild(vw.icone('x', { tam: 16 }));
    q('drawer-fechar').addEventListener('click', app.fecharDrawer);
    q('drawer-fundo').addEventListener('click', app.fecharDrawer);
    q('modal-fechar').appendChild(vw.icone('x', { tam: 16 }));
    q('modal-fechar').addEventListener('click', app.fecharModal);

    const dz = document.querySelector('.dropzona-global__ic');
    if (dz) { dz.appendChild(vw.icone('importar', { tam: 34 })); }

    const inpData = q('input-data-status');
    inpData.addEventListener('change', function () {
      const nova = U.parseDate(inpData.value);
      if (!nova) { U.toast('Data inválida.', 'erro'); return; }
      S.mutate('Alterar data de status do portfólio', function (d) {
        d.meta.dataStatus = nova;
      }, { entidade: 'meta', resumo: 'data de status → ' + U.fmtDate(nova) }).then(function () {
        U.toast('Data de status agora é ' + U.fmtDate(nova) + '. Todos os indicadores foram recalculados.', 'ok');
        app.recarregarView();
      });
    });
  }

  function sincronizarTopo() {
    q('topo-org').textContent = (S.state.meta || {}).orgName || '—';
    const inpData = q('input-data-status');
    if (inpData) { inpData.value = U.parseDate((S.state.meta || {}).dataStatus) || U.hoje(); }
    q('btn-desfazer').disabled = !S.podeDesfazer();
    q('btn-refazer').disabled = !S.podeRefazer();
    atualizarChipPersistencia();
  }

  /* ============================================================ demo/seed */

  app.carregarDemo = function () {
    if (!PMO.seed) { U.toast('Módulo de demonstração não disponível.', 'erro'); return; }
    const acao = S.estaVazio()
      ? Promise.resolve(true)
      : app.confirmar('Carregar demonstração',
        'Isto substitui o portfólio atual pelos dados de demonstração. Pode ser desfeito com Ctrl+Z.');
    acao.then(function (ok) {
      if (!ok) { return; }
      S.importarBundle(PMO.seed.gerar(), 'substituir').then(function () {
        const r = PMO.seed.resumo();
        U.toast('Demonstração carregada: ' + r.projetos + ' projetos de ' + r.organizacao + '.', 'ok');
        app.recarregarView();
      });
    });
  };

  /* ================================================================= boot */

  function pintarErroFatal(msg, detalhe) {
    const tela = q('tela-carregando');
    if (tela) {
      U.limpar(tela);
      tela.appendChild(U.el('div', { class: 'tela-carregando__cartao' }, [
        U.el('h1', { style: { fontSize: '1.2rem' }, text: 'Não consegui iniciar o PMO Tool' }),
        U.el('p', { class: 'txt-peq', text: msg }),
        detalhe ? U.el('pre', { class: 'txt-mono txt-mic txt-3', style: { maxWidth: '70ch', whiteSpace: 'pre-wrap' }, text: detalhe }) : null
      ]));
    }
  }

  async function verificarAtualizacaoNoInicio() {
    const params = new URLSearchParams(location.search || '');
    if (params.get('skipUpdate') === '1' || S.somenteLeitura || !S.statusDisco.online) { return; }
    const forcar = params.get('forceUpdate') === '1';
    try {
      const info = await S.consultarAtualizacao();
      if (!info.configured) {
        if (forcar) { U.toast('Configure o repositório GitHub em config/install.json para habilitar updates.', 'warn', { duracao: 12000 }); }
        return;
      }
      if (!info.updateAvailable) {
        if (forcar) { U.toast('Você já está na versão estável mais recente.', 'ok'); }
        return;
      }
      const aceitar = await app.confirmar('Atualização ' + info.latestVersion + ' disponível',
        'O PMO Tool salvará todos os dados e anexos, criará um snapshot verificável e só então instalará a nova versão. Nenhum dado será sincronizado com o GitHub.',
        { ok: 'Proteger dados e atualizar', cancelar: 'Agora não' });
      if (!aceitar) { return; }
      U.toast('Preparando snapshot e verificando anexos…', 'info', { duracao: 30000 });
      const preparado = await S.prepararAtualizacao();
      if (!preparado || !preparado.ok) { throw new Error('O preflight não foi concluído.'); }
      U.toast('Snapshot confirmado. Entregando o controle ao updater…', 'ok', { duracao: 30000 });
      await S.aplicarAtualizacao();
    } catch (e) {
      U.toast('Atualização cancelada com os dados intactos: ' + (e.message || String(e)), 'erro', { duracao: 20000 });
      if (S.manutencao) { try { await S.sairModoManutencao(); } catch (ignorar) { /* o launcher recupera o lock */ } }
    }
  }

  // prepareRestore/prepareRollback sao uma intencao de uso unico vinda do
  // pmo.ps1. Saem da URL assim que lidos: um F5 nao reabre a operacao, nem
  // contra outro servidor que venha a ocupar a mesma origem.
  function consumirParametrosDeRecuperacao() {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('prepareRestore');
      url.searchParams.delete('prepareRollback');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (e) { /* sem History API: segue sem limpar */ }
  }

  // Depois do 202 o servidor encerra para o updater trabalhar e nada o reabre.
  // Esta aba guarda o estado anterior em memoria e fica bloqueada (o Store
  // continua em manutencao e recusa escrita); o resultado so aparece numa nova
  // abertura pelo pmo.ps1. Texto provisorio: a copy final e do Artesao.
  function avisarEntregaAoUpdater(operacao) {
    document.documentElement.setAttribute('data-somente-leitura', '1');
    app.abrirModal(operacao + ' entregue ao atualizador', U.el('div', { class: 'pilha pilha--2' }, [
      U.el('p', { class: 'txt-peq', text: 'O estado atual foi protegido em um snapshot e o servidor local foi encerrado para o atualizador trabalhar.' }),
      U.el('p', { class: 'txt-peq', text: 'Esta aba ainda mostra os dados antigos e não grava mais nada. Feche todas as abas do PMO Tool, aguarde alguns segundos e abra de novo com .\\pmo.ps1 (sem parâmetros), em uma única aba.' })
    ]), { estreito: true, bloqueante: true });
  }

  async function verificarRecuperacaoNoInicio() {
    const params = new URLSearchParams(location.search || '');
    const querRollback = params.get('prepareRollback') === '1';
    const snapshotAlvo = String(params.get('prepareRestore') || '');
    if (!querRollback && !snapshotAlvo) { return false; }
    consumirParametrosDeRecuperacao();
    if (S.somenteLeitura || !S.statusDisco.online) {
      U.toast('Rollback/restauracao exigem persistencia hibrida gravavel.', 'erro', { duracao: 20000 });
      return true;
    }
    try {
      if (snapshotAlvo) {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(snapshotAlvo)) { throw new Error('ID de snapshot invalido.'); }
        const aceitarRestore = await app.confirmar('Restaurar snapshot ' + snapshotAlvo,
          'Antes da restauracao, o PMO Tool preservara o estado atual do navegador e do disco em um novo snapshot verificavel. A restauracao so continuara depois dessa protecao.',
          { ok: 'Proteger estado atual e restaurar', cancelar: 'Cancelar' });
        if (!aceitarRestore) { return true; }
        U.toast('Protegendo o estado atual antes da restauracao...', 'info', { duracao: 30000 });
        const preparadoRestore = await S.prepararRestauracao(snapshotAlvo);
        if (!preparadoRestore || !preparadoRestore.ok) { throw new Error('Preflight da restauracao nao foi concluido.'); }
        await S.aplicarRestauracao();
        avisarEntregaAoUpdater('Restauração');
        return true;
      }
      const aceitarRollback = await app.confirmar('Voltar para a versao anterior',
        'O PMO Tool preservara primeiro todas as alteracoes atuais, inclusive as existentes apenas no navegador. Depois entregara o rollback ao updater.',
        { ok: 'Proteger dados e voltar', cancelar: 'Cancelar' });
      if (!aceitarRollback) { return true; }
      U.toast('Protegendo o estado atual antes do rollback...', 'info', { duracao: 30000 });
      const preparadoRollback = await S.prepararRollback();
      if (!preparadoRollback || !preparadoRollback.ok) { throw new Error('Preflight do rollback nao foi concluido.'); }
      await S.aplicarRollback();
      avisarEntregaAoUpdater('Rollback');
      return true;
    } catch (e) {
      U.toast('Operacao cancelada com o estado atual preservado: ' + (e.message || String(e)), 'erro', { duracao: 20000 });
      if (S.manutencao) { try { await S.sairModoManutencao(); } catch (ignorar) { /* journal sera recuperado */ } }
      return true;
    }
  }

  // Vinculo divergente com a instalacao (premissa P-25): o Store abriu em
  // somente leitura com a copia do disco desta instalacao. Trocar de
  // instalacao e acao explicita. Texto provisorio: a copy final e do Artesao.
  async function oferecerTrocaDeInstalacao() {
    const aceitar = await app.confirmar('Dados de outra instalação neste navegador',
      S.motivoSomenteLeitura + ' Ao continuar, a cópia do navegador é baixada como arquivo JSON e ' +
      'guardada também no próprio navegador; depois o navegador passa a mostrar os dados desta instalação. ' +
      'Os anexos guardados no navegador não são apagados.',
      { ok: 'Baixar a cópia e seguir esta instalação', cancelar: 'Agora não' });
    if (!aceitar) {
      U.toast('Somente leitura: ' + S.motivoSomenteLeitura + ' Recarregue a página para decidir de novo.',
        'warn', { duracao: 30000 });
      return;
    }
    try {
      const r = await S.adotarInstalacaoAtual();
      U.toast((r.arquivo ? 'Cópia do navegador baixada (' + r.arquivo + '). ' : '') +
        'Recarregando com os dados desta instalação…', 'ok', { duracao: 8000 });
      setTimeout(function () { location.reload(); }, 1500);
    } catch (e) {
      U.toast('A troca de instalação não foi concluída e a cópia do navegador continua lá: ' +
        (e.message || String(e)), 'erro', { duracao: 20000 });
    }
  }

  async function boot() {
    try {
      app.tema(temaAtual());
      app.densidade(densidadeAtual());
      montarTopo();
      montarSentinelaGrude();
      montarBusca();
      montarDropzonaGlobal();
      montarAtalhos();

      await S.init({ semear: null });
      // O bundle prevalece sobre o cache local assim que a persistência está
      // pronta, inclusive depois de importar/substituir um portfólio.
      await app.tema(temaAtual(), { persistir: false });
      await app.densidade(densidadeAtual(), { persistir: false });

      // Portfólio vazio: em vez de despejar dados fictícios sem aviso, abre a
      // tela de boas-vindas, onde o usuário escolhe entre importar o portfólio
      // real, explorar a demonstração ou começar do zero.
      const primeiraVez = S.estaVazio();

      S.on('change', function () {
        app.tema(temaAtual(), { persistir: false });
        app.densidade(densidadeAtual(), { persistir: false });
        sincronizarTopo();
        montarNav();
      });
      S.on('status', sincronizarTopo);
      S.on('erro', function (e) {
        if (e && e.onde === 'disco') { atualizarChipPersistencia(); }
      });
      S.on('conflito', function (info) {
        U.toast(info.texto, 'warn', { duracao: 12000 });
      });

      sincronizarTopo();

      if (S.somenteLeitura) {
        document.documentElement.setAttribute('data-somente-leitura', '1');
        if (!S.instalacaoDivergente) {
          U.toast('Modo somente leitura: ' + S.motivoSomenteLeitura +
            ' Nenhuma alteração será gravada por esta versão.', 'warn', { duracao: 30000 });
        }
      } else {
        document.documentElement.removeAttribute('data-somente-leitura');
      }

      const rotaHash = String(location.hash || '').replace(/^#/, '');
      let rotaInicial = PMO.views[rotaHash] ? rotaHash : 'painel';
      if (primeiraVez && PMO.views['bem-vindo']) { rotaInicial = 'bem-vindo'; }
      app.navegar(rotaInicial);

      window.addEventListener('hashchange', function () {
        const r = String(location.hash || '').replace(/^#/, '');
        if (r && PMO.views[r] && r !== app.rotaAtual) { app.navegar(r); }
      });

      if (S.temAtivacaoPendente && S.temAtivacaoPendente()) {
        // Durante uma ativacao, falhar fechado: a UI so e liberada depois que
        // disco, IndexedDB, schema e anexos forem confirmados pelo servidor.
        await S.confirmarAppReady();
      } else {
        try { await S.confirmarAppReady(); }
        catch (readyErro) { if (window.console) { console.warn('[PMO] app-ready não confirmado', readyErro); } }
      }

      q('app').removeAttribute('data-carregando');

      if (S.instalacaoDivergente) {
        // Intencao de restore/rollback na URL nao atravessa a troca de instalacao.
        consumirParametrosDeRecuperacao();
        await oferecerTrocaDeInstalacao();
        return;
      }
      if (await verificarRecuperacaoNoInicio()) { return; }
      await verificarAtualizacaoNoInicio();

      if (!S.statusDisco.online) {
        U.toast('Servidor local não detectado: os dados ficam apenas neste navegador. ' +
          'Rode serve.ps1 para gravar em disco.', 'warn', { duracao: 11000 });
      }
    } catch (e) {
      if (window.console) { console.error('[PMO] falha no boot', e); }
      pintarErroFatal('Ocorreu um erro ao carregar a aplicação.', (e && (e.stack || e.message)) || String(e));
    }
  }

  window.addEventListener('error', function (ev) {
    if (window.console) { console.error('[PMO] erro nao tratado', ev.error || ev.message); }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  PMO.app = app;
})(window.PMO = window.PMO || {});
