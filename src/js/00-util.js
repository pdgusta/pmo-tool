/* =============================================================================
   00-util.js — utilitarios puros, formatacao pt-BR e helpers de DOM
   Nao depende de nenhum outro modulo. Primeiro a carregar.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const util = {};

  /* ------------------------------------------------------------------- ids */

  let _seq = 0;
  util.uid = function (prefixo) {
    _seq += 1;
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 7);
    return (prefixo || 'id') + '-' + t + '-' + _seq.toString(36) + r;
  };

  /* ------------------------------------------------------------- numeros */

  util.ehNum = function (v) {
    return typeof v === 'number' && isFinite(v);
  };

  util.num = function (v, padrao) {
    if (typeof v === 'number') { return isFinite(v) ? v : (padrao || 0); }
    if (v === null || v === undefined || v === '') { return padrao === undefined ? 0 : padrao; }
    let s = String(v).trim();
    if (!s) { return padrao === undefined ? 0 : padrao; }
    // remove moeda, espacos e separadores de milhar pt-BR
    s = s.replace(/[R$\s\u00A0]/gi, '');
    const temVirgula = s.indexOf(',') >= 0;
    const temPonto = s.indexOf('.') >= 0;
    if (temVirgula && temPonto) {
      // assume pt-BR: ponto = milhar, virgula = decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (temVirgula) {
      s = s.replace(',', '.');
    } else if (temPonto) {
      // "1.250.000" -> milhar ;  "1250.5" -> decimal
      const partes = s.split('.');
      const todasTres = partes.slice(1).every((p) => p.length === 3);
      if (partes.length > 2 || (partes.length === 2 && todasTres)) { s = partes.join(''); }
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : (padrao === undefined ? 0 : padrao);
  };

  util.safeDiv = function (a, b, padrao) {
    const fb = padrao === undefined ? 0 : padrao;
    if (!util.ehNum(a) || !util.ehNum(b) || b === 0) { return fb; }
    const r = a / b;
    return isFinite(r) ? r : fb;
  };

  util.clamp = function (n, min, max) {
    if (!util.ehNum(n)) { return min; }
    return n < min ? min : (n > max ? max : n);
  };

  util.arredondar = function (n, dec) {
    const d = dec === undefined ? 0 : dec;
    const f = Math.pow(10, d);
    return Math.round((util.ehNum(n) ? n : 0) * f) / f;
  };

  const _fmtCache = {};
  function nf(dec) {
    const k = 'n' + dec;
    if (!_fmtCache[k]) {
      _fmtCache[k] = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: dec, maximumFractionDigits: dec
      });
    }
    return _fmtCache[k];
  }

  util.fmtNum = function (n, dec) {
    if (!util.ehNum(n)) { return '—'; }
    return nf(dec === undefined ? 0 : dec).format(n);
  };

  util.fmtPct = function (n, dec) {
    if (!util.ehNum(n)) { return '—'; }
    return nf(dec === undefined ? 0 : dec).format(n) + '%';
  };

  /** Razao tipo SPI/CPI: 1,02 */
  util.fmtRazao = function (n, dec) {
    if (!util.ehNum(n)) { return '—'; }
    return nf(dec === undefined ? 2 : dec).format(n);
  };

  util.fmtMoney = function (n, opts) {
    const o = opts || {};
    if (!util.ehNum(n)) { return '—'; }
    const simbolo = o.simbolo === false ? '' : 'R$ ';
    const neg = n < 0;
    const abs = Math.abs(n);
    let corpo;
    if (o.compact) {
      if (abs >= 1e9) { corpo = nf(abs >= 1e10 ? 0 : 1).format(abs / 1e9) + ' bi'; }
      else if (abs >= 1e6) { corpo = nf(abs >= 1e7 ? 0 : 1).format(abs / 1e6) + ' mi'; }
      else if (abs >= 1e3) { corpo = nf(0).format(abs / 1e3) + ' mil'; }
      else { corpo = nf(0).format(abs); }
    } else {
      corpo = nf(o.dec === undefined ? 0 : o.dec).format(abs);
    }
    return (neg ? '-' : '') + simbolo + corpo;
  };

  /** Delta com sinal explicito: "+R$ 1,2 mi" / "-12 dias" */
  util.fmtDelta = function (n, fn) {
    if (!util.ehNum(n)) { return '—'; }
    const f = fn || util.fmtNum;
    return (n > 0 ? '+' : '') + f(n);
  };

  /* --------------------------------------------------------------- datas */

  const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})/;
  const RE_BR = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** Normaliza qualquer entrada para ISO 'YYYY-MM-DD' ou null. Nunca lanca. */
  util.parseDate = function (v) {
    if (v === null || v === undefined || v === '') { return null; }
    if (v instanceof Date) {
      if (isNaN(v.getTime())) { return null; }
      return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    const s = String(v).trim();
    if (!s) { return null; }
    let m = RE_ISO.exec(s);
    if (m) {
      const a = +m[1], mes = +m[2], d = +m[3];
      if (mes < 1 || mes > 12 || d < 1 || d > 31) { return null; }
      return m[1] + '-' + m[2] + '-' + m[3];
    }
    m = RE_BR.exec(s);
    if (m) {
      let a = +m[3];
      if (a < 100) { a += a < 70 ? 2000 : 1900; }
      const d = +m[1], mes = +m[2];
      if (mes < 1 || mes > 12 || d < 1 || d > 31) { return null; }
      return a + '-' + pad2(mes) + '-' + pad2(d);
    }
    const t = Date.parse(s);
    if (!isNaN(t)) {
      const dt = new Date(t);
      return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
    }
    return null;
  };

  /** Date em UTC meio-dia — evita salto de fuso ao formatar. */
  util.paraDate = function (iso) {
    const p = util.parseDate(iso);
    if (!p) { return null; }
    const partes = p.split('-');
    return new Date(Date.UTC(+partes[0], +partes[1] - 1, +partes[2], 12, 0, 0));
  };

  util.hoje = function () {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };

  util.agoraIso = function () { return new Date().toISOString(); };

  util.fmtDate = function (iso) {
    const p = util.parseDate(iso);
    if (!p) { return '—'; }
    const x = p.split('-');
    return x[2] + '/' + x[1] + '/' + x[0];
  };

  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  util.MESES_ABREV = MESES_ABREV;
  util.MESES = MESES;

  util.fmtDateShort = function (iso) {
    const p = util.parseDate(iso);
    if (!p) { return '—'; }
    const x = p.split('-');
    return x[2] + '/' + MESES_ABREV[+x[1] - 1];
  };

  /** '2026-07' -> 'jul/26' */
  util.fmtPeriodo = function (periodo) {
    if (!periodo) { return '—'; }
    const x = String(periodo).split('-');
    if (x.length < 2) { return String(periodo); }
    const mi = +x[1] - 1;
    if (mi < 0 || mi > 11) { return String(periodo); }
    return MESES_ABREV[mi] + '/' + x[0].slice(2);
  };

  util.fmtDataHora = function (iso) {
    if (!iso) { return '—'; }
    const d = new Date(iso);
    if (isNaN(d.getTime())) { return '—'; }
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  };

  util.addDays = function (iso, n) {
    const d = util.paraDate(iso);
    if (!d) { return null; }
    d.setUTCDate(d.getUTCDate() + (util.ehNum(n) ? Math.round(n) : 0));
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  };

  util.addMeses = function (iso, n) {
    const d = util.paraDate(iso);
    if (!d) { return null; }
    const dia = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + (util.ehNum(n) ? Math.round(n) : 0));
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dia, ultimo));
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  };

  /** b - a em dias inteiros. null se qualquer data invalida. */
  util.diffDays = function (a, b) {
    const da = util.paraDate(a), db = util.paraDate(b);
    if (!da || !db) { return null; }
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  };

  /** Dias uteis (seg-sex) entre duas datas, inclusivo. */
  util.diffDiasUteis = function (a, b) {
    const da = util.paraDate(a), db = util.paraDate(b);
    if (!da || !db) { return null; }
    let ini = da, fim = db, sinal = 1;
    if (da > db) { ini = db; fim = da; sinal = -1; }
    let cont = 0;
    const cur = new Date(ini.getTime());
    while (cur <= fim) {
      const dw = cur.getUTCDay();
      if (dw !== 0 && dw !== 6) { cont += 1; }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return cont * sinal;
  };

  /** '2026-07-31' -> '2026-07' */
  util.periodoDe = function (iso) {
    const p = util.parseDate(iso);
    if (!p) { return null; }
    return p.slice(0, 7);
  };

  /** Lista de periodos 'YYYY-MM' de a ate b, inclusivo. Teto de 240 meses. */
  util.periodosEntre = function (a, b) {
    const pa = util.periodoDe(a), pb = util.periodoDe(b);
    if (!pa || !pb) { return []; }
    const out = [];
    let cur = pa + '-01';
    const lim = pb + '-01';
    let guarda = 0;
    while (cur <= lim && guarda < 240) {
      out.push(cur.slice(0, 7));
      cur = util.addMeses(cur, 1);
      guarda += 1;
    }
    return out;
  };

  util.trimestreDe = function (iso) {
    const p = util.periodoDe(iso);
    if (!p) { return null; }
    const m = +p.slice(5, 7);
    return p.slice(0, 4) + '-T' + Math.ceil(m / 3);
  };

  /** Sobreposicao de intervalos (datas ISO). */
  util.sobrepoe = function (a1, a2, b1, b2) {
    if (!a1 || !a2 || !b1 || !b2) { return false; }
    return a1 <= b2 && b1 <= a2;
  };

  /* --------------------------------------------------------------- arrays */

  util.sum = function (arr, fn) {
    if (!arr || !arr.length) { return 0; }
    let t = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = fn ? fn(arr[i], i) : arr[i];
      if (util.ehNum(v)) { t += v; }
    }
    return t;
  };

  util.media = function (arr, fn) {
    if (!arr || !arr.length) { return 0; }
    const vals = [];
    for (let i = 0; i < arr.length; i++) {
      const v = fn ? fn(arr[i], i) : arr[i];
      if (util.ehNum(v)) { vals.push(v); }
    }
    return vals.length ? util.sum(vals) / vals.length : 0;
  };

  util.max = function (arr, fn) {
    let m = null;
    (arr || []).forEach(function (x, i) {
      const v = fn ? fn(x, i) : x;
      if (util.ehNum(v) && (m === null || v > m)) { m = v; }
    });
    return m;
  };

  util.min = function (arr, fn) {
    let m = null;
    (arr || []).forEach(function (x, i) {
      const v = fn ? fn(x, i) : x;
      if (util.ehNum(v) && (m === null || v < m)) { m = v; }
    });
    return m;
  };

  util.groupBy = function (arr, fn) {
    const out = {};
    (arr || []).forEach(function (x, i) {
      const k = String(fn(x, i));
      if (!out[k]) { out[k] = []; }
      out[k].push(x);
    });
    return out;
  };

  util.contarPor = function (arr, fn) {
    const out = {};
    (arr || []).forEach(function (x, i) {
      const k = String(fn(x, i));
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  };

  util.uniq = function (arr) {
    const vistos = Object.create(null);
    const out = [];
    (arr || []).forEach(function (x) {
      const k = typeof x === 'object' ? JSON.stringify(x) : (typeof x) + ':' + String(x);
      if (!vistos[k]) { vistos[k] = 1; out.push(x); }
    });
    return out;
  };

  util.indexarPor = function (arr, campo) {
    const out = {};
    (arr || []).forEach(function (x) {
      if (x && x[campo] !== undefined && x[campo] !== null) { out[x[campo]] = x; }
    });
    return out;
  };

  const colator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  util.colator = colator;

  util.sortBy = function (arr, fn, dir) {
    const d = dir === 'desc' ? -1 : 1;
    return (arr || []).slice().sort(function (a, b) {
      const va = fn(a), vb = fn(b);
      const na = va === null || va === undefined || va === '';
      const nb = vb === null || vb === undefined || vb === '';
      if (na && nb) { return 0; }
      if (na) { return 1; }   // vazios sempre no fim
      if (nb) { return -1; }
      if (typeof va === 'number' && typeof vb === 'number') { return (va - vb) * d; }
      return colator.compare(String(va), String(vb)) * d;
    });
  };

  /** Percentil (0..100) de uma lista numerica. */
  util.percentil = function (arr, p) {
    const vals = (arr || []).filter(util.ehNum).sort(function (a, b) { return a - b; });
    if (!vals.length) { return 0; }
    const idx = util.clamp((p / 100) * (vals.length - 1), 0, vals.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) { return vals[lo]; }
    return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
  };

  /* ---------------------------------------------------------------- texto */

  /** Remove diacriticos e baixa a caixa — para busca tolerante. */
  util.normalizar = function (s) {
    if (s === null || s === undefined) { return ''; }
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  };

  util.contemTexto = function (alvo, busca) {
    if (!busca) { return true; }
    return util.normalizar(alvo).indexOf(util.normalizar(busca)) >= 0;
  };

  util.truncar = function (s, n) {
    const t = String(s === null || s === undefined ? '' : s);
    if (t.length <= n) { return t; }
    return t.slice(0, Math.max(0, n - 1)) + '…';
  };

  util.iniciais = function (nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) { return '?'; }
    if (partes.length === 1) { return partes[0].slice(0, 2).toUpperCase(); }
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  util.pluralizar = function (n, singular, plural) {
    return n === 1 ? singular : plural;
  };

  util.slug = function (s) {
    return util.normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  };

  /** Nome de arquivo seguro para o servidor (ver IdSeguro em serve.ps1). */
  util.nomeArquivoSeguro = function (s) {
    const base = String(s || 'arquivo').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.\-]+/, '');
    return (base || 'arquivo').slice(0, 120);
  };

  /* ------------------------------------------------------------------ CSV */

  util.csvEscape = function (v, delim) {
    const d = delim || ';';
    if (v === null || v === undefined) { return ''; }
    const s = String(v);
    if (s.indexOf(d) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  /** Detecta o delimitador mais provavel na primeira linha nao vazia. */
  util.detectarDelim = function (texto) {
    const linha = String(texto || '').split(/\r?\n/).find(function (l) { return l.trim().length; }) || '';
    const cand = [';', ',', '\t', '|'];
    let melhor = ';', melhorN = -1;
    cand.forEach(function (d) {
      // conta fora de aspas
      let n = 0, dentro = false;
      for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') { dentro = !dentro; }
        else if (c === d && !dentro) { n += 1; }
      }
      if (n > melhorN) { melhorN = n; melhor = d; }
    });
    return melhorN > 0 ? melhor : ';';
  };

  /** Parser CSV com aspas, escape "" e CRLF. Retorna array de arrays. */
  util.csvParse = function (texto, delim) {
    let t = String(texto || '');
    if (t.charCodeAt(0) === 0xFEFF) { t = t.slice(1); }   // BOM
    const d = delim || util.detectarDelim(t);
    const linhas = [];
    let campo = '';
    let linha = [];
    let dentro = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (dentro) {
        if (c === '"') {
          if (t[i + 1] === '"') { campo += '"'; i += 1; }
          else { dentro = false; }
        } else { campo += c; }
        continue;
      }
      if (c === '"') { dentro = true; continue; }
      if (c === d) { linha.push(campo); campo = ''; continue; }
      if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
      if (c === '\r') { continue; }
      campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    // descarta linhas totalmente vazias
    return linhas.filter(function (l) {
      return l.some(function (x) { return String(x).trim() !== ''; });
    });
  };

  /** CSV -> array de objetos usando a 1a linha como cabecalho. */
  util.csvObjetos = function (texto, delim) {
    const linhas = util.csvParse(texto, delim);
    if (linhas.length < 2) { return { cabecalho: linhas[0] || [], itens: [] }; }
    const cab = linhas[0].map(function (h) { return String(h).trim(); });
    const itens = linhas.slice(1).map(function (l) {
      const o = {};
      cab.forEach(function (h, i) { o[h] = l[i] === undefined ? '' : String(l[i]).trim(); });
      return o;
    });
    return { cabecalho: cab, itens: itens };
  };

  /** Gera CSV pt-BR (delim ';', BOM) a partir de colunas + linhas. */
  util.paraCsv = function (colunas, linhas, delim) {
    const d = delim || ';';
    const out = [colunas.map(function (c) { return util.csvEscape(c, d); }).join(d)];
    (linhas || []).forEach(function (l) {
      out.push(l.map(function (c) { return util.csvEscape(c, d); }).join(d));
    });
    return '\uFEFF' + out.join('\r\n') + '\r\n';
  };

  /* ------------------------------------------------------------------ XML */

  util.parseXml = function (texto) {
    try {
      let t = String(texto || '');
      if (t.charCodeAt(0) === 0xFEFF) { t = t.slice(1); }
      const doc = new DOMParser().parseFromString(t, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) { return { doc: null, erro: err.textContent || 'XML invalido' }; }
      if (!doc.documentElement) { return { doc: null, erro: 'XML sem elemento raiz' }; }
      return { doc: doc, erro: null };
    } catch (e) {
      return { doc: null, erro: String(e && e.message ? e.message : e) };
    }
  };

  /** Primeiro filho direto ou descendente com esse nome local (ignora namespace). */
  util.xmlTexto = function (no, nome) {
    if (!no) { return ''; }
    const filhos = no.children || [];
    for (let i = 0; i < filhos.length; i++) {
      if (filhos[i].localName === nome) { return (filhos[i].textContent || '').trim(); }
    }
    return '';
  };

  util.xmlFilhos = function (no, nome) {
    const out = [];
    if (!no) { return out; }
    const filhos = no.children || [];
    for (let i = 0; i < filhos.length; i++) {
      if (filhos[i].localName === nome) { out.push(filhos[i]); }
    }
    return out;
  };

  util.xmlTodos = function (raiz, nome) {
    const out = [];
    if (!raiz) { return out; }
    const todos = raiz.getElementsByTagName('*');
    for (let i = 0; i < todos.length; i++) {
      if (todos[i].localName === nome) { out.push(todos[i]); }
    }
    return out;
  };

  util.xmlEscape = function (s) {
    if (s === null || s === undefined) { return ''; }
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      // remove caracteres de controle invalidos em XML 1.0
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  };

  /** Duracao ISO-8601 do MSPDI ('PT40H0M0S') -> horas. */
  util.duracaoIsoParaHoras = function (s) {
    if (!s) { return 0; }
    const m = /^P(?:(\d+)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(s).trim());
    if (!m) { return 0; }
    return (+(m[1] || 0)) * 24 + (+(m[2] || 0)) + (+(m[3] || 0)) / 60 + (+(m[4] || 0)) / 3600;
  };

  util.horasParaDuracaoIso = function (h) {
    const total = Math.max(0, util.ehNum(h) ? h : 0);
    const horas = Math.floor(total);
    const mins = Math.round((total - horas) * 60);
    return 'PT' + horas + 'H' + mins + 'M0S';
  };

  /* ------------------------------------------------------------------ DOM */

  /**
   * el('div', {class:'x', text:'oi', on:{click:fn}, data:{id:1}, attrs:{...}}, [filhos])
   * Nunca injeta HTML a partir de dado do usuario: use `text`. `html` existe
   * apenas para SVG estatico definido no proprio codigo.
   */
  util.el = function (tag, attrs, filhos) {
    const n = document.createElement(tag);
    const a = attrs || {};
    Object.keys(a).forEach(function (k) {
      const v = a[k];
      if (v === null || v === undefined || v === false) { return; }
      if (k === 'class' || k === 'className') { n.className = v; }
      else if (k === 'text') { n.textContent = String(v); }
      else if (k === 'html') { n.innerHTML = v; }
      else if (k === 'style' && typeof v === 'object') { Object.assign(n.style, v); }
      else if (k === 'on') {
        Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); });
      } else if (k === 'data') {
        Object.keys(v).forEach(function (d) {
          if (v[d] !== null && v[d] !== undefined) { n.dataset[d] = String(v[d]); }
        });
      } else if (k === 'attrs') {
        Object.keys(v).forEach(function (at) {
          if (v[at] !== null && v[at] !== undefined && v[at] !== false) {
            n.setAttribute(at, String(v[at]));
          }
        });
      } else if (k === 'value') { n.value = v; }
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly') { n[k] = !!v; }
      else if (v === true) { n.setAttribute(k, ''); }
      else { n.setAttribute(k, String(v)); }
    });
    util.anexar(n, filhos);
    return n;
  };

  util.svgEl = function (tag, attrs, filhos) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    const a = attrs || {};
    Object.keys(a).forEach(function (k) {
      const v = a[k];
      if (v === null || v === undefined || v === false) { return; }
      if (k === 'text') { n.textContent = String(v); }
      else if (k === 'on') { Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); }); }
      else if (k === 'data') {
        Object.keys(v).forEach(function (d) {
          if (v[d] !== null && v[d] !== undefined) { n.dataset[d] = String(v[d]); }
        });
      } else { n.setAttribute(k, String(v)); }
    });
    util.anexar(n, filhos);
    return n;
  };

  util.anexar = function (pai, filhos) {
    if (filhos === null || filhos === undefined || filhos === false) { return pai; }
    if (Array.isArray(filhos)) {
      filhos.forEach(function (f) { util.anexar(pai, f); });
      return pai;
    }
    if (filhos instanceof Node) { pai.appendChild(filhos); return pai; }
    pai.appendChild(document.createTextNode(String(filhos)));
    return pai;
  };

  util.limpar = function (n) {
    if (!n) { return n; }
    while (n.firstChild) { n.removeChild(n.firstChild); }
    return n;
  };

  util.qs = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  util.qsa = function (sel, raiz) {
    return Array.prototype.slice.call((raiz || document).querySelectorAll(sel));
  };

  /** SVG estatico definido no codigo (nunca dado de usuario). */
  util.icone = function (path, opts) {
    const o = opts || {};
    const svg = util.svgEl('svg', {
      viewBox: o.viewBox || '0 0 24 24', width: o.tam || 16, height: o.tam || 16,
      fill: 'none', stroke: 'currentColor', 'stroke-width': o.peso || 1.8,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', focusable: 'false', class: o.class || 'ic'
    });
    String(path).split('|').forEach(function (d) {
      if (d.indexOf('circle:') === 0) {
        const p = d.slice(7).split(',');
        svg.appendChild(util.svgEl('circle', { cx: p[0], cy: p[1], r: p[2] }));
      } else {
        svg.appendChild(util.svgEl('path', { d: d }));
      }
    });
    return svg;
  };

  util.debounce = function (fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      if (t) { clearTimeout(t); }
      t = setTimeout(function () { t = null; fn.apply(ctx, args); }, ms || 150);
    };
  };

  util.throttle = function (fn, ms) {
    let ultimo = 0, agendado = null;
    return function () {
      const args = arguments, ctx = this, agora = Date.now();
      const espera = (ms || 100) - (agora - ultimo);
      if (espera <= 0) {
        ultimo = agora;
        fn.apply(ctx, args);
      } else if (!agendado) {
        agendado = setTimeout(function () {
          agendado = null; ultimo = Date.now(); fn.apply(ctx, args);
        }, espera);
      }
    };
  };

  util.clonar = function (o) {
    if (o === null || o === undefined) { return o; }
    if (typeof structuredClone === 'function') {
      try { return structuredClone(o); } catch (e) { /* cai no JSON */ }
    }
    return JSON.parse(JSON.stringify(o));
  };

  /** Mescla profunda; arrays sao substituidos, nao concatenados. */
  util.mesclar = function (destino, origem) {
    if (!origem) { return destino; }
    Object.keys(origem).forEach(function (k) {
      const v = origem[k];
      if (v && typeof v === 'object' && !Array.isArray(v) &&
          destino[k] && typeof destino[k] === 'object' && !Array.isArray(destino[k])) {
        util.mesclar(destino[k], v);
      } else if (v !== undefined) {
        destino[k] = v;
      }
    });
    return destino;
  };

  /** Le caminho aninhado: campo('dates.plannedFinish') */
  util.campo = function (obj, caminho) {
    if (!obj || !caminho) { return undefined; }
    const partes = String(caminho).split('.');
    let cur = obj;
    for (let i = 0; i < partes.length; i++) {
      if (cur === null || cur === undefined) { return undefined; }
      cur = cur[partes[i]];
    }
    return cur;
  };

  util.setCampo = function (obj, caminho, valor) {
    const partes = String(caminho).split('.');
    let cur = obj;
    for (let i = 0; i < partes.length - 1; i++) {
      if (!cur[partes[i]] || typeof cur[partes[i]] !== 'object') { cur[partes[i]] = {}; }
      cur = cur[partes[i]];
    }
    cur[partes[partes.length - 1]] = valor;
    return obj;
  };

  /* --------------------------------------------------------------- arquivo */

  util.download = function (nome, conteudo, mime) {
    try {
      const blob = conteudo instanceof Blob
        ? conteudo
        : new Blob([conteudo], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = util.el('a', { href: url, download: nome, style: { display: 'none' } });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        if (a.parentNode) { a.parentNode.removeChild(a); }
      }, 4000);
      return true;
    } catch (e) {
      util.toast('Não foi possível baixar o arquivo: ' + (e.message || e), 'erro');
      return false;
    }
  };

  util.tamanhoHumano = function (bytes) {
    if (!util.ehNum(bytes) || bytes < 0) { return '—'; }
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1024 * 1024) { return nf(1).format(bytes / 1024) + ' KB'; }
    if (bytes < 1024 * 1024 * 1024) { return nf(1).format(bytes / 1048576) + ' MB'; }
    return nf(2).format(bytes / 1073741824) + ' GB';
  };

  util.extensao = function (nome) {
    const m = /\.([A-Za-z0-9]+)$/.exec(String(nome || ''));
    return m ? m[1].toLowerCase() : '';
  };

  util.lerTexto = function (file) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(String(r.result || '')); };
      r.onerror = function () { rej(r.error || new Error('falha ao ler arquivo')); };
      r.readAsText(file, 'UTF-8');
    });
  };

  util.lerBytes = function (file) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(new Uint8Array(r.result)); };
      r.onerror = function () { rej(r.error || new Error('falha ao ler arquivo')); };
      r.readAsArrayBuffer(file);
    });
  };

  /** Hash estavel e barato (FNV-1a 32 bits em hex) para deduplicar anexos. */
  util.hashBytes = function (bytes) {
    let h = 0x811c9dc5;
    const n = bytes.length;
    for (let i = 0; i < n; i++) {
      h ^= bytes[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8) + '-' + n.toString(36);
  };

  /* ----------------------------------------------------------------- toast */

  let _toastHost = null;
  function hostToast() {
    if (!_toastHost || !_toastHost.parentNode) {
      _toastHost = util.el('div', { class: 'toast-host', attrs: { role: 'status', 'aria-live': 'polite' } });
      document.body.appendChild(_toastHost);
    }
    return _toastHost;
  }

  const ICONES_TOAST = {
    ok: 'M20 6 9 17l-5-5',
    erro: 'M12 8v5|M12 16.5v.5|circle:12,12,9',
    warn: 'M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z|M12 9v4|M12 17h.01',
    info: 'circle:12,12,9|M12 16v-4|M12 8h.01'
  };

  util.toast = function (msg, kind, opts) {
    const o = opts || {};
    const k = kind || 'info';
    const host = hostToast();
    const t = util.el('div', { class: 'toast toast--' + k, attrs: { role: 'alert' } }, [
      util.icone(ICONES_TOAST[k] || ICONES_TOAST.info, { tam: 16, class: 'toast__ic' }),
      util.el('div', { class: 'toast__txt', text: String(msg) })
    ]);
    if (o.acao && o.onAcao) {
      t.appendChild(util.el('button', {
        class: 'toast__acao', type: 'button', text: o.acao,
        on: { click: function () { o.onAcao(); fechar(); } }
      }));
    }
    const btn = util.el('button', {
      class: 'toast__x', type: 'button', attrs: { 'aria-label': 'Fechar aviso' },
      on: { click: function () { fechar(); } }
    }, [util.icone('M18 6 6 18|M6 6l12 12', { tam: 14 })]);
    t.appendChild(btn);
    host.appendChild(t);

    let fim = null;
    function fechar() {
      if (fim) { return; }
      fim = true;
      t.classList.add('toast--saindo');
      setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 180);
    }
    const dur = o.duracao === undefined ? (k === 'erro' ? 9000 : 4200) : o.duracao;
    if (dur > 0) { setTimeout(fechar, dur); }
    return { fechar: fechar };
  };

  /* --------------------------------------------------------------- eventos */

  util.emissor = function () {
    const mapa = {};
    return {
      on: function (ev, fn) {
        if (!mapa[ev]) { mapa[ev] = []; }
        mapa[ev].push(fn);
        return function () { util.emissor.off(mapa, ev, fn); };
      },
      off: function (ev, fn) {
        if (!mapa[ev]) { return; }
        mapa[ev] = mapa[ev].filter(function (f) { return f !== fn; });
      },
      emitir: function (ev, dados) {
        (mapa[ev] || []).slice().forEach(function (f) {
          try { f(dados); } catch (e) {
            if (window.console) { console.error('[PMO] listener de "' + ev + '" falhou:', e); }
          }
        });
      }
    };
  };
  util.emissor.off = function (mapa, ev, fn) {
    if (!mapa[ev]) { return; }
    mapa[ev] = mapa[ev].filter(function (f) { return f !== fn; });
  };

  /* ------------------------------------------------------------ acessivel */

  /** Prende o foco dentro de um container (modal/drawer). Retorna soltar(). */
  util.prenderFoco = function (container, aoFechar) {
    const antes = document.activeElement;
    const seletor = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
      'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    function focaveis() {
      return util.qsa(seletor, container).filter(function (n) {
        return n.offsetWidth > 0 || n.offsetHeight > 0 || n === document.activeElement;
      });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); if (aoFechar) { aoFechar(); } return; }
      if (e.key !== 'Tab') { return; }
      const f = focaveis();
      if (!f.length) { return; }
      const primeiro = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
    container.addEventListener('keydown', onKey);
    setTimeout(function () {
      const f = focaveis();
      if (f.length) { f[0].focus(); } else { container.setAttribute('tabindex', '-1'); container.focus(); }
    }, 20);
    return function soltar() {
      container.removeEventListener('keydown', onKey);
      if (antes && antes.focus) { try { antes.focus(); } catch (e) { /* ignora */ } }
    };
  };

  PMO.util = util;
})(window.PMO = window.PMO || {});
