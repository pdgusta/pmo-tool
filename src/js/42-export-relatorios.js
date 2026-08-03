/* =============================================================================
   42-export-relatorios.js — status report, pacote de comitê, Markdown e MSPDI
   Depende de: 00-util.js, 10-model.js  (complementa 40-export-dados.js)

   Os HTML gerados SAEM do app: por isso redeclaram os tokens de cor com valores
   literais da paleta validada de 00-theme.css. São autocontidos (zero recurso
   externo) e desenhados para virar PDF via impressão do navegador.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;
  const ex = PMO.exportar = PMO.exportar || {};

  function esc(s) {
    if (s === null || s === undefined) { return ''; }
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const RAG_INFO = {
    verde: { rot: 'Verde', cor: '#0ca30c', bg: '#e6f6e6', ic: '&#10003;' },
    ambar: { rot: 'Âmbar', cor: '#8a6100', bg: '#fdf3dc', ic: '&#9888;' },
    vermelho: { rot: 'Vermelho', cor: '#d03b3b', bg: '#fbe7e7', ic: '&#9679;' },
    azul: { rot: 'Concluído', cor: '#2a78d6', bg: '#e4eefb', ic: '&#10004;' },
    cinza: { rot: 'Suspenso', cor: '#52514e', bg: '#eeeeec', ic: '&#8210;' }
  };

  /** Farol impresso: cor + ícone + rótulo. Nunca só cor (vale no P&B também). */
  function farol(rag) {
    const i = RAG_INFO[rag] || RAG_INFO.cinza;
    return '<span class="farol" style="background:' + i.bg + ';color:' + i.cor + '">' +
      '<b>' + i.ic + '</b> ' + esc(i.rot) + '</span>';
  }

  const CSS_BASE = [
    '@page { size: A4; margin: 14mm; }',
    ':root{--tinta1:#0b0b0b;--tinta2:#52514e;--tinta3:#898781;--linha:#e1e0d9;',
    '--eixo:#c3c2b7;--sup1:#fcfcfb;--sup2:#f2f1ed;--acento:#2a78d6;--acentoBg:#e4eefb;',
    '--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--bom:#0ca30c;--aviso:#fab219;--critico:#d03b3b;}',
    '*{box-sizing:border-box}',
    'html{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'font-size:10.5pt;line-height:1.45;color:var(--tinta1);background:#fff}',
    '.pg{max-width:190mm;margin:0 auto;padding:6mm 0}',
    '.quebra{page-break-after:always}',
    'h1{font-size:19pt;margin:0 0 2mm;letter-spacing:-.02em}',
    'h2{font-size:13pt;margin:7mm 0 2.5mm;padding-bottom:1.5mm;border-bottom:1px solid var(--linha)}',
    'h3{font-size:11pt;margin:5mm 0 2mm}',
    'p{margin:0 0 2.5mm}',
    '.sub{color:var(--tinta2);font-size:9.5pt;margin:0}',
    '.mudo{color:var(--tinta3)}',
    '.cab{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;',
    'border-bottom:2px solid var(--tinta1);padding-bottom:3mm;margin-bottom:4mm}',
    '.farol{display:inline-block;padding:1mm 2.5mm;border-radius:99px;font-size:9pt;font-weight:700;white-space:nowrap}',
    '.grade{display:grid;gap:3mm}',
    '.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1fr 1fr 1fr}',
    '.g4{grid-template-columns:repeat(4,1fr)}.g5{grid-template-columns:repeat(5,1fr)}',
    '.kpi{border:1px solid var(--linha);border-radius:3mm;padding:2.5mm 3mm;background:var(--sup1)}',
    '.kpi .r{font-size:8pt;color:var(--tinta2);text-transform:uppercase;letter-spacing:.04em}',
    '.kpi .v{font-size:14pt;font-weight:700;letter-spacing:-.02em;margin-top:.6mm}',
    '.kpi .n{font-size:8pt;color:var(--tinta3)}',
    'table{width:100%;border-collapse:collapse;font-size:9pt;margin:2mm 0 3mm}',
    'caption{text-align:left;font-size:8.5pt;color:var(--tinta3);padding-bottom:1.5mm}',
    /* legenda só para leitor de tela: a faixa de indicadores já se explica no impresso */
    'caption.oculta{position:absolute;width:1px;height:1px;padding:0;margin:-1px;',
    'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
    'th,td{padding:1.6mm 2mm;text-align:left;border-bottom:1px solid var(--linha);vertical-align:top}',
    'thead th{background:var(--sup2);font-size:8pt;text-transform:uppercase;letter-spacing:.04em;',
    'color:var(--tinta2);border-bottom:1px solid var(--eixo)}',
    'td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}',
    'tbody tr{break-inside:avoid}',
    'tfoot td{font-weight:700;background:var(--sup2);border-top:1.5px solid var(--eixo)}',
    '.cx{border:1px solid var(--linha);border-radius:3mm;padding:3mm;background:var(--sup1);break-inside:avoid}',
    '.cx h3{margin-top:0}',
    '.aviso{border-left:3px solid var(--aviso);background:#fdf3dc;padding:2.5mm 3mm;border-radius:0 2mm 2mm 0;margin:2mm 0}',
    '.crit{border-left-color:var(--critico);background:#fbe7e7}',
    '.ok{border-left-color:var(--bom);background:#e6f6e6}',
    '.bom{color:#006300;font-weight:600}.ruim{color:var(--critico);font-weight:600}',
    '.n{font-variant-numeric:tabular-nums}',
    '.rod{margin-top:6mm;padding-top:2mm;border-top:1px solid var(--linha);',
    'font-size:8pt;color:var(--tinta3);display:flex;justify-content:space-between}',
    'ul{margin:0 0 2.5mm;padding-left:5mm}li{margin-bottom:1mm}',
    '.barra{height:3mm;background:var(--sup2);border-radius:99px;overflow:hidden;position:relative}',
    '.barra i{display:block;height:100%;background:var(--s1);border-radius:99px}',
    '.tags{display:flex;flex-wrap:wrap;gap:1.5mm}',
    '.tag{font-size:8pt;background:var(--sup2);border-radius:99px;padding:.5mm 2mm;color:var(--tinta2)}',
    '.selo{display:inline-block;border:1px solid var(--eixo);background:var(--sup2);',
    'border-radius:99px;padding:.7mm 2.5mm;font-size:8pt;font-weight:600;color:var(--tinta2);white-space:nowrap}',
    /* variante executiva: tudo encolhe para caber em uma folha A4 */
    '.compacto{font-size:9pt;line-height:1.35}',
    '.compacto h1{font-size:16pt}',
    '.compacto h2{font-size:10.5pt;margin:3.5mm 0 1.5mm;padding-bottom:1mm}',
    '.compacto h3{font-size:9.5pt;margin:2.5mm 0 1mm}',
    '.compacto p{margin:0 0 1.5mm}',
    '.compacto table{font-size:8pt;margin:1.5mm 0 2mm}',
    '.compacto th,.compacto td{padding:1mm 1.5mm}',
    '.compacto .kpi{padding:1.8mm 2.2mm}',
    '.compacto .kpi .v{font-size:11.5pt}',
    '.compacto .grade{gap:2mm}',
    '.compacto ul{margin-bottom:1.5mm}.compacto li{margin-bottom:.4mm}',
    '.compacto .aviso{padding:1.8mm 2.2mm;margin:1.5mm 0}',
    '.compacto .rod{margin-top:3mm}',
    '@media print{.naoimp{display:none!important}}'
  ].join('');

  function doc(titulo, corpo) {
    return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(titulo) + '</title><style>' + CSS_BASE + '</style></head>' +
      '<body>' + corpo + '</body></html>';
  }

  function kpi(rot, val, nota, tom) {
    const cor = tom === 'ruim' ? 'color:#d03b3b' : (tom === 'bom' ? 'color:#006300' : '');
    return '<div class="kpi"><div class="r">' + esc(rot) + '</div>' +
      '<div class="v" style="' + cor + '">' + esc(val) + '</div>' +
      (nota ? '<div class="n">' + esc(nota) + '</div>' : '') + '</div>';
  }

  function rodape(bundle, extra) {
    return '<div class="rod"><span>' + esc((bundle.meta || {}).orgName || '') +
      (extra ? ' &middot; ' + esc(extra) : '') + '</span>' +
      '<span>Gerado pelo PMO Tool em ' + esc(U.fmtDataHora(U.agoraIso())) + '</span></div>';
  }

  function moeda(v) { return U.fmtMoney(v, { compact: true }); }
  function razao(v) { return v === null || v === undefined ? 'não aplicável' : U.fmtRazao(v, 2); }

  /* ================================================ VARIANTES POR PÚBLICO

     Um único registro declarativo governa os dois geradores (status report de
     projeto e pacote de comitê). Cada seção pergunta `pol.secoes[id]` antes de
     renderizar; nenhuma seção é duplicada por variante.

     `ocultaRestritos` é a regra de privacidade: nas versões externa e executiva,
     riscos, issues e decisões marcados como `restrito` não podem aparecer em
     lugar nenhum, e o documento declara quantos itens ficaram de fora.
     ==================================================================== */

  const VARIANTES = {
    interno: {
      id: 'interno',
      rotulo: 'Interno',
      publico: 'PMO, gerência do projeto e time',
      descricao: 'Tudo que se aplica, inclusive riscos, issues e decisões restritos.',
      ocultaRestritos: false,
      mostraFinanceiro: true,
      compacto: false,
      gatesDetalhados: false,
      narrativa: ['destaques', 'pontosAtencao', 'proximosPassos', 'pedidosComite'],
      secoes: {
        // status report de projeto
        subfarois: true, evm: true, evmEssencial: false, avanco: false,
        justificativa: true, narrativa: true, pedidos: false,
        proximoGate: true, marcos: true, trilhaGates: false,
        decisoes: true, riscos: true, issues: true, mudancas: true, baseline: false,
        // pacote de comitê
        capa: true, sumario: true, graficos: true,
        excecoes: true, excecoesResumo: false,
        decisoesPortfolio: true, gatesPortfolio: true, riscosPortfolio: true,
        trilhaDecisoes: false, baselinePortfolio: false, anexoTabela: true
      }
    },

    executivo: {
      id: 'executivo',
      rotulo: 'Executivo',
      publico: 'Sponsor e steering committee',
      descricao: 'Farol, EVM essencial, pedidos ao comitê e próximo gate. O status report ' +
        'cabe em uma folha A4. Sem detalhe operacional de riscos e issues, sem itens restritos.',
      ocultaRestritos: true,
      mostraFinanceiro: true,
      compacto: true,
      gatesDetalhados: false,
      narrativa: ['pedidosComite'],
      secoes: {
        subfarois: false, evm: false, evmEssencial: true, avanco: false,
        justificativa: true, narrativa: false, pedidos: true,
        proximoGate: true, marcos: false, trilhaGates: false,
        decisoes: false, riscos: false, issues: false, mudancas: false, baseline: false,
        capa: false, sumario: true, graficos: false,
        excecoes: false, excecoesResumo: true,
        decisoesPortfolio: true, gatesPortfolio: true, riscosPortfolio: false,
        trilhaDecisoes: false, baselinePortfolio: false, anexoTabela: false
      }
    },

    auditoria: {
      id: 'auditoria',
      rotulo: 'Auditoria',
      publico: 'Auditoria interna e compliance',
      descricao: 'Trilha de decisões, gates com datas e aprovadores, mudanças e baseline. ' +
        'Sem narrativa subjetiva — só o que é verificável no registro.',
      ocultaRestritos: false,
      mostraFinanceiro: true,
      compacto: false,
      gatesDetalhados: true,
      narrativa: [],
      secoes: {
        subfarois: true, evm: true, evmEssencial: false, avanco: false,
        justificativa: true, narrativa: false, pedidos: false,
        proximoGate: true, marcos: true, trilhaGates: true,
        decisoes: true, riscos: true, issues: true, mudancas: true, baseline: true,
        capa: true, sumario: true, graficos: true,
        excecoes: true, excecoesResumo: false,
        decisoesPortfolio: true, gatesPortfolio: true, riscosPortfolio: true,
        trilhaDecisoes: true, baselinePortfolio: true, anexoTabela: true
      }
    },

    externo: {
      id: 'externo',
      rotulo: 'Externo',
      publico: 'Cliente, fornecedor ou parceiro',
      descricao: 'Escopo, marcos e avanço. Sem riscos, sem exposição financeira, ' +
        'sem conflito interno e sem itens restritos.',
      ocultaRestritos: true,
      mostraFinanceiro: false,
      compacto: false,
      gatesDetalhados: false,
      narrativa: ['destaques', 'proximosPassos'],
      secoes: {
        subfarois: false, evm: false, evmEssencial: false, avanco: true,
        justificativa: false, narrativa: true, pedidos: false,
        proximoGate: true, marcos: true, trilhaGates: false,
        decisoes: false, riscos: false, issues: false, mudancas: false, baseline: false,
        capa: true, sumario: true, graficos: true,
        excecoes: false, excecoesResumo: false,
        decisoesPortfolio: false, gatesPortfolio: true, riscosPortfolio: false,
        trilhaDecisoes: false, baselinePortfolio: false, anexoTabela: true
      }
    }
  };

  const VARIANTES_ORDEM = ['interno', 'executivo', 'auditoria', 'externo'];

  /* Padrão seguro: 'interno' reproduz exatamente o conteúdo que os relatórios
     já tinham antes das variantes, então chamador antigo não perde nada nem
     passa a vazar o que antes mostrava. Quem quiser filtrar pede explicitamente. */
  ex.VARIANTE_PADRAO = 'interno';

  /** Lista para montar seletor na interface. Nunca expõe o objeto interno. */
  ex.variantes = function () {
    return VARIANTES_ORDEM.map(function (id) {
      const v = VARIANTES[id];
      return { id: v.id, rotulo: v.rotulo, publico: v.publico, descricao: v.descricao };
    });
  };

  function politica(nome) {
    return VARIANTES[nome] || VARIANTES[ex.VARIANTE_PADRAO];
  }
  ex.politicaVariante = function (nome) { return U.clonar(politica(nome)); };

  function ehRestrito(x) { return !!(x && x.restrito); }

  /** Filtra a coleção quando a variante não pode expor itens restritos. */
  function visiveis(arr, pol) {
    if (!pol.ocultaRestritos) { return (arr || []).slice(); }
    return (arr || []).filter(function (x) { return !ehRestrito(x); });
  }

  /** Selo ao lado do título de um item restrito nas versões que o exibem. */
  function selRestrito(x) {
    return ehRestrito(x) ? ' <span class="tag">restrito</span>' : '';
  }

  /**
   * Itens restritos dentro do escopo do documento. É a contagem declarada no
   * aviso de omissão: riscos e issues em aberto mais decisões registradas —
   * exatamente o universo que a versão interna mostraria.
   */
  function contarRestritos(projetos) {
    let n = 0;
    (projetos || []).forEach(function (p) {
      if (!p) { return; }
      n += M.riscosAbertos(p).filter(ehRestrito).length;
      n += M.issuesAbertas(p).filter(ehRestrito).length;
      n += (p.decisoes || []).filter(ehRestrito).length;
    });
    return n;
  }

  function avisoRestritos(pol, n) {
    if (!pol.ocultaRestritos || !n) { return ''; }
    return '<div class="aviso"><b>Conteúdo restrito omitido.</b> ' + n +
      (n === 1 ? ' item restrito não consta desta versão'
        : ' itens restritos não constam desta versão') +
      ' (' + esc(pol.rotulo.toLowerCase()) + '). O registro completo está na versão interna.</div>';
  }

  function selo(pol) {
    return '<span class="selo">Versão ' + esc(pol.rotulo.toLowerCase()) + '</span>';
  }

  /* ===================================================== STATUS REPORT */

  function cabecalhoSr(c) {
    const p = c.p;
    return '<div class="cab"><div>' +
      '<h1>' + esc(p.nome) + '</h1>' +
      '<p class="sub">' + esc(p.codigo || '') + ' &middot; ' + esc(M.nomePrograma(c.b, p.programaId)) +
      ' &middot; ' + esc(M.rotulo('estagios', p.estagio)) + '</p>' +
      '<p class="sub">Gerente: ' + esc(M.nomePessoa(c.b, p.pmId)) +
      ' &middot; Sponsor: ' + esc(M.nomePessoa(c.b, p.sponsorId)) +
      ' &middot; Unidade: ' + esc(M.nomeBu(c.b, p.buId)) + '</p>' +
      '</div><div style="text-align:right">' +
      '<div style="font-size:8pt;color:#898781;text-transform:uppercase;letter-spacing:.05em">Farol geral</div>' +
      '<div style="margin:1.5mm 0">' + farol(c.s.rag) + '</div>' +
      '<div class="sub">Data de status: ' + esc(U.fmtDate(c.dd)) + '</div>' +
      '<div style="margin-top:1.5mm">' + selo(c.pol) + '</div>' +
      '</div></div>';
  }

  function srSubfarois(c) {
    if (!c.sr) { return ''; }
    let h = '<div class="grade g5" style="margin-bottom:4mm">';
    [['Escopo', c.sr.ragEscopo], ['Prazo', c.sr.ragPrazo], ['Custo', c.sr.ragCusto],
      ['Qualidade', c.sr.ragQualidade], ['Risco', c.sr.ragRisco]].forEach(function (x) {
      h += '<div class="kpi"><div class="r">' + esc(x[0]) + '</div>' +
        '<div style="margin-top:1mm">' + farol(x[1]) + '</div></div>';
    });
    return h + '</div>';
  }

  function srEvm(c) {
    const e = c.e, p = c.p, L = c.L;
    let h = '<h2>Indicadores na data de status</h2><div class="grade g4">';
    h += kpi('Orçamento (BAC)', moeda(e.BAC));
    h += kpi('Custo real (AC)', moeda(e.AC), U.fmtPct(U.safeDiv(e.AC, e.BAC) * 100, 0) + ' consumido');
    h += kpi('Projeção (EAC)', moeda(e.EAC), null, e.EAC > e.BAC * 1.05 ? 'ruim' : null);
    h += kpi('Variação final (VAC)', moeda(e.VAC), e.VAC < 0 ? 'estouro projetado' : 'dentro do orçamento',
      e.VAC < 0 ? 'ruim' : 'bom');
    h += kpi('SPI (prazo)', e.spiSignificativo ? razao(e.SPI) : (e.SPI === null ? 'n/a' : razao(e.SPI) + ' *'),
      e.spiSignificativo ? null : 'ainda não significativo',
      e.spiSignificativo && e.SPI < L.spi.ambar ? 'ruim' : null);
    h += kpi('CPI (custo)', e.cpiSignificativo ? razao(e.CPI) : (e.CPI === null ? 'n/a' : razao(e.CPI) + ' *'),
      e.cpiSignificativo ? null : 'ainda não significativo',
      e.cpiSignificativo && e.CPI < L.cpi.ambar ? 'ruim' : null);
    h += kpi('Avanço físico', U.fmtPct(e.pctFisico, 0), 'planejado ' + U.fmtPct(e.pctPlanejado, 0),
      e.pctFisico < e.pctPlanejado - 5 ? 'ruim' : null);
    h += kpi('Desvio de prazo', U.ehNum(e.desvioDias) ? (e.desvioDias > 0 ? '+' + e.desvioDias + ' d' : 'no prazo') : '—',
      'previsto ' + U.fmtDate(p.dates.previstoFim), e.desvioDias > 0 ? 'ruim' : 'bom');
    h += '</div>';
    if (!e.spiSignificativo || !e.cpiSignificativo) {
      h += '<p class="sub" style="margin-top:2mm">* Índice marcado com asterisco ainda não é ' +
        'estatisticamente significativo nesta fase do projeto e não influencia o farol.</p>';
    }
    return h;
  }

  /** EVM essencial: quatro azulejos, uma linha só. Base da versão executiva. */
  function srEvmEssencial(c) {
    const e = c.e, p = c.p;
    let h = '<h2>Indicadores essenciais</h2><div class="grade g4">';
    h += kpi('Orçamento (BAC)', moeda(e.BAC), 'AC ' + moeda(e.AC));
    h += kpi('Projeção (EAC)', moeda(e.EAC), 'VAC ' + moeda(e.VAC), e.VAC < 0 ? 'ruim' : 'bom');
    h += kpi('SPI / CPI',
      (e.spiSignificativo ? razao(e.SPI) : '—') + ' / ' + (e.cpiSignificativo ? razao(e.CPI) : '—'),
      e.spiSignificativo && e.cpiSignificativo ? 'prazo / custo' : 'ainda não significativo');
    h += kpi('Avanço físico', U.fmtPct(e.pctFisico, 0),
      'planejado ' + U.fmtPct(e.pctPlanejado, 0) + ' · término ' + U.fmtDate(p.dates.previstoFim),
      e.pctFisico < e.pctPlanejado - 5 ? 'ruim' : null);
    return h + '</div>';
  }

  /** Avanço sem dinheiro: é o que a versão externa pode mostrar. */
  function srAvanco(c) {
    const e = c.e, p = c.p;
    let h = '<h2>Avanço</h2><div class="grade g3">';
    h += kpi('Avanço físico', U.fmtPct(e.pctFisico, 0), 'planejado ' + U.fmtPct(e.pctPlanejado, 0),
      e.pctFisico < e.pctPlanejado - 5 ? 'ruim' : null);
    h += kpi('Término previsto', U.fmtDate(p.dates.previstoFim),
      p.dates.baselineFim ? 'baseline ' + U.fmtDate(p.dates.baselineFim) : null);
    h += kpi('Desvio de prazo',
      U.ehNum(e.desvioDias) ? (e.desvioDias > 0 ? '+' + e.desvioDias + ' d' : 'no prazo') : '—',
      'sobre a baseline', e.desvioDias > 0 ? 'ruim' : 'bom');
    h += '</div>';
    h += '<div class="barra" style="margin-top:3mm"><i style="width:' +
      U.clamp(Math.round(U.num(e.pctFisico, 0)), 0, 100) + '%"></i></div>';
    return h;
  }

  function srJustificativa(c) {
    const s = c.s;
    let h = '<h2>Justificativa do farol</h2>';
    if (s.manual) {
      h += '<div class="aviso"><b>Farol definido manualmente.</b> O cálculo automático indicaria <b>' +
        esc(M.rotuloRag(s.ragCalculado)) + '</b>. ' +
        esc(c.p.ragJustificativa || 'Sem justificativa registrada.') + '</div>';
    }
    // Na versão compacta só os sinais que puxam o farol para baixo — o resto é ruído numa folha só.
    const motivos = c.pol.compacto
      ? s.motivos.filter(function (m) { return m.rag !== 'verde'; }).slice(0, 5) : s.motivos;
    const lista = motivos.length ? motivos : [{ rag: 'verde', texto: 'Todos os indicadores dentro dos limiares.' }];
    h += '<ul>';
    lista.forEach(function (m) {
      const i = RAG_INFO[m.rag] || RAG_INFO.cinza;
      h += '<li><b style="color:' + i.cor + '">' + i.ic + '</b> ' + esc(m.texto) + '</li>';
    });
    return h + '</ul>';
  }

  const CAMPOS_NARRATIVA = {
    destaques: 'Destaques',
    pontosAtencao: 'Pontos de atenção',
    proximosPassos: 'Próximos passos'
  };

  function srNarrativa(c) {
    const sr = c.sr;
    let h = '<h2>Narrativa do período</h2>';
    if (!sr) {
      return h + '<div class="aviso crit"><b>Narrativa não preenchida.</b> Este projeto não possui status ' +
        'report registrado. O conteúdo deste documento vem apenas dos dados quantitativos.</div>';
    }
    h += '<p class="sub">Reporte de ' + esc(U.fmtPeriodo(sr.periodo)) + ', registrado em ' +
      esc(U.fmtDate(sr.reportadoEm)) + ' por ' + esc(M.nomePessoa(c.b, sr.autorId)) + '.</p>';
    let algum = false;
    c.pol.narrativa.forEach(function (campo) {
      if (campo === 'pedidosComite' || !sr[campo] || !CAMPOS_NARRATIVA[campo]) { return; }
      algum = true;
      h += '<h3>' + esc(CAMPOS_NARRATIVA[campo]) + '</h3><p>' + esc(sr[campo]) + '</p>';
    });
    if (c.pol.narrativa.indexOf('pedidosComite') >= 0 && sr.pedidosComite) {
      algum = true;
      h += '<div class="aviso"><b>Pedido ao comitê:</b> ' + esc(sr.pedidosComite) + '</div>';
    }
    if (!algum) { h += '<p class="mudo">Sem texto aplicável a esta versão do relatório.</p>'; }
    return h;
  }

  /** O que o comitê precisa deliberar. Substitui a narrativa na versão executiva. */
  function srPedidos(c) {
    const decs = visiveis((c.p.decisoes || []).filter(function (d) {
      const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
      return def && def.pendente;
    }), c.pol);
    const chg = (c.p.mudancas || []).filter(function (m) {
      const def = M.tax('statusMudanca').find(function (x) { return x.id === m.status; });
      return def && def.pendente;
    });
    let h = '<h2>Pedidos ao comitê</h2>';
    let algum = false;
    if (c.sr && c.sr.pedidosComite) {
      algum = true;
      h += '<div class="aviso"><b>Pedido do gerente:</b> ' + esc(c.sr.pedidosComite) + '</div>';
    }
    if (decs.length) {
      algum = true;
      h += '<ul>';
      U.sortBy(decs, function (d) { return d.prazoLimite || '9999'; }).slice(0, 4).forEach(function (d) {
        h += '<li><b>' + esc(d.titulo) + '</b>' +
          (d.prazoLimite ? ' <span class="mudo">— prazo ' + esc(U.fmtDate(d.prazoLimite)) +
            (d.prazoLimite < c.dd ? ' <span class="ruim">(vencido)</span>' : '') + '</span>' : '') + '</li>';
      });
      h += '</ul>';
      if (decs.length > 4) {
        h += '<p class="sub">Mais ' + (decs.length - 4) + ' decisão(ões) pendente(s) na versão interna.</p>';
      }
    }
    if (chg.length) {
      algum = true;
      h += '<p class="sub">' + chg.length + ' solicitação(ões) de mudança pendente(s), impacto consolidado de ' +
        esc(U.fmtDelta(U.sum(chg, function (x) { return x.impactoCusto; }), moeda)) + ' e +' +
        U.fmtNum(U.sum(chg, function (x) { return x.impactoDias; }), 0) + ' dias.</p>';
    }
    if (!algum) { h += '<div class="aviso ok"><b>Nada pendente.</b> Nenhuma deliberação solicitada ao comitê.</div>'; }
    return h;
  }

  function srProximoGate(c) {
    const rg = c.rg;
    if (!rg.proximo) { return ''; }
    const gdef = rg.proximoDef;
    return '<h2>Próximo gate</h2><p>' + esc(gdef ? gdef.codigo + ' — ' + gdef.nome : '—') +
      ', previsto para <b>' + esc(U.fmtDate(rg.proximo.previstoData)) + '</b>' +
      (rg.atrasoDias ? ' <span class="ruim">(atrasado em ' + rg.atrasoDias + ' dias)</span>' : '') +
      (rg.proximo.forum ? ' <span class="mudo">· fórum ' + esc(M.rotulo('foruns', rg.proximo.forum)) +
        '</span>' : '') + '.</p>';
  }

  function srMarcos(c) {
    const marcosProx = U.sortBy((c.p.marcos || []).filter(function (m) { return !m.realData; }),
      function (m) { return m.previstoData || m.baselineData || ''; }).slice(0, 8);
    let h = '<h2>Marcos em aberto</h2>';
    if (!marcosProx.length) { return h + '<p class="mudo">Nenhum marco em aberto registrado.</p>'; }
    h += '<table><caption>Próximos marcos em aberto</caption><thead><tr>' +
      '<th>Marco</th><th class="n">Baseline</th><th class="n">Previsto</th><th>Situação</th></tr></thead><tbody>';
    marcosProx.forEach(function (m) {
      const alvo = m.previstoData || m.baselineData;
      const atrasado = alvo && alvo < c.dd;
      h += '<tr><td>' + esc(m.nome) + (m.gateId ? ' <span class="tag">' +
        esc((M.gatePorId(m.gateId) || {}).codigo || '') + '</span>' : '') + '</td>' +
        '<td class="n">' + esc(U.fmtDate(m.baselineData)) + '</td>' +
        '<td class="n">' + esc(U.fmtDate(m.previstoData)) + '</td>' +
        '<td>' + (atrasado ? '<span class="ruim">Atrasado ' + U.diffDays(alvo, c.dd) + ' d</span>' : 'Pendente') +
        '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  /** Trilha completa de portões: data, decisão, quem aprovou e com que condições. */
  function srTrilhaGates(c) {
    const gates = U.sortBy(c.p.gates || [], function (g) { return M.ordemGate(g.gateId); });
    let h = '<h2>Trilha de gates</h2>';
    if (!gates.length) { return h + '<p class="mudo">Nenhum portão registrado para este projeto.</p>'; }
    h += '<table><caption>Portões, datas, decisão registrada e aprovador</caption><thead><tr>' +
      '<th>Gate</th><th class="n">Previsto</th><th class="n">Realizado</th><th>Decisão</th>' +
      '<th>Aprovador</th><th>Fórum</th><th>Condições</th></tr></thead><tbody>';
    gates.forEach(function (g) {
      const def = M.gatePorId(g.gateId);
      h += '<tr><td><b>' + esc(def ? def.codigo : g.gateId) + '</b><br><span class="mudo">' +
        esc(def ? def.nome : '') + '</span></td>' +
        '<td class="n">' + esc(U.fmtDate(g.previstoData)) + '</td>' +
        '<td class="n">' + esc(U.fmtDate(g.realData)) + '</td>' +
        '<td>' + esc(M.rotulo('decisoesGate', g.decisao)) + '</td>' +
        '<td>' + esc(g.aprovadorId ? M.nomePessoa(c.b, g.aprovadorId) : '—') + '</td>' +
        '<td>' + esc(M.rotulo('foruns', g.forum)) + '</td>' +
        '<td>' + esc(U.truncar(g.condicoes || '', 90) || '—') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function srDecisoes(c) {
    const decs = visiveis(c.p.decisoes || [], c.pol);
    let h = '<h2>Decisões registradas</h2>';
    if (!decs.length) { return h + '<p class="mudo">Nenhuma decisão registrada para este projeto.</p>'; }
    h += '<table><caption>Decisões solicitadas, pendentes e deliberadas</caption><thead><tr>' +
      '<th>Decisão</th><th>Fórum</th><th>Situação</th><th class="n">Solicitada</th>' +
      '<th class="n">Prazo</th><th class="n">Decidida</th><th>Quem decidiu</th></tr></thead><tbody>';
    U.sortBy(decs, function (d) { return d.solicitadaEm || ''; }, 'desc').forEach(function (d) {
      const venc = d.prazoLimite && d.prazoLimite < c.dd && !d.decididaEm;
      h += '<tr><td><b>' + esc(d.titulo) + '</b>' + selRestrito(d) +
        (d.decisao ? '<br><span class="mudo">' + esc(U.truncar(d.decisao, 110)) + '</span>' : '') + '</td>' +
        '<td>' + esc(M.rotulo('foruns', d.forum)) + '</td>' +
        '<td>' + esc(M.rotulo('statusDecisao', d.status)) + '</td>' +
        '<td class="n">' + esc(U.fmtDate(d.solicitadaEm)) + '</td>' +
        '<td class="n' + (venc ? ' ruim' : '') + '">' + esc(U.fmtDate(d.prazoLimite)) + '</td>' +
        '<td class="n">' + esc(U.fmtDate(d.decididaEm)) + '</td>' +
        '<td>' + esc(d.decisorId ? M.nomePessoa(c.b, d.decisorId) : '—') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function srRiscos(c) {
    const riscos = U.sortBy(visiveis(M.riscosAbertos(c.p), c.pol),
      function (r) { return M.scoreRisco(r); }, 'desc').slice(0, 5);
    let h = '<h2>Principais riscos abertos</h2>';
    if (!riscos.length) { return h + '<p class="mudo">Sem riscos abertos registrados.</p>'; }
    h += '<table><caption>Top 5 riscos por score (probabilidade × impacto)</caption><thead><tr>' +
      '<th>Risco</th><th class="n">P×I</th>' + (c.pol.mostraFinanceiro ? '<th class="n">Exposição</th>' : '') +
      '<th>Dono</th><th>Resposta</th></tr></thead><tbody>';
    riscos.forEach(function (r) {
      const sc = M.scoreRisco(r);
      const niv = M.nivelRisco(sc);
      h += '<tr><td><b>' + esc(r.titulo) + '</b>' + selRestrito(r) +
        (r.mitigacao ? '<br><span class="mudo">' + esc(U.truncar(r.mitigacao, 120)) + '</span>' : '') + '</td>' +
        '<td class="n">' + r.probabilidade + '×' + r.impacto + ' = <b>' + sc + '</b><br>' +
        '<span class="mudo">' + esc(niv.rotulo) + '</span></td>' +
        (c.pol.mostraFinanceiro ? '<td class="n">' + esc(moeda(r.exposicaoCusto)) + '</td>' : '') +
        '<td>' + esc(M.nomePessoa(c.b, r.donoId)) + '</td>' +
        '<td>' + esc(M.rotulo('respostasRisco', r.resposta)) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function srIssues(c) {
    const iss = visiveis(M.issuesAbertas(c.p).filter(function (i) { return i.severidade >= 3; }), c.pol);
    if (!iss.length) { return ''; }
    let h = '<h2>Issues que exigem atenção</h2>';
    h += '<table><caption>Issues abertas de severidade alta ou crítica</caption><thead><tr>' +
      '<th>Issue</th><th>Severidade</th><th>Dono</th><th class="n">Aberta há</th></tr></thead><tbody>';
    iss.forEach(function (i) {
      const def = M.tax('severidades').find(function (x) { return x.id === i.severidade; });
      h += '<tr><td>' + esc(i.titulo) + selRestrito(i) + '</td><td>' + esc(def ? def.rotulo : i.severidade) + '</td>' +
        '<td>' + esc(M.nomePessoa(c.b, i.donoId)) + '</td>' +
        '<td class="n">' + M.aging(i.abertaEm, c.dd) + ' d</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function srMudancas(c) {
    const chg = (c.p.mudancas || []).filter(function (m) {
      const def = M.tax('statusMudanca').find(function (x) { return x.id === m.status; });
      return def && def.pendente;
    });
    if (!chg.length) { return ''; }
    let h = '<h2>Mudanças aguardando decisão</h2>';
    h += '<table><caption>Solicitações de mudança aguardando decisão</caption><thead><tr>' +
      '<th>Mudança</th><th>Tipo</th><th class="n">Impacto custo</th><th class="n">Impacto prazo</th>' +
      '<th>Baseline</th></tr></thead><tbody>';
    chg.forEach(function (cm) {
      h += '<tr><td>' + esc(cm.titulo) + '</td><td>' + esc(M.rotulo('tiposMudanca', cm.tipo)) + '</td>' +
        '<td class="n">' + esc(U.fmtDelta(cm.impactoCusto, moeda)) + '</td>' +
        '<td class="n">' + (cm.impactoDias ? '+' + cm.impactoDias + ' d' : '—') + '</td>' +
        '<td>' + (cm.afetaBaseline ? 'replanejar' : 'não afeta') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  /** Baseline versus previsto e o que a moveu — o que a auditoria vem conferir. */
  function srBaseline(c) {
    const p = c.p, d = p.dates || {}, f = p.finance || {};
    let h = '<h2>Baseline e replanejamentos</h2>';
    h += '<table><caption>Linha de base aprovada contra a previsão corrente</caption><thead><tr>' +
      '<th>Dimensão</th><th class="n">Baseline</th><th class="n">Previsto / real</th><th class="n">Desvio</th>' +
      '</tr></thead><tbody>';
    const desvIni = U.diffDays(d.baselineInicio, d.realInicio || d.previstoInicio);
    const desvFim = U.diffDays(d.baselineFim, d.previstoFim);
    const bacBase = U.num(f.custoBaseline, 0);
    const bacAtual = M.bac(p);
    h += '<tr><td>Início</td><td class="n">' + esc(U.fmtDate(d.baselineInicio)) + '</td>' +
      '<td class="n">' + esc(U.fmtDate(d.realInicio || d.previstoInicio)) + '</td>' +
      '<td class="n">' + (U.ehNum(desvIni) ? U.fmtDelta(desvIni, function (v) { return v + ' d'; }) : '—') + '</td></tr>';
    h += '<tr><td>Término</td><td class="n">' + esc(U.fmtDate(d.baselineFim)) + '</td>' +
      '<td class="n">' + esc(U.fmtDate(d.previstoFim)) + '</td>' +
      '<td class="n' + (U.ehNum(desvFim) && desvFim > 0 ? ' ruim' : '') + '">' +
      (U.ehNum(desvFim) ? U.fmtDelta(desvFim, function (v) { return v + ' d'; }) : '—') + '</td></tr>';
    h += '<tr><td>Orçamento</td><td class="n">' + esc(bacBase ? moeda(bacBase) : '—') + '</td>' +
      '<td class="n">' + esc(moeda(bacAtual)) + '</td>' +
      '<td class="n">' + esc(bacBase ? U.fmtDelta(bacAtual - bacBase, moeda) : '—') + '</td></tr>';
    h += '</tbody></table>';

    const repl = (p.mudancas || []).filter(function (m) { return m.afetaBaseline && m.decididaEm; });
    if (repl.length) {
      h += '<table><caption>Mudanças decididas que moveram a linha de base</caption><thead><tr>' +
        '<th>Mudança</th><th>Tipo</th><th>Situação</th><th class="n">Decidida</th>' +
        '<th>Aprovador</th><th class="n">Custo</th><th class="n">Prazo</th></tr></thead><tbody>';
      U.sortBy(repl, function (m) { return m.decididaEm; }, 'desc').forEach(function (m) {
        h += '<tr><td>' + esc(m.titulo) + '</td>' +
          '<td>' + esc(M.rotulo('tiposMudanca', m.tipo)) + '</td>' +
          '<td>' + esc(M.rotulo('statusMudanca', m.status)) + '</td>' +
          '<td class="n">' + esc(U.fmtDate(m.decididaEm)) + '</td>' +
          '<td>' + esc(m.aprovadorId ? M.nomePessoa(c.b, m.aprovadorId) : '—') + '</td>' +
          '<td class="n">' + esc(U.fmtDelta(m.impactoCusto, moeda)) + '</td>' +
          '<td class="n">' + (m.impactoDias ? '+' + m.impactoDias + ' d' : '—') + '</td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<p class="mudo">Nenhuma mudança decidida moveu a linha de base.</p>';
    }
    return h;
  }

  /* Ordem de composição do status report. A variante escolhe quais entram. */
  const SECOES_SR = [
    ['subfarois', srSubfarois],
    ['evm', srEvm],
    ['evmEssencial', srEvmEssencial],
    ['avanco', srAvanco],
    ['justificativa', srJustificativa],
    ['narrativa', srNarrativa],
    ['pedidos', srPedidos],
    ['proximoGate', srProximoGate],
    ['marcos', srMarcos],
    ['trilhaGates', srTrilhaGates],
    ['decisoes', srDecisoes],
    ['riscos', srRiscos],
    ['issues', srIssues],
    ['mudancas', srMudancas],
    ['baseline', srBaseline]
  ];

  ex.statusReportHtml = function (projeto, opts) {
    const o = opts || {};
    const pol = politica(o.variante);
    const b = o.bundle || (PMO.store ? PMO.store.state : M.portfolioVazio());
    const L = (b.settings || {}).limiares || M.LIMIARES_PADRAO;
    const dd = U.parseDate(o.dataStatus) || U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const p = projeto || M.projetoVazio();
    const c = {
      p: p, b: b, L: L, dd: dd, pol: pol,
      e: M.evm(p, dd),
      s: M.saudeProjeto(p, L, dd),
      rg: M.resumoGate(p, dd),
      sr: U.sortBy(p.statusReports || [], function (x) { return x.reportadoEm; }, 'desc')[0] || null,
      restritos: contarRestritos([p])
    };

    let h = '<div class="pg' + (pol.compacto ? ' compacto' : '') + '">';
    h += cabecalhoSr(c);
    SECOES_SR.forEach(function (sec) {
      if (!pol.secoes[sec[0]]) { return; }
      h += sec[1](c);
    });
    h += avisoRestritos(pol, c.restritos);
    h += rodape(b, 'Status report &middot; ' + (p.codigo || p.nome) + ' &middot; versão ' + pol.rotulo.toLowerCase());
    h += '</div>';
    return doc('Status report — ' + (p.codigo || p.nome) + ' (' + pol.rotulo + ')', h);
  };

  ex.baixarStatusReport = function (projeto, opts) {
    const o = opts || {};
    const dd = o.dataStatus || U.hoje();
    return U.download((projeto.codigo || 'projeto') + '-status-report-' +
      politica(o.variante).id + '-' + dd + '.html',
      ex.statusReportHtml(projeto, o), 'text/html;charset=utf-8');
  };

  /* ================================================== PACOTE DO COMITÊ */

  /** Mini gráfico de barras SVG estático (sem dependência de DOM vivo). */
  function barrasSvg(itens, opts) {
    const o = opts || {};
    const w = o.largura || 560, alturaLinha = 22;
    const h = itens.length * alturaLinha + 8;
    const margE = o.margE || 150;
    const max = itens.reduce(function (a, x) { return Math.max(a, Math.abs(x.valor)); }, 0) || 1;
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h +
      '" role="img" aria-label="' + esc(o.titulo || 'gráfico de barras') + '">';
    itens.forEach(function (it, i) {
      const y = i * alturaLinha + 4;
      const bw = Math.max(1, U.safeDiv(Math.abs(it.valor), max) * (w - margE - 90));
      s += '<text x="' + (margE - 6) + '" y="' + (y + 11) + '" text-anchor="end" font-size="9" fill="#52514e">' +
        esc(U.truncar(it.rotulo, 26)) + '</text>';
      s += '<rect x="' + margE + '" y="' + y + '" width="' + bw + '" height="13" rx="3" fill="' +
        (it.cor || '#2a78d6') + '"/>';
      s += '<text x="' + (margE + bw + 6) + '" y="' + (y + 11) + '" font-size="9" fill="#0b0b0b" font-weight="600">' +
        esc(it.texto || moeda(it.valor)) + '</text>';
    });
    return s + '</svg>';
  }

  /** Marcos já concluídos no escopo — número que a versão externa pode mostrar. */
  function marcosConcluidos(lista) {
    let n = 0;
    (lista || []).forEach(function (p) {
      n += (p.marcos || []).filter(function (m) { return !!m.realData; }).length;
    });
    return n;
  }

  function pcCapa(c) {
    const k = c.k;
    let h = '<p class="sub" style="text-transform:uppercase;letter-spacing:.12em;font-size:9pt">' +
      esc((c.b.meta || {}).orgName || '') + '</p>';
    h += '<h1 style="font-size:30pt;margin:3mm 0">Comitê de Portfólio</h1>';
    h += '<p style="font-size:13pt;color:#52514e;margin-bottom:4mm">Reunião de acompanhamento &middot; data de status ' +
      esc(U.fmtDate(c.dd)) + '</p>';
    h += '<p style="margin-bottom:8mm">' + selo(c.pol) + ' <span class="sub">' +
      esc(c.pol.publico) + '</span></p>';
    h += '<div class="grade g4">';
    if (c.pol.mostraFinanceiro) {
      h += kpi('Projetos', String(k.total), k.ativos + ' ativos');
      h += kpi('Investimento', moeda(k.bac), 'orçamento total');
      h += kpi('Em atenção', String(k.distRag.vermelho + k.distRag.ambar),
        k.distRag.vermelho + ' vermelhos', k.distRag.vermelho ? 'ruim' : null);
      h += kpi('Decisões pendentes', String(k.decisoesPendentes),
        k.decisoesVencidas + ' vencidas', k.decisoesVencidas ? 'ruim' : null);
    } else {
      h += kpi('Projetos', String(k.total), k.ativos + ' em execução');
      h += kpi('Avanço médio', U.fmtPct(k.pctFisicoMedio, 0), 'do escopo do portfólio');
      h += kpi('Marcos concluídos', String(marcosConcluidos(c.lista)), 'de ' + k.marcosTotal + ' previstos');
      h += kpi('Projetos encerrados', String(k.encerrados), 'no escopo deste pacote');
    }
    h += '</div>';
    h += '<p class="sub" style="margin-top:10mm">Documento gerado automaticamente pelo PMO Tool a partir dos ' +
      'dados do portfólio. Os faróis são calculados a partir de indicadores objetivos, não digitados.</p>';
    return h;
  }

  function pcSumario(c) {
    const k = c.k;
    let h = '<h1>Sumário executivo</h1>';
    h += '<p class="sub">Posição consolidada em ' + esc(U.fmtDate(c.dd)) + ' &middot; ' +
      c.lista.length + ' projeto(s) no escopo</p>';
    h += '<div class="grade g4" style="margin-top:4mm">';
    if (c.pol.mostraFinanceiro) {
      h += kpi('Orçamento (BAC)', moeda(k.bac));
      h += kpi('Custo real (AC)', moeda(k.ac), U.fmtPct(k.burnPct, 0) + ' consumido');
      h += kpi('Projeção (EAC)', moeda(k.eac));
      h += kpi('Variação final (VAC)', moeda(k.vac), k.vac < 0 ? 'estouro projetado' : 'folga',
        k.vac < 0 ? 'ruim' : 'bom');
      h += kpi('SPI do portfólio', razao(k.spi), 'EV ÷ PV', k.spi !== null && k.spi < 0.97 ? 'ruim' : null);
      h += kpi('CPI do portfólio', razao(k.cpi), 'EV ÷ AC', k.cpi !== null && k.cpi < 0.97 ? 'ruim' : null);
      h += kpi('Exposição a risco', moeda(k.exposicaoRisco), U.fmtPct(k.exposicaoPctBac, 1) + ' do BAC');
      h += kpi('Benefício esperado', moeda(k.beneficioEsperado), 'ROI ' + U.fmtPct(k.roiEsperado, 0));
    } else {
      h += kpi('Projetos', String(k.total), k.ativos + ' em execução');
      h += kpi('Avanço médio', U.fmtPct(k.pctFisicoMedio, 0), 'do escopo do portfólio');
      h += kpi('Marcos concluídos', String(marcosConcluidos(c.lista)), 'de ' + k.marcosTotal + ' previstos');
      h += kpi('Projetos encerrados', String(k.encerrados), 'no escopo deste pacote');
    }
    h += '</div>';

    if (c.pol.secoes.graficos) {
      h += '<h2>Distribuição do farol</h2><div class="cx">';
      h += barrasSvg(M.tax('rag').map(function (r) {
        return { rotulo: r.rotulo, valor: k.distRag[r.id] || 0,
          texto: String(k.distRag[r.id] || 0) + ' projeto(s)',
          cor: (RAG_INFO[r.id] || RAG_INFO.cinza).cor };
      }).filter(function (x) { return x.valor > 0; }), { titulo: 'Distribuição do farol' });
      h += '</div>';

      if (c.pol.mostraFinanceiro) {
        h += '<h2>Investimento por categoria</h2><div class="cx">';
        h += barrasSvg(M.tax('categorias').map(function (cat, i) {
          const d = k.distCategoria[cat.id] || { qtd: 0, bac: 0 };
          return { rotulo: cat.rotulo.replace(/ \(.*\)/, ''), valor: d.bac,
            texto: moeda(d.bac) + '  (' + d.qtd + ')', cor: ['#2a78d6', '#eb6834', '#1baf7a'][i] || '#2a78d6' };
        }), { titulo: 'Investimento por categoria' });
        h += '</div>';
      }
    }
    return h + avisoRestritos(c.pol, c.restritos);
  }

  /** Projetos fora dos limiares, com o motivo objetivo que produziu o farol. */
  function excecoesDe(c) {
    return U.sortBy(c.lista.map(function (p) {
      return { p: p, s: M.saudeProjeto(p, c.L, c.dd), e: M.evm(p, c.dd) };
    }).filter(function (x) { return x.s.rag === 'vermelho' || x.s.rag === 'ambar'; }),
    function (x) { return x.s.rag === 'vermelho' ? 0 : 1; });
  }

  function pcExcecoes(c) {
    const b = c.b, dd = c.dd;
    const excecoes = excecoesDe(c);
    let h = '<h1>Painel de exceções</h1>';
    h += '<p class="sub">Projetos em vermelho ou âmbar, com o motivo objetivo que produziu o farol. ' +
      'Esta é a rastreabilidade que sustenta a decisão do comitê.</p>';
    if (!excecoes.length) {
      h += '<div class="aviso ok"><b>Nenhuma exceção.</b> Todos os projetos do escopo estão dentro dos limiares.</div>';
    } else {
      excecoes.forEach(function (x) {
        h += '<div class="cx" style="margin-bottom:3mm">';
        h += '<div style="display:flex;justify-content:space-between;gap:4mm;align-items:flex-start">';
        h += '<div><h3 style="margin:0">' + esc(x.p.codigo || '') + ' — ' + esc(x.p.nome) + '</h3>' +
          '<p class="sub">' + esc(M.nomePrograma(b, x.p.programaId)) + ' &middot; ' +
          esc(M.nomePessoa(b, x.p.pmId)) + ' &middot; ' + esc(M.rotulo('estagios', x.p.estagio)) + '</p></div>';
        h += '<div>' + farol(x.s.rag) + '</div></div>';
        h += '<table style="margin:2mm 0 1mm"><caption class="oculta">Indicadores de ' +
          esc(x.p.codigo || x.p.nome) + '</caption><tbody><tr>' +
          '<td class="n"><b>' + esc(moeda(x.e.BAC)) + '</b><br><span class="mudo">BAC</span></td>' +
          '<td class="n"><b>' + esc(moeda(x.e.EAC)) + '</b><br><span class="mudo">EAC</span></td>' +
          '<td class="n"><b class="' + (x.e.VAC < 0 ? 'ruim' : 'bom') + '">' + esc(moeda(x.e.VAC)) +
          '</b><br><span class="mudo">VAC</span></td>' +
          '<td class="n"><b>' + esc(x.e.spiSignificativo ? razao(x.e.SPI) : '—') + '</b><br><span class="mudo">SPI</span></td>' +
          '<td class="n"><b>' + esc(x.e.cpiSignificativo ? razao(x.e.CPI) : '—') + '</b><br><span class="mudo">CPI</span></td>' +
          '<td class="n"><b>' + esc(U.fmtPct(x.e.pctFisico, 0)) + '</b><br><span class="mudo">avanço</span></td>' +
          '<td class="n"><b class="' + (x.e.desvioDias > 0 ? 'ruim' : '') + '">' +
          (U.ehNum(x.e.desvioDias) ? (x.e.desvioDias > 0 ? '+' + x.e.desvioDias + ' d' : 'no prazo') : '—') +
          '</b><br><span class="mudo">desvio</span></td>' +
          '</tr></tbody></table>';
        h += '<ul style="margin-bottom:0">';
        x.s.motivos.filter(function (m) { return m.rag !== 'verde'; }).forEach(function (m) {
          const i = RAG_INFO[m.rag] || RAG_INFO.cinza;
          h += '<li><b style="color:' + i.cor + '">' + i.ic + '</b> ' + esc(m.texto) + '</li>';
        });
        h += '</ul>';
        if (x.s.manual) {
          h += '<div class="aviso" style="margin-bottom:0"><b>Farol manual.</b> Cálculo indicaria ' +
            esc(M.rotuloRag(x.s.ragCalculado)) + '. ' + esc(x.p.ragJustificativa || '') + '</div>';
        }
        h += '</div>';
      });
    }
    return h;
  }

  /** Uma linha por exceção, só as seis mais graves: o painel enxuto do executivo. */
  function pcExcecoesResumo(c) {
    const todas = excecoesDe(c);
    const excecoes = todas.slice(0, 6);
    let h = '<h2>Projetos em atenção</h2>';
    if (!excecoes.length) {
      return h + '<div class="aviso ok"><b>Nenhuma exceção.</b> ' +
        'Todos os projetos do escopo estão dentro dos limiares.</div>';
    }
    h += '<table><caption>Projetos em vermelho ou âmbar e o sinal que produziu o farol</caption><thead><tr>' +
      '<th>Projeto</th><th>Farol</th><th>Motivo principal</th><th class="n">EAC</th>' +
      '<th class="n">VAC</th><th class="n">Avanço</th><th class="n">Desvio</th></tr></thead><tbody>';
    excecoes.forEach(function (x) {
      const mot = x.s.motivos.filter(function (m) { return m.rag !== 'verde'; })[0];
      h += '<tr><td><b>' + esc(x.p.codigo || '') + '</b> ' + esc(U.truncar(x.p.nome, 24)) + '</td>' +
        '<td>' + farol(x.s.rag) + '</td>' +
        '<td>' + esc(mot ? U.truncar(mot.texto, 58) : '—') + '</td>' +
        '<td class="n">' + esc(moeda(x.e.EAC)) + '</td>' +
        '<td class="n"><span class="' + (x.e.VAC < 0 ? 'ruim' : 'bom') + '">' + esc(moeda(x.e.VAC)) + '</span></td>' +
        '<td class="n">' + esc(U.fmtPct(x.e.pctFisico, 0)) + '</td>' +
        '<td class="n">' + (U.ehNum(x.e.desvioDias)
          ? (x.e.desvioDias > 0 ? '<span class="ruim">+' + x.e.desvioDias + ' d</span>' : 'no prazo') : '—') +
        '</td></tr>';
    });
    h += '</tbody></table>';
    if (todas.length > excecoes.length) {
      h += '<p class="sub">Mais ' + (todas.length - excecoes.length) +
        ' projeto(s) em atenção no painel completo da versão interna.</p>';
    }
    return h;
  }

  function pcDecisoes(c) {
    const dd = c.dd, pol = c.pol;
    const decisoes = [];
    const mudancas = [];
    c.lista.forEach(function (p) {
      visiveis(p.decisoes || [], pol).forEach(function (d) {
        const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
        if (def && def.pendente) { decisoes.push({ p: p, d: d }); }
      });
      (p.mudancas || []).forEach(function (cm) {
        const def = M.tax('statusMudanca').find(function (x) { return x.id === cm.status; });
        if (def && def.pendente) { mudancas.push({ p: p, c: cm }); }
      });
    });
    const totalCusto = U.sum(mudancas, function (x) { return x.c.impactoCusto; });
    const totalDias = U.sum(mudancas, function (x) { return x.c.impactoDias; });
    const lim = pol.compacto ? 5 : 999;

    let h = pol.compacto ? '<h2>Decisões solicitadas ao comitê</h2>'
      : '<h1>Decisões solicitadas ao comitê</h1>';
    h += '<p class="sub">' + decisoes.length + ' decisão(ões) e ' + mudancas.length +
      ' solicitação(ões) de mudança aguardando deliberação.</p>';

    if (decisoes.length) {
      if (!pol.compacto) { h += '<h2>Decisões pendentes</h2>'; }
      h += '<table><caption>Decisões aguardando o comitê</caption><thead><tr>' +
        '<th>Projeto</th><th>Decisão</th><th>Fórum</th><th class="n">Prazo</th><th class="n">Em aberto</th>' +
        '</tr></thead><tbody>';
      U.sortBy(decisoes, function (x) { return x.d.prazoLimite || '9999'; }).slice(0, lim).forEach(function (x) {
        const venc = x.d.prazoLimite && x.d.prazoLimite < dd;
        h += '<tr><td><b>' + esc(x.p.codigo || x.p.nome) + '</b></td>' +
          '<td>' + esc(x.d.titulo) + selRestrito(x.d) +
          (x.d.impacto && !pol.compacto ? '<br><span class="mudo">' + esc(x.d.impacto) + '</span>' : '') + '</td>' +
          '<td>' + esc(M.rotulo('foruns', x.d.forum)) + '</td>' +
          '<td class="n' + (venc ? ' ruim' : '') + '">' + esc(U.fmtDate(x.d.prazoLimite)) +
          (venc ? '<br>vencida' : '') + '</td>' +
          '<td class="n">' + M.aging(x.d.solicitadaEm, dd) + ' d</td></tr>';
      });
      h += '</tbody></table>';
      if (decisoes.length > lim) {
        h += '<p class="sub">Mais ' + (decisoes.length - lim) + ' decisão(ões) na versão interna.</p>';
      }
    }

    if (mudancas.length) {
      if (!pol.compacto) {
        h += '<h2>Mudanças aguardando aprovação</h2>' +
          '<table><caption>Solicitações de mudança pendentes e seu impacto consolidado</caption><thead><tr>' +
          '<th>Projeto</th><th>Mudança</th><th>Tipo</th><th class="n">Custo</th><th class="n">Prazo</th>' +
          '<th>Baseline</th></tr></thead><tbody>';
        U.sortBy(mudancas, function (x) { return Math.abs(x.c.impactoCusto); }, 'desc').forEach(function (x) {
          h += '<tr><td><b>' + esc(x.p.codigo || x.p.nome) + '</b></td>' +
            '<td>' + esc(x.c.titulo) + (x.c.justificativa ? '<br><span class="mudo">' +
              esc(U.truncar(x.c.justificativa, 110)) + '</span>' : '') + '</td>' +
            '<td>' + esc(M.rotulo('tiposMudanca', x.c.tipo)) + '</td>' +
            '<td class="n' + (x.c.impactoCusto > 0 ? ' ruim' : '') + '">' +
            esc(U.fmtDelta(x.c.impactoCusto, moeda)) + '</td>' +
            '<td class="n">' + (x.c.impactoDias ? '+' + x.c.impactoDias + ' d' : '—') + '</td>' +
            '<td>' + (x.c.afetaBaseline ? 'replanejar' : 'não afeta') + '</td></tr>';
        });
        h += '</tbody><tfoot><tr><td colspan="3">Impacto consolidado se tudo for aprovado</td>' +
          '<td class="n">' + esc(U.fmtDelta(totalCusto, moeda)) + '</td>' +
          '<td class="n">+' + U.fmtNum(totalDias, 0) + ' d</td><td></td></tr></tfoot></table>';
      } else {
        h += '<p class="sub"><b>' + mudancas.length + ' mudança(s) pendente(s)</b> &middot; impacto consolidado ' +
          esc(U.fmtDelta(totalCusto, moeda)) + ' e +' + U.fmtNum(totalDias, 0) + ' dias se tudo for aprovado.</p>';
      }
    }

    if (!decisoes.length && !mudancas.length) {
      h += '<div class="aviso ok"><b>Nada pendente.</b> Não há decisões nem mudanças aguardando o comitê.</div>';
    }
    return h;
  }

  /** Trilha de decisões já deliberadas: quem decidiu, quando e em que fórum. */
  function pcTrilhaDecisoes(c) {
    const linhas = [];
    c.lista.forEach(function (p) {
      (p.decisoes || []).forEach(function (d) {
        const def = M.tax('statusDecisao').find(function (x) { return x.id === d.status; });
        if (def && def.pendente) { return; }
        linhas.push({ p: p, d: d });
      });
    });
    let h = '<h1>Trilha de decisões deliberadas</h1>';
    h += '<p class="sub">Decisões já registradas no período, com fórum, data e responsável. ' +
      'É o registro que a auditoria reconstrói.</p>';
    if (!linhas.length) {
      return h + '<p class="mudo">Nenhuma decisão deliberada no escopo deste pacote.</p>';
    }
    h += '<table><caption>Decisões deliberadas por projeto</caption><thead><tr>' +
      '<th>Projeto</th><th>Decisão</th><th>Situação</th><th>Fórum</th><th class="n">Solicitada</th>' +
      '<th class="n">Decidida</th><th>Quem decidiu</th></tr></thead><tbody>';
    U.sortBy(linhas, function (x) { return x.d.decididaEm || x.d.solicitadaEm || ''; }, 'desc')
      .forEach(function (x) {
        h += '<tr><td><b>' + esc(x.p.codigo || x.p.nome) + '</b></td>' +
          '<td>' + esc(x.d.titulo) + selRestrito(x.d) +
          (x.d.decisao ? '<br><span class="mudo">' + esc(U.truncar(x.d.decisao, 110)) + '</span>' : '') + '</td>' +
          '<td>' + esc(M.rotulo('statusDecisao', x.d.status)) + '</td>' +
          '<td>' + esc(M.rotulo('foruns', x.d.forum)) + '</td>' +
          '<td class="n">' + esc(U.fmtDate(x.d.solicitadaEm)) + '</td>' +
          '<td class="n">' + esc(U.fmtDate(x.d.decididaEm)) + '</td>' +
          '<td>' + esc(x.d.decisorId ? M.nomePessoa(c.b, x.d.decisorId) : '—') + '</td></tr>';
      });
    return h + '</tbody></table>';
  }

  /** Baseline do portfólio e o que a moveu — página exclusiva da auditoria. */
  function pcBaseline(c) {
    let h = '<h1>Baseline e replanejamentos</h1>';
    h += '<p class="sub">Linha de base aprovada contra a previsão corrente, projeto a projeto.</p>';
    h += '<table><caption>Baseline versus previsto por projeto</caption><thead><tr>' +
      '<th>Projeto</th><th class="n">Término baseline</th><th class="n">Término previsto</th>' +
      '<th class="n">Desvio</th><th class="n">BAC baseline</th><th class="n">BAC atual</th>' +
      '<th class="n">Δ orçamento</th><th class="n">Mudanças na baseline</th></tr></thead><tbody>';
    U.sortBy(c.lista, function (p) { return p.codigo || p.nome; }).forEach(function (p) {
      const d = p.dates || {}, f = p.finance || {};
      const desv = U.diffDays(d.baselineFim, d.previstoFim);
      const base = U.num(f.custoBaseline, 0);
      const atual = M.bac(p);
      const repl = (p.mudancas || []).filter(function (m) { return m.afetaBaseline && m.decididaEm; }).length;
      h += '<tr><td><b>' + esc(p.codigo || '') + '</b> ' + esc(U.truncar(p.nome, 28)) + '</td>' +
        '<td class="n">' + esc(U.fmtDate(d.baselineFim)) + '</td>' +
        '<td class="n">' + esc(U.fmtDate(d.previstoFim)) + '</td>' +
        '<td class="n' + (U.ehNum(desv) && desv > 0 ? ' ruim' : '') + '">' +
        (U.ehNum(desv) ? U.fmtDelta(desv, function (v) { return v + ' d'; }) : '—') + '</td>' +
        '<td class="n">' + esc(base ? moeda(base) : '—') + '</td>' +
        '<td class="n">' + esc(moeda(atual)) + '</td>' +
        '<td class="n">' + esc(base ? U.fmtDelta(atual - base, moeda) : '—') + '</td>' +
        '<td class="n">' + repl + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function pcGates(c) {
    const dd = c.dd, pol = c.pol;
    const detalhado = !!pol.gatesDetalhados;
    const limTri = U.addDays(dd, 92);
    const gates = [];
    c.lista.forEach(function (p) {
      (p.gates || []).forEach(function (g) {
        if (!g.previstoData && !g.realData) { return; }
        if (!detalhado) {
          if (g.decisao !== 'pendente' || !g.previstoData) { return; }
          if (g.previstoData > limTri) { return; }
        }
        gates.push({ p: p, g: g, def: M.gatePorId(g.gateId) });
      });
    });
    const lim = pol.compacto ? 5 : 999;

    let h = (pol.compacto ? '<h2>' : '<h1>') +
      (detalhado ? 'Gates registrados' : 'Gates do próximo trimestre') + (pol.compacto ? '</h2>' : '</h1>');
    h += '<p class="sub">' + (detalhado
      ? 'Todos os portões com data registrada, sua decisão e quem aprovou.'
      : 'Portões de decisão previstos até ' + esc(U.fmtDate(limTri)) + '.') + '</p>';

    if (!gates.length) {
      return h + '<p class="mudo">' + (detalhado ? 'Nenhum portão registrado no escopo.'
        : 'Nenhum gate previsto para o próximo trimestre.') + '</p>';
    }
    h += '<table><caption>' + (detalhado ? 'Gates, decisão registrada e aprovador'
      : 'Gates previstos e atrasados') + '</caption><thead><tr>' +
      '<th>Projeto</th><th>Gate</th><th class="n">Previsto</th>' +
      (detalhado ? '<th class="n">Realizado</th><th>Decisão</th><th>Aprovador</th><th>Fórum</th>'
        : '<th>Situação</th>' + (pol.mostraFinanceiro ? '<th class="n">BAC</th>' : '') + '<th>Farol</th>') +
      '</tr></thead><tbody>';
    U.sortBy(gates, function (x) { return x.g.previstoData || x.g.realData; }).slice(0, lim).forEach(function (x) {
      const atraso = x.g.previstoData && x.g.previstoData < dd && !x.g.realData
        ? U.diffDays(x.g.previstoData, dd) : 0;
      h += '<tr><td>' + (pol.compacto
        ? '<b>' + esc(x.p.codigo || '') + '</b> ' + esc(U.truncar(x.p.nome, 24))
        : '<b>' + esc(x.p.codigo || '') + '</b><br><span class="mudo">' +
          esc(U.truncar(x.p.nome, 34)) + '</span>') + '</td>' +
        '<td>' + esc(x.def ? x.def.codigo + ' — ' + x.def.nome : x.g.gateId) + '</td>' +
        '<td class="n">' + esc(U.fmtDate(x.g.previstoData)) + '</td>';
      if (detalhado) {
        h += '<td class="n">' + esc(U.fmtDate(x.g.realData)) + '</td>' +
          '<td>' + esc(M.rotulo('decisoesGate', x.g.decisao)) + '</td>' +
          '<td>' + esc(x.g.aprovadorId ? M.nomePessoa(c.b, x.g.aprovadorId) : '—') + '</td>' +
          '<td>' + esc(M.rotulo('foruns', x.g.forum)) + '</td>';
      } else {
        h += '<td>' + (atraso ? '<span class="ruim">Atrasado ' + atraso + ' d</span>' : 'No prazo') + '</td>' +
          (pol.mostraFinanceiro ? '<td class="n">' + esc(moeda(M.bac(x.p))) + '</td>' : '') +
          '<td>' + farol(M.saudeProjeto(x.p, c.L, dd).rag) + '</td>';
      }
      h += '</tr>';
    });
    h += '</tbody></table>';
    if (gates.length > lim) {
      h += '<p class="sub">Mais ' + (gates.length - lim) + ' gate(s) na versão interna.</p>';
    }
    return h;
  }

  function pcRiscos(c) {
    const riscos = [];
    c.lista.forEach(function (p) {
      visiveis(M.riscosAbertos(p), c.pol).forEach(function (r) {
        riscos.push({ p: p, r: r, exp: (M.scoreRisco(r) / 25) * U.num(r.exposicaoCusto, 0) });
      });
    });
    let h = '<h1>Dez maiores riscos do portfólio</h1>';
    h += '<p class="sub">Ordenados pela exposição financeira ponderada (probabilidade × impacto ÷ 25 × exposição).</p>';
    if (riscos.length) {
      const top = U.sortBy(riscos, function (x) { return x.exp; }, 'desc').slice(0, 10);
      h += '<div class="cx" style="margin-bottom:4mm">';
      h += barrasSvg(top.map(function (x) {
        return { rotulo: (x.p.codigo || '') + ' ' + U.truncar(x.r.titulo, 20), valor: x.exp,
          texto: moeda(x.exp), cor: M.scoreRisco(x.r) >= 20 ? '#d03b3b' : '#eb6834' };
      }), { titulo: 'Exposição ponderada por risco', margE: 175 });
      h += '</div>';
      h += '<table><caption>Detalhe dos dez maiores riscos</caption><thead><tr>' +
        '<th>Projeto</th><th>Risco</th><th class="n">P×I</th><th class="n">Exposição<br>ponderada</th>' +
        '<th>Dono</th><th>Resposta e mitigação</th></tr></thead><tbody>';
      top.forEach(function (x) {
        h += '<tr><td><b>' + esc(x.p.codigo || x.p.nome) + '</b></td>' +
          '<td>' + esc(x.r.titulo) + selRestrito(x.r) + '</td>' +
          '<td class="n">' + x.r.probabilidade + '×' + x.r.impacto + '<br><b>' + M.scoreRisco(x.r) + '</b></td>' +
          '<td class="n"><b>' + esc(moeda(x.exp)) + '</b></td>' +
          '<td>' + esc(M.nomePessoa(c.b, x.r.donoId)) + '</td>' +
          '<td>' + esc(M.rotulo('respostasRisco', x.r.resposta)) +
          (x.r.mitigacao ? '<br><span class="mudo">' + esc(U.truncar(x.r.mitigacao, 100)) + '</span>' : '') +
          '</td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<p class="mudo">Nenhum risco aberto no escopo.</p>';
    }
    return h;
  }

  function pcAnexo(c) {
    const b = c.b, L = c.L, dd = c.dd, lista = c.lista, k = c.k;
    const fin = c.pol.mostraFinanceiro;
    let h = '<h1>Anexo — portfólio completo</h1>';
    h += '<p class="sub">' + lista.length + ' projeto(s) no escopo deste pacote.</p>';
    h += '<table><caption>Situação consolidada de todos os projetos</caption><thead><tr>' +
      '<th>Código</th><th>Projeto</th><th>Farol</th><th>Estágio</th><th class="n">Término</th>' +
      '<th class="n">Avanço</th>' + (fin ? '<th class="n">BAC</th><th class="n">EAC</th>' +
        '<th class="n">SPI</th><th class="n">CPI</th>' : '') + '</tr></thead><tbody>';
    U.sortBy(lista, function (p) { return fin ? M.bac(p) : (p.codigo || p.nome); }, fin ? 'desc' : 'asc')
      .forEach(function (p) {
        const e = M.evm(p, dd);
        const s = M.saudeProjeto(p, L, dd);
        h += '<tr><td><b>' + esc(p.codigo || '') + '</b></td>' +
          '<td>' + esc(U.truncar(p.nome, 40)) + '</td>' +
          '<td>' + farol(s.rag) + '</td>' +
          '<td>' + esc(M.rotulo('estagios', p.estagio)) + '</td>' +
          '<td class="n">' + esc(U.fmtDate(p.dates.previstoFim)) + '</td>' +
          '<td class="n">' + esc(U.fmtPct(e.pctFisico, 0)) + '</td>' +
          (fin ? '<td class="n">' + esc(moeda(e.BAC)) + '</td>' +
            '<td class="n">' + esc(moeda(e.EAC)) + '</td>' +
            '<td class="n">' + esc(e.spiSignificativo ? razao(e.SPI) : '—') + '</td>' +
            '<td class="n">' + esc(e.cpiSignificativo ? razao(e.CPI) : '—') + '</td>' : '') +
          '</tr>';
      });
    if (fin) {
      h += '</tbody><tfoot><tr><td colspan="6">Total</td>' +
        '<td class="n">' + esc(moeda(k.bac)) + '</td>' +
        '<td class="n">' + esc(moeda(k.eac)) + '</td>' +
        '<td class="n">' + esc(razao(k.spi)) + '</td>' +
        '<td class="n">' + esc(razao(k.cpi)) + '</td></tr></tfoot></table>';
    } else {
      h += '</tbody><tfoot><tr><td colspan="5">Avanço médio do portfólio</td>' +
        '<td class="n">' + esc(U.fmtPct(k.pctFisicoMedio, 0)) + '</td></tr></tfoot></table>';
    }
    return h;
  }

  /* Ordem de composição do pacote de comitê. `pagina` diz se a seção ganha
     folha própria; na variante compacta tudo cai numa folha só. */
  const SECOES_PC = [
    { id: 'capa', rot: 'Capa', fn: pcCapa, semRodape: true,
      estilo: 'display:flex;flex-direction:column;justify-content:center;min-height:245mm' },
    { id: 'sumario', rot: 'Sumário executivo', fn: pcSumario },
    { id: 'excecoes', rot: 'Painel de exceções', fn: pcExcecoes },
    { id: 'excecoesResumo', rot: 'Projetos em atenção', fn: pcExcecoesResumo },
    { id: 'decisoesPortfolio', rot: 'Decisões solicitadas', fn: pcDecisoes },
    { id: 'trilhaDecisoes', rot: 'Trilha de decisões', fn: pcTrilhaDecisoes },
    { id: 'gatesPortfolio', rot: 'Gates', fn: pcGates },
    { id: 'baselinePortfolio', rot: 'Baseline e replanejamentos', fn: pcBaseline },
    { id: 'riscosPortfolio', rot: 'Riscos do portfólio', fn: pcRiscos },
    { id: 'anexoTabela', rot: 'Anexo', fn: pcAnexo }
  ];

  ex.pacoteComiteHtml = function (projetos, bundle, opts) {
    const o = opts || {};
    const pol = politica(o.variante);
    const b = bundle || (PMO.store ? PMO.store.state : M.portfolioVazio());
    const L = (b.settings || {}).limiares || M.LIMIARES_PADRAO;
    const dd = U.parseDate(o.dataStatus) || U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const lista = projetos || b.projetos || [];
    const c = {
      lista: lista, b: b, L: L, dd: dd, pol: pol,
      k: M.kpisPortfolio(lista, { limiares: L, dataStatus: dd }),
      restritos: contarRestritos(lista)
    };
    const ativas = SECOES_PC.filter(function (sec) { return pol.secoes[sec.id]; });
    let h = '';

    if (pol.compacto) {
      /* Fluxo contínuo: cabeçalho enxuto no lugar da capa e nenhuma quebra
         forçada. Um portfólio grande ainda ocupa mais de uma folha — o que a
         variante promete é o corte do conteúdo, não um número fixo de páginas.
         A promessa de uma folha A4 é do status report executivo, que é por
         projeto e cabe de fato. */
      h += '<div class="pg compacto">';
      h += '<div class="cab"><div><h1>Comitê de Portfólio</h1>' +
        '<p class="sub">' + esc((b.meta || {}).orgName || '') + ' &middot; data de status ' +
        esc(U.fmtDate(dd)) + ' &middot; ' + lista.length + ' projeto(s)</p></div>' +
        '<div style="text-align:right">' + selo(pol) +
        '<p class="sub" style="margin-top:1.5mm">' + esc(pol.publico) + '</p></div></div>';
      ativas.forEach(function (sec) { h += sec.fn(c); });
      h += rodape(b, 'Pacote do comitê &middot; versão ' + pol.rotulo.toLowerCase());
      h += '</div>';
    } else {
      ativas.forEach(function (sec, i) {
        const ultima = i === ativas.length - 1;
        h += '<div class="pg' + (ultima ? '' : ' quebra') + '"' +
          (sec.estilo ? ' style="' + sec.estilo + '"' : '') + '>';
        h += sec.fn(c);
        if (!sec.semRodape) { h += rodape(b, sec.rot + ' &middot; versão ' + pol.rotulo.toLowerCase()); }
        h += '</div>';
      });
    }
    return doc('Pacote do Comitê de Portfólio — ' + U.fmtDate(dd) + ' (' + pol.rotulo + ')', h);
  };

  ex.baixarPacoteComite = function (projetos, bundle, opts) {
    const o = opts || {};
    const dd = o.dataStatus || U.hoje();
    return U.download('pacote-comite-' + politica(o.variante).id + '-' + dd + '.html',
      ex.pacoteComiteHtml(projetos, bundle, o), 'text/html;charset=utf-8');
  };

  /* ================================================== abrir p/ impressão */

  ex.abrirParaImpressao = function (html) {
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) {
        URL.revokeObjectURL(url);
        U.toast('O navegador bloqueou a nova aba. Baixando o arquivo — abra e use Ctrl+P.', 'warn');
        return U.download('relatorio-pmo.html', html, 'text/html;charset=utf-8');
      }
      w.addEventListener('load', function () {
        setTimeout(function () { try { w.print(); } catch (e) { /* usuário imprime manualmente */ } }, 350);
      });
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return true;
    } catch (e) {
      U.toast('Não consegui abrir para impressão: ' + (e.message || e), 'erro');
      return U.download('relatorio-pmo.html', html, 'text/html;charset=utf-8');
    }
  };

  /* ============================================================ MARKDOWN */

  ex.markdown = function (projeto, bundle) {
    const b = bundle || (PMO.store ? PMO.store.state : M.portfolioVazio());
    const L = (b.settings || {}).limiares || M.LIMIARES_PADRAO;
    const dd = U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const p = projeto;
    const e = M.evm(p, dd);
    const s = M.saudeProjeto(p, L, dd);
    const sr = U.sortBy(p.statusReports || [], function (x) { return x.reportadoEm; }, 'desc')[0];
    const L2 = [];

    L2.push('# ' + (p.codigo ? p.codigo + ' — ' : '') + p.nome);
    L2.push('');
    L2.push('**Farol:** ' + M.rotuloRag(s.rag) + '  |  **Data de status:** ' + U.fmtDate(dd));
    L2.push('**Programa:** ' + M.nomePrograma(b, p.programaId) +
      '  |  **Gerente:** ' + M.nomePessoa(b, p.pmId) +
      '  |  **Sponsor:** ' + M.nomePessoa(b, p.sponsorId));
    L2.push('');
    L2.push('## Indicadores');
    L2.push('');
    L2.push('| Indicador | Valor |');
    L2.push('| --- | ---: |');
    L2.push('| Orçamento (BAC) | ' + moeda(e.BAC) + ' |');
    L2.push('| Custo real (AC) | ' + moeda(e.AC) + ' |');
    L2.push('| Projeção (EAC) | ' + moeda(e.EAC) + ' |');
    L2.push('| Variação final (VAC) | ' + moeda(e.VAC) + ' |');
    L2.push('| SPI | ' + (e.spiSignificativo ? razao(e.SPI) : razao(e.SPI) + ' (não significativo)') + ' |');
    L2.push('| CPI | ' + (e.cpiSignificativo ? razao(e.CPI) : razao(e.CPI) + ' (não significativo)') + ' |');
    L2.push('| Avanço físico | ' + U.fmtPct(e.pctFisico, 0) + ' (planejado ' + U.fmtPct(e.pctPlanejado, 0) + ') |');
    L2.push('| Desvio de prazo | ' + (U.ehNum(e.desvioDias)
      ? (e.desvioDias > 0 ? '+' + e.desvioDias + ' dias' : 'no prazo') : '—') + ' |');
    L2.push('');
    L2.push('## Por que o farol está ' + M.rotuloRag(s.rag).toLowerCase());
    L2.push('');
    s.motivos.forEach(function (m) { L2.push('- ' + m.texto); });
    L2.push('');

    if (sr) {
      L2.push('## Narrativa (' + U.fmtPeriodo(sr.periodo) + ')');
      L2.push('');
      if (sr.destaques) { L2.push('**Destaques:** ' + sr.destaques); L2.push(''); }
      if (sr.pontosAtencao) { L2.push('**Pontos de atenção:** ' + sr.pontosAtencao); L2.push(''); }
      if (sr.proximosPassos) { L2.push('**Próximos passos:** ' + sr.proximosPassos); L2.push(''); }
      if (sr.pedidosComite) { L2.push('> **Pedido ao comitê:** ' + sr.pedidosComite); L2.push(''); }
    } else {
      L2.push('> Narrativa não preenchida: este projeto não possui status report registrado.');
      L2.push('');
    }

    const riscos = U.sortBy(M.riscosAbertos(p), function (r) { return M.scoreRisco(r); }, 'desc').slice(0, 5);
    if (riscos.length) {
      L2.push('## Principais riscos abertos');
      L2.push('');
      L2.push('| Risco | P×I | Exposição | Dono |');
      L2.push('| --- | ---: | ---: | --- |');
      riscos.forEach(function (r) {
        L2.push('| ' + r.titulo.replace(/\|/g, '\\|') + ' | ' + r.probabilidade + '×' + r.impacto +
          ' = ' + M.scoreRisco(r) + ' | ' + moeda(r.exposicaoCusto) + ' | ' + M.nomePessoa(b, r.donoId) + ' |');
      });
      L2.push('');
    }
    L2.push('---');
    L2.push('*Gerado pelo PMO Tool em ' + U.fmtDataHora(U.agoraIso()) + '.*');
    return L2.join('\n');
  };

  ex.markdownPortfolio = function (projetos, bundle) {
    const b = bundle || (PMO.store ? PMO.store.state : M.portfolioVazio());
    const L = (b.settings || {}).limiares || M.LIMIARES_PADRAO;
    const dd = U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const lista = projetos || b.projetos || [];
    const k = M.kpisPortfolio(lista, { limiares: L, dataStatus: dd });
    const out = [];

    out.push('# Portfólio — ' + ((b.meta || {}).orgName || ''));
    out.push('');
    out.push('Data de status: **' + U.fmtDate(dd) + '**  |  ' + lista.length + ' projetos (' + k.ativos + ' ativos)');
    out.push('');
    out.push('## Resumo');
    out.push('');
    out.push('| Indicador | Valor |');
    out.push('| --- | ---: |');
    out.push('| Orçamento (BAC) | ' + moeda(k.bac) + ' |');
    out.push('| Custo real (AC) | ' + moeda(k.ac) + ' (' + U.fmtPct(k.burnPct, 0) + ') |');
    out.push('| Projeção (EAC) | ' + moeda(k.eac) + ' |');
    out.push('| Variação final (VAC) | ' + moeda(k.vac) + ' |');
    out.push('| SPI / CPI | ' + razao(k.spi) + ' / ' + razao(k.cpi) + ' |');
    out.push('| Farol | ' + k.distRag.verde + ' verde, ' + k.distRag.ambar + ' âmbar, ' +
      k.distRag.vermelho + ' vermelho, ' + k.distRag.azul + ' concluído, ' + k.distRag.cinza + ' suspenso |');
    out.push('| Riscos abertos | ' + k.riscosAbertos + ' (' + k.riscosAltos + ' altos) |');
    out.push('| Decisões pendentes | ' + k.decisoesPendentes + ' (' + k.decisoesVencidas + ' vencidas) |');
    out.push('');
    out.push('## Projetos');
    out.push('');
    out.push('| Código | Projeto | Farol | Estágio | Término | Avanço | BAC | EAC |');
    out.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: |');
    U.sortBy(lista, function (p) { return M.bac(p); }, 'desc').forEach(function (p) {
      const e = M.evm(p, dd);
      const s = M.saudeProjeto(p, L, dd);
      out.push('| ' + (p.codigo || '') + ' | ' + String(p.nome).replace(/\|/g, '\\|') + ' | ' +
        M.rotuloRag(s.rag) + ' | ' + M.rotulo('estagios', p.estagio) + ' | ' +
        U.fmtDate(p.dates.previstoFim) + ' | ' + U.fmtPct(e.pctFisico, 0) + ' | ' +
        moeda(e.BAC) + ' | ' + moeda(e.EAC) + ' |');
    });
    out.push('');
    out.push('---');
    out.push('*Gerado pelo PMO Tool em ' + U.fmtDataHora(U.agoraIso()) + '.*');
    return out.join('\n');
  };

  /* =============================================================== MSPDI */

  function dtMspdi(iso, hora) {
    const d = U.parseDate(iso);
    if (!d) { return null; }
    return d + 'T' + (hora || '08:00:00');
  }

  /**
   * MSPDI de governanca: um resumo por fase de gate, contendo os marcos daquela
   * fase. NAO exporta WBS detalhado — por desenho, o detalhe vive no arquivo de
   * projeto anexado, nao aqui.
   */
  ex.mspdi = function (projeto, bundle) {
    const b = bundle || (PMO.store ? PMO.store.state : M.portfolioVazio());
    const p = projeto;
    const dd = U.parseDate((b.meta || {}).dataStatus) || U.hoje();
    const X = U.xmlEscape;
    const ini = p.dates.previstoInicio || p.dates.baselineInicio || dd;
    const fim = p.dates.previstoFim || p.dates.baselineFim || dd;

    let uid = 1;
    let tarefas = [];
    const temWbs = ((p.tarefas || []).length > 0);

    if (temWbs) {
      /* Cronograma importado: exporta a WBS como ela é. É isto que fecha o
         round-trip — reimportar este arquivo reproduz os mesmos agregados,
         em vez de recalcular avanço a partir de marcos sem custo. */
      tarefas = p.tarefas.map(function (t, i) {
        return {
          uid: uid++, id: i,
          nome: t.nome || ('Tarefa ' + (i + 1)),
          nivel: U.clamp(Math.round(U.num(t.nivel, 1)), 1, 20),
          outline: t.outline || String(i + 1),
          resumo: t.resumo ? 1 : 0,
          marco: t.marco ? 1 : 0,
          critico: t.critico ? 1 : 0,
          inicio: t.inicio || t.baselineInicio || ini,
          fim: t.fim || t.baselineFim || t.inicio || fim,
          pct: U.clamp(Math.round(U.num(t.pct, 0)), 0, 100),
          custo: U.num(t.custo, 0) || U.num(t.custoBaseline, 0),
          custoBase: U.num(t.custoBaseline, 0),
          custoReal: U.num(t.custoReal, 0),
          trabalho: U.num(t.trabalho, 0),
          realIni: t.realInicio, realFim: t.realFim,
          baseIni: t.baselineInicio, baseFim: t.baselineFim
        };
      });
    } else {
      /* Sem WBS importada: resumo de governança, um agrupamento por gate.
         Continua sendo um MSPDI válido, mas reimportá-lo recalcula o avanço a
         partir de marcos — por isso o resultado carrega um aviso na interface. */
      tarefas.push({
        uid: uid++, id: 0, nome: p.nome, nivel: 1, outline: '1', resumo: 1, marco: 0,
        inicio: ini, fim: fim, pct: Math.round(U.num(p.progress.pctFisico, 0)),
        custo: M.bac(p), custoBase: M.bac(p), custoReal: U.num(p.finance.custoReal, 0), trabalho: 0,
        baseIni: p.dates.baselineInicio, baseFim: p.dates.baselineFim
      });

      const porGate = U.groupBy(p.marcos || [], function (m) { return m.gateId || '_sem'; });
      let ordemFase = 1;
      M.gates().concat([{ id: '_sem', codigo: 'MS', nome: 'Marcos sem gate', ordem: 99 }]).forEach(function (g) {
        const ms = porGate[g.id];
        if (!ms || !ms.length) { return; }
        const datas = ms.map(function (m) { return m.previstoData || m.baselineData; }).filter(Boolean).sort();
        const faseUid = uid++;
        ordemFase += 1;
        tarefas.push({
          uid: faseUid, id: tarefas.length, nome: g.codigo + ' — ' + g.nome, nivel: 2,
          outline: '1.' + (ordemFase - 1), resumo: 1, marco: 0,
          inicio: datas[0] || ini, fim: datas[datas.length - 1] || fim,
          pct: Math.round(U.safeDiv(ms.filter(function (m) { return m.realData; }).length, ms.length) * 100),
          custo: 0, custoBase: 0, custoReal: 0, trabalho: 0, baseIni: null, baseFim: null
        });
        let ordemM = 0;
        ms.forEach(function (m) {
          ordemM += 1;
          tarefas.push({
            uid: uid++, id: tarefas.length, nome: m.nome, nivel: 3,
            outline: '1.' + (ordemFase - 1) + '.' + ordemM, resumo: 0, marco: 1,
            inicio: m.realData || m.previstoData || m.baselineData,
            fim: m.realData || m.previstoData || m.baselineData,
            pct: m.realData ? 100 : 0, custo: 0, custoBase: 0, custoReal: 0, trabalho: 0,
            realIni: m.realData, realFim: m.realData,
            baseIni: m.baselineData, baseFim: m.baselineData
          });
        });
      });
    }

    const recursos = (p.alocacoes || []).map(function (a, i) {
      const pes = (b.pessoas || []).find(function (x) { return x.id === a.pessoaId; });
      return { uid: i + 1, nome: pes ? pes.nome : 'Recurso ' + (i + 1),
        taxa: pes ? U.num(pes.custoHora, 0) : 0, papel: a.papel };
    });

    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    x += '<Project xmlns="http://schemas.microsoft.com/project">\n';
    x += '  <SaveVersion>14</SaveVersion>\n';
    x += '  <Name>' + X((p.codigo || 'projeto') + '.xml') + '</Name>\n';
    x += '  <Title>' + X(p.nome) + '</Title>\n';
    /* Subject carrega a DESCRIÇÃO, não o código: o leitor de MSPDI mapeia
       Subject -> descricao, e pôr o código aqui fazia a reimportação propor
       substituir a descrição do projeto por "PRJ-0000". O código continua
       recuperável por Keywords e pelo nome do arquivo. */
    x += '  <Subject>' + X(U.truncar(p.descricao || '', 250)) + '</Subject>\n';
    x += '  <Author>PMO Tool</Author>\n';
    x += '  <Manager>' + X(M.nomePessoa(b, p.pmId)) + '</Manager>\n';
    x += '  <Company>' + X((b.meta || {}).orgName || '') + '</Company>\n';
    x += '  <Keywords>' + X((p.codigo || '') + '; governanca; PMO Tool') + '</Keywords>\n';
    x += '  <CreationDate>' + X(dtMspdi(U.hoje())) + '</CreationDate>\n';
    x += '  <StartDate>' + X(dtMspdi(ini)) + '</StartDate>\n';
    x += '  <FinishDate>' + X(dtMspdi(fim, '17:00:00')) + '</FinishDate>\n';
    x += '  <StatusDate>' + X(dtMspdi(dd)) + '</StatusDate>\n';
    x += '  <CurrencyCode>BRL</CurrencyCode>\n';
    x += '  <CurrencySymbol>R$</CurrencySymbol>\n';
    x += '  <CurrencySymbolPosition>0</CurrencySymbolPosition>\n';
    x += '  <CurrencyDigits>2</CurrencyDigits>\n';
    x += '  <CalendarUID>1</CalendarUID>\n';
    x += '  <ScheduleFromStart>1</ScheduleFromStart>\n';
    x += '  <FYStartDate>1</FYStartDate>\n';
    x += '  <DefaultStartTime>08:00:00</DefaultStartTime>\n';
    x += '  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n';
    x += '  <MinutesPerDay>480</MinutesPerDay>\n';
    x += '  <MinutesPerWeek>2400</MinutesPerWeek>\n';
    x += '  <DaysPerMonth>20</DaysPerMonth>\n';

    // calendário padrão: seg-sex 08:00-12:00 e 13:00-17:00
    x += '  <Calendars>\n    <Calendar>\n      <UID>1</UID>\n      <Name>Padrão</Name>\n';
    x += '      <IsBaseCalendar>1</IsBaseCalendar>\n      <BaseCalendarUID>-1</BaseCalendarUID>\n';
    x += '      <WeekDays>\n';
    for (let dw = 1; dw <= 7; dw++) {
      const util = dw >= 2 && dw <= 6;
      x += '        <WeekDay>\n          <DayType>' + dw + '</DayType>\n';
      x += '          <DayWorking>' + (util ? 1 : 0) + '</DayWorking>\n';
      if (util) {
        x += '          <WorkingTimes>\n';
        x += '            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>\n';
        x += '            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>\n';
        x += '          </WorkingTimes>\n';
      }
      x += '        </WeekDay>\n';
    }
    x += '      </WeekDays>\n    </Calendar>\n  </Calendars>\n';

    x += '  <Tasks>\n';
    tarefas.forEach(function (t) {
      if (!t.inicio || !t.fim) { return; }
      x += '    <Task>\n';
      x += '      <UID>' + t.uid + '</UID>\n';
      x += '      <ID>' + t.id + '</ID>\n';
      x += '      <Name>' + X(t.nome) + '</Name>\n';
      x += '      <Active>1</Active>\n';
      x += '      <Type>1</Type>\n';
      x += '      <IsNull>0</IsNull>\n';
      x += '      <OutlineLevel>' + t.nivel + '</OutlineLevel>\n';
      x += '      <OutlineNumber>' + X(t.outline) + '</OutlineNumber>\n';
      x += '      <Priority>500</Priority>\n';
      x += '      <Start>' + X(dtMspdi(t.inicio)) + '</Start>\n';
      x += '      <Finish>' + X(dtMspdi(t.fim, '17:00:00')) + '</Finish>\n';
      // datas reais preservam o início/fim efetivos no round-trip
      if (t.realIni) { x += '      <ActualStart>' + X(dtMspdi(t.realIni)) + '</ActualStart>\n'; }
      if (t.realFim) { x += '      <ActualFinish>' + X(dtMspdi(t.realFim, '17:00:00')) + '</ActualFinish>\n'; }
      x += '      <Duration>' + (t.marco ? 'PT0H0M0S'
        : U.horasParaDuracaoIso(Math.max(8, (U.diffDays(t.inicio, t.fim) || 1) * 8))) + '</Duration>\n';
      x += '      <DurationFormat>7</DurationFormat>\n';
      if (U.num(t.trabalho, 0) > 0) {
        // Work permite ao leitor ponderar o avanço por horas quando não há custo
        x += '      <Work>' + U.horasParaDuracaoIso(t.trabalho) + '</Work>\n';
      }
      x += '      <Milestone>' + t.marco + '</Milestone>\n';
      x += '      <Summary>' + t.resumo + '</Summary>\n';
      x += '      <Critical>' + (t.critico ? 1 : (t.marco ? 1 : 0)) + '</Critical>\n';
      x += '      <PercentComplete>' + U.clamp(Math.round(t.pct), 0, 100) + '</PercentComplete>\n';
      x += '      <PercentWorkComplete>' + U.clamp(Math.round(t.pct), 0, 100) + '</PercentWorkComplete>\n';
      x += '      <FixedCost>' + U.arredondar(t.resumo ? 0 : t.custo, 2) + '</FixedCost>\n';
      x += '      <FixedCostAccrual>3</FixedCostAccrual>\n';
      x += '      <Cost>' + U.arredondar(t.custo, 2) + '</Cost>\n';
      if (U.num(t.custoReal, 0) > 0) {
        x += '      <ActualCost>' + U.arredondar(t.custoReal, 2) + '</ActualCost>\n';
      }
      if (t.baseIni || t.baseFim) {
        x += '      <Baseline>\n        <Number>0</Number>\n';
        if (t.baseIni) { x += '        <Start>' + X(dtMspdi(t.baseIni)) + '</Start>\n'; }
        if (t.baseFim) { x += '        <Finish>' + X(dtMspdi(t.baseFim, '17:00:00')) + '</Finish>\n'; }
        x += '        <Duration>' + (t.marco ? 'PT0H0M0S' : U.horasParaDuracaoIso(
          Math.max(8, (U.diffDays(t.baseIni || t.inicio, t.baseFim || t.fim) || 1) * 8))) + '</Duration>\n';
        x += '        <DurationFormat>7</DurationFormat>\n';
        if (U.num(t.trabalho, 0) > 0) {
          x += '        <Work>' + U.horasParaDuracaoIso(t.trabalho) + '</Work>\n';
        }
        x += '        <Cost>' + U.arredondar(t.custoBase, 2) + '</Cost>\n';
        x += '      </Baseline>\n';
      }
      x += '    </Task>\n';
    });
    x += '  </Tasks>\n';

    x += '  <Resources>\n';
    recursos.forEach(function (r) {
      x += '    <Resource>\n      <UID>' + r.uid + '</UID>\n      <ID>' + r.uid + '</ID>\n';
      x += '      <Name>' + X(r.nome) + '</Name>\n';
      x += '      <Type>1</Type>\n';
      x += '      <Group>' + X(r.papel || '') + '</Group>\n';
      x += '      <MaxUnits>1</MaxUnits>\n';
      x += '      <StandardRate>' + U.arredondar(r.taxa, 2) + '</StandardRate>\n';
      x += '      <StandardRateFormat>2</StandardRateFormat>\n';
      x += '      <CalendarUID>1</CalendarUID>\n';
      x += '    </Resource>\n';
    });
    x += '  </Resources>\n';
    x += '</Project>\n';
    return x;
  };

  ex.mspdiPortfolio = function (projetos, bundle) {
    // Um arquivo por projeto é o formato que o MS Project realmente consome bem.
    // Aqui devolvemos o do primeiro projeto e avisamos — evita gerar um XML
    // sintaticamente válido mas semanticamente confuso.
    const lista = projetos || [];
    if (!lista.length) { return ex.mspdi(M.projetoVazio(), bundle); }
    if (lista.length > 1) {
      U.toast('MSPDI é gerado por projeto. Exportando ' + (lista[0].codigo || lista[0].nome) + '.', 'info');
    }
    return ex.mspdi(lista[0], bundle);
  };

  ex.baixarMspdi = function (projeto, bundle) {
    return U.download((projeto.codigo || 'projeto') + '.xml', ex.mspdi(projeto, bundle),
      'application/xml;charset=utf-8');
  };
})(window.PMO = window.PMO || {});
