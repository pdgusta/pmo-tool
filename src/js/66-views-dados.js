/* =============================================================================
   66-views-dados.js — Importar/Exportar, Cofre de anexos, Relatórios,
                       Configurações e Auditoria
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const S = PMO.store;
  const vw = PMO.vw;

  /* =========================================================================
     IMPORTAR / EXPORTAR
     ========================================================================= */

  let estadoImport = null;   // { leitura, plano }

  const ROTULO_KIND = {
    mspdi: 'MS Project XML (MSPDI)', xer: 'Primavera P6 XER', pmxml: 'Primavera P6 PMXML',
    csv: 'Planilha CSV', xlsx: 'Planilha Excel (XLSX)', mpp: 'MS Project binário (.mpp)',
    bundle: 'Bundle nativo do PMO Tool'
  };

  PMO.views['importar'] = {
    titulo: 'Importar e exportar',
    icone: 'importar',
    grupo: 'Dados e configuração',
    sub: 'Compatibilidade por arquivo com o ecossistema Microsoft e Primavera. Nada é sobrescrito sem sua aprovação campo a campo.',

    montar: function (host, params, ctxView) {
      const wrap = U.el('div');

      // ------------------------------------------------------------ entrada
      const input = U.el('input', {
        type: 'file', multiple: true, style: { display: 'none' },
        attrs: { accept: '.xml,.xer,.pmxml,.csv,.tsv,.xlsx,.mpp,.json' },
        on: { change: function (e) { processar(Array.prototype.slice.call(e.target.files)); } }
      });

      const zona = U.el('div', { class: 'dropzona', attrs: { role: 'button', tabindex: '0' } }, [
        vw.icone('importar', { tam: 30 }),
        U.el('div', { class: 'dropzona__titulo', text: 'Solte um arquivo de projeto aqui ou clique para escolher' }),
        U.el('div', { class: 'dropzona__txt',
          text: 'MS Project XML (.xml), Primavera (.xer, .pmxml), planilhas (.csv, .xlsx), ' +
            '.mpp (só metadados do documento) e bundle nativo (.json).' }),
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
        processar(Array.prototype.slice.call(e.dataTransfer.files || []));
      });

      const areaResultado = U.el('div', { class: 'mt-4' });

      wrap.appendChild(vw.cartao({
        titulo: 'Importar arquivo', icone: 'importar',
        sub: 'O arquivo é lido no seu navegador. Nada é enviado para fora da máquina.',
        corpo: [zona, areaResultado]
      }));

      // ---------------------------------------------------- arquivos exemplo
      const hostSamples = U.el('div', { class: 'pilha pilha--2' }, [
        U.el('p', { class: 'txt-peq txt-3', text: 'Consultando arquivos de exemplo…' })
      ]);
      wrap.appendChild(vw.cartao({
        titulo: 'Arquivos de exemplo', icone: 'arquivo', classe: 'mt-4',
        sub: 'Arquivos reais nos formatos suportados, na pasta samples/ do projeto. Use para testar a importação de ponta a ponta.',
        corpo: [hostSamples]
      }));

      S.listarSamples().then(function (itens) {
        U.limpar(hostSamples);
        if (!itens.length) {
          hostSamples.appendChild(U.el('p', { class: 'txt-peq txt-3',
            text: 'Nenhum arquivo de exemplo disponível (o servidor local precisa estar rodando).' }));
          return;
        }
        itens.forEach(function (it) {
          const kindProvavel = PMO.importar.detectar(it.nome, '', null);
          hostSamples.appendChild(U.el('div', { class: 'arquivo-item' }, [
            U.el('span', { class: 'arquivo-item__ic' }, [vw.icone('arquivo', { tam: 18 })]),
            U.el('div', { class: 'arquivo-item__corpo' }, [
              U.el('div', { class: 'arquivo-item__nome', text: it.nome }),
              U.el('div', { class: 'arquivo-item__meta' }, [
                U.el('span', { text: U.tamanhoHumano(it.tamanho) }),
                U.el('span', { text: ROTULO_KIND[kindProvavel] || 'anexo binário' })
              ])
            ]),
            U.el('div', { class: 'arquivo-item__acoes' }, [
              vw.botao('Importar', { peq: true, onClick: function () {
                S.obterSample(it.nome).then(function (f) { processar([f]); })
                  .catch(function (e) { U.toast(e.message || String(e), 'erro'); });
              } })
            ])
          ]));
        });
      });

      // ---------------------------------------------------------- exportação
      wrap.appendChild(secaoExportar());

      host.appendChild(wrap);

      /* --------------------------------------------------------- processar */
      function processar(files) {
        const importaveis = files.filter(function (f) {
          return ['xml', 'xer', 'pmxml', 'csv', 'tsv', 'xlsx', 'mpp', 'json'].indexOf(U.extensao(f.name)) >= 0;
        });
        if (!importaveis.length) {
          U.toast('Nenhum arquivo em formato importável. Para anexar documentos, use a aba Anexos de um projeto.', 'warn');
          return;
        }
        if (importaveis.length > 1) {
          U.toast('Importando um arquivo por vez: ' + importaveis[0].name + '. Repita para os demais.', 'info');
        }
        const file = importaveis[0];
        U.limpar(areaResultado);
        areaResultado.appendChild(U.el('div', { class: 'linha' }, [
          U.el('div', { class: 'girador' }),
          U.el('span', { class: 'txt-peq', text: 'Lendo ' + file.name + '…' })
        ]));

        PMO.importar.lerArquivo(file).then(function (leitura) {
          estadoImport = { leitura: leitura, plano: null };
          U.limpar(areaResultado);
          areaResultado.appendChild(painelLeitura(leitura, areaResultado));
        }).catch(function (e) {
          U.limpar(areaResultado);
          areaResultado.appendChild(vw.aviso('erro', 'Falha ao ler o arquivo', e.message || String(e)));
        });
      }
    }
  };

  function painelLeitura(leitura, areaResultado) {
    const wrap = U.el('div');

    wrap.appendChild(U.el('div', { class: 'linha linha--entre mb-3' }, [
      U.el('div', {}, [
        U.el('div', { class: 'txt-forte', text: leitura.fileName }),
        U.el('div', { class: 'txt-mic txt-3',
          text: (ROTULO_KIND[leitura.kind] || 'formato desconhecido') + ' · ' +
            U.tamanhoHumano(leitura.tamanho) + ' · ' + leitura.resumo })
      ]),
      U.el('div', { class: 'linha' }, [
        vw.botao('Descartar', { peq: true, onClick: function () {
          estadoImport = null; U.limpar(areaResultado);
        } })
      ])
    ]));

    (leitura.erros || []).forEach(function (e) {
      wrap.appendChild(vw.aviso('erro', null, e));
    });

    if ((leitura.avisos || []).length) {
      const det = U.el('details', { class: 'mb-3' }, [
        U.el('summary', { class: 'txt-peq', text: (leitura.avisos.length) + ' observação(ões) do leitor' })
      ]);
      det.appendChild(U.el('ul', { class: 'pilha pilha--2 mt-2' }, leitura.avisos.map(function (a) {
        return U.el('li', { class: 'txt-peq txt-2', text: '• ' + a });
      })));
      wrap.appendChild(det);
    }

    const guardarOriginal = U.el('input', {
      type: 'checkbox', checked: true, style: { accentColor: 'var(--acento)' }
    });
    if (leitura.arquivoOriginal) {
      wrap.appendChild(U.el('label', { class: 'marcador mb-3' }, [
        guardarOriginal,
        U.el('span', { class: 'txt-peq',
          text: 'Guardar o arquivo original no cofre após aplicar (recomendado)' })
      ]));
    }

    function guardarOriginalDoBundle() {
      if (!guardarOriginal.checked || !leitura.arquivoOriginal) { return Promise.resolve(null); }
      return S.anexoAdicionar(leitura.arquivoOriginal, {
        projetoId: null,
        categoria: 'project-file',
        descricao: 'Bundle original preservado automaticamente na importação.',
        metaExtra: { origemImportacao: true, kind: leitura.kind },
        agruparComAnterior: true
      }).catch(function (e) {
        U.toast('Os dados foram importados, mas não consegui guardar o original: ' +
          (e.message || e), 'warn');
        return null;
      });
    }

    function falhaBundle(e) {
      U.toast('Não foi possível importar o bundle: ' + (e.message || e), 'erro');
    }

    // ------------------------------------------------------------- bundle
    if (leitura.bundle) {
      const b = leitura.bundle;
      wrap.appendChild(vw.aviso('info', 'Bundle nativo detectado',
        'Contém ' + ((b.projetos || []).length) + ' projeto(s), ' + ((b.programas || []).length) +
        ' programa(s) e ' + ((b.pessoas || []).length) + ' pessoa(s).'));
      wrap.appendChild(U.el('div', { class: 'linha mt-3' }, [
        vw.botao('Mesclar com o portfólio atual', { variante: 'primario', icone: 'mais', onClick: function () {
          S.importarBundle(b, 'mesclar').then(guardarOriginalDoBundle).then(function () {
            U.toast('Bundle mesclado.', 'ok');
            PMO.app.recarregarView();
          }).catch(falhaBundle);
        } }),
        vw.botao('Substituir todo o portfólio', { variante: 'perigo', onClick: function () {
          PMO.app.confirmar('Substituir portfólio',
            'Isto descarta o portfólio atual e carrega o bundle. Pode ser desfeito com Ctrl+Z.',
            { perigo: true, ok: 'Substituir' }).then(function (ok) {
            if (!ok) { return; }
            S.importarBundle(b, 'substituir').then(guardarOriginalDoBundle).then(function () {
              U.toast('Portfólio substituído.', 'ok');
              PMO.app.recarregarView();
            }).catch(falhaBundle);
          });
        } })
      ]));
      return wrap;
    }

    if (!leitura.projetosCandidatos.length) {
      wrap.appendChild(vw.aviso('aviso', 'Nada para importar',
        'O leitor não conseguiu identificar projetos neste arquivo. Confira as observações acima.'));
      return wrap;
    }

    // ------------------------------------------------- metadados de .mpp
    if (leitura.kind === 'mpp') {
      const meta = leitura.meta || {};
      const dl = U.el('dl', { class: 'pares mb-3' });
      [['Título', meta.titulo], ['Assunto', meta.assunto], ['Autor', meta.autor],
        ['Último autor', meta.ultimoAutor], ['Empresa', meta.empresa], ['Gerente', meta.gerente],
        ['Palavras-chave', meta.palavrasChave], ['Comentários', meta.comentarios],
        ['Revisão', meta.revisao], ['Criado em', meta.criadoEm ? U.fmtDataHora(meta.criadoEm) : null],
        ['Salvo em', meta.salvoEm ? U.fmtDataHora(meta.salvoEm) : null]
      ].forEach(function (par) {
        if (!par[1]) { return; }
        dl.appendChild(U.el('dt', { text: par[0] }));
        dl.appendChild(U.el('dd', { text: String(par[1]) }));
      });
      wrap.appendChild(vw.cartao({
        titulo: 'Metadados extraídos do documento', icone: 'arquivo', classe: 'mb-3',
        sub: 'Property set OLE padrão. O cronograma do .mpp não é legível fora do MS Project.',
        corpo: [dl.children.length ? dl : U.el('p', { class: 'txt-peq txt-3', text: 'Nenhum metadado legível.' })]
      }));
    }

    // ------------------------------------------------------ pré-visualização
    const cand0 = leitura.projetosCandidatos[0];
    if (cand0 && cand0._bruto && cand0._bruto.amostraTarefas && cand0._bruto.amostraTarefas.length) {
      const det = U.el('details', { class: 'mb-3' }, [
        U.el('summary', { class: 'txt-peq',
          text: 'Ver as tarefas lidas do arquivo (' + cand0._bruto.totalTarefas + ' no total, ' +
            cand0._bruto.tarefasFolha + ' folhas, ' + cand0._bruto.marcos + ' marcos)' })
      ]);
      det.appendChild(vw.tabela({
        compacta: true, legenda: 'Amostra das tarefas lidas',
        colunas: [
          { id: 'uid', rot: 'UID', valor: function (t) { return t.uid; } },
          { id: 'nome', rot: 'Tarefa', largura: '240px', render: function (t) {
            return U.el('span', { style: { paddingLeft: ((t.nivel || 1) - 1) * 10 + 'px' },
              class: t.resumo ? 'txt-forte' : '', text: (t.marco ? '◆ ' : '') + t.nome });
          } },
          { id: 'ini', rot: 'Início', num: true, valor: function (t) { return U.fmtDate(t.inicio); } },
          { id: 'fim', rot: 'Término', num: true, valor: function (t) { return U.fmtDate(t.fim); } },
          { id: 'pct', rot: '%', num: true, valor: function (t) { return U.fmtPct(t.pct, 0); } },
          { id: 'cb', rot: 'Custo baseline', num: true, valor: function (t) { return U.fmtMoney(t.custoBaseline, { compact: true }); } },
          { id: 'cr', rot: 'Custo real', num: true, valor: function (t) { return U.fmtMoney(t.custoReal, { compact: true }); } }
        ],
        linhas: cand0._bruto.amostraTarefas
      }));
      wrap.appendChild(det);
    }

    // ------------------------------------------------------- reconciliação
    const plano = PMO.importar.reconciliar(leitura.projetosCandidatos, S.state);
    estadoImport.plano = plano;
    plano.kind = leitura.kind;
    plano.fileName = leitura.fileName;

    wrap.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
      vw.kpi({ rot: 'Projetos novos', valor: String(plano.resumo.novos), valorPeq: true,
        tom: plano.resumo.novos ? 'destaque' : null }),
      vw.kpi({ rot: 'Projetos a atualizar', valor: String(plano.resumo.atualizados), valorPeq: true }),
      vw.kpi({ rot: 'Campos com divergência', valor: String(plano.resumo.camposAlterados), valorPeq: true }),
      vw.kpi({ rot: 'Sem mudança', valor: String(plano.resumo.semMudanca), valorPeq: true }),
      vw.kpi({ rot: 'Precisam de confirmação', valor: String(plano.resumo.conflitos), valorPeq: true,
        tom: plano.resumo.conflitos ? 'aviso' : null })
    ]));

    const areaPlano = U.el('div');
    wrap.appendChild(areaPlano);
    pintarPlano();

    function pintarPlano() {
      U.limpar(areaPlano);

      // conflitos
      plano.conflitos.forEach(function (cf) {
        areaPlano.appendChild(vw.aviso('aviso', 'Confirmação necessária: ' +
          (cf.candidato.nome || cf.candidato.codigo), cf.motivo, [
          vw.botao('Tratar como projeto novo', { peq: true, onClick: function () {
            plano.novos.push({ candidato: cf.candidato, motivo: 'Confirmado manualmente como novo.' });
            plano.conflitos = plano.conflitos.filter(function (x) { return x !== cf; });
            plano.resumo.novos = plano.novos.length;
            plano.resumo.conflitos = plano.conflitos.length;
            pintarPlano();
          } }),
          vw.botao('Vincular ao projeto sugerido', { peq: true, variante: 'primario', onClick: function () {
            const sub = PMO.importar.reconciliar([Object.assign({}, cf.candidato, {
              codigo: (M.projetoPorId(S.state, cf.projetoId) || {}).codigo
            })], S.state);
            if (sub.atualizacoes.length) {
              plano.atualizacoes.push(sub.atualizacoes[0]);
              plano.resumo.atualizados = plano.atualizacoes.length;
              plano.resumo.camposAlterados += sub.atualizacoes[0].campos.length;
            } else {
              U.toast('Nenhuma divergência de campo entre os dois.', 'info');
            }
            plano.conflitos = plano.conflitos.filter(function (x) { return x !== cf; });
            plano.resumo.conflitos = plano.conflitos.length;
            pintarPlano();
          } }),
          vw.botao('Ignorar', { peq: true, onClick: function () {
            plano.conflitos = plano.conflitos.filter(function (x) { return x !== cf; });
            plano.resumo.conflitos = plano.conflitos.length;
            pintarPlano();
          } })
        ]));
      });

      // novos
      if (plano.novos.length) {
        areaPlano.appendChild(vw.cartao({
          titulo: 'Projetos que serão criados', icone: 'mais', classe: 'mb-4',
          sub: 'Desmarque para não importar',
          corpo: [U.el('div', { class: 'pilha pilha--2' }, plano.novos.map(function (n) {
            const cand = n.candidato;
            const e = M.evm(M.normalizarProjeto(cand));
            const chk = U.el('input', {
              type: 'checkbox', checked: n.escolhido !== false,
              style: { accentColor: 'var(--acento)' },
              on: { change: function (ev) { n.escolhido = ev.target.checked; } }
            });
            return U.el('label', { class: 'arquivo-item', style: { cursor: 'pointer' } }, [
              chk,
              U.el('div', { class: 'arquivo-item__corpo' }, [
                U.el('div', { class: 'arquivo-item__nome',
                  text: (cand.codigo ? cand.codigo + ' · ' : '') + (cand.nome || '(sem nome)') }),
                U.el('div', { class: 'arquivo-item__meta' }, [
                  U.el('span', { text: n.motivo }),
                  U.el('span', { text: U.fmtDate(cand.dates.previstoInicio) + ' → ' + U.fmtDate(cand.dates.previstoFim) }),
                  U.el('span', { text: 'BAC ' + U.fmtMoney(e.BAC, { compact: true }) }),
                  U.el('span', { text: U.fmtPct(cand.progress.pctFisico, 0) + ' concluído' }),
                  U.el('span', { text: (cand.marcos || []).length + ' marcos' }),
                  U.el('span', { text: 'confiança ' + U.fmtPct((cand._confianca || 0) * 100, 0),
                    attrs: { title: 'Quão certo o leitor está do mapeamento de código e nome.' } })
                ])
              ])
            ]);
          }))]
        }));
      }

      // atualizações com diff
      plano.atualizacoes.forEach(function (a) {
        const marcarTodos = function (val) {
          a.campos.forEach(function (c) { c.escolhido = val; });
          pintarPlano();
        };
        const corpo = U.el('div');
        corpo.appendChild(U.el('div', { class: 'linha linha--entre mb-2' }, [
          U.el('span', { class: 'txt-mic txt-3',
            text: 'Casamento por ' + (a.motivoMatch || 'código') + ' · ' +
              a.campos.filter(function (c) { return c.escolhido; }).length + ' de ' +
              a.campos.length + ' campo(s) selecionado(s)' }),
          U.el('div', { class: 'linha' }, [
            vw.botao('Marcar todos', { peq: true, variante: 'fantasma', onClick: function () { marcarTodos(true); } }),
            vw.botao('Desmarcar todos', { peq: true, variante: 'fantasma', onClick: function () { marcarTodos(false); } })
          ])
        ]));

        a.campos.forEach(function (cp) {
          corpo.appendChild(U.el('label', { class: 'diff-campo', data: { relevancia: cp.relevancia } }, [
            U.el('input', {
              type: 'checkbox', checked: !!cp.escolhido, style: { accentColor: 'var(--acento)' },
              on: { change: function (ev) { cp.escolhido = ev.target.checked; } }
            }),
            U.el('span', { class: 'diff-campo__rot' }, [
              U.el('span', { text: cp.rotulo }),
              cp.relevancia === 'alta' ? vw.chip('crítico', 'aviso') : null
            ]),
            U.el('span', { class: 'diff-campo__de', text: cp.deTexto }),
            U.el('span', { class: 'diff-campo__seta' }, [vw.icone('seta', { tam: 13 })]),
            U.el('span', { class: 'diff-campo__para', text: cp.paraTexto })
          ]));
        });

        areaPlano.appendChild(vw.cartao({
          titulo: (a.codigo ? a.codigo + ' · ' : '') + a.nome,
          icone: 'editar', classe: 'mb-4',
          sub: 'Divergências entre o portfólio e o arquivo',
          acoes: [U.el('label', { class: 'marcador' }, [
            U.el('input', {
              type: 'checkbox', checked: a.escolhido !== false, style: { accentColor: 'var(--acento)' },
              on: { change: function (ev) { a.escolhido = ev.target.checked; } }
            }),
            U.el('span', { class: 'txt-mic', text: 'aplicar este projeto' })
          ])],
          corpo: [corpo]
        }));
      });

      if (!plano.novos.length && !plano.atualizacoes.length) {
        areaPlano.appendChild(vw.aviso('ok', 'Portfólio já está em dia',
          'Nenhuma divergência relevante entre o arquivo e os dados atuais.'));
        return;
      }

      areaPlano.appendChild(U.el('div', { class: 'linha linha--fim mt-4' }, [
        vw.botao('Cancelar', { onClick: function () { estadoImport = null; U.limpar(areaResultado); } }),
        vw.botao('Aplicar importação', { variante: 'primario', icone: 'ok', onClick: function () {
          PMO.importar.aplicar(plano, {
            kind: leitura.kind,
            fileName: leitura.fileName,
            arquivoOriginal: leitura.arquivoOriginal,
            guardarOriginal: guardarOriginal.checked
          })
            .then(function (r) {
              if (r.erros.length) {
                U.toast('Importação com problemas: ' + r.erros.join('; '), 'erro');
              } else {
                U.toast(r.criados + ' projeto(s) criado(s), ' + r.atualizados + ' atualizado(s), ' +
                  r.camposAplicados + ' campo(s) aplicado(s).', 'ok',
                  { acao: 'Desfazer', onAcao: function () { S.desfazer(); PMO.app.recarregarView(); } });
              }
              (r.avisos || []).forEach(function (a) { U.toast(a, 'warn', { duracao: 12000 }); });
              estadoImport = null;
              PMO.app.recarregarView();
            });
        } })
      ]));
    }

    return wrap;
  }

  function secaoExportar() {
    const ex = PMO.exportar;
    const c = vw.contexto(null);

    function botaoCsv(entidade, rotulo) {
      return vw.botao(rotulo, {
        peq: true, icone: 'baixar',
        desabilitado: !ex || !ex.csv,
        onClick: function () {
          try {
            const txt = ex.csv(entidade, { projetos: c.todos, bundle: c.bundle });
            U.download('portfolio-' + entidade + '-' + c.dataStatus + '.csv', txt, 'text/csv;charset=utf-8');
          } catch (e) { U.toast('Falha ao exportar: ' + (e.message || e), 'erro'); }
        }
      });
    }

    const linhas = U.el('div', { class: 'pilha pilha--3' });

    linhas.appendChild(U.el('div', {}, [
      U.el('div', { class: 'txt-mic txt-3 mb-2', text: 'Planilhas (CSV com BOM e “;” — abrem limpo no Excel pt-BR)' }),
      U.el('div', { class: 'linha' }, [
        botaoCsv('projetos', 'Projetos'), botaoCsv('evm', 'Indicadores de EVM'),
        botaoCsv('riscos', 'Riscos'), botaoCsv('issues', 'Issues'),
        botaoCsv('decisoes', 'Decisões'), botaoCsv('mudancas', 'Mudanças'),
        botaoCsv('marcos', 'Marcos'), botaoCsv('gates', 'Gates'),
        botaoCsv('beneficios', 'Benefícios'), botaoCsv('alocacoes', 'Alocações'),
        botaoCsv('financeiro-mensal', 'Curva financeira mensal'),
        botaoCsv('auditoria', 'Trilha de auditoria')
      ])
    ]));

    linhas.appendChild(U.el('div', {}, [
      U.el('div', { class: 'txt-mic txt-3 mb-2', text: 'Backup completo' }),
      U.el('div', { class: 'linha' }, [
        vw.botao('Bundle JSON (backup integral)', {
          peq: true, icone: 'baixar',
          onClick: function () {
            const b = S.exportarBundle();
            U.download('pmo-portfolio-' + U.hoje() + '.json', JSON.stringify(b, null, 2),
              'application/json;charset=utf-8');
          }
        })
      ])
    ]));

    if (ex && ex.ics) {
      linhas.appendChild(U.el('div', {}, [
        U.el('div', { class: 'txt-mic txt-3 mb-2', text: 'Calendário (.ics — importável no Outlook)' }),
        U.el('div', { class: 'linha' }, [
          vw.botao('Gates e marcos críticos', { peq: true, icone: 'calendario', onClick: function () {
            try {
              const txt = ex.icsGates ? ex.icsGates(c.todos, c.bundle) : null;
              if (!txt) { throw new Error('gerador de gates indisponível'); }
              U.download('pmo-gates-' + c.dataStatus + '.ics', txt, 'text/calendar;charset=utf-8');
            } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
          } }),
          vw.botao('Comitês e prazos de decisão', { peq: true, icone: 'calendario', onClick: function () {
            try {
              const txt = ex.icsComites ? ex.icsComites(c.bundle) : null;
              if (!txt) { throw new Error('gerador de comitês indisponível'); }
              U.download('pmo-comites-' + c.dataStatus + '.ics', txt, 'text/calendar;charset=utf-8');
            } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
          } })
        ])
      ]));
    }

    if (ex && ex.schemaSharepointCsv) {
      linhas.appendChild(U.el('div', {}, [
        U.el('div', { class: 'txt-mic txt-3 mb-2',
          text: 'Esquema para Lista do SharePoint (cabeçalho pronto para criar a lista por importação)' }),
        U.el('div', { class: 'linha' }, [
          vw.botao('Esquema de projetos', { peq: true, icone: 'baixar', onClick: function () {
            try {
              U.download('sharepoint-esquema-projetos.csv', ex.schemaSharepointCsv('projetos'),
                'text/csv;charset=utf-8');
            } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
          } }),
          vw.botao('Esquema de riscos', { peq: true, icone: 'baixar', onClick: function () {
            try {
              U.download('sharepoint-esquema-riscos.csv', ex.schemaSharepointCsv('riscos'),
                'text/csv;charset=utf-8');
            } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
          } })
        ])
      ]));
    }

    return vw.cartao({
      titulo: 'Exportar', icone: 'baixar', classe: 'mt-4',
      sub: 'Formatos pensados para o dia a dia do PMO: planilha para análise, .ics para agenda, ' +
        'bundle JSON para backup versionável.',
      corpo: [linhas]
    });
  }

  /* =========================================================================
     COFRE DE ANEXOS
     ========================================================================= */

  PMO.views['anexos'] = {
    titulo: 'Cofre de anexos',
    icone: 'anexo',
    grupo: 'Dados e configuração',
    sub: 'Onde vive a documentação de governança: business case, atas, contratos, evidências de gate e os arquivos de projeto.',

    montar: function (host, params, ctxView) {
      const c = vw.contexto(null);
      const anexos = c.bundle.anexos || [];

      const input = U.el('input', {
        type: 'file', multiple: true, style: { display: 'none' },
        on: { change: function (e) { escolherProjeto(Array.prototype.slice.call(e.target.files)); } }
      });
      const zona = U.el('div', { class: 'dropzona mb-4', attrs: { role: 'button', tabindex: '0' } }, [
        vw.icone('anexo', { tam: 28 }),
        U.el('div', { class: 'dropzona__titulo', text: 'Anexar documentos ao portfólio' }),
        U.el('div', { class: 'dropzona__txt',
          text: 'Você escolhe o projeto e a categoria depois de soltar os arquivos. ' +
            'Os blobs ficam no IndexedDB e são replicados em data/attachments/ pelo servidor local.' }),
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
        escolherProjeto(Array.prototype.slice.call(e.dataTransfer.files || []));
      });
      host.appendChild(zona);

      const soNavegador = anexos.filter(function (a) { return !a.emDisco; });
      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Anexos', valor: String(anexos.length), valorPeq: true }),
        vw.kpi({ rot: 'Volume total', valor: U.tamanhoHumano(U.sum(anexos, function (a) { return a.tamanho; })), valorPeq: true }),
        vw.kpi({ rot: 'Replicados em disco', valor: String(anexos.length - soNavegador.length), valorPeq: true,
          nota: soNavegador.length ? soNavegador.length + ' só no navegador' : 'todos replicados',
          tom: soNavegador.length ? 'aviso' : 'bom' }),
        vw.kpi({ rot: 'Projetos com anexo',
          valor: String(U.uniq(anexos.map(function (a) { return a.projetoId; }).filter(Boolean)).length),
          valorPeq: true })
      ]));

      if (soNavegador.length) {
        host.appendChild(vw.aviso('aviso', soNavegador.length + ' anexo(s) existem apenas neste navegador',
          'Se o cache for limpo, esses arquivos são perdidos. Replique em disco para ter backup real.',
          [vw.botao('Ressincronizar agora', { peq: true, variante: 'primario', onClick: function () {
            S.ressincronizarAnexos().then(function (r) {
              U.toast(r.ok + ' replicado(s), ' + r.falhas + ' falha(s).', r.falhas ? 'warn' : 'ok');
              PMO.app.recarregarView();
            });
          } })]));
      }

      if (!anexos.length) {
        host.appendChild(vw.vazio({
          icone: 'anexo', titulo: 'Nenhum anexo no cofre',
          txt: 'A intenção do app é justamente esta: a micro-gestão fica nos arquivos de projeto anexados. ' +
            'Anexe o .mpp, o business case e as atas de comitê aqui.'
        }));
        return;
      }

      host.appendChild(vw.cartao({
        titulo: 'Documentos do portfólio', icone: 'arquivo', classe: 'mt-4',
        corpo: [vw.tabela({
          legenda: 'Cofre de anexos', faixas: true,
          colunas: [
            { id: 'nome', rot: 'Arquivo', fix: true, largura: '260px', render: function (a) {
              return U.el('span', { class: 'celula-nome' }, [
                vw.icone('arquivo', { tam: 15 }),
                U.el('span', { class: 'celula-nome__txt', text: a.nomeArquivo, attrs: { title: a.nomeArquivo } })
              ]);
            } },
            { id: 'proj', rot: 'Projeto', render: function (a) {
              const p = a.projetoId ? M.projetoPorId(c.bundle, a.projetoId) : null;
              if (!p) { return U.el('span', { class: 'txt-3', text: 'sem projeto' }); }
              return U.el('button', { class: 'celula-link', type: 'button', text: p.codigo || p.nome,
                on: { click: function () { PMO.views.abrirProjeto(p.id, 'anexos'); } } });
            } },
            { id: 'cat', rot: 'Categoria', valor: function (a) { return M.rotulo('categoriasAnexo', a.categoria); } },
            { id: 'vinculo', rot: 'Vinculado a', render: function (a) {
              if (!a.entidadeRef) { return U.el('span', { class: 'txt-3', text: 'projeto' }); }
              const d = M.CAMPOS_EDICAO[a.entidadeRef.tipo] || {};
              return vw.chip((d.rotulo || a.entidadeRef.tipo) + ': ' +
                U.truncar(a.entidadeRef.rotulo || '—', 28), 'acento', { icone: 'ligacao' });
            }, valor: function (a) { return a.entidadeRef ? a.entidadeRef.tipo : ''; } },
            { id: 'tam', rot: 'Tamanho', num: true, valor: function (a) { return U.tamanhoHumano(a.tamanho); } },
            { id: 'em', rot: 'Enviado em', num: true, valor: function (a) { return U.fmtDataHora(a.enviadoEm); } },
            { id: 'onde', rot: 'Armazenamento', render: function (a) {
              return a.emDisco
                ? vw.chip('navegador + disco', 'bom', { icone: 'ok' })
                : vw.chip('só navegador', 'aviso', { icone: 'alerta', titulo: 'Sem backup em disco' });
            } },
            { id: 'acoes', rot: 'Ações', cent: true, ord: false, render: function (a) {
              return U.el('div', { class: 'linha' }, [
                vw.botaoIcone('baixar', 'Baixar', function () {
                  S.anexoBaixar(a.id).catch(function (e) { U.toast(e.message || String(e), 'erro'); });
                }, { tam: 14 }),
                vw.botaoIcone('lixeira', 'Remover', function () {
                  PMO.app.confirmar('Remover anexo', 'Remover "' + a.nomeArquivo + '" do cofre?',
                    { perigo: true, ok: 'Remover' }).then(function (ok) {
                    if (!ok) { return; }
                    S.anexoRemover(a.id).then(function () {
                      U.toast('Anexo removido.', 'ok');
                      PMO.app.recarregarView();
                    });
                  });
                }, { tam: 14 })
              ]);
            } }
          ],
          linhas: U.sortBy(anexos, function (a) { return a.enviadoEm; }, 'desc')
        })]
      }));
    }
  };

  function escolherProjeto(files) {
    if (!files.length) { return; }
    const projetos = U.sortBy(S.state.projetos, function (p) { return p.codigo || p.nome; });
    if (!projetos.length) {
      U.toast('Cadastre um projeto antes de anexar documentos.', 'warn');
      return;
    }
    const selProj = U.el('select', { class: 'campo' },
      [U.el('option', { value: '', text: '— sem projeto (nível de portfólio) —' })]
        .concat(projetos.map(function (p) {
          return U.el('option', { value: p.id, text: (p.codigo ? p.codigo + ' · ' : '') + p.nome });
        })));
    const selCat = U.el('select', { class: 'campo' }, M.tax('categoriasAnexo').map(function (x) {
      return U.el('option', { value: x.id, text: x.rotulo });
    }));
    const desc = U.el('input', { class: 'campo', type: 'text', placeholder: 'Opcional' });

    PMO.app.abrirModal('Anexar ' + files.length + ' arquivo(s)', U.el('div', { class: 'pilha pilha--3' }, [
      U.el('div', { class: 'pilha pilha--2' }, files.map(function (f) {
        return U.el('div', { class: 'arquivo-item' }, [
          U.el('span', { class: 'arquivo-item__ic' }, [vw.icone('arquivo', { tam: 16 })]),
          U.el('div', { class: 'arquivo-item__corpo' }, [
            U.el('div', { class: 'arquivo-item__nome', text: f.name }),
            U.el('div', { class: 'arquivo-item__meta' }, [U.el('span', { text: U.tamanhoHumano(f.size) })])
          ])
        ]);
      })),
      U.el('div', { class: 'campo-grupo' }, [
        U.el('label', { class: 'campo-grupo__rot', text: 'Projeto' }), selProj]),
      U.el('div', { class: 'campo-grupo' }, [
        U.el('label', { class: 'campo-grupo__rot', text: 'Categoria do documento' }), selCat]),
      U.el('div', { class: 'campo-grupo' }, [
        U.el('label', { class: 'campo-grupo__rot', text: 'Descrição' }), desc])
    ]), {
      acoes: [
        vw.botao('Cancelar', { onClick: PMO.app.fecharModal }),
        vw.botao('Anexar', { variante: 'primario', onClick: function () {
          const projetoId = selProj.value || null;
          const categoria = selCat.value;
          const descricao = desc.value;
          PMO.app.fecharModal();
          let feitos = 0;
          const lista = files.slice();
          const total = lista.length;
          (function proximo() {
            if (!lista.length) {
              U.toast(feitos + ' de ' + total + ' arquivo(s) anexado(s).', feitos === total ? 'ok' : 'warn');
              PMO.app.recarregarView();
              return;
            }
            const f = lista.shift();
            S.anexoAdicionar(f, { projetoId: projetoId, categoria: categoria, descricao: descricao })
              .then(function () { feitos += 1; })
              .catch(function (e) { U.toast('Falha em "' + f.name + '": ' + (e.message || e), 'erro'); })
              .then(proximo);
          })();
        } })
      ]
    });
  }
  PMO.views.escolherProjetoParaAnexo = escolherProjeto;

  /* =========================================================================
     RELATÓRIOS
     ========================================================================= */

  /* Público escolhido em cada cartão. Fica fora do `montar` para sobreviver ao
     redesenho da view quando o Store emite 'change'. */
  let variantePacote = null;
  let varianteSr = null;

  PMO.views['relatorios'] = {
    titulo: 'Relatórios e comitê',
    icone: 'relatorio',
    grupo: 'Governança',
    sub: 'Artefatos prontos para a reunião: pacote de comitê, status report por projeto e resumo para colar no Teams.',
    filtros: ['busca', 'programaId', 'rag', 'estagio'],

    montar: function (host, params, ctxView) {
      const c = vw.contexto(PMO.app.filtro);
      const ex = PMO.exportar;

      if (!ex) {
        host.appendChild(vw.aviso('erro', 'Módulo de relatórios ausente',
          'Esta compilação não inclui o gerador de relatórios.'));
        return;
      }

      const selPacote = vw.seletorVariante(variantePacote, {
        classe: 'mb-3',
        onMudar: function (v) { variantePacote = v; }
      });
      const selSr = vw.seletorVariante(varianteSr, {
        classe: 'mb-3',
        onMudar: function (v) { varianteSr = v; }
      });

      host.appendChild(vw.cartao({
        titulo: 'Pacote do Comitê de Portfólio', icone: 'relatorio', classe: 'mb-4',
        sub: 'Documento para virar PDF, com sumário executivo, exceções, decisões solicitadas, ' +
          'gates e riscos. O público escolhido define quais seções entram e o que fica de fora.',
        corpo: [
          U.el('p', { class: 'txt-peq txt-2 mb-3',
            text: 'Escopo atual: ' + c.projetos.length + ' projeto(s) do filtro · data de status ' +
              U.fmtDate(c.dataStatus) + '.' }),
          selPacote,
          U.el('div', { class: 'linha' }, [
            vw.botao('Abrir para impressão', {
              variante: 'primario', icone: 'relatorio',
              desabilitado: !ex.pacoteComiteHtml,
              onClick: function () {
                try {
                  const html = ex.pacoteComiteHtml(c.projetos, c.bundle,
                    { dataStatus: c.dataStatus, variante: selPacote.valor() });
                  if (ex.abrirParaImpressao) { ex.abrirParaImpressao(html); }
                  else { U.download('pacote-comite.html', html, 'text/html;charset=utf-8'); }
                } catch (e) { U.toast('Falha ao gerar: ' + (e.message || e), 'erro'); }
              }
            }),
            vw.botao('Baixar HTML', {
              icone: 'baixar', desabilitado: !ex.pacoteComiteHtml,
              onClick: function () {
                try {
                  ex.baixarPacoteComite(c.projetos, c.bundle,
                    { dataStatus: c.dataStatus, variante: selPacote.valor() });
                } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
              }
            }),
            vw.botao('Resumo em Markdown', {
              icone: 'baixar', desabilitado: !ex.markdownPortfolio,
              onClick: function () {
                try {
                  U.download('portfolio-resumo-' + c.dataStatus + '.md',
                    ex.markdownPortfolio(c.projetos, c.bundle), 'text/markdown;charset=utf-8');
                } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
              }
            })
          ])
        ]
      }));

      host.appendChild(vw.cartao({
        titulo: 'Status report por projeto', icone: 'arquivo',
        sub: 'Um documento por projeto, com faróis, indicadores, marcos e o que o público escolhido pode ver. ' +
          'A versão executiva cabe em uma folha A4.',
        corpo: [selSr, c.projetos.length ? vw.tabela({
          legenda: 'Geração de status report por projeto', faixas: true,
          colunas: [
            { id: 'cod', rot: 'Projeto', fix: true, valor: function (p) { return p.codigo || '—'; } },
            { id: 'nome', rot: 'Nome', largura: '240px', valor: function (p) { return U.truncar(p.nome, 40); } },
            { id: 'rag', rot: 'Farol', cent: true, render: function (p) { return vw.farol(c.saude(p).rag); } },
            { id: 'sr', rot: 'Último reporte', num: true, render: function (p) {
              const ult = U.sortBy(p.statusReports || [], function (s) { return s.reportadoEm; }, 'desc')[0];
              if (!ult) { return vw.chip('nunca', 'critico', { icone: 'alerta' }); }
              const dias = U.diffDays(ult.reportadoEm, c.dataStatus);
              return U.el('span', { class: 'txt-num' + (dias > c.limiares.statusReportAtrasoDias.vermelho ? ' txt-ruim' : ''),
                text: U.fmtDate(ult.reportadoEm) + ' (' + dias + 'd)' });
            } },
            { id: 'acoes', rot: 'Gerar', cent: true, ord: false, render: function (p) {
              return U.el('div', { class: 'linha' }, [
                vw.botao('Imprimir', { peq: true, desabilitado: !ex.statusReportHtml, onClick: function () {
                  try {
                    const html = ex.statusReportHtml(p,
                      { bundle: c.bundle, dataStatus: c.dataStatus, variante: selSr.valor() });
                    if (ex.abrirParaImpressao) { ex.abrirParaImpressao(html); }
                    else { U.download((p.codigo || 'projeto') + '-status.html', html, 'text/html;charset=utf-8'); }
                  } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
                } }),
                vw.botao('HTML', { peq: true, variante: 'fantasma',
                  desabilitado: !ex.baixarStatusReport, onClick: function () {
                    try {
                      ex.baixarStatusReport(p,
                        { bundle: c.bundle, dataStatus: c.dataStatus, variante: selSr.valor() });
                    } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
                  } }),
                vw.botao('MD', { peq: true, variante: 'fantasma', desabilitado: !ex.markdown, onClick: function () {
                  try {
                    U.download((p.codigo || 'projeto') + '-status-' + c.dataStatus + '.md',
                      ex.markdown(p, c.bundle), 'text/markdown;charset=utf-8');
                  } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
                } }),
                vw.botao('MSPDI', { peq: true, variante: 'fantasma', desabilitado: !ex.mspdi, onClick: function () {
                  try {
                    U.download((p.codigo || 'projeto') + '.xml', ex.mspdi(p, c.bundle),
                      'application/xml;charset=utf-8');
                  } catch (e) { U.toast('Falha: ' + (e.message || e), 'erro'); }
                } })
              ]);
            } }
          ],
          linhas: c.projetos
        }) : vw.vazio({ icone: 'relatorio', titulo: 'Nenhum projeto no filtro' })]
      }));
    }
  };

  /* =========================================================================
     CONFIGURAÇÕES
     ========================================================================= */

  PMO.views['config'] = {
    titulo: 'Configurações',
    icone: 'config',
    grupo: 'Dados e configuração',
    sub: 'Limiares de governança, pesos de priorização, cadastros e qualidade dos dados.',

    montar: function (host, params, ctxView) {
      const c = vw.contexto(null);
      const b = c.bundle;

      // ------------------------------------------------------ organização
      const inpOrg = U.el('input', { class: 'campo', type: 'text', value: (b.meta || {}).orgName || '' });
      const inpData = U.el('input', { class: 'campo', type: 'date', value: (b.meta || {}).dataStatus || U.hoje() });
      const chkDisco = U.el('input', { type: 'checkbox', checked: (b.settings || {}).salvarEmDisco !== false });

      host.appendChild(vw.cartao({
        titulo: 'Organização e data de status', icone: 'config', classe: 'mb-4',
        corpo: [
          U.el('div', { class: 'form-grade' }, [
            U.el('div', { class: 'campo-grupo' }, [
              U.el('label', { class: 'campo-grupo__rot', text: 'Nome da organização' }), inpOrg]),
            U.el('div', { class: 'campo-grupo' }, [
              U.el('label', { class: 'campo-grupo__rot', text: 'Data de status do portfólio' }), inpData,
              U.el('span', { class: 'campo-grupo__ajuda',
                text: 'Todos os indicadores de EVM são calculados nesta data.' })])
          ]),
          U.el('label', { class: 'marcador mt-3' }, [chkDisco,
            U.el('span', { text: 'Replicar dados em disco (data/portfolio.json) quando o servidor local estiver ativo' })]),
          U.el('div', { class: 'linha linha--fim mt-3' }, [
            vw.botao('Salvar', { variante: 'primario', onClick: function () {
              S.mutate('Atualizar configurações gerais', function (d) {
                d.meta.orgName = inpOrg.value.trim() || 'Minha organização';
                const nd = U.parseDate(inpData.value);
                if (nd) { d.meta.dataStatus = nd; }
                d.settings.salvarEmDisco = chkDisco.checked;
              }, { entidade: 'settings', resumo: 'configurações gerais' }).then(function () {
                U.toast('Configurações salvas.', 'ok');
                PMO.app.recarregarView();
              });
            } })
          ])
        ]
      }));

      // --------------------------------------------------------- aparência
      const DENSIDADES = [
        ['compacta', 'Compacta', 'Mais linhas por tela. Bom para monitor grande e revisão em lote.'],
        ['padrao', 'Padrão', 'Equilíbrio entre respiro e quantidade de informação.'],
        ['confortavel', 'Confortável', 'Alvos maiores e mais espaço. Bom para uso prolongado e telas sensíveis.']
      ];
      const TEMAS = [
        ['auto', 'Automático', 'Segue a preferência do sistema operacional.'],
        ['claro', 'Claro', 'Sempre claro, independente do sistema.'],
        ['escuro', 'Escuro', 'Sempre escuro, independente do sistema.']
      ];

      function grupoOpcoes(rotulo, ajuda, opcoes, atual, onEscolher) {
        const grupo = U.el('div', { class: 'grupo-botoes', attrs: { role: 'group', 'aria-label': rotulo } },
          opcoes.map(function (o) {
            return vw.botao(o[1], {
              titulo: o[2],
              onClick: function () { onEscolher(o[0]); }
            });
          }));
        Array.prototype.forEach.call(grupo.children, function (btn, i) {
          btn.setAttribute('aria-pressed', String(opcoes[i][0] === atual));
        });
        const desc = (opcoes.find(function (o) { return o[0] === atual; }) || opcoes[0])[2];
        return U.el('div', { class: 'campo-grupo' }, [
          U.el('span', { class: 'campo-grupo__rot', text: rotulo }),
          grupo,
          U.el('span', { class: 'campo-grupo__ajuda', text: ajuda + ' ' + desc })
        ]);
      }

      host.appendChild(vw.cartao({
        titulo: 'Aparência', icone: 'config', classe: 'mb-4',
        sub: 'Vale para esta instalação e viaja junto com o portfólio.',
        corpo: [
          U.el('div', { class: 'form-grade' }, [
            grupoOpcoes('Tema', 'Em uso:', TEMAS, PMO.app.temaEmUso ? PMO.app.temaEmUso() : 'auto',
              function (v) { PMO.app.tema(v); }),
            grupoOpcoes('Densidade', 'Em uso:', DENSIDADES, PMO.app.densidadeAtual(),
              function (v) {
                PMO.app.densidade(v).then(function () {
                  U.toast('Densidade: ' + v + '.', 'ok');
                  PMO.app.recarregarView();
                });
              })
          ])
        ]
      }));

      // ---------------------------------------------------------- limiares
      const L = U.clonar((b.settings || {}).limiares || M.LIMIARES_PADRAO);
      const camposLim = [
        ['spi', 'SPI', 'razão', 'Índice de desempenho de prazo abaixo do qual o farol muda.'],
        ['cpi', 'CPI', 'razão', 'Índice de desempenho de custo abaixo do qual o farol muda.'],
        ['desvioDias', 'Desvio de prazo', 'dias', 'Dias de atraso do término previsto sobre a baseline.'],
        ['estouroCustoPct', 'Estouro de custo', '%', 'Percentual de estouro projetado (EAC sobre BAC).'],
        ['riscosAltosAbertos', 'Riscos altos abertos', 'qtd', 'Quantidade de riscos com score alto.'],
        ['issuesCriticasAbertas', 'Issues críticas abertas', 'qtd', 'Quantidade de issues de severidade crítica.'],
        ['gateAtrasadoDias', 'Gate atrasado', 'dias', 'Dias de atraso na decisão do próximo gate.'],
        ['statusReportAtrasoDias', 'Status report atrasado', 'dias', 'Dias desde o último reporte.'],
        ['alocacaoPessoaPct', 'Alocação por pessoa', '%', 'Percentual de alocação considerado sobrecarga.']
      ];
      const gradeLim = U.el('div', { class: 'form-grade form-grade--2' });
      camposLim.forEach(function (cf) {
        const chave = cf[0];
        const inv = ['desvioDias', 'estouroCustoPct', 'riscosAltosAbertos', 'issuesCriticasAbertas',
          'gateAtrasadoDias', 'statusReportAtrasoDias', 'alocacaoPessoaPct'].indexOf(chave) >= 0;
        const inpA = U.el('input', { class: 'campo campo--num', type: 'number', step: 'any',
          value: String(L[chave].ambar) });
        const inpV = U.el('input', { class: 'campo campo--num', type: 'number', step: 'any',
          value: String(L[chave].vermelho) });
        inpA.addEventListener('input', function () { L[chave].ambar = U.num(inpA.value, L[chave].ambar); });
        inpV.addEventListener('input', function () { L[chave].vermelho = U.num(inpV.value, L[chave].vermelho); });
        gradeLim.appendChild(U.el('div', { class: 'campo-grupo' }, [
          U.el('label', { class: 'campo-grupo__rot' }, [
            U.el('span', { text: cf[1] + ' (' + cf[2] + ')' }),
            U.el('span', { class: 'dica', text: '?', attrs: { title: cf[3] } })
          ]),
          U.el('div', { class: 'linha' }, [
            U.el('span', { class: 'txt-mic txt-3', text: 'âmbar' }), inpA,
            U.el('span', { class: 'txt-mic txt-3', text: 'vermelho' }), inpV
          ]),
          U.el('span', { class: 'campo-grupo__ajuda',
            text: inv ? 'valores MAIORES são piores' : 'valores MENORES são piores' })
        ]));
      });

      const sig = M.LIMIARES_PADRAO.evmSignificancia;
      host.appendChild(vw.cartao({
        titulo: 'Limiares de governança', icone: 'alvo', classe: 'mb-4',
        sub: 'Definem quando o farol de um projeto vira âmbar ou vermelho. O farol nunca é digitado: ele é calculado.',
        corpo: [
          gradeLim,
          U.el('div', { class: 'divisor' }),
          vw.aviso('info', 'Significância dos índices de EVM',
            'SPI e CPI só entram no farol depois que o projeto tem massa suficiente: ' +
            'valor planejado ≥ ' + sig.pctPlanejadoMinimo + '% do BAC para o SPI, e custo incorrido ≥ ' +
            sig.acPctBacMinimo + '% do BAC para o CPI. Antes disso o índice é exibido marcado como ' +
            '“n/s” (não significativo) e a projeção de EAC assume o restante ao ritmo planejado, ' +
            'em vez de extrapolar um CPI instável.'),
          U.el('div', { class: 'linha linha--fim mt-3' }, [
            vw.botao('Restaurar padrões', { onClick: function () {
              S.mutate('Restaurar limiares padrão', function (d) {
                d.settings.limiares = U.clonar(M.LIMIARES_PADRAO);
              }, { entidade: 'settings', resumo: 'limiares restaurados' }).then(function () {
                U.toast('Limiares restaurados.', 'ok'); PMO.app.recarregarView();
              });
            } }),
            vw.botao('Salvar limiares', { variante: 'primario', onClick: function () {
              S.mutate('Atualizar limiares de governança', function (d) {
                d.settings.limiares = U.mesclar(U.clonar(M.LIMIARES_PADRAO), L);
              }, { entidade: 'settings', resumo: 'limiares atualizados' }).then(function () {
                U.toast('Limiares salvos. Os faróis foram recalculados.', 'ok');
                PMO.app.recarregarView();
              });
            } })
          ])
        ]
      }));

      // -------------------------------------------------- qualidade de dados
      const val = M.validar(b);
      host.appendChild(vw.cartao({
        titulo: 'Qualidade dos dados', icone: 'ok', classe: 'mb-4',
        sub: val.erros.length + ' erro(s) e ' + val.avisos.length + ' aviso(s) no portfólio',
        corpo: [
          !val.erros.length && !val.avisos.length
            ? vw.aviso('ok', 'Nenhum problema encontrado', 'Os dados do portfólio estão consistentes.')
            : U.el('div', { class: 'pilha pilha--2' },
              val.erros.map(function (e) { return vw.aviso('erro', null, e.msg); })
                .concat(val.avisos.slice(0, 40).map(function (a) { return vw.aviso('aviso', null, a.msg); })))
        ]
      }));

      // ----------------------------------------------------------- cadastros
      host.appendChild(vw.cartao({
        titulo: 'Pessoas', icone: 'pessoas', classe: 'mb-4',
        sub: (b.pessoas || []).length + ' cadastrada(s)',
        corpo: [(b.pessoas || []).length ? vw.tabela({
          compacta: true, faixas: true, legenda: 'Cadastro de pessoas',
          colunas: [
            { id: 'nome', rot: 'Nome', render: function (p) { return vw.pessoa(b, p.id, { peq: true }); } },
            { id: 'papel', rot: 'Papel', valor: function (p) { return p.papel; } },
            { id: 'bu', rot: 'Unidade', valor: function (p) { return M.nomeBu(b, p.buId); } },
            { id: 'cap', rot: 'Capacidade', num: true, valor: function (p) { return p.capacidadeHorasMes + ' h/mês'; } },
            { id: 'custo', rot: 'Custo/hora', num: true, valor: function (p) { return U.fmtMoney(p.custoHora); } },
            { id: 'proj', rot: 'Projetos', num: true, valor: function (p) {
              return (b.projetos || []).filter(function (x) {
                return x.pmId === p.id || (x.alocacoes || []).some(function (a) { return a.pessoaId === p.id; });
              }).length;
            } }
          ],
          linhas: b.pessoas
        }) : U.el('p', { class: 'txt-peq txt-3', text: 'Nenhuma pessoa cadastrada.' })]
      }));

      host.appendChild(vw.cartao({
        titulo: 'Programas', icone: 'kanban', classe: 'mb-4',
        sub: (b.programas || []).length + ' cadastrado(s)',
        corpo: [(b.programas || []).length ? vw.tabela({
          compacta: true, faixas: true, legenda: 'Cadastro de programas',
          colunas: [
            { id: 'cod', rot: 'Código', valor: function (p) { return p.codigo; } },
            { id: 'nome', rot: 'Programa', valor: function (p) { return p.nome; } },
            { id: 'sponsor', rot: 'Sponsor', render: function (p) { return vw.pessoa(b, p.sponsorId, { peq: true, curto: true }); } },
            { id: 'dono', rot: 'Dono', render: function (p) { return vw.pessoa(b, p.donoId, { peq: true, curto: true }); } },
            { id: 'proj', rot: 'Projetos', num: true, valor: function (p) {
              return (b.projetos || []).filter(function (x) { return x.programaId === p.id; }).length;
            } },
            { id: 'bac', rot: 'BAC', num: true, valor: function (p) {
              return U.fmtMoney(U.sum((b.projetos || []).filter(function (x) {
                return x.programaId === p.id;
              }), function (x) { return M.bac(x); }), { compact: true });
            } }
          ],
          linhas: b.programas
        }) : U.el('p', { class: 'txt-peq txt-3', text: 'Nenhum programa cadastrado.' })]
      }));

      // ------------------------------------------------------- zona de risco
      host.appendChild(vw.cartao({
        titulo: 'Ações destrutivas', icone: 'alerta',
        sub: 'Todas podem ser desfeitas com Ctrl+Z enquanto a aba estiver aberta.',
        corpo: [U.el('div', { class: 'linha' }, [
          vw.botao('Recarregar demonstração', { icone: 'importar', onClick: PMO.app.carregarDemo }),
          vw.botao('Limpar portfólio', { variante: 'perigo', icone: 'lixeira', onClick: function () {
            PMO.app.confirmar('Limpar portfólio',
              'Remove todos os projetos, programas, pessoas e anexos. Pode ser desfeito com Ctrl+Z.',
              { perigo: true, ok: 'Limpar tudo' }).then(function (ok) {
              if (!ok) { return; }
              S.limparTudo().then(function () {
                U.toast('Portfólio limpo.', 'ok');
                PMO.app.recarregarView();
              });
            });
          } })
        ])]
      }));
    }
  };

  /* =========================================================================
     AUDITORIA
     ========================================================================= */

  PMO.views['auditoria'] = {
    titulo: 'Auditoria',
    icone: 'auditoria',
    grupo: 'Dados e configuração',
    sub: 'Toda alteração no portfólio deixa rastro. É o que sustenta a governança em auditoria interna.',

    montar: function (host, params, ctxView) {
      const b = S.state;
      const log = (b.auditLog || []).slice().reverse();
      const imports = (b.imports || []).slice().reverse();

      host.appendChild(U.el('div', { class: 'grade grade--kpi mb-4' }, [
        vw.kpi({ rot: 'Eventos registrados', valor: U.fmtNum(log.length, 0), valorPeq: true }),
        vw.kpi({ rot: 'Importações', valor: String(imports.length), valorPeq: true }),
        vw.kpi({ rot: 'Último evento',
          valor: log.length ? U.fmtDataHora(log[0].em) : '—', valorPeq: true }),
        vw.kpi({ rot: 'Schema', valor: 'v' + M.SCHEMA_VERSION, valorPeq: true,
          nota: 'app ' + M.APP_VERSION })
      ]));

      if (imports.length) {
        host.appendChild(vw.cartao({
          titulo: 'Histórico de importações', icone: 'importar', classe: 'mb-4',
          corpo: [vw.tabela({
            compacta: true, faixas: true, legenda: 'Importações realizadas',
            colunas: [
              { id: 'em', rot: 'Quando', num: true, valor: function (x) { return U.fmtDataHora(x.em); } },
              { id: 'kind', rot: 'Formato', valor: function (x) {
                return ROTULO_KIND[x.kind] || String(x.kind || '—').toUpperCase();
              } },
              { id: 'arq', rot: 'Arquivo', valor: function (x) { return x.fileName; } },
              { id: 'res', rot: 'Resultado', valor: function (x) { return x.resumo; } }
            ],
            linhas: imports
          })]
        }));
      }

      host.appendChild(vw.cartao({
        titulo: 'Trilha de auditoria', icone: 'auditoria',
        sub: 'Mais recentes primeiro. A tabela mostra até 400; o histórico completo é preservado e incluído no CSV.',
        acoes: [vw.botao('Exportar CSV', { peq: true, icone: 'baixar', onClick: function () {
          U.download('pmo-auditoria-' + U.hoje() + '.csv',
            U.paraCsv(['Quando', 'Quem', 'Ação', 'Entidade', 'ID', 'Detalhe'],
              log.map(function (a) {
                return [U.fmtDataHora(a.em), a.ator, a.acao, a.entidade || '', a.entidadeId || '', a.resumo || ''];
              })), 'text/csv;charset=utf-8');
        } })],
        corpo: [log.length ? vw.tabela({
          compacta: true, faixas: true, legenda: 'Trilha de auditoria do portfólio',
          colunas: [
            { id: 'em', rot: 'Quando', num: true, largura: '140px', valor: function (a) { return U.fmtDataHora(a.em); } },
            { id: 'ator', rot: 'Quem', valor: function (a) { return a.ator; } },
            { id: 'acao', rot: 'Ação', largura: '220px', valor: function (a) { return a.acao; } },
            { id: 'ent', rot: 'Entidade', valor: function (a) { return a.entidade || '—'; } },
            { id: 'alvo', rot: 'Alvo', render: function (a) {
              if (a.entidade === 'projeto' && a.entidadeId) {
                const p = M.projetoPorId(b, a.entidadeId);
                if (p) {
                  return U.el('button', { class: 'celula-link', type: 'button', text: p.codigo || p.nome,
                    on: { click: function () { PMO.views.abrirProjeto(p.id); } } });
                }
              }
              return U.el('span', { class: 'txt-3 txt-mono txt-mic', text: a.entidadeId || '—' });
            } },
            { id: 'res', rot: 'Detalhe', valor: function (a) { return a.resumo; } }
          ],
          linhas: log.slice(0, 400)
        }) : vw.vazio({ icone: 'auditoria', titulo: 'Nenhum evento registrado ainda' })]
      }));
    }
  };
})(window.PMO = window.PMO || {});
