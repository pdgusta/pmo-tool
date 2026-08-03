/* =============================================================================
   70-views-config.js — configuração de metadados do ambiente e primeira execução
   Depende de: 00-util.js, 10-model.js, 20-store.js, 60-views-comuns.js

   Duas telas:
     'metadados'  — o PMO Lead molda as taxonomias e o modelo de stage-gate
     'bem-vindo'  — primeira execução, do zero ao uso em uma tela

   Trava semântica: coleções em M.COLECOES_MOTOR têm ids que SÃO lógica do
   cálculo (flags de encerrado/pendente, escala de severidade, estados do farol).
   Ali o usuário renomeia e descreve à vontade, mas não remove — remover
   deixaria registros órfãos e o EVM sem referência.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const S = PMO.store;
  const vw = PMO.vw;

  /* =========================================================================
     METADADOS
     ========================================================================= */

  let colecaoAtiva = 'categorias';

  function salvarColecao(colecao, lista, resumo) {
    return S.mutate('Configurar metadados', function (b) {
      if (!b.settings.taxonomias) { b.settings.taxonomias = {}; }
      b.settings.taxonomias[colecao] = lista;
    }, { entidade: 'settings', resumo: resumo || ('lista "' + colecao + '" atualizada') });
  }

  /** Exclusão só acontece depois de remapear quem usava o valor. */
  function excluirValor(colecao, item, lista) {
    const usos = M.contarUso(S.state, colecao, item.id);
    const restantes = lista.filter(function (x) { return x.id !== item.id; });

    if (!restantes.length) {
      U.toast('A lista precisa ter ao menos um valor.', 'erro');
      return;
    }

    if (!usos) {
      salvarColecao(colecao, restantes, 'removido "' + item.rotulo + '" de ' + colecao).then(function () {
        U.toast('"' + item.rotulo + '" removido.', 'ok');
        PMO.app.recarregarView();
      });
      return;
    }

    // há registros usando: exige destino antes de remover
    const sel = U.el('select', { class: 'campo' }, restantes.map(function (x) {
      return U.el('option', { value: x.id, text: x.rotulo });
    }));
    PMO.app.abrirModal('Remapear antes de remover', U.el('div', {}, [
      vw.aviso('aviso', usos + ' registro(s) usam "' + item.rotulo + '"',
        'Remover sem destino deixaria esses registros apontando para um valor que não existe mais. ' +
        'Escolha para onde eles devem ir.'),
      U.el('div', { class: 'campo-grupo mt-3' }, [
        U.el('label', { class: 'campo-grupo__rot', text: 'Mover os registros para' }), sel])
    ]), {
      estreito: true,
      acoes: [
        vw.botao('Cancelar', { onClick: PMO.app.fecharModal }),
        vw.botao('Remapear e remover', { variante: 'perigo', onClick: function () {
          const destino = sel.value;
          S.mutate('Remapear e remover valor de metadado', function (b) {
            const n = M.remapearTaxonomia(b, colecao, item.id, destino);
            if (!b.settings.taxonomias) { b.settings.taxonomias = {}; }
            b.settings.taxonomias[colecao] = restantes;
            b._ultimoRemap = n;
          }, { entidade: 'settings',
            resumo: '"' + item.rotulo + '" removido; ' + usos + ' registro(s) remapeado(s)' })
            .then(function () {
              PMO.app.fecharModal();
              U.toast(usos + ' registro(s) remapeado(s) e valor removido.', 'ok',
                { acao: 'Desfazer', onAcao: function () { S.desfazer().then(PMO.app.recarregarView); } });
              PMO.app.recarregarView();
            });
        } })
      ]
    });
  }

  function editorColecao(host, colecao) {
    U.limpar(host);
    const meta = M.COLECOES_CONFIGURAVEIS.find(function (x) { return x.id === colecao; }) || { rotulo: colecao };
    const lista = U.clonar(M.tax(colecao));
    const doMotor = M.COLECOES_MOTOR.indexOf(colecao) >= 0;

    if (doMotor) {
      host.appendChild(vw.aviso('info', 'Lista usada pelo motor de cálculo',
        'Os identificadores desta lista são lógica: o farol, os flags de encerrado/pendente e a ' +
        'escala de severidade dependem deles. Você pode renomear e redescrever cada valor — ' +
        'inclusive para o vocabulário da sua organização — mas não remover.'));
    }
    if (meta.desc) {
      host.appendChild(U.el('p', { class: 'txt-peq txt-2 mb-3', text: meta.desc }));
    }

    function repintar() { editorColecao(host, colecao); }

    function mover(i, delta) {
      const j = i + delta;
      if (j < 0 || j >= lista.length) { return; }
      const tmp = lista[i]; lista[i] = lista[j]; lista[j] = tmp;
      salvarColecao(colecao, lista, 'ordem de ' + colecao + ' alterada').then(repintar);
    }

    const linhas = lista.map(function (item, i) {
      const usos = M.contarUso(S.state, colecao, item.id);
      const protegido = M.ehItemProtegido(colecao, item.id);

      const inpRot = U.el('input', { class: 'campo', type: 'text', value: item.rotulo || '' });
      const inpDesc = U.el('input', { class: 'campo', type: 'text',
        value: item.descricao || '', placeholder: 'Descrição (opcional)' });
      inpRot.addEventListener('input', function () { item.rotulo = inpRot.value; });
      inpDesc.addEventListener('input', function () { item.descricao = inpDesc.value; });

      return U.el('div', { class: 'linha', style: { gap: '8px', padding: '6px 0',
        borderBottom: '1px solid var(--borda)', alignItems: 'flex-start' } }, [
        U.el('span', { class: 'txt-mono txt-mic txt-3', style: { minWidth: '116px', paddingTop: '8px' },
          text: String(item.id), attrs: { title: 'Identificador interno — imutável, é ele que os registros guardam.' } }),
        U.el('div', { style: { flex: '1 1 190px', minWidth: '150px' } }, [inpRot]),
        U.el('div', { style: { flex: '2 1 260px', minWidth: '170px' } }, [inpDesc]),
        U.el('span', { style: { minWidth: '96px', paddingTop: '8px' } }, [
          usos ? vw.chip(usos + ' em uso', 'neutro', { titulo: usos + ' registro(s) usam este valor' })
            : U.el('span', { class: 'txt-mic txt-3', text: 'sem uso' })
        ]),
        U.el('div', { class: 'linha', style: { gap: '2px', paddingTop: '2px' } }, [
          vw.botaoIcone('setaBaixo', 'Mover para cima', function () { mover(i, -1); },
            { tam: 13, desabilitado: i === 0 }),
          vw.botaoIcone('setaBaixo', 'Mover para baixo', function () { mover(i, 1); },
            { tam: 13, desabilitado: i === lista.length - 1 }),
          protegido
            ? vw.botaoIcone('lixeira', 'Valor usado pelo motor de cálculo: não pode ser removido',
              function () {
                U.toast('"' + item.rotulo + '" é usado pelo motor de cálculo. Renomeie à vontade, mas não dá para remover.', 'warn');
              }, { tam: 13, desabilitado: true })
            : vw.botaoIcone('lixeira', 'Remover', function () { excluirValor(colecao, item, lista); }, { tam: 13 })
        ])
      ]);
    });

    // a primeira seta de cada linha aponta para cima
    host.appendChild(U.el('div', {}, linhas));
    U.qsa('.botao-icone[title="Mover para cima"] svg', host).forEach(function (svg) {
      svg.style.transform = 'rotate(180deg)';
    });

    const novoRot = U.el('input', { class: 'campo', type: 'text', placeholder: 'Nome do novo valor' });
    host.appendChild(U.el('div', { class: 'linha mt-3', style: { gap: '8px' } }, [
      U.el('div', { style: { flex: '1 1 240px' } }, [novoRot]),
      vw.botao('Adicionar valor', { icone: 'mais', onClick: function () {
        const rot = novoRot.value.trim();
        if (!rot) { U.toast('Dê um nome ao novo valor.', 'erro'); return; }
        const base = U.slug(rot) || ('item-' + (lista.length + 1));
        let id = base, n = 2;
        while (lista.some(function (x) { return String(x.id) === id; })) { id = base + '-' + n; n += 1; }
        lista.push({ id: id, rotulo: rot, descricao: '' });
        salvarColecao(colecao, lista, 'valor "' + rot + '" adicionado a ' + colecao).then(function () {
          U.toast('Valor adicionado.', 'ok');
          repintar();
        });
      } })
    ]));

    host.appendChild(U.el('div', { class: 'linha linha--fim mt-4' }, [
      vw.botao('Restaurar padrão desta lista', { onClick: function () {
        PMO.app.confirmar('Restaurar padrão',
          'Descartar as alterações desta lista e voltar ao padrão de fábrica? ' +
          'Registros que usam valores personalizados podem ficar sem rótulo.').then(function (ok) {
          if (!ok) { return; }
          S.mutate('Restaurar lista de metadados', function (b) {
            if (b.settings.taxonomias) { delete b.settings.taxonomias[colecao]; }
          }, { entidade: 'settings', resumo: 'lista "' + colecao + '" restaurada ao padrão' })
            .then(function () { U.toast('Lista restaurada.', 'ok'); PMO.app.recarregarView(); });
        });
      } }),
      vw.botao('Salvar rótulos', { variante: 'primario', icone: 'ok', onClick: function () {
        salvarColecao(colecao, lista, 'rótulos de ' + colecao + ' atualizados').then(function () {
          U.toast('Rótulos salvos. A interface inteira já usa os novos nomes.', 'ok');
          PMO.app.recarregarView();
        });
      } })
    ]));
  }

  /* ------------------------------------------------------------ gates */

  const PRESETS_GATE = {
    4: [['g0', 'G0', 'Ideação'], ['g1', 'G1', 'Business case'],
      ['g3', 'G2', 'Execução autorizada'], ['g5', 'G3', 'Encerramento']],
    5: [['g0', 'G0', 'Ideação'], ['g1', 'G1', 'Business case'],
      ['g2', 'G2', 'Baseline aprovada'], ['g3', 'G3', 'Execução autorizada'],
      ['g5', 'G4', 'Encerramento']],
    6: null,  // padrão de fábrica
    7: [['g0', 'G0', 'Ideação'], ['g1', 'G1', 'Business case'],
      ['g2', 'G2', 'Baseline aprovada'], ['g3', 'G3', 'Execução autorizada'],
      ['g35', 'G4', 'Prontidão para produção'], ['g4', 'G5', 'Aprovação de go-live'],
      ['g5', 'G6', 'Encerramento']]
  };

  function aplicarPresetGates(n) {
    const preset = PRESETS_GATE[n];
    const novos = preset
      ? preset.map(function (g, i) {
        return { id: g[0], codigo: g[1], nome: g[2], ordem: i, descricao: '' };
      })
      : U.clonar(M.GATES);

    // gates que somem precisam de destino, senão projetos ficam órfãos
    const idsNovos = novos.map(function (g) { return g.id; });
    const orfaos = M.gates().filter(function (g) {
      return idsNovos.indexOf(g.id) < 0 && M.contarUsoGate(S.state, g.id) > 0;
    });

    function gravar(mapa) {
      return S.mutate('Alterar modelo de stage-gate', function (b) {
        (mapa || []).forEach(function (par) { M.remapearGate(b, par.de, par.para); });
        b.settings.gates = novos;
      }, { entidade: 'settings', resumo: 'modelo de gates com ' + novos.length + ' portões' })
        .then(function () {
          U.toast('Modelo de gates atualizado para ' + novos.length + ' portões.', 'ok',
            { acao: 'Desfazer', onAcao: function () { S.desfazer().then(PMO.app.recarregarView); } });
          PMO.app.recarregarView();
        });
    }

    if (!orfaos.length) { return gravar(null); }

    // sugestão automática: dobra para trás, nunca alegando progresso inexistente
    const sugestao = {};
    M.mapearGatesRemovidos(M.gates(), novos).forEach(function (par) { sugestao[par.de] = par.para; });

    const seletores = [];
    const corpo = U.el('div', {}, [
      vw.aviso('aviso', orfaos.length + ' portão(ões) saem do modelo e têm registros vinculados',
        'Já sugerimos um destino para cada um, sempre dobrando para o portão anterior — nunca ' +
        'alegando um avanço que o projeto não teve. Ajuste se discordar.')
    ]);
    orfaos.forEach(function (g) {
      const sel = U.el('select', { class: 'campo' }, novos.map(function (x) {
        return U.el('option', { value: x.id, text: x.codigo + ' — ' + x.nome,
          selected: sugestao[g.id] === x.id });
      }));
      seletores.push({ de: g.id, sel: sel });
      corpo.appendChild(U.el('div', { class: 'campo-grupo mt-3' }, [
        U.el('label', { class: 'campo-grupo__rot',
          text: g.codigo + ' — ' + g.nome + ' (' + M.contarUsoGate(S.state, g.id) + ' registro(s))' }),
        sel
      ]));
    });

    PMO.app.abrirModal('Remapear portões que saem do modelo', corpo, {
      acoes: [
        vw.botao('Cancelar', { onClick: PMO.app.fecharModal }),
        vw.botao('Aplicar', { variante: 'primario', onClick: function () {
          const mapa = seletores.map(function (s) { return { de: s.de, para: s.sel.value }; });
          PMO.app.fecharModal();
          gravar(mapa);
        } })
      ]
    });
  }

  function editorGates(host) {
    U.limpar(host);
    const gates = U.clonar(M.gates());

    host.appendChild(U.el('p', { class: 'txt-peq txt-2 mb-3',
      text: 'O modelo de stage-gate define os portões de decisão do portfólio. ' +
        'Trocar o modelo remapeia os projetos existentes — nada fica órfão.' }));

    host.appendChild(U.el('div', { class: 'linha mb-4' }, [
      U.el('span', { class: 'txt-mic txt-3', text: 'Modelos prontos:' })
    ].concat([4, 5, 6, 7].map(function (n) {
      const atual = gates.length === n;
      return vw.botao(n + ' portões' + (n === 6 ? ' (padrão)' : ''), {
        peq: true, variante: atual ? 'primario' : null,
        onClick: function () {
          if (atual) { U.toast('Este já é o modelo em uso.', 'info'); return; }
          PMO.app.confirmar('Trocar modelo de stage-gate',
            'Mudar para ' + n + ' portões? Projetos e marcos são remapeados, e a ação pode ser desfeita com Ctrl+Z.')
            .then(function (ok) { if (ok) { aplicarPresetGates(n); } });
        }
      });
    }))));

    const linhas = gates.map(function (g, i) {
      const usos = M.contarUsoGate(S.state, g.id);
      const inpCod = U.el('input', { class: 'campo', type: 'text', value: g.codigo, style: { maxWidth: '80px' } });
      const inpNome = U.el('input', { class: 'campo', type: 'text', value: g.nome });
      const inpDesc = U.el('input', { class: 'campo', type: 'text', value: g.descricao || '',
        placeholder: 'O que este portão decide' });
      inpCod.addEventListener('input', function () { g.codigo = inpCod.value; });
      inpNome.addEventListener('input', function () { g.nome = inpNome.value; });
      inpDesc.addEventListener('input', function () { g.descricao = inpDesc.value; });
      return U.el('div', { class: 'linha', style: { gap: '8px', padding: '6px 0',
        borderBottom: '1px solid var(--borda)', alignItems: 'flex-start' } }, [
        U.el('span', { class: 'txt-mono txt-mic txt-3', style: { minWidth: '46px', paddingTop: '8px' }, text: g.id }),
        U.el('div', { style: { flex: '0 0 84px' } }, [inpCod]),
        U.el('div', { style: { flex: '1 1 180px' } }, [inpNome]),
        U.el('div', { style: { flex: '2 1 240px' } }, [inpDesc]),
        U.el('span', { style: { minWidth: '92px', paddingTop: '8px' } }, [
          usos ? vw.chip(usos + ' em uso', 'neutro') : U.el('span', { class: 'txt-mic txt-3', text: 'sem uso' })
        ])
      ]);
    });
    host.appendChild(U.el('div', {}, linhas));

    host.appendChild(U.el('div', { class: 'linha linha--fim mt-4' }, [
      vw.botao('Salvar nomes dos portões', { variante: 'primario', icone: 'ok', onClick: function () {
        S.mutate('Renomear portões de gate', function (b) {
          b.settings.gates = gates.map(function (g, i) {
            return { id: g.id, codigo: g.codigo, nome: g.nome, ordem: i, descricao: g.descricao || '' };
          });
        }, { entidade: 'settings', resumo: 'portões renomeados' }).then(function () {
          U.toast('Portões salvos.', 'ok');
          PMO.app.recarregarView();
        });
      } })
    ]));
  }

  PMO.views['metadados'] = {
    titulo: 'Metadados do ambiente',
    icone: 'config',
    grupo: 'Dados e configuração',
    sub: 'Molde as listas e o modelo de stage-gate ao vocabulário da sua organização. As mudanças valem para o app inteiro.',

    montar: function (host) {
      // stage-gate
      const hostGates = U.el('div');
      host.appendChild(vw.cartao({
        titulo: 'Modelo de stage-gate', icone: 'gate', classe: 'mb-4',
        sub: M.gates().length + ' portões em uso',
        corpo: [hostGates]
      }));
      editorGates(hostGates);

      // listas
      const chips = U.el('div', { class: 'linha mb-4' });
      const hostLista = U.el('div');

      M.COLECOES_CONFIGURAVEIS.forEach(function (col) {
        const n = M.tax(col.id).length;
        const btn = U.el('button', {
          class: 'chip-botao', type: 'button',
          data: { ativo: colecaoAtiva === col.id ? '1' : '0' },
          on: { click: function () { colecaoAtiva = col.id; PMO.app.recarregarView(); } }
        }, [
          U.el('span', { text: col.rotulo }),
          U.el('span', { class: 'chip-botao__cont', text: String(n) }),
          M.COLECOES_MOTOR.indexOf(col.id) >= 0
            ? U.el('span', { class: 'txt-mic', style: { opacity: '0.6' }, text: '⚙',
              attrs: { title: 'Usada pelo motor de cálculo' } }) : null
        ]);
        chips.appendChild(btn);
      });

      const metaAtiva = M.COLECOES_CONFIGURAVEIS.find(function (x) { return x.id === colecaoAtiva; });
      host.appendChild(vw.cartao({
        titulo: 'Listas de metadados', icone: 'tabela',
        sub: 'Editando: ' + (metaAtiva ? metaAtiva.rotulo : colecaoAtiva),
        corpo: [chips, U.el('div', { class: 'divisor' }), hostLista]
      }));
      editorColecao(hostLista, colecaoAtiva);
    }
  };

  /* =========================================================================
     PRIMEIRA EXECUÇÃO
     ========================================================================= */

  PMO.views['bem-vindo'] = {
    titulo: 'Começar',
    icone: 'ok',
    grupo: 'Visão geral',
    sub: 'Três escolhas e o portfólio está de pé.',
    // só faz sentido enquanto não há portfólio; some do menu depois disso
    ocultarNaNav: function () { return !S.estaVazio(); },

    montar: function (host) {
      const inpOrg = U.el('input', { class: 'campo', type: 'text',
        value: (S.state.meta || {}).orgName || '',
        placeholder: 'Ex.: Diretoria de Tecnologia — Grupo Alfa' });
      let gatesEscolhidos = M.gates().length;

      const chipsGate = U.el('div', { class: 'linha' });
      function pintarChipsGate() {
        U.limpar(chipsGate);
        [4, 5, 6, 7].forEach(function (n) {
          chipsGate.appendChild(U.el('button', {
            class: 'chip-botao', type: 'button',
            data: { ativo: gatesEscolhidos === n ? '1' : '0' },
            on: { click: function () { gatesEscolhidos = n; pintarChipsGate(); } }
          }, [U.el('span', { text: n + ' portões' + (n === 6 ? ' (padrão)' : '') })]));
        });
      }
      pintarChipsGate();

      function gatesEscolhidosLista() {
        const preset = PRESETS_GATE[gatesEscolhidos];
        return preset
          ? preset.map(function (g, i) {
            return { id: g[0], codigo: g[1], nome: g[2], ordem: i, descricao: '' };
          })
          : U.clonar(M.GATES);
      }

      /**
       * Aplica as escolhas do usuário. Precisa rodar DEPOIS de qualquer carga de
       * dados: importar um bundle substitui `meta` e `settings` inteiros, e a
       * organização e o modelo de gates que a pessoa acabou de escolher seriam
       * silenciosamente descartados.
       */
      function aplicarBase() {
        const nome = inpOrg.value.trim();
        const novos = gatesEscolhidosLista();
        return S.mutate('Configurar ambiente inicial', function (b) {
          if (nome) { b.meta.orgName = nome; }
          const antigos = (b.settings && b.settings.gates) || M.GATES;
          M.mapearGatesRemovidos(antigos, novos).forEach(function (par) {
            M.remapearGate(b, par.de, par.para);
          });
          b.settings.gates = novos;
        }, { entidade: 'settings', resumo: 'ambiente inicial configurado' });
      }

      host.appendChild(vw.cartao({
        titulo: 'Bem-vindo ao PMO Tool', icone: 'ok', classe: 'mb-4',
        sub: 'Tudo roda na sua máquina. Nenhum dado sai daqui.',
        corpo: [
          U.el('div', { class: 'form-grade mb-4' }, [
            U.el('div', { class: 'campo-grupo form-largo' }, [
              U.el('label', { class: 'campo-grupo__rot', text: '1. Como se chama a sua área ou organização' }),
              inpOrg,
              U.el('span', { class: 'campo-grupo__ajuda',
                text: 'Aparece no cabeçalho e em todo relatório gerado.' })
            ])
          ]),
          U.el('div', { class: 'campo-grupo mb-4' }, [
            U.el('label', { class: 'campo-grupo__rot', text: '2. Quantos portões tem o seu stage-gate' }),
            chipsGate,
            U.el('span', { class: 'campo-grupo__ajuda',
              text: 'Dá para renomear cada portão depois, em Metadados do ambiente.' })
          ]),
          U.el('div', { class: 'campo-grupo' }, [
            U.el('label', { class: 'campo-grupo__rot', text: '3. Por onde começar' })
          ])
        ]
      }));

      const opcoes = [
        {
          icone: 'importar', titulo: 'Importar meus projetos',
          txt: 'Traga um arquivo do MS Project (.xml), Primavera (.xer, .pmxml) ou uma planilha. ' +
            'É o caminho mais rápido para ver o seu portfólio real na tela.',
          rotulo: 'Importar arquivo', variante: 'primario',
          acao: function () { aplicarBase().then(function () { PMO.app.navegar('importar'); }); }
        },
        {
          icone: 'painel', titulo: 'Explorar com dados de demonstração',
          txt: 'Um portfólio fictício de 20 projetos, com riscos, gates e financeiro completos. ' +
            'Serve para entender a ferramenta antes de trazer os seus dados.',
          rotulo: 'Carregar demonstração',
          acao: function () {
            // a semente primeiro, as escolhas do usuário por cima
            S.importarBundle(PMO.seed.gerar(), 'substituir')
              .then(aplicarBase)
              .then(function () {
                U.toast('Demonstração carregada com a sua configuração. ' +
                  'Use Configurações → Limpar portfólio quando quiser recomeçar.', 'ok');
                PMO.app.navegar('painel');
              });
          }
        },
        {
          icone: 'mais', titulo: 'Começar do zero',
          txt: 'Cadastre o primeiro projeto manualmente. Você pode importar arquivos depois, a qualquer momento.',
          rotulo: 'Criar primeiro projeto',
          acao: function () {
            aplicarBase().then(function () {
              PMO.app.navegar('portfolio');
              PMO.views.novoProjeto();
            });
          }
        }
      ];

      host.appendChild(U.el('div', { class: 'grade grade--3' }, opcoes.map(function (op) {
        return vw.cartao({
          titulo: op.titulo, icone: op.icone,
          corpo: [
            U.el('p', { class: 'txt-peq txt-2', style: { minHeight: '76px' }, text: op.txt }),
            vw.botao(op.rotulo, { variante: op.variante || null, onClick: op.acao })
          ]
        });
      })));

      host.appendChild(vw.aviso('info', 'O que a ferramenta espera de você',
        'Ela é de governança, não de cronograma: o detalhe de tarefas continua no seu arquivo de ' +
        'projeto, que você anexa aqui. O que vive nesta ferramenta é a decisão — gate, exceção, ' +
        'risco, mudança e dinheiro.'));
    }
  };
})(window.PMO = window.PMO || {});
