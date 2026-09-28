/* =============================================================================
   68-editores.js — editor genérico de registros do projeto
   Depende de: 00-util.js, 10-model.js, 20-store.js, 60-views-comuns.js

   Um único modal serve riscos, issues, marcos, gates, mudanças, decisões,
   benefícios, dependências, alocações e status reports. O que muda entre eles
   é apenas a especificação em PMO.model.CAMPOS_EDICAO — acrescentar um campo lá
   o faz aparecer aqui, sem escrever interface nova.

   G8: toda escrita passa por PMO.store.mutate(). Nunca em store.state direto,
   ou a trilha de auditoria e o desfazer ficam furados.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const S = PMO.store;
  const vw = PMO.vw;
  const editor = {};

  /** Aba do painel de detalhe que deve reabrir depois de gravar. */
  const ABA_DE = {
    risco: 'riscos', issue: 'riscos',
    marco: 'cronograma', gate: 'cronograma',
    mudanca: 'governanca', decisao: 'governanca',
    beneficio: 'resumo', dependencia: 'resumo', alocacao: 'resumo',
    statusReport: 'reportes'
  };

  function def(tipo) {
    const d = M.CAMPOS_EDICAO[tipo];
    if (!d) { throw new Error('tipo de registro desconhecido: ' + tipo); }
    return d;
  }

  function tituloDe(tipo, item) {
    const d = def(tipo);
    const t = item ? item[d.campoTitulo] : null;
    if (!t) { return d.rotulo; }
    if (tipo === 'gate') {
      const g = M.gatePorId(t);
      return g ? g.codigo + ' — ' + g.nome : String(t);
    }
    if (tipo === 'dependencia') {
      const alvo = M.projetoPorId(S.state, item.projetoDestinoId);
      return alvo ? 'dependência para ' + (alvo.codigo || alvo.nome) : 'dependência';
    }
    if (tipo === 'statusReport') { return 'reporte de ' + U.fmtPeriodo(t); }
    return U.truncar(String(t), 60);
  }

  function reabrir(projetoId, tipo) {
    if (PMO.views && PMO.views.abrirProjeto) {
      PMO.views.abrirProjeto(projetoId, ABA_DE[tipo] || 'resumo');
    }
    if (PMO.app && PMO.app.recarregarView) { PMO.app.recarregarView(); }
  }

  /* ============================================================ abrir/criar */

  /**
   * Abre o modal de edição. Sem `itemId`, cria um registro novo.
   * `preset` permite pré-preencher campos (ex.: o gate clicado no roadmap).
   */
  editor.abrir = function (tipo, projetoId, itemId, preset) {
    const d = def(tipo);
    const projeto = M.projetoPorId(S.state, projetoId);
    if (!projeto) { U.toast('Projeto não encontrado.', 'erro'); return; }

    const novo = !itemId;
    let dados;
    if (novo) {
      dados = M[d.fabrica]({});
      if (d.prefixoCodigo) { dados.codigo = M.proximoCodigoRegistro(projeto, tipo); }
      if (preset) { U.mesclar(dados, preset); }
    } else {
      const achado = (projeto[d.colecao] || []).find(function (x) { return x.id === itemId; });
      if (!achado) { U.toast('Registro não encontrado.', 'erro'); return; }
      dados = U.clonar(achado);
    }

    const f = vw.formulario(d.campos, dados, {
      bundle: S.state,
      excluirProjetoId: tipo === 'dependencia' ? projetoId : null
    });

    const corpo = U.el('div');
    corpo.appendChild(U.el('p', { class: 'txt-mic txt-3 mb-3',
      text: (novo ? 'Novo registro em ' : 'Editando registro de ') +
        (projeto.codigo ? projeto.codigo + ' · ' : '') + projeto.nome }));
    corpo.appendChild(f.form);

    const acoes = [];
    if (!novo) {
      acoes.push(vw.botao('Excluir', { variante: 'perigo', icone: 'lixeira', onClick: function () {
        editor.excluir(tipo, projetoId, itemId);
      } }));
    }
    acoes.push(vw.botao('Cancelar', { onClick: PMO.app.fecharModal }));
    acoes.push(vw.botao(novo ? 'Criar' : 'Salvar', {
      variante: 'primario', icone: 'ok',
      onClick: function () {
        const v = f.validar();
        if (!v.ok) { U.toast(v.erros[0].msg, 'erro'); return; }
        editor.gravar(tipo, projetoId, novo ? null : itemId, f.obter());
      }
    }));

    PMO.app.abrirModal((novo ? 'Novo: ' : 'Editar: ') + d.rotulo, corpo, { largo: true, acoes: acoes });
  };

  editor.criar = function (tipo, projetoId, preset) {
    editor.abrir(tipo, projetoId, null, preset);
  };

  /* ================================================================ gravar */

  editor.gravar = function (tipo, projetoId, itemId, valores) {
    const d = def(tipo);
    const projeto = M.projetoPorId(S.state, projetoId);
    const novo = !itemId;
    const rotuloItem = tituloDe(tipo, valores);

    return S.mutate(novo ? ('Criar ' + d.rotulo.toLowerCase()) : ('Atualizar ' + d.rotulo.toLowerCase()),
      function (b) {
        const p = b.projetos.find(function (x) { return x.id === projetoId; });
        if (!p) { throw new Error('projeto não encontrado'); }
        if (!Array.isArray(p[d.colecao])) { p[d.colecao] = []; }

        if (novo) {
          const registro = M[d.fabrica](valores);
          registro.id = U.uid(tipo.slice(0, 3));
          p[d.colecao].push(registro);
        } else {
          const alvo = p[d.colecao].find(function (x) { return x.id === itemId; });
          if (!alvo) { throw new Error('registro não encontrado'); }
          const atualizado = M[d.fabrica](valores);
          atualizado.id = itemId;
          Object.keys(atualizado).forEach(function (k) { alvo[k] = atualizado[k]; });
        }
        // renormaliza o projeto para reaplicar coerções de tipo e data
        const norm = M.normalizarProjeto(p);
        Object.keys(norm).forEach(function (k) { p[k] = norm[k]; });
        p.atualizadoEm = U.agoraIso();
      },
      {
        entidade: tipo, entidadeId: projetoId,
        resumo: (projeto.codigo || projeto.nome) + ' — ' +
          (novo ? 'criado' : 'atualizado') + ': ' + rotuloItem
      }
    ).then(function (r) {
      if (!r.ok) { return r; }
      PMO.app.fecharModal();
      U.toast(d.rotulo + (novo ? ' criado.' : ' salvo.'), 'ok',
        { acao: 'Desfazer', onAcao: function () { S.desfazer().then(function () { reabrir(projetoId, tipo); }); } });
      reabrir(projetoId, tipo);
      return r;
    });
  };

  /* =============================================================== excluir */

  editor.excluir = function (tipo, projetoId, itemId) {
    const d = def(tipo);
    const projeto = M.projetoPorId(S.state, projetoId);
    if (!projeto) { return Promise.resolve(); }
    const item = (projeto[d.colecao] || []).find(function (x) { return x.id === itemId; });
    if (!item) { return Promise.resolve(); }
    const rotuloItem = tituloDe(tipo, item);
    const anexos = editor.anexosDoRegistro(projetoId, tipo, itemId);

    return PMO.app.confirmar('Excluir ' + d.rotulo.toLowerCase(),
      'Excluir "' + rotuloItem + '" de ' + (projeto.codigo || projeto.nome) + '?' +
      (anexos.length ? ' Os ' + anexos.length + ' anexo(s) deste registro continuam no cofre, sem vínculo.' : '') +
      ' A ação pode ser desfeita com Ctrl+Z.',
      { perigo: true, ok: 'Excluir' }
    ).then(function (ok) {
      if (!ok) { return; }
      return S.excluirRegistro(tipo, projetoId, itemId).then(function () {
        PMO.app.fecharModal();
        U.toast(d.rotulo + ' excluído.', 'ok',
          { acao: 'Desfazer', onAcao: function () { S.desfazer().then(function () { reabrir(projetoId, tipo); }); } });
        reabrir(projetoId, tipo);
      });
    });
  };

  /* =============================================== anexos por registro */

  editor.anexosDoRegistro = function (projetoId, tipo, itemId) {
    return (S.state.anexos || []).filter(function (a) {
      return a.projetoId === projetoId && a.entidadeRef &&
        a.entidadeRef.tipo === tipo && a.entidadeRef.id === itemId;
    });
  };

  /**
   * Anexa arquivos diretamente a um registro (contrato numa mudança, evidência
   * num gate, matriz numa decisão). Usa o campo entidadeRef do modelo de anexos.
   */
  editor.anexarA = function (tipo, projetoId, itemId) {
    const d = def(tipo);
    const projeto = M.projetoPorId(S.state, projetoId);
    const item = (projeto[d.colecao] || []).find(function (x) { return x.id === itemId; });
    const rotuloItem = tituloDe(tipo, item);

    const input = U.el('input', { type: 'file', multiple: true, style: { display: 'none' } });
    const selCat = U.el('select', { class: 'campo' }, M.tax('categoriasAnexo').map(function (x) {
      return U.el('option', { value: x.id, text: x.rotulo,
        selected: x.id === sugestaoCategoria(tipo) });
    }));
    const lista = U.el('div', { class: 'pilha pilha--2' });
    let escolhidos = [];

    function pintarLista() {
      U.limpar(lista);
      const jaAnexados = editor.anexosDoRegistro(projetoId, tipo, itemId);
      if (jaAnexados.length) {
        lista.appendChild(U.el('div', { class: 'txt-mic txt-3', text: 'Já anexados a este registro' }));
        jaAnexados.forEach(function (a) {
          lista.appendChild(U.el('div', { class: 'arquivo-item' }, [
            U.el('span', { class: 'arquivo-item__ic' }, [vw.icone('arquivo', { tam: 16 })]),
            U.el('div', { class: 'arquivo-item__corpo' }, [
              U.el('div', { class: 'arquivo-item__nome', text: a.nomeArquivo }),
              U.el('div', { class: 'arquivo-item__meta' }, [
                U.el('span', { text: M.rotulo('categoriasAnexo', a.categoria) }),
                U.el('span', { text: U.tamanhoHumano(a.tamanho) })
              ])
            ]),
            U.el('div', { class: 'arquivo-item__acoes' }, [
              vw.botaoIcone('baixar', 'Baixar', function () {
                S.anexoBaixar(a.id).catch(function (e) { U.toast(e.message || String(e), 'erro'); });
              }, { tam: 14 }),
              vw.botaoIcone('lixeira', 'Remover', function () {
                PMO.app.confirmar('Remover anexo',
                  'Remover "' + a.nomeArquivo + '"? A exclusão é definitiva: o arquivo sai do navegador e do disco.',
                  { perigo: true, ok: 'Remover' }).then(function (ok) {
                  if (!ok) { return; }
                  S.anexoRemover(a.id, { confirmado: true }).then(function (r) {
                    if (!r || !r.ok) { return; }
                    pintarLista(); PMO.app.recarregarView();
                  });
                });
              }, { tam: 14 })
            ])
          ]));
        });
      }
      if (escolhidos.length) {
        lista.appendChild(U.el('div', { class: 'txt-mic txt-3 mt-3', text: 'A enviar' }));
        escolhidos.forEach(function (f) {
          lista.appendChild(U.el('div', { class: 'arquivo-item' }, [
            U.el('span', { class: 'arquivo-item__ic' }, [vw.icone('arquivo', { tam: 16 })]),
            U.el('div', { class: 'arquivo-item__corpo' }, [
              U.el('div', { class: 'arquivo-item__nome', text: f.name }),
              U.el('div', { class: 'arquivo-item__meta' }, [U.el('span', { text: U.tamanhoHumano(f.size) })])
            ])
          ]));
        });
      }
      if (!jaAnexados.length && !escolhidos.length) {
        lista.appendChild(U.el('p', { class: 'txt-peq txt-3', text: 'Nenhum arquivo vinculado a este registro ainda.' }));
      }
    }

    input.addEventListener('change', function (e) {
      escolhidos = Array.prototype.slice.call(e.target.files || []);
      pintarLista();
    });

    const zona = U.el('div', { class: 'dropzona mb-3', attrs: { role: 'button', tabindex: '0' } }, [
      vw.icone('anexo', { tam: 22 }),
      U.el('div', { class: 'dropzona__titulo', text: 'Escolher arquivos' }),
      U.el('div', { class: 'dropzona__txt', text: 'Ficam vinculados a este registro, não apenas ao projeto.' }),
      input
    ]);
    zona.addEventListener('click', function () { input.click(); });
    zona.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.dataset.ativo = '1'; });
    zona.addEventListener('dragleave', function () { delete zona.dataset.ativo; });
    zona.addEventListener('drop', function (e) {
      e.preventDefault(); delete zona.dataset.ativo;
      escolhidos = Array.prototype.slice.call(e.dataTransfer.files || []);
      pintarLista();
    });

    pintarLista();

    PMO.app.abrirModal('Anexos de: ' + rotuloItem, U.el('div', {}, [
      zona,
      U.el('div', { class: 'campo-grupo mb-3' }, [
        U.el('label', { class: 'campo-grupo__rot', text: 'Categoria do documento' }), selCat]),
      lista
    ]), {
      acoes: [
        vw.botao('Fechar', { onClick: function () { PMO.app.fecharModal(); PMO.app.recarregarView(); } }),
        vw.botao('Anexar', { variante: 'primario', onClick: function () {
          if (!escolhidos.length) { U.toast('Escolha ao menos um arquivo.', 'warn'); return; }
          const fila = escolhidos.slice();
          const total = fila.length;
          let feitos = 0;
          PMO.app.fecharModal();
          (function proximo() {
            if (!fila.length) {
              U.toast(feitos + ' de ' + total + ' arquivo(s) anexado(s) a ' + rotuloItem + '.',
                feitos === total ? 'ok' : 'warn');
              reabrir(projetoId, tipo);
              return;
            }
            const f = fila.shift();
            S.anexoAdicionar(f, {
              projetoId: projetoId,
              entidadeRef: { tipo: tipo, id: itemId, rotulo: rotuloItem },
              categoria: selCat.value
            }).then(function () { feitos += 1; })
              .catch(function (err) { U.toast('Falha em "' + f.name + '": ' + (err.message || err), 'erro'); })
              .then(proximo);
          })();
        } })
      ]
    });
  };

  function sugestaoCategoria(tipo) {
    if (tipo === 'mudanca') { return 'contrato'; }
    if (tipo === 'gate') { return 'evidencia'; }
    if (tipo === 'decisao') { return 'ata'; }
    if (tipo === 'statusReport') { return 'status-report'; }
    return 'outro';
  }

  /* ========================================================= peças de UI */

  /** Botão "adicionar" para o cabeçalho de uma tabela de registros. */
  editor.botaoAdicionar = function (tipo, projetoId, opts) {
    const o = opts || {};
    const d = def(tipo);
    return vw.botao(o.rotulo || ('Adicionar ' + d.rotulo.toLowerCase()), {
      peq: true, icone: 'mais', variante: o.variante || null,
      onClick: function () { editor.criar(tipo, projetoId, o.preset); }
    });
  };

  /**
   * Coluna de ações para uma linha de tabela: editar, anexar (com contador) e
   * excluir. Devolve um elemento pronto.
   */
  editor.acoesLinha = function (tipo, projetoId, item, opts) {
    const o = opts || {};
    const anexos = editor.anexosDoRegistro(projetoId, tipo, item.id);
    const filhos = [
      vw.botaoIcone('editar', 'Editar', function () {
        editor.abrir(tipo, projetoId, item.id);
      }, { tam: 14 })
    ];
    if (o.semAnexo !== true) {
      const btn = vw.botaoIcone('anexo',
        anexos.length ? anexos.length + ' anexo(s) neste registro' : 'Anexar arquivo a este registro',
        function () { editor.anexarA(tipo, projetoId, item.id); }, { tam: 14 });
      if (anexos.length) {
        btn.appendChild(U.el('span', {
          class: 'chip-botao__cont', style: { marginLeft: '2px' }, text: String(anexos.length)
        }));
        btn.style.width = 'auto';
        btn.style.padding = '0 5px';
      }
      filhos.push(btn);
    }
    filhos.push(vw.botaoIcone('lixeira', 'Excluir', function () {
      editor.excluir(tipo, projetoId, item.id);
    }, { tam: 14 }));
    return U.el('div', { class: 'linha', style: { gap: '2px', justifyContent: 'flex-end' } }, filhos);
  };

  /** Coluna pronta para vw.tabela(). */
  editor.colunaAcoes = function (tipo, projetoId, opts) {
    return {
      id: '_acoes', rot: 'Ações', cent: true, ord: false, largura: '104px',
      render: function (item) { return editor.acoesLinha(tipo, projetoId, item, opts); }
    };
  };

  /** Estado vazio com o botão de criar já embutido. */
  editor.vazio = function (tipo, projetoId, texto) {
    const d = def(tipo);
    return vw.vazio({
      icone: d.icone,
      titulo: 'Nenhum registro em ' + d.rotuloPlural.toLowerCase(),
      txt: texto || null,
      acoes: [editor.botaoAdicionar(tipo, projetoId, { variante: 'primario' })]
    });
  };

  PMO.editor = editor;
})(window.PMO = window.PMO || {});
